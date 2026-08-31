/**
 * The parse boundary. This is the ONLY place snake_case exists.
 *
 * Every agent emits snake_case (docs/AGENT_PROMPTS.md); every interface in app/types.ts is
 * camelCase (docs/FIRESTORE_SCHEMA.md §2). The reference implementation assigns straight
 * across that gap and silently produces `undefined` in the UI. Each schema below parses
 * what the model actually emits and transforms it into the type the rest of the app uses.
 *
 * Nothing downstream of this file should ever reference a snake_case key.
 */

import { z } from "zod";
import type {
  AgentState,
  Partner,
  Proposal,
  Estimate,
  Reliability,
  ArchitectureStack,
  ChangeManagementPlan,
  NeedsAssessment,
  RoadmapPhase,
  UseCase,
} from "../types.ts";

const Level = z.enum(["High", "Medium", "Low"]);

// --- discovery ----------------------------------------------------------------
// Two branches. docs/AGENT_PROMPTS.md §1 specifies only "complete"; the "asking" branch is
// added here and in the prompt so completion is a parsed discriminant, not a string match.

const DiscoveryRaw = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("asking"),
    question: z.string().min(1),
  }),
  z.object({
    status: z.literal("complete"),
    summary: z.string().min(1),
    primary_objective: z.string().min(1),
    data_readiness: Level,
    identified_bottleneck: z.string().min(1),
  }),
]);

/** Only the four fields the pipeline gates on. The deep-dive fields stay optional forever. */
type CoreNeeds = Required<
  Pick<NeedsAssessment, "summary" | "primaryObjective" | "dataReadiness" | "identifiedBottleneck">
>;

export type DiscoveryResult =
  | { status: "asking"; question: string }
  | { status: "complete"; needsAssessment: CoreNeeds };

export const DiscoveryOutput = DiscoveryRaw.transform((r): DiscoveryResult =>
  r.status === "asking"
    ? { status: "asking", question: r.question }
    : {
        status: "complete",
        needsAssessment: {
          summary: r.summary,
          primaryObjective: r.primary_objective,
          dataReadiness: r.data_readiness,
          identifiedBottleneck: r.identified_bottleneck,
        },
      },
);

// --- research -----------------------------------------------------------------
// The Analyst emits no `status`; UseCase requires one. Defaulting it here is what gives
// the approval gate (ARCHITECTURE.md §6.2) something to flip.

export const UseCasesOutput = z
  .object({
    use_cases: z
      .array(
        z.object({
          id: z.string().optional(),
          title: z.string().min(1),
          description: z.string().min(1),
          impact: Level,
          complexity: Level,
          // A figure is required, not requested. The prompt asks for "reduces processing time
          // by 40%" and not "improves efficiency", and one run in six ignored it — caught by
          // scripts/eval.ts, scored 5/5 by the judge. Enforcing it here routes the failure into
          // the repair re-prompt, which fixes it with the exact error rather than by hoping.
          business_value: z.string().min(1).regex(/\d/, "business_value must contain a figure"),
        }),
      )
      .min(1),
  })
  .transform(({ use_cases }): UseCase[] =>
    use_cases.map((u, i) => ({
      id: u.id ?? `uc-${i + 1}`,
      title: u.title,
      description: u.description,
      impact: u.impact,
      complexity: u.complexity,
      businessValue: u.business_value,
      status: "suggested",
    })),
  );

// --- eval judge ---------------------------------------------------------------
// Not a product path: scripts/eval.ts scores agent output with it. It lives here because this
// is where snake_case is translated, and `role_fit` is snake_case like everything else.

export const JudgeOutput = z
  .object({
    specificity: z.number().min(1).max(5),
    grounding: z.number().min(1).max(5),
    role_fit: z.number().min(1).max(5),
    reason: z.string().min(1),
  })
  .transform((r) => ({
    specificity: r.specificity,
    grounding: r.grounding,
    roleFit: r.role_fit,
    reason: r.reason,
    score: (r.specificity + r.grounding + r.role_fit) / 3,
  }));

// --- architecture -------------------------------------------------------------

export const ArchitectureOutput = z
  .object({
    architecture_stack: z.object({
      models: z.array(z.string()).min(1),
      infrastructure: z.array(z.string()).min(1),
      frameworks: z.array(z.string()),
    }),
    security_considerations: z.string().min(1),
  })
  .transform((r): ArchitectureStack => ({
    models: r.architecture_stack.models,
    infrastructure: r.architecture_stack.infrastructure,
    frameworks: r.architecture_stack.frameworks,
    securityConsiderations: r.security_considerations,
  }));

// --- roadmap ------------------------------------------------------------------

