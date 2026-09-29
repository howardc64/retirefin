'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / EXCEL EXPORT — "Export to Excel" button (next to Notes)
// downloads the full year-by-year projection (everything every chart
// in js/display/ reads, spec §4.6's row schema) as a .xlsx workbook,
// one row per projected year (plus one sheet per portfolio / IRA), so it can be reviewed/audited outside
// the app. Read-only: never writes back into `state`. Uses the
// SheetJS ("xlsx") library, loaded the same way Chart.js is (a
// pinned CDN <script src> in index.html), so this file, like every
// other display file, only touches the DOM/browser APIs — no new
// financial logic lives here, it only formats numbers `projection.js`
// already computed.
// ═══════════════════════════════════════════════════════════════

// One column definition: `head` is the header cell, `get(row, proj)` returns that column's
// value for a given projection row. Kept as a flat list (rather than nested per-person tables)
// so the sheet stays one row per projected year, easy to sort/filter/chart in Excel.
function xlsxColumns(proj){
  const married=proj.married;
  const per=(field, label)=> married
    ? [0,1].map(i=>({head:`${displayPersonName(proj.people[i],i)} ${label}`, get:r=>r[field][i]||0}))
    : [{head:label, get:r=>r[field][0]||0}];

  const cols=[
    {head:'Year', get:r=>THIS_YEAR+r.k},
    {head:ageAxisLabel(proj), get:r=>round1(r.age0)},
    ...per('ages','Age'),
    {head:'Filing status', get:r=>r.filing==='married'?'Married (MFJ)':'Single'},
    ...per('wageByPerson','Wage'),
    {head:'Wage total', get:r=>r.wageTotal},
    ...per('ssByPerson','Social Security (SS)'),
    {head:'Social Security (SS) total', get:r=>r.totalSS},
    ...per('pensionByPerson','Pension'),
    {head:'Pension total', get:r=>r.pension},
    ...per('rentalByPerson','Rental'),
    {head:'Rental total', get:r=>r.rental},
    ...per('rothConvByPerson','Pre-tax IRA withdraw'),
    {head:'Pre-tax IRA withdraw total', get:r=>r.rothConvTotal},
    ...per('iraByPerson','IRA RMD'),
    {head:'IRA RMD total', get:r=>r.iraTotal},
    {head:'Ordinary dividends (ODIV−QDIV)', get:r=>r.odivNQ},
    {head:'Qualified dividends (QDIV)', get:r=>r.qdiv},
    {head:'LTCG realized, gross', get:r=>r.ltcgGross},
    {head:'SCGL used', get:r=>r.scglUsed},
    {head:'SCGL remaining (today\'s $)', get:r=>r.scglRemaining},
    {head:'LTCG, net of SCGL (taxed)', get:r=>r.ltcg},
    {head:'Foreign tax credit', get:r=>r.foreignTaxCredit},
    {head:'Household IRMAA surcharge (expense)', get:r=>r.irmaaSurcharge||0},
    {head:'AUM balance (start of year)', get:r=>r.aumBalance||0},
    {head:'  of which IRAs (pre-tax + Roth)', get:r=>r.aumBalanceIra||0},
    {head:'AUM fee, total charged', get:r=>r.aumFee||0},
    {head:'Living expenses', get:r=>r.expLiving||0},
    {head:'AUM fee paid by household (non-IDGT)', get:r=>r.expAum||0},
    {head:'Income tax paid as expense (tax drag)', get:r=>r.expTax||0},
    {head:'Total household expenses', get:r=>r.expTotal||0},
    {head:'Household cash income (wage+SS+pension+rental+RMD)', get:r=>r.cashIncome||0},
    {head:'Expenses paid by household income', get:r=>r.expFromIncome||0},
    {head:'Expenses paid by dividends', get:r=>r.expFromDiv||0},
    {head:'Expenses paid by asset sales', get:r=>r.expFromSales||0},
    {head:'Expenses unfunded', get:r=>r.expUnfunded||0},
    ...per('iraBalByPerson','Pre-tax IRA balance (EOY)'),
    ...per('rothBalByPerson','Roth IRA balance (EOY)'),
    {head:'Brokerage balance, non-IDGT (SOY)', get:r=>sumPortfolios(r,false,'balance')},
    {head:'Brokerage balance, IDGT (SOY)', get:r=>sumPortfolios(r,true,'balance')},
    {head:'Unrealized gain, non-IDGT (SOY)', get:r=>r.embeddedGain||0},
    {head:'Unrealized gain, IDGT (SOY)', get:r=>r.embeddedGainIdgt||0},
    {head:'Taxable Social Security (SS)', get:r=>r.taxableSS},
    {head:'Provisional income', get:r=>r.provisional},
    {head:'Adjusted gross income (AGI)', get:r=>r.agi},
    {head:'Standard deduction', get:r=>r.std},
    {head:'Ordinary taxable income', get:r=>r.ordTI},
    {head:'Ordinary tax', get:r=>r.ordTax},
    {head:'Qualified tax (QDIV+LTCG)', get:r=>r.qualTax},
    {head:'Social Security Tax (SST)', get:r=>r.sst},
    {head:'Marginal tax rate', get:r=>pct(r.marginalRate)},
    {head:'Net investment income (NII)', get:r=>r.niiIncome},
    {head:'NIIT (3.8%)', get:r=>r.niit},
    {head:'Total Tax (TT)', get:r=>r.totalTax},
    {head:'Effective tax rate', get:r=>pct(r.agi>0?r.totalTax/r.agi:0)}
  ];
  return cols;
}
function round1(n){ return Math.round((n||0)*10)/10; }
function pct(n){ return Math.round((n||0)*1000)/1000; } // stored as a fraction; formatted as % below
function sumPortfolios(r,idgt,field){
  let s=0; r.portfoliosByPerson.forEach(list=>list.forEach(e=>{ if(!!e.idgt===idgt) s+=(e[field]||0); }));
  return s;
}

