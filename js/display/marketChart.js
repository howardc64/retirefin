'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / MARKET RETURN CHART — the nominal return (%) every growing asset gets in each year: one line per brokerage / IDGT portfolio, pre-tax IRA, Roth IRA,
// inherited IRA and property, for the years it is in the scenario. Nominal = (1 + growth the engine used) × (1 + that year's inflation) − 1, so it is the figure you enter
// on each card ("inflation + 4%" shows as 7% at 3% inflation). In the scenario the lines are flat; in a Monte Carlo trial they move with the market shock (and real estate with its own),
// and with the trial's inflation. Read-only (proj.rates / proj.inflRate, recorded by computeProjection); own Y scale, in no Same-scale group.
// ═══════════════════════════════════════════════════════════════
const MARKET_COLORS = ['#3B6FA0', '#0f6e56', '#c8860a', '#7a4fb5', '#b4506e', '#4a9b8e', '#8A6D2B', '#C26A0E', '#5b7f2b', '#a0522d'];
// Display name of an asset key used by gk() in projection.js: 'pf:<id>' | 'ira:<person id>' | 'roth:<person id>' | 're:<id>' | 'inh:<holder>:<name>'.
function marketAssetLabel(proj, key) {
  const multi = proj.married && proj.people.length > 1,
    who = p => (multi ? ' (' + displayPersonName(p, proj.people.indexOf(p)) + ')' : '');
  const [kind, ...rest] = String(key).split(':'),
    id = rest.join(':');
  if (kind === 'pf') {
    for (let i = 0; i < proj.people.length; i++) {
      const L = proj.people[i].brokerage || [];
      const bi = L.findIndex(b => b.id === id);
      if (bi >= 0)
        return ((L[bi].name && L[bi].name.trim()) || 'Portfolio ' + (bi + 1)) + (L[bi].idgt ? ' (IDGT)' : '') + who(proj.people[i]);
    }
    return 'Portfolio';
  }
  if (kind === 're') {
    for (let i = 0; i < proj.people.length; i++) {
      const L = proj.people[i].realEstate || [];
      const ri = L.findIndex(r => r.id === id);
      if (ri >= 0) return ((L[ri].name && L[ri].name.trim()) || 'Property ' + (ri + 1)) + who(proj.people[i]);
    }
    return 'Property';
  }
  if (kind === 'ira' || kind === 'roth') {
    const p = proj.people.find(x => x.id === id);
    return (kind === 'ira' ? 'Pre-tax IRA' : 'Roth IRA') + (p ? who(p) : '');
  }
  if (kind === 'inh') {
    const m = /^([^:]*):(.*)$/.exec(id);
    const p = m && proj.people.find(x => x.id === m[1]);
    return 'Inherited ' + ((m && m[2]) || 'IRA') + (p ? who(p) : '');
  }
  return String(key);
}
// Nominal % per asset key and row index for one projection: {keys:[…in first-seen order], at:{key:[% or null per row]}}
function marketSeries(proj) {
  const rows = proj.rows,
    rates = proj.rates,
    infl = proj.inflRate,
    keys = [],
    at = {};
  if (!rates || !infl) return {keys, at};
  rows.forEach((r, k) => {
    const rk = rates[k];
    if (!rk) return;
    Object.keys(rk).forEach(key => {
      if (!at[key]) {
        at[key] = new Array(rows.length).fill(null);
        keys.push(key);
      }
      at[key][k] = ((1 + rk[key]) * (1 + infl[k]) - 1) * 100;
    });
  });
  return {keys, at};
}
// ◀ ▶ buttons in the panel's tools row cycle through the lines: All → asset 1 → asset 2 → … → All. One line at a time makes a single asset's return easy to read when
// many overlap. Display only (not saved); the Y scale stays fitted to every line, so stepping moves nothing but the line. -1 = all lines.
// Chart Element text of every line on this chart (read from ds.info by chartInfo.js).
const MARKET_INFO =
  'Nominal yearly return of this asset in the years it is in the scenario: (1 + the growth rate the projection used) × (1 + that year\'s inflation) − 1, i.e. the rate you enter on its card ("inflation + 4%" shows as 7% at 3% inflation). In the scenario it is flat; in a Monte Carlo trial it follows that trial\'s market shocks (equity-like assets share one market, real estate has its own) and its inflation.';
