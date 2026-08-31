import assert from "node:assert/strict";
import { test } from "node:test";
import { formatElapsed, stageSummary } from "./pipelineView.ts";
import type { AgentState } from "../types.ts";

function baseState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    currentStage: "discovery",
    needsAssessment: {},
    useCases: [],
    ...overrides,
  };
}

test("stageSummary is null for every stage before it has produced anything", () => {
  const state = baseState();
  assert.equal(stageSummary("discovery", state), null);
  assert.equal(stageSummary("research", state), null);
  assert.equal(stageSummary("architecture", state), null);
  assert.equal(stageSummary("roadmap", state), null);
  assert.equal(stageSummary("training", state), null);
});

test("discovery summarises once a bottleneck is identified", () => {
  const state = baseState({ needsAssessment: { identifiedBottleneck: "slow onboarding" } });
  assert.equal(stageSummary("discovery", state), "Bottleneck identified");
});

test("research summarises the use case count, singular vs plural", () => {
  const one = baseState({ useCases: [{ id: "a" } as never] });
  const three = baseState({ useCases: [1, 2, 3].map((n) => ({ id: `${n}` }) as never) });
  assert.equal(stageSummary("research", one), "1 use case");
  assert.equal(stageSummary("research", three), "3 use cases");
});

test("architecture summarises once a stack exists", () => {
  const state = baseState({
    architectureStack: { models: [], infrastructure: [], frameworks: [], securityConsiderations: "" },
  });
  assert.equal(stageSummary("architecture", state), "Stack designed");
});

test("roadmap summarises the phase count", () => {
  const state = baseState({
    roadmapPhases: [
      { phaseName: "A", duration: "Weeks 1-4", keyDeliverables: [], resourcesRequired: [] },
      { phaseName: "B", duration: "Weeks 5-8", keyDeliverables: [], resourcesRequired: [] },
    ],
  });
  assert.equal(stageSummary("roadmap", state), "2-phase roadmap");
});

test("training summarises once a change plan exists", () => {
  const state = baseState({
    changeManagementPlan: {
      upskillingPaths: [],
      communicationStrategy: { leadershipNarrative: "", mitigatingConcerns: [] },
      adoptionKpis: [],
    },
  });
  assert.equal(stageSummary("training", state), "Plan ready");
});

test("complete has nothing left to summarise", () => {
  assert.equal(stageSummary("complete", baseState()), null);
});

test("formatElapsed stays in seconds under a minute", () => {
  assert.equal(formatElapsed(0), "0s");
  assert.equal(formatElapsed(8_000), "8s");
  assert.equal(formatElapsed(59_000), "59s");
});

test("formatElapsed switches to minutes and seconds at 60s", () => {
  assert.equal(formatElapsed(60_000), "1m 0s");
  assert.equal(formatElapsed(72_000), "1m 12s");
  assert.equal(formatElapsed(125_000), "2m 5s");
});

test("formatElapsed never goes negative on a clock skew", () => {
  assert.equal(formatElapsed(-500), "0s");
});
