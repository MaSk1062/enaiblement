import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { startSession } from "../lib/api.ts";
import { useAuth } from "../lib/useAuth.ts";
import type { Industry, Role } from "../types.ts";

const ROLES: Role[] = ["CEO/Founder", "CTO/CIO", "Department Head", "Developer"];
const INDUSTRIES: Industry[] = ["Healthcare", "Finance", "Manufacturing", "Retail", "SaaS"];

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
    if (user && !name) setName(user.displayName ?? "");
  }, [user, loading, navigate, name]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name || !role || !industry) return;
    setBusy(true);
    setError(null);
    try {
      await startSession({ name, role, industry });
      navigate("/dashboard/chat", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6 py-12">
      <form onSubmit={onSubmit} className="w-full max-w-md">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Before we start
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Your Discovery Consultant uses this to open the conversation, and your Industry
          Analyst uses it to pull case studies from your sector.
        </p>

        <div className="mt-8 space-y-5">
          <Field label="Your name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
            />
          </Field>

          <Field label="Your role">
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

          <Field label="Your industry">
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
        </div>

        {error && <p className="mt-5 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy || !name || !role || !industry}
          className="mt-8 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          {busy ? "Setting up your consultation…" : "Start the consultation"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