export const RoadmapOutput = z
  .object({
    phases: z
      .array(
        z.object({
          phase_name: z.string().min(1),
          duration: z.string().min(1),
          key_deliverables: z.array(z.string()).min(1),
          resources_required: z.array(z.string()),
        }),
      )
      .min(1),
  })
  .transform(({ phases }): RoadmapPhase[] =>
    phases.map((p) => ({
      phaseName: p.phase_name,
      duration: p.duration,
      keyDeliverables: p.key_deliverables,
      resourcesRequired: p.resources_required,
    })),
  );

// --- training -----------------------------------------------------------------

export const ChangePlanOutput = z
  .object({
    change_management_plan: z.object({
      upskilling_paths: z
        .array(
          z.object({
            role: z.string().min(1),
            skills_required: z.array(z.string()),
            recommended_training: z.string().min(1),
            time_commitment: z.string().min(1),
          }),
        )
        .min(1),
      communication_strategy: z.object({
        leadership_narrative: z.string().min(1),
        mitigating_concerns: z.array(z.string()),
      }),
      adoption_kpis: z.array(z.string()),
    }),
  })
  .transform(({ change_management_plan: p }): ChangeManagementPlan => ({
    upskillingPaths: p.upskilling_paths.map((u) => ({
      role: u.role,
      skillsRequired: u.skills_required,
      recommendedTraining: u.recommended_training,
      timeCommitment: u.time_commitment,
    })),
    communicationStrategy: {
      leadershipNarrative: p.communication_strategy.leadership_narrative,
      mitigatingConcerns: p.communication_strategy.mitigating_concerns,
    },
    adoptionKpis: p.adoption_kpis,
  }));

// --- post-completion follow-ups -----------------------------------------------
// The `complete` stage used to be a dead end. The Reviser decides what a follow-up actually
// is: a question, an edit to one section, or a request that invalidates work upstream. Each
// patch reuses the schema its original agent emits, so a revised section crosses exactly the
// same translation boundary as a generated one.

const REWIND_STAGES = ["research", "architecture", "roadmap", "training"] as const;

const Patch = z.discriminatedUnion("target", [
  z.object({ target: z.literal("use_cases"), patch: UseCasesOutput }),
  z.object({ target: z.literal("architecture"), patch: ArchitectureOutput }),
  z.object({ target: z.literal("roadmap"), patch: RoadmapOutput }),
  z.object({ target: z.literal("training"), patch: ChangePlanOutput }),
]);

const ReviseRaw = z.discriminatedUnion("action", [
  z.object({ action: z.literal("answer"), reply: z.string().min(1) }),
  z.object({ action: z.literal("revise"), reply: z.string().min(1), revision: Patch }),
  z.object({ action: z.literal("rerun"), reply: z.string().min(1), from: z.enum(REWIND_STAGES) }),
]);

export type ReviseResult =
  | { action: "answer"; reply: string }
  /** A partial state, so the caller applies it by spreading — no field names to keep in step. */
  | { action: "revise"; reply: string; patch: Partial<AgentState> }
  | { action: "rerun"; reply: string; from: (typeof REWIND_STAGES)[number] };

export const ReviseOutput = ReviseRaw.transform((r): ReviseResult => {
  if (r.action !== "revise") return r;

  const { revision } = r;
  const patch: Partial<AgentState> =
    revision.target === "use_cases"
      ? { useCases: revision.patch }
      : revision.target === "architecture"
        ? { architectureStack: revision.patch }
        : revision.target === "roadmap"
          ? { roadmapPhases: revision.patch }
          : { changeManagementPlan: revision.patch };

  return { action: "revise", reply: r.reply, patch };
});

// --- sourcing -----------------------------------------------------------------
// The only agent whose output names real organisations, so the schema carries the rule: a
// partner without a URL is not a partner. `.min(1).url()` is doing real work here — it turns a
// fabricated firm into a validation failure, which the repair re-prompt then has to answer for.

