/**
 * What survives between consultations, and what must not.
 *
 * Three things worth pinning. A first-time client cannot be able to tell this feature exists —
 * an accidental change to the cold greeting is a regression every single user would see. A
 * returning client's refusals have to come back WITH their reasons, because a reason is the
 * only feedback in the product that says more than yes or no. And an abandoned consultation
 * must never become a memory: recalling one would have the agent open by referring to work
 * that does not exist.
 *
 * Pure — no Firestore, no model.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { greeting, memoryBlock, remember, summarise, STORED_CONSULTATIONS } from "./memory.ts";
import type { AgentState, ClientMemory, SessionDocument, SessionUserProfile } from "../types.ts";

const profile: SessionUserProfile = {
  name: "Ada Mensah",
  role: "CTO/CIO",
  industry: "Healthcare",
};

const session = (state: Partial<AgentState>): SessionDocument =>
  ({
    sessionId: "session_1",
    userId: "uid_1",
    userProfile: profile,
    messages: [],
    state: { currentStage: "discovery", needsAssessment: {}, useCases: [], ...state },
  }) as unknown as SessionDocument;

const populated: ClientMemory = {
  consultations: [
    {
      sessionId: "session_0",
      completedAt: "2026-06-14T09:00:00.000Z",
      industry: "Healthcare",
      bottleneck: "Manual prior authorisation assembly taking 18 days",
      approved: ["Automated packet assembly"],
      rejected: [{ title: "Payer policy monitoring", reason: "too speculative for this year" }],
    },
  ],
  notes: ["Budgets in KES, never dollars.", "Will not accept a phase longer than a quarter."],
};

// --- 1 --------------------------------------------------------------------------
// The invisible case. This is the one a first-time user sees, so it is the one that must not
// move: the assertion is on the exact string, not on "contains the name".

test("with no memory, nothing changes at all", () => {
  assert.equal(memoryBlock(undefined), "");
  assert.equal(memoryBlock({ consultations: [], notes: [] }), "");

  assert.equal(
    greeting(profile, undefined),
    "Welcome, Ada Mensah. I'm your Discovery Consultant. As a CTO/CIO in Healthcare, " +
      "what's the business bottleneck you're most hoping AI can solve?",
  );
  // An empty memory object is not the same value as no memory, and must behave identically.
  assert.equal(greeting(profile, { consultations: [], notes: [] }), greeting(profile, undefined));
});

// --- 2 --------------------------------------------------------------------------

test("a returning client is recalled, refusals with their reasons", () => {
  const block = memoryBlock(populated);

  assert.match(block, /Manual prior authorisation assembly taking 18 days/);
  assert.match(block, /Automated packet assembly/);
  // The reason is the whole point of storing a rejection rather than a status.
  assert.match(block, /Payer policy monitoring \(too speculative for this year\)/);
  assert.match(block, /Budgets in KES, never dollars\./);

  const back = greeting(profile, populated);
  assert.match(back, /Welcome back, Ada Mensah/);
  assert.match(back, /Manual prior authorisation assembly taking 18 days/);
});

test("the block is capped, so memory cannot grow a prompt without bound", () => {
  const many: ClientMemory = {
    consultations: Array.from({ length: 9 }, (_, i) => ({
      ...populated.consultations[0],
      sessionId: `s${i}`,
      bottleneck: `BOTTLENECK_${i}`,
    })),
    notes: Array.from({ length: 30 }, (_, i) => `NOTE_${i}`),
  };

  const block = memoryBlock(many);
  assert.equal((block.match(/BOTTLENECK_/g) ?? []).length, 3);
  assert.equal((block.match(/NOTE_/g) ?? []).length, 12);
  // Newest notes, not the first twelve ever written.
  assert.match(block, /NOTE_29/);
  assert.doesNotMatch(block, /NOTE_0\b/);
});

// --- 3 --------------------------------------------------------------------------

test("only a finished consultation becomes a memory", () => {
  assert.equal(summarise(session({ currentStage: "roadmap" })), null);
  assert.equal(summarise(session({ currentStage: "architecture" })), null);

  const done = summarise(
    session({
      currentStage: "complete",
      needsAssessment: { identifiedBottleneck: "Claims triage by hand" },
      useCases: [
        { id: "uc-1", title: "Triage scoring", status: "approved" },
        { id: "uc-2", title: "Auto-adjudication", status: "rejected" },
      ] as AgentState["useCases"],
      declined: [{ title: "Auto-adjudication", reason: "regulator will not wear it" }],
    }),
  );

  assert.ok(done);
  assert.equal(done.bottleneck, "Claims triage by hand");
  assert.deepEqual(done.approved, ["Triage scoring"]);
  // From `declined`, not from filtering useCases — a rerun rebuilds that array and the refusal
  // that shaped the final strategy would not be in it.
  assert.deepEqual(done.rejected, [
    { title: "Auto-adjudication", reason: "regulator will not wear it" },
  ]);
});

test("remembering folds newest-first and keeps the store bounded", () => {
  const finished = summarise(
    session({ currentStage: "complete", needsAssessment: { identifiedBottleneck: "New thing" } }),
  );

  const next = remember(populated, finished);
  assert.equal(next.consultations[0].bottleneck, "New thing");
  assert.equal(next.consultations[1].sessionId, "session_0");
  assert.deepEqual(next.notes, populated.notes, "notes are untouched by a new consultation");

  // Nothing finished — an abandoned consultation must not displace a real one.
  assert.deepEqual(remember(populated, null).consultations, populated.consultations);

  const full: ClientMemory = {
    consultations: Array.from({ length: STORED_CONSULTATIONS }, (_, i) => ({
      ...populated.consultations[0],
      sessionId: `s${i}`,
    })),
    notes: [],
  };
  assert.equal(remember(full, finished).consultations.length, STORED_CONSULTATIONS);
});
