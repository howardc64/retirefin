'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHART ELEMENT INFO — the "Chart Tooltip" menu's Components mode (header).
// In Components mode, hovering a chart shows a popup that DESCRIBES the chart element under the cursor (a stacked band, a dashed
// line, a Social Security claiming-age line…) instead of the usual per-year values. The usual popup (chartHelpers.js
// externalTooltip) does nothing while this is on; this file draws into the same floating #extTooltip <div>, so it follows
// the fixed popup colours (tipTheme(), chartHelpers.js). The explanatory text is trimmed to its brief form (key numbers + first sentence).
// Read-only: only reads chart/dataset objects and `lastProjection`; never writes into `state`.
// ═══════════════════════════════════════════════════════════════
let chartInfo = true; // Chart Tooltip = Components (default); the header menu (index.html) starts on it. None: chartInfo and showDetails off, chartTipOff on. Complete: the usual value popups with the line-by-line details.

// An alert strip above a chart (expense / asset): one red line; its details live in the Chart Element popup (or the browser tooltip when that box is off).
function setAlertDetail(el, name, value, text) {
  el.dataset.name = name;
  el.dataset.value = value || '';
  el.dataset.detail = text;
  el.title = chartInfo || chartTipOff ? '' : text;
}
// The header's Chart Tooltip menu: 'none' | 'components' (describes the element under the cursor) | 'complete' (the usual per-year values, with the line-by-line details).
function setChartTip(mode) {
  chartInfo = mode === 'components';
  chartTipOff = mode === 'none';
  showDetails = mode === 'complete';
  document.querySelectorAll('.unfunded-alert[data-detail]').forEach(a => {
    a.title = chartInfo || chartTipOff ? '' : a.dataset.detail;
  });
  const el = document.getElementById('extTooltip');
  if (el) {
    el.style.opacity = 0;
    el._shown = false;
  }
}

// ── What each element means ──────────────────────────────────────────────────────────────────────────────────────────
// The text lives with the line it describes: every chart file gives upsertLineChart an `info(dataset)` resolver (or sets `ds.info` itself), and the text is stamped on the
// dataset as `ds.info` (see upsertLineChart in chartHelpers.js). A dataset without `info` has no description and the popup stays hidden over it.
function ciDescribe(key, ds, kidx) {
  return typeof ds.info === 'string' && ds.info ? ds.info : null;
}

// Name of the whole stack on each stacked chart (shown when the pointer is at the top of the stack: ciElementAt).
const CI_TOTAL_NAME = {
  expense: 'Total annual expenses',
  income: 'Total income',
  incomeMagi: 'Total MAGI',
  incomeOrd: 'Total taxable ordinary income',
  incomeQual: 'Total taxable qualified income',
  tax: 'Total income tax',
  taxOrd: 'Total ordinary income tax',
  taxQual: 'Total QDIV / LTCG / NIIT tax',
  asset: 'Total asset value',
  idgt: 'Total IDGT value',
  ira: 'Total out of IRAs',
  ltcg: 'Total realized LTCG',
  inhIncome: 'Total inheritance asset income'
};

