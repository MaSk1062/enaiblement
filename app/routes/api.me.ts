/**
 * GET /api/me - the dashboard's bootstrap call.
 * PATCH /api/me - switch which consultation is the active one.
 *
 * The GET answers two questions in one round trip: has this user onboarded, and do they have a
 * session to resume? Without it the client has no way to reach `activeSessionId`, since the
 * browser never talks to Firestore directly (ARCHITECTURE.md §7.3).
 *
 * The PATCH exists because starting a second consultation would otherwise destroy the first:
 * `activeSessionId` is a single field and nothing lists a user's sessions, so the finished
 * strategy from engagement one would become unreachable the moment engagement two began. This
 * is navigation, not memory - what the agent *remembers* stays invisible by design.
 */

import { z } from "zod";
import { errorResponse, handle, json, requireUser } from "../middleware/requireUser.ts";
import { getSession, getUser, setActiveSession } from "../services/firestore.ts";

export async function loader({ request }: { request: Request }) {
  return handle(async () => {
    const token = await requireUser(request);
    const { profile, activeSessionId, memory } = await getUser(token.uid);

    // Titles and ids only. The prompts get the full memory; the browser gets a menu.
    const consultations = (memory?.consultations ?? []).map((c) => ({
      sessionId: c.sessionId,
      completedAt: c.completedAt,
      bottleneck: c.bottleneck,
    }));

    return json({ uid: token.uid, profile, activeSessionId, consultations });
  });
}

const Body = z.object({ activeSessionId: z.string().min(1) });

export async function action({ request }: { request: Request }) {
  return handle(async () => {
    if (request.method !== "PATCH") return errorResponse(405, "Method not allowed");

    const token = await requireUser(request);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(400, "Expected { activeSessionId }");

    // Ownership is checked against the session itself, not against the memory list - the list
    // is a convenience and this is the authorisation.
    const session = await getSession(parsed.data.activeSessionId);
    if (!session || session.userId !== token.uid) return errorResponse(404, "Session not found");

    await setActiveSession(token.uid, session.sessionId);
    return json({ activeSessionId: session.sessionId });
  });
}
