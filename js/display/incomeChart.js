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
function buildIncomeLegend(){
  if(!lastProjection) return;
  const proj=lastProjection;
  updateIncomeLabels(proj);
  const keys = proj.married ? INC_KEYS : INC_KEYS.filter(k=>k!=='ssOther');
  document.getElementById('incomeLegend').innerHTML =
    keys.map(k=>legendItem(INC_LABELS[k], INC_COLORS[k])).join('') +
    legendItem('IRMAA brackets (shown on MAGI chart)', null, legendDashStyle(OVERLAY_COLOR)) +
    legendItem('Taxable income brackets (rate above each line, shown on taxable income chart)', null, legendDashStyle(OVERLAY_COLOR));
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
      // when Show Details in Popup is on.
      const lines=['',mrow('Total income',fmt(total)+'/yr')];
      if(r.scglRemaining>0||r.scglUsed>0) lines.push(mrow("Suspended Capital-Gain Loss (SCGL) remaining (today's $)", fmt(r.scglRemaining)));
      if(showDetails){
        lines.push(mrow('Filing',r.filing==='married'?'Married (MFJ)':'Single'));
        lines.push(mrow('AGI',fmt(r.agi)+'/yr'));
        if(r.teIncome>0||r.annuityTE>0) lines.push(mrow('MAGI (AGI + tax-exempt income)',fmt(r.magi)+'/yr'));
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
        tooltip:{...TIP_STYLE,callbacks:justifyTip(tooltipCallbacks)}
      },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle("Annual income (today's $)"),ticks:{...AXIS_TICKS,callback:v=>'$'+Math.round(v).toLocaleString()},grid:AXIS_GRID}
      }
    })});
  buildIncomeLegend();

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
  const magiOv={irmaaMFJ:withPct(irmaaMFJ),irmaaSgl:withPct(irmaaSgl),switchIdx:swIdx};
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
  // of Show Details in Popup); every other value is in the primary chart's popup.
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
        x:{...ageXAxis(ageAxisLabel(proj)), ticks:{...AXIS_TICKS,maxTicksLimit:7}},
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle('MAGI (today\'s $)'),ticks:{...AXIS_TICKS,maxTicksLimit:5,callback:v=>'$'+Math.round(v/1000)+'k'},grid:AXIS_GRID}
      }
    })});

  // ── Second half-size companion chart, under the MAGI chart: taxable income ──
  // The height is the year's taxable income = taxable ordinary income (`row.ordTI` = ordinary income − the standard/itemized + senior deduction, floored at 0) + qualified income (QDIV + net LTCG, stacked on top, as the tax calc stacks it), so the
  // bottom (ordinary) part reads directly against the ordinary tax brackets, which are defined on taxable income. The band colors/order are the primary's: pension, taxable
  // annuity, wages, pre-tax IRA withdraw, IRA RMDs, rental, non-qualified dividends and the taxable part of Social Security (per person, as in the MAGI
  // stack), then QDIV and LTCG on top. The deduction is applied to the stack from the bottom up (brackets fill from the bottom too), so the ordinary bands are each source's taxable
  // portion and they sum exactly to `ordTI`; with QDIV + LTCG the stack sums to taxable income. Same X labels, Y scale and 1:1 ratio as the primary. Dashed lines = bracket starts, labeled with the rate
  // that applies above them, for the filing status in force each year. The popup lists the full components, the deduction and the taxable total.
  const ordOnlyKeys=['pension','annuity','wageTotal','rothConv','iraTotal','iraExp','rental','odivNQ','ssP0','ssOther'].filter(k=>mKeys.includes(k));
  const ordKeys=[...ordOnlyKeys,'qdiv','ltcg'];   // qualified income sits on top of the ordinary bands
  const taxPortion={}; ordKeys.forEach(k=>taxPortion[k]=[]);
  rows.forEach((r,ri)=>{
    let skip=Math.max(0,(r.ordIncome||0)-(r.ordTI||0));    // deduction actually absorbed by ordinary income
    ordKeys.forEach(k=>{
      if(k==='qdiv'||k==='ltcg'){ taxPortion[k].push(mSeries[k][ri]||0); return; }   // deduction is absorbed by ordinary income only
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
  const nBrk=MFJ_ORD.length-1;   // the top bracket (37%) has no upper limit, so there is no line above the 35% bracket's end
  for(let j=0;j<nBrk;j++){
    const vals=rows.map(r=>(r.filing==='married'?MFJ_ORD:SGL_ORD)[j].lim);
    if(Math.min(...vals)>=Y_MAX) continue;   // off the chart's scale
    const rate=Math.round(MFJ_ORD[j+1].r*100)+'%';
    ordDs.push({data:alignToAges(ages, vals, labels), label:rate, ordLabel:rate, borderWidth:2, pointRadius:0, tension:0, fill:false, spanGaps:false,
      borderDash:[7,4], borderColor:OVERLAY_COLOR, stack:'ol'+j, order:0});
  }
  const nStack=ordKeys.length;
  const ordTip={
    title:tooltipCallbacks.title,   // owners + ages
    // Full (pre-deduction) component amounts, so the lines reconcile with the footer: components − deduction = taxable income.
    label:c=>{
      if(c.datasetIndex>=nStack) return null;
      const k=ordKeys[c.datasetIndex], g=mSeries[k][rows.indexOf(rowByAge[labels[c.dataIndex]])];
      return (!g)?null:mrow('  '+c.dataset.label, fmt(g)+'/yr');
    },
    footer:items=>{
      const r=rowByAge[labels[items[0]?items[0].dataIndex:0]]; if(!r) return [];
      const ded=Math.max(0,(r.ordIncome||0)-(r.ordTI||0));
      const lines=['']; if(ded>0) lines.push(mrow('Deduction','\u2212'+fmt(ded)+'/yr'));
      if((r.qualIncome||0)>0) lines.push(mrow('  of which taxable ordinary income', fmt(r.ordTI||0)+'/yr'));
      lines.push(mrow('Taxable income', fmt((r.ordTI||0)+(r.qualIncome||0))+'/yr'));
      return lines;
    }
  };
  upsertLineChart('incomeOrd',{canvasId:'incomeOrdChart', labels, datasets:ordDs, yMax:Y_MAX, tooltip:ordTip,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(ordTip)} },
      scales:{
        x:{...ageXAxis(ageAxisLabel(proj)), ticks:{...AXIS_TICKS,maxTicksLimit:7}},
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle('Taxable income (today\'s $)'),ticks:{...AXIS_TICKS,maxTicksLimit:5,callback:v=>'$'+Math.round(v/1000)+'k'},grid:AXIS_GRID}
      }
    })});
}
