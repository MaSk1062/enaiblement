# tasks.md — UI/UX workstream

**Owner:** Geoffrey (UI/UX)
**Base branch:** `dev`
**Companion:** `suggestions.md` (backend/rubric review) — read §2 before starting, it explains
why the UI work below is ordered the way it is.

---

## 1. The thesis

The product is **a consultation that produces a document.** Right now the UI is two tabs —
Chat and Canvas — which frames it as a chat app with a sidebar. It is not. It should read as
one surface that changes shape as the consultation moves:

| Phase | What the user is doing | Surface |
|---|---|---|
| **1 · Interview** | answering the Discovery Consultant | chat is everything |
| **2 · Decide** | approving use cases | chat, with the gate inline |
| **3 · Build-out** | watching four specialists work | *the missing shape* — a live pipeline, canvas filling in |
| **4 · Review** | interrogating and revising the strategy | canvas is the page, chat is a rail |
| **5 · Take away** | leaving with the document | print/export |

`app/routes/dashboard.chat.tsx` already implements shapes 1–2 and 4, and does it well. **Our job
is shape 3 and shape 5, plus making the canvas actually look like a deliverable.** Shape 3 only
matters once the backend auto-chains stages (`suggestions.md` P0-1) — until then it degrades
gracefully into a one-stage-at-a-time view.

Two things currently break the illusion badly, and both are ours:

1. The user has to invent a message ("ok", "continue") four times to move the pipeline.
2. The Change Coach's closing line says *"you can review and export it from the dashboard"* and
   there is no export. The demo's last twenty seconds land on a promise we do not keep.

---

## 2. Ground rules

### File ownership

Backend is working in the same repo at the same time. Stay on your side of the line.

| Yours | His | Shared — never edit without telling him |
|---|---|---|
| `app/routes/*.tsx` | `app/agents/**` | `app/types.ts` |
| `app/lib/*.tsx` | `app/services/**` | `app/routes.ts` |
| `app/lib/*.ts` (UI helpers) | `app/orchestrator/**` | `package.json` |
| `app/app.css`, `app/root.tsx` | `app/routes/api.*.ts` | |

If a task needs a field that does not exist on `AgentState`, **do not add it yourself** — ask
him, and build against a hand-written fixture in the meantime. That is what
`IMPLEMENTATION_PLAN.md` §10 means by "contract-first."

### Git

```
main   ← deployable only. merges from dev, never direct commits.
dev    ← integration. current branch. never commit directly.
ui/*   ← one branch per task below, cut from dev.
```

Per task:

```bash
git checkout dev && git pull --ff-only
git checkout -b ui/<slug>
# ...work, small commits...
npm run typecheck && npm test
git checkout dev && git pull --ff-only
git checkout ui/<slug> && git rebase dev     # rebase before merging, backend moves fast
git checkout dev && git merge --no-ff ui/<slug>
git push origin dev
```

Commit messages follow the style already in the log — `feat(canvas):`, `fix(chat):`,
`style(ui):`, subject in the imperative, body says *why* not *what*.

Never merge a branch that has not had `npm run typecheck` **and** `npm test` run clean on it.

### Testing policy — "where necessary" means this

`npm test` is `node --test` over `*.test.ts` with Node's native type stripping. **There is no
JSX test runner in this repo** — no vitest, no jest, no testing-library, no Playwright. Adding
one mid-sprint is a cost, not a win.

So the rule is:

- **Logic gets a test. Markup does not.** Anything with branching, parsing, sorting, date or
  geometry maths goes into a plain `app/lib/<name>.ts` — no JSX, no `?raw` imports, no React —
  with a `<name>.test.ts` beside it. Node runs those today with zero new dependencies.
- **Components get a manual smoke checklist** (§4), run before every merge into `dev`.
- If a task genuinely cannot be covered this way and you think it needs vitest, say so before
  installing anything. `package.json` is shared.

---

## 3. The tasks

Ordered by demo impact. UI-1 and UI-2 are the two that change how the video feels.

---

### UI-1 · Kill the dead turns at the gate

**Branch:** `ui/gate-cta` · **Effort:** ~1h · **Blocks nothing** · **Ships value before backend lands**

Today, after approving use cases, the user must type something for the Architect to run. There
is no button. `UseCaseDecisions` just says "reply below."

- Add a primary CTA inside `UseCaseDecisions` in `app/lib/CanvasPanel.tsx` — *"Design my stack →"*
  — enabled once ≥1 use case is approved, that calls `send()` with a fixed message.
- Disabled state with reason when nothing is approved yet ("Approve at least one to continue").
- Do the same at any other point where the user has nothing meaningful to say: the composer
  placeholder should never be the only affordance for "continue."
