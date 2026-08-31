/**
 * Seeds `knowledge_base` - the curated corpus the Analyst retrieves from.
 *
 *   node --env-file=.env scripts/seed.ts             # research what is missing, then write
 *   node --env-file=.env scripts/seed.ts --refresh   # re-research everything, overwrite
 *
 * Replaces the `POST /api/knowledge/ingest` endpoint in docs/FIRESTORE_SCHEMA.md. Ingest is a
 * one-time local operation run by us; an authenticated HTTP route for it is a content-poisoning
 * hole that exists only to be secured. The Admin SDK needs no auth, no admin claim, no route.
 *
 * WHY THIS SCRIPT SEARCHES INSTEAD OF WRITING FROM MEMORY. The plan allotted three hours to
 * "author 20-30 seed documents", which at that rate means generating them - and generated case
 * studies with invented companies and invented metrics are worse than no corpus at all, because
 * RAG then presents the invention as a researched finding. So every document here is written
 * from a live Google Search through Gemini's grounding tool, and a document that comes back
 * without a citation is DROPPED rather than kept. `sourceUrl` is the deliverable.
 *
 * Documents are cached in knowledge/*.json, so a re-run costs nothing and the corpus is
 * reviewable in the diff rather than only in Firestore.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../app/services/firestore.ts";
import { EMBEDDING_DIMENSIONS, embed, searchGrounded } from "../app/services/gemini.ts";
import type { Industry, KnowledgeDocument } from "../app/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KNOWLEDGE_DIR = join(ROOT, "knowledge");
const REFRESH = process.argv.includes("--refresh");

/**
 * Five bottlenecks per industry - the ones a real user actually arrives with. The Analyst
 * retrieves with an industry equality filter, so coverage matters per industry, not overall.
 */
const THEMES: Record<Industry, string[]> = {
  Healthcare: [
    "insurance claims processing and prior authorisation delays",
    "clinical documentation and physician note-taking burden",
    "patient triage, scheduling and no-show rates",
    "diagnostic imaging review backlogs",
    "revenue cycle management and coding errors",
  ],
  Finance: [
    "payment fraud detection and false positive rates",
    "credit underwriting and loan decision turnaround",
    "KYC and anti-money-laundering alert review",
    "customer service and call centre volume",
    "financial document processing and reconciliation",
  ],
  Manufacturing: [
    "unplanned equipment downtime and predictive maintenance",
    "visual quality inspection and defect escape rates",
    "demand forecasting and inventory carrying cost",
    "production scheduling and changeover time",
    "workplace safety incidents and compliance monitoring",
  ],
  Retail: [
    "demand forecasting and stockouts",
    "personalised recommendations and conversion rate",
    "customer service ticket volume and response time",
    "inventory shrinkage and loss prevention",
    "pricing and markdown optimisation",
  ],
  SaaS: [
    "support ticket deflection and first response time",
    "customer churn prediction and retention",
    "engineering productivity and code review throughput",
    "sales lead qualification and pipeline coverage",
    "user onboarding and time to first value",
  ],
};

/**
 * The first line is load-bearing. The search tool is optional to the model, and asked a
 * question inside its own competence it will answer from memory, return no grounding chunks,
 * and produce exactly the confident uncited paragraph this whole script exists to avoid.
 * Told to search first, the same query comes back with three citations.
 */
const RESEARCH_INSTRUCTION = [
  "You are a research assistant building a reference corpus of real AI deployments.",
  "",
  "ALWAYS run a Google Search before answering. Never answer from memory: every organisation",
  "name and every figure you report must come from a page you retrieved in this turn. If the",
  "search results contain no suitable example, reply with exactly: NONE",
  "",
  "When you have the results, reply in this format and nothing else:",
  "TITLE: <organisation> - <what they deployed>, under 12 words",
  "BODY: <150-250 words: the organisation, their problem, what they built, the technique, and",
  "the outcome they published including the published figure>",
  "No markdown, no bullets, no preamble.",
].join("\n");

