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
      if(!lines||i0>i1) return;
      const xa=xP(i0), xb=xP(i1);
      lines.forEach(ln=>{
        const yPx=y.getPixelForValue(ln.magi);
        if(yPx<top||yPx>bottom) return;
        const lineCol = OVERLAY_COLOR;
        ctx.beginPath(); ctx.setLineDash([8,5]); ctx.lineWidth=1.4; ctx.strokeStyle=lineCol;
        ctx.moveTo(xa,yPx); ctx.lineTo(xb,yPx); ctx.stroke(); ctx.setLineDash([]);
        bucket.push({y:yPx-5,x:Math.min(right,xb)-3,text:ln.pct!=null ? `$${(ln.magi/1000).toFixed(0)}k +${ln.pct}%` : `IRMAA ${ln.label} >$${(ln.magi/1000).toFixed(0)}k`,color:lineCol,font:(ln.pct!=null?'9px':'10px')+' DM Sans,sans-serif'});
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

// Ordinary-income-tax bracket lines for the small ordinary chart on the Total Income Tax section.
// Each line sits at the cumulative ordinary tax owed at a bracket ceiling ($ on the same axis as the
// tax area), drawn for the filing status in force (MFJ until switchIdx, Single after) and labeled
// once with the rate that applies above it. Same draw phase as incomeOverlay (under the tooltip).
const taxBracketPlugin={
  id:'taxBracketOverlay',
  afterDatasetsDraw(chart,args,opts){
    if(!opts) return;
    const{ctx,chartArea:{left,right,top,bottom},scales:{x,y}}=chart;
    const n=chart.data.labels.length, swIdx=opts.switchIdx??n;
    const xP=i=>x.getPixelForValue(Math.max(0,Math.min(n-1,i)));
    ctx.save();
    ctx.beginPath(); ctx.rect(left,top,right-left,bottom-top); ctx.clip();
    // Lines near the bottom of the shared $ scale are only a few px apart, so labels are staggered
    // along x (each label that would touch the previous one steps right) instead of being pushed off their line.
    function draw(lines,i0,i1,col,lblCol){
      if(!lines||i0>i1) return;
      const xa=xP(i0), xb=xP(i1), items=[];
      lines.forEach(ln=>{
        const yPx=y.getPixelForValue(ln.tax);
        if(yPx<top||yPx>bottom) return;
        ctx.beginPath(); ctx.setLineDash([6,4]); ctx.lineWidth=1.2; ctx.strokeStyle=col;
        ctx.moveTo(xa,yPx); ctx.lineTo(xb,yPx); ctx.stroke(); ctx.setLineDash([]);
        items.push({y:yPx,text:Math.round(ln.r*100)+'%'});
      });
      items.sort((p,q)=>q.y-p.y);   // bottom line first
      ctx.font='9px DM Sans,sans-serif'; ctx.fillStyle=lblCol; ctx.textAlign='left'; ctx.textBaseline='bottom';
      let step=0, prevY=null;
      items.forEach(it=>{
        step = (prevY!=null && prevY-it.y<11) ? step+1 : 0;
        prevY=it.y;
        const x0=xa+3+step*21;
        if(x0+16<=xb) ctx.fillText(it.text,x0,it.y-2);
      });
    }
    draw(opts.mfj,0,Math.min(swIdx,n)-1,OVERLAY_COLOR,OVERLAY_COLOR);
    draw(opts.sgl,Math.max(swIdx,0),n-1,OVERLAY_COLOR,OVERLAY_COLOR);
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('taxBracketOverlay')) Chart.register(taxBracketPlugin);

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
      items.push({y:py-7, x:px-2, text:ds.ordLabel, color:OVERLAY_COLOR, font:'10px DM Sans,sans-serif'});
    });
    ctx.save();
    declutterLabels(ctx, items, chartArea.top+6, chartArea.bottom-6, 11);
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('ordLabels')) Chart.register(ordLabelPlugin);

// Asset Value chart: light grey tint behind the IRA stretch window (the years after the household's last passing, when only
// stretched IRAs / non-IDGT holdings carry on), labeled at its top. Options: {fromIdx, label}; no options = nothing drawn.
const stretchTintPlugin={
  id:'stretchTint',
  beforeDatasetsDraw(chart,args,opts){
    if(!opts||opts.fromIdx==null) return;
    const {ctx,chartArea:{left,right,top,bottom},scales:{x}}=chart; if(!x) return;
    const xa=Math.max(left,x.getPixelForValue(opts.fromIdx)); if(xa>=right) return;
    ctx.save(); ctx.fillStyle='rgba(120,120,120,.16)'; ctx.fillRect(xa,top,right-xa,bottom-top); ctx.restore();
  },
  afterDatasetsDraw(chart,args,opts){
    if(!opts||opts.fromIdx==null||!opts.label) return;
    const {ctx,chartArea:{left,right,top},scales:{x}}=chart; if(!x) return;
    const xa=Math.max(left,x.getPixelForValue(opts.fromIdx)); if(xa>=right) return;
    ctx.save(); ctx.font='11px DM Sans,sans-serif'; ctx.fillStyle='#555'; ctx.textBaseline='top';
    const w=ctx.measureText(opts.label).width, fits=w+8<=right-xa;
    ctx.textAlign=fits?'center':'right';
    ctx.fillText(opts.label, fits?(xa+right)/2:right-4, top+4);
    ctx.restore();
  }
};
if(typeof Chart!=='undefined' && !Chart.registry.plugins.get('stretchTint')) Chart.register(stretchTintPlugin);
