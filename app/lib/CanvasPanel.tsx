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
import { AGENT_NAMES } from "../agents/names.ts";
import { planDeepDive } from "../capabilities.ts";
import { agentPersona } from "./agentStatus.ts";
import { Artifacts } from "./Artifacts.tsx";
import type { Decision } from "./api.ts";
import { useConsultation } from "./consultation.ts";
import { selectExportUseCases } from "./exportView.ts";
import { CheckIcon } from "./icons.tsx";
import { buildTimeline } from "./timeline.ts";
import type { AgentName, Estimate, Level, Reliability, RoadmapPhase, Sourcing, UseCase } from "../types.ts";

export function CanvasPanel() {
  const { state, profile, artifacts, decide, error } = useConsultation();
  const { needsAssessment: needs, useCases, architectureStack, roadmapPhases } = state;
  const plan = state.changeManagementPlan;
  const pending = useCases.filter((uc) => uc.status === "suggested").length;
  const approvedIds = new Set(selectExportUseCases(useCases).approved.map((uc) => uc.id));

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
      {/* A failed decide() sets this same error the chat's banner reads - but /dashboard/canvas
          has no chat next to it, so without this an approve/reject click that failed here
          would fail silently (UI-6). */}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
          {error}
        </p>
      )}

      {/* Screen never needs to know who is looking - the export does, since it leaves the
          product. Invisible until @media print picks it up. */}
      <header className="hidden border-b border-slate-300 pb-4 print:block">
        <p className="text-lg font-semibold text-slate-900">AI Enablement Strategy</p>
        <p className="mt-1 text-sm text-slate-600">
          {profile.name} · {profile.role} · {profile.industry}
        </p>
        <p className="text-xs text-slate-400">
          {new Date().toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </header>
      <DeepDiveCallToAction />

      {needs.identifiedBottleneck && (
        <Section id="section-bottleneck" title="The bottleneck" agent={AGENT_NAMES.discovery}>
          <p className="text-sm leading-relaxed text-slate-700">{needs.summary}</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <Fact label="Bottleneck" value={needs.identifiedBottleneck} />
            <Fact label="Primary objective" value={needs.primaryObjective} />
            <Fact label="Data readiness" value={needs.dataReadiness} />
          </dl>
        </Section>
      )}

      <Section
        id="section-use-cases"
        title="Use cases"
        agent={AGENT_NAMES.analyst}
        aside={
          pending > 0 ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              {pending} awaiting your decision
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              {useCases.filter((uc) => uc.status === "approved").length} approved
            </span>
          )
        }
      >
        <Provenance ungrounded={state.ungrounded} sources={state.sources} />

        {/* The screen keeps every use case, at whatever status, revisable. The export is the
            artifact, not the audit log: only what shipped gets a page (exportView.ts). */}
        <div className="mt-4 space-y-3">
          {useCases.map((uc) => (
            <UseCaseCard
              key={uc.id}
              useCase={uc}
              decide={decide}
              printHidden={!approvedIds.has(uc.id)}
            />
          ))}
        </div>

        {pending === 0 && !architectureStack && (
          <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            Reviewed - send a message and your Technical Architect will design around the ones
            you approved.
          </p>
        )}
      </Section>

      {architectureStack && (
        <div className="animate-section-enter">
          <Section id="section-stack" title="Recommended stack" agent={AGENT_NAMES.architect}>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Fact label="Models" value={architectureStack.models.join(", ")} />
              <Fact label="Infrastructure" value={architectureStack.infrastructure.join(", ")} />
              <Fact label="Frameworks" value={architectureStack.frameworks.join(", ") || "-"} />
            </dl>
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-900">
              <span className="font-medium">Compliance risk · </span>
              {architectureStack.securityConsiderations}
            </p>
          </Section>
        </div>
      )}

      {roadmapPhases && roadmapPhases.length > 0 && (
        <div className="animate-section-enter">
          <Section id="section-roadmap" title="Roadmap" agent={AGENT_NAMES.projectManager}>
            <RoadmapTimeline phases={roadmapPhases} />

            {/* Below sm, and always for print (a collapsed bar means nothing on paper): the
                same phases as a plain list, nothing hidden behind a click. */}
            <ol className="space-y-3 sm:hidden print:block!">
              {roadmapPhases.map((phase, i) => (
                <li
                  key={phase.phaseName}
                  className="rounded-xl border border-slate-200 bg-white p-4 break-inside-avoid"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-medium text-slate-900">
                      <span className="text-slate-400">{i + 1}. </span>
                      {phase.phaseName}
                    </h3>
                    <span className="text-xs whitespace-nowrap text-slate-500">
                      {phase.duration}
                    </span>
                  </div>
                  <Bullets label="Deliverables" items={phase.keyDeliverables} />
                  <Bullets label="Resources" items={phase.resourcesRequired} />
                </li>
              ))}
            </ol>
          </Section>
        </div>
      )}

      {plan && (
        <div className="animate-section-enter">
          <Section id="section-people" title="People and change" agent={AGENT_NAMES.changeCoach}>
            <div className="space-y-3">
              {plan.upskillingPaths.map((path) => (
                <div
                  key={path.role}
                  className="rounded-xl border border-slate-200 bg-white p-4 break-inside-avoid"
                >
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

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 break-inside-avoid">
              <p className="text-sm leading-relaxed text-slate-700">
                {plan.communicationStrategy.leadershipNarrative}
              </p>
              <Bullets
                label="Concerns to address"
                items={plan.communicationStrategy.mitigatingConcerns}
              />
              <Bullets label="Adoption KPIs" items={plan.adoptionKpis} />
            </div>
          </Section>
        </div>
      )}

      {state.sourcing && (
        <div className="animate-section-enter">
          <PartnersAndProposal sourcing={state.sourcing} />
        </div>
      )}

      {state.estimate && <EstimateSection estimate={state.estimate} />}
      {state.reliability && <ReliabilitySection reliability={state.reliability} />}

      {artifacts.length > 0 && (
        <Section title="Handover" aside={<span className="text-xs text-slate-500">{artifacts.length} files</span>}>
          <Artifacts artifacts={artifacts} />
        </Section>
      )}
    </div>
  );
}

/**
 * Who could build it, and what it would take.
 *
 * Every firm carries a clickable citation, for the same reason the use cases do: this is the
 * one section naming real organisations, and a name without a source is indistinguishable from
 * an invented one. When the search found nothing the list is empty and says so - the proposal
 * still stands, because it derives from the approved roadmap rather than from any partner.
 */
function PartnersAndProposal({ sourcing }: { sourcing: Sourcing }) {
  const { partners, proposal } = sourcing;

  return (
    <Section
      id="section-partners"
      title="Partners and proposal"
      agent={AGENT_NAMES.sourcing}
      aside={
        <span className="text-xs text-slate-500">
          {partners.length > 0 ? `${partners.length} shortlisted` : "no verified partners"}
        </span>
      }
    >
      {partners.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
          The search returned no implementation partners we could verify, so none are listed. An
          unverified shortlist would be worse than an empty one - the proposal below is derived
          from your approved roadmap and does not depend on a partner being named.
        </p>
      ) : (
        <div className="space-y-3">
          {partners.map((partner) => (
            <div
              key={partner.sourceUrl}
              className="rounded-xl border border-slate-200 bg-white p-4 break-inside-avoid"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium text-slate-900">{partner.name}</h3>
                <span className="text-xs whitespace-nowrap text-slate-500">{partner.country}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{partner.delivered}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{partner.fit}</p>
              <a
                href={partner.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block truncate text-xs text-slate-500 underline decoration-slate-300 hover:text-slate-900"
              >
                {partner.sourceUrl}
              </a>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 break-inside-avoid">
        <p className="text-sm leading-relaxed text-slate-700">{proposal.scope}</p>

        <dl className="mt-3 space-y-1.5">
          {proposal.phases.map((phase) => (
            <div key={phase.phaseName} className="flex items-baseline justify-between gap-3">
              <dt className="text-sm text-slate-800">{phase.phaseName}</dt>
              <dd className="text-xs whitespace-nowrap text-slate-500">
                {phase.personWeeks} person-weeks · {phase.partnerRole}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-sm font-medium text-slate-900">{proposal.budgetRange}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          <span className="font-medium">Next · </span>
          {proposal.nextStep}
        </p>
      </div>
    </Section>
  );
}

/**
 * Offered, not started. Completion is the moment the depth is worth having, but three minutes
 * and ~50k tokens should not begin because a consultation happened to finish. Disappears once
 * the bench has produced anything, so it is a prompt rather than furniture.
 */
function DeepDiveCallToAction() {
  const { state, artifacts, producing, deepDive } = useConsultation();

  const alreadyRan = artifacts.length > 0 || Boolean(state.estimate) || Boolean(state.reliability);
  if (state.currentStage !== "complete" || alreadyRan) return null;

  const plan = planDeepDive(state);
  if (plan.run.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-3.5">
      <div>
        <p className="text-sm font-medium text-white">Your strategy is ready.</p>
        <p className="mt-0.5 text-xs text-indigo-100">
          A deep dive brings in {plan.run.length} more specialists - diagrams, cost and effort,
          containers and infrastructure, reliability, and code. About three minutes.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void deepDive()}
        disabled={Boolean(producing)}
        className="rounded-lg bg-white px-4 py-2 text-sm font-medium whitespace-nowrap text-indigo-600 transition hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
      >
        {producing ? "Running…" : "Run the deep dive"}
      </button>
    </div>
  );
}

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

function EstimateSection({ estimate }: { estimate: Estimate }) {
  const { currency } = estimate;

  return (
    <Section
      title="Cost and effort"
      aside={
        <span className="text-xs text-slate-500">
          {money(estimate.effort.totalCost, currency)} to build ·{" "}
          {money(estimate.runRate.monthlyTotal, currency)}/mo to run
        </span>
      }
    >
      {!estimate.pricesVerified && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          The unit prices behind these figures are unverified list prices from
          <span className="font-mono"> knowledge/pricing.json</span>. Check them against the
          source URLs before quoting this to anyone.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Component</th>
              <th className="px-3 py-2 font-medium">Basis</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Per month</th>
            </tr>
          </thead>
          <tbody>
            {estimate.runRate.lines.map((line) => (
              <tr key={line.component} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2 align-top text-slate-800">{line.component}</td>
                <td className="px-3 py-2 align-top text-xs text-slate-500">{line.basis}</td>
                <td className="px-3 py-2 text-right align-top whitespace-nowrap text-slate-900">
                  {money(line.monthlyCost, currency)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-medium">
              <td className="px-3 py-2 text-slate-900" colSpan={2}>
                Monthly run rate
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap text-slate-900">
                {money(estimate.runRate.monthlyTotal, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Phase</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 text-right font-medium">Days</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Cost</th>
            </tr>
          </thead>
          <tbody>
            {estimate.effort.lines.map((line, i) => (
              <tr key={`${line.phase}-${line.role}-${i}`} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2 text-slate-800">{line.phase}</td>
                <td className="px-3 py-2 text-slate-600">{line.role}</td>
                <td className="px-3 py-2 text-right text-slate-600">{line.days}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-slate-900">
                  {money(line.cost, currency)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-medium">
              <td className="px-3 py-2 text-slate-900" colSpan={2}>
                Build
              </td>
              <td className="px-3 py-2 text-right text-slate-900">{estimate.effort.totalDays}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap text-slate-900">
                {money(estimate.effort.totalCost, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Bullets label="Assumptions" items={estimate.assumptions} />
    </Section>
  );
}

function ReliabilitySection({ reliability }: { reliability: Reliability }) {
  return (
    <Section title="Reliability">
      <div className="space-y-3">
        {reliability.slos.map((slo) => (
          <div key={slo.name} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium text-slate-900">{slo.name}</h3>
              <span className="text-xs whitespace-nowrap text-slate-500">
                {slo.objective} over {slo.window}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-slate-500">{slo.sli}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{slo.rationale}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-700">
        <span className="font-medium">Error budget · </span>
        {reliability.errorBudget}
      </p>

      <div className="mt-3 space-y-1.5">
        {reliability.alerts.map((alert) => (
          <div key={alert.name} className="flex items-baseline gap-2 text-sm">
            <span
              className={[
                "rounded-full px-2 py-0.5 text-xs font-medium",
                alert.severity === "page" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600",
              ].join(" ")}
            >
              {alert.severity}
            </span>
            <span className="text-slate-800">{alert.name}</span>
            <span className="text-xs text-slate-500">{alert.condition}</span>
          </div>
        ))}
      </div>
    </Section>
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={approved === 0 || sending}
          onClick={() => send("Design my stack around the use cases I approved.")}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-40"
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
  printHidden = false,
}: {
  useCase: UseCase;
  decide: (d: Record<string, Decision>) => Promise<void>;
  /** Not part of the exported artifact - the case wasn't approved (exportView.ts). */
  printHidden?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  async function set(status: "approved" | "rejected", why?: string) {
    setBusy(true);
    try {
      await decide({ [uc.id]: { status, ...(why ? { reason: why } : {}) } });
    } finally {
      setBusy(false);
    }
  }

  // The rejection lands on the first click; the reason is asked for afterwards and is always
  // skippable. Gating a rejection behind typing would make the fast path slower for everyone
  // to collect a field most people will leave empty.
  async function reject() {
    await set("rejected");
    setAsking(true);
  }

  async function submitReason() {
    const why = reason.trim();
    setAsking(false);
    if (why) await set("rejected", why);
  }

  return (
    <article
      className={[
        "rounded-xl border bg-white p-4 break-inside-avoid transition",
        printHidden ? "print:hidden" : "",
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

      <div className="mt-3 flex items-center gap-2 print:hidden">
        <button
          type="button"
          disabled={busy}
          onClick={() => set("approved")}
          className={[
            "rounded-lg px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-40",
            uc.status === "approved"
              ? "bg-emerald-600 text-white"
              : "border border-slate-300 text-slate-700 hover:border-emerald-500 hover:text-emerald-700",
          ].join(" ")}
        >
          {uc.status === "approved" ? (
            <span className="flex items-center gap-1">
              <CheckIcon className="h-3 w-3" />
              Approved
            </span>
          ) : (
            "Approve"
          )}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={reject}
          className={[
            "rounded-lg px-3 py-1.5 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-40",
            uc.status === "rejected"
              ? "bg-slate-700 font-medium text-white"
              : "border border-slate-300 text-slate-500 hover:border-slate-500 hover:text-slate-800",
          ].join(" ")}
        >
          {uc.status === "rejected" ? "Rejected" : "Reject"}
        </button>
      </div>

      {/* The only feedback in the product that says more than yes or no. It reaches the
          Architect, and it survives a rebuild - so the same idea does not come back. */}
      {asking && (
        <form
          className="mt-2 flex items-center gap-2 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            void submitReason();
          }}
        >
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Why not? Optional - it stops this coming back."
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 transition hover:border-slate-500 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-40"
          >
            {reason.trim() ? "Save" : "Skip"}
          </button>
        </form>
      )}

      {!asking && uc.feedback && (
        <p className="mt-2 text-xs text-slate-500 italic">Your note: {uc.feedback}</p>
      )}
    </article>
  );
}

/**
 * The roadmap as a week-ruled CSS grid - the "Gantt" the pitch promised, downgraded on
 * purpose to a grid (IMPLEMENTATION_PLAN.md §7): one bar per phase, positioned by
 * `timeline.ts`, expandable to the same detail the list shows. sm and up only; below that
 * and for print, `CanvasPanel` falls back to the plain list right below this component.
 */
function RoadmapTimeline({ phases }: { phases: RoadmapPhase[] }) {
  const { lanes, totalWeeks } = buildTimeline(phases);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const columns = { gridTemplateColumns: `repeat(${totalWeeks}, minmax(0, 1fr))` };

  return (
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 sm:block print:hidden!">
      <div className="min-w-xl">
        <div className="grid border-b border-slate-200 pb-2" style={columns}>
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((week) => (
            <div key={week} className="text-[10px] text-slate-500">
              {week === 1 || week % 4 === 1 ? `Wk ${week}` : ""}
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {lanes.map((lane, i) => {
            const phase = phases[i];
            const expanded = expandedPhase === phase.phaseName;
            return (
              <div key={phase.phaseName}>
                <div className="grid" style={columns}>
                  <button
                    type="button"
                    onClick={() => setExpandedPhase(expanded ? null : phase.phaseName)}
                    style={{ gridColumn: `${lane.startWeek} / ${lane.endWeek + 1}` }}
                    aria-expanded={expanded}
                    className={[
                      "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
                      expanded ? "bg-indigo-800" : "bg-indigo-600 hover:bg-indigo-700",
                      lane.open ? "bg-linear-to-r from-indigo-600 to-indigo-600/50" : "",
                    ].join(" ")}
                  >
                    <span className="truncate">{phase.phaseName}</span>
                    <span className="shrink-0 text-[10px] whitespace-nowrap text-slate-300">
                      {phase.keyDeliverables.length}d · {phase.resourcesRequired.length}r
                    </span>
                  </button>
                </div>

                {expanded && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{phase.duration}</p>
                    <Bullets label="Deliverables" items={phase.keyDeliverables} />
                    <Bullets label="Resources" items={phase.resourcesRequired} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
        Reasoned from your stated bottleneck - no case studies were retrieved, so treat the
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
  id,
  title,
  agent,
  aside,
  children,
}: {
  /** Anchor the chat rail deep-links to when a reply is attributed to this section's agent. */
  id?: string;
  title: string;
  /** Whose section this is (UI-10) - renders that agent's icon in their color next to the title. */
  agent?: AgentName;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const persona = agent ? agentPersona(agent) : null;
  return (
    <section id={id} className="scroll-mt-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase">
          {persona && <persona.Icon className={`h-3.5 w-3.5 ${persona.accent.text}`} />}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value ?? "-"}</dd>
    </div>
  );
}

function Bullets({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-xs text-slate-500">{label}</p>
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
