# suggestions.md — hackathon review

**Reviewed:** commit `37bc728` ("Canvas and chat merge"), branch `dev`, 2026-08-31
**Method:** read-only pass over the whole repo. Nothing was run, deployed or changed.
**Measured against:** the All Things Agentic rules and the published judging rubric
(Innovation & Operational Utility 40% / Architectural Discipline & Tech Stack 30% /
Demo & Production Readiness 30%).

---

## 1. Verdict

The engineering here is the strongest part of the project and it is not close. A deterministic
stage machine instead of an LLM router (ADR-02), one Firestore write per turn so a stage cannot
outrun the payload that justified it (§5.3), zod schemas with a single repair re-prompt, an
allow-listed telemetry exporter so user text has no route into a log line, five ADRs that name
their trade-offs, and an eval harness with an LLM judge scoring specificity / grounding /
role fit. That is a **Best Architectural Design** submission already, and that is a separate
$5,000 prize worth targeting on purpose.

The problem is not quality. It is that the thing we built does not match the track we entered.

---

## 2. The one problem that matters: we are in the wrong track

The Taskmaster brief opens with:

> "Most AI today waits for you to ask. The next generation doesn't."

Today the app waits at every step. `runTurn()` executes **exactly one stage per user message**.
After discovery completes the user must type to trigger `research`, type again for
`architecture`, again for `roadmap`, again for `training`. That is four content-free "ok,
continue" messages a judge will watch us type on a four-minute video.

And nothing the agent produces ever leaves the browser. No export, no email, no document, no
vendor contacted. The Taskmaster phrase is *"sends the right info to the right places"* —
currently nothing is sent anywhere.

Meanwhile, read the Collaborative Partner brief: *asks clarifying questions, guides the user
step-by-step, has a clear way to capture feedback.* That is our discovery agent (one question
at a time), our approval gate, and our reviser/rewind logic, almost verbatim. **We have built a
Collaborative Partner and labelled it Taskmaster.**

Two ways out:

- **Switch to Collaborative Partner.** Free, honest, competitive tomorrow. But it concedes the
  more interesting product.
- **Become an actual Taskmaster.** Two changes, and the first is nearly free because the code
  already exists. This is the recommendation, and everything in §3 is ordered around it.

---

## 3. Priority table

Ordered by rubric impact per hour of work. Do them top-down.

| # | Change | Files | Effort | Why it scores |
|---|---|---|---|---|
| **P0-1** | Auto-chain the pipeline forward | `app/orchestrator/stageMachine.ts`, `app/routes/api.chat.ts`, `app/routes/api.session.$id.use-cases.ts` | ~2h | The 40% criterion. Turns "chatbot with steps" into "agent that carries out a plan" |
| **P0-2** | Seeded demo session | `scripts/seed.ts` | ~1h | Our own plan §8 called it the insurance policy and it was never built. A Vertex hiccup on demo day currently costs us the demo |
| **P0-3** | Rewrite `README.md` | `README.md` | ~30m | It is still the React Router starter template. "Spin-up instructions in your README.md" is an explicit submission requirement |
| **P0-4** | Lock down `firestore.rules` | `firestore.rules` | ~15m | Currently `allow read, write` for anyone until 29 Sept. Nothing breaks if we fix it — the client only uses Firebase Auth — but judges read repos, and our pitch is enterprise compliance |
| **P1-1** | Export the strategy | new `app/routes/api.export.ts`, or a print stylesheet | ~3h | The Change Coach's final line already promises it. §8.2 specced `POST /api/export` and it does not exist |
| **P1-2** | Vendor sourcing + proposal agent | new `app/agents/sourcing.ts`, `app/services/schemas.ts`, `app/types.ts` | ~5h | The differentiator, the Africa thesis, and the only part of the flow that is genuinely *action* rather than text |
| **P1-3** | Make the product know it is in Africa | prompts, `knowledge/*.json`, onboarding | ~3h | Right now nothing in the running product says Africa. A judge cannot see the positioning from the app |
| **P1-4** | Stream progress events | `app/routes/api.chat.ts`, `app/lib/api.ts` | ~3h | 12–22s of bouncing dots is dead air on a live demo |
| **P2-1** | Emit an HLD/LLD diagram per consultation | `app/agents/architect.ts`, `app/agents/prompts/architecture.md` | ~2h | In our stated scope, currently absent, and cheap: have the Architect emit Mermaid alongside the stack |
| **P2-2** | Fix doc/code drift | `docs/ARCHITECTURE.md` | ~30m | Three statements in the architecture doc are no longer true. Judges read this doc |

Everything below is detail on the above.

---

## 4. P0 — do these first

### P0-1 · Auto-chain the pipeline forward

