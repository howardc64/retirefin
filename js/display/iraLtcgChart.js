'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / IRA CHART + LTCG CHART — two stacked charts of annual dollar flows (today's $), each broken down by individual source.
//
//   IRA chart   (`charts.ira`,  #iraChart)  Pre-tax IRA money that leaves each person's IRA this year, as three stacked kinds per person:
//                 Annual withdraw  (row.rothConvByPerson — the withdraw on top of the RMD; it moves into the Roth IRA when the card's "Withdraw is Roth conversion" box is ticked),
//                 RMD              (row.iraByPerson — the required minimum distribution), and
//                 expense withdraw (row.iraExpByPerson — drawn to pay a shortfall in household expenses).
//               All three are taxed as ordinary income. Married: one band per person per kind (the person's name is in the band's label).
//   LTCG chart  (`charts.ltcg`, #ltcgChart) Long-term capital gain realized this year, one band per brokerage portfolio (row.portfoliosByPerson[i][j].ltcg, the exact
//                 pre-SCGL gain) plus one band for property sold (row.reSaleGain). A dashed line shows the net gain taxed when the SCGL carryforward is used.
//
// Both are read-only views of projection rows (nothing is recomputed here), have their own Y scale (in no Same-scale group), and show no panel
// when there is nothing to draw (setChartAvailable) — no pre-tax IRA, or no portfolio / property that could be sold.
// ═══════════════════════════════════════════════════════════════
const IRA_KIND_ORDER=[   // bottom → top of the stack
  {kind:'conv', field:'rothConvByPerson', title:'Annual withdraw',    color:()=>VZ.iraW},
  {kind:'rmd',  field:'iraByPerson',      title:'RMD',                color:()=>VZ.rmd},
  {kind:'wd',   field:'iraExpByPerson',   title:'Pre-tax IRA withdraw (for expenses)', color:()=>VZ.iraExp}
];
// Second person's bands are the same hue, lightened, so each kind keeps its color and the two people stay distinguishable.
function iraPersonColor(base, personIdx){
  if(!personIdx) return base;
  const n=parseInt(base.slice(1),16), mix=v=>Math.round(0.55*v+0.45*255);
  return '#'+[(n>>16)&255,(n>>8)&255,n&255].map(v=>mix(v).toString(16).padStart(2,'0')).join('');
}

function chartRowsAndLabels(proj){
  const rows=proj.rows; if(!rows.length) return null;
  const labels=ageLabelRange(rows[0].age0, chartMaxAge(proj));
  const ages=rows.map(r=>r.age0);
  const rowByAge={}; rows.forEach(r=>{ rowByAge[Math.round(r.age0)]=r; });
  return {rows, labels, ages, rowByAge};
}
function dropChart(key){
  if(charts[key]){ try{ charts[key].destroy(); }catch(e){} charts[key]=null; }
  setChartAvailable(key,false);
}
function stackedBandDataset(label,color,data,stack){
  return {label, data, borderColor:color, backgroundColor:hexOverWhite(color,0xbb/255), borderWidth:2, pointRadius:0, pointHoverRadius:0, pointHitRadius:12,
    tension:0.25, fill:true, spanGaps:false, stack, order:2};
}

// ── IRA chart ──
function buildIraChart(){
  if(typeof Chart==='undefined'||!lastProjection) return;
  const proj=lastProjection, base=chartRowsAndLabels(proj);
  if(!base){ dropChart('ira'); return; }
  const {rows,labels,ages,rowByAge}=base;

  // One band per person per kind, kept for every person whose pre-tax IRA is on (or that has money to show: e.g. an IRA inherited from the spouse).
  const bands=[];   // [{personIdx, kind, label, color, field}]
  IRA_KIND_ORDER.forEach(K=>{
    proj.people.forEach((p,i)=>{
      const any=rows.some(r=>(((r[K.field]||[])[i])||0)>0.5);
      if(!((p.ira&&p.ira.enabled)||any)) return;
      bands.push({personIdx:i, kind:K.kind, field:K.field, color:iraPersonColor(K.color(),i),
        label:(proj.married?displayPersonName(p,i)+' \u2014 ':'')+K.title});
    });
  });
  if(!bands.length){ dropChart('ira'); return; }
  setChartAvailable('ira',true);

  const data=bands.map(b=>alignToAges(ages, rows.map(r=>((r[b.field]||[])[b.personIdx])||0), labels));
  const Y_MAX=lockedYMax('ira', ()=>{ let m=0; rows.forEach(r=>{ m=Math.max(m, bands.reduce((t,b)=>t+(((r[b.field]||[])[b.personIdx])||0),0)); }); return niceMax(m,5000); });
  const datasets=bands.map((b,bi)=>stackedBandDataset(b.label,b.color,data[bi],'ira'));

  const tip={
    title:items=>{ const r=rowByAge[labels[items[0]?items[0].dataIndex:0]]; return r?popupPersonAgeLines(proj,r):[]; },
    label:c=>(c.raw==null||c.raw<0.5)?null:mrow('  '+c.dataset.label, fmt(c.raw)+'/yr'),
    footer:items=>{
      const idx=items[0]?items[0].dataIndex:0, out=[''];
      IRA_KIND_ORDER.forEach(K=>{
        const t=bands.reduce((a,b,bi)=>a+((b.kind===K.kind&&data[bi][idx])||0),0);
        if(t>0.5) out.push(mrow('Total '+K.title, fmt(t)+'/yr'));
      });
      out.push(mrow('Total out of pre-tax IRAs', fmt(bands.reduce((a,b,bi)=>a+(data[bi][idx]||0),0))+'/yr'));
      return out;
    }
  };
  upsertLineChart('ira',{canvasId:'iraChart', labels, datasets, yMax:Y_MAX, tooltip:tip,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(tip)} },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle("IRA RMD & withdraw (today's $)"),ticks:yAxisTicks,grid:AXIS_GRID}
      }
    })});
}

