/**
 * The browser's only route to the server. Attaches the Firebase ID token to every call and
 * turns an error envelope into a thrown Error the caller can show.
 */

import { idToken, signOutUser } from "./firebase.client.ts";
import type { AgentState, Artifact, ChatMessage, SessionUserProfile } from "../types.ts";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await idToken()}`,
      ...init.headers,
    },
  });

  const body = await res.json().catch(() => null);

  // A 401 means the token is gone, invalid, or minted for another project - nothing the caller
  // can retry. Drop the local session and send them to sign in, so a failed bootstrap cannot
  // strand the user on an error screen that renders no navigation.
  if (res.status === 401) {
    await signOutUser().catch(() => {});
    window.location.assign("/login");
    throw new Error("Your session expired. Please sign in again.");
  }

  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export interface Me {
  uid: string;
  profile: SessionUserProfile | null;
  activeSessionId: string | null;
  /** Earlier consultations, newest first, so one can be reopened. */
  consultations: { sessionId: string; completedAt: string; bottleneck: string }[];
}

export const getMe = () => call<Me>("/api/me");

/** Reopen an earlier consultation. Starting a new one would otherwise bury it. */
export const setActiveSession = (activeSessionId: string) =>
  call<{ activeSessionId: string }>("/api/me", {
    method: "PATCH",
    body: JSON.stringify({ activeSessionId }),
  });

export interface SessionView {
  sessionId: string;
  userProfile: SessionUserProfile;
  messages: ChatMessage[];
  state: AgentState;
  artifacts: Artifact[];
}

export const getSession = (id: string) =>
  call<SessionView>(`/api/session/${encodeURIComponent(id)}`);

export const startSession = (profile: SessionUserProfile) =>
  call<{ sessionId: string; message: ChatMessage; state: AgentState }>("/api/session/start", {
    method: "POST",
    body: JSON.stringify(profile),
  });

export const sendMessage = (sessionId: string, message: string) =>
  call<{ replies: ChatMessage[]; state: AgentState }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId, message }),
  });

/** Runs one deep-bench specialist. Does not advance the consultation. */
export const produce = (sessionId: string, capability: string, request?: string) =>
  call<{ replies: ChatMessage[]; state: AgentState; artifacts: Artifact[] }>(
    `/api/session/${encodeURIComponent(sessionId)}/produce`,
    { method: "POST", body: JSON.stringify({ capability, request }) },
  );

export interface Decision {
  status: "approved" | "rejected";
  /** Why, when the user said. It is what stops a rebuild re-proposing the same thing. */
  reason?: string;
}

export const decideUseCases = (sessionId: string, decisions: Record<string, Decision>) =>
  // Returns replies as well as state: approving releases the rest of the pipeline, so the
  // Architect, Project Manager and Change Coach all answer this one call.
  call<{ replies: ChatMessage[]; state: AgentState }>(
    `/api/session/${encodeURIComponent(sessionId)}/use-cases`,
    { method: "PATCH", body: JSON.stringify({ decisions }) },
  );