// ── Per-account sheets ──────────────────────────────────────────────────────────────────────────
// Every enabled brokerage portfolio, and every enabled pre-tax IRA and Roth IRA, gets its own sheet
// (one row per projected year), so each account's detail can be audited on its own and the sheet
// count simply follows however many accounts the plan has. Disabled accounts are skipped.

// Excel sheet names: max 31 chars, none of  [ ] : * ? / \ , and unique within the workbook.
function xlsxSheetName(base, used){
  let n=String(base).replace(/[\[\]:*?\/\\]/g,'-').trim().slice(0,31)||'Sheet';
  let cand=n, k=2;
  while(used.has(cand.toLowerCase())){
    const suf=' ('+k+')'; cand=n.slice(0,31-suf.length)+suf; k++;
  }
  used.add(cand.toLowerCase());
  return cand;
}

function xlsxPortfolioSheet(proj, i, bi){
  const person=displayPersonName(proj.people[i], i);
  const rows=[['Year',`${person} age`,'Balance (SOY)','Growth %','Net growth %','AUM fee share','Realized LTCG','Cost basis (SOY)','Unrealized gain (SOY)','Stepped up this year','Dividends used for expenses','Dividends reinvested','Shares sold']];
  proj.rows.forEach(r=>{
    const e=r.portfoliosByPerson[i][bi]; if(!e) return;
    rows.push([THIS_YEAR+r.k, round1(r.ages[i]), e.balance, round1(e.growthPct), round1(e.netGrowthPct!=null?e.netGrowthPct:e.growthPct),
      e.feeDrag, e.ltcg,
      e.tracked?e.basis:'', e.tracked?e.unrealizedGain:'', e.steppedUp?'Yes':'',
      e.divUsed, e.divReinvested, e.sold]);
  });
  return rows;
}
function xlsxIraSheet(proj, i){
  const person=displayPersonName(proj.people[i], i);
  const rows=[['Year',`${person} age`,'RMD','Pre-tax IRA withdraw (Roth conversion)','Pre-tax IRA balance (EOY)','After last passing (heirs)']];
  proj.rows.forEach(r=>rows.push([THIS_YEAR+r.k, round1(r.ages[i]), r.iraByPerson[i]||0, r.rothConvByPerson[i]||0, r.iraBalByPerson[i]||0, '']));
  if(proj.people[i].ira.stretch) (proj.stretch||[]).forEach(r=>rows.push([THIS_YEAR+r.k, round1(r.ages[i]), 0, 0, r.iraBalByPerson[i]||0, 'Yes']));
  return rows;
}
function xlsxRothSheet(proj, i){
  const person=displayPersonName(proj.people[i], i);
  const rows=[['Year',`${person} age`,'Converted in from pre-tax IRA','Roth IRA balance (EOY)','After last passing (heirs)']];
  proj.rows.forEach(r=>rows.push([THIS_YEAR+r.k, round1(r.ages[i]), r.rothConvByPerson[i]||0, r.rothBalByPerson[i]||0, '']));
  if(proj.people[i].roth.stretch) (proj.stretch||[]).forEach(r=>rows.push([THIS_YEAR+r.k, round1(r.ages[i]), 0, r.rothBalByPerson[i]||0, 'Yes']));
  return rows;
}
// [{name, rows}] for every enabled portfolio / IRA / Roth IRA, in person order (portfolios, then IRA, then Roth).
function xlsxAccountSheets(proj){
  const used=new Set(['projection by year']), out=[];
  const add=(base,rows)=>out.push({name:xlsxSheetName(base,used), rows});
  proj.people.forEach((p,i)=>{
    const person=displayPersonName(p,i);
    (p.brokerage||[]).forEach((b,bi)=>{
      if(b.enabled===false) return;
      const e=proj.rows.length&&proj.rows[0].portfoliosByPerson[i][bi];
      const nm=(e&&e.name)||('Portfolio '+(bi+1));
      add(`${person} - ${nm}${b.idgt?' (IDGT)':''}`, xlsxPortfolioSheet(proj,i,bi));
    });
    if(p.ira&&p.ira.enabled) add(`${person} - Pre-tax IRA`, xlsxIraSheet(proj,i));
    if(p.roth&&p.roth.enabled) add(`${person} - Roth IRA`, xlsxRothSheet(proj,i));
  });
  return out;
}

