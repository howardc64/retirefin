'use strict';
// Excel export of the spending guardrails and the late-life medical shock: Inputs rows, Projection columns, live formulas and their cached values.
// Node only (a minimal stand-in for the SheetJS cell helpers; nothing is written to disk).
//   PLAN=Samples/Couple_Heir.json node tests/mc/xlsx_guardrail_test.js
// (The end-to-end check, recalculating the exported file in LibreOffice and comparing every formula cell with the app's value: tests/xlsx_e2e/README.md.)
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

ctx.__plan=JSON.parse(fs.readFileSync(path.resolve(process.env.PLAN||path.join(root,'Samples/Couple_Heir.json')),'utf8'));
const cell=(sheet,a)=>sheet.ws[a];
const sheetOf=(b,n)=>b.sheets.find(s=>s.name===n);
const colOf=(s,key)=>{ const i=s._cols.findIndex(c=>c.key===key); return i<0?null:colL(i); };
const build=patch=>{ ctx.__patch=patch; run(`state=hydrateState(__plan); Object.assign(state.guardrail,__patch.guardrail||{}); Object.assign(state.medShock,__patch.medShock||{}); recompute(); globalThis.__b=xlsxBuildWorkbook(lastProjection,xlsxTrialContext())`); return ctx.__b; };
const inputsText=b=>{ const sh=sheetOf(b,'Inputs'); return Object.keys(sh.ws).filter(a=>a[0]!=='!').map(a=>String(sh.ws[a].v)); };

// 1. off: nothing is added
let b=build({guardrail:{enabled:false},medShock:{enabled:false}}), main=sheetOf(b,'Projection by year');
ok(!colOf(main,'gLine')&&!colOf(main,'expMed')&&!b.names.some(n=>n.Name==='Gr_Band'),'guardrails and shock off: no extra columns and no Gr_Band name');
ok(inputsText(b).includes('Spending guardrails enabled')&&inputsText(b).includes('Late-life medical shock enabled'),'Inputs still says both are off');

// 2. on: columns, formulas and cached values
b=build({guardrail:{enabled:true,iwrMode:'target',targetWR:1.5,band:20,cutPct:10,prosperity:true},medShock:{enabled:true,age:75,years:3,cost:120000,person:0}}); main=sheetOf(b,'Projection by year');
const keys=['gMult','gDraw','gBal0','gWr','gIwr','gLine','gTrip','gOver','gMove','gCutAmt','expMed'];
ok(keys.every(k=>colOf(main,k)),'all guardrail columns and the medical-shock column are on the Projection sheet');
ok(b.names.some(n=>n.Name==='Gr_Band'),'the band is a defined name (Gr_Band) on Inputs');
const n=run('lastProjection.rows.length'), R=run('lastProjection.rows.map(r=>({g:r.guard,med:r.expMed||0,ltc:r.expLtc}))');
const c=k=>colOf(main,k), at=(k,i)=>cell(main,c(k)+(5+i));
ok(/Gr_Band/.test(at('gLine',10).f)&&/IF\(/.test(at('gTrip',10).f)&&/gt|>/.test(at('gOver',10).f),'cut line, tripwire and "above the line?" are formulas: '+at('gLine',10).f+' | '+at('gTrip',10).f);
ok(at('gMult',10).f===undefined&&at('gDraw',10).f===undefined,'multiplier and spending are app values, not formulas');
let worst=0, mism=0, cuts=0;
for(let k=0;k<n;k++){ const g=R[k].g; if(g.iwr==null){ if(at('gLine',k).v!==''||at('gTrip',k).v!=='') mism++; continue; }
  const line=g.iwr*(1+g.bandPct/100); worst=Math.max(worst,Math.abs(at('gLine',k).v-line),Math.abs(at('gTrip',k).v-g.draw/line));
  const over=at('gOver',k).v==='Yes'; if(g.move<0){ cuts++; if(!over) mism++; } if(over&&g.bal0>0&&!(g.draw/g.bal0>line)) mism++; }
ok(worst<1e-9&&mism===0,'cached cut line / tripwire equal iwr x (1 + band) and spending / line; every cut year is flagged above the line ('+cuts+' cuts)');
ok(Array.from({length:n},(_,k)=>k).filter(k=>R[k].g.bal0>0&&at('gWr',k).v!==''&&Math.abs(at('gWr',k).v-R[k].g.draw/R[k].g.bal0)>1e-12).length===0,'cached withdrawal rate = spending / start balance');
// medical shock: own column, inside the LTC total
const medRows=R.map((r,k)=>[k,r]).filter(x=>x[1].med>0);
ok(medRows.length===3&&medRows.every(([k,r])=>at('expMed',k).v===120000&&at('expLtc',k).v>=120000-1e-6),'the shock column shows the cost in 3 years, and the LTC total contains it');
ok(medRows.every(([k])=>at('item',k).v>0&&Math.abs(at('item',k).v-Math.max(0,at('expLtc',k).v-at('floor',k).v))<1e-6),'itemized deduction formula and value include it (cost above the 7.5% floor)');
// 3. Inputs lists the settings
const t=inputsText(b).join('|');
ok(/Spending guardrails enabled/.test(t)&&/cut when the rate is above the starting rate/.test(t)&&/Target rate/.test(t)&&/extra medical cost/.test(t),'Inputs lists the guardrail and shock settings');
ok(!JSON.stringify(Object.values(sheetOf(b,'Projection by year').ws).map(x=>x&&x.v)).match(/Infinity|NaN/),'no NaN / Infinity cached anywhere');
console.log(fails?('\n'+fails+' FAILED'):'\nall passed'); process.exit(fails?1:0);
