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


/* --- Value Circles: tap to toggle popup on touch devices --- */
(function () {
  document.querySelectorAll('.value-circle').forEach(function (circle) {
    circle.addEventListener('click', function (e) {
      const isActive = circle.classList.contains('active');
      // Close all others
      document.querySelectorAll('.value-circle').forEach(function (c) {
        c.classList.remove('active');
      });
      if (!isActive) circle.classList.add('active');
      e.stopPropagation();
    });
  });

  // Tap outside closes all
  document.addEventListener('click', function () {
    document.querySelectorAll('.value-circle').forEach(function (c) {
      c.classList.remove('active');
    });
  });
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


