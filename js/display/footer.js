'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / FOOTER — one-line summary of the app's simplifying
// tax/benefit assumptions.
// ═══════════════════════════════════════════════════════════════
function renderFooter(){
  document.getElementById('assumptionsFooter').innerHTML =
    `All figures shown in today's dollars · Social Security (SS) COLA assumed equal to inflation · 2026 simplified federal tax model (TCJA permanent under OBBBA), no AMT/itemized deductions/credits · includes 3.8% NIIT on net investment income above the un-indexed $200k single / $250k married MAGI threshold · IRMAA uses current-year MAGI as a proxy (actual IRMAA uses a 2-year lookback) · Household expenses (living costs, the IRMAA surcharge, the AUM fee and income tax) are paid from household income first, then the dividends, then the asset sales of portfolios with Pay expenses checked (which realize LTCG); because selling shares to pay tax realizes more gain, each year's tax is solved by iteration; brokerage balances change each year by growth − dividends used − shares sold · IRA required withdrawals follow the IRS Uniform Lifetime Table · For informational purposes only — not financial, tax or legal advice.`;
}

