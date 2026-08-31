# Runbook

What to run when something is wrong, or when someone asks what the demo cost.

Every line the app logs is a single JSON object on stdout, which Cloud Run files as
`jsonPayload` (see `app/services/telemetry.ts`). So all of this is `gcloud logging read` with a
filter on `jsonPayload.event` - no log parsing, no regex over free text.

```bash
PROJECT=$GCP_PROJECT_ID
BASE='resource.type="cloud_run_revision" AND resource.labels.service_name="enaible"'
```

## The events

| event | meaning |
|---|---|
| `turn.start` / `turn.end` | one `POST /api/chat`. `ok:false` means the user lost their message |
| `stage.advance` | the consultation moved on: `from` -> `to` |
| `stage.blocked` | the approval gate held - normal once, a deadlock if it never stops |
| `agent.call` | one model call, with latency and token counts. `repaired:true` = this was the retry |
| `agent.repair` | output failed its schema and had to be asked again. `issuePaths` says which field |
| `agent.failed` | the agent threw; the stage did NOT advance and the turn is replayable |
| `retrieval` | which retriever answered: `knowledge_base`, `web`, or `none` |
| `retrieval.failed` | one retriever errored and the next was tried |
| `search.grounded` | a Google Search-grounded call. `ok:false` means it returned no citations |
| `api.error` | an unhandled failure that became a 503 |

Nothing in any of them is user text. Message contents, emails and prompts cannot reach a log
line - `event()` copies only from a fixed allow-list, and `telemetry.test.ts` keeps it that way.

## The five queries

**1. Everything that happened in one consultation.** The first thing to run when someone says
"it broke" - it is the whole turn, in order, including which agent ran and what it cost.

```bash
gcloud logging read "$BASE AND jsonPayload.sessionId=\"session_1234567890_abcd\"" \
  --project "$PROJECT" --limit 100 --format='value(jsonPayload)' --freshness=6h
```

**2. What is failing right now.**

```bash
gcloud logging read "$BASE AND severity>=ERROR" \
  --project "$PROJECT" --limit 20 --freshness=1h \
  --format='table(timestamp, jsonPayload.event, jsonPayload.stage, jsonPayload.error)'
```

**3. Which agent's prompt is drifting.** A schema repair is the model failing to produce its own
declared output shape. Concentrated in one agent, that is a prompt problem, and `issuePaths`
names the field to fix.

```bash
gcloud logging read "$BASE AND jsonPayload.event=\"agent.repair\"" \
  --project "$PROJECT" --limit 50 --freshness=24h \
  --format='table(jsonPayload.agent, jsonPayload.stage, jsonPayload.issuePaths)'
```

**4. What today cost.** `totalTokens` on `turn.end` is the whole turn - every model call it made,
including a repair and any grounded search.

```bash
gcloud logging read "$BASE AND jsonPayload.event=\"turn.end\"" \
  --project "$PROJECT" --limit 500 --freshness=24h \
  --format='value(jsonPayload.totalTokens)' | paste -sd+ | bc
```

**5. The slow turns.** Sort by `durationMs` and look at what the turn was doing: a `research`
stage that ran a grounded web search is legitimately slower than a cached `roadmap`.

```bash
gcloud logging read "$BASE AND jsonPayload.event=\"turn.end\" AND jsonPayload.durationMs>20000" \
  --project "$PROJECT" --limit 20 --freshness=6h \
  --format='table(jsonPayload.stage, jsonPayload.durationMs, jsonPayload.totalTokens)'
```

## Dashboard and alert

`./scripts/monitoring.sh` creates five log-based metrics, one dashboard (turn latency p95,
failed turns, schema repairs, tokens per turn) and - with `ALERT_EMAIL` set - one alert on more
than three failed turns in five minutes.

Log-based metrics only count entries written after the metric exists. A newly created dashboard
is empty until the next turn; send one.

## Things that look like bugs and are not

- **`retrieval` with `source:"web"`.** The curated corpus had no match for that industry and the
  Google Search fallback answered. The reply says so and the Canvas cites the sources.
- **`search.grounded` with `ok:false`.** The model answered without searching, so there are no
  citations. Seeding drops those documents rather than storing an uncited claim.
- **`stage.blocked` once per consultation.** The Architect refusing to design until a use case
  is approved. Expected. A session emitting it repeatedly means the user cannot find the Canvas.
- **A 12–22s `search.grounded` right after `stage.advance` to `architecture`.** The Architect's
  model menu warming in the background, deliberately, so it does not land on the user's next
  message.