// ── LTCG chart ──
function buildLtcgChart(){
  if(typeof Chart==='undefined'||!lastProjection) return;
  const proj=lastProjection, base=chartRowsAndLabels(proj);
  if(!base){ dropChart('ltcg'); return; }
  const {rows,labels,ages,rowByAge}=base;

  // One band per enabled brokerage portfolio (IDGT portfolios too: they realize gains on the swap), then one for property sold.
  const series=[];   // [{type:'portfolio'|'realestate', personIdx, bi, name}]
  proj.people.forEach((p,i)=>{
    (p.brokerage||[]).forEach((b,bi)=>{
      if(!b||b.enabled===false) return;
      const nm=(b.name&&b.name.trim())||('Portfolio '+(bi+1));
      series.push({type:'portfolio', personIdx:i, bi, name:(proj.married?displayPersonName(p,i)+' \u2014 ':'')+nm+(b.idgt?' (IDGT)':'')});
    });
  });
  const hasRe=proj.people.some(p=>(p.realEstate||[]).some(r=>r&&r.enabled!==false&&Number(r.balance)>0));
  if(hasRe) series.push({type:'realestate', personIdx:0, name:'Real estate sale'});
  if(!series.length){ dropChart('ltcg'); return; }
  setChartAvailable('ltcg',true);

  const colors=assetSeriesColors(series);   // the asset chart's hue family per person; property in the amber family
  const valueOf=(s,r)=>{
    if(s.type==='realestate') return r.reSaleGain||0;
    const e=(r.portfoliosByPerson&&r.portfoliosByPerson[s.personIdx]||[])[s.bi];
    return e?(e.ltcg||0):0;
  };
  const data=series.map(s=>alignToAges(ages, rows.map(r=>valueOf(s,r)), labels));
  const scglUsed=rows.some(r=>(r.scglUsed||0)>0.5);
  const gross=idx=>series.reduce((t,s,si)=>t+(data[si][idx]||0),0);
  const Y_MAX=lockedYMax('ltcg', ()=>{ let m=0; rows.forEach(r=>{ m=Math.max(m, series.reduce((t,s)=>t+valueOf(s,r),0)); }); return niceMax(m,5000); });

  const datasets=series.map((s,si)=>stackedBandDataset(s.name,colors[si],data[si],'ltcg'));
  if(scglUsed){
    const net=alignToAges(ages, rows.map(r=>r.ltcg||0), labels);
    datasets.push({label:'Net LTCG taxed (after SCGL)', data:net, borderColor:'#c0392b', backgroundColor:'transparent', borderWidth:3, borderDash:[7,4],
      pointRadius:0, pointHoverRadius:0, pointHitRadius:12, tension:0.25, fill:false, spanGaps:false, stack:'net', order:1});
  }

  const tip={
    title:items=>{ const r=rowByAge[labels[items[0]?items[0].dataIndex:0]]; return r?popupPersonAgeLines(proj,r):[]; },
    label:c=>(c.raw==null||c.raw<0.5)?null:mrow('  '+c.dataset.label, fmt(c.raw)+'/yr'),
    footer:items=>{
      const idx=items[0]?items[0].dataIndex:0, r=rowByAge[labels[idx]], out=[''];
      out.push(mrow('Total LTCG realized', fmt(gross(idx))+'/yr'));
      if(r&&(r.scglUsed||0)>0.5) out.push(mrow('  SCGL used', '\u2212'+fmt(r.scglUsed)+'/yr'), mrow('  Net LTCG taxed', fmt(r.ltcg||0)+'/yr'));
      return out;
    }
  };
  upsertLineChart('ltcg',{canvasId:'ltcgChart', labels, datasets, yMax:Y_MAX, tooltip:tip,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(tip)} },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle("Realized LTCG (today's $)"),ticks:yAxisTicks,grid:AXIS_GRID}
      }
    })});
}
