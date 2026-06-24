#!/usr/bin/env node
// check.mjs — DETERMINISTIC structural / renderer-compatibility checker.
//
// This is the trust anchor of the pipeline. It does NOT judge whether an answer
// is pedagogically "right" (that is the Verifier agent's job — it re-solves each
// item). What this enforces is that every material is shaped exactly the way
// library/material.js will render it, so a verified file can never throw
// "Material not found" in the browser.
//
// Usage:   node check.mjs <path-to-content.json> [--blueprint <path>]
// Output:  JSON  { file, id, ok, errors[], warnings[] }   to stdout
// Exit:    0 if ok (no errors), 1 if any error, 2 on bad invocation.
//
// The renderer contract (see library/material.js) that this mirrors:
//   - lesson            items: type in {worked-example, practice}, prompt,
//                      solution.steps[] (non-empty), solution.answer
//   - worksheet         items: prompt, answer (non-empty), solution.steps[] (non-empty)
//   - quiz              items: prompt with >=2 lines matching /^[A-D]\)/m (clickable
//                      options), answer whose first char is a letter that maps
//                      to one of those options, solution.steps[] (non-empty)
//   - cluster-worksheet items: worksheet contract + per-item `standard` (which
//                      standard in the cluster the item targets, for sectioning)
//   - cluster-test      items: quiz contract + per-item `standard`
//
// Material id / scope conventions:
//   standard scope: {std}--lesson, {std}--quiz, and EITHER
//                   {std}--worksheet  (one ramped sheet, difficulty/tier null)  OR
//                   {std}--worksheet--tier1 / {std}--worksheet--tier2  (two sheets)
//                   Legacy {std}--worksheet--easy|medium|hard still validates.
//   cluster scope:  {clusterId}--cluster-worksheet, {clusterId}--cluster-test
//                   where clusterId = {gradeCode}.{domainCode}.{clusterCode} (e.g. 7.RP.A)
//                   and the top-level `standard` is null.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const TIERS = ['tier1', 'tier2'];
const CLUSTER_TYPES = ['cluster-worksheet', 'cluster-test'];
const isClusterType = (t) => CLUSTER_TYPES.includes(t);

// Default item-count expectations (the canonical model). A blueprint may override
// these — when a blueprint count is present, a mismatch is a hard error; otherwise
// the default is enforced softly (warning) so existing stub/legacy files are never
// reported as malformed.
const DEFAULT_COUNTS = { quiz: 8, worksheet: 15, tier: 15, clusterWorksheet: 15, clusterTest: 12 };

// {clusterId}-style id: three dot-separated segments, e.g. 7.RP.A, PC.TRIG.A, A1.N-Q.A.
const CLUSTER_ID_RE = /^[A-Za-z0-9]+\.[A-Za-z0-9-]+\.[A-Za-z0-9-]+$/;

// The worksheet id suffix implied by a worksheet's tier/difficulty fields.
function worksheetSuffix(data) {
  if (TIERS.includes(data.tier)) return `worksheet--${data.tier}`;
  const d = String(data.difficulty || '').toLowerCase();
  if (['easy', 'medium', 'hard'].includes(d)) return `worksheet--${d}`; // legacy
  return 'worksheet'; // single ramped sheet
}

function parseArgs(argv) {
  const args = { file: null, blueprint: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--blueprint') args.blueprint = argv[++i];
    else if (!args.file) args.file = argv[i];
  }
  return args;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isNonEmptyStepArray(v) {
  return Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);
}

// Pull A)/B)/C)/D) option lines out of a quiz prompt, exactly like material.js.
function parseOptions(prompt) {
  const options = [];
  for (const line of String(prompt).split('\n')) {
    const t = line.trim();
    if (/^[A-D]\)/.test(t)) options.push(t.replace(/^[A-D]\)\s*/, ''));
  }
  return options;
}

