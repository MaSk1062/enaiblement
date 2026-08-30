/**
 * POST /api/chat — one turn through the stage machine. The hot path.
 *
 * Three hops: one Firestore read, one or two Gemini calls, one Firestore write. The write
 * carries the user message, the agent reply, and the new state together, so a turn is
 * all-or-nothing and the stage never outruns the payload that justified it (§5.3).
 */

import { z } from "zod";
import { errorResponse, handle, json, rateLimit, requireUser } from "../middleware/requireUser.ts";
import { getSession, message, saveTurn } from "../services/firestore.ts";
import { runTurn } from "../orchestrator/stageMachine.ts";
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

    const userMessage = message({ sender: "user", text: parsed.data.message });
    const { reply, state } = await runTurn(session, parsed.data.message);

    await saveTurn(session.sessionId, [...session.messages, userMessage, reply], state);

    return json({ reply, state } satisfies ChatTurnResponse);
  });
}
