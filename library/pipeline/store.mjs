#!/usr/bin/env node
// store.mjs — DETERMINISTIC render-and-catalog step. NOT an agent.
//
// Promotes verified staging files into the content store and updates
// catalog.json from each file's own tags. Re-runs the structural checker as a
// final gate so nothing malformed can ever reach content/. Idempotent: running
// twice produces the same result.
//
// A staging file is promoted only if BOTH:
//   1. pipeline/verdicts/<id>.json exists with ok === true   (Verifier passed)
//   2. check.mjs passes on the staging file                  (structural gate)
//
// Usage:
//   node store.mjs                 promote every eligible file in staging/
//   node store.mjs <id> [<id>...]  promote only the named ids
//   node store.mjs --dry-run       report what would happen, write nothing

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STAGING = join(HERE, 'staging');
const VERDICTS = join(HERE, 'verdicts');
const BLUEPRINTS = join(HERE, 'blueprints');
const CONTENT = join(HERE, '..', 'data', 'content');
const CATALOG = join(HERE, '..', 'data', 'catalog.json');
const REPORTS = join(HERE, 'reports');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const ids = argv.filter(a => !a.startsWith('--'));
const now = new Date().toISOString();

function loadJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }

function stagingFiles() {
  if (ids.length) return ids.map(id => `${id}.json`);
  return readdirSync(STAGING).filter(f => f.endsWith('.json'));
}

function verdictOk(id) {
  const vp = join(VERDICTS, `${id}.json`);
  if (!existsSync(vp)) return { ok: false, reason: 'no verdict file' };
  try {
    const v = loadJson(vp);
    return v.ok === true ? { ok: true } : { ok: false, reason: `verdict ok=${v.ok}` };
  } catch (e) { return { ok: false, reason: `bad verdict json: ${e.message}` }; }
}

function blueprintFor(standard) {
  const bp = join(BLUEPRINTS, `${standard}.json`);
  return existsSync(bp) ? loadJson(bp) : null;
}

const CLUSTER_TYPES = ['cluster-worksheet', 'cluster-test'];

// Build the catalog entry from a content file's own tags (single source of truth).
function catalogEntry(data) {
  const isCluster = CLUSTER_TYPES.includes(data.materialType);
  return {
    id: data.id,
    scope: isCluster ? 'cluster' : 'standard',
    standard: data.standard ?? null,
    clusterId: data.clusterId ?? null,
    domain: data.domain,
    domainCode: data.domainCode,
    cluster: data.cluster,
    clusterCode: data.clusterCode,
    skillName: data.skillName ?? data.cluster ?? null,
    materialType: data.materialType,
    difficulty: data.difficulty ?? null,
    tier: data.tier ?? null,
    itemCount: Array.isArray(data.items) ? data.items.length : 0,
    verificationStatus: 'verified',
    generatedAt: data.generatedAt || now,
  };
}

const report = { startedAt: now, promoted: [], skipped: [], failed: [] };

// Load catalog once, upsert in memory, write once.
const catalog = loadJson(CATALOG);
const indexById = new Map(catalog.items.map((it, i) => [it.id, i]));

for (const fname of stagingFiles()) {
  const id = fname.replace(/\.json$/, '');
  const path = join(STAGING, fname);
  if (!existsSync(path)) { report.failed.push({ id, reason: 'staging file missing' }); continue; }

  const v = verdictOk(id);
  if (!v.ok) { report.skipped.push({ id, reason: v.reason }); continue; }

  let data;
  try { data = loadJson(path); }
  catch (e) { report.failed.push({ id, reason: `bad json: ${e.message}` }); continue; }

  const bp = blueprintFor(data.standard);
  const res = check(path, bp);
  if (!res.ok) { report.failed.push({ id, reason: 'structural check failed', errors: res.errors }); continue; }

  // Stamp verification metadata.
  data.verificationStatus = 'verified';
  data.verifiedAt = now;
  if (!data.generatedAt) data.generatedAt = now;

  if (!dryRun) {
    writeFileSync(join(CONTENT, `${id}.json`), JSON.stringify(data, null, 2) + '\n');
  }

  const entry = catalogEntry(data);
  if (indexById.has(id)) catalog.items[indexById.get(id)] = entry;
  else { indexById.set(id, catalog.items.length); catalog.items.push(entry); }

  report.promoted.push({ id, itemCount: entry.itemCount, warnings: res.warnings });
}

if (!dryRun && report.promoted.length) {
  catalog.updatedAt = now;
  writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n');
}

const reportPath = join(REPORTS, `store-${now.replace(/[:.]/g, '-')}.json`);
if (!dryRun) writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify({
  dryRun,
  promoted: report.promoted.length,
  skipped: report.skipped.length,
  failed: report.failed.length,
  failures: report.failed,
  reportPath: dryRun ? null : reportPath,
}, null, 2));
