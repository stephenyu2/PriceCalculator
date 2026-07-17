/* ============================================
   LVT TUTOR PORTAL: shared behavior
   - Netlify AJAX form submit (posts to "/" so the
     submission never passes through the /tutors/*
     basic-auth edge function), then redirects
   - Agreement signature-must-match-name check
   - Date inputs defaulting to today
   - Module quizzes: per-question feedback, complete
     button gating, localStorage completion flags
   - Training index checkmarks
   - Training completion page gate
   - URL-param reveals (?signed=1, ?incident=1)

   localStorage keys: lvt_module_01 .. lvt_module_07
   Values: the module version string, e.g. "v1".
   Cosmetic only. The legal record is the Netlify
   form submission.
============================================ */

(function () {
  'use strict';

  var MODULES = {
    '01': { version: 'v3', title: 'Child Safety and Boundaries', path: '/tutors/training/01-child-safety/' },
    '02': { version: 'v1', title: 'Mandated Reporting', path: '/tutors/training/02-mandated-reporting/' },
    '03': { version: 'v2', title: 'Emergencies and Incidents', path: '/tutors/training/03-emergencies/' },
    '04': { version: 'v1', title: 'Session Conduct and Accuracy', path: '/tutors/training/04-session-conduct/' },
    '05': { version: 'v1', title: 'Records and Payment Integrity', path: '/tutors/training/05-records-and-payment/' },
    '06': { version: 'v1', title: 'Confidentiality and Student Data', path: '/tutors/training/06-confidentiality/' },
    '07': { version: 'v1', title: 'Respectful Conduct', path: '/tutors/training/07-respectful-conduct/' }
  };

  function flagKey(id) {
    return 'lvt_module_' + id;
  }

  function isComplete(id) {
    try {
      return localStorage.getItem(flagKey(id)) === MODULES[id].version;
    } catch (err) {
      return false;
    }
  }

  /* --- Date inputs default to today --- */
  document.querySelectorAll('input[type="date"][data-default-today]').forEach(function (el) {
    if (el.value) return;
    var d = new Date();
    el.value = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  });

  /* --- Netlify AJAX forms --- */
  function encode(data) {
    return Object.keys(data).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
    }).join('&');
  }

  document.querySelectorAll('form[data-portal-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Signature must match full legal name (case-insensitive, trimmed)
      var sig = form.querySelector('[name="signature"]');
      var name = form.querySelector('[name="full-name"]');
      var error = form.querySelector('.form-error');
      if (sig && name &&
          sig.value.trim().toLowerCase() !== name.value.trim().toLowerCase()) {
        if (error) {
          error.hidden = false;
          error.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      if (error) error.hidden = true;

      var data = { 'form-name': form.getAttribute('name') };
      new FormData(form).forEach(function (val, key) { data[key] = val; });

      var btn = form.querySelector('[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Submitting…';
      }

      function done() {
        window.location.href = form.getAttribute('data-redirect') || '/tutors/done/';
      }

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encode(data)
      }).then(done).catch(done);
    });
  });

  /* --- Module quiz --- */
  document.querySelectorAll('[data-module-quiz]').forEach(function (quiz) {
    var moduleId = quiz.getAttribute('data-module');
    var version = quiz.getAttribute('data-version');
    var questions = Array.prototype.slice.call(quiz.querySelectorAll('.quiz-q'));
    var completeBtn = quiz.querySelector('[data-complete-btn]');
    var doneBlock = quiz.querySelector('[data-module-done]');

    function allCorrect() {
      return questions.every(function (q) {
        var checked = q.querySelector('input:checked');
        return checked && checked.hasAttribute('data-correct');
      });
    }

    quiz.addEventListener('change', function (e) {
      if (e.target.type !== 'radio') return;
      var q = e.target.closest('.quiz-q');
      var feedback = q.querySelector('.quiz-feedback');
      if (feedback) {
        feedback.hidden = false;
        if (e.target.hasAttribute('data-correct')) {
          feedback.textContent = '✓ Correct.';
          feedback.className = 'quiz-feedback is-right';
        } else {
          feedback.textContent = '✗ ' + (q.getAttribute('data-explain') || 'Not quite. Reread the section above and try again.');
          feedback.className = 'quiz-feedback is-wrong';
        }
      }
      if (completeBtn) completeBtn.disabled = !allCorrect();
    });

    function showDone() {
      if (completeBtn) completeBtn.closest('.quiz-actions').hidden = true;
      if (doneBlock) doneBlock.hidden = false;
    }

    if (completeBtn) {
      completeBtn.addEventListener('click', function () {
        if (!allCorrect()) return;
        try {
          localStorage.setItem(flagKey(moduleId), version);
        } catch (err) { /* private browsing: checkmarks are cosmetic anyway */ }
        showDone();
        doneBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    if (isComplete(moduleId)) showDone();
  });

  /* --- Training index checkmarks --- */
  document.querySelectorAll('[data-module-status]').forEach(function (el) {
    var id = el.getAttribute('data-module-status');
    if (isComplete(id)) {
      el.textContent = '✓ Complete';
      el.classList.add('is-done');
    } else {
      el.textContent = 'Not started';
    }
  });

  /* --- Training completion gate --- */
  var gate = document.querySelector('[data-training-gate]');
  if (gate) {
    var formWrap = document.querySelector('[data-training-form]');
    var remaining = Object.keys(MODULES).filter(function (id) { return !isComplete(id); });

    if (remaining.length === 0) {
      gate.hidden = true;
      if (formWrap) formWrap.hidden = false;
    } else {
      gate.hidden = false;
      if (formWrap) formWrap.hidden = true;
      var list = gate.querySelector('[data-remaining-list]');
      if (list) {
        remaining.forEach(function (id) {
          var li = document.createElement('li');
          var a = document.createElement('a');
          a.href = MODULES[id].path;
          a.textContent = 'Module ' + String(parseInt(id, 10)) + ': ' + MODULES[id].title;
          li.appendChild(a);
          list.appendChild(li);
        });
      }
    }
  }

  /* --- Background check acknowledgment ---
     UX only, no form: the authoritative record is Checkr's
     dashboard. The button's real job is making the Checkr
     email legitimate before it lands. */
  var BGCHECK_KEY = 'lvt_bgcheck_ack';

  function bgcheckDone() {
    try {
      return localStorage.getItem(BGCHECK_KEY) === 'v1';
    } catch (err) {
      return false;
    }
  }

  var ackBtn = document.querySelector('[data-bgcheck-ack]');
  if (ackBtn) {
    var ackWrap = document.querySelector('[data-bgcheck-wrap]');
    var ackDone = document.querySelector('[data-bgcheck-done]');

    function showBgcheckDone() {
      if (ackWrap) ackWrap.hidden = true;
      if (ackDone) ackDone.hidden = false;
    }

    ackBtn.addEventListener('click', function () {
      try {
        localStorage.setItem(BGCHECK_KEY, 'v1');
      } catch (err) { /* cosmetic only */ }
      showBgcheckDone();
    });

    if (bgcheckDone()) showBgcheckDone();
  }

  document.querySelectorAll('[data-bgcheck-status]').forEach(function (el) {
    if (bgcheckDone()) {
      el.textContent = '✓ Done';
      el.classList.add('is-done');
    }
  });

  /* --- URL-param reveals --- */
  var params = new URLSearchParams(window.location.search);
  document.querySelectorAll('[data-show-if-param]').forEach(function (el) {
    el.hidden = !params.get(el.getAttribute('data-show-if-param'));
  });
  document.querySelectorAll('[data-hide-if-param]').forEach(function (el) {
    el.hidden = !!params.get(el.getAttribute('data-hide-if-param'));
  });
})();
