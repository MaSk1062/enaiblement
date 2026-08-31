/**
 * The deep bench, as data.
 *
 * Six capabilities that each need a prompt, a specialist name, a prerequisite, a label for the
 * button and a label for the typing indicator. As six branches in a route handler that is six
 * near-identical blocks; as a registry it is one table and one handler.
 *
 * `requires` is the interesting part. A capability is offered from the first message, but it can
 * only run once the consultation has produced what it needs - so the button is visible from the
 * start and says WHY it is not available yet, rather than appearing out of nowhere later.
 *
 * This module is imported by the browser (for the buttons) and by the server (to run them), so
 * it holds no prompts and no agent imports - `load()` reaches those lazily, server-side only.
 */

import type { AgentName, AgentState } from "./types.ts";

export type CapabilityId =
  | "deep-needs"
  | "diagram"
  | "estimate"
  | "platform"
  | "sre"
  | "implementation";

export interface Capability {
  id: CapabilityId;
  /** On the button. */
  label: string;
  /** One line under the button: what you get. */
  blurb: string;
  /** Shown while it runs: "Platform Engineer is …". */
  working: string;
  specialist: AgentName;
  /** Null when it can run, or the reason it cannot. */
  requires: (state: AgentState) => string | null;
}

const hasApproved = (state: AgentState) =>
  state.useCases.some((uc) => uc.status === "approved")
    ? null
    : "approve a use case on the Canvas first";

const hasStack = (state: AgentState) =>
  state.architectureStack ? null : "the Technical Architect has not recommended a stack yet";

const first = (...checks: ((state: AgentState) => string | null)[]) => (state: AgentState) => {
  for (const check of checks) {
    const reason = check(state);
    if (reason) return reason;
  }
  return null;
};

export const CAPABILITIES: Capability[] = [
  {
    id: "deep-needs",
    label: "Deep-dive the needs",
    blurb: "Data estate, integrations, compliance, team capability, volumes, constraints",
    working: "is digging into the detail",
    specialist: "Discovery Consultant",
    requires: (state) =>
      state.needsAssessment.identifiedBottleneck
        ? null
        : "finish the discovery interview first - there is no bottleneck to dig into yet",
  },
  {
    id: "diagram",
    label: "Architecture diagrams",
    blurb: "Context, request flow and deployment, as diagrams you can put in a deck",
    working: "is drawing the architecture",
    specialist: "Technical Architect",
    requires: hasStack,
  },
  {
    id: "estimate",
    label: "Cost & effort",
    blurb: "Monthly run rate per component and engineering days per phase, with assumptions",
    working: "is costing the build and the run",
    specialist: "Delivery Lead",
    requires: first(hasApproved, hasStack),
  },
  {
    id: "platform",
    label: "Platform & containers",
    blurb: "Serverless or Kubernetes, with the Dockerfile, manifests and Terraform to run it",
    working: "is making it runnable",
    specialist: "Platform Engineer",
    requires: hasStack,
  },
  {
    id: "sre",
    label: "Reliability & SRE",
    blurb: "SLOs, an error budget, alerts and a 3am runbook",
    working: "is deciding what working means",
    specialist: "Reliability Engineer",
    requires: hasStack,
  },
  {
    id: "implementation",
    label: "Implementation code",
    blurb: "A runnable scaffold for the first approved use case, with a test",
    working: "is scaffolding the first use case",
    specialist: "Implementation Engineer",
    requires: first(hasApproved, hasStack),
  },
];

export const capability = (id: string) => CAPABILITIES.find((c) => c.id === id);

/**
 * Dependency order, which is not menu order and not arbitrary.
 *
 * `deep-needs` first: it establishes the volumes the estimate does its arithmetic on.
 * `diagram` second because it is cheap and visual - something appears within twenty seconds
 * rather than three minutes. `estimate` before `platform` because the Platform Engineer is
 * handed the estimate to size against (see brief() in app/agents/deep.ts), so the other way
 * round silently costs it that input. The last two need the stack and nothing else.
 */
export const DEEP_DIVE_ORDER: CapabilityId[] = [
  "deep-needs",
  "diagram",
  "estimate",
  "platform",
  "sre",
  "implementation",
];

export interface DeepDivePlan {
  run: CapabilityId[];
  skipped: { id: CapabilityId; reason: string }[];
}

/**
 * What a deep dive would do from here.
 *
 * The button is never disabled: it runs what the consultation is ready for and reports what it
 * is not, using the same reasons the individual menu items show. Pressed before there is a
 * stack that is one capability and five explanations; pressed on a finished strategy it is all
 * six.
 */
export function planDeepDive(state: AgentState): DeepDivePlan {
  const plan: DeepDivePlan = { run: [], skipped: [] };

  for (const id of DEEP_DIVE_ORDER) {
    const spec = capability(id);
    if (!spec) continue;

    const reason = spec.requires(state);
    if (reason) plan.skipped.push({ id, reason });
    else plan.run.push(id);
  }

  return plan;
}
