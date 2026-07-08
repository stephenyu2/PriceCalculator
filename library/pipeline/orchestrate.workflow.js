export const meta = {
  name: 'curriculum-pipeline',
  description: 'Spec -> Generate -> Verify (code-exec, independent) -> retry loop, for broken curriculum materials',
  phases: [
    { title: 'Plan', detail: 'slice plan.mjs by scope (self-planning mode)' },
    { title: 'Spec', detail: 'one blueprint per standard (Researcher)' },
    { title: 'Author+Check', detail: 'generate each material, independently verify, retry <=3' },
  ],
}

// args, EITHER:
//   explicit:    { grade, subject, tasks:[...] }  (tasks already sliced)
//   self-plan:   { grade, subject, scope:'standard'|'cluster', clusterId? }
//                -> a planner agent runs library/pipeline/slice.mjs and returns the tasks.
// Task shapes:
//   standard task: { scope:'standard', standard, skillName, description, ccssText,
//       domain, domainCode, cluster, clusterCode, worksheets, needBlueprint, materials:[...] }
//   cluster task:  { scope:'cluster', standard:null, clusterId, domain, domainCode,
//       cluster, clusterCode, standards:[{code,skillName}], materials:[...] }
// Each material: { id, materialType, difficulty, tier, scope }.
const plan = typeof args === 'string' ? JSON.parse(args) : (args || {})
const MAX_ATTEMPTS = 3
const REPO = 'library/pipeline'   // agents run from the repo root

let tasks = plan.tasks || []

// Self-planning mode: no tasks supplied, but grade+scope given. Spawn one planner
// agent to run the deterministic slicer and return the sliced plan JSON.
if (!tasks.length && plan.grade && plan.scope) {
  phase('Plan')
  const subject = plan.subject || 'math'
  const cmd = `node ${REPO}/slice.mjs ${plan.grade} ${subject} ${plan.scope}${plan.clusterId ? ` ${plan.clusterId}` : ''}`
  const out = await agent(
    `Run this EXACT command from the repo root and return ONLY its raw stdout, which is a single line of JSON. No commentary, no code fences, no extra text.\n\n  ${cmd}\n\nThe command prints a JSON object {"grade","subject","tasks":[...]} to stdout (diagnostics go to stderr, ignore them). Return that JSON object verbatim. If tasks is empty that is fine, still return the object.`,
    { label: `plan:${plan.grade}/${plan.scope}`, phase: 'Plan', agentType: 'general-purpose' })
  try {
    const m = String(out).match(/\{[\s\S]*\}/)
    tasks = JSON.parse(m[0]).tasks || []
  } catch (e) {
    log(`planner parse failed: ${e.message}`)
    return { error: 'planner parse failed', raw: String(out).slice(0, 400) }
  }
  log(`Planned ${tasks.length} ${plan.scope} task(s) for grade ${plan.grade}`)
}

if (!tasks.length) {
  log('No tasks to do (plan is empty for this scope).')
  return { totalMaterials: 0, verified: 0, flagged: 0, flaggedItems: [], note: 'empty task list' }
}

// ---- prompts (canonical contracts mirror pipeline/agents/*.md) --------------

const PY = `${REPO}/.venv/bin/python3`   // has sympy + numpy for the verifier
const isCluster = (t) => t.scope === 'cluster'
const stdCodes = (t) => (t.standards || []).map(s => s.code).join(', ')
const stdList = (t) => (t.standards || []).map(s => `${s.code} (${s.skillName})`).join('; ')

// Subject-specific authoring rules injected into spec/generator prompts.
function authorRules(t) {
  if (t.subject === 'math') {
    return `MATH NOTATION (strict, the renderer uses KaTeX): write ALL math in LaTeX between $ delimiters. Fractions are $\\frac{7}{6}$ or $\\dfrac{7}{6}$, NEVER bare ASCII like 7/6. Use $x^2$, $\\sqrt{5}$, $\\sin\\theta$, $\\frac{\\pi}{3}$, $\\log_2 8$, $\\vec{v}$, $3\\pi$, etc. Every $ must be balanced. Numbers/answers that are math go in $...$ (e.g. answer "$\\frac{\\pi}{6}$"). Quiz options each carry their own LaTeX, e.g. "A) $\\frac{\\sqrt{3}}{2}$". No em dashes. Give exact values (radicals, $\\pi$, fractions), not rounded decimals, unless the problem asks for an approximation.`
  }
  return `ELA rules: reading items (RL/RI) must embed any passage/excerpt the item needs directly in its prompt so it is self-contained. No em dashes. No math.`
}

