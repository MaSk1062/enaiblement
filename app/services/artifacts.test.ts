/**
 * Merging generated files into a session.
 *
 * Two failure modes worth a test. Regenerating a capability must not leave three copies of
 * main.tf behind — the whole point of keying on `path`. And a file that breaches the cap must be
 * REJECTED rather than truncated: half a Terraform file that looks complete is the kind of thing
 * someone runs.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ARTIFACTS, MAX_ARTIFACT_BYTES, applyArtifacts } from "./firestore.ts";
import type { Artifact } from "../types.ts";

const file = (path: string, content = "x", id: string = crypto.randomUUID()): Artifact => ({
  id,
  path,
  language: "hcl",
  content,
  summary: "a file",
  producedBy: "Platform Engineer",
});

test("regenerating a file replaces it, and keeps its id", () => {
  const original = file("infra/main.tf", "resource A", "id-1");
  const merged = applyArtifacts([original], [file("infra/main.tf", "resource B")]);

  assert.equal(merged.artifacts.length, 1, "one path, one file");
  assert.equal(merged.artifacts[0].content, "resource B");
  assert.equal(merged.artifacts[0].id, "id-1", "reusing the id keeps the subcollection flat too");
  assert.equal(merged.written.length, 1);
  assert.deepEqual(merged.rejected, []);
});

test("a new path is added alongside, not instead", () => {
  const merged = applyArtifacts([file("Dockerfile")], [file("k8s/deployment.yaml")]);

  assert.deepEqual(
    merged.artifacts.map((a) => a.path).sort(),
    ["Dockerfile", "k8s/deployment.yaml"],
  );
});

test("an oversized file is rejected with a reason, never truncated", () => {
  const huge = file("infra/main.tf", "x".repeat(MAX_ARTIFACT_BYTES + 1));
  const merged = applyArtifacts([], [huge]);

  assert.deepEqual(merged.artifacts, [], "nothing was stored");
  assert.equal(merged.rejected.length, 1);
  assert.match(merged.rejected[0].reason, /exceeds/);
});

test("the per-session cap stops new files but still lets existing ones be replaced", () => {
  const existing = Array.from({ length: MAX_ARTIFACTS }, (_, i) => file(`f${i}.tf`));

  const blocked = applyArtifacts(existing, [file("one-too-many.tf")]);
  assert.equal(blocked.artifacts.length, MAX_ARTIFACTS);
  assert.match(blocked.rejected[0].reason, /already holds/);

  const replaced = applyArtifacts(existing, [file("f0.tf", "updated")]);
  assert.equal(replaced.artifacts.length, MAX_ARTIFACTS, "a replacement is not a new file");
  assert.equal(replaced.rejected.length, 0);
  assert.equal(replaced.artifacts.find((a) => a.path === "f0.tf")?.content, "updated");
});
