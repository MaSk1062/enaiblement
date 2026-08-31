/**
 * FR-A1 — the Discovery Consultant. Owns the `discovery` stage, writes `needsAssessment`.
 *
 * Completion is a parsed discriminant, never a string match: the model returns either
 * {"status":"asking"} or {"status":"complete", …} (ARCHITECTURE.md §6.3).
 */

import template from "./prompts/discovery.md?raw";
import { fillPrompt, transcript } from "./prompt.ts";
import { AGENT_NAMES } from "./names.ts";
import { generateStructured } from "../services/gemini.ts";
import { DiscoveryOutput, type DiscoveryResult } from "../services/schemas.ts";
import type { ChatMessage, SessionUserProfile } from "../types.ts";

export const AGENT_NAME = AGENT_NAMES.discovery;

export interface DiscoveryInput {
  profile: SessionUserProfile;
  messages: ChatMessage[];
  latest: string;
  /** Prose from services/memory.ts. Absent for a first-time client, and then nothing changes. */
  memory?: string;
}

export async function run(input: DiscoveryInput): Promise<DiscoveryResult> {
  const history = transcript(input.messages);

  // First, so the interview is shaped by what is already known rather than correcting for it
  // after the fact.
  const payload = `${input.memory ? `${input.memory}\n\n` : ""}User profile: ${JSON.stringify(input.profile)}

Conversation so far:
${history}

User's latest message: ${JSON.stringify(input.latest)}`;

  return generateStructured(fillPrompt(template), payload, DiscoveryOutput);
}
