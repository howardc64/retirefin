'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / OVERLAY PLUGIN — Chart.js plugin that draws the dashed
// IRMAA-tier bracket lines on top of the income chart (spec §8.3).
// ═══════════════════════════════════════════════════════════════
// Shared label-declutter: dashed bracket lines can sit only a few pixels apart once
// converted to y-pixels, which made their text labels overlap/collide (e.g. adjacent
// income-tax bracket % labels stacking on top of each other). Instead of drawing text
// immediately at each line, callers queue {y,x,text,color,font} entries per side/anchor
// and this sorts + nudges them apart to a minimum vertical gap before drawing.
function declutterLabels(ctx, items, top, bottom, minGap){
  if(!items.length) return;
  minGap = minGap||13;   // pill height is 12
  items.sort((a,b)=>a.y-b.y);
  // Neighbours are pushed UP (never down): a label floats above its own line, and sliding one down would put its white pill over the thin lines below it.
  for(let i=items.length-2;i>=0;i--){
    if(items[i+1].y-items[i].y < minGap) items[i].y = items[i+1].y - minGap;
  }
  if(items[0].y < top) { const under=top-items[0].y; items.forEach(it=>it.y += under); }   // only if the stack no longer fits above the plot's top edge
  const overflow = items[items.length-1].y - bottom;
  if(overflow>0) items.forEach(it=>it.y -= overflow);
  items.forEach(it=>{
    ctx.font=it.font; ctx.fillStyle=it.color; ctx.textAlign=it.align||'right'; ctx.textBaseline='middle';
    if(it.pill){   // small white pill behind the label, so it reads on any band color
      const w=ctx.measureText(it.text).width, al=it.align||'right', x0=al==='right'?it.x-w:(al==='center'?it.x-w/2:it.x);
      ctx.save(); ctx.fillStyle='rgba(255,255,255,.88)';
      const px=x0-3, py=it.y-6, pw=w+6, ph=12, r=5;
      ctx.beginPath(); ctx.moveTo(px+r,py); ctx.lineTo(px+pw-r,py); ctx.quadraticCurveTo(px+pw,py,px+pw,py+r); ctx.lineTo(px+pw,py+ph-r); ctx.quadraticCurveTo(px+pw,py+ph,px+pw-r,py+ph); ctx.lineTo(px+r,py+ph); ctx.quadraticCurveTo(px,py+ph,px,py+ph-r); ctx.lineTo(px,py+r); ctx.quadraticCurveTo(px,py,px+r,py); ctx.fill(); ctx.restore();
      ctx.fillStyle=it.color;
    }
    if(it.halo){ ctx.lineWidth=3; ctx.lineJoin='round'; ctx.strokeStyle=it.halo; ctx.strokeText(it.text, it.x, it.y); }
    ctx.fillText(it.text, it.x, it.y);
  });
}

