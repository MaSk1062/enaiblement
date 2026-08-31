import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import * as api from "../lib/api.ts";
import { agentStatus, STAGES } from "../lib/agentStatus.ts";
import { ConsultationContext, type Consultation } from "../lib/consultation.ts";
import { SignOutButton } from "../lib/SignOutButton.tsx";
import { useAuth } from "../lib/useAuth.ts";
import type { AgentState, ChatMessage, SessionUserProfile, Stage } from "../types.ts";

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
        const { reply, state: next } = await api.sendMessage(sessionId, text);
        setMessages((m) => [...m, reply]);
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
      <div className="flex min-h-dvh flex-col bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3.5">
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-semibold tracking-tight text-slate-900">enaible</span>
              <span className="text-xs text-slate-400">
                {profile.industry} · {profile.role}
              </span>
            </div>
            <div className="flex items-center gap-5">
              <Nav pending={state.useCases.filter((uc) => uc.status === "suggested").length} />
              <SignOutButton />
            </div>
          </div>
          <ProgressRail current={state.currentStage} />
        </header>

        <Outlet />
      </div>
    </ConsultationContext.Provider>
  );
}

/**
 * Chat and Canvas, plus the count of use cases still waiting on a decision — which is the
 * only signal pointing at the approval gate while the gate is what is blocking the stage.
 */
function Nav({ pending }: { pending: number }) {
  const style = ({ isActive }: { isActive: boolean }) =>
    [
      "text-xs transition",
      isActive ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-900",
    ].join(" ");

  return (
    <nav className="flex items-center gap-4">
      <NavLink to="/dashboard/chat" className={style}>
        Chat
      </NavLink>
      <NavLink to="/dashboard/canvas" className={style}>
        Canvas
        {pending > 0 && (
          <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            {pending}
          </span>
        )}
      </NavLink>
    </nav>
  );
}

/**
 * The five specialists, and which one has the file. This plus the typing indicator is what
 * IMPLEMENTATION_PLAN §7 calls the single highest-leverage piece of UI in the build.
 */
function ProgressRail({ current }: { current: Stage }) {
  const currentIndex = STAGES.indexOf(current);

  return (
    <div className="mx-auto max-w-4xl overflow-x-auto px-6 pb-3">
      <ol className="flex min-w-max items-center gap-2">
        {STAGES.slice(0, 5).map((stage, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={stage} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="h-px w-5 bg-slate-200" />}
              <span
                className={[
                  "rounded-full px-2.5 py-1 text-xs whitespace-nowrap transition",
                  active
                    ? "bg-slate-900 font-medium text-white"
                    : done
                      ? "bg-slate-100 text-slate-500"
                      : "text-slate-400",
                ].join(" ")}
              >
                {done && <span aria-hidden>✓ </span>}
                {agentStatus(stage).name}
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
