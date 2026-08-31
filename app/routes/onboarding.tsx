import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { startSession } from "../lib/api.ts";
import { SignOutButton } from "../lib/SignOutButton.tsx";
import { useAuth } from "../lib/useAuth.ts";
import { REGION_CONTEXT } from "../types.ts";
import type { Industry, Region, Role } from "../types.ts";

const ROLES: Role[] = ["CEO/Founder", "CTO/CIO", "Department Head", "Developer"];
const INDUSTRIES: Industry[] = ["Healthcare", "Finance", "Manufacturing", "Retail", "SaaS"];
// Derived from the one place regions are defined, so the form and the API can never disagree
// about what is valid. Africa first, and not as a courtesy: the regime the Architect designs
// against and the currency a budget is quoted in both come from here.
const REGIONS = Object.keys(REGION_CONTEXT) as Region[];

export function meta() {
  return [{ title: "Set up · enaible" }];
}

// ponytail: one form, not the three-step wizard in FRD §2.1. Three fields do not need three
// screens, and the profile it produces is identical. Company size is collected by neither —
// no agent reads it. Add both back if the demo script wants the ceremony.
export default function Onboarding() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [industry, setIndustry] = useState<Industry | "">("");
  const [region, setRegion] = useState<Region | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
    if (user && !name) setName(user.displayName ?? "");
  }, [user, loading, navigate, name]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name || !role || !industry || !region) return;
    setBusy(true);
    setError(null);
    try {
      await startSession({ name, role, industry, region });
      navigate("/dashboard/chat", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const answered = [name, role, industry, region].filter(Boolean).length;

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6 py-12">
      <form onSubmit={onSubmit} className="w-full max-w-md">
        {/* Same wordmark and voice as /login — nothing here should feel like a second product. */}
        <div className="flex items-start justify-between">
          <p className="text-2xl font-semibold tracking-tight text-slate-900">enaible</p>
          {/* Signed in but no profile yet — without this there is no way back to /login. */}
          <SignOutButton />
        </div>

        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
          Before we start
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Three quick questions. Your Discovery Consultant uses them to open the conversation,
          and your Industry Analyst uses them to pull case studies from your sector.
        </p>

        <div className="mt-8 space-y-5">
          <Field step={1} of={4} label="Your name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
            />
          </Field>

          <Field step={2} of={4} label="Your role">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
            >
              <option value="" disabled>
                Select a role
              </option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>

          <Field step={3} of={4} label="Your industry">
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value as Industry)}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
            >
              <option value="" disabled>
                Select an industry
              </option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Field>

          <Field step={4} of={4} label="Where you operate">
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as Region)}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
            >
              <option value="" disabled>
                Select a region
              </option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              Sets the data-protection regime your architecture is designed against, and the
              currency any budget is quoted in.
            </p>
          </Field>
        </div>

        {error && <p className="mt-5 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy || !name || !role || !industry || !region}
          className="mt-8 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-40"
        >
          {busy
            ? "Setting up your consultation…"
            : answered < 4
              ? `Start the consultation (${answered}/4)`
              : "Start the consultation"}
        </button>
      </form>
    </main>
  );
}

function Field({
  step,
  of,
  label,
  children,
}: {
  step: number;
  of: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500"
        >
          {step}
        </span>
        {label}
        <span className="sr-only">
          , step {step} of {of}
        </span>
      </span>
      {children}
    </label>
  );
}
