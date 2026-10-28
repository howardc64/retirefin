'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHART PANELS — every chart sits in its own panel on a 2- or 3-column grid (the 2×N / 3×N toggle, state.ui.gridCols; default 3).
//   • Hide checkbox per panel (state.ui.chartHidden[key]; default hidden only for Annual expenses, Annual income, Total tax, Asset value, IDGT value). A hidden panel keeps its place as a title bar.
//   • Rescale button per panel (chartHelpers.js rescaleChart: refits that chart only).
//   • Drag a panel by its title bar to any cell: a free cell moves it there (the vacated cell stays blank), an occupied cell swaps the two. Holding the pointer on the gap between two rows
//     for a moment opens a blank row there to drop into; moving away without dropping closes it again.
//     Starting fresh (Reset, Start fresh, first visit) closes every row that holds no chart on screen (compactUnusedChartRows).
//     Positions are state.ui.chartPos[key] = {r,c}, saved with the plan like every other `state.ui` setting. Each grid size keeps its own arrangement
//     (state.ui.chartPos for the grid on screen, state.ui.chartPosAlt for the other one); toggleGridCols() swaps them.
//   • ⤢ Enlarge (3×N only): a chart can take a 2×2 block of cells (state.ui.chartPos[key].s = 2, anchored at its top-left cell, column 0 or 1) so an important chart is shown 4× as big with its
//     companion charts in the remaining column beside it. Charts that were in the block's other cells move to the nearest free cell. ⤡ Shrink puts it back. The flag is kept per layout
//     (dormant in 2×N: the chart is one cell there) and is saved with the plan.
//   • A row of Same-scale buttons above the grid: each click sets a group of charts to one Y scale once (chartHelpers.js SCALE_LINK_GROUPS). Scales are saved in state.ui.chartYMax.
// The panels are built once (the Chart.js instances hold their <canvas>); moving a panel only changes its grid row/column.
// ═══════════════════════════════════════════════════════════════
// key → panel title and the canvas id (`<key>Chart`). `tools` is extra control HTML for the panel's tool row.
const CHART_PANELS = [
  {key: 'expense', title: 'Annual expenses', tools: '<span class="unfunded-alert" id="expenseAlert" hidden></span>'}, // red UNFUNDED tag, right of Rescale (display/expenseChart.js)
  {key: 'incomeMagi', title: 'MAGI'},
  {key: 'income', title: 'Annual income'},
  {key: 'incomeOrd', title: 'Taxable ordinary income'},
  {key: 'incomeQual', title: 'Taxable qualified income'},
  {
    key: 'tax',
    title: 'Total tax',
    tools:
      '<label class="hide-cb"><input type="checkbox" id="viewIrmaaAsTaxToggle" autocomplete="off" onchange="toggleIrmaaAsTax(this.checked)">view IRMAA as tax</label>'
  },
  {key: 'taxOrd', title: 'Ordinary income tax'},
  {key: 'taxQual', title: 'QDIV / LTCG / NIIT tax'},
  {
    key: 'asset',
    title: 'Asset value',
    body: '<div class="xscroll" id="assetXScroll" hidden><button type="button" onclick="scrollAssetX(-1)" title="Scroll the age axis back" aria-label="Scroll back">&#9664;</button><button type="button" onclick="scrollAssetX(1)" title="Scroll the age axis forward (to the IRA stretch years)" aria-label="Scroll forward">&#9654;</button></div>'
  },
  {key: 'idgt', title: 'IDGT value'},
  {key: 'ira', title: 'IRA: RMD &amp; withdraw'},
  {key: 'ltcg', title: 'LTCG: realized sales'},
  {key: 'inhIncome', title: 'Inheritance asset income'},
  {key: 'ss', title: 'Cumulative household SS'},
  {key: 'tss', title: 'Social Security tax'},
  {key: 'inflation', title: 'Inflation rate'},
  {
    key: 'market',
    title: 'Market return %',
    tools:
      '<span class="market-nav" id="marketNav"><button type="button" class="rescale-btn" onclick="marketStep(-1)" title="Show the previous line (cycles through every asset, then all lines)" aria-label="Previous line">&#9664;</button><button type="button" class="rescale-btn" onclick="marketStep(1)" title="Show the next line (cycles through every asset, then all lines)" aria-label="Next line">&#9654;</button></span>'
  }
];
// Charts with nothing to draw right now (no IDGT portfolio, no pre-tax IRA, no portfolio or property to sell, Social Security off) have no panel on screen; their grid cell stays blank
// and their saved position is kept. Builders report this through setChartAvailable().
const chartAvail = Object.fromEntries(CHART_KEYS.map(k => [k, true]));
function setChartAvailable(key, on) {
  on = !!on;
  if (chartAvail[key] === on) return;
  chartAvail[key] = on;
  const el = document.querySelector('.chart-panel[data-key="' + key + '"]');
  if (el) el.classList.toggle('no-data', !on);
  layoutChartGrid();
}

