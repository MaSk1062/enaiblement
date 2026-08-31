/**
 * What the product remembers about a client between consultations.
 *
 * Until now there was no "between": `users/{uid}.activeSessionId` is a single field and the
 * dashboard sends you to onboarding only when it is absent, so a user with a session was in
 * that session permanently. A second consultation, had one been reachable, would have opened
 * with the identical cold greeting - the agent starting over, which is the one thing this
 * product is not supposed to do.
 *
 * Memory lives on `users/{uid}.memory`, a document `getUser()` already reads on every dashboard
 * boot, so recall costs no extra read.
 *
 * Everything here is pure. Writing is `services/firestore.ts`'s job.
 *
 * ponytail: no embeddings, no `memories` collection, no retrieval step. A client has a handful
 * of consultations and all of this fits in a prompt. The ceiling is Firestore's 1 MiB document
 * - at ~100 bytes a note, thousands of engagements away. Add retrieval when the block stops
 * fitting, not before.
 */

import type {
  ClientMemory,
  ConsultationMemory,
  SessionDocument,
  SessionUserProfile,
} from "../types.ts";

/** How much of the memory reaches a prompt. The rest stays stored but unread. */
export const RECALLED_CONSULTATIONS = 3;
export const RECALLED_NOTES = 12;

/** How much is kept at all, so `users/{uid}` stays a small document. */
export const STORED_CONSULTATIONS = 10;

/**
 * A finished consultation, compressed to what is worth carrying forward.
 *
 * Returns null for anything that did not reach `complete`. An interview someone abandoned
 * halfway is not a memory, and recalling one would have the agent open by referring to work
 * that does not exist.
 */
export function summarise(session: SessionDocument): ConsultationMemory | null {
  if (session.state.currentStage !== "complete") return null;

  const { state } = session;

  return {
    sessionId: session.sessionId,
    // Now, not the session's own timestamp: this is the moment it stopped being current.
    completedAt: new Date().toISOString(),
    industry: session.userProfile.industry,
    bottleneck: state.needsAssessment.identifiedBottleneck ?? "not recorded",
    approved: state.useCases.filter((uc) => uc.status === "approved").map((uc) => uc.title),
    // `declined` rather than a filter over `useCases`, because a rerun rebuilds that array and
    // the refusals that shaped the final strategy would not be in it.
    rejected: state.declined ?? [],
  };
}

const declinedLine = (d: { title: string; reason?: string }) =>
  d.reason ? `${d.title} (${d.reason})` : d.title;

/**
 * What an agent is told about this client before it says anything. Prose, not JSON - it is
 * read by a model, and a bulleted briefing is what a colleague would hand over.
 *
 * Empty string when there is nothing to say, which is the common case and has to stay
 * invisible: a first-time user must not be able to tell this feature exists.
 */
export function memoryBlock(memory?: ClientMemory): string {
  const consultations = (memory?.consultations ?? []).slice(0, RECALLED_CONSULTATIONS);
  const notes = (memory?.notes ?? []).slice(-RECALLED_NOTES);
  if (!consultations.length && !notes.length) return "";

  const lines = ["WHAT YOU ALREADY KNOW ABOUT THIS CLIENT, from previous engagements:"];

  for (const c of consultations) {
    lines.push(
      `- ${c.completedAt.slice(0, 10)}, ${c.industry}: "${c.bottleneck}". ` +
        `They took forward ${c.approved.join("; ") || "nothing"}.` +
        (c.rejected.length ? ` They turned down ${c.rejected.map(declinedLine).join("; ")}.` : ""),
    );
  }

  if (notes.length) {
    lines.push("", "How this client works. Honour these without being asked again:");
    for (const n of notes) lines.push(`- ${n}`);
  }

  lines.push(
    "",
    "Use this so you do not re-ask what you already know, and so your recommendations match " +
      "how they think. Never recite it back to them as a list.",
  );

  return lines.join("\n");
}

/**
 * The opening message.
 *
 * With no memory this is the cold greeting, byte for byte what shipped before any of this
 * existed. With memory it names the last engagement and asks whether this one continues it -
 * which is the whole "it did not start over" claim, in one sentence of UI.
 */
export function greeting(profile: SessionUserProfile, memory?: ClientMemory): string {
  const last = memory?.consultations?.[0];

  if (!last) {
    return (
      `Welcome, ${profile.name}. I'm your Discovery Consultant. As a ${profile.role} in ` +
      `${profile.industry}, what's the business bottleneck you're most hoping AI can solve?`
    );
  }

  return (
    `Welcome back, ${profile.name}. Last time we scoped "${last.bottleneck}"` +
    (last.approved.length ? `, and you took forward ${last.approved.join(" and ")}` : "") +
    ". Is this a continuation of that, or something new?"
  );
}

/** Folds a finished consultation into what is already remembered. Newest first, capped. */
export function remember(
  memory: ClientMemory | undefined,
  finished: ConsultationMemory | null,
): ClientMemory {
  const consultations = memory?.consultations ?? [];
  return {
    consultations: finished
      ? [finished, ...consultations].slice(0, STORED_CONSULTATIONS)
      : consultations,
    notes: memory?.notes ?? [],
  };
}
