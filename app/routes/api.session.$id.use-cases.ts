/**
 * PATCH /api/session/:id/use-cases - the approval gate (ARCHITECTURE.md §6.2).
 *
 * PRD Epic 2 requires it and the reference orchestrator skips it. This is the moment the
 * product stops being a chatbot and starts being a consultation: the Architect only ever sees
 * the use cases the user approved.
 *
 * Approving is itself the instruction, so this route runs the rest of the pipeline rather than
 * returning and waiting to be told "ok, go". The consultation carries on from here to a finished
 * strategy without another message.
 */

import { z } from "zod";
import { errorResponse, handle, json, rateLimit, requireUser } from "../middleware/requireUser.ts";
import { getSession, message, saveTurn, setUseCaseStatuses } from "../services/firestore.ts";
import { agentForStage, runTurn } from "../orchestrator/stageMachine.ts";
import { event, newTurnId, traceFrom, withTurn } from "../services/telemetry.ts";

// A decision may carry the client's reason. That reason is the only feedback signal in the
// product that says anything more than yes or no, and it is what stops a rebuilt list from
// re-proposing what was just refused - see AgentState.declined.
const Body = z.object({
  decisions: z.record(
    z.string(),
    z.object({
      status: z.enum(["approved", "rejected"]),
      reason: z.string().min(1).max(300).optional(),
    }),
  ),
});

export async function action({ request, params }: { request: Request; params: { id?: string } }) {
  return handle(async () => {
    if (request.method !== "PATCH") return errorResponse(405, "Method not allowed");

    const token = await requireUser(request);
    const session = params.id ? await getSession(params.id) : null;
    if (!session || session.userId !== token.uid) return errorResponse(404, "Session not found");

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse(
        400,
        "Expected { decisions: { [useCaseId]: { status: 'approved' | 'rejected', reason?: string } } }",
      );
    }

    const known = new Set(session.state.useCases.map((uc) => uc.id));
    const unknown = Object.keys(parsed.data.decisions).filter((id) => !known.has(id));
    if (unknown.length) return errorResponse(400, `Unknown use case ids: ${unknown.join(", ")}`);

    const updated = await setUseCaseStatuses(session.sessionId, parsed.data.decisions);
    if (!updated) return errorResponse(404, "Session not found");

    // Rejecting everything, or deciding before the gate is what is blocking, changes nothing
    // else. Only an approval releases the pipeline.
    const releases =
      updated.state.currentStage === "architecture" &&
      updated.state.useCases.some((uc) => uc.status === "approved");

    if (!releases) return json({ replies: [], state: updated.state });

    rateLimit(token.uid);

    const ctx = {
      sessionId: updated.sessionId,
      uid: token.uid,
      turnId: newTurnId(),
      stage: updated.state.currentStage,
      agent: agentForStage(updated.state.currentStage),
      trace: traceFrom(request),
      tokens: { total: 0 },
    };

    return withTurn(ctx, async () => {
      const started = Date.now();
      event("turn.start", { stage: ctx.stage, reason: "approval" });

      // The message the user did not have to type. Recorded so the transcript reads as a
      // conversation rather than agent replies appearing out of nowhere.
      const decided = message({
        sender: "user",
        text: `Approved: ${updated.state.useCases
          .filter((uc) => uc.status === "approved")
          .map((uc) => uc.title)
          .join(", ")}.`,
      });

      const { replies, state } = await runTurn(updated, decided.text);

      // One write, exactly as a chat turn does it: the stage never outruns what justified it.
      await saveTurn(updated.sessionId, [...updated.messages, decided, ...replies], state);

      event("turn.end", {
        stage: ctx.stage,
        nextStage: state.currentStage,
        durationMs: Date.now() - started,
        totalTokens: ctx.tokens.total,
        ok: true,
      });

      return json({ replies: [decided, ...replies], state });
    });
  });
}
