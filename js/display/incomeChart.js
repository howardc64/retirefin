'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / ANNUAL HOUSEHOLD INCOME CHART — stacked income sources
// with IRMAA-tier overlay (spec §8.3).
// ═══════════════════════════════════════════════════════════════
const VZ = {
  pen:'#D06A18', ann:'#B8860B', annTE:'#8FBC8F', wg:'#7B5EA7', iraW:'#C79A3E', rmd:'#E85D9A', iraExp:'#8E3B5E', rothExp:'#5C6BC0', rent:'#A0522D', rentDep:'#D2A488', te:'#2A9D8F',
  qdiv:'#2E86AB', odivNQ:'#1A5276', ltcg:'#6C3483',
  ssP0:'#0F6E56', ssOther:'#3DB08A'
};
const INC_KEYS=['pension','annuity','annuityTE','wageTotal','rothConv','iraTotal','iraExp','rental','rentDep','te','rothExp','qdiv','odivNQ','ltcg','ssP0','ssOther'];
const INC_LABELS={pension:'Pension',annuity:'Annuity payout (taxable)',annuityTE:'Annuity payout (tax-exempt, untaxed)',wageTotal:'Wage',rothConv:'Pre-tax IRA withdraw',iraTotal:'IRA RMD',iraExp:'Pre-tax IRA withdraw (for expenses)',rental:'Rental income',rentDep:'Rental depreciation (non-cash, untaxed)',te:'Tax-exempt income (untaxed)',rothExp:'Roth IRA withdraw (tax-exempt, untaxed)',qdiv:'Qual. dividends (QDIV)',ltcg:'Long-term gains (LTCG)',odivNQ:'Ordinary dividends (ODIV−QDIV)',ssP0:'',ssOther:''};
const INC_COLORS={pension:VZ.pen,annuity:VZ.ann,annuityTE:VZ.annTE,wageTotal:VZ.wg,rothConv:VZ.iraW,iraTotal:VZ.rmd,iraExp:VZ.iraExp,rental:VZ.rent,rentDep:VZ.rentDep,te:VZ.te,rothExp:VZ.rothExp,qdiv:VZ.qdiv,ltcg:VZ.ltcg,odivNQ:VZ.odivNQ,ssP0:VZ.ssP0,ssOther:VZ.ssOther};
// Maps a stacked income key to the per-person breakdown array on each projection row,
// so the tooltip can attribute the amount to whichever person(s) it belongs to.
const INC_BYPERSON_FIELD={pension:'pensionByPerson',annuity:'annuityByPerson',annuityTE:'annuityTEByPerson',wageTotal:'wageByPerson',rothConv:'rothConvByPerson',iraTotal:'iraByPerson',iraExp:'iraExpByPerson',rental:'rentalByPerson',rentDep:'rentalDepByPerson',te:'teByPerson',rothExp:'rothExpByPerson',qdiv:'qdivByPerson',ltcg:'ltcgByPerson',odivNQ:'odivNQByPerson'};
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
// `shownKeys` (from buildIncomeChart): the income sources that are above $0 in some year; only those get a legend entry.
function buildIncomeLegend(shownKeys){
  if(!lastProjection) return;
  const proj=lastProjection;
  updateIncomeLabels(proj);
  const keys = proj.married ? INC_KEYS : INC_KEYS.filter(k=>k!=='ssOther');
  document.getElementById('incomeLegend').innerHTML =
    keys.filter(k=>!shownKeys||shownKeys.includes(k)).map(k=>legendItem(INC_LABELS[k], INC_COLORS[k])).join('') +
    legendItem('IRMAA brackets (shown on MAGI chart)', null, legendDashStyle(BRACKET_COLOR)) +
    legendItem('Ordinary tax brackets (rate above each line, shown on taxable ordinary income chart)', null, legendDashStyle(BRACKET_COLOR)) +
    legendItem('Deduction stacked on taxable ordinary income (shown on taxable ordinary income chart)', null, legendDashStyle(DEDUCTION_COLOR)) +
    legendItem('Qualified tax brackets (rate above each line, shown on taxable qualified income chart)', null, legendDashStyle(BRACKET_COLOR));
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
    seriesByKey.rothConv.push(r.rothConvTotal);
    seriesByKey.iraTotal.push(r.iraTotal); seriesByKey.iraExp.push(r.iraExpTotal||0); seriesByKey.rental.push(r.rental); seriesByKey.rentDep.push(r.rentalDep||0); seriesByKey.te.push(r.teIncome||0); seriesByKey.rothExp.push(r.rothExpTotal||0);
    seriesByKey.qdiv.push(r.qdiv); seriesByKey.ltcg.push(r.ltcg);
    seriesByKey.odivNQ.push(r.odivNQ);
    seriesByKey.ssP0.push(r.ssByPerson[idxP0]||0);
    if(proj.married) seriesByKey.ssOther.push(r.ssByPerson[otherIdx]||0);
  });
  const aligned={}; keys.forEach(k=>{ aligned[k]=alignToAges(ages, seriesByKey[k], labels); });

  const Y_MAX=lockedYMax('income', ()=>{
    let maxT=0;
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

  const irmaaMFJ=IRMAA_MFJ.map((l,i)=>({...l,tier:i})).filter(l=>l.magi<Y_MAX);
  const irmaaSgl=IRMAA_SGL.map((l,i)=>({...l,tier:i})).filter(l=>l.magi<Y_MAX);

  const datasets=keys.map(k=>({
    label:INC_LABELS[k], data:aligned[k],
    borderColor:INC_COLORS[k], backgroundColor:INC_COLORS[k]+'bb',
    borderWidth:3, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'inc'
  }));

  // Built fresh on every call (not just on first creation) so the tooltip never closes
  // over a stale rowByAge/labels/aligned from an earlier render after a slider change.
  const tooltipCallbacks={
    title:i=>{ const idx=i[0]?i[0].dataIndex:0; const r=rowByAge[labels[idx]]; return r?popupPersonAgeLines(proj,r):[]; },
    label:ctx=>{
      if(ctx.raw==null||ctx.raw===0) return null;
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
        if(r.teIncome>0||r.annuityTE>0) lines.push(mrow('MAGI (AGI + tax-exempt income)',fmt(r.magi)+'/yr'));
        // Taxable-income numbers (the Taxable Ordinary Income chart's own popup shows only the deduction and the ordinary total).
        if(r.taxableSS>0.5) lines.push(mrow('Taxable Social Security',fmt(r.taxableSS)+'/yr'));
        lines.push(mrow('Taxable ordinary income',fmt(r.ordTI||0)+'/yr'));
        if((r.qualIncome||0)>0.5){
          lines.push(mrow('Qualified income (QDIV + LTCG)',fmt(r.qualIncome)+'/yr'));
          lines.push(mrow('Taxable income (ordinary + qualified)',fmt((r.ordTI||0)+(r.qualIncome||0))+'/yr'));
        }
        // Household expense funding (income → dividends → asset sales), when there are any expenses.
        if(r.expTotal>0){
          lines.push(mrow('Household expenses',fmt(r.expTotal)+'/yr'));
          lines.push(mrow('  incl. income tax',fmt(r.expTax)+'/yr'));
          if(r.expIrmaa>0) lines.push(mrow('  incl. IRMAA surcharge',fmt(r.expIrmaa)+'/yr'));
          if(r.expAum>0) lines.push(mrow('  incl. AUM fee',fmt(r.expAum)+'/yr'));
          lines.push(mrow('  paid by household income',fmt(r.expFromIncome)+'/yr'));
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
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle("Annual income (today's $)"),ticks:{...AXIS_TICKS,callback:v=>'$'+Math.round(v).toLocaleString()},grid:AXIS_GRID}
      }
    })});
  buildIncomeLegend(keys.filter(k=>hasValue(seriesByKey[k])));

  // ── Half-size companion chart (right side): household MAGI stack with IRMAA tier lines ──
  // Same labels (X scale), same locked Y scale (Y_MAX) and same 1:1 aspect ratio as the primary chart,
  // sparser axis ticks, no legend/note (the primary's legend covers it). The stack uses the primary's colors and order
  // and sums exactly to MAGI = AGI + tax-exempt income: the same sources as the primary except that untaxed
  // rental depreciation is left out and Social Security counts only its taxable part (split between the two
  // people in proportion to their benefits). Dashed IRMAA lines follow the filing status in force (MFJ until switchIdx,
  // Single after), each labeled with the bracket's MAGI value and the Part B premium % over standard.
  // Beneficiary pays 25% of the Part B cost at the standard tier and 35/50/65/80/85% at IRMAA tiers 1–5,
  // so the Part B premium is 40/100/160/220/240% above standard.
  const withPct=a=>a.map(l=>({...l,pct:IRMAA_PART_B_INCREASE[Math.min(l.tier,IRMAA_PART_B_INCREASE.length-1)]}));
  // When the IRMAA lines would crowd each other (too many tiers inside the chart's Y range) only the top 3 are drawn on this small chart.
  const irmaaKeep=crowdedBracketKeep([
    rows.some(r=>r.filing==='married')?IRMAA_MFJ.map(l=>l.magi):null,
    rows.some(r=>r.filing!=='married')?IRMAA_SGL.map(l=>l.magi):null], Y_MAX);
  // IRMAA lines only matter while someone is on (or about to be on) Medicare: this year's MAGI sets the premium two years later, so the
  // lines show from the year a living person is 63 (65 two years on, the same exposure rule the Roth-conversion IRMAA limit uses) until the last passing.
  let irmFrom=-1, irmTo=-1;
  labels.forEach((lb,i)=>{
    const r=rowByAge[lb]; if(!r||!r.alive||!r.ages) return;
    if(r.alive.some((al,j)=>al&&r.ages[j]+2>=65)){ if(irmFrom<0) irmFrom=i; irmTo=i; }
  });
  const magiOv={irmaaMFJ:withPct(irmaaMFJ.filter(l=>irmaaKeep.has(l.tier))),irmaaSgl:withPct(irmaaSgl.filter(l=>irmaaKeep.has(l.tier))),switchIdx:swIdx,
    fromIdx:irmFrom<0?labels.length:irmFrom, toIdx:irmTo};
  const mKeys=keys.filter(k=>k!=='rentDep'&&k!=='rothExp');   // Roth IRA withdraw is untaxed and not part of MAGI, like untaxed rental depreciation
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
  const magiDs=mKeys.map(k=>({
    label:(k==='ssP0'||k==='ssOther') ? INC_LABELS[k]+' — taxable part' : INC_LABELS[k], data:mAligned[k],
    borderColor:INC_COLORS[k], backgroundColor:INC_COLORS[k]+'bb',
    borderWidth:3, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'magi'
  }));
  // Popup shows the plan owner(s) and age, then only the MAGI value and the IRMAA surcharge for the tier that MAGI reaches (nothing else, regardless
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
  upsertLineChart('incomeMagi',{canvasId:'incomeMagiChart', labels, datasets:magiDs, yMax:Y_MAX, tooltip:magiTip,
    refresh:o=>{ o.plugins.magiOverlay=magiOv; },
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, magiOverlay:magiOv, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(magiTip)} },
      scales:{
        x:{...ageXAxis(ageAxisLabel(proj)), ticks:{...AXIS_TICKS,maxTicksLimit:10}},
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle('MAGI (today\'s $)'),ticks:{...AXIS_TICKS,maxTicksLimit:7,callback:v=>'$'+Math.round(v/1000)+'k'},grid:AXIS_GRID}
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
  const ordOnlyKeys=['pension','annuity','wageTotal','rothConv','iraTotal','iraExp','rental','odivNQ','ssP0','ssOther'].filter(k=>mKeys.includes(k));
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
  const ordDs=ordKeys.map(k=>({
    label:(k==='ssP0'||k==='ssOther') ? INC_LABELS[k]+' \u2014 taxable part' : INC_LABELS[k], data:ordAligned[k],
    borderColor:INC_COLORS[k], backgroundColor:INC_COLORS[k]+'bb',
    borderWidth:3, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'ord', order:3
  }));
  const nBrk=MFJ_ORD.length-1;
  // When the bracket lines would crowd each other (too many inside the chart's Y range) only the top 3 are drawn.
  const brkKeep=crowdedBracketKeep([
    rows.some(r=>r.filing==='married')?MFJ_ORD.slice(0,nBrk).map(b=>b.lim):null,
    rows.some(r=>r.filing!=='married')?SGL_ORD.slice(0,nBrk).map(b=>b.lim):null], Y_MAX);   // the top bracket (37%) has no upper limit, so there is no line above the 35% bracket's end
  for(let j=0;j<nBrk;j++){
    const vals=rows.map(r=>(r.filing==='married'?MFJ_ORD:SGL_ORD)[j].lim);
    if(Math.min(...vals)>=Y_MAX||!brkKeep.has(j)) continue;   // off the chart's scale, or dropped by the crowding limit
    const rate=Math.round(MFJ_ORD[j+1].r*100)+'%';
    ordDs.push({data:alignToAges(ages, vals, labels), label:rate, ordLabel:rate, borderWidth:2, pointRadius:0, tension:0, fill:false, spanGaps:false,
      borderDash:[7,4], borderColor:BRACKET_COLOR, stack:'ol'+j, order:0});
  }
  // Red dashed line: the deduction stacked on top of the taxable ordinary income, i.e. taxable ordinary income + the deduction absorbed (the same
  // "Deduction" the popup shows) = the year's gross ordinary income (`ordIncome`). The gap between the top of the stack and the line is the deduction.
  // Left out (null) in years where no deduction is absorbed. Its own stack key keeps it from stacking on the bands.
  const dedLine=rows.map(r=>{ const d=Math.max(0,(r.ordIncome||0)-(r.ordTI||0)); return d>0.5 ? (r.ordTI||0)+d : null; });
  ordDs.push({data:alignToAges(ages, dedLine, labels), label:'Deduction', borderWidth:2, pointRadius:0, tension:0, fill:false, spanGaps:false,
    borderDash:[7,4], borderColor:DEDUCTION_COLOR, stack:'ded', order:0});
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
  upsertLineChart('incomeOrd',{canvasId:'incomeOrdChart', labels, datasets:ordDs, yMax:Y_MAX, tooltip:ordTip,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(ordTip)} },
      scales:{
        x:{...ageXAxis(ageAxisLabel(proj)), ticks:{...AXIS_TICKS,maxTicksLimit:10}},
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle('Taxable ordinary income (today\'s $)'),ticks:{...AXIS_TICKS,maxTicksLimit:7,callback:v=>'$'+Math.round(v/1000)+'k'},grid:AXIS_GRID}
      }
    })});

  // ── Fourth equal-size chart: taxable QUALIFIED income (QDIV + LTCG net of SCGL) ──
  // Only the qualified income is stacked (QDIV, LTCG, in the primary's colors); ordinary income is not drawn. The dashed lines are the qualified
  // tax brackets themselves: the 0% / 15% limits for the filing status in force (MFJ_QDIV / SGL_QDIV `lim`), each labeled with the rate that applies above it. A line above the chart's Y scale is not
  // drawn. Same X labels, Y scale and 1:1 ratio as the other charts. The popup lists every qualified component with its color.
  const qualKeys=['qdiv','ltcg'];
  const qualSeries={ qdiv:rows.map(r=>r.qdiv||0), ltcg:rows.map(r=>r.ltcg||0) };
  const qualAligned={}; qualKeys.forEach(k=>{ qualAligned[k]=alignToAges(ages, qualSeries[k], labels); });
  const qualDs=qualKeys.map(k=>({
    label:INC_LABELS[k], data:qualAligned[k],
    borderColor:INC_COLORS[k], backgroundColor:INC_COLORS[k]+'bb',
    borderWidth:3, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'qual', order:3
  }));
  const nQ=MFJ_QDIV.length-1;   // the top tier (20%) has no upper limit, so the last line is where the 15% tier ends
  for(let j=0;j<nQ;j++){
    const vals=rows.map(r=>(r.filing==='married'?MFJ_QDIV:SGL_QDIV)[j].lim);   // the qualified bracket limit itself, for the filing status in force
    if(Math.min(...vals)>=Y_MAX) continue;   // off the chart's scale
    const rate=Math.round(MFJ_QDIV[j+1].r*100)+'%';
    qualDs.push({data:alignToAges(ages, vals, labels), label:rate, ordLabel:rate, borderWidth:2, pointRadius:0, tension:0, fill:false, spanGaps:false,
      borderDash:[7,4], borderColor:BRACKET_COLOR, stack:'ql'+j, order:0});
  }
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
      lines.push(mrow('Qualified income', fmt(r.qualIncome||0)+'/yr'));
      if((r.qualTax||0)>0.5) lines.push(mrow('Qualified tax', fmt(r.qualTax)+'/yr'));
      return lines;
    }
  };
  upsertLineChart('incomeQual',{canvasId:'incomeQualChart', labels, datasets:qualDs, yMax:Y_MAX, tooltip:qualTip,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(qualTip)} },
      scales:{
        x:{...ageXAxis(ageAxisLabel(proj)), ticks:{...AXIS_TICKS,maxTicksLimit:10}},
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle('Taxable qualified income (today\'s $)'),ticks:{...AXIS_TICKS,maxTicksLimit:7,callback:v=>'$'+Math.round(v/1000)+'k'},grid:AXIS_GRID}
      }
    })});
}
