'use strict';
// DISPLAY / CHAT SNAPSHOT — the plan and its results as text for the model, and the system prompt (see chat.js).

// ── Snapshot of the scenario + results, as text for the model ──
const chatRound = v => Math.round(Number(v) || 0);
const chatSum = a => (Array.isArray(a) ? a : []).reduce((t, v) => t + (Number(v) || 0), 0);
function chatStrip(o) {
  return JSON.parse(JSON.stringify(o, (k, v) => (k === 'hidden' || k === 'id' ? undefined : v)));
}

function buildChatSnapshot(includeNames) {
  const proj = lastProjection || computeProjection();
  const married = state.filingStatus === 'married';
  const people = married ? state.people : [state.people[0]];
  const label = i => (includeNames ? displayPersonName(people[i], i) : 'Person ' + (i + 1));
  const out = [];

  out.push(
    `Snapshot date: ${THIS_YEAR}. All dollar amounts are in today's dollars (inflation-adjusted) unless stated. "year" below is the calendar year.`
  );
  out.push('');
  out.push('## Household assumptions');
  const passing = {};
  people.forEach((p, i) => {
    passing[label(i)] = state.passing[p.id];
  });
  const hh = {
    filingStatus: state.filingStatus,
    inflationPct: Math.round(state.inflation * 10000) / 100,
    livingExpensesPerYear: state.living || 0,
    scgl: state.scglEnabled === false ? 0 : state.scgl || 0,
    aumFee: state.aumFee && state.aumFee.enabled === false ? {mode: state.aumFee.mode, value: 0} : state.aumFee,
    plannedPassingAge: passing
  };
  if (state.stateTax && state.stateTax.enabled) hh.stateTax = state.stateTax.state;
  if (state.futureTax && state.futureTax.enabled) hh.speculativeFutureNiitThreshold = chatStrip(state.futureTax);
  // Long Term Care: start age + cost per person (only as many as the household has), and the living expenses that apply after
  // the 1st / 2nd LTC start. living1 falls back to the household living expenses (married) or $7,500 (single) when never set, as in projection.js.
  if (state.ltc && state.ltc.enabled) {
    const l = state.ltc;
    const ltcPeople = {};
    people.forEach((p, i) => {
      const L = (l.people && l.people[i]) || {};
      ltcPeople[label(i)] = {startAge: L.startAge, costPerYear: L.cost};
    });
    hh.longTermCare = {people: ltcPeople, livingExpensesAfter1stLtcStart: l.living1 != null ? l.living1 : ltcLiving1Default(married)};
    if (married) hh.longTermCare.livingExpensesAfter2ndLtcStart = l.living2 != null ? l.living2 : LTC_LIVING2_DEFAULT;
  }
  out.push(JSON.stringify(hh));
  out.push('');
  out.push('## People and income sources (only enabled sources are listed; a disabled source contributes nothing)');
  people.forEach((p, i) => {
    const enabled = {},
      disabled = [];
    ['wage', 'ss', 'pension', 'ira', 'roth'].forEach(k => {
      if (p[k] && p[k].enabled) enabled[k] = chatStrip(p[k]);
      else disabled.push(k);
    });
    const rentalProps = (Array.isArray(p.rentals) ? p.rentals : [])
      .filter(r => r.enabled !== false)
      .map(r => {
        const c = chatStrip(r);
        if (!includeNames) c.name = 'Rental';
        return c;
      });
    const pf = (Array.isArray(p.brokerage) ? p.brokerage : [])
      .filter(b => b.enabled !== false)
      .map(b => {
        const c = chatStrip(b);
        if (!includeNames) c.name = 'Portfolio';
        return c;
      });
    const ann = (Array.isArray(p.annuities) ? p.annuities : [])
      .filter(a => a.enabled !== false)
      .map(a => {
        const c = chatStrip(a);
        if (!includeNames) c.name = 'Annuity';
        return c;
      });
    const re = (Array.isArray(p.realEstate) ? p.realEstate : [])
      .filter(r => r.enabled !== false)
      .map(r => {
        const c = chatStrip(r);
        if (!includeNames) c.name = 'Property';
        return c;
      });
    out.push(`${label(i)} (current age ${currentAge(p).toFixed(1)}):`);
    out.push(
      JSON.stringify({
        enabled,
        rentalProperties: rentalProps,
        brokeragePortfolios: pf,
        realEstateAssets: re,
        annuities: ann,
        notEnabled: disabled
      })
    );
  });
  out.push('');
  out.push('## Computed projection (one row per year, from the app; values are annual unless a balance)');
  out.push(
    'Columns: year; ages (per person, "-" = deceased); filing; wages; ss (Social Security); pension; rental (taxable rental income); rental_dep (non-cash rental depreciation, added to cash income, untaxed); annuity_taxable / annuity_tax_exempt (annuity payouts: taxable part is ordinary income, tax-exempt part is untaxed; both are household income); tax_exempt (tax-exempt portfolio income, untaxed, part of household income); ira_dist (IRA distributions/RMDs); roth_conv (Roth conversions); ira_exp (pre-tax IRA withdrawn to pay expenses once the portfolios are exhausted; taxable ordinary income); roth_exp (Roth IRA withdrawn to pay expenses after the pre-tax IRA is exhausted; untaxed); div (all dividends); qdiv (qualified dividends, included in div); ltcg (realized long-term gains, net of SCGL); agi; magi (AGI + tax-exempt income, used for IRMAA); taxable_ss; senior_ded (enhanced senior deduction, Schedule 1-A, tax years 2025–2028); marginal_pct (marginal rate on the next dollar of ordinary income, includes the Social Security tax torpedo); tax_total (all federal income tax incl. NIIT); state_tax (state income tax, 0 unless the State tax assumption is enabled; it is not in tax_total but exp_tax includes it); irmaa (Medicare surcharge); exp_living, exp_ltc, exp_tax, exp_irmaa, exp_aum, exp_total (household expenses); exp_unfunded (expenses no source could cover); excess_reinvested (household income left after all expenses, reinvested into portfolios with "Reinvest excess income" checked); bal_brokerage (excl. IDGT), bal_idgt, bal_ira, bal_roth, bal_annuity, bal_realestate (year balances; real estate values are after tax, counting exempt gains, and it pays no expenses).'
  );
  const head =
    'year,ages,filing,wages,ss,pension,rental,rental_dep,tax_exempt,annuity_taxable,annuity_tax_exempt,ira_dist,roth_conv,ira_exp,roth_exp,div,qdiv,ltcg,agi,magi,taxable_ss,senior_ded,marginal_pct,tax_total,state_tax,irmaa,exp_living,exp_ltc,exp_tax,exp_irmaa,exp_aum,exp_total,exp_unfunded,excess_reinvested,bal_brokerage,bal_idgt,bal_ira,bal_roth,bal_annuity,bal_realestate';
  out.push(head);
  (proj.rows || []).forEach(r => {
    let brk = 0,
      idgt = 0,
      reBal = 0;
    (r.portfoliosByPerson || []).forEach(list =>
      (list || []).forEach(e => {
        if (e.idgt) idgt += e.balance || 0;
        else brk += e.balance || 0;
      })
    );
    (r.realEstateByPerson || []).forEach(list =>
      (list || []).forEach(e => {
        reBal += e.balance || 0;
      })
    );
    out.push(
      [
        THIS_YEAR + r.k,
        (r.ages || []).map((a, i) => (r.alive && r.alive[i] === false ? '-' : Math.floor(a))).join('/'),
        r.filing,
        chatRound(r.wageTotal),
        chatRound(r.totalSS),
        chatRound(r.pension),
        chatRound(r.rental),
        chatRound(r.rentalDep),
        chatRound(r.teIncome),
        chatRound(r.annuity),
        chatRound(r.annuityTE),
        chatRound(r.iraTotal),
        chatRound(r.rothConvTotal),
        chatRound(r.iraExpTotal),
        chatRound(r.rothExpTotal),
        chatRound(r.odiv),
        chatRound(r.qdiv),
        chatRound(r.ltcg),
        chatRound(r.agi),
        chatRound(r.magi),
        chatRound(r.taxableSS),
        chatRound(r.seniorDeduction),
        (Number(r.marginalRate) * 100 || 0).toFixed(1),
        chatRound(r.totalTax),
        chatRound(r.stateTax),
        chatRound(r.irmaaSurcharge),
        chatRound(r.expLiving),
        chatRound(r.expLtc),
        chatRound(r.expTax),
        chatRound(r.expIrmaa),
        chatRound(r.expAum),
        chatRound(r.expTotal),
        chatRound(r.expUnfunded),
        chatRound(r.excessReinvested),
        chatRound(brk),
        chatRound(idgt),
        chatRound(chatSum(r.iraBalByPerson)),
        chatRound(chatSum(r.rothBalByPerson)),
        chatRound(r.annuityBalance),
        chatRound(reBal)
      ].join(',')
    );
  });
  if (
    proj.stretch &&
    proj.stretch.length &&
    proj.people.some(p => (p.ira.enabled && p.ira.stretch) || (p.roth && p.roth.enabled && p.roth.stretch))
  ) {
    const last = proj.stretch[proj.stretch.length - 1];
    out.push(
      `IRA stretch: after the last passing, stretch-flagged IRAs keep growing for ${proj.stretch.length} more years to about ${fmt(chatSum(last.iraBalByPerson) + chatSum(last.rothBalByPerson))} (pre-tax + Roth) with no withdrawals modeled.`
    );
  }
  if (!(proj.rows || []).length) out.push('(no projection rows — inputs are empty or incomplete)');
  return out.join('\n');
}

