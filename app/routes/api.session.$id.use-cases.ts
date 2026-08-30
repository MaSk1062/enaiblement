/**
 * PATCH /api/session/:id/use-cases — the approval gate (ARCHITECTURE.md §6.2).
 *
 * PRD Epic 2 requires it and the reference orchestrator skips it. This is the moment the
 * product stops being a chatbot and starts being a consultation: the Architect only ever
 * sees the use cases the user approved.
 */

import { z } from "zod";
import { errorResponse, handle, json, requireUser } from "../middleware/requireUser.ts";
import { getSession, setUseCaseStatuses } from "../services/firestore.ts";

const Body = z.object({
  decisions: z.record(z.string(), z.enum(["approved", "rejected"])),
});

export async function action({ request, params }: { request: Request; params: { id?: string } }) {
  return handle(async () => {
    if (request.method !== "PATCH") return errorResponse(405, "Method not allowed");

    const token = await requireUser(request);
    const session = params.id ? await getSession(params.id) : null;
    if (!session || session.userId !== token.uid) return errorResponse(404, "Session not found");

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(400, "Expected { decisions: { [useCaseId]: 'approved' | 'rejected' } }");

    const known = new Set(session.state.useCases.map((uc) => uc.id));
    const unknown = Object.keys(parsed.data.decisions).filter((id) => !known.has(id));
    if (unknown.length) return errorResponse(400, `Unknown use case ids: ${unknown.join(", ")}`);

    const updated = await setUseCaseStatuses(session.sessionId, parsed.data.decisions);
    if (!updated) return errorResponse(404, "Session not found");

    return json({ state: updated.state });
  });
}