// ── Which element is under the cursor ─────────────────────────────────────────────────────────────────────────────────
// Index-mode charts cannot say which band the pointer is on, so it is found from the pointer's height: a dashed/solid line
// within a few pixels wins; otherwise the stacked band whose top is the first one above the pointer (counting up from the axis).
function ciSegDist(px, py, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
// A pointer slightly ABOVE the top edge of a stack (up to CI_TOP_PX canvas pixels) reports the whole stack's total. Only above: a pointer on or below the edge belongs to the top band, so a thin band at the top of the stack can still be pointed at.
const CI_TOP_PX = 12;
function ciElementAt(chart, e, key) {
  const els = chart.getElementsAtEventForMode(e, 'index', {intersect: false}, false);
  if (!els || !els.length) return null;
  const idx = els[0].index;
  const rect = chart.canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (chart.width / rect.width),
    py = (e.clientY - rect.top) * (chart.height / rect.height);
  const ok = (pt, ds, i) => pt && !pt.skip && ds.data[i] != null && Number.isFinite(pt.x) && Number.isFinite(pt.y);
  let line = null,
    lineD = 1e9;
  const bands = [];
  chart.data.datasets.forEach((ds, di) => {
    const meta = chart.getDatasetMeta(di);
    if (ds.irmaaOff || !meta || meta.hidden || (chart.isDatasetVisible && !chart.isDatasetVisible(di))) return;
    const pts = meta.data;
    if (ds.fill) {
      // Height of the band's top edge at the pointer's x, interpolated between the two neighbouring years (steep edges).
      let i0 = pts[idx] && pts[idx].x > px ? idx - 1 : idx;
      if (i0 < 0) i0 = 0;
      const A = pts[i0],
        B = pts[i0 + 1];
      let y = null;
      if (ok(A, ds, i0) && ok(B, ds, i0 + 1) && B.x > A.x) y = A.y + (B.y - A.y) * Math.max(0, Math.min(1, (px - A.x) / (B.x - A.x)));
      else if (ok(pts[idx], ds, idx)) y = pts[idx].y;
      if (y != null) bands.push({di, ds, y});
      return;
    }
    // Lines: true distance from the pointer to the segments around this year, so a near-vertical stretch is hit anywhere along it.
    for (let i = Math.max(0, idx - 2); i <= Math.min(pts.length - 2, idx + 1); i++) {
      const A = pts[i],
        B = pts[i + 1];
      if (!ok(A, ds, i) || !ok(B, ds, i + 1)) continue;
      const d = ciSegDist(px, py, A, B);
      if (d < lineD) {
        lineD = d;
        line = {di, ds};
      }
    }
    if (ok(pts[idx], ds, idx) && lineD >= 1e9) {
      const d = Math.hypot(px - pts[idx].x, py - pts[idx].y);
      if (d < lineD) {
        lineD = d;
        line = {di, ds};
      }
    }
  });
  if (line && lineD <= 9) return {...line, idx};
  if (CI_TOTAL_NAME[key] && bands.length) {
    const top = bands.reduce((m, b) => (b.y < m.y ? b : m), bands[0]); // the band whose top edge is highest on screen = the top of the stack
    // A dataset marked `stackAdd` (the Total Income Tax chart's state-tax line, drawn above the federal stack) belongs to the total: the zone above the stack reaches up to that line, and its amount (ds.stackAdd[idx]) is added.
    let addDs = null,
      addY = null;
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (!Array.isArray(ds.stackAdd) || !meta || meta.hidden || (chart.isDatasetVisible && !chart.isDatasetVisible(di))) return;
      const pt = meta.data[idx];
      if (ok(pt, ds, idx) && ds.stackAdd[idx] > 0) {
        addDs = ds;
        addY = pt.y;
      }
    });
    if (py < top.y - 0.5 && py >= (addY != null ? Math.min(addY, top.y) : top.y) - CI_TOP_PX) {
      let total = 0,
        any = false; // the stack's height at this year = the sum of the filled bands in the top band's stack group (lines such as the cost basis or the foreign tax credit are not part of it)
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (!ds.fill || ds.stack !== top.ds.stack || !meta || meta.hidden || (chart.isDatasetVisible && !chart.isDatasetVisible(di)))
          return;
        const v = ds.data[idx];
        if (typeof v === 'number' && Number.isFinite(v)) {
          total += v;
          any = true;
        }
      });
      if (addDs) {
        total += addDs.stackAdd[idx];
        any = true;
      }
      if (any && total >= 0.5) return {stackTotal: total, withState: !!addDs, ds: top.ds, di: top.di, idx};
    }
  }
  bands.sort((a, b) => b.y - a.y || a.di - b.di); // lowest band on screen first
  for (const b of bands) {
    if (b.y <= py + 0.5) return {di: b.di, ds: b.ds, idx};
  }
  return null;
}