const incomeOverlayPlugin={
  id:'incomeOverlay',
  // Drawn in afterDatasetsDraw (not afterDraw) so these dashed IRMAA lines land
  // on top of the stacked areas but *before* the core Tooltip plugin's own
  // afterDraw paints the tooltip — otherwise these lines/labels render over
  // an open tooltip and obscure it.
  afterDatasetsDraw(chart,args,opts){
    if(!opts) return;
    const{ctx,chartArea:{left,right,top,bottom},scales:{x,y}}=chart;
    const n=chart.data.labels.length, swIdx=opts.switchIdx??n;
    // IRMAA tiers are set by MAGI (AGI + tax-exempt income + ...). Only AGI is modeled and this
    // graph is treated as ~AGI ~ MAGI, so each tier is drawn as a plain horizontal line.
    function xP(idx){ return x.getPixelForValue(Math.max(0,Math.min(n-1,idx))); }
    ctx.save();
    ctx.beginPath(); ctx.rect(left,top,right-left,bottom-top); ctx.clip();
    const leftLabels=[], rightLabels=[];
    function drawLines(lines,i0,i1,bucket){
      if(opts.fromIdx!=null) i0=Math.max(i0,opts.fromIdx);   // optional visible window (e.g. IRMAA lines only while on/near Medicare)
      if(opts.toIdx!=null) i1=Math.min(i1,opts.toIdx);
      if(!lines||i0>i1) return;
      const xa=xP(i0), xb=xP(i1);
      lines.forEach(ln=>{
        const yPx=y.getPixelForValue(ln.magi);
        if(yPx<top||yPx>bottom) return;
        const lineCol = BRACKET_COLOR;
        // thin solid ink line with a thin white line of the same width stacked directly above it
        ctx.setLineDash([]); ctx.lineWidth=THIN_W; ctx.lineCap='butt';
        ctx.beginPath(); ctx.strokeStyle=lineCol; ctx.moveTo(xa,yPx); ctx.lineTo(xb,yPx); ctx.stroke();
        ctx.beginPath(); ctx.strokeStyle='#fff'; ctx.moveTo(xa,yPx-THIN_W); ctx.lineTo(xb,yPx-THIN_W); ctx.stroke();
        bucket.push({y:yPx-LINE_LABEL_LIFT,x:Math.min(right,xb)-3,text:ln.pct!=null ? `$${(ln.magi/1000).toFixed(0)}k +${ln.pct}%` : `IRMAA ${ln.label} >$${(ln.magi/1000).toFixed(0)}k`,color:lineCol,pill:true,font:(ln.pct!=null?'9px':'10px')+' DM Sans,sans-serif'});
      });
    }
    drawLines(opts.irmaaMFJ,0,Math.min(swIdx,n)-1,leftLabels);
    drawLines(opts.irmaaSgl,Math.max(swIdx,0),n-1,rightLabels);
    declutterLabels(ctx,leftLabels,top,bottom);
    declutterLabels(ctx,rightLabels,top,bottom);
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('incomeOverlay')) Chart.register(incomeOverlayPlugin);
// Same dashed IRMAA lines for the small MAGI companion chart (lines carry `pct` → labeled with the bracket MAGI value and the Part B % increase over standard).
const magiOverlayPlugin={...incomeOverlayPlugin, id:'magiOverlay'};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('magiOverlay')) Chart.register(magiOverlayPlugin);

