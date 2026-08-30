/**
 * Every Firestore read and write. No product rules live here (ARCHITECTURE.md §5.1).
 *
 * Credentials are ADC — the runtime service account on Cloud Run, `gcloud auth
 * application-default login` locally. There is no service-account JSON to mount.
 */

import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { AgentState, ChatMessage, SessionDocument, SessionUserProfile } from "../types.ts";

const projectId = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;

// A project can hold several Firestore databases and the Admin SDK talks to "(default)"
// unless told otherwise. Pointing at a database that does not exist fails as `5 NOT_FOUND`,
// which reads like a permissions problem and is not one.
const databaseId = process.env.FIRESTORE_DATABASE_ID ?? "(default)";

// Auth can live in a different project from Firestore, and here it does: tokens are minted by
// the Firebase project, Firestore and Vertex run in the GCP project. verifyIdToken rejects any
// token whose `aud` is not the app's own projectId, so verifying with GCP_PROJECT_ID fails every
// real token and reports it as "Invalid or expired token". Defaults to the same project when
// there is only one.
const authProjectId = process.env.FIREBASE_AUTH_PROJECT_ID ?? projectId;

// Look apps up by name, not getApps()[0] — whichever is initialised first would otherwise be
// handed to both.
function app() {
  return getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp({ projectId });
}

function authApp() {
  return getApps().find((a) => a.name === "auth") ?? initializeApp({ projectId: authProjectId }, "auth");
}

export const db = () => getFirestore(app(), databaseId);
// No extra IAM: verifyIdToken checks aud/iss against Google's public certs and needs the project
// id, not credentials for that project.
export const auth = () => getAuth(authApp());

const sessions = () => db().collection("sessions");
const users = () => db().collection("users");

export const GREETING_AGENT = "Discovery Consultant" as const;

export function newSessionId() {
  return `session_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export function message(
  partial: Omit<ChatMessage, "id" | "timestamp"> & Partial<Pick<ChatMessage, "id" | "timestamp">>,
): ChatMessage {
  return {
    id: partial.id ?? crypto.randomUUID(),
    timestamp: partial.timestamp ?? new Date().toISOString(),
    sender: partial.sender,
    // Firestore rejects an undefined value outright, and a user message has no agent. Omitting
    // the key is the difference between a stored turn and a 503 after the model has been paid for.
    ...(partial.agentName ? { agentName: partial.agentName } : {}),
    text: partial.text,
  };
}

export async function createSession(
  userId: string,
  profile: SessionUserProfile,
): Promise<SessionDocument> {
  const sessionId = newSessionId();
  const greeting = message({
    sender: "agent",
    agentName: GREETING_AGENT,
    text:
      `Welcome, ${profile.name}. I'm your Discovery Consultant. As a ${profile.role} in ` +
      `${profile.industry}, what's the business bottleneck you're most hoping AI can solve?`,
  });

  const now = Timestamp.now();
  const doc: SessionDocument = {
    sessionId,
    userId,
    userProfile: profile,
    createdAt: now,
    updatedAt: now,
    messages: [greeting],
    state: { currentStage: "discovery", needsAssessment: {}, useCases: [] },
  };

  await sessions().doc(sessionId).set(doc);
  // So /dashboard/* can rehydrate, and a returning user skips onboarding.
  await users().doc(userId).set(
    { uid: userId, ...profile, activeSessionId: sessionId, lastLoginAt: now },
    { merge: true },
  );
  return doc;
}

/** What the dashboard needs on load: is there a profile, and is there a session to resume? */
export async function getUser(
  uid: string,
): Promise<{ profile: SessionUserProfile | null; activeSessionId: string | null }> {
  const snap = await users().doc(uid).get();
  const data = snap.data();
  if (!data?.name) return { profile: null, activeSessionId: null };
  return {
    profile: { name: data.name, role: data.role, industry: data.industry },
    activeSessionId: data.activeSessionId ?? null,
  };
}

export async function getSession(sessionId: string): Promise<SessionDocument | null> {
  const snap = await sessions().doc(sessionId).get();
  return snap.exists ? (snap.data() as SessionDocument) : null;
}

/**
 * Persists a completed turn. Messages and the new state land in ONE write, so a turn is
 * all-or-nothing and the stage never advances ahead of the payload that justified it
 * (ARCHITECTURE.md §5.3).
 */
export async function saveTurn(sessionId: string, messages: ChatMessage[], state: AgentState) {
  await sessions().doc(sessionId).update({
    messages,
    state,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** The approval gate (ARCHITECTURE.md §6.2). Only touches `status`, never regenerates. */
export async function setUseCaseStatuses(
  sessionId: string,
  decisions: Record<string, "approved" | "rejected">,
): Promise<SessionDocument | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const useCases = session.state.useCases.map((uc) =>
    decisions[uc.id] ? { ...uc, status: decisions[uc.id] } : uc,
  );
  const state: AgentState = { ...session.state, useCases };

  await sessions().doc(sessionId).update({ state, updatedAt: FieldValue.serverTimestamp() });
  return { ...session, state };
}
