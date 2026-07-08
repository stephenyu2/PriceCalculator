# Generator Agent (Author)

**Role:** Produce the structured content JSON for ONE material from a blueprint (or,
for cluster materials, from the cluster's per-standard blueprints). A material is a
lesson, a worksheet (single ramped OR one tier of a two-tier standard), a quiz, a
cluster-worksheet, or a cluster-test. Every problem ships with its answer key and
worked steps, fully tagged.

**Input:** `pipeline/blueprints/<standard>.json` (for standard-scoped materials), the
target material descriptor (`materialType`, `tier`, and for cluster materials the
`clusterId` + the cluster's standard list), and on a retry `pipeline/feedback/<id>.json`
(the Verifier's specific, per-item complaints). On a retry, fix exactly what the
feedback names; do not regenerate items that already passed.

**Output:** One file at `pipeline/staging/<id>.json` matching
`pipeline/schemas/content-item.json`, where `<id>` is:
- lesson: `<standard>--lesson`
- worksheet (single ramped, the default): `<standard>--worksheet`
- worksheet (complex standard, two tiers): `<standard>--worksheet--tier1` and `<standard>--worksheet--tier2`
- quiz: `<standard>--quiz`
- cluster-worksheet: `<clusterId>--cluster-worksheet`
- cluster-test: `<clusterId>--cluster-test`

**Renderer contract — this is non-negotiable, the page throws "Material not found"
if violated** (see `library/material.js`):

- **lesson** items: `type` ∈ {`worked-example`, `practice`}, `id`, `prompt`,
  `solution.steps` (non-empty string array), `solution.answer` (non-empty).
  `practice` items may include a `hint`.
- **worksheet** items: `id`, `prompt`, `answer` (non-empty), `solution.steps`
  (non-empty). Constructed-response is fine; the answer key shows answer + steps.
  A single `<standard>--worksheet` has 15 items that RAMP Easy to Hard across the
  sheet (top-level `difficulty: null`, `tier: null`). A `tier1` sheet has 15 items
  ramping Easy to Medium (`tier: "tier1"`); a `tier2` sheet has 15 items ramping
  Medium to Hard (`tier: "tier2"`) and must NOT duplicate any tier1 item.
- **quiz** items: MUST be multiple choice. `prompt` ends with options on their own
  lines `A) ...` `B) ...` `C) ...` `D) ...` (>=2, usually 4, all distinct). `answer`
  begins with the correct letter, e.g. `"B) Mount Everest"`. `solution.steps`
  (non-empty) explains why the key is right and why the distractors are wrong.
  Each item also carries `difficulty` ∈ {Easy, Medium, Hard}. Distractors come from
  the blueprint's `commonMisconceptions`.
- **cluster-worksheet** items: worksheet contract (prompt, answer, solution.steps),
  15 items that span and RAMP across the whole cluster. `standard: null` and
  `clusterId` are set at the top level; EACH item additionally carries its own
  `standard` field (which standard in the cluster it targets). Items MUST be ORDERED
  grouped by standard (all items for the first standard, then the next, ...) so
  material.js renders per-standard section headers.
- **cluster-test** items: quiz contract (multiple choice, 4 options, answer letter,
  solution.steps), 12 items spanning the cluster. `standard: null` and `clusterId`
  set at top level; EACH item carries its own `standard` field. Items ordered grouped
  by standard. This is the end-of-cluster mastery check.

**Cluster context:** cluster materials have no blueprint of their own. Draw on the
cluster's standards (their skillNames are supplied; you may also read each standard's
`pipeline/blueprints/<code>.json` and its stored `../data/content/<code>--lesson.json`
for archetypes and tone). Cover every standard in the cluster.

**Self-contained stimulus (ELA):** If an item needs a passage/sentence/excerpt,
embed it in the `prompt`. Never reference an external text.

**Math notation (subject = math):** Write ALL math in LaTeX between `$` delimiters
(KaTeX). Fractions are `$\frac{7}{6}$`, never bare `7/6`. Use `$x^2$`, `$\sqrt5$`,
`$\sin\theta$`, `$\frac{\pi}{3}$`. Every `$` must be balanced. Prefer exact values
(radicals, `$\pi$`, fractions) over rounded decimals. Quiz options each carry their
own LaTeX, e.g. `A) $\frac{\sqrt3}{2}$`.

**Counts:** Exactly the blueprint's `itemCounts` for standard materials (worksheet
single/tier1/tier2 = 15, quiz = 8, lesson 5+5). Cluster materials: cluster-worksheet =
15, cluster-test = 12. Quiz/cluster-test difficulty mix should span Easy to Hard
(roughly 3 Easy / 3 Medium / 2 Hard for an 8-item quiz).

**Hard rules:** No em dashes (use commas/periods). Grade-appropriate. Answers must
be unambiguously correct and the keyed option the single best answer. Output valid
JSON only, written to the staging path. Return a one-line status, not the content.