// Rate labels for the ordinary-income bracket lines on the Annual Household Income ordinary-income chart. The lines themselves are ordinary
// (dashed, per-year) line datasets flagged `ordLabel`; this writes that label at each line's right end.
const ordLabelPlugin={
  id:'ordLabels',
  afterDatasetsDraw(chart){
    const {ctx,chartArea,scales}=chart, y=scales.y, x=scales.x; if(!y||!x) return;
    const items=[];
    chart.data.datasets.forEach((ds,di)=>{
      if(!ds.ordLabel||!chart.isDatasetVisible(di)) return;
      let li=-1; for(let i=ds.data.length-1;i>=0;i--){ if(ds.data[i]!=null){ li=i; break; } }
      if(li<0) return;
      const py=y.getPixelForValue(ds.data[li]); if(py<chartArea.top||py>chartArea.bottom) return;
      const px=Math.min(chartArea.right-2, x.getPixelForValue(li));
      items.push({y:py-LINE_LABEL_LIFT, x:px-2, text:ds.ordLabel, color:BRACKET_COLOR, pill:true, font:'10px DM Sans,sans-serif'});
    });
    ctx.save();
    declutterLabels(ctx, items, chartArea.top+6, chartArea.bottom-6, 13);
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('ordLabels')) Chart.register(ordLabelPlugin);

// White halo under a straight line dataset flagged `halo:true` (the bracket and deduction lines), drawn just before the line itself so the line
// stays readable over any band color.
// Traces a dataset's drawn line (straight or curved) shifted down by dy pixels.
function traceLine(ctx, meta, curved, dy){
  ctx.beginPath(); let prev=null;
  meta.data.forEach(pt=>{
    if(pt.skip||pt.y==null||isNaN(pt.y)){ prev=null; return; }
    if(!prev) ctx.moveTo(pt.x,pt.y+dy);
    else if(curved&&prev.cp2x!=null&&pt.cp1x!=null) ctx.bezierCurveTo(prev.cp2x,prev.cp2y+dy,pt.cp1x,pt.cp1y+dy,pt.x,pt.y+dy);
    else ctx.lineTo(pt.x,pt.y+dy);
    prev=pt;
  });
}
// Line datasets flagged `thin:true` (bracket, deduction and effective-tax-rate lines): a thin white line of the same width is drawn directly above the line and a slightly wider
// white halo centered under it, BEFORE the colored line, so the colored line always stays on top: on a steep slope a white line drawn after it (and shifted only vertically)
// would cover it almost completely.
const thinLinePlugin={
  id:'thinLine',
  beforeDatasetDraw(chart,args){
    const ds=chart.data.datasets[args.index]; if(!ds||!ds.thin||!chart.isDatasetVisible(args.index)) return;
    const {ctx,chartArea}=chart, meta=args.meta, curved=(ds.tension||0)>0, w=ds.borderWidth||THIN_W;
    if(curved&&meta.dataset&&meta.dataset.updateControlPoints){ try{ meta.dataset.updateControlPoints(chartArea, meta.iScale&&meta.iScale.axis); }catch(e){} }
    ctx.save();
    ctx.beginPath(); ctx.rect(chartArea.left,chartArea.top,chartArea.right-chartArea.left,chartArea.bottom-chartArea.top); ctx.clip();
    ctx.strokeStyle='#fff'; ctx.lineJoin='round'; ctx.setLineDash([]);
    ctx.lineWidth=w+2; traceLine(ctx, meta, curved, 0); ctx.stroke();        // halo: contrast on steep slopes
    ctx.lineWidth=w; traceLine(ctx, meta, curved, -w); ctx.stroke();         // the white line stacked directly above
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('thinLine')) Chart.register(thinLinePlugin);

const lineHaloPlugin={
  id:'lineHalo',
  beforeDatasetDraw(chart,args){
    const ds=chart.data.datasets[args.index]; if(!ds||!ds.halo||!chart.isDatasetVisible(args.index)) return;
    const {ctx,chartArea}=chart, meta=args.meta, curved=(ds.tension||0)>0;
    if(curved&&meta.dataset&&meta.dataset.updateControlPoints){ try{ meta.dataset.updateControlPoints(chartArea, meta.iScale&&meta.iScale.axis); }catch(e){} }   // curve handles, so the halo follows a smoothed line exactly
    ctx.save();
    ctx.beginPath(); ctx.rect(chartArea.left,chartArea.top,chartArea.right-chartArea.left,chartArea.bottom-chartArea.top); ctx.clip();
    ctx.lineWidth=(ds.borderWidth||2)+2.5; ctx.strokeStyle=BRACKET_HALO; ctx.lineJoin='round'; ctx.setLineDash(ds.borderDash||[]);
    ctx.beginPath(); let prev=null;
    meta.data.forEach(pt=>{
      if(pt.skip||pt.y==null||isNaN(pt.y)){ prev=null; return; }
      if(!prev) ctx.moveTo(pt.x,pt.y);
      else if(curved&&prev.cp2x!=null&&pt.cp1x!=null) ctx.bezierCurveTo(prev.cp2x,prev.cp2y,pt.cp1x,pt.cp1y,pt.x,pt.y);
      else ctx.lineTo(pt.x,pt.y);
      prev=pt;
    });
    ctx.stroke(); ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('lineHalo')) Chart.register(lineHaloPlugin);

// Asset Value chart: a red bar above the plot area (same row, height and horizontal alignment as the LTC bars, see ltcBar below) over the
// IRA stretch window, i.e. the years after the household's last passing, labeled above the bar. Options: {fromIdx, label}; no options = nothing
// drawn. The bar sits in the chart's top layout padding (see ltcTopPad / upsertLineChart).
const STRETCH_BAR_COLOR='#c0392b';
function stretchBarOpts(chart){ const o=chart&&chart.options&&chart.options.plugins&&chart.options.plugins.stretchTint; return (o&&typeof o==='object'&&o.fromIdx!=null)?o:null; }
const stretchTintPlugin={
  id:'stretchTint',
  afterDatasetsDraw(chart,args,opts){
    if(!opts||opts.fromIdx==null) return;
    const {ctx,chartArea:{left,right,top},scales:{x}}=chart; if(!x) return;
    const n=chart.data.labels.length, step=n>1?(x.getPixelForValue(1)-x.getPixelForValue(0)):0;
    const xa=Math.max(left,x.getPixelForValue(opts.fromIdx)-step/2), xb=Math.min(right,x.getPixelForValue(opts.toIdx!=null?Math.min(n-1,opts.toIdx):n-1)+step/2);   // toIdx: the bar covers only the 10 stretch years
    if(xb<=xa) return;
    const y0=top-LTC_BAR_H-3;
    ctx.save();
    ctx.fillStyle=STRETCH_BAR_COLOR; ctx.fillRect(xa,y0,xb-xa,LTC_BAR_H);
    if(opts.label){ ctx.beginPath(); ctx.rect(left,0,right-left,top); ctx.clip();   // the label stays centered over the visible part of the red bar and scrolls off the plot with it
      ctx.font='bold 10px DM Sans,sans-serif'; ctx.fillStyle='#444'; ctx.textBaseline='bottom'; ctx.textAlign='center'; ctx.fillText(opts.label,(xa+xb)/2,y0-2); }
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('stretchTint')) Chart.register(stretchTintPlugin);

// Long Term Care periods, drawn above the plot area of every time-based chart (all except the Social Security start-age chart): a medium
// grey bar for the years anyone is on LTC (from the LTC start age until that person passes), a black bar for the years two people overlap,
// and an "LTC" label above the bar. No legend entry. Nothing is drawn (and no space reserved) unless the LTC assumption is enabled and
// at least one LTC year falls on the chart. The bar sits in the chart's top layout padding (see ltcTopPad / upsertLineChart).
const LTC_BAR_H=6, LTC_PAD=22;
const LTC_C_OLD='#9a9a9a', LTC_C_YOUNG='#8ec5ef', LTC_C_BOTH='#1f3a8a';   // older person (or a single person) grey, younger person light blue, both at once dark blue
// How many people are on LTC in each year of `labels` (the age axis): 0, 1 or 2.
function ltcCounts(labels){
  const l=(typeof mcShowingTrial==='function'&&mcShowingTrial()&&mcTrialView.state.ltc)||state.ltc, rows=lastProjection&&lastProjection.rows;   // a loaded Monte Carlo trial has its own care draw
  if(!l||!l.enabled||!rows||!labels) return null;
  const byAge={}; rows.forEach(r=>{ byAge[Math.round(r.age0)]=r; });
  const who=[];
  const out=labels.map((a,j)=>{
    const r=byAge[a]; who[j]=[]; if(!r||!r.ages||!r.alive) return 0;
    let n=0; r.ages.forEach((age,i)=>{ const L=l.people&&l.people[i]; if(L && r.alive[i] && age>=(Number(L.startAge)||0)){ n++; who[j].push(i); } });
    return n;
  });
  out.who=who; out.youngerIdx=(rows[0].ages.length>1)?((lastProjection.idxP0||0)===0?1:0):null;   // who is on LTC each year, and which person is the younger one
  return out.some(n=>n>0)?out:null;
}
function ltcTopPad(chart){ return (ltcCounts(chart.data.labels)||stretchBarOpts(chart))?LTC_PAD:0; }
const ltcBarPlugin={
  id:'ltcBar',
  afterDatasetsDraw(chart,args,opts){
    if(!opts) return;
    const counts=ltcCounts(chart.data.labels); if(!counts) return;
    const {ctx,chartArea:{left,right,top},scales:{x}}=chart; if(!x) return;
    const n=counts.length, step=n>1?(x.getPixelForValue(1)-x.getPixelForValue(0)):0;
    // Horizontal span of years i0..i1 (each year owns half a step either side of its point), kept inside the plot area.
    const span=(i0,i1)=>[Math.max(left,x.getPixelForValue(i0)-step/2), Math.min(right,x.getPixelForValue(i1)+step/2)];
    const runs=(min)=>{ const r=[]; let s=-1; for(let i=0;i<=n;i++){ const on=i<n&&counts[i]>=min; if(on&&s<0) s=i; if(!on&&s>=0){ r.push([s,i-1]); s=-1; } } return r; };
    const y0=top-LTC_BAR_H-3;
    ctx.save();
    // Per year: both people = dark blue, only the younger person = light blue, otherwise grey. Consecutive years of one colour are drawn as one block.
    const cls=counts.map((c,i)=>c>=2?2:(c===1?((counts.youngerIdx!=null&&counts.who[i][0]===counts.youngerIdx)?1:0):-1)), colors=[LTC_C_OLD,LTC_C_YOUNG,LTC_C_BOTH];
    for(let i=0;i<n;){ if(cls[i]<0){ i++; continue; } let j=i; while(j+1<n&&cls[j+1]===cls[i]) j++; const [xa,xb]=span(i,j); if(xb>xa){ ctx.fillStyle=colors[cls[i]]; ctx.fillRect(xa,y0,xb-xa,LTC_BAR_H); } i=j+1; }
    ctx.font='bold 10px DM Sans,sans-serif'; ctx.fillStyle='#444'; ctx.textBaseline='bottom'; ctx.textAlign='center';
    runs(1).forEach(([a,b])=>{ const [xa,xb]=span(a,b); if(xb>xa) ctx.fillText('LTC',(xa+xb)/2,y0-2); });
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('ltcBar')) Chart.register(ltcBarPlugin);

// Inheritance arrivals: a small ▲ just below the x-axis line, in the year an inherited asset enters the scenario, on every time-based chart (always on; the x ticks reserve room
// for it, see ageXAxis). Hover it with the "Chart Element" box checked for what arrives (chartInfo.js ciOverlayAt reads chart._inhArrows).
// Sources: every inherited brokerage portfolio / property / IRA (items with `inh`) at its start row (inhStartRow); the plan's own copy, or the loaded Monte Carlo trial's
// (which has the drawn arrival year and scaled balances). Several sources in one year share one ▲.
function inhArrivals(){
  const s=(typeof mcShowingTrial==='function'&&mcShowingTrial())?mcTrialView.state:state, rows=lastProjection&&lastProjection.rows, by={};
  if(!s||!rows||!rows.length) return [];
  (s.people||[]).forEach(p=>['brokerage','realEstate','inhIras'].forEach(L=>(p[L]||[]).forEach(it=>{
    if(!it||!it.inh||it.enabled===false||!(Number(it.balance)>0)) return;
    const row=inhStartRow(it); if(row>=rows.length) return;
    const e=by[row]||(by[row]={row, age:Math.round(rows[row].age0), value:0, files:[]});
    e.value+=Number(it.balance)||0; const f=String(it.inh.file||'').replace(/\.json$/i,''); if(f&&!e.files.includes(f)) e.files.push(f);
  })));
  return Object.values(by).sort((a,b)=>a.row-b.row);
}
const INH_ARROW_COLOR='#7a4fb5', INH_ARROW_H=7, INH_ARROW_GAP=2;
const inhArrivalPlugin={
  id:'inhArrival',
  afterDatasetsDraw(chart,args,opts){
    chart._inhArrows=[]; if(!opts) return;
    const x=chart.scales.x, area=chart.chartArea, labels=chart.data.labels; if(!x||!area||!labels) return;
    const arr=inhArrivals(); if(!arr.length) return;
    const ctx=chart.ctx, y0=area.bottom+INH_ARROW_GAP, y1=y0+INH_ARROW_H; ctx.save(); ctx.fillStyle=INH_ARROW_COLOR;
    arr.forEach(a=>{
      const i=labels.indexOf(a.age); if(i<0) return;
      const px=x.getPixelForValue(i); if(px<area.left-1||px>area.right+1) return;
      ctx.beginPath(); ctx.moveTo(px,y0); ctx.lineTo(px-INH_ARROW_H*0.6,y1); ctx.lineTo(px+INH_ARROW_H*0.6,y1); ctx.closePath(); ctx.fill();   // apex up, standing on the label side of the axis
      chart._inhArrows.push({px, a});
    });
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('inhArrival')) Chart.register(inhArrivalPlugin);

// A/B comparison ghost: while the Monte Carlo trial (B) is showing, the plan's (A) lines are drawn behind it as thin dashed grey lines. mcCaptureGhosts() (mcPanel.js) keeps
// them as (age index, value) points per Y axis, so they stay put when a chart is resized, and the axes are fixed across A and B (mcFitBoth) so they line up.
const abGhostPlugin={
  id:'abGhost',
  beforeDatasetsDraw(chart,args,opts){
    if(!opts||!chart._abGhost||typeof mcShowingTrial!=='function'||!mcShowingTrial()) return;
    const x=chart.scales.x, area=chart.chartArea; if(!x||!area) return;
    const ctx=chart.ctx; ctx.save(); ctx.beginPath(); ctx.rect(area.left,area.top,area.right-area.left,area.bottom-area.top); ctx.clip();
    ctx.strokeStyle='rgba(90,90,90,0.6)'; ctx.lineWidth=1.2; ctx.setLineDash([4,3]); ctx.lineJoin='round';
    chart._abGhost.forEach(g=>{
      const sc=chart.scales[g.ax]; if(!sc) return;
      ctx.beginPath(); let pen=false;
      g.pts.forEach((v,j)=>{ if(v==null){ pen=false; return; } const px=x.getPixelForValue(j), py=sc.getPixelForValue(v); if(pen) ctx.lineTo(px,py); else { ctx.moveTo(px,py); pen=true; } });
      ctx.stroke();
    });
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('abGhost')) Chart.register(abGhostPlugin);

// Unfunded years: a faint red band behind the data in every year whose expenses no source could pay (row.expUnfunded), on every time-based chart, so a failure is visible
// on whichever chart you look at and when you flip A / B. The one-line red alert above the Annual expenses chart holds the age(s) and the details (its Chart Element popup).
const UNFUNDED_BAND='rgba(208,0,0,0.10)';
const unfundedYearsPlugin={
  id:'unfundedYears',
  beforeDatasetsDraw(chart,args,opts){
    if(!opts) return;
    const x=chart.scales.x, area=chart.chartArea, labels=chart.data.labels, rows=lastProjection&&lastProjection.rows; if(!x||!area||!labels||!rows) return;
    const bad=rows.filter(r=>r.expUnfunded>1); if(!bad.length) return;
    const step=labels.length>1?Math.abs(x.getPixelForValue(1)-x.getPixelForValue(0)):0, ctx=chart.ctx;
    ctx.save(); ctx.beginPath(); ctx.rect(area.left,area.top,area.right-area.left,area.bottom-area.top); ctx.clip(); ctx.fillStyle=UNFUNDED_BAND;
    bad.forEach(r=>{ const i=labels.indexOf(Math.round(r.age0)); if(i<0) return; const px=x.getPixelForValue(i); ctx.fillRect(px-step/2,area.top,step,area.bottom-area.top); });
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('unfundedYears')) Chart.register(unfundedYearsPlugin);


// X-axis title in two colours: the older person's name black, the younger person's dark blue, then "age" (e.g. "Alice, Bob age"). The axis itself (ageXAxis, chartHelpers.js)
// reserves the room with a transparent title; this paints the text over it. Not used by the Social Security start-age chart.
function pillPath(ctx,x,y,w,h){ const r=h/2; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arc(x+w-r,y+r,r,-Math.PI/2,Math.PI/2); ctx.lineTo(x+r,y+h); ctx.arc(x+r,y+r,r,Math.PI/2,Math.PI*1.5); ctx.closePath(); }
const ageAxisTitlePlugin={
  id:'ageAxisTitle',
  afterDraw(chart,args,opts){
    if(!opts||typeof lastProjection==='undefined'||!lastProjection) return;
    const x=chart.scales.x, t=x&&x.options&&x.options.title; if(!t||!t.display||t.color!=='rgba(0,0,0,0)') return;   // only axes built by ageXAxis
    const names=ageAxisNames(lastProjection); if(!names.length) return;
    const ctx=chart.ctx, size=(t.font&&t.font.size)||11, fam=(Chart.defaults.font&&Chart.defaults.font.family)||'sans-serif';
    ctx.save(); ctx.font=size+'px '+fam; ctx.textBaseline='middle'; ctx.textAlign='left';
    const parts=[]; names.forEach((nm,i)=>{ parts.push({s:nm,pill:i>0}); if(i<names.length-1) parts.push({s:', '}); }); parts.push({s:' age'});
    const PADX=5, wOf=p=>ctx.measureText(p.s).width+(p.pill?2*PADX:0), w=parts.reduce((a,p)=>a+wOf(p),0);
    let px=(x.left+x.right)/2-w/2; const py=x.bottom-size*1.2/2-4;
    parts.forEach(p=>{
      if(p.pill){ pillPath(ctx,px,py-size/2-2,wOf(p),size+4); ctx.fillStyle=AGE_C_YOUNG; ctx.fill(); ctx.fillStyle='#fff'; ctx.fillText(p.s,px+PADX,py); }   // younger name: white on a dark-blue pill
      else { ctx.fillStyle=AGE_C_OLD; ctx.fillText(p.s,px,py); }
      px+=wOf(p); });
    // The younger person's tick labels (hidden by the tick colour): white age on a dark-blue pill, at the position Chart.js gave the label.
    const items=x._labelItems, ticks=x.ticks, tfont=(x.options.ticks.font&&x.options.ticks.font.size)||10;
    if(items&&ticks&&items.length===ticks.length){
      ctx.font=tfont+'px '+fam; ctx.textAlign='center';
      items.forEach((it,i)=>{ const lab=chart.data.labels[ticks[i].value]; if(ageAxisTick(lastProjection,lab).color!==AGE_C_YOUNG) return;
        const tr=it.options.translation||it.translation, tx=tr[0], tw=ctx.measureText(it.label).width+8, base=it.options.textBaseline||'middle';
        const ty=tr[1]+(it.textOffset||0);   // where Chart.js draws this label's text (same baseline), so the pill sits on the line of the other labels
        const cy=base==='top'?ty+tfont/2:(base==='bottom'?ty-tfont/2:ty);   // centre of the text box for that baseline
        pillPath(ctx,tx-tw/2,cy-tfont/2-2,tw,tfont+4); ctx.fillStyle=AGE_C_YOUNG; ctx.fill();
        ctx.fillStyle='#fff'; ctx.textBaseline=base; ctx.fillText(it.label,tx,ty); });
    }
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('ageAxisTitle')) Chart.register(ageAxisTitlePlugin);

// Passing lines: a thin vertical line, on every time-based chart, in the year each person passes (the older person's black, the younger person's dark blue). The year is the first one the
// person is no longer alive in (the age on the axis where their passing age is reached). Drawn on top of the data, inside the plot area.
const passLinesPlugin={
  id:'passLines',
  afterDatasetsDraw(chart,args,opts){
    if(!opts||typeof lastProjection==='undefined'||!lastProjection) return;
    const x=chart.scales.x, area=chart.chartArea, labels=chart.data.labels; if(!x||!area||!labels||!labels.length) return;
    const P=passingYears(lastProjection); if(!P.length) return;
    const ctx=chart.ctx; ctx.save(); ctx.beginPath(); ctx.rect(area.left,area.top,area.right-area.left,area.bottom-area.top); ctx.clip();
    ctx.lineWidth=1; ctx.setLineDash([]); ctx.globalAlpha=0.75;
    P.forEach(p=>{ let i=labels.indexOf(p.label); if(i<0&&p.label>labels[labels.length-1]) i=labels.length-1;   // a passing beyond the right end of the axis (a late passing age) still shows, at the edge
      if(i<0) return; const px=Math.min(area.right-0.5,Math.max(area.left+0.5,Math.round(x.getPixelForValue(i))+0.5)); ctx.strokeStyle=p.color; ctx.beginPath(); ctx.moveTo(px,area.top); ctx.lineTo(px,area.bottom); ctx.stroke(); });
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('passLines')) Chart.register(passLinesPlugin);

// Zero line: a thin solid line at 0% on the Inflation and Market return charts (enabled per chart with options.plugins.zeroLine). A plugin rather than a grid line, because the
// Y axis has a tick at 0 only when its range happens to land on one. Drawn under the data, over the plot area.
const zeroLinePlugin={
  id:'zeroLine',
  beforeDatasetsDraw(chart,args,opts){
    if(!opts) return;
    const y=chart.scales.y, area=chart.chartArea; if(!y||!area) return;
    const py=y.getPixelForValue(0); if(!(py>=area.top-0.5&&py<=area.bottom+0.5)) return;
    const ctx=chart.ctx, yy=Math.round(py)+0.5;
    ctx.save(); ctx.beginPath(); ctx.rect(area.left,area.top-1,area.right-area.left,area.bottom-area.top+2); ctx.clip();
    ctx.strokeStyle=BRACKET_COLOR; ctx.lineWidth=1; ctx.setLineDash([]); ctx.globalAlpha=0.8;
    ctx.beginPath(); ctx.moveTo(area.left,yy); ctx.lineTo(area.right,yy); ctx.stroke();
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('zeroLine')) Chart.register(zeroLinePlugin);
