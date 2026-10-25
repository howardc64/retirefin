'use strict';
// CORE / DEFAULTS — default values for every part of the scenario (people, accounts, income items) and the chart-grid layout defaults.

const BASIS_SWAP_YEARS_DEFAULT = 3; // Asset / basis swap: default years before the last passing
const LTC_SINGLE_LIVING = 7500,
  LTC_LIVING2_DEFAULT = 15000;
function ltcLiving1Default(married) {
  return married ? Number(state.living) || 0 : LTC_SINGLE_LIVING;
}
function defaultChange(mode, value) {
  return {mode, value: value || 0};
}
function defaultAgeRange(startMode, startVal, endMode, endVal) {
  return {startMode, startVal: startVal || 0, endMode, endVal: endVal || 0};
}
function defaultAgeRangedItem(amount, changeMode, changeVal, startMode, startVal, endMode, endVal) {
  return {
    enabled: false,
    hidden: true,
    amount: amount || 0,
    ar: defaultAgeRange(startMode, startVal, endMode, endVal),
    change: defaultChange(changeMode, changeVal),
    bene: false
  };
}
// Brokerage portfolio (spec 4.3): value, age range, annual growth (default inflation + 4%),
// survivor benefit, Distributed LTCG (`cgdMode` 'pct' = `cgdPct` % of the balance (default, 0) or 'amt' = `cgdAmt` $/yr in today's $; taxed LTCG, spendable like a dividend), ODIV yield (default 1.5%), QDIV share of ODIV (default 70%), tax-exempt yield % (`teYield`, default 0: paid out of the
// portfolio each year as tax-exempt income — untaxed, but part of household income), an IDGT flag, an AUM flag and a
// `type` ('living' default | 'idgt') drives the idgt/payExp/reinvest flags (living: payExp+reinvest on; idgt: all off).
// `payExp` flag (derived): only portfolios with it checked contribute dividends and asset sales to the household
// expenses — living costs, IRMAA, the AUM fee and income tax (IDGT or not). Saves that predate the field load with it on
// for non-IDGT portfolios, as they behaved before.
// `reinvest` flag (default OFF): household income left over after ALL expenses are paid is reinvested, pro rata to start-of-year
// balance, into the portfolios with it checked (added to balance and to cost basis at year-end). Older saves load with it off.
// `aum` (default off; always off for IDGT): the portfolio's balance counts toward the AUM balance the household AUM fee is charged on
// (`state.aumFee`, Expenses panel). The fee, the household IRMAA surcharge, living expenses and income tax are all
// funded by household income first, then portfolio dividends, then asset sales (which realize LTCG).
// Cost-basis / unrealized-gain tracking (spec §4.6, cost basis). Every portfolio is tracked: household expenses
// can force asset sales from any portfolio, and realized LTCG is always automatic (sale × unrealized-gain share),
// so every portfolio needs a basis. A blank cost basis (`basisPct` null) is treated as no unrealized gain today.
// `basisPct` is the cost basis as a % of the portfolio's start balance (0–100); it replaced the older
// dollar-valued `basis` field (older saves are converted in hydrateState).
function pfBasisEntered(b) {
  return !!b && b.basisPct != null && b.basisPct !== '' && Number.isFinite(Number(b.basisPct));
}
function pfTracksBasis(b) {
  return !!b;
}
function defaultBrokeragePortfolio(balance, n) {
  // `name` starts blank rather than a pre-filled "Brokerage Portfolio N" — the input's placeholder
  // (input/brokerage.js) and the card header's fallback (also "Portfolio N", position-based) already
  // show a sensible default, and starting blank means the header always visibly tracks the first
  // character the user types instead of initially showing unrelated placeholder text to overwrite.
  return {
    id: uid(),
    enabled: true,
    hidden: false,
    name: '',
    balance: balance || 0,
    growth: defaultChange('offset', 4),
    yield: 1.5,
    qdivPct: 70,
    cgdMode: 'pct',
    cgdPct: 0,
    cgdAmt: 0,
    teYield: 0,
    aum: false,
    type: 'living',
    payExp: true,
    reinvest: true,
    basisPct: null,
    ar: defaultAgeRange('now', 0, 'passing', 0),
    bene: false,
    idgt: false,
    foreignPct: 0,
    ftcPct: 0.25,
    inh: null,
    startYear: null
  }; // inh/startYear: set only on a portfolio created by the Inheritance card (input/inheritance.js): {file,key,base} and the calendar year it enters the plan
}
// Real estate asset (per person, any number): a passive asset with no income stream — no dividends, tax-exempt yield, foreign credit, AUM fee,
// type (IDGT) or expense funding. `balance` = value today ($, today's $) entered AFTER TAX, counting any gain covered by an exemption (e.g. the
// home-sale exclusion) at full value, so the app computes no tax on it. `basis` = cost basis in dollars, today's $ (blank = no unrealized gain
// today; capped at the value). Saves from the short-lived % version (`basisPct`) are converted on load. `growth` = annual change, default 'inflation' (flat in today's $). `bene` = Joint owned with
// spouse. The basis is a fixed nominal amount, so in today's $ it erodes with inflation, and steps up to value when the owner passes (to the
// surviving spouse if jointly owned; otherwise the property leaves the plan, like a brokerage portfolio).
function defaultRealEstate(n) {
  // exempt: gain excluded from tax per living owner when sold, today's $ (e.g. the $250,000 home-sale exclusion); a jointly owned property counts both owners while both live.
  // niitStatus: how a sale's taxable gain is treated for the 3.8% Net Investment Income Tax. 'investment' (default) = investment / personal-use property, the gain above `exempt` is net
  // investment income; 'business' = used in a trade or business the owner materially participates in (not a passive activity), so the gain is not net investment income.
  // sellMode: when the property is sold ('never' default | 'ltc' = the year the last person starts LTC | 'passing' = the year of the last passing | 'age' = the owner reaches `sellAge`);
  // sellTo: id of the brokerage portfolio that receives the value and cost basis ('' = automatic: the owner's first non-IDGT portfolio, then the spouse's).
  return {
    id: uid(),
    enabled: true,
    hidden: false,
    name: '',
    balance: 0,
    basis: null,
    exempt: 0,
    niitStatus: 'investment',
    growth: defaultChange('inflation', 0),
    bene: false,
    sellMode: 'never',
    sellAge: 80,
    sellTo: '',
    inh: null,
    startYear: null
  }; // inh/startYear: as on a brokerage portfolio (Inheritance card)
}
function reBasisEntered(r) {
  return !!r && r.basis != null && r.basis !== '' && Number.isFinite(Number(r.basis));
}
// Annuity (per person, any number): `value` = current account value (today's $), `premium` = cost basis / premium paid ($, blank = value,
// i.e. no gain), `growth` = credited rate, NET of all fees (an annual-change spec), `ar` = payout Start–End age,
// `payoutMode` ('fixed' = fixed nominal $ `payout`, no inflation/COLA | 'pct' = `payoutPct` % of the account value each year),
// `tax` = payout tax treatment ('taxable' | 'lifo' | 'exclusion' | 'exempt'; see compute/projection.js simulateAnnuity) with `exemptPct` for 'exempt',
// `pb` = passing (death) benefit ('fixed' = fixed nominal $ `pbFixed` | 'initial' = initial account value, nominal | 'value' = account value at passing)
// and `bene` (contract continues to the surviving spouse).
function defaultAnnuity(n) {
  return {
    id: uid(),
    enabled: true,
    hidden: false,
    name: '',
    value: 0,
    premium: null,
    growth: defaultChange('custom', 4),
    ar: defaultAgeRange('custom', 67, 'passing', 0),
    payoutMode: 'fixed',
    payout: 0,
    payoutPct: 5,
    tax: 'lifo',
    exemptPct: 100,
    pb: 'value',
    pbFixed: 0,
    bene: false
  };
}
// One rental property: `amount` = TAXABLE (net, after depreciation) rental income, today's $; `depreciation` = annual non-cash
// depreciation, today's $ (added to household cash income but untaxed — see projection). Own age range / annual change / survivor flag.
// `niitStatus`: 'passive' (default) = a passive rental, so its net income is net investment income (3.8% NIIT); 'business' = a rental that is a trade or business the
// owner materially participates in (e.g. a real estate professional, or substantial services), which is excluded from NII. Saves without it behave as 'passive'.
// Older saves held a single `person.rental`; hydrateState turns it into the first entry of `rentals`.
function defaultRental(n) {
  return Object.assign(defaultAgeRangedItem(0, 'inflation', 0, 'now', 0, 'passing', 0), {
    id: uid(),
    enabled: true,
    hidden: false,
    name: '',
    depreciation: 0,
    niitStatus: 'passive'
  });
}
// Inherited IRA (Inheritance card, js/input/inheritance.js): a pre-tax ('ira') or Roth ('roth') IRA inherited from another plan. `balance` = value when it
// arrives (today's $), `startYear` = calendar year it arrives (the last passing in the source plan), `growth` = annual change. It is always empty by the end of the
// 10th year after arrival. There is no withdraw option: `rmdStarted` (set automatically from the source plan on import; true = the deceased had already started RMDs)
// makes the current holder take an RMD every year by the holder's own age (the surviving spouse's, once the spouse takes over) until year 10 empties it; with
// `rmdStarted` false (and always for a Roth IRA) nothing is forced until year 10. Not editable. Saves without the field behave as true (the earlier behaviour).