- When backend P0-1 lands, this button becomes redundant on the forward path — keep it, it
  becomes the explicit "go" that reads well on video, and `decide()` will just advance further.

**Done when:** a user can complete the consultation without typing a single filler message.

**Tests:** none needed (pure markup + an existing callback).

---

### UI-2 · The build-out shape — a live pipeline view

**Branch:** `ui/working-state` · **Effort:** ~4h · **Coordinate:** best after backend P0-1, degrades fine before it

This is shape 3, and it is the money shot of the demo video. Right now a turn shows three
bouncing dots and one line of text, for 12–22 seconds when the grounded search runs. With
auto-chaining that becomes closer to a minute of dots.

- Promote `ProgressRail` (in `app/routes/dashboard.tsx`) from decoration to the live view:
  the active agent chip gets a spinner and its `working` string from `app/lib/agentStatus.ts`,
  completed chips get their output summarised in one line ("3 use cases", "5-phase roadmap").
- While a turn is in flight past the gate, render the canvas *beside* the chat rather than
  after it, and let sections appear as their fields land. `CanvasPanel` already renders each
  section conditionally on its `AgentState` field, so this mostly falls out — the work is the
  layout switch and an entrance transition.
- Add elapsed-time text after ~5s ("Industry Analyst · searching the web · 8s"). Silence past
  five seconds reads as broken.
- Put the working state in an `aria-live="polite"` region. The `Dots` component is correctly
  `aria-hidden`, but the status text next to it is not announced today.

**Done when:** at no point during a run is the screen static for more than ~2s without
something changing.

**Tests:** if you write an elapsed-time formatter or a "which sections are ready" derivation,
put it in `app/lib/pipelineView.ts` and test it. The layout itself: smoke checklist.

---

### UI-3 · Roadmap timeline (the "Gantt" we promised)

**Branch:** `ui/roadmap-timeline` · **Effort:** ~3h · **Self-contained**

The pitch says Gantt chart. `IMPLEMENTATION_PLAN.md` §7 consciously downgraded that to "a
horizontal three-phase timeline in CSS grid" — and even that was never built. Today
`roadmapPhases[]` renders as a plain ordered list with a duration string on the right.

- New pure module `app/lib/timeline.ts`: parse `phase.duration` strings — the roadmap prompt
  produces `"Weeks 1-4"`, `"Weeks 5-12"`, `"Month 4+"` — into `{ startWeek, endWeek, open }`
  lane geometry, with a sane fallback for anything unparseable (sequential lanes, never a
  crash).
- Render as a CSS-grid timeline in `CanvasPanel.tsx`: week ruler across the top, one bar per
  phase, deliverable count and resource count on the bar, expandable to the existing detail.
- Keep the list as the mobile fallback under `sm:`.
- No Gantt library. It is a grid.

**Done when:** the roadmap section reads as a timeline at a glance and still shows every
deliverable on interaction.

**Tests — required.** `app/lib/timeline.test.ts`:

- `"Weeks 1-4"` → `{ startWeek: 1, endWeek: 4 }`
- `"Weeks 5-12"` → `{ startWeek: 5, endWeek: 12 }`
- `"Month 4+"` → open-ended, flagged `open: true`
- garbage input → falls back to sequential lanes, does not throw
- three phases → total span and lane offsets are correct and non-overlapping

This is exactly the kind of parsing that breaks silently on a live demo when the model phrases
a duration slightly differently. Test it properly.

---

### UI-4 · One canvas, not two

**Branch:** `ui/canvas-ia` · **Effort:** ~1.5h · **Self-contained**

`app/routes/dashboard.canvas.tsx` says in its own comment *"Not linked from anywhere any
more"* — but `Nav` in `dashboard.tsx` still links to it, and it renders the same `CanvasPanel`
as the completed chat view. Two routes, one artifact, no difference.

- Decide and commit: `/dashboard/canvas` becomes **the print / export view** (see UI-5) and the
  nav link becomes "Export" or disappears until the strategy is complete.
- Fix the stale comment either way — a judge reading the repo sees a contradiction.
- Keep the pending-count badge, but move it onto whatever surfaces the gate. It is currently
  the only pointer to the decision that is blocking the pipeline.
- Add section anchors to `CanvasPanel` so the chat rail can deep-link ("I changed the roadmap"
  → scroll to the roadmap section). Cheap, and it makes revision feel connected.

**Done when:** there is exactly one way to see each thing, and the nav never offers a view that
is empty.

**Tests:** none (routing + markup). Add it to the smoke checklist.

---

### UI-5 · Make the strategy leave the building

**Branch:** `ui/print-export` · **Effort:** ~2.5h · **Unblocks the closing line of the demo**

