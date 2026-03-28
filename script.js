/* ============================================
   LAUNCH VALLEY TUTORING — script.js
   ============================================ */

/* --- Theme Toggle --- */
(function () {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  function updateLabel() {
    btn.textContent = document.documentElement.getAttribute('data-theme') === 'light' ? 'Light' : 'Dark';
  }

  updateLabel(); // sync label with current theme on page load

  btn.addEventListener('click', function () {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('lvt-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('lvt-theme', 'light');
    }
    updateLabel();
    btn.classList.remove('flash');
    void btn.offsetWidth; // force reflow so animation restarts if clicked quickly
    btn.classList.add('flash');
    btn.addEventListener('animationend', function () { btn.classList.remove('flash'); }, { once: true });
  });
})();


/* --- Sticky Nav: add .scrolled class on scroll --- */
(function () {
  const nav = document.getElementById('nav');
  if (!nav) return;

  function onScroll() {
    if (window.scrollY > 40) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // Run once on load
})();



/* ============================================
   PACKAGE CALCULATOR
============================================ */

(function () {

  // ── Pricing Config ─────────────────────────────
  // Adjust rateAt6, floor, and k here to tune pricing behaviour.

  const PRICING = {
    elementary: { rateAt6: 58.33, floor: 42 },
    middle:     { rateAt6: 75.00, floor: 55 },
    high:       { rateAt6: 100.0, floor: 75 },
  };

  const K = 0.12; // exponential decay constant


  // ── Pricing Helpers ────────────────────────────

  function getTotalHours(sessionsPerWeek, hoursPerSession, numberOfWeeks) {
    return sessionsPerWeek * hoursPerSession * numberOfWeeks;
  }

  function getHourlyRate(studentType, totalHours) {
    const { rateAt6, floor } = PRICING[studentType];
    if (totalHours < 6) return rateAt6;
    return floor + (rateAt6 - floor) * Math.exp(-K * (totalHours - 6));
  }

  function getPackagePrice(studentType, totalHours) {
    const hourlyRate = getHourlyRate(studentType, totalHours);
    return {
      hourlyRate:  Math.round(hourlyRate * 100) / 100,
      totalPrice:  Math.round(hourlyRate * totalHours),
    };
  }


  // ── Stepper Config ─────────────────────────────

  const STEPPERS = {
    sessions:        { min: 1,   max: 7,  step: 1,   value: 2 },
    hoursPerSession: { min: 0.5, max: 4,  step: 0.5, value: 1 },
    weeks:           { min: 1,   max: 52, step: 1,   value: 4 },
  };

  let currentType = 'elementary';


  // ── DOM Helpers ────────────────────────────────

  function fmt(num) {
    // Format a number as "$1,234" (no cents unless .00 would be misleading)
    return '$' + num.toLocaleString('en-US');
  }

  function fmtRate(rate) {
    return '$' + rate.toFixed(2) + ' / hr';
  }

  function fmtHours(h) {
    // Display whole or half hours cleanly
    return Number.isInteger(h) ? h + ' hrs' : h.toFixed(1) + ' hrs';
  }

  function levelLabel(type) {
    return { elementary: 'Elementary', middle: 'Middle School', high: 'High School' }[type];
  }


  // ── Render ─────────────────────────────────────

  function render() {
    const s = STEPPERS;
    const sessions        = s.sessions.value;
    const hoursPerSession = s.hoursPerSession.value;
    const weeks           = s.weeks.value;

    const totalHours   = getTotalHours(sessions, hoursPerSession, weeks);
    const { hourlyRate, totalPrice } = getPackagePrice(currentType, totalHours);

    // Crossed-out price: what you'd pay at the baseline 6-hr rate for the same total hours
    const baseRate      = PRICING[currentType].rateAt6;
    const originalPrice = Math.round(baseRate * totalHours);
    const saving        = originalPrice - totalPrice;

    // Summary header
    document.getElementById('summary-level').textContent = levelLabel(currentType);
    document.getElementById('summary-schedule').textContent =
      sessions + ' session' + (sessions > 1 ? 's' : '') +
      ' · ' + hoursPerSession + ' hr' + (hoursPerSession > 1 ? 's' : '') +
      ' · ' + weeks + ' wk' + (weeks > 1 ? 's' : '');

    // Rows
    document.getElementById('summary-total-hours').textContent = fmtHours(totalHours);
    document.getElementById('summary-rate').textContent        = fmtRate(hourlyRate);

    // Price block
    const origEl   = document.getElementById('summary-original');
    const savingEl = document.getElementById('summary-saving');

    if (saving > 0) {
      origEl.textContent   = fmt(originalPrice);
      savingEl.textContent = 'You save ' + fmt(saving);
    } else {
      origEl.textContent   = '';
      savingEl.textContent = '';
    }

    document.getElementById('summary-total').textContent = fmt(totalPrice);

    // Update stepper button disabled states
    document.querySelectorAll('.stepper-btn').forEach(function (btn) {
      const target = btn.dataset.target;
      const dir    = parseInt(btn.dataset.dir, 10);
      const cfg    = STEPPERS[target];
      if (!cfg) return;
      btn.disabled = dir === -1
        ? cfg.value <= cfg.min
        : cfg.value >= cfg.max;
    });

    // Update stepper display values
    Object.keys(STEPPERS).forEach(function (key) {
      const el = document.getElementById(key + '-val');
      if (el) el.textContent = STEPPERS[key].value;
    });
  }


  // ── Event Wiring ───────────────────────────────

  // Student type buttons
  const typeGrid = document.getElementById('calc-type-grid');
  if (typeGrid) {
    typeGrid.addEventListener('click', function (e) {
      const btn = e.target.closest('.calc-type-btn');
      if (!btn) return;
      currentType = btn.dataset.type;
      typeGrid.querySelectorAll('.calc-type-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      render();
    });
  }

  // Stepper buttons
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.stepper-btn');
    if (!btn) return;
    const target = btn.dataset.target;
    const dir    = parseInt(btn.dataset.dir, 10);
    const cfg    = STEPPERS[target];
    if (!cfg) return;

    const next = Math.round((cfg.value + dir * cfg.step) * 10) / 10; // avoid float drift
    if (next < cfg.min || next > cfg.max) return;
    cfg.value = next;
    render();
  });

  // Initial render
  if (document.getElementById('calc-summary')) {
    render();
  }

})();


/* --- Mobile Nav: hamburger toggle --- */
(function () {
  const hamburger = document.getElementById('nav-hamburger');
  const navLinks  = document.getElementById('nav-links');
  if (!hamburger || !navLinks) return;

  hamburger.addEventListener('click', function () {
    const isOpen = navLinks.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close on any nav link click
  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      navLinks.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (!nav.contains(e.target)) {
      navLinks.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });
})();


