'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHART HELPERS — shared Chart.js configuration, tooltip
// layout (spec §5), the light/dark overlay toggle, the show_details
// flag (spec §3), and the in-place chart-update helper used by every
// chart so animations tween smoothly instead of resetting (spec §5).
// Per-chart color palettes live alongside each chart's own file.
// ═══════════════════════════════════════════════════════════════
let overlayMode='light'; // default: lighter, per spec
// §3 "show_details checkbox": when on, chart popups reveal the underlying calculation
// components (provisional income, AGI, standard deduction, etc.) called out as
// show_details-only in the chart specs (§8.3, §9.3.1, §9.4, §10). Tooltip callbacks read
// this live (not captured), so toggling it needs no chart rebuild — just re-hover.
let showDetails=false;
function OV(){
  if(overlayMode==='light') return {
    irmaa:['rgba(255,200,80,.95)','rgba(255,140,40,.95)','rgba(255,80,60,.95)','rgba(240,40,100,.95)','rgba(200,20,80,.95)'],
    taxBrk:'rgba(200,160,255,.95)', taxLbl:'rgba(190,140,255,.95)',
    qualBrk:'rgba(80,240,200,.95)', qualLbl:'rgba(60,220,180,.95)',
    taxBrkSgl:'rgba(255,200,130,.95)', qualBrkSgl:'rgba(100,255,220,.95)'
  };
  return {
    irmaa:['rgba(180,100,20,.80)','rgba(180,60,20,.80)','rgba(160,30,30,.80)','rgba(130,20,50,.80)','rgba(120,20,60,.80)'],
    taxBrk:'rgba(100,70,180,.70)', taxLbl:'rgba(90,55,170,.85)',
    qualBrk:'rgba(123,63,190,.80)', qualLbl:'rgba(123,63,190,.90)',
    taxBrkSgl:'rgba(184,132,116,.80)', qualBrkSgl:'rgba(26,158,143,.80)'
  };
}
function toggleOverlayMode(){
  overlayMode = overlayMode==='light'?'dark':'light';
  const lbl=document.getElementById('overlayModeLabel'); if(lbl) lbl.textContent = overlayMode==='light'?'Light':'Dark';
  buildIncomeLegend(); buildTaxLegend();
  if(incomeChart) incomeChart.update();
  if(taxChart) taxChart.update();
}
// ── Tooltip layout (spec §5: label left-justified, data right-justified) ──
// mrow() only tags a line as "label | value" with a separator; justifyTip() then pads EVERY
// line of the popup (title, body, afterBody, footer) to one common width, so all values line
// up on the same right edge no matter which section or callback produced the line.
// This needs one monospace font at one size across title/body/footer (TIP_STYLE), and
// right-aligned title/footer so they line up with body text that Chart.js indents past the color box.
const TIP_SEP='\u0001', TIP_GAP=2;
const TIP_STYLE={
  titleFont:{family:'monospace',size:12},
  bodyFont:{family:'monospace',size:12},
  footerFont:{family:'monospace',size:12},
  titleAlign:'right',
  footerAlign:'right'
};
function mrow(label,value){ return label+TIP_SEP+value; }
function tipLines(x){ return x==null?[]:(Array.isArray(x)?x:[x]); }
function tipLen(l){ const i=l.indexOf(TIP_SEP); return i<0?l.length:i+TIP_GAP+(l.length-i-1); }
function tipPad(l,W){
  if(!l) return l;
  const i=l.indexOf(TIP_SEP);
  if(i<0) return l+' '.repeat(Math.max(0,W-l.length));
  const a=l.slice(0,i), b=l.slice(i+1);
  return a+' '.repeat(Math.max(TIP_GAP,W-a.length-b.length))+b;
}
function justifyTip(cb){
  let W=0;
  const call=(fn,self,arg)=>fn?fn.call(self,arg):null;
  const pad=r=>r==null?r:tipLines(r).map(l=>tipPad(l,W));
  return {
    // Chart.js builds the title first, so measure the whole popup here.
    title(items){
      const all=[...tipLines(call(cb.title,this,items))];
      (items||[]).forEach(it=>all.push(...tipLines(call(cb.label,this,it))));
      all.push(...tipLines(call(cb.afterBody,this,items)),...tipLines(call(cb.footer,this,items)));
      W=all.reduce((m,l)=>Math.max(m,tipLen(l||'')),0);
      return pad(call(cb.title,this,items));
    },
    label(ctx){ return pad(call(cb.label,this,ctx)); },
    afterBody(items){ return pad(call(cb.afterBody,this,items)); },
    footer(items){ return pad(call(cb.footer,this,items)); }
  };
}