// Exact top-level tag block the generator must emit (differs by scope).
function tagsBlock(t, m) {
  if (isCluster(t)) {
    return `id="${m.id}", standard=null, clusterId="${t.clusterId}", grade="${t.grade}", subject="${t.subject}", domain="${t.domain}", domainCode="${t.domainCode}", cluster="${t.cluster}", clusterCode="${t.clusterCode}", skillName="${t.cluster}", materialType="${m.materialType}", difficulty=null, tier=null, verificationStatus="agent-generated"`
  }
  return `id="${m.id}", standard="${t.standard}", clusterId=null, grade="${t.grade}", subject="${t.subject}", domain="${t.domain}", domainCode="${t.domainCode}", cluster="${t.cluster}", clusterCode="${t.clusterCode}", skillName="${t.skillName}", materialType="${m.materialType}", difficulty=null, tier=${m.tier ? `"${m.tier}"` : 'null'}, verificationStatus="agent-generated"`
}

// Type-specific authoring instructions (counts, ramp, per-item standard field, etc.).
function materialBrief(t, m) {
  const type = m.materialType
  if (type === 'lesson') return 'lesson: 5 worked-example items followed by 5 practice items (per the blueprint lesson counts). Each worked-example has prompt, solution.steps[] (non-empty), solution.answer. Each practice has prompt, optional hint, solution.steps[], solution.answer.'
  if (type === 'quiz') return 'quiz: 8 multiple-choice items (about 3 Easy, 3 Medium, 2 Hard). Each prompt ends with 4 distinct option lines "A) ..." "B) ..." "C) ..." "D) ..."; answer begins with the correct letter (e.g. "B) ..."); each item carries difficulty Easy|Medium|Hard; solution.steps[] explain the key and why each distractor is wrong. Distractors come from the blueprint commonMisconceptions.'
  if (type === 'worksheet') {
    if (m.tier === 'tier1') return 'worksheet (tier1 of a two-tier standard): 15 items ramping Easy to Medium across the sheet. Each item has id, prompt, answer (non-empty), solution.steps[] (non-empty). Top-level tier="tier1", difficulty=null.'
    if (m.tier === 'tier2') return `worksheet (tier2 of a two-tier standard): 15 items ramping Medium to Hard across the sheet. Each item has id, prompt, answer, solution.steps[]. Top-level tier="tier2", difficulty=null. Do NOT duplicate any item, numeric value, or context from tier1: read ${REPO}/staging/${t.standard}--worksheet--tier1.json (or ${REPO}/../data/content/${t.standard}--worksheet--tier1.json if already stored) and keep every item distinct.`
    return 'single ramped worksheet: 15 items that progress Easy (items 1-5) to Medium (items 6-10) to Hard (items 11-15). Each item has id, prompt, answer (non-empty), solution.steps[] (non-empty). Top-level difficulty=null, tier=null.'
  }
  if (type === 'cluster-worksheet') return `cluster worksheet: 15 worksheet-contract items spanning the cluster's standards [${stdCodes(t)}]. EACH item MUST include its own "standard" field set to the cluster standard it targets. ORDER the items grouped by standard (all items for the first standard, then the next, and so on) so material.js can render per-standard section headers. Cover EVERY standard in the cluster and ramp in difficulty. Each item has id, standard, prompt, answer (non-empty), solution.steps[] (non-empty). The cluster's standards: ${stdList(t)}.`
  if (type === 'cluster-test') return `cluster test: 12 multiple-choice items spanning the cluster's standards [${stdCodes(t)}]. EACH item MUST include its own "standard" field. ORDER the items grouped by standard, covering EVERY standard. Each item has id, standard, difficulty Easy|Medium|Hard, a prompt ending with 4 distinct option lines "A) ..." through "D) ...", answer beginning with the correct letter, and solution.steps[]. The cluster's standards: ${stdList(t)}.`
  return type
}

function specPrompt(t) {
  return `You are the SPEC AGENT (Researcher) in a curriculum pipeline. Read the full contract at ${REPO}/agents/spec-agent.md and the schema at ${REPO}/schemas/blueprint.json before you start.

Expand this single Common Core standard into a complete skill blueprint:
  standard:   ${t.standard}
  grade:      ${t.grade}   subject: ${t.subject}
  skillName:  ${t.skillName}
  domain:     ${t.domain} (${t.domainCode})    cluster: ${t.cluster} (${t.clusterCode})
  ccssText:   ${t.ccssText}

Write the blueprint as valid JSON to ${REPO}/blueprints/${t.standard}.json. It MUST include these tag fields verbatim so downstream agents copy them: standard, grade ("${t.grade}"), subject ("${t.subject}"), domain ("${t.domain}"), domainCode ("${t.domainCode}"), cluster ("${t.cluster}"), clusterCode ("${t.clusterCode}"), skillName ("${t.skillName}"). Plus: description, subSkills[], problemArchetypes[], difficultyRubric (Easy/Medium/Hard, testable, defining how a single worksheet ramps and where tier1/tier2 would split), commonMisconceptions[] (each with the wrong reasoning a distractor should embody), itemCounts { lesson {workedExamples:5, practiceProblems:5}, worksheet {single:15, tier1:15, tier2:15}, quiz:8 }.

${authorRules(t)} Difficulty scales by conceptual depth and number of steps. For math, problemArchetypes and difficultyRubric must be subject-accurate (e.g. exact unit-circle values vs. multi-step derivations) and commonMisconceptions are the algebra/sign/identity errors that become quiz distractors. Output ONLY the JSON file (use the Write tool). Reply with one line: "blueprint written: ${t.standard}".`
}

