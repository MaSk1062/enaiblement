/**
 * Which retriever answered, and what we are then allowed to claim about the result.
 *
 * The order is the invariant: the curated corpus always wins, the open web is the fallback,
 * and "nothing" must stay visibly "nothing" rather than quietly becoming a grounded turn.
 * No network, no Firestore — the retrievers are injected.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { retrieve, toContextBlock, type Retrieved, type Retrievers } from "./rag.ts";

const curated: Retrieved = {
  id: "kb-1",
  title: "Claims triage at a regional insurer",
  content: "Cut cycle time from 21 days to 6.",
  sourceUrl: "https://example.com/case-study",
};

const never = (name: string) => () => {
  throw new Error(`${name} should not have been called`);
};

const deps = (over: Partial<Retrievers>): Retrievers => ({
  knowledgeBase: never("knowledgeBase") as Retrievers["knowledgeBase"],
  web: never("web") as Retrievers["web"],
  ...over,
});

test("the curated corpus wins, and the web is never called", async () => {
  const result = await retrieve(
    "manual claims triage",
    "Healthcare",
    3,
    deps({ knowledgeBase: async () => [curated] }),
  );

  assert.equal(result.source, "knowledge_base");
  assert.equal(result.grounded, true);
  assert.deepEqual(result.documents, [curated]);
  assert.deepEqual(result.sources, [{ title: curated.title, url: curated.sourceUrl! }]);
});

test("an empty knowledge base falls through to the web, and the block says so", async () => {
  const webSources = [{ title: "How Acme cut triage time", url: "https://news.example/acme" }];

  const result = await retrieve(
    "manual claims triage",
    "Healthcare",
    3,
    deps({
      knowledgeBase: async () => [],
      web: async () => ({
        documents: [{ id: "web-search", title: "Web research", content: "Acme cut it by 40%." }],
        sources: webSources,
      }),
    }),
  );

  assert.equal(result.source, "web");
  assert.equal(result.grounded, true);
  assert.deepEqual(result.sources, webSources);
  assert.match(
    toContextBlock(result),
    /web search/i,
    "the prompt must know these are web results, not curated case studies",
  );
});

test("a throwing retriever falls through instead of ending the turn", async () => {
  const result = await retrieve(
    "manual claims triage",
    "Healthcare",
    3,
    deps({
      knowledgeBase: async () => {
        throw new Error("index still building");
      },
      web: async () => ({
        documents: [{ id: "web-search", title: "Web research", content: "Found something." }],
        sources: [{ title: "A source", url: "https://example.com" }],
      }),
    }),
  );

  assert.equal(result.source, "web");
});

test("nothing retrieved stays nothing, and the prompt is told not to invent", async () => {
  const result = await retrieve(
    "manual claims triage",
    "Healthcare",
    3,
    deps({ knowledgeBase: async () => [], web: async () => ({ documents: [], sources: [] }) }),
  );

  assert.equal(result.source, "none");
  assert.equal(result.grounded, false);
  assert.deepEqual(result.sources, []);
  assert.match(toContextBlock(result), /do not invent company names/i);
});
