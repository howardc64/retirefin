'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / ANNUAL HOUSEHOLD INCOME CHART — stacked income sources
// with IRMAA-tier overlay (spec §8.3).
// ═══════════════════════════════════════════════════════════════
const VZ = {
  pen:'#D06A18', ann:'#B8860B', annTE:'#8FBC8F', wg:'#7B5EA7', iraW:'#C79A3E', rothIn:'#E07B00', rmd:'#E85D9A', iraExp:'#8E3B5E', rothExp:'#5C6BC0', inhIra:'#B03A8C', inhRoth:'#7E8CD8', rent:'#A0522D', rentDep:'#D2A488', te:'#2A9D8F',
  qdiv:'#2E86AB', odivNQ:'#1A5276', ltcg:'#6C3483',
  ssP0:'#0F6E56', ssOther:'#3DB08A'
};
const INC_KEYS=['pension','annuity','annuityTE','wageTotal','rothIn','rothConv','iraTotal','iraExp','rental','rentDep','te','rothExp','inhIra','inhRoth','qdiv','odivNQ','ltcg','ssP0','ssOther'];
const INC_LABELS={pension:'Pension',annuity:'Annuity payout (taxable)',annuityTE:'Annuity payout (tax-exempt, untaxed)',wageTotal:'Wage',rothIn:'Roth conversion (taxed as ordinary income)',rothConv:'Pre-tax IRA withdraw',iraTotal:'IRA RMD',iraExp:'Pre-tax IRA withdraw (for expenses)',rental:'Rental income',rentDep:'Rental depreciation (non-cash, untaxed)',te:'Tax-exempt income (untaxed)',rothExp:'Roth IRA withdraw (tax-exempt, untaxed)',inhIra:'Inherited IRA withdraw (10-year rule)',inhRoth:'Inherited Roth IRA withdraw (10-year rule, untaxed)',qdiv:'Qual. dividends (QDIV)',ltcg:'Long-term gains (LTCG)',odivNQ:'Ordinary dividends (ODIV−QDIV)',ssP0:'',ssOther:''};
const INC_COLORS={pension:VZ.pen,annuity:VZ.ann,annuityTE:VZ.annTE,wageTotal:VZ.wg,rothIn:VZ.rothIn,rothConv:VZ.iraW,iraTotal:VZ.rmd,iraExp:VZ.iraExp,rental:VZ.rent,rentDep:VZ.rentDep,te:VZ.te,rothExp:VZ.rothExp,inhIra:VZ.inhIra,inhRoth:VZ.inhRoth,qdiv:VZ.qdiv,ltcg:VZ.ltcg,odivNQ:VZ.odivNQ,ssP0:VZ.ssP0,ssOther:VZ.ssOther};
// Maps a stacked income key to the per-person breakdown array on each projection row,
// so the tooltip can attribute the amount to whichever person(s) it belongs to.
const INC_BYPERSON_FIELD={pension:'pensionByPerson',annuity:'annuityByPerson',annuityTE:'annuityTEByPerson',wageTotal:'wageByPerson',rothIn:'rothInByPerson',rothConv:'rothWdOnlyByPerson',iraTotal:'iraByPerson',iraExp:'iraExpByPerson',rental:'rentalByPerson',rentDep:'rentalDepByPerson',te:'teByPerson',rothExp:'rothExpByPerson',inhIra:'inhIraWdByPerson',inhRoth:'inhRothWdByPerson',qdiv:'qdivByPerson',ltcg:'ltcgByPerson',odivNQ:'odivNQByPerson'};
// Single source of truth for the SS dataset labels, since they're read both
// when building the stacked datasets (buildIncomeChart) and the legend HTML
// (buildIncomeLegend). Must be refreshed before dataset construction on every
// build — including right after a file load — or the chart/tooltip bakes in
// stale names from whatever plan was loaded previously.
function updateIncomeLabels(proj){
  if(!proj) return;
  INC_LABELS.ssP0 = p0Name(proj)+"'s Social Security (SS)";
  INC_LABELS.ssOther = proj.married ? displayPersonName(proj.people[1-proj.idxP0],1-proj.idxP0)+"'s Social Security (SS) / survivor" : '';
}
function buildIncomeChart(){
  if(typeof Chart==='undefined'||!lastProjection) return;
  const proj=lastProjection, rows=proj.rows;
  if(!rows.length){ return; }
  updateIncomeLabels(proj); // refresh before any dataset reads INC_LABELS[k] below
  const idxP0=proj.idxP0, otherIdx=proj.married?1-idxP0:null;
  const p0Age0=rows[0].age0;
  const labels=ageLabelRange(p0Age0,chartMaxAge(proj)); // spec §5: shared X axis
  const keys = proj.married ? INC_KEYS : INC_KEYS.filter(k=>k!=='ssOther');
  const seriesByKey={};
  keys.forEach(k=>seriesByKey[k]=[]);
  const ages=rows.map(r=>r.age0);
  rows.forEach(r=>{
    seriesByKey.pension.push(r.pension); seriesByKey.annuity.push(r.annuity||0); seriesByKey.annuityTE.push(r.annuityTE||0); seriesByKey.wageTotal.push(r.wageTotal);
    const rIn=Math.min(r.rothInTotal||0, r.rothConvTotal||0);   // the part of the annual pre-tax IRA withdraw that is a Roth conversion (ordinary income that moves into a Roth IRA)
    seriesByKey.rothIn.push(rIn); seriesByKey.rothConv.push(Math.max(0,(r.rothConvTotal||0)-rIn));
    seriesByKey.iraTotal.push(Math.max(0,r.iraTotal-(r.inhIraWd||0))); seriesByKey.inhIra.push(r.inhIraWd||0); seriesByKey.inhRoth.push(r.inhRothWd||0); seriesByKey.iraExp.push(r.iraExpTotal||0); seriesByKey.rental.push(r.rental); seriesByKey.rentDep.push(r.rentalDep||0); seriesByKey.te.push(r.teIncome||0); seriesByKey.rothExp.push(r.rothExpTotal||0);
    seriesByKey.qdiv.push(r.qdiv); seriesByKey.ltcg.push(r.ltcg);
    seriesByKey.odivNQ.push(r.odivNQ);
    seriesByKey.ssP0.push(r.ssByPerson[idxP0]||0);
    if(proj.married) seriesByKey.ssOther.push(r.ssByPerson[otherIdx]||0);
  });
  const aligned={}; keys.forEach(k=>{ aligned[k]=alignToAges(ages, seriesByKey[k], labels); });

  // SCGL carryforward still unused at the end of each year (today's $), drawn as a dashed ink line with a white halo, on top of the bands, while any is left.
  const scglAligned=alignToAges(ages, rows.map(r=>(r.scglRemaining||0)>0.5?r.scglRemaining:null), labels);
  const hasScgl=scglAligned.some(v=>v!=null);
  const Y_MAX=lockedYMax('income', ()=>{
    let maxT=0;
    scglAligned.forEach(v=>{ if(v!=null) maxT=Math.max(maxT,v); });   // keep the line on the chart
    for(let i=0;i<labels.length;i++){
      let t=0, any=false;
      keys.forEach(k=>{ const v=aligned[k][i]; if(v!=null){ t+=v; any=true; } });
      if(any) maxT=Math.max(maxT,t);
    }
    return maxT>150000 ? Math.ceil(maxT/10000)*10000+15000 : 150000;
  });

  // filing-status split (for the MFJ→single boundary on the chart)
  let swIdx=labels.length;
  const rowByAge={}; rows.forEach(r=>rowByAge[Math.round(r.age0)]=r);
  for(let i=0;i<labels.length;i++){ const r=rowByAge[labels[i]]; if(r && r.filing!=='married'){ swIdx=i; break; } if(!r){ swIdx=Math.min(swIdx,i); break; } }


  const datasets=keys.map(k=>({
    label:INC_LABELS[k], data:aligned[k],
    borderColor:INC_COLORS[k], backgroundColor:INC_COLORS[k]+'bb',
    borderWidth:THIN_W, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'inc'
  }));
  if(hasScgl) datasets.push({label:'SCGL remaining', data:scglAligned, ciStock:true, halo:true, borderColor:BRACKET_COLOR, backgroundColor:'transparent',
    borderWidth:THIN_W, borderDash:[6,4], pointRadius:0, tension:0, fill:false, spanGaps:false, stack:'scgl', order:-1});   // own stack key keeps it off the income bands; order -1 draws it on top of them

  // Built fresh on every call (not just on first creation) so the tooltip never closes
  // over a stale rowByAge/labels/aligned from an earlier render after a slider change.
  const tooltipCallbacks={
    title:i=>{ const idx=i[0]?i[0].dataIndex:0; const r=rowByAge[labels[idx]]; return r?popupPersonAgeLines(proj,r):[]; },
    label:ctx=>{
      if(ctx.raw==null||ctx.raw===0||ctx.datasetIndex>=keys.length) return null;   // the SCGL line is reported by the footer
      const key=keys[ctx.datasetIndex];
      const r=rowByAge[labels[ctx.dataIndex]];
      const field=INC_BYPERSON_FIELD[key];
      if(r && field && Array.isArray(r[field])){
        const lines=[];
        r[field].forEach((v,pIdx)=>{
          if(v>0.5) lines.push(mrow('  '+ctx.dataset.label+' — '+displayPersonName(proj.people[pIdx],pIdx), fmt(v)+'/yr'));
        });
        if(lines.length) return lines;
      }
      // ssP0/ssOther already carry the person's name in the dataset label itself.
      return mrow('  '+ctx.dataset.label, fmt(ctx.raw)+'/yr');
    },
    footer:items=>{
      const idx=items[0]?items[0].dataIndex:0;
      const r=rowByAge[labels[idx]]; if(!r) return[];
      const total=keys.reduce((s,k)=>s+(aligned[k][idx]||0),0);
      // §8.3: total income and remaining SCGL always shown; filing status and AGI are shown only
      // when Popup Details is on.
      const lines=['',mrow('Total income',fmt(total)+'/yr')];
      if(r.scglRemaining>0||r.scglUsed>0) lines.push(mrow("Suspended Capital-Gain Loss (SCGL) remaining (today's $)", fmt(r.scglRemaining)));
      if(showDetails){
        lines.push(mrow('Filing',r.filing==='married'?'Married (MFJ)':'Single'));
        lines.push(mrow('AGI',fmt(r.agi)+'/yr'));
        if(r.teIncome>0) lines.push(mrow('MAGI (AGI + tax-exempt interest)',fmt(r.magi)+'/yr'));
        // Taxable-income numbers (the Taxable Ordinary Income chart's own popup shows only the deduction and the ordinary total).
        if(r.taxableSS>0.5) lines.push(mrow('Taxable Social Security',fmt(r.taxableSS)+'/yr'));
        lines.push(mrow('Taxable ordinary income',fmt(r.ordTI||0)+'/yr'));
        if((r.qualIncome||0)>0.5){
          lines.push(mrow('Qualified income (QDIV + LTCG)',fmt(r.qualIncome)+'/yr'));
          lines.push(mrow('Taxable income (ordinary + qualified)',fmt((r.ordTI||0)+(r.qualTaxable!=null?r.qualTaxable:(r.qualIncome||0)))+'/yr'));
        }
        // Household expense funding (income → dividends → asset sales), when there are any expenses.
        if(r.expTotal>0){
          lines.push(mrow('Household expenses',fmt(r.expTotal)+'/yr'));
          lines.push(mrow('  incl. income tax',fmt(r.expTax)+'/yr'));
          if(r.expIrmaa>0) lines.push(mrow('  incl. IRMAA surcharge',fmt(r.expIrmaa)+'/yr'));
          if(r.expAum>0) lines.push(mrow('  incl. AUM fee',fmt(r.expAum)+'/yr'));
          lines.push(mrow('  paid by household income',fmt(r.expFromIncome)+'/yr'));
          if(r.brokerageWd>0.5) lines.push(mrow('    incl. portfolio withdraw',fmt(r.brokerageWd)+'/yr'));
          lines.push(mrow('  paid by dividends',fmt(r.expFromDiv)+'/yr'));
          lines.push(mrow('  paid by asset sales',fmt(r.expFromSales)+'/yr'));
          if(r.expFromIra>0.5) lines.push(mrow('  paid by pre-tax IRA',fmt(r.expFromIra)+'/yr'));
          if(r.expFromRoth>0.5) lines.push(mrow('  paid by Roth IRA',fmt(r.expFromRoth)+'/yr'));
          if(r.expFromRe>0.5) lines.push(mrow('  paid by property sale', fmt(r.expFromRe)+'/yr'));
          if(r.expUnfunded>1) lines.push(mrow('  unfunded shortfall',fmt(r.expUnfunded)+'/yr'));
        }
      }
      r.iraBalByPerson.forEach((bal,i)=>{ if(bal>1)lines.push(mrow(displayPersonName(proj.people[i],i)+" IRA bal.", fmt(bal))); });
      const irmaaT=(r.filing==='married'?IRMAA_MFJ:IRMAA_SGL).slice().reverse().find(t=>(r.magi!=null?r.magi:r.agi)>=t.magi);
      // This year's MAGI sets the premium two years later, per person on Medicare (the Household Expenses chart charges the tier from two years earlier × people 65+).
      if(irmaaT) lines.push(`⚠ IRMAA tier reached by this year's MAGI: +${fmt(irmaaT.surch)}/person/yr (billed 2 yrs later)`);
      return lines;
    }
  };

  upsertLineChart('income',{canvasId:'incomeChart', labels, datasets, yMax:Y_MAX, tooltip:tooltipCallbacks,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{display:false},
        // External (HTML) tooltip: the primary is now half the section width, and the built-in canvas popup is clipped at the canvas edge.
        tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(tooltipCallbacks)}
      },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle("Annual income (today's $)"),ticks:yAxisTicks,grid:AXIS_GRID}
      }
    })});

  // ── Half-size companion chart (right side): household MAGI stack with IRMAA tier lines ──
  // Same labels (X scale), same locked Y scale (YM) and same 1:1 aspect ratio as the primary chart,
  // sparser axis ticks, no legend/note (the primary's legend covers it). The stack uses the primary's colors and order
  // and sums exactly to MAGI = AGI + tax-exempt income: the same sources as the primary except that untaxed
  // rental depreciation is left out and Social Security counts only its taxable part (split between the two
  // people in proportion to their benefits). Dashed IRMAA lines follow the filing status in force (MFJ until switchIdx,
  // Single after), each labeled with the bracket's MAGI value and the Part B premium % over standard.
  // Beneficiary pays 25% of the Part B cost at the standard tier and 35/50/65/80/85% at IRMAA tiers 1–5,
  // so the Part B premium is 40/100/160/220/240% above standard.
  const mKeys=keys.filter(k=>k!=='rentDep'&&k!=='rothExp'&&k!=='inhRoth');   // Roth IRA withdraw is untaxed and not part of MAGI, like untaxed rental depreciation
  const mSeries={}; mKeys.forEach(k=>mSeries[k]=[]);
  const taxSSPart=(r,idx)=>{ const tot=r.totalSS||0; return tot>0 ? (r.taxableSS||0)*((r.ssByPerson[idx]||0)/tot) : 0; };
  rows.forEach(r=>{
    mKeys.forEach(k=>{
      if(k==='ssP0') mSeries[k].push(taxSSPart(r,idxP0));
      else if(k==='ssOther') mSeries[k].push(taxSSPart(r,otherIdx));
      else mSeries[k].push(seriesByKey[k][mSeries[k].length]);
    });
  });
  const mAligned={}; mKeys.forEach(k=>{ mAligned[k]=alignToAges(ages, mSeries[k], labels); });
  // Own scale (locked until Rescale; chartHelpers.js shares it with the other income / expense charts while that Scale button is on).
  const YM=lockedYMax('incomeMagi', ()=>{
    let m=0; for(let i=0;i<labels.length;i++){ let t=0; mKeys.forEach(k=>{ t+=mAligned[k][i]||0; }); m=Math.max(m,t); }
    return niceMax(m,50000);
  });
  const irmaaMFJ=IRMAA_MFJ.map((l,i)=>({...l,tier:i})).filter(l=>l.magi<YM);
  const irmaaSgl=IRMAA_SGL.map((l,i)=>({...l,tier:i})).filter(l=>l.magi<YM);
  const withPct=a=>a.map(l=>({...l,pct:IRMAA_PART_B_INCREASE[Math.min(l.tier,IRMAA_PART_B_INCREASE.length-1)]}));
  // IRMAA lines only matter while someone is on (or about to be on) Medicare: this year's MAGI sets the premium two years later, so the
  // lines show from the year a living person is 63 (65 two years on, the same exposure rule the Roth-conversion IRMAA limit uses) until the last passing.
  let irmFrom=-1, irmTo=-1;
  labels.forEach((lb,i)=>{
    const r=rowByAge[lb]; if(!r||!r.alive||!r.ages) return;
    if(r.alive.some((al,j)=>al&&r.ages[j]+2>=65)){ if(irmFrom<0) irmFrom=i; irmTo=i; }
  });
  // Only the IRMAA lines nearest the MAGI stack (within the Medicare window above) are drawn, at most 3 per filing status: see crowdedBracketKeep.
  const magiTops=fs=>{ const t=[]; for(let i=Math.max(irmFrom,0);i<=irmTo;i++){ const r=rowByAge[labels[i]]; if(r&&(r.filing==='married')===fs) t.push(r.magi!=null?r.magi:(r.agi||0)); } return t; };
  const irmaaKeep=crowdedBracketKeep([
    rows.some(r=>r.filing==='married')?{vals:IRMAA_MFJ.map(l=>l.magi), tops:magiTops(true)}:null,
    rows.some(r=>r.filing!=='married')?{vals:IRMAA_SGL.map(l=>l.magi), tops:magiTops(false)}:null], YM);
  const magiOv={irmaaMFJ:withPct(irmaaMFJ.filter(l=>irmaaKeep.has(l.tier))),irmaaSgl:withPct(irmaaSgl.filter(l=>irmaaKeep.has(l.tier))),switchIdx:swIdx,
    fromIdx:irmFrom<0?labels.length:irmFrom, toIdx:irmTo};
  const magiDs=mKeys.map(k=>({
    label:(k==='ssP0'||k==='ssOther') ? INC_LABELS[k]+' — taxable part' : INC_LABELS[k], data:mAligned[k],
    borderColor:INC_COLORS[k], backgroundColor:INC_COLORS[k]+'bb',
    borderWidth:THIN_W, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'magi'
  }));
  // Popup shows the scenario owner(s) and age, then only the MAGI value and the IRMAA surcharge for the tier that MAGI reaches (nothing else, regardless
  // of Popup Details); every other value is in the primary chart's popup.
  const magiTip={
    title:tooltipCallbacks.title,   // owners + ages, as on the primary
    label:()=>null,
    footer:items=>{
      const idx=items[0]?items[0].dataIndex:0;
      const r=rowByAge[labels[idx]]; if(!r) return [];
      const m=r.magi!=null?r.magi:r.agi;
      const lines=[mrow('MAGI', fmt(m)+'/yr')];
      const irmaaT=(r.filing==='married'?IRMAA_MFJ:IRMAA_SGL).slice().reverse().find(t=>m>=t.magi);
      if(irmaaT) lines.push(mrow('IRMAA tier reached (billed 2 yrs later)', '+'+fmt(irmaaT.surch)+'/person/yr'));
      return lines;
    }
  };
  upsertLineChart('incomeMagi',{canvasId:'incomeMagiChart', labels, datasets:magiDs, yMax:YM, tooltip:magiTip,
    refresh:o=>{ o.plugins.magiOverlay=magiOv; },
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, magiOverlay:magiOv, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(magiTip)} },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:YM,title:axisTitle('MAGI (today\'s $)'),ticks:yAxisTicks,grid:AXIS_GRID}
      }
    })});

  // ── Second half-size companion chart, under the MAGI chart: taxable ORDINARY income ──
  // The height is the year's taxable ordinary income (`row.ordTI` = ordinary income − the standard/itemized + senior deduction, floored at 0). Qualified
  // income (QDIV + net LTCG) is not drawn: it is taxed at its own rates, so it does not belong against the ordinary brackets (it is in the main popup's
  // Show Details). The band colors/order are the primary's: pension, taxable annuity, wages, pre-tax IRA withdraw, IRA RMDs, rental, non-qualified
  // dividends and the taxable part of Social Security (per person, as in the MAGI stack). The deduction is applied to the stack from the bottom up
  // (brackets fill from the bottom too), so the bands are each source's taxable portion and they sum exactly to `ordTI`, which is what the Roth
  // conversion "below ordinary bracket" limit tests. Same X labels, Y scale and 1:1 ratio as the primary. Black dashed lines = ordinary bracket starts, labeled
  // with the rate that applies above them, for the filing status in force each year. A red dashed line marks the deduction stacked on top of the stack. The popup lists only the owners' ages, the deduction and the taxable ordinary income.
  const ordOnlyKeys=['pension','annuity','wageTotal','rothIn','rothConv','iraTotal','inhIra','iraExp','rental','odivNQ','ssP0','ssOther'].filter(k=>mKeys.includes(k));
  const ordKeys=ordOnlyKeys;
  const taxPortion={}; ordKeys.forEach(k=>taxPortion[k]=[]);
  rows.forEach((r,ri)=>{
    let skip=Math.max(0,(r.ordIncome||0)-(r.ordTI||0));    // deduction actually absorbed by ordinary income
    ordKeys.forEach(k=>{
      const g=mSeries[k][ri]||0, used=Math.min(g,skip);
      skip-=used; taxPortion[k].push(g-used);
    });
  });
  const ordAligned={}; ordKeys.forEach(k=>{ ordAligned[k]=alignToAges(ages, taxPortion[k], labels); });
  const YO=lockedYMax('incomeOrd', ()=>{
    let m=0; rows.forEach((r,ri)=>{ let t=0; ordKeys.forEach(k=>{ t+=taxPortion[k][ri]||0; }); m=Math.max(m,t,(r.ordIncome||0)>(r.ordTI||0)+0.5?(r.ordIncome||0):0); });   // stack, or the red deduction line above it
    return niceMax(m,20000);
  });
  const ordDs=ordKeys.map(k=>({
    label:(k==='ssP0'||k==='ssOther') ? INC_LABELS[k]+' \u2014 taxable part' : INC_LABELS[k], data:ordAligned[k],
    borderColor:INC_COLORS[k], backgroundColor:INC_COLORS[k]+'bb',
    borderWidth:THIN_W, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'ord', order:3
  }));
  const nBrk=MFJ_ORD.length-1;
  // Only the bracket lines nearest the taxable-ordinary-income stack are drawn (at most 3 per filing status; none far above it in empty space or buried deep inside it): see crowdedBracketKeep.
  const ordTops=fs=>rows.filter(r=>(r.filing==='married')===fs).map(r=>r.ordTI||0);
  const brkKeep=crowdedBracketKeep([
    rows.some(r=>r.filing==='married')?{vals:MFJ_ORD.slice(0,nBrk).map(b=>b.lim), tops:ordTops(true)}:null,
    rows.some(r=>r.filing!=='married')?{vals:SGL_ORD.slice(0,nBrk).map(b=>b.lim), tops:ordTops(false)}:null], YO);   // the top bracket (37%) has no upper limit, so there is no line above the 35% bracket's end
  // Every bracket line is ALWAYS a dataset (all-null when it is off the chart's scale or dropped by the crowding limit): a fixed dataset count lets Chart.js
  // update the chart in place, so a Rescale / scale change tweens the lines instead of rebuilding (and re-animating) the whole chart.
  for(let j=0;j<nBrk;j++){
    const vals=rows.map(r=>(r.filing==='married'?MFJ_ORD:SGL_ORD)[j].lim);
    const off=Math.min(...vals)>=YO||!brkKeep.has(j);   // off the chart's scale, or dropped by the crowding limit
    const rate=Math.round(MFJ_ORD[j+1].r*100)+'%';
    ordDs.push({data:off?labels.map(()=>null):alignToAges(ages, vals, labels), label:rate, ordLabel:rate, borderWidth:THIN_W, pointRadius:0, tension:0, fill:false, spanGaps:false,
      borderDash:ORD_DASH, thin:true, borderColor:BRACKET_COLOR, stack:'ol'+j, order:0});
  }
  // Red dashed line: the deduction stacked on top of the taxable ordinary income, i.e. taxable ordinary income + the deduction absorbed (the same
  // "Deduction" the popup shows) = the year's gross ordinary income (`ordIncome`). The gap between the top of the stack and the line is the deduction.
  // Left out (null) in years where no deduction is absorbed. Its own stack key keeps it from stacking on the bands.
  const dedLine=rows.map(r=>{ const d=Math.max(0,(r.ordIncome||0)-(r.ordTI||0)); return d>0.5 ? (r.ordTI||0)+d : null; });
  const dedAmt=rows.map(r=>{ const d=Math.max(0,(r.ordIncome||0)-(r.ordTI||0)); return d>0.5?d:null; });   // the deduction itself (the line is plotted at taxable ordinary income + it)
  ordDs.push({data:alignToAges(ages, dedLine, labels), ciValues:alignToAges(ages, dedAmt, labels), label:'Deduction', borderWidth:THIN_W, pointRadius:0, tension:0, fill:false, spanGaps:false,
    borderDash:[], thin:true, borderColor:DEDUCTION_COLOR, stack:'ded', order:0});
  const nStack=ordKeys.length;
  const ordTip={
    title:tooltipCallbacks.title,   // owners + ages
    // Kept simple: owners + ages, ordinary income before deduction (the red line), the deduction and the taxable ordinary income. The other numbers (taxable Social Security, qualified income,
    // total taxable income) are in the main Annual Household Income popup under Show Details.
    label:()=>null,
    footer:items=>{
      const r=rowByAge[labels[items[0]?items[0].dataIndex:0]]; if(!r) return [];
      const ded=Math.max(0,(r.ordIncome||0)-(r.ordTI||0));
      const lines=[''];
      // Ordinary income before the deduction = the height of the red dashed line (taxable ordinary income + deduction).
      if(ded>0){ lines.push(mrow('Ordinary income before deduction', fmt((r.ordTI||0)+ded)+'/yr')); lines.push(mrow('Deduction','\u2212'+fmt(ded)+'/yr')); }
      lines.push(mrow('Taxable ordinary income', fmt(r.ordTI||0)+'/yr'));
      return lines;
    }
  };
  upsertLineChart('incomeOrd',{canvasId:'incomeOrdChart', labels, datasets:ordDs, yMax:YO, tooltip:ordTip,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(ordTip)} },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:YO,title:axisTitle('Taxable ordinary income (today\'s $)'),ticks:yAxisTicks,grid:AXIS_GRID}
      }
    })});

  // ── Fourth equal-size chart: taxable QUALIFIED income (QDIV + LTCG net of SCGL) ──
  // Only the TAXABLE qualified income is stacked (QDIV, LTCG, in the primary's colors); ordinary income is not drawn. The lines are the qualified
  // tax brackets: where the 15% and the 20% rate start, each labeled with that rate. The bracket limits (MFJ_QDIV / SGL_QDIV `lim`, filing status in force) apply to TOTAL taxable income
  // and the qualified income sits on top of the taxable ordinary income (Qualified Dividends and Capital Gain Tax Worksheet), so on this chart a line is the limit minus that year's taxable
  // ordinary income, floored at 0: the room left for qualified income before the rate steps up. The lines therefore move with the year's ordinary income (they are not flat). A line above the chart's Y scale is not
  // drawn. Same X labels, Y scale and 1:1 ratio as the other charts. The popup lists every qualified component with its color.
  const qualKeys=['qdiv','ltcg'];
  const qualSeries={ qdiv:rows.map(r=>r.qdivT!=null?r.qdivT:(r.qdiv||0)), ltcg:rows.map(r=>r.ltcgT!=null?r.ltcgT:(r.ltcg||0)) };   // taxable parts (a deduction larger than ordinary income shelters qualified income)
  const qLimOf=(r,j)=>Math.max(0,(r.filing==='married'?MFJ_QDIV:SGL_QDIV)[j].lim-(r.ordTI||0));   // room under bracket j's limit once the ordinary income has used its share
  const nQ=MFJ_QDIV.length-1;   // the top tier (20%) has no upper limit, so the last line is where the 15% tier ends = where the 20% rate starts
  const qLineVals=Array.from({length:nQ},(_,j)=>rows.map(r=>qLimOf(r,j)));
  const qualAligned={}; qualKeys.forEach(k=>{ qualAligned[k]=alignToAges(ages, qualSeries[k], labels); });
  // Red dashed line (as on the ordinary chart): the excess deduction that shelters qualified income, stacked on top of the taxable qualified income, i.e. the qualified income before the
  // deduction (`qualIncome`). The gap between the top of the stack and the line is the part of the deduction left over after ordinary income (itemized LTC / medical costs, say). Null where nothing is sheltered.
  const qualShel=rows.map(r=>{ const d=Math.max(0,(r.qualIncome||0)-(r.qualTaxable!=null?r.qualTaxable:(r.qualIncome||0))); return d>0.5?d:null; });
  const qualDedLine=rows.map((r,ri)=>qualShel[ri]!=null?(r.qualTaxable!=null?r.qualTaxable:(r.qualIncome||0))+qualShel[ri]:null);
  const YQ=lockedYMax('incomeQual', ()=>{
    let m=0; rows.forEach((r,ri)=>{ m=Math.max(m,qualSeries.qdiv[ri]+qualSeries.ltcg[ri],qualDedLine[ri]||0); });   // stack, or the red deduction line above it
    const data=m; qLineVals.forEach(vs=>{ const lm=Math.max(...vs,0); if(lm<=Math.max(1.5*data,20000)) m=Math.max(m,lm*1.05); });   // a line is brought on scale only when it is close to the data (so the 20% start shows when the stack gets near it). A far-off line (the 20% start is often 3x+ the data) is left off the chart: pulling the scale up to it would also stretch every chart the Same-scale buttons share it with
    return niceMax(m,5000);
  });
  const qualDs=qualKeys.map(k=>({
    label:INC_LABELS[k], data:qualAligned[k],
    borderColor:INC_COLORS[k], backgroundColor:INC_COLORS[k]+'bb',
    borderWidth:THIN_W, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'qual', order:3
  }));
  for(let j=0;j<nQ;j++){
    const vals=qLineVals[j];   // limit − taxable ordinary income, per year (the filing status in force)
    const off=Math.min(...vals)>=YQ;   // off the chart's scale: all-null, but still a dataset (fixed dataset count, see the ordinary chart); both lines are otherwise always drawn
    const rate=Math.round(MFJ_QDIV[j+1].r*100)+'%';
    qualDs.push({data:off?labels.map(()=>null):alignToAges(ages, vals, labels), label:rate, ordLabel:rate, borderWidth:THIN_W, pointRadius:0, tension:0, fill:false, spanGaps:false,
      borderDash:QUAL_DASH, thin:true, borderColor:BRACKET_COLOR, stack:'ql'+j, order:0});
  }
  qualDs.push({data:alignToAges(ages, qualDedLine, labels), ciValues:alignToAges(ages, qualShel, labels), label:'Deduction', borderWidth:THIN_W, pointRadius:0, tension:0, fill:false, spanGaps:false,
    borderDash:[], thin:true, borderColor:DEDUCTION_COLOR, stack:'ded', order:0});
  const qualTip={
    title:tooltipCallbacks.title,   // owners + ages
    // One colored line per qualified component (the tier lines have no label of their own).
    label:ctx=>{
      if(ctx.raw==null||ctx.raw<0.5||qualKeys[ctx.datasetIndex]==null) return null;
      return mrow('  '+ctx.dataset.label, fmt(ctx.raw)+'/yr');
    },
    footer:items=>{
      const r=rowByAge[labels[items[0]?items[0].dataIndex:0]]; if(!r) return [];
      const lines=[''];
      if((r.scglUsed||0)>0.5) lines.push(mrow('  LTCG realized (gross, before SCGL)', fmt(r.ltcgGross!=null?r.ltcgGross:(r.ltcg||0)+(r.scglUsed||0))+'/yr'), mrow('  SCGL used', '\u2212'+fmt(r.scglUsed)+'/yr'));
      const shel=Math.max(0,(r.qualIncome||0)-(r.qualTaxable!=null?r.qualTaxable:(r.qualIncome||0)));
      if(shel>0.5) lines.push(mrow('  Qualified income before deduction (red line)', fmt(r.qualIncome||0)+'/yr'), mrow('  Excess deduction (sheltered)', '\u2212'+fmt(shel)+'/yr'));
      lines.push(mrow('Taxable qualified income', fmt(r.qualTaxable!=null?r.qualTaxable:(r.qualIncome||0))+'/yr'));
      lines.push(mrow('  Taxable ordinary income (below it)', fmt(r.ordTI||0)+'/yr'));
      if((r.qualTax||0)>0.5) lines.push(mrow('Qualified tax', fmt(r.qualTax)+'/yr'));
      return lines;
    }
  };
  upsertLineChart('incomeQual',{canvasId:'incomeQualChart', labels, datasets:qualDs, yMax:YQ, tooltip:qualTip,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(qualTip)} },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:YQ,title:axisTitle('Taxable qualified income (today\'s $)'),ticks:yAxisTicks,grid:AXIS_GRID}
      }
    })});
}
