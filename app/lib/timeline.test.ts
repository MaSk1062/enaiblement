import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTimeline, parseDuration } from "./timeline.ts";

test('"Weeks 1-4" parses to startWeek 1, endWeek 4, not open', () => {
  assert.deepEqual(parseDuration("Weeks 1-4"), { startWeek: 1, endWeek: 4, open: false });
});

test('"Weeks 5-12" parses to startWeek 5, endWeek 12, not open', () => {
  assert.deepEqual(parseDuration("Weeks 5-12"), { startWeek: 5, endWeek: 12, open: false });
});

test('"Month 4+" is open-ended and starts where month 4 begins', () => {
  const span = parseDuration("Month 4+");
  assert.equal(span?.open, true);
  assert.equal(span?.startWeek, 13);
  assert.ok(span!.endWeek >= span!.startWeek);
});

test("an unparseable duration returns null from parseDuration, not a throw", () => {
  assert.equal(parseDuration("Ongoing, TBD by the client"), null);
});

test("garbage duration in buildTimeline falls back to a sequential lane instead of crashing", () => {
  const timeline = buildTimeline([
    { phaseName: "Pilot", duration: "Weeks 1-4" },
    { phaseName: "Mystery phase", duration: "Ongoing, TBD by the client" },
  ]);
  assert.equal(timeline.lanes.length, 2);
  assert.equal(timeline.lanes[1].startWeek, 5); // right after phase 1's week 4
  assert.ok(timeline.lanes[1].endWeek >= timeline.lanes[1].startWeek);
});

test("three real phases produce a correct, non-overlapping total span", () => {
  const timeline = buildTimeline([
    { phaseName: "Pilot & Proof of Concept", duration: "Weeks 1-4" },
    { phaseName: "Integration & Workflow Alignment", duration: "Weeks 5-12" },
    { phaseName: "Scale & Monitor", duration: "Month 4+" },
  ]);

  const [pilot, integration, scale] = timeline.lanes;
  assert.deepEqual([pilot.startWeek, pilot.endWeek], [1, 4]);
  assert.deepEqual([integration.startWeek, integration.endWeek], [5, 12]);
  assert.equal(scale.startWeek, 13);
  assert.equal(scale.open, true);

  // Non-overlapping: each lane starts after the previous one ends.
  assert.ok(pilot.endWeek < integration.startWeek);
  assert.ok(integration.endWeek < scale.startWeek);

  assert.equal(timeline.totalWeeks, Math.max(pilot.endWeek, integration.endWeek, scale.endWeek));
});

test("an empty phase list produces an empty timeline, not a crash", () => {
  assert.deepEqual(buildTimeline([]), { lanes: [], totalWeeks: 1 });
});