type SeedDocument = Omit<KnowledgeDocument, "embedding">;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** One grounded search, parsed. Returns null when there is nothing real to say. */
async function research(industry: Industry, theme: string): Promise<SeedDocument | null> {
  const { text, sources } = await searchGrounded(
    `Search the web for a published case study: a ${industry.toLowerCase()} organisation that ` +
      `applied AI to ${theme} and reported a measured outcome.`,
    RESEARCH_INSTRUCTION,
  );

  const title = text.match(/^TITLE:\s*(.+)$/m)?.[1]?.trim();
  const body = text.match(/^BODY:\s*([\s\S]+)$/m)?.[1]?.trim();

  // A citation is the whole point. No citation, no document - an uncited "case study" in the
  // corpus is indistinguishable from a fabricated one the moment the Analyst retrieves it.
  if (!title || !body || sources.length === 0 || /^NONE$/m.test(text)) return null;

  return {
    id: `${slug(industry)}-${slug(theme)}`,
    industry,
    category: "case_study",
    title,
    content: body,
    sourceUrl: sources[0].url,
    metadata: {
      // ponytail: nothing reads these yet - retrieval filters on `industry` alone. They are
      // here because the schema declares them, and they are what a re-ranker would use.
      targetRoles: ["CEO/Founder", "CTO/CIO", "Department Head"],
      impactScore: 0.8,
      tags: [slug(industry), ...theme.split(" and ").map(slug)],
    },
  };
}

function cacheFile(industry: Industry) {
  return join(KNOWLEDGE_DIR, `${slug(industry)}.json`);
}

function readCache(industry: Industry): SeedDocument[] {
  const file = cacheFile(industry);
  if (REFRESH || !existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8")) as SeedDocument[];
}

/**
 * The same bottlenecks, asked about on the continent the product is positioned for.
 *
 * Nothing in the corpus said Africa: every seeded case study was a US health system, so the
 * Analyst could only ever ground a Lagos client in Alabama. These run through `research()` like
 * every other document, which means they are dropped if the search returns no citation - a
 * hand-written African case study would be exactly the fabrication the drop rule exists to
 * prevent.
 */
const AFRICA_THEMES: Record<Industry, string[]> = {
  Healthcare: ["patient record digitisation and claims processing at a hospital group in Africa"],
  Finance: ["mobile money fraud detection at an African bank or fintech"],
  Manufacturing: ["production quality inspection at an African manufacturer"],
  Retail: ["demand forecasting and stockouts at an African retailer or e-commerce platform"],
  SaaS: ["customer support automation at an African technology company"],
};

const themesFor = (industry: Industry) => [...THEMES[industry], ...AFRICA_THEMES[industry]];

async function collect(industry: Industry): Promise<SeedDocument[]> {
  const cached = readCache(industry);
  const have = new Set(cached.map((d) => d.id));
  const documents = [...cached];

  for (const theme of themesFor(industry)) {
    if (have.has(`${slug(industry)}-${slug(theme)}`)) continue;

    // Sequential on purpose: 25 grounded searches in parallel is a quota incident, and this
    // script runs once.
    const doc = await research(industry, theme).catch((err: Error) => {
      console.warn(`      ! search failed: ${err.message}`);
      return null;
    });

    if (doc) {
      documents.push(doc);
      console.log(`      + ${doc.title}`);
      console.log(`        ${doc.sourceUrl}`);
    } else {
      console.log(`      - no citable example for "${theme}" - dropped`);
    }
  }

  mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  writeFileSync(cacheFile(industry), `${JSON.stringify(documents, null, 2)}\n`);
  return documents;
}

async function main() {
  const industries = Object.keys(THEMES) as Industry[];
  const all: SeedDocument[] = [];

  for (const industry of industries) {
    console.log(`\n[${industry}]`);
    all.push(...(await collect(industry)));
  }

  console.log(`\n[embedding] ${all.length} documents at ${EMBEDDING_DIMENSIONS} dimensions`);
  const collection = db().collection("knowledge_base");
  let checked = false;

  for (const doc of all) {
    const values = await embed(`${doc.title}\n\n${doc.content}`);

    // The index declares its dimension and a mismatch fails every query later, not here.
    if (!checked) {
      if (values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Embedding is ${values.length}-d but the index declares ${EMBEDDING_DIMENSIONS}. ` +
            "Rebuild the index or set EMBEDDING_DIMENSIONS to match - do not seed either way.",
        );
      }
      console.log(`  vector length ${values.length} matches the index`);
      checked = true;
    }

    await collection.doc(doc.id).set({ ...doc, embedding: FieldValue.vector(values) });
  }

  const withSources = all.filter((d) => d.sourceUrl).length;
  console.log(`\n[done] ${all.length} documents written, ${withSources} with a sourceUrl`);
  if (withSources !== all.length) throw new Error("A document reached Firestore without a source");
}

await main();
