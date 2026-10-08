'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHART HELPERS — shared Chart.js configuration, tooltip
// layout (spec §5), the light/dark overlay toggle, the show_details
// flag (spec §3), and the in-place chart-update helper used by every
// chart so animations tween smoothly instead of resetting (spec §5).
// Per-chart color palettes live alongside each chart's own file.
// ═══════════════════════════════════════════════════════════════
// Color of every dashed reference line drawn over a chart (IRMAA tiers, ordinary-tax brackets) and of its legend swatch.
const OVERLAY_COLOR='rgba(0,0,0,.9)';
const BRACKET_COLOR='#00D100';   // bright green: IRMAA lines (MAGI chart) and ordinary bracket lines (taxable ordinary income chart)
const DEDUCTION_COLOR='#D62828';   // red dashed deduction line on the taxable ordinary income chart
// §3 "show_details checkbox": when on, chart popups reveal the underlying calculation
// components (provisional income, AGI, standard deduction, etc.) called out as
// show_details-only in the chart specs (§8.3, §9.3.1, §9.4, §10). Tooltip callbacks read
// this live (not captured), so toggling it needs no chart rebuild — just re-hover.
let showDetails=false;
let viewIrmaaAsTax=false;   // Total Income Tax chart: draw the IRMAA surcharge as a dashed line above the tax stack
// ── Tooltip layout (spec §5: label left-justified, data right-justified) ──
// mrow() only tags a line as "label | value" with a separator; justifyTip() then pads EVERY
// line of the popup (title, body, afterBody, footer) to one common width, so all values line
// up on the same right edge no matter which section or callback produced the line.
// This needs one monospace font at one size across title/body/footer (TIP_STYLE), and
// right-aligned title/footer so they line up with body text that Chart.js indents past the color box.
// ── Popup background: one slider (header, right of "Show Details in Popup") from light (0) to dark (100) drives every popup, built-in and external.
// The background is see-through (TIP_ALPHA) so the chart underneath stays visible; the text and border flip to dark on a light background.
// Remembered in localStorage ('tipBg'). Chart.js reads the scriptable colors below on every hover, so no chart rebuild is needed.
const TIP_ALPHA=0.6;
let tipBg=85;
try{ const v=parseFloat(localStorage.getItem('tipBg')); if(Number.isFinite(v)) tipBg=Math.max(0,Math.min(100,v)); }catch(e){}
function tipTheme(){
  const c=Math.round(255*(1-tipBg/100)), dark=tipBg>=50;
  return {bg:`rgba(${c},${c},${c},${TIP_ALPHA})`, fg:dark?'#fff':'#111', border:dark?'rgba(255,255,255,.35)':'rgba(0,0,0,.35)'};
}
function setTipBg(v){
  tipBg=Math.max(0,Math.min(100,Number(v)||0));
  try{ localStorage.setItem('tipBg',String(tipBg)); }catch(e){}
  const el=document.getElementById('extTooltip'), t=tipTheme();
  if(el){ el.style.background=t.bg; el.style.color=t.fg; el.style.borderColor=t.border; el.querySelectorAll('[data-sw]').forEach(s=>s.style.borderColor=t.fg); }
}
(function(){ const s=document.getElementById('tipBgSlider'); if(s) s.value=tipBg; })();
const TIP_SEP='\u0001', TIP_GAP=2;
const TIP_STYLE={
  backgroundColor:()=>tipTheme().bg, titleColor:()=>tipTheme().fg, bodyColor:()=>tipTheme().fg, footerColor:()=>tipTheme().fg,
  borderColor:()=>tipTheme().border, borderWidth:1,
  titleFont:{family:'monospace',size:12},
  bodyFont:{family:'monospace',size:12},
  footerFont:{family:'monospace',size:12},
  titleAlign:'right',
  footerAlign:'right'
};
// External (HTML) tooltip for the small companion charts. Chart.js draws its built-in tooltip INSIDE the canvas, so on a
// 1/3-width chart a wide popup (long source names, per-person lines) is clipped and its right-justified values are cut off.
// This renders the same lines (already padded by justifyTip, in one monospace font) into a floating <div> that can
// extend past the canvas edge, and flips to the left of the cursor when it would run off the window.
function externalTooltip(context){
  const {chart,tooltip}=context;
  let el=document.getElementById('extTooltip');
  if(!el){
    el=document.createElement('div'); el.id='extTooltip';
    el.style.cssText='position:fixed;z-index:10000;pointer-events:none;border:1px solid;border-radius:6px;padding:6px 8px;'+
      'font:12px monospace;white-space:pre;line-height:1.35;opacity:0;';
    document.body.appendChild(el);
  }
  const th=tipTheme(); el.style.background=th.bg; el.style.color=th.fg; el.style.borderColor=th.border;
  const GLIDE='opacity .12s, left .3s cubic-bezier(.25,1,.5,1), top .3s cubic-bezier(.25,1,.5,1)';
  if(!tooltip||tooltip.opacity===0){ el.style.transition='opacity .12s'; el.style.opacity=0; el._shown=false; return; }
  const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const line=(t,color)=>`<div style="position:relative;padding-left:14px;">${color?`<span style="position:absolute;left:0;top:.3em;width:9px;height:9px;background:${color};border:1px solid ${tipTheme().fg};box-sizing:border-box;" data-sw></span>`:''}${esc(t)}</div>`;
  let html='';
  (tooltip.title||[]).forEach(t=>{ html+=line(t); });
  (tooltip.body||[]).forEach((b,i)=>{
    const col=tooltip.labelColors&&tooltip.labelColors[i]?tooltip.labelColors[i].backgroundColor:null;
    (b.lines||[]).forEach((t,j)=>{ if(t!=null&&t!=='') html+=line(t, j===0?col:null); });
  });
  (tooltip.footer||[]).forEach(t=>{ html+=line(t); });
  el.innerHTML=html;
  const r=chart.canvas.getBoundingClientRect();
  const x=r.left+tooltip.caretX, y=r.top+tooltip.caretY;
  el.style.opacity=1;
  const w=el.offsetWidth, h=el.offsetHeight;
  let left=x+14; if(left+w>window.innerWidth-8) left=x-14-w;
  let top=y-h/2; top=Math.max(8,Math.min(top,window.innerHeight-h-8));
  // Glide to each new position like the built-in tooltip (Chart.js tweens x/y); a tooltip that was hidden
  // appears in place (no transition) and only then starts gliding.
  if(!el._shown){ el.style.transition='none'; }
  el.style.left=Math.max(8,left)+'px'; el.style.top=top+'px';
  if(!el._shown){ void el.offsetWidth; el._shown=true; }
  el.style.transition=GLIDE;
}
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
  const out={
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
  // Pass-through for the color-box callback (it draws the swatch, not a text line, so it needs no padding).
  if(cb.labelColor) out.labelColor=function(ctx){ return cb.labelColor.call(this,ctx); };
  return out;
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
  const labels=[]; for(let a=Math.round(fromAge); a<=toAge; a++) labels.push(a);   // round, not floor: every row lookup keys by Math.round(age)
  return labels;
}