// ── Shared Chart.js configuration (used by all five charts) ──
const AXIS_COLOR='#a09d98', AXIS_GRID={color:'rgba(0,0,0,0.05)'};
const AXIS_TICKS={color:AXIS_COLOR,font:{size:10}};
const axisTitle=text=>({display:true,text,font:{size:11},color:AXIS_COLOR});
const ageXAxis=text=>({type:'category',title:axisTitle(text),ticks:{...AXIS_TICKS,maxTicksLimit:20},grid:AXIS_GRID});
const CHART_BASE={
  responsive:true,maintainAspectRatio:true,aspectRatio:1,
  animation:{duration:450,easing:'easeOutQuart'},
  transitions:{resize:{animation:{duration:0}},active:{animation:{duration:150}}}
};
function popupPersonAgeLines(proj,r){
  const n=proj.married?2:1;
  return Array.from({length:n},(_,i)=>{
    const name=displayPersonName(proj.people[i],i);
    const age=(r.alive&&r.alive[i]&&r.ages&&Number.isFinite(r.ages[i])) ? r.ages[i].toFixed(1) : null;
    return mrow(name, age!==null ? 'Age '+age+' · Living' : 'Passed');
  });
}
// Align a series of {age,value} points onto an integer-age label axis (nulls where no data)
function alignToAges(ages, values, labels){
  const map={};
  ages.forEach((a,i)=>{ const r=Math.round(a); if(!(r in map)) map[r]=values[i]; });
  return labels.map(l=> (l in map)? map[l] : null);
}
// Shared X-axis end for every age-axis chart (spec §6.2): P0's age on the day the younger
// person turns 100. Depends only on current ages, so the scale stays locked as sliders move.
function chartMaxAge(proj){
  const r0=proj&&proj.rows&&proj.rows[0];
  const ages=r0&&r0.ages?r0.ages.filter(Number.isFinite):[];
  return ages.length&&Number.isFinite(r0.age0) ? Math.ceil(r0.age0+100-Math.min(...ages)) : 100;
}
function ageLabelRange(fromAge,toAge){
  const labels=[]; for(let a=Math.floor(fromAge); a<=toAge; a++) labels.push(a);
  return labels;
}

// Manual rescale: clears the "locked" chart max so the next recompute re-fits it.
const chartYMax={ss:null, income:null, tss:null, tax:null, asset:null, idgt:null};
function rescaleChart(which){ chartYMax[which]=null; recompute(); }

// Update an existing Chart.js chart's labels/datasets by mutating the same
// array/object references in place, rather than assigning brand-new arrays.
// Chart.js tracks each point's previous pixel position keyed off these
// references; swapping in fresh arrays every update makes it treat every
// point as newly-inserted and animate it up from the zero baseline instead
// of tweening from its prior position. Mutating in place keeps that identity
// stable so updates animate smoothly from where the line currently is.
function updateChartInPlace(chart, labels, datasets){
  // keep the x-axis title in sync when a name is edited
  const xt=chart.options.scales&&chart.options.scales.x&&chart.options.scales.x.title;
  if(xt&&lastProjection) xt.text=ageAxisLabel(lastProjection);
  const L = chart.data.labels;
  if(Array.isArray(L) && L.length===labels.length){
    for(let i=0;i<labels.length;i++) L[i]=labels[i];
  } else {
    chart.data.labels = labels.slice();
  }
  const D = chart.data.datasets;
  if(D.length===datasets.length){
    for(let i=0;i<datasets.length;i++){
      const oldDs=D[i], newDs=datasets[i];
      const oldData=oldDs.data, newData=newDs.data;
      if(Array.isArray(oldData) && Array.isArray(newData) && oldData.length===newData.length){
        for(let j=0;j<newData.length;j++) oldData[j]=newData[j];
      } else {
        oldDs.data = newData;
      }
      for(const k in newDs){ if(k!=='data') oldDs[k]=newDs[k]; }
    }
  } else {
    chart.data.datasets = datasets;
  }
}
