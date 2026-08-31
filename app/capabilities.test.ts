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
import { CAPABILITIES, DEEP_DIVE_ORDER, capability, planDeepDive } from "./capabilities.ts";
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

// --- the deep dive ------------------------------------------------------------
// One button runs the bench, so this function decides what actually happens. Order is the part
// worth pinning: it is dependency order, not menu order, and getting it wrong degrades output
// silently rather than failing.

test("a deep dive from a fresh state runs what it can and explains the rest", () => {
  const plan = planDeepDive(fresh);

  assert.deepEqual(plan.run, [], "nothing is ready before the interview");
  assert.equal(plan.skipped.length, CAPABILITIES.length);
  for (const s of plan.skipped) {
    assert.ok(s.reason.length > 10, `${s.id} must say why, got: ${s.reason}`);
  }
});

test("after the interview it runs the deep dive of the needs alone", () => {
  const plan = planDeepDive(interviewed);

  assert.deepEqual(plan.run, ["deep-needs"]);
  assert.equal(plan.skipped.length, 5);
});

test("a finished strategy runs every specialist IN DEPENDENCY ORDER", () => {
  const plan = planDeepDive(finished);

  // Exact array, not a set. `estimate` after `platform` would silently cost the Platform
  // Engineer the sizing input it is handed, and nothing would look broken.
  assert.deepEqual(plan.run, [
    "deep-needs",
    "diagram",
    "estimate",
    "platform",
    "sre",
    "implementation",
  ]);
  assert.deepEqual(plan.skipped, []);
  assert.deepEqual(plan.run, DEEP_DIVE_ORDER, "the order is the declared one");
});

test("a stack with no approvals runs the four that need only a stack", () => {
  const stackOnly: AgentState = { ...interviewed, architectureStack: stack };
  const plan = planDeepDive(stackOnly);

  assert.deepEqual(plan.run, ["deep-needs", "diagram", "platform", "sre"]);
  assert.deepEqual(
    plan.skipped.map((s) => s.id),
    ["estimate", "implementation"],
  );
  for (const s of plan.skipped) assert.match(s.reason, /approve a use case/);
});
