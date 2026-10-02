'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / PRINT — "Print" button (right of Export to Excel).
// Prints the page as if every Hide checkbox (the section Hides and the per-card Hides)
// were unchecked, WITHOUT changing what the user sees on screen or anything in `state`:
// everything below happens inside the browser's beforeprint event and is undone in
// afterprint, so Ctrl/Cmd+P behaves the same as the button.
//  1. expand every collapsed section/card and add body.printing-all (print layout rules in
//     css/styles.css — they apply immediately, before print media does);
//  2. draw every chart afresh (off-screen, no animation) at its print size and show that static pixel copy in place of its <canvas>, so a
//     chart can never print blank because the browser resized/cleared the canvas during printing.
// ═══════════════════════════════════════════════════════════════
let _printUndo=null;
function printExpandAll(){
  if(_printUndo) return;
  const undo=[];
  document.querySelectorAll('.sec-hidden').forEach(el=>{ el.classList.remove('sec-hidden'); undo.push(()=>el.classList.add('sec-hidden')); });
  document.querySelectorAll('.item-body:not(.open)').forEach(el=>{ el.classList.add('open'); undo.push(()=>el.classList.remove('open')); });
  document.body.classList.add('printing-all'); undo.push(()=>document.body.classList.remove('printing-all'));
  _printUndo=undo;
  if(typeof allCharts!=='function') return;
  allCharts().forEach(ch=>{
    try{
      const cv=ch.canvas, host=cv&&cv.parentNode; if(!host) return;
      const w=host.clientWidth;                       // print-sized container width (printing-all rules already apply)
      if(!w) return;                                  // legitimately not shown (e.g. no IDGT portfolio)
      const ar=(ch.options&&ch.options.maintainAspectRatio&&ch.options.aspectRatio)||1;
      const h=Math.round(w/ar);
      // Draw a FRESH, non-animated copy of the chart on an off-screen canvas of exactly the print size instead of
      // re-fitting the live chart: the live charts are left untouched, and nothing depends on their animation /
      // resize timing (resizing the live canvas left some line charts blank).
      const box=document.createElement('div');
      box.style.cssText='position:fixed;left:-10000px;top:0;width:'+w+'px;height:'+h+'px;';
      const tmp=document.createElement('canvas'); box.appendChild(tmp); document.body.appendChild(box);
      const cfg=ch.config;
      const opts={...cfg.options, responsive:true, maintainAspectRatio:false, animation:false, transitions:{}, events:[],
                  devicePixelRatio:Math.max(2,window.devicePixelRatio||1)};
      const copy=new Chart(tmp,{type:cfg.type,
        data:{labels:ch.data.labels.slice(), datasets:ch.data.datasets.map(d=>({...d,data:d.data.slice()}))},
        options:opts});
      copy.update('none');
      const cp=document.createElement('canvas');
      cp.width=tmp.width; cp.height=tmp.height;
      cp.getContext('2d').drawImage(tmp,0,0);
      copy.destroy(); box.remove();
      cp.className='print-chart-copy';
      cp.style.cssText='display:block;width:100%;height:auto;';
      host.insertBefore(cp,cv.nextSibling);
      cv.classList.add('print-swapped');
      undo.push(()=>{ cp.remove(); cv.classList.remove('print-swapped'); });
    }catch(e){ try{ console.warn('print: chart copy failed',e); }catch(_){} }
  });
}
function printRestore(){
  if(!_printUndo) return;
  _printUndo.slice().reverse().forEach(f=>f()); _printUndo=null;
  if(typeof resizeAllCharts==='function') resizeAllCharts();
}
window.addEventListener('beforeprint', printExpandAll);
window.addEventListener('afterprint', printRestore);
function printPage(){ window.print(); }
