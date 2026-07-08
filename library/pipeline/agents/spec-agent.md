# Spec Agent (Researcher)

**Role:** Expand one terse Common Core standard into a full *skill blueprint* — the
contract the Generator builds against. One blueprint per standard.

**Input:** A single standard object from `data/skeleton-<grade>-<subject>.json`
(code, skillName, description, ccssText), plus its grade/subject/domain/cluster
context.

**Output:** A JSON file written to `pipeline/blueprints/<standard>.json` matching
`pipeline/schemas/blueprint.json`. For ELA, `commonMisconceptions[].distractor`
describes the *wrong reasoning* a strong distractor should embody (these become
the quiz's incorrect options).

**Must contain:**
- `description` — plain-language statement of what the student must be able to do.
- `subSkills` — the discrete component skills.
- `problemArchetypes` — the recurring task shapes, each with a concrete example.
- `difficultyRubric` — explicit, testable Easy / Medium / Hard criteria. These bands
  define how a single worksheet RAMPS (Easy items early, Hard items late) and, for a
  complex standard, where tier1 (Easy to Medium) and tier2 (Medium to Hard) split. For
  ELA, difficulty scales by passage complexity, abstraction of the task (identify,
  analyze, evaluate), and how much inference is required. Easy items must still be
  answerable from a short stimulus included in the prompt.
- `commonMisconceptions` — the specific student errors to weaponize as distractors.
- `itemCounts` — `lesson {workedExamples, practiceProblems}`, `worksheet {single,
  tier1, tier2}`, `quiz`. Default counts: lesson 5+5, worksheet single/tier1/tier2 = 15
  each, quiz 8. (`single` is the one ramped sheet most standards use; `tier1`/`tier2`
  are only used when a standard is complex enough to need two worksheets.) Match
  existing siblings unless the standard demands otherwise.

**Material model (what the Generator builds from this blueprint):** per standard, one
`lesson`, one `quiz`, and EITHER one ramped `worksheet` (default) OR a `tier1` + `tier2`
pair (complex standards only). Separately, each CLUSTER gets a cluster-worksheet and a
cluster-test spanning all standards in the cluster; those are authored after the
per-standard materials and have no blueprint of their own.

**Self-contained-stimulus rule (ELA-critical):** Reading standards (RL/RI) require
a passage. Every generated *item* must embed any passage/excerpt it depends on, so
the student needs nothing external. The blueprint must say so explicitly and
suggest passage lengths per difficulty.

**Hard rules:** No em dashes. No math unless the standard is math. Grade-appropriate
vocabulary and topics. Output valid JSON only.
