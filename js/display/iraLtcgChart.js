'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / IRA CHART + LTCG CHART — two stacked charts of annual dollar flows (today's $), each broken down by individual source.
//
//   IRA chart   (`charts.ira`,  #iraChart)  Pre-tax IRA money that leaves each person's IRA this year, as stacked kinds per person (inherited IRAs, from the Inheritance card, have their own bands on top):
//                 Annual withdraw  (row.rothConvByPerson — the withdraw on top of the RMD; it moves into the Roth IRA when the card's "Withdraw is Roth conversion" box is ticked),
//                 RMD              (row.iraByPerson — the required minimum distribution), and
//                 expense withdraw (row.iraExpByPerson — drawn to pay a shortfall in household expenses).
//               and, for inherited IRAs: RMD / year-10 withdraw (row.inhIraWdByPerson), annual withdraw (row.rothConvByPerson − row.convMainByPerson) and inherited Roth IRA withdraw (row.inhRothWdByPerson, tax-free).
//               All but the inherited Roth withdraw are taxed as ordinary income. Married: one band per person per kind (the person's name is in the band's label).
//   LTCG chart  (`charts.ltcg`, #ltcgChart) Long-term capital gain realized this year, one band per brokerage portfolio (row.portfoliosByPerson[i][j].ltcg, the exact
//                 pre-SCGL gain) plus one band for property sold (row.reSaleGain). A dashed line shows the net gain taxed when the SCGL carryforward is used.
//
// Both are read-only views of projection rows (nothing is recomputed here), have their own Y scale (in no Same-scale group), and show no panel
// when there is nothing to draw (setChartAvailable) — no pre-tax IRA, or no portfolio / property that could be sold.
// ═══════════════════════════════════════════════════════════════
// Chart Element text of the IRA withdrawals chart's lines: stamped onto its datasets as ds.info by upsertLineChart (chartHelpers.js), read by chartInfo.js.
const infoIra = ds => {
  const label = String(ds.label == null ? '' : ds.label);
  if (/^(.* \u2014 )?Inherited Roth IRA/.test(label))
    return 'Withdrawal from an inherited Roth IRA (the 10-year rule: the whole balance is out by year 10). Tax-free.';
  if (/Inherited IRA RMD/.test(label))
    return 'Required distribution from an inherited pre-tax IRA: the yearly RMD (Single Life Expectancy table) when the original owner had started RMDs, and everything left in year 10. Taxed as ordinary income.';
  if (/Inherited IRA annual withdraw/.test(label))
    return 'Annual withdraw set on an inherited pre-tax IRA card, on top of its required distribution. Taxed as ordinary income and spendable (an inherited IRA cannot be converted to a Roth IRA).';
  if (/RMD/.test(label))
    return "Required minimum distribution from this person's pre-tax IRA/401(k), forced by the IRS from the RMD age onward. Taxed as ordinary income.";
  if (/Annual withdraw/.test(label))
    return 'Annual withdrawal from this person\'s pre-tax IRA, set on the IRA card (on top of the RMD). Taxed as ordinary income; it moves into their Roth IRA when "Withdraw is Roth conversion" is ticked, otherwise it is spendable cash.';
  if (/withdraw/i.test(label))
    return "Money withdrawn from this person's pre-tax IRA/401(k) to pay household expenses when income, dividends and asset sales were not enough. Taxed as ordinary income.";
  if (/Roth conversion/.test(label))
    return "Amount converted from this person's pre-tax IRA to their Roth IRA that year (a withdrawal on top of the RMD). The converted amount is taxed as ordinary income and then moves into the Roth IRA.";
  return null;
};
// Chart Element text of the realized LTCG chart's lines: stamped onto its datasets as ds.info by upsertLineChart (chartHelpers.js), read by chartInfo.js.
const infoLtcg = ds => {
  const label = String(ds.label == null ? '' : ds.label);
  if (/^Real estate/.test(label))
    return 'Long-term capital gain realized on property sold that year (the gain over the basis and exemption). Real estate is only sold to cover an expense shortfall or by the withdrawal order.';
  if (/^Net LTCG/.test(label))
    return 'Long-term capital gain actually taxed (dashed): the realized gain after the Suspended Capital-Gain Loss (SCGL) carryforward has been used against it.';
  return 'Long-term capital gain realized this year by selling shares of this brokerage portfolio (before any SCGL offset). The gain is the share of each sale above its cost basis.';
};
// `get(r,i)` = the amount of that kind leaving person i's accounts in row r. The person's OWN pre-tax IRA comes first; inherited IRAs (Inheritance card) have their own bands on top,
// so each band is one thing: row.iraByPerson / row.rothConvByPerson also hold the inherited-IRA amounts, which are taken out of the own-IRA bands here (as the Excel export does).
const IRA_KIND_ORDER = [
  // bottom → top of the stack
  {
    kind: 'conv',
    title: 'Annual withdraw',
    color: () => VZ.iraW,
    get: (r, i) => (r.convMainByPerson ? r.convMainByPerson[i] : (r.rothConvByPerson || [])[i]) || 0
  },
  {
    kind: 'rmd',
    title: 'RMD',
    color: () => VZ.rmd,
    get: (r, i) => Math.max(0, ((r.iraByPerson || [])[i] || 0) - ((r.inhIraWdByPerson || [])[i] || 0))
  },
  {kind: 'wd', title: 'Pre-tax IRA withdraw (for expenses)', color: () => VZ.iraExp, get: (r, i) => (r.iraExpByPerson || [])[i] || 0},
  {
    kind: 'inhRmd',
    title: 'Inherited IRA RMD / final withdraw',
    color: () => VZ.inhIra,
    inh: true,
    get: (r, i) => (r.inhIraWdByPerson || [])[i] || 0
  },
  {
    kind: 'inhConv',
    title: 'Inherited IRA annual withdraw',
    color: () => '#8A6D2B',
    inh: true,
    get: (r, i) => Math.max(0, ((r.rothConvByPerson || [])[i] || 0) - ((r.convMainByPerson || [])[i] || 0))
  },
  {
    kind: 'inhRoth',
    title: 'Inherited Roth IRA withdraw (tax-free)',
    color: () => VZ.inhRoth,
    inh: true,
    get: (r, i) => (r.inhRothWdByPerson || [])[i] || 0
  }
];
// Second person's bands are the same hue, lightened, so each kind keeps its color and the two people stay distinguishable.
function iraPersonColor(base, personIdx) {
  if (!personIdx) return base;
  const n = parseInt(base.slice(1), 16),
    mix = v => Math.round(0.55 * v + 0.45 * 255);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => mix(v).toString(16).padStart(2, '0')).join('');
}

