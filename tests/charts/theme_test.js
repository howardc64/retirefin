'use strict';
// Regression snapshot: loads the app's scripts (in index.html order) into a Node vm with a stub DOM and a
// recording Chart.js stand-in, drives a fixed scenario, and writes a deterministic JSON snapshot.
//   node tests/snapshot.js [out.json] [appRoot]      (defaults: tests/current.json, the folder above tests/)
const fs=require('fs'), vm=require('vm'), path=require('path');
let pass=0, fail=0; const ck=(n,c)=>{ console.log((c?'PASS ':'FAIL ')+n); c?pass++:fail++; };
const listeners=[]; let sysDark=false;
const root=process.env.PLANNER_ROOT||path.resolve(__dirname,'..','..');
const scripts=require('../../server/scripts.js').browserScripts(root);   // index.html order (server/scripts.js)
const els={};
function mkEl(id){
  const el={id, style:{}, dataset:{}, children:[], value:'', textContent:'', innerHTML:'', className:'', checked:false,
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
  constructor(canvas,config){ this.canvas=canvas; this.config=config; this.data=config.data; this.options=config.options; this.updates=0; this.destroyed=false; charts.push(this); }
  update(){ this.updates++; } destroy(){ this.destroyed=true; } resize(){ this.resized=(this.resized||0)+1; }
}
Chart.registry={plugins:{get(){return null}}}; Chart.register=()=>{}; Chart.defaults={};
const store={};
const seeded=Object.create(Math); let _n=0; seeded.random=()=>{_n=(_n*9301+49297)%233280; return (_n+1)/233281;};
const ctx={console, document, Chart, Math:seeded, JSON, Date, Number, Object, Array, String, Set, Map, Promise, parseFloat, parseInt, isFinite, isNaN,
  localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}},
  setTimeout:(f)=>0, clearTimeout(){}, requestAnimationFrame(){}, Blob:function(){}, URL:{createObjectURL(){return ''}, revokeObjectURL(){}},
  alert(){}, confirm(){return true}, prompt(){return null}, fetch:()=>Promise.reject(new Error('no fetch')), matchMedia:q=>({matches:/prefers-color-scheme: dark/.test(q)?sysDark:false, addEventListener(t,f){ if(/prefers-color-scheme: dark/.test(q)) listeners.push(f); }}), navigator:{}, location:{protocol:'file:',href:''}};
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

// ---- tests ----
run(`
state=defaultState();
state.living=90000;
const [a,b]=state.people;
a.wage.enabled=true; a.wage.amount=120000; a.wage.ar=defaultAgeRange('now',0,'custom',66);
a.ss.pia=3000; a.ss.claimAge=67; b.ss.pia=1800; b.ss.claimAge=65;
a.ira.enabled=true; a.ira.balance=900000; a.ira.conv=20000;
const p1=defaultBrokeragePortfolio(600000); p1.payExp=true; p1.basisPct=55; p1.name='Main';
a.brokerage=[p1];
`);
const LIGHT=run('CHART_THEMES.light'), DARK=run('CHART_THEMES.dark');
ck('light and dark palettes define the same keys', JSON.stringify(Object.keys(LIGHT).sort())===JSON.stringify(Object.keys(DARK).sort()));
ck('every dark colour differs from the light one (nothing left behind)', Object.keys(LIGHT).every(k=>LIGHT[k]!==DARK[k]));

// system light at start
sysDark=false; run('initChartTheme()');
ck('starts light when the system is light', run('chartThemeDark')===false && run('BRACKET_COLOR')===LIGHT.bracket && run('AXIS_GRID.color')===LIGHT.grid);
ck('the app listens for the system theme', listeners.length===1);
run('recompute()');
const idOf=id=>charts.filter(c=>c.canvas&&c.canvas.id===id&&!c.destroyed).pop();
const ordLight=JSON.stringify(idOf('incomeOrdChart').config.data.datasets.map(d=>[d.borderColor,d.label]));
const gridLight=idOf('incomeChart').config.options.scales.y.grid.color;
ck('light charts use the light bracket ink and grid', ordLight.includes(LIGHT.bracket) && gridLight===LIGHT.grid);

// the system goes dark: charts rebuilt with the dark palette
const nBefore=charts.length;
sysDark=true; listeners.forEach(f=>f({matches:true}));
ck('a system switch to dark rebuilds the charts', charts.length>nBefore && run('chartThemeDark')===true);
const ordDark=JSON.stringify(idOf('incomeOrdChart').config.data.datasets.map(d=>[d.borderColor,d.label]));
ck('dark bracket lines use the light ink', ordDark.includes(DARK.bracket) && !ordDark.includes(LIGHT.bracket));
ck('dark deduction line colour', ordDark.includes(DARK.deduction));
const incOpt=idOf('incomeChart').config.options.scales;
ck('dark grid and tick colours', incOpt.y.grid.color===DARK.grid && incOpt.y.ticks.color===DARK.axis && incOpt.y.title.color===DARK.axis);
ck('dark age axis: the older person is drawn light, not black', run(`ageAxisTick(lastProjection, lastProjection.rows[0].age0 | 0).color`)===DARK.ageOld);
ck('the old charts were destroyed, not stacked up', charts.slice(0,nBefore).every(c=>c.destroyed));
ck('Chart.js default text follows the theme', run('Chart.defaults.color')===DARK.text);
ck('the tax chart effective-rate line follows the theme', run('VZ_TAX.effRate')===DARK.effRate);

// back to light: identical to the first light drawing
sysDark=false; listeners.forEach(f=>f({matches:false}));
const ordBack=JSON.stringify(idOf('incomeOrdChart').config.data.datasets.map(d=>[d.borderColor,d.label]));
ck('back to light restores the light charts exactly', ordBack===ordLight && idOf('incomeChart').config.options.scales.y.grid.color===LIGHT.grid && run('AGE_C_OLD')===LIGHT.ageOld);

// printing is always light
sysDark=true; listeners.forEach(f=>f({matches:true}));
run('printExpandAll()');
ck('printing draws the charts in the light colours', run('CHART_THEME')===LIGHT);
run('printRestore()');
ck('and returns to dark afterwards', run('CHART_THEME')===DARK && run('chartThemeDark')===true);

console.log('theme_test: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
