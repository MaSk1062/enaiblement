/**
 * FR-A3 — the Technical Architect. Owns the `architecture` stage, writes `architectureStack`.
 *
 * Sees only the APPROVED use cases (ARCHITECTURE.md §6.2).
 */

import template from "./prompts/architecture.md?raw";
import { declinedBlock, fillPrompt } from "./prompt.ts";
import { AGENT_NAMES } from "./names.ts";
import { generateStructured, searchGrounded } from "../services/gemini.ts";
import { ArchitectureOutput } from "../services/schemas.ts";
import { REGION_CONTEXT } from "../types.ts";
import type { ArchitectureStack, Declined, Region, Role, UseCase } from "../types.ts";

export const AGENT_NAME = AGENT_NAMES.architect;

/**
 * The fallback menu the Architect may recommend from.
 *
 * docs/AGENT_PROMPTS.md §3 hardcoded "Gemini 1.5 Pro, Llama 3, Claude 3" as examples inside
 * the prompt, which steers the agent to recommend a superseded stack to a CTO on stage.
 * This list is the same trap one level up: it is the one value in the codebase that goes
 * stale by itself, which is exactly why `modelMenu()` below looks it up instead.
 */
export const CURRENT_MODELS =
  [
    // Gemini 3.5 Flash is what this project itself runs on. There is deliberately no "Gemini
    // 3.5 Pro" here — probed 2026-08-31, it 404s, and a menu that offers a model which does not
    // exist is the §3.4 failure one level up: the Architect would recommend it to a CTO on stage.
    "- Google: Gemini 3.5 Flash, Gemini 2.5 Pro (via Vertex AI)",
    "- Anthropic: Claude Sonnet, Claude Opus (via Vertex AI Model Garden or AWS Bedrock)",
    "- OpenAI: GPT-5 class models (via Azure OpenAI)",
    "- Open weight: Llama 4, Mistral Large (self-hosted or via Vertex AI Model Garden)",
  ].join("\n");

export interface ArchitectInput {
  role: Role;
  approvedUseCases: UseCase[];
  region?: Region;
  /** Prose from services/memory.ts — what this client always wants in a recommendation. */
  memory?: string;
  /** What they turned down, and why. A stack must not be designed around a refusal. */
  declined?: Declined[];
}

// ponytail: process-lifetime cache, no TTL. The menu changes on the scale of months and the
// container does not live that long. Add an expiry if this ever runs on a long-lived host.
//
// The PROMISE is cached, not the string: the route warms this in the background the moment a
// session reaches `architecture`, so a caller arriving before that search resolves would
// otherwise start a second one. Observed in the logs as two searches for one turn.
let menu: Promise<string> | undefined;

/**
 * The list of models the Architect is allowed to name, looked up rather than remembered.
 * Falls back to CURRENT_MODELS on any failure — an Architect with no menu recommends nothing.
 */
export async function modelMenu(): Promise<string> {
  // An explicit menu wins over the search. An operator pinning the list — or an eval pinning a
  // deliberately narrow one to test whether the prompt obeys it — must not be overruled by
  // whatever the web says today.
  if (process.env.ARCHITECT_MODEL_MENU) return process.env.ARCHITECT_MODEL_MENU;

  menu ??= searchGrounded(
    "Which foundational large language models are generally available for production use " +
      "today, and on which cloud can an enterprise access each one?",
    "Answer as a bullet list and nothing else, one line per provider, in the form " +
      "'- Provider: Model A, Model B (via access path)'. Only models that are generally " +
      "available right now. No preamble, no commentary.",
  )
    .then(({ text }) => text.trim() || CURRENT_MODELS)
    .catch(() => CURRENT_MODELS);

  return menu;
}

export async function run(input: ArchitectInput): Promise<ArchitectureStack> {
  // An absent region means an older session, not the United States: say "unspecified" and let
  // the prompt ask rather than quietly defaulting to HIPAA.
  const context = input.region ? REGION_CONTEXT[input.region] : undefined;

  const payload = `${input.memory ? `${input.memory}\n\n` : ""}User role: ${input.role}
Region: ${input.region ?? "unspecified"}
Binding data-protection regime: ${context?.regimes ?? "unspecified — say so rather than assuming one"}
Approved use cases: ${JSON.stringify(input.approvedUseCases, null, 2)}${declinedBlock(input.declined)}`;

  return generateStructured(
    fillPrompt(template, { CURRENT_MODELS: await modelMenu() }),
    payload,
    ArchitectureOutput,
  );
}
