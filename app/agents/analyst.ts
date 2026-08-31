/**
 * FR-A2 — the Industry Analyst. Owns the `research` stage, writes `useCases[]`.
 * The only agent that retrieves.
 */

import template from "./prompts/research.md?raw";
import { declinedBlock, fillPrompt } from "./prompt.ts";
import { AGENT_NAMES } from "./names.ts";
import { generateStructured } from "../services/gemini.ts";
import { UseCasesOutput } from "../services/schemas.ts";
import { toContextBlock, type RagResult } from "../services/rag.ts";
import type { Declined, Industry, Role, UseCase } from "../types.ts";

export const AGENT_NAME = AGENT_NAMES.analyst;

export interface AnalystInput {
  industry: Industry;
  role: Role;
  bottleneck: string;
  retrieval: RagResult;
  /**
   * What the client already refused. Empty on a first pass and populated on a rerun, which is
   * the case that matters: rebuilding the list after "drop that one" must not put it straight
   * back. `AgentState.declined` survives the rewind that clears `useCases` for exactly this.
   */
  declined?: Declined[];
}

export async function run(input: AnalystInput): Promise<UseCase[]> {
  const payload = `Industry: ${input.industry}
Role: ${input.role}
Identified bottleneck: ${input.bottleneck}

${toContextBlock(input.retrieval)}${declinedBlock(input.declined)}

Generate exactly 3 use cases.`;

  return generateStructured(fillPrompt(template), payload, UseCasesOutput);
}
