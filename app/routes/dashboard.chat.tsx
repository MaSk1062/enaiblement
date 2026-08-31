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
import { CAPABILITIES, capability, planDeepDive } from "../capabilities.ts";
import { Link } from "react-router";
import { agentPersona, agentStatus } from "../lib/agentStatus.ts";
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
  "Sourcing Lead": "section-partners",
};

export function meta() {
  return [{ title: "Consultation · Enaible" }];
}

export default function Chat() {
  const { state } = useConsultation();
  const done = state.currentStage === "complete";
  // The gate is the moment there is an artefact worth looking at: once something is approved,
  // the Architect (and whoever runs after) is building against it, so the Canvas earns the
  // page instead of waiting for the whole pipeline to finish (UI-2 — the build-out shape).
  const buildingOut = state.useCases.some((uc) => uc.status === "approved");
  const showCanvas = done || buildingOut;

  // The page just changed shape under the user — a mouse user sees it, but a keyboard or
  // screen-reader user is still wherever the composer left them unless focus moves too.
  const canvasHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (showCanvas) canvasHeadingRef.current?.focus();
  }, [showCanvas]);

  if (!showCanvas) {
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
          <h1 ref={canvasHeadingRef} tabIndex={-1} className="sr-only">
            {done ? "Your finished strategy" : "Your strategy, building"}
          </h1>
          {done && (
            <div className="mb-6 flex items-center justify-between print:hidden">
              <p className="text-lg font-medium text-slate-900">Your finished AI enablement strategy</p>
              {/* The one download button lives on /dashboard/canvas (UI-4) — this page is for
                  reading and revising it, not a second place the export action can drift from. */}
              <Link
                to="/dashboard/canvas"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Export as PDF →
              </Link>
            </div>
          )}
          {/* Finished, it's the artifact, not a form — a document deserves to look lifted off
              the page (UI-12). Mid-build-out it's still in progress, so it stays flat. */}
          <div
            className={
              done
                ? "rounded-xl bg-white p-8 shadow-sm print:rounded-none print:bg-transparent print:p-0 print:shadow-none"
                : ""
            }
          >
            <CanvasPanel />
          </div>
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
        className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-40"
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
  const { messages, state, sending, producing, error, send } = useConsultation();
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const elapsedMs = useElapsed(sending);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending, producing]);

  // While a specialist is running, the indicator names THEM, not whoever owns the current stage.
  const running = producing ? capability(producing.id) : undefined;
  const status = running
    ? { name: running.specialist, working: running.working, blurb: running.blurb }
    : agentStatus(state.currentStage);
  // "· 3 of 6" only during a deep dive; a single capability is 1 of 1 and says nothing.
  const step = producing && producing.total > 1 ? ` · ${producing.index} of ${producing.total}` : "";
  const busy = sending || Boolean(producing);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
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

        {busy && (
          // aria-live covers who's working and on what, so a screen reader hears it once (and
          // again on a real stage change) — the ticking clock inside is aria-hidden on purpose,
          // or "polite" would re-announce the whole line every second.
          <div aria-live="polite" className="flex items-center gap-2.5 text-sm text-slate-500">
            <Dots />
            <span>
              <span className="font-medium text-slate-700">{status.name}</span> {status.working}…
              {step}
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
          <DeepBench compact={compact} />
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
            disabled={busy || !draft.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-30"
          >
            Send
          </button>
        </div>
        {!compact && <p className="mt-2 px-1 text-xs text-slate-500">{status.blurb}</p>}
      </form>
    </>
  );
}

/**
 * The deep bench, on the composer.
 *
 * Present from the first message rather than appearing once the strategy is done — a capability
 * that is not ready says WHY, which teaches the shape of the consultation instead of hiding it.
 */
function DeepBench({ compact }: { compact?: boolean }) {
  const { state, producing, produce, deepDive } = useConsultation();
  const [open, setOpen] = useState(false);
  const plan = planDeepDive(state);
  const busy = Boolean(producing);

  return (
    <div className="relative flex items-stretch">
      {/* One action, not six decisions: nobody wants the Platform Engineer but not the
          Reliability Engineer. The caret is for regenerating one stale thing later. */}
      <button
        type="button"
        onClick={() => void deepDive()}
        disabled={busy || plan.run.length === 0}
        title={
          plan.run.length
            ? `Runs ${plan.run.length} specialist${plan.run.length > 1 ? "s" : ""}`
            : "Nothing is ready yet — finish the discovery interview"
        }
        className="rounded-l-lg border border-r-0 border-slate-300 px-3 py-2 text-sm whitespace-nowrap text-slate-700 transition hover:border-slate-900 hover:text-slate-900 disabled:opacity-40"
      >
        Deep dive
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-expanded={open}
        aria-label="Run a single specialist"
        className="rounded-r-lg border border-slate-300 px-1.5 py-2 text-xs text-slate-500 transition hover:border-slate-900 hover:text-slate-900 disabled:opacity-40"
      >
        ▾
      </button>

      {open && (
        <>
          {/* Click-away. A dropdown that traps you is worse than one that closes too eagerly. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            className={[
              "absolute bottom-full z-20 mb-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg",
              compact ? "right-0" : "left-0",
            ].join(" ")}
          >
            <p className="border-b border-slate-100 px-3 py-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
              Or just one
            </p>
            {CAPABILITIES.map((c) => {
              const blocked = c.requires(state);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={Boolean(blocked)}
                  onClick={() => {
                    setOpen(false);
                    void produce(c.id);
                  }}
                  className="block w-full border-b border-slate-50 px-3 py-2.5 text-left transition last:border-0 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-white disabled:opacity-50"
                >
                  <span className="block text-sm text-slate-900">{c.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {blocked ?? c.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Bubble({ message, compact }: { message: ChatMessage; compact?: boolean }) {
  if (message.sender === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white">
          {message.text}
        </p>
      </div>
    );
  }

  // Only the rail sits next to a visible Canvas — the single-pane, pre-gate conversation has
  // nothing on the page yet for the name to point at.
  const sectionId = compact && message.agentName ? AGENT_SECTION[message.agentName] : undefined;
  const persona = message.agentName ? agentPersona(message.agentName) : null;

  return (
    <div className={compact ? "" : "max-w-[85%]"}>
      {message.agentName && persona && (
        <div className={`mb-1.5 flex items-center gap-1.5 ${persona.accent.text}`}>
          <persona.Icon className="h-3.5 w-3.5" />
          {sectionId ? (
            <button
              type="button"
              onClick={() =>
                document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="text-xs font-medium tracking-wide uppercase underline decoration-current/30 underline-offset-2 transition hover:opacity-75"
            >
              {message.agentName}
            </button>
          ) : (
            <p className="text-xs font-medium tracking-wide uppercase">{message.agentName}</p>
          )}
        </div>
      )}
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
