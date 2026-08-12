const params = new URLSearchParams(window.location.search);
const subject = params.get('subject');
const grade = params.get('grade');

const MATH_PROGRESSION = ['k','1','2','3','4','5','6','7','8','algebra1','geometry','algebra2','precalculus','calculus1','calculus2'];
const ELA_PROGRESSION  = ['k','1','2','3','4','5','6','7','8','9','10','11','12'];
// Science diagnostics are being built out grade by grade; the progression lists
// only the grades that actually have a test so the "next grade" prompt never
// links to a diagnostic that does not exist yet. High school science is by
// course (biology, chemistry, physics), not grade number, mirroring how the
// math progression uses course tokens (algebra1, geometry, ...).
const SCIENCE_PROGRESSION = ['k','1','2','3','4','5','6','7','8','biology','chemistry','physics'];

const PROGRESSIONS = { math: MATH_PROGRESSION, ela: ELA_PROGRESSION, science: SCIENCE_PROGRESSION };

const SUBJECT_LABELS = { math: 'Math', ela: 'English Language Arts', science: 'Science' };

const SUPPORTED_SUBJECTS = ['math', 'ela', 'science'];

const GRADE_LABELS = {
  math: {
    k: 'Kindergarten', 1: '1st Grade', 2: '2nd Grade', 3: '3rd Grade',
    4: '4th Grade', 5: '5th Grade', 6: '6th Grade', 7: '7th Grade',
    8: '8th Grade', algebra1: 'Algebra I', geometry: 'Geometry', algebra2: 'Algebra II',
    precalculus: 'Precalculus', statistics: 'Statistics', calculus1: 'Calculus I', calculus2: 'Calculus II'
  },
  ela: {
    k: 'Kindergarten', 1: '1st Grade', 2: '2nd Grade', 3: '3rd Grade',
    4: '4th Grade', 5: '5th Grade', 6: '6th Grade', 7: '7th Grade',
    8: '8th Grade', 9: '9th Grade', 10: '10th Grade', 11: '11th Grade', 12: '12th Grade'
  },
  science: {
    k: 'Kindergarten', 1: '1st Grade', 2: '2nd Grade', 3: '3rd Grade',
    4: '4th Grade', 5: '5th Grade', 6: '6th Grade', 7: '7th Grade', 8: '8th Grade',
    biology: 'Biology', chemistry: 'Chemistry', physics: 'Physics'
  }
};

let testData = null;
let answers = {};
let timerInterval = null;
let secondsRemaining = 0;

// ── Email gate ────────────────────────────────────────────────────────────────

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function handleGateInput() {
  const val = document.getElementById('gateEmail').value;
  const btn = document.getElementById('gateBtn');
  const err = document.getElementById('gateError');
  const inp = document.getElementById('gateEmail');
  const valid = isValidEmail(val);
  btn.disabled = !valid;
  inp.classList.toggle('invalid', val.length > 3 && !valid);
  if (valid) err.textContent = '';
}

