'use strict';
// DISPLAY / EXCEL — the Tax tables sheet (every bracket / threshold as a defined name the projection formulas use).

// ═══ Tax tables sheet ════════════════════════════════════════════════════════════════════════════
// Returns {ws, names[]} — every scalar and bracket array is a defined name the Projection formulas use.
function xlsxTaxSheet() {
  const sh = xlsxSheet(),
    names = [];
  let r = 0;
  const title = t => {
    xlsxPut(sh, r, 0, xlsxTxt(t));
    r++;
  };
  const scalar = (label, name, v, z, note) => {
    xlsxPut(sh, r, 0, xlsxTxt(label));
    xlsxPut(sh, r, 1, xlsxNum(v, z));
    if (note) xlsxPut(sh, r, 2, xlsxTxt(note));
    names.push({Name: name, Ref: `'Tax tables'!$B$${r + 1}`});
    r++;
  };
  title(
    "Tax tables used by the Projection sheet formulas (edit a value and the whole projection recalculates). Source: the app's 2026 simplified federal model (js/core/constants.js)."
  );
  r++;
  title('Standard deduction (basic + age 65+), senior deduction, NIIT, Social Security taxability');
  scalar('Standard deduction, married (MFJ)', 'Std_MFJ', STD_MFJ, XLSX_MONEY);
  scalar('Standard deduction, single', 'Std_SGL', STD_SGL, XLSX_MONEY);
  scalar('Additional standard deduction, age 65+, per living person, MFJ', 'StdAge_MFJ', STD_AGE65_MFJ, XLSX_MONEY);
  scalar('Additional standard deduction, age 65+, single', 'StdAge_SGL', STD_AGE65_SGL, XLSX_MONEY);
  scalar('Itemized floor (LTC cost above this % of AGI)', 'ItemFloor', 0.075, XLSX_PCT);
  scalar('Senior deduction per eligible person', 'SenDed', SENIOR_DED, XLSX_MONEY, "Fixed amount, deflated to today's $ in the projection");
  scalar('Senior deduction phase-out starts, MFJ MAGI', 'SenThrMFJ', SENIOR_THRESH_MFJ, XLSX_MONEY);
  scalar('Senior deduction phase-out starts, single MAGI', 'SenThrSGL', SENIOR_THRESH_SGL, XLSX_MONEY);
  scalar('Senior deduction phase-out rate', 'SenRate', SENIOR_RATE, XLSX_PCT);
  scalar(
    'Marginal-rate step: extra non-SS ordinary income used to measure the marginal rate on ordinary income',
    'MargBump',
    100,
    XLSX_MONEY
  );
  scalar('NIIT rate', 'NIIT_Rate', NIIT_RATE, XLSX_PCT);
  scalar('NIIT threshold, MFJ MAGI (current law, not indexed)', 'NIIT_MFJ', NIIT_THRESH_MFJ, XLSX_MONEY);
  scalar('NIIT threshold, single MAGI (current law, not indexed)', 'NIIT_SGL', NIIT_THRESH_SGL, XLSX_MONEY);
  scalar(
    'SS taxability tier 1 starts, MFJ provisional income',
    'SS_MFJ_1',
    32000,
    XLSX_MONEY,
    "Not indexed: deflated to today's $ in the projection"
  );
  scalar('SS taxability tier 2 starts, MFJ', 'SS_MFJ_2', 44000, XLSX_MONEY);
  scalar('SS tier 2 base amount, MFJ', 'SS_MFJ_Amt', 6000, XLSX_MONEY);
  scalar('SS taxability tier 1 starts, single', 'SS_SGL_1', 25000, XLSX_MONEY);
  scalar('SS taxability tier 2 starts, single', 'SS_SGL_2', 34000, XLSX_MONEY);
  scalar('SS tier 2 base amount, single', 'SS_SGL_Amt', 4500, XLSX_MONEY);
  scalar('SS taxable share, tier 1', 'SS_Lo', 0.5, XLSX_PCT);
  scalar('SS taxable share, tier 2', 'SS_Hi', 0.85, XLSX_PCT);
  r++;
  title('Qualified dividend / LTCG tiers (taxable income where each rate stops)');
  scalar('0% tier ends, MFJ', 'QD_MFJ_1', MFJ_QDIV[0].lim, XLSX_MONEY);
  scalar('15% tier ends, MFJ', 'QD_MFJ_2', MFJ_QDIV[1].lim, XLSX_MONEY);
  scalar('0% tier ends, single', 'QD_SGL_1', SGL_QDIV[0].lim, XLSX_MONEY);
  scalar('15% tier ends, single', 'QD_SGL_2', SGL_QDIV[1].lim, XLSX_MONEY);
  scalar('Middle tier rate', 'QD_R2', MFJ_QDIV[1].r, XLSX_PCT);
  scalar('Top tier rate', 'QD_R3', MFJ_QDIV[2].r, XLSX_PCT);
  r++;
  title('Ordinary brackets: lower edge of each bracket and the rate step (rate − previous rate) the tax formula sums');
  const hdr = r;
  ['MFJ bracket starts', 'MFJ rate', 'MFJ rate step', '', 'Single bracket starts', 'Single rate', 'Single rate step'].forEach((h, i) => {
    if (h) xlsxPut(sh, r, i, xlsxTxt(h));
  });
  r++;
  const n = MFJ_ORD.length,
    top = r;
  for (let j = 0; j < n; j++) {
    const R = r + 1;
    xlsxPut(sh, r, 0, xlsxNum(j === 0 ? 0 : MFJ_ORD[j - 1].lim, XLSX_MONEY));
    xlsxPut(sh, r, 1, xlsxNum(MFJ_ORD[j].r, XLSX_PCT));
    xlsxPut(
      sh,
      r,
      2,
      j === 0 ? xlsxFml(`B${R}`, MFJ_ORD[j].r, XLSX_PCT) : xlsxFml(`B${R}-B${R - 1}`, MFJ_ORD[j].r - MFJ_ORD[j - 1].r, XLSX_PCT)
    );
    xlsxPut(sh, r, 4, xlsxNum(j === 0 ? 0 : SGL_ORD[j - 1].lim, XLSX_MONEY));
    xlsxPut(sh, r, 5, xlsxNum(SGL_ORD[j].r, XLSX_PCT));
    xlsxPut(
      sh,
      r,
      6,
      j === 0 ? xlsxFml(`F${R}`, SGL_ORD[j].r, XLSX_PCT) : xlsxFml(`F${R}-F${R - 1}`, SGL_ORD[j].r - SGL_ORD[j - 1].r, XLSX_PCT)
    );
    r++;
  }
  const rng = c => `'Tax tables'!$${c}$${top + 1}:$${c}$${top + n}`;
  names.push(
    {Name: 'MFJ_Lo', Ref: rng('A')},
    {Name: 'MFJ_dR', Ref: rng('C')},
    {Name: 'SGL_Lo', Ref: rng('E')},
    {Name: 'SGL_dR', Ref: rng('G')}
  );
  r++;
  title('IRMAA: MAGI where each tier starts and the combined annual Part B + Part D surcharge per enrolled person');
  ['MFJ MAGI from', 'MFJ surcharge / person / yr', '', 'Single MAGI from', 'Single surcharge / person / yr'].forEach((h, i) => {
    if (h) xlsxPut(sh, r, i, xlsxTxt(h));
  });
  r++;
  const m = IRMAA_MFJ.length,
    t2 = r;
  for (let j = 0; j < m; j++) {
    xlsxPut(sh, r, 0, xlsxNum(IRMAA_MFJ[j].magi, XLSX_MONEY));
    xlsxPut(sh, r, 1, xlsxNum(IRMAA_MFJ[j].surch, XLSX_MONEY));
    xlsxPut(sh, r, 3, xlsxNum(IRMAA_SGL[j].magi, XLSX_MONEY));
    xlsxPut(sh, r, 4, xlsxNum(IRMAA_SGL[j].surch, XLSX_MONEY));
    r++;
  }
  const rng2 = c => `'Tax tables'!$${c}$${t2 + 1}:$${c}$${t2 + m}`;
  names.push(
    {Name: 'IR_MFJ_Lo', Ref: rng2('A')},
    {Name: 'IR_MFJ_S', Ref: rng2('B')},
    {Name: 'IR_SGL_Lo', Ref: rng2('D')},
    {Name: 'IR_SGL_S', Ref: rng2('E')},
    {Name: 'IR_MFJ_1', Ref: `'Tax tables'!$A$${t2 + 1}`},
    {Name: 'IR_SGL_1', Ref: `'Tax tables'!$D$${t2 + 1}`}
  );
  r++;
  const selSt = xlsxSelectedState();
  if (selSt === 'CA') {
    title(
      "State income tax (Inputs: Tax & Optimizations). California: 2025 brackets, state standard deduction (or, when larger, the Long Term Care medical itemized deduction, computed in the State income tax rows) and credits. Held flat in today's $ (the state indexes them); only the Mental Health Services threshold is deflated."
    );
    scalar('California standard deduction, married (MFJ)', 'CA_Std_MFJ', CA_STD_MFJ, XLSX_MONEY);
    scalar('California standard deduction, single', 'CA_Std_SGL', CA_STD_SGL, XLSX_MONEY);
    scalar('California personal exemption credit, per living person', 'CA_Cred', CA_PERSONAL_CREDIT, XLSX_MONEY);
    scalar('California senior (65+) exemption credit, per living person', 'CA_SrCred', CA_SENIOR_CREDIT, XLSX_MONEY);
    scalar(
      'California exemption-credit phase-out starts at federal AGI, single',
      'CA_PhSgl',
      CA_CREDIT_PHASEOUT_SGL,
      XLSX_MONEY,
      "FTB 2025 figure × 1.034 (2026 not yet published); indexed, so flat in today's $"
    );
    scalar(
      'California exemption-credit phase-out starts at federal AGI, married (MFJ)',
      'CA_PhMfj',
      CA_CREDIT_PHASEOUT_MFJ,
      XLSX_MONEY,
      "FTB 2025 figure × 1.034 (2026 not yet published); indexed, so flat in today's $"
    );
    scalar(
      'California exemption-credit phase-out: each step of federal AGI',
      'CA_PhBand',
      CA_CREDIT_PHASEOUT_BAND,
      XLSX_MONEY,
      "Not indexed: deflated to today's $ in the projection"
    );
    scalar(
      'California exemption-credit phase-out: reduction of each credit per step',
      'CA_PhStep',
      CA_CREDIT_PHASEOUT_STEP,
      XLSX_MONEY,
      "Not indexed: deflated to today's $ in the projection"
    );
    scalar(
      'California Mental Health Services surcharge starts at taxable income',
      'CA_MH_Thr',
      CA_MH_THRESH,
      XLSX_MONEY,
      "Not indexed: deflated to today's $ in the projection"
    );
    scalar('California Mental Health Services surcharge rate', 'CA_MH_Rate', CA_MH_RATE, XLSX_PCT);
  } else if (selSt === 'WA') {
    title(
      "State income tax (Inputs: Tax & Optimizations). Washington: capital-gains excise tax. Held flat in today's $ (the state indexes them); only the second-tier threshold is deflated."
    );
    scalar('Washington capital-gains deduction (one per household)', 'WA_Ded', WA_CG_DEDUCTION, XLSX_MONEY);
    scalar('Washington capital-gains rate, first tier', 'WA_R1', WA_CG_RATE, XLSX_PCT);
    scalar(
      'Washington second tier starts at taxable gain',
      'WA_T2',
      WA_CG_TIER2,
      XLSX_MONEY,
      "Not indexed: deflated to today's $ in the projection"
    );
    scalar('Washington capital-gains rate, second tier', 'WA_R2', WA_CG_RATE2, XLSX_PCT);
  }
  if (selSt === 'CA') {
    r++;
    title('California brackets: lower edge of each bracket and the rate step the tax formula sums');
    ['MFJ bracket starts', 'MFJ rate', 'MFJ rate step', '', 'Single bracket starts', 'Single rate', 'Single rate step'].forEach((h, i) => {
      if (h) xlsxPut(sh, r, i, xlsxTxt(h));
    });
    r++;
    const nc = CA_ORD_MFJ.length,
      topC = r;
    for (let j = 0; j < nc; j++) {
      const R = r + 1;
      xlsxPut(sh, r, 0, xlsxNum(j === 0 ? 0 : CA_ORD_MFJ[j - 1].lim, XLSX_MONEY));
      xlsxPut(sh, r, 1, xlsxNum(CA_ORD_MFJ[j].r, XLSX_PCT));
      xlsxPut(
        sh,
        r,
        2,
        j === 0 ? xlsxFml(`B${R}`, CA_ORD_MFJ[j].r, XLSX_PCT) : xlsxFml(`B${R}-B${R - 1}`, CA_ORD_MFJ[j].r - CA_ORD_MFJ[j - 1].r, XLSX_PCT)
      );
      xlsxPut(sh, r, 4, xlsxNum(j === 0 ? 0 : CA_ORD_SGL[j - 1].lim, XLSX_MONEY));
      xlsxPut(sh, r, 5, xlsxNum(CA_ORD_SGL[j].r, XLSX_PCT));
      xlsxPut(
        sh,
        r,
        6,
        j === 0 ? xlsxFml(`F${R}`, CA_ORD_SGL[j].r, XLSX_PCT) : xlsxFml(`F${R}-F${R - 1}`, CA_ORD_SGL[j].r - CA_ORD_SGL[j - 1].r, XLSX_PCT)
      );
      r++;
    }
    const rngC = c => `'Tax tables'!$${c}$${topC + 1}:$${c}$${topC + nc}`;
    names.push(
      {Name: 'CA_MFJ_Lo', Ref: rngC('A')},
      {Name: 'CA_MFJ_dR', Ref: rngC('C')},
      {Name: 'CA_SGL_Lo', Ref: rngC('E')},
      {Name: 'CA_SGL_dR', Ref: rngC('G')}
    );
  }
  return {ws: xlsxFinish(sh, {minW: 14, mixedText: 60}), names};
}

// Format for an Inputs-sheet number from its label: ages 3.1, percents 3.1 (values already in percent units), whole-number
// years / months / counts, otherwise dollars 9.2.
function xlsxLabelFmt(label) {
  const l = String(label).toLowerCase();
  if (/\b(year|years|month|count)\b/.test(l)) return XLSX_COUNT;
  if (/\bage\b/.test(l)) return XLSX_AGE;
  if (/%|\b(pct|percent|yield|rate)\b/.test(l)) return XLSX_PCTNUM;
  return XLSX_MONEY;
}
// Same idea for the raw field names dumped for annuities / rentals / real estate (camelCase keys).
function xlsxFieldFmt(key) {
  const k = String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return xlsxLabelFmt(k);
}
