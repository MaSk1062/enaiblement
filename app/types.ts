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

export type Level = "High" | "Medium" | "Low";

export type AgentName =
  | "Discovery Consultant"
  | "Industry Analyst"
  | "Technical Architect"
  | "Project Manager"
  | "Change Coach";

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
  | "complete";

export interface NeedsAssessment {
  summary?: string;
  primaryObjective?: string;
  dataReadiness?: Level;
  identifiedBottleneck?: string;
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
}

/** Denormalised onto the session: a consultation reflects the profile as it was at start. */
export interface SessionUserProfile {
  name: string;
  role: Role;
  industry: Industry;
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

/** Every /api/chat turn returns this; the client replaces its AgentState wholesale. */
export interface ChatTurnResponse {
  reply: ChatMessage;
  state: AgentState;
}
