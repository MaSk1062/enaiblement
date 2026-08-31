/**
 * Agent evals — the only thing in the repo that asserts a PROMPT works.
 *
 *   npm run eval
 *   npm run eval -- --k 1                 # one run per case, the fast loop
 *   npm run eval -- --agent architect     # one agent
 *
 * `schemas.test.ts` proves the translation boundary and `stageMachine.test.ts` proves the
 * routing, but both mock the model out. This calls the real agents, with the real prompts,
 * against the real model, and asks two different questions about the answer:
 *
 *   - Objective checks. Deterministic, cheap, and nothing to argue with: does discovery branch
 *     correctly, does the Architect stay inside the menu it was given, does every business
 *     value carry a figure.
 *   - A judge. A second model call scoring specificity, grounding and role fit 1-5, because
 *     "schema-valid and completely generic" is the failure both design docs name and no
 *     assertion can see it.
 *
 * Repair rate, latency and tokens are read off the telemetry the app already emits, so the
 * eval measures the same instrument production does.
 *
 * Exits non-zero when an agent falls below the thresholds, so it CAN gate a deploy. It is not
 * wired into one — and it draws on the same Vertex quota as the demo, so do not run it during
 * a rehearsal.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run as discovery } from "../app/agents/discovery.ts";
import { run as analyst } from "../app/agents/analyst.ts";
import { run as architect, modelMenu } from "../app/agents/architect.ts";
import { run as projectManager } from "../app/agents/projectManager.ts";
import { run as changeCoach } from "../app/agents/changeCoach.ts";
import judgePrompt from "../app/agents/prompts/judge.md?raw";
import { generateStructured } from "../app/services/gemini.ts";
import { JudgeOutput } from "../app/services/schemas.ts";
import { onMenu } from "./menuCheck.ts";
import type { ArchitectureStack, ChatMessage, UseCase } from "../app/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const K = Number(process.argv[process.argv.indexOf("--k") + 1]) || 3;
const ONLY = process.argv.includes("--agent")
  ? process.argv[process.argv.indexOf("--agent") + 1]
  : undefined;

// Thresholds. Objective checks are pass/fail and must be perfect; the judge is a tripwire for
// prompt regressions between runs, so 3.5 is "not obviously generic", not "excellent".
const MIN_PASS_RATE = 1;
const MIN_JUDGE_SCORE = 3.5;

// --- fixtures ------------------------------------------------------------------

const message = (sender: "user" | "agent", text: string): ChatMessage => ({
  id: crypto.randomUUID(),
  sender,
  text,
  timestamp: new Date().toISOString(),
  ...(sender === "agent" ? { agentName: "Discovery Consultant" as const } : {}),
});

const HEALTHCARE = { name: "Ada", role: "CTO/CIO", industry: "Healthcare" } as const;

/** A transcript that already contains every fact discovery is looking for. */
const COMPLETE_TRANSCRIPT: ChatMessage[] = [
  message("agent", "What is the bottleneck you most want AI to solve?"),
  message("user", "Prior authorisation. Four thousand a month, every one reviewed by hand."),
  message("agent", "How long does that take today, and what does it cost you?"),
  message("user", "Eighteen days end to end, and about 30% bounce back for missing documents."),
  message("agent", "What data do you hold, and how clean is it?"),
  message(
    "user",
    "Five years of claims in a warehouse, well structured, plus an EHR export we trust. " +
      "We want the cycle time halved inside two quarters.",
  ),
];

const GROUNDED = {
  documents: [
    {
      id: "kb-1",
      title: "Ochsner Health — prior authorisation triage",
      content:
        "Ochsner Health applied a document-extraction model to prior authorisation packets, " +
        "auto-assembling the clinical evidence payers ask for. Turnaround fell from 19 days " +
        "to 7 and the resubmission rate dropped by 44%.",
      sourceUrl: "https://example.com/ochsner",
    },
  ],
  sources: [{ title: "example.com", url: "https://example.com/ochsner" }],
  grounded: true,
  source: "knowledge_base" as const,
};

const UNGROUNDED = { documents: [], sources: [], grounded: false, source: "none" as const };

