'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHART PANELS — every chart sits in its own panel on a 2- or 3-column grid (the 2×N / 3×N toggle, state.ui.gridCols; default 3).
//   • Hide checkbox per panel (state.ui.chartHidden[key]; default hidden only for Annual expenses, Annual income, Total tax, Asset value, IDGT value). A hidden panel keeps its place as a title bar.
//   • Rescale button per panel (chartHelpers.js rescaleChart: refits that chart only).
//   • Drag a panel by its title bar to any cell: a free cell moves it there (the vacated cell stays blank), an occupied cell swaps the two. Holding the pointer on the gap between two rows
//     for a moment opens a blank row there to drop into; moving away without dropping closes it again.
//     Positions are state.ui.chartPos[key] = {r,c}, saved with the plan like every other `state.ui` setting. Each grid size keeps its own arrangement
//     (state.ui.chartPos for the grid on screen, state.ui.chartPosAlt for the other one); toggleGridCols() swaps them.
//   • A row of Same-scale buttons above the grid: each click sets a group of charts to one Y scale once (chartHelpers.js SCALE_LINK_GROUPS). Scales are saved in state.ui.chartYMax.
// The panels are built once (the Chart.js instances hold their <canvas>); moving a panel only changes its grid row/column.
// ═══════════════════════════════════════════════════════════════
// key → panel title and the canvas id (`<key>Chart`). `tools` is extra control HTML for the panel's tool row.
const CHART_PANELS=[
  {key:'expense',    title:'Annual expenses',
    tools:'<span class="unfunded-alert" id="expenseAlert" hidden></span>'},   // red UNFUNDED tag, right of Rescale (display/expenseChart.js)
  {key:'incomeMagi', title:'MAGI'},
  {key:'income',     title:'Annual income'},
  {key:'incomeOrd',  title:'Taxable ordinary income'},
  {key:'incomeQual', title:'Taxable qualified income'},
  {key:'tax',        title:'Total tax',
    tools:'<label class="hide-cb"><input type="checkbox" id="viewIrmaaAsTaxToggle" autocomplete="off" onchange="toggleIrmaaAsTax(this.checked)">view IRMAA as tax</label>'},
  {key:'taxOrd',     title:'Ordinary income tax'},
  {key:'taxQual',    title:'QDIV / LTCG / NIIT tax'},
  {key:'asset',      title:'Asset value',
    body:'<div class="xscroll" id="assetXScroll" hidden><button type="button" onclick="scrollAssetX(-1)" title="Scroll the age axis back" aria-label="Scroll back">&#9664;</button><button type="button" onclick="scrollAssetX(1)" title="Scroll the age axis forward (to the IRA stretch years)" aria-label="Scroll forward">&#9654;</button></div>'},
  {key:'idgt',       title:'IDGT value'},
  {key:'ira',        title:'IRA: RMD &amp; withdraw'},
  {key:'ltcg',       title:'LTCG: realized sales'},
  {key:'inhIncome',   title:'Inheritance asset income'},
  {key:'ss',         title:'Cumulative household SS'},
  {key:'tss',        title:'Social Security tax'},
  {key:'inflation',  title:'Inflation rate'},
  {key:'market',     title:'Market return %',
    tools:'<span class="market-nav" id="marketNav"><button type="button" class="rescale-btn" onclick="marketStep(-1)" title="Show the previous line (cycles through every asset, then all lines)" aria-label="Previous line">&#9664;</button><button type="button" class="rescale-btn" onclick="marketStep(1)" title="Show the next line (cycles through every asset, then all lines)" aria-label="Next line">&#9654;</button></span>'}
];
// Charts with nothing to draw right now (no IDGT portfolio, no pre-tax IRA, no portfolio or property to sell, Social Security off) have no panel on screen; their grid cell stays blank
// and their saved position is kept. Builders report this through setChartAvailable().
const chartAvail=Object.fromEntries(CHART_KEYS.map(k=>[k,true]));
function setChartAvailable(key, on){
  on=!!on;
  if(chartAvail[key]===on) return;
  chartAvail[key]=on;
  const el=document.querySelector('.chart-panel[data-key="'+key+'"]'); if(el) el.classList.toggle('no-data',!on);
  layoutChartGrid();
}

