/* ============================================================
   Launch Valley Tutoring — SAT plan pricing (single source of truth)

   This file is the ONLY place the SAT planner formula and its
   constants live. It is loaded by:
     - sat-planner.html (browser, via <script src="sat-pricing.js">)
     - the Netlify checkout function (server, via require()), so the
       charged price is always recomputed from the raw inputs and can
       never be tampered with in the browser.

   To change pricing, edit the constants below and redeploy the site.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(); // Netlify function (Node)
  } else {
    root.SatPricing = factory(); // browser
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ===================== CONSTANTS (all tunable) =====================
  var SAT_HOURLY_RATE = 125;    // base dollars per tutoring hour
  var MIN_HOURS = 10;           // minimum baseline program length
  var UPFRONT_DISCOUNT = 0.025; // additional 2.5% off for paying upfront (stacks on tier discount)

  // Marginal TUTORING hours per point, by score region (like tax brackets).
  // Rises toward 1600 because points get harder to gain near the ceiling.
  // TUTORING hours only. Proctored practice tests + homework are separate, not priced here.
  var SCORE_BANDS = [
    { from: 0,    to: 1100, hoursPerPoint: 0.10 },
    { from: 1100, to: 1250, hoursPerPoint: 0.13 },
    { from: 1250, to: 1400, hoursPerPoint: 0.18 },
    { from: 1400, to: 1500, hoursPerPoint: 0.28 },
    { from: 1500, to: 1600, hoursPerPoint: 0.45 }
  ];

  // Weakness concentration multiplier (narrower weakness = fewer hours to fix)
  var CONCENTRATION = {
    concentrated: 0.85, // just 1 or 2 specific areas
    mixed:        1.0,
    spread:       1.15  // weak across many areas
  };

  // The tiers, as multiples of the calculated baseline hours.
  // Two on purpose: Essentials (lean, no proctored tests) vs Complete (the
  // recommended full program). If a third is ever added, it should offer a
  // genuinely different deliverable, not just more hours.
  var TIERS = [
    {
      key: 'essentials',
      name: 'Essentials',
      hoursMultiplier: 0.7,  // leaner than the recommended amount
      hourlyDiscount: 0.0,   // full rate
      includesTests: false,  // NO weekly proctored tests
      mostPopular: false,
      description: 'The core tutoring hours focused on your weakest areas. A leaner plan best suited to self-motivated students who will stay consistent with practice between sessions.',
      perks: [
        'Homework between sessions'
      ] // keep 'Homework between sessions' FIRST in every tier so the rows line up across cards
    },
    {
      key: 'complete',
      name: 'Complete',
      hoursMultiplier: 1.0,  // the recommended baseline
      hourlyDiscount: 0.05,  // 5% off per hour
      includesTests: true,
      mostPopular: true,
      description: 'Our recommended program, the right amount of tutoring to reach your target. The complete package most students choose.',
      perks: [
        'Homework between sessions',
        'Weekly full-length proctored practice tests',
        '1-on-1 meeting(s) with a test prep expert on test-taking strategy and test-day anxiety'
      ]
    }
  ];

  // ===================== CALCULATION =====================
  function ceil5(x) { return Math.ceil(x / 5) * 5; }

  // Parse 'YYYY-MM-DD' as LOCAL midnight (new Date('YYYY-MM-DD') would be UTC
  // and can land on the wrong day).
  function parseISO(iso) {
    var p = String(iso).split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  // Baseline tutoring hours to reach the target (before tier multipliers)
  function baselineHours(currentTotal, targetTotal, concentration) {
    var mult = CONCENTRATION[concentration];
    if (!mult) throw new Error('Unknown concentration: ' + concentration);
    var hours = 0;
    SCORE_BANDS.forEach(function (band) {
      var seg = Math.max(0, Math.min(targetTotal, band.to) - Math.max(currentTotal, band.from));
      hours += seg * band.hoursPerPoint;
    });
    hours *= mult;
    return Math.max(MIN_HOURS, hours);
  }

  function monthsBetween(testDate, now) {
    return Math.max(1, (testDate.getFullYear() - now.getFullYear()) * 12 + (testDate.getMonth() - now.getMonth()) + 1);
  }

  // Prep starts NEXT week, so one week of runway comes off the calendar.
  function weeksUntil(testDate, now) {
    return Math.max(1, Math.floor((testDate - now) / (1000 * 60 * 60 * 24 * 7)) - 1);
  }

  // Build every tier for a student.
  // input: { currentMath, currentRW, targetTotal, concentration,
  //          testDate (Date or 'YYYY-MM-DD'), now (optional Date, defaults to today) }
  function buildTiers(input) {
    var now = input.now || new Date();
    var testDate = input.testDate instanceof Date ? input.testDate : parseISO(input.testDate);
    var currentTotal = input.currentMath + input.currentRW;
    var targetTotal = input.targetTotal;
    var gap = Math.max(0, targetTotal - currentTotal);
    var base = baselineHours(currentTotal, targetTotal, input.concentration);
    var months = monthsBetween(testDate, now);
    var weeks = weeksUntil(testDate, now);

    var tiers = TIERS.map(function (t) {
      // Pace first, then total: pick a clean half-hour weekly pace, and the
      // package is exactly that pace times the weeks available, so the two
      // numbers always multiply out consistently.
      var rawHours = base * t.hoursMultiplier;
      var hoursPerWeek = Math.max(0.5, Math.round((rawHours / weeks) * 2) / 2);
      var hours = hoursPerWeek * weeks;
      var hourlyRate = SAT_HOURLY_RATE * (1 - t.hourlyDiscount);
      var total = ceil5(hours * hourlyRate);
      var fullTotal = ceil5(hours * SAT_HOURLY_RATE); // base-rate price, shown struck through when discounted
      var upfrontPrice = ceil5(total * (1 - UPFRONT_DISCOUNT));
      var upfrontSavings = total - upfrontPrice;
      var monthlyPayment = Math.round(total / months);

      return {
        key: t.key,
        name: t.name,
        mostPopular: t.mostPopular,
        includesTests: t.includesTests,
        description: t.description,
        perks: t.perks,
        hours: hours,
        hoursPerWeek: hoursPerWeek,
        hourlyRate: hourlyRate,       // effective per-hour rate for display (e.g. 118.75)
        hourlyDiscount: t.hourlyDiscount,
        total: total,                 // full price (used for the monthly plan)
        fullTotal: fullTotal,         // undiscounted base-rate price (strikethrough anchor)
        upfrontPrice: upfrontPrice,   // price if paid upfront
        upfrontSavings: upfrontSavings,
        monthlyPayment: monthlyPayment,
        months: months
      };
    });

    return {
      currentTotal: currentTotal,
      targetTotal: targetTotal,
      gap: gap,
      baseHours: base,
      weeks: weeks,
      months: months,
      tiers: tiers
    };
  }

  return {
    SAT_HOURLY_RATE: SAT_HOURLY_RATE,
    MIN_HOURS: MIN_HOURS,
    UPFRONT_DISCOUNT: UPFRONT_DISCOUNT,
    SCORE_BANDS: SCORE_BANDS,
    CONCENTRATION: CONCENTRATION,
    TIERS: TIERS,
    parseISO: parseISO,
    baselineHours: baselineHours,
    buildTiers: buildTiers
  };
});
