/**
 * Retrieval for the Analyst (ARCHITECTURE.md §7.2, ADR-04).
 *
 * Two retrievers, tried in order, and the order is the point:
 *
 *   1. knowledge_base - bottleneck -> embedding -> where(industry) -> findNearest(COSINE, k).
 *      Curated, verified, fast, and free of the open web. Always preferred when it answers.
 *   2. Google Search, via Gemini's own tool - real URLs, no corpus to seed and no index to
 *      build, but it is the open web and the user is told so.
 *   3. Nothing. `grounded: false`, and the prompt is instructed not to invent anything.
 *
 * The industry equality filter on (1) is not a nicety: it is what keeps a flat index viable,
 * and it is why the composite index declares `industry` ASCENDING alongside the vector config.
 *
 * NOTE: docs/FIRESTORE_SCHEMA.md writes vectors with `VectorValue.create()`, which does not
 * exist in the SDK. `FieldValue.vector()` is the real API - this is the only file that
 * knows that, and scripts/verify-kickoff.mjs asserts it.
 */

import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firestore.ts";
import { embed, searchGrounded } from "./gemini.ts";
import { event } from "./telemetry.ts";
import type { Industry, KnowledgeDocument } from "../types.ts";

const TOP_K = Number(process.env.RAG_TOP_K ?? 3);

export type Retrieved = Pick<KnowledgeDocument, "id" | "title" | "content" | "sourceUrl">;

export interface RagResult {
  /** What the Analyst prompt sees. */
  documents: Retrieved[];
  /** What the UI cites. Same evidence, addressed to a human. */
  sources: { title: string; url: string }[];
  /** False when nothing was retrieved. The Analyst must be told, and the response marked. */
  grounded: boolean;
  /** Which retriever answered. Web results must never be presented as curated case studies. */
  source: "knowledge_base" | "web" | "none";
}

/** Vector search over the curated corpus. */
async function knowledgeBase(
  bottleneck: string,
  industry: Industry,
  limit: number,
): Promise<Retrieved[]> {
  const queryVector = FieldValue.vector(await embed(bottleneck));

  const snapshot = await db()
    .collection("knowledge_base")
    .where("industry", "==", industry)
    .findNearest({ vectorField: "embedding", queryVector, limit, distanceMeasure: "COSINE" })
    .get();

  return snapshot.docs.map((d) => {
    const data = d.data() as KnowledgeDocument;
    return { id: d.id, title: data.title, content: data.content, sourceUrl: data.sourceUrl };
  });
}

const SEARCH_INSTRUCTION = [
  "You are a research assistant. Search for real, published examples of how companies in the",
  "named industry have applied AI to the named bottleneck.",
  "Report only what you find in the search results: the company, what they deployed, and the",
  "outcome they published, with the figure they published. Six sentences at most.",
  "If the results contain no concrete example, say exactly that. Never fill the gap from memory.",
].join("\n");

/** Google Search, through Gemini's tool. Returns one document: the findings, plus its citations. */
async function webSearch(bottleneck: string, industry: Industry) {
  const { text, sources } = await searchGrounded(
    `Industry: ${industry}. Business bottleneck: ${bottleneck}. ` +
      "Find published case studies of AI deployed against this bottleneck in this industry, " +
      "with the measured outcome each company reported.",
    SEARCH_INSTRUCTION,
  );

  // No citations means the model answered from its own weights and the search returned nothing
  // usable - which is precisely the ungrounded case, so do not dress it up as retrieval.
  if (!text.trim() || sources.length === 0) return { documents: [] as Retrieved[], sources: [] };

  const documents: Retrieved[] = [
    {
      id: "web-search",
      title: `Web research - AI applied to "${bottleneck}" in ${industry}`,
      content: `${text.trim()}\n\nSources:\n${sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}`,
    },
  ];
  return { documents, sources };
}

export const defaultRetrieveDeps = { knowledgeBase, web: webSearch };
export type Retrievers = typeof defaultRetrieveDeps;

/** Never throws: a retrieval failure degrades the turn, it does not end it. */
async function attempt<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    event("retrieval.failed", {
      severity: "WARNING",
      source: label,
      error: (err as Error).message,
    });
    return fallback;
  }
}

export async function retrieve(
  bottleneck: string,
  industry: Industry,
  limit = TOP_K,
  deps: Retrievers = defaultRetrieveDeps,
): Promise<RagResult> {
  const started = Date.now();
  const done = (result: RagResult) => {
    event("retrieval", {
      source: result.source,
      documents: result.documents.length,
      sources: result.sources.length,
      durationMs: Date.now() - started,
      ok: result.grounded,
    });
    return result;
  };

  const curated = await attempt("knowledge_base", () => deps.knowledgeBase(bottleneck, industry, limit), []);
  if (curated.length > 0) {
    return done({
      documents: curated,
      sources: curated.flatMap((d) => (d.sourceUrl ? [{ title: d.title, url: d.sourceUrl }] : [])),
      grounded: true,
      source: "knowledge_base",
    });
  }

  const web = await attempt("web", () => deps.web(bottleneck, industry), {
    documents: [],
    sources: [],
  });
  if (web.documents.length > 0) {
    return done({ documents: web.documents, sources: web.sources, grounded: true, source: "web" });
  }

  return done({ documents: [], sources: [], grounded: false, source: "none" });
}

/** Formats retrieved documents for the Analyst prompt, or says plainly that there are none. */
export function toContextBlock({ documents, source }: RagResult): string {
  if (documents.length === 0) {
    return [
      "RETRIEVED CASE STUDIES: none.",
      "You are running WITHOUT grounding. Do not invent company names, customers, or metrics",
      "and do not present anything below as a researched finding. Base the use cases on the",
      "user's stated bottleneck and say what each one is reasoning from.",
    ].join("\n");
  }

  return [
    source === "web"
      ? "RETRIEVED FROM A WEB SEARCH (open web, not our curated corpus - attribute accordingly):"
      : "RETRIEVED CASE STUDIES:",
    ...documents.map(
      (d, i) =>
        `[${i + 1}] ${d.title}${d.sourceUrl ? ` (source: ${d.sourceUrl})` : ""}\n${d.content}`,
    ),
  ].join("\n\n");
}
