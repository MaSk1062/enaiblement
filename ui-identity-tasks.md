# ui-identity-tasks.md — giving enaible a personality

**Owner:** Geoffrey (UI/UX)
**Base branch:** `dev`
**Companion:** `tasks.md` (§2 ground rules — file ownership, git workflow, testing policy —
apply unchanged here; this file only adds tasks, not new rules)
**Status:** Phase 1 (`tasks.md` UI-1 through UI-6) is done and merged. This is Phase 2.

---

## 1. The finding

An audit of every `.tsx` file, not a vibe check:

| Measurement | Result |
|---|---|
| Font sizes that are `text-xs` or `text-sm` | 79 of 84 (94%) |
| `shadow-*` usages in the whole app | 2 |
| Gradients in the whole app | 1 (the roadmap timeline's open-lane fade) |
| Agents with any visual identity (icon, color) | 0 of 5 |
| Screens using illustration or imagery beyond functional icons | 0 |

The color palette is almost entirely `slate-*`. Amber appears only for "awaiting decision,"
emerald only for "approved," red only for errors — there is no color anywhere that exists
*because it's enaible's*, as opposed to because it's a semantic status. The product's whole
pitch is "a consulting team of five AI specialists," and none of the five have a face, a color,
or an icon — they are five text labels in a pill.

This is not an implementation bug. `tasks.md`'s design language — one font-size tier, semantic
color only, "restrained motion... no decorative animation" — was calibrated for a conservative
B2B admin panel, and every task in Phase 1 correctly implemented it. The result is a product
whose UI reads as a well-organized internal tool, not a five-character consulting-firm
narrative. Fixing that is a design-language change, not a bug fix, which is why it's its own
file rather than an addendum to `tasks.md`.

**Grounding**, not just opinion:

- Google's own Material 3 research (46 studies, 18,000+ participants) found expressive color,
  shape, size and motion made people recognize key UI elements **up to 4x faster** — this is a
  legibility mechanism Google measured, not decoration for its own sake.
  ([design.google](https://design.google/library/expressive-material-design-google-research))
- "One accent color, not three" is correct advice for a data-dense dashboard trying to reduce
  noise — but enaible isn't a dashboard, it's a five-act narrative with five characters. Dashboard
  restraint starves it of the color and character its own pitch depends on.
  ([Eleken](https://www.eleken.co/blog-posts/saas-dashboard-design))
- 2026 AI-agent UX guidance: *"by 2026, an AI's character won't be an afterthought — it will be
  a first-class design choice, as essential as its functionality."*
  ([o-mega](https://o-mega.ai/articles/designing-the-right-character-for-your-ai-2026-guide))

---

## 2. Before writing code

Every task below that involves a genuine creative decision (a color, an icon set, a motion
style) is marked **PROPOSED** with 2–3 concrete options and a recommendation — not a settled
spec the way `tasks.md`'s tasks were. Confirm the direction before implementing it. This file
documents an audit and a plan; it does not pre-authorize a repaint.

Everything else — file ownership, the `ui/<slug>` branch-per-task workflow, rebase-before-merge,
`npm run typecheck && npm test` before every merge, no new dependencies without asking, comments
explain why not what — is exactly `tasks.md` §2. Nothing about the git or testing discipline
changes for this phase.

---

## 3. The tasks

Ordered by cost-to-impact ratio, cheapest high-signal fixes first.

---

### UI-9 · Loading, empty, and dead-end states have no personality

**Branch:** `ui/state-personality` · **Effort:** ~1h · **Self-contained, no design decision needed**

Flagged directly: `dashboard.tsx`'s `Centered` component renders "Loading your consultation…"
as plain gray text and an underlined "Sign out" link on an empty page — and it's reused
identically for the error state and the "no active consultation" state, so a genuine failure
looks visually indistinguishable from an ordinary loading screen. `home.tsx`'s redirect screen
is worse: a fully blank `bg-slate-50` rectangle with nothing in it at all, however briefly.

- Every one of these screens should show the `enaible` wordmark (small, top or center) —
  right now they're the only screens in the entire app with no brand mark on them at all, which
  is part of why a failure reads as "the page broke" instead of "enaible hit a snag."
  - Add a subtle loading indicator to the loading state — reuse `SpinnerIcon` from
    `app/lib/icons.tsx` (already built for the progress rail, `animate-spin`), not a new icon.
  - Give the error state its own visual treatment distinct from loading — an icon or a colored
    accent (the existing `red-600` text stays, but pair it with something that reads as "this is
    a problem" at a glance, not just a color change on the same gray page).
  - `home.tsx`'s blank redirect screen gets the same treatment as loading, even though it's
    typically on screen for well under a second — a flash of nothing still reads as broken if it
    happens to land badly.

**Done when:** no screen in the app is ever fully blank, and a loading state and an error state
are visually distinguishable from each other without reading the text.

**Tests:** none (markup only). Add to the §4 smoke checklist in `tasks.md`: reload mid-boot and
confirm the loading screen isn't blank; force a bootstrap error (bad session id) and confirm it
looks different from loading, not just says different words.

---

### UI-10 · Agent personas — an icon and a color per specialist

**Branch:** `ui/agent-personas` · **Effort:** ~2.5h · **The single highest-leverage fix here**

The five specialists (`AGENT_NAMES` in `app/agents/names.ts`) currently have a name and nothing
else. Give each one a small icon and an accent color, then use that pairing everywhere the
agent's name already appears — the progress rail, chat bubble agent-name labels, and Canvas
section headers — so a specialist reads as a character with continuity, not five interchangeable
labels attached to five text blocks.

- **PROPOSED** icon set (new additions to `app/lib/icons.tsx`, same inline-SVG style as
  `ChatIcon`/`CheckIcon`): a compass or magnifying glass for Discovery Consultant, a chart/trend
  glyph for Industry Analyst, a layered-stack glyph for Technical Architect, a checklist/flag
  glyph for Project Manager, a people/handshake glyph for Change Coach. Confirm before drawing
  five new SVGs — this is the most time-consuming part of this task.
- **PROPOSED** color: one accent hue per agent, distinguishable but from the same family so
  the app doesn't turn into five unrelated brand colors. E.g., a five-step hue rotation at fixed
  saturation/lightness (Tailwind doesn't ship this out of the box for arbitrary hues without
  picking specific swatches — this needs 5 concrete Tailwind colors chosen, not "a rotation").
  Candidates to choose from: `{blue, violet, fuchsia, orange, teal}`-600 for text/icon,
  matching `-50` for backgrounds — keeps every agent's card legible against `bg-slate-50` and
  distinct from the amber/emerald/red that already carry status meaning.
- Extend `app/lib/agentStatus.ts`'s `STATUS` record with an `icon` and `accent` per stage (it
  already centralizes name + working text per stage — this is the natural home, not a new file).
- Wire it into: `ProgressRail` (`dashboard.tsx`) — the active/done chip's icon and color instead
  of the current all-black/all-gray treatment; `Bubble`'s agent-name label
  (`dashboard.chat.tsx`) — small icon before the name; Canvas section headers
  (`CanvasPanel.tsx`'s `Section`) — an optional icon slot next to the title, used for the
  sections each agent owns.

**Done when:** every place an agent's name renders, its icon and color render with it, and the
mapping is defined in exactly one place (`agentStatus.ts`).

**Tests:** the icon/color lookup is a plain object, not logic — no test needed. If a derivation
gets added (e.g. "which accent class for stage X"), it goes in a `.ts` module and gets tested
per `tasks.md`'s policy.

---

### UI-11 · A real type scale for the moments that deserve one

**Branch:** `ui/type-scale` · **Effort:** ~1.5h · **Self-contained**

94% of the app's text is one of two sizes. That's correct for body copy and labels — it's wrong
for the handful of moments that are supposed to be a payoff: the login/onboarding headline, and
"Your finished AI enablement strategy" (currently `text-sm`, the same size as a form label).

- Login (`Shell` in `login.tsx`) and onboarding's `enaible` wordmark: currently `text-2xl`.
  Consider `text-3xl` or `text-4xl` for the wordmark specifically — it's the one brand moment
  every user sees before anything else loads.
- The completed-strategy header line (`dashboard.chat.tsx` and `dashboard.canvas.tsx`,
  "Your finished AI enablement strategy") moves from `text-sm text-slate-500` to something that
  reads as an actual milestone — `text-lg font-medium text-slate-900` at minimum.
- Canvas section titles (`Section`'s `<h2>` in `CanvasPanel.tsx`) stay small and uppercase —
  that's a legitimate, intentional "quiet label" pattern already used consistently, not part of
  the problem. Don't blow these up; the point is contrast between the rare hero moment and the
  otherwise-quiet scale, not inflating everything.

**Done when:** there are at least 2–3 places in the app where text is visibly, deliberately
larger than the surrounding UI because that content earned it — not applied uniformly.

**Tests:** none (markup only).

---

### UI-12 · Depth — shadows on the two things that deserve to feel lifted

**Branch:** `ui/depth` · **Effort:** ~1h · **Self-contained**

Two `shadow-sm` usages exist in the entire app (the composer and the Google sign-in button).
Nothing else has any elevation, so nothing signals "this is the important thing on screen right
now" through depth — only through color, which is already overloaded doing semantic-status duty.

- The active/working agent's chip in `ProgressRail` (`dashboard.tsx`) gets a shadow while
  `sending` is true — pairs with the spinner UI-2 already added, reinforcing "this one is alive
  right now" through a second channel, not just the spin.
- The completed Canvas, wherever it's the whole point of the page (`dashboard.canvas.tsx`, and
  the main column in `dashboard.chat.tsx`'s completed view), gets treated as an artifact rather
  than a form — a subtle `shadow-sm` (not `shadow-lg`; this should read as "a document," not "a
  modal") on its outer container.
- Do not add shadows to every card — `UseCaseCard`, roadmap phase cards, etc. stay flat. Adding
  depth everywhere cancels the signal depth is supposed to send.

**Done when:** exactly the things that are "the current focus" have a shadow, and nothing else
does.

**Tests:** none (markup only).

---

### UI-13 · Motion with intent at the handoff moment

**Branch:** `ui/handoff-motion` · **Effort:** ~2h · **Builds on UI-2's entrance transition**

`tasks.md`'s "restrained motion, no decorative animation" rule is right in general — but the
2026 AI-agent research above is specific that showing an agent's step-by-step handoff is a
*trust* mechanism, not decoration, for exactly this kind of product. Right now a handoff is:
the old agent's chip goes from black to gray, the new one goes from gray to black, instantly.

- **PROPOSED:** when `currentStage` changes, the newly-active chip in `ProgressRail` gets a
  brief (300–400ms) pulse or glow using its UI-10 accent color, once, on the transition — not a
  looping animation. `prefers-reduced-motion` respected, same as the existing
  `animate-section-enter` in `app.css`.
  Two ways to implement, either is fine: a CSS `@keyframes` triggered by a `key`-based remount
  (matches the existing `animate-section-enter` pattern exactly), or a small `useEffect` that
  toggles a class for the animation's duration.
- The existing `animate-section-enter` on Canvas sections (UI-2) stays as-is — this task is
  additive, not a replacement.
- Do not add motion to anything that isn't a genuine state change (no hover-bounce, no
  decorative idle animation) — that's exactly the kind of motion `tasks.md` was right to rule
  out, and this task isn't reversing that call, only adding the one motion moment the research
  says actually matters for an agent product.

**Done when:** a stage handoff is visibly, briefly different from a static state change, and
nothing else in the app gained new motion.

**Tests:** none (markup + CSS only).

---

### UI-14 · A brand color, used with intent

**Branch:** `ui/brand-color` · **Effort:** ~2h · **Do this after UI-10, not before**

Colors "are maybe fine but can be better" — the real gap is that there is no color anywhere
that exists *because it's enaible's*. Slate is the entire personality. This is lower priority
than UI-10 on purpose: picking the five agent accents first (UI-10) will likely suggest what the
one brand color should relate to, rather than picking a brand color in a vacuum and then trying
to make five agent colors harmonize with it after the fact.

- **PROPOSED options** for the one signature hue (used on the primary CTA, the header's active
  states, and anywhere the product itself — not an agent, not a status — is the subject):
  1. A deep indigo/violet (`indigo-600` / `violet-600`) — closest to what reads as "serious AI
     product" today (Gemini, most AI-consulting competitors land here). Safe, slightly generic.
  2. A warm amber/copper as the *primary* action color instead of `slate-900` — repositions the
     currently-neutral "awaiting decision" amber as the brand color itself, which also ties
     naturally to the Africa positioning line UI-7 already wrote (warm, not corporate-blue).
     Requires re-deciding what "awaiting decision" uses instead (amber is heavily load-bearing
     today for that one status).
  3. Keep `slate-900` as the primary action color (don't touch it — every button in the app
     already uses it, this is the lowest-risk option) and introduce the brand color *only* as a
     header/wordmark accent, never as a functional button color. Lowest blast radius, weakest
     effect.
  - Recommendation: option 1 or 3 to start — option 2 is the most distinctive but requires
    re-solving the "awaiting decision" status color everywhere it's currently amber
    (`UseCaseDecisions`, `CanvasPanel`'s pending badge), which is a bigger, riskier change than
    this task's effort estimate assumes if chosen.
- Wherever the chosen color lands, it must stay easy to tell apart from the amber/emerald/red
  status colors at a glance — a brand color that gets mistaken for "you have a decision to make"
  is worse than no brand color.

**Done when:** there is exactly one color in the app that exists for brand reasons rather than
semantic-status reasons, and it never collides visually with amber/emerald/red.

**Tests:** none (markup + `app.css`/`@theme` only, if a custom color token is added).

---

## 4. Order of work

1. **UI-9** (1h) — the loading/error state fix is cheap, needs no design decision, and directly
   answers the exact complaint that prompted this file.
2. **UI-10** (2.5h) — the highest-leverage fix. Needs the icon set + color choices confirmed
   before starting.
3. **UI-11** (1.5h) — cheap, self-contained, no dependency on UI-10.
4. **UI-12** (1h) — cheap, self-contained.
5. **UI-13** (2h) — do after UI-10, since the handoff pulse should use each agent's UI-10 accent.
6. **UI-14** (2h) — do last, informed by whatever UI-10 lands on.

Total: roughly 10 hours across six tasks — all of it before touching `tasks.md`'s UI-7/UI-8,
which stay held on their own branches regardless of what happens here.