function checkCommon(data, errors, fileName) {
  const cluster = isClusterType(data.materialType);
  // Cluster materials are cluster-scoped: they carry clusterId instead of a standard
  // (which must be null) and have no single skillName.
  const required = cluster
    ? ['id', 'clusterId', 'grade', 'subject', 'domain', 'domainCode', 'cluster', 'clusterCode', 'materialType']
    : ['id', 'standard', 'grade', 'subject', 'domain', 'domainCode', 'cluster', 'clusterCode', 'skillName', 'materialType'];
  for (const k of required) {
    if (!isNonEmptyString(data[k])) errors.push(`missing/empty top-level field: ${k}`);
  }
  if (cluster && data.standard != null && data.standard !== '') {
    errors.push(`cluster material must have standard: null (got "${data.standard}")`);
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.push('items must be a non-empty array');
  }
  // id should match filename (minus .json)
  const expectedId = basename(fileName).replace(/\.json$/, '');
  if (data.id && data.id !== expectedId) {
    errors.push(`id "${data.id}" does not match filename "${expectedId}"`);
  }
  // id should encode scope + materialType
  if (cluster) {
    if (isNonEmptyString(data.clusterId)) {
      if (!CLUSTER_ID_RE.test(data.clusterId)) {
        errors.push(`clusterId "${data.clusterId}" is not a valid {grade}.{domainCode}.{clusterCode} id`);
      }
      const base = `${data.clusterId}--${data.materialType}`;
      if (data.id && data.id !== base) errors.push(`id "${data.id}" inconsistent with clusterId/type (expected "${base}")`);
    }
  } else if (data.id && data.standard && data.materialType) {
    const base = `${data.standard}--${data.materialType === 'worksheet' ? worksheetSuffix(data) : data.materialType}`;
    if (data.id !== base) errors.push(`id "${data.id}" inconsistent with standard/type/difficulty (expected "${base}")`);
  }
}

function checkLesson(items, errors, warnings) {
  let we = 0, pr = 0;
  items.forEach((it, i) => {
    const tag = `lesson item #${it.id ?? i + 1}`;
    if (!['worked-example', 'practice'].includes(it.type)) errors.push(`${tag}: type must be worked-example|practice`);
    if (!isNonEmptyString(it.prompt)) errors.push(`${tag}: empty prompt`);
    if (!it.solution || !isNonEmptyStepArray(it.solution.steps)) errors.push(`${tag}: solution.steps missing/empty`);
    if (!it.solution || !isNonEmptyString(it.solution.answer)) errors.push(`${tag}: solution.answer missing/empty`);
    if (it.type === 'worked-example') we++;
    if (it.type === 'practice') pr++;
  });
  if (we === 0) warnings.push('lesson has no worked-examples');
  if (pr === 0) warnings.push('lesson has no practice items');
}

// One worksheet-style item (open response): prompt, answer, solution.steps[].
// requireStandard is set for cluster-worksheet items (they must say which standard
// in the cluster they target, so material.js can render section headers).
function checkWorksheetItem(it, tag, errors, requireStandard) {
  if (!isNonEmptyString(it.prompt)) errors.push(`${tag}: empty prompt`);
  if (!isNonEmptyString(it.answer)) errors.push(`${tag}: answer missing/empty`);
  if (!it.solution || !isNonEmptyStepArray(it.solution.steps)) errors.push(`${tag}: solution.steps missing/empty`);
  if (requireStandard && !isNonEmptyString(it.standard)) errors.push(`${tag}: missing per-item "standard" field (needed to section cluster material)`);
}

// One quiz-style item (multiple choice): >=2 option lines, answer letter maps to
// an option, solution.steps[]. requireStandard is set for cluster-test items.
function checkQuizItem(it, tag, errors, warnings, requireStandard) {
  if (!isNonEmptyString(it.prompt)) { errors.push(`${tag}: empty prompt`); return; }
  if (!DIFFICULTIES.includes(it.difficulty)) warnings.push(`${tag}: difficulty should be Easy|Medium|Hard`);
  const opts = parseOptions(it.prompt);
  if (opts.length < 2) { errors.push(`${tag}: needs >=2 option lines "A) ... B) ..." in prompt (found ${opts.length}) — quiz would not render`); }
  const uniq = new Set(opts.map(o => o.trim().toLowerCase()));
  if (uniq.size !== opts.length) errors.push(`${tag}: duplicate answer options`);
  // answer must start with a letter that maps to a real option
  const letter = String(it.answer ?? '').trim().charAt(0);
  const idx = letter ? letter.charCodeAt(0) - 65 : -1;
  if (idx < 0 || idx >= opts.length) {
    errors.push(`${tag}: answer must begin with the correct option letter (A-${String.fromCharCode(64 + Math.max(opts.length, 1))}); got "${String(it.answer ?? '').slice(0, 12)}"`);
  }
  if (!it.solution || !isNonEmptyStepArray(it.solution.steps)) errors.push(`${tag}: solution.steps missing/empty`);
  if (requireStandard && !isNonEmptyString(it.standard)) errors.push(`${tag}: missing per-item "standard" field (needed to section cluster material)`);
}

