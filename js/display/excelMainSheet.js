'use strict';
// DISPLAY / EXCEL — the "Projection by year" sheet columns.

// ═══ Projection by year ══════════════════════════════════════════════════════════════════════════
function xlsxMainColumns(proj, acctSheets, T) {
  const married = proj.married,
    n = married ? 2 : 1,
    inf = proj.inflation || state.inflation;
  const cols = [];
  const add = c => cols.push(c);
  const V = (key, head, get, fmt) => add({key, head, kind: 'v', fmt, v: get});
  const F = (key, head, get, f, fmt, text) => add({key, head, kind: 'f', fmt, text, v: get, f});
  const per = (field, label, key, f) => {
    for (let i = 0; i < n; i++) {
      const head = married ? `${displayPersonName(proj.people[i], i)} ${label}` : label;
      V(`${key}_${i}`, head, r => {
        const x = r[field][i];
        return f ? f(x) : x || 0;
      });
    }
  };
  const sumK = key => {
    const a = [];
    for (let i = 0; i < n; i++) a.push(key + '_' + i);
    return a;
  };
  const sumF = (X, key) =>
    sumK(key)
      .map(k => X(k))
      .join('+');
  const M = X => `${X('filing')}="Married (MFJ)"`;
  const fOf = X => X('f');
  const v = x => x || 0;

  F(
    'year',
    'Year',
    r => THIS_YEAR + r.k,
    (X, idx) => (idx === 0 ? 'BaseYear' : `${X('year', -1)}+1`),
    XLSX_YEAR
  );
  V('age0', ageAxisLabel(proj), r => r.age0, XLSX_AGE);
  per('ages', 'Age', 'age', null);
  cols.slice(-n).forEach(c => (c.fmt = XLSX_AGE));
  add({key: 'filing', head: 'Filing status', kind: 'v', text: true, v: r => (r.filing === 'married' ? 'Married (MFJ)' : 'Single')});
  F(
    'f',
    "Inflation deflator (statutory un-indexed amounts shrink by this in today's $)",
    r => (T ? T.deflVal(r.k) : Math.pow(1 + inf, -r.k)),
    (X, idx) => (T ? T.deflRef(idx) : `(1+Inflation)^-(${X('year')}-BaseYear)`),
    '0.0000'
  ); // a trial: 1 / the trial\'s price level (MC trial sheet)
  per('wageByPerson', 'Wage', 'wage');
  F(
    'wageT',
    'Wage total',
    r => r.wageTotal,
    X => sumF(X, 'wage')
  );
  V('wageGross', 'Gross wage (before the pre-tax contribution and payroll tax; app value)', r => v(r.grossWageTotal));
  V('wagePretax', 'Pre-tax IRA/401(k) contribution (app value)', r => v(r.pretaxContribTotal));
  V('wageStock', 'Stock-option gains counted as wage (app value)', r => v(r.stockWageTotal));
  V('wageTaxable', 'Wage taxed as ordinary income (gross − pre-tax contribution + stock wage; payroll tax is not deducted; app value)', r => v(r.wageTaxableTotal));
  V('payrollTax', 'Payroll tax: FICA + Additional Medicare + FUTA + CA SDI / WA PFML + WA Cares (paid as an expense, app value)', r => v(r.payrollTax));
  per('ssByPerson', 'Social Security (SS)', 'ss');
  F(
    'ssT',
    'Social Security (SS) total',
    r => r.totalSS,
    X => sumF(X, 'ss')
  );
  per('pensionByPerson', 'Pension', 'pen');
  F(
    'penT',
    'Pension total',
    r => r.pension,
    X => sumF(X, 'pen')
  );
  per('annuityByPerson', 'Annuity payout (taxable)', 'ann');
  F(
    'annT',
    'Annuity payout total (taxable)',
    r => v(r.annuity),
    X => sumF(X, 'ann')
  );
  per('annuityTEByPerson', 'Annuity payout (tax-exempt)', 'annTE');
  F(
    'annTET',
    'Annuity payout total (tax-exempt, untaxed)',
    r => v(r.annuityTE),
    X => sumF(X, 'annTE')
  );
  F(
    'annAll',
    'Annuity payout total (taxable + tax-exempt)',
    r => v(r.annuity) + v(r.annuityTE),
    X => `${X('annT')}+${X('annTET')}`
  );
  V('annBal', 'Annuity account value total (SOY)', r => v(r.annuityBalance));
  V('annEmb', '  Taxable part embedded in annuity value (SOY)', r => sumAnnuities(r, 'taxableEmbedded'));
  V('annPass', 'Annuity passing benefit to heirs (year the contract ends)', r => sumAnnuityPassing(r, 'amount'));
  V('annPassT', '  passing benefit: taxable', r => sumAnnuityPassing(r, 'taxable'));
  V('annPassF', '  passing benefit: tax-exempt', r => sumAnnuityPassing(r, 'taxFree'));
  V(
    'rentNII',
    'Rental income that is net investment income (passive rentals; excludes rentals classed as an active trade or business)',
    r => v(r.rentalNII)
  );
  V('reNIIx', 'Property-sale gain that is not net investment income (property used in an active trade or business)', r => v(r.reNiitExcl));
  V('annNII', 'Annuity taxable payout that is net investment income (non-qualified annuities)', r => {
    let s = 0;
    (r.annuitiesByPerson || []).forEach(l =>
      l.forEach(e => {
        if (e.nonQual) s += e.taxable || 0;
      })
    );
    return s;
  });
  per('rentalByPerson', 'Rental', 'rent');
  F(
    'rentT',
    'Rental total (taxable)',
    r => r.rental,
    X => sumF(X, 'rent')
  );
  V('rentDep', 'Rental depreciation (non-cash, untaxed)', r => v(r.rentalDep));
  per('teByPerson', 'Tax-exempt income', 'te');
  F(
    'teT',
    'Tax-exempt income total (untaxed)',
    r => v(r.teIncome),
    X => sumF(X, 'te')
  );
  per('rothConvByPerson', 'Pre-tax IRA withdraw', 'conv');
  F(
    'convT',
    'Pre-tax IRA withdraw total',
    r => r.rothConvTotal,
    X => sumF(X, 'conv')
  );
  per('iraByPerson', 'IRA RMD', 'rmd', x => x);
  for (let i = 0; i < n; i++) cols[cols.length - n + i].v = r => ownRmd(r, i); // the person's own IRA only (inherited-IRA withdraws are their own column below)
  F(
    'rmdT',
    'IRA RMD total',
    r => Math.max(0, r.iraTotal - (r.inhIraWd || 0)),
    X => sumF(X, 'rmd')
  );
  V('inhIra', 'Inherited IRA withdraw (pre-tax, 10-year rule + RMD; taxed as ordinary income)', r => v(r.inhIraWd));
  V('inhRoth', 'Inherited Roth IRA withdraw (10-year rule; untaxed, not in MAGI)', r => v(r.inhRothWd));
  per('iraExpByPerson', 'Pre-tax IRA withdraw (for expenses)', 'iraEx');
  F(
    'iraExT',
    'Pre-tax IRA withdraw (for expenses) total (taxable)',
    r => v(r.iraExpTotal),
    X => sumF(X, 'iraEx')
  );
  V('odivNQ', 'Ordinary dividends (ODIV−QDIV)', r => r.odivNQ);
  V('qdiv', 'Qualified dividends (QDIV)', r => r.qdiv);
  V('ltcgG', 'LTCG realized, gross (before SCGL)', r => r.ltcgGross);
  V('reGain', '  of which: gain on a property sold this year (taxed as LTCG)', r => v(r.reSaleGain));
  V('reTax', 'Tax added by that property sale, federal + state (paid out of the sale, not by household expenses)', r => v(r.reSaleTax));
  V('scglU', 'SCGL used', r => r.scglUsed);
  F(
    'scglR',
    "SCGL remaining (today's $)",
    r => r.scglRemaining,
    (X, idx) => `MAX(0,${idx === 0 ? 'SCGL_Start' : X('scglR', -1)}-${X('scglU')})`
  );
  F(
    'ltcg',
    'LTCG, net of SCGL (taxed)',
    r => r.ltcg,
    X => `MAX(0,${X('ltcgG')}-${X('scglU')})`
  );
  V('ftc', 'Foreign tax credit', r => r.foreignTaxCredit);
  // — expenses —
  V('expLiving', 'Living expenses', r => v(r.expLiving));
  per('ltcCostByPerson', 'LTC cost', 'ltcC');
  V('ltcN', 'LTC started (count of people)', r => v(r.ltcStarted), XLSX_COUNT);
  F(
    'expLtc',
    'Long Term Care expense (total)',
    r => v(r.expLtc),
    X => sumF(X, 'ltcC')
  );
  if (proj.rows.some(r => r.expMed > 0))
    V('expMed', '  of which: late-life medical shock (already inside the cost above, and so inside the itemized deduction)', r =>
      v(r.expMed)
    );
  V('aumBal', 'AUM balance (start of year)', r => v(r.aumBalance));
  V('aumFee', 'AUM fee, total charged', r => v(r.aumFee));
  F(
    'expAum',
    'AUM fee paid by household (non-IDGT)',
    r => v(r.expAum),
    X => X('aumFee')
  );
  // — tax chain —
  // Formula builders shared by the tax chain and by the SST / marginal-rate hypotheticals below, so each uses exactly the same equations.
  const tssFml = (X, p) => {
    const ss = X('ssT'),
      f = X('f');
    const mfj = `IF(${p}>SS_MFJ_2*${f},MIN(MIN(SS_Lo*${ss},SS_MFJ_Amt*${f})+SS_Hi*(${p}-SS_MFJ_2*${f}),SS_Hi*${ss}),IF(${p}>SS_MFJ_1*${f},MIN(SS_Lo*(${p}-SS_MFJ_1*${f}),SS_Lo*${ss}),0))`;
    const sgl = `IF(${p}>SS_SGL_2*${f},MIN(MIN(SS_Lo*${ss},SS_SGL_Amt*${f})+SS_Hi*(${p}-SS_SGL_2*${f}),SS_Hi*${ss}),IF(${p}>SS_SGL_1*${f},MIN(SS_Lo*(${p}-SS_SGL_1*${f}),SS_Lo*${ss}),0))`;
    return `MAX(0,IF(${M(X)},${mfj},${sgl}))`;
  };
  const senFml = (X, agi) =>
    `IF(${X('senN')}>0,${X('senN')}*MAX(0,SenDed*${X('f')}-SenRate*MAX(0,${agi}-IF(${M(X)},SenThrMFJ,SenThrSGL)*${X('f')})),0)`;
  const ordTaxFml = (X, t) => `IF(${M(X)},SUMPRODUCT((${t}>MFJ_Lo)*(${t}-MFJ_Lo)*MFJ_dR),SUMPRODUCT((${t}>SGL_Lo)*(${t}-SGL_Lo)*SGL_dR))`;
  const qualTaxFml = (X, t, q) => {
    const tier = (l1, l2) => `QD_R2*MAX(0,MIN(${t}+${q},${l2})-MAX(${t},${l1}))+QD_R3*MAX(0,${t}+${q}-MAX(${t},${l2}))`;
    return `IF(${q}<=0,0,IF(${M(X)},${tier('QD_MFJ_1', 'QD_MFJ_2')},${tier('QD_SGL_1', 'QD_SGL_2')}))`;
  };
  F(
    'nonSS',
    'Ordinary income excluding Social Security (wage + pension + rental + annuity + RMD + inherited IRA withdraw + ODIV + conversion + IRA expense draw)',
    r => r.nonSSOrdinary,
    X => `${X('wageTaxable')}+${X('penT')}+${X('rentT')}+${X('annT')}+${X('rmdT')}+${X('inhIra')}+${X('odivNQ')}+${X('convT')}+${X('iraExT')}`
  );
  F(
    'prov',
    'Provisional income (non-SS income incl. QDIV, net LTCG, tax-exempt interest + 50% of SS; the tax-free part of annuity payouts is not added)',
    r => r.provisional,
    X => `${X('nonSS')}+${X('qdiv')}+${X('ltcg')}+${X('teT')}+0.5*${X('ssT')}`
  );
  F(
    'tss',
    'Taxable Social Security (SS)',
    r => r.taxableSS,
    X => tssFml(X, X('prov'))
  );
  F(
    'ordInc',
    'Ordinary income before deduction (red line on the Taxable Ordinary Income chart)',
    r => v(r.ordIncome),
    X => `${X('nonSS')}+${X('tss')}`
  );
  F(
    'agi',
    'Adjusted gross income (AGI)',
    r => r.agi,
    X => `${X('ordInc')}+${X('qdiv')}+${X('ltcg')}`
  );
  F(
    'magi',
    'MAGI for IRMAA (AGI + tax-exempt interest; the tax-free part of annuity payouts is not added)',
    r => r.magi,
    X => `${X('agi')}+${X('teT')}`
  );
  V('std65N', 'Living people age 65+ (additional standard deduction)', r => v(r.age65Eligible), XLSX_COUNT);
  F(
    'std',
    'Standard deduction (basic + additional for age 65+)',
    r => r.stdDeduction,
    X => `IF(${M(X)},Std_MFJ+StdAge_MFJ*${X('std65N')},Std_SGL+StdAge_SGL*${X('std65N')})`
  );
  F(
    'floor',
    '7.5% AGI floor',
    r => v(r.agiFloor),
    X => `ItemFloor*MAX(0,${X('agi')})`
  );
  F(
    'item',
    'Itemized deductions (LTC cost above 7.5% AGI floor)',
    r => v(r.itemized),
    X => `MAX(0,${X('expLtc')}-${X('floor')})`
  );
  F(
    'ded',
    'Deduction used (standard or itemized)',
    r => r.std,
    X => `MAX(${X('std')},${X('item')})`
  );
  V('senN', 'Senior-deduction eligible people (living, age 65+, tax years 2025–2028)', r => v(r.seniorEligible), XLSX_COUNT);
  F(
    'sen',
    'Enhanced senior deduction (Schedule 1-A)',
    r => v(r.seniorDeduction),
    X => senFml(X, X('agi'))
  );
  F(
    'ordTI',
    'Ordinary taxable income (as on the Taxable Ordinary Income chart)',
    r => r.ordTI,
    X => `MAX(0,${X('ordInc')}-${X('ded')}-${X('sen')})`
  );
  F(
    'absorbed',
    'Deduction absorbed by ordinary income',
    r => Math.max(0, v(r.ordIncome) - v(r.ordTI)),
    X => `MAX(0,${X('ordInc')}-${X('ordTI')})`
  );
  F(
    'qual',
    'Qualified income (QDIV + LTCG net of SCGL)',
    r => v(r.qualIncome),
    X => `${X('qdiv')}+${X('ltcg')}`
  );
  // Qualified Dividends and Capital Gain Tax Worksheet: taxable income = ordinary + qualified − deduction (floored at 0); the deduction takes ordinary income first, so a deduction larger
  // than the ordinary income shelters qualified income. Taxable qualified income = taxable income − taxable ordinary income.
  F(
    'qualT',
    "Taxable qualified income = MAX(0, ordinary + qualified − deductions) − taxable ordinary income (the deduction's excess over ordinary income shelters qualified income)",
    r => v(r.qualTaxable != null ? r.qualTaxable : r.qualIncome),
    X => `MAX(0,MAX(0,${X('ordInc')}+${X('qual')}-${X('ded')}-${X('sen')})-${X('ordTI')})`
  );
  F(
    'tiTot',
    'Taxable income, total (taxable ordinary + taxable qualified)',
    r => v(r.ordTI) + v(r.qualTaxable != null ? r.qualTaxable : r.qualIncome),
    X => `${X('ordTI')}+${X('qualT')}`
  );
  V('noConvOrd', 'Ordinary taxable income, no conversion (a bracket start tests this)', r => (r.noConvOrdTI == null ? '' : r.noConvOrdTI));
  V('noConvItem', 'Itemized deductions, no conversion (an itemized start tests this)', r =>
    r.noConvItemized == null ? '' : r.noConvItemized
  );
  for (let i = 0; i < n; i++)
    add({
      key: 'trig_' + i,
      head: (married ? `${displayPersonName(proj.people[i], i)} ` : '') + 'Annual withdraw trigger met this year (trigger starts only)',
      kind: 'v',
      text: true,
      v: r => (r.convTriggerStartedByPerson[i] ? 'Yes' : '')
    });
  F(
    'ordTax',
    'Ordinary tax',
    r => r.ordTax,
    X => ordTaxFml(X, X('ordTI'))
  );
  // Taxable Qualified Income chart: its two lines are where the 15% and 20% rates start (the filing status' limit minus taxable ordinary income).
  // Qualified income is stacked on top of taxable ordinary income, so the room each tier has left is the limit minus taxable ordinary income;
  // the amounts below split qualified income across the tiers (the qualified tax column prices the same split).
  const qLim = (idx, r) => (r.filing === 'married' ? MFJ_QDIV : SGL_QDIV)[idx].lim;
  F(
    'qLine0',
    'Qualified bracket: 0% tier ends = where the 15% rate starts (lower line on the Taxable Qualified Income chart)',
    r => qLim(0, r),
    X => `IF(${M(X)},QD_MFJ_1,QD_SGL_1)`
  );
  F(
    'qLine15',
    'Qualified bracket: 15% tier ends = where the 20% rate starts (upper line on that chart)',
    r => qLim(1, r),
    X => `IF(${M(X)},QD_MFJ_2,QD_SGL_2)`
  );
  F(
    'qRoom0',
    'Room left for qualified income in the 0% tier = 0% tier limit − taxable ordinary income, floored at 0',
    r => Math.max(0, qLim(0, r) - v(r.ordTI)),
    X => `MAX(0,${X('qLine0')}-${X('ordTI')})`
  );
  F(
    'qRoom15',
    'Room left for qualified income up to the end of the 15% tier = 15% tier limit − taxable ordinary income, floored at 0',
    r => Math.max(0, qLim(1, r) - v(r.ordTI)),
    X => `MAX(0,${X('qLine15')}-${X('ordTI')})`
  );
  F(
    'qAt0',
    'Qualified income taxed at 0%',
    r => Math.min(v(r.qualTaxable), Math.max(0, qLim(0, r) - v(r.ordTI))),
    X => `MIN(${X('qualT')},${X('qRoom0')})`
  );
  F(
    'qAt15',
    'Qualified income taxed at 15%',
    r =>
      Math.max(
        0,
        Math.min(v(r.qualTaxable), Math.max(0, qLim(1, r) - v(r.ordTI))) - Math.min(v(r.qualTaxable), Math.max(0, qLim(0, r) - v(r.ordTI)))
      ),
    X => `MIN(${X('qualT')},${X('qRoom15')})-${X('qAt0')}`
  );
  F(
    'qAt20',
    'Qualified income taxed at 20%',
    r => Math.max(0, v(r.qualTaxable) - Math.min(v(r.qualTaxable), Math.max(0, qLim(1, r) - v(r.ordTI)))),
    X => `${X('qualT')}-MIN(${X('qualT')},${X('qRoom15')})`
  );
  F(
    'qualTax',
    'Qualified tax (QDIV+LTCG)',
    r => r.qualTax,
    X => qualTaxFml(X, X('ordTI'), X('qualT'))
  );
  F(
    'incTax',
    'Income tax before foreign tax credit (ordinary + qualified)',
    r => r.ordTax + r.qualTax,
    X => `${X('ordTax')}+${X('qualTax')}`
  );
  // Social Security Tax (SST) = income tax (ordinary + qualified, before FTC, no NIIT) minus the same tax in a hypothetical where none of the SS is taxed
  // (non-SS income, qualified income, filing status and the deduction held fixed; the senior deduction re-evaluated at that lower AGI).
  F(
    'sstTI',
    'SST hypothetical: ordinary taxable income with no SS taxed',
    r => r.sstOrdTI,
    X => `MAX(0,${X('nonSS')}-${X('ded')}-${senFml(X, `(${X('nonSS')}+${X('qual')})`)})`
  );
  F(
    'sstQT',
    'SST hypothetical: taxable qualified income with no SS taxed',
    r => r.sstQT,
    X => `MAX(0,MAX(0,${X('nonSS')}+${X('qual')}-${X('ded')}-${senFml(X, `(${X('nonSS')}+${X('qual')})`)})-${X('sstTI')})`
  );
  F(
    'sstTax',
    'SST hypothetical: ordinary + qualified tax with no SS taxed',
    r => r.sstTaxNoSS,
    X => `${ordTaxFml(X, X('sstTI'))}+${qualTaxFml(X, X('sstTI'), X('sstQT'))}`
  );
  F(
    'sst',
    'Social Security Tax (SST) = income tax − income tax with no SS taxed (floored at 0)',
    r => r.sst,
    X => `MAX(0,${X('incTax')}-${X('sstTax')})`
  );
  // Marginal tax rate = (tax with MargBump more non-SS ordinary income − tax) / MargBump, re-running taxable SS and the senior deduction at the higher income.
  F(
    'mProv',
    'Marginal rate: provisional income + step',
    r => r.mProv,
    X => `${X('prov')}+MargBump`
  );
  F(
    'mTSS',
    'Marginal rate: taxable SS at the higher income',
    r => r.mTSS,
    X => tssFml(X, X('mProv'))
  );
  F(
    'mTI',
    'Marginal rate: ordinary taxable income at the higher income',
    r => r.mTI,
    X => `MAX(0,${X('nonSS')}+MargBump+${X('mTSS')}-${X('ded')}-${senFml(X, `(${X('nonSS')}+MargBump+${X('mTSS')}+${X('qual')})`)})`
  );
  F(
    'mQT',
    'Marginal rate: taxable qualified income at the higher income',
    r => r.mQT,
    X =>
      `MAX(0,MAX(0,${X('nonSS')}+MargBump+${X('mTSS')}+${X('qual')}-${X('ded')}-${senFml(X, `(${X('nonSS')}+MargBump+${X('mTSS')}+${X('qual')})`)})-${X('mTI')})`
  );
  F(
    'mTax',
    'Marginal rate: ordinary + qualified tax at the higher income',
    r => r.mTax,
    X => `${ordTaxFml(X, X('mTI'))}+${qualTaxFml(X, X('mTI'), X('mQT'))}`
  );
  F(
    'marg',
    'Marginal tax rate on ORDINARY income = (tax at higher income − tax) / step, floored at 0 (includes the SS torpedo and senior-deduction phase-out; not the rate on the next dollar of qualified income)',
    r => pct(r.marginalRate),
    X => `MAX(0,(${X('mTax')}-${X('incTax')})/MargBump)`,
    XLSX_PCT
  );
  F(
    'margQ',
    '  of which: ordinary income pushing qualified income into a higher tier',
    r => pct(r.marginalQual),
    X => `MAX(0,(${qualTaxFml(X, X('mTI'), X('mQT'))}-${X('qualTax')})/MargBump)`,
    XLSX_PCT
  );
  F(
    'margO',
    '  of which: ordinary brackets (incl. SS torpedo and senior-deduction phase-out)',
    r => pct(r.marginalOrd),
    X => `${X('marg')}-${X('margQ')}`,
    XLSX_PCT
  );
  F(
    'nii',
    'Net investment income (NII)',
    r => r.niiIncome,
    X => `${X('odivNQ')}+${X('qdiv')}+MAX(0,${X('ltcg')}-${X('reNIIx')})+${X('annNII')}+${X('rentNII')}`
  );
  F(
    'niit',
    'NIIT (3.8%)',
    r => r.niit,
    X => {
      const th = `IF(AND(FutNIIT_On="Yes",${X('year')}>=FutNIIT_Start),IF(${M(X)},FutNIIT_MFJ,FutNIIT_SGL),IF(${M(X)},NIIT_MFJ,NIIT_SGL)*${X('f')})`;
      return `NIIT_Rate*MIN(MAX(0,${X('nii')}),MAX(0,${X('agi')}-${th}))`;
    }
  );
  F(
    'tt',
    'Total Tax (TT) = MAX(0, income tax − foreign tax credit) + NIIT',
    r => r.totalTax,
    X => `MAX(0,${X('incTax')}-${X('ftc')})+${X('niit')}`
  );
  F(
    'eff',
    'Effective tax rate',
    r => pct(r.agi > 0 ? r.totalTax / r.agi : 0),
    X => `IF(${X('agi')}>0,${X('tt')}/${X('agi')},0)`,
    XLSX_PCT
  );
  // — IRMAA: MAGI two years back × living people 65+ —
  F(
    'enr',
    'People on Medicare (alive, age 65+)',
    r => r.ages.reduce((c, a, i) => c + (r.alive[i] && a >= 65 ? 1 : 0), 0),
    X => {
      const t = [];
      for (let i = 0; i < n; i++) t.push(`(${X('age_' + i)}>=65)*(${X('age_' + i)}<Pass_${i + 1})`);
      return t.join('+');
    },
    XLSX_COUNT
  );
  F(
    'irmaa',
    "Household IRMAA surcharge (expense) = tier of MAGI from 2 years earlier (table of that year's filing status) × people on Medicare",
    r => v(r.irmaaSurcharge),
    (X, idx) => {
      if (idx < 2) return '0';
      const m = X('magi', -2),
        mj = `${X('filing', -2)}="Married (MFJ)"`; // the tier table follows the filing status of the return the MAGI comes from
      return `${X('enr')}*IF(${mj},IF(${m}<IR_MFJ_1,0,LOOKUP(${m},IR_MFJ_Lo,IR_MFJ_S)),IF(${m}<IR_SGL_1,0,LOOKUP(${m},IR_SGL_Lo,IR_SGL_S)))`;
    }
  );
  // — State income tax (Inputs: State income tax; not part of TT, paid as a household expense) —
  const selState = xlsxSelectedState();
  if (selState === 'CA') {
    F(
      'stN',
      'People alive (state tax: personal credits)',
      r => r.alive.reduce((c, a) => c + (a ? 1 : 0), 0),
      X => {
        const t = [];
        for (let i = 0; i < n; i++) t.push(`(${X('age_' + i)}<Pass_${i + 1})`);
        return t.join('+');
      },
      XLSX_COUNT
    );
    const caTIv = r => {
      const a = Math.max(0, r.agi - r.taxableSS);
      return Math.max(0, a - Math.max(r.filing === 'married' ? CA_STD_MFJ : CA_STD_SGL, Math.max(0, (r.expLtc || 0) - 0.075 * a)));
    };
    F(
      'caTI',
      'California taxable income = (AGI − taxable SS) − larger of state standard deduction and medical itemized deduction (LTC cost above 7.5% of that income)',
      caTIv,
      X => {
        const a = `MAX(0,${X('agi')}-${X('tss')})`;
        return `MAX(0,${a}-MAX(IF(${M(X)},CA_Std_MFJ,CA_Std_SGL),MAX(0,${X('expLtc')}-0.075*${a})))`;
      }
    );
    F(
      'caRed',
      'California exemption-credit phase-out: amount taken off EACH personal and senior credit = $6 × (federal AGI over the threshold ÷ $2,500, rounded up), all × the deflator',
      r => caCreditReduction(r.agi, r.filing === 'married', T ? T.deflVal(r.k) : Math.pow(1 + inf, -r.k)),
      X => `MAX(0,ROUNDUP(MAX(0,${X('agi')}-IF(${M(X)},CA_PhMfj,CA_PhSgl))/(CA_PhBand*${X('f')})-0.000000001,0))*CA_PhStep*${X('f')}`
    );
    F(
      'stateTax',
      'California income tax (not part of TT; paid as a household expense)',
      r => v(r.stateTax),
      X => {
        const t = X('caTI'),
          f = X('f');
        const ca = `MAX(0,IF(${M(X)},SUMPRODUCT((${t}>CA_MFJ_Lo)*(${t}-CA_MFJ_Lo)*CA_MFJ_dR),SUMPRODUCT((${t}>CA_SGL_Lo)*(${t}-CA_SGL_Lo)*CA_SGL_dR))+CA_MH_Rate*MAX(0,${t}-CA_MH_Thr*${f})-MAX(0,CA_Cred-${X('caRed')})*${X('stN')}-MAX(0,CA_SrCred-${X('caRed')})*${X('enr')})`;
        return `IF(State_On="Yes",${ca},0)`;
      }
    );
  } else if (selState === 'WA') {
    F(
      'waGain',
      'Washington taxable capital gain = portfolio LTCG (gross − property-sale gain − SCGL used) − deduction',
      r => Math.max(0, (r.ltcgGross || 0) - (r.reSaleGain || 0) - (r.scglUsed || 0) - WA_CG_DEDUCTION),
      X => `MAX(0,${X('ltcgG')}-${X('reGain')}-${X('scglU')}-WA_Ded)`
    );
    F(
      'stateTax',
      'Washington capital-gains tax (not part of TT; paid as a household expense)',
      r => v(r.stateTax),
      X => {
        const f = X('f'),
          g = X('waGain');
        const wa = `WA_R1*MIN(${g},WA_T2*${f})+WA_R2*MAX(0,${g}-WA_T2*${f})`;
        return `IF(State_On="Yes",${wa},0)`;
      }
    );
  } else if (selState === 'NY' || selState === 'NYC') {
    // New York (State, or State + City): computed by the app (brackets, recapture and the pension exclusion are not rebuilt as formulas), carried as values.
    V('stateTax', 'New York ' + (selState === 'NYC' ? 'State + City resident' : 'State') + ' income tax (app value; not part of TT; paid as a household expense)', r => v(r.stateTax));
  } else {
    F(
      'stateTax',
      'State income tax (off)',
      r => 0,
      X => '0'
    );
  }
  F(
    'expTax',
    'Income tax paid as expense (tax drag) = total tax + state tax − tax paid out of a property sale',
    r => v(r.expTax),
    X => `${X('tt')}+${X('stateTax')}-${X('reTax')}`
  );
  V('expRoth', 'Roth IRA/401(k) contribution from the wage (an expense, app value)', r => v(r.expRoth));
  V('expPayroll', 'Payroll tax paid as an expense (app value)', r => v(r.expPayroll));
  F(
    'expTot',
    'Total household expenses = living + LTC + IRMAA + AUM fee + Roth IRA/401(k) contribution + payroll tax + income tax',
    r => v(r.expTotal),
    X => `${X('expLiving')}+${X('expLtc')}+${X('irmaa')}+${X('expAum')}+${X('expRoth')}+${X('expPayroll')}+${X('expTax')}`
  );
  // Spending guardrails (rows carry `guard` only when state.guardrail is on). Living expenses above already include the cuts (an app value); these columns show the rule
  // that produced them: the app's spending / balance, and the rate, cut line, tripwire and "above the line?" test as live formulas (the band is the Inputs name Gr_Band).
  if (proj.rows[0] && proj.rows[0].guard) {
    const bandOf = r => r.guard.bandPct || 0,
      lineOf = r => (r.guard.iwr == null ? '' : r.guard.iwr * (1 + bandOf(r) / 100));
    V(
      'gMult',
      "Guardrail: multiplier on the discretionary part of living expenses this year (1 = the scenario's amount)",
      r => r.guard.mult,
      '0.000'
    );
    V(
      'gDraw',
      'Guardrail: spending the portfolios must fund (total expenses − wages, Social Security, pension, rental and annuity income)',
      r => r.guard.draw
    );
    V('gBal0', 'Guardrail: invested balance at the start of the year', r => r.guard.bal0);
    F(
      'gWr',
      'Guardrail: withdrawal rate = spending ÷ start-of-year balance',
      r => (r.guard.bal0 > 0 ? r.guard.draw / r.guard.bal0 : ''),
      X => `IF(${X('gBal0')}>0,${X('gDraw')}/${X('gBal0')},"")`,
      XLSX_PCT2
    );
    V(
      'gIwr',
      'Guardrail: starting withdrawal rate (blank until the first year without wages)',
      r => (r.guard.iwr == null ? '' : r.guard.iwr),
      XLSX_PCT2
    );
    F(
      'gLine',
      'Guardrail: cut line = starting rate × (1 + band)',
      lineOf,
      X => `IF(${X('gIwr')}="","",${X('gIwr')}*(1+Gr_Band/100))`,
      XLSX_PCT2
    );
    F(
      'gTrip',
      'Guardrail: tripwire = spending ÷ cut line (a start-of-year balance below this triggers a cut)',
      r => (r.guard.iwr == null ? '' : r.guard.draw / lineOf(r)),
      X => `IF(${X('gLine')}="","",${X('gDraw')}/${X('gLine')})`,
      XLSX_MONEY
    );
    F(
      'gOver',
      'Guardrail: is the rate above the cut line?',
      r => (r.guard.iwr != null && (r.guard.bal0 > 0 ? r.guard.draw / r.guard.bal0 > lineOf(r) : r.guard.draw > 0) ? 'Yes' : 'No'),
      X => `IF(${X('gLine')}="","No",IF(${X('gBal0')}<=0,IF(${X('gDraw')}>0,"Yes","No"),IF(${X('gWr')}>${X('gLine')},"Yes","No")))`,
      undefined,
      true
    );
    V('gMove', 'Guardrail: change decided for next year (−1 cut, +1 raise, 0 none; none in the last years)', r => r.guard.move, XLSX_COUNT);
    V('gCutAmt', 'Guardrail: discretionary spending given up this year', r => r.guard.cutAmt);
  }
  F(
    'totInc',
    'Total income (as on Annual Household Income chart: every band incl. dividends, LTCG, IRA/Roth withdraws, depreciation)',
    r => chartTotalIncome(r),
    X =>
      `${X('penT')}+${X('annT')}+${X('annTET')}+${X('wageT')}+${X('convT')}+${X('rmdT')}+${X('inhIra')}+${X('inhRoth')}+${X('iraExT')}+${X('rentT')}+${X('rentDep')}+${X('teT')}+${X('expFromRoth')}+${X('qdiv')}+${X('odivNQ')}+${X('ltcg')}+${X('ssT')}`
  );
  V('cash', 'Household cash income (wage+SS+pension+rental+depreciation+tax-exempt+annuity+RMD+portfolio withdraw)', r => v(r.cashIncome));
  F(
    'expFromInc',
    'Expenses paid by household income',
    r => v(r.expFromIncome),
    X => `MIN(${X('expTot')},${X('cash')})`
  );
  V('expFromDiv', 'Expenses paid by dividends', r => v(r.expFromDiv));
  V('expFromSales', 'Expenses paid by asset sales', r => v(r.expFromSales));
  V('expFromIra', 'Expenses paid by pre-tax IRA', r => v(r.expFromIra));
  V('expFromRoth', 'Expenses paid by Roth IRA (untaxed)', r => v(r.expFromRoth));
  V('expFromRe', 'Expenses paid by a property sold to cover the shortfall', r => v(r.expFromRe));
  V('unf', 'Expenses unfunded', r => v(r.expUnfunded));
  F(
    'chk',
    'Funding check: total expenses − all funding sources (≈ 0)',
    r => 0,
    X =>
      `${X('expTot')}-${X('expFromInc')}-${X('expFromDiv')}-${X('expFromSales')}-${X('expFromIra')}-${X('expFromRoth')}-${X('expFromRe')}-${X('unf')}`
  );
  V('excess', 'Excess income (after all expenses)', r => v(r.excessIncome));
  V('excessRe', 'Excess income reinvested', r => v(r.excessReinvested));
  // — balances: pulled from the account sheets by Year —
  const q = nm => `'${nm.replace(/'/g, "''")}'`;
  const pfSheets = acctSheets.filter(s => s.type === 'pf');
  const sumIfs = (shs, colKey, X) => {
    if (!shs.length) return null;
    return shs
      .map(s => {
        const L = s.t.letter[colKey],
          a = s.t.firstRow,
          b = Math.max(s.t.lastRow, a);
        return `SUMIFS(${q(s.name)}!$${L}$${a}:$${L}$${b},${q(s.name)}!$A$${a}:$A$${b},${X('year')})`;
      })
      .join('+');
  };
  for (let i = 0; i < n; i++) {
    const sh = acctSheets.find(s => s.type === 'ira' && s.i === i);
    add({
      key: 'iraBal_' + i,
      head: (married ? `${displayPersonName(proj.people[i], i)} ` : '') + 'Pre-tax IRA balance (EOY)',
      kind: sh ? 'f' : 'v',
      v: r => r.iraBalByPerson[i] || 0,
      f: sh ? X => sumIfs([sh], 'bal', X) : null
    });
  }
  for (let i = 0; i < n; i++) {
    const sh = acctSheets.find(s => s.type === 'roth' && s.i === i);
    add({
      key: 'rothBal_' + i,
      head: (married ? `${displayPersonName(proj.people[i], i)} ` : '') + 'Roth IRA balance (EOY)',
      kind: sh ? 'f' : 'v',
      v: r => r.rothBalByPerson[i] || 0,
      f: sh ? X => sumIfs([sh], 'bal', X) : null
    });
  }
  {
    const shI = acctSheets.filter(s => s.type === 'inhira'),
      shR = acctSheets.filter(s => s.type === 'inhroth');
    const sumInh = (r, kind) =>
      (r.inhIraByPerson || []).reduce(
        (a, l) => a + (l || []).reduce((b, e) => b + (e && e.live && e.kind === kind ? e.balance || 0 : 0), 0),
        0
      );
    add({
      key: 'inhIraBal',
      head: 'Inherited pre-tax IRA balances (EOY)',
      kind: shI.length ? 'f' : 'v',
      v: r => sumInh(r, 'ira'),
      f: shI.length ? X => sumIfs(shI, 'bal', X) : null
    });
    add({
      key: 'inhRothBal',
      head: 'Inherited Roth IRA balances (EOY)',
      kind: shR.length ? 'f' : 'v',
      v: r => sumInh(r, 'roth'),
      f: shR.length ? X => sumIfs(shR, 'bal', X) : null
    });
  }
  // Inheritance asset income (the chart of that name): reference values from the same helper the chart uses, not used by any formula.
  {
    const ia = inhIncomeAssets(proj);
    if (ia.length) {
      const kindSum = (r, k) => ia.reduce((tt, a) => tt + (inhIncomeComps(a, r)[k] || 0), 0);
      INH_INC_KINDS.forEach(K => {
        if (proj.rows.some(r => kindSum(r, K.kind) > 0.5))
          V('inhInc_' + K.kind, 'Inheritance asset income: ' + K.title, r => kindSum(r, K.kind));
      });
      V('inhIncTot', 'Inheritance asset income: total (as on the chart)', r => INH_INC_KINDS.reduce((tt, K) => tt + kindSum(r, K.kind), 0));
    }
  }
  const pfN = pfSheets.filter(s => !s.idgt),
    pfI = pfSheets.filter(s => s.idgt);
  const pfAdd = (key, head, get, shs, col) =>
    add({key, head, kind: shs.length ? 'f' : 'v', v: get, f: shs.length ? X => sumIfs(shs, col, X) : null});
  pfAdd('bN', 'Brokerage balance, non-IDGT (SOY)', r => sumPortfolios(r, false, 'balance'), pfN, 'bal');
  pfAdd('bI', 'Brokerage balance, IDGT (SOY)', r => sumPortfolios(r, true, 'balance'), pfI, 'bal');
  pfAdd('gN', 'Unrealized gain, non-IDGT (SOY)', r => v(r.embeddedGain), pfN, 'gain');
  pfAdd('gI', 'Unrealized gain, IDGT (SOY)', r => v(r.embeddedGainIdgt), pfI, 'gain');
  // Real estate: summed from the property sheets by Year (a property that is sold or has left the scenario has no row after that).
  const reSheets = acctSheets.filter(s => s.type === 're');
  const reSum = (r, f) => r.realEstateByPerson.reduce((a, l) => a + (l || []).reduce((b, e) => b + (e ? f(e) : 0), 0), 0);
  pfAdd('reVal', 'Real estate value (SOY)', r => reSum(r, e => e.balance), reSheets, 'bal');
  pfAdd('reGainU', 'Real estate unrealized gain (SOY)', r => reSum(r, e => Math.max(0, e.balance - e.basis)), reSheets, 'gain');
  return cols;
}
// Sum of every stacked band on the Annual Household Income chart (same fields as INC_KEYS in incomeChart.js).
