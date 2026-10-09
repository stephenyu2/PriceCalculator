/* Renders the reviews and tutors marquees on the landing page.
   Each list is rendered twice so the CSS translateX(-50%) loop is seamless. */
(function () {
  "use strict";

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>';
  var GOOGLE = '<svg class="google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--google-blue)" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="var(--google-green)" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="var(--google-yellow)" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.55l3.35-2.62Z"/><path fill="var(--google-red)" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>';
  var CAP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>';
  var FIVE_STARS = STAR + STAR + STAR + STAR + STAR;

  function reviewCard(r, hidden) {
    return '<figure class="review-card"' + (hidden ? ' aria-hidden="true"' : "") + '>' +
      '<div class="stars" aria-label="Five star review">' + FIVE_STARS + "</div>" +
      '<blockquote>“' + esc(r.quote) + '”</blockquote>' +
      '<figcaption class="review-foot">' +
        '<span class="review-avatar">' + esc(r.name.charAt(0)) + "</span>" +
        "<div><p class=\"name\">" + esc(r.name) + '</p><p class="role">' + esc(r.role) + "</p></div>" +
      "</figcaption>" + GOOGLE + "</figure>";
  }

  function tutorCard(t, hidden) {
    var media = t.photo
      ? '<div class="photo"><img src="' + esc(t.photo) + '" alt="' + esc(t.name) + ", " + esc(t.role) + ' tutor at Launch Valley Tutoring" loading="lazy" width="800" height="1000"></div>'
      : '<div class="photo-fallback"><span>' + CAP + "</span></div>";
    return '<article class="tutor-card"' + (hidden ? ' aria-hidden="true"' : "") + ">" + media +
      '<div class="body"><h3>' + esc(t.name) + '</h3><p class="role">' + esc(t.role) + '</p><p class="bio">' + esc(t.bio) + "</p></div></article>";
  }

  var reviewTrack = document.querySelector("[data-review-track]");
  if (reviewTrack && window.__LVT_REVIEWS) {
    var rHtml = "";
    window.__LVT_REVIEWS.forEach(function (r) { rHtml += reviewCard(r, false); });
    window.__LVT_REVIEWS.forEach(function (r) { rHtml += reviewCard(r, true); });
    reviewTrack.innerHTML = rHtml;
  }

  var tutorTrack = document.querySelector("[data-tutor-track]");
  if (tutorTrack && window.__LVT_TUTORS) {
    var tHtml = "";
    window.__LVT_TUTORS.forEach(function (t) { tHtml += tutorCard(t, false); });
    window.__LVT_TUTORS.forEach(function (t) { tHtml += tutorCard(t, true); });
    tutorTrack.innerHTML = tHtml;
  }
})();
