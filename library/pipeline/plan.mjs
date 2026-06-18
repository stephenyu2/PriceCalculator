#!/usr/bin/env node
// plan.mjs — DETERMINISTIC work-list planner. Makes the run idempotent.
//
// Walks the skeleton for a grade/subject, runs check.mjs on every expected
// material in the content store, and emits the list of materials that are missing
// or malformed (and therefore need (re)generation). Re-running after a partial
// pass naturally yields a shorter list, because materials that are now verified
// pass check() and drop out.
//
// Usage:   node plan.mjs <grade> <subject> [--standards 6.L.A.1,6.RL.A.2]
// Output:  JSON  { grade, subject, totalMaterials, brokenCount, tasks[] }  to stdout
//          where each task is one standard with its broken materials + tags.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const CONTENT = join(DATA, 'content');
const BLUEPRINTS = join(HERE, 'blueprints');

const [, , grade, subject, ...rest] = process.argv;
if (!grade || !subject) { console.error('usage: node plan.mjs <grade> <subject> [--standards a,b]'); process.exit(2); }
const only = rest.includes('--standards') ? new Set(rest[rest.indexOf('--standards') + 1].split(',')) : null;

const skeleton = JSON.parse(readFileSync(join(DATA, `skeleton-${grade}-${subject}.json`), 'utf8'));

function expectedMaterials(standard) {
  return [
    { id: `${standard}--lesson`, materialType: 'lesson', difficulty: null },
    { id: `${standard}--worksheet--easy`, materialType: 'worksheet', difficulty: 'Easy' },
    { id: `${standard}--worksheet--medium`, materialType: 'worksheet', difficulty: 'Medium' },
    { id: `${standard}--worksheet--hard`, materialType: 'worksheet', difficulty: 'Hard' },
    { id: `${standard}--quiz`, materialType: 'quiz', difficulty: null },
  ];
}

// Pull canonical tags from an existing content file if present (even a broken one
// keeps valid top-level tags), else from the skeleton.
function tagsFor(std, domain, cluster) {
  const lessonPath = join(CONTENT, `${std.code}--lesson.json`);
  for (const mt of ['lesson', 'quiz', 'worksheet--easy']) {
    const p = join(CONTENT, `${std.code}--${mt}.json`);
    if (existsSync(p)) {
      try {
        const d = JSON.parse(readFileSync(p, 'utf8'));
        if (d.domain) return {
          domain: d.domain, domainCode: d.domainCode, cluster: d.cluster,
          clusterCode: d.clusterCode, skillName: d.skillName,
        };
      } catch { /* fall through */ }
    }
  }
  return {
    domain: domain.name, domainCode: domain.code, cluster: cluster.name,
    clusterCode: cluster.code, skillName: std.skillName,
  };
}

const tasks = [];
let totalMaterials = 0, brokenCount = 0;

for (const domain of skeleton.domains) {
  for (const cluster of domain.clusters) {
    for (const std of cluster.standards) {
      if (only && !only.has(std.code)) continue;
      const tags = tagsFor(std, domain, cluster);
      const broken = [];
      const bp = existsSync(join(BLUEPRINTS, `${std.code}.json`))
        ? join(BLUEPRINTS, `${std.code}.json`) : null;
      for (const m of expectedMaterials(std.code)) {
        totalMaterials++;
        const path = join(CONTENT, `${m.id}.json`);
        const res = existsSync(path) ? check(path, bp ? JSON.parse(readFileSync(bp, 'utf8')) : null)
          : { ok: false, errors: ['file missing'] };
        if (!res.ok) { broken.push({ ...m, errors: res.errors.slice(0, 4) }); brokenCount++; }
      }
      if (broken.length) {
        tasks.push({
          standard: std.code, grade: String(grade), subject,
          skillName: std.skillName, description: std.description, ccssText: std.ccssText,
          ...tags,
          needBlueprint: !bp,
          materials: broken,
        });
      }
    }
  }
}

console.log(JSON.stringify({ grade: String(grade), subject, totalMaterials, brokenCount, taskCount: tasks.length, tasks }, null, 2));
