/**
 * Writes one finished consultation, so a demo does not depend on the model.
 *
 *   node --env-file=.env scripts/demo.ts --uid <your firebase uid>
 *   node --env-file=.env scripts/demo.ts --uid <uid> --clear
 *
 * IMPLEMENTATION_PLAN §8 called a pre-completed session the insurance policy - "the difference
 * between a bad five minutes and no demo at all" - and it was never built. A Vertex outage, a
 * quota limit or venue wifi now costs the live-generation moment, not the demo: sign in as
 * yourself and the finished strategy is already there.
 *
 * Separate from seed.ts on purpose. That script researches a corpus with live search and takes
 * minutes; this one writes two documents and takes a second, and you want it available when
 * everything else is broken.
 *
 * The session id is deterministic, so running it twice replaces rather than accumulates.
 */

import { Timestamp } from "firebase-admin/firestore";
import { db, message } from "../app/services/firestore.ts";
import type { AgentState, ChatMessage, SessionDocument, SessionUserProfile } from "../app/types.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};

const uid = arg("--uid");
const SESSION_ID = "session_demo_prior_auth";

if (!uid) {
  console.error(
    "Need --uid <firebase uid>. Find yours in the Firebase console under Authentication,\n" +
      "or log `user.uid` from the browser once you are signed in.",
  );
  process.exit(1);
}

const profile: SessionUserProfile = {
  name: "Ada Mensah",
  role: "CTO/CIO",
  industry: "Healthcare",
};

/** The interview, as it actually plays out. Written so a judge reading it learns the product. */
const transcript: [ChatMessage["sender"], string][] = [
  [
    "agent",
    "Welcome, Ada Mensah. I'm your Discovery Consultant. As a CTO/CIO in Healthcare, what's the " +
      "business bottleneck you're most hoping AI can solve?",
  ],
  [
    "user",
    "Prior authorisation. We process about 4,000 a month and every one is assembled by hand.",
  ],
  [
    "agent",
    "That is a large manual load. How long does an authorisation take end to end today, and what " +
      "happens to the ones that do not go through first time?",
  ],
  [
    "user",
    "Eighteen days on average. Roughly 30% come back from the payer for missing documentation, " +
      "and then the clock starts again.",
  ],
  [
    "agent",
    "Understood. What data do you hold for these, and how much do you trust it?",
  ],
  [
    "user",
    "Five years of claims in a warehouse, reasonably clean, plus an EHR export we trust. We want " +
      "the cycle time halved within two quarters.",
  ],
  [
    "agent",
    'Thank you. Your core bottleneck is "Manual prior authorisation assembly taking 18 days with ' +
      'a 30% payer rejection rate". Handing off to our Industry Analyst to find matching case studies.',
  ],
  [
    "agent",
    "I have put 3 use cases on your Strategy Canvas, grounded in 3 Healthcare case studies from " +
      "our knowledge base. Approve the ones worth pursuing and I will build the architecture " +
      "around those.",
  ],
  ["user", "Approved: Automated prior authorisation packet assembly, Denial-risk scoring on submission."],
  [
    "agent",
    "Your stack is on the Canvas, along with the compliance risk I would watch. Passing it to our " +
      "Project Manager to phase the rollout.",
  ],
  [
    "agent",
    "Your 3-phase roadmap is ready. Handing off to our Change Coach for the people side.",
  ],
  [
    "agent",
    "Your change-management plan is ready. Your AI enablement strategy is complete - you can " +
      "review and export it from the dashboard.",
  ],
];

const AGENT_BY_INDEX = [
  "Discovery Consultant",
  "Discovery Consultant",
  "Discovery Consultant",
  "Industry Analyst",
  "Technical Architect",
  "Project Manager",
  "Change Coach",
] as const;

let agentSeen = -1;
const messages: ChatMessage[] = transcript.map(([sender, text]) => {
  if (sender === "user") return message({ sender, text });
  agentSeen += 1;
  return message({
    sender,
    agentName: AGENT_BY_INDEX[Math.min(agentSeen, AGENT_BY_INDEX.length - 1)],
    text,
  });
});

