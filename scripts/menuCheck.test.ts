/**
 * Every string here was produced by the real Architect during an eval run. Two of them were
 * scored wrong by earlier versions of this helper - an eval that fails on formatting is worse
 * than no eval, because it gets muted.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { onMenu } from "./menuCheck.ts";

const MENU = [
  "- Google: Gemini 3.5 Flash (via Vertex AI)",
  "- Anthropic: Claude Sonnet (via Vertex AI Model Garden)",
].join("\n");

test("every shape the Architect writes a menu model in is accepted", () => {
  for (const shape of [
    "Gemini 3.5 Flash",
    "Gemini 3.5 Flash (via Vertex AI)",
    "Google Gemini 3.5 Flash",
    "Google: Gemini 3.5 Flash (via Vertex AI)", // the menu line echoed back verbatim
    "Gemini 3.5 Flash - for high-throughput clinical document parsing",
    "Claude Sonnet (via Vertex AI Model Garden) for complex clinical reasoning",
  ]) {
    assert.equal(onMenu(shape, MENU), true, `should be on the menu: "${shape}"`);
  }
});

test("a model that is not on the menu is rejected, version included", () => {
  for (const shape of [
    "Gemini 1.5 Pro", // superseded - the §3.4 failure this case exists to catch
    "Claude 3.5 Sonnet (via Vertex AI Model Garden) for clinical reasoning", // menu says Sonnet, not 3.5 Sonnet
    "GPT-5",
    "Llama 4 (self-hosted)",
  ]) {
    assert.equal(onMenu(shape, MENU), false, `should be off the menu: "${shape}"`);
  }
});

test("a name that survives to nothing is off the menu, not vacuously on it", () => {
  assert.equal(onMenu("Google:", MENU), false);
  assert.equal(onMenu("   ", MENU), false);
});
