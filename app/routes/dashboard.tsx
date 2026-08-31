import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { planDeepDive } from "../capabilities.ts";
import * as api from "../lib/api.ts";
import { agentStatus, STAGES } from "../lib/agentStatus.ts";
import { ConsultationContext, type Consultation } from "../lib/consultation.ts";
import { DotGrid } from "../lib/DotGrid.tsx";
import { AlertIcon, DownloadIcon, SpinnerIcon, UserIcon } from "../lib/icons.tsx";
import { stageSummary } from "../lib/pipelineView.ts";
import { SignOutButton } from "../lib/SignOutButton.tsx";
import { useAuth } from "../lib/useAuth.ts";
import type { AgentState, Artifact, ChatMessage, SessionUserProfile, Stage } from "../types.ts";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SessionUserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<AgentState | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [sending, setSending] = useState(false);
  const [producing, setProducing] = useState<Consultation["producing"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [consultations, setConsultations] = useState<api.Me["consultations"]>([]);

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
        setConsultations(me.consultations ?? []);
        const session = await api.getSession(me.activeSessionId);
        if (cancelled) return;
        setSessionId(session.sessionId);
        setProfile(session.userProfile);
        setMessages(session.messages);
        setState(session.state);
        setArtifacts(session.artifacts ?? []);
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
        setState(next); // replaced wholesale - §8.1
      } catch (err) {
        setError((err as Error).message);
        setMessages((m) => m.filter((msg) => msg.id !== optimistic.id));
      } finally {
        setSending(false);
      }
    },
    [sessionId, sending],
  );

  // A capability is not a turn: it adds a reply and may add files, but never moves the stage.
  // Throws, so the deep dive can decide whether one failure should stop the rest. It does not.
  const runCapability = useCallback(
    async (capability: string, index: number, total: number) => {
      if (!sessionId) return;
      setProducing({ id: capability, index, total });
      try {
        const result = await api.produce(sessionId, capability);
        setMessages((m) => [...m, ...result.replies]);
        setState(result.state);
        setArtifacts(result.artifacts);
      } finally {
        setProducing(null);
      }
    },
    [sessionId],
  );

  const produce = useCallback(
    async (capability: string) => {
      if (!sessionId || producing) return;
      setError(null);
      try {
        await runCapability(capability, 1, 1);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [sessionId, producing, runCapability],
  );

  /**
   * The whole bench, in dependency order, one request each.
   *
   * Sequential on purpose: each specialist sees what the previous one wrote, every step
   * persists on its own, and a failure at step four leaves the first three intact rather than
   * losing three minutes of work. So a throw is collected and the loop carries on.
   */
  const deepDive = useCallback(async () => {
    if (!sessionId || producing || !state) return;
    setError(null);

    const plan = planDeepDive(state);
    const failed: string[] = [];

    for (const [i, id] of plan.run.entries()) {
      try {
        await runCapability(id, i + 1, plan.run.length);
      } catch (err) {
        failed.push(`${id} (${(err as Error).message})`);
      }
    }

    const notes = [
      failed.length ? `Could not complete: ${failed.join(", ")}.` : "",
      plan.skipped.length
        ? `Not run yet - ${plan.skipped.map((s) => `${s.id}: ${s.reason}`).join("; ")}.`
        : "",
    ].filter(Boolean);

    if (notes.length) setError(notes.join(" "));
  }, [sessionId, producing, state, runCapability]);

  // Approving releases the rest of the pipeline, so this call can take as long as a chat turn
  // and comes back with several replies. `sending` drives the same typing indicator, because
  // from the user's side it is the same thing: the specialists are working.
  const decide = useCallback(
    async (decisions: Record<string, api.Decision>) => {
      if (!sessionId || sending) return;
      setSending(true);
      setError(null);
      try {
        const { replies, state: next } = await api.decideUseCases(sessionId, decisions);
        setMessages((m) => [...m, ...replies]);
        setState(next);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSending(false);
      }
    },
    [sessionId, sending],
  );

  /**
   * A new consultation is what turns the current one into history: the server folds it into
   * the client's memory before it moves the pointer, which is the only place memory
   * accumulates.
   *
   * A full reload rather than re-deriving state by hand - every piece of local state above
   * belongs to the session being left, and rebuilding it here would be the bootstrap effect
   * written a second time.
   */
  const newConsultation = useCallback(async () => {
    if (!profile) return;
    // Only a FINISHED consultation becomes a reopenable memory, so leaving an unfinished one
    // really does bury it. Say so rather than discovering it afterwards.
    if (
      state?.currentStage !== "complete" &&
      !window.confirm(
        "This consultation is not finished, so it will not appear in your history and you " +
          "will not be able to reopen it. Start a new one anyway?",
      )
    ) {
      return;
    }
    setError(null);
    try {
      await api.startSession(profile);
      window.location.assign("/dashboard/chat");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [profile, state]);

  const openConsultation = useCallback(async (id: string) => {
    setError(null);
    try {
      await api.setActiveSession(id);
      window.location.assign("/dashboard/chat");
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  if (authLoading || booting) {
    return <Centered tone="loading">Loading your consultation…</Centered>;
  }
  // Both of these are dead ends without a way out: no header renders here, so sign out is the
  // only route back to a working state.
  if (error && !state) {
    return <Centered tone="error">{error}</Centered>;
  }
  if (!sessionId || !profile || !state) {
    return <Centered tone="empty">No active consultation.</Centered>;
  }

  const consultation: Consultation = {
    sessionId,
    profile,
    messages,
    state,
    artifacts,
    sending,
    producing,
    error,
    send,
    decide,
    produce,
    deepDive,
    consultations,
    newConsultation,
    openConsultation,
  };

  return (
    <ConsultationContext.Provider value={consultation}>
      {/* Fixed height with internal scroll containers on screen; print needs the opposite -
          nothing clipped, everything flowing across pages - hence the print: overrides below. */}
      <div className="relative flex h-dvh flex-col overflow-hidden bg-slate-50 print:h-auto print:overflow-visible">
        {/* Barely-there ambient texture, not the landing page's effect - every panel in the app
            (the header, the chat, the Canvas card) is opaque and paints over it; it only ever
            shows in the margins. A functional screen someone works in for minutes needs calm,
            not a focal point, so the dots stay small, sparse and low-contrast at rest. */}
        <div className="absolute inset-0 print:hidden">
          <DotGrid
            dotSize={3}
            gap={34}
            baseColor="#E2E8F0"
            activeColor="#818CF8"
            proximity={110}
            shockRadius={180}
            shockStrength={3}
            resistance={750}
            returnDuration={1.5}
          />
        </div>

        <header className="relative border-b border-slate-200 bg-white print:hidden">
          <div className="flex items-center justify-between px-6 py-3.5">
            {/* The mark is a stylized "e" - pairing it with the full word would read as a
                doubled E. Text picks up from "naible" so together it reads "enaible" once.
                Both halves are aria-hidden and the label carries the whole name once, so a
                screen reader hears "Enaible" rather than "naible" or "Enaible naible".
                Links to /dashboard/chat - with the "Chat" nav item gone, the logo is the way
                back from Export/Canvas, the same pattern most products use for "home". */}
            <NavLink to="/dashboard/chat" className="flex items-center gap-1.5" aria-label="Enaible">
              <img src="/logo.png" alt="" aria-hidden className="h-6 w-6" />
              <span aria-hidden className="text-lg font-bold tracking-tight text-indigo-600">
                naible
              </span>
            </NavLink>
            <div className="flex items-center gap-4">
              <Consultations
                consultations={consultations}
                onNew={newConsultation}
                onOpen={openConsultation}
              />
              <UserMenu profile={profile} exportReady={state.currentStage === "complete"} />
            </div>
          </div>
          <ProgressRail state={state} sending={sending} />
        </header>

        <div className="relative flex flex-1 overflow-hidden print:overflow-visible">
          <Outlet />
        </div>
      </div>
    </ConsultationContext.Provider>
  );
}

/**
 * Profile, Export and Sign out, under one icon - three separate header items were crowding the
 * row (and clipping it on narrower screens) for information that is read once per session, not
 * per turn. Export keeps the same disabled-with-tooltip treatment it always had (UI-4) - it's
 * just inside the menu instead of beside it.
 */
function UserMenu({ profile, exportReady }: { profile: SessionUserProfile; exportReady: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        <UserIcon className="h-4 w-4" />
      </button>

      {open && (
        <>
          {/* Click-away. A dropdown that traps you is worse than one that closes too eagerly. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <p className="border-b border-slate-100 px-3.5 py-2.5 text-xs text-slate-500">
              {profile.industry} · {profile.role}
            </p>

            {exportReady ? (
              <NavLink
                to="/dashboard/canvas"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3.5 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                Export
              </NavLink>
            ) : (
              <span
                className="flex cursor-not-allowed items-center gap-2 px-3.5 py-2.5 text-sm text-slate-300"
                title="Unlocks once your strategy is complete"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                Export
              </span>
            )}

            <div className="border-t border-slate-100">
              <SignOutButton className="block w-full px-3.5 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Start a new engagement, or reopen a finished one.
 *
 * This exists because `activeSessionId` is a single field: without a way back, beginning a
 * second consultation would make the first one's finished strategy unreachable forever. It is
 * navigation only. What the product *remembers* about the client - how they budget, what they
 * refuse, what they scoped last time - is deliberately not shown here; it shows up in how the
 * agents behave, which is the point of it.
 *
 * ponytail: a native <details>, so there is no open state, no click-outside listener and no
 * menu library. Two viewport caveats that come with that: it does not close on outside click,
 * and a long history scrolls inside its own box rather than flipping above the header.
 */
function Consultations({
  consultations,
  onNew,
  onOpen,
}: {
  consultations: { sessionId: string; completedAt: string; bottleneck: string }[];
  onNew: () => void;
  onOpen: (sessionId: string) => void;
}) {
  const item =
    "block w-full rounded px-3 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-50 hover:text-slate-900";

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none text-xs text-slate-500 transition hover:text-slate-900">
        Consultations
      </summary>
      <div className="absolute right-0 z-20 mt-2 max-h-80 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
        <button type="button" onClick={onNew} className={`${item} font-medium text-slate-900`}>
          New consultation
        </button>

        {consultations.length > 0 && (
          <>
            <p className="px-3 pt-2 pb-1 text-[11px] tracking-wide text-slate-400 uppercase">
              Earlier
            </p>
            {consultations.map((c) => (
              <button
                key={c.sessionId}
                type="button"
                onClick={() => onOpen(c.sessionId)}
                className={item}
              >
                <span className="block truncate">{c.bottleneck}</span>
                <span className="block text-[11px] text-slate-400">
                  {c.completedAt.slice(0, 10)}
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </details>
  );
}

/**
 * The five specialists, and which one has the file - live, not decorative (UI-2). A finished
 * chip says what it produced (`pipelineView.ts`), the active one spins and says what it's
 * doing, so the rail plus the chat's typing indicator (dashboard.chat.tsx) are what
 * IMPLEMENTATION_PLAN §7 calls the single highest-leverage piece of UI in the build.
 */
function ProgressRail({ state, sending }: { state: AgentState; sending: boolean }) {
  const currentIndex = STAGES.indexOf(state.currentStage);

  return (
    <div className="overflow-x-auto px-6 pb-3">
      <ol className="flex min-w-max items-center gap-2">
        {/* Every stage but `complete`, which is a conversation rather than a step. Derived
            rather than sliced to a count, so adding a stage does not silently drop one. */}
        {STAGES.filter((s) => s !== "complete").map((stage, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const working = active && sending;
          const summary = done ? stageSummary(stage, state) : null;
          const { Icon, accent } = agentStatus(stage);
          return (
            <li key={stage} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="h-px w-5 bg-slate-200" />}
              <span
                // Keyed on active-ness, not just the stage: when a stage first becomes active,
                // this remounts and the handoff pulse plays. Re-renders while it stays active
                // (sending toggling, a summary landing) keep the same key and don't retrigger it.
                key={`${stage}-${active}`}
                className={[
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs whitespace-nowrap transition",
                  active ? "animate-handoff-pulse" : "",
                  active
                    ? `${accent.solid} font-medium text-white ${working ? "shadow-sm" : ""}`
                    : done
                      ? `${accent.light} ${accent.lightText}`
                      : "text-slate-400",
                ].join(" ")}
              >
                {working ? (
                  <SpinnerIcon className="h-3 w-3 animate-spin" />
                ) : (
                  <Icon className={`h-3.5 w-3.5 ${active || done ? "" : "opacity-50"}`} />
                )}
                {done && <span aria-hidden>✓</span>}
                {agentStatus(stage).name}
                {done && summary && <span className="opacity-70">· {summary}</span>}
                {working && <span className="text-white/80">· {agentStatus(stage).working}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Every screen with no header - a bootstrap failure, an empty session - used to be identical
 * gray text on an empty page, so a real error looked exactly like an ordinary loading state
 * (UI-9). The wordmark, an icon per tone, and distinct color fix that at a glance.
 */
function Centered({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "loading" | "error" | "empty";
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6">
      <div className="text-center">
        <p className="mb-6 text-lg font-semibold tracking-tight text-indigo-600">Enaible</p>
        {tone === "loading" && (
          <SpinnerIcon className="mx-auto mb-4 h-10 w-10 animate-spin text-indigo-600" />
        )}
        {tone === "error" && <AlertIcon className="mx-auto mb-3 h-5 w-5 text-red-500" />}
        <p className={tone === "error" ? "text-sm text-red-600" : "text-sm text-slate-500"}>
          {children}
        </p>
        {/* Loading is transient, not a dead end - nothing to escape from yet, so no exit needed
            until it actually becomes one (the error or empty tones below). */}
        {tone !== "loading" && (
          <div className="mt-4">
            <SignOutButton className="text-xs text-slate-500 underline transition hover:text-slate-900" />
          </div>
        )}
      </div>
    </main>
  );
}