const APPROVED: UseCase[] = [
  {
    id: "uc-1",
    title: "Automated prior authorisation packet assembly",
    description:
      "Extract the clinical evidence a payer requires from the EHR and assemble the packet " +
      "before a human reviews it.",
    impact: "High",
    complexity: "Medium",
    businessValue: "Cuts prior authorisation turnaround from 18 days to under 7",
    status: "approved",
  },
];

const STACK: ArchitectureStack = {
  models: ["Gemini 3.5 Flash"],
  infrastructure: ["Vertex AI", "Cloud Run", "Firestore"],
  frameworks: ["Google ADK"],
  securityConsiderations:
    "PHI never leaves the VPC; HIPAA BAA with the model provider and audit logging on every read.",
};

// --- the checks ----------------------------------------------------------------

/** A check returns a failure message, or nothing when it passes. */
type Check = (out: never) => string | undefined;

const hasDigit = (s: string) => /\d/.test(s);

interface EvalCase {
  agent: string;
  name: string;
  /** What the judge is shown as the input the agent was answering. */
  context: string;
  run: () => Promise<unknown>;
  checks: Check[];
}

/**
 * A deliberately NARROW menu, pinned for the run.
 *
 * Checking the Architect against its live searched menu proves nothing: that menu lists every
 * model the Architect would name anyway, so the check passes even with the prompt's "recommend
 * from this list only" constraint deleted — verified by deleting it. Pinning two models makes
 * obedience observable. `modelMenu()` honours this over the search.
 */
const NARROW_MENU = [
  "- Google: Gemini 3.5 Flash (via Vertex AI)",
  "- Anthropic: Claude Sonnet (via Vertex AI Model Garden)",
].join("\n");

/** Resolved once so the Architect check compares against the menu the agent actually used. */
let menu = "";