`stageMachine.ts` already contains the loop we need. `replay()` (line ~275) runs stages forward
until nothing advances, and it stops cleanly when the approval gate holds, because a blocked
stage returns its state unchanged. It is currently only reachable from `followUp()` — the
`complete` path. The forward path never uses it.

Wire it in:

- In `runTurn()`, after a stage advances, keep running while the *next* stage needs no new user
  input. `discovery → research` and `architecture → roadmap → training → complete` all qualify.
  The gate is a natural stop: `architecture` with zero approved use cases returns the same
  stage, and the loop breaks on `state.currentStage === before`, which is already the exit
  condition in `replay()`.
- In `PATCH /api/session/:id/use-cases`, once at least one use case is approved, run the
  pipeline instead of returning and waiting for a chat message. Approving *is* the user's
  input; making them then type "ok go" is the hand-holding the rubric penalises.
- Keep `MAX_REPLAY_STAGES` as the safety rail. Keep the one-write-per-turn rule: persist
  messages and state together after the loop finishes, not per stage.

The existing `stageMachine.test.ts` fixtures cover the transitions — extend them with a test
that one message from `discovery` lands on the gate, and one approval lands on `complete`.

This is the single highest-value change in the repo and it is mostly reuse.

### P0-2 · Build the seeded demo session

`scripts/seed.ts` seeds `knowledge_base` only. The implementation plan §8 called a
pre-completed session "your insurance policy… the difference between a bad five minutes and no
demo at all," and it was never built.

Add a `--demo` flag that writes one fully-completed `sessions/{id}` document with a realistic
transcript and a full `AgentState`. Then a Vertex outage, a quota limit or venue wifi costs us
the live-generation moment but not the demo.

### P0-3 · Rewrite the README

It is the React Router starter template, verbatim, including "Built with ❤️ using React
Router." The submission requires spin-up instructions that prove the project is reproducible.
It needs: what the product is, the architecture in three lines, prerequisites, `gcloud auth
application-default login`, the `.env` keys (point at `.env.example`, which is genuinely good),
`npm run seed`, `npm run dev`, and `./scripts/setup-gcp.sh` + `./scripts/deploy.sh` for the
Cloud Run path. Link `docs/ARCHITECTURE.md` and `docs/diagrams/hla.svg`.

### P0-4 · Lock down the Firestore rules

```
allow read, write: if request.time < timestamp.date(2026, 9, 29);
```

The browser only ever uses `firebase/app` and `firebase/auth` — all Firestore access goes
through the Admin SDK server-side under ADC. So the correct rule is to deny client access
entirely, or scope reads to `sessions/{id}` where `resource.data.userId == request.auth.uid`.
Either is a five-line change and it removes the one thing in the repo that contradicts the
pitch.

---

## 5. P1 — the differentiator

### P1-1 · Export

Two options, and I would ship the cheap one first:

- **Cheap (today):** a print stylesheet on `/dashboard/canvas`. The route comment already calls
  itself "the page the print stylesheet will target." Browser print-to-PDF gives us a real
  artifact with zero backend work, and the Change Coach's closing line stops being a promise we
  do not keep. *(This one is on the UI task list.)*
- **Proper:** `POST /api/export` per §8.2, rendering `AgentState` server-side. Worth it if
  P1-2 lands, because the proposal wants to be a document, not a web page.

### P1-2 · Vendor sourcing and proposal — the actual Taskmaster moment

This is the feature that was in the original pitch and is entirely absent from the code. It is
also the only part of the flow where the agent *acts* rather than writes.

The machinery already exists: `searchGrounded()` in `services/gemini.ts` returns text plus real
citations, and `rag.ts` already shows the pattern of feeding grounded prose into a structured
call (grounding and JSON mode are mutually exclusive on Vertex — that constraint is already
documented and handled).

Shape it like every other agent, because the codebase's best property is that all five agents
are the same three things:

1. New stage `sourcing` in the `Stage` union (`app/types.ts`), between `training` and
   `complete`.
2. `app/agents/prompts/sourcing.md` + `app/agents/sourcing.ts` — prompt, input projection,
   zod schema. Input: approved use cases, the stack, the roadmap, the client's region.
3. Output: a shortlist of implementation partners (name, country, what they have actually
   delivered, source URL) plus a proposal — scope, phased effort in person-weeks derived from
   `roadmapPhases[].resourcesRequired`, and an indicative budget range.
4. A `Partners & proposal` section in `app/lib/CanvasPanel.tsx`, with the same `Provenance`
   treatment already used for use cases so every named firm carries a clickable citation.

**Do not let it invent firms.** Reuse the `retrieval.grounded === false` discipline exactly as
`rag.ts` does it: zero citations means say so, do not dress a hallucinated vendor list up as
research. A fabricated consultancy on screen in front of a judge is the worst possible failure
for this specific product.

### P1-3 · Make the product know it is in Africa

