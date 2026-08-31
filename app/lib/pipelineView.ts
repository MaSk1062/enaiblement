/**
 * Pure derivations for the live pipeline view (UI-2).
 *
 * The progress rail and the chat's turn-in-flight line both need to say what a finished stage
 * produced and how long the current one has been running. Neither is markup - both read from
 * here so the header and the chat never say something different about the same turn.
 */

import type { AgentState, Stage } from "../types.ts";

/** One line describing what a stage produced, once it has. Null while there's nothing to say. */
export function stageSummary(stage: Stage, state: AgentState): string | null {
  switch (stage) {
    case "discovery":
      return state.needsAssessment.identifiedBottleneck ? "Bottleneck identified" : null;
    case "research": {
      const n = state.useCases.length;
      return n > 0 ? `${n} use case${n === 1 ? "" : "s"}` : null;
    }
    case "architecture":
      return state.architectureStack ? "Stack designed" : null;
    case "roadmap": {
      const n = state.roadmapPhases?.length ?? 0;
      return n > 0 ? `${n}-phase roadmap` : null;
    }
    case "training":
      return state.changeManagementPlan ? "Plan ready" : null;
    case "sourcing": {
      const n = state.sourcing?.partners.length ?? 0;
      return n > 0 ? `${n} partner${n === 1 ? "" : "s"}` : null;
    }
    case "complete":
      return null;
  }
}

/** "8s" under a minute, "1m 12s" past it - a stage can genuinely run that long. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
