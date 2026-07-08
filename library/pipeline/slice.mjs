#!/usr/bin/env node
// slice.mjs — run plan.mjs for a grade/subject and emit a filtered plan JSON on stdout,
// for feeding to orchestrate.workflow.js (which can plan itself via this helper).
//
// Usage (run from repo root):
//   node library/pipeline/slice.mjs <grade> <subject> standard [clusterId]
//   node library/pipeline/slice.mjs <grade> <subject> cluster  [clusterId]
// Diagnostics go to stderr; ONLY the JSON object is written to stdout.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const [grade, subject, scope, clusterId] = process.argv.slice(2);
if (!grade || !subject || !scope) {
  process.stderr.write('usage: node slice.mjs <grade> <subject> <standard|cluster> [clusterId]\n');
  process.exit(2);
}

const raw = execFileSync('node', [join(HERE, 'plan.mjs'), grade, subject], { encoding: 'utf8', maxBuffer: 1 << 26 });
const plan = JSON.parse(raw);

let tasks = plan.tasks.filter(t => t.scope === scope);
if (clusterId) {
  tasks = scope === 'standard'
    ? tasks.filter(t => t.standard && (t.standard === clusterId || t.standard.startsWith(clusterId + '.')))
    : tasks.filter(t => t.clusterId === clusterId);
}

const mats = tasks.reduce((a, t) => a + t.materials.length, 0);
process.stderr.write(`[slice] grade=${grade} ${subject} scope=${scope}${clusterId ? ` filter=${clusterId}` : ''}: ${tasks.length} tasks, ${mats} materials\n`);
process.stdout.write(JSON.stringify({ grade: plan.grade, subject: plan.subject, tasks }));
