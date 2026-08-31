/**
 * Three properties, all of which are load-bearing in production:
 *
 * 1. Instrumentation cannot fail the thing it observes.
 * 2. A line carries its turn context, or Cloud Logging cannot group it.
 * 3. Nothing a user typed can reach a log line — the allow-list is what enforces that, so this
 *    is the test that keeps it enforced when someone adds a field in a hurry.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { event, withTurn, type EventFields } from "./telemetry.ts";

/** Runs fn with console.log captured, returning the parsed JSON lines. */
function captured(fn: () => void): Record<string, unknown>[] {
  const original = console.log;
  const lines: string[] = [];
  console.log = (line: string) => void lines.push(line);
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines.map((l) => JSON.parse(l));
}

const context = {
  sessionId: "session_1",
  uid: "u1",
  turnId: "abcd1234",
  stage: "research",
  agent: "Industry Analyst",
  tokens: { total: 0 },
};

test("an event outside any turn still logs one valid line and does not throw", () => {
  const [line] = captured(() => event("agent.call", { ok: true, durationMs: 12 }));

  assert.equal(line.event, "agent.call");
  assert.equal(line.severity, "INFO");
  assert.equal(line.durationMs, 12);
  assert.equal(line.sessionId, undefined, "no context means no context fields, not a crash");
});

test("inside a turn, every line carries the turn context and its severity", () => {
  const [line] = captured(() =>
    withTurn(context, () => event("turn.end", { severity: "ERROR", ok: false })),
  );

  assert.equal(line.severity, "ERROR");
  assert.equal(line.sessionId, "session_1");
  assert.equal(line.turnId, "abcd1234");
  assert.equal(line.stage, "research");
  assert.equal(line.agent, "Industry Analyst");
});

test("a field outside the allow-list cannot reach the payload", () => {
  const smuggled = {
    ok: true,
    text: "our claims backlog takes three weeks",
    email: "someone@example.com",
    prompt: "the whole system prompt",
  } as EventFields;

  const [line] = captured(() => withTurn(context, () => event("turn.start", smuggled)));

  assert.equal(line.ok, true, "allowed fields still pass");
  for (const key of ["text", "email", "prompt"]) {
    assert.ok(!(key in line), `${key} must never reach a log line`);
  }
  // The summary is ours to set: a caller cannot overwrite it with user content either.
  assert.equal(line.message, "turn.start");
});
