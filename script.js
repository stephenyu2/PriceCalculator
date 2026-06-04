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


/* --- Testimonial Card Intro Sequence --- */
(function () {
  var items = Array.prototype.slice.call(document.querySelectorAll('.proof-item'));
  if (!items.length) return;

  items.forEach(function (item) { item.classList.add('card-hidden'); });

  var triggered = false;
  var track = document.querySelector('.proof-track') || items[0];

  var observer = new IntersectionObserver(function (entries) {
    if (triggered || !entries[0].isIntersecting) return;
    triggered = true;
    observer.disconnect();
    runIntroSequence();
  }, { threshold: 0.15 });

  observer.observe(track);

  function runIntroSequence() {
    var stage = document.getElementById('proof-intro-stage');
    var firstThree = items.slice(0, 3);
    var section = stage.parentElement;
    var vpW = section.offsetWidth;
    var vpH = section.offsetHeight;
    var cardW = Math.min(400, Math.max(240, vpW * 0.4));
    var cardH = cardW * (4 / 3);
    var cx = vpW / 2 - cardW / 2;
    var cy = vpH / 2 - cardH / 2;
    var INTERVAL = 650;

    var stageCards = firstThree.map(function (item, i) {
      var front = item.querySelector('.proof-front');
      var card = document.createElement('div');
      card.className = 'stage-card';
      card.innerHTML = front.innerHTML;
      card.style.width = cardW + 'px';
      card.style.height = cardH + 'px';
      card.style.zIndex = (i + 1).toString();
      card.style.transform = 'translate(' + cx + 'px, ' + cy + 'px) scale(0.85)';
      card.style.opacity = '0';
      stage.appendChild(card);
      return card;
    });

    stage.style.display = 'block';

    // Pop each card in sequentially — all centered, stacking on top of each other
    stageCards.forEach(function (card, i) {
      setTimeout(function () {
        requestAnimationFrame(function () {
          card.style.transform = 'translate(' + cx + 'px, ' + cy + 'px) scale(1)';
          card.style.opacity = '1';
        });
      }, i * INTERVAL);
    });

    // After last card has settled, fly them all to their grid spots
    setTimeout(function () {
      collapseToGrid(firstThree, stageCards, stage, cardW, cardH);
    }, (firstThree.length - 1) * INTERVAL + 700);
  }

  function collapseToGrid(firstThree, stageCards, stage, cardW, cardH) {
    // Measure natural (untransformed) grid positions
    firstThree.forEach(function (item) {
      item.style.opacity = '0';
      item.classList.remove('card-hidden');
    });
    var targets = firstThree.map(function (item) {
      return item.getBoundingClientRect();
    });
    firstThree.forEach(function (item) {
      item.classList.add('card-hidden');
      item.style.opacity = '';
    });

    // Fly each stage card from center to its grid cell, shrinking as it lands
    var stageRect = stage.getBoundingClientRect();
    stageCards.forEach(function (card, i) {
      var t = targets[i];
      var scale = t.width / cardW;
      var tx = cardW / 2 + (t.left - stageRect.left - cardW / 2) / scale;
      var ty = cardH / 2 + (t.top - stageRect.top - cardH / 2) / scale;

      card.classList.add('flying');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          card.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')';
          card.style.opacity = '0';
        });
      });
    });

    // Once stage cards have landed, swap in the real grid
    setTimeout(function () {
      stage.style.display = 'none';
      while (stage.firstChild) { stage.removeChild(stage.firstChild); }

      // First 3 appear instantly (seamless handoff from where stage cards landed)
      firstThree.forEach(function (item) {
        item.classList.remove('card-hidden');
      });

      // Remaining 5 shuffle in
      items.slice(3).forEach(function (item, i) {
        item.style.setProperty('--reveal-delay', (i * 65) + 'ms');
        item.classList.remove('card-hidden');
        item.classList.add('card-shuffling');
      });
    }, 850);
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
