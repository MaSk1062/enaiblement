/**
 * GET /api/me — the dashboard's bootstrap call.
 *
 * Answers two questions in one round trip: has this user onboarded, and do they have a
 * session to resume? Without it the client has no way to reach `activeSessionId`, since
 * the browser never talks to Firestore directly (ARCHITECTURE.md §7.3).
 */

import { handle, json, requireUser } from "../middleware/requireUser.ts";
import { getUser } from "../services/firestore.ts";

export async function loader({ request }: { request: Request }) {
  return handle(async () => {
    const token = await requireUser(request);
    const { profile, activeSessionId } = await getUser(token.uid);
    return json({ uid: token.uid, profile, activeSessionId });
  });
}
