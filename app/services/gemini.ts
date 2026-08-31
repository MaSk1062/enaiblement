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
import { countTokens, event } from "./telemetry.ts";

const PROJECT = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;

/**
 * These two defaults are a pair and must move together.
 *
 * `gemini-3.5-flash` serves ONLY from the `global` endpoint - probed 2026-08-31, it is a plain
 * 404 ("publisher model not found") in `us-central1`. Defaulting the model here while leaving
 * the location regional would 404 every agent call for anyone who has not set GCP_LOCATION by
 * hand. This file is the single source of both defaults; scripts/deploy.sh passes the env vars
 * through only when they are set rather than carrying its own copy.
 *
 * `global` means requests may be served from any region - a data-residency ceiling, not a
 * problem for this build. If residency ever matters, the model has to change, not the config.
 */
export const LOCATION = process.env.GCP_LOCATION ?? "global";
export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.5-flash";
export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 768);

const MAX_ATTEMPTS = 5; // 1s, 2s, 4s, 8s, 16s - ARCHITECTURE.md §5.3
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

/** Retries transient API failures. Does not retry schema failures - those get one repair. */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = MAX_ATTEMPTS): Promise<T> {
  let backoff = FIRST_BACKOFF_MS;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      await sleep(backoff);
      backoff *= 2;
    }
  }
}

async function callModel(
  systemInstruction: string,
  contents: string,
  repaired: boolean,
): Promise<string> {
  const started = Date.now();
  try {
    const res = await withRetry(() =>
      genai().models.generateContent({
        model: TEXT_MODEL,
        contents,
        config: { systemInstruction, responseMimeType: "application/json" },
      }),
    );

    const usage = res.usageMetadata;
    countTokens(usage?.totalTokenCount);
    event("agent.call", {
      model: TEXT_MODEL,
      durationMs: Date.now() - started,
      promptTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      thoughtTokens: usage?.thoughtsTokenCount,
      totalTokens: usage?.totalTokenCount,
      repaired,
      ok: true,
    });

    const text = res.text;
    if (!text) throw new Error("Model returned an empty response");
    return text;
  } catch (err) {
    event("agent.call", {
      severity: "ERROR",
      model: TEXT_MODEL,
      durationMs: Date.now() - started,
      repaired,
      ok: false,
      error: (err as Error).message,
    });
    throw err;
  }
}

/**
 * The call every agent makes. Returns the parsed, camelCased output, or throws.
 *
 * On a parse failure it re-prompts exactly once with the validation error appended. If the
 * repair also fails it throws - and the caller must leave the stage where it was, because
 * a stage may only advance on a payload that parsed (ARCHITECTURE.md §5.3, §6.3).
 */
export async function generateStructured<T>(
  systemInstruction: string,
  payload: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const raw = await callModel(systemInstruction, payload, false);

  const first = schema.safeParse(safeJson(raw));
  if (first.success) return first.data;

  // The repair rate is the R1/R2 metric: a turn that repairs costs twice and is one bad roll
  // away from a lost turn. Paths only - the values that failed are model output about a user.
  event("agent.repair", {
    severity: "WARNING",
    issuePaths: first.error.issues.map((i) => i.path.join(".") || "(root)"),
  });

  const repaired = await callModel(
    systemInstruction,
    `${payload}

Your previous response failed validation. Return corrected JSON matching the required
schema exactly, and nothing else.

Previous response:
${raw}

Validation errors:
${JSON.stringify(first.error.issues, null, 2)}`,
    true,
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

export interface GroundedAnswer {
  text: string;
  /**
   * Only chunks that carry both a title and a URI. A citation without a link is not a citation.
   *
   * ponytail: the URI is Vertex's grounding redirect, and on Vertex the title is the publisher's
   * domain rather than the page title. Good enough to click and to attribute; the redirect
   * expires after a few weeks, so resolve these to final URLs if the corpus outlives the sprint.
   */
  sources: { title: string; url: string }[];
}

/**
 * A Google Search-grounded answer, with its citations.
 *
 * Separate from generateStructured because the search tool and `responseMimeType:
 * "application/json"` are mutually exclusive on Vertex - you get grounding or you get JSON
 * mode, never both. So this returns prose, and the caller feeds that prose to the structured
 * call as retrieved context (see services/rag.ts).
 *
 * ponytail: two attempts, not five. This is best-effort enrichment on a user-facing turn -
 * a full 31s backoff ladder before giving up costs more than the grounding is worth.
 */
export async function searchGrounded(
  query: string,
  systemInstruction: string,
): Promise<GroundedAnswer> {
  const started = Date.now();
  const res = await withRetry(
    () =>
      genai().models.generateContent({
        model: TEXT_MODEL,
        contents: query,
        config: { systemInstruction, tools: [{ googleSearch: {} }] },
      }),
    2,
  );

  const sources = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).flatMap((c) =>
    c.web?.title && c.web.uri ? [{ title: c.web.title, url: c.web.uri }] : [],
  );

  countTokens(res.usageMetadata?.totalTokenCount);
  event("search.grounded", {
    model: TEXT_MODEL,
    durationMs: Date.now() - started,
    queryChars: query.length,
    sources: sources.length,
    totalTokens: res.usageMetadata?.totalTokenCount,
    // Zero sources means the model answered from its own weights instead of searching. That is
    // the difference between a citation and a plausible sentence, so it is worth seeing.
    ok: sources.length > 0,
  });

  return { text: res.text ?? "", sources };
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
