/**
 * The browser's only route to the server. Attaches the Firebase ID token to every call and
 * turns an error envelope into a thrown Error the caller can show.
 */

import { idToken } from "./firebase.client.ts";
import type { AgentState, ChatMessage, SessionUserProfile } from "../types.ts";

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
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export interface Me {
  uid: string;
  profile: SessionUserProfile | null;
  activeSessionId: string | null;
}

export const getMe = () => call<Me>("/api/me");

export interface SessionView {
  sessionId: string;
  userProfile: SessionUserProfile;
  messages: ChatMessage[];
  state: AgentState;
}

export const getSession = (id: string) =>
  call<SessionView>(`/api/session/${encodeURIComponent(id)}`);

export const startSession = (profile: SessionUserProfile) =>
  call<{ sessionId: string; message: ChatMessage; state: AgentState }>("/api/session/start", {
    method: "POST",
    body: JSON.stringify(profile),
  });

export const sendMessage = (sessionId: string, message: string) =>
  call<{ reply: ChatMessage; state: AgentState }>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId, message }),
  });

export const decideUseCases = (
  sessionId: string,
  decisions: Record<string, "approved" | "rejected">,
) =>
  call<{ state: AgentState }>(`/api/session/${encodeURIComponent(sessionId)}/use-cases`, {
    method: "PATCH",
    body: JSON.stringify({ decisions }),
  });
