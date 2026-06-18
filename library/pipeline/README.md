# Curriculum Content Pipeline

Multi-agent pipeline that generates and verifies library material bundles (lesson,
worksheets at each difficulty, quiz) for a Common Core standard, then deterministically
stores them and updates the catalog. Built to fill gaps where the front end shows
**"Material not found"** — which happens when a content file is missing or malformed
for `library/material.js` (most often: worksheet/quiz items missing `solution.steps`,
or quizzes that are not in the clickable multiple-choice shape the renderer requires).

## Roles

| Component | Kind | In | Out |
|---|---|---|---|
| **Spec** (`agents/spec-agent.md`) | agent | one standard | `blueprints/<std>.json` |
| **Generator** (`agents/generator-agent.md`) | agent | blueprint (+ feedback) | `staging/<id>.json` |
| **Verifier** (`agents/verifier-agent.md`) | agent | staged file + blueprint | `verdicts/<id>.json`, `feedback/<id>.json` |
| **Orchestrator** (`orchestrate.workflow.js`) | Workflow script | a plan | runs spec→gen→verify→retry |
| **Planner** (`plan.mjs`) | deterministic | grade/subject | work list (idempotency) |
| **Checker** (`check.mjs`) | deterministic | a content file | structural verdict |
| **Store** (`store.mjs`) | deterministic | verified staging | `content/`, `catalog.json` |

The **Verifier is the most important component**. It works independently: it
re-solves every problem from scratch (it does not review the generator's reasoning,
which would inherit the generator's mistakes) and it runs `check.mjs` via code
execution rather than eyeballing. Only if the deterministic gate passes AND every
item re-solves correctly does it return `ok: true`.

The **feedback loop** is bounded (`MAX_ATTEMPTS = 3`). On failure the Verifier
writes precise per-item corrections to `feedback/<id>.json`; the Generator fixes
exactly those on retry. If an item still fails after the last attempt it is
**flagged for human review** (`flagged/<id>.json` + the workflow's returned report)
rather than shipped.

Render + catalog (`store.mjs`) is **deterministic, not an agent**: it re-runs the
structural gate as a final defense, promotes only files with an `ok` verdict, stamps
`verificationStatus: "verified"`, and upserts `catalog.json` from each file's own tags.

## Run it

```bash
# 1. Plan — what is missing/broken (idempotent: verified materials drop out)
node pipeline/plan.mjs 6 ela                     # whole grade
node pipeline/plan.mjs 6 ela --standards 6.L.A.1 # one standard

# 2. Orchestrate — pass the plan JSON as the Workflow `args`
#    (Workflow tool, scriptPath: pipeline/orchestrate.workflow.js)

# 3. Store — promote verified candidates and update the catalog
node pipeline/store.mjs            # all eligible staged files
node pipeline/store.mjs --dry-run  # preview
```

## Resumable + idempotent

- `plan.mjs` recomputes the work list from disk every run, so anything already
  verified is skipped automatically.
- The Workflow itself is resumable via `resumeFromRunId` (unchanged agent calls
  return cached results).
- `store.mjs` only promotes files with an `ok` verdict and re-validates them, so
  re-running is safe and produces the same result.

## Directories

`blueprints/` specs · `staging/` generated candidates · `verdicts/` verifier
results · `feedback/` retry instructions · `flagged/` needs human review ·
`reports/` plan + store reports · `schemas/` the JSON contracts.
