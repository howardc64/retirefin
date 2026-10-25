'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / EXCEL EXPORT — "Export Excel" button (next to Notes)
// downloads the scenario as a .xlsx workbook that is a LIVE model, not just a table of numbers:
//   • "Inputs" sheet — every assumption and input value (household, Social Security, pension, portfolios, IRAs, LTC, fees…).
//     Inflation, first year, passing ages, SCGL and the future-NIIT assumption are named cells the formulas use.
//   • "Tax tables" sheet — brackets, standard / senior deductions, qualified-dividend tiers, SS thresholds, NIIT, IRMAA tiers (named ranges).
//   • "Projection by year" — one row per year. Income sources, expense funding and other waterfall results are the app's
//     computed values (they come out of the app's iterative expense / LTCG / Roth-conversion solver); everything downstream
//     of them — totals, taxable SS, AGI, deductions, ordinary / qualified tax, NIIT, total tax, IRMAA, effective rate,
//     expense totals, balances — is an Excel formula, so editing a value or a tax-table entry flows through.
//   • One sheet per portfolio / annuity / IRA / Roth with roll-forward formulas.
//   • What is on screen is what is exported: a plan, a Monte Carlo trial, a stress test, or a market path shown from the chat / 🤖 LLM panel / live bridge (the B view, exported as a stress test named after the path).
// Read-only: never writes back into `state`. Uses the
// SheetJS ("xlsx") library, loaded the same way Chart.js is (a
// pinned CDN <script src> in index.html), so this file, like every
// other display file, only touches the DOM/browser APIs — no new
// financial logic lives here, it only formats numbers `projection.js`
// already computed.
// ═══════════════════════════════════════════════════════════════

function chartTotalIncome(r) {
  const v = x => x || 0;
  return (
    v(r.pension) +
    v(r.annuity) +
    v(r.annuityTE) +
    v(r.wageTotal) +
    v(r.rothConvTotal) +
    v(r.iraTotal) +
    v(r.iraExpTotal) +
    v(r.rental) +
    v(r.rentalDep) +
    v(r.teIncome) +
    v(r.rothExpTotal) +
    v(r.inhRothWd) +
    v(r.qdiv) +
    v(r.odivNQ) +
    v(r.ltcg) +
    (r.ssByPerson || []).reduce((a, b) => a + v(b), 0)
  );
}

// Builds every sheet. Returns {sheets:[{name,ws}], names[], calc} — shared by exportToExcel() and the Node test harness.
function xlsxBuildWorkbook(proj, trial) {
  proj.inflation = proj.inflation != null ? proj.inflation : state.inflation;
  const inputs = xlsxInputsSheet(proj, trial),
    tax = xlsxTaxSheet();
  const T = trial ? xlsxTrialSheet(proj, trial, inputs.addr) : null; // null (a scenario, or a projection without a recorded path): the constant-rate workbook
  const acct = xlsxAccountSheets(proj, inputs.addr, T);
  const cols = xlsxMainColumns(proj, acct, T);
  const main = xlsxSheet();
  xlsxPut(
    main,
    0,
    0,
    xlsxTxt(
      "Projection by year (today's $)" +
        (T ? `, ${trial.view === 'D' ? 'stress test' : 'Monte Carlo trial #' + trial.n}` : '') +
        '. Row 4 says whether a column is an Excel formula or a value solved by the app; formulas read the Inputs and Tax tables sheets' +
        (T ? ', the MC trial sheet' : '') +
        ' and the account sheets.'
    )
  );
  const t = xlsxTable(main, 2, cols, proj.rows);
  const sheets = [
    {name: 'Inputs', ws: inputs.ws},
    {name: 'Tax tables', ws: tax.ws}
  ]
    .concat(T ? [{name: T.name, ws: T.ws, _t: T.t, _cols: T.cols}] : [])
    .concat([{name: 'Projection by year', ws: xlsxFinish(main), _t: t, _cols: cols}]);
  acct.forEach(s =>
    sheets.push({name: s.name, ws: s.type === 'annuity' ? xlsxAoa(s.rows) : s.ws, _t: s.t, _cols: s.cols, _items: s.items})
  );
  return {sheets, names: inputs.names.concat(tax.names)};
}
// Annuity sheet: row 0 = headers, then one row per live year (Year, age, then dollar amounts), formatted like the other sheets.
function xlsxAoa(rows) {
  const sh = xlsxSheet();
  rows.forEach((row, r) =>
    row.forEach((v, c) => {
      if (r === 0) xlsxPut(sh, r, c, xlsxTxt(v));
      else if (typeof v === 'number') xlsxPut(sh, r, c, xlsxNum(v, c === 0 ? XLSX_YEAR : c === 1 ? XLSX_AGE : XLSX_MONEY));
    })
  );
  return xlsxFinish(sh);
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert(
      'The Excel export library failed to load (needs an internet connection the first time). Please check your connection and try again.'
    );
    return;
  }
  if (!lastProjection || !lastProjection.rows.length) {
    alert('Nothing to export yet — enable at least one income source first.');
    return;
  }
  const built = xlsxBuildWorkbook(lastProjection, xlsxTrialContext());
  const wb = XLSX.utils.book_new();
  built.sheets.forEach(s => XLSX.utils.book_append_sheet(wb, s.ws, s.name));
  wb.Workbook = {Names: built.names, CalcPr: {fullCalcOnLoad: true}};
  XLSX.writeFile(wb, viewContext().fileName || 'retirement-plan.xlsx');
}