function genPrompt(t, m, attempt) {
  const fb = attempt > 1
    ? `\n\nThis is RETRY ${attempt}. Read the verifier feedback at ${REPO}/feedback/${m.id}.json and fix EXACTLY the items it names. Keep items that already passed.`
    : ''
  const contextRef = isCluster(t)
    ? `This is a CLUSTER material: there is NO single blueprint. Draw context from the cluster's standards (listed below) and, as needed, read each standard's blueprint at ${REPO}/blueprints/<code>.json and its stored lesson at ${REPO}/../data/content/<code>--lesson.json.`
    : `Read the contract ${REPO}/agents/generator-agent.md and the blueprint ${REPO}/blueprints/${t.standard}.json first.`
  return `You are the GENERATOR AGENT (Author). ${isCluster(t) ? `Read the contract ${REPO}/agents/generator-agent.md first.` : ''}

Produce material: ${m.id}
  ${materialBrief(t, m)}
Write valid JSON to ${REPO}/staging/${m.id}.json matching ${REPO}/schemas/content-item.json.

Top-level tags MUST be exactly: ${tagsBlock(t, m)}.

${contextRef}

RENDERER CONTRACT (the page throws "Material not found" if violated):
- lesson items: type worked-example|practice, id, prompt, solution.steps[] (non-empty), solution.answer; practice may add hint.
- worksheet / cluster-worksheet items: id, prompt, answer (non-empty), solution.steps[] (non-empty).
- quiz / cluster-test items: MULTIPLE CHOICE. prompt ends with 4 distinct option lines "A) ..." "B) ..." "C) ..." "D) ..."; answer begins with the correct letter; solution.steps[] explains key + why distractors are wrong; each item carries difficulty Easy|Medium|Hard.
- cluster-worksheet / cluster-test ONLY: every item ALSO carries its own "standard" field, and items are ordered grouped by standard.

${authorRules(t)} Grade-appropriate. The keyed answer must be the single best, unambiguous answer, and every worked step must be mathematically correct.${fb}

Output ONLY the JSON file via the Write tool. Reply one line: "generated: ${m.id}".`
}

