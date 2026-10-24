'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHART ELEMENT INFO — the "Chart Element" checkbox (header, left of "Popup Details").
// When checked, hovering a chart shows a popup that DESCRIBES the chart element under the cursor (a stacked band, a dashed
// line, a Social Security claiming-age line…) instead of the usual per-year values. The usual popup (chartHelpers.js
// externalTooltip) does nothing while this is on; this file draws into the same floating #extTooltip <div>, so it follows
// the Popup background slider.
// Read-only: only reads chart/dataset objects and `lastProjection`; never writes into `state`.
// ═══════════════════════════════════════════════════════════════
let chartInfo=true;   // default on; the header checkbox (index.html) starts checked to match

// An alert strip above a chart (expense / asset): one red line; its details live in the Chart Element popup (or the browser tooltip when that box is off).
function setAlertDetail(el,name,value,text){
  el.dataset.name=name; el.dataset.value=value||''; el.dataset.detail=text; el.title=chartInfo?'':text;
}
function setChartInfo(on){
  chartInfo=!!on;
  document.querySelectorAll('.unfunded-alert[data-detail]').forEach(a=>{ a.title=chartInfo?'':a.dataset.detail; });
  const el=document.getElementById('extTooltip');
  if(el){ el.style.opacity=0; el._shown=false; }
}

