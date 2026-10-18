'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / INFLATION CHART — the inflation rate the projection uses in each year (%): the plan's constant rate (dashed), and, while a Monte Carlo trial is
// loaded into the charts (display/mcPanel.js, "Study one trial") with Random inflation on, that trial's own yearly rate. The popup also gives the price level
// relative to the plan's rate (1.15 = prices 15% above what the constant rate would have given). Read-only; own Y scale, in no Same-scale group.
// ═══════════════════════════════════════════════════════════════
function buildInflationChart(){
  if(typeof Chart==='undefined'||!lastProjection) return;
  const proj=lastProjection, rows=proj.rows;
  if(!rows.length) return;
  const tv=(typeof mcTrialView!=='undefined')?mcTrialView:null, trial=tv?tv.cap:null, infl=trial&&trial.infl?trial.infl:null, showTrial=!!infl&&tv.view!=='A';   // the axis always covers both A and B
  const plan=((trial&&trial.meanInfl!=null)?trial.meanInfl:state.inflation)*100;

  const labels=ageLabelRange(rows[0].age0,chartMaxAge(proj));
  const ages=rows.map(r=>r.age0);
  const planLine=alignToAges(ages, rows.map(()=>plan), labels);
  const trialAll=infl?alignToAges(ages, rows.map((r,k)=>infl.pi[k]*100), labels):null;
  const trialLine=trialAll?(showTrial?trialAll:trialAll.map(()=>null)):null;   // on A the line stays (empty) so the datasets do not change
  const vals=[plan].concat(trialAll?trialAll.filter(v=>v!=null):[]);
  const lo=Math.min(0,Math.floor(Math.min(...vals)*2)/2);
  const fitY=()=>Math.max(1,Math.ceil(Math.max(...vals)*1.15*2)/2);
  const Y_MAX=tv?lockedYMax('inflation',fitY):fitY();   // derived from the rates themselves (not held between renders), except while a trial is loaded: then fixed across A and B

  const datasets=[
    {label:'Plan inflation rate', data:planLine, borderColor:'#6b7280', backgroundColor:'transparent', borderWidth:THIN_W, borderDash:[6,4],
      pointRadius:0, pointHoverRadius:0, pointHitRadius:12, tension:0, fill:false, spanGaps:false, yAxisID:'y'}
  ];
  if(trialLine) datasets.push({label:(tv&&tv.view==='D'?'Stress test inflation rate':'Monte Carlo trial inflation rate'), data:trialLine, borderColor:'#b45309', backgroundColor:'transparent', borderWidth:THIN_W,
      pointRadius:0, pointHoverRadius:0, pointHitRadius:12, tension:0.15, fill:false, spanGaps:false, yAxisID:'y'});

  const tip={
    title:items=>{ const idx=items[0]?.dataIndex, r=idx==null?null:rows.find(x=>Math.round(x.age0)===labels[idx]); return r?popupPersonAgeLines(proj,r):[]; },
    label:()=>null,
    afterBody:items=>{
      const idx=items[0]?.dataIndex; if(idx==null) return [];
      const k=rows.findIndex(x=>Math.round(x.age0)===labels[idx]); if(k<0) return [];
      const out=[mrow('  Plan inflation rate', plan.toFixed(2)+'%')];
      if(showTrial){
        out.push(mrow('  Trial inflation rate', (infl.pi[k]*100).toFixed(2)+'%'));
        out.push(mrow('  Price level vs plan', (infl.cpi[k]/Math.pow(1+plan/100,k)).toFixed(2)+'×'));
      }
      return out;
    }
  };
  upsertLineChart('inflation',{canvasId:'inflationChart', labels, datasets, yMax:Y_MAX, tooltip:tip,
    refresh:o=>{ o.scales.y.min=lo; },
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,mode:'index',intersect:false,callbacks:justifyTip(tip)} },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{min:lo,max:Y_MAX,position:'left',title:axisTitle('Inflation rate (% per year)'),ticks:{...yAxisTicks,callback:v=>(Math.round(v*10)/10)+'%'},grid:AXIS_GRID}
      }
    })});
}
