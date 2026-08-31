/**
 * The stage machine (ARCHITECTURE.md §6, ADR-02). Code decides which agent runs, not an LLM.
 *
 * This module is pure: it takes a session and a message and returns the reply plus the next
 * state. It never touches Firestore or HTTP. The caller persists `messages` and `state` in
 * ONE write, which is what makes "the stage advances only after the payload is persisted"
 * structurally true rather than a thing to remember (§5.3).
 *
 * An agent failure is caught here and returned as an ordinary reply with the state
 * UNCHANGED, so a bad turn is always replayable.
 */

// Type-only: erased at runtime, so this module never loads the agents' `?raw` prompt files.
import type * as analyst from "../agents/analyst.ts";
import type * as architect from "../agents/architect.ts";
import type * as changeCoach from "../agents/changeCoach.ts";
import type * as discovery from "../agents/discovery.ts";
import type * as projectManager from "../agents/projectManager.ts";
import type * as reviser from "../agents/reviser.ts";
import type * as sourcing from "../agents/sourcing.ts";
import type { retrieve } from "../services/rag.ts";
import { AGENT_NAMES } from "../agents/names.ts";
import { event } from "../services/telemetry.ts";
import type { AgentName, AgentState, ChatMessage, SessionDocument, Stage } from "../types.ts";

export interface StageDeps {
  discovery: typeof discovery.run;
  analyst: typeof analyst.run;
  architect: typeof architect.run;
  projectManager: typeof projectManager.run;
  changeCoach: typeof changeCoach.run;
  reviser: typeof reviser.run;
  sourcing: typeof sourcing.run;
  retrieve: typeof retrieve;
}

/** Loaded lazily so the machine itself stays free of prompt assets and the Google SDKs. */
export const defaultDeps: StageDeps = {
  discovery: (i) => import("../agents/discovery").then((m) => m.run(i)),
  analyst: (i) => import("../agents/analyst").then((m) => m.run(i)),
  architect: (i) => import("../agents/architect").then((m) => m.run(i)),
  projectManager: (i) => import("../agents/projectManager").then((m) => m.run(i)),
  changeCoach: (i) => import("../agents/changeCoach").then((m) => m.run(i)),
  reviser: (i) => import("../agents/reviser").then((m) => m.run(i)),
  sourcing: (i) => import("../agents/sourcing").then((m) => m.run(i)),
  retrieve: (...args) => import("../services/rag").then((m) => m.retrieve(...args)),
};

export interface TurnResult {
  /**
   * Usually one. A follow-up that reruns stages produces one per specialist that re-engages,
   * and collapsing those into a single message would throw away the handoff badges at the
   * exact moment the product is showing off.
   */
  replies: ChatMessage[];
  state: AgentState;
  /**
   * Durable observations about the client, for the NEXT consultation. Only the Reviser produces
   * these, so only a post-completion turn ever carries any. The caller persists them against
   * the user, not the session - this machine stays pure and writes nothing.
   */
  remember?: string[];
}

function agentMessage(agentName: AgentName, text: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    sender: "agent",
    agentName,
    text,
    timestamp: new Date().toISOString(),
  };
}