`suggestions.md` P1-1 proposes a real `POST /api/export`. We do not need to wait for it. A
print stylesheet is a genuine PDF, today, with zero backend.

- Print styles targeting `/dashboard/canvas`: hide the app chrome, nav, composer and buttons;
  force light colours; avoid page breaks inside phase cards and use-case cards
  (`break-inside: avoid`); add a header with the client's name, role, industry and the date.
- A visible **"Download strategy (PDF)"** button on the completed canvas calling
  `window.print()`.
- Show approved use cases prominently and rejected ones either omitted or clearly struck — the
  export is the artifact, not the audit log.
- If backend ships `POST /api/export`, this button switches to a real download and the print
  path stays as the fallback.

**Done when:** the Change Coach's closing line is true, and printing produces something a CTO
would forward.

**Tests:** if you build a "what goes in the export" selector (approved only, ordering,
omissions), put it in `app/lib/exportView.ts` and test it. Print CSS: smoke checklist, with an
actual print preview.

---

### UI-6 · States, responsive, accessibility

**Branch:** `ui/states` · **Effort:** ~3h · **Do before the freeze, not after**

The cut list in `IMPLEMENTATION_PLAN.md` §9 dropped mobile at position 3. Fine for a laptop
demo, but "Best Multimodal UX" is a $5,000 prize and the fixes are small.

- Every dead end has a way out. `Centered` in `dashboard.tsx` handles this for the three
  bootstrap failures — check nothing else strands the user.
- Empty states: `CanvasPanel`'s pre-use-case copy is good. Check the chat before the first
  reply and the canvas mid-pipeline.
- Errors: the red banner exists in `Conversation`. Make sure a failed `decide()` surfaces too —
  it currently sets `error` on the dashboard but the canvas does not render it.
- Mobile: the completed view is `lg:flex-row`, which is right. Check the gate card, the
  progress rail (it scrolls — good) and the new timeline at 375px.
- a11y: `aria-live` on the working state (UI-2), focus management when the canvas takes over
  the page, visible focus rings on the approve/reject buttons, and check the amber and slate-400
  text against WCAG AA — `text-slate-400` on `bg-slate-50` is borderline.

**Tests:** smoke checklist + one pass with the keyboard only.

---

### UI-7 · Region and the Africa story — *coordinate with backend*

**Branch:** `ui/region` · **Effort:** ~1.5h · **Blocked on:** `SessionUserProfile` gaining `region`

Nothing in the running product says Africa (`suggestions.md` P1-3). Half the fix is ours:

