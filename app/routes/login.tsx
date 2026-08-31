import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { agentStatus, STAGES } from "../lib/agentStatus.ts";
import {
  authErrorMessage,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "../lib/firebase.client.ts";
import { DotGrid } from "../lib/DotGrid.tsx";
import { useAuth } from "../lib/useAuth.ts";

export function meta() {
  return [{ title: "Sign in · Enaible" }];
}

type Mode = "signin" | "signup";

export default function Login() {
  const { user, loading, configError } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "email" | "reset" | null>(null);

  useEffect(() => {
    if (user) navigate("/dashboard/chat", { replace: true });
  }, [user, navigate]);

  /** One place to run an auth call, so every path reports failure the same way. */
  async function attempt(kind: NonNullable<typeof busy>, fn: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    setBusy(kind);
    try {
      await fn();
      // On success the auth listener fires and the effect above navigates.
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(null);
    }
  }

  const onEmailSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) return;
    void attempt("email", () =>
      mode === "signin" ? signInWithEmail(email, password) : signUpWithEmail(email, password),
    );
  };

  const onReset = () => {
    if (!email) {
      setError("Enter your email first, then choose Reset.");
      return;
    }
    void attempt("reset", async () => {
      await resetPassword(email);
      setNotice(`Password reset sent to ${email}.`);
      setBusy(null);
    });
  };

  if (configError) {
    return (
      <Shell>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {configError}
        </p>
      </Shell>
    );
  }

  const disabled = busy !== null || loading;

  return (
    <Shell>
      <button
        type="button"
        onClick={() => void attempt("google", signInWithGoogle)}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-50"
      >
        <GoogleMark />
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-400">or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={onEmailSubmit} className="space-y-3">
        <label className="block">
          <span className="sr-only">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
        </label>

        <label className="block">
          <span className="sr-only">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder={mode === "signin" ? "Password" : "Password (6+ characters)"}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
        </label>

        <button
          type="submit"
          disabled={disabled || !email || !password}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-40"
        >
          {busy === "email"
            ? mode === "signin"
              ? "Signing in…"
              : "Creating your account…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          className="text-slate-600 underline-offset-2 transition hover:text-slate-900 hover:underline"
        >
          {mode === "signin" ? "Create an account" : "I already have an account"}
        </button>

        {mode === "signin" && (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="text-slate-500 underline-offset-2 transition hover:text-slate-700 hover:underline disabled:opacity-50"
          >
            {busy === "reset" ? "Sending…" : "Reset password"}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-5 text-sm text-red-600">
          {error}
        </p>
      )}
      {notice && <p className="mt-5 text-sm text-emerald-700">{notice}</p>}
    </Shell>
  );
}

/**
 * The landing page - this and /onboarding are the only screens a first-time visitor (a judge,
 * most of the time) ever sees before deciding whether the product is worth a second look. It
 * used to be a single narrow card with one sentence of copy; this is the whole pitch, not just
 * the login form.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-slate-950 px-6 py-12">
      {/* Decorative, and the only screen that gets it - this renders continuously while
          mounted, and the rest of the app is functional UI someone is trying to read, not
          look at (see the note on DotGrid.tsx). Dark background on purpose: light dots on dark
          read as a glow when the pointer is near them, which is the whole point of the effect -
          on a light page the same dots just look like noise sitting behind the text. */}
      <div className="absolute inset-0">
        <DotGrid
          dotSize={4}
          gap={24}
          baseColor="#334155"
          activeColor="#818CF8"
          proximity={130}
          shockRadius={220}
          shockStrength={4}
          resistance={750}
          returnDuration={1.5}
        />
      </div>

      <div className="relative grid w-full max-w-5xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        {/* A frosted panel, not a solid one - the big bold headline reads fine directly on the
            dots (see the "Organized chaos" reference), but the smaller tagline and the persona
            blurbs are lower-contrast, smaller text, and lost their legibility sitting right on
            top of the dot pattern. This dims what's behind it without hiding the effect. */}
        <div className="rounded-3xl bg-slate-950/50 p-8 backdrop-blur-sm">
          {/* The mark is a stylized "e" - pairing it with the full word would read as a doubled
              E. Text picks up from "naible" so together it reads "enaible" once; both halves
              are aria-hidden and the label carries the whole name once. */}
          <div className="flex items-center gap-3" aria-label="Enaible">
            <img src="/logo.png" alt="" aria-hidden className="h-14 w-14 sm:h-16 sm:w-16" />
            <p aria-hidden className="text-5xl font-bold tracking-tight text-indigo-400 sm:text-6xl">
              naible
            </p>
          </div>
          <p className="mt-5 text-lg leading-relaxed text-white sm:text-xl">
            A consulting team of five AI specialists that turns your bottleneck into a funded,
            phased AI adoption plan.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Built around African compliance regimes and cost realities - not retrofitted from a
            US or EU playbook.
          </p>

          <ul className="mt-10 space-y-4">
            {STAGES.slice(0, 5).map((stage) => {
              const { name, blurb, Icon, accent } = agentStatus(stage);
              return (
                <li key={stage} className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <Icon className={`h-4 w-4 ${accent.text}`} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{name}</p>
                    <p className="text-xs text-slate-400">{blurb}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Its own solid surface, not floating on the hero's dark/dotted background - an auth
            form needs to read as a form, not as more decoration. */}
        <div className="w-full max-w-sm justify-self-center rounded-2xl bg-white p-8 shadow-xl lg:justify-self-end">
          {children}

          <p className="mt-8 text-xs text-slate-500">
            Your consultation is private to your account.
          </p>
        </div>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.92v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.92a9 9 0 0 0 0 8.08l3.03-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .92 4.96l3.03 2.33C4.66 5.16 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}