function handleGateSubmit() {
  const email = document.getElementById('gateEmail').value.trim();
  if (!isValidEmail(email)) {
    document.getElementById('gateError').textContent = 'Please enter a valid email address.';
    document.getElementById('gateEmail').classList.add('invalid');
    return;
  }
  localStorage.setItem('lvt_email', email);
  // Fire-and-forget — don't block test start on network
  fetch('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'form-name': 'diagnostic-email-gate',
      email,
      subject: subject || '',
      grade: grade || ''
    })
  }).catch(() => {});
  document.getElementById('emailGate').classList.add('hidden');
  init();
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer(minutes) {
  secondsRemaining = minutes * 60;
  const wrap = document.getElementById('timerWrap');
  if (wrap) wrap.classList.remove('hidden');
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    secondsRemaining--;
    updateTimerDisplay();
    if (secondsRemaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      handleSubmit();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('timerDisplay');
  if (!el) return;
  const s = Math.max(0, secondsRemaining);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  el.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  if (secondsRemaining <= 120) el.classList.add('timer-urgent');
  else el.classList.remove('timer-urgent');
}

// Convert LaTeX source strings to readable plain text for PDF.
// Uses only ASCII + Latin-1 output so jsPDF's built-in Helvetica renders correctly.
// Unicode math symbols (sqrt, arrows, Greek, etc.) are NOT in Helvetica and show as
// garbage characters — everything here must stay in the printable ASCII range.
function latexToText(str) {
  if (!str) return '';
  return str
    // Protect currency \$ before stripping LaTeX math $ delimiters
    .replace(/\\\$/g, '\x01DOLLAR\x01')
    // Strip LaTeX math delimiters
    .replace(/\$\$/g, '').replace(/\$/g, '')
    // Restore currency $
    .replace(/\x01DOLLAR\x01/g, '$')
    // Fractions
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    // Roots — use ASCII sqrt() notation; Unicode sqrt char doesn't render in Helvetica
    .replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, '$1-root($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\\sqrt/g, 'sqrt')
    // Operators
    .replace(/\\times/g, 'x').replace(/\\div/g, '/')
    .replace(/\\cdot/g, '*').replace(/\\pm/g, '+/-')
    // Relations
    .replace(/\\leq/g, '<=').replace(/\\geq/g, '>=')
    .replace(/\\neq/g, '!=').replace(/\\approx/g, '~=')
    // Arrows & special values
    .replace(/\\to/g, '->').replace(/\\infty/g, 'inf')
    // Greek letters
    .replace(/\\pi/g, 'pi').replace(/\\theta/g, 'theta')
    .replace(/\\alpha/g, 'alpha').replace(/\\beta/g, 'beta')
    .replace(/\\mu/g, 'mu').replace(/\\sigma/g, 'sigma')
    // Overline: x-bar notation
    .replace(/\\bar\{([^}]+)\}/g, '$1-bar')
    // Trig / log functions (already ASCII, just strip backslash)
    .replace(/\\sin/g, 'sin').replace(/\\cos/g, 'cos')
    .replace(/\\tan/g, 'tan').replace(/\\log/g, 'log')
    .replace(/\\ln/g, 'ln').replace(/\\lim/g, 'lim')
    // Calculus
    .replace(/\\int/g, 'integral').replace(/\\sum/g, 'sum')
    .replace(/\\prod/g, 'product').replace(/\\partial/g, 'd')
    // Geometry / set symbols
    .replace(/\\angle/g, 'angle').replace(/\\parallel/g, '||')
    .replace(/\\perp/g, 'perp').replace(/\\cup/g, 'union')
    .replace(/\\cap/g, 'intersect').replace(/\\in/g, 'in')
    // Combinations
    .replace(/\\binom\{([^}]+)\}\{([^}]+)\}/g, 'C($1,$2)')
    // Superscripts / subscripts
    .replace(/\^\{([^}]+)\}/g, '^($1)').replace(/_\{([^}]+)\}/g, '_($1)')
    // ^2 / ^3 stay as-is (superscript digits are Latin-1, safe in Helvetica)
    .replace(/\^2/g, '^2').replace(/\^3/g, '^3').replace(/\^n/g, '^n')
    // Strip remaining LaTeX structure
    .replace(/\\left|\\right/g, '').replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\{|\}/g, '').replace(/\\/g, '')
    .replace(/\s{2,}/g, ' ').trim();
}

function downloadPDF() {
  closeModal();
  const btn = document.getElementById('pdfDownloadBtn');
  if (btn) { btn.textContent = 'Generating PDF…'; btn.disabled = true; }
  try {
    const { doc, filename } = buildResultsPDF();
    doc.save(filename);
  } finally {
    if (btn) { btn.textContent = 'Download Results as PDF'; btn.disabled = false; }
  }
}

