'use strict';
// DISPLAY / EXCEL — the Inputs sheet, and the Monte Carlo / stress trial context and sheet.

// ═══ Inputs sheet ════════════════════════════════════════════════════════════════════════════════
// Every assumption / input of the saved plan, laid out label | value | note. `addr(name)` finds a cell for the account sheets.
function xlsxInputsSheet(proj, trial) {
  const sh = xlsxSheet(),
    names = [],
    addr = {};
  let r = 0;
  const st = trial ? trial.state : state; // a Monte Carlo trial is replayed on its own copy of the scenario: its drawn passing ages, care and inheritance
  const put = (label, value, o) => {
    o = o || {};
    xlsxPut(sh, r, 0, xlsxTxt(label));
    const c = typeof value === 'number' ? xlsxNum(value, o.fmt || xlsxLabelFmt(label)) : xlsxVal(value, o.fmt);
    if (c) xlsxPut(sh, r, 1, c);
    if (o.note) xlsxPut(sh, r, 2, xlsxTxt(o.note));
    if (o.key) addr[o.key] = `Inputs!$B$${r + 1}`;
    if (o.name) names.push({Name: o.name, Ref: `Inputs!$B$${r + 1}`});
    r++;
  };
  const head = t => {
    r++;
    xlsxPut(sh, r, 0, xlsxTxt(t));
    r++;
  };
  const yn = v => (v ? 'Yes' : 'No');
  // An asset created by the Inheritance card enters the plan in its start year (balance = value at the source plan's last passing, in today's $; basis stepped up).
  const inhNote = o =>
    o && o.inh
      ? {
          note: `Inherited from ${o.inh.file || 'another plan'}: enters the scenario in ${Number(o.startYear) || 'its start year'}; the balance is its value then (today's $)`
        }
      : undefined;
  xlsxPut(
    sh,
    r++,
    0,
    xlsxTxt(
      "INPUTS & ASSUMPTIONS of the scenario (all money in today's $). Cells marked as a name below are used by formulas in the other sheets; the rest document the scenario the app solved."
    )
  );
  xlsxPut(
    sh,
    r++,
    0,
    xlsxTxt(
      'Changing a named cell here recalculates the formula columns, but the income / expense-funding / Roth-conversion amounts on "Projection by year" are the app\'s solved values: re-export after changing the scenario in the app for those.'
    )
  );
  if (trial) {
    xlsxPut(
      sh,
      r++,
      0,
      xlsxTxt(
        `${trial.label}: the passing ages, Long Term Care and inheritance below are ${trial.view === 'D' ? "the scenario's own" : "this trial's random draws"}; its yearly inflation and market returns are on the "MC trial" sheet.`
      )
    );
  }
  head('General (filing status, inflation; passing ages are under each person)');
  put('Filing status', st.filingStatus === 'married' ? 'Married (MFJ)' : 'Single', {key: 'filing'});
  put('Year 0 (first projected year)', THIS_YEAR, {name: 'BaseYear', fmt: XLSX_YEAR});
  put(trial ? "Inflation (SS COLA assumed equal): the scenario's average rate" : 'Inflation (SS COLA assumed equal)', st.inflation, {
    name: 'Inflation',
    fmt: '0.00%',
    key: 'inflation',
    note: trial ? "This trial's inflation varies by year: see the MC trial sheet" : undefined
  });
  head('Expenses');
  put('Household living expenses / yr', Number(st.living) || 0, {fmt: XLSX_MONEY, key: 'living'});
  const ltc = st.ltc || {};

  put('LTC modeled', yn(ltc.enabled));
  (ltc.people || []).forEach((L, i) => {
    if (i > 0 && st.filingStatus !== 'married') return;
    put(`Person ${i + 1}: LTC starts at age`, Number(L.startAge) || 0);
    put(`Person ${i + 1}: LTC cost / yr`, Number(L.cost) || 0, {fmt: XLSX_MONEY});
  });
  put(
    'Household living expenses once 1st LTC starts',
    Math.max(0, Number(ltc.living1 != null ? ltc.living1 : ltcLiving1Default(st.filingStatus === 'married')) || 0),
    {fmt: XLSX_MONEY}
  );
  put('Household living expenses once 2nd LTC starts', Number(ltc.living2) || 0, {fmt: XLSX_MONEY});
  {
    const wo = st.withdrawOrder || {},
      lab = {};
    withdrawAssets().forEach(a => {
      lab[a.key] = a.label;
    });
    put('Expense shortfall withdrawal order', yn(!!wo.enabled), {
      note: wo.enabled
        ? (wo.steps || []).map((x, i) => i + 1 + '. ' + (lab[x.asset] || '(missing)')).join('; ') || '(no steps)'
        : 'built-in order'
    });
  }
  {
    const g = st.guardrail || {};
    put('Spending guardrails enabled', yn(!!g.enabled), {
      note: g.enabled
        ? 'Cut next year\'s discretionary spending when the withdrawal rate passes the cut line (see the Projection columns "Guardrail: ...")'
        : 'off'
    });
    if (g.enabled) {
      put('  discretionary share of living expenses (%)', Number(g.discPct) || 0, {fmt: XLSX_PCTNUM});
      put('  starting withdrawal rate', g.iwrMode === 'target' ? 'Target rate' : 'First year without wages', {
        note: g.iwrMode === 'target' ? (Number(g.targetWR) || 0) + '%' : undefined
      });
      put('  cut when the rate is above the starting rate by (%)', Number(g.band) || 0, {name: 'Gr_Band', fmt: XLSX_PCTNUM});
      put('  cut discretionary spending by (%)', Number(g.cutPct) || 0, {fmt: XLSX_PCTNUM});
      put('  prosperity rule (raise when the rate falls by the same margin)', yn(!!g.prosperity), {
        note: g.prosperity ? 'raise by ' + (Number(g.raisePct) || 0) + '%' : undefined
      });
      put('  no changes in the last (years)', Number(g.sunsetYears) || 0, {fmt: XLSX_COUNT});
      put('  Long Term Care cost left out of the rate', yn(!!g.excludeLtc));
    }
  }
  {
    const m = st.medShock || {};
    put('Late-life medical shock enabled', yn(!!m.enabled), {
      note: m.enabled
        ? 'Added to the Long Term Care cost, so it is itemized like it (above 7.5% of AGI) and paid by the withdrawal order'
        : 'off'
    });
    if (m.enabled) {
      {
        const wi = st.filingStatus === 'married' && m.person === 1 ? 1 : 0;
        put('  whose age', displayPersonName((st.people || [])[wi], wi));
      }
      put('  starts at age', Number(m.age) || 0);
      put('  lasts (years)', Number(m.years) || 0, {fmt: XLSX_COUNT});
      put('  extra medical cost / yr', Number(m.cost) || 0, {fmt: XLSX_MONEY});
    }
  }
  const aum = st.aumFee || {};
  put('AUM fee enabled', yn(aum.enabled), {});
  put('AUM fee mode', aum.mode === 'pct' ? '% of AUM balance' : "Fixed $ / yr (today's $)");
  put('AUM fee value', Number(aum.value) || 0, {fmt: aum.mode === 'pct' ? XLSX_PCTNUM : XLSX_MONEY});
  head('Tax & Optimizations');
  // (State income tax)
  put('State income tax enabled', yn(st.stateTax && st.stateTax.enabled), {name: 'State_On'});
  if (xlsxSelectedState()) put('State', xlsxSelectedState() === 'WA' ? 'Washington' : 'California');
  put('Suspended capital-gain loss (SCGL) pool enabled', yn(st.scglEnabled !== false), {key: 'scglOn'});
  put('SCGL pool', Number(st.scgl) || 0, {fmt: XLSX_MONEY, key: 'scgl'});
  names.push({Name: 'SCGL_Start', Ref: `Inputs!$B$${r + 1}`});
  xlsxPut(sh, r, 0, xlsxTxt('SCGL used by the projection (0 when not enabled)'));
  xlsxPut(
    sh,
    r,
    1,
    xlsxFml(
      `IF(${addr.scglOn.replace('Inputs!', '')}="Yes",${addr.scgl.replace('Inputs!', '')},0)`,
      st.scglEnabled === false ? 0 : Math.max(0, Number(st.scgl) || 0),
      XLSX_MONEY
    )
  );
  r++;
  put('Asset / basis swap', yn(!!st.basisSwap), {
    note: 'Years before last passing: ' + (st.basisSwapYears == null ? BASIS_SWAP_YEARS_DEFAULT : st.basisSwapYears)
  });
  {
    const pw = st.pfWithdraw || {};
    put('Portfolio withdraw (every non-IDGT portfolio)', yn(!!pw.enabled), {
      note:
        'Fills the ' +
        (pw.ltcgPct >= 20 ? '20% (no limit)' : pw.ltcgPct >= 15 ? '15%' : '0%') +
        ' LTCG bracket; ' +
        (pw.acceptNiit ? 'NIIT accepted' : 'kept under the NIIT threshold') +
        '; ' +
        (pw.acceptTorpedo ? 'Social Security tax torpedo accepted' : 'taxable Social Security not raised')
    });
  }

  put('Speculative future exemptions and brackets (NIIT thresholds) enabled', yn(st.futureTax && st.futureTax.enabled), {key: 'futOn'});
  names.push({Name: 'FutNIIT_On', Ref: `Inputs!$B$${r}`});
  put('NIIT change starts in year', Number(st.futureTax && st.futureTax.niitStartYear) || 0, {name: 'FutNIIT_Start', fmt: XLSX_YEAR});
  put('NIIT threshold, single', Number(st.futureTax && st.futureTax.niitSingle) || 0, {name: 'FutNIIT_SGL', fmt: XLSX_MONEY});
  put('NIIT threshold, married', Number(st.futureTax && st.futureTax.niitMarried) || 0, {name: 'FutNIIT_MFJ', fmt: XLSX_MONEY});

  proj.people.forEach((p, i) => {
    const nm = displayPersonName(p, i),
      pass = st.passing[p.id] != null ? st.passing[p.id] : 95;
    head(`${nm}`);
    put('Name', nm);
    put('Birth year', p.birthYear, {fmt: XLSX_YEAR, key: `birthYear${i}`});
    put('Birth month', p.birthMonth);
    put('Passing age (scenario ends)', pass, {name: `Pass_${i + 1}`});
    const w = p.wage || {};
    put('Wage income', yn(w.enabled));
    put('  amount / yr', Number(w.amount) || 0, {fmt: XLSX_MONEY});
    const s = p.ss || {};
    put('Social Security', yn(s.enabled));
    put('  PIA / month', Number(s.pia) || 0, {fmt: XLSX_MONEY});
    put('  full retirement age', Number(s.fra) || 0);
    put('  already started', yn(s.started));
    put('  claim age', Number(s.claimAge) || 0);
    const pn = p.pension || {};
    put('Pension', yn(pn.enabled));
    put('  amount / yr', Number(pn.amount) || 0, {fmt: XLSX_MONEY});
    put('  inherited by spouse', yn(pn.bene));
    const ira = p.ira || {};
    put('Pre-tax IRA', yn(ira.enabled));
    put('  balance', Number(ira.balance) || 0, {fmt: XLSX_MONEY, key: `ira${i}Bal`});
    put('  growth mode', ira.growth && ira.growth.mode, {key: `ira${i}GMode`});
    put('  growth value (% nominal, or offset %)', ira.growth ? Number(ira.growth.value) || 0 : 0, {key: `ira${i}GVal`});
    put('  Annual withdraw mode', ira.convMode === 'bracket' ? 'Up to bracket / IRMAA limits' : 'Fixed amount');
    put('  fixed withdraw / yr', Number(ira.conv) || 0, {fmt: XLSX_MONEY});
    put('  Withdraw is Roth conversion', ira.convToRoth !== false ? 'Yes' : 'No');
    put('  conversion ordinary-bracket limit (%)', ira.convOrdPct == null ? 'none' : ira.convOrdPct);
    put('  conversion IRMAA limit (Part B % over standard)', ira.convIrmaaPct == null ? 'none' : ira.convIrmaaPct);
    put('  withdraw start', ira.convStartMode);
    put('  inherited by spouse', yn(ira.bene));
    put('  held by heirs after last passing (stretch)', yn(ira.stretch));
    put('  counts toward AUM fee', yn(ira.aum));
    const ro = p.roth || {};
    put('Roth IRA', yn(ro.enabled));
    put('  balance', Number(ro.balance) || 0, {fmt: XLSX_MONEY, key: `roth${i}Bal`});
    put('  growth mode', ro.growth && ro.growth.mode, {key: `roth${i}GMode`});
    put('  growth value (% nominal, or offset %)', ro.growth ? Number(ro.growth.value) || 0 : 0, {key: `roth${i}GVal`});
    put('  inherited by spouse', yn(ro.bene));
    put('  held by heirs after last passing (stretch)', yn(ro.stretch));
    put('  counts toward AUM fee', yn(ro.aum));
    (p.inhIras || []).forEach((x, ii) => {
      const lab = `Inherited IRA ${ii + 1}: ${(x.name && x.name.trim()) || '(unnamed)'} (${x.kind === 'roth' ? 'Roth' : 'pre-tax'})`;
      put(lab, yn(x.enabled !== false), inhNote(x));
      put('  balance when inherited', Number(x.balance) || 0, {fmt: XLSX_MONEY, key: `inh${i}_${ii}Bal`});
      put('  growth mode', x.growth && x.growth.mode, {key: `inh${i}_${ii}GMode`});
      put('  growth value (% nominal, or offset %)', x.growth ? Number(x.growth.value) || 0 : 0, {key: `inh${i}_${ii}GVal`});
      put('  start year (age of the holder when inherited is on the card)', Number(x.startYear) || 0, {fmt: XLSX_YEAR});
      put('  RMDs apply (original owner had started them)', yn(x.kind !== 'roth' && x.rmdStarted !== false), {
        note: 'Emptied by the end of the 10th year after the start year'
      });
      put('  inherited by spouse', yn(x.bene));
      put('  counts toward AUM fee', yn(x.aum));
      if (x.kind !== 'roth') {
        put('  Annual withdraw mode', x.convMode === 'bracket' ? 'Up to bracket / IRMAA limits' : 'Fixed amount');
        put('  fixed withdraw / yr', Number(x.conv) || 0, {fmt: XLSX_MONEY});
        put('  withdraw start', x.convStartMode);
      }
    });
    (p.brokerage || []).forEach((b, bi) => {
      const lab = `Portfolio ${bi + 1}: ${(b.name && b.name.trim()) || '(unnamed)'}${b.idgt ? ' (IDGT)' : ''}`;
      put(lab, yn(b.enabled !== false), inhNote(b));
      put('  balance', Number(b.balance) || 0, {fmt: XLSX_MONEY, key: `pf${i}_${bi}Bal`});
      put('  growth mode', b.growth && b.growth.mode, {key: `pf${i}_${bi}GMode`});
      put('  growth value (% nominal, or offset %)', b.growth ? Number(b.growth.value) || 0 : 0, {key: `pf${i}_${bi}GVal`});
      put('  dividend yield %', Number(b.yield) || 0);
      put('  qualified share of dividends %', Number(b.qdivPct) || 0);
      put('  tax-exempt yield %', Number(b.teYield) || 0);
      put(
        '  distributed LTCG ' + (b.cgdMode === 'amt' ? "($/yr, today's $)" : '(% of balance)'),
        Number(b.cgdMode === 'amt' ? b.cgdAmt : b.cgdPct) || 0
      );
      put('  cost basis % of balance', b.basisPct == null || b.basisPct === '' ? '(blank = no gain)' : Number(b.basisPct));
      put('  foreign-income %', Number(b.foreignPct) || 0);
      put('  foreign tax credit %', Number(b.ftcPct) || 0);
      put('  type', b.type);
      put('  pays household expenses', yn(b.payExp));
      put('  reinvests excess income', yn(b.reinvest));
      put('  counts toward AUM fee', yn(b.aum));
      put('  joint with spouse / inherited', yn(b.bene));
    });
    const dump = (title, list) =>
      (list || []).forEach((o, j) => {
        put(`${title} ${j + 1}`, o.name || '');
        Object.keys(o).forEach(k => {
          const v = o[k];
          if (k === 'id' || k === 'hidden' || k === 'name') return;
          if (v && typeof v === 'object') {
            Object.keys(v).forEach(k2 => {
              if (typeof v[k2] !== 'object') put(`  ${k}.${k2}`, v[k2], {fmt: xlsxFieldFmt(k2)});
            });
          } else put(`  ${k}`, typeof v === 'boolean' ? yn(v) : v, {fmt: xlsxFieldFmt(k)});
        });
      });
    dump('Annuity', p.annuities);
    dump('Rental', p.rentals);
    (p.realEstate || []).forEach((r, ri) => {
      const lab = `Real estate ${ri + 1}: ${(r.name && r.name.trim()) || '(unnamed)'}`,
        mode = r.sellMode || 'never';
      const sellTo = (() => {
        if (!r.sellTo) return "Automatic (owner's first non-IDGT portfolio)";
        let nm = '(portfolio no longer exists)';
        st.people.forEach((q, ti) =>
          (q.brokerage || []).forEach(b => {
            if (b.id === r.sellTo) nm = `${displayPersonName(q, ti)} — ${(b.name && b.name.trim()) || 'Portfolio'}`;
          })
        );
        return nm;
      })();
      put(lab, yn(r.enabled !== false), inhNote(r));
      put('  value', Number(r.balance) || 0, {fmt: XLSX_MONEY, key: `re${i}_${ri}Val`});
      put('  cost basis', reBasisEntered(r) ? Number(r.basis) : '(blank = no unrealized gain)', {
        fmt: XLSX_MONEY,
        key: `re${i}_${ri}Basis`
      });
      put('  exemption per owner alive at a sale', Number(r.exempt) || 0, {
        fmt: XLSX_MONEY,
        key: `re${i}_${ri}Exempt`,
        note: "Fixed nominal amount: erodes with inflation in today's $, like the cost basis"
      });
      put('  growth mode', r.growth && r.growth.mode, {key: `re${i}_${ri}GMode`});
      put('  growth value (% nominal, or offset %)', r.growth ? Number(r.growth.value) || 0 : 0, {key: `re${i}_${ri}GVal`});
      put('  jointly owned with spouse (continues to the survivor; basis steps up at either passing)', yn(r.bene));
      put(
        '  sell',
        {never: 'Never', ltc: 'When the last person starts LTC', passing: "At the last person's passing", age: "At the owner's age"}[
          mode
        ] || mode
      );
      if (mode === 'age') put('  sell at owner age', Number(r.sellAge) || 0);
      if (mode !== 'never') put('  sale proceeds go to', sellTo, {note: 'After the sale tax, at a 100% cost basis'});
    });
  });
  return {ws: xlsxFinish(sh, {minW: 16, mixedText: 30}), names, addr};
}

