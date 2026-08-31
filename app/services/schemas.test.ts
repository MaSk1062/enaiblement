/**
 * The one check. If the snake_case -> camelCase translation breaks, this fails.
 * Run: node --test app/services/schemas.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ArchitectureOutput,
  ChangePlanOutput,
  DiscoveryOutput,
  RoadmapOutput,
  UseCasesOutput,
} from "./schemas.ts";

test("discovery: asking branch stays a question", () => {
  const r = DiscoveryOutput.parse({ status: "asking", question: "What slows you down most?" });
  assert.equal(r.status, "asking");
  assert.equal(r.status === "asking" && r.question, "What slows you down most?");
});

test("discovery: complete branch translates every key to camelCase", () => {
  const r = DiscoveryOutput.parse({
    status: "complete",
    summary: "Claims triage is manual end to end.",
    primary_objective: "Cut claims cycle time",
    data_readiness: "Medium",
    identified_bottleneck: "Manual claims triage",
  });
  assert.equal(r.status, "complete");
  assert.deepEqual(r.status === "complete" && r.needsAssessment, {
    summary: "Claims triage is manual end to end.",
    primaryObjective: "Cut claims cycle time",
    dataReadiness: "Medium",
    identifiedBottleneck: "Manual claims triage",
  });
});

test("research: business_value becomes businessValue and status defaults to suggested", () => {
  const [uc] = UseCasesOutput.parse({
    use_cases: [
      {
        title: "Automated claims triage",
        description: "Route incoming claims by complexity.",
        impact: "High",
        complexity: "Medium",
        business_value: "Reduces processing time by 40%",
      },
    ],
  });
  assert.equal(uc.businessValue, "Reduces processing time by 40%");
  assert.equal(uc.status, "suggested"); // the approval gate needs this
  assert.equal(uc.id, "uc-1"); // id is optional in the prompt, so it is derived
  assert.ok(!("business_value" in uc), "no snake_case key may escape this boundary");
});

test("architecture: security_considerations is flattened onto the stack", () => {
  const s = ArchitectureOutput.parse({
    architecture_stack: {
      models: ["Gemini 3.5 Flash"],
      infrastructure: ["Vertex AI"],
      frameworks: ["LangChain"],
    },
    security_considerations: "HIPAA: de-identify PHI before inference.",
  });
  assert.equal(s.securityConsiderations, "HIPAA: de-identify PHI before inference.");
  assert.deepEqual(s.models, ["Gemini 3.5 Flash"]);
});

test("roadmap and change plan translate their nested keys", () => {
  const [phase] = RoadmapOutput.parse({
    phases: [
      {
        phase_name: "Pilot & Proof of Concept",
        duration: "Weeks 1-4",
        key_deliverables: ["Triage prototype"],
        resources_required: ["1x Prompt Engineer"],
      },
    ],
  });
  assert.equal(phase.phaseName, "Pilot & Proof of Concept");
  assert.deepEqual(phase.keyDeliverables, ["Triage prototype"]);

  const plan = ChangePlanOutput.parse({
    change_management_plan: {
      upskilling_paths: [
        {
          role: "Claims adjuster",
          skills_required: ["Prompting"],
          recommended_training: "Hands-on workshop",
          time_commitment: "4 hours",
        },
      ],
      communication_strategy: {
        leadership_narrative: "AI handles triage so adjusters handle judgement calls.",
        mitigating_concerns: ["Job security"],
      },
      adoption_kpis: ["% of claims auto-triaged"],
    },
  });
  assert.equal(plan.upskillingPaths[0].timeCommitment, "4 hours");
  assert.equal(
    plan.communicationStrategy.leadershipNarrative,
    "AI handles triage so adjusters handle judgement calls.",
  );
});

test("a malformed payload is rejected, so the stage cannot advance on it", () => {
  // The failure mode the string-match in docs/FIRESTORE_SCHEMA.md would let through:
  // prose that merely mentions the phrase.
  assert.throws(() => DiscoveryOutput.parse({ reply: 'I would say "status": "complete" here.' }));
  // Wrong enum value.
  assert.throws(() =>
    UseCasesOutput.parse({
      use_cases: [
        {
          title: "x",
          description: "y",
          impact: "Enormous",
          complexity: "Low",
          business_value: "z",
        },
      ],
    }),
  );
  // Empty use case list is not a valid research result.
  assert.throws(() => UseCasesOutput.parse({ use_cases: [] }));
});