// Builds the results PDF document (does not download it). Reads the rendered
// score/level from the DOM, so call only after handleSubmit has populated them.
function buildResultsPDF() {
    const gradeLabel   = GRADE_LABELS[subject][grade] || grade;
    const subjectLabel = SUBJECT_LABELS[subject] || subject;
    const dateStr      = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
    const score        = document.getElementById('scoreFraction').textContent;
    const pct          = document.getElementById('scorePercent').textContent;
    const level        = document.getElementById('levelText').textContent;
    const desc         = document.getElementById('levelDescription').textContent;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });

    const PW = 612, PH = 792, ML = 36, MR = 36, MT = 40, MB = 36;
    const CW = PW - ML - MR;
    let y = MT;

    function newPage() { doc.addPage(); y = MT; }
    function check(h)  { if (y + h > PH - MB) newPage(); }
    function lh(sz)    { return sz * 1.4; }

    function style(sz, wt, rgb) {
      doc.setFontSize(sz);
      doc.setFont('helvetica', wt || 'normal');
      doc.setTextColor(...(rgb || [17, 17, 17]));
    }

    function wrappedLines(txt, maxW, sz) {
      // always measure in normal weight so line counts are consistent regardless
      // of whatever font style the previous draw operation left behind
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(sz);
      return doc.splitTextToSize(String(txt), maxW);
    }

    function drawLines(lines, x, sz, wt, rgb) {
      style(sz, wt, rgb);
      // no check() here — page placement is handled by the pre-card check so
      // triggering newPage() mid-card would abandon the card rect on the old page
      lines.forEach(ln => { doc.text(ln, x, y); y += lh(sz); });
    }

    // ── Header ──────────────────────────────────────────────────
    style(16, 'bold');
    doc.text('Launch Valley Tutoring', ML, y); y += lh(16);

    style(12, 'bold');
    doc.text(`${gradeLabel} ${subjectLabel} Diagnostic`, ML, y); y += lh(12);

    style(9, 'normal', [136, 136, 136]);
    doc.text(`Completed: ${dateStr}`, ML, y); y += lh(9) + 16;

    // Rule
    doc.setDrawColor(200, 200, 200); doc.line(ML, y, ML + CW, y); y += 18;

    // ── Placement result leads ────────────────────────────────────
    const lcMap = {
      'Significantly Below Grade Level': [138,28,28],
      'Below Grade Level': [184,48,48],
      'At Grade Level': [26,77,181],
      'Above Grade Level': [24,110,56],
      'Significantly Above Grade Level / Mastery': [15,90,43]
    };
    const lc = lcMap[level] || [17, 17, 17];

    // Level in large text — the dominant visual
    style(22, 'bold', lc);
    doc.text(level, PW / 2, y, { align: 'center' }); y += lh(22) + 4;

    // Score smaller, beneath
    style(12, 'normal', [85, 85, 85]);
    doc.text(`Score: ${score}  (${pct})`, PW / 2, y, { align: 'center' }); y += lh(12) + 8;

    // Description
    const descLines = wrappedLines(desc, CW - 80, 9);
    style(9, 'normal', [85, 85, 85]);
    descLines.forEach(ln => { doc.text(ln, PW / 2, y, { align: 'center' }); y += lh(9); });
    y += 14;

    // Rule
    doc.setDrawColor(200, 200, 200); doc.line(ML, y, ML + CW, y); y += 14;

    // ── Review heading ───────────────────────────────────────────
    style(12, 'bold'); doc.text('Review Your Answers', ML, y); y += lh(12) + 6;

    // ── Questions ────────────────────────────────────────────────
    const PAD = 10;
    const IW  = CW - PAD * 2;

    testData.questions.forEach((q, idx) => {
      const userAnswer = answers[q.id];
      const isCorrect  = userAnswer === q.answer;
      const uText = latexToText(userAnswer !== undefined ? q.options[userAnswer] : '(not answered)');
      const cText = latexToText(q.options[q.answer]);
      const qText = latexToText(q.text);
      const exText = latexToText(q.explanation || '');
      const pText  = latexToText(q.passage || '');

      // Pre-calculate card height
      const qLines  = wrappedLines(qText, IW, 10);
      const pLines  = pText  ? wrappedLines(pText,  IW - 8, 9) : [];
      const uLines  = !isCorrect ? wrappedLines(`Your answer: ${uText}`, IW, 9) : [];
      const cLines  = !isCorrect ? wrappedLines(`Correct answer: ${cText}`, IW, 9) : [];
      const exLines = exText ? wrappedLines(exText, IW, 9) : [];

      const cardH = PAD
        + lh(9) + 4                                          // meta row
        + (pLines.length  ? pLines.length * lh(9) + 14 : 0) // +14 matches drawing (pH+4)
        + qLines.length  * lh(10) + 4
        + uLines.length  * lh(9)
        + cLines.length  * lh(9)
        + (exLines.length ? 2 + exLines.length * lh(9) : 0) // +2 matches y+=2 before drawLines
        + PAD;

      if (y + cardH > PH - MB) newPage();

      const cardY = y;
      const bg  = isCorrect ? [243,251,246] : [255,246,245];
      const bdr = isCorrect ? [168,224,188] : [245,192,188];
      doc.setFillColor(...bg); doc.setDrawColor(...bdr);
      doc.roundedRect(ML, cardY, CW, cardH, 4, 4, 'FD');

      y = cardY + PAD;

      // Meta: Q# + verdict + standard
      style(9, 'bold', [85, 85, 85]);
      doc.text(`Q${idx + 1}`, ML + PAD, y);
      const qnW = doc.getTextWidth(`Q${idx + 1}`) + 7;

      if (isCorrect) { style(9, 'bold', [24,110,56]); doc.text('Correct', ML + PAD + qnW, y); }
      else           { style(9, 'bold', [184,48,48]);  doc.text('Incorrect', ML + PAD + qnW, y); }

      style(8, 'normal', [170, 170, 170]);
      doc.text(q.standard || '', ML + PAD + qnW + 52, y);
      y += lh(9) + 4;

      // Passage
      if (pLines.length) {
        const pH = pLines.length * lh(9) + 10;
        doc.setFillColor(250,250,248); doc.setDrawColor(200,200,200); doc.setLineWidth(0.5);
        doc.rect(ML + PAD, y, IW, pH, 'FD');
        doc.setLineWidth(2); doc.setDrawColor(200,200,200);
        doc.line(ML + PAD, y, ML + PAD, y + pH);
        doc.setLineWidth(0.5);
        style(9, 'italic', [68, 68, 68]);
        pLines.forEach((ln, i) => doc.text(ln, ML + PAD + 9, y + 5 + (i + 1) * lh(9)));
        y += pH + 4;
      }

      // Question
      drawLines(qLines, ML + PAD, 10, 'normal', [17,17,17]); y += 4;

      // Wrong answer
      if (!isCorrect) {
        drawLines(uLines, ML + PAD, 9, 'normal', [184,48,48]);
        drawLines(cLines, ML + PAD, 9, 'bold',   [24,110,56]);
      }

      // Explanation
      if (exLines.length) { y += 2; drawLines(exLines, ML + PAD, 9, 'italic', [102,102,102]); }

      y = cardY + cardH + 8;
    });

    // ── Bottom contact + CTA ─────────────────────────────────────
    y += 8;
    check(80);

    // Contact line
    const ctLines = wrappedLines(
      'To discuss these results, text us at (818) 294-3292 or email launch@launchvalleytutoring.com.',
      CW - 18, 9);
    const ctH = ctLines.length * lh(9) + 14;
    doc.setFillColor(250, 250, 248); doc.setDrawColor(221, 221, 221);
    doc.roundedRect(ML, y, CW, ctH, 3, 3, 'FD');
    style(9, 'normal', [85, 85, 85]);
    ctLines.forEach((ln, i) => doc.text(ln, ML + 8, y + 10 + i * lh(9)));
    y += ctH + 10;

    // CTA box
    check(60);
    const ctaLines = wrappedLines(
      'Ready to close the gaps? Book a free consultation at launchvalleytutoring.com or text us at (818) 294-3292.',
      CW - 24, 10);
    const ctaH = ctaLines.length * lh(10) + 18;
    doc.setFillColor(17, 17, 17); doc.setDrawColor(17, 17, 17);
    doc.roundedRect(ML, y, CW, ctaH, 5, 5, 'FD');
    style(10, 'bold', [255, 255, 255]);
    ctaLines.forEach((ln, i) => doc.text(ln, ML + 12, y + 13 + i * lh(10)));
    y += ctaH;

    const filename = `${gradeLabel}-${subjectLabel}-Diagnostic.pdf`.replace(/\s+/g, '-');
    return { doc, filename };
}

