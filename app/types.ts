/**
 * The contract. Every module on both sides of the API boundary imports from here.
 *
 * Source: docs/FIRESTORE_SCHEMA.md §2, verbatim, plus two corrections:
 *   - SessionDocument gains `userProfile` (docs/ARCHITECTURE.md §7.1) - the orchestrator
 *     reads it every turn, and denormalising it saves a `users` read per turn.
 *   - `users/{uid}` gains `activeSessionId` so the dashboard can find the session it owns.
 *
 * These interfaces are camelCase. The agents emit snake_case. Nothing in this file
 * ever sees snake_case - `services/schemas.ts` is the single translation point.
 */

import type { Timestamp } from "firebase-admin/firestore";

export type Role = "CEO/Founder" | "CTO/CIO" | "Department Head" | "Developer";

export type Industry =
  | "Healthcare"
  | "Finance"
  | "Manufacturing"
  | "Retail"
  | "SaaS";

export type CompanySize = "1-50" | "51-200" | "201-1000" | "1000+";

/**
 * Where the client operates. Not decoration: it decides which data-protection regime the
 * Architect must design against, which currency a budget is quoted in, and which partners are
 * actually reachable. Optional so existing sessions keep working - every prompt treats an
 * absent region as "unspecified" rather than assuming the United States.
 */
export type Region =
  | "West Africa"
  | "East Africa"
  | "Southern Africa"
  | "North Africa"
  | "Europe"
  | "North America"
  | "Other";

/** The regime that binds a workload in each region, and the currency a budget belongs in. */
export const REGION_CONTEXT: Record<Region, { regimes: string; currency: string }> = {
  "West Africa": { regimes: "NDPR (Nigeria), Ghana Data Protection Act 2012", currency: "NGN or GHS" },
  "East Africa": { regimes: "Kenya Data Protection Act 2019, Rwanda Law No. 058/2021", currency: "KES" },
  "Southern Africa": { regimes: "POPIA (South Africa)", currency: "ZAR" },
  "North Africa": { regimes: "Egypt PDPL 2020, Morocco Law 09-08", currency: "EGP or MAD" },
  Europe: { regimes: "GDPR", currency: "EUR" },
  "North America": { regimes: "HIPAA, SOC 2, state privacy law", currency: "USD" },
  Other: { regimes: "the local data-protection regime", currency: "the local currency" },
};

export type Level = "High" | "Medium" | "Low";

export type AgentName =
  | "Discovery Consultant"
  | "Industry Analyst"
  | "Technical Architect"
  | "Project Manager"
  | "Change Coach"
  | "Sourcing Lead"
  // The deep bench, reached on demand rather than by working through the pipeline.
  | "Platform Engineer"
  | "Delivery Lead"
  | "Reliability Engineer"
  | "Implementation Engineer";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  industry: Industry;
  companySize?: CompanySize;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  /** Set at session start so /dashboard/* can rehydrate without a session list endpoint. */
  activeSessionId?: string;
  /** What survives between consultations. See ClientMemory. */
  memory?: ClientMemory;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  agentName?: AgentName;
  text: string;
  timestamp: string;
}

export interface UseCase {
  id: string;
  title: string;
  description: string;
  impact: Level;
  complexity: Level;
  businessValue: string;
  /** The Analyst never emits this; the parse boundary defaults it to "suggested". */
  status: "suggested" | "approved" | "rejected";
  /**
   * Why the client rejected it, when they said. Optional - a rejection with no explanation is
   * still a rejection. Shown on the card; `AgentState.declined` is the copy that outlives a
   * rewind, and the reason it exists twice is written up there.
   */
  feedback?: string;
}

/** A use case the client turned down, and why. */
export interface Declined {
  title: string;
  reason?: string;
}

export interface ArchitectureStack {
  models: string[];
  infrastructure: string[];
  frameworks: string[];
  securityConsiderations: string;
}

export interface RoadmapPhase {
  phaseName: string;
  duration: string;
  keyDeliverables: string[];
  resourcesRequired: string[];
}

export interface UpskillingPath {
  role: string;
  skillsRequired: string[];
  recommendedTraining: string;
  timeCommitment: string;
}

export interface ChangeManagementPlan {
  upskillingPaths: UpskillingPath[];
  communicationStrategy: {
    leadershipNarrative: string;
    mitigatingConcerns: string[];
  };
  adoptionKpis: string[];
}

export type Stage =
  | "discovery"
  | "research"
  | "architecture"
  | "roadmap"
  | "training"
  | "sourcing"
  | "complete";

export interface NeedsAssessment {
  summary?: string;
  primaryObjective?: string;
  dataReadiness?: Level;
  identifiedBottleneck?: string;
  /**
   * The deep dive fills these in. All optional: the four fields above are what the pipeline
   * needs to advance, and none of these may ever become a condition for it.
   */
  dataEstate?: string;
  integrations?: string[];
  complianceRegimes?: string[];
  teamCapability?: string;
  volumes?: string;
  constraints?: string[];
}

/** A generated file. The consultation produces documents; this is how it hands over things. */
export interface Artifact {
  id: string;
  /** Doubles as the identity: regenerating a path replaces it rather than accumulating copies. */
  path: string;
  language: string;
  content: string;
  summary: string;
  producedBy: AgentName;
}