// ── Grid size (2×N / 3×N) ──
function chartCols() {
  return state && state.ui && state.ui.gridCols === 3 ? 3 : 2;
}
// Enlarged charts: pos[k].s===2 is a 2×2 block, honoured in the 3-column grid only.
function chartSpan(p, cols) {
  return cols === 3 && p && p.s === 2 ? 2 : 1;
}
function chartIsBig(key) {
  return !!(state && state.ui && state.ui.chartPos && state.ui.chartPos[key] && chartSpan(state.ui.chartPos[key], chartCols()) > 1);
}
function footprintCells(p, cols) {
  const n = chartSpan(p, cols),
    a = [];
  for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) a.push([p.r + dr, p.c + dc]);
  return a;
}
// Map 'r,c' → chart key for every cell a chart covers (charts in `except` left out).
function chartOccupancy(pos, cols, except) {
  const m = new Map();
  CHART_KEYS.forEach(k => {
    if (except && except.includes(k)) return;
    footprintCells(pos[k], cols).forEach(([r, c]) => m.set(r + ',' + c, k));
  });
  return m;
}
// Put the charts in `keys` (single-cell) into free cells: first the `prefer` cells ('r,c' strings), then the first free cell row-major from row `fromRow`.
function relocateCharts(pos, cols, keys, prefer, fromRow) {
  const occ = chartOccupancy(pos, cols, keys);
  keys.forEach(k => {
    let cell = (prefer || []).find(x => !occ.has(x));
    if (!cell) {
      for (let r = fromRow || 0; !cell; r++)
        for (let c = 0; c < cols; c++)
          if (!occ.has(r + ',' + c)) {
            cell = r + ',' + c;
            break;
          }
    }
    const [r, c] = cell.split(',').map(Number);
    pos[k] = {r, c};
    occ.set(cell, k);
  });
}
// Make `key` a 2×2 block anchored at (r,c) (column clamped to 0..1). Charts in the block's cells move out; returns false (nothing changed) if that would displace another enlarged chart.
function placeBigChart(key, r, c) {
  const pos = state.ui.chartPos,
    cols = 3;
  c = Math.min(Math.max(c, 0), cols - 2);
  const old = pos[key],
    oldCells = old ? footprintCells(old, cols).map(x => x.join(',')) : [];
  const fresh = {r, c, s: 2},
    block = new Set(footprintCells(fresh, cols).map(x => x.join(',')));
  const displaced = CHART_KEYS.filter(k => k !== key && footprintCells(pos[k], cols).some(x => block.has(x.join(','))));
  if (displaced.some(k => pos[k].s === 2)) return false;
  pos[key] = fresh;
  relocateCharts(
    pos,
    cols,
    displaced,
    oldCells.filter(x => !block.has(x)),
    r
  );
  return true;
}
function toggleChartBig(key) {
  if (chartCols() !== 3 || !state.ui || !state.ui.chartPos) return;
  const pos = state.ui.chartPos,
    p = pos[key];
  if (!p) return;
  if (p.s === 2) pos[key] = {r: p.r, c: p.c};
  else if (!placeBigChart(key, p.r, p.c)) {
    alert('That block overlaps another enlarged chart. Shrink that one first, or move this chart.');
    return;
  }
  compactChartRows();
  layoutChartGrid();
  syncGridButton();
  if (typeof resizeAllCharts === 'function') resizeAllCharts();
  saveDebounced();
}
// Two states only. Each size keeps its own arrangement: the one on screen is state.ui.chartPos, the other waits in state.ui.chartPosAlt.
function toggleGridCols() {
  if (!state.ui) state.ui = {};
  const cur = chartCols(),
    next = otherGridCols(cur);
  const keep = normalizeChartPos(state.ui.chartPos, cur),
    other = normalizeChartPos(state.ui.chartPosAlt, next);
  state.ui.chartPos = other;
  state.ui.chartPosAlt = keep;
  state.ui.gridCols = next;
  layoutChartGrid();
  syncGridButton();
  if (typeof resizeAllCharts === 'function') resizeAllCharts();
  saveDebounced();
}
function syncGridButton() {
  const b = document.getElementById('gridToggle');
  if (!b) return;
  const cur = chartCols(),
    next = otherGridCols(cur);
  b.textContent = 'Grid: ' + cur + '\u00d7N';
  b.title = 'Charts are in a ' + cur + '-column grid. Click to switch to ' + next + ' columns (each size remembers its own arrangement).';
  b.setAttribute('aria-label', b.title);
  document.body.classList.toggle('grid-3', cur === 3);
  document.querySelectorAll('.big-btn').forEach(x => {
    const k = x.closest('.chart-panel').dataset.key,
      big = chartSpan(state.ui.chartPos && state.ui.chartPos[k], cur) === 2;
    x.textContent = big ? '\u2937 Shrink' : '\u2922 Enlarge';
    x.title = big
      ? 'Back to a single cell'
      : 'Show this chart 4\u00d7 as big (2\u00d72 cells); the charts beside it stay in the remaining column';
  });
}

