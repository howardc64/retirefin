'use strict';
// DISPLAY / EXCEL — one sheet per account (portfolio, real estate, IRA / Roth, inherited IRA, annuity).

// ═══ Per-account sheets ══════════════════════════════════════════════════════════════════════════
function xlsxAccountHeader(sh, title, growth, startAddr, startVal) {
  xlsxPut(sh, 0, 0, xlsxTxt(title));
  xlsxPut(sh, 1, 0, xlsxTxt("Real growth rate (today's $), from Inputs"));
  xlsxPut(sh, 1, 1, xlsxFml(growth.f, growth.cached, XLSX_PCT));
  if (startAddr) {
    xlsxPut(sh, 2, 0, xlsxTxt('Starting balance (input)'));
    xlsxPut(sh, 2, 1, xlsxFml(startAddr, startVal, XLSX_MONEY));
  }
}
function xlsxPortfolioSheet(proj, i, bi, inAddr, T) {
  const person = displayPersonName(proj.people[i], i),
    b = proj.people[i].brokerage[bi],
    gKey = 'pf:' + b.id,
    tg = !!(T && T.has(gKey)); // tg: a Monte Carlo trial — growth comes from the MC trial sheet, year by year
  const sh = xlsxSheet();
  xlsxAccountHeader(
    sh,
    `${person} – portfolio ${bi + 1}`,
    xlsxRealGrowthFormula(inAddr[`pf${i}_${bi}GMode`], inAddr[`pf${i}_${bi}GVal`], b.growth, proj.inflation || state.inflation),
    inAddr[`pf${i}_${bi}Bal`],
    Number(b.balance) || 0
  );
  const rowsIn = proj.rows.filter(r => r.portfoliosByPerson[i][bi]);
  const ent = r => r.portfoliosByPerson[i][bi];
  const cols = [
    {key: 'year', head: 'Year', fmt: XLSX_YEAR, v: r => THIS_YEAR + r.k},
    {key: 'age', head: `${person} age`, fmt: XLSX_AGE, v: r => r.ages[i]},
    {key: 'bal', head: 'Balance (SOY)', v: r => ent(r).balance},
    {key: 'gr', head: 'Growth %', fmt: XLSX_PCTNUM, v: r => round1(ent(r).growthPct)},
    {
      key: 'ngr',
      head: 'Net growth %',
      fmt: XLSX_PCTNUM,
      v: r => round1(ent(r).netGrowthPct != null ? ent(r).netGrowthPct : ent(r).growthPct)
    },
    ...(tg
      ? [
          {
            key: 'g',
            head: "Real growth this year (from the MC trial sheet: scenario rate × this trial's market shock)",
            kind: 'f',
            fmt: XLSX_PCT2,
            v: r => T.gVal(gKey, r.k),
            f: (X, idx, R, r) => T.gRef(gKey, r.k)
          }
        ]
      : []),
    {key: 'fee', head: 'AUM fee share', v: r => ent(r).feeDrag},
    {key: 'ltcg', head: 'Realized LTCG (gross, before SCGL) = shares sold × gain share + distributed LTCG', v: r => ent(r).ltcg},
    {key: 'cgd', head: '  of which: Distributed LTCG (paid out; taxed whether or not shares are sold)', v: r => ent(r).cgd || 0},
    {key: 'basis', head: 'Cost basis (SOY)', v: r => (ent(r).tracked ? ent(r).basis : '')},
    {
      key: 'gain',
      head: 'Unrealized gain (SOY)',
      kind: 'f',
      v: r => (ent(r).tracked ? ent(r).unrealizedGain : ''),
      f: X => `IF(${X('basis')}="","",${X('bal')}-${X('basis')})`
    },
    {
      key: 'bpct',
      head: 'Basis % of balance',
      kind: 'f',
      fmt: XLSX_PCT,
      v: r => (ent(r).tracked && ent(r).balance > 0 ? ent(r).basis / ent(r).balance : ''),
      f: X => `IF(OR(${X('basis')}="",${X('bal')}<=0),"",${X('basis')}/${X('bal')})`
    },
    {
      key: 'up',
      head: 'Stepped up this year (owner passed, or spouse passed if jointly owned)',
      text: true,
      v: r => (ent(r).steppedUp ? 'Yes' : '')
    },
    {key: 'swap', head: 'Swapped with IDGT this year (value)', v: r => (ent(r).swapAmt > 0 ? ent(r).swapAmt : '')},
    {
      key: 'reIn',
      head: 'Real estate sold into this portfolio this year (value; its cost basis moves in too)',
      v: r => {
        const t = (ent(r).reSaleIn || []).reduce((x, y) => x + y.value, 0);
        return t > 0 ? t : '';
      }
    },
    {key: 'divu', head: 'Dividends (and distributed LTCG) used for expenses', v: r => ent(r).divUsed},
    {key: 'divr', head: 'Dividends (and distributed LTCG) reinvested', v: r => ent(r).divReinvested},
    {key: 'sold', head: 'Shares sold', v: r => ent(r).sold},
    {key: 'wdr', head: 'Portfolio withdraw (sold; proceeds are household cash income)', v: r => ent(r).withdrawn || 0},
    {key: 'exc', head: 'Excess income reinvested', v: r => ent(r).excessReinvested || 0},
    {key: 'te', head: 'Tax-exempt income paid', v: r => ent(r).taxExempt || 0},
    {
      key: 'roll',
      head: 'Rolled-forward next-year balance = SOY × (1 + growth) − dividends used − shares sold − withdraws − tax-exempt paid + excess reinvested',
      kind: 'f',
      v: (r, idx) => {
        const e = ent(r);
        return Math.max(
          0,
          e.balance * (1 + (tg ? T.gVal(gKey, r.k) : realGrowth(b.growth, proj.inflation || state.inflation))) -
            e.divUsed -
            e.sold -
            (e.withdrawn || 0) -
            (e.taxExempt || 0) +
            (e.excessReinvested || 0)
        );
      },
      f: X => `MAX(0,${X('bal')}*(1+${tg ? X('g') : '$B$2'})-${X('divu')}-${X('sold')}-${X('wdr')}-${X('te')}+${X('exc')})`
    }
  ];
  const t = xlsxTable(sh, 4, cols, rowsIn);
  return {sh, ws: xlsxFinish(sh), t, cols, items: rowsIn, type: 'pf', i, bi, balCol: 'bal', gainCol: 'gain', idgt: !!b.idgt, name: null};
}
// One sheet per property: the value and cost basis each year, and — in the year it is sold — the gain, exemption, tax and the amount forwarded to the portfolio.
function xlsxRealEstateSheet(proj, i, ri, inAddr, T) {
  const person = displayPersonName(proj.people[i], i),
    r0 = proj.people[i].realEstate[ri],
    gKey = 're:' + r0.id,
    tg = !!(T && T.has(gKey));
  const sh = xlsxSheet();
  xlsxAccountHeader(
    sh,
    `${person} – real estate: ${(r0.name && r0.name.trim()) || 'Property ' + (ri + 1)}`,
    xlsxRealGrowthFormula(inAddr[`re${i}_${ri}GMode`], inAddr[`re${i}_${ri}GVal`], r0.growth, proj.inflation || state.inflation),
    inAddr[`re${i}_${ri}Val`],
    Number(r0.balance) || 0
  );
  const ent = r => r.realEstateByPerson[i][ri];
  const rowsIn = proj.rows.filter(r => {
    const e = r.realEstateByPerson[i] && r.realEstateByPerson[i][ri];
    return e && e.balance > 0;
  });
  const sale = r => ent(r).sale;
  const cols = [
    {key: 'year', head: 'Year', fmt: XLSX_YEAR, v: r => THIS_YEAR + r.k},
    {key: 'age', head: `${person} age`, fmt: XLSX_AGE, v: r => r.ages[i]},
    {key: 'bal', head: 'Value (SOY)', v: r => ent(r).balance},
    {key: 'gr', head: 'Growth % (real)', fmt: XLSX_PCTNUM, v: r => round1(ent(r).growthPct)},
    ...(tg
      ? [
          {
            key: 'g',
            head: "Real growth this year (from the MC trial sheet: scenario rate × this trial's property shock)",
            kind: 'f',
            fmt: XLSX_PCT2,
            v: r => T.gVal(gKey, r.k),
            f: (X, idx, R, r) => T.gRef(gKey, r.k)
          }
        ]
      : []),
    {key: 'basis', head: 'Cost basis (SOY)', v: r => ent(r).basis},
    {
      key: 'gain',
      head: 'Unrealized gain (SOY)',
      kind: 'f',
      v: r => Math.max(0, ent(r).balance - ent(r).basis),
      f: X => `MAX(0,${X('bal')}-${X('basis')})`
    },
    {
      key: 'bpct',
      head: 'Basis % of value',
      kind: 'f',
      fmt: XLSX_PCT,
      v: r => (ent(r).balance > 0 ? ent(r).basis / ent(r).balance : ''),
      f: X => `IF(${X('bal')}<=0,"",${X('basis')}/${X('bal')})`
    },
    {
      key: 'up',
      head: 'Basis stepped up this year (owner passed, or spouse passed if jointly owned)',
      text: true,
      v: r => (ent(r).steppedUp ? 'Yes' : '')
    },
    {
      key: 'eoy',
      head: 'Value at end of year = SOY × (1 + growth)',
      kind: 'f',
      v: r => ent(r).balance * (1 + (tg ? T.gVal(gKey, r.k) : ent(r).growthPct / 100)),
      f: X => `${X('bal')}*(1+${tg ? X('g') : '$B$2'})`
    },
    {key: 'sold', head: 'Sold at the end of this year', text: true, v: r => (sale(r) ? 'Yes' : '')},
    {key: 'sBas', head: 'Cost basis at the sale (after the passing step-up, eroded by inflation)', v: r => (sale(r) ? sale(r).basEnd : '')},
    {key: 'sEx', head: 'Exemption used (per owner, eroded by inflation × owners alive)', v: r => (sale(r) ? sale(r).exempt : '')},
    {
      key: 'sGain',
      head: 'Taxable gain = value − exemption − basis (floored at 0; realized LTCG)',
      kind: 'f',
      v: r => (sale(r) ? sale(r).gain : ''),
      f: X => `IF(${X('sold')}="Yes",MAX(0,${X('eoy')}-${X('sEx')}-${X('sBas')}),"")`
    },
    {key: 'sTax', head: 'Tax added by the sale, federal + state (paid out of the sale)', v: r => (sale(r) ? sale(r).tax : '')},
    {
      key: 'sNet',
      head: 'Forwarded to the portfolio = value − tax, at a 100% cost basis',
      kind: 'f',
      v: r => (sale(r) ? sale(r).net : ''),
      f: X => `IF(${X('sold')}="Yes",${X('eoy')}-${X('sTax')},"")`
    }
  ];
  const t = xlsxTable(sh, 4, cols, rowsIn);
  return {sh, ws: xlsxFinish(sh), t, cols, items: rowsIn, type: 're', i, ri, balCol: 'bal', gainCol: 'gain', name: null};
}
// A person's own pre-tax IRA: iraByPerson / rothConvByPerson also carry the withdraws / conversions of the inherited IRAs that person holds (the 10-year rule), which leave those accounts, not this one.
function ownRmd(r, i) {
  return Math.max(0, (r.iraByPerson[i] || 0) - ((r.inhIraWdByPerson && r.inhIraWdByPerson[i]) || 0));
}
function ownConv(r, i) {
  return r.convMainByPerson ? r.convMainByPerson[i] || 0 : r.rothConvByPerson[i] || 0;
}
function xlsxIraRothSheet(proj, i, isRoth, inAddr, T) {
  const person = displayPersonName(proj.people[i], i),
    acct = isRoth ? proj.people[i].roth : proj.people[i].ira,
    inf = proj.inflation || state.inflation;
  const gKey = (isRoth ? 'roth:' : 'ira:') + proj.people[i].id,
    tg = !!(T && T.has(gKey)); // heirs' stretch years always compound at the scenario's constant rate (no market shock)
  const key = isRoth ? 'roth' : 'ira',
    sh = xlsxSheet();
  const g = realGrowth(acct.growth, inf);
  xlsxAccountHeader(
    sh,
    `${person} – ${isRoth ? 'Roth IRA' : 'Pre-tax IRA'}`,
    xlsxRealGrowthFormula(inAddr[`${key}${i}GMode`], inAddr[`${key}${i}GVal`], acct.growth, inf),
    inAddr[`${key}${i}Bal`],
    Number(acct.balance) || 0
  );
  const main = proj.rows.map(r => ({r, heirs: false}));
  const stretchOn = !!acct.stretch;
  const tail = stretchOn ? (proj.stretch || []).map(r => ({r, heirs: true})) : [];
  const items = main.concat(tail);
  const bal = x => (isRoth ? x.r.rothBalByPerson[i] || 0 : x.r.iraBalByPerson[i] || 0);
  // A roll-forward formula is written only where it reproduces the app's balance (an account that ends at death, or other special rules, stay values).
  const predicted = items.map((x, idx) => {
    const prev = idx === 0 ? Number(acct.balance) || 0 : bal(items[idx - 1]);
    if (x.heirs) return prev * (1 + g);
    const gy = tg ? T.gVal(gKey, x.r.k) : g;
    const rmd = ownRmd(x.r, i),
      conv = (isRoth ? x.r.rothInByPerson[i] : ownConv(x.r, i)) || 0,
      ex = isRoth ? x.r.rothExpByPerson[i] || 0 : x.r.iraExpByPerson[i] || 0;
    return isRoth ? Math.max(0, prev + conv - ex) * (1 + gy) : Math.max(0, prev - rmd - conv - ex) * (1 + gy);
  });
  const cols = [
    {key: 'year', head: 'Year', fmt: XLSX_YEAR, v: x => THIS_YEAR + x.r.k},
    {key: 'age', head: `${person} age`, fmt: XLSX_AGE, v: x => x.r.ages[i]},
    ...(isRoth ? [] : [{key: 'rmd', head: 'RMD', v: x => (x.heirs ? 0 : ownRmd(x.r, i))}]),
    {
      key: 'conv',
      head: isRoth ? 'Converted in from pre-tax IRA (withdraws marked as Roth conversion)' : 'Pre-tax IRA annual withdraw',
      v: x => (x.heirs ? 0 : (isRoth ? x.r.rothInByPerson[i] : ownConv(x.r, i)) || 0)
    },
    {
      key: 'ex',
      head: isRoth ? 'Roth IRA sold for expenses' : 'Pre-tax IRA withdraw for expenses',
      v: x => (x.heirs ? 0 : isRoth ? x.r.rothExpByPerson[i] || 0 : x.r.iraExpByPerson[i] || 0)
    },
    ...(tg
      ? [
          {
            key: 'g',
            head: "Real growth this year (from the MC trial sheet: scenario rate × this trial's market shock)",
            kind: 'f',
            fmt: XLSX_PCT2,
            v: x => (x.heirs ? '' : T.gVal(gKey, x.r.k)),
            f: (X, idx, R, x) => (x.heirs ? null : T.gRef(gKey, x.r.k))
          }
        ]
      : []),
    {
      key: 'bal',
      head: isRoth
        ? 'Roth IRA balance (EOY) = (prior EOY + converted in − sold) × (1 + growth)'
        : 'Pre-tax IRA balance (EOY) = (prior EOY − RMD − annual withdraw − expense draw) × (1 + growth)',
      kind: 'f',
      v: x => bal(x),
      f: (X, idx) => {
        if (Math.abs(predicted[idx] - bal(items[idx])) > 1) return null;
        const prev = idx === 0 ? '$B$3' : X('bal', -1);
        if (items[idx].heirs) return `${prev}*(1+$B$2)`;
        const gc = tg ? X('g') : '$B$2';
        return isRoth ? `MAX(0,${prev}+${X('conv')}-${X('ex')})*(1+${gc})` : `MAX(0,${prev}-${X('rmd')}-${X('conv')}-${X('ex')})*(1+${gc})`;
      }
    },
    {key: 'heirs', head: 'After last passing (heirs)', text: true, v: x => (x.heirs ? 'Yes' : '')}
  ];
  const t = xlsxTable(sh, 4, cols, items);
  return {sh, ws: xlsxFinish(sh), t, cols, type: isRoth ? 'roth' : 'ira', i, balCol: 'bal', name: null};
}
// One sheet per inherited IRA (Inheritance card): the withdraw each year under the 10-year rule and the end-of-year balance. The account is emptied by the end of the 10th year after
// its start year. The withdraw is the app's solved value (RMD by the holder's age if the original owner had started RMDs, plus any annual withdraw / conversion, and everything left in
// year 10); the balance is a formula where it reproduces the app's number (no conversion taken out of this account that year).
function xlsxInheritedIraSheet(proj, i, ii, inAddr, T) {
  const person = displayPersonName(proj.people[i], i),
    x = proj.people[i].inhIras[ii],
    isRoth = x.kind === 'roth',
    inf = proj.inflation || state.inflation;
  const gKey = 'inh:' + i + ':' + ((x.name && x.name.trim()) || ''),
    tg = !!(T && T.has(gKey));
  const ent = r => ((r.inhIraByPerson && r.inhIraByPerson[i]) || [])[ii];
  const items = proj.rows
    .filter(r => {
      const e = ent(r);
      return e && e.live;
    })
    .map(r => ({r}));
  if (!items.length) return null;
  const sh = xlsxSheet(),
    g = realGrowth(x.growth, inf);
  xlsxAccountHeader(
    sh,
    `${person} – inherited ${isRoth ? 'Roth IRA' : 'pre-tax IRA'}: ${(x.name && x.name.trim()) || 'Inherited IRA ' + (ii + 1)} (emptied by the end of the 10th year after ${Number(x.startYear) || 'its start year'})`,
    xlsxRealGrowthFormula(inAddr[`inh${i}_${ii}GMode`], inAddr[`inh${i}_${ii}GVal`], x.growth, inf),
    inAddr[`inh${i}_${ii}Bal`],
    Number(x.balance) || 0
  );
  const wd = y => ent(y.r).wd || 0,
    bal = y => ent(y.r).balance || 0;
  const predicted = items.map(
    (y, idx) => Math.max(0, (idx === 0 ? Number(x.balance) || 0 : bal(items[idx - 1])) - wd(y)) * (1 + (tg ? T.gVal(gKey, y.r.k) : g))
  );
  const cols = [
    {key: 'year', head: 'Year', fmt: XLSX_YEAR, v: y => THIS_YEAR + y.r.k},
    {key: 'age', head: `${person} age`, fmt: XLSX_AGE, v: y => y.r.ages[i]},
    {
      key: 'wd',
      head: isRoth ? 'Withdraw (Roth: untaxed household cash)' : 'Withdraw (RMD / 10-year schedule; ordinary income)',
      v: y => wd(y)
    },
    ...(tg
      ? [
          {
            key: 'g',
            head: "Real growth this year (from the MC trial sheet: scenario rate × this trial's market shock)",
            kind: 'f',
            fmt: XLSX_PCT2,
            v: y => T.gVal(gKey, y.r.k),
            f: (X, idx, R, y) => T.gRef(gKey, y.r.k)
          }
        ]
      : []),
    {
      key: 'bal',
      head: 'Balance (EOY) = (prior EOY − withdraw) × (1 + growth)',
      kind: 'f',
      v: y => bal(y),
      f: (X, idx) => {
        if (Math.abs(predicted[idx] - bal(items[idx])) > 1) return null;
        const prev = idx === 0 ? '$B$3' : X('bal', -1);
        return `MAX(0,${prev}-${X('wd')})*(1+${tg ? X('g') : '$B$2'})`;
      }
    }
  ];
  const t = xlsxTable(sh, 4, cols, items);
  return {sh, ws: xlsxFinish(sh), t, cols, type: isRoth ? 'inhroth' : 'inhira', i, balCol: 'bal', name: null};
}
function xlsxAnnuitySheet(proj, i, ai) {
  const person = displayPersonName(proj.people[i], i);
  const rows = [
    [
      'Year',
      `${person} age`,
      'Account value (SOY)',
      'Payout total',
      '  taxable',
      '  tax-exempt',
      'Taxable embedded in value (SOY)',
      'Passing benefit to heirs (paid after this year)',
      '  taxable',
      '  tax-exempt'
    ]
  ];
  proj.rows.forEach(r => {
    const e = (r.annuitiesByPerson[i] || [])[ai];
    if (!e || !e.live) return;
    const pb = e.passing;
    rows.push([
      THIS_YEAR + r.k,
      r.ages[i],
      e.balance,
      e.payout,
      e.taxable,
      e.taxFree,
      e.taxableEmbedded,
      pb ? pb.amount : '',
      pb ? pb.taxable : '',
      pb ? pb.taxFree : ''
    ]);
  });
  return rows;
}