// ── Grid size (2×N / 3×N) ──
function chartCols(){ return (state&&state.ui&&state.ui.gridCols===3)?3:2; }
// Two states only. Each size keeps its own arrangement: the one on screen is state.ui.chartPos, the other waits in state.ui.chartPosAlt.
function toggleGridCols(){
  if(!state.ui) state.ui={};
  const cur=chartCols(), next=otherGridCols(cur);
  const keep=normalizeChartPos(state.ui.chartPos,cur), other=normalizeChartPos(state.ui.chartPosAlt,next);
  state.ui.chartPos=other; state.ui.chartPosAlt=keep; state.ui.gridCols=next;
  layoutChartGrid(); syncGridButton();
  if(typeof resizeAllCharts==='function') resizeAllCharts();
  saveDebounced();
}
function syncGridButton(){
  const b=document.getElementById('gridToggle'); if(!b) return;
  const cur=chartCols(), next=otherGridCols(cur);
  b.textContent='Grid: '+cur+'\u00d7N';
  b.title='Charts are in a '+cur+'-column grid. Click to switch to '+next+' columns (each size remembers its own arrangement).';
  b.setAttribute('aria-label',b.title);
}

// ── Build ──
let _dragKey=null;
// Auto-scroll while a panel is dragged: near the top or bottom edge of the chart column (or of the window, when the page itself scrolls) it scrolls
// that way, faster the closer the pointer is to the edge, so a chart can be dropped above or below what is on screen.
let _dragY=null, _dragRaf=0;
// New blank row while dragging: hold the pointer on the gap between two chart rows (or just above the first) for HOLD_MS and a blank row opens there to drop the chart
// into. If the pointer moves away without dropping, the row closes again and the layout is exactly as it was. Dropping anywhere else also leaves no extra row.
const ROW_HOLD_MS=450;
let _holdBoundary=null, _holdTimer=0, _pendingInsert=null;   // _pendingInsert={at, pre} while a temporary blank row is open (pre = positions before it opened)
// Vertical extent of grid row `rr` (visible panels and blank cells in it), or null.
function gridRowExtent(grid,rr){
  let top=Infinity, bottom=-Infinity;
  grid.querySelectorAll('.chart-cell,.chart-panel').forEach(el=>{
    let r; if(el.classList.contains('chart-cell')) r=+el.dataset.r;
    else { if(el.classList.contains('no-data')) return; const p=state.ui.chartPos[el.dataset.key]; r=p?p.r:-1; }
    if(r!==rr) return;
    const b=el.getBoundingClientRect(); top=Math.min(top,b.top); bottom=Math.max(bottom,b.bottom);
  });
  return top===Infinity?null:{top,bottom};
}
// Index of the row a new blank row would be inserted before when the pointer is on a boundary (gap) at height y, else null.
function rowBoundaryAt(grid,y){
  const pos=state.ui.chartPos; let maxR=-1; CHART_KEYS.forEach(k=>{ if(chartAvail[k]) maxR=Math.max(maxR,pos[k].r); });
  const SLOP=5;
  let prev=null;
  for(let rr=0;rr<=maxR;rr++){
    const e=gridRowExtent(grid,rr); if(!e) continue;
    if(prev===null){ if(y>=e.top-30 && y<=e.top+SLOP) return rr; }
    else if(y>=prev.bottom-SLOP && y<=e.top+SLOP && y>prev.bottom-SLOP-1) return rr;
    prev=e;
  }
  return null;
}
function dragRowHover(y){
  const grid=document.getElementById('chartGrid'); if(!grid||!_dragKey) return;
  if(_pendingInsert){
    const e=gridRowExtent(grid,_pendingInsert.at);
    if(!e||y<e.top-6||y>e.bottom+6) cancelRowInsert();
    return;
  }
  const b=rowBoundaryAt(grid,y);
  if(b===_holdBoundary) return;
  clearTimeout(_holdTimer); _holdTimer=0; _holdBoundary=b;
  if(b!==null) _holdTimer=setTimeout(()=>{ _holdTimer=0; if(_dragKey&&_holdBoundary===b) openRowInsert(b); },ROW_HOLD_MS);
}
function openRowInsert(at){
  const pos=state.ui.chartPos, pre={};
  CHART_KEYS.forEach(k=>{ pre[k]={...pos[k]}; });
  CHART_KEYS.forEach(k=>{ if(pos[k].r>=at) pos[k]={r:pos[k].r+1,c:pos[k].c}; });
  _pendingInsert={at,pre};
  layoutChartGrid();
}
function cancelRowInsert(){
  clearTimeout(_holdTimer); _holdTimer=0; _holdBoundary=null;
  if(!_pendingInsert) return;
  state.ui.chartPos=_pendingInsert.pre; _pendingInsert=null;
  layoutChartGrid();
}
// Close any row that no chart (shown or not) sits in, so a chart moved out of a row does not leave an empty row behind.
function compactChartRows(){
  const pos=state.ui.chartPos, used=[...new Set(CHART_KEYS.map(k=>pos[k].r))].sort((a,b)=>a-b);
  if(used.every((r,i)=>r===i)) return;
  const map=new Map(used.map((r,i)=>[r,i]));
  CHART_KEYS.forEach(k=>{ pos[k]={r:map.get(pos[k].r),c:pos[k].c}; });
}
function dragScrollTarget(grid){
  const col=grid.closest('.chart-col');
  if(col&&col.scrollHeight>col.clientHeight+1&&/auto|scroll/.test(getComputedStyle(col).overflowY)) return col;
  return null;   // the window scrolls
}
function dragAutoScrollStep(){
  _dragRaf=0;
  if(!_dragKey||_dragY==null) return;
  const grid=document.getElementById('chartGrid'), col=dragScrollTarget(grid);
  const top=col?Math.max(0,col.getBoundingClientRect().top):0, bottom=col?Math.min(window.innerHeight,col.getBoundingClientRect().bottom):window.innerHeight;
  const ZONE=70, MAX=22;
  let dy=0;
  if(_dragY<top+ZONE) dy=-Math.ceil(MAX*Math.min(1,(top+ZONE-_dragY)/ZONE));
  else if(_dragY>bottom-ZONE) dy=Math.ceil(MAX*Math.min(1,(_dragY-(bottom-ZONE))/ZONE));
  if(dy){ const before=col?col.scrollTop:null; if(col) col.scrollTop+=dy; if(!col||col.scrollTop===before) window.scrollBy(0,dy); }   // the column first; the window when the column is at its end (or does not scroll)
  _dragRaf=requestAnimationFrame(dragAutoScrollStep);   // keep going while the pointer rests in the edge zone (dragover stops firing then in some browsers)
}
function buildChartPanels(){
  const grid=document.getElementById('chartGrid'); if(!grid||grid.dataset.built) return;
  grid.dataset.built='1';
  CHART_PANELS.forEach(def=>{
    const el=document.createElement('div');
    el.className='chart-panel'; el.dataset.key=def.key;
    el.innerHTML=
      `<div class="cp-head" draggable="true" title="Drag to move this chart to another spot">
         <div class="cp-title"><span class="cp-grip" aria-hidden="true">⠿</span>${def.title}</div>
         <label class="hide-cb"><input type="checkbox" data-chart-hide="${def.key}" autocomplete="off" onchange="onChartHide('${def.key}',this.checked)">Hide</label>
       </div>
       <div class="cp-tools"><button type="button" class="rescale-btn" onclick="rescaleChart('${def.key}')">↕ Rescale</button>${def.tools||''}</div>
       <div class="cp-body">${def.body||''}<canvas id="${def.key}Chart"></canvas></div>`;
    grid.appendChild(el);
  });
  // Drag and drop. Dragging starts only from a title bar (the chart itself keeps its hover popups); the whole panel is shown as the drag image.
  grid.addEventListener('dragstart',e=>{
    const head=e.target.closest&&e.target.closest('.cp-head'); if(!head) return;
    const panel=head.closest('.chart-panel'); _dragKey=panel.dataset.key;
    try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',_dragKey); e.dataTransfer.setDragImage(panel,16,16); }catch(_){}
    panel.classList.add('dragging'); document.body.classList.add('chart-dragging');
    _dragY=e.clientY; if(!_dragRaf) _dragRaf=requestAnimationFrame(dragAutoScrollStep);
    if(typeof ciHide==='function') ciHide();
  });
  grid.addEventListener('dragend',()=>{
    _dragKey=null; cancelRowInsert(); _dragY=null; if(_dragRaf){ cancelAnimationFrame(_dragRaf); _dragRaf=0; } document.body.classList.remove('chart-dragging');
    grid.querySelectorAll('.dragging,.drop-ok').forEach(n=>n.classList.remove('dragging','drop-ok'));
  });
  const cellOf=e=>{ const t=e.target.closest&&e.target.closest('.chart-cell, .chart-panel'); if(!t||!grid.contains(t)) return null;
    if(t.classList.contains('chart-cell')) return {el:t, r:+t.dataset.r, c:+t.dataset.c};
    const p=state.ui.chartPos[t.dataset.key]; return {el:t, r:p.r, c:p.c}; };
  document.addEventListener('dragover',e=>{ if(_dragKey){ _dragY=e.clientY; dragRowHover(e.clientY); if(!_dragRaf) _dragRaf=requestAnimationFrame(dragAutoScrollStep); } });
  grid.addEventListener('dragover',e=>{
    if(!_dragKey) return;
    const t=cellOf(e); grid.querySelectorAll('.drop-ok').forEach(n=>{ if(!t||n!==t.el) n.classList.remove('drop-ok'); });
    if(!t) return;
    e.preventDefault(); try{ e.dataTransfer.dropEffect='move'; }catch(_){}
    if(!(t.el.classList.contains('chart-panel')&&t.el.dataset.key===_dragKey)) t.el.classList.add('drop-ok');
  });
  grid.addEventListener('drop',e=>{
    if(!_dragKey) return;
    const t=cellOf(e); if(!t) return;
    e.preventDefault();
    clearTimeout(_holdTimer); _holdTimer=0; _holdBoundary=null; _pendingInsert=null;   // dropped: a row opened by holding stays (the chart goes into it)
    moveChartTo(_dragKey,t.r,t.c);
    compactChartRows(); layoutChartGrid(); saveDebounced();   // (also when the chart was dropped back where it was)
  });
}
// Move a chart to cell (r,c): a free cell just takes it; a cell held by another chart swaps the two.
function moveChartTo(key,r,c){
  const pos=state.ui.chartPos, from=pos[key]; if(!from||(from.r===r&&from.c===c)) return;
  const other=CHART_KEYS.find(k=>k!==key&&pos[k].r===r&&pos[k].c===c);
  if(other) pos[other]={r:from.r,c:from.c};
  pos[key]={r,c};
  compactChartRows();
  layoutChartGrid(); saveDebounced();
}

