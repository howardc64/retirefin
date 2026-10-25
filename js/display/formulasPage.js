'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / FORMULAS PAGE — "Formulas" button (next to Reset to
// defaults) opens a new tab documenting every calculation and
// variable, so a user can verify the math independently of the app.
// Reference-data tables are rendered live from js/core/constants.js
// so this page can't silently drift out of sync with the real
// brackets/tiers/tables the app actually computes with.
// This file opens the page and assembles it; the stylesheet is in formulasCss.js and the text of each part in formulasSections.js.
// ═══════════════════════════════════════════════════════════════

function openFormulasPage() {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow pop-ups for this page to view the formulas in a new tab.');
    return;
  }
  win.document.write(buildFormulasHtml());
  win.document.close();
}

function fpBracketTable(brackets, rateAsPct) {
  let prev = 0;
  const rows = brackets
    .map(b => {
      // Matches calcOrdTax/calcQualTax: each limit is the top of its bracket, and a dollar exactly at the limit is taxed at that bracket's rate.
      const range = b.lim === Infinity ? `over ${fmt(prev)}` : prev === 0 ? `up to ${fmt(b.lim)}` : `over ${fmt(prev)} up to ${fmt(b.lim)}`;
      prev = b.lim;
      return `<tr><td>${range}</td><td>${(b.r * 100).toFixed(rateAsPct ? 1 : 0)}%</td></tr>`;
    })
    .join('');
  return `<table><thead><tr><th>Taxable amount in this bracket</th><th>Rate</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function fpIrmaaTable(tiers) {
  // A tier applies once MAGI >= its threshold (see projection.js), up to (not including) the next tier's threshold.
  let rows = `<tr><td>Standard</td><td>under ${fmt(tiers[0].magi)}</td><td>$0/yr</td></tr>`;
  tiers.forEach((t, i) => {
    const next = tiers[i + 1];
    const range = next ? `${fmt(t.magi)} to under ${fmt(next.magi)}` : `${fmt(t.magi)} and over`;
    rows += `<tr><td>${t.label}</td><td>${range}</td><td>${fmt(t.surch)}/yr per enrolled person</td></tr>`;
  });
  return `<table><thead><tr><th>Tier</th><th>MAGI range (2-years-prior)</th><th>Part B+D surcharge</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function fpRmdTable() {
  const ages = Object.keys(RMD_TABLE)
    .map(Number)
    .sort((a, b) => a - b);
  const cells = ages.map(a => `<td>${a}<br><span class="fp-muted">${RMD_TABLE[a]}</span></td>`);
  // 10 ages per row so the table stays readable instead of one giant strip.
  let rows = '',
    row = [];
  cells.forEach((c, i) => {
    row.push(c);
    if (row.length === 10 || i === cells.length - 1) {
      rows += `<tr>${row.join('')}</tr>`;
      row = [];
    }
  });
  return `<table class="fp-rmd"><caption>Age (divisor)</caption><tbody>${rows}</tbody></table>`;
}

function fpSleTable() {
  const cells = SLE_TABLE.map((f, a) => `<td>${a}${a === 120 ? '+' : ''}<br><span class="fp-muted">${f}</span></td>`);
  let rows = '',
    row = [];
  cells.forEach((c, i) => {
    row.push(c);
    if (row.length === 10 || i === cells.length - 1) {
      rows += `<tr>${row.join('')}</tr>`;
      row = [];
    }
  });
  return `<table class="fp-rmd"><caption>Age (factor)</caption><tbody>${rows}</tbody></table>`;
}

// ── Display-equation helpers ("math book" style) ──────────────────────────────
// eq(...) renders each argument as its own centered line; fr(n,d) stacks a fraction; pw(rows) renders a
// piecewise definition (a big left brace, one "value  if condition" row per case). Names are set upright and
// the operators are spaced, so an equation reads like a textbook display rather than a run of prose.
function fpFr(n, d) {
  return `<span class="fp-fr"><span class="fp-n">${n}</span><span class="fp-d">${d}</span></span>`;
}
function fpEq(...lines) {
  return lines.map(l => `<div class="fp-eq">${l}</div>`).join('');
}
function fpPw(lhs, rows) {
  const r = rows.map(([v, c]) => `<tr><td class="fp-pv">${v}</td><td class="fp-pc">${c}</td></tr>`).join('');
  return `<div class="fp-eq"><span class="fp-lhs">${lhs} =</span><span class="fp-brace"></span><table class="fp-pw"><tbody>${r}</tbody></table></div>`;
}
function fpWhere(text) {
  return `<p class="fp-where">${text}</p>`;
}

function buildFormulasHtml() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Calculation Reference — Retirement Income Planner</title>
<style>
${fpCss()}
</style></head>
<body>
<h1>Calculation Reference</h1>
<p class="fp-src">Generated from the running app's own reference data (js/core/constants.js) for tax year ${THIS_YEAR} — if this page and the app ever disagree on a number, that means the app was updated after this tab was opened; reopen it to refresh.</p>

<div class="fp-note">All tax calculations in this app are simplified: every dollar is assumed to be ordinary income unless explicitly modeled as qualified income (QDIV/LTCG). Most real-world deductions and credits beyond the standard deduction and the foreign tax credit modeled here are excluded. All figures are shown in today's dollars.</div>

<nav id="toc" class="fp-toc"><strong>Contents</strong>
<ul>
<li><a href="#glossary">Glossary</a></li>
<li><a href="#reference">Reference data (tax year ${THIS_YEAR})</a><ul>
<li><a href="#r-ordmfj">Ordinary brackets — married</a></li><li><a href="#r-ordsgl">Ordinary brackets — single</a></li>
<li><a href="#r-qmfj">Qualified dividend / LTCG brackets — married</a></li><li><a href="#r-qsgl">Qualified dividend / LTCG brackets — single</a></li>
<li><a href="#r-irmfj">IRMAA tiers — married</a></li><li><a href="#r-irsgl">IRMAA tiers — single</a></li>
<li><a href="#r-niit">NIIT</a></li><li><a href="#r-ult">RMD: Uniform Lifetime Table</a></li><li><a href="#r-sle">RMD: Single Life Expectancy Table</a></li></ul></li>
<li><a href="#formulas">Formulas</a><ul class="fp-groups"><li><a href="#g-conv">Conventions</a><ul><li><a href="#f-today">Today's-dollar convention</a></li><li><a href="#f-filing">Filing status</a></li></ul></li>
<li><a href="#g-inc">Income sources</a><ul><li><a href="#f-ss">Social Security benefits</a></li><li><a href="#f-ann">Annuities</a></li><li><a href="#f-rent">Rental income and depreciation</a></li></ul></li>
<li><a href="#g-ret">Retirement accounts (IRA, Roth IRA, inheritance)</a><ul><li><a href="#f-rmd">Required minimum distributions (RMD)</a></li><li><a href="#f-iraw">Pre-tax IRA annual withdraw and Roth conversion</a></li><li><a href="#f-inh">Inherited assets and the 10-year rule</a></li></ul></li>
<li><a href="#g-tax">Taxes and Medicare surcharge</a><ul><li><a href="#f-tss">Taxable Social Security and Social Security tax (SST)</a></li><li><a href="#f-tt">Total tax (TT): ordinary and qualified income</a></li><li><a href="#f-ded">Additional standard deduction (65+) and senior deduction</a></li><li><a href="#f-scgl">Suspended capital-gain loss (SCGL)</a></li><li><a href="#f-ftc">Foreign tax credit (FTC)</a></li><li><a href="#f-niit">Net investment income tax (NIIT)</a></li><li><a href="#f-state">State income tax</a></li><li><a href="#f-irmaa">IRMAA (Medicare Part B/D surcharge)</a></li></ul></li>
<li><a href="#g-exp">Expenses and how they are funded</a><ul><li><a href="#f-ltc">Long-term care (LTC) expense</a></li><li><a href="#f-med">Late-life medical shock</a></li><li><a href="#f-grd">Spending guardrails</a></li><li><a href="#f-wf">Household expense funding waterfall</a></li><li><a href="#f-order">Expense shortfall withdrawal order</a></li><li><a href="#f-last">Pre-tax IRA and Roth IRA as last resorts</a></li><li><a href="#f-pw">Portfolio withdraw</a></li><li><a href="#f-reinv">Reinvest excess income</a></li><li><a href="#f-aum">AUM fee</a></li></ul></li>
<li><a href="#g-pf">Brokerage portfolios</a><ul><li><a href="#f-bal">Annual balance change</a></li><li><a href="#f-div">Dividends</a></li><li><a href="#f-tex">Tax-exempt income</a></li><li><a href="#f-b0">Starting cost basis</a></li><li><a href="#f-broll">Cost basis roll-forward, today's-dollar conversion and step-up at death</a></li><li><a href="#f-ltcg">Realized long-term capital gains (LTCG)</a></li><li><a href="#f-circ">Tax ↔ LTCG circularity</a></li><li><a href="#f-swap">Asset / basis swap</a></li><li><a href="#f-adisp">Asset Value chart withdraw cost (display only)</a></li></ul></li>
<li><a href="#g-re">Real estate</a><ul><li><a href="#f-re">Real estate</a></li></ul></li>
<li><a href="#g-mc">Monte Carlo simulation and chart rates</a><ul><li><a href="#f-mkt">Market return and inflation charts</a></li><li><a href="#f-mc">Monte Carlo trials</a></li><li><a href="#f-panic">Systemic panic (correlation convergence)</a></li></ul></li><li><a href="#g-chat">Chat what-if scenarios</a><ul><li><a href="#f-chatrun">How a scenario is run</a></li><li><a href="#f-chatlev">How the levers change the scenario</a></li><li><a href="#f-chatkpi">Headline numbers</a></li><li><a href="#f-llm">Scenarios from an outside LLM and the live bridge</a></li></ul></li></ul></li>
</ul></nav>

${fpSecReference()}
${fpSecIncome()}
${fpSecRetirement()}
${fpSecTax()}
${fpSecExpenses()}
${fpSecPortfolio()}
${fpSecSimulation()}
<hr style="margin:32px 0;border:none;border-top:1px solid #ddd;">
<p class="fp-src">This page is a snapshot — it does not update if you keep changing inputs in the main app tab. Close and reopen it (via the Formulas button) any time you want a fresh copy.</p>
</body></html>`;
}
