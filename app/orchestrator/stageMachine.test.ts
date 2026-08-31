/**
 * The stage machine's check. No model, no Firestore — which is exactly what ADR-02 bought.
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

const stack = {
  models: ["Gemini 3.5 Flash"],
  infrastructure: ["Vertex AI"],
  frameworks: [],
  securityConsiderations: "HIPAA",
};

test("discovery: an 'asking' result does not advance the stage", async () => {
  const { reply, state } = await runTurn(
    session("discovery"),
    "we are drowning in paperwork",
    deps({ discovery: async () => ({ status: "asking", question: "Which paperwork exactly?" }) }),
  );

  assert.equal(state.currentStage, "discovery");
  assert.equal(reply.text, "Which paperwork exactly?");
  assert.equal(reply.agentName, "Discovery Consultant");
});

test("discovery: a 'complete' result advances to research and stores the assessment", async () => {
  const needsAssessment = {
    summary: "Manual claims triage throughout.",
    primaryObjective: "Cut claims cycle time",
    dataReadiness: "Medium" as const,
    identifiedBottleneck: "Manual claims triage",
  };

  const { reply, state } = await runTurn(
    session("discovery"),
    "mostly claims",
    deps({ discovery: async () => ({ status: "complete", needsAssessment }) }),
  );

  assert.equal(state.currentStage, "research");
  assert.deepEqual(state.needsAssessment, needsAssessment);
  assert.match(reply.text, /Manual claims triage/);
});

test("research: an ungrounded retrieval is marked and disclosed, never hidden", async () => {
  const { reply, state } = await runTurn(
    session("research", { needsAssessment: { identifiedBottleneck: "Manual claims triage" } }),
    "go on",
    deps({
      retrieve: async () => ({ documents: [], sources: [], grounded: false, source: "none" }),
      analyst: async () => [useCase("uc-1", "suggested")],
    }),
  );

  assert.equal(state.currentStage, "architecture");
  assert.equal(state.ungrounded, true);
  assert.match(reply.text, /no matches/i, "the user must be told it ran ungrounded");
});

test("architecture: the approval gate blocks and does not call the Architect", async () => {
  const blocked = await runTurn(
    session("architecture", { useCases: [useCase("uc-1", "suggested")] }),
    "next",
    deps(), // every agent throws if called
  );

  assert.equal(blocked.state.currentStage, "architecture", "must not advance without approvals");
  assert.match(blocked.reply.text, /approve at least one/i);
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

  const { reply, state } = await runTurn(
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
  assert.equal(reply.agentName, "Project Manager");
  assert.match(reply.text, /did not complete/i);
});