function exportToExcel(){
  if(typeof XLSX==='undefined'){ alert('The Excel export library failed to load (needs an internet connection the first time). Please check your connection and try again.'); return; }
  if(!lastProjection || !lastProjection.rows.length){ alert('Nothing to export yet — enable at least one income source first.'); return; }
  const proj=lastProjection;
  const cols=xlsxColumns(proj);
  const header=cols.map(c=>c.head);
  const body=proj.rows.map(r=>cols.map(c=>c.get(r)));
  const wsYears=XLSX.utils.aoa_to_sheet([header, ...body]);
  wsYears['!cols']=header.map(h=>({wch:Math.max(10,Math.min(32,h.length+2))}));
  // Percent columns (marginal/effective rate) get a % display format so they don't read as raw fractions.
  const pctCols=header.reduce((a,h,i)=>{ if(h==='Marginal tax rate'||h==='Effective tax rate') a.push(i); return a; },[]);
  for(let r=1;r<=body.length;r++) pctCols.forEach(ci=>{
    const cell=wsYears[XLSX.utils.encode_cell({r,c:ci})]; if(cell) cell.z='0.0%';
  });

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsYears, 'Projection by year');
  xlsxAccountSheets(proj).forEach(sh=>{
    const ws=XLSX.utils.aoa_to_sheet(sh.rows);
    ws['!cols']=sh.rows[0].map(h=>({wch:Math.max(10,Math.min(32,String(h).length+2))}));
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  });
  XLSX.writeFile(wb, 'retirement-plan.xlsx');
}
