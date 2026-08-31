import assert from "node:assert/strict";
import { test } from "node:test";
import { selectExportUseCases } from "./exportView.ts";
import type { UseCase } from "../types.ts";

function useCase(id: string, status: UseCase["status"]): UseCase {
  return {
    id,
    title: `Use case ${id}`,
    description: "desc",
    impact: "Medium",
    complexity: "Medium",
    businessValue: "value",
    status,
  };
}

test("only approved use cases go in the approved list, order preserved", () => {
  const useCases = [useCase("a", "approved"), useCase("b", "approved"), useCase("c", "rejected")];
  const result = selectExportUseCases(useCases);
  assert.deepEqual(
    result.approved.map((uc) => uc.id),
    ["a", "b"],
  );
});

test("rejected use cases are listed separately, not mixed with approved", () => {
  const useCases = [useCase("a", "rejected"), useCase("b", "approved")];
  const result = selectExportUseCases(useCases);
  assert.deepEqual(
    result.consideredNotPursued.map((uc) => uc.id),
    ["a"],
  );
  assert.deepEqual(
    result.approved.map((uc) => uc.id),
    ["b"],
  );
});

test("a use case never decided on is omitted from both lists", () => {
  const useCases = [useCase("a", "suggested"), useCase("b", "approved")];
  const result = selectExportUseCases(useCases);
  assert.deepEqual(
    result.approved.map((uc) => uc.id),
    ["b"],
  );
  assert.deepEqual(result.consideredNotPursued, []);
});

test("no use cases at all produces two empty lists, not a crash", () => {
  const result = selectExportUseCases([]);
  assert.deepEqual(result, { approved: [], consideredNotPursued: [] });
});
