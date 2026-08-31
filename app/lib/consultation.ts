/**
 * The one AgentState in a React context (ARCHITECTURE.md §8.1).
 *
 * Every API response replaces it wholesale - no partial merge, no second fetch. That is why
 * FRD §2.2's "real-time updates" requirement falls out of the design instead of needing
 * machinery: when a turn lands, the Canvas re-renders in the same pass.
 */

import { createContext, useContext } from "react";
import type { AgentState, Artifact, ChatMessage, SessionUserProfile } from "../types.ts";

export interface Consultation {
  sessionId: string;
  profile: SessionUserProfile;
  messages: ChatMessage[];
  state: AgentState;
  /** Files the specialists have handed over. Replaced wholesale, like the state. */
  artifacts: Artifact[];
  /** True while a turn is in flight - drives the agent badge. */
  sending: boolean;
  /**
   * The specialist currently running. `total` is 1 for a single capability and 6 for a deep
   * dive, so one indicator serves both: "Delivery Lead is costing the build · 3 of 6".
   */
  producing: { id: string; index: number; total: number } | null;
  error: string | null;
  send: (text: string) => Promise<void>;
  decide: (decisions: Record<string, "approved" | "rejected">) => Promise<void>;
  produce: (capability: string) => Promise<void>;
  /** Runs every capability the consultation is ready for, in dependency order. */
  deepDive: () => Promise<void>;
}

export const ConsultationContext = createContext<Consultation | null>(null);

export function useConsultation(): Consultation {
  const value = useContext(ConsultationContext);
  if (!value) throw new Error("useConsultation must be used inside the dashboard layout");
  return value;
}
