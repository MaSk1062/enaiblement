/**
 * `message()` is the choke point every stored message passes through, and Firestore rejects an
 * undefined value outright - a whole turn 503s after the model has already been paid for. The
 * second assertion is the one that matters: it fails for ANY future field left undefined, not
 * just agentName.
 *
 * Pure function, no emulator, no credentials - the module initialises Firebase lazily.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { message } from "./firestore.ts";

test("a user message carries no undefined values, and no agentName key at all", () => {
  const m = message({ sender: "user", text: "our claims backlog takes three weeks" });

  assert.ok(!("agentName" in m), "agentName must be absent, not present-and-undefined");
  assert.deepEqual(
    Object.entries(m).filter(([, v]) => v === undefined),
    [],
  );
});

test("an agent message keeps its agent name", () => {
  const m = message({ sender: "agent", agentName: "Discovery Consultant", text: "hello" });

  assert.equal(m.agentName, "Discovery Consultant");
});
