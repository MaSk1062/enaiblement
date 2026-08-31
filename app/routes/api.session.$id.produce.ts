/**
 * POST /api/session/:id/produce — run one deep-bench capability.
 *
 * Deliberately separate from /api/chat. A turn advances a consultation; this does not. It runs
 * one named specialist, writes what they produced, and leaves `currentStage` exactly where it
 * was — so depth can be asked for at any point without the pipeline having to know about it.
 *
 * Same write guarantee as a turn: the artifacts and the state land in one batch, or neither
 * does (`saveTurn` in app/services/firestore.ts).
 */

import { z } from "zod";
import { capability } from "../capabilities.ts";
import { errorResponse, handle, json, rateLimit, requireUser } from "../middleware/requireUser.ts";
import { applyArtifacts, getArtifacts, getSession, saveTurn } from "../services/firestore.ts";
import { event, newTurnId, traceFrom, withTurn } from "../services/telemetry.ts";
import type { AgentState, Artifact, ChatMessage } from "../types.ts";

const Body = z.object({
  capability: z.string().min(1),
  /** Present when the request came from prose rather than a button. */
  request: z.string().max(4000).optional(),
});

export async function action({ request, params }: { request: Request; params: { id?: string } }) {
  return handle(async () => {
    if (request.method !== "POST") return errorResponse(405, "Method not allowed");

    const token = await requireUser(request);
    rateLimit(token.uid);

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(400, "Expected { capability }");

    const spec = capability(parsed.data.capability);
    if (!spec) return errorResponse(400, `Unknown capability: ${parsed.data.capability}`);

    const session = params.id ? await getSession(params.id) : null;
    if (!session || session.userId !== token.uid) return errorResponse(404, "Session not found");

    // The same predicate the button is disabled by, enforced here too: the client is not the
    // authority on whether the consultation has produced what this specialist needs.
    const blocked = spec.requires(session.state);
    if (blocked) return errorResponse(409, `Not ready — ${blocked}`);

    const ctx = {
      sessionId: session.sessionId,
      uid: token.uid,
      turnId: newTurnId(),
      stage: session.state.currentStage,
      agent: spec.specialist,
      trace: traceFrom(request),
      tokens: { total: 0 },
    };

    return withTurn(ctx, async () => {
      const started = Date.now();
      event("produce.start", { reason: spec.id, stage: ctx.stage });

      try {
        const deep = await import("../agents/deep.ts");
        const input = {
          profile: session.userProfile,
          state: session.state,
          messages: session.messages,
          request: parsed.data.request,
        };

        let state: AgentState = session.state;
        let files: Omit<Artifact, "id" | "producedBy">[] = [];
        let reply: string;

        switch (spec.id) {
          case "deep-needs": {
            const out = await deep.deepNeeds(input);
            reply = out.reply;
            state = { ...state, needsAssessment: { ...state.needsAssessment, ...out.needs } };
            break;
          }
          case "estimate": {
            const out = await deep.estimate(input);
            reply = out.reply;
            state = { ...state, estimate: out.estimate };
            break;
          }
          case "sre": {
            const out = await deep.sre(input);
            reply = out.reply;
            state = { ...state, reliability: out.reliability };
            files = out.files;
            break;
          }
          default: {
            const run = { diagram: deep.diagram, platform: deep.platform, implementation: deep.implementation }[spec.id];
            const out = await run(input);
            reply = out.reply;
            files = out.files;
          }
        }

        const merge = applyArtifacts(
          await getArtifacts(session.sessionId),
          files.map((f) => ({ ...f, id: crypto.randomUUID(), producedBy: spec.specialist })),
        );

        // Rejections are reported, not swallowed: a file dropped for being over the cap is
        // something the user needs to know about, not a silent gap in the handover.
        const note = merge.rejected.length
          ? `\n\nNot included: ${merge.rejected.map((r) => `${r.path} (${r.reason})`).join(", ")}`
          : "";

        const message: ChatMessage = {
          id: crypto.randomUUID(),
          sender: "agent",
          agentName: spec.specialist,
          text: reply + note,
          timestamp: new Date().toISOString(),
        };

        await saveTurn(
          session.sessionId,
          [...session.messages, message],
          state,
          merge.written,
        );

        event("produce.end", {
          reason: spec.id,
          documents: merge.written.length,
          durationMs: Date.now() - started,
          totalTokens: ctx.tokens.total,
          ok: true,
        });

        return json({ replies: [message], state, artifacts: merge.artifacts });
      } catch (err) {
        event("produce.end", {
          severity: "ERROR",
          reason: spec.id,
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
