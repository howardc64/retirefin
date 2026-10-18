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
// Threshold / reference lines (IRMAA brackets, ordinary and qualified tax brackets) are not data, so they are drawn in ink with a white halo and told apart
// by dash pattern, not by hue: they read on top of any band color, for color-blind readers too. Labels sit on small white pills.
const BRACKET_COLOR='#1B1B1B';
const BRACKET_HALO='rgba(255,255,255,.92)';
const ORD_DASH=[], QUAL_DASH=[];   // reference lines are solid now (see THIN_W below)
// Every reference line (bracket, IRMAA, deduction, effective tax rate) is a thin solid line with a thin white line of the same width stacked directly on top of it (just above it),
// so it reads over any band color. Labels sit on a small white pill that stays clear of those two lines: its bottom edge is LINE_LABEL_LIFT-6px above the line's y.
const THIN_W=1.6, LINE_LABEL_LIFT=10;
const DEDUCTION_COLOR='#D62828';   // red dashed deduction line on the taxable ordinary income chart
// §3 "show_details checkbox": when on, chart popups reveal the underlying calculation
// components (provisional income, AGI, standard deduction, etc.) called out as
// show_details-only in the chart specs (§8.3, §9.3.1, §9.4, §10). Tooltip callbacks read
// this live (not captured), so toggling it needs no chart rebuild — just re-hover.
let showDetails=false;
const IRMAA_LINE_OFF='rgba(0,0,0,0)';   // colour the "view IRMAA as tax" line fades to when off
let viewIrmaaAsTax=false;   // Total Income Tax chart: draw the IRMAA surcharge as a dashed line above the tax stack
// ── Tooltip layout (spec §5: label left-justified, data right-justified) ──
// mrow() only tags a line as "label | value" with a separator; justifyTip() then pads EVERY
// line of the popup (title, body, afterBody, footer) to one common width, so all values line
// up on the same right edge no matter which section or callback produced the line.
// This needs one monospace font at one size across title/body/footer (TIP_STYLE), and
// right-aligned title/footer so they line up with body text that Chart.js indents past the color box.
// ── Popup background: one slider (header, right of "Popup Details") from light (0) to dark (100) drives every popup, built-in and external.
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
  if(typeof chartInfo!=='undefined'&&chartInfo) return;   // Chart Element mode: chartInfo.js owns the popup
  const {chart,tooltip}=context;
  let el=document.getElementById('extTooltip');
  if(!el){
    el=document.createElement('div'); el.id='extTooltip';
    el.style.cssText='position:fixed;z-index:10000;pointer-events:none;border:1px solid;border-radius:6px;padding:6px 8px;'+
      'font:12px monospace;white-space:pre;line-height:1.35;opacity:0;';
    document.body.appendChild(el);
  }
  const th=tipTheme(); el.style.background=th.bg; el.style.color=th.fg; el.style.borderColor=th.border;
  el.style.whiteSpace='pre'; el.style.maxWidth='none';   // (Chart Element mode wraps its text)
  const GLIDE='opacity .12s, left .3s cubic-bezier(.25,1,.5,1), top .3s cubic-bezier(.25,1,.5,1)';
  if(!tooltip||tooltip.opacity===0){ el.style.transition='opacity .12s'; el.style.opacity=0; el._shown=false; return; }
  const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const line=(t,color)=>`<div style="position:relative;padding-left:14px;">${color?`<span style="position:absolute;left:0;top:.3em;width:9px;height:9px;background:${color};border:1px solid ${tipTheme().fg};box-sizing:border-box;" data-sw></span>`:''}${esc(t)}</div>`;
  let html='';
  (tooltip.title||[]).forEach(t=>{ html+=line(t); });
  (tooltip.beforeBody||[]).forEach(t=>{ html+=line(t); });
  (tooltip.body||[]).forEach((b,i)=>{
    const col=tooltip.labelColors&&tooltip.labelColors[i]?tooltip.labelColors[i].backgroundColor:null;
    (b.lines||[]).forEach((t,j)=>{ if(t!=null&&t!=='') html+=line(t, j===0?col:null); });
  });
  (tooltip.afterBody||[]).forEach(t=>{ html+=line(t); });   // (the Social Security tax chart's lines live here)
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
// Every chart panel is a third of the chart area, so all charts share the compact axis labeling: at most 7 age labels, at most 5 $ labels in $k.
const ageXAxis=text=>({type:'category',title:axisTitle(text),ticks:{...AXIS_TICKS,maxTicksLimit:7,padding:11},grid:AXIS_GRID});   // padding: room between the axis line and the tick labels for the inheritance-arrival ▲ (overlayPlugin.js)
const fmtAxisK=v=>{
  if(!v) return '$0';
  if(Math.abs(v)>=1e6){ const m=v/1e6; return '$'+(Number.isInteger(m)?m:m.toFixed(m<10?2:1).replace(/0$/,''))+'M'; }
  const k=v/1000; return '$'+(Number.isInteger(k)?k:k.toFixed(1))+'k';
};
// Every chart's left Y axis has the same fixed width (and the Total tax chart's right-hand title strip equals the right padding of the others), so every
// chart's plot area — and therefore its X axis — is exactly the same width, whatever the tick labels say.
const Y_AXIS_W=60, RIGHT_PAD=16;
const yAxisFit=scale=>{ scale.width=Y_AXIS_W; };
const yAxisTicks={...AXIS_TICKS,maxTicksLimit:5,callback:fmtAxisK};
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
const charts={ss:null, income:null, incomeMagi:null, incomeOrd:null, incomeQual:null, tss:null, tax:null, taxOrd:null, taxQual:null, expense:null, asset:null, idgt:null, ira:null, ltcg:null, inhIncome:null, inflation:null, market:null};
function allCharts(){ return Object.values(charts).filter(Boolean); }

