import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import * as api from "../lib/api.ts";
import { agentStatus, STAGES } from "../lib/agentStatus.ts";
import { ConsultationContext, type Consultation } from "../lib/consultation.ts";
import { ChatIcon, DownloadIcon, SpinnerIcon } from "../lib/icons.tsx";
import { stageSummary } from "../lib/pipelineView.ts";
import { SignOutButton } from "../lib/SignOutButton.tsx";
import { useAuth } from "../lib/useAuth.ts";
import type { AgentState, ChatMessage, SessionUserProfile } from "../types.ts";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SessionUserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<AgentState | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  // Bootstrap: who is this, have they onboarded, is there a session to resume?
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const me = await api.getMe();
        if (cancelled) return;
        if (!me.profile || !me.activeSessionId) {
          navigate("/onboarding", { replace: true });
          return;
        }
        const session = await api.getSession(me.activeSessionId);
        if (cancelled) return;
        setSessionId(session.sessionId);
        setProfile(session.userProfile);
        setMessages(session.messages);
        setState(session.state);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, navigate]);

  const send = useCallback(
    async (text: string) => {
      if (!sessionId || sending) return;

      // Optimistic: the user's own message needs no round trip to be true.
      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        sender: "user",
        text,
        timestamp: new Date().toISOString(),
      };
      setMessages((m) => [...m, optimistic]);
      setSending(true);
      setError(null);

      try {
        const { replies, state: next } = await api.sendMessage(sessionId, text);
        setMessages((m) => [...m, ...replies]);
        setState(next); // replaced wholesale — §8.1
      } catch (err) {
        setError((err as Error).message);
        setMessages((m) => m.filter((msg) => msg.id !== optimistic.id));
      } finally {
        setSending(false);
      }
    },
    [sessionId, sending],
  );

  const decide = useCallback(
    async (decisions: Record<string, "approved" | "rejected">) => {
      if (!sessionId) return;
      try {
        const { state: next } = await api.decideUseCases(sessionId, decisions);
        setState(next);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [sessionId],
  );

  if (authLoading || booting) {
    return <Centered>Loading your consultation…</Centered>;
  }
  // Both of these are dead ends without a way out: no header renders here, so sign out is the
  // only route back to a working state.
  if (error && !state) {
    return <Centered tone="error">{error}</Centered>;
  }
  if (!sessionId || !profile || !state) {
    return <Centered>No active consultation.</Centered>;
  }

  const consultation: Consultation = {
    sessionId,
    profile,
    messages,
    state,
    sending,
    error,
    send,
    decide,
  };

  return (
    <ConsultationContext.Provider value={consultation}>
      {/* Fixed height with internal scroll containers on screen; print needs the opposite —
          nothing clipped, everything flowing across pages — hence the print: overrides below. */}
      <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 print:h-auto print:overflow-visible">
        <header className="border-b border-slate-200 bg-white print:hidden">
          <div className="flex items-center justify-between px-6 py-3.5">
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-semibold tracking-tight text-slate-900">enaible</span>
              <span className="text-xs text-slate-400">
                {profile.industry} · {profile.role}
              </span>
            </div>
            <div className="flex items-center gap-5">
              <Nav
                pending={state.useCases.filter((uc) => uc.status === "suggested").length}
                exportReady={state.currentStage === "complete"}
              />
              <SignOutButton />
            </div>
          </div>
          <ProgressRail state={state} sending={sending} />
        </header>

        <div className="flex flex-1 overflow-hidden print:overflow-visible">
          <Outlet />
        </div>
      </div>
    </ConsultationContext.Provider>
  );
}

/**
 * Chat, plus Export once there is something to export (UI-4 — one canvas, not two: the
 * strategy itself lives only in the chat route now; /dashboard/canvas is the distraction-free
 * print destination that route points at, never a second place to see the same thing).
 *
 * The pending-count badge sits on Chat, not Export, because Chat is where the gate that badge
 * describes actually lives — the only signal pointing at the decision blocking the pipeline.
 */
function Nav({ pending, exportReady }: { pending: number; exportReady: boolean }) {
  const style = ({ isActive }: { isActive: boolean }) =>
    [
      "text-xs transition",
      isActive ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-900",
    ].join(" ");

  return (
    <nav className="flex items-center gap-4">
      <NavLink to="/dashboard/chat" className={style}>
        <span className="flex items-center gap-1.5">
          <ChatIcon className="h-3.5 w-3.5" />
          Chat
          {pending > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              {pending}
            </span>
          )}
        </span>
      </NavLink>
      {exportReady && (
        <NavLink to="/dashboard/canvas" className={style}>
          <span className="flex items-center gap-1.5">
            <DownloadIcon className="h-3.5 w-3.5" />
            Export
          </span>
        </NavLink>
      )}
    </nav>
  );
}

/**
 * The five specialists, and which one has the file — live, not decorative (UI-2). A finished
 * chip says what it produced (`pipelineView.ts`), the active one spins and says what it's
 * doing, so the rail plus the chat's typing indicator (dashboard.chat.tsx) are what
 * IMPLEMENTATION_PLAN §7 calls the single highest-leverage piece of UI in the build.
 */
function ProgressRail({ state, sending }: { state: AgentState; sending: boolean }) {
  const currentIndex = STAGES.indexOf(state.currentStage);

  return (
    <div className="overflow-x-auto px-6 pb-3">
      <ol className="flex min-w-max items-center gap-2">
        {STAGES.slice(0, 5).map((stage, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const working = active && sending;
          const summary = done ? stageSummary(stage, state) : null;
          return (
            <li key={stage} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="h-px w-5 bg-slate-200" />}
              <span
                className={[
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs whitespace-nowrap transition",
                  active
                    ? "bg-slate-900 font-medium text-white"
                    : done
                      ? "bg-slate-100 text-slate-500"
                      : "text-slate-400",
                ].join(" ")}
              >
                {working && <SpinnerIcon className="h-3 w-3 animate-spin" />}
                {done && <span aria-hidden>✓</span>}
                {agentStatus(stage).name}
                {done && summary && <span className="text-slate-400">· {summary}</span>}
                {working && <span className="text-slate-300">· {agentStatus(stage).working}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Centered({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6">
      <div className="text-center">
        <p className={tone === "error" ? "text-sm text-red-600" : "text-sm text-slate-500"}>
          {children}
        </p>
        <div className="mt-4">
          <SignOutButton className="text-xs text-slate-400 underline transition hover:text-slate-900" />
        </div>
      </div>
    </main>
  );
}