// [{name, ...sheet}] for every enabled portfolio / annuity / IRA / Roth IRA, in person order.
function xlsxAccountSheets(proj, inAddr, T) {
  const used = new Set(['inputs', 'tax tables', 'mc trial', 'projection by year']),
    out = [];
  proj.people.forEach((p, i) => {
    const person = displayPersonName(p, i);
    (p.brokerage || []).forEach((b, bi) => {
      if (b.enabled === false) return;
      const e = proj.rows.length && proj.rows[0].portfoliosByPerson[i][bi];
      const nm = (e && e.name) || 'Portfolio ' + (bi + 1);
      const sh = xlsxPortfolioSheet(proj, i, bi, inAddr, T);
      sh.name = xlsxSheetName(`${person} - ${nm}${b.idgt ? ' (IDGT)' : ''}`, used);
      out.push(sh);
    });
    (p.annuities || []).forEach((a, ai) => {
      if (a.enabled === false || !(Number(a.value) > 0)) return;
      out.push({
        type: 'annuity',
        name: xlsxSheetName(`${person} - ${(a.name && a.name.trim()) || 'Annuity ' + (ai + 1)} (annuity)`, used),
        rows: xlsxAnnuitySheet(proj, i, ai)
      });
    });
    (p.realEstate || []).forEach((r, ri) => {
      if (r.enabled === false || !(Number(r.balance) > 0)) return;
      const sh = xlsxRealEstateSheet(proj, i, ri, inAddr, T);
      sh.name = xlsxSheetName(`${person} - ${(r.name && r.name.trim()) || 'Property ' + (ri + 1)} (real estate)`, used);
      out.push(sh);
    });
    if (p.ira && p.ira.enabled) {
      const sh = xlsxIraRothSheet(proj, i, false, inAddr, T);
      sh.name = xlsxSheetName(`${person} - Pre-tax IRA`, used);
      out.push(sh);
    }
    if (p.roth && p.roth.enabled) {
      const sh = xlsxIraRothSheet(proj, i, true, inAddr, T);
      sh.name = xlsxSheetName(`${person} - Roth IRA`, used);
      out.push(sh);
    }
    (p.inhIras || []).forEach((x, ii) => {
      if (x.enabled === false || !(Number(x.balance) > 0)) return;
      const sh = xlsxInheritedIraSheet(proj, i, ii, inAddr, T);
      if (!sh) return;
      sh.name = xlsxSheetName(
        `${person} - ${(x.name && x.name.trim()) || 'Inherited IRA ' + (ii + 1)} (inh ${x.kind === 'roth' ? 'Roth' : 'IRA'})`,
        used
      );
      out.push(sh);
    });
  });
  return out;
}
