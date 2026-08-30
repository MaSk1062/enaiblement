/**
 * FR-A1 — the Discovery Consultant. Owns the `discovery` stage, writes `needsAssessment`.
 *
 * Completion is a parsed discriminant, never a string match: the model returns either
 * {"status":"asking"} or {"status":"complete", …} (ARCHITECTURE.md §6.3).
 */

import template from "./prompts/discovery.md?raw";
import { fillPrompt } from "./prompt.ts";
import { AGENT_NAMES } from "./names.ts";
import { generateStructured } from "../services/gemini.ts";
import { DiscoveryOutput, type DiscoveryResult } from "../services/schemas.ts";
import type { ChatMessage, SessionUserProfile } from "../types.ts";

export const AGENT_NAME = AGENT_NAMES.discovery;

const HISTORY_TURNS = 6; // the agents only ever see the last six messages

export interface DiscoveryInput {
  profile: SessionUserProfile;
  messages: ChatMessage[];
  latest: string;
}

export async function run(input: DiscoveryInput): Promise<DiscoveryResult> {
  const history = input.messages
    .slice(-HISTORY_TURNS)
    .map((m) => `${m.sender === "user" ? "User" : (m.agentName ?? "Agent")}: ${m.text}`)
    .join("\n");

  const payload = `User profile: ${JSON.stringify(input.profile)}

Conversation so far:
${history}

User's latest message: ${JSON.stringify(input.latest)}`;

  return generateStructured(fillPrompt(template), payload, DiscoveryOutput);
}
