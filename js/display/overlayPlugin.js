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
    ctx.font=it.font; ctx.fillStyle=it.color; ctx.textAlign='right'; ctx.textBaseline='middle';
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
    const ov=OV();
    const leftLabels=[], rightLabels=[];
    function drawLines(lines,i0,i1,bucket){
      if(!lines||i0>i1) return;
      const xa=xP(i0), xb=xP(i1);
      lines.forEach(ln=>{
        const yPx=y.getPixelForValue(ln.magi);
        if(yPx<top||yPx>bottom) return;
        const lineCol = ov.irmaa[Math.min(ln.tier,ov.irmaa.length-1)];
        ctx.beginPath(); ctx.setLineDash([8,5]); ctx.lineWidth=1.4; ctx.strokeStyle=lineCol;
        ctx.moveTo(xa,yPx); ctx.lineTo(xb,yPx); ctx.stroke(); ctx.setLineDash([]);
        bucket.push({y:yPx-5,x:Math.min(right,xb)-3,text:`IRMAA ${ln.label} >$${(ln.magi/1000).toFixed(0)}k`,color:lineCol,font:'10px DM Sans,sans-serif'});
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
