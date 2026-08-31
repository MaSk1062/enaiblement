/**
 * The deep bench: six specialists reached on demand rather than by working through the pipeline.
 *
 * They live in one file because they are all the same shape — a prompt, a schema, and a payload
 * built from the state — and the interesting differences are entirely in the prompts. Six files
 * of eight lines each would be six places to look for nothing.
 *
 * None of them can move the consultation. They enrich the state or hand over files; the stage
 * machine owns transitions and keeps owning them.
 */

import diagramPrompt from "./prompts/diagram.md?raw";
import platformPrompt from "./prompts/platform.md?raw";
import implementationPrompt from "./prompts/implementation.md?raw";
import estimatePrompt from "./prompts/estimate.md?raw";
import srePrompt from "./prompts/sre.md?raw";
import deepNeedsPrompt from "./prompts/deepNeeds.md?raw";
import pricing from "../../knowledge/pricing.json";
import { fillPrompt } from "./prompt.ts";
import { generateStructured } from "../services/gemini.ts";
import {
  ArtifactsOutput,
  DeepNeedsOutput,
  EstimateOutput,
  ReliabilityOutput,
} from "../services/schemas.ts";
import type { AgentState, ChatMessage, SessionUserProfile } from "../types.ts";

export interface DeepInput {
  profile: SessionUserProfile;
  state: AgentState;
  messages: ChatMessage[];
  /** What the user asked, when they asked in prose rather than pressing a button. */
  request?: string;
}

const HISTORY_TURNS = 6;

const transcript = (messages: ChatMessage[]) =>
  messages
    .slice(-HISTORY_TURNS)
    .map((m) => `${m.sender === "user" ? "User" : (m.agentName ?? "Agent")}: ${m.text}`)
    .join("\n");

const approved = (state: AgentState) => state.useCases.filter((uc) => uc.status === "approved");

/** What every specialist needs: who the client is and what has been agreed so far. */
function brief(input: DeepInput, include: (keyof AgentState)[] = []) {
  const parts = [
    `Client: ${JSON.stringify(input.profile)}`,
    `Needs assessment: ${JSON.stringify(input.state.needsAssessment, null, 2)}`,
    `Approved use cases: ${JSON.stringify(approved(input.state), null, 2)}`,
  ];

  for (const key of include) {
    if (input.state[key]) parts.push(`${key}: ${JSON.stringify(input.state[key], null, 2)}`);
  }
  if (input.request) parts.push(`The client asked: ${JSON.stringify(input.request)}`);

  return parts.join("\n\n");
}

export const diagram = (input: DeepInput) =>
  generateStructured(fillPrompt(diagramPrompt), brief(input, ["architectureStack"]), ArtifactsOutput);

export const platform = (input: DeepInput) =>
  generateStructured(
    fillPrompt(platformPrompt),
    brief(input, ["architectureStack", "estimate"]),
    ArtifactsOutput,
  );

export const implementation = (input: DeepInput) =>
  generateStructured(
    fillPrompt(implementationPrompt),
    brief(input, ["architectureStack"]),
    ArtifactsOutput,
  );

export const sre = (input: DeepInput) =>
  generateStructured(
    fillPrompt(srePrompt),
    brief(input, ["architectureStack", "roadmapPhases"]),
    ReliabilityOutput,
  );

export const deepNeeds = (input: DeepInput) =>
  generateStructured(
    fillPrompt(deepNeedsPrompt),
    `${brief(input, ["architectureStack"])}\n\nRecent conversation:\n${transcript(input.messages)}`,
    DeepNeedsOutput,
  );

/**
 * The estimator is the one that gets a fixed price list rather than being trusted to recall
 * prices. `pricesVerified` is decided here, from the file, and never by the model.
 */
export async function estimate(input: DeepInput) {
  const payload = [
    brief(input, ["architectureStack", "roadmapPhases"]),
    `PRICE LIST (the only prices you may use):\n${JSON.stringify(pricing.cloud, null, 2)}`,
    `RATE CARD (the only day rates you may use):\n${JSON.stringify(pricing.rateCard, null, 2)}`,
  ].join("\n\n");

  const { reply, estimate } = await generateStructured(
    fillPrompt(estimatePrompt),
    payload,
    EstimateOutput,
  );
  const pricesVerified =
    pricing.cloud.every((p) => p.verified) && pricing.rateCard.every((r) => r.verified);

  return { reply, estimate: { ...estimate, pricesVerified } };
}
