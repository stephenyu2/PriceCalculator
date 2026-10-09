/* Launch Valley Tutoring — marketing front interactions.
   Self-contained; no dependencies. Covers: mobile menu, smooth-scroll to the
   trial form, the trial form (phone format + chip toggles + Netlify submit +
   inline success), the review-rating page, and lazy Google Map embed. */
(function () {
  "use strict";

  /* ---- Mobile menu ------------------------------------------------------ */
  var toggle = document.querySelector("[data-menu-toggle]");
  var mobileNav = document.querySelector("[data-mobile-nav]");
  if (toggle && mobileNav) {
    toggle.addEventListener("click", function () {
      var open = mobileNav.hasAttribute("hidden");
      if (open) {
        mobileNav.removeAttribute("hidden");
      } else {
        mobileNav.setAttribute("hidden", "");
      }
      toggle.setAttribute("aria-expanded", String(open));
    });
    mobileNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mobileNav.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---- Smooth scroll / center the trial form ---------------------------- */
  function centerTrialForm(behavior) {
    var form = document.querySelector("#trial form, #trial .trial-form-container");
    if (!form) return;
    var header = document.querySelector(".lv-header");
    var headerBottom = header ? header.getBoundingClientRect().bottom : 0;
    var topInset = Math.max(0, headerBottom) + 12;
    var available = window.innerHeight - topInset - 12;
    var rect = form.getBoundingClientRect();
    var targetTop = rect.height <= available ? topInset + (available - rect.height) / 2 : topInset;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: window.scrollY + rect.top - targetTop, behavior: reduce ? "auto" : (behavior || "smooth") });
  }
  document.querySelectorAll('[data-scroll-trial]').forEach(function (el) {
    el.addEventListener("click", function (event) {
      var trial = document.getElementById("trial");
      if (!trial) return;
      event.preventDefault();
      centerTrialForm("smooth");
    });
  });
  if (window.location.hash === "#trial" && document.getElementById("trial")) {
    requestAnimationFrame(function () { centerTrialForm("auto"); });
  }

  /* ---- Trial form ------------------------------------------------------- */
  var trialForm = document.querySelector('form[name="trial-session"]');
  if (trialForm) {
    // Chip toggle groups backed by hidden inputs.
    trialForm.querySelectorAll("[data-chip-group]").forEach(function (group) {
      var name = group.getAttribute("data-chip-group");
      var hidden = trialForm.querySelector('input[name="' + name + '"]');
      group.querySelectorAll(".chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          group.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
          chip.setAttribute("aria-pressed", "true");
          if (hidden) hidden.value = chip.getAttribute("data-value");
        });
      });
    });

    // Phone formatting (XXX) XXX-XXXX
    var phoneInput = trialForm.querySelector('input[name="phone"]');
    var phoneError = trialForm.querySelector("[data-phone-error]");
    if (phoneInput) {
      phoneInput.addEventListener("input", function () {
        var digits = phoneInput.value.replace(/\D/g, "").slice(0, 10);
        var formatted = digits;
        if (digits.length > 6) formatted = "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
        else if (digits.length > 3) formatted = "(" + digits.slice(0, 3) + ") " + digits.slice(3);
        else if (digits.length > 0) formatted = "(" + digits;
        phoneInput.value = formatted;
        phoneInput.setAttribute("aria-invalid", "false");
        if (phoneError) phoneError.setAttribute("hidden", "");
      });
    }

    function encode(data) {
      return Object.keys(data).map(function (key) {
        return encodeURIComponent(key) + "=" + encodeURIComponent(data[key]);
      }).join("&");
    }

    trialForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var digits = phoneInput ? phoneInput.value.replace(/\D/g, "") : "";
      if (digits.length !== 10) {
        if (phoneInput) phoneInput.setAttribute("aria-invalid", "true");
        if (phoneError) phoneError.removeAttribute("hidden");
        return;
      }
      var submitBtn = trialForm.querySelector('[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }

      var data = {};
      new FormData(trialForm).forEach(function (value, key) { data[key] = value; });

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encode(data)
      }).then(function (res) {
        if (!res.ok) throw new Error("Submit failed");
        showSuccess();
      }).catch(function () {
        var errBox = trialForm.querySelector("[data-submit-error]");
        if (errBox) errBox.removeAttribute("hidden");
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Claim Free Session"; }
      });
    });

    function showSuccess() {
      var success = document.querySelector("[data-trial-success]");
      if (success) {
        trialForm.setAttribute("hidden", "");
        success.removeAttribute("hidden");
      }
    }
  }

  /* ---- Review rating page ----------------------------------------------- */
  var ratingGroup = document.querySelector("[data-rating]");
  if (ratingGroup) {
    var googleUrl = ratingGroup.getAttribute("data-google-url");
    var smsBase = ratingGroup.getAttribute("data-sms");
    var feedbackBox = document.querySelector("[data-feedback-box]");
    var feedbackText = document.querySelector("[data-feedback-text]");
    var sendBtn = document.querySelector("[data-feedback-send]");
    var chosen = 0;

    function paint(n) {
      ratingGroup.querySelectorAll(".rating-star").forEach(function (star, index) {
        if (index < n) star.classList.add("on"); else star.classList.remove("on");
      });
    }
    ratingGroup.querySelectorAll(".rating-star").forEach(function (star, index) {
      var value = index + 1;
      star.addEventListener("mouseenter", function () { paint(value); });
      star.addEventListener("mouseleave", function () { paint(chosen); });
      star.addEventListener("click", function () {
        chosen = value;
        paint(value);
        if (value >= 4) {
          window.location.assign(googleUrl);
        } else if (feedbackBox) {
          feedbackBox.removeAttribute("hidden");
        }
      });
    });
    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        var text = (feedbackText && feedbackText.value.trim()) || "";
        if (!text) return;
        var msg = "Private feedback for Launch Valley Tutoring (" + chosen + " star" + (chosen === 1 ? "" : "s") + "): " + text;
        window.location.href = smsBase + encodeURIComponent(msg);
      });
    }
  }

  /* ---- Lazy Google Map -------------------------------------------------- */
  var mapHolder = document.querySelector("[data-map]");
  if (mapHolder) {
    var mapSrc = mapHolder.getAttribute("data-map");
    function loadMap() {
      var iframe = document.createElement("iframe");
      iframe.title = "Launch Valley Tutoring location map";
      iframe.src = mapSrc;
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      mapHolder.innerHTML = "";
      mapHolder.appendChild(iframe);
    }
    if (!("IntersectionObserver" in window)) {
      loadMap();
    } else {
      var observer = new IntersectionObserver(function (entries) {
        if (entries[0] && entries[0].isIntersecting) { loadMap(); observer.disconnect(); }
      }, { rootMargin: "120px 0px" });
      observer.observe(mapHolder);
    }
  }
})();
