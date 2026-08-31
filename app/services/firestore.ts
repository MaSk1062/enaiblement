/**
 * Every Firestore read and write. No product rules live here (ARCHITECTURE.md §5.1).
 *
 * Credentials are ADC - the runtime service account on Cloud Run, `gcloud auth
 * application-default login` locally. There is no service-account JSON to mount.
 */

import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type {
  AgentState,
  Artifact,
  ChatMessage,
  SessionDocument,
  SessionUserProfile,
} from "../types.ts";

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

// Look apps up by name, not getApps()[0] - whichever is initialised first would otherwise be
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
export async function saveTurn(
  sessionId: string,
  messages: ChatMessage[],
  state: AgentState,
  artifacts: Artifact[] = [],
) {
  const doc = sessions().doc(sessionId);

  // Artifacts live in a subcollection because generated code and manifests would eventually
  // breach Firestore's 1 MiB document ceiling, and the failure mode is the whole turn failing
  // to persist. A batch keeps the guarantee that matters: artifacts and the state they belong
  // to land together, or neither does.
  const batch = db().batch();
  for (const artifact of artifacts) {
    batch.set(doc.collection(ARTIFACTS).doc(artifact.id), artifact);
  }
  batch.update(doc, { messages, state, updatedAt: FieldValue.serverTimestamp() });

  await batch.commit();
}

const ARTIFACTS = "artifacts";

/** Per-artifact and per-session ceilings, so a runaway generation cannot wedge a consultation. */
export const MAX_ARTIFACT_BYTES = 24_000;
export const MAX_ARTIFACTS = 12;

export async function getArtifacts(sessionId: string): Promise<Artifact[]> {
  const snap = await sessions().doc(sessionId).collection(ARTIFACTS).get();
  return snap.docs.map((d) => d.data() as Artifact);
}

export interface ArtifactMerge {
  /** Everything the session should hold after the merge, existing files included. */
  artifacts: Artifact[];
  /** Only what changed, so the caller writes the minimum. */
  written: Artifact[];
  /** Paths dropped, with why - surfaced to the user rather than silently truncated. */
  rejected: { path: string; reason: string }[];
}

/**
 * Merges freshly generated files into what a session already holds.
 *
 * Keyed by `path`: regenerating infra/main.tf replaces it instead of leaving three versions
 * behind. Over-cap content is REJECTED rather than truncated - half a Terraform file that looks
 * complete is worse than an honest refusal.
 */
export function applyArtifacts(existing: Artifact[], incoming: Artifact[]): ArtifactMerge {
  const byPath = new Map(existing.map((a) => [a.path, a]));
  const written: Artifact[] = [];
  const rejected: { path: string; reason: string }[] = [];

  for (const candidate of incoming) {
    const bytes = Buffer.byteLength(candidate.content, "utf8");
    if (bytes > MAX_ARTIFACT_BYTES) {
      rejected.push({ path: candidate.path, reason: `${bytes} bytes exceeds the ${MAX_ARTIFACT_BYTES} limit` });
      continue;
    }
    if (!byPath.has(candidate.path) && byPath.size >= MAX_ARTIFACTS) {
      rejected.push({ path: candidate.path, reason: `session already holds ${MAX_ARTIFACTS} files` });
      continue;
    }

    // Reuse the id of the file being replaced so the subcollection does not grow either.
    const artifact = { ...candidate, id: byPath.get(candidate.path)?.id ?? candidate.id };
    byPath.set(artifact.path, artifact);
    written.push(artifact);
  }

  return { artifacts: [...byPath.values()], written, rejected };
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
