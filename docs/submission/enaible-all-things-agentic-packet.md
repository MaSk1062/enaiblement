# enaible

All Things Agentic Hackathon — Submission Packet

**Category:** Collaborative Partner
**Date:** 1 September 2026
**Representative:** `[REPRESENTATIVE_NAME]`
**Team:** `[TEAM_MEMBER_NAMES]`

Fill every `[PLACEHOLDER]` before you paste into Devpost. Do not invent a URL, a date, or a teammate name.

The official Submission Period ended 31 August 2026 at 5:00 PM Pacific Time. Judging began 1 September. If a submission is already on Devpost, you cannot edit it except to remove IP, PII, or inappropriate material. Use this packet to film, to finish a draft you already opened, or to paste if the form still accepts entries.

---

# 1. How to submit

Do these in order on [allthingsagentichackathon.devpost.com](https://allthingsagentichackathon.devpost.com/).

1. Sign in to Devpost. Open **Enter a Submission**. Save a draft as soon as the first fields are filled.
2. Add every teammate as a project member. Each person must **accept the invite** before you submit.
3. Paste Section 2 into the matching form fields. Paste Section 3 into the text description.
4. Set the category to **Collaborative Partner**. Do not also tick Taskmaster or Fortified Enterprise Fleet.
5. Paste `[HOSTED_URL]` and `[GITHUB_URL]`. If the repo is private, grant read access to `testing@devpost.com` and `cloudhackathons@google.com`.
6. Upload `docs/diagrams/hla.svg` as the architecture diagram. Upload `docs/diagrams/lla-2-state-machine.svg` as a second image if the form allows more than one.
7. Record the video from Section 5. Upload it as a **public** YouTube or Vimeo video (not unlisted). Paste `[YOUTUBE_OR_VIMEO_URL]`.
8. Paste the testing notes from Section 8. If the hosted app is behind sign-in, include `[TEST_EMAIL]` and `[TEST_PASSWORD]`.
9. Answer the SDK and start-date questions from Section 2. Disclose pre-existing code as written there.
10. Run the master checklist in Section 7. Initial the compliance attestation in Section 6. Submit.

Optional, after the required fields: publish the blog outline and the social draft in Section 7. A public (not unlisted) post that says it was created for this hackathon can add 0.2 bonus points. A social post with `#AllThingsAgenticHackathon` can add another 0.2.

---

# 2. Devpost form answers

Copy each block into the matching field.

## Project name

enaible

## Tagline / elevator pitch

An AI enablement consultancy, run by specialist agents, that ends in a printable Strategy Canvas.

## Category

Collaborative Partner

## Hosted project URL

`[HOSTED_URL]`

Highly encouraged. The app does not need to stay up for the whole judging window, but a live `.run.app` URL is the fastest way for a judge to confirm Cloud Run. After the first deploy, add that domain under Firebase Auth → Settings → Authorized domains, or sign-in fails.

## Code repository URL

`[GITHUB_URL]`

If the repo is private, share it with `testing@devpost.com` and `cloudhackathons@google.com`.

## Google agent framework

GenAI SDK (`@google/genai` in `package.json`). Gemini is called from `app/services/gemini.ts` on Vertex AI. The rules accept Google ADK, GenAI SDK, Antigravity SDK, or Genkit. This project uses GenAI SDK, not ADK.

## Gemini model

`gemini-3.5-flash` on Vertex AI. The model serves only from the `global` endpoint, so `GCP_LOCATION=global`. `GET /health` reports the model id and endpoint the running revision is actually using.

## Google Cloud services used

Cloud Run (one SSR container), Firestore with a native 768-dimension vector index, Cloud Build, Artifact Registry, Cloud Logging, Firebase Authentication. Embeddings use `gemini-embedding-001` with `outputDimensionality` pinned at 768 to match the index.

## Project start date

`[PROJECT_START_DATE]`

Must fall inside the Submission Period: 3 August 2026, 9:00 AM PT through 31 August 2026, 5:00 PM PT. Projects must be newly created in that window.

## Built during the contest period?

Yes. Confirm `[PROJECT_START_DATE]` before you tick this. The work described here — agents, stage machine, RAG, canvas, deploy scripts — was built during the Submission Period.

## Testing instructions (paste into the form)

Sign in with Google. If the hosted app is gated, use:

- Email: `[TEST_EMAIL]`
- Password: `[TEST_PASSWORD]`

Then open a consultation, describe a real operational bottleneck, and watch the Strategy Canvas fill. Spin-up for local or Cloud Run is in `README.md` (also copied in Section 8 of this packet). `GET /health` on the hosted URL reports the live model and endpoint. Judges are not required to run the repo; the video and this description are enough to score.

## Pre-existing and third-party code

The repository started from the React Router v8 framework-mode starter. Runtime libraries are listed in `package.json`: `@google/genai`, Firebase client and Admin SDKs, React 19, React Router v8, Zod, Mermaid, Tailwind CSS v4, Vite. Those are standard tools and must be used under their licenses.

The application itself — specialist agents and prompts, the deterministic stage machine, Firestore session model, RAG over the knowledge corpus, the Strategy Canvas, print export, eval harness, and Cloud Run deploy scripts — was written during the Submission Period. Seed documents in `knowledge/*.json` are short, cited summaries of publicly reported case studies, not third-party source code.

We received no financial or preferential support from Google or Devpost to build this project.

## Team

- Representative: `[REPRESENTATIVE_NAME]`
- Members: `[TEAM_MEMBER_NAMES]`

Every member must be added on Devpost and must accept the invite.

## Demo video URL

`[YOUTUBE_OR_VIMEO_URL]`

Public. English. Four minutes or less.

---

# 3. Text description

Paste the four blocks below into Devpost. They cover features, technologies, data sources, and findings.

## Features and functionality

enaible is a collaborative consulting agent for a leader who needs an AI adoption plan and cannot hire a firm to write one.

A user signs in with Google, sets role, industry, company size, and region, and describes a business bottleneck. A **Discovery Consultant** interviews them one question at a time until the session holds a needs assessment. An **Industry Analyst** then retrieves cited case studies and proposes concrete use cases. Those use cases appear on a **Strategy Canvas** as structured cards, not as chat prose. The user approves, rejects, or comments. Rejection is stored so a later rerun does not re-propose the same idea.

Once at least one use case is approved, a **Technical Architect** writes a stack, a **Project Manager** writes a phased roadmap, a **Change Coach** writes the people plan, and a **Sourcing Lead** looks up citable implementation partners and a proposal. The canvas mutates as each specialist finishes. The user can print the canvas to a PDF. After the pipeline completes, a reviser can rewind a section from a follow-up message and rebuild only that part.

This is a Collaborative Partner, not a chatbot: the agent leads with questions, captures feedback on the canvas, and synthesizes unstructured answers plus messy case-study text into a document the user can take to a board.

On-demand specialists (platform, delivery, reliability, implementation) sit behind the same Gemini seam and are reached when the consultation needs them, not by walking the default pipeline.

## Technologies used

- **Model:** Gemini 3.5 Flash (`gemini-3.5-flash`) on Vertex AI, `global` endpoint.
- **Agent framework:** Google GenAI SDK (`@google/genai`). One module, `app/services/gemini.ts`, owns retry, JSON mode, schema validation, and a single repair re-prompt.
- **Orchestration:** a deterministic stage machine in `app/orchestrator/stageMachine.ts`. Code chooses the specialist. There is no LLM router.
- **State:** one Firestore session document per consultation. Messages and the new `AgentState` are written together, so a stage cannot advance ahead of the payload that justified it.
- **Retrieval:** Firestore native vector search over `knowledge_base` (768-d, `gemini-embedding-001`), then a Google Search-grounded fallback. Ungrounded retrieval is recorded on the session and stated in the reply.
- **App:** React Router v8 in framework mode with SSR, React 19, TypeScript, Tailwind CSS v4. One Cloud Run container serves the UI and `/api/*`.
- **Auth:** Firebase Authentication. The browser sends a Bearer ID token; the server verifies it. No API key and no service-account JSON file exist in the repo. Local and Cloud Run both use Application Default Credentials.
- **Quality:** Zod schemas on every agent output; `npm run eval` runs the real agents against the real model and a Gemini judge scores specificity, grounding, and role fit. `app/services/telemetry.ts` copies only from an allow-list, so user text and email addresses have no route into a log line.

## Other data sources used

The knowledge corpus lives in `knowledge/*.json`, one file per industry: Healthcare, Finance, Manufacturing, Retail, SaaS. Each seed document is 150–300 words with an outcome metric and a source. `npm run seed` researches each document with a live web search and **drops any document that comes back without a citation**. The stored corpus is small on purpose.

If the curated set has no match, the Analyst falls back to Google Search grounding. If that also finds nothing, the reply says so. The product does not invent a case study or a partner firm.

Region is part of the user profile (West Africa, East Africa, Southern Africa, North Africa, Europe, North America, Other). It selects the data-protection regime the Architect must design against and the currency a budget is quoted in. It is not decoration.

No customer production data is ingested. Demo sessions use a signed-in test account.

## Findings and learnings

A consulting flow is a state machine. Letting a model decide which specialist speaks next produced irreproducible demos. Putting the switch in code (`state.currentStage`) made the consultation testable without a model in the loop and stopped the Architect from firing before Discovery had a bottleneck.

Persisting the message and the new state in one Firestore write was the difference between a failed turn that can be retried and a stage that had already moved on.

`gemini-3.5-flash` returns 404 in every regional Vertex endpoint we tried. `GCP_LOCATION=global` is required and is also a data-residency ceiling: requests may be served from any region. For a regulated client that is the first question, and this configuration does not answer it. We document that instead of hiding it.

Retrieval that degrades to “I made this up” is worse than retrieval that says it found nothing. The seed script and the Analyst both refuse uncited claims. The Sourcing Lead applies the same rule to partner firms.

## Architectural discipline (for judges who read the repo)

These choices are how we would argue Best Architectural Design. The form still has one category: Collaborative Partner.

- Deterministic stage machine, not an LLM router (ADR-02).
- One Firestore write per turn, so a stage cannot outrun its payload.
- One Gemini seam: retry, JSON mode, one schema-repair re-prompt, snake_case to camelCase in `app/services/schemas.ts`.
- Allow-listed telemetry. `telemetry.test.ts` keeps user text out of Cloud Logging.
- Eval harness (`npm run eval`) that scores live agent output, not mocks.

Architecture write-up: `docs/ARCHITECTURE.md`. Diagrams: `docs/diagrams/hla.svg` and `docs/diagrams/lla-2-state-machine.svg`. Operations: `docs/RUNBOOK.md`.

---

# 4. Architecture upload

Upload these files on the Devpost form.

**Required:** `docs/diagrams/hla.svg`

Caption to paste:

> Browser sends a chat turn with a Firebase ID token. One Cloud Run container (React Router v8 SSR) verifies the token, loads the Firestore session, and hands the turn to the specialist that owns `state.currentStage`. That agent, optionally after a vector search on `knowledge_base`, calls Gemini 3.5 Flash through `app/services/gemini.ts` on Vertex AI. Validated JSON is merged into `AgentState` and written back with the new messages in a single Firestore write. The Strategy Canvas re-renders from that document.

**If a second image is allowed:** `docs/diagrams/lla-2-state-machine.svg`

Caption:

> Stage machine: discovery → research → architecture (blocked until a use case is approved) → roadmap → training → sourcing → complete. Follow-up can rewind a single stage and replay forward. Code owns the transitions.

Do not paste a screenshot of a third-party product, a vendor logo wall, or a slide that implies a sponsorship.

---

# 5. Four-minute video script

Record in English. Upload to public YouTube or Vimeo. If the video is longer than four minutes, only the first four are judged. Start already logged in. No title card. No sign-up. No copyrighted music.

Spoken lines below are what you say. Do not read the shot column aloud.

## Shot list

| Time | Shot | Spoken (English) |
| --- | --- | --- |
| 0:00–0:15 | Full-screen app, already signed in. Chat or canvas already in motion. No logo sting. | “enaible is an AI enablement consultancy run by specialist agents. A leader describes a bottleneck. They leave with a printable strategy, not a chat log.” |
| 0:15–0:40 | Stay on the live UI. Do not cut to slides. | “Most teams cannot buy a two-hundred-thousand-dollar consulting engagement to plan AI adoption. enaible interviews the user, grounds use cases in cited evidence, and writes the stack, the roadmap, and the change plan into one canvas.” |
| 0:40–0:55 | Keep the UI visible. Say the stack clearly. Do not bury it. | “The model is Gemini 3.5 Flash on Vertex AI. The agent framework is the Google GenAI SDK. The backend runs on Cloud Run, with session state and retrieval in Firestore.” |
| 0:55–1:25 | Type a real bottleneck in Healthcare (or the industry you seeded). Example: prior-authorization delays causing claim denials. Do not name or logo a vendor. | “I am a hospital operator. Prior authorization is manual. Scheduling slips, claims get denied, and nobody can see which procedures still need approval.” |
| 1:25–1:55 | Discovery asks one question at a time. Answer two or three on camera. Show the needs assessment appearing. | “Discovery does not dump a questionnaire. It asks one thing, writes the answer into session state, and only then moves on.” |
| 1:55–2:20 | Use-case cards appear on the canvas. Approve one. Reject one if you have time, and type a short reason. | “The Analyst turns messy case-study text and a grounded search into structured use cases. I approve the ones that fit. Rejection is stored, so a rerun will not pitch the same idea again.” |
| 2:20–2:40 | Watch the canvas fill: stack, roadmap phases, change plan. Do not type “ok, continue” if the pipeline advances on its own. | “Once something is approved, the Architect, Project Manager, and Change Coach write into the same document. The canvas is the product. The chat is how you steer it.” |
| 2:40–3:10 | Full-screen `docs/diagrams/hla.svg`. Then a brief cut to the stage-machine diagram if it reads at 1080p. | “Code, not a model, decides which specialist runs. One Cloud Run service. One Firestore write per turn. Gemini is called through a single module that validates JSON and repairs it once.” |
| 3:10–3:30 | Google Cloud Console: Cloud Run service `enaible`, revision healthy, URL ending in `.run.app` visible. | “This is the Cloud Run service. Same container that served the demo you just watched.” |
| 3:30–3:45 | Cloud Logging. Run a `jsonPayload` query from `docs/RUNBOOK.md` so `turn.end` or `stage.advance` rows appear. No user text will show. That is the point. | “Cloud Logging stores allow-listed events only: stage, latency, tokens. Message contents and emails cannot reach a log line.” |
| 3:45–4:00 | Back to `/dashboard/canvas`. Click Print / Download. Show the print preview of the Strategy Canvas. Stop. | “The consultation ends on paper. This is the document you take to a stakeholder.” |

## Suggested `gcloud` shot (3:30)

Replace `YOUR_PROJECT` and the session id with the ones from the take you just filmed.

```bash
PROJECT=YOUR_PROJECT
BASE='resource.type="cloud_run_revision" AND resource.labels.service_name="enaible"'
gcloud logging read "$BASE AND jsonPayload.event=\"turn.end\"" \
  --project "$PROJECT" --limit 10 --freshness=1h \
  --format='table(timestamp, jsonPayload.event, jsonPayload.stage, jsonPayload.durationMs)'
```

## Recording rules (official)

These are the Contest video rules. Break one and the submission can fail Stage One.

- The video is in English. If any on-screen string is not English, burn in English subtitles.
- Public on YouTube or Vimeo. Paste the link on the Devpost form.
- Four minutes or less.
- Show the agent working live. No mockups, no slideware as the demo.
- Show proof the backend runs on Google Cloud: Cloud Console, Cloud Run dashboard, Vertex or Cloud Logging, or a visible `.run.app` URL.
- Say the Gemini model and the agent framework out loud.
- No derogatory, offensive, threatening, defamatory, disparaging, libelous, inappropriate, indecent, sexual, profane, tortious, slanderous, or discriminatory content. Nothing that promotes hatred or harm against any group or person.
- Nothing unlawful under the law of the place you record or the United States.
- No third-party advertising, slogan, logo, or trademark, and nothing that implies a sponsorship or endorsement by a commercial entity other than the Contest.
- Do not show HSBC, Shopify, or other case-study brand marks from `knowledge/*.json`. Use a generic bottleneck. If a retrieved card shows a company name, scroll past it or use a session whose sources are citations only.
- Google Cloud Console is required proof. It is the Sponsor’s own console, not a third-party ad. Do not add “sponsored by” language.
- Do not film other people, a real patient’s data, a customer email, or any face that has not consented. Use a demo account.
- No copyrighted music. System sounds or silence.
- Start logged in. Do not film sign-up or empty loading screens.

## Before you press record

- `npm run demo` (or your seeded session) is loaded so a Vertex hiccup does not kill the take.
- Browser zoom is large enough to read at 1080p.
- Notifications off. Bookmark bar hidden. No extra tabs with other brands.
- Cloud Console is already open on the `enaible` service in another window.
- `hla.svg` is open full-screen in a browser tab.

---

# 6. Content-compliance attestation

Working checklist against Official Rules, Submission Requirements, video portion. This is not legal advice. Initial each line before you upload.

I, `[REPRESENTATIVE_NAME]`, for the team `[TEAM_MEMBER_NAMES]`, confirm:

- [ ] The demonstration video is in English, or it includes English subtitles for every spoken and on-screen line that is not English.
- [ ] The video is no longer than four minutes and is publicly visible on YouTube or Vimeo at `[YOUTUBE_OR_VIMEO_URL]`.
- [ ] No part of the submission is derogatory, offensive, threatening, defamatory, disparaging, libelous, inappropriate, indecent, sexual, profane, tortious, slanderous, or discriminatory, and nothing in it promotes hatred or harm against any group or person. The material complies with the theme and spirit of the Contest.
- [ ] No part of the submission is unlawful, or contrary to applicable federal, state, or local law in the country, state, or territory where the video was created, or in the United States.
- [ ] The submission does not display third-party advertising, slogans, logos, or trademarks, and does not indicate a sponsorship or endorsement by a third-party commercial entity. Google Cloud Console appears only as required proof that the backend runs on Google Cloud.
- [ ] The submission does not violate a third party’s publicity, privacy, or intellectual property rights. No unlicensed music, stock footage we do not own, or identifiable person without consent.
- [ ] The Project is our original work, solely owned by the Entrant, and does not violate the intellectual property or other rights of any other person or entity. Open-source dependencies are used under their licenses and disclosed in Section 2.
- [ ] The Project was newly created during the Submission Period. Pre-existing starter code and libraries are disclosed.
- [ ] The Application supports English.
- [ ] We are eligible: above the age of majority (or at least twenty in Taiwan); not residents of a territory the Rules exclude; not Contest Entities or their household members; not in a real or apparent conflict of interest as defined by the Sponsor.

Signature: ______________________________
Date: __________________________________

---

# 7. Master submission checklist

Tick before you hit Submit.

## Required (Stage One is pass/fail)

- [ ] Built with Gemini 3.5 or newer (`gemini-3.5-flash`).
- [ ] Uses a listed Google agent framework (GenAI SDK / `@google/genai`).
- [ ] Uses at least one Google Cloud infrastructure service (Cloud Run and Firestore).
- [ ] One category selected: Collaborative Partner.
- [ ] All teammates added on Devpost and every invite accepted.
- [ ] Hosted project URL filled: `[HOSTED_URL]` (or an explicit note if you took the service down after filming).
- [ ] Repo URL filled: `[GITHUB_URL]`. If private, `testing@devpost.com` and `cloudhackathons@google.com` have access.
- [ ] `README.md` has spin-up instructions (local and Cloud Run). It does.
- [ ] Architecture diagram uploaded (`docs/diagrams/hla.svg`).
- [ ] Demo video public, English, ≤ 4 minutes, live agent, model and SDK spoken, Cloud Run / logs / `.run.app` on screen.
- [ ] Text description covers features, technologies, data sources, and learnings (Section 3).
- [ ] Google SDK question answered: GenAI SDK.
- [ ] Project start date answered: `[PROJECT_START_DATE]`.
- [ ] Testing instructions include credentials if the hosted app is gated.
- [ ] Pre-existing and third-party code disclosed (Section 2).
- [ ] Section 6 initialed.

## Optional bonus

- [ ] Public blog, podcast, or video (not unlisted) that includes the sentence: “I created this for the purposes of entering the All Things Agentic hackathon.” Maximum 0.2 points.
- [ ] Social post on X, LinkedIn, Instagram, or Facebook with `#AllThingsAgenticHackathon`. Maximum 0.2 points.
- [ ] Additional Google AI models (Gemma, Veo, Lyria). We did not integrate these. Do not claim them.

## Social draft (optional)

> We built enaible for the All Things Agentic hackathon: a consulting bench of Gemini 3.5 Flash agents that interviews a leader, grounds use cases in cited evidence, and leaves a printable Strategy Canvas.
>
> Gemini 3.5 Flash · GenAI SDK · Cloud Run · Firestore
>
> `[HOSTED_URL]`
>
> #AllThingsAgenticHackathon

Do not attach a vendor logo. Do not tag a company as a partner unless they agreed.

## Blog outline (optional)

Title: How we built enaible for the All Things Agentic hackathon

Must include, verbatim or clearly: you created the piece for the purposes of entering this hackathon.

1. The friction: AI adoption plans still mean a consulting engagement.
2. The product: five specialists, one canvas, print at the end.
3. The stack, named: Gemini 3.5 Flash, GenAI SDK, Cloud Run, Firestore vector search.
4. Why code routes, not a model: stage machine, one write per turn, schema repair.
5. What we would change: regional Vertex if the model ever supports it; keep the residency note until then.
6. Link the public repo and the public video.

Publish on Medium, dev.to, or an equivalent public URL. Not unlisted.

---

# 8. Testing notes for judges

The Project is a web application. English UI. Sign in with Google.

**Hosted:** `[HOSTED_URL]`

If sign-in is gated:

- `[TEST_EMAIL]`
- `[TEST_PASSWORD]`

`GET [HOSTED_URL]/health` reports the model and endpoint of the running Cloud Run revision.

## Prerequisites (local or your own Cloud Run)

- Node 22 or newer
- A Google Cloud project with Vertex AI and Firestore enabled
- A Firebase project for authentication
- `gcloud`, authenticated

## Credentials

No API key and no service-account JSON in the repository. Application Default Credentials only.

```bash
gcloud auth application-default login
```

The caller needs `roles/aiplatform.user` and `roles/datastore.user`. `./scripts/setup-gcp.sh` grants both, creates the Artifact Registry repository and the runtime service account, and builds the Firestore vector index.

## Configuration

```bash
cp .env.example .env
```

Set `GCP_PROJECT_ID`, the `VITE_FIREBASE_*` keys from the Firebase web app, and `FIREBASE_AUTH_PROJECT_ID` if Auth lives in a different project from Firestore. Keep `GEMINI_TEXT_MODEL=gemini-3.5-flash` and `GCP_LOCATION=global` together. The model is a 404 in any region.

## Local

```bash
npm install
npm run seed
npm run dev
```

`npm run seed` writes the knowledge corpus to Firestore once. It drops any seed document that comes back without a citation.

## Cloud Run

```bash
./scripts/setup-gcp.sh
./scripts/deploy.sh
```

Add the Cloud Run domain to Firebase Auth authorized domains after the first deploy.

## Checks

```bash
npm run typecheck
npm test
```

`npm run eval` calls the live model and costs tokens. It is not required to confirm the Project runs.

## What a judge should see in one session

1. Sign in.
2. Set role, industry, size, region.
3. Describe a bottleneck.
4. Answer Discovery’s questions.
5. Approve at least one use case on the canvas.
6. Watch architecture, roadmap, change plan, and sourcing write into the same document.
7. Print the Strategy Canvas.

More detail: `README.md`, `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`.