// ── Layout ──
// Places each panel at its saved cell and fills every other cell with an empty drop target (blank, dashed only while dragging). The grid always has one
// spare row below the lowest chart so a chart can be moved to a new row.
function layoutChartGrid(){
  const grid=document.getElementById('chartGrid'); if(!grid||!grid.dataset.built||!state.ui||!state.ui.chartPos) return;
  const pos=state.ui.chartPos;
  const cols=chartCols();
  grid.style.setProperty('--cols',cols);
  let maxR=-1; CHART_KEYS.forEach(k=>{ if(chartAvail[k]) maxR=Math.max(maxR,pos[k].r); });
  const rows=maxR+2;
  const occupied=new Set();
  CHART_KEYS.forEach(k=>{
    const el=grid.querySelector('.chart-panel[data-key="'+k+'"]'); if(!el) return;
    el.style.gridRow=(pos[k].r+1); el.style.gridColumn=(pos[k].c+1);
    if(chartAvail[k]) occupied.add(pos[k].r+','+pos[k].c);
  });
  grid.querySelectorAll('.chart-cell').forEach(n=>n.remove());
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    if(occupied.has(r+','+c)) continue;
    const cell=document.createElement('div');
    cell.className='chart-cell'; cell.dataset.r=r; cell.dataset.c=c;
    cell.style.gridRow=(r+1); cell.style.gridColumn=(c+1);
    grid.appendChild(cell);
  }
}