// ── Build ──
let _dragKey = null;
// Auto-scroll while a panel is dragged: near the top or bottom edge of the chart column (or of the window, when the page itself scrolls) it scrolls
// that way, faster the closer the pointer is to the edge, so a chart can be dropped above or below what is on screen.
let _dragY = null,
  _dragRaf = 0;
// New blank row while dragging: hold the pointer on the gap between two chart rows (or just above the first) for HOLD_MS and a blank row opens there to drop the chart
// into. If the pointer moves away without dropping, the row closes again and the layout is exactly as it was. Dropping anywhere else also leaves no extra row.
const ROW_HOLD_MS = 450;
let _holdBoundary = null,
  _holdTimer = 0,
  _pendingInsert = null; // _pendingInsert={at, pre} while a temporary blank row is open (pre = positions before it opened)
// Vertical extent of grid row `rr` (visible panels and blank cells in it), or null.
function gridRowExtent(grid, rr) {
  let top = Infinity,
    bottom = -Infinity;
  grid.querySelectorAll('.chart-cell,.chart-panel').forEach(el => {
    let r;
    if (el.classList.contains('chart-cell')) r = +el.dataset.r;
    else {
      if (el.classList.contains('no-data')) return;
      const p = state.ui.chartPos[el.dataset.key];
      if (p && chartSpan(p, chartCols()) > 1) return;
      r = p ? p.r : -1;
    } // an enlarged panel spans two rows: its neighbours' cells give the row extents
    if (r !== rr) return;
    const b = el.getBoundingClientRect();
    top = Math.min(top, b.top);
    bottom = Math.max(bottom, b.bottom);
  });
  return top === Infinity ? null : {top, bottom};
}
// Index of the row a new blank row would be inserted before when the pointer is on a boundary (gap) at height y, else null.
function rowBoundaryAt(grid, y) {
  const pos = state.ui.chartPos,
    cols = chartCols();
  let maxR = -1;
  CHART_KEYS.forEach(k => {
    if (chartAvail[k]) maxR = Math.max(maxR, pos[k].r + chartSpan(pos[k], cols) - 1);
  });
  const SLOP = 5;
  const splitsBig = rr => CHART_KEYS.some(k => chartAvail[k] && chartSpan(pos[k], cols) > 1 && pos[k].r + 1 === rr); // no blank row inside an enlarged chart
  let prev = null;
  for (let rr = 0; rr <= maxR; rr++) {
    const e = gridRowExtent(grid, rr);
    if (!e) continue;
    if (splitsBig(rr)) {
      prev = e;
      continue;
    }
    if (prev === null) {
      if (y >= e.top - 30 && y <= e.top + SLOP) return rr;
    } else if (y >= prev.bottom - SLOP && y <= e.top + SLOP && y > prev.bottom - SLOP - 1) return rr;
    prev = e;
  }
  return null;
}
function dragRowHover(y) {
  const grid = document.getElementById('chartGrid');
  if (!grid || !_dragKey) return;
  if (_pendingInsert) {
    const e = gridRowExtent(grid, _pendingInsert.at);
    if (!e || y < e.top - 6 || y > e.bottom + 6) cancelRowInsert();
    return;
  }
  const b = rowBoundaryAt(grid, y);
  if (b === _holdBoundary) return;
  clearTimeout(_holdTimer);
  _holdTimer = 0;
  _holdBoundary = b;
  if (b !== null)
    _holdTimer = setTimeout(() => {
      _holdTimer = 0;
      if (_dragKey && _holdBoundary === b) openRowInsert(b);
    }, ROW_HOLD_MS);
}
function openRowInsert(at) {
  const pos = state.ui.chartPos,
    pre = {};
  CHART_KEYS.forEach(k => {
    pre[k] = {...pos[k]};
  });
  CHART_KEYS.forEach(k => {
    if (pos[k].r >= at) pos[k] = {...pos[k], r: pos[k].r + 1};
  });
  _pendingInsert = {at, pre};
  layoutChartGrid();
}
function cancelRowInsert() {
  clearTimeout(_holdTimer);
  _holdTimer = 0;
  _holdBoundary = null;
  if (!_pendingInsert) return;
  state.ui.chartPos = _pendingInsert.pre;
  _pendingInsert = null;
  layoutChartGrid();
}
// Close any row that no chart (shown or not) sits in, so a chart moved out of a row does not leave an empty row behind.
function compactChartRows() {
  const pos = state.ui.chartPos,
    cols = chartCols(),
    usedSet = new Set();
  CHART_KEYS.forEach(k => footprintCells(pos[k], cols).forEach(x => usedSet.add(x[0]))); // an enlarged chart uses its second row too
  const used = [...usedSet].sort((a, b) => a - b);
  if (used.every((r, i) => r === i)) return;
  const map = new Map(used.map((r, i) => [r, i]));
  CHART_KEYS.forEach(k => {
    pos[k] = {...pos[k], r: map.get(pos[k].r)};
  });
}
// Starting fresh (first visit, Start fresh, Reset to defaults): the default layout has cells for every chart, but a chart with nothing to draw (no IDGT portfolio, no pre-tax IRA, no
// property to sell …) has no panel on screen, so a row that holds only such charts would be an empty gap. Those rows are closed: every row that holds at least one chart on screen
// keeps its place (a Hidden panel still counts, it stays as a title bar) and the rows below move up. A chart without a panel keeps a free cell of its own (never on top of a chart that is
// shown), so it still has a place to appear when it gets data. Needs the chart builders to have run (chartAvail is known only after the first draw).
function compactPosToAvailable(pos, cols) {
  const avail = CHART_KEYS.filter(k => chartAvail[k]);
  const usedSet = new Set();
  avail.forEach(k => footprintCells(pos[k], cols).forEach(x => usedSet.add(x[0])));
  const used = [...usedSet].sort((a, b) => a - b);
  if (used.every((r, i) => r === i)) return pos; // no empty row: nothing to close
  const out = {},
    taken = new Set(),
    cell = (r, c) => r + ',' + c;
  avail.forEach(k => {
    const r = used.indexOf(pos[k].r);
    out[k] = {...pos[k], r};
    footprintCells(out[k], cols).forEach(x => taken.add(cell(x[0], x[1])));
  });
  CHART_KEYS.filter(k => !chartAvail[k]).forEach(k => {
    let r = used.filter(u => u < pos[k].r).length,
      c = pos[k].c;
    while (taken.has(cell(r, c))) {
      if (++c >= cols) {
        c = 0;
        r++;
      }
    }
    out[k] = {r, c};
    taken.add(cell(r, c));
  });
  return out;
}
function compactUnusedChartRows() {
  if (!state || !state.ui || !state.ui.chartPos) return;
  const cur = chartCols(),
    other = otherGridCols(cur);
  state.ui.chartPos = compactPosToAvailable(normalizeChartPos(state.ui.chartPos, cur), cur);
  state.ui.chartPosAlt = compactPosToAvailable(normalizeChartPos(state.ui.chartPosAlt || defaultChartPos(other), other), other);
  layoutChartGrid();
}
function dragScrollTarget(grid) {
  const col = grid.closest('.chart-col');
  if (col && col.scrollHeight > col.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(col).overflowY)) return col;
  return null; // the window scrolls
}
function dragAutoScrollStep() {
  _dragRaf = 0;
  if (!_dragKey || _dragY == null) return;
  const grid = document.getElementById('chartGrid'),
    col = dragScrollTarget(grid);
  const top = col ? Math.max(0, col.getBoundingClientRect().top) : 0,
    bottom = col ? Math.min(window.innerHeight, col.getBoundingClientRect().bottom) : window.innerHeight;
  const ZONE = 70,
    MAX = 22;
  let dy = 0;
  if (_dragY < top + ZONE) dy = -Math.ceil(MAX * Math.min(1, (top + ZONE - _dragY) / ZONE));
  else if (_dragY > bottom - ZONE) dy = Math.ceil(MAX * Math.min(1, (_dragY - (bottom - ZONE)) / ZONE));
  if (dy) {
    const before = col ? col.scrollTop : null;
    if (col) col.scrollTop += dy;
    if (!col || col.scrollTop === before) window.scrollBy(0, dy);
  } // the column first; the window when the column is at its end (or does not scroll)
  _dragRaf = requestAnimationFrame(dragAutoScrollStep); // keep going while the pointer rests in the edge zone (dragover stops firing then in some browsers)
}
function buildChartPanels() {
  const grid = document.getElementById('chartGrid');
  if (!grid || grid.dataset.built) return;
  grid.dataset.built = '1';
  CHART_PANELS.forEach(def => {
    const el = document.createElement('div');
    el.className = 'chart-panel';
    el.dataset.key = def.key;
    el.innerHTML = `<div class="cp-head" draggable="true" title="Drag to move this chart to another spot">
         <div class="cp-title"><span class="cp-grip" aria-hidden="true">⠿</span>${def.title}</div>
         <label class="hide-cb"><input type="checkbox" data-chart-hide="${def.key}" autocomplete="off" onchange="onChartHide('${def.key}',this.checked)">Hide</label>
       </div>
       <div class="cp-tools"><button type="button" class="rescale-btn" onclick="rescaleChart('${def.key}')">↕ Rescale</button><button type="button" class="rescale-btn big-btn" onclick="toggleChartBig('${def.key}')">\u2922 Enlarge</button>${def.tools || ''}</div>
       <div class="cp-body">${def.body || ''}<canvas id="${def.key}Chart"></canvas></div>`;
    grid.appendChild(el);
  });
  // Drag and drop. Dragging starts only from a title bar (the chart itself keeps its hover popups); the whole panel is shown as the drag image.
  grid.addEventListener('dragstart', e => {
    const head = e.target.closest && e.target.closest('.cp-head');
    if (!head) return;
    const panel = head.closest('.chart-panel');
    _dragKey = panel.dataset.key;
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dragKey);
      e.dataTransfer.setDragImage(panel, 16, 16);
    } catch (_) {}
    // The layout-changing class (it reveals the spare bottom row and the empty-cell outlines) is added AFTER the browser has started the drag: changing the layout inside dragstart
    // can make it cancel the drag at once, and that happened when the charts were short (e.g. all collapsed): the spare row made the column scroll, the new scrollbar narrowed the grid
    // and the card moved from under the pointer. (.chart-col also reserves its scrollbar gutter now, so nothing reflows sideways.)
    setTimeout(() => {
      if (_dragKey === panel.dataset.key) {
        panel.classList.add('dragging');
        document.body.classList.add('chart-dragging');
      }
    }, 0);
    _dragY = e.clientY;
    if (!_dragRaf) _dragRaf = requestAnimationFrame(dragAutoScrollStep);
    if (typeof ciHide === 'function') ciHide();
  });
  grid.addEventListener('dragend', () => {
    _dragKey = null;
    cancelRowInsert();
    _dragY = null;
    if (_dragRaf) {
      cancelAnimationFrame(_dragRaf);
      _dragRaf = 0;
    }
    document.body.classList.remove('chart-dragging');
    grid.querySelectorAll('.dragging,.drop-ok').forEach(n => n.classList.remove('dragging', 'drop-ok'));
  });
  const cellOf = e => {
    const t = e.target.closest && e.target.closest('.chart-cell, .chart-panel');
    if (!t || !grid.contains(t)) return null;
    if (t.classList.contains('chart-cell')) return {el: t, r: +t.dataset.r, c: +t.dataset.c};
    const p = state.ui.chartPos[t.dataset.key];
    return {el: t, r: p.r, c: p.c};
  };
  document.addEventListener('dragover', e => {
    if (_dragKey) {
      _dragY = e.clientY;
      dragRowHover(e.clientY);
      if (!_dragRaf) _dragRaf = requestAnimationFrame(dragAutoScrollStep);
    }
  });
  grid.addEventListener('dragover', e => {
    if (!_dragKey) return;
    const t = cellOf(e);
    grid.querySelectorAll('.drop-ok').forEach(n => {
      if (!t || n !== t.el) n.classList.remove('drop-ok');
    });
    if (!t) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch (_) {}
    if (!(t.el.classList.contains('chart-panel') && t.el.dataset.key === _dragKey)) t.el.classList.add('drop-ok');
  });
  grid.addEventListener('drop', e => {
    if (!_dragKey) return;
    const t = cellOf(e);
    if (!t) return;
    e.preventDefault();
    clearTimeout(_holdTimer);
    _holdTimer = 0;
    _holdBoundary = null;
    _pendingInsert = null; // dropped: a row opened by holding stays (the chart goes into it)
    moveChartTo(_dragKey, t.r, t.c);
    compactChartRows();
    layoutChartGrid();
    saveDebounced(); // (also when the chart was dropped back where it was)
  });
}
// Move a chart to cell (r,c): a free cell just takes it; a cell held by another chart swaps the two.
function moveChartTo(key, r, c) {
  const pos = state.ui.chartPos,
    from = pos[key],
    cols = chartCols();
  if (!from) return;
  if (chartSpan(from, cols) > 1) {
    // an enlarged chart: its block is anchored at (r,c) (column clamped); charts in the block move to the cells it vacated, or the nearest free ones
    c = Math.min(c, cols - 2);
    if (from.r === r && from.c === c) return;
    if (!placeBigChart(key, r, c)) return; // would displace another enlarged chart: refused
  } else {
    if (from.r === r && from.c === c) return;
    const other = chartOccupancy(pos, cols, [key]).get(r + ',' + c);
    if (other && chartSpan(pos[other], cols) > 1) return; // a single chart cannot swap with an enlarged one (move the enlarged chart instead)
    if (other) pos[other] = {r: from.r, c: from.c};
    pos[key] = {r, c};
  }
  compactChartRows();
  layoutChartGrid();
  saveDebounced();
}

