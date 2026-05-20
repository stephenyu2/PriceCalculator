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
