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
//   - lesson    items: type in {worked-example, practice}, prompt,
//                      solution.steps[] (non-empty), solution.answer
//   - worksheet items: prompt, answer (non-empty), solution.steps[] (non-empty)
//   - quiz      items: prompt with >=2 lines matching /^[A-D]\)/m  (clickable
//                      options), answer whose first char is a letter that maps
//                      to one of those options, solution.steps[] (non-empty),
//                      difficulty in {Easy, Medium, Hard}

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

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
  const required = ['id', 'standard', 'grade', 'subject', 'domain', 'domainCode',
    'cluster', 'clusterCode', 'skillName', 'materialType'];
  for (const k of required) {
    if (!isNonEmptyString(data[k])) errors.push(`missing/empty top-level field: ${k}`);
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.push('items must be a non-empty array');
  }
  // id should match filename (minus .json)
  const expectedId = basename(fileName).replace(/\.json$/, '');
  if (data.id && data.id !== expectedId) {
    errors.push(`id "${data.id}" does not match filename "${expectedId}"`);
  }
  // id should encode standard + materialType
  if (data.id && data.standard && data.materialType) {
    const base = `${data.standard}--${data.materialType === 'worksheet'
      ? `worksheet--${String(data.difficulty || '').toLowerCase()}`
      : data.materialType}`;
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

function checkWorksheet(data, items, errors, warnings) {
  if (!DIFFICULTIES.includes(data.difficulty)) errors.push(`worksheet difficulty must be Easy|Medium|Hard (got "${data.difficulty}")`);
  items.forEach((it, i) => {
    const tag = `worksheet item #${it.id ?? i + 1}`;
    if (!isNonEmptyString(it.prompt)) errors.push(`${tag}: empty prompt`);
    if (!isNonEmptyString(it.answer)) errors.push(`${tag}: answer missing/empty`);
    if (!it.solution || !isNonEmptyStepArray(it.solution.steps)) errors.push(`${tag}: solution.steps missing/empty`);
  });
}

function checkQuiz(items, errors, warnings) {
  items.forEach((it, i) => {
    const tag = `quiz item #${it.id ?? i + 1}`;
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
  });
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

function checkCounts(data, blueprint, warnings, errors) {
  if (!blueprint || !blueprint.itemCounts) return;
  const c = blueprint.itemCounts;
  const n = data.items.length;
  if (data.materialType === 'quiz' && c.quiz && n !== c.quiz) {
    errors.push(`quiz item count ${n} != blueprint ${c.quiz}`);
  }
  if (data.materialType === 'worksheet' && c.worksheet) {
    const want = c.worksheet[String(data.difficulty || '').toLowerCase()];
    if (want && n !== want) errors.push(`worksheet item count ${n} != blueprint ${want}`);
  }
  if (data.materialType === 'lesson' && c.lesson) {
    const want = (c.lesson.workedExamples || 0) + (c.lesson.practiceProblems || 0);
    if (want && n < want) warnings.push(`lesson item count ${n} < blueprint ${want}`);
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
