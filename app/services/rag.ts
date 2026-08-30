/**
 * Retrieval for the Analyst (ARCHITECTURE.md §7.2, ADR-04).
 *
 * bottleneck -> embedding -> where(industry) -> findNearest(COSINE, top k) -> context block.
 *
 * The industry equality filter is not a nicety: it is what keeps a flat index viable, and
 * it is why the composite index declares `industry` ASCENDING alongside the vector config.
 *
 * NOTE: docs/FIRESTORE_SCHEMA.md writes vectors with `VectorValue.create()`, which does not
 * exist in the SDK. `FieldValue.vector()` is the real API — this is the only file that
 * knows that, and scripts/verify-kickoff.mjs asserts it.
 */

import { FieldValue } from "firebase-admin/firestore";
import { db } from "./firestore.ts";
import { embed } from "./gemini.ts";
import type { Industry, KnowledgeDocument } from "../types.ts";

const TOP_K = Number(process.env.RAG_TOP_K ?? 3);

export type Retrieved = Pick<KnowledgeDocument, "id" | "title" | "content" | "sourceUrl">;

export interface RagResult {
  documents: Retrieved[];
  /** False when retrieval returned nothing. The Analyst must be told, and the response marked. */
  grounded: boolean;
}

export async function retrieve(
  bottleneck: string,
  industry: Industry,
  limit = TOP_K,
): Promise<RagResult> {
  try {
    const queryVector = FieldValue.vector(await embed(bottleneck));

    const snapshot = await db()
      .collection("knowledge_base")
      .where("industry", "==", industry)
      .findNearest({ vectorField: "embedding", queryVector, limit, distanceMeasure: "COSINE" })
      .get();

    const documents = snapshot.docs.map((d) => {
      const data = d.data() as KnowledgeDocument;
      return {
        id: d.id,
        title: data.title,
        content: data.content,
        sourceUrl: data.sourceUrl,
      };
    });

    return { documents, grounded: documents.length > 0 };
  } catch (err) {
    // The index may still be building. Keep the consultation alive, but never pretend it
    // was grounded — the caller marks the turn and the prompt is told.
    console.warn("[rag] retrieval failed, continuing ungrounded:", (err as Error).message);
    return { documents: [], grounded: false };
  }
}

/** Formats retrieved documents for the Analyst prompt, or says plainly that there are none. */
export function toContextBlock({ documents, grounded }: RagResult): string {
  if (!grounded) {
    return [
      "RETRIEVED CASE STUDIES: none.",
      "You are running WITHOUT grounding. Do not invent company names, customers, or metrics",
      "and do not present anything below as a researched finding. Base the use cases on the",
      "user's stated bottleneck and say what each one is reasoning from.",
    ].join("\n");
  }

  return [
    "RETRIEVED CASE STUDIES:",
    ...documents.map(
      (d, i) =>
        `[${i + 1}] ${d.title}${d.sourceUrl ? ` (source: ${d.sourceUrl})` : ""}\n${d.content}`,
    ),
  ].join("\n\n");
}
