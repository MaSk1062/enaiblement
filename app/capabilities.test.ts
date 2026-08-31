/**
 * What the deep bench will and will not run yet.
 *
 * These predicates are the only new logic a user can watch being wrong: they decide which
 * buttons are live, and the same function is enforced server-side in the produce route. A
 * capability offered too early fails against a real model and bills for it; one offered too late
 * looks broken.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPABILITIES, capability } from "./capabilities.ts";
import type { AgentState, UseCase } from "./types.ts";

const useCase = (status: UseCase["status"]): UseCase => ({
  id: "uc-1",
  title: "Automated packet assembly",
  description: "…",
  impact: "High",
  complexity: "Medium",
  businessValue: "Cuts turnaround by 60%",
  status,
});

const stack = {
  models: ["Gemini 3.5 Flash"],
  infrastructure: ["Vertex AI"],
  frameworks: [],
  securityConsiderations: "HIPAA",
};

const fresh: AgentState = { currentStage: "discovery", needsAssessment: {}, useCases: [] };

const interviewed: AgentState = {
  ...fresh,
  needsAssessment: { identifiedBottleneck: "Manual prior authorisation review" },
};

const gated: AgentState = {
  ...interviewed,
  currentStage: "architecture",
  useCases: [useCase("suggested")],
};

const finished: AgentState = {
  ...interviewed,
  currentStage: "complete",
  useCases: [useCase("approved")],
  architectureStack: stack,
};

const available = (state: AgentState) =>
  CAPABILITIES.filter((c) => c.requires(state) === null).map((c) => c.id);

test("at the very first message nothing is available, and each says why", () => {
  assert.deepEqual(available(fresh), []);

  for (const c of CAPABILITIES) {
    const reason = c.requires(fresh);
    assert.ok(reason && reason.length > 10, `${c.id} must explain itself, got: ${reason}`);
  }
});

test("a bottleneck unlocks the deep dive and nothing else", () => {
  assert.deepEqual(available(interviewed), ["deep-needs"]);
});

test("use cases awaiting approval still do not unlock the costed work", () => {
  // The gate is the point: an estimate built on use cases the client has not accepted is an
  // estimate for the wrong project.
  assert.equal(capability("estimate")!.requires(gated), "approve a use case on the Canvas first");
  assert.equal(capability("implementation")!.requires(gated), "approve a use case on the Canvas first");
});

test("a finished strategy unlocks every specialist", () => {
  assert.deepEqual(available(finished).sort(), CAPABILITIES.map((c) => c.id).sort());
});

test("a stack with no approvals blocks on the approval, not on the stack", () => {
  const stackOnly: AgentState = { ...interviewed, architectureStack: stack };

  assert.equal(capability("diagram")!.requires(stackOnly), null, "a diagram needs only the stack");
  assert.match(capability("estimate")!.requires(stackOnly)!, /approve a use case/);
});
