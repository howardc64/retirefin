'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHART ELEMENT INFO — the "Chart Element Info" checkbox (header, left of "Popup Details").
// When checked, hovering a chart shows a popup that DESCRIBES the chart element under the cursor (a stacked band, a dashed
// line, a Social Security claiming-age line…) instead of the usual per-year values. The usual popup (chartHelpers.js
// externalTooltip) does nothing while this is on; this file draws into the same floating #extTooltip <div>, so it follows
// the Popup background slider.
// Read-only: only reads chart/dataset objects and `lastProjection`; never writes into `state`.
// ═══════════════════════════════════════════════════════════════
let chartInfo=true;   // default on; the header checkbox (index.html) starts checked to match

function setChartInfo(on){
  chartInfo=!!on;
  const el=document.getElementById('extTooltip');
  if(el){ el.style.opacity=0; el._shown=false; }
}

// ── What each element means ───────────────────────────────────────────────────────────────────────────────────────────
// Each entry: [test(label), text]. First match wins. Labels are the dataset labels the charts use (several carry a person's name).
const CI_INCOME=[
  [/Social Security/i, 'Social Security benefit paid to this person. Only part of it is taxable (0%, up to 50% or up to 85%, depending on provisional income) — the taxable part is what appears on the MAGI and taxable ordinary income charts.'],
  [/^Pension/, 'Pension income. Taxed as ordinary income.'],
  [/^Annuity payout \(taxable\)/, 'Taxable payout from an annuity. Taxed as ordinary income (and counted as net investment income for NIIT when the annuity is non-qualified).'],
  [/^Annuity payout \(tax-exempt/, 'Tax-exempt part of an annuity payout (return of principal). It is cash income and counts toward provisional income and IRMAA MAGI, but is not taxed.'],
  [/^Wage/, 'Wages or self-employment income. Taxed as ordinary income.'],
  [/^Pre-tax IRA withdraw \(for expenses\)/, 'Money withdrawn from a pre-tax IRA/401(k) to pay household expenses when income, dividends and asset sales were not enough. Taxed as ordinary income.'],
  [/^Pre-tax IRA withdraw/, 'Pre-tax IRA/401(k) withdrawal for a Roth conversion, set on the IRA card. Taxed as ordinary income; the converted amount then moves into the Roth IRA.'],
  [/^IRA RMD/, 'Required minimum distribution from a pre-tax IRA/401(k), forced by the IRS from the RMD age onward. Taxed as ordinary income.'],
  [/^Rental income/, 'Taxable rental income, net of depreciation. Taxed as ordinary income.'],
  [/^Rental depreciation/, 'Non-cash depreciation on a rental property. It is cash you actually receive but is not taxed, so it is shown separately from the taxable rental income.'],
  [/^Tax-exempt income/, 'Tax-exempt income, e.g. municipal-bond interest paid out by a portfolio. Not taxed, but it counts toward household income, provisional income and IRMAA MAGI.'],
  [/^Roth IRA withdraw/, 'Money withdrawn from a Roth IRA to pay household expenses. Tax-free, so it adds nothing to AGI.'],
  [/^Qual\. dividends/, 'Qualified dividends (QDIV) paid by your brokerage portfolios. Taxed at the preferential 0% / 15% / 20% rates, and part of net investment income.'],
  [/^Ordinary dividends/, 'The non-qualified part of portfolio dividends (ordinary dividends minus qualified dividends). Taxed as ordinary income and part of net investment income.'],
  [/^Long-term gains/, 'Long-term capital gains realized when portfolio assets are sold (to pay expenses). Taxed at the preferential 0% / 15% / 20% rates, net of any short-term capital loss (SCGL) carry-forward used.']
];
const CI_MAGI='This band is the part of this income source that goes into modified adjusted gross income (MAGI). Medicare IRMAA surcharges are set by the MAGI of two years earlier; the dashed IRMAA lines mark where each surcharge tier starts.';
const CI_ORD='This band is the part of this source that is taxable ordinary income after the deduction was taken off the bottom of the stack. The dashed green lines are the ordinary tax-bracket limits, labeled with the rate that applies above each line.';
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
      if(ds.ordLabel) return 'Qualified-income tax threshold. Qualified dividends and long-term gains stacked above this line are taxed at '+ds.ordLabel+'.';
      return pick(CI_INCOME);
    case 'tss':
      if(/^Total Social Security/.test(label)) return 'Total Social Security (TSS): everything the household receives from Social Security that year, before any of it is taxed.';
      if(/^Actual Social Security Tax/.test(label)) return 'Actual Social Security Tax (SST): the income tax actually due because of Social Security — the extra tax caused by the taxable part of the benefit (0%, up to 50% or up to 85% of it).';
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
      return null;
    }
    case 'assetConv':
      return 'Amount converted from this person\'s pre-tax IRA to their Roth IRA that year. The converted amount is taxed as ordinary income.';
  }
  return null;
}

