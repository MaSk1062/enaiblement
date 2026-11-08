/** FR-A4 - the Project Manager. Owns the `roadmap` stage, writes `roadmapPhases[]`. */

import template from "./prompts/roadmap.md?raw";
import { fillPrompt } from "./prompt.ts";
import { AGENT_NAMES } from "./names.ts";
import { generateStructured } from "../services/gemini.ts";
import { RoadmapOutput } from "../services/schemas.ts";
import type { ArchitectureStack, RoadmapPhase, UseCase } from "../types.ts";

export const AGENT_NAME = AGENT_NAMES.projectManager;

export interface ProjectManagerInput {
  approvedUseCases: UseCase[];
  stack: ArchitectureStack;
  /**
   * Prose from services/memory.ts, prepended verbatim.
   *
   * The prompt is not touched: the block carries its own instruction ("honour these without
   * being asked again"), so a preference reaches every specialist that could contradict one
   * without the guidance being restated in six places to drift out of step.
   */
  memory?: string;
}

export async function run(input: ProjectManagerInput): Promise<RoadmapPhase[]> {
  const payload = `${input.memory ? `${input.memory}\n\n` : ""}Approved use cases: ${JSON.stringify(input.approvedUseCases, null, 2)}
Architecture stack: ${JSON.stringify(input.stack, null, 2)}`;

  return generateStructured(fillPrompt(template), payload, RoadmapOutput);
}
