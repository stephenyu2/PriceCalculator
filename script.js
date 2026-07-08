/* ============================================
   LAUNCH VALLEY TUTORING — script.js
   ============================================ */

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



/* --- Value Panels: sticky active state --- */
(function () {
  const panels = document.querySelectorAll('.vp-panel');
  if (!panels.length) return;

  function setActive(panel) {
    panels.forEach(p => p.classList.remove('active'));
    panel.classList.add('active');
  }

  // Default: Expert Teachers
  setActive(panels[0]);

  panels.forEach(panel => {
    panel.addEventListener('mouseenter', () => setActive(panel));
  });
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
  }

  hamburger.addEventListener('click', function () {
    const isOpen = navMenu.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
  });

  // Close on any nav link click
  navMenu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  // Close on outside click or touch outside nav
  document.addEventListener('click', function (e) {
    if (nav && !nav.contains(e.target)) closeMenu();
  });
  document.addEventListener('touchstart', function (e) {
    if (nav && !nav.contains(e.target)) closeMenu();
  }, { passive: true });
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


/* --- Testimonial Auto-Flip Intro --- */
/* Cards render normally; the first time they scroll into view they all flip
   to their review side (directions cycling left/right/top/bottom), hold a
   moment, then flip back to the photo side. */
(function () {
  var items = Array.prototype.slice.call(document.querySelectorAll('.proof-item'));
  if (!items.length) return;

  // left, right, top, bottom
  var DIRECTIONS = ['rotateY(-180deg)', 'rotateY(180deg)', 'rotateX(180deg)', 'rotateX(-180deg)'];
  var FLIP_MS = 600;     // matches the .proof-inner transition
  var HOLD_MS = 1100;    // how long the backs stay showing
  var STAGGER_MS = 120;  // delay between one card starting and the next

  var track = document.querySelector('.proof-track') || items[0];
  var triggered = false;

  var observer = new IntersectionObserver(function (entries) {
    if (triggered || !entries[0].isIntersecting) return;
    triggered = true;
    observer.disconnect();
    runFlipSequence();
  }, { threshold: 0.25 });

  observer.observe(track);

  function runFlipSequence() {
    // Flip out one card at a time: left, right, top, bottom, left, ...
    items.forEach(function (item, i) {
      var dir = DIRECTIONS[i % DIRECTIONS.length];
      item.style.setProperty('--autoflip', dir);
      // Vertical flips need the back face pre-rotated on the X axis instead
      // of Y, or the review text lands upside down.
      if (dir.indexOf('rotateX') === 0) item.classList.add('autoflip-x');
      setTimeout(function () { item.classList.add('autoflip'); }, i * STAGGER_MS);
    });

    // Flip back in the same order with the same stagger, after the last
    // card has flipped out and held for a moment.
    var backStart = (items.length - 1) * STAGGER_MS + FLIP_MS + HOLD_MS;
    items.forEach(function (item, i) {
      setTimeout(function () {
        item.classList.remove('autoflip');
      }, backStart + i * STAGGER_MS);
      // Only clear the back-face override after this card's return finishes
      setTimeout(function () {
        item.classList.remove('autoflip-x');
        item.style.removeProperty('--autoflip');
      }, backStart + i * STAGGER_MS + FLIP_MS + 100);
    });
  }
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
    if (form.dataset.popup) return;
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


/* --- Email Flyout + Exit Intent Popup --- */
(function () {
  var KEY_SEEN = 'lvt-popup-seen';
  if (localStorage.getItem(KEY_SEEN)) return;

  var flyout  = document.getElementById('flyout');
  var overlay = document.getElementById('popup-overlay');
  if (!flyout || !overlay) return;

  var flyoutFired  = false;
  var overlayFired = false;

  function markSeen() { localStorage.setItem(KEY_SEEN, '1'); }

  function postForm(formEl, onDone) {
    var data = { 'form-name': 'email-popup' };
    new FormData(formEl).forEach(function (val, key) { data[key] = val; });
    var body = Object.keys(data)
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]); })
      .join('&');
    fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
      .finally(onDone);
  }

  /* ---- Flyout ---- */
  function showFlyout() {
    if (flyoutFired || overlayFired || localStorage.getItem(KEY_SEEN)) return;
    flyoutFired = true;
    flyout.classList.add('active');
  }

  function closeFlyout() {
    flyout.classList.remove('active');
    markSeen();
  }

  var flyoutTimer = setTimeout(showFlyout, 20000);

  function onScroll() {
    var pct = window.scrollY / (document.body.scrollHeight - window.innerHeight);
    if (pct >= 0.8) {
      clearTimeout(flyoutTimer);
      window.removeEventListener('scroll', onScroll);
      showFlyout();
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  document.getElementById('flyout-close').addEventListener('click', closeFlyout);

  var flyoutForm = document.getElementById('flyout-form');
  if (flyoutForm) {
    flyoutForm.addEventListener('submit', function (e) {
      e.preventDefault();
      postForm(flyoutForm, function () {
        document.getElementById('flyout-body').hidden = true;
        document.getElementById('flyout-thanks').hidden = false;
        markSeen();
      });
    });
  }

  /* ---- Exit Intent Overlay ---- */
  function showOverlay() {
    if (overlayFired || localStorage.getItem(KEY_SEEN)) return;
    overlayFired = true;
    flyout.classList.remove('active');
    overlay.classList.add('active');
  }

  function closeOverlay() {
    overlay.classList.remove('active');
    markSeen();
  }

  document.addEventListener('mouseleave', function (e) {
    if (e.clientY <= 5) showOverlay();
  });

  document.getElementById('popup-close').addEventListener('click', closeOverlay);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeOverlay();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { overlayFired ? closeOverlay() : closeFlyout(); }
  });

  var overlayForm = document.getElementById('popup-form');
  if (overlayForm) {
    overlayForm.addEventListener('submit', function (e) {
      e.preventDefault();
      postForm(overlayForm, function () {
        document.getElementById('popup-body').hidden = true;
        document.getElementById('popup-thanks').hidden = false;
        markSeen();
      });
    });
  }
})();
