const params = new URLSearchParams(window.location.search);
const id = params.get('id');

function typeset(el) {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false }
      ],
      throwOnError: false
    });
  }
}

function safe(s) {
  return s ? s.replace(/\\\$/g, '<span>$</span>') : '';
}

async function init() {
  if (!id) { showError('No material specified.'); return; }

  try {
    const resp = await fetch(`../data/content/${id}.json`);
    if (!resp.ok) throw new Error('not found');
    const data = await resp.json();
    render(data);
  } catch (e) {
    showError('Material not found.');
  }
}

function render(data) {
  document.title = `${data.skillName} — Launch Valley Tutoring`;
  document.getElementById('matLoading').classList.add('hidden');

  const el = document.getElementById('matContent');
  if (data.materialType === 'lesson')                  renderLesson(data, el);
  else if (data.materialType === 'worksheet')          renderWorksheet(data, el);
  else if (data.materialType === 'cluster-worksheet')  renderWorksheet(data, el);
  else if (data.materialType === 'quiz')               renderQuiz(data, el);
  else if (data.materialType === 'cluster-test')       renderClusterTest(data, el);

  el.classList.remove('hidden');
  typeset(el);
}

// ── Shared header ────────────────────────────────────────────────────────────

function header(data, subtitle) {
  const typeLabel = {
    lesson: 'Lesson', worksheet: 'Worksheet', quiz: 'Quiz',
    'cluster-worksheet': 'Cluster Worksheet', 'cluster-test': 'Cluster Test'
  }[data.materialType] || data.materialType;
  const diffBadge = data.difficulty
    ? `<span class="badge-difficulty difficulty-${data.difficulty.toLowerCase()}">${data.difficulty}</span>`
    : '';
  // Cluster materials have no single standard — show the clusterId instead.
  const idLabel = data.materialType.startsWith('cluster') ? (data.clusterId || '') : data.standard;
  const backHash = `${data.domainCode}.${data.clusterCode}`;
  return `
    <a href="index.html#${backHash}" class="back-link">← ${data.domain}, Cluster ${data.clusterCode}</a>
    <header class="material-header">
      <div class="material-badges">
        <span class="badge-type badge-${data.materialType}">${typeLabel}</span>
        ${diffBadge}
        <span class="badge-standard">${idLabel}</span>
      </div>
      <h1 class="material-title">${data.skillName || data.cluster || ''}${subtitle ? ' — ' + subtitle : ''}</h1>
      ${data.intro ? `<p class="material-intro">${safe(data.intro)}</p>` : ''}
    </header>`;
}

// ── Lesson ───────────────────────────────────────────────────────────────────

function renderLesson(data, el) {
  const examples  = data.items.filter(i => i.type === 'worked-example');
  const practice  = data.items.filter(i => i.type === 'practice');

  const examplesHtml = examples.map((ex, i) => `
    <div class="worked-example">
      <div class="example-label">Example ${i + 1}</div>
      <p class="example-prompt">${safe(ex.prompt)}</p>
      <div class="solution-steps">
        <ol>${ex.solution.steps.map(s => `<li>${safe(s)}</li>`).join('')}</ol>
      </div>
      <div class="example-answer">Answer: ${safe(ex.solution.answer)}</div>
    </div>`).join('');

  const practiceHtml = practice.map((pr, i) => `
    <div class="practice-item">
      <div class="practice-number">Problem ${i + 1}</div>
      <p class="practice-prompt">${safe(pr.prompt)}</p>
      <div class="practice-actions">
        ${pr.hint ? `<button class="toggle-btn" onclick="toggle(this,'hint-${pr.id}','Show Hint','Hide Hint')">Show Hint</button>` : ''}
        <button class="toggle-btn" onclick="toggle(this,'ans-${pr.id}','Show Answer','Hide Answer')">Show Answer</button>
      </div>
      ${pr.hint ? `
        <div class="toggle-content hidden" id="hint-${pr.id}">
          <div class="hint-text">${safe(pr.hint)}</div>
        </div>` : ''}
      <div class="toggle-content hidden" id="ans-${pr.id}">
        <div class="answer-box">
          <div class="answer-label">Answer</div>
          <div class="answer-value">${safe(pr.solution.answer)}</div>
          <div class="solution-steps">
            <ol>${pr.solution.steps.map(s => `<li>${safe(s)}</li>`).join('')}</ol>
          </div>
        </div>
      </div>
    </div>`).join('');

  el.innerHTML = `
    ${header(data)}
    <h2 class="section-heading">Worked Examples</h2>
    ${examplesHtml}
    <h2 class="section-heading">Practice</h2>
    ${practiceHtml}`;
}