// Y-axis maximum per chart. It is computed once and then held ("locked") so the scale doesn't
// jump while sliders move; Rescale (one chart) clears its lock so the next render re-fits it. The locked maxima are saved with the plan
// (state.ui.chartYMax, see captureChartYMax / restoreChartYMax) and come back when a file is loaded.
//
// The "Same scale" buttons above the charts are one-shot actions, not sticky links: a click sets every chart in the button's group to the group's
// largest current maximum (applySameScale). Afterwards each chart is independent again — Rescale on one chart changes only that chart.
const chartYMax=Object.fromEntries(Object.keys(charts).map(k=>[k,null]));
function lockedYMax(key, compute){ if(chartYMax[key]==null) chartYMax[key]=compute(); return chartYMax[key]; }
// Copy the locked maxima into / out of state.ui.chartYMax so they travel with the saved plan.
function captureChartYMax(){
  if(typeof mcTrialView!=='undefined' && mcTrialView) return;   // a loaded Monte Carlo trial has its own scales: never saved into the plan
  if(!state.ui) state.ui={};
  const cur=state.ui.chartYMax||{};
  let changed=false; const next={};
  Object.keys(chartYMax).forEach(k=>{ const v=chartYMax[k]!=null?chartYMax[k]:null; next[k]=v; if(cur[k]!==v) changed=true; });
  if(changed){ state.ui.chartYMax=next; if(typeof saveDebounced==='function') saveDebounced(); }
}
function restoreChartYMax(){
  const saved=(state&&state.ui&&state.ui.chartYMax)||{};
  Object.keys(chartYMax).forEach(k=>{ const v=Number(saved[k]); chartYMax[k]=(saved[k]!=null&&Number.isFinite(v)&&v>0)?v:null; });
}
// Round a maximum up to a "nice" axis end (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ) with a little headroom; `floor` is the smallest result.
function niceMax(maxV, floor){
  const v=Math.max((Number(maxV)||0)*1.05, floor||1), mag=Math.pow(10,Math.floor(Math.log10(v)));
  for(const m of [1,1.5,2,2.5,3,4,5,6,8,10]) if(m*mag>=v-1e-9) return m*mag;
  return 10*mag;
}
// Which charts each Same-scale button covers. IRA, LTCG and Inheritance asset income count as income (the income buttons). The tax button covers exactly three charts (Total tax, Ordinary income tax, QDIV / LTCG / NIIT tax); the Annual expenses chart, although it has an income-tax component, counts as income & expense only. Cumulative household SS and Social Security tax are in no group and always keep their own scale.
// They are not part of a new plan's starting common scale (DEFAULT_SAME_SCALE).
const DEFAULT_SAME_SCALE=['expense','income','incomeMagi','incomeOrd','incomeQual','tax','taxOrd','taxQual'];
const SCALE_LINK_GROUPS={
  incomeExpense:['expense','income','incomeMagi','incomeOrd','incomeQual','ira','ltcg','inhIncome'],
  tax:['tax','taxOrd','taxQual'],
  incomeExpenseTax:['expense','income','incomeMagi','incomeOrd','incomeQual','ira','ltcg','inhIncome','tax','taxOrd','taxQual'],
  asset:['asset','idgt']
};
// Set every drawn chart of a group to the group's largest current maximum. Returns true when anything changed.
function applySameScale(name){
  const g=(Array.isArray(name)?name:(SCALE_LINK_GROUPS[name]||[])).filter(k=>chartAvail[k]!==false);
  const vals=g.map(k=>chartYMax[k]).filter(v=>v!=null);
  if(!vals.length) return false;
  const m=Math.max(...vals); let changed=false;
  g.forEach(k=>{ if(chartYMax[k]!==m){ chartYMax[k]=m; changed=true; } });
  return changed;
}
// Rescale button on a chart: refit just that chart.
function rescaleChart(which){ chartYMax[which]=null; recompute(); }
// "view IRMAA as tax" checkbox: redraw on the CURRENT scale: the Y axis is never changed, the IRMAA line just slides in / out (the chart tweens it).
function toggleIrmaaAsTax(on){ viewIrmaaAsTax=!!on; recompute(); }
// A Same-scale button: one action, nothing stays switched on.
function toggleScaleLink(name){ applySameScale(name); recompute(); saveDebounced(); }

