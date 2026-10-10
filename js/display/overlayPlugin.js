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
  minGap = minGap||11;
  items.sort((a,b)=>a.y-b.y);
  for(let i=1;i<items.length;i++){
    if(items[i].y-items[i-1].y < minGap) items[i].y = items[i-1].y + minGap;
  }
  const overflow = items[items.length-1].y - bottom;
  if(overflow>0) items.forEach(it=>it.y -= overflow);
  if(items[0].y < top) { const under=top-items[0].y; items.forEach(it=>it.y += under); }
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
        ctx.beginPath(); ctx.setLineDash(IRMAA_DASH); ctx.lineWidth=3.6; ctx.strokeStyle=BRACKET_HALO;   // white halo under the ink line
        ctx.moveTo(xa,yPx); ctx.lineTo(xb,yPx); ctx.stroke();
        ctx.beginPath(); ctx.lineWidth=1.6; ctx.strokeStyle=lineCol;
        ctx.moveTo(xa,yPx); ctx.lineTo(xb,yPx); ctx.stroke(); ctx.setLineDash([]);
        bucket.push({y:yPx-5,x:Math.min(right,xb)-3,text:ln.pct!=null ? `$${(ln.magi/1000).toFixed(0)}k +${ln.pct}%` : `IRMAA ${ln.label} >$${(ln.magi/1000).toFixed(0)}k`,color:lineCol,pill:true,font:(ln.pct!=null?'9px':'10px')+' DM Sans,sans-serif'});
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
      items.push({y:py-7, x:px-2, text:ds.ordLabel, color:BRACKET_COLOR, pill:true, font:'10px DM Sans,sans-serif'});
    });
    ctx.save();
    declutterLabels(ctx, items, chartArea.top+6, chartArea.bottom-6, 11);
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('ordLabels')) Chart.register(ordLabelPlugin);

// White halo under a straight line dataset flagged `halo:true` (the bracket and deduction lines), drawn just before the line itself so the line
// stays readable over any band color.
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
    const xa=Math.max(left,x.getPixelForValue(opts.fromIdx)-step/2), xb=Math.min(right,x.getPixelForValue(n-1)+step/2);
    if(xb<=xa) return;
    const y0=top-LTC_BAR_H-3;
    ctx.save();
    ctx.fillStyle=STRETCH_BAR_COLOR; ctx.fillRect(xa,y0,xb-xa,LTC_BAR_H);
    if(opts.label){ ctx.font='bold 10px DM Sans,sans-serif'; ctx.fillStyle='#444'; ctx.textBaseline='bottom'; ctx.textAlign='center'; ctx.fillText(opts.label,(xa+xb)/2,y0-2); }
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('stretchTint')) Chart.register(stretchTintPlugin);

// Long Term Care periods, drawn above the plot area of every time-based chart (all except the Social Security start-age chart): a medium
// grey bar for the years anyone is on LTC (from the LTC start age until that person passes), a black bar for the years two people overlap,
// and an "LTC" label above the bar. No legend entry. Nothing is drawn (and no space reserved) unless the LTC assumption is enabled and
// at least one LTC year falls on the chart. The bar sits in the chart's top layout padding (see ltcTopPad / upsertLineChart).
const LTC_BAR_H=6, LTC_PAD=22;
// How many people are on LTC in each year of `labels` (the age axis): 0, 1 or 2.
function ltcCounts(labels){
  const l=state.ltc, rows=lastProjection&&lastProjection.rows;
  if(!l||!l.enabled||!rows||!labels) return null;
  const byAge={}; rows.forEach(r=>{ byAge[Math.round(r.age0)]=r; });
  const out=labels.map(a=>{
    const r=byAge[a]; if(!r||!r.ages||!r.alive) return 0;
    let n=0; r.ages.forEach((age,i)=>{ const L=l.people&&l.people[i]; if(L && r.alive[i] && age>=(Number(L.startAge)||0)) n++; });
    return n;
  });
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
    const draw=(min,color)=>runs(min).forEach(([a,b])=>{ const [xa,xb]=span(a,b); if(xb>xa){ ctx.fillStyle=color; ctx.fillRect(xa,y0,xb-xa,LTC_BAR_H); } });
    draw(1,'#9a9a9a'); draw(2,'#000');
    ctx.font='bold 10px DM Sans,sans-serif'; ctx.fillStyle='#444'; ctx.textBaseline='bottom'; ctx.textAlign='center';
    runs(1).forEach(([a,b])=>{ const [xa,xb]=span(a,b); if(xb>xa) ctx.fillText('LTC',(xa+xb)/2,y0-2); });
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('ltcBar')) Chart.register(ltcBarPlugin);
