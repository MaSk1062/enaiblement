/**
 * Auth and rate limiting for every /api/* route (FRD §4, ARCHITECTURE.md §5.1).
 *
 * The Firebase client SDK does the SSO popup and holds the ID token; the browser sends it
 * as `Authorization: Bearer <token>` and this verifies it with the Admin SDK. There is no
 * session cookie scheme — that is an evening of work for no demo value.
 *
 * The uid ALWAYS comes from the verified token. docs/FIRESTORE_SCHEMA.md's reference
 * implementation reads `userId` out of the request body, which lets any caller open a
 * session as any user.
 */

import type { DecodedIdToken } from "firebase-admin/auth";
import { auth } from "../services/firestore.ts";

const MAX_TURNS_PER_MINUTE = Number(process.env.MAX_TURNS_PER_MINUTE ?? 20);
const WINDOW_MS = 60_000;

// ponytail: per-instance counter, not global. Each turn is a paid model call and an
// unthrottled client loop is a billing incident; this stops that. It does NOT stop an
// attacker spreading calls across instances — move to Firestore or Redis if that matters.
const hits = new Map<string, { count: number; resetAt: number }>();

export function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

/** Returns the verified token, or throws a Response the route should return as-is. */
export async function requireUser(request: Request): Promise<DecodedIdToken> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw errorResponse(401, "Missing bearer token");

  try {
    return await auth().verifyIdToken(token);
  } catch {
    throw errorResponse(401, "Invalid or expired token");
  }
}

/** Throws a 429 Response once a user exceeds the per-minute turn budget. */
export function rateLimit(uid: string) {
  const now = Date.now();
  const entry = hits.get(uid);

  if (!entry || now > entry.resetAt) {
    hits.set(uid, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (++entry.count > MAX_TURNS_PER_MINUTE) {
    throw errorResponse(429, "Too many messages — give it a moment.");
  }
}

/**
 * Wraps a route handler so a thrown Response is returned and anything else becomes a 503
 * error envelope rather than a stack trace (ARCHITECTURE.md §5.3).
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[api]", err);
    return errorResponse(503, "Something went wrong. Please try that again.");
  }
}