- Region select in `app/routes/onboarding.tsx` alongside role and industry.
- Positioning line on `login.tsx` — the current one ("A consulting team of five AI
  specialists…") is good but geographically neutral.
- Currency-aware formatting wherever budget figures appear (UI-5, and the sourcing section if
  backend P1-2 lands).

Ask him to add `region` to `SessionUserProfile` in `app/types.ts` and to the
`/api/session/start` zod body. Until then, build the select and hold the branch.

---

### UI-8 · Architecture diagram renderer — *blocked*

**Branch:** `ui/diagram` · **Effort:** ~2h · **Blocked on:** backend P2-1 emitting Mermaid

Build the renderer against a hardcoded fixture now so it is a one-line swap when the field
lands. Do not merge into `dev` until the backend field exists — a canvas section that renders
nothing is worse than no section.

---

## 4. Manual smoke checklist

Run before every merge into `dev`. Takes four minutes.

1. Signed out → `/` redirects to `/login`
2. Google sign-in → new account lands on `/onboarding`
3. Onboarding with all three (four, after UI-7) fields → chat, greeting from the Discovery Consultant
4. Answer three questions → handoff message → use cases appear with a provenance line
5. Approve one, reject one → CTA enables → pipeline advances with no typed filler
6. Stack, roadmap and change plan all render; the timeline is legible
7. Ask a follow-up ("make the roadmap shorter") → revision is attributed to the right specialist
8. Print preview produces a clean document
9. Reload mid-consultation → session resumes at the same stage
10. Sign out → back to `/login`
11. Repeat 3–6 at 375px width
12. Tab through the gate and approve with the keyboard only

---

## 5. Master prompt for Claude Code

Paste this at the start of a session, then give it one task from §3 at a time.

```
You are working on `enaible` — an AI enablement consulting agent built for the Google
"All Things Agentic" hackathon. I own the UI/UX workstream. My teammate owns the backend and
is committing to the same repo right now.

## Read first, before writing anything
- `tasks.md` — my workstream, the flow thesis, file ownership, git rules, testing policy
- `suggestions.md` — the rubric review; §2 explains why the UI work is ordered as it is
- `docs/ARCHITECTURE.md` §6 (stage machine), §8 (frontend and deployment)
- `app/types.ts` — the contract. Every module on both sides of the API imports from here.

## Stack (do not change any of it)
- React Router v8 in framework mode, SSR on. Routes are declared in `app/routes.ts` — a route
  file that is not listed there does not exist. React 19.
- Tailwind CSS v4 via `@tailwindcss/vite`. Utility classes in JSX only.
- TypeScript strict. `npm run typecheck` is `react-router typegen && tsc`.
- No component library, no icon library, no CSS-in-JS, no state library. Client state is one
  React context: `app/lib/consultation.ts`.
- Tests are `node --test` over `*.test.ts`, native type stripping, zero test dependencies.
  There is no JSX test runner.

## Design language — extract from the existing code, do not invent a new one
- Page `bg-slate-50`; surfaces `bg-white`
- Dividers `border-slate-200`; interactive borders `border-slate-300`; focus `focus:border-slate-900`
- Text: `text-slate-900` primary · `text-slate-700` body · `text-slate-500` secondary · `text-slate-400` tertiary
- Base size `text-sm`. Section labels: `text-xs font-medium tracking-wide uppercase text-slate-500`
- Radii: `rounded-lg` controls · `rounded-xl` cards · `rounded-2xl` panels and bubbles
- Primary action: `bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40`
- Semantics: amber = awaiting a decision or a flagged risk · emerald = approved ·
  red = error. Use the exact shades already in `app/lib/CanvasPanel.tsx`.
- Icons: inline SVG only (see `GoogleMark` in `app/routes/login.tsx`).
- Restrained motion. `transition` on interactive elements; no decorative animation.

## Rules
1. **Stay in my lane.** I may edit `app/routes/*.tsx`, `app/lib/*.tsx`, `app/lib/*.ts` (UI
   helpers), `app/app.css`, `app/root.tsx`. Do NOT edit `app/agents/**`, `app/services/**`,
   `app/orchestrator/**`, or `app/routes/api.*.ts`. `app/types.ts`, `app/routes.ts` and
   `package.json` are shared — if a change needs one of them, STOP and tell me what you need
   and why; do not edit it.
2. **Never add a dependency.** If you believe one is required, stop and make the case.
3. **This is NOT a Hytel monorepo.** It is a flat React Router app. Do not apply Hytel folder
   conventions, do not introduce pnpm/Turborepo/tRPC/shadcn, do not reorganise directories.
4. **Logic goes in a plain `.ts` module with a test; markup does not get tested.** Anything with
   branching, parsing, or geometry maths goes in `app/lib/<name>.ts` — no JSX, no React, no
   `?raw` imports — with `app/lib/<name>.test.ts` beside it, in the style of the existing
   `app/orchestrator/stageMachine.test.ts`. Cover the failure cases, not just the happy path.
5. **Comments explain why, not what.** Match the existing voice. The codebase uses a
   `ponytail:` prefix for "here is what I deliberately traded away and what it would cost to
   undo" — use it when you cut a corner, and be specific.
6. **One task, one branch.** Start with `git checkout dev && git pull --ff-only &&
   git checkout -b ui/<slug>`. Small commits. Conventional messages (`feat(canvas):`,
   `fix(chat):`, `style(ui):`), subject imperative, body says why.
7. **Definition of done:** `npm run typecheck` clean, `npm test` passes, the relevant items in
   the §4 smoke checklist verified, and a one-paragraph summary of what changed and what I
   should look at.
8. **Do not deploy, do not run `scripts/deploy.sh` or `scripts/setup-gcp.sh`, do not run
   `npm run eval`** — the eval burns the same Vertex quota as the demo.

## How to work with me
Before you write code for a task: restate the task in your own words, list the files you intend
to touch, and name anything you need from the backend side. Wait for me to confirm. Then work.

If you hit something that contradicts these instructions or the docs, say so instead of picking
a side quietly — the docs have known drift (`suggestions.md` §P2-2 lists three examples).

My first task is: [paste one task from tasks.md §3]
```

---

## 6. Order of work

If the clock is short, this is the sequence that protects the demo:

1. **UI-1** (1h) — removes the worst rubric problem you can fix alone
2. **UI-5** (2.5h) — makes the closing line of the demo true
3. **UI-3** (3h) — closes the Gantt gap that is in our own pitch
4. **UI-2** (4h) — the shot that makes the video feel like an agent
5. **UI-4** (1.5h) — tidies the IA before anyone films it
6. **UI-6** (3h) — before the freeze, never after
7. **UI-7 / UI-8** — only if backend lands their halves

Freeze the UI 4 hours before submission. Last four hours are rehearsal, per
`IMPLEMENTATION_PLAN.md` §2.