function closeModal() {
  document.getElementById('resultsModal').classList.add('hidden');
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('resultsModal')) closeModal();
}

// Converts \$ (escaped currency dollar in JSON) to a span so KaTeX can't treat
// it as a math delimiter, without showing the backslash to the user.
function safeText(s) {
  return s ? s.replace(/\\\$/g, '<span>$</span>') : '';
}

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

async function init() {
  if (!subject || !grade || !SUPPORTED_SUBJECTS.includes(subject)) {
    showError();
    return;
  }

  try {
    const resp = await fetch(`data/${subject}-${grade}.json`);
    if (!resp.ok) throw new Error('not found');
    testData = await resp.json();
    renderTest(testData);
    startTimer(testData.timeMinutes || 40);
  } catch (e) {
    showError();
  }
}

// Run on page load — show gate or load test immediately if email already stored
(function() {
  const stored = localStorage.getItem('lvt_email');
  if (stored) {
    const gate = document.getElementById('emailGate');
    if (gate) gate.classList.add('hidden');
    init();
  }
  // else: gate overlay is already visible by default; init() called from handleGateSubmit()
})();

function showError() {
  document.getElementById('testLoading').classList.add('hidden');
  document.getElementById('testError').classList.remove('hidden');
}

function renderTest(data) {
  document.getElementById('testLoading').classList.add('hidden');
  document.getElementById('testContent').classList.remove('hidden');

  const subjectLabel = SUBJECT_LABELS[subject] || subject;
  const gradeLabel = GRADE_LABELS[subject][grade] || grade;

  const fullTitle = `${gradeLabel} ${subjectLabel} Diagnostic`;
  document.title = `${fullTitle} — Launch Valley Tutoring`;
  document.getElementById('testTitle').textContent = fullTitle;
  document.getElementById('printTitle').textContent = fullTitle;
  document.getElementById('printDate').textContent = `Completed: ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}`;
  const alignment = subject === 'science' ? 'NGSS aligned' : 'Common Core aligned';
  document.getElementById('testSubtitle').textContent =
    `${data.questions.length} questions · ${data.timeMinutes} minutes · ${alignment}`;
  document.getElementById('totalCount').textContent = data.questions.length;
  const dur = document.getElementById('testDuration');
  if (dur) dur.textContent = data.timeMinutes;

  if (['k','1','2'].includes(grade)) {
    document.getElementById('k2Note').style.display = 'block';
  }

  // Calculator badge
  const calcBadge = document.getElementById('calcBadge');
  if (calcBadge) {
    if (data.calculator) {
      calcBadge.textContent = 'Calculator allowed';
      calcBadge.className = 'calc-badge allowed';
    } else {
      calcBadge.textContent = 'No calculator';
      calcBadge.className = 'calc-badge no-calc';
    }
    calcBadge.removeAttribute('hidden');
  }

  // Scratch paper badge — shown only when the test data opts in (scratchPaper: true)
  const scratchBadge = document.getElementById('scratchBadge');
  if (scratchBadge) {
    if (data.scratchPaper) {
      scratchBadge.textContent = 'Scratch paper required';
      scratchBadge.className = 'calc-badge scratch';
      scratchBadge.removeAttribute('hidden');
    } else {
      scratchBadge.setAttribute('hidden', '');
    }
  }

  // Formula sheet
  const formulaSection = document.getElementById('formulaSection');
  if (formulaSection && data.formulas && data.formulas.length) {
    const rows = data.formulas.map(f =>
      `<tr><td class="formula-label">${f.label}</td><td class="formula-expr">${f.formula}</td></tr>`
    ).join('');
    formulaSection.innerHTML = `
      <details class="formula-sheet">
        <summary class="formula-summary">Reference Formulas <span class="formula-toggle-hint">(tap to expand)</span></summary>
        <table class="formula-table">${rows}</table>
      </details>`;
    typeset(formulaSection);
    formulaSection.removeAttribute('hidden');
  }

  const form = document.getElementById('questionsList');
  data.questions.forEach((q, idx) => {
    const el = document.createElement('div');
    el.className = 'question-item';
    el.id = `q-item-${q.id}`;

    const passageHtml = q.passage
      ? `<blockquote class="question-passage">${safeText(q.passage)}</blockquote>`
      : '';

    el.innerHTML = `
      <div class="question-header">
        <span class="question-number">Question ${idx + 1}</span>
        <span class="question-standard">${q.standard}</span>
      </div>
      ${passageHtml}
      <p class="question-text">${safeText(q.text)}</p>
      <ul class="options-list" role="radiogroup" aria-label="Question ${idx + 1} options">
        ${q.options.map((opt, i) => `
          <li class="option-item">
            <label class="option-label">
              <input type="radio" name="q${q.id}" value="${i}" onchange="handleAnswer(${q.id}, this)">
              <span class="option-letter">${String.fromCharCode(65 + i)}</span>
              <span class="option-text">${safeText(opt)}</span>
            </label>
          </li>`).join('')}
      </ul>
    `;
    form.appendChild(el);
  });

  typeset(form);
}

