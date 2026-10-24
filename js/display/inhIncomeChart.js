'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / INHERITANCE ASSET INCOME CHART — every income component paid by the assets created by the Inheritance card, stacked by component (today's $), bottom → top:
//   Inherited IRA RMD / final withdraw · Inherited IRA annual withdraw · Inherited Roth IRA withdraw (tax-free)
//       row.inhIraByPerson[i][j].wd is the forced part (RMD / year-10 sweep); the annual withdraw is the holder's row.rothConvByPerson − row.convMainByPerson,
//       shared among that holder's inherited pre-tax IRAs by balance share (the total is exact, the split between several IRAs is approximate)
//   Ordinary dividends (non-qualified) · Qualified dividends · Tax-exempt income · Realized LTCG
//       inherited portfolios: row.portfoliosByPerson[i][j] divUsed + divReinvested split by the portfolio's qdivPct, taxExempt, ltcg
//   Real estate sale gain
//       an inherited property pays nothing else: row.realEstateByPerson[i][j].sale.gain when it is sold
// No bracket lines. Read-only view of projection rows; own Y scale but part of the income Same-scale groups (SCALE_LINK_GROUPS); no panel when no inherited asset pays anything
// (setChartAvailable). The popup lists each component, the total, and the total per inherited asset. inhIncomeAssets() / inhIncomeComps() are shared with the Excel export.
// ═══════════════════════════════════════════════════════════════
const INH_INC_KINDS=[   // bottom → top
  {kind:'rmd',   title:'Inherited IRA RMD / final withdraw',      color:()=>VZ.inhIra},
  {kind:'conv',  title:'Inherited IRA annual withdraw',           color:()=>'#8A6D2B'},
  {kind:'roth',  title:'Inherited Roth IRA withdraw (tax-free)',  color:()=>VZ.inhRoth},
  {kind:'odiv',  title:'Ordinary dividends (non-qualified)',      color:()=>VZ.odivNQ},
  {kind:'qdiv',  title:'Qualified dividends',                     color:()=>VZ.qdiv},
  {kind:'te',    title:'Tax-exempt income',                       color:()=>VZ.te},
  {kind:'ltcg',  title:'Realized LTCG',                           color:()=>VZ.ltcg},
  {kind:'reGain',title:'Real estate sale gain',                   color:()=>'#C26A0E'}
];
// The inherited assets of the scenario (portfolios, properties and IRAs created by the Inheritance card) and the income components each pays in a row. Shared by the chart and the Excel export.
function inhIncomeAssets(proj){
  const assets=[];   // [{kind:'pf'|'ira', personIdx, idx, name, qpct}]
  proj.people.forEach((p,i)=>{
    const pre=proj.married?displayPersonName(p,i)+' \u2014 ':'';
    (p.brokerage||[]).forEach((b,bi)=>{
      if(!b||!b.inh||b.enabled===false) return;
      assets.push({kind:'pf', personIdx:i, idx:bi, name:pre+((b.name&&b.name.trim())||('Portfolio '+(bi+1))), qpct:Math.min(100,Math.max(0,Number(b.qdivPct)||0))/100});
    });
    (p.realEstate||[]).forEach((r,ri)=>{
      if(!r||!r.inh||r.enabled===false) return;
      assets.push({kind:'re', personIdx:i, idx:ri, name:pre+((r.name&&r.name.trim())||('Property '+(ri+1)))});
    });
    (p.inhIras||[]).forEach((x,ii)=>{
      if(!x||x.enabled===false) return;
      assets.push({kind:'ira', personIdx:i, idx:ii, name:pre+((x.name&&x.name.trim())||(x.kind==='roth'?'Inherited Roth IRA':'Inherited IRA'))});
    });
  });
  return assets;
}
function inhIncomeComps(a,r){
  // Components of one asset in one row. An inherited pre-tax IRA's total withdraw this year is split into the forced part (`inhIraByPerson[..].wd`: RMD / year-10 sweep)
  // and the annual withdraw (the rest); the annual withdraw is only known per holder (rothConvByPerson − convMainByPerson), so it is shared among that holder's inherited IRAs by balance share.
    const o={rmd:0,conv:0,roth:0,odiv:0,qdiv:0,te:0,ltcg:0,reGain:0};
    if(a.kind==='re'){ const e=(r.realEstateByPerson&&r.realEstateByPerson[a.personIdx]||[])[a.idx]; o.reGain=(e&&e.sale&&e.sale.gain)||0; return o; }
    if(a.kind==='pf'){
      const e=(r.portfoliosByPerson&&r.portfoliosByPerson[a.personIdx]||[])[a.idx]; if(!e) return o;
      const odiv=(e.divUsed||0)+(e.divReinvested||0);
      o.qdiv=odiv*a.qpct; o.odiv=odiv-o.qdiv; o.te=e.taxExempt||0; o.ltcg=e.ltcg||0;
      return o;
    }
    const l=(r.inhIraByPerson&&r.inhIraByPerson[a.personIdx])||[], e=l[a.idx]; if(!e) return o;
    if(e.kind==='roth'){ o.roth=e.wd||0; return o; }
    o.rmd=e.wd||0;
    const hold=(r.rothConvByPerson?r.rothConvByPerson[a.personIdx]:0)-(r.convMainByPerson?r.convMainByPerson[a.personIdx]:0);
    if(hold>0.5){ const live=l.filter(z=>z&&z.kind==='ira'&&z.live), share=live.reduce((t,z)=>t+(z.balance||0)+(z.wd||0),0); if(share>0&&e.live) o.conv=hold*(((e.balance||0)+(e.wd||0))/share); }
    return o;
  }