function checkWorksheet(data, items, errors, warnings) {
  // A standard-scoped worksheet is one of: legacy easy/medium/hard, a single ramped
  // sheet (difficulty + tier both null/absent), or tier1/tier2.
  const hasTier = TIERS.includes(data.tier);
  const hasDiff = DIFFICULTIES.includes(data.difficulty);
  if (data.tier != null && !hasTier) errors.push(`worksheet tier must be tier1|tier2 or null (got "${data.tier}")`);
  if (hasTier && hasDiff) errors.push('worksheet cannot set both tier and difficulty');
  if (!hasTier && data.difficulty != null && data.difficulty !== '' && !hasDiff) {
    errors.push(`worksheet difficulty must be Easy|Medium|Hard or null (got "${data.difficulty}")`);
  }
  items.forEach((it, i) => checkWorksheetItem(it, `worksheet item #${it.id ?? i + 1}`, errors, false));
}

function checkClusterWorksheet(items, errors, warnings) {
  items.forEach((it, i) => checkWorksheetItem(it, `cluster-worksheet item #${it.id ?? i + 1}`, errors, true));
}

function checkQuiz(items, errors, warnings) {
  items.forEach((it, i) => checkQuizItem(it, `quiz item #${it.id ?? i + 1}`, errors, warnings, false));
}

function checkClusterTest(items, errors, warnings) {
  items.forEach((it, i) => checkQuizItem(it, `cluster-test item #${it.id ?? i + 1}`, errors, warnings, true));
}

// ── Math notation lint (subject === 'math') ──────────────────────────────────
// Enforces that math is written in LaTeX between $ delimiters (rendered by
// KaTeX in material.js), not as ASCII. Catches the exact thing the user cares
// about: "7/6" must be $\frac{7}{6}$, exponents/roots must be LaTeX, and every
// $ must be balanced (an odd $ silently breaks KaTeX rendering for the page).

// Remove matched $$...$$ and $...$ spans; what remains is "prose" that must not
// contain raw math. Returns { prose, balanced }.
function stripMath(text) {
  // Escaped \$ is a LITERAL currency dollar: material.js safe() converts it to
  // <span>$</span> before KaTeX runs, so it is NOT a delimiter. Remove it first,
  // exactly as the renderer does, before pairing/counting math delimiters.
  const s = String(text).replace(/\\\$/g, '');
  // strip display math first, then inline; non-greedy
  const stripped = s.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$]*\$/g, ' ');
  const balanced = !stripped.includes('$'); // any leftover $ means an unmatched delimiter
  return { prose: stripped, balanced };
}

function lintMathText(text, tag, where, errors, warnings) {
  if (typeof text !== 'string' || !text) return;
  const { prose, balanced } = stripMath(text);
  if (!balanced) errors.push(`${tag} ${where}: unbalanced $ delimiter (KaTeX will not render)`);
  // bare numeric fraction outside math, e.g. 7/6  (allow dates/URLs are rare here)
  if (/(?<![\w$/])\d+\s*\/\s*\d+(?![\w$/])/.test(prose)) {
    const m = prose.match(/(?<![\w$/])\d+\s*\/\s*\d+(?![\w$/])/);
    errors.push(`${tag} ${where}: bare ASCII fraction "${m[0]}" — use LaTeX $\\frac{a}{b}$`);
  }
  // common math written as ASCII outside $...$
  if (/(?<![\\\w$])(sqrt|sin|cos|tan|log|ln|pi|theta)\b/i.test(prose) || /\w\^\w/.test(prose)) {
    warnings.push(`${tag} ${where}: looks like math outside $...$ (sqrt/sin/^/pi...) — wrap in LaTeX`);
  }
}