// ── Worksheet ────────────────────────────────────────────────────────────────

function worksheetSubtitle(data) {
  if (data.materialType === 'cluster-worksheet') return 'Cluster Worksheet';
  if (data.tier === 'tier1') return 'Worksheet — Tier 1';
  if (data.tier === 'tier2') return 'Worksheet — Tier 2';
  if (data.difficulty) return `${data.difficulty} Worksheet`; // legacy
  return 'Worksheet';
}

function renderWorksheet(data, el) {
  const subtitle = worksheetSubtitle(data);
  // Cluster worksheets group their items under per-standard section headers; a
  // standard-scoped worksheet is a single flat, continuously-numbered list.
  const body = data.materialType === 'cluster-worksheet'
    ? sectioned(data.items, (p, n) => problemItem(p, n), 'worksheet-problems')
    : `<ul class="worksheet-problems">${data.items.map((p, i) => problemItem(p, i + 1)).join('')}</ul>`;
  el.innerHTML = `
    ${header(data, subtitle)}
    ${stubNotice(data)}
    ${answerKeyBar()}
    ${body}`;
}

// ── Quiz ─────────────────────────────────────────────────────────────────────

function renderQuiz(data, el) {
  el.innerHTML = `
    ${header(data)}
    ${stubNotice(data)}
    <ul class="quiz-problems">
      ${data.items.map((p, i) => quizItem(p, i + 1)).join('')}
    </ul>`;
}

// ── Cluster test (reuses the clickable quiz renderer, sectioned by standard) ──

function renderClusterTest(data, el) {
  el.innerHTML = `
    ${header(data)}
    ${stubNotice(data)}
    ${sectioned(data.items, (p, n) => quizItem(p, n), 'quiz-problems')}`;
}

// Group items by their per-item `standard` field (order preserved), emit a section
// heading per standard, and number problems continuously across sections.
function sectioned(items, renderItem, listClass) {
  const groups = [];
  const index = {};
  for (const it of items) {
    const key = it.standard || 'General';
    if (!(key in index)) { index[key] = groups.length; groups.push({ standard: key, items: [] }); }
    groups[index[key]].items.push(it);
  }
  let n = 0;
  return groups.map(g => `
    <h2 class="section-heading cluster-section-heading">${g.standard}</h2>
    <ul class="${listClass}">${g.items.map(p => renderItem(p, ++n)).join('')}</ul>`).join('');
}

function parsePrompt(prompt) {
  const lines = prompt.split('\n');
  const questionLines = [];
  const options = [];
  for (const line of lines) {
    if (/^[A-D]\)/.test(line.trim())) {
      options.push(line.trim().replace(/^[A-D]\)\s*/, ''));
    } else {
      questionLines.push(line);
    }
  }
  return { questionText: questionLines.join('\n').trim(), options };
}

function quizItem(p, num) {
  const { questionText, options } = parsePrompt(p.prompt);
  const correctLetter = (p.answer || '').trim().charAt(0);
  const correctIndex = correctLetter ? correctLetter.charCodeAt(0) - 65 : -1;
  const diffTag = p.difficulty
    ? `<div class="problem-difficulty-tag difficulty-${p.difficulty.toLowerCase()}">${p.difficulty}</div>`
    : '';
  const optionsHtml = options.map((opt, i) => `
    <li class="quiz-option" id="qopt-${p.id}-${i}" onclick="selectOption(${p.id}, ${i}, ${correctIndex})">
      <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
      <span class="quiz-option-text">${safe(opt)}</span>
    </li>`).join('');

  return `
    <li class="quiz-problem" id="qp-${p.id}">
      ${diffTag}
      <div class="quiz-question-row">
        <span class="problem-num">${num}.</span>
        <p class="problem-prompt">${safe(questionText)}</p>
      </div>
      <ul class="quiz-options">${optionsHtml}</ul>
      <div class="quiz-feedback hidden" id="qfb-${p.id}"></div>
      <div class="ak-steps-wrap hidden" id="ak-${p.id}">
        <ol class="ak-steps">${p.solution.steps.map(s => `<li>${safe(s)}</li>`).join('')}</ol>
      </div>
    </li>`;
}