function buildInhIncomeChart(){
  if(typeof Chart==='undefined'||!lastProjection) return;
  const proj=lastProjection, base=chartRowsAndLabels(proj);
  if(!base){ dropChart('inhIncome'); return; }
  const {rows,labels,ages,rowByAge}=base;
  const assets=inhIncomeAssets(proj);
  if(!assets.length){ dropChart('inhIncome'); return; }
  const comps=inhIncomeComps;
  const perRow=rows.map(r=>assets.map(a=>comps(a,r)));   // [row][asset] → components
  const kindsShown=INH_INC_KINDS.filter(K=>perRow.some(ra=>ra.some(c=>c[K.kind]>0.5)));
  if(!kindsShown.length){ dropChart('inhIncome'); return; }
  setChartAvailable('inhIncome',true);

  const sumKind=(ri,k)=>perRow[ri].reduce((t,c)=>t+c[k],0);
  const data=kindsShown.map(K=>alignToAges(ages, rows.map((r,ri)=>sumKind(ri,K.kind)), labels));
  const Y_MAX=lockedYMax('inhIncome', ()=>{ let m=0; rows.forEach((r,ri)=>{ m=Math.max(m, kindsShown.reduce((t,K)=>t+sumKind(ri,K.kind),0)); }); return niceMax(m,5000); });
  const datasets=kindsShown.map((K,ki)=>stackedBandDataset(K.title,K.color(),data[ki],'inhIncome'));
  const rowIdx={}; rows.forEach((r,ri)=>{ rowIdx[Math.round(r.age0)]=ri; });

  const tip={
    title:items=>{ const r=rowByAge[labels[items[0]?items[0].dataIndex:0]]; return r?popupPersonAgeLines(proj,r):[]; },
    label:c=>(c.raw==null||c.raw<0.5)?null:mrow('  '+c.dataset.label, fmt(c.raw)+'/yr'),
    footer:items=>{
      const idx=items[0]?items[0].dataIndex:0, ri=rowIdx[labels[idx]], out=[''];
      out.push(mrow('Total inheritance asset income', fmt(kindsShown.reduce((t,K,ki)=>t+(data[ki][idx]||0),0))+'/yr'));
      if(ri!=null){
        const per=assets.map((a,ai)=>({a, t:Object.values(perRow[ri][ai]).reduce((x,y)=>x+y,0)})).filter(z=>z.t>0.5);
        if(per.length>1) per.forEach(z=>out.push(mrow('  '+z.a.name, fmt(z.t)+'/yr')));
      }
      return out;
    }
  };
  upsertLineChart('inhIncome',{canvasId:'inhIncomeChart', labels, datasets, yMax:Y_MAX, tooltip:tip,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(tip)} },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle("Inheritance asset income (today's $)"),ticks:yAxisTicks,grid:AXIS_GRID}
      }
    })});
}
