'use strict';
// Regression snapshot: loads the app's scripts (in index.html order) into a Node vm with a stub DOM and a
// recording Chart.js stand-in, drives a fixed scenario, and writes a deterministic JSON snapshot.
//   node tests/snapshot.js [out.json] [appRoot]      (defaults: tests/current.json, the folder above tests/)
const fs=require('fs'), vm=require('vm'), path=require('path');
const out=process.argv[2]||path.join(__dirname,'current.json');
const root=process.argv[3]||path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]).filter(s=>!/^https?:/.test(s));
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

// ---- scenario ----
run(`
state=defaultState();
state.living=90000; state.scgl=20000; state.aumFee={mode:'pct',value:0.75};
state.futureTax={enabled:true,niitStartYear:THIS_YEAR+8,niitSingle:400000,niitMarried:500000};
const [a,b]=state.people;
a.wage.enabled=true; a.wage.amount=120000; a.wage.ar=defaultAgeRange('now',0,'custom',66);
a.ss.pia=3000; a.ss.claimAge=67; b.ss.pia=1800; b.ss.claimAge=65;
a.pension.enabled=true; a.pension.amount=24000; b.rental.enabled=true; b.rental.amount=18000;
a.ira.enabled=true; a.ira.balance=900000; a.ira.aum=true; a.ira.stretch=true; a.ira.conv=20000;
b.roth.enabled=true; b.roth.balance=250000; b.roth.stretch=true;
const p1=defaultBrokeragePortfolio(600000); p1.payExp=true; p1.aum=true; p1.basisPct=55; p1.foreignPct=10; p1.name='Main';
const p2=defaultBrokeragePortfolio(300000); p2.idgt=true; p2.payExp=true; p2.basisPct=30; p2.name='Trust';
a.brokerage=[p1]; b.brokerage=[p2];
recompute();
`);

function ser(v,depth=0){
  if(typeof v==='function') return '[fn]';
  if(v&&typeof v==='object'){
    if(depth>8) return '[deep]';
    if(Array.isArray(v)) return v.map(x=>ser(x,depth+1));
    const o={}; for(const k of Object.keys(v).sort()) if(k!=='canvas') o[k]=ser(v[k],depth+1); return o;
  }
  if(typeof v==='number') return Math.round(v*1e6)/1e6;
  return v;
}
function tipDump(chart){
  const cb=chart.options&&chart.options.plugins&&chart.options.plugins.tooltip&&chart.options.plugins.tooltip.callbacks;
  if(!cb) return null;
  const n=(chart.data.labels||[]).length, res=[];
  for(const idx of [0,Math.floor(n/4),Math.floor(n/2),Math.floor(3*n/4),n-1]){
    const items=chart.data.datasets.map((d,di)=>({dataIndex:idx,datasetIndex:di,dataset:d,raw:d.data[idx],parsed:{y:d.data[idx]},label:d.label,chart}));
    const self={chart,dataPoints:items};
    const r={idx};
    for(const kind of ['title','afterBody','footer']){ try{ r[kind]=cb[kind]?cb[kind].call(self,items):null; }catch(e){ r[kind]='ERR '+e.message; } }
    r.labels=items.map(it=>{ try{ return cb.label?cb.label.call(self,it):null; }catch(e){ return 'ERR '+e.message; } });
    res.push(r);
  }
  return res;
}
const snap={charts:charts.map(c=>({canvasId:c.canvas&&c.canvas.id, config:ser(c.config), tips:ser(tipDump(c))}))};
snap.legends=Object.fromEntries(Object.keys(els).filter(k=>/Legend$/.test(k)).sort().map(k=>[k,els[k].innerHTML]));
snap.notes=Object.fromEntries(Object.keys(els).filter(k=>/Note|Gain$/.test(k)).sort().map(k=>[k,els[k].textContent]));
snap.yMax=ser(run('chartYMax'));
snap.ssSub=els['ssSecSub']&&els['ssSecSub'].innerHTML; snap.ssMetrics=els['ssMetrics']&&els['ssMetrics'].innerHTML;
snap.futureTaxPanel=els['futureTaxPanel']&&els['futureTaxPanel'].innerHTML;
snap.people=els['perPersonIncome']&&els['perPersonIncome'].innerHTML.replace(/id="[^"]*"|[0-9a-f]{6,}/g,'');
snap.proj=ser(H.lastProjection.rows.slice(0,40));

// second pass: mutate state and re-render to exercise the update-in-place path, then rescale + destroy
run(`state.living=60000; state.people[0].ss.claimAge=70; recompute(); rescaleChart('tax'); rescaleChart('asset');`);
snap.after={charts:charts.map(c=>({canvasId:c.canvas&&c.canvas.id, updates:c.updates, data:ser(c.data)})), yMax:ser(run('chartYMax'))};
run(`resizeAllCharts(); destroyCharts();`);
snap.destroyed=charts.map(c=>({id:c.canvas&&c.canvas.id,destroyed:c.destroyed,resized:c.resized||0}));
snap.afterDestroyGlobals=run(`Object.values(charts).map(x=>x===null)`);
run(`recompute();`);
snap.rebuilt=charts.length;
fs.writeFileSync(out,JSON.stringify(snap,null,1));
console.log('snapshot written:',out,'('+charts.length+' Chart instances,',Math.round(fs.statSync(out).size/1024)+' KB)');
