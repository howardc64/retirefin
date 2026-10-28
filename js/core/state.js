'use strict';
// ═══════════════════════════════════════════════════════════════
// CORE / STATE — the app's single state model: `defaultState()`, hydration of loaded/imported files, the `state` variable itself,
// and dot-path get/set into `state` used by every input control's onchange handler.
// Split by job (loaded in this order): planSlots.js (which autosave slot this tab uses), defaults.js (default values and chart-grid layout),
// state.js (this file), persistence.js (autosave, save / load / reset).
// ═══════════════════════════════════════════════════════════════
function defaultState() {
  return {
    filingStatus: 'married',
    notes: '', // free-text notes for THIS scenario (Scenario Notes button, js/display/userNotes.js); saved with the plan file. The global Notes button's text is `ui.globalNotes` (it must exist in the default `ui` below, or hydrateState drops it on load/reload)
    liveId: '', // identity of this plan on the live link (input/liveLink.js): made on first use, saved with the plan file
    inflation: 0.03,
    people: [defaultPerson(0), defaultPerson(1)],
    passing: {p1: 85, p2: 90},
    living: 0, // household living expenses per year, today's $ (funded income → dividends → asset sales)
    basisSwap: false,
    basisSwapYears: BASIS_SWAP_YEARS_DEFAULT, // Asset / basis swap (Tax & Optimizations panel): off by default. When on, living-expense portfolio assets (and their proportional basis) are swapped with IDGT assets after the first passing (married) and `basisSwapYears` years before the last passing (see projection.js)
    scgl: 0,
    scglEnabled: true, // SCGL carryforward; scglEnabled=false makes the projection ignore it (the amount is kept)
    ltc: {
      enabled: false,
      people: [
        {startAge: 85, cost: 100000},
        {startAge: 85, cost: 100000}
      ],
      living1: null,
      living2: LTC_LIVING2_DEFAULT
    }, // Long Term Care: per person start age (own age) and cost; household living expenses from the 1st / 2nd LTC start (today's $)
    withdrawOrder: {enabled: false, steps: []}, // Expense-shortfall withdrawal order (Expenses panel): off = the built-in order (pay-expenses portfolios, pre-tax IRA, Roth IRA). On = `steps` [{id, asset}] in order, asset = 'pf:<portfolio id>' | 'ira:<person id>' | 'roth:<person id>' | 're:<property id>' (see projection.js, runWaterfall)
    pfWithdraw: {enabled: false, ltcgPct: 0, acceptNiit: false, acceptTorpedo: false}, // Portfolio withdraw (Tax & Optimizations): when on, EVERY non-IDGT portfolio sells each year as much as fits with taxable income (ordinary + qualified) staying within the LTCG bracket `ltcgPct` (a stop of LTCG_STOPS = [0,15,20]; 20 = no limit). Proceeds are household cash income; the gain share is realized LTCG. acceptNiit (default false): when false a sale is also capped so it does not push MAGI over the NIIT threshold (a portfolio with no unrealized gain is not capped); true accepts the 3.8% NIIT. acceptTorpedo (default false): when false a sale is also capped so it does not raise this year's taxable Social Security (the "tax torpedo": each extra $ of LTCG making up to another 85c of Social Security taxable); true accepts it. No age window beyond the portfolio's own range (projection.js, "Brokerage withdraws")
    aumFee: {enabled: true, mode: 'pct', value: 0}, // AUM fee: mode 'pct' = % of the AUM balance (portfolios with `aum` checked), 'fixed' = $/yr in today's $
    medShock: {enabled: false, person: 0, age: 80, years: 3, cost: 100000}, // Late-life medical shock (Expenses card): an extra itemized medical cost of `cost` (today's $) a year for `years` years from the age `age` of person `person`, on top of any Long Term Care card. It is added to the Long Term Care cost line, so it goes through the same itemized-deduction (7.5% of AGI floor), state-tax and withdrawal logic, but does not switch living expenses to the care amount
    guardrail: {
      enabled: false,
      discPct: 30,
      iwrMode: 'initial',
      targetWR: 4,
      band: 20,
      cutPct: 10,
      prosperity: false,
      raisePct: 10,
      sunsetYears: 15,
      excludeLtc: false
    }, // Spending guardrails (Expenses panel): off by default. discPct = % of living expenses that can be cut (discretionary); the rest is essential and never cut. Each year the withdrawal rate (portfolio-funded spending / invested balance at the start of the year) is compared with the initial rate (iwrMode 'initial' = the first year without wages, 'target' = targetWR %). Above IWR×(1+band%) the discretionary spending of the NEXT year is cut by cutPct%; with prosperity on, below IWR×(1−band%) it is raised by raisePct% (never above the plan's amount). No change in the last sunsetYears years. excludeLtc: leave the Long Term Care cost out of the rate (see projection.js)
    stateTax: {enabled: false, state: 'CA', waLtcExempt: false}, // State income tax (Tax & Optimizations panel): 'CA', 'WA', 'NY' (New York State) or 'NYC' (New York State + New York City resident); off by default. Paid as a household expense, shown stacked on the Total Income Tax chart
    futureTax: {enabled: false, niitStartYear: THIS_YEAR + 10, niitSingle: NIIT_THRESH_SGL, niitMarried: NIIT_THRESH_MFJ},
    ui: {
      globalNotes: '',
      incomeOrder: INCOME_CARD_KEYS.slice(),
      chartHidden: defaultChartHidden(),
      gridCols: GRID_COLS_DEFAULT,
      chartPos: defaultChartPos(GRID_COLS_DEFAULT),
      chartPosAlt: defaultChartPos(otherGridCols(GRID_COLS_DEFAULT)),
      chartYMax: Object.fromEntries(CHART_KEYS.map(k => [k, null])),
      stressCfg: null,
      mcCfg: null,
      marketPaths: [],
      cardOrder: null,
      maxAge: null, // Age range box above the charts: last age shown (display only; null = last passing + IRA stretch; never beyond that)
      assumpHide: {...ASSUMP_HIDE_DEFAULT},
      hidePerson: null
    } // display-only, but saved/restored/reset with the plan (see above)
  };
}
// Saves written before Hide was persisted: a card with no `hidden` flag gets what the app used to show for it (collapsed
// only if it was not enabled).
// Only *missing* values are filled — a `hidden` value that is present in the file is always kept.
function fillLegacyHide(loaded) {
  if (!loaded || typeof loaded !== 'object') return;
  if (Array.isArray(loaded.people))
    loaded.people.forEach(p => {
      if (!p || typeof p !== 'object') return;
      ['wage', 'ss', 'pension', 'rental', 'ira', 'roth'].forEach(k => {
        const it = p[k];
        if (it && typeof it === 'object' && it.hidden === undefined) it.hidden = !(it.enabled === undefined ? k === 'ss' : !!it.enabled);
      });
      if (Array.isArray(p.brokerage))
        p.brokerage.forEach(b => {
          if (b && typeof b === 'object' && b.hidden === undefined) b.hidden = b.enabled === false;
        });
    });
}
// Fills in any fields missing from a loaded/imported state (e.g. an older save
// file from before a field was added) using defaults, without touching values
// that are already present.
// Resets to defaults first, then applies `loaded` on top (per spec: "on
// restore, reset before restoring"). Any field present in a loaded/imported
// file that no longer exists in the current default shape (e.g. left over
// from an older save format) is dropped rather than carried forward, and
// any field missing from the loaded file falls back to its default value.
function hydrateState(loaded) {
  const base = defaultState();
  function merge(dst, src) {
    if (src == null || typeof src !== 'object') return dst === undefined ? src : dst;
    if (Array.isArray(src)) {
      if (!Array.isArray(dst)) return src;
      // Loop to the LONGER of the two lengths — not just src's (default's) length —
      // so a loaded file with more entries than the default shape (e.g. more than
      // one brokerage portfolio) keeps every entry instead of silently truncating
      // the extras. Any index past the default array reuses its first element as
      // a field-shape template so missing/legacy fields still get sensible defaults.
      const template = src.length ? src[0] : undefined;
      const len = Math.max(src.length, dst.length);
      const out = [];
      for (let i = 0; i < len; i++) out.push(merge(dst[i], i < src.length ? src[i] : template));
      return out;
    }
    const out = {}; // fresh object — never reuses/mutates dst, so stale keys are reset away
    for (const k of Object.keys(src)) {
      out[k] = merge(dst ? dst[k] : undefined, src[k]);
    }
    return out;
  }
  fillLegacyHide(loaded);
  const out = merge(loaded, base);
  // Saved market scenarios (ui.marketPaths): keep only well-formed ones (compute/marketScenario.js msValidate); a file edited by hand or written by another tool cannot smuggle in a bad vector.
  if (typeof msSanitizeList === 'function' && out.ui) out.ui = Object.assign({}, out.ui, {marketPaths: msSanitizeList(out.ui.marketPaths)});
  // Saves from before the Expenses / Tax & Optimizations features became cards: their per-feature Hide flags are the defaults (all hidden); General keeps its own Hide.
  if (loaded && !(loaded.ui && loaded.ui.assumpHide && loaded.ui.assumpHide.general !== undefined))
    out.ui = {...out.ui, assumpHide: {...ASSUMP_HIDE_DEFAULT, general: false}};
  // Saves from before the 2×N / 3×N toggle had a fixed 3-column layout: keep that layout (and the arrangement they saved) rather than re-flowing it into 2 columns.
  if (loaded && loaded.ui && loaded.ui.chartPos && loaded.ui.gridCols === undefined)
    out.ui = {...out.ui, gridCols: 3, chartPos: loaded.ui.chartPos, chartPosAlt: defaultChartPos(2)};
  // Older saves had a per-portfolio "Withdrawal" (`living`) and "tax drag %" — both are gone. Carry the
  // withdrawals over as the household living expenses so an old plan keeps roughly the same spending.
  if (loaded && loaded.living === undefined && Array.isArray(loaded.people)) {
    out.living = loaded.people.reduce(
      (t, p) =>
        t +
        (p && Array.isArray(p.brokerage) ? p.brokerage.reduce((u, b) => u + (Number(b && b.enabled !== false && b.living) || 0), 0) : 0),
      0
    );
  }
  // Older saves had a per-portfolio Expenses toggle with its own fee drag (`expense`/`fee`) and an IRMAA checkbox (`irmaa`).
  // The fee is now one household AUM fee on the portfolios flagged `aum`; IRMAA is always a household expense. Carry the
  // old fee over: portfolios that had the fee on become AUM-checked, and the household fee takes the first % fee found
  // (or, if all were fixed $, their sum).
  if (loaded && loaded.aumFee === undefined && Array.isArray(loaded.people)) {
    const feeOn = b =>
      !!b && (b.expense !== undefined ? !!b.expense : (Number(b.fee && b.fee.value) || 0) > 0) && (Number(b.fee && b.fee.value) || 0) > 0;
    const all = [];
    loaded.people.forEach(p => {
      if (p && Array.isArray(p.brokerage))
        p.brokerage.forEach(b => {
          if (feeOn(b)) all.push(b);
        });
    });
    const pct = all.find(b => b.fee.mode !== 'fixed');
    if (pct) out.aumFee = {mode: 'pct', value: Number(pct.fee.value) || 0};
    else if (all.length) out.aumFee = {mode: 'fixed', value: all.reduce((t, b) => t + (Number(b.fee.value) || 0), 0)};
  }
  // Older saves had scheduled withdraws on each portfolio (start / end age, amount or LTCG bracket). They are now one household "Portfolio withdraw" slider
  // (Tax & Optimizations) that applies to every non-IDGT portfolio: the first enabled bracket withdraw found carries over (on, same bracket); fixed-amount ones are dropped.
  if (loaded && loaded.pfWithdraw === undefined && Array.isArray(loaded.people)) {
    let found = null;
    loaded.people.forEach(p => {
      if (p && Array.isArray(p.brokerage))
        p.brokerage.forEach(b => {
          if (!found && b && b.type !== 'idgt' && !b.idgt && Array.isArray(b.withdraws))
            found = b.withdraws.find(w => w && w.enabled !== false && w.mode === 'bracket') || null;
        });
    });
    if (found) out.pfWithdraw = {enabled: true, ltcgPct: Number.isFinite(Number(found.ltcgPct)) ? Number(found.ltcgPct) : 0};
  }
  if (loaded && loaded.ltc && out.ltc && out.ltc.people && out.ltc.people[0]) {
    if (loaded.ltc.startAge !== undefined && !Array.isArray(loaded.ltc.people)) {
      out.ltc.people[0] = {startAge: Number(loaded.ltc.startAge) || 85, cost: Number(loaded.ltc.cost) || 0};
      out.ltc.living1 = Number(loaded.ltc.living) || 0;
    } else if (loaded.ltc.living1 === undefined && Array.isArray(loaded.ltc.people)) {
      // Older per-person living expenses: the earlier-starting person's becomes the 1st LTC amount, the later's the 2nd.
      const lp = loaded.ltc.people,
        ppl = out.people || [];
      const sk = i => (Number(lp[i] && lp[i].startAge) || 0) - (ppl[i] ? currentAge(ppl[i]) : 0);
      const order = lp.length > 1 && sk(1) < sk(0) ? [1, 0] : [0, 1];
      out.ltc.living1 = Number(lp[order[0]] && lp[order[0]].living) || 0;
      out.ltc.living2 = Number(lp[order[1]] && lp[order[1]].living) || 0;
    }
  }
  if (Array.isArray(out.people))
    out.people.forEach((p, pi) => {
      if (!Array.isArray(p.brokerage)) p.brokerage = [];
      // Rentals: older saves had one `rental` object per person — it becomes the first rental property (if it was in use).
      const lp0 = loaded && Array.isArray(loaded.people) ? loaded.people[pi] : null;
      if (!Array.isArray(p.rentals)) p.rentals = [];
      if (lp0 && lp0.rentals === undefined && lp0.rental && typeof lp0.rental === 'object') {
        const lr = lp0.rental;
        if (lr.enabled || Number(lr.amount) > 0 || Number(lr.depreciation) > 0)
          p.rentals = [Object.assign(defaultRental(1), lr, {id: uid(), name: '', hidden: !!lr.hidden, enabled: !!lr.enabled})];
      }
      p.rentals = p.rentals.map(r => merge(r, defaultRental(0)));
      if (!Array.isArray(p.inhIras)) p.inhIras = [];
      p.inhIras = p.inhIras.map(x => {
        const y = merge(x, defaultInheritedIra());
        y.convToRoth = false;
        return y;
      }); // an inherited IRA can never be converted to a Roth IRA
      if (!p.inheritance || !Array.isArray(p.inheritance.sources)) p.inheritance = {sources: []};
      if (typeof p.inheritance.hidden !== 'boolean') p.inheritance.hidden = true; // the Inheritance card starts collapsed (also for older saves)
      if (!Array.isArray(p.annuities)) p.annuities = [];
      p.annuities = p.annuities.map(a => merge(a, defaultAnnuity(0)));
      if (!p.stock || !Array.isArray(p.stock.grants)) p.stock = {enabled: false, hidden: true, grants: []};
      p.stock.grants = p.stock.grants.map(g => merge(g, defaultStockGrant(0))); // fill fields an older save lacks (a grant has no default entry in the base shape)
      if (!Array.isArray(p.realEstate)) p.realEstate = [];
      p.realEstate = p.realEstate.map(r => {
        // Older real estate saves held the basis as a % of value (`basisPct`): convert to dollars.
        if (r && r.basis === undefined && r.basisPct != null && r.basisPct !== '' && Number.isFinite(Number(r.basisPct))) {
          r = Object.assign({}, r, {basis: Math.round(((Number(r.balance) || 0) * Math.min(100, Math.max(0, Number(r.basisPct)))) / 100)});
        }
        return merge(r, defaultRealEstate(0));
      });
      // Older saves have no convStartMode: a plan that already converts keeps its old start (convStart>0 = that age, else now); one that
      // does not convert simply takes the new default (RMD start).
      const lpIra = loaded && Array.isArray(loaded.people) && loaded.people[pi] && loaded.people[pi].ira;
      if (p.ira && lpIra && lpIra.convStartMode === undefined) {
        if (Number(p.ira.conv) > 0) p.ira.convStartMode = Number(p.ira.convStart) > 0 ? 'custom' : 'now';
      }
      // The Roth-conversion slider runs 0 → the pre-tax IRA balance (a conversion can't exceed what is there): trim older saves.
      if (p.ira && Number(p.ira.conv) > Math.max(0, Number(p.ira.balance) || 0)) p.ira.conv = Math.max(0, Number(p.ira.balance) || 0);
      // Fill any missing fields (older saves) from a default portfolio, then drop untouched blank
      // ones (zero balance and still the auto-generated name) that older versions created on start.
      p.brokerage = p.brokerage
        .map(b => {
          // Legacy saves stored the cost basis in dollars (`basis`); convert to % of start balance.
          if (b && b.basisPct === undefined && b.basis != null && b.basis !== '' && Number.isFinite(Number(b.basis))) {
            const bal = Number(b.balance) || 0;
            b = Object.assign({}, b, {
              basisPct: bal > 0 ? Math.round(Math.min(100, Math.max(0, (Number(b.basis) / bal) * 100)) * 100) / 100 : null
            });
          }
          // Saves that predate "Pay expenses" had every non-IDGT portfolio paying expenses: keep that behavior.
          if (b && b.payExp === undefined) b = Object.assign({}, b, {payExp: !b.idgt});
          // Portfolio type (living expense & income | IDGT) replaces the Pay expenses / Reinvest / IDGT checkboxes.
          if (b) {
            const t = b.type === 'idgt' || (b.type === undefined && b.idgt) ? 'idgt' : 'living';
            b = Object.assign({}, b, {type: t, idgt: t === 'idgt', payExp: t !== 'idgt', reinvest: t !== 'idgt'});
          }
          // Legacy fee-drag portfolios become AUM-checked (see the aumFee migration above).
          if (b && b.aum === undefined) {
            const fv = Number(b.fee && b.fee.value) || 0;
            b = Object.assign({}, b, {aum: (b.expense !== undefined ? !!b.expense : fv > 0) && fv > 0});
          }
          return merge(b, defaultBrokeragePortfolio(0));
        })
        .filter(b => !((Number(b.balance) || 0) === 0 && (!b.name || !b.name.trim() || /^Brokerage Portfolio \d+$/.test(b.name.trim()))));
      if (p.odiv && Number(p.odiv.amount) > 0 && !p.brokerage.some(b => Number(b.balance) > 0)) {
        const od = Number(p.odiv.amount) || 0,
          q = Number(p.qdiv?.amount) || 0;
        p.brokerage.push(
          merge(
            {
              id: uid(),
              enabled: true,
              name: 'Brokerage Portfolio 1',
              balance: od / 0.02,
              growth: defaultChange('offset', 3),
              yield: 2,
              qdivPct: od > 0 ? Math.min(100, Math.max(0, (q / od) * 100)) : 70,
              ar: defaultAgeRange('now', 0, 'passing', 0),
              bene: !!p.odiv.bene
            },
            defaultBrokeragePortfolio(0)
          )
        );
      }
      delete p.odiv;
      delete p.qdiv;
    });
  if (!out.ui) out.ui = {};
  // merge() keeps only the keys the defaults have ({r,c}), so an enlarged chart's size flag (s:2, see normalizeChartPos) is copied back from the loaded file here.
  ['chartPos', 'chartPosAlt'].forEach(n => {
    const lp = loaded && loaded.ui && loaded.ui[n],
      dp = out.ui[n];
    if (lp && dp)
      CHART_KEYS.forEach(k => {
        if (lp[k] && lp[k].s === 2 && dp[k]) dp[k] = {...dp[k], s: 2};
      });
  });
  out.ui.incomeOrder = normalizeIncomeOrder(out.ui.incomeOrder);
  out.ui.hidePerson = out.ui.hidePerson === 0 || out.ui.hidePerson === 1 ? out.ui.hidePerson : null; // married: which person's Income & Assets column is collapsed (null = both shown)
  out.ui.maxAge = Number(out.ui.maxAge) > 0 ? Math.round(Number(out.ui.maxAge)) : null;
  out.ui.gridCols = out.ui.gridCols === 3 ? 3 : 2;
  out.ui.chartPos = normalizeChartPos(out.ui.chartPos, out.ui.gridCols); // a layout from a file is kept as saved, repaired only if it is invalid
  out.ui.chartPosAlt = normalizeChartPos(out.ui.chartPosAlt, otherGridCols(out.ui.gridCols));
  if (typeof inhAlignPortfolioStarts === 'function') inhAlignPortfolioStarts(out); // older saves: an inherited portfolio's Start age = the age it was inherited
  return out;
}
let state = defaultState();

// Quiet autosave to this browser only, so an in-progress session survives a
// reload. The file save/load below is the real, portable save per spec.
// ── PATH GET/SET (dot-notation into `state`) ──
function setPath(path, value) {
  const keys = path.split('.');
  let o = state;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = /^\d+$/.test(keys[i]) ? +keys[i] : keys[i];
    o = o[k];
  }
  const last = keys[keys.length - 1];
  o[/^\d+$/.test(last) ? +last : last] = value;
}