// ── Chart registry ──
// One live Chart.js instance per key (null until first drawn). Every chart file reads/writes
// `charts.<key>` through upsertLineChart(); destroy/resize below walk the registry, so adding a
// chart never means editing a hand-written list of chart variables.
const charts={ss:null, income:null, incomeMagi:null, incomeOrd:null, tss:null, tax:null, taxOrd:null, taxQual:null, expense:null, asset:null, assetConv:null, idgt:null};
function allCharts(){ return Object.values(charts).filter(Boolean); }

// Y-axis maximum per chart. It is computed once and then held ("locked") so the scale doesn't
// jump while sliders move; Rescale — or loading/resetting a plan — clears it so the next render re-fits.
const chartYMax=Object.fromEntries(Object.keys(charts).map(k=>[k,null]));
function lockedYMax(key, compute){ if(chartYMax[key]==null) chartYMax[key]=compute(); return chartYMax[key]; }
function resetChartYMax(){ Object.keys(chartYMax).forEach(k=>{ chartYMax[k]=null; }); }
function rescaleChart(which){ chartYMax[which]=null; if(which==='asset') chartYMax.assetConv=null; recompute(); }

// Crowding guard for the ordinary-bracket overlays on the small charts (Taxable ordinary income, Ordinary income tax). `valueLists` holds one
// array per filing status in use (the Y value of each bracket line, ascending). A line is visible when it sits below yMax. If more than `keep`
// lines are visible and any two neighbours are closer than gapFrac of the Y range (their labels would collide), only the top `keep` visible
// brackets are drawn; otherwise every visible one is. Returns the Set of bracket indices to draw.
function crowdedBracketKeep(valueLists, yMax, keep=3, gapFrac=0.05){
  const visible=new Set(); let crowded=false;
  valueLists.filter(Boolean).forEach(vals=>{
    const vis=vals.map((v,j)=>({v,j})).filter(o=>o.v<yMax);
    vis.forEach(o=>visible.add(o.j));
    if(vis.length>keep){ for(let i=1;i<vis.length;i++){ if(vis[i].v-vis[i-1].v<gapFrac*yMax){ crowded=true; break; } } }
  });
  const idx=[...visible].sort((a,b)=>a-b);
  return new Set(crowded?idx.slice(-keep):idx);
}