// ── Layout ──
// Places each panel at its saved cell and fills every other cell with an empty drop target (blank, dashed only while dragging). The grid always has one
// spare row below the lowest chart so a chart can be moved to a new row.
function layoutChartGrid() {
  const grid = document.getElementById('chartGrid');
  if (!grid || !grid.dataset.built || !state.ui || !state.ui.chartPos) return;
  const pos = state.ui.chartPos;
  const cols = chartCols();
  grid.style.setProperty('--cols', cols);
  let maxR = -1;
  CHART_KEYS.forEach(k => {
    if (chartAvail[k]) maxR = Math.max(maxR, pos[k].r + chartSpan(pos[k], cols) - 1);
  });
  const rows = maxR + 2;
  const occupied = new Set();
  CHART_KEYS.forEach(k => {
    const el = grid.querySelector('.chart-panel[data-key="' + k + '"]');
    if (!el) return;
    const n = chartSpan(pos[k], cols);
    el.style.setProperty('--gr', pos[k].r + 1 + ' / span ' + n);
    el.style.setProperty('--gc', pos[k].c + 1 + ' / span ' + n); // CSS variables, so the narrow-window rule can still put every panel in one column
    el.classList.toggle('is-big', n > 1);
    if (chartAvail[k]) footprintCells(pos[k], cols).forEach(x => occupied.add(x[0] + ',' + x[1]));
  });
  grid.querySelectorAll('.chart-cell').forEach(n => n.remove());
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (occupied.has(r + ',' + c)) continue;
      const cell = document.createElement('div');
      cell.className = 'chart-cell' + (r === rows - 1 ? ' tail' : '');
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.style.gridRow = r + 1;
      cell.style.gridColumn = c + 1;
      grid.appendChild(cell);
    }
}