function chartRowsAndLabels(proj) {
  const rows = proj.rows;
  if (!rows.length) return null;
  const labels = ageLabelRange(rows[0].age0, chartMaxAge(proj));
  const ages = rows.map(r => r.age0);
  const rowByAge = {};
  rows.forEach(r => {
    rowByAge[Math.round(r.age0)] = r;
  });
  return {rows, labels, ages, rowByAge};
}
function dropChart(key) {
  if (charts[key]) {
    try {
      charts[key].destroy();
    } catch (e) {}
    charts[key] = null;
  }
  setChartAvailable(key, false);
}
function stackedBandDataset(label, color, data, stack) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: hexOverWhite(color, 0xbb / 255),
    borderWidth: THIN_W,
    pointRadius: 0,
    pointHoverRadius: 0,
    pointHitRadius: 12,
    tension: 0.25,
    fill: true,
    spanGaps: false,
    stack,
    order: 2
  };
}

// ── IRA chart ──
function buildIraChart() {
  if (typeof Chart === 'undefined' || !lastProjection) return;
  const proj = lastProjection,
    base = chartRowsAndLabels(proj);
  if (!base) {
    dropChart('ira');
    return;
  }
  const {rows, labels, ages, rowByAge} = base;

  // One band per person per kind, kept for every person whose pre-tax IRA is on (or that has money to show: e.g. an IRA inherited from the spouse).
  const bands = []; // [{personIdx, kind, label, color, field}]
  IRA_KIND_ORDER.forEach(K => {
    proj.people.forEach((p, i) => {
      const any = rows.some(r => K.get(r, i) > 0.5);
      if (K.inh ? !any : !((p.ira && p.ira.enabled) || any)) return; // an inherited-IRA band only when it has something to show
      bands.push({
        personIdx: i,
        kind: K.kind,
        get: K.get,
        color: iraPersonColor(K.color(), i),
        label: (proj.married ? displayPersonName(p, i) + ' \u2014 ' : '') + K.title
      });
    });
  });
  if (!bands.length) {
    dropChart('ira');
    return;
  }
  setChartAvailable('ira', true);

  const data = bands.map(b =>
    alignToAges(
      ages,
      rows.map(r => b.get(r, b.personIdx)),
      labels
    )
  );
  const Y_MAX = lockedYMax('ira', () => {
    let m = 0;
    rows.forEach(r => {
      m = Math.max(
        m,
        bands.reduce((t, b) => t + b.get(r, b.personIdx), 0)
      );
    });
    return niceMax(m, 5000);
  });
  const datasets = bands.map((b, bi) => stackedBandDataset(b.label, b.color, data[bi], 'ira'));

  const tip = {
    title: items => {
      const r = rowByAge[labels[items[0] ? items[0].dataIndex : 0]];
      return r ? popupPersonAgeLines(proj, r) : [];
    },
    label: c => (c.raw == null || c.raw < 0.5 ? null : mrow('  ' + c.dataset.label, fmt(c.raw) + '/yr')),
    footer: items => {
      const idx = items[0] ? items[0].dataIndex : 0,
        out = [''];
      IRA_KIND_ORDER.forEach(K => {
        const t = bands.reduce((a, b, bi) => a + ((b.kind === K.kind && data[bi][idx]) || 0), 0);
        if (t > 0.5) out.push(mrow('Total ' + K.title, fmt(t) + '/yr'));
      });
      out.push(mrow('Total out of IRAs', fmt(bands.reduce((a, b, bi) => a + (data[bi][idx] || 0), 0)) + '/yr'));
      return out;
    }
  };
  upsertLineChart('ira', {
    canvasId: 'iraChart',
    info: infoIra,
    labels,
    datasets,
    yMax: Y_MAX,
    tooltip: tip,
    createOptions: () => ({
      ...CHART_BASE,
      interaction: {mode: 'index', intersect: false},
      plugins: {legend: {display: false}, tooltip: {...TIP_STYLE, enabled: false, external: externalTooltip, callbacks: justifyTip(tip)}},
      scales: {
        x: ageXAxis(ageAxisLabel(proj)),
        y: {stacked: true, min: 0, max: Y_MAX, title: axisTitle("IRA RMD & withdraw (today's $)"), ticks: yAxisTicks, grid: AXIS_GRID}
      }
    })
  });
}

