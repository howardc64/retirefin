'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHART PANELS — every chart sits in its own panel on a 3-column grid.
//   • Hide checkbox per panel (state.ui.chartHidden[key]; default hidden). A hidden panel keeps its place as a title bar.
//   • Rescale button per panel (chartHelpers.js rescaleChart: refits the chart and every chart sharing its scale).
//   • Drag a panel by its title bar to any cell: a free cell moves it there (the vacated cell stays blank), an occupied cell swaps the two.
//     Positions are state.ui.chartPos[key] = {r,c}, saved with the plan like every other `state.ui` setting.
//   • A row of Scale buttons above the grid (state.ui.scaleLinks) ties groups of charts to one Y scale (chartHelpers.js SCALE_LINK_GROUPS).
// The panels are built once (the Chart.js instances hold their <canvas>); moving a panel only changes its grid row/column.
// ═══════════════════════════════════════════════════════════════
// key → panel title and the canvas id (`<key>Chart`). `tools` is extra control HTML for the panel's tool row.
const CHART_PANELS=[
  {key:'expense',    title:'Annual expenses',            body:'<div class="unfunded-alert" id="expenseAlert" hidden></div>'},
  {key:'incomeMagi', title:'MAGI'},
  {key:'income',     title:'Annual income'},
  {key:'incomeOrd',  title:'Taxable ordinary income'},
  {key:'incomeQual', title:'Taxable qualified income'},
  {key:'tax',        title:'Total tax',
    tools:'<label class="hide-cb"><input type="checkbox" id="viewIrmaaAsTaxToggle" autocomplete="off" onchange="viewIrmaaAsTax=this.checked;rescaleChart(\'tax\')">view IRMAA as tax</label>'},
  {key:'taxOrd',     title:'Ordinary income tax'},
  {key:'taxQual',    title:'QDIV / LTCG / NIIT tax'},
  {key:'asset',      title:'Asset value',
    body:'<div class="xscroll" id="assetXScroll" hidden><button type="button" onclick="scrollAssetX(-1)" title="Scroll the age axis back" aria-label="Scroll back">&#9664;</button><button type="button" onclick="scrollAssetX(1)" title="Scroll the age axis forward (to the IRA stretch years)" aria-label="Scroll forward">&#9654;</button></div>'},
  {key:'idgt',       title:'IDGT value'},
  {key:'assetConv',  title:'Roth conversion'},
  {key:'ss',         title:'Cumulative household SS'},
  {key:'tss',        title:'Social Security tax'}
];
// Charts with nothing to draw right now (no IDGT portfolio, no Roth conversion, Social Security off) have no panel on screen; their grid cell stays blank
// and their saved position is kept. Builders report this through setChartAvailable().
const chartAvail=Object.fromEntries(CHART_KEYS.map(k=>[k,true]));
function setChartAvailable(key, on){
  on=!!on;
  if(chartAvail[key]===on) return;
  chartAvail[key]=on;
  const el=document.querySelector('.chart-panel[data-key="'+key+'"]'); if(el) el.classList.toggle('no-data',!on);
  layoutChartGrid();
}

// ── Build ──
let _dragKey=null;
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
    if(typeof ciHide==='function') ciHide();
  });
  grid.addEventListener('dragend',()=>{
    _dragKey=null; document.body.classList.remove('chart-dragging');
    grid.querySelectorAll('.dragging,.drop-ok').forEach(n=>n.classList.remove('dragging','drop-ok'));
  });
  const cellOf=e=>{ const t=e.target.closest&&e.target.closest('.chart-cell, .chart-panel'); if(!t||!grid.contains(t)) return null;
    if(t.classList.contains('chart-cell')) return {el:t, r:+t.dataset.r, c:+t.dataset.c};
    const p=state.ui.chartPos[t.dataset.key]; return {el:t, r:p.r, c:p.c}; };
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
    moveChartTo(_dragKey,t.r,t.c);
  });
}
// Move a chart to cell (r,c): a free cell just takes it; a cell held by another chart swaps the two.
function moveChartTo(key,r,c){
  const pos=state.ui.chartPos, from=pos[key]; if(!from||(from.r===r&&from.c===c)) return;
  const other=CHART_KEYS.find(k=>k!==key&&pos[k].r===r&&pos[k].c===c);
  if(other) pos[other]={r:from.r,c:from.c};
  pos[key]={r,c};
  layoutChartGrid(); saveDebounced();
}

// ── Layout ──
// Places each panel at its saved cell and fills every other cell with an empty drop target (blank, dashed only while dragging). The grid always has one
// spare row below the lowest chart so a chart can be moved to a new row.
function layoutChartGrid(){
  const grid=document.getElementById('chartGrid'); if(!grid||!grid.dataset.built||!state.ui||!state.ui.chartPos) return;
  const pos=state.ui.chartPos;
  let maxR=-1; CHART_KEYS.forEach(k=>{ if(chartAvail[k]) maxR=Math.max(maxR,pos[k].r); });
  const rows=maxR+2;
  const occupied=new Set();
  CHART_KEYS.forEach(k=>{
    const el=grid.querySelector('.chart-panel[data-key="'+k+'"]'); if(!el) return;
    el.style.gridRow=(pos[k].r+1); el.style.gridColumn=(pos[k].c+1);
    if(chartAvail[k]) occupied.add(pos[k].r+','+pos[k].c);
  });
  grid.querySelectorAll('.chart-cell').forEach(n=>n.remove());
  for(let r=0;r<rows;r++) for(let c=0;c<CHART_COLS;c++){
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
// Put every panel's Hide checkbox, collapse and grid cell, and the Scale buttons, into the state held in `state.ui`.
function syncChartPanels(){
  buildChartPanels();
  if(!state.ui) state.ui={};
  if(!state.ui.chartHidden) state.ui.chartHidden=defaultChartHidden();
  if(!state.ui.chartPos) state.ui.chartPos=defaultChartPos();
  if(!state.ui.scaleLinks) state.ui.scaleLinks={...DEFAULT_SCALE_LINKS};
  CHART_KEYS.forEach(k=>applyChartHide(k,!!state.ui.chartHidden[k]));
  layoutChartGrid();
  syncScaleButtons();
  if(typeof resizeAllCharts==='function') resizeAllCharts();
}

// ── Scale buttons (row above the charts) ──
function syncScaleButtons(){
  const links=(state.ui&&state.ui.scaleLinks)||DEFAULT_SCALE_LINKS;
  document.querySelectorAll('#scaleBar [data-scale]').forEach(b=>{ b.setAttribute('aria-pressed',links[b.dataset.scale]?'true':'false'); });
}