// ── Which element is under the cursor ─────────────────────────────────────────────────────────────────────────────────
// Index-mode charts cannot say which band the pointer is on, so it is found from the pointer's height: a dashed/solid line
// within a few pixels wins; otherwise the stacked band whose top is the first one above the pointer (counting up from the axis).
function ciSegDist(px,py,a,b){
  const dx=b.x-a.x, dy=b.y-a.y, L=dx*dx+dy*dy;
  let t=L>0?((px-a.x)*dx+(py-a.y)*dy)/L:0; t=Math.max(0,Math.min(1,t));
  return Math.hypot(px-(a.x+t*dx), py-(a.y+t*dy));
}
function ciElementAt(chart, e){
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
  // Long Term Care bar: sits in the padding above the plot area of every time-based chart.
  if(py<area.top && py>=area.top-LTC_PAD){
    const so=stretchBarOpts(chart);
    if(so && idx>=so.fromIdx) return ciStretchInfo();
  }
  if(py<area.top && py>=area.top-LTC_PAD && typeof ltcCounts==='function'){
    const c=ltcCounts(chart.data.labels);
    if(c&&c[idx]>0){
      return {name:'Long Term Care period', color:c[idx]>=2?'#000':'#9a9a9a',
        text:(c[idx]>=2?'Black: both people are on Long Term Care this year. ':'Grey: one person is on Long Term Care this year. ')+
        'The bar spans every year anyone is on LTC, from the LTC start age set in the LTC panel until that person passes; black marks years when two people overlap. In these years the LTC cost is an expense, living expenses drop to the amount set for after LTC starts, and the LTC cost can be itemized above 7.5% of AGI.'};
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
  return {name:'10 year IRA stretch', color:'#c0392b',
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
      const f=ciElementAt(hit.chart,e);
      const text=f&&ciDescribe(hit.key,f.ds,f.di);
      if(text){
        const color=f.ds.borderColor&&typeof f.ds.borderColor==='string'?f.ds.borderColor:null;
        const name=String(f.ds.ordLabel?(hit.key==='incomeQual'?'Qualified tax bracket line: ':'Ordinary tax bracket line: ')+f.ds.ordLabel:f.ds.label);
        info={name,text,color};
      }
    }
  }
  if(!info) return ciHide();
  const el=ciEl(), th=tipTheme();
  const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const {name,text,color}=info;
  el.style.background=th.bg; el.style.color=th.fg; el.style.borderColor=th.border;
  el.style.whiteSpace='normal'; el.style.maxWidth='340px';
  el.innerHTML=`<div style="position:relative;padding-left:14px;font-weight:bold;margin-bottom:3px;">${color?`<span style="position:absolute;left:0;top:.3em;width:9px;height:9px;background:${esc(color)};border:1px solid ${th.fg};box-sizing:border-box;" data-sw></span>`:''}${esc(name)}</div><div>${esc(text)}</div>`;
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
  if(e.target&&e.target.tagName==='CANVAS') ciShow(e); else ciHide();
});
document.addEventListener('mouseleave',()=>{ if(chartInfo) ciHide(); });

// Hide Chart.js's built-in (canvas) popups while the mode is on. Used by the charts without an external popup (Social Security,
// total Social Security vs tax, Total Income Tax, Household Expenses); `beforeTooltipDraw` returning false cancels the draw.
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('chartInfoGate')){
  Chart.register({id:'chartInfoGate', beforeTooltipDraw(){ if(chartInfo) return false; }});
}