function handleAnswer(questionId, input) {
  answers[questionId] = parseInt(input.value);
  const item = document.getElementById(`q-item-${questionId}`);
  if (item) item.classList.add('answered');
  updateProgress();
}

function updateProgress() {
  const answered = Object.keys(answers).length;
  const total = testData.questions.length;
  document.getElementById('answeredCount').textContent = answered;
  document.getElementById('progressFill').style.width = `${(answered / total) * 100}%`;

  const note = document.getElementById('submitNote');
  const remaining = total - answered;
  note.textContent = remaining > 0
    ? `${remaining} question${remaining !== 1 ? 's' : ''} remaining`
    : 'All questions answered — ready to submit.';
  note.style.color = remaining === 0 ? '#111111' : '';
}

function handleSubmit() {
  const total = testData.questions.length;
  const answered = Object.keys(answers).length;

  if (answered < total) {
    const remaining = total - answered;
    if (!confirm(`You have ${remaining} unanswered question${remaining !== 1 ? 's' : ''}. Submit anyway?`)) return;
  }

  let correct = 0;
  testData.questions.forEach(q => {
    if (answers[q.id] === q.answer) correct++;
  });

  const pct = Math.round((correct / total) * 100);

  let level, levelClass, levelIcon, description;
  if (pct < 40) {
    level = 'Significantly Below Grade Level';
    levelClass = 'far-behind';
    levelIcon = '⚠';
    description = 'Your results point to real gaps in fundamentals from earlier grades. The best next step is to review prior-grade skills before moving on. A tutor can pinpoint exactly where to start.';
  } else if (pct < 60) {
    level = 'Below Grade Level';
    levelClass = 'behind';
    levelIcon = '↓';
    description = 'You are working below grade level expectations right now, and several in-grade skills need more practice. A tutor can help you close these gaps and build confidence.';
  } else if (pct < 80) {
    level = 'At Grade Level';
    levelClass = 'at-level';
    levelIcon = '✓';
    description = 'You are meeting grade level expectations. A tutor can help you strengthen the areas where you missed questions and push toward full mastery.';
  } else if (pct < 90) {
    level = 'Above Grade Level';
    levelClass = 'above';
    levelIcon = '↑';
    description = 'You scored above grade level expectations and are handling the harder material. Consider trying the next grade diagnostic to see how far ahead you are.';
  } else {
    level = 'Significantly Above Grade Level / Mastery';
    levelClass = 'mastery';
    levelIcon = '★';
    description = 'You showed mastery of this grade, including the most challenging questions. Trying the next grade diagnostic will give you a better sense of your ceiling.';
  }

  document.getElementById('scoreFraction').textContent = `${correct}/${total}`;
  document.getElementById('scorePercent').textContent = `${pct}%`;

  const badge = document.getElementById('levelBadge');
  badge.className = `level-badge ${levelClass}`;
  document.getElementById('levelIcon').textContent = levelIcon;
  document.getElementById('levelText').textContent = level;
  document.getElementById('levelDescription').textContent = description;

  if (pct >= 80) {
    const progression = PROGRESSIONS[subject] || [];
    const idx = progression.indexOf(grade);
    if (idx !== -1 && idx < progression.length - 1) {
      const nextGrade = progression[idx + 1];
      const nextLabel = GRADE_LABELS[subject][nextGrade] || nextGrade;
      document.getElementById('nextGradeText').textContent =
        `You are ready to try the ${nextLabel} diagnostic.`;
      document.getElementById('nextGradeLink').href = `test.html?subject=${subject}&grade=${nextGrade}`;
      document.getElementById('nextGradePrompt').classList.remove('hidden');
    }
  }

  const reviewList = document.getElementById('reviewList');
  testData.questions.forEach((q, idx) => {
    const userAnswer = answers[q.id];
    const isCorrect = userAnswer === q.answer;

    const div = document.createElement('div');
    div.className = `review-item ${isCorrect ? 'correct' : 'incorrect'}`;

    const userAnswerText = userAnswer !== undefined ? safeText(q.options[userAnswer]) : '(not answered)';

    div.innerHTML = `
      <div class="review-header">
        <span class="review-number">Q${idx + 1}</span>
        <span class="review-result">${isCorrect ? '✓ Correct' : '✗ Incorrect'}</span>
        <span class="review-standard">${q.standard}</span>
      </div>
      <p class="review-question">${q.passage ? `<em>${safeText(q.passage)}</em><br><br>` : ''}${safeText(q.text)}</p>
      ${!isCorrect ? `
        <p class="review-your-answer">Your answer: ${userAnswerText}</p>
        <p class="review-correct-answer">Correct answer: ${safeText(q.options[q.answer])}</p>
      ` : ''}
      ${q.explanation ? `<p class="review-explanation${isCorrect ? ' print-only' : ''}">${safeText(q.explanation)}</p>` : ''}
    `;
    reviewList.appendChild(div);
  });

  typeset(reviewList);

  submitResults(correct, total, pct, level);

  document.getElementById('resultsSection').classList.remove('hidden');
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });

  setTimeout(() => {
    document.getElementById('resultsModal').classList.remove('hidden');
  }, 1800);

  document.getElementById('questionsList').querySelectorAll('input').forEach(inp => inp.disabled = true);
  document.getElementById('submitBtn').disabled = true;
  document.getElementById('submitBtn').textContent = 'Submitted';
}

