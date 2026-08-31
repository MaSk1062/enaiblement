/**
 * POST /api/chat — one turn through the stage machine. The hot path.
 *
 * Three hops: one Firestore read, one or two Gemini calls, one Firestore write. The write
 * carries the user message, the agent reply, and the new state together, so a turn is
 * all-or-nothing and the stage never outruns the payload that justified it (§5.3).
 */

import { z } from "zod";
import { errorResponse, handle, json, rateLimit, requireUser } from "../middleware/requireUser.ts";
import { getSession, message, rememberNotes, saveTurn } from "../services/firestore.ts";
import { agentForStage, runTurn } from "../orchestrator/stageMachine.ts";
import { event, newTurnId, traceFrom, withTurn } from "../services/telemetry.ts";
import type { ChatTurnResponse } from "../types.ts";

const MAX_MESSAGE_CHARS = 4000; // a cap before user text reaches a prompt (§9.2)

const Body = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

export async function action({ request }: { request: Request }) {
  return handle(async () => {
    if (request.method !== "POST") return errorResponse(405, "Method not allowed");

    const token = await requireUser(request);
    rateLimit(token.uid);

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse(400, `Expected sessionId and a message under ${MAX_MESSAGE_CHARS} characters`);
    }

    const session = await getSession(parsed.data.sessionId);
    if (!session || session.userId !== token.uid) return errorResponse(404, "Session not found");

    const stage = session.state.currentStage;
    const ctx = {
      sessionId: session.sessionId,
      uid: token.uid,
      turnId: newTurnId(),
      stage,
      agent: agentForStage(stage),
      trace: traceFrom(request),
      tokens: { total: 0 },
    };

    // One scope per turn. Everything below — agents, the model seam, retrieval — logs with the
    // session, stage and agent already attached, without any of them taking a context argument.
    return withTurn(ctx, async () => {
      const started = Date.now();
      event("turn.start", { stage, textChars: parsed.data.message.length });

      try {
        const userMessage = message({ sender: "user", text: parsed.data.message });
        const { replies, state, remember } = await runTurn(session, parsed.data.message);

        // Still ONE write, however many replies the turn produced.
        await saveTurn(session.sessionId, [...session.messages, userMessage, ...replies], state);

        // Separate, and after. What the Reviser learned about this client belongs to the user,
        // not the session, and it must not be able to take the turn down with it: the reply is
        // already paid for and already persisted by the time this runs.
        if (remember?.length) {
          await rememberNotes(token.uid, remember).catch((err) =>
            event("memory.failed", { severity: "ERROR", error: (err as Error).message }),
          );
        }

        // Derived here rather than at four return sites inside the stage machine — the machine
        // is pure and the before/after comparison is exact.
        if (state.currentStage !== stage) {
          event("stage.advance", { from: stage, to: state.currentStage });

          // The Architect's model menu is a live search — measured at 12-22s on a cold process,
          // and it would land on the user's next message. Warm it now instead, while they are
          // reading the Analyst's reply and approving use cases on the Canvas. Fire and forget:
          // modelMenu() already falls back to a constant, so there is nothing to fail.
          if (state.currentStage === "architecture") {
            void import("../agents/architect.ts").then((m) => m.modelMenu());
          }
        }
        event("turn.end", {
          stage,
          nextStage: state.currentStage,
          durationMs: Date.now() - started,
          totalTokens: ctx.tokens.total,
          ok: true,
        });

        return json({ replies, state } satisfies ChatTurnResponse);
      } catch (err) {
        event("turn.end", {
          severity: "ERROR",
          stage,
          durationMs: Date.now() - started,
          totalTokens: ctx.tokens.total,
          ok: false,
          error: (err as Error).message,
        });
        throw err;
      }
    });
  });
}
