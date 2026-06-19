export const meta = {
  name: 'curriculum-pipeline',
  description: 'Spec -> Generate -> Verify (code-exec, independent) -> retry loop, for broken curriculum materials',
  phases: [
    { title: 'Spec', detail: 'one blueprint per standard (Researcher)' },
    { title: 'Author+Check', detail: 'generate each material, independently verify, retry <=3' },
  ],
}

// args = output of `node pipeline/plan.mjs <grade> <subject>`:
//   { grade, subject, tasks: [ { standard, skillName, description, ccssText,
//       domain, domainCode, cluster, clusterCode, needBlueprint, materials:[...] } ] }
const plan = typeof args === 'string' ? JSON.parse(args) : (args || {})
const tasks = plan.tasks || []
const MAX_ATTEMPTS = 3
const REPO = 'library/pipeline'   // agents run from the repo root

if (!tasks.length) {
  log('No tasks supplied (args.tasks empty). Nothing to do.')
  return { promoted: 0, flagged: 0, note: 'empty task list' }
}

// ---- prompts (canonical contracts mirror pipeline/agents/*.md) --------------

const PY = `${REPO}/.venv/bin/python3`   // has sympy + numpy for the verifier

// Subject-specific authoring rules injected into spec/generator prompts.
function authorRules(t) {
  if (t.subject === 'math') {
    return `MATH NOTATION (strict, the renderer uses KaTeX): write ALL math in LaTeX between $ delimiters. Fractions are $\\frac{7}{6}$ or $\\dfrac{7}{6}$ — NEVER bare ASCII like 7/6. Use $x^2$, $\\sqrt{5}$, $\\sin\\theta$, $\\frac{\\pi}{3}$, $\\log_2 8$, $\\vec{v}$, $3\\pi$, etc. Every $ must be balanced. Numbers/answers that are math go in $...$ (e.g. answer "$\\frac{\\pi}{6}$"). Quiz options each carry their own LaTeX, e.g. "A) $\\frac{\\sqrt{3}}{2}$". No em dashes. Give exact values (radicals, $\\pi$, fractions), not rounded decimals, unless the problem asks for an approximation.`
  }
  return `ELA rules: reading items (RL/RI) must embed any passage/excerpt the item needs directly in its prompt so it is self-contained. No em dashes. No math.`
}

function specPrompt(t) {
  return `You are the SPEC AGENT (Researcher) in a curriculum pipeline. Read the full contract at ${REPO}/agents/spec-agent.md and the schema at ${REPO}/schemas/blueprint.json before you start.

Expand this single Common Core standard into a complete skill blueprint:
  standard:   ${t.standard}
  grade:      ${t.grade}   subject: ${t.subject}
  skillName:  ${t.skillName}
  domain:     ${t.domain} (${t.domainCode})    cluster: ${t.cluster} (${t.clusterCode})
  ccssText:   ${t.ccssText}

Write the blueprint as valid JSON to ${REPO}/blueprints/${t.standard}.json. It MUST include these tag fields verbatim so downstream agents copy them: standard, grade ("${t.grade}"), subject ("${t.subject}"), domain ("${t.domain}"), domainCode ("${t.domainCode}"), cluster ("${t.cluster}"), clusterCode ("${t.clusterCode}"), skillName ("${t.skillName}"). Plus: description, subSkills[], problemArchetypes[], difficultyRubric (Easy/Medium/Hard, testable), commonMisconceptions[] (each with the wrong reasoning a distractor should embody), itemCounts { lesson {workedExamples:5, practiceProblems:5}, worksheet {easy:15, medium:15, hard:15}, quiz:8 }.

${authorRules(t)} Difficulty scales by conceptual depth and number of steps. For math, problemArchetypes and difficultyRubric must be subject-accurate (e.g. exact unit-circle values vs. multi-step derivations) and commonMisconceptions are the algebra/sign/identity errors that become quiz distractors. Output ONLY the JSON file (use the Write tool). Reply with one line: "blueprint written: ${t.standard}".`
}

function genPrompt(t, m, attempt) {
  const fb = attempt > 1
    ? `\n\nThis is RETRY ${attempt}. Read the verifier feedback at ${REPO}/feedback/${m.id}.json and fix EXACTLY the items it names. Keep items that already passed.`
    : ''
  return `You are the GENERATOR AGENT (Author). Read the contract ${REPO}/agents/generator-agent.md and the blueprint ${REPO}/blueprints/${t.standard}.json first.

Produce material: ${m.id}  (type=${m.materialType}${m.difficulty ? `, difficulty=${m.difficulty}` : ''}).
Write valid JSON to ${REPO}/staging/${m.id}.json matching ${REPO}/schemas/content-item.json.

Top-level tags MUST be exactly: id="${m.id}", standard="${t.standard}", grade="${t.grade}", subject="${t.subject}", domain="${t.domain}", domainCode="${t.domainCode}", cluster="${t.cluster}", clusterCode="${t.clusterCode}", skillName="${t.skillName}", materialType="${m.materialType}", difficulty=${m.difficulty ? `"${m.difficulty}"` : 'null'}, verificationStatus="agent-generated".

RENDERER CONTRACT (page throws "Material not found" if violated):
- lesson items: type worked-example|practice, id, prompt, solution.steps[] (non-empty), solution.answer; practice may add hint. Count = blueprint lesson counts.
- worksheet items: id, prompt, answer (non-empty), solution.steps[] (non-empty). Count = blueprint worksheet[${m.difficulty ? m.difficulty.toLowerCase() : 'difficulty'}] (15).
- quiz items: MULTIPLE CHOICE. prompt ends with option lines "A) ..." "B) ..." "C) ..." "D) ..." (4, distinct). answer starts with the correct letter e.g. "B) ...". solution.steps[] explains key + why distractors wrong. Each item has difficulty Easy|Medium|Hard. Count = 8 (about 3 Easy / 3 Medium / 2 Hard). Distractors from blueprint commonMisconceptions.

${authorRules(t)} Grade-appropriate. The keyed answer must be the single best, unambiguous answer, and every worked step must be mathematically correct.${fb}

Output ONLY the JSON file via the Write tool. Reply one line: "generated: ${m.id}".`
}

