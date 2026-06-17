let skeleton = null;
let catalog = null;

async function init() {
  try {
    [skeleton, catalog] = await Promise.all([
      fetch('../data/skeleton-6-math.json').then(r => r.json()),
      fetch('../data/catalog.json').then(r => r.json())
    ]);
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
  nav.innerHTML = '<div class="nav-grade-label">6th Grade Math</div>';

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
  const catalogByStandard = {};
  for (const item of catalog.items) {
    if (!catalogByStandard[item.standard]) catalogByStandard[item.standard] = [];
    catalogByStandard[item.standard].push(item);
  }

  const standardsHtml = cluster.standards.map(std => {
    const items = catalogByStandard[std.code] || [];
    const lesson = items.find(i => i.materialType === 'lesson');
    const wkEasy = items.find(i => i.materialType === 'worksheet' && i.difficulty === 'Easy');
    const wkMed  = items.find(i => i.materialType === 'worksheet' && i.difficulty === 'Medium');
    const wkHard = items.find(i => i.materialType === 'worksheet' && i.difficulty === 'Hard');
    const quiz   = items.find(i => i.materialType === 'quiz');

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
            ${chip(wkEasy, 'Easy', 'chip-easy')}
            ${chip(wkMed, 'Medium', 'chip-med')}
            ${chip(wkHard, 'Hard', 'chip-hard')}
          </div>
          <div class="mat-group">
            <span class="mat-group-label">Quiz</span>
            ${chip(quiz, 'Quiz', 'chip-quiz')}
          </div>
        </div>
      </div>`;
  }).join('');

  const clusterTestId = `cluster-test--${domain.code}.${cluster.code}`;
  const clusterTestItem = catalog.items.find(i => i.id === clusterTestId);
  const clusterTestChip = clusterTestItem
    ? `<a class="mat-chip chip-cluster-test" href="material.html?id=${clusterTestId}">Take Test</a>`
    : `<span class="mat-chip unavailable">Coming soon</span>`;

  document.getElementById('libMain').innerHTML = `
    <div class="cluster-header">
      <p class="cluster-breadcrumb">${domain.name}</p>
      <h1 class="cluster-title">Cluster ${cluster.code} — ${cluster.name}</h1>
      <p class="cluster-meta">${cluster.standards.length} standard${cluster.standards.length !== 1 ? 's' : ''}</p>
    </div>
    ${standardsHtml}
    <div class="cluster-test-section">
      <h2 class="section-heading">Cluster Assessment</h2>
      <div class="standard-card cluster-test-card">
        <div class="std-header">
          <span class="std-name">Full Cluster Test — All ${cluster.standards.length} Standards</span>
        </div>
        <p class="cluster-test-desc">Give students the library password to access this test independently.</p>
        <div class="mat-group" style="margin-top:0.6rem">
          ${clusterTestChip}
        </div>
      </div>
    </div>`;
}

function chip(item, label, cls) {
  if (!item) return `<span class="mat-chip unavailable">${label}</span>`;
  return `<a class="mat-chip ${cls}" href="material.html?id=${item.id}">${label}</a>`;
}

function showWelcome() {
  document.getElementById('libMain').innerHTML = `
    <div class="lib-welcome">
      <h2>6th Grade Math</h2>
      <p>Select a cluster from the left to view available materials.</p>
    </div>`;
}

function clip(str, max) {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

init();
