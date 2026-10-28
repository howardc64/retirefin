'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / HOUSEHOLD EXPENSES CHART — stacked expense components
// (living, income tax, IRMAA surcharge, AUM fee), same style as the
// Total Income Tax chart. Reads projection rows only (§4.6 row schema:
// expLiving, expTaxFed, expTaxState, expIrmaa, expAum, expTotal + the funding split).
// ═══════════════════════════════════════════════════════════════
const CI_EXP = [
  [
    /^Living expenses/,
    "Household living expenses you entered, in today's dollars (reduced to the amount set for after the first Long Term Care starts, when LTC is modeled)."
  ],
  [
    /^Long Term Care/,
    'Long Term Care cost for each person while care is needed, as set in the LTC panel. It is the only expense that can be itemized (the part above 7.5% of AGI).'
  ],
  [
    /^Federal income tax/,
    'Federal income tax paid as an expense ("tax drag"): federal tax + NIIT, less the federal share of any tax already paid out of a property sale. It is paid from income first, then dividends, asset sales or IRA withdrawals.'
  ],
  [
    /^State income tax/,
    'State income tax paid as an expense, from the State income tax panel (less the state share of any tax already paid out of a property sale). It is paid from income first, then dividends, asset sales or IRA withdrawals.'
  ],
  [
    /^Payroll tax/,
    'Payroll tax on wages and stock-option wage gains: Social Security and Medicare, Additional Medicare Tax, FUTA, and California SDI or Washington PFML / WA Cares when State income tax is on for that state. Paid like any expense (income first, then dividends, asset sales). Not deductible from income.'
  ],
  [
    /^Roth IRA\/401/,
    "Roth IRA/401(k) contribution from the Wage card: after-tax money paid like any expense (income first, then dividends, asset sales) and added to the Roth account."
  ],
  [/^IRMAA/, 'Medicare Part B + D income-related surcharge, per person on Medicare, based on MAGI from two years earlier.'],
  [
    /^AUM fee/,
    'Assets-under-management fee charged on the balance of the portfolios marked as AUM, either a % of that balance or a fixed amount.'
  ]
];
// Chart Element text of the Household Expenses chart's lines: stamped onto its datasets as ds.info by upsertLineChart (chartHelpers.js), read by chartInfo.js.
const infoExpense = ds => {
  const pick = t => infoFromTable(t, ds);
  return pick(CI_EXP);
};
const VZ_EXP = {living: '#3F7CAC', tax: '#C8600A', stateTax: '#00A8CC', irmaa: '#17A398', aum: '#7B3FBE', ltc: '#B5384B', roth: '#5C8A2E', payroll: '#E3B505'};
// Bottom → top stack order.
const EXP_KEYS = ['expLiving', 'expLtc', 'expRoth', 'expPayroll', 'expTaxFed', 'expTaxState', 'expIrmaa', 'expAum'];
const EXP_LABELS = {
  expLiving: 'Living expenses',
  expLtc: 'Long Term Care',
  expRoth: 'Roth IRA/401(k) contribution',
  expPayroll: 'Payroll tax',
  expTaxFed: 'Federal income tax (tax drag)',
  expTaxState: 'State income tax (tax drag)',
  expIrmaa: 'IRMAA surcharge',
  expAum: 'AUM fee'
};
const EXP_COLORS = {expLiving: VZ_EXP.living, expLtc: VZ_EXP.ltc, expRoth: VZ_EXP.roth, expPayroll: VZ_EXP.payroll, expTaxFed: VZ_EXP.tax, expTaxState: VZ_EXP.stateTax, expIrmaa: VZ_EXP.irmaa, expAum: VZ_EXP.aum};
// Red UNFUNDED tag inside the Annual expenses panel (right of its Rescale button) when any year's expenses could not be funded: the first age it happens (and the last, if it runs on),
// by the same age the chart's x axis uses (the older person's), plus the total shortfall in today's $.
function buildExpenseAlert(proj) {
  const el = document.getElementById('expenseAlert');
  if (!el) return;
  const bad = ((proj && proj.rows) || []).filter(r => r.expUnfunded > 1);
  if (!bad.length) {
    el.hidden = true;
    el.textContent = '';
    delete el.dataset.detail;
    el.title = '';
    return;
  }
  const a0 = Math.floor(bad[0].age0),
    a1 = Math.floor(bad[bad.length - 1].age0);
  const total = bad.reduce((s, r) => s + r.expUnfunded, 0);
  const living = r =>
    proj.married ? (r.alive || []).map((al, i) => (al ? displayPersonName(proj.people[i], i) : null)).filter(Boolean) : [];
  const who = living(bad[0]).join(' & ');
  // One line only (the chart below never moves); the details are in the Chart Element popup over the line (chartInfo.js).
  el.textContent = 'UNFUNDED'; // just the word: the first / last age and who is living are in the Chart Element popup below
  setAlertDetail(
    el,
    'Unfunded expenses',
    mrow('Total shortfall:', fmt(total) + " (today's $)"),
    bad.length +
      ' year' +
      (bad.length > 1 ? 's' : '') +
      ' with expenses no source can pay, first at age ' +
      a0 +
      (a1 !== a0 ? ' and last at ' + a1 : '') +
      ' (' +
      ageAxisLabel(proj) +
      (who ? '; living then: ' + who : '') +
      '). ' +
      'Income, dividends, asset sales and withdrawals together fall short; open the Withdrawal order, living expenses or the passing ages to see what changes it.'
  );
  el.hidden = false;
}
function buildExpenseChart() {
  if (typeof Chart === 'undefined' || !lastProjection) return;
  const proj = lastProjection,
    rows = proj.rows;
  buildExpenseAlert(proj);
  if (!rows.length) {
    return;
  }
  const labels = ageLabelRange(rows[0].age0, chartMaxAge(proj));
  const ages = rows.map(r => r.age0);
  const aligned = {};
  EXP_KEYS.forEach(k => {
    aligned[k] = alignToAges(
      ages,
      rows.map(r => r[k] || 0),
      labels
    );
  });

  const Y_MAX = lockedYMax('expense', () => {
    let maxV = 0;
    for (let i = 0; i < labels.length; i++) {
      let t = 0;
      EXP_KEYS.forEach(k => (t += aligned[k][i] || 0));
      maxV = Math.max(maxV, t);
    }
    return Math.ceil(Math.max(maxV, 1) / 5000) * 5000 + 10000;
  });

  const rowByAge = {};
  rows.forEach(r => (rowByAge[Math.round(r.age0)] = r));

  const datasets = EXP_KEYS.map(k => ({
    label: k === 'expLtc' && state.medShock && state.medShock.enabled ? 'Long Term Care / medical shock' : EXP_LABELS[k],
    data: aligned[k],
    borderColor: EXP_COLORS[k],
    backgroundColor: EXP_COLORS[k] + 'cc',
    borderWidth: THIN_W,
    pointRadius: 0,
    tension: 0.25,
    fill: true,
    spanGaps: false,
    stack: 'exp',
    order: 2
  }));

  // Built fresh every call so it doesn't close over a stale rowByAge/labels from an earlier render.
  const tooltipCallbacks = {
    title: i => {
      const idx = i[0] ? i[0].dataIndex : 0;
      const r = rowByAge[labels[idx]];
      return r ? popupPersonAgeLines(proj, r) : [];
    },
    label: ctx => {
      if (ctx.raw == null || ctx.raw === 0) return null;
      const r = rowByAge[labels[ctx.dataIndex]];
      const pct = r && r.expTotal > 0 ? ' (' + ((ctx.raw / r.expTotal) * 100).toFixed(0) + '%)' : '';
      return mrow('  ' + ctx.dataset.label, fmt(ctx.raw) + '/yr' + pct);
    },
    footer: items => {
      const idx = items[0] ? items[0].dataIndex : 0;
      const r = rowByAge[labels[idx]];
      if (!r) return [];
      const lines = ['', mrow('Total expenses', fmt(r.expTotal) + '/yr')];
      // How the year's expenses were funded: household income → dividends → asset sales → pre-tax IRA → Roth IRA.
      lines.push(mrow('  paid by household income', fmt(r.expFromIncome) + '/yr'));
      if (r.brokerageWd > 0.5) lines.push(mrow('    incl. portfolio withdraw', fmt(r.brokerageWd) + '/yr'));
      lines.push(mrow('  paid by dividends', fmt(r.expFromDiv) + '/yr'));
      lines.push(mrow('  paid by asset sales', fmt(r.expFromSales) + '/yr'));
      if (r.expFromIra > 0.5) lines.push(mrow('  paid by pre-tax IRA', fmt(r.expFromIra) + '/yr'));
      if (r.expFromRoth > 0.5) lines.push(mrow('  paid by Roth IRA', fmt(r.expFromRoth) + '/yr'));
      if (r.expFromRe > 0.5) lines.push(mrow('  paid by property sale', fmt(r.expFromRe) + '/yr'));
      if (r.expUnfunded > 1) lines.push(mrow('  unfunded shortfall', fmt(r.expUnfunded) + '/yr'));
      if (r.excessReinvested > 1) lines.push(mrow('Excess income reinvested', fmt(r.excessReinvested) + '/yr'));
      if (showDetails) {
        lines.push(mrow('Filing status', r.filing === 'married' ? 'Married filing jointly' : 'Single'));
        lines.push(mrow('Household cash income', fmt(r.cashIncome) + '/yr'));
        lines.push(mrow('AGI', fmt(r.agi) + '/yr'));
        if (r.aumBalance > 0) lines.push(mrow('AUM balance (fee charged on)', fmt(r.aumBalance)));
        if (r.expIrmaa > 0) lines.push(mrow('IRMAA basis: AGI tier from 2 years earlier', fmt(r.irmaaSurcharge) + '/yr'));
        lines.push(mrow('Tax↔LTCG iterations', String(r.taxIters) + (r.taxConverged ? '' : ' (not converged)')));
      }
      return lines;
    }
  };

  upsertLineChart('expense', {
    canvasId: 'expenseChart',
    info: infoExpense,
    labels,
    datasets,
    yMax: Y_MAX,
    tooltip: tooltipCallbacks,
    createOptions: () => ({
      ...CHART_BASE,
      interaction: {mode: 'index', intersect: false},
      plugins: {
        legend: {display: false},
        tooltip: {...TIP_STYLE, enabled: false, external: externalTooltip, callbacks: justifyTip(tooltipCallbacks)}
      },
      scales: {
        x: ageXAxis(ageAxisLabel(proj)),
        y: {stacked: true, min: 0, max: Y_MAX, title: axisTitle("Annual expenses (today's $)"), ticks: yAxisTicks, grid: AXIS_GRID}
      }
    })
  });
}
