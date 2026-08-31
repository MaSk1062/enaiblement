# enaible

An AI enablement consultancy, run by five specialist agents.

A user describes a business bottleneck. A Discovery Consultant interviews them, an Industry
Analyst finds grounded use cases, a Technical Architect recommends a stack, a Project Manager
phases the rollout, and a Change Coach plans the people side. The output is a **Strategy
Canvas** — a document you can print — not a chat log.

## How it is built

Three decisions explain most of the code:

- **A deterministic stage machine, not an LLM router.** `app/orchestrator/stageMachine.ts` is a
  pure function: session in, reply and next state out. Code decides which specialist runs, so
  the flow is testable without a model in the loop.
- **One Firestore write per turn.** Messages and the new state are persisted together, so a
  stage can never advance ahead of the payload that justified it.
- **One seam to the model.** `app/services/gemini.ts` owns retry, JSON mode, schema validation
  and a single repair re-prompt; `app/services/schemas.ts` is the only place the agents'
  snake_case meets the app's camelCase. An agent is then a prompt, an input projection and a
  schema — about thirty lines.

Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
diagram: [`docs/diagrams/hla.svg`](docs/diagrams/hla.svg) ·
operations: [`docs/RUNBOOK.md`](docs/RUNBOOK.md)

**Stack:** React Router v8 (SSR) · Gemini 3.5 Flash on Vertex AI · Firestore, including its
native vector search for retrieval · Cloud Run · Firebase Auth.

## Running it

### Prerequisites

- Node 22 or newer (the test runner and TypeScript stripping are used directly, with no build
  step for scripts)
- A Google Cloud project with Vertex AI and Firestore enabled
- A Firebase project for authentication — it may be the same project or a different one
- `gcloud`, authenticated

### Credentials

There is no API key and no service-account JSON anywhere in this repo. Everything uses
Application Default Credentials: your own locally, the runtime service account on Cloud Run.

```bash
gcloud auth application-default login
```

The caller needs `roles/aiplatform.user` and `roles/datastore.user` on the project.
`./scripts/setup-gcp.sh` grants both, creates the Artifact Registry repository and the runtime
service account, and builds the Firestore vector index.

### Configuration

```bash
cp .env.example .env
```

Fill in `GCP_PROJECT_ID`, the `VITE_FIREBASE_*` keys from your Firebase web app, and
`FIREBASE_AUTH_PROJECT_ID` if auth lives in a different project from Firestore. Every key is
documented in `.env.example`.

Two settings are a pair and must move together: `gemini-3.5-flash` serves **only** from the
`global` endpoint, so `GCP_LOCATION=global`. It is a plain 404 in any region.

### Locally

```bash
npm install
npm run seed      # writes the grounded knowledge corpus to Firestore (once)
npm run dev
```

`npm run seed` researches each seed document with a live web search and **drops any that comes
back without a citation** — the corpus is small on purpose and every document carries a source.

### On Cloud Run

```bash
./scripts/setup-gcp.sh     # once per project
./scripts/deploy.sh        # builds on Cloud Build, deploys, health-checks
```

After the first deploy, add the Cloud Run domain to Firebase Auth → Settings → Authorized
domains, or sign-in fails. `GET /health` reports the model and endpoint the running revision is
actually using.

### Checks

```bash
npm run typecheck
npm test          # node --test, no framework
npm run eval      # scores the agent prompts against the real model
```

`npm run eval` is the unusual one: it runs the real agents and asserts on their output —
discovery branches correctly, the Architect stays inside the menu it was given, every business
value carries a figure — and a Gemini judge scores specificity, grounding and role fit. It
costs real tokens, so it is not part of `npm test`.

## Things worth knowing before you trust it

- **`GCP_LOCATION=global` is a data-residency ceiling.** Requests may be served from any region.
  For a regulated client that is the first question you will be asked, and this configuration
  does not answer it.
- **Retrieval degrades honestly.** If the curated corpus has no match the Analyst falls back to
  a grounded web search, and if that finds nothing the reply says so rather than inventing a
  case study. `state.ungrounded` records which happened.
- **Logs contain no user text.** `app/services/telemetry.ts` copies only from an allow-list, so
  message contents and email addresses have no route into a log line.