Nothing in the running application says Africa. The seeded case studies are US health systems
(USA Health, Ochsner). The compliance line reaches for HIPAA and SOC 2. There is no currency,
no region, no local vendor, no connectivity or cost assumption.

Cheapest high-signal fixes:

- Add `region` to the onboarding profile and thread it into `SessionUserProfile`. Even three
  options changes what every downstream prompt can say.
- Name the real frameworks in `architecture.md`: POPIA (South Africa), NDPR (Nigeria), Kenya's
  Data Protection Act 2019 — alongside HIPAA/GDPR rather than instead of them.
- Seed 4–6 African case studies into `knowledge/*.json` in the same format as the existing
  ones. The corpus is only 23 documents; this is a couple of hours of research.
- Budget figures in local currency, not USD.
- One honest note: `GCP_LOCATION=global` is a data-residency ceiling, and `services/gemini.ts`
  says so in a comment. Residency is exactly the first objection an African CTO raises. We do
  not have to solve it in 48 hours, but the write-up should name it rather than let a judge
  find it.

### P1-4 · Stream progress, not tokens

§9.1 argues correctly that JSON-mode stages cannot stream usefully. That argument is about
*tokens*. It does not stop us streaming *events*.

Turn `POST /api/chat` into an SSE response that emits the telemetry we already produce —
`stage.advance`, `retrieval` (with `source` and document count), `search.grounded`,
`agent.call` — and let the UI narrate: "Industry Analyst searching the web… found 4 sources…
drafting three use cases." With P0-1 auto-chaining, a single message now runs four stages, so
without this the user stares at bouncing dots for a minute.

Note also: §9.1 claims "only `discovery` streams." Nothing streams. `discovery` goes through
`generateStructured()` in JSON mode like the other four.

---

## 6. P2 — cheap polish with real value

### P2-1 · Generate the client's HLD/LLD

Our own pitch promises low- and high-level diagrams for the client's AI adoption. We produce
none. The Architect already returns models / infrastructure / frameworks — have it also emit a
Mermaid `graph TD` of the recommended system, add it to `ArchitectureOutput`, and render it on
the Canvas. Mermaid is a string; the renderer is one script tag. Roughly two hours for a
visibly impressive artifact that is already in the pitch.

### P2-2 · Fix doc/code drift

Three statements in `docs/ARCHITECTURE.md` are no longer true, and judges read this document:

- **ADR-03** says "Build on `@google/generative-ai`." `package.json` uses `@google/genai@^2.19.0`.
  Also — the title "Google ADK deferred" reads to a skimming judge like a missed requirement.
  We are fine: the rules accept "Google ADK, **GenAI SDK**, Antigravity SDK or GenKit," and
  `@google/genai` *is* the GenAI SDK. Retitle it "ADR-03 — GenAI SDK over ADK" and say so.
- **§9.1** says discovery streams. Nothing streams.
- **§11** says "No evaluation harness for agent output quality." `scripts/eval.ts` exists and is
  good. Delete the line and mention the harness — it is a 30% criterion talking point.

---

## 7. Submission checklist

| Requirement | Status |
|---|---|
| Gemini 3.5 or newer | ✅ `gemini-3.5-flash`, pinned in `services/gemini.ts` with the global-endpoint constraint documented |
| A Google agent framework | ✅ `@google/genai` (GenAI SDK) — but see P2-2, the ADR wording undersells it |
| A Google Cloud infra service | ✅ Cloud Run + Firestore (+ Cloud Build, Artifact Registry, Cloud Logging) |
| Public code repo | ✅ |
| Spin-up instructions in README | ❌ **P0-3** |
| Architecture diagram | ✅ `docs/diagrams/hla.svg` and four LLA diagrams — genuinely strong, put `hla.svg` in the video |
| Proof it runs on Google Cloud | ⚠️ Have the Cloud Run dashboard and a `jsonPayload` log query on screen in the video. `docs/RUNBOOK.md` gives you the exact `gcloud logging read` commands — that is a 30%-criterion moment, use it |
| ~4-min demo video | ⚠️ Rehearse against the seeded session (P0-2) |
| Bonus: blog/social post | ⚠️ Free points. `#AllThingsAgenticHackathon` |

---

## 8. What not to change

Some of this is better than it needs to be. Leave it alone:

- The stage machine's purity and the one-write-per-turn rule. Do not let auto-chaining erode it.
- The `generateStructured()` seam — retry, JSON mode, one repair, snake_case→camelCase in one
  place. It is why adding the sourcing agent is a few hours and not a day.
- The telemetry allow-list. It is the cheapest compliance story we have and
  `telemetry.test.ts` keeps it honest.
- The approval gate. It is the thing that makes this a consultation rather than a chat.
- The `ponytail:` comments. They are the honest record of what was traded away under the clock,
  and they will read well to an engineer judge.
