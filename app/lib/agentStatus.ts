/**
 * Stage -> the named agent that owns it, and what that agent is doing right now.
 *
 * IMPLEMENTATION_PLAN §7: "The agent badge is the product." A chat window is a chat window;
 * a named specialist handing off to another named specialist is what makes this read as a
 * consulting firm rather than a wrapper around a chat completion. It costs almost nothing.
 */

import { AGENT_NAMES } from "../agents/names.ts";
import {
  ChartIcon,
  ChecklistIcon,
  CompassIcon,
  LayersIcon,
  PeopleIcon,
  type IconComponent,
} from "./icons.tsx";
import type { AgentName, Stage } from "../types.ts";

/**
 * One hue per specialist (UI-10 — ui-identity-tasks.md), reused everywhere that agent's name
 * renders: the progress rail, a chat bubble's agent label, a Canvas section header. `solid` is
 * the active-stage chip background; `light`/`lightText` are the done-stage chip; `text` is for
 * the icon and label wherever it sits on a plain background rather than its own chip.
 */
interface Accent {
  text: string;
  solid: string;
  light: string;
  lightText: string;
}

interface AgentStatus {
  name: AgentName;
  /** Present-tense, shown while a turn is in flight. */
  working: string;
  blurb: string;
  Icon: IconComponent;
  accent: Accent;
}

const STATUS: Record<Stage, AgentStatus> = {
  discovery: {
    name: AGENT_NAMES.discovery,
    working: "is considering your answer",
    blurb: "Uncovering your bottleneck and data readiness",
    Icon: CompassIcon,
    accent: { text: "text-blue-600", solid: "bg-blue-600", light: "bg-blue-50", lightText: "text-blue-700" },
  },
  research: {
    name: AGENT_NAMES.analyst,
    working: "is reviewing industry case studies",
    blurb: "Finding proven use cases for your industry",
    Icon: ChartIcon,
    accent: {
      text: "text-violet-600",
      solid: "bg-violet-600",
      light: "bg-violet-50",
      lightText: "text-violet-700",
    },
  },
  architecture: {
    name: AGENT_NAMES.architect,
    working: "is designing your stack",
    blurb: "Mapping models, infrastructure and compliance",
    Icon: LayersIcon,
    accent: { text: "text-teal-600", solid: "bg-teal-600", light: "bg-teal-50", lightText: "text-teal-700" },
  },
  roadmap: {
    name: AGENT_NAMES.projectManager,
    working: "is phasing the rollout",
    blurb: "Turning the stack into a phased plan",
    Icon: ChecklistIcon,
    accent: {
      text: "text-orange-600",
      solid: "bg-orange-600",
      light: "bg-orange-50",
      lightText: "text-orange-700",
    },
  },
  training: {
    name: AGENT_NAMES.changeCoach,
    working: "is planning the people side",
    blurb: "Upskilling paths and leadership communication",
    Icon: PeopleIcon,
    accent: {
      text: "text-fuchsia-600",
      solid: "bg-fuchsia-600",
      light: "bg-fuchsia-50",
      lightText: "text-fuchsia-700",
    },
  },
  sourcing: {
    name: AGENT_NAMES.sourcing,
    working: "is finding partners who have done this before",
    blurb: "Shortlisting implementation partners and drafting a proposal",
    // ponytail: reuses PeopleIcon — partners are people; own hue is what distinguishes the badge
    Icon: PeopleIcon,
    accent: {
      text: "text-emerald-600",
      solid: "bg-emerald-600",
      light: "bg-emerald-50",
      lightText: "text-emerald-700",
    },
  },
  complete: {
    name: AGENT_NAMES.changeCoach,
    working: "is thinking",
    blurb: "Your strategy is complete",
    Icon: PeopleIcon,
    accent: {
      text: "text-fuchsia-600",
      solid: "bg-fuchsia-600",
      light: "bg-fuchsia-50",
      lightText: "text-fuchsia-700",
    },
  },
};

export const agentStatus = (stage: Stage): AgentStatus => STATUS[stage];

/**
 * Icon + accent by agent name rather than stage — a chat message carries `agentName`, not the
 * stage that produced it, and "Change Coach" alone owns two stages (training and complete).
 */
const PERSONA: Record<AgentName, Pick<AgentStatus, "Icon" | "accent">> = Object.fromEntries(
  Object.values(STATUS).map(({ name, Icon, accent }) => [name, { Icon, accent }]),
) as Record<AgentName, Pick<AgentStatus, "Icon" | "accent">>;

export const agentPersona = (name: AgentName): Pick<AgentStatus, "Icon" | "accent"> => PERSONA[name];

/** Stage order, for the progress rail. */
export const STAGES: Stage[] = [
  "discovery",
  "research",
  "architecture",
  "roadmap",
  "training",
  "sourcing",
  "complete",
];
