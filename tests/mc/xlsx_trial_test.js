'use strict';
// Excel export of a Monte Carlo trial: the workbook must be the trial, with live formulas that follow the trial's own path.
// Node only (a minimal stand-in for the SheetJS cell helpers; nothing is written to disk).
//   PLAN=Samples/MFJ.json node tests/mc/xlsx_trial_test.js
// (An end-to-end check — recalculating the exported file in Excel / LibreOffice and comparing every formula cell with the app's value — is described in tests/README.md.)
const fs=require('fs'), vm=require('vm'), path=require('path');
const root=path.resolve(__dirname,'..','..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]).filter(s=>!/^https?:/.test(s));
const els={};
function mkEl(id){
  const el={id, style:{setProperty(){},removeProperty(){}}, dataset:{}, children:[], value:'', textContent:'', innerHTML:'', className:'', checked:false,
    classList:{add(){},remove(){},toggle(){},contains(){return false}}, addEventListener(){}, removeEventListener(){}, appendChild(c){this.children.push(c);return c}, insertBefore(c){this.children.push(c);return c},
    setAttribute(){}, getAttribute(){return null}, remove(){}, focus(){}, click(){}, querySelector(){return mkEl('q')}, querySelectorAll(){return []},
    getContext(){return new Proxy({},{get:()=>()=>({}) ,set:()=>true})}, parentNode:null, nextSibling:null, previousElementSibling:null, closest(){return null}, matches(){return false}};
  el.parentNode={insertBefore(c){return c},appendChild(c){return c},children:[]}; return el;
}
const document={getElementById(id){return els[id]||(els[id]=mkEl(id));}, createElement(t){return mkEl(t);}, querySelector(){return mkEl('q')}, querySelectorAll(){return []}, addEventListener(){}, body:mkEl('body'), documentElement:mkEl('html'), title:''};
class Chart{ constructor(c,cfg){this.canvas=c;this.config=cfg;this.data=cfg.data;this.options=cfg.options;} update(){} destroy(){} resize(){} }
Chart.registry={plugins:{get(){return null}}}; Chart.register=()=>{}; Chart.defaults={};
Object.defineProperty(Chart.prototype,'chartArea',{get(){return {left:0,right:500,top:0,bottom:300};}});
Object.defineProperty(Chart.prototype,'scales',{get(){return {x:{getPixelForValue:i=>i*5,getValueForPixel:p=>p/5},y:{id:'y',getPixelForValue:v=>300-v/1000,getValueForPixel:p=>(300-p)*1000}};}});
Chart.prototype.getDatasetMeta=function(i){const ds=this.data.datasets[i];return {yAxisID:'y',data:ds.data.map((v,j)=>({x:j*5,y:300-(v||0)/1000,skip:v==null}))};};
const colL=n=>{ let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; };
const XLSX={utils:{
  encode_cell:({r,c})=>colL(c)+(r+1),
  decode_cell:a=>{ const m=/^([A-Z]+)(\d+)$/.exec(a); let c=0; for(const ch of m[1]) c=c*26+ch.charCodeAt(0)-64; return {r:+m[2]-1,c:c-1}; },
  encode_range:({s,e})=>colL(s.c)+(s.r+1)+':'+colL(e.c)+(e.r+1)}};
const store={};
const ctx={console,document,Chart,XLSX,Math,JSON,Date,Number,Object,Array,String,Set,Map,Promise,parseFloat,parseInt,isFinite,isNaN,
  localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}},
  setTimeout:()=>0,clearTimeout(){},requestAnimationFrame(){},Blob:function(){},URL:{createObjectURL(){return ''},revokeObjectURL(){}},
  alert(){},confirm(){return true},prompt(){return null},fetch:()=>Promise.reject(new Error('no fetch')),navigator:{},location:{protocol:'file:',href:''}};
ctx.window=ctx; ctx.globalThis=ctx; ctx.self=ctx; ctx.addEventListener=()=>{};
vm.createContext(ctx);
let code=''; for(const s of scripts) code+=`\n;/*@@${s}*/\n`+fs.readFileSync(path.join(root,s),'utf8').replace(/^'use strict';/,'');
vm.runInContext(code,ctx,{filename:'app.js'});
const run=s=>vm.runInContext(s,ctx);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };

ctx.__plan=JSON.parse(fs.readFileSync(path.resolve(process.env.PLAN||path.join(root,'Samples/MFJ.json')),'utf8'));
run(`state=hydrateState(__plan); recompute();`);
const cell=(sheet,a)=>sheet.ws[a];
const sheetOf=(b,n)=>b.sheets.find(s=>s.name===n);
const colOf=(s,head)=>{ const i=s._cols.findIndex(c=>c.key===head); return i<0?null:colL(i); };

// ── a plan: no trial sheet, constant-rate formulas ──
ok(run(`xlsxTrialContext()`)===null,'plan on screen: no trial context');
run(`globalThis.__b=xlsxBuildWorkbook(lastProjection,xlsxTrialContext())`);
let b=ctx.__b, main=sheetOf(b,'Projection by year');
ok(!sheetOf(b,'MC trial'),'plan workbook has no "MC trial" sheet');
ok(/Inflation/.test(cell(main,colOf(main,'f')+'5').f),'plan deflator is (1+Inflation)^-(year-BaseYear): '+cell(main,colOf(main,'f')+'5').f);
const irPlan=b.sheets.find(s=>/Pre-tax IRA/.test(s.name));
ok(irPlan&&Object.keys(irPlan.ws).some(a=>a[0]!=='!'&&cell(irPlan,a).f&&/\$B\$2/.test(cell(irPlan,a).f)),'plan IRA roll-forward uses the constant rate $B$2');