const CASES: EvalCase[] = [
  {
    agent: "discovery",
    name: "completes when every fact is present",
    context: `A ${HEALTHCARE.role} in ${HEALTHCARE.industry} has stated their bottleneck, its cost, their data readiness and their objective.`,
    run: () =>
      discovery({
        profile: HEALTHCARE,
        messages: COMPLETE_TRANSCRIPT,
        latest: "That is everything — what have you got?",
      }),
    checks: [
      (o: { status: string }) => (o.status === "complete" ? undefined : `status was "${o.status}"`),
      (o: { status: string; needsAssessment?: Record<string, string> }) => {
        if (o.status !== "complete") return "no assessment to check";
        const missing = ["summary", "primaryObjective", "dataReadiness", "identifiedBottleneck"]
          .filter((k) => !o.needsAssessment?.[k]);
        return missing.length ? `empty fields: ${missing.join(", ")}` : undefined;
      },
    ] as Check[],
  },
  {
    agent: "discovery",
    name: "keeps asking when the opener is vague",
    context: `A ${HEALTHCARE.role} in ${HEALTHCARE.industry} has said only "we want to use AI".`,
    run: () =>
      discovery({ profile: HEALTHCARE, messages: [], latest: "We want to use AI somehow." }),
    checks: [
      (o: { status: string }) => (o.status === "asking" ? undefined : `status was "${o.status}"`),
      (o: { question?: string }) =>
        o.question?.includes("?") ? undefined : "the question is not a question",
    ] as Check[],
  },
  {
    agent: "analyst",
    name: "uses the retrieved case study",
    context: `Healthcare CTO, bottleneck "manual prior authorisation review", with one retrieved case study about prior authorisation packet assembly.`,
    run: () =>
      analyst({
        industry: "Healthcare",
        role: "CTO/CIO",
        bottleneck: "manual prior authorisation review taking 18 days",
        retrieval: GROUNDED,
      }),
    checks: [
      (o: UseCase[]) => (o.length === 3 ? undefined : `returned ${o.length} use cases, not 3`),
      (o: UseCase[]) =>
        new Set(o.map((u) => u.title)).size === o.length ? undefined : "duplicate titles",
      (o: UseCase[]) => {
        const vague = o.filter((u) => !hasDigit(u.businessValue));
        return vague.length ? `businessValue without a figure: "${vague[0].businessValue}"` : undefined;
      },
      (o: UseCase[]) => {
        const text = JSON.stringify(o).toLowerCase();
        return ["prior auth", "authorisation", "authorization", "packet", "resubmission"].some((t) =>
          text.includes(t),
        )
          ? undefined
          : "nothing picked up from the retrieved context";
      },
    ] as Check[],
  },
  {
    agent: "analyst",
    name: "still returns three usable use cases with nothing retrieved",
    context: `Retail Department Head, bottleneck "stockouts on fast-moving lines", with NO retrieved context.`,
    run: () =>
      analyst({
        industry: "Retail",
        role: "Department Head",
        bottleneck: "stockouts on fast-moving lines",
        retrieval: UNGROUNDED,
      }),
    checks: [
      (o: UseCase[]) => (o.length === 3 ? undefined : `returned ${o.length} use cases, not 3`),
      (o: UseCase[]) =>
        o.every((u) => u.status === "suggested") ? undefined : "status was not defaulted",
    ] as Check[],
  },
  {
    agent: "architect",
    name: "recommends only from the menu it was given",
    context: `Healthcare CTO/CIO, one approved use case: automated prior authorisation packet assembly.`,
    run: () => architect({ role: "CTO/CIO", approvedUseCases: APPROVED }),
    checks: [
      (o: ArchitectureStack) => {
        const outside = o.models.filter((m) => !onMenu(m, menu));
        return outside.length ? `models outside the menu: ${outside.join(", ")}` : undefined;
      },
      (o: ArchitectureStack) =>
        /hipaa|phi|hitech/i.test(o.securityConsiderations)
          ? undefined
          : "no healthcare-specific compliance risk named",
    ] as Check[],
  },
  {
    agent: "projectManager",
    name: "phases the rollout with deliverables",
    context: `One approved use case and a Vertex AI stack, for a Healthcare CTO/CIO.`,
    run: () => projectManager({ approvedUseCases: APPROVED, stack: STACK }),
    checks: [
      (o: { length: number }) => (o.length >= 3 ? undefined : `only ${o.length} phases`),
      (o: { keyDeliverables: string[]; duration: string }[]) => {
        const thin = o.filter((p) => p.keyDeliverables.length === 0 || !p.duration.trim());
        return thin.length ? `${thin.length} phase(s) missing deliverables or duration` : undefined;
      },
    ] as Check[],
  },
  {
    agent: "changeCoach",
    name: "covers the people affected, with KPIs",
    context: `One approved use case and a Vertex AI stack, for a Healthcare CTO/CIO.`,
    run: () => changeCoach({ approvedUseCases: APPROVED, stack: STACK }),
    checks: [
      (o: { upskillingPaths: { role: string }[] }) =>
        o.upskillingPaths.length > 0 ? undefined : "no upskilling paths",
      (o: { adoptionKpis: string[] }) =>
        o.adoptionKpis.length > 0 ? undefined : "no adoption KPIs",
      (o: { upskillingPaths: { skillsRequired: string[] }[] }) =>
        o.upskillingPaths.every((p) => p.skillsRequired.length > 0)
          ? undefined
          : "an upskilling path names no skills",
    ] as Check[],
  },
];

// --- the harness ---------------------------------------------------------------

interface Telemetry {
  repaired: boolean;
  tokens: number;
}

/**
 * Runs fn with the app's own telemetry captured rather than printed. Reading the same events
 * production reads is the point: the repair rate here is the repair rate there.
 */
async function withTelemetry<T>(fn: () => Promise<T>): Promise<[T, Telemetry]> {
  const original = console.log;
  const events: Record<string, unknown>[] = [];
  console.log = (line: string) => {
    try {
      events.push(JSON.parse(line));
    } catch {
      /* not one of ours */
    }
  };
  try {
    const result = await fn();
    return [
      result,
      {
        repaired: events.some((e) => e.event === "agent.repair"),
        tokens: events.reduce((n, e) => n + (Number(e.totalTokens) || 0), 0),
      },
    ];
  } finally {
    console.log = original;
  }
}

async function judge(context: string, output: unknown) {
  return generateStructured(
    judgePrompt,
    `The agent was given:\n${context}\n\nThe agent returned:\n${JSON.stringify(output, null, 2)}`,
    JudgeOutput,
  );
}