// ── Overlay-drawn elements (not datasets): LTC bar, IRMAA tier lines, IRA stretch bar ─────────────────────────────────
function ciOverlayAt(key, chart, e, datasetHit) {
  const rect = chart.canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (chart.width / rect.width),
    py = (e.clientY - rect.top) * (chart.height / rect.height);
  const area = chart.chartArea,
    xs = chart.scales && chart.scales.x,
    ys = chart.scales && chart.scales.y;
  if (!area || !xs || !ys || px < area.left || px > area.right) return null;
  const n = (chart.data.labels || []).length;
  if (!n) return null;
  const idx = Math.max(0, Math.min(n - 1, Math.round(xs.getValueForPixel(px))));
  // Inheritance arrival ▲: just below the x-axis line (overlayPlugin.js inhArrivalPlugin).
  if (py > area.bottom && py <= area.bottom + INH_ARROW_GAP + INH_ARROW_H + 4 && chart._inhArrows) {
    const t = chart._inhArrows.find(t => Math.abs(px - t.px) <= INH_ARROW_H * 0.9);
    if (t)
      return {
        name: 'Inheritance arrives',
        brief: t.a.files.length ? 'From ' + t.a.files.join(', ') + '.' : '',
        color: INH_ARROW_COLOR,
        value: mrow('Arrives at age ' + t.a.age + ':', fmt(t.a.value)),
        text:
          (t.a.files.length ? 'From ' + t.a.files.join(', ') + '. ' : '') +
          "The asset(s) inherited this year (value in today's $, shown here) join the scenario from this year on: portfolios earn growth and dividends, a pre-tax IRA starts its 10-year payout clock, a property can be sold. Before this age they are not in the scenario."
      };
  }
  // Long Term Care bar: sits in the padding above the plot area of every time-based chart.
  if (py < area.top && py >= area.top - LTC_PAD) {
    const so = stretchBarOpts(chart);
    if (so && idx >= so.fromIdx && (so.toIdx == null || idx <= so.toIdx)) return ciStretchInfo();
  }
  if (py < area.top && py >= area.top - LTC_PAD && typeof ltcCounts === 'function') {
    const c = ltcCounts(chart.data.labels);
    if (c && c[idx] > 0) {
      const who = (c.who && c.who[idx]) || [],
        young = !!c.youngerIdx && who.length === 1 && who[0] === c.youngerIdx;
      return {
        name: 'Long Term Care period',
        color: c[idx] >= 2 ? LTC_C_BOTH : young ? LTC_C_YOUNG : LTC_C_OLD,
        owner: ciLtcStartText(who, chart.data.labels[idx]),
        text:
          (c[idx] >= 2
            ? 'Dark blue: both people are on Long Term Care this year. '
            : young
              ? 'Light blue: the younger person is on Long Term Care this year. '
              : 'Grey: the older person (or the only person) is on Long Term Care this year. ') +
          'The bar spans every year anyone is on LTC, from the LTC start age set in the LTC panel until that person passes; dark blue marks years when two people overlap. In these years the LTC cost is an expense, living expenses drop to the amount set for after LTC starts, and the LTC cost can be itemized above 7.5% of AGI.'
      };
    }
    return null;
  }
  if (py < area.top || py > area.bottom) return null;
  const pl = ciPassingAt(chart, px);
  if (pl) return pl;
  // IRMAA tier lines on the MAGI chart (drawn by the 'magiOverlay' plugin).
  if (key === 'incomeMagi') {
    const o = chart.options.plugins && chart.options.plugins.magiOverlay;
    if (o && typeof o === 'object') {
      const inWin = (o.fromIdx == null || idx >= o.fromIdx) && (o.toIdx == null || idx <= o.toIdx);
      const mfj = idx < (o.switchIdx == null ? n : o.switchIdx);
      const lines = (mfj ? o.irmaaMFJ : o.irmaaSgl) || [];
      let best = null,
        bd = 1e9;
      if (inWin)
        lines.forEach(ln => {
          const d = Math.abs(py - ys.getPixelForValue(ln.magi));
          if (d < bd) {
            bd = d;
            best = ln;
          }
        });
      if (best && bd <= 7) {
        const money = v => '$' + Math.round(v).toLocaleString('en-US');
        return {
          name: 'IRMAA tier line: MAGI ' + money(best.magi) + (best.pct != null ? ' (+' + best.pct + '% Part B)' : ''),
          color: BRACKET_COLOR,
          brief: (mfj ? 'Married filing jointly' : 'Single') + ': surcharge ' + money(best.surch) + ' per person per year at or above this line.',
          text:
            'Medicare IRMAA threshold for ' +
            (mfj ? 'married filing jointly' : 'single') +
            ' filers. When MAGI is at or above this line, each person on Medicare pays a Part B + Part D surcharge of ' +
            money(best.surch) +
            ' per year (' +
            (best.label || '') +
            " tier). The surcharge is based on MAGI from two years earlier, so it shows up in the expenses two years after the stack crosses the line. Tiers shown are the ones that fit the chart's scale."
        };
      }
    }
  }
  return null;
}
function ciStretchInfo() {
  return {
    name: 'Stretch IRA',
    color: '#c0392b',
    text: 'The red bar marks the years after the household\'s last passing. Only IRAs with the "IRA stretch" box checked (and holdings that are not IDGT) carry on, compounding at their own growth rate for up to 10 more years while heirs hold them. No RMDs, withdrawals or heir taxes are modeled.'
  };
}


