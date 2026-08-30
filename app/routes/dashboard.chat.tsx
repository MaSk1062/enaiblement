import { useEffect, useRef, useState } from "react";
import { agentStatus } from "../lib/agentStatus.ts";
import { useConsultation } from "../lib/consultation.ts";
import type { ChatMessage } from "../types.ts";

export function meta() {
  return [{ title: "Consultation · enaible" }];
}

export default function Chat() {
  const { messages, state, sending, error, send } = useConsultation();
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

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
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6">
      <div className="flex-1 space-y-5 py-8">
        {messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}

        {sending && (
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
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="sticky bottom-0 bg-slate-50 pt-2 pb-6">
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
                ? "Ask about the implementation…"
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
        <p className="mt-2 px-1 text-xs text-slate-400">{status.blurb}</p>
      </form>
    </main>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.sender === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white">
          {message.text}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[85%]">
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
