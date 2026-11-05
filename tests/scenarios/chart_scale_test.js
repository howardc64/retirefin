'use strict';
// Regression snapshot: loads the app's scripts (in index.html order) into a Node vm with a stub DOM and a
// recording Chart.js stand-in, drives a fixed scenario, and writes a deterministic JSON snapshot.

const fs=require('fs'), vm=require('vm'), path=require('path');

const root=path.resolve(__dirname,'..','..');
const scripts=require('../../server/scripts.js').browserScripts(root);   // index.html order (server/scripts.js)
const els={};
function mkEl(id){
  const el={id, style:{setProperty(){},removeProperty(){}}, dataset:{}, children:[], value:'', textContent:'', innerHTML:'', className:'', checked:false,
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    addEventListener(){}, removeEventListener(){}, appendChild(c){this.children.push(c);return c}, insertBefore(c){this.children.push(c);return c},
    setAttribute(){}, getAttribute(){return null}, remove(){}, focus(){}, click(){}, querySelector(){return mkEl('q')}, querySelectorAll(){return []},
    getContext(){return new Proxy({},{get:()=>()=>({}) ,set:()=>true})}, parentNode:null, nextSibling:null, previousElementSibling:null,
    closest(){return null}, matches(){return false}};
  el.parentNode={insertBefore(c){return c},appendChild(c){return c},children:[]};
  return el;
}
const document={
  getElementById(id){ return els[id]||(els[id]=mkEl(id)); },
  createElement(t){ return mkEl(t); }, querySelector(){return mkEl('q')}, querySelectorAll(){return []},
  addEventListener(){}, body:mkEl('body'), documentElement:mkEl('html'), title:''
};
const charts=[];
class Chart{
  constructor(canvas,config){ this.canvas=canvas; this.config=config; this.data=config.data; this.options=config.options; this.updates=0; this.destroyed=false; this.ctx={}; charts.push(this); }
  update(){ this.updates++; } destroy(){ this.destroyed=true; } resize(){ this.resized=(this.resized||0)+1; }
}
Chart.registry={plugins:{get(){return null}}}; Chart.register=()=>{}; Chart.defaults={};
const store={};
// Chart transitions (chartTweenStart in display/chartHelpers.js) glide the data from the old values to the new ones over several animation frames, so right after a view switch a chart still
// holds the OLD values; flushRaf() runs the queued frames with a fake clock until every transition has ended, and the assertions below read the final state.
const rafQ=[]; let fakeNow=0, rafId=0;
const flushRaf=()=>{ for(let n=0;rafQ.length&&n<200;n++){ fakeNow+=100; const q=rafQ.splice(0); q.forEach(e=>e.f(fakeNow)); } };
const seeded=Object.create(Math); let _n=0; seeded.random=()=>{_n=(_n*9301+49297)%233280; return (_n+1)/233281;};
const ctx={console, document, Chart, Math:seeded, JSON, Date, Number, Object, Array, String, Set, Map, Promise, parseFloat, parseInt, isFinite, isNaN,
  localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}},
  setTimeout:(f)=>0, clearTimeout(){}, requestAnimationFrame(f){ rafQ.push({id:++rafId,f}); return rafId; }, cancelAnimationFrame(id){ const i=rafQ.findIndex(e=>e.id===id); if(i>=0) rafQ.splice(i,1); }, performance:{now:()=>fakeNow}, Blob:function(){}, URL:{createObjectURL(){return ''}, revokeObjectURL(){}},
  alert(){}, confirm(){return true}, prompt(){return null}, fetch:()=>Promise.reject(new Error('no fetch')), navigator:{}, location:{protocol:'file:',href:''}};
ctx.window=ctx; ctx.globalThis=ctx; ctx.self=ctx; ctx.addEventListener=()=>{};
vm.createContext(ctx);
let code='';
for(const s of scripts){ code+=`\n;/*@@${s}*/\n`+fs.readFileSync(path.join(root,s),'utf8').replace(/^'use strict';/,''); }
// top-level let/const are script-scoped inside one vm.Script — perfect, mirrors browser globals.
code+=`
;globalThis.__snap=function(){
  const st=state;
  return {get lastProjection(){return lastProjection}, get state(){return state}, set state(v){state=v}};
};
`;
vm.runInContext(code,ctx,{filename:'app-bundle.js'});
const H=vm.runInContext('__snap()',ctx);
const run=(src)=>vm.runInContext(src,ctx);

let fails=0,n=0; const ok=(c,m)=>{ n++; if(!c){ fails++; console.log('  FAIL: '+m); } else console.log('  ok: '+m); };
// Chart Y scales are saved per scenario (state.chartYMax), not in the shared `ui`.   PLANNER_ROOT=. node tests/scenarios/chart_scale_test.js
const J=code=>JSON.parse(run('JSON.stringify('+code+')'));
ctx.__plan=JSON.parse(fs.readFileSync(path.join(root,'Samples/Couple_Heir.json'),'utf8'));
run(`state=hydrateState(__plan); recompute();`);
ok(J('Object.keys(state.chartYMax).length')===J('CHART_KEYS.length')&&J('!("chartYMax" in state.ui)'),'state has chartYMax on the scenario, not in ui');
ok(J('Object.values(state.chartYMax).some(v=>v>0)'),'the first draw fitted and stored the scales on the scenario');
run(`chartYMax.income=111000; chartYMax.asset=5e6; captureChartYMax(); var A=JSON.parse(JSON.stringify(state));`);
ok(J('state.chartYMax.income')===111000&&J('state.chartYMax.asset')===5e6,'captureChartYMax stores the scales in state.chartYMax');
// scnCreate copies the scenario on screen, then B gets its own scale; switching back and forth restores each
run(`scnCreate(); chartYMax.income=222000; captureChartYMax();`);
ok(J('scnActive')==='B'&&J('state.chartYMax.income')===222000,'scenario B (a copy of A) has its own scale after Rescale-style edit');
run(`scnSwitch('A');`);
ok(J('scnActive')==='A'&&J('chartYMax.income')===111000&&J('state.chartYMax.income')===111000&&J('chartYMax.asset')===5e6,'switching to A shows A\'s own scales');
run(`scnSwitch('B');`);
ok(J('chartYMax.income')===222000&&J('state.chartYMax.income')===222000,'switching to B shows B\'s own scales');
ok(J('scnSnaps.A.chartYMax.income')===111000,'A\'s scales are kept in its snapshot');
// save and load
ok(J('hydrateState(JSON.parse(JSON.stringify(state))).chartYMax.income')===222000,'scales survive save and load');
run(`var L=JSON.parse(JSON.stringify(state)); delete L.chartYMax; L.ui.chartYMax={income:333000,asset:'junk',tax:-5}; var H=hydrateState(L);`);
ok(J('H.chartYMax.income')===333000&&J('H.chartYMax.asset')===null&&J('H.chartYMax.tax')===null&&!('chartYMax' in J('H.ui')),'older file with ui.chartYMax loads into the scenario; bad values become null');
// not an input
run(`var S1=JSON.parse(JSON.stringify(state)), S2=JSON.parse(JSON.stringify(state)); S2.chartYMax.income=999;`);
ok(J('scStateKey(S1)===scStateKey(S2)'),'scales do not change the scenario fingerprint');
ok(!('chartYMax' in J('scStateOut(S2)')),'scales are not shown to the LLM');
console.log(fails?`\n${fails} FAILED of ${n}`:`\nall ${n} passed`); process.exit(fails?1:0);