// ── Who / when helpers for the overlay elements ───────────────────────────────────────────────────────────────────────
function ciPersonName(proj, i) {
  return displayPersonName(proj.people[i], i);
}
// LTC bar: for each person on LTC this year, the age (their own) and calendar year care starts.
function ciLtcStartText(who, label) {
  const proj = typeof lastProjection !== 'undefined' ? lastProjection : null,
    l = typeof viewContext === 'function' ? viewContext().ltc : null;
  if (!proj || !proj.rows || !l || !l.people || !who || !who.length) return '';
  const parts = who.map(i => {
    const L = l.people[i],
      k = proj.rows.findIndex(r => r.alive && r.alive[i] && r.ages[i] >= (Number(L && L.startAge) || 0));
    const cur = proj.rows.find(r => Math.round(r.age0) === Math.round(Number(label))),
      now = cur && cur.ages ? ' is ' + Math.floor(cur.ages[i]) + ' this year' : '';
    if (k < 0) return ciPersonName(proj, i) + now;
    return ciPersonName(proj, i) + now + '; LTC starts at age ' + Math.floor(proj.rows[k].ages[i]) + ' (' + (THIS_YEAR + k) + ')';
  });
  return parts.join('; ');
}
// Passing line: who passes and when (their own age and the calendar year), when the pointer is within a few pixels of the line.
function ciPassingAt(chart, px) {
  const proj = typeof lastProjection !== 'undefined' ? lastProjection : null,
    I = proj && ageAxisInfo(proj),
    xs = chart.scales && chart.scales.x,
    labels = chart.data.labels;
  if (!I || !xs || !labels || !labels.length) return null;
  const area = chart.chartArea;
  let best = null,
    bd = 4.5;
  for (let i = 0; i < I.n; i++) {
    if (!(I.pass[i] > 0)) continue;
    const label = I.base + I.pass[i];
    let j = labels.indexOf(label);
    if (j < 0 && label > labels[labels.length - 1]) j = labels.length - 1;
    if (j < 0) continue;
    const lx = Math.min(area.right - 0.5, Math.max(area.left + 0.5, Math.round(xs.getPixelForValue(j)) + 0.5)),
      d = Math.abs(px - lx);
    if (d <= bd) {
      bd = d;
      best = i;
    }
  }
  if (best == null) return null;
  const k = I.pass[best],
    last = proj.rows[k - 1],
    age = last && last.ages ? Math.floor(last.ages[best]) + 1 : null; // the first year they are no longer alive
  const yr = THIS_YEAR + k;
  const name = ciPersonName(proj, best);
  return {
    name: 'Passing: ' + name,
    brief: '',
    color: best === I.io ? AGE_C_OLD : AGE_C_YOUNG,
    value: mrow(name + ' passes' + (age != null ? ' at age ' + age : '') + ':', String(yr)),
    text:
      'The vertical line marks the year ' +
      name +
      ' is no longer alive in the plan' +
      (proj.married ? ' (' + (best === I.io ? "the older person's line is black, the younger's dark blue" : "the younger person's line is dark blue") + ')' : '') +
      '. From this year the plan reflects the passing: their income stops or becomes survivor benefits, expenses and filing status adjust, and basis steps up at death.'
  };
}
// Faded red band: a year whose expenses no source could pay. Reports the year the money first ran out and who is living then.
function ciUnfundedAt(chart, px) {
  const proj = typeof lastProjection !== 'undefined' ? lastProjection : null,
    xs = chart.scales && chart.scales.x,
    labels = chart.data.labels;
  if (!proj || !proj.rows || !xs || !labels || !labels.length) return null;
  const idx = Math.max(0, Math.min(labels.length - 1, Math.round(xs.getValueForPixel(px))));
  const r = proj.rows.find(r => Math.round(r.age0) === Math.round(Number(labels[idx])));
  if (!r || !(r.expUnfunded > 1)) return null;
  const bad = proj.rows.filter(x => x.expUnfunded > 1),
    first = bad[0];
  const who = row =>
    proj.married ? (row.alive || []).map((al, i) => (al ? ciPersonName(proj, i) : null)).filter(Boolean).join(' & ') : '';
  const fw = who(first),
    cw = who(r);
  const firstK = proj.rows.indexOf(first);
  return {
    name: 'Money runs out',
    brief:
      (r === first ? 'First unfunded year' : 'Money first ran out ' + ciAgeText(Math.round(first.age0)) + ' (' + (THIS_YEAR + firstK) + ')') +
      '; ' +
      bad.length +
      ' unfunded year' +
      (bad.length > 1 ? 's' : '') +
      '.',
    color: '#d00000',
    value: mrow('Unfunded ' + ciAgeText(labels[idx]) + ':', fmt(r.expUnfunded) + '/yr'),
    owner: cw ? 'Living this year: ' + cw : "",
    text:
      'Expenses no source can pay this year (income, dividends, asset sales and withdrawals all fall short). Money first runs out ' +
      (r === first ? 'this year' : ciAgeText(Math.round(first.age0)) + ' (' + (THIS_YEAR + firstK) + (fw ? '; living then: ' + fw : '') + ')') +
      '; ' +
      bad.length +
      ' unfunded year' +
      (bad.length > 1 ? 's' : '') +
      ' in total.'
  };
}

