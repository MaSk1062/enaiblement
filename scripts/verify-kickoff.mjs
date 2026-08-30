/**
 * Hour-zero kickoff verification. Run BEFORE anyone writes services/gemini.ts.
 *
 *   gcloud auth application-default login      # once, per machine
 *   node scripts/verify-kickoff.mjs
 *
 * Auth is Application Default Credentials throughout — no API key anywhere. Locally that
 * is your gcloud ADC file; on Cloud Run it is the runtime service account via the metadata
 * server, with nothing to configure and nothing to leak.
 *
 * Answers the four things that are expensive to discover at T+20:
 *   1. does ADC reach Vertex  2. which model ids respond
 *   3. what the embedding dimension is  4. how a vector is written to Firestore
 */
import { GoogleGenAI } from "@google/genai";
import * as adminFirestore from "firebase-admin/firestore";
const { FieldValue } = adminFirestore;

const PROJECT = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GCP_LOCATION || "us-central1";

const TEXT_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash"];
const EMBED_MODELS = ["gemini-embedding-001", "text-embedding-005", "text-embedding-004"];
const WANT_DIMS = 768; // must match the declared vector index

let failed = false;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { failed = true; console.log(`  FAIL  ${m}`); };

// --- 4. Firestore vector write API (no credentials needed) --------------------
console.log("\n[vector API]");
if (typeof FieldValue.vector === "function") {
  ok(`FieldValue.vector() exists -> ${FieldValue.vector([1, 2, 3]).constructor.name}`);
} else {
  bad("FieldValue.vector() missing");
}
if (adminFirestore.VectorValue?.create === undefined) {
  ok("VectorValue.create is undefined, as expected — docs/FIRESTORE_SCHEMA.md uses it and is wrong");
} else {
  console.log("  NOTE  VectorValue.create now exists; the reference code may be usable as-is");
}

// --- 1. ADC ------------------------------------------------------------------
console.log("\n[credentials]");
if (!PROJECT) {
  bad("GCP_PROJECT_ID is not set (try: export GCP_PROJECT_ID=$(gcloud config get-value project))");
  console.log("\nSkipping the model checks.\n");
  process.exit(1);
}
ok(`project ${PROJECT}, location ${LOCATION}`);

const ai = new GoogleGenAI({ enterprise: true, project: PROJECT, location: LOCATION });

// --- 2. text model + JSON mode ------------------------------------------------
console.log("\n[text models]");
let liveTextModel = null;
for (const model of TEXT_MODELS) {
  try {
    const r = await ai.models.generateContent({
      model,
      contents: 'Return {"ok": true} and nothing else.',
      config: { responseMimeType: "application/json" },
    });
    JSON.parse(r.text); // JSON mode must produce parseable output
    ok(`${model} responds, JSON mode parses`);
    liveTextModel ??= model;
  } catch (e) {
    console.log(`  ----  ${model}: ${firstLine(e)}`);
  }
}
if (!liveTextModel) bad("no text model responded — check ADC and that the Vertex AI API is enabled");

// --- 3. embedding model + dimension ------------------------------------------
console.log("\n[embedding models]");
let liveEmbedModel = null;
for (const model of EMBED_MODELS) {
  try {
    const native = await ai.models.embedContent({ model, contents: "claims processing backlog" });
    const nLen = native.embeddings[0].values.length;

    const pinned = await ai.models.embedContent({
      model,
      contents: "claims processing backlog",
      config: { outputDimensionality: WANT_DIMS },
    });
    const pLen = pinned.embeddings[0].values.length;

    if (pLen === WANT_DIMS) {
      ok(`${model}: native ${nLen}d, pinned to ${pLen}d via outputDimensionality`);
      liveEmbedModel ??= model;
    } else {
      bad(`${model}: asked for ${WANT_DIMS}d, got ${pLen}d — the index would not match`);
    }
  } catch (e) {
    console.log(`  ----  ${model}: ${firstLine(e)}`);
  }
}
if (!liveEmbedModel) bad("no embedding model responded");

console.log(`
--- put these in .env ---
GCP_PROJECT_ID=${PROJECT}
GCP_LOCATION=${LOCATION}
GEMINI_TEXT_MODEL=${liveTextModel ?? "<none responded>"}
GEMINI_EMBEDDING_MODEL=${liveEmbedModel ?? "<none responded>"}
EMBEDDING_DIMENSIONS=${WANT_DIMS}
`);
process.exit(failed ? 1 : 0);

function firstLine(e) {
  return String(e?.message ?? e).split("\n")[0].slice(0, 160);
}
