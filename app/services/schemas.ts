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

export type DiscoveryResult =
  | { status: "asking"; question: string }
  | { status: "complete"; needsAssessment: Required<NeedsAssessment> };

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
          business_value: z.string().min(1),
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