interface Result {
  agent: string;
  case: string;
  passed: boolean;
  failures: string[];
  repaired: boolean;
  tokens: number;
  durationMs: number;
  score?: number;
  reason?: string;
}

async function runCase(c: EvalCase): Promise<Result> {
  const started = Date.now();
  try {
    const [output, telemetry] = await withTelemetry(c.run);
    const failures = c.checks
      .map((check) => check(output as never))
      .filter((f): f is string => Boolean(f));

    const verdict = await judge(c.context, output).catch(() => undefined);

    return {
      agent: c.agent,
      case: c.name,
      passed: failures.length === 0,
      failures,
      repaired: telemetry.repaired,
      tokens: telemetry.tokens,
      durationMs: Date.now() - started,
      score: verdict?.score,
      reason: verdict?.reason,
    };
  } catch (err) {
    // A throw is the worst outcome available: the stage would not have advanced at all.
    return {
      agent: c.agent,
      case: c.name,
      passed: false,
      failures: [`threw: ${(err as Error).message}`],
      repaired: false,
      tokens: 0,
      durationMs: Date.now() - started,
    };
  }
}

const mean = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);

async function main() {
  const cases = CASES.filter((c) => !ONLY || c.agent === ONLY);
  if (cases.length === 0) throw new Error(`No cases for agent "${ONLY}"`);

  process.env.ARCHITECT_MODEL_MENU = NARROW_MENU;
  menu = await modelMenu();

  console.log(`\nevals — ${cases.length} cases x ${K} run(s)\n`);
  const results: Result[] = [];

  for (const c of cases) {
    for (let i = 0; i < K; i++) {
      const r = await runCase(c);
      results.push(r);
      const mark = r.passed ? "PASS" : "FAIL";
      const score = r.score ? `judge ${r.score.toFixed(1)}` : "judge n/a";
      console.log(`  ${mark}  ${r.agent}/${c.name} — ${score}, ${r.durationMs}ms, ${r.tokens} tok`);
      for (const f of r.failures) console.log(`        ! ${f}`);
      if (r.reason && !r.passed) console.log(`        judge: ${r.reason}`);
    }
  }

  const agents = [...new Set(results.map((r) => r.agent))];
  const summary = agents.map((agent) => {
    const rs = results.filter((r) => r.agent === agent);
    return {
      agent,
      runs: rs.length,
      passRate: rs.filter((r) => r.passed).length / rs.length,
      judgeScore: mean(rs.map((r) => r.score).filter((s): s is number => s !== undefined)),
      firstTryParseRate: rs.filter((r) => !r.repaired).length / rs.length,
      meanMs: Math.round(mean(rs.map((r) => r.durationMs))),
      meanTokens: Math.round(mean(rs.map((r) => r.tokens))),
    };
  });

  console.log("\n  agent            pass   judge   1st-try   ms     tokens");
  console.log("  " + "-".repeat(58));
  for (const s of summary) {
    console.log(
      `  ${s.agent.padEnd(16)} ${(s.passRate * 100).toFixed(0).padStart(3)}%  ` +
        `${s.judgeScore.toFixed(2).padStart(5)}   ${(s.firstTryParseRate * 100).toFixed(0).padStart(4)}%  ` +
        `${String(s.meanMs).padStart(5)}  ${String(s.meanTokens).padStart(6)}`,
    );
  }

  mkdirSync(join(ROOT, "evals"), { recursive: true });
  writeFileSync(
    join(ROOT, "evals", "latest.json"),
    `${JSON.stringify({ ranAt: new Date().toISOString(), k: K, summary, results }, null, 2)}\n`,
  );

  const failing = summary.filter(
    (s) => s.passRate < MIN_PASS_RATE || (s.judgeScore > 0 && s.judgeScore < MIN_JUDGE_SCORE),
  );
  console.log(
    failing.length
      ? `\nFAILED: ${failing.map((f) => f.agent).join(", ")} — see evals/latest.json\n`
      : "\nAll agents within thresholds. Baseline written to evals/latest.json\n",
  );
  if (failing.length) process.exitCode = 1;
}

await main();
