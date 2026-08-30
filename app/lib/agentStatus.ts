/**
 * Stage -> the named agent that owns it, and what that agent is doing right now.
 *
 * IMPLEMENTATION_PLAN §7: "The agent badge is the product." A chat window is a chat window;
 * a named specialist handing off to another named specialist is what makes this read as a
 * consulting firm rather than a wrapper around a chat completion. It costs almost nothing.
 */

import { AGENT_NAMES } from "../agents/names.ts";
import type { AgentName, Stage } from "../types.ts";

interface AgentStatus {
  name: AgentName;
  /** Present-tense, shown while a turn is in flight. */
  working: string;
  blurb: string;
}

const STATUS: Record<Stage, AgentStatus> = {
  discovery: {
    name: AGENT_NAMES.discovery,
    working: "is considering your answer",
    blurb: "Uncovering your bottleneck and data readiness",
  },
  research: {
    name: AGENT_NAMES.analyst,
    working: "is reviewing industry case studies",
    blurb: "Finding proven use cases for your industry",
  },
  architecture: {
    name: AGENT_NAMES.architect,
    working: "is designing your stack",
    blurb: "Mapping models, infrastructure and compliance",
  },
  roadmap: {
    name: AGENT_NAMES.projectManager,
    working: "is phasing the rollout",
    blurb: "Turning the stack into a phased plan",
  },
  training: {
    name: AGENT_NAMES.changeCoach,
    working: "is planning the people side",
    blurb: "Upskilling paths and leadership communication",
  },
  complete: {
    name: AGENT_NAMES.changeCoach,
    working: "is thinking",
    blurb: "Your strategy is complete",
  },
};

export const agentStatus = (stage: Stage): AgentStatus => STATUS[stage];

/** Stage order, for the progress rail. */
export const STAGES: Stage[] = [
  "discovery",
  "research",
  "architecture",
  "roadmap",
  "training",
  "complete",
];