function verifyPrompt(t, m, attempt) {
  return `You are the VERIFIER AGENT (Checker) — the most important role. Read ${REPO}/agents/verifier-agent.md. Work INDEPENDENTLY: re-solve every item from scratch; do NOT trust the generator's steps before forming your own answer.

Material under test: ${REPO}/staging/${m.id}.json   blueprint: ${REPO}/blueprints/${t.standard}.json

Step 1 — DETERMINISTIC GATE (code execution, required): run
  node ${REPO}/check.mjs ${REPO}/staging/${m.id}.json --blueprint ${REPO}/blueprints/${t.standard}.json
Record its errors (structural + math-notation: bare ASCII fractions, unbalanced $).${t.subject === 'math' ? `

Step 1b — COMPUTE EVERY ANSWER WITH CODE (required for math, do NOT eyeball): use ${PY} which has sympy and numpy. For each item, independently compute the result: use sympy for exact values/identities/factoring/solving (e.g. sp.sin(sp.pi/6), sp.simplify(lhs-rhs)==0, sp.solve, sp.factor) and numpy for numeric sampling (evaluate both sides of an identity at several points and check equality within tolerance). Verify the keyed answer AND that each quiz distractor is actually WRONG (compute what misconception produces it). A claim is confirmed only if your code agrees.` : ''}

Step 2 — INDEPENDENT RE-SOLVE: for each item, read only the prompt, solve it yourself (with code per Step 1b for math), THEN compare to the key. Check: your computed answer matches the key; for quizzes the keyed letter is the single best option and every distractor is genuinely wrong; solution.steps are correct, complete, no leaps, and use proper LaTeX notation; the item is aligned to ${t.standard} and ${t.grade} appropriate. Bias toward rejection when ambiguous or when your computation disagrees.

Step 3 — VERDICT: write ${REPO}/verdicts/${m.id}.json = { id, ok, structuralOk, summary, items:[{id, ok, issue}] }. ok is true ONLY if the deterministic gate passed AND every item re-solved correctly. If not ok, also write ${REPO}/feedback/${m.id}.json with precise per-item corrections (id, what is wrong, the correct answer/steps).${attempt >= MAX_ATTEMPTS ? `\nThis was the FINAL attempt (${attempt}/${MAX_ATTEMPTS}); if still failing also copy your verdict to ${REPO}/flagged/${m.id}.json for human review.` : ''}

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

// ---- phase 1: specs (barrier — generators depend on their blueprint) --------

phase('Spec')
const needSpec = tasks.filter(t => t.needBlueprint)
log(`Spec: ${needSpec.length} blueprints to write, ${tasks.length - needSpec.length} already present`)
await parallel(needSpec.map(t => () =>
  agent(specPrompt(t), { label: `spec:${t.standard}`, phase: 'Spec', agentType: 'general-purpose' })))

// ---- phase 2: per-material generate -> verify -> retry loop ------------------

phase('Author+Check')
const allMaterials = tasks.flatMap(t => t.materials.map(m => ({ t, m })))
log(`Author+Check: ${allMaterials.length} materials`)

async function processMaterial({ t, m }) {
  let verdict = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await agent(genPrompt(t, m, attempt), { label: `gen:${m.id}#${attempt}`, phase: 'Author+Check', agentType: 'general-purpose' })
    verdict = await agent(verifyPrompt(t, m, attempt), { label: `chk:${m.id}#${attempt}`, phase: 'Author+Check', agentType: 'general-purpose', schema: VERDICT_SCHEMA })
    if (verdict && verdict.ok) return { id: m.id, ok: true, attempts: attempt }
  }
  return { id: m.id, ok: false, attempts: MAX_ATTEMPTS, lastSummary: verdict ? verdict.summary : 'verifier returned null', failedItems: verdict ? verdict.failedItems : null }
}

const results = (await parallel(allMaterials.map(x => () => processMaterial(x)))).filter(Boolean)

const verified = results.filter(r => r.ok)
const flagged = results.filter(r => !r.ok)
log(`Done: ${verified.length} verified, ${flagged.length} flagged for review`)

return {
  totalMaterials: allMaterials.length,
  verified: verified.length,
  flagged: flagged.length,
  flaggedItems: flagged.map(f => ({ id: f.id, attempts: f.attempts, summary: f.lastSummary, failedItems: f.failedItems })),
  note: 'Verified candidates are in pipeline/staging with ok verdicts. Run `node pipeline/store.mjs` to promote them into content/ and update catalog.json.',
}