function lintItemMath(it, tag, errors, warnings) {
  lintMathText(it.prompt, tag, 'prompt', errors, warnings);
  lintMathText(it.hint, tag, 'hint', errors, warnings);
  lintMathText(it.answer, tag, 'answer', errors, warnings);
  if (it.solution) {
    lintMathText(it.solution.answer, tag, 'solution.answer', errors, warnings);
    (it.solution.steps || []).forEach((s, i) => lintMathText(s, tag, `step ${i + 1}`, errors, warnings));
  }
}

function checkMathNotation(data, errors, warnings) {
  if (data.subject !== 'math') return;
  data.items.forEach((it, i) => lintItemMath(it, `${data.materialType} item #${it.id ?? i + 1}`, errors, warnings));
}

// Resolve the expected item count for a material. Returns { want, hard } where
// `hard` means the count came from the blueprint (mismatch => error); otherwise it
// is a default-model count (mismatch => warning, so legacy/stub files never break).
function expectedCount(data, c) {
  const t = data.materialType;
  if (t === 'quiz') return c && c.quiz ? { want: c.quiz, hard: true } : { want: DEFAULT_COUNTS.quiz, hard: false };
  if (t === 'cluster-test') return c && c.clusterTest ? { want: c.clusterTest, hard: true } : { want: DEFAULT_COUNTS.clusterTest, hard: false };
  if (t === 'cluster-worksheet') return c && c.clusterWorksheet ? { want: c.clusterWorksheet, hard: true } : { want: DEFAULT_COUNTS.clusterWorksheet, hard: false };
  if (t === 'worksheet') {
    if (TIERS.includes(data.tier)) {
      const bw = c && c.worksheet && c.worksheet[data.tier];
      return bw ? { want: bw, hard: true } : { want: DEFAULT_COUNTS.tier, hard: false };
    }
    if (DIFFICULTIES.includes(data.difficulty)) {
      // legacy easy/medium/hard: only a blueprint count gates it (keeps old stub files clean)
      const bw = c && c.worksheet && c.worksheet[String(data.difficulty).toLowerCase()];
      return bw ? { want: bw, hard: true } : { want: null, hard: false };
    }
    // single ramped sheet
    const bw = c && c.worksheet && (typeof c.worksheet === 'number' ? c.worksheet : c.worksheet.single);
    return bw ? { want: bw, hard: true } : { want: DEFAULT_COUNTS.worksheet, hard: false };
  }
  return { want: null, hard: false };
}

function checkCounts(data, blueprint, warnings, errors) {
  if (!Array.isArray(data.items)) return;
  const c = blueprint && blueprint.itemCounts;
  const n = data.items.length;
  if (data.materialType === 'lesson') {
    if (c && c.lesson) {
      const want = (c.lesson.workedExamples || 0) + (c.lesson.practiceProblems || 0);
      if (want && n < want) warnings.push(`lesson item count ${n} < blueprint ${want}`);
    }
    return;
  }
  const { want, hard } = expectedCount(data, c);
  if (want != null && n !== want) {
    const msg = `${data.materialType} item count ${n} != ${hard ? 'blueprint' : 'expected'} ${want}`;
    if (hard) errors.push(msg); else warnings.push(msg);
  }
}

export function check(file, blueprint = null) {
  const errors = [], warnings = [];
  let data;
  try { data = loadJson(file); }
  catch (e) { return { file, id: null, ok: false, errors: [`invalid JSON: ${e.message}`], warnings: [] }; }

  checkCommon(data, errors, file);
  if (Array.isArray(data.items) && data.items.length) {
    if (data.materialType === 'lesson') checkLesson(data.items, errors, warnings);
    else if (data.materialType === 'worksheet') checkWorksheet(data, data.items, errors, warnings);
    else if (data.materialType === 'quiz') checkQuiz(data.items, errors, warnings);
    else if (data.materialType === 'cluster-worksheet') checkClusterWorksheet(data.items, errors, warnings);
    else if (data.materialType === 'cluster-test') checkClusterTest(data.items, errors, warnings);
    else errors.push(`unknown materialType: ${data.materialType}`);
    checkMathNotation(data, errors, warnings);
  }
  checkCounts(data, blueprint, warnings, errors);

  return { file, id: data.id ?? null, ok: errors.length === 0, errors, warnings };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('usage: node check.mjs <content.json> [--blueprint <path>]');
    process.exit(2);
  }
  const bp = args.blueprint ? loadJson(args.blueprint) : null;
  const res = check(args.file, bp);
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 1);
}