export const SourcingOutput = z
  .object({
    reply: z.string().min(1),
    partners: z
      .array(
        z.object({
          name: z.string().min(1),
          country: z.string().min(1),
          delivered: z.string().min(1),
          fit: z.string().min(1),
          source_url: z.string().min(1).url(),
        }),
      )
      .default([]),
    proposal: z.object({
      scope: z.string().min(1),
      phases: z
        .array(
          z.object({
            phase_name: z.string().min(1),
            person_weeks: z.number().positive(),
            partner_role: z.string().min(1),
          }),
        )
        .min(1),
      budget_range: z.string().min(1),
      currency: z.string().min(1),
      next_step: z.string().min(1),
    }),
  })
  .transform((r) => ({
    reply: r.reply,
    partners: r.partners.map((p): Partner => ({
      name: p.name,
      country: p.country,
      delivered: p.delivered,
      fit: p.fit,
      sourceUrl: p.source_url,
    })),
    proposal: {
      scope: r.proposal.scope,
      phases: r.proposal.phases.map((p) => ({
        phaseName: p.phase_name,
        personWeeks: p.person_weeks,
        partnerRole: p.partner_role,
      })),
      budgetRange: r.proposal.budget_range,
      currency: r.proposal.currency,
      nextStep: r.proposal.next_step,
    } satisfies Proposal,
// --- generated files ----------------------------------------------------------
// Shared by every capability that hands over a file: diagrams, platform, code, the runbook.
// One schema, so the artifact plumbing and the Canvas never learn what produced a file.

export const ArtifactsOutput = z
  .object({
    reply: z.string().min(1),
    files: z
      .array(
        z.object({
          path: z.string().min(1).max(120),
          language: z.string().min(1).max(30),
          summary: z.string().min(1),
          content: z.string().min(1),
        }),
      )
      .min(1)
      .max(8),
  })
  .transform((r) => ({
    reply: r.reply,
    // No id or producedBy here: the caller knows which specialist ran, and the id belongs to
    // the merge (which reuses the id of a file it replaces).
    files: r.files.map((f) => ({
      path: f.path.replace(/^[./]+/, ""),
      language: f.language.toLowerCase(),
      summary: f.summary,
      content: f.content,
    })),
  }));

// --- cost and level of effort -------------------------------------------------

export const EstimateOutput = z
  .object({
    reply: z.string().min(1),
    currency: z.string().min(1).max(8),
    run_rate: z
      .array(
        z.object({
          component: z.string().min(1),
          unit: z.string().min(1),
          quantity: z.number().nonnegative(),
          unit_cost: z.number().nonnegative(),
          monthly_cost: z.number().nonnegative(),
          basis: z.string().min(1),
        }),
      )
      .min(1),
    effort: z
      .array(
        z.object({
          phase: z.string().min(1),
          role: z.string().min(1),
          days: z.number().positive(),
          day_rate: z.number().positive(),
          cost: z.number().nonnegative(),
        }),
      )
      .min(1),
    assumptions: z.array(z.string()).min(1),
  })
  .transform((r) => ({
    reply: r.reply,
    estimate: {
    currency: r.currency,
    runRate: {
      lines: r.run_rate.map((l) => ({
        component: l.component,
        unit: l.unit,
        quantity: l.quantity,
        unitCost: l.unit_cost,
        monthlyCost: l.monthly_cost,
        basis: l.basis,
      })),
      // Totalled here, not by the model. Arithmetic is not a thing to ask an LLM for when the
      // lines are already structured.
      monthlyTotal: r.run_rate.reduce((n, l) => n + l.monthly_cost, 0),
    },
    effort: {
      lines: r.effort.map((l) => ({
        phase: l.phase,
        role: l.role,
        days: l.days,
        dayRate: l.day_rate,
        cost: l.cost,
      })),
      totalDays: r.effort.reduce((n, l) => n + l.days, 0),
      totalCost: r.effort.reduce((n, l) => n + l.cost, 0),
    },
    assumptions: r.assumptions,
    // Set by the caller from knowledge/pricing.json, never by the model about itself.
    pricesVerified: false,
    } satisfies Estimate,
  }));

// --- reliability --------------------------------------------------------------

export const ReliabilityOutput = z
  .object({
    reply: z.string().min(1),
    slos: z
      .array(
        z.object({
          name: z.string().min(1),
          sli: z.string().min(1),
          objective: z.string().min(1),
          window: z.string().min(1),
          rationale: z.string().min(1),
        }),
      )
      .min(1),
    error_budget: z.string().min(1),
    alerts: z
      .array(
        z.object({
          name: z.string().min(1),
          condition: z.string().min(1),
          severity: z.enum(["page", "ticket"]),
        }),
      )
      .min(1),
    files: z
      .array(
        z.object({
          path: z.string().min(1),
          language: z.string().min(1),
          summary: z.string().min(1),
          content: z.string().min(1),
        }),
      )
      .default([]),
  })
  .transform((r) => ({
    reply: r.reply,
    reliability: {
      slos: r.slos,
      errorBudget: r.error_budget,
      alerts: r.alerts,
    } satisfies Reliability,
    files: r.files.map((f) => ({ ...f, language: f.language.toLowerCase() })),
  }));

// --- the needs deep dive ------------------------------------------------------
// Enriches what discovery already established. Never contradicts it: the four pipeline fields
// are not in this schema at all, so a deep dive cannot move the consultation.

export const DeepNeedsOutput = z
  .object({
    reply: z.string().min(1),
    data_estate: z.string().min(1),
    integrations: z.array(z.string()),
    compliance_regimes: z.array(z.string()),
    team_capability: z.string().min(1),
    volumes: z.string().min(1),
    constraints: z.array(z.string()),
  })
  .transform((r) => ({
    reply: r.reply,
    needs: {
      dataEstate: r.data_estate,
      integrations: r.integrations,
      complianceRegimes: r.compliance_regimes,
      teamCapability: r.team_capability,
      volumes: r.volumes,
      constraints: r.constraints,
    } satisfies Partial<NeedsAssessment>,
  }));
