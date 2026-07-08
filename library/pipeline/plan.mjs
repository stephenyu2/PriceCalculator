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

// The grade prefix used in the standard codes (e.g. "7", "PC", "K", "A1"). This is
// NOT always equal to skeleton.grade (precalculus -> "PC", k -> "K"), so we read it
// off an actual standard code to keep cluster ids consistent with the standards
// they contain.
function gradeCodeOf(sk) {
  for (const d of sk.domains) for (const c of d.clusters) {
    if (c.standards && c.standards[0]) return c.standards[0].code.split('.')[0];
  }
  return String(sk.grade);
}
const GRADE_CODE = gradeCodeOf(skeleton);

// clusterId = {gradeCode}.{domainCode}.{clusterCode}, e.g. 7.RP.A — matches the
// prefix of every standard code in that cluster (7.RP.A.1, 7.RP.A.2, ...).
function clusterIdOf(domain, cluster) {
  return `${GRADE_CODE}.${domain.code}.${cluster.code}`;
}

// Per-STANDARD expected materials. Worksheet shape is driven by std.worksheets:
//   1 (default) -> one ramped {std}--worksheet (difficulty null)
//   2           -> {std}--worksheet--tier1 and {std}--worksheet--tier2 (no overlap)
function expectedMaterials(standard, worksheets) {
  const out = [
    { id: `${standard}--lesson`, materialType: 'lesson', difficulty: null, scope: 'standard' },
  ];
  if (worksheets === 2) {
    out.push({ id: `${standard}--worksheet--tier1`, materialType: 'worksheet', difficulty: null, tier: 'tier1', scope: 'standard' });
    out.push({ id: `${standard}--worksheet--tier2`, materialType: 'worksheet', difficulty: null, tier: 'tier2', scope: 'standard' });
  } else {
    out.push({ id: `${standard}--worksheet`, materialType: 'worksheet', difficulty: null, tier: null, scope: 'standard' });
  }
  out.push({ id: `${standard}--quiz`, materialType: 'quiz', difficulty: null, scope: 'standard' });
  return out;
}

// Per-CLUSTER expected materials (the "Full Cluster" section): one ramped cluster
// worksheet + one cluster test.
function expectedClusterMaterials(clusterId) {
  return [
    { id: `${clusterId}--cluster-worksheet`, materialType: 'cluster-worksheet', difficulty: null, scope: 'cluster' },
    { id: `${clusterId}--cluster-test`, materialType: 'cluster-test', difficulty: null, scope: 'cluster' },
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

function checkMaterial(m, bp) {
  totalMaterials++;
  const path = join(CONTENT, `${m.id}.json`);
  const res = existsSync(path) ? check(path, bp ? JSON.parse(readFileSync(bp, 'utf8')) : null)
    : { ok: false, errors: ['file missing'] };
  if (!res.ok) { brokenCount++; return { ...m, errors: res.errors.slice(0, 4) }; }
  return null;
}

for (const domain of skeleton.domains) {
  for (const cluster of domain.clusters) {
    for (const std of cluster.standards) {
      if (only && !only.has(std.code)) continue;
      const tags = tagsFor(std, domain, cluster);
      const bp = existsSync(join(BLUEPRINTS, `${std.code}.json`))
        ? join(BLUEPRINTS, `${std.code}.json`) : null;
      const worksheets = std.worksheets === 2 ? 2 : 1; // default 1; only 1 or 2 supported
      const broken = expectedMaterials(std.code, worksheets)
        .map(m => checkMaterial(m, bp)).filter(Boolean);
      if (broken.length) {
        tasks.push({
          scope: 'standard',
          standard: std.code, grade: String(grade), subject,
          skillName: std.skillName, description: std.description, ccssText: std.ccssText,
          worksheets,
          ...tags,
          needBlueprint: !bp,
          materials: broken,
        });
      }
    }

    // Cluster-scoped "Full Cluster" materials. Skipped when --standards narrows the
    // run to specific standards (cluster materials are a whole-cluster instrument).
    if (!only) {
      const clusterId = clusterIdOf(domain, cluster);
      const broken = expectedClusterMaterials(clusterId)
        .map(m => checkMaterial(m, null)).filter(Boolean);
      if (broken.length) {
        tasks.push({
          scope: 'cluster',
          standard: null, clusterId, grade: String(grade), subject,
          domain: domain.name, domainCode: domain.code,
          cluster: cluster.name, clusterCode: cluster.code,
          standards: cluster.standards.map(s => ({ code: s.code, skillName: s.skillName })),
          materials: broken,
        });
      }
    }
  }
}

console.log(JSON.stringify({ grade: String(grade), subject, totalMaterials, brokenCount, taskCount: tasks.length, tasks }, null, 2));