function buildChatSystemPrompt(includeNames) {
  return [
    `You are an assistant built into a retirement income planner web app. The user is looking at the app's charts and wants to discuss their own scenario. Below is a snapshot of their current inputs and of the app's computed projection.`,
    ``,
    `How to answer:`,
    `- Ground every answer in the snapshot. Quote specific years, ages and dollar amounts from it. If something is not in the snapshot, say so instead of guessing.`,
    `- Explain and interpret the app's results (what drives a tax spike, when expenses go unfunded, how balances evolve); do not silently recompute taxes from scratch. If you do a back-of-envelope calculation, label it as such.`,
    `- You never change the user's scenario. A "what if" is answered by running the scenario tools (below) on a copy of the scenario; the app shows the results as charts in the chat.`,
    `- Be concise and plain-spoken. Short paragraphs or a short list; a small table only when comparing years. No long preambles.`,
    `- You are not a financial, tax or legal advisor. Mention that briefly only when the user asks for a recommendation or a decision, and lay out the trade-offs rather than a confident directive.`,
    ``,
    `Model facts worth knowing: everything is in today's dollars; filing status switches to single the year after a spouse passes; income sources marked to continue to the spouse do so after a passing; household expenses (living costs, IRMAA, AUM fee, income tax) are paid from income first, then dividends of portfolios flagged "Pay expenses", then asset sales (which realize capital gains); Roth conversions and RMDs come from the pre-tax IRA; the projection ends at each person's planned passing age.` +
      (includeNames ? '' : ` People are labeled Person 1 / Person 2 (names are withheld).`),
    ``,
    `Scenario tools (run_scenarios, sweep, show_chart, get_rows, define_market_scenario, list_market_scenarios, run_market_scenarios, show_market_scenario_in_charts, list_scenarios, get_scenario, compare_scenarios, show_scenario, delete_scenario, list_runs, get_run, compare_runs, get_mc_summary, get_trial, get_stress_results, import_scenarios):`,
    `- For any what-if, comparison or "which age is best" question, call a tool instead of describing what to change. The app runs your levers through the planner's own projection engine on a copy of the scenario and draws the charts; the user's scenario is never changed.`,
    `- Quote only numbers that are in the scenario snapshot or in tool results. Never compute projections yourself, and never invent a chart: ask for one with the charts argument or show_chart.`,
    `- Put all scenarios to compare into ONE run_scenarios call (up to 6), and use sweep for "try every value of X". Normally one tool call is enough; do not call tools repeatedly.`,
    `- Every lever comes back applied, ignored (with a reason) or noEffect. If one is ignored or has no effect, tell the user plainly; never present unchanged numbers as a finding. Market-stress levers are simulations and cannot be saved as a Scenario.`,
    `- Market and inflation paths: when the user describes how the market or inflation should behave year by year (\"two bad years then recovery\", \"inflation at 8% for five years\"), call define_market_scenario with one nominal stock return per year (returnsPct, percent) and optionally one inflation value per year; use afterReturnPct / afterInflationPct to carry a long-run rate to the end of the scenario. Set showInCharts true when they ask to SEE it on the main charts (it is a replay, their scenario is never changed). list_market_scenarios and run_market_scenarios reuse the presets and earlier paths.`,
    `- Results the user already has on screen (their other Scenarios, the Stress test card, Monte Carlo, stress + Monte Carlo): call list_scenarios (every scenario, however it was made: scenario, stress test, Monte Carlo trial, saved market scenario, what-if), then get_scenario (detail "inputs" tells you what a scenario is made of; ask for a Monte Carlo trial as "mc trial 17") / compare_scenarios, or list_runs / get_run / compare_runs / get_mc_summary / get_trial / get_stress_results, to read them instead of guessing or re-running them; a run marked stale was made before the user edited the scenario. Use import_scenarios only when the user wants proposals they can review and add themselves.`,
    `- If the request is ambiguous (which person? from what age?), choose a sensible default, say in one line what you assumed, and run it. People are numbered 1 and 2 as in the snapshot.`,
    `- After the results, answer in a few short sentences: what changed, why, and one caveat. The headline-numbers table and the charts are already on screen, so do not repeat every figure. Dollar amounts from tools are in today's dollars.`,
    ``,
    `----- PLAN SNAPSHOT -----`,
    buildChatSnapshot(includeNames)
  ].join('\n');
}
