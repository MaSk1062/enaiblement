/**
 * Structured events, one JSON line each, straight to stdout.
 *
 * Cloud Run's logging agent parses a single-line JSON object on stdout into `jsonPayload`,
 * honours `severity`, and files the entry under its request when
 * `logging.googleapis.com/trace` is set. So the whole exporter is `console.log` — no SDK, no
 * OpenTelemetry, nothing to keep alive in a container that scales to zero. Locally the same
 * lines are readable in the dev terminal.
 *
 * An agent call sits five frames deep (route -> runTurn -> agent -> generateStructured ->
 * callModel). Rather than thread a context object through every agent signature,
 * AsyncLocalStorage (node stdlib) carries it invisibly: the route opens one scope per turn and
 * everything below it logs with the session, stage and agent already attached.
 *
 * REDACTION IS STRUCTURAL. `event()` copies only the keys in ALLOWED, so a user's message text
 * or email has no route into a log line even by accident. Lengths, counts and ids only.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface TurnContext {
  sessionId: string;
  uid: string;
  turnId: string;
  stage: string;
  agent: string;
  /** Cloud Logging trace id, so every line of a turn collapses under its request. */
  trace?: string;
  /** Mutable: every model call in the turn adds to it, and turn.end reports the total. */
  tokens: { total: number };
}

const store = new AsyncLocalStorage<TurnContext>();

export const withTurn = <T>(ctx: TurnContext, fn: () => T): T => store.run(ctx, fn);
export const turnContext = (): TurnContext | undefined => store.getStore();

/** Adds to the running token total, if there is a turn in scope. Free of charge otherwise. */
export function countTokens(n: number | undefined) {
  if (n) {
    const ctx = store.getStore();
    if (ctx) ctx.tokens.total += n;
  }
}

export interface EventFields {
  severity?: "INFO" | "WARNING" | "ERROR";
  // timing and outcome
  durationMs?: number;
  ok?: boolean;
  // model
  model?: string;
  promptTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  totalTokens?: number;
  repaired?: boolean;
  // routing
  stage?: string;
  from?: string;
  to?: string;
  nextStage?: string;
  reason?: string;
  // retrieval
  source?: string;
  documents?: number;
  sources?: number;
  // sizes, never contents
  queryChars?: number;
  textChars?: number;
  // failures
  status?: number;
  error?: string;
  stack?: string;
  /** zod issue paths — which field was wrong, never what was in it. */
  issuePaths?: string[];
}

const ALLOWED = new Set<keyof EventFields>([
  "severity", "durationMs", "ok", "model", "promptTokens", "outputTokens", "thoughtTokens",
  "totalTokens", "repaired", "stage", "from", "to", "nextStage", "reason", "source",
  "documents", "sources", "queryChars", "textChars", "status", "error", "stack", "issuePaths",
]);

/** One event, one line. Never throws: instrumentation must not be able to fail a turn. */
export function event(name: string, fields: EventFields = {}) {
  try {
    const ctx = store.getStore();
    const payload: Record<string, unknown> = {
      severity: fields.severity ?? "INFO",
      // Cloud Logging shows this as the entry summary, so it is ours to set, not the caller's.
      message: name,
      event: name,
      ...(ctx && {
        sessionId: ctx.sessionId,
        uid: ctx.uid,
        turnId: ctx.turnId,
        stage: ctx.stage,
        agent: ctx.agent,
        ...(ctx.trace && { "logging.googleapis.com/trace": ctx.trace }),
      }),
    };

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && key !== "severity" && ALLOWED.has(key as keyof EventFields)) {
        payload[key] = value;
      }
    }

    console.log(JSON.stringify(payload));
  } catch {
    // A logging failure is not a turn failure.
  }
}

export const newTurnId = () => crypto.randomUUID().slice(0, 8);

/**
 * `X-Cloud-Trace-Context: TRACE_ID/SPAN_ID;o=1` -> the resource name Cloud Logging groups by.
 * Absent locally, which is fine — the field is simply omitted.
 */
export function traceFrom(request: Request): string | undefined {
  const project = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
  const header = request.headers.get("x-cloud-trace-context");
  const id = header?.split("/")[0];
  return project && id ? `projects/${project}/traces/${id}` : undefined;
}