let marketSel = -1;
function marketStep(d) {
  const n = typeof lastProjection !== 'undefined' && lastProjection ? marketSeries(lastProjection).keys.length : 0;
  if (!n) return;
  const cur = marketSel >= 0 && marketSel < n ? marketSel : -1;
  marketSel = ((cur + d + 1 + (n + 1)) % (n + 1)) - 1; // cycles -1,0,…,n-1
  buildMarketChart();
}
function syncMarketNav(keys) {
  const nav = document.getElementById('marketNav');
  if (nav) nav.hidden = keys.length < 2; // no text beside the buttons (it would resize the card): the popup names the line under the cursor
}
function buildMarketChart() {
  if (typeof Chart === 'undefined' || !lastProjection) return;
  const proj = lastProjection,
    rows = proj.rows;
  if (!rows.length) return;
  const tv = viewContext().trial;
  const S = marketSeries(proj);
  if (!S.keys.length) {
    dropChart('market');
    return;
  }
  setChartAvailable('market', true);
  if (marketSel >= S.keys.length) marketSel = -1; // the assets changed (one removed): back to all lines
  syncMarketNav(S.keys);
  const shown = S.keys.map((k, i) => i).filter(i => marketSel < 0 || i === marketSel);

  const labels = ageLabelRange(rows[0].age0, chartMaxAge(proj)),
    ages = rows.map(r => r.age0);
  // All lines: only each asset's 5-year centred average (thick), so the many yearly lines do not clutter. One asset: its yearly return (thin) and its 5-year average (thick), same colour.
  const single = marketSel >= 0,
    datasets = [];
  shown.forEach(i => {
    const key = S.keys[i],
      col = MARKET_COLORS[i % MARKET_COLORS.length],
      name = marketAssetLabel(proj, key),
      base = {
        borderColor: col,
        backgroundColor: 'transparent',
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 12,
        tension: 0.15,
        fill: false,
        spanGaps: false,
        yAxisID: 'y'
      };
    if (single) datasets.push({...base, label: name, infoBrief: 'Nominal yearly return.', info: MARKET_INFO, data: alignToAges(ages, S.at[key], labels), borderWidth: THIN_W});
    datasets.push({
      ...base,
      label: name + ' \u2014 5-year average',
      infoBrief: 'Centered 5-year average.',
      info: MARKET_INFO,
      data: alignToAges(ages, centeredAvg(S.at[key]), labels),
      borderWidth: AVG_W
    });
  });
  // One scale for the plan and a loaded trial alike (so flipping A / B moves only the lines): the range of both.
  const all = [];
  (tv ? mcViewProjs(tv) : [proj]).forEach(pr => {
    const s = marketSeries(pr);
    s.keys.forEach(k =>
      s.at[k].forEach(v => {
        if (v != null) all.push(v);
      })
    );
  });
  let lo = Math.min(0, Math.floor(Math.min(...all) / 5) * 5),
    hi = Math.max(5, Math.ceil(Math.max(...all) / 5) * 5);
  if (pctScale.market) {
    hi = pctScale.market;
    lo = Math.min(lo, hi - 5);
  } // Rescale button: Y maximum cycles 10% … 100%

  const rowAt = idx => rows.findIndex(x => Math.round(x.age0) === labels[idx]);
  const tip = {
    title: items => {
      const k = items[0] ? rowAt(items[0].dataIndex) : -1;
      return k >= 0 ? popupPersonAgeLines(proj, rows[k]) : [];
    },
    label: () => null,
    afterBody: items => {
      const k = items[0] ? rowAt(items[0].dataIndex) : -1;
      if (k < 0) return [];
      const out = [];
      shown
        .map(i => S.keys[i])
        .forEach(key => {
          const v = S.at[key][k],
            a = centeredAvg(S.at[key])[k];
          if (v == null) return;
          if (marketSel >= 0) out.push(mrow('  ' + marketAssetLabel(proj, key), v.toFixed(1) + '%'));
          out.push(mrow('  ' + (marketSel >= 0 ? '5-year average' : marketAssetLabel(proj, key) + ' (5-yr avg)'), a.toFixed(1) + '%'));
        });
      out.push('');
      out.push(mrow('  Inflation that year', (proj.inflRate[k] * 100).toFixed(2) + '%'));
      return out;
    }
  };
  upsertLineChart('market', {
    canvasId: 'marketChart',
    labels,
    datasets,
    yMax: hi,
    tween: true,
    tooltip: tip,
    refresh: o => {
      o.scales.y.min = lo;
    },
    createOptions: () => ({
      ...CHART_BASE,
      interaction: {mode: 'index', intersect: false},
      plugins: {
        legend: {display: false},
        zeroLine: true,
        tooltip: {...TIP_STYLE, enabled: false, external: externalTooltip, mode: 'index', intersect: false, callbacks: justifyTip(tip)}
      },
      scales: {
        x: ageXAxis(ageAxisLabel(proj)),
        y: {
          min: lo,
          max: hi,
          position: 'left',
          title: axisTitle('Nominal return (% per year)'),
          ticks: {...yAxisTicks, callback: v => Math.round(v * 10) / 10 + '%'},
          grid: AXIS_GRID
        }
      }
    })
  });
}
