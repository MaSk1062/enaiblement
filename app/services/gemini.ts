/**
 * The one seam between the agents and the model (ARCHITECTURE.md §4.3).
 *
 * Everything that would otherwise be repeated five times lives here: retry/backoff, JSON
 * mode, schema validation, the single repair re-prompt, and the snake_case -> camelCase
 * translation (delegated to the zod schema). An agent module is then a prompt, an input
 * projection, and a schema.
 *
 * Auth is Application Default Credentials, so this runs against Vertex AI: locally from
 * `gcloud auth application-default login`, on Cloud Run from the runtime service account.
 * There is no API key anywhere in the process.
 */

import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";

const PROJECT = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GCP_LOCATION ?? "us-central1";

export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 768);

const MAX_ATTEMPTS = 5; // 1s, 2s, 4s, 8s, 16s — ARCHITECTURE.md §5.3
const FIRST_BACKOFF_MS = 1000;

let client: GoogleGenAI | undefined;
function genai(): GoogleGenAI {
  if (!client) {
    if (!PROJECT) throw new Error("GCP_PROJECT_ID is not set; see .env.example");
    client = new GoogleGenAI({ enterprise: true, project: PROJECT, location: LOCATION });
  }
  return client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries transient API failures. Does not retry schema failures — those get one repair. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let backoff = FIRST_BACKOFF_MS;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      await sleep(backoff);
      backoff *= 2;
    }
  }
}

async function callModel(systemInstruction: string, contents: string): Promise<string> {
  const res = await withRetry(() =>
    genai().models.generateContent({
      model: TEXT_MODEL,
      contents,
      config: { systemInstruction, responseMimeType: "application/json" },
    }),
  );
  const text = res.text;
  if (!text) throw new Error("Model returned an empty response");
  return text;
}

/**
 * The call every agent makes. Returns the parsed, camelCased output, or throws.
 *
 * On a parse failure it re-prompts exactly once with the validation error appended. If the
 * repair also fails it throws — and the caller must leave the stage where it was, because
 * a stage may only advance on a payload that parsed (ARCHITECTURE.md §5.3, §6.3).
 */
export async function generateStructured<T>(
  systemInstruction: string,
  payload: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const raw = await callModel(systemInstruction, payload);

  const first = schema.safeParse(safeJson(raw));
  if (first.success) return first.data;

  const repaired = await callModel(
    systemInstruction,
    `${payload}

Your previous response failed validation. Return corrected JSON matching the required
schema exactly, and nothing else.

Previous response:
${raw}

Validation errors:
${JSON.stringify(first.error.issues, null, 2)}`,
  );

  const second = schema.safeParse(safeJson(repaired));
  if (second.success) return second.data;

  throw new SchemaRepairError(second.error.issues);
}

/** Thrown when both the first response and its repair fail validation. */
export class SchemaRepairError extends Error {
  readonly issues: unknown;
  constructor(issues: unknown) {
    super("Model output failed schema validation after one repair attempt");
    this.name = "SchemaRepairError";
    this.issues = issues;
  }
}

/** Returns undefined rather than throwing, so a non-JSON reply becomes a zod error. */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Embeds text for RAG. outputDimensionality pins the vector to whatever the Firestore
 * index declares, so swapping embedding models never silently breaks retrieval.
 */
export async function embed(text: string): Promise<number[]> {
  const res = await withRetry(() =>
    genai().models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    }),
  );
  const values = res.embeddings?.[0]?.values;
  if (!values?.length) throw new Error("Embedding model returned no vector");
  return values;
}
