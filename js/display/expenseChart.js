'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / HOUSEHOLD EXPENSES CHART — stacked expense components
// (living, income tax, IRMAA surcharge, AUM fee), same style as the
// Total Income Tax chart. Reads projection rows only (§4.6 row schema:
// expLiving, expTax, expIrmaa, expAum, expTotal + the funding split).
// ═══════════════════════════════════════════════════════════════
const VZ_EXP = { living:'#3F7CAC', tax:'#C8600A', irmaa:'#D9A21B', aum:'#7B3FBE', ltc:'#B5384B' };
// Bottom → top stack order.
const EXP_KEYS=['expLiving','expLtc','expTax','expIrmaa','expAum'];
const EXP_LABELS={expLiving:'Living expenses', expLtc:'Long Term Care', expTax:'Income tax (tax drag)', expIrmaa:'IRMAA surcharge', expAum:'AUM fee'};
const EXP_COLORS={expLiving:VZ_EXP.living, expLtc:VZ_EXP.ltc, expTax:VZ_EXP.tax, expIrmaa:VZ_EXP.irmaa, expAum:VZ_EXP.aum};
function buildExpenseLegend(){
  document.getElementById('expenseLegend').innerHTML =
    EXP_KEYS.map(k=>legendItem(EXP_LABELS[k], EXP_COLORS[k])).join('');
}
function buildExpenseChart(){
  if(typeof Chart==='undefined'||!lastProjection) return;
  const proj=lastProjection, rows=proj.rows;
  if(!rows.length){ return; }
  const labels=ageLabelRange(rows[0].age0,chartMaxAge(proj));
  const ages=rows.map(r=>r.age0);
  const aligned={};
  EXP_KEYS.forEach(k=>{ aligned[k]=alignToAges(ages,rows.map(r=>r[k]||0),labels); });

  const Y_MAX=lockedYMax('expense', ()=>{
    let maxV=0;
    for(let i=0;i<labels.length;i++){
      let t=0; EXP_KEYS.forEach(k=>t+=aligned[k][i]||0);
      maxV=Math.max(maxV,t);
    }
    return Math.ceil(Math.max(maxV,1)/5000)*5000+10000;
  });

  const rowByAge={}; rows.forEach(r=>rowByAge[Math.round(r.age0)]=r);

  const datasets=EXP_KEYS.map(k=>({
    label:EXP_LABELS[k], data:aligned[k],
    borderColor:EXP_COLORS[k], backgroundColor:EXP_COLORS[k]+'cc',
    borderWidth:2, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'exp', order:2
  }));

  // Built fresh every call so it doesn't close over a stale rowByAge/labels from an earlier render.
  const tooltipCallbacks={
    title:i=>{ const idx=i[0]?i[0].dataIndex:0; const r=rowByAge[labels[idx]]; return r?popupPersonAgeLines(proj,r):[]; },
    label:ctx=>{
      if(ctx.raw==null||ctx.raw===0) return null;
      const r=rowByAge[labels[ctx.dataIndex]];
      const pct=(r&&r.expTotal>0) ? ' ('+(ctx.raw/r.expTotal*100).toFixed(0)+'%)' : '';
      return mrow('  '+ctx.dataset.label, fmt(ctx.raw)+'/yr'+pct);
    },
    footer:items=>{
      const idx=items[0]?items[0].dataIndex:0;
      const r=rowByAge[labels[idx]]; if(!r) return[];
      const lines=['', mrow('Total expenses', fmt(r.expTotal)+'/yr')];
      // How the year's expenses were funded: household income → dividends → asset sales.
      lines.push(mrow('  paid by household income', fmt(r.expFromIncome)+'/yr'));
      lines.push(mrow('  paid by dividends', fmt(r.expFromDiv)+'/yr'));
      lines.push(mrow('  paid by asset sales', fmt(r.expFromSales)+'/yr'));
      if(r.expUnfunded>1) lines.push(mrow('  unfunded shortfall', fmt(r.expUnfunded)+'/yr'));
      if(r.excessReinvested>1) lines.push(mrow('Excess income reinvested', fmt(r.excessReinvested)+'/yr'));
      if(showDetails){
        lines.push(mrow('Filing status', r.filing==='married'?'Married filing jointly':'Single'));
        lines.push(mrow('Household cash income', fmt(r.cashIncome)+'/yr'));
        lines.push(mrow('AGI', fmt(r.agi)+'/yr'));
        if(r.aumBalance>0) lines.push(mrow('AUM balance (fee charged on)', fmt(r.aumBalance)));
        if(r.expIrmaa>0) lines.push(mrow('IRMAA basis: AGI tier from 2 years earlier', fmt(r.irmaaSurcharge)+'/yr'));
        lines.push(mrow('Tax↔LTCG iterations', String(r.taxIters)+(r.taxConverged?'':' (not converged)')));
      }
      return lines;
    }
  };

  upsertLineChart('expense',{canvasId:'expenseChart', labels, datasets, yMax:Y_MAX, tooltip:tooltipCallbacks,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{...TIP_STYLE,callbacks:justifyTip(tooltipCallbacks)}
      },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle("Annual expenses (today's $)"),ticks:{...AXIS_TICKS,callback:v=>'$'+Math.round(v).toLocaleString()},grid:AXIS_GRID}
      }
    })});
  buildExpenseLegend();
}
