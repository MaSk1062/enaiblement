/** GET /api/session/:id - rehydrate a session. Owner only. */

import { errorResponse, handle, json, requireUser } from "../middleware/requireUser.ts";
import { getArtifacts, getSession } from "../services/firestore.ts";

export async function loader({ request, params }: { request: Request; params: { id?: string } }) {
  return handle(async () => {
    const token = await requireUser(request);
    const session = params.id ? await getSession(params.id) : null;

    // Same response whether it is missing or someone else's - do not leak existence.
    if (!session || session.userId !== token.uid) return errorResponse(404, "Session not found");

    return json({
      sessionId: session.sessionId,
      userProfile: session.userProfile,
      messages: session.messages,
      state: session.state,
      artifacts: await getArtifacts(session.sessionId),
    });
  });
}