// `inh` = {file,key,base} (where it came from and the inherited values, so edits can be flagged and survive a re-import).
function defaultInheritedIra() {
  // It carries the parameters of the matching Pre-tax IRA / Roth IRA card that an inherited IRA can really have: `bene` (the spouse takes it over when its holder passes; the
  // 10-year deadline does not move) and, pre-tax only, the annual-withdraw fields (conv, convMode, convIrmaaPct, convOrdPct, convStartMode, convStart, convStartBracket,
  // convStartItemized). Not available, so not offered: a start / end age range (everything starts when it is inherited and ends by year 10) and IRA stretch (never beyond 10 years,
  // whoever inherits it next).
  return {
    id: uid(),
    enabled: true,
    hidden: false,
    name: '',
    kind: 'ira',
    balance: 0,
    startYear: null,
    growth: defaultChange('offset', 3),
    rmdStarted: true,
    aum: false,
    bene: false,
    conv: 0,
    convToRoth: false,
    convMode: 'fixed',
    convIrmaaPct: 40,
    convOrdPct: 32,
    convStartMode: 'now',
    convStart: 0,
    convStartBracket: 24,
    convStartItemized: 35000,
    inh: null
  };
}
function defaultPerson(idx) {
  const by = THIS_YEAR - (idx === 0 ? 63 : 61);
  return {
    id: 'p' + (idx + 1),
    name: 'Person ' + (idx + 1),
    birthYear: by,
    birthMonth: 1,
    wage: {enabled: false, hidden: true, amount: 0, ar: defaultAgeRange('now', 0, 'custom', 65), change: defaultChange('inflation')},
    ss: {enabled: true, hidden: false, pia: 0, fra: fraForBirthYear(by), started: false, claimAge: fraForBirthYear(by)},
    pension: defaultAgeRangedItem(0, 'inflation', 0, 'now', 0, 'passing', 0),
    annuities: [], // any number of annuities (see defaultAnnuity); Add/Remove on the Annuity card
    rentals: [], // any number of rental properties (see defaultRental); Add/Remove on the Rental income card
    brokerage: [],
    inhIras: [], // inherited pre-tax / Roth IRAs (see defaultInheritedIra); created and removed by the Inheritance card
    inheritance: {sources: [], hidden: true}, // Inheritance card (starts hidden = body collapsed): one entry per imported plan file {id,file,importedAt,startYear,assets:[{key,type,label,value,snap,pct}]} (js/input/inheritance.js)
    realEstate: [], // any number of real estate assets (see defaultRealEstate); Add/Remove on the Real estate card
    ira: {
      enabled: false,
      hidden: true,
      balance: 0,
      growth: defaultChange('offset', 3),
      ar: defaultAgeRange('rmd', 0, 'passing', 0),
      bene: false,
      conv: 0,
      convToRoth: true,
      convMode: 'fixed',
      convIrmaaPct: 40,
      convOrdPct: 32,
      convStartMode: 'rmd',
      convStart: 0,
      convStartBracket: 24,
      convStartItemized: 35000,
      stretch: false,
      aum: false
    }, // aum: the balance counts toward the AUM fee base (like a portfolio's AUM box). conv* = the ANNUAL WITHDRAW from this pre-tax IRA (formerly "annual Roth conversion"); convToRoth: true (default) = the withdraw is a Roth conversion (goes into the Roth IRA), false = an ordinary withdrawal (taxed, spendable cash). convMode: 'fixed' ($/yr, today's $ = conv) or 'bracket' (convert as much as fits BELOW the IRMAA bracket and the ordinary bracket chosen with the sliders; stops in CONV_*_STOPS, null = no limit); convStartMode: 'rmd' (conversions begin at the IRA's Start / RMD age), 'now', 'custom' (uses convStart), or a trigger that starts conversions the first year it is met and keeps them going: 'bracket' (taxable ordinary income before any conversion is below the convStartBracket % bracket), 'itemized' (itemized deductions before any conversion exceed convStartItemized, today's $) or 'ltc' (the first LTC start)
    roth: {enabled: false, hidden: true, balance: 0, growth: defaultChange('offset', 3), bene: false, stretch: false, aum: false}
  };
}
// Chart panels. Every chart lives in its own panel on a 2- or 3-column grid (display/chartPanels.js). Display-only settings are part of `state.ui`, so they are
// saved to file / autosave, restored on load and put back to these defaults on Reset:
//   ui.chartHidden[key] — the panel's Hide checkbox (true = collapsed to its title bar). Default: hidden for CHART_DEFAULT_HIDE_KEYS, shown for every other chart.
//   ui.gridCols         — 2 or 3: the number of grid columns (the 2×N / 3×N toggle right of the Scale buttons). Default 3.
//   ui.chartPos[key]    — {r,c[,s:2]} (s:2 = enlarged to a 2×2 block, 3×N only; see display/chartPanels.js), the panel's grid row and column in the grid that is on screen (0-based; `gridCols` columns). The user can drag a panel to any free or
//                         occupied cell; cells nobody occupies stay blank. Defaults below, one per layout.
//   ui.chartPosAlt[key] — the same, for the OTHER layout, kept so toggling 2×N ↔ 3×N brings back the arrangement that layout had.
//   ui.stressCfg / ui.mcCfg — the Stress test card's and the Monte Carlo card's settings (every choice and number in the card, and its Hide box); null = the card's defaults. Saved, restored on load and reset like the rest of `state.ui` (display/stressPanel.js, display/mcPanel.js).
//   ui.marketPaths      — the plan's saved market scenarios: full-horizon yearly stock returns and inflation (MarketPath, compute/marketScenario.js). Plan-independent, so they are carried across plan scenarios A/B/C like the rest of `ui`; written only by a user click (a chat card's "Add to Stress test card", compute/scenarioApi.js), sanitized on load.
//   ui.cardOrder        — the order of those two cards under the chart grid, ['stressPanel','mcPanel'] or the reverse (null = the default order; display/cardStack.js).
//   ui.chartYMax[key]   — each chart's Y-axis maximum (null = fit automatically on the next draw). Saved and restored with the plan; the Same-scale buttons and each chart's
//                         Rescale button change it (see chartHelpers.js).
// Keys are the keys of the `charts` registry (display/chartHelpers.js).
const CHART_KEYS = [
  'expense',
  'incomeMagi',
  'income',
  'incomeOrd',
  'incomeQual',
  'tax',
  'taxOrd',
  'taxQual',
  'asset',
  'idgt',
  'ira',
  'ltcg',
  'inhIncome',
  'ss',
  'tss',
  'inflation',
  'market'
];
const GRID_COLS_DEFAULT = 3;
const CHART_DEFAULT_HIDE_KEYS = ['expense', 'income', 'tax', 'asset', 'idgt', 'ira', 'ltcg', 'inflation', 'market']; // Hide checked by default; every other chart starts shown
// Left → right, top → bottom.
// 2 × N:  Annual expenses · Annual income  /  IRA · LTCG  /  Total tax · Asset value  /  Taxable ordinary · Taxable qualified  /  MAGI · Inheritance income  /
//         Ordinary income tax · QDIV/LTCG/NIIT tax  /  IDGT value · (blank)  /  Inflation rate · Market return %  /  Cumulative household SS · Social Security tax.
// 3 × N:  Annual expenses · (blank) · MAGI  /  Annual income · Taxable ordinary · Taxable qualified  /  (blank) · IRA · LTCG  /
//         Total tax · Ordinary income tax · QDIV/LTCG/NIIT tax  /  Asset value · IDGT value · Inheritance income  /  Inflation rate · Market return %  /  Cumulative household SS · Social Security tax.
const CHART_DEFAULT_POS_BY_COLS = {
  2: {
    expense: {r: 0, c: 0},
    income: {r: 0, c: 1},
    ira: {r: 1, c: 0},
    ltcg: {r: 1, c: 1},
    tax: {r: 2, c: 0},
    asset: {r: 2, c: 1},
    incomeOrd: {r: 3, c: 0},
    incomeQual: {r: 3, c: 1},
    incomeMagi: {r: 4, c: 0},
    inhIncome: {r: 4, c: 1},
    taxOrd: {r: 5, c: 0},
    taxQual: {r: 5, c: 1},
    idgt: {r: 6, c: 0},
    inflation: {r: 7, c: 0},
    market: {r: 7, c: 1},
    ss: {r: 8, c: 0},
    tss: {r: 8, c: 1}
  },
  3: {
    expense: {r: 0, c: 0},
    incomeMagi: {r: 0, c: 2},
    income: {r: 1, c: 0},
    incomeOrd: {r: 1, c: 1},
    incomeQual: {r: 1, c: 2},
    ira: {r: 2, c: 1},
    ltcg: {r: 2, c: 2},
    tax: {r: 3, c: 0},
    taxOrd: {r: 3, c: 1},
    taxQual: {r: 3, c: 2},
    asset: {r: 4, c: 0},
    idgt: {r: 4, c: 1},
    inhIncome: {r: 4, c: 2},
    inflation: {r: 5, c: 0},
    market: {r: 5, c: 1},
    ss: {r: 6, c: 0},
    tss: {r: 6, c: 1}
  }
};
function otherGridCols(cols) {
  return cols === 3 ? 2 : 3;
}
function defaultChartHidden(hidden) {
  const o = {};
  CHART_KEYS.forEach(k => {
    o[k] = hidden === undefined ? CHART_DEFAULT_HIDE_KEYS.includes(k) : !!hidden;
  });
  return o;
}
function defaultChartPos(cols) {
  const d = CHART_DEFAULT_POS_BY_COLS[cols === 3 ? 3 : 2],
    o = {};
  CHART_KEYS.forEach(k => {
    o[k] = {...d[k]};
  });
  return o;
}
// A saved layout is kept as far as it is valid: a missing / out-of-range / duplicate position is replaced by the first free cell (row-major).
// Where the Inflation chart used to sit by default (earlier builds): a saved layout with it still there gets the current default cell (a new bottom row) instead.
const LEGACY_INFLATION_CELLS = {
  2: [
    [6, 1],
    [7, 1]
  ],
  3: [[5, 2]]
};
// The default of the build before this one: Cumulative household SS · Social Security tax, then Inflation · Market return below them. A saved layout that is exactly that (nobody moved them) takes the current default (Inflation · Market return above SS · SS tax).
const PREV_DEFAULT_BOTTOM = {
  2: {ss: [7, 0], tss: [7, 1], inflation: [8, 0], market: [8, 1]},
  3: {ss: [5, 0], tss: [5, 1], inflation: [6, 0], market: [6, 1]}
};
function normalizeChartPos(p, cols) {
  cols = cols === 3 ? 3 : 2;
  const pd = PREV_DEFAULT_BOTTOM[cols];
  if (p && Object.keys(pd).every(k => p[k] && p[k].r === pd[k][0] && p[k].c === pd[k][1])) {
    p = Object.assign({}, p);
    Object.keys(pd).forEach(k => {
      p[k] = {...CHART_DEFAULT_POS_BY_COLS[cols][k]};
    });
  }
  if (p && p.inflation && (LEGACY_INFLATION_CELLS[cols] || []).some(([r, c]) => p.inflation.r === r && p.inflation.c === c)) {
    p = Object.assign({}, p);
    delete p.inflation;
  }
  const out = {},
    taken = new Set(),
    cell = (r, c) => r + ',' + c,
    bad = [];
  const valid = v =>
    v &&
    Number.isInteger(Number(v.r)) &&
    Number.isInteger(Number(v.c)) &&
    Number(v.r) >= 0 &&
    Number(v.r) < 200 &&
    Number(v.c) >= 0 &&
    Number(v.c) < cols;
  // Enlarged charts (s:2 = a 2×2 block, 3×N only) claim their four cells first. The anchor column is clamped so the block fits (c ≤ 1); a block that overlaps another
  // enlarged one is dropped back to normal size. In 2×N the flag is kept (dormant, one cell) so toggling back to 3×N restores the big chart.
  if (cols === 3)
    CHART_KEYS.forEach(k => {
      const v = p && p[k];
      if (!valid(v) || v.s !== 2) return;
      const r = +v.r,
        c = Math.min(+v.c, 1),
        cells = [
          [r, c],
          [r, c + 1],
          [r + 1, c],
          [r + 1, c + 1]
        ].map(x => cell(x[0], x[1]));
      if (cells.some(x => taken.has(x))) return;
      cells.forEach(x => taken.add(x));
      out[k] = {r, c, s: 2};
    });
  CHART_KEYS.forEach(k => {
    if (out[k]) return; // already placed as a block
    const keepBig = cols !== 3 && p && p[k] && p[k].s === 2;
    const v = p && p[k],
      r = Number(v && v.r),
      c = Number(v && v.c);
    if (valid(v) && !taken.has(cell(r, c))) {
      out[k] = keepBig ? {r, c, s: 2} : {r, c};
      taken.add(cell(r, c));
    } else bad.push(k);
  });
  const dflt = CHART_DEFAULT_POS_BY_COLS[cols];
  bad.forEach(k => {
    const d = dflt && dflt[k]; // a chart added after the save was made (not in the saved layout at all) takes its default cell when that is free
    if (!(p && p[k]) && d && !taken.has(cell(d.r, d.c))) {
      out[k] = {r: d.r, c: d.c};
      taken.add(cell(d.r, d.c));
      return;
    }
    let r = 0,
      c = 0;
    while (taken.has(cell(r, c))) {
      if (++c >= cols) {
        c = 0;
        r++;
      }
    } // first free cell, row-major
    out[k] = {r, c};
    taken.add(cell(r, c));
  });
  return out;
}
// The Expenses and Tax & Optimizations panels each have a Hide box for the whole panel (assumpHide.expenses / assumpHide.taxOpt, default hidden), and every feature inside is a card with its own Hide box (default hidden); General has one for the whole panel (default shown).
const ASSUMP_HIDE_DEFAULT = {
  general: false,
  expenses: true,
  taxOpt: true,
  ltc: true,
  withdraw: true,
  guardrail: true,
  medShock: true,
  aum: true,
  stateTax: true,
  scgl: true,
  swap: true,
  pfWithdraw: true,
  futureTax: true
};
// Display order of the income-source cards (`state.ui.incomeOrder`), shared by every person column so married spouses reorder together.
const INCOME_CARD_KEYS = ['wage', 'ss', 'pension', 'rental', 'brokerage', 'realestate', 'annuity', 'ira', 'roth', 'inhira', 'inheritance'];
// A saved order is kept as far as it is valid: unknown / duplicate keys are dropped and any card missing from it (e.g. one added
// after the save was written) is appended in its default position order.
function normalizeIncomeOrder(o) {
  const out = [];
  (Array.isArray(o) ? o : []).forEach(k => {
    if (INCOME_CARD_KEYS.includes(k) && !out.includes(k)) out.push(k);
  });
  INCOME_CARD_KEYS.forEach(k => {
    if (!out.includes(k)) out.push(k);
  });
  return out;
}
