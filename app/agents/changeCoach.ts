/** FR-A5 — the Change Coach. Owns the `training` stage, writes `changeManagementPlan`. */

import template from "./prompts/training.md?raw";
import { fillPrompt } from "./prompt.ts";
import { AGENT_NAMES } from "./names.ts";
import { generateStructured } from "../services/gemini.ts";
import { ChangePlanOutput } from "../services/schemas.ts";
import type { ArchitectureStack, ChangeManagementPlan, UseCase } from "../types.ts";

export const AGENT_NAME = AGENT_NAMES.changeCoach;

export interface ChangeCoachInput {
  approvedUseCases: UseCase[];
  stack: ArchitectureStack;
}

export async function run(input: ChangeCoachInput): Promise<ChangeManagementPlan> {
  const payload = `Approved use cases: ${JSON.stringify(input.approvedUseCases, null, 2)}
Architecture stack: ${JSON.stringify(input.stack, null, 2)}`;

  return generateStructured(fillPrompt(template), payload, ChangePlanOutput);
}