const quizAnswered = {};

function selectOption(itemId, chosenIndex, correctIndex) {
  if (quizAnswered[itemId]) return;
  quizAnswered[itemId] = true;

  const isCorrect = chosenIndex === correctIndex;

  document.querySelectorAll(`[id^="qopt-${itemId}-"]`).forEach((el, i) => {
    if (i === correctIndex) el.classList.add('quiz-opt-correct');
    if (i === chosenIndex && !isCorrect) el.classList.add('quiz-opt-wrong');
    el.style.pointerEvents = 'none';
  });

  const fb = document.getElementById(`qfb-${itemId}`);
  fb.textContent = isCorrect ? 'Correct!' : `Incorrect. The correct answer is ${String.fromCharCode(65 + correctIndex)}.`;
  fb.className = `quiz-feedback ${isCorrect ? 'quiz-fb-correct' : 'quiz-fb-wrong'}`;

  const steps = document.getElementById(`ak-${itemId}`);
  steps.classList.remove('hidden');
  typeset(steps);
}

// ── Shared problem item (worksheet) ──────────────────────────────────────────

function problemItem(p, num) {
  return `
    <li class="worksheet-problem">
      <div class="problem-number-row">
        <span class="problem-num">${num}.</span>
        <p class="problem-prompt">${safe(p.prompt)}</p>
      </div>
      <div class="answer-key-block hidden" id="ak-${p.id}">
        <div class="ak-answer">Answer: ${safe(p.answer)}</div>
        <ol class="ak-steps">
          ${p.solution.steps.map(s => `<li>${safe(s)}</li>`).join('')}
        </ol>
      </div>
    </li>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function answerKeyBar() {
  return `<div class="answer-key-bar">
    <button class="answer-key-btn" id="akBtn" onclick="toggleAllAnswers()">Show Answer Key</button>
  </div>`;
}

function stubNotice(data) {
  if (data.verificationStatus !== 'stub') return '';
  const type = {
    worksheet: `${data.difficulty || ''} worksheet`.trim(),
    quiz: 'quiz',
    'cluster-worksheet': 'cluster worksheet',
    'cluster-test': 'cluster test'
  }[data.materialType] || data.materialType;
  return `<div class="stub-notice">
    Stub — ${data.items.length} sample problems shown. The full ${type} will be generated by the pipeline.
  </div>`;
}

let answerKeyVisible = false;

function toggleAllAnswers() {
  answerKeyVisible = !answerKeyVisible;
  document.querySelectorAll('.answer-key-block').forEach(el => {
    el.classList.toggle('hidden', !answerKeyVisible);
  });
  const btn = document.getElementById('akBtn');
  if (btn) btn.textContent = answerKeyVisible ? 'Hide Answer Key' : 'Show Answer Key';
  if (answerKeyVisible) typeset(document.getElementById('matContent'));
}

function toggle(btn, id, labelOn, labelOff) {
  const el = document.getElementById(id);
  if (!el) return;
  const opening = el.classList.contains('hidden');
  el.classList.toggle('hidden', !opening);
  btn.classList.toggle('active', opening);
  btn.textContent = opening ? labelOff : labelOn;
  if (opening) typeset(el);
}

function showError(msg) {
  document.getElementById('matLoading').classList.add('hidden');
  const err = document.getElementById('matError');
  err.querySelector('p').textContent = msg;
  err.classList.remove('hidden');
}

init();
