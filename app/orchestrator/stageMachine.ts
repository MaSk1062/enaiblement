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
  retrieve: typeof retrieve;
}

/** Loaded lazily so the machine itself stays free of prompt assets and the Google SDKs. */
export const defaultDeps: StageDeps = {
  discovery: (i) => import("../agents/discovery").then((m) => m.run(i)),
  analyst: (i) => import("../agents/analyst").then((m) => m.run(i)),
  architect: (i) => import("../agents/architect").then((m) => m.run(i)),
  projectManager: (i) => import("../agents/projectManager").then((m) => m.run(i)),
  changeCoach: (i) => import("../agents/changeCoach").then((m) => m.run(i)),
  retrieve: (...args) => import("../services/rag").then((m) => m.retrieve(...args)),
};

export interface TurnResult {
  reply: ChatMessage;
  state: AgentState;
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

export async function runTurn(
  session: SessionDocument,
  userMessage: string,
  deps: StageDeps = defaultDeps,
): Promise<TurnResult> {
  const { state, userProfile } = session;

  try {
    switch (state.currentStage) {
      // ---------------------------------------------------------------- discovery
      case "discovery": {
        const result = await deps.discovery({
          profile: userProfile,
          messages: session.messages,
          latest: userMessage,
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
        });

        // Where the evidence came from changes what we are allowed to claim about it.
        const caveat = {
          knowledge_base: `, grounded in ${retrieval.documents.length} ${userProfile.industry} case studies from our knowledge base`,
          web: `, grounded in ${retrieval.sources.length} sources I found on the web — they are cited on the Canvas`,
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
            state, // unchanged — this is the gate
          };
        }

        const stack = await deps.architect({ role: userProfile.role, approvedUseCases: approved });
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
            "Your change-management plan is ready. Your AI enablement strategy is complete " +
              "— you can review and export it from the dashboard.",
          ),
          state: { ...state, changeManagementPlan: plan, currentStage: "complete" },
        };
      }

      // ----------------------------------------------------------------- complete
      default:
        return {
          reply: agentMessage(
            AGENT_NAMES.changeCoach,
            "Your strategy is complete. Export it from the dashboard, or ask me anything " +
              "about the implementation details.",
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
        "That step did not complete — please send that again.",
      ),
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
    default:
      return AGENT_NAMES.changeCoach;
  }
}
