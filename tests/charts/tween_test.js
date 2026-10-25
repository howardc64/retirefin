// chartTweenStart: values and Y-axis range move in lockstep, no animated update is used, and the end state is exact.   Run from the app folder: node tests/charts/tween_test.js
const fs = require('fs'), vm = require('vm'), root = process.argv[2] || process.cwd();
const src = fs.readFileSync(root + '/js/display/chartHelpers.js', 'utf8');
const a = src.indexOf('function chartTweenSnapshot'), b = src.indexOf('// Draw or refresh one line chart');
let q = [], now = 0, id = 0, fails = 0;
const ctx = {CHART_BASE: {animation: {duration: 450}}, charts: {}, matchMedia: () => ({matches: false}),
  requestAnimationFrame: f => { q.push(f); return ++id; }, cancelAnimationFrame: () => { q = []; }, performance: {now: () => now}};
vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + ';this.api={chartTweenSnapshot,chartTweenStart}', ctx);
const check = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };
const ups = [];
const ch = {ctx: {}, options: {scales: {y: {min: 0, max: 4}}}, data: {datasets: [{label: 'A', data: [3, 3, 3, null]}]},
  update: m => ups.push({m, max: ch.options.scales.y.max, d: ch.data.datasets[0].data.slice()})};
ctx.charts.market = ch;
const from = ctx.api.chartTweenSnapshot(ch);
ch.data.datasets[0].data.splice(0, 4, 5, 5, 5, 5); ch.options.scales.y.max = 8; // what updateChartInPlace + refresh leave behind
ctx.api.chartTweenStart('market', ch, from);
now = 1000; // the clock the frames read (performance.now): a late first frame must not eat the animation, see the block-then-frame check below
while (q.length) { const f = q.shift(); now += 50; f(now); }
const L = ups[ups.length - 1], M = ups[3];
check('every frame is a non-animated update', ups.every(u => u.m === 'none'));
check('first frame still shows the old values and axis', ups[0].max === 4 && ups[0].d[0] === 3);
check('values and axis max advance together', Math.abs((M.d[0] - 3) / 2 - (M.max - 4) / 4) < 1e-9);
check('a gap point stays empty until halfway, then takes its end value', ups[0].d[3] === null && L.d[3] === 5);
check('ends exactly on the new values and axis', L.max === 8 && L.d.join() === '5,5,5,5');
// A scenario switch keeps the main thread busy after the tween is queued, so requestAnimationFrame's timestamp (the frame's begin time) is long past when the first frame runs.
// The glide must start when that frame runs: it must not be shortened by the time the thread was blocked.
{
  ups.length = 0; q = [];
  const c2 = {ctx: {}, options: {scales: {y: {min: 0, max: 4}}}, data: {datasets: [{label: 'A', data: [3, 3]}]},
    update: m => ups.push({m, max: c2.options.scales.y.max, d: c2.data.datasets[0].data.slice()})};
  ctx.charts.market = c2;
  const f2 = ctx.api.chartTweenSnapshot(c2);
  c2.data.datasets[0].data.splice(0, 2, 5, 5); c2.options.scales.y.max = 8;
  now = 5000;
  ctx.api.chartTweenStart('market', c2, f2);
  now += 300; // recompute still running
  const first = q.shift(); first(4700); // stale timestamp, as the browser passes it
  check('a late first frame still shows the old picture (the blocked time is not used up)', ups[0].d[0] === 3 && ups[0].max === 4);
  now += 100; q.shift()(4700 + 400);
  check('100 ms into the glide it is part-way, not at the end', ups[1].d[0] > 3 && ups[1].d[0] < 4.9 && ups[1].max < 7.8);
}
process.exit(fails ? 1 : 0);
