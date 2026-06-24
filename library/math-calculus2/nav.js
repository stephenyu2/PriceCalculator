let skeleton = null;
let catalog = null;
let GRADE_CODE = null; // grade prefix used in standard codes (e.g. "7", "PC", "K", "A1")

async function init() {
  try {
    [skeleton, catalog] = await Promise.all([
      fetch('../data/skeleton-calculus2-math.json').then(r => r.json()),
      fetch('../data/catalog.json').then(r => r.json())
    ]);
    GRADE_CODE = gradeCodeOf(skeleton);
    buildNav();
    handleHash();
    window.addEventListener('hashchange', handleHash);
  } catch (e) {
    document.getElementById('libMain').innerHTML =
      '<p style="padding:2rem;color:#c00">Failed to load curriculum data.</p>';
  }
}

function buildNav() {
  const nav = document.getElementById('libNav');
  nav.innerHTML = '<div class="nav-grade-label">Calculus II</div>';

  for (const domain of skeleton.domains) {
    const el = document.createElement('div');
    el.className = 'nav-domain';

    const clusterLinks = domain.clusters.map(cluster => {
      const hashKey = `${domain.code}.${cluster.code}`;
      return `
        <a class="nav-cluster-link" href="#${hashKey}" data-hash="${hashKey}">
          <span class="nav-cluster-code">Cluster ${cluster.code}</span>
          ${clip(cluster.name, 52)}
        </a>`;
    }).join('');

    el.innerHTML = `<div class="nav-domain-name">${domain.name}</div>${clusterLinks}`;
    nav.appendChild(el);
  }
}

function handleHash() {
  const hash = window.location.hash.slice(1);

  document.querySelectorAll('.nav-cluster-link').forEach(a => {
    a.classList.toggle('active', a.dataset.hash === hash);
  });

  if (!hash) { showWelcome(); return; }

  const [domainCode, clusterCode] = hash.split('.');
  const domain = skeleton.domains.find(d => d.code === domainCode);
  const cluster = domain && domain.clusters.find(c => c.code === clusterCode);
  if (!cluster) { showWelcome(); return; }

  renderCluster(domain, cluster);
}

function renderCluster(domain, cluster) {
  // Look materials up by id — ids encode the material shape, so we never have to
  // rely on per-item difficulty/tier fields being present in the catalog.
  const byId = {};
  for (const item of catalog.items) byId[item.id] = item;

  const standardsHtml = cluster.standards.map(std => {
    const lesson = byId[`${std.code}--lesson`];
    const quiz   = byId[`${std.code}--quiz`];

    // Worksheet chips, rendered dynamically from whatever exists:
    //   legacy easy/medium/hard  -> three chips (keeps built grades working)
    //   tier1/tier2              -> "Tier 1" / "Tier 2"
    //   single ramped (default)  -> one "Practice" chip
    const easy = byId[`${std.code}--worksheet--easy`];
    const med  = byId[`${std.code}--worksheet--medium`];
    const hard = byId[`${std.code}--worksheet--hard`];
    const tier1 = byId[`${std.code}--worksheet--tier1`];
    const tier2 = byId[`${std.code}--worksheet--tier2`];
    const single = byId[`${std.code}--worksheet`];

    let worksheetChips;
    if (easy || med || hard) {
      worksheetChips = chip(easy, 'Easy', 'chip-easy') + chip(med, 'Medium', 'chip-med') + chip(hard, 'Hard', 'chip-hard');
    } else if (tier1 || tier2) {
      worksheetChips = chip(tier1, 'Tier 1', 'chip-tier1') + chip(tier2, 'Tier 2', 'chip-tier2');
    } else {
      worksheetChips = chip(single, 'Practice', 'chip-worksheet');
    }

    return `
      <div class="standard-card">
        <div class="std-header">
          <span class="std-code">${std.code}</span>
          <span class="std-name">${std.skillName}</span>
        </div>
        <div class="std-materials">
          <div class="mat-group">
            <span class="mat-group-label">Lesson</span>
            ${chip(lesson, 'Lesson', 'chip-lesson')}
          </div>
          <div class="mat-group">
            <span class="mat-group-label">Worksheets</span>
            ${worksheetChips}
          </div>
          <div class="mat-group">
            <span class="mat-group-label">Quiz</span>
            ${chip(quiz, 'Quiz', 'chip-quiz')}
          </div>
        </div>
      </div>`;
  }).join('');

  // "Full Cluster" section — one ramped cluster worksheet + one cluster test.
  const clusterId = clusterIdOf(domain, cluster);
  const clusterWk   = byId[`${clusterId}--cluster-worksheet`];
  const clusterTest = byId[`${clusterId}--cluster-test`];
  const fullClusterHtml = `
    <div class="standard-card cluster-full-card">
      <div class="std-header">
        <span class="std-code">${clusterId}</span>
        <span class="std-name">Full Cluster</span>
      </div>
      <div class="std-materials">
        <div class="mat-group">
          <span class="mat-group-label">Worksheet</span>
          ${chip(clusterWk, 'Cluster Worksheet', 'chip-cluster-worksheet')}
        </div>
        <div class="mat-group">
          <span class="mat-group-label">Test</span>
          ${chip(clusterTest, 'Cluster Test', 'chip-cluster-test')}
        </div>
      </div>
    </div>`;

  document.getElementById('libMain').innerHTML = `
    <div class="cluster-header">
      <p class="cluster-breadcrumb">${domain.name}</p>
      <h1 class="cluster-title">Cluster ${cluster.code} — ${cluster.name}</h1>
      <p class="cluster-meta">${cluster.standards.length} standard${cluster.standards.length !== 1 ? 's' : ''}</p>
    </div>
    ${standardsHtml}
    <h2 class="cluster-section-heading">Full Cluster</h2>
    ${fullClusterHtml}`;
}

// The grade prefix used in standard codes (e.g. "7", "PC", "K", "A1") — read off an
// actual standard code, since skeleton.grade ("precalculus", "k") differs from it.
function gradeCodeOf(sk) {
  for (const d of sk.domains) for (const c of d.clusters) {
    if (c.standards && c.standards[0]) return c.standards[0].code.split('.')[0];
  }
  return String(sk.grade);
}

// clusterId = {gradeCode}.{domainCode}.{clusterCode}, e.g. 7.RP.A
function clusterIdOf(domain, cluster) {
  return `${GRADE_CODE}.${domain.code}.${cluster.code}`;
}

function chip(item, label, cls) {
  if (!item) return `<span class="mat-chip unavailable">${label}</span>`;
  return `<a class="mat-chip ${cls}" href="material.html?id=${item.id}">${label}</a>`;
}

function showWelcome() {
  document.getElementById('libMain').innerHTML = `
    <div class="lib-welcome">
      <h2>Calculus II</h2>
      <p>Select a cluster from the left to view available materials.</p>
    </div>`;
}

function clip(str, max) {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

init();
