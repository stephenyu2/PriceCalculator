let skeleton = null;
let catalog = null;

async function init() {
  try {
    [skeleton, catalog] = await Promise.all([
      fetch('../data/skeleton-biology-science.json').then(r => r.json()),
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
  nav.innerHTML = '<div class="nav-grade-label">Biology</div>';

  for (const domain of skeleton.domains) {
    const el = document.createElement('div');
    el.className = 'nav-domain';

    const clusterLinks = domain.clusters.map(cluster => {
      const hashKey = `${domain.code}.${cluster.code}`;
      return `
        <a class="nav-cluster-link" href="#${hashKey}" data-hash="${hashKey}">
          <span class="nav-cluster-code">${domain.code}</span>
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
  const byId = {};
  for (const item of catalog.items) byId[item.id] = item;

  const standardsHtml = cluster.standards.map(std => {
    const lesson = byId[`${std.code}--lesson`];
    const quiz   = byId[`${std.code}--quiz`];
    const single = byId[`${std.code}--worksheet`];
    const worksheetChips = chip(single, 'Practice', 'chip-worksheet');

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
            <span class="mat-group-label">Worksheet</span>
            ${worksheetChips}
          </div>
          <div class="mat-group">
            <span class="mat-group-label">Quiz</span>
            ${chip(quiz, 'Quiz', 'chip-quiz')}
          </div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('libMain').innerHTML = `
    <div class="cluster-header">
      <p class="cluster-breadcrumb">${domain.name}</p>
      <h1 class="cluster-title">${cluster.name}</h1>
      <p class="cluster-meta">${cluster.standards.length} standard${cluster.standards.length !== 1 ? 's' : ''}</p>
    </div>
    ${standardsHtml}`;
}

function chip(item, label, cls) {
  if (!item) return `<span class="mat-chip unavailable">${label}</span>`;
  return `<a class="mat-chip ${cls}" href="material.html?id=${item.id}">${label}</a>`;
}

function showWelcome() {
  document.getElementById('libMain').innerHTML = `
    <div class="lib-welcome">
      <h2>Biology</h2>
      <p>Select a topic from the left to view available materials.</p>
    </div>`;
}

function clip(str, max) {
  return str.length <= max ? str : str.slice(0, max - 1) + '\u2026';
}

init();