// Legend swatch + label. `style` overrides the default solid-color swatch (e.g. the dashed IRMAA key).
// Dashed-line swatch (matches the dashed overlay lines on the charts).
function legendDashStyle(color){
  return `background:repeating-linear-gradient(90deg,${color} 0 5px,transparent 5px 8px);height:2px;border-radius:0`;
}
// Thin solid-line swatch (matches the thin solid overlay lines, e.g. tax-rate lines).
function legendLineStyle(color){
  return `background:${color};height:2px;border-radius:0`;
}
function legendItem(text, color, style){
  return `<span class="li"><span class="ls" style="${style||('background:'+color)}"></span>${text}</span>`;
}

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

// Draw or refresh one line chart — the create-or-update step every chart file used to repeat.
//   key             registry key in `charts`
//   canvasId        <canvas> to draw into on first creation
//   labels/datasets this render's data
//   yMax            locked Y-axis max (see lockedYMax)
//   tooltip         raw tooltip callbacks; wrapped in justifyTip() here
//   createOptions   () => full Chart.js options, used only when the chart is first created
//   refresh         optional (options) => void, applies per-render option changes to an existing chart
function upsertLineChart(key, {canvasId, labels, datasets, yMax, tooltip, createOptions, refresh}){
  const chart=charts[key];
  if(chart){
    updateChartInPlace(chart, labels, datasets);
    chart.options.scales.y.max=yMax;
    if(refresh) refresh(chart.options);
    chart.options.plugins.tooltip.callbacks=justifyTip(tooltip);
    chart.update(window.liveDrag?'none':undefined);
  } else {
    charts[key]=new Chart(document.getElementById(canvasId),{type:'line',data:{labels,datasets},options:createOptions()});
  }
  return charts[key];
}

// Re-fit every chart after a hidden section is shown again (a canvas measured at display:none has no size).
function resizeAllCharts(){
  allCharts().forEach(ch=>{ try{ ch.resize(); }catch(e){} });
}

// A file restore is a hard data boundary: destroy every Chart.js instance so no tooltip/plugin closure,
// hover state, dataset or canvas pixels from the previous plan survive into the newly loaded one.
function destroyAllCharts(){
  allCharts().forEach(ch=>{ try{ ch.destroy(); }catch(e){} });
  Object.keys(charts).forEach(k=>{ charts[k]=null; });
}
