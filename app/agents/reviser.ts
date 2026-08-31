/**
 * The Reviser — owns the `complete` stage, which used to be a dead end.
 *
 * Every other agent produces one section and hands on. This one is the only agent that reads
 * the WHOLE state, because its job is to work out what a follow-up actually is: a question, an
 * edit to one section, or a request that invalidates work upstream and has to be rebuilt.
 *
 * It writes nothing itself. It returns a decision, and the stage machine applies it — which is
 * what keeps "the stage advances only after a payload is persisted" true for revisions too.
 */

import template from "./prompts/revise.md?raw";
import { fillPrompt, transcript } from "./prompt.ts";
import { AGENT_NAMES } from "./names.ts";
import { generateStructured } from "../services/gemini.ts";
import { ReviseOutput, type ReviseResult } from "../services/schemas.ts";
import type { AgentState, ChatMessage, SessionUserProfile } from "../types.ts";

export const AGENT_NAME = AGENT_NAMES.changeCoach;

export interface ReviserInput {
  profile: SessionUserProfile;
  state: AgentState;
  messages: ChatMessage[];
  question: string;
}

export async function run(input: ReviserInput): Promise<ReviseResult> {
  const history = transcript(input.messages);

  // The full strategy, minus the bookkeeping. `currentStage` is always "complete" here and
  // saying so invites the model to reason about stages instead of about the client's request.
  const { currentStage: _stage, ...strategy } = input.state;

  const payload = `Client: ${JSON.stringify(input.profile)}

Their complete strategy:
${JSON.stringify(strategy, null, 2)}

Recent conversation:
${history}

Their latest message: ${JSON.stringify(input.question)}`;

  return generateStructured(fillPrompt(template), payload, ReviseOutput);
}
