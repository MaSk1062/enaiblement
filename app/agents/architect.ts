/**
 * FR-A3 — the Technical Architect. Owns the `architecture` stage, writes `architectureStack`.
 *
 * Sees only the APPROVED use cases (ARCHITECTURE.md §6.2).
 */

import template from "./prompts/architecture.md?raw";
import { fillPrompt } from "./prompt.ts";
import { AGENT_NAMES } from "./names.ts";
import { generateStructured } from "../services/gemini.ts";
import { ArchitectureOutput } from "../services/schemas.ts";
import type { ArchitectureStack, Role, UseCase } from "../types.ts";

export const AGENT_NAME = AGENT_NAMES.architect;

/**
 * The menu the Architect may recommend from.
 *
 * docs/AGENT_PROMPTS.md §3 hardcoded "Gemini 1.5 Pro, Llama 3, Claude 3" as examples inside
 * the prompt, which steers the agent to recommend a superseded stack to a CTO on stage.
 * The list lives here instead so it is one edit, not a prompt rewrite.
 *
 * VERIFY THIS AT KICKOFF. It is the one value in the codebase that goes stale by itself.
 */
export const CURRENT_MODELS =
  process.env.ARCHITECT_MODEL_MENU ??
  [
    "- Google: Gemini 2.5 Flash, Gemini 2.5 Pro (via Vertex AI)",
    "- Anthropic: Claude Sonnet, Claude Opus (via Vertex AI Model Garden or AWS Bedrock)",
    "- OpenAI: GPT-5 class models (via Azure OpenAI)",
    "- Open weight: Llama 4, Mistral Large (self-hosted or via Vertex AI Model Garden)",
  ].join("\n");

export interface ArchitectInput {
  role: Role;
  approvedUseCases: UseCase[];
}

export async function run(input: ArchitectInput): Promise<ArchitectureStack> {
  const payload = `User role: ${input.role}
Approved use cases: ${JSON.stringify(input.approvedUseCases, null, 2)}`;

  return generateStructured(
    fillPrompt(template, { CURRENT_MODELS }),
    payload,
    ArchitectureOutput,
  );
}
