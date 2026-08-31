/**
 * The stage machine's check. No model, no Firestore - which is exactly what ADR-02 bought.
 * Run: node --test app/orchestrator/stageMachine.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { runTurn, type StageDeps } from "./stageMachine.ts";
import type { AgentState, SessionDocument, Stage, UseCase } from "../types.ts";

const notCalled = (name: string) => () => {
  throw new Error(`${name} should not have been called`);
};

function deps(over: Partial<StageDeps> = {}): StageDeps {
  return {
    discovery: notCalled("discovery"),
    analyst: notCalled("analyst"),
    architect: notCalled("architect"),
    projectManager: notCalled("projectManager"),
    changeCoach: notCalled("changeCoach"),
    reviser: notCalled("reviser"),
    sourcing: notCalled("sourcing"),
    retrieve: notCalled("retrieve"),
    ...over,
  } as StageDeps;
}

function session(stage: Stage, state: Partial<AgentState> = {}): SessionDocument {
  return {
    sessionId: "s1",
    userId: "u1",
    userProfile: { name: "Ada", role: "CTO/CIO", industry: "Healthcare" },
    createdAt: null as never,
    updatedAt: null as never,
    messages: [],
    state: { currentStage: stage, needsAssessment: {}, useCases: [], ...state },
  };
}

const useCase = (id: string, status: UseCase["status"]): UseCase => ({
  id,
  title: `Use case ${id}`,
  description: "…",
  impact: "High",
  complexity: "Medium",
  businessValue: "Cuts cycle time by 40%",
  status,
});

const sourcingResult = {
  reply: "Two firms in the region have delivered claims automation. Proposal attached.",
  sourcing: {
    partners: [
      {
        name: "Example Integrators",
        country: "Kenya",
        delivered: "Claims automation for a regional insurer",
        fit: "Same use case, same regulatory environment",
        sourceUrl: "https://example.com/case-study",
      },
    ],
    proposal: {
      scope: "Build and hand over the packet assembly pipeline",
      phases: [{ phaseName: "Pilot", personWeeks: 8, partnerRole: "Lead build" }],
      budgetRange: "KES 6M-9M",
      currency: "KES",
      nextStep: "Send the shortlist a scoped RFP",
    },
    grounded: true,
  },
};

const stack = {
  models: ["Gemini 3.5 Flash"],
  infrastructure: ["Vertex AI"],
  frameworks: [],
  securityConsiderations: "HIPAA",
};

test("discovery: an 'asking' result does not advance the stage", async () => {
  const { replies, state } = await runTurn(
    session("discovery"),
    "we are drowning in paperwork",
    deps({ discovery: async () => ({ status: "asking", question: "Which paperwork exactly?" }) }),
  );

  assert.equal(state.currentStage, "discovery");
  assert.equal(replies[0].text, "Which paperwork exactly?");
  assert.equal(replies[0].agentName, "Discovery Consultant");
});

const needsAssessment = {
  summary: "Manual claims triage throughout.",
  primaryObjective: "Cut claims cycle time",
  dataReadiness: "Medium" as const,
  identifiedBottleneck: "Manual claims triage",
};

test("one message carries the consultation from a finished interview to the gate", async () => {
  // The change that matters: a completed interview no longer waits to be told to continue. It
  // runs research too, and stops where a human is genuinely needed - the approval gate.
  const { replies, state } = await runTurn(
    session("discovery"),
    "mostly claims",
    deps({
      discovery: async () => ({ status: "complete", needsAssessment }),
      retrieve: async () => ({
        documents: [{ id: "kb-1", title: "A case study", content: "…" }],
        sources: [{ title: "example.com", url: "https://example.com" }],
        grounded: true,
        source: "knowledge_base",
      }),
      analyst: async () => [useCase("uc-1", "suggested")],
      architect: notCalled("architect"), // the gate must hold before the Architect is reached
    }),
  );

  assert.equal(state.currentStage, "architecture", "stopped at the gate, not at research");
  assert.deepEqual(state.needsAssessment, needsAssessment);
  assert.deepEqual(state.useCases.map((u) => u.id), ["uc-1"]);

  assert.deepEqual(
    replies.map((r) => r.agentName),
    ["Discovery Consultant", "Industry Analyst", "Technical Architect"],
    "every specialist that ran gets its own message, so the handoffs are still visible",
  );
  assert.match(replies.at(-1)!.text, /approve at least one/i);
});

test("approving carries it the rest of the way, without another message", async () => {
  const { replies, state } = await runTurn(
    session("architecture", { useCases: [useCase("uc-1", "approved")] }),
    "Approved: Use case uc-1.",
    deps({
      architect: async () => stack,
      projectManager: async () => phases,
      changeCoach: async () => changePlan,
      sourcing: async () => sourcingResult,
    }),
  );

  assert.equal(state.currentStage, "complete", "one approval finishes the strategy");
  assert.deepEqual(state.architectureStack, stack);
  assert.deepEqual(state.roadmapPhases, phases);
  assert.deepEqual(state.changeManagementPlan, changePlan);
  assert.deepEqual(
    replies.map((r) => r.agentName),
    ["Technical Architect", "Project Manager", "Change Coach", "Sourcing Lead"],
  );
  assert.equal(state.sourcing?.partners.length, 1);
});

test("research: an ungrounded retrieval is marked and disclosed, never hidden", async () => {
  const { replies, state } = await runTurn(
    session("research", { needsAssessment: { identifiedBottleneck: "Manual claims triage" } }),
    "go on",
    deps({
      retrieve: async () => ({ documents: [], sources: [], grounded: false, source: "none" }),
      analyst: async () => [useCase("uc-1", "suggested")],
    }),
  );

  assert.equal(state.currentStage, "architecture");
  assert.equal(state.ungrounded, true);
  assert.match(replies[0].text, /no matches/i, "the user must be told it ran ungrounded");
});

test("architecture: the approval gate blocks and does not call the Architect", async () => {
  const blocked = await runTurn(
    session("architecture", { useCases: [useCase("uc-1", "suggested")] }),
    "next",
    deps(), // every agent throws if called
  );

  assert.equal(blocked.state.currentStage, "architecture", "must not advance without approvals");
  assert.match(blocked.replies[0].text, /approve at least one/i);
  assert.equal(blocked.state.architectureStack, undefined);
});

test("architecture: once approved, the Architect sees ONLY the approved use cases", async () => {
  let seen: UseCase[] = [];
  const { state } = await runTurn(
    session("architecture", {
      useCases: [
        useCase("uc-1", "approved"),
        useCase("uc-2", "rejected"),
        useCase("uc-3", "suggested"),
      ],
    }),
    "next",
    deps({
      architect: async (input) => {
        seen = input.approvedUseCases;
        return stack;
      },
    }),
  );

  assert.deepEqual(
    seen.map((u) => u.id),
    ["uc-1"],
  );
  assert.equal(state.currentStage, "roadmap");
  assert.deepEqual(state.architectureStack, stack);
});

test("a failing agent leaves the stage exactly where it was", async () => {
  const before = session("roadmap", {
    useCases: [useCase("uc-1", "approved")],
    architectureStack: stack,
  });

  const { replies, state } = await runTurn(
    before,
    "next",
    deps({
      projectManager: async () => {
        throw new Error("schema repair failed");
      },
    }),
  );

  assert.equal(state.currentStage, "roadmap", "a failed turn must be replayable");
  assert.equal(state.roadmapPhases, undefined);
  assert.equal(replies[0].agentName, "Project Manager");
  assert.match(replies[0].text, /did not complete/i);
});

// --- post-completion follow-ups ------------------------------------------------
// The `complete` stage is the only one that can change work already done, so this is where an
// inconsistent strategy would come from. No model in the loop: the Reviser's decision is the
// fixture, and what the machine does with it is the thing under test.

const phases = [
  { phaseName: "Pilot", duration: "Weeks 1-4", keyDeliverables: ["Prototype"], resourcesRequired: [] },
];
const changePlan = {
  upskillingPaths: [
    { role: "Claims adjuster", skillsRequired: ["Prompting"], recommendedTraining: "Workshop", timeCommitment: "4 hours" },
  ],
  communicationStrategy: { leadershipNarrative: "AI handles triage.", mitigatingConcerns: [] },
  adoptionKpis: ["% auto-triaged"],
};

const finished = () =>
  session("complete", {
    useCases: [useCase("uc-1", "approved"), useCase("uc-2", "approved")],
    architectureStack: stack,
    roadmapPhases: phases,
    changeManagementPlan: changePlan,
  });

test("complete: a question answers and changes nothing at all", async () => {
  const before = finished();
  const { replies, state } = await runTurn(
    before,
    "why Firestore over Postgres?",
    deps({
      reviser: async () => ({ action: "answer", reply: "Because the vector index lives there." }),
    }),
  );

  assert.equal(replies.length, 1);
  assert.match(replies[0].text, /vector index/);
  assert.deepEqual(state, before.state, "an answer must leave the strategy byte-identical");
});

test("complete: a revision replaces one section and touches no other", async () => {
  const revised = [{ ...phases[0], keyDeliverables: ["Prototype", "HIPAA audit"] }];

  const { replies, state } = await runTurn(
    finished(),
    "add a HIPAA audit step to phase 1",
    deps({
      reviser: async () => ({
        action: "revise",
        reply: "Added the audit step to phase 1.",
        patch: { roadmapPhases: revised },
      }),
    }),
  );

  assert.equal(replies.length, 1);
  assert.equal(replies[0].agentName, "Project Manager", "signed by whoever owns the roadmap");
  assert.equal(state.currentStage, "complete", "an edit does not move the consultation");
  assert.deepEqual(state.roadmapPhases, revised);
  assert.deepEqual(state.architectureStack, stack, "the stack was not asked about");
  assert.deepEqual(state.changeManagementPlan, changePlan);
});

test("complete: a rerun clears everything downstream, rebuilds it, and every agent replies", async () => {
  const rebuiltPhases = [{ ...phases[0], phaseName: "Pilot, revised" }];
  const rebuiltPlan = { ...changePlan, adoptionKpis: ["% auto-triaged", "denial rate"] };

  const { replies, state } = await runTurn(
    finished(),
    "redo the roadmap, we only have one quarter",
    deps({
      reviser: async () => ({ action: "rerun", reply: "Rebuilding from the roadmap.", from: "roadmap" }),
      projectManager: async () => rebuiltPhases,
      changeCoach: async () => rebuiltPlan,
      sourcing: async () => sourcingResult,
    }),
  );

  assert.equal(state.currentStage, "complete", "the replay must finish the strategy");
  assert.deepEqual(state.roadmapPhases, rebuiltPhases);
  assert.deepEqual(state.changeManagementPlan, rebuiltPlan, "the plan downstream was rebuilt too");
  assert.deepEqual(state.architectureStack, stack, "upstream of the rewind is untouched");

  assert.deepEqual(
    replies.map((r) => r.agentName),
    ["Project Manager", "Project Manager", "Change Coach", "Sourcing Lead"],
    "the Reviser's reply, then each specialist that re-engaged",
  );
});

test("complete: a rerun from research stops at the approval gate instead of looping", async () => {
  const { replies, state } = await runTurn(
    finished(),
    "actually find different use cases",
    deps({
      reviser: async () => ({ action: "rerun", reply: "Starting the research again.", from: "research" }),
      retrieve: async () => ({ documents: [], sources: [], grounded: false, source: "none" }),
      // Fresh use cases arrive unapproved, so the gate must hold rather than the loop guessing.
      analyst: async () => [useCase("uc-9", "suggested")],
      architect: notCalled("architect"),
    }),
  );

  assert.equal(state.currentStage, "architecture", "blocked at the gate, not run through");
  assert.deepEqual(state.useCases.map((u) => u.id), ["uc-9"]);
  assert.equal(state.architectureStack, undefined, "the old stack was cleared by the rewind");
  assert.equal(state.roadmapPhases, undefined);
  assert.equal(state.changeManagementPlan, undefined);
  assert.match(replies.at(-1)!.text, /approve at least one/i);
});

test("sourcing: an ungrounded search names no partner and says so", async () => {
  // The whole risk of this feature in one assertion. A shortlist is worth having only because
  // every firm on it is real; the moment it invents one, everything else the product said
  // becomes suspect too. The agent returns grounded:false with an empty list, and the stage
  // must store that as-is rather than treating it as a failure.
  const { replies, state } = await runTurn(
    session("sourcing", {
      useCases: [useCase("uc-1", "approved")],
      architectureStack: stack,
      roadmapPhases: phases,
      changeManagementPlan: changePlan,
    }),
    "who builds this?",
    deps({
      sourcing: async () => ({
        reply:
          "I could not find verifiable implementation partners for this in your region. Here is " +
          "how I would run that search, and the proposal stands on its own.",
        sourcing: {
          partners: [],
          proposal: {
            scope: "Build and hand over the packet assembly pipeline",
            phases: [{ phaseName: "Pilot", personWeeks: 8, partnerRole: "Lead build" }],
            budgetRange: "KES 6M-9M",
            currency: "KES",
            nextStep: "Run the shortlist search with a procurement lead",
          },
          grounded: false,
        },
      }),
    }),
  );

  assert.equal(state.currentStage, "complete", "no partners is a result, not a failure");
  assert.deepEqual(state.sourcing?.partners, [], "nothing invented to fill the gap");
  assert.equal(state.sourcing?.grounded, false);
  assert.ok(state.sourcing?.proposal, "the proposal survives - it derives from the roadmap");
  assert.match(replies[0].text, /could not find/i, "the user is told, not left to notice");
});