function verifyPrompt(t, m, attempt) {
  const checkCmd = isCluster(t)
    ? `node ${REPO}/check.mjs ${REPO}/staging/${m.id}.json`
    : `node ${REPO}/check.mjs ${REPO}/staging/${m.id}.json --blueprint ${REPO}/blueprints/${t.standard}.json`
  const expectedCount = m.materialType === 'cluster-test' ? 12
    : m.materialType === 'quiz' ? 8
    : m.materialType === 'lesson' ? 10
    : 15
  const clusterChecks = isCluster(t)
    ? ` This is a CLUSTER material: also confirm top-level standard is null and clusterId="${t.clusterId}"; that EVERY item carries its own "standard" field naming one of the cluster standards [${stdCodes(t)}]; that the items are ordered grouped by standard; and that EVERY standard in the cluster is represented.`
    : (m.tier === 'tier2'
      ? ` This is a tier2 worksheet: also confirm NO item duplicates any item/value/context from the tier1 sheet (${REPO}/staging/${t.standard}--worksheet--tier1.json or the stored content file).`
      : '')
  return `You are the VERIFIER AGENT (Checker), the most important role. Read ${REPO}/agents/verifier-agent.md. Work INDEPENDENTLY: re-solve every item from scratch; do NOT trust the generator's steps before forming your own answer.

Material under test: ${REPO}/staging/${m.id}.json${isCluster(t) ? ' (cluster material, no blueprint)' : `   blueprint: ${REPO}/blueprints/${t.standard}.json`}

Step 1 - DETERMINISTIC GATE (code execution, required): run
  ${checkCmd}
Record its errors (structural + math-notation: bare ASCII fractions, unbalanced $). Also confirm the item count is ${expectedCount}.${clusterChecks}${t.subject === 'math' ? `

Step 1b - COMPUTE EVERY ANSWER WITH CODE (required for math, do NOT eyeball): use ${PY} which has sympy and numpy. For each item, independently compute the result: sympy for exact values/identities/factoring/solving (e.g. sp.sin(sp.pi/6), sp.simplify(lhs-rhs)==0, sp.solve, sp.factor) and numpy for numeric sampling (evaluate both sides of an identity at several points and check equality within tolerance). Verify the keyed answer AND that each quiz/test distractor is actually WRONG (compute what misconception produces it). A claim is confirmed only if your code agrees.` : ''}

Step 2 - INDEPENDENT RE-SOLVE: for each item, read only the prompt (and any embedded stimulus), solve it yourself (with code per Step 1b for math), THEN compare to the key. Check: your computed answer matches the key; for multiple-choice the keyed letter is the single best option and every distractor is genuinely wrong; solution.steps are correct, complete, no leaps, proper LaTeX; the item is aligned to ${isCluster(t) ? `its own item-level standard within cluster ${t.clusterId}` : t.standard} and grade ${t.grade} appropriate. Bias toward rejection when ambiguous or when your computation disagrees.

Step 3 - VERDICT: write ${REPO}/verdicts/${m.id}.json = { id, ok, structuralOk, summary, failedItems:[{id, issue}] }. ok is true ONLY if the deterministic gate passed AND every item re-solved correctly. If not ok, also write ${REPO}/feedback/${m.id}.json with precise per-item corrections (id, what is wrong, the correct answer/steps).${attempt >= MAX_ATTEMPTS ? `\nThis was the FINAL attempt (${attempt}/${MAX_ATTEMPTS}); if still failing also copy your verdict to ${REPO}/flagged/${m.id}.json for human review.` : ''}

Return the structured verdict.`
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['id', 'ok'],
  properties: {
    id: { type: 'string' },
    ok: { type: 'boolean' },
    structuralOk: { type: 'boolean' },
    summary: { type: 'string' },
    failedItems: { type: 'array', items: { type: 'object',
      properties: { id: { type: ['integer', 'string'] }, issue: { type: 'string' } } } },
  },
}

// ---- phase 1: specs (barrier - generators depend on their blueprint) --------
// Only standard-scoped tasks have blueprints; cluster tasks never do.

phase('Spec')
const needSpec = tasks.filter(t => !isCluster(t) && t.needBlueprint)
log(`Spec: ${needSpec.length} blueprints to write, ${tasks.length - needSpec.length} task(s) need none`)
await parallel(needSpec.map(t => () =>
  agent(specPrompt(t), { label: `spec:${t.standard}`, phase: 'Spec', agentType: 'general-purpose' })))

// ---- phase 2: per-material generate -> verify -> retry loop ------------------

phase('Author+Check')
const totalMaterials = tasks.reduce((n, t) => n + t.materials.length, 0)
log(`Author+Check: ${totalMaterials} materials across ${tasks.length} tasks`)

async function processMaterial(t, m) {
  let verdict = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await agent(genPrompt(t, m, attempt), { label: `gen:${m.id}#${attempt}`, phase: 'Author+Check', agentType: 'general-purpose' })
    verdict = await agent(verifyPrompt(t, m, attempt), { label: `chk:${m.id}#${attempt}`, phase: 'Author+Check', agentType: 'general-purpose', schema: VERDICT_SCHEMA })
    if (verdict && verdict.ok) return { id: m.id, ok: true, attempts: attempt }
  }
  return { id: m.id, ok: false, attempts: MAX_ATTEMPTS, lastSummary: verdict ? verdict.summary : 'verifier returned null', failedItems: verdict ? verdict.failedItems : null }
}

// Within a task, tier2 worksheets must be authored AFTER everything else so they can
// read the tier1 sheet and avoid item overlap. All other materials run concurrently.
async function processTask(t) {
  const deferred = t.materials.filter(m => m.tier === 'tier2')
  const first = t.materials.filter(m => m.tier !== 'tier2')
  const r1 = await parallel(first.map(m => () => processMaterial(t, m)))
  const r2 = deferred.length ? await parallel(deferred.map(m => () => processMaterial(t, m))) : []
  return [...r1, ...r2]
}

const results = (await parallel(tasks.map(t => () => processTask(t)))).flat().filter(Boolean)

const verified = results.filter(r => r.ok)
const flagged = results.filter(r => !r.ok)
log(`Done: ${verified.length} verified, ${flagged.length} flagged for review`)

return {
  totalMaterials,
  verified: verified.length,
  flagged: flagged.length,
  flaggedItems: flagged.map(f => ({ id: f.id, attempts: f.attempts, summary: f.lastSummary, failedItems: f.failedItems })),
  note: 'Verified candidates are in pipeline/staging with ok verdicts. Run `node pipeline/store.mjs` to promote them into content/ and update catalog.json.',
}
