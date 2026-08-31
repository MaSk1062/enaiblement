/**
 * The contract. Every module on both sides of the API boundary imports from here.
 *
 * Source: docs/FIRESTORE_SCHEMA.md §2, verbatim, plus two corrections:
 *   - SessionDocument gains `userProfile` (docs/ARCHITECTURE.md §7.1) — the orchestrator
 *     reads it every turn, and denormalising it saves a `users` read per turn.
 *   - `users/{uid}` gains `activeSessionId` so the dashboard can find the session it owns.
 *
 * These interfaces are camelCase. The agents emit snake_case. Nothing in this file
 * ever sees snake_case — `services/schemas.ts` is the single translation point.
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
 * actually reachable. Optional so existing sessions keep working — every prompt treats an
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
  | "Sourcing Lead";

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
}

/** A real firm, with a link. A partner without a citation does not get stored — see sourcing.ts. */
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
   * — the one thing this feature must never do is invent a consultancy.
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