export interface CostLine {
  component: string;
  unit: string;
  quantity: number;
  unitCost: number;
  monthlyCost: number;
  /** How the quantity was arrived at. An estimate without its arithmetic is a guess. */
  basis: string;
}

export interface EffortLine {
  phase: string;
  role: string;
  days: number;
  dayRate: number;
  cost: number;
}

export interface Estimate {
  currency: string;
  runRate: { lines: CostLine[]; monthlyTotal: number };
  effort: { lines: EffortLine[]; totalDays: number; totalCost: number };
  assumptions: string[];
  /** False when any unit price used is still unverified in knowledge/pricing.json. */
  pricesVerified: boolean;
}

export interface Slo {
  name: string;
  sli: string;
  objective: string;
  window: string;
  rationale: string;
}

export interface Reliability {
  slos: Slo[];
  errorBudget: string;
  alerts: { name: string; condition: string; severity: "page" | "ticket" }[];
}

/** A real firm, with a link. A partner without a citation does not get stored - see sourcing.ts. */
export interface Partner {
  name: string;
  country: string;
  /** What they have actually delivered, per the source. Not what they claim to offer. */
  delivered: string;
  fit: string;
  sourceUrl: string;
}

export interface Proposal {
  scope: string;
  phases: { phaseName: string; personWeeks: number; partnerRole: string }[];
  budgetRange: string;
  /** The currency the budget is quoted in, from the client's region. */
  currency: string;
  nextStep: string;
}

export interface Sourcing {
  partners: Partner[];
  proposal: Proposal;
  /**
   * False when the search returned no citable firms. The reply says so and `partners` is empty
   * - the one thing this feature must never do is invent a consultancy.
   */
  grounded: boolean;
}

export interface AgentState {
  currentStage: Stage;
  needsAssessment: NeedsAssessment;
  useCases: UseCase[];
  architectureStack?: ArchitectureStack;
  roadmapPhases?: RoadmapPhase[];
  changeManagementPlan?: ChangeManagementPlan;
  /** True when the Analyst ran with no retrieved documents (ARCHITECTURE.md §7.2). */
  ungrounded?: boolean;
  /** What the use cases were grounded in. Shown on the Canvas so the claim is checkable. */
  sources?: { title: string; url: string }[];
  sourcing?: Sourcing;
  /** Produced on demand, not by the pipeline. */
  estimate?: Estimate;
  reliability?: Reliability;
  /**
   * Everything the client has turned down in this consultation, with their reasons.
   *
   * Deliberately NOT cleared by `rewind()`, which is the whole point: a rerun wipes `useCases`
   * and rebuilds them, and a rebuilt list that re-proposes what was just refused is the exact
   * failure this field prevents. `UseCase.feedback` is the same fact attached to the card the
   * user is looking at; this is the copy that survives the rebuild.
   */
  declined?: Declined[];
}

/** One finished consultation, compressed to what is worth carrying into the next one. */
export interface ConsultationMemory {
  sessionId: string;
  /** ISO. Written when the NEXT consultation starts, which is when this one became history. */
  completedAt: string;
  industry: Industry;
  bottleneck: string;
  /** Titles only. The full strategy is still in the session document. */
  approved: string[];
  rejected: Declined[];
}

/**
 * What the product remembers about a client between consultations.
 *
 * Lives on `users/{uid}.memory`. Invisible by design: it shapes the opening message and the
 * prompts rather than being displayed, so the adaptation shows up as the agent behaving
 * differently, not as a panel the user has to read.
 */
export interface ClientMemory {
  /** Newest first. */
  consultations: ConsultationMemory[];
  /** Durable observations about how this client works, written by the Reviser. */
  notes: string[];
}

/** Denormalised onto the session: a consultation reflects the profile as it was at start. */
export interface SessionUserProfile {
  name: string;
  role: Role;
  industry: Industry;
  region?: Region;
}

export interface SessionDocument {
  sessionId: string;
  userId: string;
  userProfile: SessionUserProfile;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  messages: ChatMessage[];
  state: AgentState;
  /**
   * The client's memory as prose, frozen at session start - same reasoning as `userProfile`:
   * a consultation reflects what was known when it began, and the stage machine already holds
   * the session, so no agent needs a new argument to reach it.
   */
  memoryBlock?: string;
}

export interface KnowledgeDocument {
  id: string;
  industry: Industry;
  category: "case_study" | "tool_spec" | "compliance_rule";
  title: string;
  content: string;
  /** Required in practice: it is what separates a researched case study from a fabricated one. */
  sourceUrl?: string;
  /** VectorValue on read; write with FieldValue.vector(number[]). */
  embedding: unknown;
  metadata: {
    targetRoles: string[];
    impactScore: number;
    tags: string[];
  };
}

/**
 * Every /api/chat turn returns this; the client replaces its AgentState wholesale.
 *
 * `replies` is plural because a post-completion follow-up can rerun several stages, and each
 * specialist that re-engages gets its own message.
 */
export interface ChatTurnResponse {
  replies: ChatMessage[];
  state: AgentState;
}
