import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  authErrorMessage,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "../lib/firebase.client.ts";
import { useAuth } from "../lib/useAuth.ts";

export function meta() {
  return [{ title: "Sign in · enaible" }];
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
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-40"
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-3xl font-semibold tracking-tight text-slate-900">enaible</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            A consulting team of five AI specialists that turns your bottleneck into a funded,
            phased adoption plan.
          </p>
        </div>

        {children}

        <p className="mt-8 text-xs text-slate-500">
          Your consultation is private to your account.
        </p>
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