// ── a trial ──
run(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); cfg.ltc.prob=0.9; cfg.returns.volEquity=24; const res=[]; for(let t=0;t<120;t++) res.push(mcRunTrial(cfg,t));
  mcResults={cfg,S:mcSummarize(res),R:mcFailureReasons(res),complete:true,results:res}; mcStateAtRun=mcPlanKey(); })()`);
const tr=run(`mcResults.R.list[0].trial`); run(`mcLoadTrial(${tr})`);
const T=run(`xlsxTrialContext()`);
ok(T&&T.n===tr+1&&T.view==='B','trial on screen: context carries trial #'+(tr+1));
run(`globalThis.__b=xlsxBuildWorkbook(lastProjection,xlsxTrialContext())`);
b=ctx.__b; main=sheetOf(b,'Projection by year');
const names=b.sheets.map(s=>s.name);
ok(names[2]==='MC trial'&&names[3]==='Projection by year','"MC trial" sheet sits between Tax tables and Projection by year');
const mc=sheetOf(b,'MC trial');
const pr=run(`lastProjection`), n=run(`lastProjection.rows.length`);
// the deflator the tax chain reads is 1 / the trial's price level
const fcol=colOf(main,'f'), dcol=colOf(mc,'defl'), pcol=colOf(mc,'pi'), ccol=colOf(mc,'cpi');
ok(cell(main,fcol+'5').f==="'MC trial'!$"+dcol+'$5' && cell(main,fcol+(4+n)).f==="'MC trial'!$"+dcol+'$'+(4+n),'Projection deflator reads the MC trial sheet in every row');
const infl=run(`lastProjection.inflRate`); let cpi=1, worst=0;
for(let k=0;k<n;k++){ worst=Math.max(worst,Math.abs(cell(mc,ccol+(5+k)).v-cpi), Math.abs(cell(mc,pcol+(5+k)).v-infl[k]), Math.abs(cell(main,fcol+(5+k)).v-1/cpi)); cpi*=1+infl[k]; }
ok(worst<1e-12,'cached price level / inflation / deflator equal the trial\'s own path (max diff '+worst.toExponential(1)+')');
ok(Math.max(...infl)-Math.min(...infl)>1e-4,'the trial\'s inflation actually varies by year');
ok(cell(mc,ccol+'6').f===`${ccol}5*(1+${pcol}5)`,'price level is a formula: prior level × (1 + prior inflation)');
// account sheets compound with the yearly rates, not $B$2
const ir=b.sheets.find(s=>/Pre-tax IRA/.test(s.name)), gcol=colOf(ir,'g'), balc=colOf(ir,'bal');
ok(!!gcol,'IRA sheet has a "Real growth this year" column');
const balFs=Object.keys(ir.ws).filter(a=>a[0]!=='!'&&a.startsWith(balc)&&/^\D+\d+$/.test(a)&&cell(ir,a).f).map(a=>cell(ir,a).f);
ok(balFs.length>5&&balFs.every(f=>!/\$B\$2/.test(f)&&f.includes(gcol)),'IRA balance chain is live and reads the yearly growth ('+balFs.length+' formulas)');
ok(/^'MC trial'!\$/.test(cell(ir,gcol+ir._t.firstRow).f),'the yearly growth cell links to the MC trial sheet: '+cell(ir,gcol+ir._t.firstRow).f);
const gm=colOf(mc,'g0'), fm=colOf(mc,'F0');
ok(cell(mc,gm+'5').f.includes(fm+'5')&&cell(mc,gm+'5').f.includes('Inputs!'),'MC growth = (1 + plan rate from Inputs) × shock factor − 1: '+cell(mc,gm+'5').f);
// Inputs: the trial's draws, not the plan's
const inp=sheetOf(b,'Inputs'), tState=run(`mcTrialView.state`), pid=run(`mcTrialView.state.people[0].id`);
const passCell=Object.keys(inp.ws).find(a=>a[0]!=='!'&&cell(inp,a).t==='s'&&cell(inp,a).v==='Passing age (plan ends)');
const passVal=cell(inp,'B'+passCell.slice(1)).v, trialPass=tState.passing[pid], planPass=run(`state.passing[state.people[0].id]`);
ok(passVal===trialPass,'Inputs shows the trial\'s drawn passing age ('+passVal+'), the plan\'s is '+planPass);
// every cached formula value of the trial is a finite number or text (nothing NaN reached the sheet)
const bad=[]; b.sheets.forEach(s=>Object.keys(s.ws).forEach(a=>{ if(a[0]==='!') return; const c=s.ws[a]; if(c.f&&c.t==='n'&&!isFinite(c.v)) bad.push(s.name+'!'+a); }));
ok(bad.length===0,'no NaN / Infinity cached in any formula cell'+(bad.length?': '+bad.slice(0,5):''));
// A view = the plan again
run(`mcAbSet('A')`); ok(run(`xlsxTrialContext()`)===null,'flipping to A: the export is the plan again');
run(`mcTrialExit()`);
console.log(fails?fails+' FAILED':'all passed'); process.exit(fails?1:0);
