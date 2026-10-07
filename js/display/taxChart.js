'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / TOTAL INCOME TAX CHART — stacked ordinary/QDIV/LTCG tax
// with effective/marginal rate overlay lines (spec §9.4).
// ═══════════════════════════════════════════════════════════════
const VZ_TAX = { ord:'#C8600A', qdiv0:'#D4BCEE', qdiv15:'#7B3FBE', qdiv20:'#3A0D7A',
                 ltcg0:'#A0E4DC', ltcg15:'#1A9E8F', ltcg20:'#0A4A42', niit:'#B0163E', effRate:'#E8291C', marginalRate:'#1FA92C', ftc:'#1F5FE0' };
const TAX_LEGEND=[
  ['ord','Ordinary income tax'], ['qdiv0','QDIV 0%'], ['qdiv15','QDIV 15%'], ['qdiv20','QDIV 20%'],
  ['ltcg0','LTCG 0%'], ['ltcg15','LTCG 15%'], ['ltcg20','LTCG 20%'],
  ['niit','NIIT 3.8% (+ on top of QDIV/LTCG)'],
  ['ftc','Foreign tax credit (stacked above total tax, dashed)'],
  ['effRate','Effective tax rate (right axis, dashed)'], ['marginalRate','Marginal tax rate (right axis, dashed)']
];
function buildTaxLegend(){
  document.getElementById('taxLegend').innerHTML = TAX_LEGEND.map(([k,label])=>legendItem(label, VZ_TAX[k], (k==='ftc'||k==='effRate'||k==='marginalRate')?legendDashStyle(VZ_TAX[k]):undefined) +
      (k==='ord' ? legendItem('Ordinary income tax brackets (rate above each line, on Ordinary income tax chart)', null, legendDashStyle(OVERLAY_COLOR)) : '')).join('') +
    (viewIrmaaAsTax ? legendItem('IRMAA surcharge (stacked above total tax, dashed)', null, legendDashStyle(OVERLAY_COLOR)) : '');
}
function buildTaxChart(){
  if(typeof Chart==='undefined'||!lastProjection) return;
  const proj=lastProjection, rows=proj.rows;
  if(!rows.length){ return; }
  const labels=ageLabelRange(rows[0].age0,chartMaxAge(proj));
  const ages=rows.map(r=>r.age0);

  const ftcArr=[], ordArr=[], qTiers=[[],[],[]], lTiers=[[],[],[]], niitArr=[];
  rows.forEach(r=>{
    const qBrk = r.filing==='married'?MFJ_QDIV:SGL_QDIV;
    const qt=qualTaxTiers(r.ordTI, r.qdiv, qBrk);
    const lt=qualTaxTiers(r.ordTI+r.qdiv, r.ltcg, qBrk);
    // §9.4: foreign tax credit offsets ordinary tax first, then each qualified-dividend/LTCG tier
    // in turn, so the visual stack's total height matches r.totalTax (which already nets the
    // credit out) instead of drawing a taller bar than the tooltip's Total Tax figure.
    let credit=Math.max(0,r.foreignTaxCredit||0); const credit0=credit;
    const apply=v=>{ const used=Math.min(v,credit); credit-=used; return v-used; };
    ordArr.push(apply(r.ordTax));
    qt.map(apply).forEach((v,i)=>qTiers[i].push(v));
    lt.map(apply).forEach((v,i)=>lTiers[i].push(v));
    niitArr.push(r.niit||0);
    // Credit actually absorbed by income tax (what the stack was reduced by); drawn back on top as the dashed blue line.
    const usedCredit=credit0-credit; ftcArr.push(usedCredit>0?usedCredit:null);
  });
  const alignedOrd=alignToAges(ages,ordArr,labels);
  const alignedQ=qTiers.map(arr=>alignToAges(ages,arr,labels));
  const alignedL=lTiers.map(arr=>alignToAges(ages,arr,labels));
  const alignedNiit=alignToAges(ages,niitArr,labels);
  const alignedFtc=alignToAges(ages,ftcArr,labels);
  // §9.4: "Draw thick dashed line for effective tax rate. Draw thick dashed line for marginal
  // tax rate." Both on the right-hand % axis, overlaid on top of the $ stack (but below the
  // tooltip). Effective rate = TT / AGI; marginal rate reuses the same top-marginal-rate-on-the
  // -next-dollar figure as the TSS chart (it accounts for the SS torpedo effect, so it can run
  // above the statutory bracket rate).
  const effRateArr=rows.map(r=>r.agi>0 ? r.totalTax/r.agi*100 : 0);
  const alignedEff=alignToAges(ages,effRateArr,labels);
  const marginalArr=rows.map(r=>(r.marginalRate||0)*100);
  const alignedMarginal=alignToAges(ages,marginalArr,labels);

  // "view IRMAA as tax": the IRMAA surcharge paid that year (null when none) stacks on top of the tax stack as a dashed line.
  const alignedIrmaa=alignToAges(ages, rows.map(r=>r.expIrmaa>0?r.expIrmaa:null), labels);
  // Height of the tax stack itself (the foreign tax credit line is not part of it): the IRMAA line is drawn at this + IRMAA.
  const stackTop=labels.map((_,i)=>{
    let t=alignedOrd[i]||0; alignedQ.forEach(a=>t+=a[i]||0); alignedL.forEach(a=>t+=a[i]||0); return t+(alignedNiit[i]||0);
  });
  const alignedIrmaaTop=alignedIrmaa.map((v,i)=>v>0?stackTop[i]+v:null);
  const Y_MAX=lockedYMax('tax', ()=>{
    let maxV=0;
    for(let i=0;i<labels.length;i++){
      let t=alignedOrd[i]||0; alignedQ.forEach(a=>t+=a[i]||0); alignedL.forEach(a=>t+=a[i]||0); t+=alignedNiit[i]||0;
      t+=alignedFtc[i]||0;
      maxV=Math.max(maxV,t);
      if(viewIrmaaAsTax && alignedIrmaaTop[i]!=null) maxV=Math.max(maxV,alignedIrmaaTop[i]);
    }
    return Math.ceil(Math.max(maxV,1)/2000)*2000+4000;
  });

  const rowByAge={}; rows.forEach(r=>rowByAge[Math.round(r.age0)]=r);
  let swIdx=labels.length;
  for(let i=0;i<labels.length;i++){ const r=rowByAge[labels[i]]; if(!r||r.filing!=='married'){ swIdx=i; break; } }

  const datasets=[
    {label:'Ordinary income tax', data:alignedOrd, borderColor:VZ_TAX.ord, backgroundColor:VZ_TAX.ord+'cc', borderWidth:3, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'tax', order:2},
    {label:'QDIV 0% tax', data:alignedQ[0], borderColor:VZ_TAX.qdiv0, backgroundColor:VZ_TAX.qdiv0+'cc', borderWidth:2, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'tax', order:2},
    {label:'QDIV 15% tax', data:alignedQ[1], borderColor:VZ_TAX.qdiv15, backgroundColor:VZ_TAX.qdiv15+'cc', borderWidth:2, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'tax', order:2},
    {label:'QDIV 20% tax', data:alignedQ[2], borderColor:VZ_TAX.qdiv20, backgroundColor:VZ_TAX.qdiv20+'cc', borderWidth:2, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'tax', order:2},
    {label:'LTCG 0% tax', data:alignedL[0], borderColor:VZ_TAX.ltcg0, backgroundColor:VZ_TAX.ltcg0+'cc', borderWidth:2, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'tax', order:2},
    {label:'LTCG 15% tax', data:alignedL[1], borderColor:VZ_TAX.ltcg15, backgroundColor:VZ_TAX.ltcg15+'cc', borderWidth:2, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'tax', order:2},
    {label:'LTCG 20% tax', data:alignedL[2], borderColor:VZ_TAX.ltcg20, backgroundColor:VZ_TAX.ltcg20+'cc', borderWidth:2, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'tax', order:2},
    {label:'NIIT (3.8% on QDIV/LTCG + NIIT)', data:alignedNiit, borderColor:VZ_TAX.niit, backgroundColor:VZ_TAX.niit+'cc', borderWidth:2, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'tax', order:2},
    {label:'Foreign tax credit', data:alignedFtc, borderColor:VZ_TAX.ftc, backgroundColor:'transparent', borderWidth:3, borderDash:[7,4], pointRadius:0, tension:0.25, fill:false, spanGaps:false, stack:'tax', order:2},
    // §9.4: rate lines are overlaid "on top of other graph objects (but below tooltip)" — a lower
    // Chart.js `order` value draws on top of higher ones, so these get order:1/0 vs. order:2 above.
    {label:'Effective tax rate', data:alignedEff, borderColor:VZ_TAX.effRate, backgroundColor:'transparent', borderWidth:3, borderDash:[7,4], pointRadius:0, pointHoverRadius:0, pointHitRadius:12, tension:0.25, fill:false, spanGaps:false, yAxisID:'y1', order:1},
    {label:'Marginal tax rate', data:alignedMarginal, borderColor:VZ_TAX.marginalRate, backgroundColor:'transparent', borderWidth:3, borderDash:[7,4], pointRadius:0, pointHoverRadius:0, pointHitRadius:12, tension:0.25, fill:false, spanGaps:false, yAxisID:'y1', order:0}
  ];

  if(viewIrmaaAsTax){
    const c=OVERLAY_COLOR;
    // Own stack id so it is plotted at an absolute height (tax stack + IRMAA), not on top of the foreign tax credit line; irmaaAmt is what the popup reports.
    datasets.push({label:'IRMAA surcharge', data:alignedIrmaaTop, irmaaAmt:alignedIrmaa, borderColor:c, backgroundColor:'transparent', borderWidth:3, borderDash:[7,4], pointRadius:0, tension:0.25, fill:false, spanGaps:false, stack:'irmaa', order:2});
  }

  // Built fresh every call so it doesn't close over a stale rowByAge/labels from an earlier render.
  const tooltipCallbacks={
    title:i=>{ const idx=i[0]?i[0].dataIndex:0; const r=rowByAge[labels[idx]]; return r?popupPersonAgeLines(proj,r):[]; },
    label:ctx=>{
      // Effective-tax-rate line reports in the footer (below), not as a stack segment here.
      if(ctx.dataset.yAxisID==='y1') return null;
      if(ctx.raw==null||ctx.raw===0)return null;
      const v=ctx.dataset.irmaaAmt?ctx.dataset.irmaaAmt[ctx.dataIndex]:ctx.raw;
      return mrow('  '+ctx.dataset.label, fmt(v)+'/yr');
    },
    footer:items=>{
      const idx=items[0]?items[0].dataIndex:0;
      const r=rowByAge[labels[idx]]; if(!r) return[];
      const effRate=r.agi>0 ? r.totalTax/r.agi*100 : 0;
      // §9.4: "Popup window should include: Effective Tax Rate, Marginal Tax Rate, Total Tax." —
      // all three always shown. "If show_details, show TI, all income components, standard
      // deduction, foreign tax credit."
      const lines=['', mrow('Effective tax rate', effRate.toFixed(1)+'%')];
      lines.push(mrow('Marginal tax rate', ((r.marginalRate||0)*100).toFixed(1)+'%'));
      lines.push(mrow('Total tax (TT)', fmt(r.totalTax)+'/yr'));
      if(viewIrmaaAsTax && r.expIrmaa>0) lines.push(mrow('Total tax + IRMAA', fmt(r.totalTax+r.expIrmaa)+'/yr'));
      if(showDetails){
        lines.push(mrow('Filing status', r.filing==='married'?'Married filing jointly':'Single'));
        // Taxable income = taxable ordinary income + qualified income (QDIV + net LTCG), the same total the Taxable Income chart shows.
        lines.push(mrow('Taxable income (TI)', fmt((r.ordTI||0)+(r.qualIncome||0))+'/yr'));
        if((r.qualIncome||0)>0) lines.push(mrow('  of which taxable ordinary income', fmt(r.ordTI||0)+'/yr'));
        lines.push(mrow(r.usedItemized?'Itemized deduction (LTC)':'Standard deduction', '('+fmt(r.std)+')'));
        if(r.seniorDeduction>0) lines.push(mrow('Enhanced senior deduction (Schedule 1-A)', '('+fmt(r.seniorDeduction)+')'));
        // All income components rolling up to AGI (§9.4: "AGI = all non-SS income + TSS").
        lines.push(mrow('  Wages', fmt(r.wageTotal)+'/yr'));
        lines.push(mrow('  Pension', fmt(r.pension)+'/yr'));
        lines.push(mrow('  Rental', fmt(r.rental)+'/yr'));
        if(r.annuity>0) lines.push(mrow('  Annuity payouts (taxable part)', fmt(r.annuity)+'/yr'));
        lines.push(mrow('  IRA RMD', fmt(r.iraTotal)+'/yr'));
        if(r.rothConvTotal>0) lines.push(mrow('  Pre-tax IRA withdraw (Roth conversion)', fmt(r.rothConvTotal)+'/yr'));
        if(r.iraExpTotal>0) lines.push(mrow('  Pre-tax IRA withdraw (for expenses)', fmt(r.iraExpTotal)+'/yr'));
        lines.push(mrow('  Ordinary (non-qualified) dividends', fmt(r.odivNQ)+'/yr'));
        lines.push(mrow('  Qualified dividends (QDIV)', fmt(r.qdiv)+'/yr'));
        lines.push(mrow('  Long-term capital gains (LTCG, net of SCGL)', fmt(r.ltcg)+'/yr'));
        lines.push(mrow('  Taxable Social Security (TSS)', fmt(r.taxableSS)+'/yr'));
        lines.push(mrow('  AGI', fmt(r.agi)+'/yr'));
        lines.push(mrow('Provisional income', fmt(r.provisional)+'/yr'));
        if(r.foreignTaxCredit>0) lines.push(mrow('Foreign tax credit', '('+fmt(r.foreignTaxCredit)+')/yr'));
        if(r.niit>0){
          lines.push(mrow('Net investment income (NII)', fmt(r.niiIncome)+'/yr'));
          lines.push(mrow('NIIT (3.8% + on QDIV/LTCG)', fmt(r.niit)+'/yr'));
        }
      }
      return lines;
    }
  };

  upsertLineChart('tax',{canvasId:'taxChart', labels, datasets, yMax:Y_MAX, tooltip:tooltipCallbacks,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{...TIP_STYLE,callbacks:justifyTip(tooltipCallbacks)}
      },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle("Total tax (today's $)"),ticks:{...AXIS_TICKS,callback:v=>'$'+Math.round(v).toLocaleString()},grid:AXIS_GRID},
        // §9.4: effective/marginal tax-rate lines share their own right-hand % scale, independent of the $ stack.
        y1:{position:'right',min:0,max:100,title:axisTitle('Tax rate (effective / marginal)'),ticks:{...AXIS_TICKS,callback:v=>v+'%'},grid:{display:false}}
      }
    })});
  buildTaxLegend();

  // ── Two half-size companion charts (right side): ordinary vs. qualified/NIIT tax ──
  // Same labels, same locked Y scale (Y_MAX) and same 1:1 aspect ratio as the primary chart; the
  // datasets are copies of the primary's stack segments, in the same order and colors.
  const copyDs=d=>({...d, data:d.data.slice()});
  // Companion-chart popups show the plan owner(s) and age, then only that chart's own values: no totals, nothing extra with Show Details.
  const smTip={
    title:tooltipCallbacks.title,
    label:ctx=>(ctx.raw==null||ctx.raw===0)?null:mrow('  '+ctx.dataset.label, fmt(ctx.raw)+'/yr'),
    footer:()=>[]
  };
  const smTick=v=>'$'+Math.round(v/1000)+'k';
  const smOptions=(yTitle)=>({
    ...CHART_BASE,
    interaction:{mode:'index',intersect:false},
    plugins:{ legend:{display:false}, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(smTip)} },
    scales:{
      x:{...ageXAxis(ageAxisLabel(proj)), ticks:{...AXIS_TICKS,maxTicksLimit:7}},
      y:{stacked:true,min:0,max:Y_MAX,title:axisTitle(yTitle),ticks:{...AXIS_TICKS,maxTicksLimit:5,callback:smTick},grid:AXIS_GRID}
    }
  });
  // Cumulative ordinary tax at each bracket ceiling, labeled with the rate that applies above it.
  const brkLines=brk=>brk.slice(0,-1).map((b,i)=>({tax:calcOrdTax(b.lim,brk), r:brk[i+1].r}));
  // When the lines would crowd each other (too many brackets inside the chart's Y range) only the top 3 are drawn.
  const mfjBrk=brkLines(MFJ_ORD), sglBrk=brkLines(SGL_ORD);
  const brkKeep=crowdedBracketKeep([swIdx>0?mfjBrk.map(l=>l.tax):null, swIdx<labels.length?sglBrk.map(l=>l.tax):null], Y_MAX);
  const brkOpts={mfj:mfjBrk.filter((_,i)=>brkKeep.has(i)), sgl:sglBrk.filter((_,i)=>brkKeep.has(i)), switchIdx:swIdx};
  upsertLineChart('taxOrd',{canvasId:'taxOrdChart', labels, datasets:[copyDs(datasets[0])], yMax:Y_MAX, tooltip:smTip,
    refresh:o=>{ o.plugins.taxBracketOverlay=brkOpts; },
    createOptions:()=>{ const o=smOptions('Ordinary income tax'); o.plugins.taxBracketOverlay=brkOpts; return o; }});
  upsertLineChart('taxQual',{canvasId:'taxQualChart', labels, datasets:datasets.slice(1,8).map(copyDs), yMax:Y_MAX, tooltip:smTip,
    createOptions:()=>smOptions('QDIV / LTCG / NIIT tax')});
}
