/**
 * The consultation. One route, two shapes.
 *
 * While the strategy is being built, this is a conversation, and the Canvas appears in it only
 * at the one moment the user has to act — the approval gate, inline under the Analyst's handoff.
 * Anything else on the Canvas is read-only and would be furniture.
 *
 * Once `currentStage` is "complete", the artefact IS the point: the Canvas takes the page and
 * the conversation becomes a rail for interrogating and revising it. Both shapes give each pane
 * its own scroll container, which is why the dashboard shell is a fixed height.
 */

import { useEffect, useRef, useState } from "react";
import { CAPABILITIES, capability } from "../capabilities.ts";
import { agentStatus } from "../lib/agentStatus.ts";
import { CanvasPanel, UseCaseDecisions } from "../lib/CanvasPanel.tsx";
import { useConsultation } from "../lib/consultation.ts";
import type { ChatMessage } from "../types.ts";

export function meta() {
  return [{ title: "Consultation · enaible" }];
}

export default function Chat() {
  const { state } = useConsultation();
  const done = state.currentStage === "complete";

  if (!done) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-6">
        <Conversation inline={<Decisions />} />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <CanvasPanel />
        </div>
      </div>

      <aside className="flex shrink-0 flex-col overflow-hidden border-slate-200 lg:w-96 lg:border-l">
        <p className="border-y border-slate-200 bg-white px-5 py-2.5 text-xs text-slate-500 lg:border-t-0">
          Ask about the strategy, or tell me what to change.
        </p>
        <Conversation compact />
      </aside>
    </main>
  );
}

/** The gate, inline. Rendered only while there is a decision to make. */
function Decisions() {
  const { state } = useConsultation();
  if (state.currentStage !== "architecture" || state.useCases.length === 0) return null;
  return <UseCaseDecisions />;
}

function Conversation({ inline, compact }: { inline?: React.ReactNode; compact?: boolean }) {
  const { messages, state, sending, producing, error, send } = useConsultation();
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending, producing]);

  // While a specialist is running, the indicator names THEM, not whoever owns the current stage.
  const running = producing ? capability(producing) : undefined;
  const status = running
    ? { name: running.specialist, working: running.working, blurb: running.blurb }
    : agentStatus(state.currentStage);
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
          <div className="flex items-center gap-2.5 text-sm text-slate-500">
            <Dots />
            <span>
              <span className="font-medium text-slate-700">{status.name}</span> {status.working}…
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

/**
 * The deep bench, on the composer.
 *
 * Present from the first message rather than appearing once the strategy is done — a capability
 * that is not ready says WHY, which teaches the shape of the consultation instead of hiding it.
 */
function DeepBench({ compact }: { compact?: boolean }) {
  const { state, producing, produce } = useConsultation();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={Boolean(producing)}
        aria-expanded={open}
        title="Bring in a specialist"
        className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-600 transition hover:border-slate-900 hover:text-slate-900 disabled:opacity-40"
      >
        +
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
              Bring in a specialist
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
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white">
          {message.text}
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "" : "max-w-[85%]"}>
      {message.agentName && (
        <p className="mb-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase">
          {message.agentName}
        </p>
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