// ── LTCG chart ──
function buildLtcgChart() {
  if (typeof Chart === 'undefined' || !lastProjection) return;
  const proj = lastProjection,
    base = chartRowsAndLabels(proj);
  if (!base) {
    dropChart('ltcg');
    return;
  }
  const {rows, labels, ages, rowByAge} = base;

  // One band per enabled brokerage portfolio (IDGT portfolios too: they realize gains on the swap), then one for property sold.
  const series = []; // [{type:'portfolio'|'realestate', personIdx, bi, name}]
  proj.people.forEach((p, i) => {
    (p.brokerage || []).forEach((b, bi) => {
      if (!b || b.enabled === false) return;
      const nm = (b.name && b.name.trim()) || 'Portfolio ' + (bi + 1);
      series.push({
        type: 'portfolio',
        personIdx: i,
        bi,
        name: (proj.married ? displayPersonName(p, i) + ' \u2014 ' : '') + nm + (b.idgt ? ' (IDGT)' : '')
      });
    });
  });
  const hasRe = proj.people.some(p => (p.realEstate || []).some(r => r && r.enabled !== false && Number(r.balance) > 0));
  if (hasRe) series.push({type: 'realestate', personIdx: 0, name: 'Real estate sale'});
  if (!series.length) {
    dropChart('ltcg');
    return;
  }
  setChartAvailable('ltcg', true);

  const colors = assetSeriesColors(series); // the asset chart's hue family per person; property in the amber family
  const valueOf = (s, r) => {
    if (s.type === 'realestate') return r.reSaleGain || 0;
    const e = ((r.portfoliosByPerson && r.portfoliosByPerson[s.personIdx]) || [])[s.bi];
    return e ? e.ltcg || 0 : 0;
  };
  const data = series.map(s =>
    alignToAges(
      ages,
      rows.map(r => valueOf(s, r)),
      labels
    )
  );
  const scglUsed = rows.some(r => (r.scglUsed || 0) > 0.5);
  const gross = idx => series.reduce((t, s, si) => t + (data[si][idx] || 0), 0);
  const Y_MAX = lockedYMax('ltcg', () => {
    let m = 0;
    rows.forEach(r => {
      m = Math.max(
        m,
        series.reduce((t, s) => t + valueOf(s, r), 0)
      );
    });
    return niceMax(m, 5000);
  });

  const datasets = series.map((s, si) => stackedBandDataset(s.name, colors[si], data[si], 'ltcg'));
  if (scglUsed) {
    const net = alignToAges(
      ages,
      rows.map(r => r.ltcg || 0),
      labels
    );
    datasets.push({
      label: 'Net LTCG taxed (after SCGL)',
      data: net,
      borderColor: '#c0392b',
      backgroundColor: 'transparent',
      borderWidth: THIN_W,
      borderDash: [7, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 12,
      tension: 0.25,
      fill: false,
      spanGaps: false,
      stack: 'net',
      order: 1
    });
  }

  const tip = {
    title: items => {
      const r = rowByAge[labels[items[0] ? items[0].dataIndex : 0]];
      return r ? popupPersonAgeLines(proj, r) : [];
    },
    label: c => (c.raw == null || c.raw < 0.5 ? null : mrow('  ' + c.dataset.label, fmt(c.raw) + '/yr')),
    footer: items => {
      const idx = items[0] ? items[0].dataIndex : 0,
        r = rowByAge[labels[idx]],
        out = [''];
      out.push(mrow('Total LTCG realized', fmt(gross(idx)) + '/yr'));
      if (r && (r.scglUsed || 0) > 0.5)
        out.push(mrow('  SCGL used', '\u2212' + fmt(r.scglUsed) + '/yr'), mrow('  Net LTCG taxed', fmt(r.ltcg || 0) + '/yr'));
      return out;
    }
  };
  upsertLineChart('ltcg', {
    canvasId: 'ltcgChart',
    info: infoLtcg,
    labels,
    datasets,
    yMax: Y_MAX,
    tooltip: tip,
    createOptions: () => ({
      ...CHART_BASE,
      interaction: {mode: 'index', intersect: false},
      plugins: {legend: {display: false}, tooltip: {...TIP_STYLE, enabled: false, external: externalTooltip, callbacks: justifyTip(tip)}},
      scales: {
        x: ageXAxis(ageAxisLabel(proj)),
        y: {stacked: true, min: 0, max: Y_MAX, title: axisTitle("Realized LTCG (today's $)"), ticks: yAxisTicks, grid: AXIS_GRID}
      }
    })
  });
}
