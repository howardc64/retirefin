'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / TOTAL INCOME TAX CHART — stacked ordinary/QDIV/LTCG tax
// with effective/marginal rate overlay lines (spec §9.4).
// ═══════════════════════════════════════════════════════════════
const VZ_TAX = { ord:'#C8600A', qdiv0:'#D4BCEE', qdiv15:'#7B3FBE', qdiv20:'#3A0D7A',
                 ltcg0:'#A0E4DC', ltcg15:'#1A9E8F', ltcg20:'#0A4A42', niit:'#B0163E', effRate:'#E8291C', marginalRate:'#1FA92C' };
const TAX_LEGEND=[
  ['ord','Ordinary income tax'], ['qdiv0','QDIV 0%'], ['qdiv15','QDIV 15%'], ['qdiv20','QDIV 20%'],
  ['ltcg0','LTCG 0%'], ['ltcg15','LTCG 15%'], ['ltcg20','LTCG 20%'],
  ['niit','NIIT 3.8% (+ on top of QDIV/LTCG)'],
  ['effRate','Effective tax rate (right axis, dashed)'], ['marginalRate','Marginal tax rate (right axis, dashed)']
];
function buildTaxLegend(){
  document.getElementById('taxLegend').innerHTML = TAX_LEGEND.map(([k,label])=>legendItem(label, VZ_TAX[k])).join('');
}
function buildTaxChart(){
  if(typeof Chart==='undefined'||!lastProjection) return;
  const proj=lastProjection, rows=proj.rows;
  if(!rows.length){ return; }
  const labels=ageLabelRange(rows[0].age0,chartMaxAge(proj));
  const ages=rows.map(r=>r.age0);

  const ordArr=[], qTiers=[[],[],[]], lTiers=[[],[],[]], niitArr=[];
  rows.forEach(r=>{
    const qBrk = r.filing==='married'?MFJ_QDIV:SGL_QDIV;
    const qt=qualTaxTiers(r.ordTI, r.qdiv, qBrk);
    const lt=qualTaxTiers(r.ordTI+r.qdiv, r.ltcg, qBrk);
    // §9.4: foreign tax credit offsets ordinary tax first, then each qualified-dividend/LTCG tier
    // in turn, so the visual stack's total height matches r.totalTax (which already nets the
    // credit out) instead of drawing a taller bar than the tooltip's Total Tax figure.
    let credit=Math.max(0,r.foreignTaxCredit||0);
    const apply=v=>{ const used=Math.min(v,credit); credit-=used; return v-used; };
    ordArr.push(apply(r.ordTax));
    qt.map(apply).forEach((v,i)=>qTiers[i].push(v));
    lt.map(apply).forEach((v,i)=>lTiers[i].push(v));
    niitArr.push(r.niit||0);
  });
  const alignedOrd=alignToAges(ages,ordArr,labels);
  const alignedQ=qTiers.map(arr=>alignToAges(ages,arr,labels));
  const alignedL=lTiers.map(arr=>alignToAges(ages,arr,labels));
  const alignedNiit=alignToAges(ages,niitArr,labels);
  // §9.4: "Draw thick dashed line for effective tax rate. Draw thick dashed line for marginal
  // tax rate." Both on the right-hand % axis, overlaid on top of the $ stack (but below the
  // tooltip). Effective rate = TT / AGI; marginal rate reuses the same top-marginal-rate-on-the
  // -next-dollar figure as the TSS chart (it accounts for the SS torpedo effect, so it can run
  // above the statutory bracket rate).
  const effRateArr=rows.map(r=>r.agi>0 ? r.totalTax/r.agi*100 : 0);
  const alignedEff=alignToAges(ages,effRateArr,labels);
  const marginalArr=rows.map(r=>(r.marginalRate||0)*100);
  const alignedMarginal=alignToAges(ages,marginalArr,labels);

  const Y_MAX=lockedYMax('tax', ()=>{
    let maxV=0;
    for(let i=0;i<labels.length;i++){
      let t=alignedOrd[i]||0; alignedQ.forEach(a=>t+=a[i]||0); alignedL.forEach(a=>t+=a[i]||0); t+=alignedNiit[i]||0;
      maxV=Math.max(maxV,t);
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
    // §9.4: rate lines are overlaid "on top of other graph objects (but below tooltip)" — a lower
    // Chart.js `order` value draws on top of higher ones, so these get order:1/0 vs. order:2 above.
    {label:'Effective tax rate', data:alignedEff, borderColor:VZ_TAX.effRate, backgroundColor:'transparent', borderWidth:4, borderDash:[8,4], pointRadius:0, pointHoverRadius:0, pointHitRadius:12, tension:0.25, fill:false, spanGaps:false, yAxisID:'y1', order:1},
    {label:'Marginal tax rate', data:alignedMarginal, borderColor:VZ_TAX.marginalRate, backgroundColor:'transparent', borderWidth:4, borderDash:[3,3], pointRadius:0, pointHoverRadius:0, pointHitRadius:12, tension:0.25, fill:false, spanGaps:false, yAxisID:'y1', order:0}
  ];

  // Built fresh every call so it doesn't close over a stale rowByAge/labels from an earlier render.
  const tooltipCallbacks={
    title:i=>{ const idx=i[0]?i[0].dataIndex:0; const r=rowByAge[labels[idx]]; return r?popupPersonAgeLines(proj,r):[]; },
    label:ctx=>{
      // Effective-tax-rate line reports in the footer (below), not as a stack segment here.
      if(ctx.dataset.yAxisID==='y1') return null;
      if(ctx.raw==null||ctx.raw===0)return null;
      return mrow('  '+ctx.dataset.label, fmt(ctx.raw)+'/yr');
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
      if(showDetails){
        lines.push(mrow('Filing status', r.filing==='married'?'Married filing jointly':'Single'));
        lines.push(mrow('Taxable income (TI)', fmt(r.ordTI)+'/yr'));
        lines.push(mrow(r.usedItemized?'Itemized deduction (LTC)':'Standard deduction', '('+fmt(r.std)+')'));
        if(r.seniorDeduction>0) lines.push(mrow('Enhanced senior deduction (Schedule 1-A)', '('+fmt(r.seniorDeduction)+')'));
        // All income components rolling up to AGI (§9.4: "AGI = all non-SS income + TSS").
        lines.push(mrow('  Wages', fmt(r.wageTotal)+'/yr'));
        lines.push(mrow('  Pension', fmt(r.pension)+'/yr'));
        lines.push(mrow('  Rental', fmt(r.rental)+'/yr'));
        lines.push(mrow('  IRA RMD', fmt(r.iraTotal)+'/yr'));
        if(r.rothConvTotal>0) lines.push(mrow('  Pre-tax IRA withdraw (Roth conversion)', fmt(r.rothConvTotal)+'/yr'));
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
}

