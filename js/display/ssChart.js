'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / SS BREAKEVEN CHART — Social Security start-age
// comparison chart and its metrics table (spec §6.2).
// ═══════════════════════════════════════════════════════════════
const VZ_SS_AGES=[62,64,66,68,70];
const VZ_SS_COLORS={62:'#E24B4A',63:'#D95A31',64:'#D06A18',65:'#C2820C',66:'#B59A00',67:'#729C2D',68:'#2E9E5A',69:'#1E8658',70:'#0F6E56'};
function renderSSControls(){
  const married=state.filingStatus==='married';
  const idxP0=married?olderPersonIndex():0;
  const otherIdx=married?1-idxP0:null;
  document.getElementById('ssSecSub').textContent = married
    ? `Set each person's claiming age in their Social Security input card at left. The comparison chart varies ${escHtml(state.people[idxP0].name)}'s age across the plotted scenarios and holds ${escHtml(state.people[otherIdx].name)} at the selected age.`
    : `Shows how your household's lifetime Social Security changes depending on the age you start claiming — set the claiming age in the Social Security input card at left.`;
}
function buildSSSection(){
  if(typeof Chart==='undefined') return;
  const married=state.filingStatus==='married';
  const idxP0=married?olderPersonIndex():0;
  const p0=state.people[idxP0];
  if(!p0.ss.enabled){
    document.getElementById('ssMetrics').innerHTML=`<div class="metric"><div class="metric-label">Social Security</div><div class="metric-value" style="font-size:14px">Not enabled</div><div class="metric-sub">Enable it for ${escHtml(p0.name)} above to see this analysis.</div></div>`;
    document.getElementById('ssLegend').innerHTML='';
    return;
  }
  const p0Age=currentAge(p0);
  const fixedCandidates=VZ_SS_AGES.filter(a=>a>=Math.floor(p0Age));
  const singleMode = p0.ss.started || fixedCandidates.length===0;
  const selectedAge = Math.round(p0.ss.started ? p0Age : p0.ss.claimAge);

  // Legend/table list: de-duplicated candidate ages (no duplicate row when
  // the slider happens to land on a standard mark).
  const candidates = singleMode ? [selectedAge]
    : (fixedCandidates.includes(selectedAge) ? fixedCandidates : [...fixedCandidates, selectedAge].sort((a,b)=>a-b));
  const scenarios=candidates.map(a=>({age:a, ...computeSSScenario(a)}));
  const baseline=scenarios[0];

  // Chart lines: always the same COUNT (5 standard ages + 1 line for whatever
  // age the slider is currently on, even if it duplicates a standard age and
  // just overlaps it) so the chart responds to the slider on every drag. A
  // changing dataset count is what makes updateChartInPlace fall back to a
  // full rebuild, which re-triggers the built-in animation from Y=0 — a fixed
  // count keeps every update smooth and in-place. Per spec §6.2, the line for
  // the slider's current (P0's actual start) age is drawn dashed so it reads
  // as distinct from the solid alternative-claiming-age comparison lines.
  const chartScenarios = singleMode ? scenarios : [
    ...fixedCandidates.map(a=>({age:a, ...computeSSScenario(a)})),
    {age:selectedAge, ...computeSSScenario(selectedAge)}
  ];
  // Real annual ROI vs. the earliest claiming age shown, per §6.2 — attached
  // to each scenario so the tooltip can display it per hovered line.
  chartScenarios.forEach(sc=>{ sc.roi = sc===baseline ? null : ssROI(sc.perYear, baseline.perYear); });

  const xMax=chartMaxAge(lastProjection), labels=ageLabelRange(p0Age,xMax);
  const datasets=chartScenarios.map(sc=>{
    const isStartAge=sc.age===selectedAge;
    return {
      label:'Age '+sc.age+(isStartAge?' (selected start age)':''),
      data:alignToAges(sc.ages, sc.cumulative, labels),
      borderColor:VZ_SS_COLORS[sc.age]||'#0F6E56',
      borderWidth:isStartAge?3:(sc.age===70?3:2),
      borderDash:isStartAge?[7,5]:[],
      pointRadius:0, pointHoverRadius:0, pointHitRadius:8, tension:0.25, fill:false, spanGaps:false,
      vzScenario:sc
    };
  });
  const Y_MAX=lockedYMax('ss', ()=>{
    const maxV=Math.max(1,...scenarios.map(s=>s.totalHousehold));
    return Math.ceil(maxV/50000)*50000+50000;
  });
  // Tooltip per §6.2: for each hovered claiming-age line, show that person's
  // (and spouse's, if married) monthly SS at that age, the cumulative
  // household total to date, and the real annual ROI vs. the earliest
  // claiming age shown. Built fresh every call (rather than only on first
  // creation) so it never closes over a stale scenario/labels set from an
  // earlier render after a slider change.
  // The age lines (title) and the SS amount lines (per person + household total, body) share one
  // LEFT-aligned value column: every label is padded to the same width, so each value starts in the
  // same character column (unlike mrow(), which right-justifies values on a common right edge).
  const ssLW=(()=>{
    const n=lastProjection&&lastProjection.married?2:1;
    const names=Array.from({length:n},(_,i)=>displayPersonName(lastProjection.people[i],i));
    return 2+Math.max(...names.map(nm=>4+nm.length), 4+'Total household SS'.length);
  })();
  const lrow=(label,value)=>label.padEnd(ssLW)+value;
  const ssTooltipCallbacks={
    title:items=>{
      const age=Number(items[0]?.label);
      const r=lastProjection?.rows?.find(x=>Math.round(x.age0)===age);
      const n=lastProjection.married?2:1;
      const ageLines=r?Array.from({length:n},(_,i)=>{
        const nm=displayPersonName(lastProjection.people[i],i);
        const a=(r.alive&&r.alive[i]&&Number.isFinite(r.ages[i]))?r.ages[i].toFixed(1):null;
        return lrow(nm, a!==null?'Age '+a+' · Living':'Passed');
      }):[];
      return [`Age ${age}`, ...ageLines];
    },
    label:ctx=>{
      if(ctx.raw==null) return null;
      const sc=ctx.dataset.vzScenario;
      const row=sc.ssByAge[ctx.label];
      if(!row) return [];

      const lines=[mrow('  '+ctx.dataset.label,fmt(ctx.raw))];
      const monthlyTotal=row.reduce((sum,v)=>sum+(Number(v)||0),0);
      if(sc.married){
        lines.push(lrow('    '+sc.peopleNames[sc.idxP0],fmtM(row[sc.idxP0])));
        lines.push(lrow('    '+sc.peopleNames[1-sc.idxP0],fmtM(row[1-sc.idxP0])));
      } else {
        lines.push(lrow('    '+sc.peopleNames[sc.idxP0],fmtM(row[sc.idxP0])));
      }
      lines.push(lrow('    Total household SS',fmtM(monthlyTotal)));
      return lines;
    }
  };
  upsertLineChart('ss',{canvasId:'ssChart', labels, datasets, yMax:Y_MAX, tooltip:ssTooltipCallbacks,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'nearest',intersect:true},
      plugins:{legend:{display:false},tooltip:{enabled:true,...TIP_STYLE,filter:(item,index)=>index===0,callbacks:justifyTip(ssTooltipCallbacks)}},
      scales:{
        x:ageXAxis(ageAxisLabel(lastProjection)),
        y:{min:0,max:Y_MAX,title:axisTitle("Cumulative household SS (today's $)"),ticks:{...AXIS_TICKS,callback:v=>'$'+Math.round(v/1000)+'k'},grid:AXIS_GRID}
      }
    })});
  document.getElementById('ssLegend').innerHTML=scenarios.map(sc=>{
    const isStartAge=sc.age===selectedAge;
    const color=VZ_SS_COLORS[sc.age]||'#0F6E56';
    const swatchStyle=isStartAge
      ? `background:repeating-linear-gradient(to right,${color} 0 4px,transparent 4px 7px);height:3px`
      : `background:${color};height:${sc.age===70?4:2}px`;
    return legendItem(`Age ${sc.age}${isStartAge?' — selected start age':sc.age===62?' (earliest)':sc.age===70?' (max)':''}`, null, swatchStyle);
  }).join('');

  // metrics
  const best=scenarios.reduce((b,s)=>s.totalHousehold>b.totalHousehold?s:b, scenarios[0]);
  const worst=scenarios.reduce((w,s)=>s.totalHousehold<w.totalHousehold?s:w, scenarios[0]);
  document.getElementById('ssMetrics').innerHTML = `
    <div class="metric"><div class="metric-label">${escHtml(p0.name)}'s PIA at FRA</div><div class="metric-value">${fmtM(p0.ss.pia)}</div><div class="metric-sub">FRA ${p0.ss.fra.toFixed(1)}</div></div>
    <div class="metric metric-hl"><div class="metric-label">Best lifetime total</div><div class="metric-value">Age ${best.age}</div><div class="metric-sub">${fmt(best.totalHousehold)} household SS</div></div>
    <div class="metric"><div class="metric-label">Best vs. earliest shown</div><div class="metric-value">${best.totalHousehold-worst.totalHousehold>=0?'+':''}${fmt(best.totalHousehold-worst.totalHousehold)}</div><div class="metric-sub">Age ${best.age} vs. age ${worst.age}</div></div>`;
}