// Real growth rate (today's $) formula text for an account whose growth mode / value sit on the Inputs sheet.
function xlsxRealGrowthFormula(modeCell, valCell, change, inflation) {
  const mode = change && change.mode,
    v = (change && change.value) || 0;
  const cached = realGrowth(change, inflation);
  let f;
  if (mode === 'custom') f = `(1+${valCell}/100)/(1+Inflation)-1`;
  else if (mode === 'offset') f = `${valCell}/100/(1+Inflation)`;
  else if (mode === 'fixed') f = '1/(1+Inflation)-1';
  else f = '0';
  return {f, cached};
}

// ═══ Monte Carlo trial ═══════════════════════════════════════════════════════════════════════════
// While a Monte Carlo trial is on screen (B / C in the trial banner) the export is THAT trial, and it is a live model too. A trial differs from the scenario in four ways:
//   • its own lifespans, Long Term Care and inheritance        → the Inputs sheet is written from the trial's private copy of the scenario (mcTrialView.state);
//   • a price level that moves year by year                    → "MC trial" sheet: inflation of each year, the price level and the deflator the Projection formulas use;
//   • a market shock for every asset in every year             → "MC trial" sheet: the shock factor (a value, the trial's draw) and the real growth rate = (1 + the plan's rate) × factor − 1,
//     where the plan's rate is a formula of the Inputs growth cell (a nominal "fixed" / "custom" rate is re-priced by that year's inflation, as the engine does);
//   • the account roll-forwards compound with those yearly rates (a "Real growth this year" column on each account sheet) instead of one constant rate.
// So editing a growth % on Inputs, or an inflation / shock cell on the MC trial sheet, flows through the balances and the tax chain. The solver-driven amounts stay the app's values.
// Read-only: it only reads proj.rates / proj.inflRate (recorded by computeProjection) and the trial view; never writes into `state`.
function xlsxTrialContext() {
  const vc = viewContext();
  if (!vc.showing) return null;
  return {n: vc.trial.trial + 1, view: vc.view, state: vc.state, label: vc.label};
}
// Builds the "MC trial" sheet. Returns null when the projection carries no recorded path (then the export stays as for a scenario).
function xlsxTrialSheet(proj, trial, inAddr) {
  const rows = proj.rows,
    rates = proj.rates,
    pis = proj.inflRate;
  if (!rates || !pis || !rows.length) return null;
  const mean = proj.inflation != null ? proj.inflation : state.inflation,
    SHEET = 'MC trial';
  const pi = rows.map((r, k) => (typeof pis[k] === 'number' && isFinite(pis[k]) ? pis[k] : mean));
  const cpi = [1];
  for (let k = 1; k < rows.length; k++) cpi.push(cpi[k - 1] * (1 + pi[k - 1]));
  // Every growing asset that has an account sheet, with the key the engine records its yearly rate under (gk() in projection.js).
  const found = [],
    add = (key, label, change, valCell) => found.push({key, label, change, valCell});
  proj.people.forEach((p, i) => {
    const who = displayPersonName(p, i);
    (p.brokerage || []).forEach((b, bi) => {
      if (b.enabled === false) return;
      add('pf:' + b.id, `${who} - ${(b.name && b.name.trim()) || 'Portfolio ' + (bi + 1)}`, b.growth, inAddr[`pf${i}_${bi}GVal`]);
    });
    (p.realEstate || []).forEach((r, ri) => {
      if (r.enabled === false || !(Number(r.balance) > 0)) return;
      add('re:' + r.id, `${who} - ${(r.name && r.name.trim()) || 'Property ' + (ri + 1)}`, r.growth, inAddr[`re${i}_${ri}GVal`]);
    });
    if (p.ira && p.ira.enabled) add('ira:' + p.id, `${who} - Pre-tax IRA`, p.ira.growth, inAddr[`ira${i}GVal`]);
    if (p.roth && p.roth.enabled) add('roth:' + p.id, `${who} - Roth IRA`, p.roth.growth, inAddr[`roth${i}GVal`]);
    (p.inhIras || []).forEach((x, ii) => {
      if (x.enabled === false || !(Number(x.balance) > 0)) return;
      add(
        'inh:' + i + ':' + ((x.name && x.name.trim()) || ''),
        `${who} - ${(x.name && x.name.trim()) || 'Inherited IRA ' + (ii + 1)}`,
        x.growth,
        inAddr[`inh${i}_${ii}GVal`]
      );
    });
  });
  const count = {};
  found.forEach(a => {
    count[a.key] = (count[a.key] || 0) + 1;
  });
  // two inherited IRAs with the same name share one key (and one recorded rate): they keep the constant-rate treatment
  const assets = found.filter(a => count[a.key] === 1 && a.valCell && rows.some((r, k) => rates[k] && typeof rates[k][a.key] === 'number'));
  const byKey = {};
  assets.forEach((a, j) => {
    a.j = j;
    byKey[a.key] = a;
  });
  // The plan's real rate for year k. 'fixed' / 'custom' are nominal: re-priced by that year's inflation (the engine's MC hook); the other modes keep their real rate.
  const baseAt = (ch, k) => (ch && (ch.mode === 'fixed' || ch.mode === 'custom') ? realGrowth(ch, pi[k]) : realGrowth(ch, mean));
  const baseF = (ch, valCell, piRef) => {
    const m = ch && ch.mode;
    if (m === 'custom') return `(1+${valCell}/100)/(1+${piRef})-1`;
    if (m === 'fixed') return `1/(1+${piRef})-1`;
    if (m === 'offset') return `${valCell}/100/(1+Inflation)`;
    return '0';
  };
  const rateAt = (a, k) => (rates[k] && typeof rates[k][a.key] === 'number' ? rates[k][a.key] : null);
  const Fval = (a, k) => {
    const r = rateAt(a, k),
      b = baseAt(a.change, k);
    return r == null || !(1 + b > 0) ? 1 : (1 + r) / (1 + b);
  }; // no recorded rate that year: the plan's own rate
  const gval = (a, k) => {
    const r = rateAt(a, k);
    return r == null ? baseAt(a.change, k) : r;
  };
  const sh = xlsxSheet();
  xlsxPut(
    sh,
    0,
    0,
    xlsxTxt(
      `${trial.view === 'D' ? 'Stress test' : 'Monte Carlo trial #' + trial.n} (${trial.view === 'D' ? 'view D' : trial.view === 'C' ? 'a successful run' : trial.view === 'E' || trial.view === 'F' ? 'view ' + trial.view + ', a Monte Carlo trial under a stress test' : 'trial view B'}): this ${trial.view === 'D' ? "scenario's" : "trial's random"} path. Edit an inflation rate or a shock factor and the Projection and account sheets recalculate. A shock factor of 1 = the scenario's own return that year.`
    )
  );
  xlsxPut(
    sh,
    1,
    0,
    xlsxTxt(
      "Columns labelled \"trial input\" are the trial's draws. Real growth = (1 + the scenario's real rate from Inputs) × shock factor − 1; a nominal fixed / custom rate is re-priced by the year's inflation."
    )
  );
  const cols = [
    {
      key: 'year',
      head: 'Year',
      kind: 'f',
      fmt: XLSX_YEAR,
      v: r => THIS_YEAR + r.k,
      f: (X, idx) => (idx === 0 ? 'BaseYear' : `${X('year', -1)}+1`)
    },
    {
      key: 'pi',
      head: "Inflation rate this year (this trial's path)",
      kind: 'v',
      tag: 'trial input',
      fmt: XLSX_PCT2,
      v: (r, idx) => pi[idx]
    },
    {
      key: 'cpi',
      head: "Price level at the start of the year = prior level × (1 + prior year's inflation)",
      kind: 'f',
      fmt: '0.0000',
      v: (r, idx) => cpi[idx],
      f: (X, idx) => (idx === 0 ? '1' : `${X('cpi', -1)}*(1+${X('pi', -1)})`)
    },
    {
      key: 'defl',
      head: "Inflation deflator = 1 / price level (the Projection sheet's deflator column reads this)",
      kind: 'f',
      fmt: '0.0000',
      v: (r, idx) => 1 / cpi[idx],
      f: X => `1/${X('cpi')}`
    }
  ];
  assets.forEach(a => {
    cols.push({
      key: 'F' + a.j,
      head: `Market shock factor, ${a.label} (this trial; mean 1)`,
      kind: 'v',
      tag: 'trial input',
      fmt: '0.0000',
      v: (r, idx) => Fval(a, idx)
    });
    cols.push({
      key: 'g' + a.j,
      head: `Real growth, ${a.label} = (1 + scenario rate) × shock factor − 1`,
      kind: 'f',
      fmt: XLSX_PCT2,
      v: (r, idx) => gval(a, idx),
      f: X => `(1+${baseF(a.change, a.valCell, X('pi'))})*${X('F' + a.j)}-1`
    });
  });
  const t = xlsxTable(sh, 2, cols, rows);
  const ref = (col, k) => `'${SHEET}'!$${t.letter[col]}$${t.firstRow + k}`;
  return {
    name: SHEET,
    ws: xlsxFinish(sh, {minW: 12}),
    t,
    cols,
    has: key => !!byKey[key],
    gVal: (key, k) => gval(byKey[key], k),
    gRef: (key, k) => ref('g' + byKey[key].j, k),
    deflVal: k => 1 / cpi[k],
    deflRef: k => ref('defl', k)
  };
}