// Which tax-bracket / IRMAA reference lines to draw on a small chart. A chart with a dozen dashed lines is unreadable: lines far above the data are wasted on empty space
// and lines deep inside the stack just cut through the bands. So only the lines that matter to the data are kept:
//   • `lists` holds one entry per filing status in use: {vals, tops} — `vals` = the Y value of each line (ascending, index = bracket / tier number) and `tops` = the height of the
//     data stack in each year that filing status applies (so the lines follow the stack of the years they are drawn over).
//   • lo / hi = lowest / highest non-zero stack height. A line that falls between them crosses the data (it is where the plan crosses a bracket) and is a candidate; so are the
//     first line above hi (the next ceiling to stay under) and the last line below lo (the floor the stack has already cleared).
//   • A candidate more than `farFrac` of the Y range away from the data is dropped (empty space / buried in the stack).
//   • At most `keep` lines are drawn per chart: the ones nearest the data (ties go to the higher line); a line whose neighbours would sit closer than `gapFrac` of the Y range
//     (their labels would collide) gives way to the nearer one.
// Returns the Set of bracket indices to draw. Lines not in the set are still datasets (all-null) so the dataset count stays fixed (see the callers).
function crowdedBracketKeep(lists, yMax, keep=3, gapFrac=0.05, farFrac=0.35){
  const out=new Set();
  lists.filter(Boolean).forEach(L=>{
    const vals=Array.isArray(L)?L:L.vals, tops=(!Array.isArray(L)&&L.tops)||[];
    const pos=tops.filter(v=>v>0.5);
    const lo=pos.length?Math.min(...pos):0, hi=pos.length?Math.max(...pos):0;
    const cand=[];
    vals.forEach((v,j)=>{
      if(!(v<yMax)) return;                                    // off the chart's scale
      const d=v<lo?lo-v:(v>hi?v-hi:0);                         // distance from the data band [lo, hi]
      if(d>farFrac*yMax) return;                               // empty space above / buried in the stack below
      cand.push({j,v,d});
    });
    // Only the FIRST line above the data and the LAST line below it are eligible beyond the crossing lines (a second line above the data is just more empty space);
    // crossing lines have d=0, so sorting by distance keeps those first.
    const above=cand.filter(c=>c.v>hi&&hi>0).sort((x,y)=>x.v-y.v).slice(1), below=cand.filter(c=>c.v<lo).sort((x,y)=>y.v-x.v).slice(1);
    const drop=new Set([...above,...below]);
    for(let n=cand.length-1;n>=0;n--) if(drop.has(cand[n])) cand.splice(n,1);
    cand.sort((x,y)=>x.d-y.d||y.v-x.v);
    const kept=[];
    for(const c of cand){
      if(kept.length>=keep) break;
      if(kept.some(k=>Math.abs(k.v-c.v)<gapFrac*yMax)) continue;   // too close to a line already kept: its label would collide
      kept.push(c);
    }
    kept.forEach(c=>out.add(c.j));
  });
  return out;
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
    // The list changed length (a conditional line such as IRMAA or State tax appears or goes, e.g. when an input moves MAGI across an IRMAA tier). Replacing the
    // whole array would make Chart.js rebuild every dataset (it matches its per-dataset state by object identity) and the chart would redraw from the baseline.
    // Instead keep each existing dataset object, matched by label, and give it the new data and options: the surviving lines tween, only the new line is drawn fresh.
    const pool=new Map(); D.forEach(d=>{ if(!pool.has(d.label)) pool.set(d.label,[]); pool.get(d.label).push(d); });
    chart.data.datasets = datasets.map(nd=>{
      const q=pool.get(nd.label), od=q&&q.length?q.shift():null;
      if(!od) return nd;
      const oldData=od.data, newData=nd.data;
      if(Array.isArray(oldData) && Array.isArray(newData) && oldData.length===newData.length){ for(let j=0;j<newData.length;j++) oldData[j]=newData[j]; }
      else od.data=newData;
      for(const k in nd){ if(k!=='data') od[k]=nd[k]; }
      return od;
    });
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
  if(window.dryPass) return charts[key];   // scale-sharing pre-pass (renderCharts): only the locked maxima are wanted, nothing is drawn
  const chart=charts[key];
  if(chart){
    updateChartInPlace(chart, labels, datasets);
    chart.options.scales.y.max=yMax;
    if(refresh) refresh(chart.options);   // before the padding, which also reserves room for the stretch bar
    if(key!=='ss') chart.options.layout={...(chart.options.layout||{}), padding:{...((chart.options.layout||{}).padding||{}), top:ltcTopPad(chart)}};   // room for the LTC / stretch bar (0 when none)
    chart.options.plugins.tooltip.callbacks=justifyTip(tooltip);
    chart.update(window.liveDrag?'none':undefined);
  } else {
    const opts=createOptions();
    if(opts.scales&&opts.scales.y) opts.scales.y.afterFit=yAxisFit;
    if(opts.scales&&opts.scales.y1) opts.scales.y1.afterFit=sc=>{ sc.width=RIGHT_PAD; };
    else opts.layout={...(opts.layout||{}), padding:{...((opts.layout||{}).padding||{}), right:RIGHT_PAD}};
    if(key!=='ss'){   // every time-based chart carries the LTC bar (plugin 'ltcBar') and reserves room for it above the plot area
      opts.plugins={...(opts.plugins||{}), ltcBar:true, inhArrival:true, abGhost:true, unfundedYears:true};   // inhArrival: the small ▲ on the x-axis where an inheritance arrives (overlayPlugin.js)
      opts.layout={...(opts.layout||{}), padding:{...((opts.layout||{}).padding||{}), top:ltcTopPad({data:{labels},options:opts})}};
    }
    charts[key]=new Chart(document.getElementById(canvasId),{type:'line',data:{labels,datasets},options:opts});
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
