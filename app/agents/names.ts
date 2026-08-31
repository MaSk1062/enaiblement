/**
 * Agent display names, separate from the agent modules themselves.
 *
 * The orchestrator needs these to label every reply, but must not pull in the agent modules
 * to get them - those import `?raw` prompt files, which only Vite can resolve. Keeping the
 * names here is what lets stageMachine.ts be imported (and tested) without the build.
 */

import type { AgentName } from "../types.ts";

export const AGENT_NAMES = {
  discovery: "Discovery Consultant",
  analyst: "Industry Analyst",
  architect: "Technical Architect",
  projectManager: "Project Manager",
  changeCoach: "Change Coach",
  sourcing: "Sourcing Lead",
} as const satisfies Record<string, AgentName>;
