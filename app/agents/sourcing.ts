/**
 * The Sourcing Lead — the one agent that answers "so who actually builds this?"
 *
 * Two model calls, for the reason `rag.ts` already documents: search grounding and
 * `responseMimeType: "application/json"` are mutually exclusive on Vertex. So the first call
 * searches and comes back with prose plus real citations, and the second turns those findings
 * into the structured shortlist. The agent never gets to name a firm from memory, because the
 * only firms it is shown are the ones the search returned.
 *
 * `grounded: false` is a first-class outcome here, not an error. Zero citable partners means an
 * empty list and a reply that says so — the same discipline `rag.ts` applies to case studies,
 * for a much sharper reason: a fabricated consultancy on screen ends the engagement.
 */

import template from "./prompts/sourcing.md?raw";
import { fillPrompt } from "./prompt.ts";
import { AGENT_NAMES } from "./names.ts";
import { generateStructured, searchGrounded } from "../services/gemini.ts";
import { SourcingOutput } from "../services/schemas.ts";
import { REGION_CONTEXT } from "../types.ts";
import type { ArchitectureStack, RoadmapPhase, Sourcing, UseCase } from "../types.ts";
import type { Region, SessionUserProfile } from "../types.ts";

export const AGENT_NAME = AGENT_NAMES.sourcing;

export interface SourcingInput {
  profile: SessionUserProfile;
  approvedUseCases: UseCase[];
  stack: ArchitectureStack;
  roadmapPhases: RoadmapPhase[];
}

const SEARCH_INSTRUCTION = [
  "You are a research assistant finding technology implementation partners.",
  "",
  "ALWAYS run a Google Search before answering. Never answer from memory: every firm you name",
  "must come from a page you retrieved in this turn, and you must say what that page says they",
  "delivered — not what they advertise. If the results contain no such firm, reply with exactly:",
  "NONE",
  "",
  "For each firm give the name, the country, the delivered work, and nothing else. No preamble.",
].join("\n");

function searchQuery(profile: SessionUserProfile, useCases: UseCase[], stack: ArchitectureStack) {
  const where = profile.region ? `in ${profile.region}` : "";
  const what = useCases.map((uc) => uc.title).join(" and ");

  return (
    `Search the web for technology consultancies or systems integrators ${where} that have ` +
    `delivered AI projects for ${profile.industry} organisations, specifically work like: ` +
    `${what}. Prefer firms with published case studies. Relevant stack: ` +
    `${stack.models.concat(stack.infrastructure).join(", ")}.`
  );
}

export async function run(input: SourcingInput): Promise<{ reply: string; sourcing: Sourcing }> {
  const { profile } = input;
  const currency = profile.region ? REGION_CONTEXT[profile.region].currency : "USD";

  // Never throws the turn away on a search failure: no findings is a legitimate answer, and the
  // structured call below is told to return an empty list when that happens.
  const found = await searchGrounded(searchQuery(profile, input.approvedUseCases, input.stack), SEARCH_INSTRUCTION).catch(
    () => ({ text: "", sources: [] as { title: string; url: string }[] }),
  );

  const grounded = found.sources.length > 0 && !/^NONE$/m.test(found.text) && found.text.trim() !== "";

  const findings = grounded
    ? `SEARCH FINDINGS:\n${found.text.trim()}\n\nSOURCES:\n${found.sources
        .map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`)
        .join("\n")}`
    : [
        "SEARCH FINDINGS: none.",
        "The search returned no citable implementation partners. Return an EMPTY partners list",
        "and say so plainly in your reply — do not name a firm from memory. Still produce the",
        "proposal, since it derives from the approved roadmap rather than from any partner.",
      ].join("\n");

  const payload = `Client: ${JSON.stringify(profile)}
Region: ${profile.region ?? "unspecified"}
Quote the budget in: ${currency}

Approved use cases: ${JSON.stringify(input.approvedUseCases, null, 2)}
Architecture: ${JSON.stringify(input.stack, null, 2)}
Roadmap: ${JSON.stringify(input.roadmapPhases, null, 2)}

${findings}`;

  const result = await generateStructured(fillPrompt(template), payload, SourcingOutput);

  // Belt and braces: if the search found nothing, no partner survives regardless of what the
  // model returned. The prompt says it, the schema requires a URL, and this enforces it.
  const partners = grounded ? result.partners : [];

  return {
    reply: result.reply,
    sourcing: { partners, proposal: result.proposal, grounded: grounded && partners.length > 0 },
  };
}