/** One stage, one agent, one reply. The `complete` stage is handled by followUp() instead. */
async function runStage(
  session: SessionDocument,
  userMessage: string,
  deps: StageDeps,
): Promise<{ reply: ChatMessage; state: AgentState }> {
  const { state, userProfile } = session;

  try {
    switch (state.currentStage) {
      // ---------------------------------------------------------------- discovery
      case "discovery": {
        const result = await deps.discovery({
          profile: userProfile,
          messages: session.messages,
          latest: userMessage,
          memory: session.memoryBlock,
        });

        if (result.status === "asking") {
          // Still interviewing. The stage does not move.
          return { reply: agentMessage(AGENT_NAMES.discovery, result.question), state };
        }

        return {
          reply: agentMessage(
            AGENT_NAMES.discovery,
            `Thank you. Your core bottleneck is "${result.needsAssessment.identifiedBottleneck}". ` +
              "Handing off to our Industry Analyst to find matching case studies.",
          ),
          state: { ...state, needsAssessment: result.needsAssessment, currentStage: "research" },
        };
      }

      // ----------------------------------------------------------------- research
      case "research": {
        const bottleneck = state.needsAssessment.identifiedBottleneck ?? userMessage;
        const retrieval = await deps.retrieve(bottleneck, userProfile.industry);
        const useCases = await deps.analyst({
          industry: userProfile.industry,
          role: userProfile.role,
          bottleneck,
          retrieval,
          declined: state.declined,
        });

        // Where the evidence came from changes what we are allowed to claim about it.
        const caveat = {
          knowledge_base: `, grounded in ${retrieval.documents.length} ${userProfile.industry} case studies from our knowledge base`,
          web: `, grounded in ${retrieval.sources.length} sources I found on the web - they are cited on the Canvas`,
          none:
            ". Note: our knowledge base and a web search both returned no matches, so these are " +
            "reasoned from your bottleneck rather than from retrieved case studies",
        }[retrieval.source];

        return {
          reply: agentMessage(
            AGENT_NAMES.analyst,
            `I have put ${useCases.length} use cases on your Strategy Canvas${caveat}. ` +
              "Approve the ones worth pursuing and I will build the architecture around those.",
          ),
          state: {
            ...state,
            useCases,
            ungrounded: !retrieval.grounded,
            sources: retrieval.sources,
            currentStage: "architecture",
          },
        };
      }

      // ------------------------------------------------------------- architecture
      case "architecture": {
        // The approval gate. PRD Epic 2 requires it; the reference orchestrator skips it.
        const approved = approvedOf(state);
        if (approved.length === 0) {
          // The gate holding is normal, but a session that never leaves it is the deadlock the
          // missing Canvas caused. Countable, so it can be seen without reading transcripts.
          event("stage.blocked", { stage: "architecture", reason: "no approved use cases" });
          return {
            reply: agentMessage(
              AGENT_NAMES.architect,
              "Before I recommend a stack, approve at least one use case on the Strategy " +
                "Canvas. I will design around the ones you pick.",
            ),
            state, // unchanged - this is the gate
          };
        }

        const stack = await deps.architect({
          role: userProfile.role,
          approvedUseCases: approved,
          region: userProfile.region,
          memory: session.memoryBlock,
          declined: state.declined,
        });
        return {
          reply: agentMessage(
            AGENT_NAMES.architect,
            "Your stack is on the Canvas, along with the compliance risk I would watch. " +
              "Passing it to our Project Manager to phase the rollout.",
          ),
          state: { ...state, architectureStack: stack, currentStage: "roadmap" },
        };
      }

      // ------------------------------------------------------------------ roadmap
      case "roadmap": {
        const phases = await deps.projectManager({
          approvedUseCases: approvedOf(state),
          stack: requireStack(state),
        });
        return {
          reply: agentMessage(
            AGENT_NAMES.projectManager,
            `Your ${phases.length}-phase roadmap is ready. Handing off to our Change Coach ` +
              "for the people side.",
          ),
          state: { ...state, roadmapPhases: phases, currentStage: "training" },
        };
      }

      // ----------------------------------------------------------------- training
      case "training": {
        const plan = await deps.changeCoach({
          approvedUseCases: approvedOf(state),
          stack: requireStack(state),
        });
        return {
          reply: agentMessage(
            AGENT_NAMES.changeCoach,
            "Your change-management plan is ready. Handing off to our Sourcing Lead to find " +
              "partners who have delivered this before.",
          ),
          state: { ...state, changeManagementPlan: plan, currentStage: "sourcing" },
        };
      }

      // ----------------------------------------------------------------- sourcing
      case "sourcing": {
        const { reply, sourcing: result } = await deps.sourcing({
          profile: userProfile,
          approvedUseCases: approvedOf(state),
          stack: requireStack(state),
          roadmapPhases: state.roadmapPhases ?? [],
        });

        // An ungrounded shortlist is empty, not invented, and the user is told which happened.
        event("sourcing", {
          documents: result.partners.length,
          ok: result.grounded,
          source: result.grounded ? "web" : "none",
        });

        return {
          reply: agentMessage(AGENT_NAMES.sourcing, reply),
          state: { ...state, sourcing: result, currentStage: "complete" },
        };
      }

      // `complete` never reaches here - runTurn routes it to followUp(). This is the guard for
      // a session that somehow holds a stage this machine does not know.
      default:
        return {
          reply: agentMessage(
            AGENT_NAMES.changeCoach,
            "Your strategy is complete. Ask me anything about it, or tell me what to change.",
          ),
          state,
        };
    }
  } catch (err) {
    // Never advance on a failed turn. The session stays exactly where it was.
    event("agent.failed", {
      severity: "ERROR",
      stage: state.currentStage,
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    return {
      reply: agentMessage(
        agentForStage(state.currentStage),
        "That step did not complete - please send that again.",
      ),
      state,
    };
  }
}

/**
 * One turn, which is as many stages as can run without asking the user anything else.
 *
 * The consultation used to advance exactly one stage per message, so a user who had finished
 * the interview still had to type "ok, continue" to get research, again for architecture, again
 * for the roadmap. Those messages carried no information - the agent already had everything it
 * needed and was waiting to be told to proceed.
 *
 * Now it proceeds. The loop stops where a human is genuinely required, and that stop is not a
 * special case: the approval gate returns its stage unchanged, so `advance()` exits on the
 * condition it already had. `complete` is a conversation rather than a stage and keeps its own
 * path.
 */
export async function runTurn(
  session: SessionDocument,
  userMessage: string,
  deps: StageDeps = defaultDeps,
): Promise<TurnResult> {
  if (session.state.currentStage === "complete") return followUp(session, userMessage, deps);

  return advance(session, session.state, userMessage, deps, []);
}

const ORDER: Stage[] = [
  "discovery",
  "research",
  "architecture",
  "roadmap",
  "training",
  "sourcing",
  "complete",
];

/**
 * Rewinding to a stage clears everything produced at or after it.
 *
 * This is what makes an inconsistent strategy impossible rather than something to remember: a
 * roadmap built on a stack that no longer exists cannot survive, because rewinding past the
 * stack deletes the roadmap too. Written out rather than derived from a table - four lines that
 * are obviously right beat a generic mechanism that needs checking.
 */
export function rewind(state: AgentState, from: Stage): AgentState {
  const clears = (stage: Stage) => ORDER.indexOf(stage) >= ORDER.indexOf(from);
  const next: AgentState = { ...state, currentStage: from };

  if (clears("research")) {
    next.useCases = [];
    delete next.sources;
    delete next.ungrounded;
  }
  if (clears("architecture")) delete next.architectureStack;
  if (clears("roadmap")) delete next.roadmapPhases;
  if (clears("training")) delete next.changeManagementPlan;
  if (clears("sourcing")) delete next.sourcing;

  return next;
}

const MAX_REPLAY_STAGES = 5;

/**
 * Runs stages forward until the consultation needs a human again.
 *
 * One loop, two callers: the forward path after a user message, and `followUp()` replaying
 * after a rewind. It stops when nothing advanced - which is the approval gate doing its job,
 * because a blocked stage returns its state unchanged and a failed agent does the same. So the
 * gate needs no special handling here and neither does failure.
 *
 * `MAX_REPLAY_STAGES` is the rail: five is more than the pipeline has, so hitting it means a
 * stage advanced into a cycle, and stopping beats spending money on one.
 */
async function advance(
  session: SessionDocument,
  start: AgentState,
  userMessage: string,
  deps: StageDeps,
  replies: ChatMessage[],
): Promise<TurnResult> {
  let state = start;

  for (let i = 0; i < MAX_REPLAY_STAGES && state.currentStage !== "complete"; i++) {
    const before = state.currentStage;
    const step = await runStage({ ...session, state }, userMessage, deps);
    replies.push(step.reply);
    state = step.state;
    if (state.currentStage === before) break;
  }

  return { replies, state };
}

/** Which specialist owns the section a revision touched. */
function agentForPatch(patch: Partial<AgentState>): AgentName {
  if (patch.architectureStack) return AGENT_NAMES.architect;
  if (patch.roadmapPhases) return AGENT_NAMES.projectManager;
  if (patch.changeManagementPlan) return AGENT_NAMES.changeCoach;
  return AGENT_NAMES.analyst;
}

/** Keeps the client's approvals across a use-case revision, matched by id. */
function carryStatus(previous: AgentState["useCases"], revised: AgentState["useCases"]) {
  const was = new Map(previous.map((uc) => [uc.id, uc.status]));
  return revised.map((uc) => ({ ...uc, status: was.get(uc.id) ?? uc.status }));
}

/** The `complete` stage: a question, an edit, or a rebuild. */
async function followUp(
  session: SessionDocument,
  question: string,
  deps: StageDeps,
): Promise<TurnResult> {
  const { state, userProfile } = session;

  try {
    const decision = await deps.reviser({
      profile: userProfile,
      state,
      messages: session.messages,
      question,
    });

    // Anything worth carrying to the NEXT consultation, attached to whichever shape this turn
    // takes. A question teaches as often as an edit does - "why is this in dollars, we budget
    // in KES" is a durable fact about the client and arrives as an `answer`.
    const kept = decision.remember?.length ? { remember: decision.remember } : {};
    if (decision.remember?.length) event("memory.note", { notes: decision.remember.length });

    if (decision.action === "answer") {
      return { replies: [agentMessage(AGENT_NAMES.changeCoach, decision.reply)], state, ...kept };
    }

    if (decision.action === "revise") {
      const revised: AgentState = { ...state, ...decision.patch };

      // Changing the use cases invalidates the stack, the roadmap and the people plan, all of
      // which were built around the old set - so this edit is applied and then replayed, never
      // left to sit next to work that assumed something else.
      if (decision.patch.useCases) {
        revised.useCases = carryStatus(state.useCases, decision.patch.useCases);
        event("stage.rewind", { from: "complete", to: "architecture", reason: "use cases revised" });
        const replayed = await advance(session, rewind(revised, "architecture"), question, deps, [
          agentMessage(AGENT_NAMES.analyst, decision.reply),
        ]);
        return { ...replayed, ...kept };
      }

      // Attributed to whoever owns that section, not to whoever happened to take the message -
      // the named specialist is the product, and a roadmap edit signed by the Change Coach is a
      // small lie the demo does not need.
      return {
        replies: [agentMessage(agentForPatch(decision.patch), decision.reply)],
        state: revised,
        ...kept,
      };
    }

    event("stage.rewind", { from: "complete", to: decision.from, reason: "follow-up" });
    const replayed = await advance(session, rewind(state, decision.from), question, deps, [
      agentMessage(agentForStage(decision.from), decision.reply),
    ]);
    return { ...replayed, ...kept };
  } catch (err) {
    // Same rule as a stage: a failed turn changes nothing and stays replayable.
    event("agent.failed", {
      severity: "ERROR",
      stage: "complete",
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    return {
      replies: [
        agentMessage(AGENT_NAMES.changeCoach, "That did not complete - please send that again."),
      ],
      state,
    };
  }
}

const approvedOf = (state: AgentState) => state.useCases.filter((uc) => uc.status === "approved");

function requireStack(state: AgentState) {
  if (!state.architectureStack) throw new Error("architectureStack missing at this stage");
  return state.architectureStack;
}

/** Exported so the route can label a turn's telemetry without duplicating the mapping. */
export function agentForStage(stage: Stage): AgentName {
  switch (stage) {
    case "discovery":
      return AGENT_NAMES.discovery;
    case "research":
      return AGENT_NAMES.analyst;
    case "architecture":
      return AGENT_NAMES.architect;
    case "roadmap":
      return AGENT_NAMES.projectManager;
    case "sourcing":
      return AGENT_NAMES.sourcing;
    default:
      return AGENT_NAMES.changeCoach;
  }
}