// ── What each element means ───────────────────────────────────────────────────────────────────────────────────────────
// Each entry: [test(label), text]. First match wins. Labels are the dataset labels the charts use (several carry a person's name).
const CI_INFL_EFFECT='It moves fixed-dollar items (a pension with no COLA, un-indexed tax thresholds, cost basis) and nominal-rate growth.';
const CI_INCOME=[
  [/Social Security/i, 'Social Security benefit paid to this person. Only part of it is taxable (0%, up to 50% or up to 85%, depending on provisional income) — the taxable part is what appears on the MAGI and taxable ordinary income charts.'],
  [/^Pension/, 'Pension income. Taxed as ordinary income.'],
  [/^Annuity payout \(taxable\)/, 'Taxable payout from an annuity. Taxed as ordinary income (and counted as net investment income for NIIT when the annuity is non-qualified).'],
  [/^Annuity payout \(tax-exempt/, 'Tax-exempt part of an annuity payout (return of principal). It is cash income but is not taxed and, being a return of the owner\'s own premium, does not count toward provisional income or IRMAA MAGI.'],
  [/^Wage/, 'Wages or self-employment income. Taxed as ordinary income.'],
  [/^Pre-tax IRA withdraw \(for expenses\)/, 'Money withdrawn from a pre-tax IRA/401(k) to pay household expenses when income, dividends and asset sales were not enough. Taxed as ordinary income.'],
  [/^Roth conversion/, 'The part of the annual pre-tax IRA/401(k) withdraw that is converted to a Roth IRA ("Withdraw is Roth conversion" ticked). It is taxed as ordinary income in the year it converts, so it counts toward AGI, MAGI (IRMAA), taxable Social Security and the ordinary tax brackets, but it moves into the Roth IRA and is not spendable. An inherited IRA cannot be converted.'],
  [/^Pre-tax IRA withdraw/, 'Annual pre-tax IRA/401(k) withdrawal set on the IRA card (on top of the RMD), the part that is not a Roth conversion. Taxed as ordinary income and spendable as household cash.'],
  [/^IRA RMD/, 'Required minimum distribution from a pre-tax IRA/401(k), forced by the IRS from the RMD age onward. Taxed as ordinary income.'],
  [/^Rental income/, 'Taxable rental income, net of depreciation. Taxed as ordinary income.'],
  [/^Rental depreciation/, 'Non-cash depreciation on a rental property. It is cash you actually receive but is not taxed, so it is shown separately from the taxable rental income.'],
  [/^Tax-exempt income/, 'Tax-exempt income, e.g. municipal-bond interest paid out by a portfolio. Not taxed, but it counts toward household income, provisional income and IRMAA MAGI.'],
  [/^Inherited IRA withdraw/, 'Withdrawal from a pre-tax IRA inherited through the Inheritance card. An inherited IRA must be emptied by the end of the 10th year after it was inherited. Taxed as ordinary income.'],
  [/^Inherited Roth IRA withdraw/, 'Withdrawal from a Roth IRA inherited through the Inheritance card. It must be emptied by the end of the 10th year after it was inherited. Tax-free, so it adds nothing to AGI or MAGI.'],
  [/^Roth IRA withdraw/, 'Money withdrawn from a Roth IRA to pay household expenses. Tax-free, so it adds nothing to AGI.'],
  [/^Qual\. dividends/, 'Qualified dividends (QDIV) paid by your brokerage portfolios. Taxed at the preferential 0% / 15% / 20% rates, and part of net investment income.'],
  [/^Ordinary dividends/, 'The non-qualified part of portfolio dividends (ordinary dividends minus qualified dividends). Taxed as ordinary income and part of net investment income.'],
  [/^SCGL remaining/, "The suspended capital-gain loss (SCGL) carryforward still unused at the end of the year, in today's dollars. Realized long-term gains use it up dollar for dollar before they are taxed, so the line falls as gains are realized and ends when it is used up."],
  [/^Long-term gains/, 'Long-term capital gains realized when portfolio assets are sold (to pay expenses). Taxed at the preferential 0% / 15% / 20% rates, net of any short-term capital loss (SCGL) carry-forward used.']
];
const CI_MAGI='This band is the part of this income source that goes into modified adjusted gross income (MAGI). Medicare IRMAA surcharges are set by the MAGI of two years earlier; the thin solid IRMAA lines mark where each surcharge tier starts.';
const CI_ORD='This band is the part of this source that is taxable ordinary income after the deduction was taken off the bottom of the stack. The thin solid dark lines are the ordinary tax-bracket limits, labeled with the rate that applies above each line.';
const CI_EXP=[
  [/^Living expenses/, 'Household living expenses you entered, in today\'s dollars (reduced to the amount set for after the first Long Term Care starts, when LTC is modeled).'],
  [/^Long Term Care/, 'Long Term Care cost for each person while care is needed, as set in the LTC panel. It is the only expense that can be itemized (the part above 7.5% of AGI).'],
  [/^Income tax/, 'Income tax paid as an expense ("tax drag"): federal tax + NIIT + state tax, less any tax already paid out of a property sale. It is paid from income first, then dividends, asset sales or IRA withdrawals.'],
  [/^IRMAA/, 'Medicare Part B + D income-related surcharge, per person on Medicare, based on MAGI from two years earlier.'],
  [/^AUM fee/, 'Assets-under-management fee charged on the balance of the portfolios marked as AUM, either a % of that balance or a fixed amount.']
];
const CI_TAX=[
  [/^Ordinary income tax/, 'Federal tax on ordinary income (wages, pension, rental, taxable Social Security, IRA withdrawals, ordinary dividends…) after the standard/itemized and senior deductions, using the filing status\' brackets.'],
  [/^(QDIV|LTCG) (\d+)% tax/, null],   // built below from the match
  [/^NIIT/, 'Net Investment Income Tax: 3.8% of the lesser of net investment income or MAGI above the threshold ($250,000 married / $200,000 single unless a future-law change is set).'],
  [/^Foreign tax credit/, 'Foreign tax credit, subtracted from income tax. It does not reduce the NIIT.'],
  [/^Effective tax rate/, 'Effective tax rate: total tax divided by AGI. Read it on the right-hand axis.'],
  [/^State income tax/, 'State income tax (dashed line, drawn on top of the federal stack). It is not part of Total Tax, but is paid as a household expense.'],
  [/^IRMAA surcharge/, 'Medicare IRMAA surcharge drawn on top of the tax stack, for comparison with the tax. It is an expense, not an income tax.']
];

function ciDescribe(key, ds, kidx){
  const label=String(ds.label==null?'':ds.label);
  const pick=(table)=>{ for(const [re,txt] of table) if(re.test(label)) return txt; return null; };
  switch(key){
    case 'income':
      return pick(CI_INCOME);
    case 'incomeMagi': { const t=pick(CI_INCOME); return t?t+' '+CI_MAGI:null; }
    case 'incomeOrd':
      if(ds.ordLabel) return 'Federal ordinary tax bracket limit. Taxable ordinary income above this line is taxed at '+ds.ordLabel+' (the limit for the filing status in force that year).';
      if(label==='Deduction') return 'Top of the gross ordinary income: the gap between the stack and this red line is the deduction (standard or itemized, plus the senior deduction) absorbed that year.';
      { const t=pick(CI_INCOME); return t?t+' '+CI_ORD:null; }
    case 'incomeQual':
      if(label==='Deduction') return 'Qualified income before the deduction: the gap between the stack and this red line is the part of the deduction left over after ordinary income (e.g. itemized LTC costs), which shelters qualified income (LTCG first).';
      if(ds.ordLabel) return 'Qualified-income tax threshold: where the '+ds.ordLabel+' rate starts. The bracket limit applies to total taxable income and qualified income sits on top of the taxable ordinary income (Qualified Dividends and Capital Gain Tax Worksheet), so this line is the limit minus that year\'s taxable ordinary income — it moves with the ordinary income. Qualified dividends and long-term gains stacked above it are taxed at '+ds.ordLabel+'.';
      return pick(CI_INCOME);
    case 'tss':
      if(/^Total Social Security/.test(label)) return 'Total Social Security (TSS): everything the household receives from Social Security that year, before any of it is taxed.';
      if(/^Actual Social Security Tax/.test(label)) return 'Actual Social Security Tax (SST): the income tax actually due because of Social Security — the extra tax caused by the taxable part of the benefit (0%, up to 50% or up to 85% of it).';
      return null;
    case 'market':
      return 'Nominal yearly return of this asset in the years it is in the scenario: (1 + the growth rate the projection used) × (1 + that year\'s inflation) − 1, i.e. the rate you enter on its card ("inflation + 4%" shows as 7% at 3% inflation). In the scenario it is flat; in a Monte Carlo trial it follows that trial\'s market shocks (equity-like assets share one market, real estate has its own) and its inflation.';
    case 'inflation':
      if(/^Scenario inflation/.test(label)) return 'The inflation rate the scenario assumes every year (the Inflation slider). Prices, tax thresholds that are indexed, and "today\'s $" amounts all follow it.';
      if(/^Monte Carlo trial/.test(label)) return 'The inflation rate drawn for this Monte Carlo trial: it drifts around the scenario\'s rate and tends to stay high or low for a few years in a row. '+CI_INFL_EFFECT;
      if(/^Stress test inflation rate/.test(label)) return 'The inflation rate this stress test applies: the stress scenario\'s own yearly inflation in the years it runs, and the scenario\'s rate in every other year. '+CI_INFL_EFFECT;
      if(/^Stress \+ Monte Carlo trial inflation rate/.test(label)) return 'The inflation rate of this Monte Carlo trial with the stress test laid over it: the stress scenario\'s own yearly inflation in the years it runs, and the trial\'s drawn rate in every other year. '+CI_INFL_EFFECT;
      return null;
    case 'expense':
      return pick(CI_EXP);
    case 'tax': case 'taxOrd': case 'taxQual': {
      const m=/^(QDIV|LTCG) (\d+)% tax/.exec(label);
      if(m) return (m[1]==='QDIV'?'Tax on qualified dividends':'Tax on long-term capital gains')+' that fall in the '+m[2]+'% qualified-income bracket.';
      return pick(CI_TAX);
    }
    case 'ss': {
      const m=/^Age (\d+)/.exec(label);
      if(!m) return null;
      return 'Cumulative household Social Security collected over time if the starting person claims at age '+m[1]+(/selected/.test(label)?' (the start age currently selected on the Social Security card; dashed)':'')+'. Where a later-claiming line crosses an earlier one is the break-even age.';
    }
    case 'asset': case 'idgt': {
      const k=ds.vzKind;
      if(k==='pfBasis') return 'Cost basis of this portfolio (dashed). The gap between the colored band and this line is the unrealized gain. Basis steps up to market value at the owner\'s passing.';
      if(k==='reBasis') return 'Cost basis of this property (dotted). The gap between the band and this line is the unrealized gain; it steps up at the owner\'s passing.';
      if(k==='portfolio') return 'Value of this brokerage portfolio (stacked with the other accounts). It grows at its growth rate, pays dividends, and is drawn down by the expenses and taxes it is set to pay; sales realize capital gains.';
      if(k==='ira') return 'Pre-tax IRA/401(k) balance. Withdrawals are taxed as ordinary income; RMDs start at the RMD age and Roth conversions move money out of it.';
      if(k==='roth') return 'Roth IRA balance. Withdrawals are tax-free; it grows by market growth plus any Roth conversions.';
      if(k==='realestate') return 'Value of this property. It is passive (no income); its gain is taxed only if the property is sold.';
      if(k==='annuity') return 'Value of this annuity.';
      if(k==='inhira') return 'An IRA inherited through the Inheritance card. It arrives in the start year, grows, and must be fully withdrawn by the end of the 10th year after that, even if it passes to a spouse. If the original owner had already started RMDs, the current holder takes an RMD every year by their own age (the spouse\'s, after a spouse takes over); otherwise nothing is required until year 10. Pre-tax withdrawals are taxed as ordinary income; Roth withdrawals are tax-free; a pre-tax one can also have an annual withdraw (optionally a Roth conversion into the holder\'s Roth IRA).';
      return null;
    }
    case 'inhIncome':
      if(/IRA/.test(label)) return 'Income paid this year by an IRA inherited through the Inheritance card: its RMD, annual withdraw or the final withdrawal in year 10. A pre-tax IRA is taxed as ordinary income; an inherited Roth IRA is tax-free.';
      if(/^Real estate sale gain/.test(label)) return 'Gain realized this year when an inherited property is sold (value over its stepped-up basis and exemption). It is taxed as long-term capital gain.';
      return 'Income paid this year by a brokerage portfolio inherited through the Inheritance card: its dividends plus any tax-exempt income.';
    case 'ira': {
      if(/^(.* \u2014 )?Inherited Roth IRA/.test(label)) return 'Withdrawal from an inherited Roth IRA (the 10-year rule: the whole balance is out by year 10). Tax-free.';
      if(/Inherited IRA RMD/.test(label)) return 'Required distribution from an inherited pre-tax IRA: the yearly RMD (Single Life Expectancy table) when the original owner had started RMDs, and everything left in year 10. Taxed as ordinary income.';
      if(/Inherited IRA annual withdraw/.test(label)) return 'Annual withdraw set on an inherited pre-tax IRA card, on top of its required distribution. Taxed as ordinary income and spendable (an inherited IRA cannot be converted to a Roth IRA).';
      if(/RMD/.test(label)) return 'Required minimum distribution from this person\'s pre-tax IRA/401(k), forced by the IRS from the RMD age onward. Taxed as ordinary income.';
      if(/Annual withdraw/.test(label)) return 'Annual withdrawal from this person\'s pre-tax IRA, set on the IRA card (on top of the RMD). Taxed as ordinary income; it moves into their Roth IRA when "Withdraw is Roth conversion" is ticked, otherwise it is spendable cash.';
      if(/withdraw/i.test(label)) return 'Money withdrawn from this person\'s pre-tax IRA/401(k) to pay household expenses when income, dividends and asset sales were not enough. Taxed as ordinary income.';
      if(/Roth conversion/.test(label)) return 'Amount converted from this person\'s pre-tax IRA to their Roth IRA that year (a withdrawal on top of the RMD). The converted amount is taxed as ordinary income and then moves into the Roth IRA.';
      return null;
    }
    case 'ltcg': {
      if(/^Real estate/.test(label)) return 'Long-term capital gain realized on property sold that year (the gain over the basis and exemption). Real estate is only sold to cover an expense shortfall or by the withdrawal order.';
      if(/^Net LTCG/.test(label)) return 'Long-term capital gain actually taxed (dashed): the realized gain after the Suspended Capital-Gain Loss (SCGL) carryforward has been used against it.';
      return 'Long-term capital gain realized this year by selling shares of this brokerage portfolio (before any SCGL offset). The gain is the share of each sale above its cost basis.';
    }
  }
  return null;
}

// Name of the whole stack on each stacked chart (shown when the pointer is at the top of the stack: ciElementAt).
const CI_TOTAL_NAME={expense:'Total annual expenses', income:'Total income', incomeMagi:'Total MAGI', incomeOrd:'Total taxable ordinary income', incomeQual:'Total taxable qualified income',
  tax:'Total income tax', taxOrd:'Total ordinary income tax', taxQual:'Total QDIV / LTCG / NIIT tax', asset:'Total asset value', idgt:'Total IDGT value',
  ira:'Total out of IRAs', ltcg:'Total realized LTCG', inhIncome:'Total inheritance asset income'};

// ── Which element is under the cursor ─────────────────────────────────────────────────────────────────────────────────
// Index-mode charts cannot say which band the pointer is on, so it is found from the pointer's height: a dashed/solid line
// within a few pixels wins; otherwise the stacked band whose top is the first one above the pointer (counting up from the axis).
function ciSegDist(px,py,a,b){
  const dx=b.x-a.x, dy=b.y-a.y, L=dx*dx+dy*dy;
  let t=L>0?((px-a.x)*dx+(py-a.y)*dy)/L:0; t=Math.max(0,Math.min(1,t));
  return Math.hypot(px-(a.x+t*dx), py-(a.y+t*dy));
}
// A pointer slightly ABOVE the top edge of a stack (up to CI_TOP_PX canvas pixels) reports the whole stack's total. Only above: a pointer on or below the edge belongs to the top band, so a thin band at the top of the stack can still be pointed at.
const CI_TOP_PX=12;
function ciElementAt(chart, e, key){
  const els=chart.getElementsAtEventForMode(e,'index',{intersect:false},false);
  if(!els||!els.length) return null;
  const idx=els[0].index;
  const rect=chart.canvas.getBoundingClientRect();
  const px=(e.clientX-rect.left)*(chart.width/rect.width), py=(e.clientY-rect.top)*(chart.height/rect.height);
  const ok=(pt,ds,i)=>pt&&!pt.skip&&ds.data[i]!=null&&Number.isFinite(pt.x)&&Number.isFinite(pt.y);
  let line=null, lineD=1e9;
  const bands=[];
  chart.data.datasets.forEach((ds,di)=>{
    const meta=chart.getDatasetMeta(di);
    if(ds.irmaaOff||!meta||meta.hidden||chart.isDatasetVisible&&!chart.isDatasetVisible(di)) return;
    const pts=meta.data;
    if(ds.fill){
      // Height of the band's top edge at the pointer's x, interpolated between the two neighbouring years (steep edges).
      let i0=pts[idx]&&pts[idx].x>px?idx-1:idx; if(i0<0) i0=0;
      const A=pts[i0], B=pts[i0+1];
      let y=null;
      if(ok(A,ds,i0)&&ok(B,ds,i0+1)&&B.x>A.x) y=A.y+(B.y-A.y)*Math.max(0,Math.min(1,(px-A.x)/(B.x-A.x)));
      else if(ok(pts[idx],ds,idx)) y=pts[idx].y;
      if(y!=null) bands.push({di,ds,y});
      return;
    }
    // Lines: true distance from the pointer to the segments around this year, so a near-vertical stretch is hit anywhere along it.
    for(let i=Math.max(0,idx-2); i<=Math.min(pts.length-2,idx+1); i++){
      const A=pts[i], B=pts[i+1];
      if(!ok(A,ds,i)||!ok(B,ds,i+1)) continue;
      const d=ciSegDist(px,py,A,B);
      if(d<lineD){ lineD=d; line={di,ds}; }
    }
    if(ok(pts[idx],ds,idx)&&lineD>=1e9){ const d=Math.hypot(px-pts[idx].x,py-pts[idx].y); if(d<lineD){ lineD=d; line={di,ds}; } }
  });
  if(line&&lineD<=9) return {...line,idx};
  if(CI_TOTAL_NAME[key]&&bands.length){
    const top=bands.reduce((m,b)=>b.y<m.y?b:m,bands[0]);   // the band whose top edge is highest on screen = the top of the stack
    if(py<top.y-0.5&&py>=top.y-CI_TOP_PX){
      let total=0, any=false;   // the stack's height at this year = the sum of the filled bands in the top band's stack group (lines such as the cost basis or the foreign tax credit are not part of it)
      chart.data.datasets.forEach((ds,di)=>{
        const meta=chart.getDatasetMeta(di);
        if(!ds.fill||ds.stack!==top.ds.stack||!meta||meta.hidden||(chart.isDatasetVisible&&!chart.isDatasetVisible(di))) return;
        const v=ds.data[idx]; if(typeof v==='number'&&Number.isFinite(v)){ total+=v; any=true; }
      });
      if(any&&total>=0.5) return {stackTotal:total,ds:top.ds,di:top.di,idx};
    }
  }
  bands.sort((a,b)=>b.y-a.y||a.di-b.di);   // lowest band on screen first
  for(const b of bands){ if(b.y<=py+0.5) return {di:b.di,ds:b.ds,idx}; }
  return null;
}

// ── Overlay-drawn elements (not datasets): LTC bar, IRMAA tier lines, IRA stretch bar ─────────────────────────────────
function ciOverlayAt(key, chart, e, datasetHit){
  const rect=chart.canvas.getBoundingClientRect();
  const px=(e.clientX-rect.left)*(chart.width/rect.width), py=(e.clientY-rect.top)*(chart.height/rect.height);
  const area=chart.chartArea, xs=chart.scales&&chart.scales.x, ys=chart.scales&&chart.scales.y;
  if(!area||!xs||!ys||px<area.left||px>area.right) return null;
  const n=(chart.data.labels||[]).length; if(!n) return null;
  const idx=Math.max(0,Math.min(n-1,Math.round(xs.getValueForPixel(px))));
  // Inheritance arrival ▲: just below the x-axis line (overlayPlugin.js inhArrivalPlugin).
  if(py>area.bottom && py<=area.bottom+INH_ARROW_GAP+INH_ARROW_H+4 && chart._inhArrows){
    const t=chart._inhArrows.find(t=>Math.abs(px-t.px)<=INH_ARROW_H*0.9);
    if(t) return {name:'Inheritance arrives', color:INH_ARROW_COLOR, value:mrow('Arrives at age '+t.a.age+':',fmt(t.a.value)),
      text:(t.a.files.length?'From '+t.a.files.join(', ')+'. ':'')+'The asset(s) inherited this year (value in today\'s $, shown here) join the scenario from this year on: portfolios earn growth and dividends, a pre-tax IRA starts its 10-year payout clock, a property can be sold. Before this age they are not in the scenario.'};
  }
  // Long Term Care bar: sits in the padding above the plot area of every time-based chart.
  if(py<area.top && py>=area.top-LTC_PAD){
    const so=stretchBarOpts(chart);
    if(so && idx>=so.fromIdx && (so.toIdx==null||idx<=so.toIdx)) return ciStretchInfo();
  }
  if(py<area.top && py>=area.top-LTC_PAD && typeof ltcCounts==='function'){
    const c=ltcCounts(chart.data.labels);
    if(c&&c[idx]>0){
      const who=c.who&&c.who[idx]||[], young=!!c.youngerIdx&&who.length===1&&who[0]===c.youngerIdx;
      return {name:'Long Term Care period', color:c[idx]>=2?LTC_C_BOTH:(young?LTC_C_YOUNG:LTC_C_OLD),
        text:(c[idx]>=2?'Dark blue: both people are on Long Term Care this year. ':(young?'Light blue: the younger person is on Long Term Care this year. ':'Grey: the older person (or the only person) is on Long Term Care this year. '))+
        'The bar spans every year anyone is on LTC, from the LTC start age set in the LTC panel until that person passes; dark blue marks years when two people overlap. In these years the LTC cost is an expense, living expenses drop to the amount set for after LTC starts, and the LTC cost can be itemized above 7.5% of AGI.'};
    }
    return null;
  }
  if(py<area.top||py>area.bottom) return null;
  // IRMAA tier lines on the MAGI chart (drawn by the 'magiOverlay' plugin).
  if(key==='incomeMagi'){
    const o=chart.options.plugins&&chart.options.plugins.magiOverlay;
    if(o&&typeof o==='object'){
      const inWin=(o.fromIdx==null||idx>=o.fromIdx)&&(o.toIdx==null||idx<=o.toIdx);
      const mfj=idx<(o.switchIdx==null?n:o.switchIdx);
      const lines=(mfj?o.irmaaMFJ:o.irmaaSgl)||[];
      let best=null, bd=1e9;
      if(inWin) lines.forEach(ln=>{ const d=Math.abs(py-ys.getPixelForValue(ln.magi)); if(d<bd){ bd=d; best=ln; } });
      if(best&&bd<=7){
        const money=v=>'$'+Math.round(v).toLocaleString('en-US');
        return {name:'IRMAA tier line: MAGI '+money(best.magi)+(best.pct!=null?' (+'+best.pct+'% Part B)':''), color:BRACKET_COLOR,
          text:'Medicare IRMAA threshold for '+(mfj?'married filing jointly':'single')+' filers. When MAGI is at or above this line, each person on Medicare pays a Part B + Part D surcharge of '+money(best.surch)+' per year ('+(best.label||'')+' tier). The surcharge is based on MAGI from two years earlier, so it shows up in the expenses two years after the stack crosses the line. Tiers shown are the ones that fit the chart\'s scale.'};
      }
    }
  }
  return null;
}
function ciStretchInfo(){
  return {name:'Stretch IRA', color:'#c0392b',
    text:'The red bar marks the years after the household\'s last passing. Only IRAs with the "IRA stretch" box checked (and holdings that are not IDGT) carry on, compounding at their own growth rate for up to 10 more years while heirs hold them. No RMDs, withdrawals or heir taxes are modeled.'};
}

// ── Popup ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
function ciEl(){
  let el=document.getElementById('extTooltip');
  if(!el){
    el=document.createElement('div'); el.id='extTooltip';
    el.style.cssText='position:fixed;z-index:10000;pointer-events:none;border:1px solid;border-radius:6px;padding:6px 8px;'+
      'font:12px monospace;white-space:pre;line-height:1.35;opacity:0;';
    document.body.appendChild(el);
  }
  return el;
}
function ciHide(){ const el=document.getElementById('extTooltip'); if(el){ el.style.transition='opacity .12s'; el.style.opacity=0; el._shown=false; } }
function ciChartOf(canvas){
  for(const k in charts){ const c=charts[k]; if(c&&c.canvas===canvas) return {key:k,chart:c}; }
  return null;
}
// "at age 86 (Peter)": the age of the OLDEST person alive that year, with their name (married scenarios). When nobody is alive (the IRA stretch years)
// it reads "3 years since Yen passed", naming whoever was the last to pass. Falls back to the axis age when the year's row is not found.
function ciRowAt(label){
  const proj=(typeof lastProjection!=='undefined')?lastProjection:null;
  if(!proj||!proj.rows||!proj.rows.length||label==null||label==='') return null;
  const all=proj.rows.concat(proj.stretch||[]);
  const k=all.findIndex(r=>Math.round(r.age0)===Math.round(Number(label)));
  return k<0?null:{proj,all,k};
}
// Owner line for the hovered year, tracking who holds the asset then. Jointly owned: both names while both are alive ("Owners: Peter and Yen (joint)"),
// the survivor once one has passed ("Owner: Yen"), the heirs once both have passed ("Owner: heirs"). Not jointly owned: "Owner: Peter" while the
// owner is alive; after the owner passes, "Owner: Yen" when the asset continues to the surviving spouse, else "Owner: heirs".
function ciOwnerText(o,label){
  const at=ciRowAt(label); if(!o) return '';
  const proj=at?at.proj:(typeof lastProjection!=='undefined'?lastProjection:null); if(!proj) return '';
  const nm=i=>displayPersonName(proj.people[i],i);
  const two=!!proj.married&&proj.people.length>1, sp=two?(o.own===0?1:0):null;
  const joint=!!o.joint&&two;
  if(!at) return joint?'Owners: '+nm(o.own)+' and '+nm(sp)+' (joint)':'Owner: '+nm(o.own);
  const r=at.all[at.k], alive=i=>!!(r.alive&&r.alive[i]);
  if(joint){
    if(alive(o.own)&&alive(sp)) return 'Owners: '+nm(o.own)+' and '+nm(sp)+' (joint)';
    if(alive(o.own)) return 'Owner: '+nm(o.own);
    if(alive(sp)) return 'Owner: '+nm(sp);
    return 'Owner: heirs';
  }
  if(alive(o.own)) return 'Owner: '+nm(o.own);
  if(two&&o.bene&&alive(sp)) return 'Owner: '+nm(sp);
  return 'Owner: heirs';
}
function ciAgeText(label){
  const fallback=(label!=null&&label!=='')?'at age '+label:'';
  const proj=(typeof lastProjection!=='undefined')?lastProjection:null;
  if(!proj||!proj.rows||!proj.rows.length||label==null||label==='') return fallback;
  const all=proj.rows.concat(proj.stretch||[]);
  const k=all.findIndex(r=>Math.round(r.age0)===Math.round(Number(label)));
  if(k<0) return fallback;
  const nm=i=>proj.married?' ('+displayPersonName(proj.people[i],i)+')':'';
  const aliveOf=r=>(r.alive||[]).map((a,i)=>a?i:-1).filter(i=>i>=0);
  const oldest=(r,idxs)=>idxs.reduce((b,i)=>((r.ages[i]||0)>(r.ages[b]||0)?i:b),idxs[0]);
  const al=aliveOf(all[k]);
  if(al.length){ const b=oldest(all[k],al); const a=all[k].ages[b]; return 'at age '+(Number.isFinite(a)?Math.round(a):label)+nm(b); }
  for(let j=k-1;j>=0;j--){
    const aj=aliveOf(all[j]);
    if(aj.length){ const n=k-j, b=oldest(all[j],aj); return n+(n===1?' year':' years')+' since '+(proj.married?displayPersonName(proj.people[b],b):'the last passing')+' passed'; }
  }
  return fallback;
}
// Value of the hovered element at the hovered year, shown under the name when the element has one (null/zero/missing → no line).
// Rates are percents already; flows (income, tax, expense charts) are per year; balances (asset charts) and cumulative Social Security are not.
const CI_STOCK_KEYS=['asset','idgt','ss'];
const CI_PCT_KEYS=['inflation','market'];   // charts whose values are rates (%), not dollars
function ciValueLine(key, f, chart){
  const src=f&&f.ds&&(f.ds.ciValues||f.ds.data);   // ciValues: true values of a dataset whose plotted height is not its value (cost-basis lines)
  const raw=src?src[f.idx]:null;
  const v=(raw!=null&&typeof raw==='object')?raw.y:raw;
  if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)<0.5&&!/^Effective tax rate/.test(String(f.ds.label))&&!CI_PCT_KEYS.includes(key)) return null;
  const age=' '+ciAgeText(chart.data.labels&&chart.data.labels[f.idx]);
  if(CI_PCT_KEYS.includes(key)) return mrow('Value'+age+':',v.toFixed(key==='inflation'?2:1)+'%');
  if(/^Effective tax rate/.test(String(f.ds.label))) return v>0?mrow('Value'+age+':',v.toFixed(1)+'%'):null;
  return mrow('Value'+age+':',fmt(v)+(CI_STOCK_KEYS.includes(key)||f.ds.ciStock?'':'/yr'));
}
function ciShow(e){
  const hit=ciChartOf(e.target);
  if(!hit) return ciHide();
  let info=null;
  const ov=ciOverlayAt(hit.key,hit.chart,e);
  if(ov) info=ov;
  else {
    const rect=hit.chart.canvas.getBoundingClientRect(), area=hit.chart.chartArea;
    const py=(e.clientY-rect.top)*(hit.chart.height/rect.height);
    if(area&&py>=area.top&&py<=area.bottom){
      const f=ciElementAt(hit.chart,e,hit.key);
      if(f&&f.stackTotal!=null){
        const age=' '+ciAgeText(hit.chart.data.labels&&hit.chart.data.labels[f.idx]);
        info={name:CI_TOTAL_NAME[hit.key], color:null, owner:'',
          value:mrow('Value'+age+':',fmt(f.stackTotal)+(CI_STOCK_KEYS.includes(hit.key)?'':'/yr')),
          text:'The top edge of the stack: the sum of every band below it at this age.'};
      } else {
      const text=f&&ciDescribe(hit.key,f.ds,f.di);
      if(text){
        const color=f.ds.borderColor&&typeof f.ds.borderColor==='string'?f.ds.borderColor:null;
        const name=String(f.ds.ordLabel?(hit.key==='incomeQual'?'Qualified tax bracket line: ':'Ordinary tax bracket line: ')+f.ds.ordLabel:f.ds.label);
        info={name,text,color,value:ciValueLine(hit.key,f,hit.chart),owner:ciOwnerText(f.ds.ciOwnerInfo,hit.chart.data.labels&&hit.chart.data.labels[f.idx])};
      }
      }
    }
  }
  if(!info) return ciHide();
  ciRender(e,info);
}
function ciRender(e,info){
  const el=ciEl(), th=tipTheme();
  const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const {name,text,color,value,owner}=info;
  el.style.background=th.bg; el.style.color=th.fg; el.style.borderColor=th.border;
  el.style.whiteSpace='normal'; el.style.maxWidth='340px';
  el.innerHTML=`<div style="position:relative;padding-left:14px;font-weight:bold;margin-bottom:3px;">${color?`<span style="position:absolute;left:0;top:.3em;width:9px;height:9px;background:${esc(color)};border:1px solid ${th.fg};box-sizing:border-box;" data-sw></span>`:''}${esc(name)}</div>${owner?`<div style="margin-bottom:3px;">${esc(owner)}</div>`:''}${value?`<div style="font-weight:bold;margin-bottom:3px;display:flex;justify-content:space-between;gap:12px;">${String(value).split(TIP_SEP).map(t=>`<span>${esc(t)}</span>`).join('')}</div>`:''}<div>${esc(text)}</div>`;
  el.style.opacity=1;
  const w=el.offsetWidth, h=el.offsetHeight;
  let left=e.clientX+14; if(left+w>window.innerWidth-8) left=e.clientX-14-w;
  let top=e.clientY-h/2; top=Math.max(8,Math.min(top,window.innerHeight-h-8));
  el.style.transition='opacity .12s';
  el.style.left=Math.max(8,left)+'px'; el.style.top=top+'px';
  el._shown=true;
}
document.addEventListener('mousemove',e=>{
  if(!chartInfo){ return; }
  if(e.target&&e.target.tagName==='CANVAS') ciShow(e);
  else { const a=e.target&&e.target.closest&&e.target.closest('.unfunded-alert[data-detail]');
    if(a&&!a.hidden) ciRender(e,{name:a.dataset.name,text:a.dataset.detail,color:'#D00000',value:a.dataset.value||null,owner:''}); else ciHide(); }
});
document.addEventListener('mouseleave',()=>{ if(chartInfo) ciHide(); });

// Hide Chart.js's built-in (canvas) popups while the mode is on. Used by the charts without an external popup (Social Security,
// total Social Security vs tax, Total Income Tax, Household Expenses); `beforeTooltipDraw` returning false cancels the draw.
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('chartInfoGate')){
  Chart.register({id:'chartInfoGate', beforeTooltipDraw(){ if(chartInfo) return false; }});
}