// ── Hide ──
function applyChartHide(key, hidden) {
  const el = document.querySelector('.chart-panel[data-key="' + key + '"]');
  if (!el) return;
  el.classList.toggle('is-hidden', hidden);
  const body = el.querySelector('.cp-body');
  if (body) body.classList.toggle('sec-hidden', hidden); // .sec-hidden: display:none, and print.js un-hides it for printing
  const cb = el.querySelector('input[data-chart-hide]');
  if (cb) cb.checked = hidden;
}
function onChartHide(key, hidden) {
  if (!state.ui) state.ui = {};
  if (!state.ui.chartHidden) state.ui.chartHidden = defaultChartHidden();
  state.ui.chartHidden[key] = !!hidden;
  applyChartHide(key, !!hidden);
  if (!hidden && typeof resizeAllCharts === 'function') resizeAllCharts();
  saveDebounced();
}
// Show every panel without touching state, so charts are (re)built in visible containers (a chart built inside a display:none container has no size).
// renderAll() does this, then syncChartPanels() puts every panel into the state held in `state.ui`.
function expandAllChartPanels() {
  buildChartPanels();
  CHART_KEYS.forEach(k => {
    const el = document.querySelector('.chart-panel[data-key="' + k + '"]');
    if (!el) return;
    el.classList.remove('is-hidden');
    const b = el.querySelector('.cp-body');
    if (b) b.classList.remove('sec-hidden');
  });
}
// Put every panel's Hide checkbox, collapse and grid cell, into the state held in `state.ui`.
function syncChartPanels() {
  buildChartPanels();
  if (!state.ui) state.ui = {};
  if (!state.ui.chartHidden) state.ui.chartHidden = defaultChartHidden();
  if (state.ui.gridCols !== 2 && state.ui.gridCols !== 3) state.ui.gridCols = GRID_COLS_DEFAULT;
  if (!state.ui.chartPos) state.ui.chartPos = defaultChartPos(state.ui.gridCols);
  if (!state.ui.chartPosAlt) state.ui.chartPosAlt = defaultChartPos(otherGridCols(state.ui.gridCols));
  CHART_KEYS.forEach(k =>
    applyChartHide(k, state.ui.chartHidden[k] === undefined ? CHART_DEFAULT_HIDE_KEYS.includes(k) : !!state.ui.chartHidden[k])
  ); // a save from before a chart existed has no flag for it: its default
  layoutChartGrid();
  syncGridButton();
  if (typeof resizeAllCharts === 'function') resizeAllCharts();
}