// Fire-and-forget POST of the completed result to Netlify Forms (dashboard +
// email notification). Same pattern as the email gate — never block the UI on it.
// Sent as multipart FormData so the generated PDF can ride along as a file
// upload; the text fields (score, breakdown, missed-question list) appear inline
// in the notification email, the PDF as a download link on the submission.
function submitResults(correct, total, pct, level) {
  // Per-standard right/wrong tally, e.g. "3.OA.A.1: 2/3 · 3.OA.A.2: 1/2"
  const tally = {};
  testData.questions.forEach(q => {
    const std = q.standard || 'unlabeled';
    if (!tally[std]) tally[std] = { correct: 0, total: 0 };
    tally[std].total++;
    if (answers[q.id] === q.answer) tally[std].correct++;
  });
  const breakdown = Object.keys(tally)
    .map(std => `${std}: ${tally[std].correct}/${tally[std].total}`)
    .join(' · ');

  // Every incorrect or unanswered question, one per line, letters + plain text.
  const letter = i => String.fromCharCode(65 + i);
  const missed = testData.questions
    .map((q, idx) => {
      const a = answers[q.id];
      if (a === q.answer) return null;
      const std = q.standard ? ` [${q.standard}]` : '';
      const correctText = `${letter(q.answer)}) ${latexToText(q.options[q.answer])}`;
      if (a === undefined) {
        return `Q${idx + 1}${std} unanswered — correct: ${correctText}`;
      }
      const chosenText = `${letter(a)}) ${latexToText(q.options[a])}`;
      return `Q${idx + 1}${std} incorrect — chose: ${chosenText} | correct: ${correctText}`;
    })
    .filter(Boolean)
    .join('\n') || 'None — all questions correct.';

  const fd = new FormData();
  fd.append('form-name', 'diagnostic-results');
  fd.append('email', localStorage.getItem('lvt_email') || '');
  fd.append('subject', subject || '');
  fd.append('grade', grade || '');
  fd.append('score', `${correct}/${total}`);
  fd.append('percent', `${pct}%`);
  fd.append('level', level);
  fd.append('standards-breakdown', breakdown);
  fd.append('missed-questions', missed);

  // Attach the results PDF as a file upload. Best-effort: if jsPDF is not loaded
  // or the build throws, the submission still goes through with all text fields.
  try {
    const { doc, filename } = buildResultsPDF();
    fd.append('results-pdf', doc.output('blob'), filename);
  } catch (e) { /* text-only submission */ }

  // No Content-Type header — the browser sets the multipart boundary itself.
  fetch('/', { method: 'POST', body: fd }).catch(() => {});
}
