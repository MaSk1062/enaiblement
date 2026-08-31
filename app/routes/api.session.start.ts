/**
 * POST /api/session/start — create a consultation and return the Discovery greeting.
 *
 * This route owns HTTP shape only: parsing, status codes, error envelopes (§5.1).
 */

import { z } from "zod";
import { errorResponse, handle, json, requireUser } from "../middleware/requireUser.ts";
import { createSession } from "../services/firestore.ts";
import { REGION_CONTEXT } from "../types.ts";
import type { Region } from "../types.ts";

// Derived, not repeated. A hand-written copy of this list is what silently dropped the region:
// zod strips what it does not declare, so the field the form collected never reached Firestore
// and every prompt downstream said "unspecified".
const REGIONS = Object.keys(REGION_CONTEXT) as [Region, ...Region[]];

const Body = z.object({
  name: z.string().min(1).max(120),
  role: z.enum(["CEO/Founder", "CTO/CIO", "Department Head", "Developer"]),
  industry: z.enum(["Healthcare", "Finance", "Manufacturing", "Retail", "SaaS"]),
  // Optional: sessions created before the field existed must keep working.
  region: z.enum(REGIONS).optional(),
});

export async function action({ request }: { request: Request }) {
  return handle(async () => {
    if (request.method !== "POST") return errorResponse(405, "Method not allowed");

    const token = await requireUser(request);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(400, "Expected name, role, industry and region");

    // The uid comes from the verified token, never from the body.
    const session = await createSession(token.uid, parsed.data);

    return json(
      { sessionId: session.sessionId, message: session.messages[0], state: session.state },
      201,
    );
  });
}
