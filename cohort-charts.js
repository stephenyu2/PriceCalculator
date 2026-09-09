/* Shared cohort charts + data for /cohort-results and the SAT/ACT diagnostic page.
   One data array per cohort (rows = students, values = SAT scores across up to 8
   diagnostics). Every displayed stat is derived from the raw data by statsFor().
   Only Summer 2026 is real; Spring/Winter/Fall are illustrative sample data. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Points-gained threshold for the "improved" ring. */
  var GAIN_THRESHOLD = 150;

  /* Newest first, going back in time. */
  var COHORTS = [
    { label: 'Summer 2026', data: [
      [1500,1470,1550,1580],[1480,1520,1540,1550,1530,1570,1570,1540],
      [1520,1520,1580,1580,1580,1570,1560,1580],[1450,1470,1470,1450,1540,1560,1530,1560],
      [1440,1470,1520,1540,1510,1570,1570,1500],[1400,1390,1390,1400,1410,1460,1420,1460],
      [1300,1340,1470,1560,1500,1460,1440,1540],[1280,1320,1510,1550],
      [1250,1260,1390,1290,1460,1470,1470,1400],[1200,1240,1240,1380],
      [1180,1290,1370,1400,1440,1360,1350,1400],[1150,1140,1220,1300,1380,1400,1270,1300],
      [1120,1220,1170,1220,1200,1320,1320,1280],[1100,1170,1180,1260,1420,1430,1390,1290],
      [1050,1120,1170,1250,1380,1400,1360,1340],[1000,1080,1100,1200,1330],
      [980,1070,1190,1280,1190,1140,1280,1220],[950,1100,1190,1280,1220,1180,1180,1220],
      [920,950,1130,1170],[900,1030,1110,1100,1260,1090,1260,1220],
      [870,990,1030,1100,1050,1170,1070,1150],[840,980,1070,1190],
      [800,910,890,950,1010,1110,1130,970],[1440,1390,1420,1360,1410,1380,1400,1440]
    ]},
    { label: 'Spring 2026', data: [
      [910,950,1020,1050,1110,1100,1120,1180],[1020,1120,1180,1280],[1190,1200,1270,1260,1320,1370,1370,1420],
      [1130,1110,1160,1130,1150],[880,980,1100,1150,1240],[1270,1350,1350,1380,1440,1420,1500,1520],
      [1050,1100,1180,1220,1230,1290],[1200,1260,1290,1350,1400,1440,1490,1490],[1220,1250,1310,1360,1370,1440,1500,1530],
      [920,950,1010,1070,1100,1110,1200,1200],[1120,1170,1200,1250,1250,1310,1370,1380],[1090,1120,1180,1270,1320,1360],
      [1180,1230,1280,1370,1420,1450],[1130,1200,1240,1270,1320,1360,1410,1420],[980,1060,1100,1210],
      [1110,1190,1230,1240,1300,1350],[890,950,970,1040,1080,1130,1140,1190],[1250,1310,1340,1380,1380,1410,1410,1460],
      [1110,1090,1140,1130,1150,1200,1210,1190],[1080,1100,1100,1120,1100,1120,1150,1190],[940,970,1030,1030,1100,1130,1170,1170],
      [1000,1080,1080,1160,1210,1240,1290,1340],[1200,1270,1300,1330,1420,1430]
    ]},
    { label: 'Winter 2026', data: [
      [750,790,830,880,900,930,950,1000],[1010,1010,1090,1070,1080,1140,1150,1160],[1080,1050,1070,1040,1080,1060,1070,1080],
      [840,920,940,970,1000,1080,1110,1170],[760,790,790,820,860,880,880,890],[860,890,950,950,990,1010,1020,1060],
      [1050,1090,1070,1120,1080,1120,1140,1130],[1070,1070,1100,1130,1080,1120],[830,870,870,910,900,930,940],
      [970,990,1000,1080,1080,1140,1120,1110],[970,990,980,1000,980,1040],[970,1030,1050,1070,1050,1150,1140,1160],
      [960,1010,1080,1100,1120,1180,1250,1270],[1350,1360,1450,1430,1490,1580,1570,1585],[1100,1140,1170,1150,1240,1200,1220,1280],
      [1090,1140,1140,1180,1180,1240,1200,1270],[1160,1200,1190,1200,1200,1250,1270,1250],[1060,1130,1170,1190,1180,1260,1270,1290],
      [1020,1050,1090,1150,1130,1240,1230,1230],[800,830,880,900,930,960,980,1070],[1190,1200,1250,1270,1290,1280,1300,1310],
      [920,960,990,980,1050,1030,1090,1110]
    ]},
    { label: 'Fall 2025', data: [
      [1430,1450,1490,1490,1520,1520,1580,1585],[1180,1180,1250,1280,1300,1320,1370,1370],[1070,1040,1060,1030,1070,1050,1060,1070],
      [840,870,910,960,1040,1080,1090,1160],[1460,1480,1500,1500,1510,1540,1520,1560],[790,830,910,910,980,1010,1060,1060],
      [1070,1050,1120,1140,1110],[950,1010,1050,1040,1040,1080,1160,1150],[1040,1050,1060,1100,1130,1130],
      [910,940,960,990,1030,1100,1100,1110],[1440,1500,1520,1540,1540],[1140,1180,1240,1270,1250,1300,1350,1380],
      [1280,1370,1410,1510],[1270,1350,1380,1370,1470,1490,1500,1580],[1100,1150,1200,1230,1240,1280,1270],
      [1200,1280,1310,1310,1380,1400,1430,1450],[1250,1340,1390,1470,1520,1550],[860,910,910,990,990,1030,1080,1090],
      [1280,1300,1300,1320,1340,1360,1330,1400],[760,840,980,1050,1110]
    ]}
  ];

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function countUp(el, to, prefix) {
    var dur = 1900, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      el.textContent = prefix + Math.round(easeOutCubic(p) * to);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function statsFor(data) {
    var firsts = data.map(function (r) { return r[0]; });
    var bests = data.map(function (r) { return Math.max.apply(null, r); });
    function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
    var avgFirst = Math.round(mean(firsts)), avgBest = Math.round(mean(bests));
    var gained = data.filter(function (r, i) { return bests[i] - firsts[i] >= GAIN_THRESHOLD; }).length;
    var thresholds = [1200, 1300, 1400, 1500].map(function (t) {
      return {
        label: t + '+',
        first: firsts.filter(function (v) { return v >= t; }).length,
        best: bests.filter(function (v) { return v >= t; }).length
      };
    });
    return {
      n: data.length, avgFirst: avgFirst, avgBest: avgBest,
      gain: avgBest - avgFirst, pct: Math.round(gained / data.length * 100),
      thresholds: thresholds
    };
  }

  function buildThreshold(container, groups) {
    var maxBest = Math.max.apply(null, groups.map(function (g) { return g.best; }));
    var rough = maxBest + 2;
    var step = rough <= 24 ? 4 : (rough <= 48 ? 8 : 10);
    var maxY = Math.max(step, Math.ceil(rough / step) * step);
    var ticks = [];
    for (var tk = 0; tk <= maxY; tk += step) ticks.push(tk);

    var W = 720, H = 440, padL = 66, padR = 16, padT = 34, padB = 46;
    var plotW = W - padL - padR, plotH = H - padT - padB, baseY = padT + plotH;
    var groupW = plotW / groups.length, barW = 46, gap = 14;
    function y(v) { return baseY - (v / maxY) * plotH; }
    function h(v) { return (v / maxY) * plotH; }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';

    var midY = padT + plotH / 2;
    svg += '<text class="axis-title" x="18" y="' + midY + '" text-anchor="middle" transform="rotate(-90 18 ' + midY + ')">Number of students</text>';

    ticks.forEach(function (t) {
      svg += '<line class="grid-line" x1="' + padL + '" y1="' + y(t) + '" x2="' + (padL + plotW) + '" y2="' + y(t) + '"/>';
      svg += '<text class="axis-y-label" x="' + (padL - 10) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + t + '</text>';
    });

    var bi = 0;
    groups.forEach(function (g, i) {
      var center = padL + groupW * (i + 0.5);
      [['first', center - (barW + gap / 2), g.first], ['best', center + gap / 2, g.best]].forEach(function (b) {
        var cls = b[0] === 'first' ? 'bar-first' : 'bar-best';
        var x = b[1], v = b[2], delay = (bi * 0.17).toFixed(2);
        svg += '<rect class="bar-rect ' + cls + '" x="' + x + '" y="' + y(v) + '" width="' + barW + '" height="' + h(v) + '" style="transition-delay:' + delay + 's"/>';
        svg += '<text class="bar-value" x="' + (x + barW / 2) + '" y="' + (y(v) - 9) + '" text-anchor="middle" style="transition-delay:' + (parseFloat(delay) + 0.65).toFixed(2) + 's">' + v + '</text>';
        bi++;
      });
      svg += '<text class="axis-x-label" x="' + center + '" y="' + (baseY + 30) + '" text-anchor="middle">' + g.label + '</text>';
    });

    svg += '</svg>';
    container.innerHTML = svg;
  }

  function buildLines(container, data) {
    var N = 8;
    var W = 760, H = 430, padL = 48, padR = 14, padT = 18, padB = 42;
    var plotW = W - padL - padR, plotH = H - padT - padB, baseY = padT + plotH;
    var yMin = 700, yMax = 1600;
    function x(i) { return padL + plotW * (i / (N - 1)); }
    function y(s) { return baseY - (s - yMin) / (yMax - yMin) * plotH; }
    function path(row) {
      var d = '';
      for (var i = 0; i < row.length; i++) d += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(row[i]).toFixed(1) + ' ';
      return d.trim();
    }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';
    for (var t = yMin; t <= yMax; t += 100) {
      svg += '<line class="grid-line" x1="' + padL + '" y1="' + y(t) + '" x2="' + (padL + plotW) + '" y2="' + y(t) + '"/>';
      svg += '<text class="axis-y-label" x="' + (padL - 10) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + t + '</text>';
    }
    for (var i = 0; i < N; i++) {
      svg += '<text class="axis-x-label sat" x="' + x(i) + '" y="' + (baseY + 26) + '" text-anchor="middle">SAT ' + (i + 1) + '</text>';
    }

    // scale the per-line stagger down for large (combined) sets
    var stag = Math.min(0.03, 1.0 / data.length);
    data.forEach(function (row, idx) {
      svg += '<path class="spark-line" pathLength="1" d="' + path(row) + '" style="transition-delay:' + (idx * stag).toFixed(3) + 's"/>';
    });

    // class average per diagnostic (only students present at that test)
    var avg = [];
    for (var c = 0; c < N; c++) {
      var sum = 0, cnt = 0;
      for (var r = 0; r < data.length; r++) if (data[r][c] != null) { sum += data[r][c]; cnt++; }
      if (cnt) avg.push(Math.round(sum / cnt));
    }
    svg += '<path class="spark-line spark-avg" pathLength="1" d="' + path(avg) + '" style="transition-delay:0.5s"/>';

    svg += '</svg>';
    container.innerHTML = svg;
  }

  function blockHTML(c, s, hideTitle) {
    var startPos = ((s.avgFirst - 400) / 1200 * 100).toFixed(1);
    var gainW = ((s.avgBest - s.avgFirst) / 1200 * 100).toFixed(1);
    return '' +
      '<div class="cohort-block">' +
        (hideTitle ? '' : '<h3 class="diag-step-title cohort-year">' + c.label + '</h3>') +
        '<div class="cohort-charts">' +
          '<figure class="cohort-chart">' +
            '<div class="chart-legend" aria-hidden="true"><span><i class="lg-best"></i>Class average</span></div>' +
            '<div class="live-chart" data-chart="lines" role="img" aria-label="Individual SAT scores for ' + s.n + ' students across up to eight diagnostics, most trending upward."></div>' +
            '<figcaption>Individual scores across eight diagnostics</figcaption>' +
          '</figure>' +
          '<figure class="cohort-chart">' +
            '<div class="chart-legend" aria-hidden="true"><span><i class="lg-first"></i>First diagnostic</span><span><i class="lg-best"></i>Best diagnostic</span></div>' +
            '<div class="live-chart" data-chart="threshold" role="img" aria-label="Number of students reaching each SAT score threshold, first diagnostic versus best diagnostic."></div>' +
            '<figcaption>Students reaching each score threshold, first diagnostic vs best</figcaption>' +
          '</figure>' +
        '</div>' +
        '<div class="cohort-figures">' +
          '<div class="cohort-fig">' +
            '<div class="gain-headline"><span class="gain-count" data-to="' + s.gain + '" data-prefix="+">+0</span><small>points gained</small></div>' +
            '<div class="gain-track" aria-hidden="true">' +
              '<div class="gain-fill-base" style="width:' + startPos + '%;"></div>' +
              '<div class="gain-fill-gain" style="left:' + startPos + '%;" data-w="' + gainW + '"></div>' +
            '</div>' +
            '<div class="gain-ends">' +
              '<span>' + s.avgFirst + '<small>Average starting score</small></span>' +
              '<span class="gain-ends-r">' + s.avgBest + '<small>Average best score</small></span>' +
            '</div>' +
          '</div>' +
          '<div class="cohort-fig ring-card">' +
            '<div class="pct-ring"><svg viewBox="0 0 180 180" aria-hidden="true"><circle class="pct-ring-track" cx="90" cy="90" r="78"></circle><circle class="pct-ring-prog" cx="90" cy="90" r="78" pathLength="100"></circle></svg>' +
              '<div class="pct-ring-center"><span class="pct-count" data-to="' + s.pct + '">0</span><span class="pct-sign">%</span></div></div>' +
            '<span class="ring-label">improved their score by ' + GAIN_THRESHOLD + '+ points</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function runFigures(figures) {
    var gain = figures.querySelector('.gain-fill-gain');
    if (gain) gain.style.width = (gain.getAttribute('data-w') || '0') + '%';

    var prog = figures.querySelector('.pct-ring-prog');
    var pctEl = figures.querySelector('.pct-count');
    if (prog && pctEl) prog.style.strokeDashoffset = 100 - parseFloat(pctEl.getAttribute('data-to'));

    figures.querySelectorAll('[data-to]').forEach(function (el) {
      var to = parseFloat(el.getAttribute('data-to'));
      var prefix = el.getAttribute('data-prefix') || '';
      if (reduce) el.textContent = prefix + Math.round(to);
      else countUp(el, to, prefix);
    });
  }

  /* ---- Render whatever this page asked for ---- */

  // Full stacked cohort list (the /cohort-results page)
  var list = document.getElementById('cohort-list');
  if (list) {
    COHORTS.forEach(function (c) {
      var s = statsFor(c.data);
      var wrap = document.createElement('div');
      wrap.innerHTML = blockHTML(c, s);
      var block = wrap.firstElementChild;
      list.appendChild(block);
      buildLines(block.querySelector('.live-chart[data-chart="lines"]'), c.data);
      buildThreshold(block.querySelector('.live-chart[data-chart="threshold"]'), s.thresholds);
    });
  }

  // Aggregated "all cohorts combined" block (the diagnostic page Proven Results)
  var combinedEl = document.getElementById('cohort-combined');
  if (combinedEl) {
    var all = [];
    COHORTS.forEach(function (c) { all = all.concat(c.data); });
    var s = statsFor(all);
    var wrap = document.createElement('div');
    wrap.innerHTML = blockHTML({ label: '', data: all }, s, true);
    var block = wrap.firstElementChild;
    combinedEl.appendChild(block);
    buildLines(block.querySelector('.live-chart[data-chart="lines"]'), all);
    buildThreshold(block.querySelector('.live-chart[data-chart="threshold"]'), s.thresholds);
  }

  /* ---- Reveal on scroll ---- */
  var figuresAll = Array.prototype.slice.call(document.querySelectorAll('.cohort-figures'));
  var chartsAll = Array.prototype.slice.call(document.querySelectorAll('.live-chart'));

  function reveal(el) {
    if (el.classList.contains('cohort-figures')) runFigures(el);
    else el.classList.add('animate');
  }

  if (reduce) {
    figuresAll.forEach(runFigures);
    chartsAll.forEach(function (c) { c.classList.add('animate'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); }
    });
  }, { threshold: 0.3 });
  figuresAll.concat(chartsAll).forEach(function (t) { io.observe(t); });
})();
