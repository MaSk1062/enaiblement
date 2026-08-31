/**
 * The Strategy Canvas itself, with no opinion about where it is rendered.
 *
 * It lives here rather than in a route because it appears in three places: inline in the chat
 * at a decision, as the main column once the strategy is finished, and on /dashboard/canvas as
 * the focused view and print target. It reads useConsultation() and takes no props, so
 * decide() works identically from all three.
 *
 * One panel, not three sections. AgentState accretes in stage order, so each section below
 * simply appears when its field lands.
 */

import { useState } from "react";
import { useConsultation } from "./consultation.ts";
import type { Level, UseCase } from "../types.ts";

export function CanvasPanel() {
  const { state, decide } = useConsultation();
  const { needsAssessment: needs, useCases, architectureStack, roadmapPhases } = state;
  const plan = state.changeManagementPlan;
  const pending = useCases.filter((uc) => uc.status === "suggested").length;

  if (useCases.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-500">
        Your Canvas fills in as the consultation progresses. Finish the discovery interview and
        your Industry Analyst will put the first use cases here.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {needs.identifiedBottleneck && (
        <Section title="The bottleneck">
          <p className="text-sm leading-relaxed text-slate-700">{needs.summary}</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <Fact label="Bottleneck" value={needs.identifiedBottleneck} />
            <Fact label="Primary objective" value={needs.primaryObjective} />
            <Fact label="Data readiness" value={needs.dataReadiness} />
          </dl>
        </Section>
      )}

      <Section
        title="Use cases"
        aside={
          pending > 0 ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              {pending} awaiting your decision
            </span>
          ) : (
            <span className="text-xs text-slate-400">
              {useCases.filter((uc) => uc.status === "approved").length} approved
            </span>
          )
        }
      >
        <Provenance ungrounded={state.ungrounded} sources={state.sources} />

        <div className="mt-4 space-y-3">
          {useCases.map((uc) => (
            <UseCaseCard key={uc.id} useCase={uc} decide={decide} />
          ))}
        </div>

        {pending === 0 && !architectureStack && (
          <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            Reviewed — send a message and your Technical Architect will design around the ones
            you approved.
          </p>
        )}
      </Section>

      {architectureStack && (
        <Section title="Recommended stack">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Fact label="Models" value={architectureStack.models.join(", ")} />
            <Fact label="Infrastructure" value={architectureStack.infrastructure.join(", ")} />
            <Fact label="Frameworks" value={architectureStack.frameworks.join(", ") || "—"} />
          </dl>
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-900">
            <span className="font-medium">Compliance risk · </span>
            {architectureStack.securityConsiderations}
          </p>
        </Section>
      )}

      {roadmapPhases && roadmapPhases.length > 0 && (
        <Section title="Roadmap">
          <ol className="space-y-3">
            {roadmapPhases.map((phase, i) => (
              <li
                key={phase.phaseName}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium text-slate-900">
                    <span className="text-slate-400">{i + 1}. </span>
                    {phase.phaseName}
                  </h3>
                  <span className="text-xs whitespace-nowrap text-slate-500">{phase.duration}</span>
                </div>
                <Bullets label="Deliverables" items={phase.keyDeliverables} />
                <Bullets label="Resources" items={phase.resourcesRequired} />
              </li>
            ))}
          </ol>
        </Section>
      )}

      {plan && (
        <Section title="People and change">
          <div className="space-y-3">
            {plan.upskillingPaths.map((path) => (
              <div key={path.role} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium text-slate-900">{path.role}</h3>
                  <span className="text-xs whitespace-nowrap text-slate-500">
                    {path.timeCommitment}
                  </span>
                </div>
                <Bullets label="Skills" items={path.skillsRequired} />
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {path.recommendedTraining}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm leading-relaxed text-slate-700">
              {plan.communicationStrategy.leadershipNarrative}
            </p>
            <Bullets label="Concerns to address" items={plan.communicationStrategy.mitigatingConcerns} />
            <Bullets label="Adoption KPIs" items={plan.adoptionKpis} />
          </div>
        </Section>
      )}
    </div>
  );
}

/**
 * Just the decision: the use cases and where they came from, for rendering inline in the chat.
 *
 * This is the only moment in the consultation where the artefact needs hands on it, so it is
 * the only part of the Canvas that appears in the conversation. Everything else on the Canvas
 * is read-only and would be furniture here.
 */
export function UseCaseDecisions() {
  const { state, decide, send, sending } = useConsultation();
  const pending = state.useCases.filter((uc) => uc.status === "suggested").length;
  const approved = state.useCases.filter((uc) => uc.status === "approved").length;

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50/40 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-medium tracking-wide text-amber-900 uppercase">
          Your Strategy Canvas
        </h2>
        <span className="text-xs text-amber-800">
          {pending > 0 ? `${pending} awaiting your decision` : "reviewed"}
        </span>
      </div>

      <Provenance ungrounded={state.ungrounded} sources={state.sources} />

      <div className="mt-3 space-y-3">
        {state.useCases.map((uc) => (
          <UseCaseCard key={uc.id} useCase={uc} decide={decide} />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={approved === 0 || sending}
          onClick={() => send("Design my stack around the use cases I approved.")}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          Design my stack →
        </button>
        <p className="text-xs text-amber-900">
          {approved === 0
            ? "Approve at least one to continue."
            : "The Architect designs around what you approved."}
        </p>
      </div>
    </div>
  );
}

function UseCaseCard({
  useCase: uc,
  decide,
}: {
  useCase: UseCase;
  decide: (d: Record<string, "approved" | "rejected">) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function set(status: "approved" | "rejected") {
    setBusy(true);
    try {
      await decide({ [uc.id]: status });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={[
        "rounded-xl border bg-white p-4 transition",
        uc.status === "approved"
          ? "border-emerald-300 bg-emerald-50/40"
          : uc.status === "rejected"
            ? "border-slate-200 opacity-55"
            : "border-slate-200",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-sm font-medium text-slate-900">{uc.title}</h3>
        <div className="flex shrink-0 gap-1.5">
          <Chip label="Impact" level={uc.impact} />
          <Chip label="Complexity" level={uc.complexity} />
        </div>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-slate-600">{uc.description}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{uc.businessValue}</p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => set("approved")}
          className={[
            "rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40",
            uc.status === "approved"
              ? "bg-emerald-600 text-white"
              : "border border-slate-300 text-slate-700 hover:border-emerald-500 hover:text-emerald-700",
          ].join(" ")}
        >
          {uc.status === "approved" ? "✓ Approved" : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => set("rejected")}
          className={[
            "rounded-lg px-3 py-1.5 text-xs transition disabled:opacity-40",
            uc.status === "rejected"
              ? "bg-slate-700 font-medium text-white"
              : "border border-slate-300 text-slate-500 hover:border-slate-500 hover:text-slate-800",
          ].join(" ")}
        >
          {uc.status === "rejected" ? "Rejected" : "Reject"}
        </button>
      </div>
    </article>
  );
}

/**
 * Where the use cases came from, stated plainly. A web result presented as a curated case
 * study is the failure mode both design docs name, so the label and the links are the fix.
 */
function Provenance({
  ungrounded,
  sources,
}: {
  ungrounded?: boolean;
  sources?: { title: string; url: string }[];
}) {
  if (ungrounded) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
        Reasoned from your stated bottleneck — no case studies were retrieved, so treat the
        figures below as estimates rather than researched findings.
      </p>
    );
  }
  if (!sources?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Grounded in</p>
      <ul className="mt-1.5 space-y-1">
        {sources.map((s) => (
          <li key={s.url} className="truncate text-xs">
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="text-slate-600 underline decoration-slate-300 hover:text-slate-900"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-medium tracking-wide text-slate-500 uppercase">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value ?? "—"}</dd>
    </div>
  );
}

function Bullets({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-xs text-slate-400">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((item) => (
          <li key={item} className="text-sm leading-relaxed text-slate-700">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const TONE: Record<Level, string> = {
  High: "bg-slate-900 text-white",
  Medium: "bg-slate-200 text-slate-700",
  Low: "bg-slate-100 text-slate-500",
};

function Chip({ label, level }: { label: string; level: Level }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${TONE[level]}`}>
      {label} {level}
    </span>
  );
}