const state: AgentState = {
  currentStage: "complete",
  needsAssessment: {
    summary:
      "Prior authorisation is assembled by hand at 4,000 per month, taking 18 days end to end, " +
      "with roughly 30% returned by payers for missing documentation.",
    primaryObjective: "Halve prior authorisation cycle time within two quarters",
    dataReadiness: "Medium",
    identifiedBottleneck:
      "Manual prior authorisation assembly taking 18 days with a 30% payer rejection rate",
  },
  useCases: [
    {
      id: "uc-1",
      title: "Automated prior authorisation packet assembly",
      description:
        "Extract the clinical evidence a payer requires from the EHR and assemble the submission " +
        "packet before a human reviews it.",
      impact: "High",
      complexity: "Medium",
      businessValue: "Cuts turnaround from 18 days to under 7",
      status: "approved",
    },
    {
      id: "uc-2",
      title: "Denial-risk scoring on submission",
      description:
        "Score each packet for likely denial before it is sent, so documentation gaps are closed " +
        "while the case is still open.",
      impact: "High",
      complexity: "Low",
      businessValue: "Reduces the 30% rejection rate by roughly half",
      status: "approved",
    },
    {
      id: "uc-3",
      title: "Payer policy change monitoring",
      description:
        "Watch payer policy publications and flag the rule changes that affect open authorisations.",
      impact: "Medium",
      complexity: "Medium",
      businessValue: "Avoids an estimated 200 avoidable resubmissions a year",
      status: "rejected",
      feedback: "Payer relations owns this and will not hand it over",
    },
  ],
  // The copy that outlives a rewind, and the one `summarise()` reads when this consultation
  // becomes a memory. Without it a seeded demo would remember an approval and forget a refusal.
  declined: [
    {
      title: "Payer policy change monitoring",
      reason: "Payer relations owns this and will not hand it over",
    },
  ],
  sources: [
    { title: "usahealthsystem.com", url: "https://www.usahealthsystem.com" },
    { title: "auburncommunityhospital.org", url: "https://www.auburncommunityhospital.org" },
    { title: "elriohealth.com", url: "https://www.elriohealth.com" },
  ],
  ungrounded: false,
  architectureStack: {
    models: ["Gemini 3.5 Flash (Vertex AI)", "Gemini 2.5 Pro (Vertex AI)"],
    infrastructure: ["Vertex AI", "Cloud Run", "Firestore", "Cloud Healthcare API"],
    frameworks: ["Google GenAI SDK"],
    securityConsiderations:
      "PHI never leaves the VPC: private endpoints, CMEK on every store, and a HIPAA BAA with " +
      "the model provider. Every read of a patient record is audit logged, and the model sees " +
      "de-identified text wherever the packet does not require the identifier.",
  },
  roadmapPhases: [
    {
      phaseName: "Pilot on a single payer",
      duration: "Weeks 1-6",
      keyDeliverables: [
        "Extraction prototype against 50 historical authorisations",
        "Shadow-mode evaluation with no submissions sent",
        "HIPAA compliance checkpoint on the sandbox environment",
      ],
      resourcesRequired: ["1x ML engineer", "1x clinical informatics advisor (0.5 FTE)"],
    },
    {
      phaseName: "Assisted submission",
      duration: "Months 2-4",
      keyDeliverables: [
        "Packet assembly in production with a human approving every submission",
        "Denial-risk score surfaced to the adjuster",
      ],
      resourcesRequired: ["2x backend engineers", "1x ML engineer", "1x project manager"],
    },
    {
      phaseName: "Scale across payers",
      duration: "Months 5-6",
      keyDeliverables: [
        "Remaining payer integrations",
        "Auto-submission for the highest-confidence band",
      ],
      resourcesRequired: ["2x backend engineers", "1x platform engineer"],
    },
  ],
  changeManagementPlan: {
    upskillingPaths: [
      {
        role: "Claims adjuster",
        skillsRequired: ["Reviewing model output", "Recognising a low-confidence packet"],
        recommendedTraining: "Half-day workshop plus two weeks of paired review",
        timeCommitment: "4 hours plus on-the-job",
      },
      {
        role: "Clinical informatics lead",
        skillsRequired: ["Prompt and policy review", "Evaluation set curation"],
        recommendedTraining: "Vendor-led session on evaluation and drift",
        timeCommitment: "2 days",
      },
    ],
    communicationStrategy: {
      leadershipNarrative:
        "The model assembles the paperwork; adjusters make the judgement calls. Nobody is " +
        "replaced by this - the backlog is.",
      mitigatingConcerns: [
        "Job security among the claims team",
        "Clinical accountability for an AI-assembled submission",
      ],
    },
    adoptionKpis: [
      "% of authorisations auto-assembled",
      "Median days to payer decision",
      "First-pass acceptance rate",
    ],
  },
};

const doc: SessionDocument = {
  sessionId: SESSION_ID,
  userId: uid,
  userProfile: profile,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
  messages,
  state,
};

const sessions = db().collection("sessions");
const users = db().collection("users");

if (process.argv.includes("--clear")) {
  await sessions.doc(SESSION_ID).delete();
  await users.doc(uid).set({ activeSessionId: null }, { merge: true });
  console.log(`Removed ${SESSION_ID} and cleared activeSessionId for ${uid}.`);
} else {
  await sessions.doc(SESSION_ID).set(doc);
  await users.doc(uid).set(
    { uid, ...profile, activeSessionId: SESSION_ID, lastLoginAt: Timestamp.now() },
    { merge: true },
  );
  console.log(
    `Wrote ${SESSION_ID} for ${uid}: ${messages.length} messages, stage ${state.currentStage}, ` +
      `${state.useCases.filter((u) => u.status === "approved").length} approved use cases.\n` +
      "Sign in as that user and the finished consultation loads.",
  );
}
