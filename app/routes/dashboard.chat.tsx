/**
 * The consultation. One route, and this is the only place the strategy is read or revised —
 * /dashboard/canvas is a separate, chat-free destination for export only (UI-4).
 *
 * Three shapes, not two. Before the gate, this is a conversation and the Canvas appears in it
 * only at the one moment the user has to act — inline under the Analyst's handoff. Once at
 * least one use case is approved, the pipeline is building against a real decision, so the
 * Canvas moves beside the chat and fills in live as each specialist hands off (UI-2). Once
 * `currentStage` is "complete", that same two-pane layout is the artefact plus a rail for
 * interrogating and revising it. All three shapes give each pane its own scroll container,
 * which is why the dashboard shell is a fixed height.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { agentStatus } from "../lib/agentStatus.ts";
import { CanvasPanel, UseCaseDecisions } from "../lib/CanvasPanel.tsx";
import { useConsultation } from "../lib/consultation.ts";
import { formatElapsed } from "../lib/pipelineView.ts";
import type { AgentName, ChatMessage, Stage } from "../types.ts";

/** Where a specialist's work lands on the Canvas — for the deep link on their name (UI-4). */
const AGENT_SECTION: Partial<Record<AgentName, string>> = {
  "Discovery Consultant": "section-bottleneck",
  "Industry Analyst": "section-use-cases",
  "Technical Architect": "section-stack",
  "Project Manager": "section-roadmap",
  "Change Coach": "section-people",
};

export function meta() {
  return [{ title: "Consultation · enaible" }];
}

export default function Chat() {
  const { state } = useConsultation();
  const done = state.currentStage === "complete";
  // The gate is the moment there is an artefact worth looking at: once something is approved,
  // the Architect (and whoever runs after) is building against it, so the Canvas earns the
  // page instead of waiting for the whole pipeline to finish (UI-2 — the build-out shape).
  const buildingOut = state.useCases.some((uc) => uc.status === "approved");

  if (!done && !buildingOut) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-6">
        <Conversation inline={<Decisions />} />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden lg:flex-row print:block print:overflow-visible">
      <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-10 print:overflow-visible print:p-0">
        <div className="mx-auto max-w-3xl">
          {done && (
            <div className="mb-6 flex items-center justify-between print:hidden">
              <p className="text-sm text-slate-500">Your finished AI enablement strategy.</p>
              {/* The one download button lives on /dashboard/canvas (UI-4) — this page is for
                  reading and revising it, not a second place the export action can drift from. */}
              <Link
                to="/dashboard/canvas"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
              >
                Export as PDF →
              </Link>
            </div>
          )}
          <CanvasPanel />
        </div>
      </div>

      <aside className="flex shrink-0 flex-col overflow-hidden border-slate-200 lg:w-96 lg:border-l print:hidden">
        <p className="border-y border-slate-200 bg-white px-5 py-2.5 text-xs text-slate-500 lg:border-t-0">
          {done
            ? "Ask about the strategy, or tell me what to change."
            : "Watch your specialists build out the rest of the strategy on the left."}
        </p>
        <Conversation compact inline={<Decisions />} />
      </aside>
    </main>
  );
}

/**
 * The one moment the user has to act, inline under the handoff that created it.
 *
 * Some stages need a real answer (`discovery`) or a real decision (`architecture`, before
 * anything is approved). The rest — `research`, `architecture` once approved, `roadmap`,
 * `training` — only need *a* message to run the next specialist; the content is thrown away
 * (`stageMachine.ts` never reads it there). Those get a CTA instead of leaving the composer's
 * placeholder as the only way to discover that.
 */
function Decisions() {
  const { state } = useConsultation();
  if (state.currentStage === "architecture" && state.useCases.length > 0) {
    return <UseCaseDecisions />;
  }
  return <StageContinue />;
}

const CONTINUE: Partial<Record<Stage, { label: string; message: string }>> = {
  research: {
    label: "Find matching use cases →",
    message: "Go ahead and find matching use cases.",
  },
  roadmap: {
    label: "Plan the rollout →",
    message: "Go ahead and plan the rollout.",
  },
  training: {
    label: "Plan the people side →",
    message: "Go ahead and plan the people side.",
  },
};

function StageContinue() {
  const { state, sending, send } = useConsultation();
  const cta = CONTINUE[state.currentStage];
  if (!cta) return null;

  return (
    <div className="flex justify-start">
      <button
        type="button"
        disabled={sending}
        onClick={() => send(cta.message)}
        className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
      >
        {cta.label}
      </button>
    </div>
  );
}

/** Milliseconds since `active` last became true — resets to 0 the moment it goes false. */
function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startedAt.current = null;
      setElapsed(0);
      return;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current!), 1_000);
    return () => clearInterval(id);
  }, [active]);

  return elapsed;
}

function Conversation({ inline, compact }: { inline?: React.ReactNode; compact?: boolean }) {
  const { messages, state, sending, error, send } = useConsultation();
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const elapsedMs = useElapsed(sending);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  const status = agentStatus(state.currentStage);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    await send(text);
  }

  return (
    <>
      <div className={`flex-1 space-y-5 overflow-y-auto ${compact ? "px-5 py-5" : "py-8"}`}>
        {messages.map((message) => (
          <Bubble key={message.id} message={message} compact={compact} />
        ))}

        {inline}

        {sending && (
          // aria-live covers who's working and on what, so a screen reader hears it once (and
          // again on a real stage change) — the ticking clock inside is aria-hidden on purpose,
          // or "polite" would re-announce the whole line every second.
          <div aria-live="polite" className="flex items-center gap-2.5 text-sm text-slate-500">
            <Dots />
            <span>
              <span className="font-medium text-slate-700">{status.name}</span> {status.working}…
              {elapsedMs >= 5_000 && <span aria-hidden> ({formatElapsed(elapsedMs)})</span>}
            </span>
          </div>
        )}

        <div ref={bottom} />
      </div>

      {error && (
        <p
          className={`rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 ${
            compact ? "mx-5 mb-3" : "mb-3"
          }`}
        >
          {error}
        </p>
      )}

      {/* A flex sibling, not sticky: the pane owns the scroll now, so the composer just sits at
          the bottom of it. */}
      <form onSubmit={onSubmit} className={compact ? "px-5 pb-5" : "pt-2 pb-6"}>
        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-slate-900">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSubmit(e);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={
              state.currentStage === "complete"
                ? "Ask a question, or say what to change…"
                : `Reply to your ${status.name}…`
            }
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-30"
          >
            Send
          </button>
        </div>
        {!compact && <p className="mt-2 px-1 text-xs text-slate-400">{status.blurb}</p>}
      </form>
    </>
  );
}

function Bubble({ message, compact }: { message: ChatMessage; compact?: boolean }) {
  if (message.sender === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white">
          {message.text}
        </p>
      </div>
    );
  }

  // Only the rail sits next to a visible Canvas — the single-pane, pre-gate conversation has
  // nothing on the page yet for the name to point at.
  const sectionId = compact && message.agentName ? AGENT_SECTION[message.agentName] : undefined;

  return (
    <div className={compact ? "" : "max-w-[85%]"}>
      {message.agentName &&
        (sectionId ? (
          <button
            type="button"
            onClick={() =>
              document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="mb-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase underline decoration-slate-300 underline-offset-2 transition hover:text-slate-900"
          >
            {message.agentName}
          </button>
        ) : (
          <p className="mb-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase">
            {message.agentName}
          </p>
        ))}
      <p className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
        {message.text}
      </p>
    </div>
  );
}

function Dots() {
  return (
    <span className="flex gap-1" aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
