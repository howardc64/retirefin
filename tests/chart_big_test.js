'use strict';
// Enlarged charts (2×2 block in the 3×N grid): layout model, displacement, row compaction, 2×N round trip, saved-file normalisation.
// Pure logic, Node 18+, no browser:  node tests/chart_big_test.js
const fs=require('fs'), vm=require('vm'), path=require('path');
const root=path.resolve(__dirname,'..');
const noEl=new Proxy(function(){}, {get:(t,p)=>p==='style'?{}:p==='classList'?{add(){},remove(){},toggle(){}}:noEl, apply:()=>noEl, set:()=>true});
const doc={getElementById:id=>id==='chartGrid'?null:noEl,createElement:()=>noEl,addEventListener(){},removeEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],body:noEl};
const ctx={console,Math,JSON,Date,Number,String,Array,Object,Set,Map,Infinity,isFinite,parseFloat,parseInt,document:doc,location:{search:''},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},sessionStorage:{getItem(){return null},setItem(){}},navigator:{},URLSearchParams,setTimeout,clearTimeout,
  alert(){ ctx.__alerts++; }, __alerts:0};
ctx.window=ctx; vm.createContext(ctx);
const load=f=>vm.runInContext(fs.readFileSync(path.join(root,'js',f),'utf8'),ctx,{filename:f});
['core/constants.js','core/helpers.js','compute/socialSecurityCalc.js','compute/rmd.js','compute/tax.js','core/state.js'].forEach(load);
vm.runInContext('function saveDebounced(){}',ctx);
load('display/chartPanels.js');
const run=c=>vm.runInContext(c,ctx);
let fails=0; const ok=(c,m)=>{ if(!c){ fails++; console.log('FAIL: '+m); } else console.log('ok:   '+m); };
const fresh=()=>run(`state=defaultState(); state.ui.gridCols=3; state.ui.chartPos=defaultChartPos(3); state.ui.chartPosAlt=defaultChartPos(2); 0`);
const cellsOf=()=>run(`JSON.stringify(Object.fromEntries([...chartOccupancy(state.ui.chartPos,chartCols())]))`);
const noOverlap=()=>run(`(()=>{ const n=CHART_KEYS.reduce((a,k)=>a+footprintCells(state.ui.chartPos[k],chartCols()).length,0); return chartOccupancy(state.ui.chartPos,chartCols()).size===n; })()`);

fresh();
run(`toggleChartBig('income')`);   // income sits at (1,0): block (1..2, 0..1)
ok(run(`state.ui.chartPos.income.s===2`),'Enlarge sets s:2');
ok(run(`state.ui.chartPos.income.r`)>=0 && noOverlap(),'no two charts share a cell after enlarging');
ok(run(`['incomeOrd','ira'].every(k=>chartSpan(state.ui.chartPos[k],3)===1)`),'displaced charts stay single-cell');
ok(run(`footprintCells(state.ui.chartPos.income,3).length`)===4,'the block covers 4 cells');
const rowsOk=run(`(()=>{ const u=[...new Set(CHART_KEYS.flatMap(k=>footprintCells(state.ui.chartPos[k],3).map(x=>x[0])))].sort((a,b)=>a-b); return u.every((r,i)=>r===i); })()`);
ok(rowsOk,'rows stay contiguous (the block\'s second row counts as used)');

run(`toggleChartBig('income')`);
ok(run(`state.ui.chartPos.income.s===undefined`),'Shrink removes s');

// anchor column clamps to 1 (a block must fit in 3 columns)
fresh(); run(`state.ui.chartPos.incomeMagi.c`);
run(`toggleChartBig('incomeMagi')`);   // MAGI at (0,2)
ok(run(`state.ui.chartPos.incomeMagi.c`)===1 && run(`state.ui.chartPos.incomeMagi.s`)===2,'a chart in column 3 enlarges to columns 2–3');
ok(noOverlap(),'no overlap after the clamp');

// second block cannot overlap the first
fresh(); run(`placeBigChart('expense',0,0)`);
ok(run(`placeBigChart('income',1,1)`)===false && run(`state.ui.chartPos.income.s`)===undefined,'a block overlapping another block is refused');
ok(run(`placeBigChart('tax',3,0)`)===true && noOverlap(),'a non-overlapping second block is accepted');

// moving a big chart / swapping rules
fresh(); run(`placeBigChart('expense',0,0); compactChartRows()`);
const other=run(`CHART_KEYS.find(k=>k!=='expense'&&state.ui.chartPos[k].r===0&&state.ui.chartPos[k].c===2)`);
const beforeBig=run(`JSON.stringify(state.ui.chartPos.expense)`);
run(`moveChartTo(${JSON.stringify(other||'incomeMagi')},0,0)`);
ok(run(`JSON.stringify(state.ui.chartPos.expense)`)===beforeBig,'a single chart dropped on the block does not move the big chart');
run(`moveChartTo('expense',2,2)`);
ok(run(`state.ui.chartPos.expense.c`)===1 && noOverlap(),'dragging the block to column 3 clamps it to column 2 and leaves no overlap');

// 2×N: dormant, restored on the way back
fresh(); run(`toggleChartBig('income')`);
run(`toggleGridCols()`);
ok(run(`chartCols()`)===2 && run(`chartSpan(state.ui.chartPos.income,2)`)===1,'in 2×N the chart is one cell');
ok(noOverlap(),'2×N layout has no overlap');
run(`toggleGridCols()`);
ok(run(`state.ui.chartPos.income.s`)===2 && noOverlap(),'back in 3×N the enlarged chart is restored');

// saved-file normalisation
fresh();
const bad=run(`JSON.stringify(normalizeChartPos({expense:{r:0,c:2,s:2},income:{r:0,c:0,s:2},tax:{r:1,c:1}},3))`);
const o=JSON.parse(bad);
ok(o.expense.c===1&&o.expense.s===2,'file: block anchored in column 3 is clamped');
ok(!o.income.s,'file: a block overlapping an earlier block loses its size');
ok(run(`(()=>{ const p=normalizeChartPos(${bad},3); return chartOccupancy(p,3).size===CHART_KEYS.reduce((a,k)=>a+footprintCells(p[k],3).length,0); })()`),'file: normalised layout has no overlap');
ok(run(`CHART_KEYS.every(k=>normalizeChartPos({},3)[k].s===undefined)`),'an older file with no s loads unchanged');

// fresh-start compaction counts the block's second row
fresh(); run(`placeBigChart('expense',0,0)`);
run(`CHART_KEYS.forEach(k=>{chartAvail[k]=true;}); chartAvail.ira=false; chartAvail.ltcg=false;`);
const comp=run(`JSON.stringify(compactPosToAvailable(state.ui.chartPos,3))`);
ok(run(`(()=>{ const p=${comp}; const u=[...new Set(CHART_KEYS.filter(k=>chartAvail[k]).flatMap(k=>footprintCells(p[k],3).map(x=>x[0])))].sort((a,b)=>a-b); return u.every((r,i)=>r===i)&&footprintCells(p.expense,3).length===4; })()`),'compactPosToAvailable keeps the block whole and rows contiguous');

console.log(fails?fails+' FAILED':'all passed'); process.exit(fails?1:0);