// ── Hide ──
function applyChartHide(key,hidden){
  const el=document.querySelector('.chart-panel[data-key="'+key+'"]'); if(!el) return;
  el.classList.toggle('is-hidden',hidden);
  const body=el.querySelector('.cp-body'); if(body) body.classList.toggle('sec-hidden',hidden);   // .sec-hidden: display:none, and print.js un-hides it for printing
  const cb=el.querySelector('input[data-chart-hide]'); if(cb) cb.checked=hidden;
}
function onChartHide(key,hidden){
  if(!state.ui) state.ui={};
  if(!state.ui.chartHidden) state.ui.chartHidden=defaultChartHidden();
  state.ui.chartHidden[key]=!!hidden;
  applyChartHide(key,!!hidden);
  if(!hidden&&typeof resizeAllCharts==='function') resizeAllCharts();
  saveDebounced();
}
// Show every panel without touching state, so charts are (re)built in visible containers (a chart built inside a display:none container has no size).
// renderAll() does this, then syncChartPanels() puts every panel into the state held in `state.ui`.
function expandAllChartPanels(){
  buildChartPanels();
  CHART_KEYS.forEach(k=>{
    const el=document.querySelector('.chart-panel[data-key="'+k+'"]'); if(!el) return;
    el.classList.remove('is-hidden'); const b=el.querySelector('.cp-body'); if(b) b.classList.remove('sec-hidden');
  });
}
// Put every panel's Hide checkbox, collapse and grid cell, into the state held in `state.ui`.
function syncChartPanels(){
  buildChartPanels();
  if(!state.ui) state.ui={};
  if(!state.ui.chartHidden) state.ui.chartHidden=defaultChartHidden();
  if(state.ui.gridCols!==2&&state.ui.gridCols!==3) state.ui.gridCols=GRID_COLS_DEFAULT;
  if(!state.ui.chartPos) state.ui.chartPos=defaultChartPos(state.ui.gridCols);
  if(!state.ui.chartPosAlt) state.ui.chartPosAlt=defaultChartPos(otherGridCols(state.ui.gridCols));
  CHART_KEYS.forEach(k=>applyChartHide(k,state.ui.chartHidden[k]===undefined?CHART_DEFAULT_HIDE_KEYS.includes(k):!!state.ui.chartHidden[k]));   // a save from before a chart existed has no flag for it: its default
  layoutChartGrid();
  syncGridButton();
  if(typeof resizeAllCharts==='function') resizeAllCharts();
}