function ciFirstSentence(t) {
  const m = String(t).split(/(?<=[.!?])\s+(?=[A-Z"'(])/);
  return m[0];
}

// ── Popup ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
function ciEl() {
  let el = document.getElementById('extTooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'extTooltip';
    el.style.cssText =
      'position:fixed;z-index:10000;pointer-events:none;border:1px solid;border-radius:6px;padding:6px 8px;' +
      'font:12px monospace;white-space:pre;line-height:1.35;opacity:0;';
    document.body.appendChild(el);
  }
  return el;
}
function ciHide() {
  const el = document.getElementById('extTooltip');
  if (el) {
    el.style.transition = 'opacity .12s';
    el.style.opacity = 0;
    el._shown = false;
  }
}
function ciChartOf(canvas) {
  for (const k in charts) {
    const c = charts[k];
    if (c && c.canvas === canvas) return {key: k, chart: c};
  }
  return null;
}
// "at age 86 (Peter)": the age of the OLDEST person alive that year, with their name (married scenarios). When nobody is alive (the IRA stretch years)
// it reads "3 years since Yen passed", naming whoever was the last to pass. Falls back to the axis age when the year's row is not found.
function ciRowAt(label) {
  const proj = typeof lastProjection !== 'undefined' ? lastProjection : null;
  if (!proj || !proj.rows || !proj.rows.length || label == null || label === '') return null;
  const all = proj.rows.concat(proj.stretch || []);
  const k = all.findIndex(r => Math.round(r.age0) === Math.round(Number(label)));
  return k < 0 ? null : {proj, all, k};
}
// Owner line for the hovered year, tracking who holds the asset then. Jointly owned: both names while both are alive ("Owners: Peter and Yen (joint)"),
// the survivor once one has passed ("Owner: Yen"), the heirs once both have passed ("Owner: heirs"). Not jointly owned: "Owner: Peter" while the
// owner is alive; after the owner passes, "Owner: Yen" when the asset continues to the surviving spouse, else "Owner: heirs".
function ciOwnerText(o, label) {
  const at = ciRowAt(label);
  if (!o) return '';
  const proj = at ? at.proj : typeof lastProjection !== 'undefined' ? lastProjection : null;
  if (!proj) return '';
  const nm = i => displayPersonName(proj.people[i], i);
  const two = !!proj.married && proj.people.length > 1,
    sp = two ? (o.own === 0 ? 1 : 0) : null;
  const joint = !!o.joint && two;
  if (!at) return joint ? 'Owners: ' + nm(o.own) + ' and ' + nm(sp) + ' (joint)' : 'Owner: ' + nm(o.own);
  const r = at.all[at.k],
    alive = i => !!(r.alive && r.alive[i]);
  if (joint) {
    if (alive(o.own) && alive(sp)) return 'Owners: ' + nm(o.own) + ' and ' + nm(sp) + ' (joint)';
    if (alive(o.own)) return 'Owner: ' + nm(o.own);
    if (alive(sp)) return 'Owner: ' + nm(sp);
    return 'Owner: heirs';
  }
  if (alive(o.own)) return 'Owner: ' + nm(o.own);
  if (two && o.bene && alive(sp)) return 'Owner: ' + nm(sp);
  return 'Owner: heirs';
}
function ciAgeText(label) {
  const fallback = label != null && label !== '' ? 'at age ' + label : '';
  const proj = typeof lastProjection !== 'undefined' ? lastProjection : null;
  if (!proj || !proj.rows || !proj.rows.length || label == null || label === '') return fallback;
  const all = proj.rows.concat(proj.stretch || []);
  const k = all.findIndex(r => Math.round(r.age0) === Math.round(Number(label)));
  if (k < 0) return fallback;
  const nm = i => (proj.married ? ' (' + displayPersonName(proj.people[i], i) + ')' : '');
  const aliveOf = r => (r.alive || []).map((a, i) => (a ? i : -1)).filter(i => i >= 0);
  const oldest = (r, idxs) => idxs.reduce((b, i) => ((r.ages[i] || 0) > (r.ages[b] || 0) ? i : b), idxs[0]);
  const al = aliveOf(all[k]);
  if (al.length) {
    const b = oldest(all[k], al);
    const a = all[k].ages[b];
    return 'at age ' + (Number.isFinite(a) ? Math.round(a) : label) + nm(b);
  }
  for (let j = k - 1; j >= 0; j--) {
    const aj = aliveOf(all[j]);
    if (aj.length) {
      const n = k - j,
        b = oldest(all[j], aj);
      return (
        n +
        (n === 1 ? ' year' : ' years') +
        ' since ' +
        (proj.married ? displayPersonName(proj.people[b], b) : 'the last passing') +
        ' passed'
      );
    }
  }
  return fallback;
}
// Value of the hovered element at the hovered year, shown under the name when the element has one (null/zero/missing → no line).
// Rates are percents already; flows (income, tax, expense charts) are per year; balances (asset charts) and cumulative Social Security are not.
const CI_STOCK_KEYS = ['asset', 'idgt', 'ss'];
const CI_PCT_KEYS = ['inflation', 'market']; // charts whose values are rates (%), not dollars
function ciValueLine(key, f, chart) {
  const src = f && f.ds && (f.ds.ciValues || f.ds.data); // ciValues: true values of a dataset whose plotted height is not its value (cost-basis lines)
  const raw = src ? src[f.idx] : null;
  const v = raw != null && typeof raw === 'object' ? raw.y : raw;
  if (
    typeof v !== 'number' ||
    !Number.isFinite(v) ||
    (Math.abs(v) < 0.5 && !/^Effective tax rate/.test(String(f.ds.label)) && !CI_PCT_KEYS.includes(key))
  )
    return null;
  const age = ' ' + ciAgeText(chart.data.labels && chart.data.labels[f.idx]);
  if (CI_PCT_KEYS.includes(key)) return mrow('Value' + age + ':', v.toFixed(key === 'inflation' ? 2 : 1) + '%');
  if (/^Effective tax rate/.test(String(f.ds.label))) return v > 0 ? mrow('Value' + age + ':', v.toFixed(1) + '%') : null;
  return mrow('Value' + age + ':', fmt(v) + (CI_STOCK_KEYS.includes(key) || f.ds.ciStock ? '' : '/yr'));
}
function ciShow(e) {
  const hit = ciChartOf(e.target);
  if (!hit) return ciHide();
  let info = null;
  const ov = ciOverlayAt(hit.key, hit.chart, e);
  if (ov) info = ov;
  else {
    const rect = hit.chart.canvas.getBoundingClientRect(),
      area = hit.chart.chartArea;
    const py = (e.clientY - rect.top) * (hit.chart.height / rect.height);
    if (area && py >= area.top && py <= area.bottom) {
      const f = ciElementAt(hit.chart, e, hit.key);
      if (f && f.stackTotal != null) {
        const age = ' ' + ciAgeText(hit.chart.data.labels && hit.chart.data.labels[f.idx]);
        info = {
          name: CI_TOTAL_NAME[hit.key] + (f.withState ? ' (federal + state)' : ''),
          color: null,
          owner: '',
          value: mrow('Value' + age + ':', fmt(f.stackTotal) + (CI_STOCK_KEYS.includes(hit.key) ? '' : '/yr')),
          text: f.withState
            ? 'The top edge of the stack: the sum of every band below it at this age, plus the state income tax (the dashed line above the stack).'
            : 'The top edge of the stack: the sum of every band below it at this age.'
        };
      } else {
        const text = f && ciDescribe(hit.key, f.ds, f.di);
        if (text) {
          const color = f.ds.borderColor && typeof f.ds.borderColor === 'string' ? f.ds.borderColor : null;
          const name = String(
            f.ds.ordLabel
              ? (hit.key === 'incomeQual' ? 'Qualified tax bracket line: ' : 'Ordinary tax bracket line: ') + f.ds.ordLabel
              : f.ds.label
          );
          info = {
            name,
            text,
            brief: typeof f.ds.infoBrief === 'string' ? f.ds.infoBrief : undefined, // optional short text for Popup Verbose off
            color,
            value: ciValueLine(hit.key, f, hit.chart),
            owner: ciOwnerText(f.ds.ciOwnerInfo, hit.chart.data.labels && hit.chart.data.labels[f.idx])
          };
        }
      }
    }
  }
  if (!info) {
    const rect = hit.chart.canvas.getBoundingClientRect(),
      area = hit.chart.chartArea;
    const px = (e.clientX - rect.left) * (hit.chart.width / rect.width),
      py = (e.clientY - rect.top) * (hit.chart.height / rect.height);
    if (area && py >= area.top && py <= area.bottom && px >= area.left && px <= area.right) info = ciUnfundedAt(hit.chart, px);
  }
  if (!info) return ciHide();
  ciRender(e, info);
}
function ciRender(e, info) {
  const el = ciEl(),
    th = tipTheme();
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const {name, color, value, owner} = info;
  // The explanatory paragraph shrinks to `brief` when the element supplies one (its key data is already in name / owner / value), else to its first sentence.
  const text = !info.text ? info.text : info.brief != null ? info.brief : ciFirstSentence(info.text);
  el.style.background = th.bg;
  el.style.color = th.fg;
  el.style.borderColor = th.border;
  el.style.whiteSpace = 'normal';
  el.style.maxWidth = '340px';
  el.innerHTML = `<div style="position:relative;padding-left:14px;font-weight:bold;margin-bottom:3px;">${color ? `<span style="position:absolute;left:0;top:.3em;width:9px;height:9px;background:${esc(color)};border:1px solid ${th.fg};box-sizing:border-box;" data-sw></span>` : ''}${esc(name)}</div>${owner ? `<div style="margin-bottom:3px;">${esc(owner)}</div>` : ''}${
    value
      ? `<div style="font-weight:bold;margin-bottom:3px;display:flex;justify-content:space-between;gap:12px;">${String(value)
          .split(TIP_SEP)
          .map(t => `<span>${esc(t)}</span>`)
          .join('')}</div>`
      : ''
  }${text ? `<div>${esc(text)}</div>` : ''}`;
  el.style.opacity = 1;
  const w = el.offsetWidth,
    h = el.offsetHeight;
  let left = e.clientX + 14;
  if (left + w > window.innerWidth - 8) left = e.clientX - 14 - w;
  let top = e.clientY - h / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
  el.style.transition = 'opacity .12s';
  el.style.left = Math.max(8, left) + 'px';
  el.style.top = top + 'px';
  el._shown = true;
}
document.addEventListener('mousemove', e => {
  if (!chartInfo) {
    return;
  }
  if (e.target && e.target.tagName === 'CANVAS') ciShow(e);
  else {
    const a = e.target && e.target.closest && e.target.closest('.unfunded-alert[data-detail]');
    if (a && !a.hidden)
      ciRender(e, {name: a.dataset.name, text: a.dataset.detail, color: '#D00000', value: a.dataset.value || null, owner: ''});
    else ciHide();
  }
});
document.addEventListener('mouseleave', () => {
  if (chartInfo) ciHide();
});

// Hide Chart.js's built-in (canvas) popups while the mode is on. Used by the charts without an external popup (Social Security,
// total Social Security vs tax, Total Income Tax, Household Expenses); `beforeTooltipDraw` returning false cancels the draw.
if (typeof Chart !== 'undefined' && !Chart.registry.plugins.get('chartInfoGate')) {
  Chart.register({
    id: 'chartInfoGate',
    beforeTooltipDraw() {
      if (chartInfo || chartTipOff) return false;
    }
  });
}
