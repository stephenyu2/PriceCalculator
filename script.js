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



/* --- FAQ Accordion --- */
(function () {
  document.querySelectorAll('.faq-question').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const item = btn.closest('.faq-item');
      const answer = item.querySelector('.faq-answer');
      const isOpen = item.classList.contains('open');

      // Close all items
      document.querySelectorAll('.faq-item').forEach(function (i) {
        i.classList.remove('open');
        i.querySelector('.faq-answer').style.maxHeight = '';
      });

      // Open the clicked item if it was closed
      if (!isOpen) {
        item.classList.add('open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });
})();


/* ============================================
   MONTHLY PACKAGES — TIER PRICES
============================================ */

(function () {

  var TIER_PRICES = {
    middle: { starter: 384,  scholar: 768,  elite: 1152 },
    high:   { starter: 416,  scholar: 832,  elite: 1248 },
    sat:    { starter: 484,  scholar: 968,  elite: 1452 },
  };

  function fmt(n) {
    return '$' + n.toLocaleString('en-US');
  }

  function setPrices(grade) {
    var p = TIER_PRICES[grade];
    if (!p) return;
    document.getElementById('price-starter').textContent = fmt(p.starter);
    document.getElementById('price-scholar').textContent = fmt(p.scholar);
    document.getElementById('price-elite').textContent   = fmt(p.elite);
  }

  var starterEl = document.getElementById('price-starter');
  if (!starterEl) return;

  // Default to High School
  setPrices('high');

  var gradeGrid = document.getElementById('grade-selector');
  if (!gradeGrid) return;

  gradeGrid.addEventListener('click', function (e) {
    var btn = e.target.closest('.grade-btn');
    if (!btn) return;
    gradeGrid.querySelectorAll('.grade-btn').forEach(function (b) {
      b.classList.toggle('active', b === btn);
    });
    setPrices(btn.dataset.grade);
  });

})();


/* --- Mobile Nav: hamburger toggle --- */
(function () {
  const hamburger = document.getElementById('nav-hamburger');
  const navMenu   = document.getElementById('nav-menu');
  const nav       = document.getElementById('nav');
  if (!hamburger || !navMenu) return;

  function closeMenu() {
    navMenu.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', function () {
    const isOpen = navMenu.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close on any nav link click
  navMenu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (nav && !nav.contains(e.target)) closeMenu();
  });
})();

/* --- Scroll Reveal --- */
(function () {
  var els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(function (el) { observer.observe(el); });
})();


/* --- Testimonial Card Stagger --- */
(function () {
  var items = Array.prototype.slice.call(document.querySelectorAll('.proof-item'));
  if (!items.length) return;

  // Hide all cards initially
  items.forEach(function (item) { item.classList.add('card-hidden'); });

  function getColCount() {
    return window.innerWidth <= 900 ? 2 : 4;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var item = entry.target;
      var col = items.indexOf(item) % getColCount();
      item.style.setProperty('--reveal-delay', (col * 150) + 'ms');
      item.classList.remove('card-hidden');
      observer.unobserve(item);
    });
  }, { threshold: 0.15 });

  items.forEach(function (item) { observer.observe(item); });
})();


/* --- Proof Card Flip --- */
document.querySelectorAll('.proof-item').forEach(function (item) {
  item.addEventListener('click', function () {
    item.classList.toggle('flipped');
  });
});


/* --- Netlify Form Submission --- */
(function () {
  function encode(data) {
    return Object.keys(data)
      .map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
      })
      .join('&');
  }

  document.querySelectorAll('form[data-netlify="true"]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = { 'form-name': form.getAttribute('name') };
      new FormData(form).forEach(function (val, key) { data[key] = val; });
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encode(data)
      })
        .then(function () { window.location.href = '/thank-you'; })
        .catch(function () { window.location.href = '/thank-you'; });
    });
  });
})();


