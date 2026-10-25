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


// stub geometry: x = index*5, y = 300 - value/1000
Object.defineProperty(Chart.prototype,'chartArea',{get(){ return {left:0,right:500,top:0,bottom:300}; }});
Object.defineProperty(Chart.prototype,'scales',{get(){ return {x:{getPixelForValue:i=>i*5, getValueForPixel:p=>p/5}, y:{id:'y', getPixelForValue:v=>300-v/1000, getValueForPixel:p=>(300-p)*1000}}; }});
Chart.prototype.getDatasetMeta=function(i){ const ds=this.data.datasets[i]; return {yAxisID:'y', data:ds.data.map((v,j)=>({x:j*5,y:300-(v||0)/1000,skip:v==null}))}; };
// ---- Monte Carlo trial view / inheritance arrivals / inflation chart (stub DOM, recording Chart) ----
//   PLAN=Samples/Couple_Heir.json node tests/mc/mc_ui_test.js
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
ctx.__plan=JSON.parse(fs.readFileSync(path.resolve(process.env.PLAN||path.join(root,'Samples/Couple_Heir.json')),'utf8'));
run(`state=hydrateState(__plan); recompute();`);
ok(charts.some(c=>c.canvas.id==='inflationChart'),'inflation chart is drawn in normal mode');
let inf=run(`(()=>{const c=charts.inflation; return {n:c.data.datasets.length, label:c.data.datasets[0].label, v:c.data.datasets[0].data.find(x=>x!=null)}})()`);
ok(inf.n===1&&Math.abs(inf.v-run('state.inflation*100'))<1e-9,'normal mode: one dashed line at the plan rate ('+inf.v+'%)');
// a stressed run so there are failures to study
run(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); cfg.ltc.prob=0.9; cfg.returns.volEquity=24; const res=[]; for(let t=0;t<120;t++) res.push(mcRunTrial(cfg,t));
  mcResults={cfg,S:mcSummarize(res),R:mcFailureReasons(res),complete:true,results:res}; mcStateAtRun=mcScenarioKey(); })()`);
const tr=run(`mcResults.R.list[0].trial`);
const scenarioProj=run(`lastProjection`);
run(`mcLoadTrial(${tr})`);
ok(run(`!!mcTrialView && mcTrialView.trial===${tr} && lastProjection===mcTrialView.proj && lastProjection!==null`),'mcLoadTrial: trial view is active and the charts read the replayed projection');
ok(run(`lastProjection.rows.length`)>0 && run(`lastProjection`)!==scenarioProj,'replayed projection differs from the plan projection object');
const banner=document.getElementById('mcTrialBanner');
ok(banner.hidden===false && banner.innerHTML.includes('failure <b>#'+(tr+1)+'</b>') && /runs out at age/.test(banner.innerHTML),'banner shows trial number and the failure age');
inf=run(`(()=>{const c=charts.inflation; return {n:c.data.datasets.length, t:c.data.datasets[1]&&c.data.datasets[1].data.filter(x=>x!=null).length, spread:c.data.datasets[1]&&(Math.max(...c.data.datasets[1].data.filter(x=>x!=null))-Math.min(...c.data.datasets[1].data.filter(x=>x!=null)))}})()`);
const trialRows=run(`lastProjection.rows.length`);   // the line has one point per year of the trial, and a trial can end early (random lifespans), so compare with its own length
ok(inf.n===3&&inf.t>=trialRows-1&&inf.t>=10&&inf.spread>0,'trial mode: inflation chart gets the trial\'s own varying rate line plus its thick 5-year average ('+inf.t+' points, spread '+inf.spread.toFixed(2)+' pts)');
ok(run(`state.ui.chartYMax && Object.values(state.ui.chartYMax).every(v=>v===null || typeof v==='number')`),'trial scales are not written into the plan (captureChartYMax is skipped)');
// Regression: the stress-test view (D) of the inflation chart once had no Chart Element text (its line names were not in chartInfo.js's table). Every line of every view must describe itself.
{ const shown=run(`(()=>{ const out=[]; const chk=v=>{ const c=charts.inflation; out.push({view:v, n:c.data.datasets.length, ok:c.data.datasets.every((d,i)=>!!ciDescribe('inflation',d,i)), names:c.data.datasets.map(d=>d.label)}); };
    chk(mcTrialView&&mcTrialView.view); const a=mcShowD('stag',1,'Stagflation'); chk(a?mcTrialView.view:'D failed'); return out; })()`);
  ok(shown.length===2&&shown.every(x=>x.ok&&x.n===3),'every inflation line has Chart Element text on the Monte Carlo trial view and on the stress-test view ('+shown.map(x=>x.view+': '+x.names.join(' | ')).join(' ; ')+')');
  ok(run(`charts.inflation.data.datasets[1].label`)==='Stress test inflation rate','the stress-test view names its inflation line "Stress test inflation rate"'); }
// stays in trial mode on a recompute with the same plan; leaves it when the plan changes
run(`recompute()`); ok(run(`!!mcTrialView`),'recompute with the same plan keeps the trial loaded (Rescale etc. work on it)');
run(`state.living=(state.living||0)+1000; recompute()`);
ok(run(`mcTrialView===null`) && banner.hidden===true,'editing the plan leaves the trial view and hides the banner');
ok(run(`lastProjection!==null`)&&run(`lastProjection.rows.length`)>0,'charts are back on the plan projection');
run(`state.living-=1000; recompute()`);
// stale run cannot be replayed
run(`state.living+=500`); let alerted=false; ctx.alert=()=>{alerted=true};
run(`mcLoadTrial(${tr})`); ok(alerted && run(`mcTrialView===null`),'a stale run refuses to replay (alert, no trial loaded)');
run(`state.living-=500`);
// step through failed trials, exit
run(`mcLoadTrial(${tr}); mcTrialStep(1)`); ok(run(`mcTrialView.trial`)===run(`mcResults.R.list[1].trial`),'next-failed-trial button steps through the failed list');
run(`mcTrialExit()`); ok(run(`mcTrialView===null`)&&banner.hidden===true,'Back to scenario clears the view');
// "Any trial #" naming a trial that stayed funded must load it as a Monte Carlo SUCCESS (C), never as a failure (B)
const okTr=run(`mcOkTrials()[0]`);
ok(okTr!==undefined,'the run has at least one successful trial');
run(`mcLoadTrial(${okTr})`);
ok(run(`!!mcTrialView && mcTrialView.view==='C' && mcTrialView.cur==='C' && mcTrialView.trial===${okTr} && mcTrialView.b===null`),'a successful trial loads as C (Success), and B is not set');
ok(/Monte Carlo success <b>#/.test(banner.innerHTML) && !/failure <b>#/.test(banner.innerHTML) && /stays funded/.test(banner.innerHTML),'banner says "success" and "stays funded", not "failure"');
ok(run(`lastProjection===mcTrialView.proj && lastProjection!==mcTrialView.scenarioProj`),'charts show the replayed successful trial');
run(`mcTrialExit()`);
run(`mcLoadTrial(${tr})`);
ok(run(`mcTrialView.view==='B' && mcTrialView.cur==='B' && mcTrialView.b.trial===${tr}`),'a failed trial still loads as B (Failure)');
run(`mcLoadTrial(${okTr})`);
ok(run(`mcTrialView.view==='C' && mcTrialView.b.trial===${tr} && mcTrialView.c.trial===${okTr}`),'loading a success after a failure keeps B and switches to C');
run(`mcTrialExit()`);

// inheritance arrivals
run(`(()=>{ const p=state.people[0]; const b=defaultBrokeragePortfolio(250000); b.inh={file:'donor.json',key:'pf1',base:null}; b.startYear=THIS_YEAR+6; p.brokerage.push(b); recompute(); })()`);
const arr=run(`inhArrivals()`).filter(a=>a.files.includes('donor'));   // the sample plan has its own inheritance (from Widow) in another year: look only at the one added here
ok(arr.length===1&&arr[0].row===6&&arr[0].value===250000&&arr[0].files[0]==='donor','inhArrivals: one arrival at row 6, $250k from "donor" (age '+(arr[0]&&arr[0].age)+')');
const calls=[]; const fake={chartArea:{left:10,right:300,top:5,bottom:200}, width:400, height:300, data:{labels:run(`charts.asset.data.labels`)}, scales:{x:{getPixelForValue:i=>10+i*5, getValueForPixel:p=>(p-10)/5},y:{}},
  ctx:new Proxy({},{get:(t,p)=>(...a)=>{calls.push(p)},set:()=>true}), canvas:{getBoundingClientRect:()=>({left:0,top:0,width:400,height:300})}};
ctx.__fake=fake;
run(`inhArrivalPlugin.afterDatasetsDraw(__fake,{},true)`);
ok(fake._inhArrows.some(h=>h.a.files.includes('donor')) && calls.includes('fill'),'plugin draws one triangle and records it for hover');
const hit=fake._inhArrows.find(h=>h.a.files.includes('donor'));
ok(calls.includes('moveTo'),'triangle drawn (always on, no toggle)');
ctx.__ev={clientX:hit.px,clientY:fake.chartArea.bottom+6};
let info=run(`ciOverlayAt('asset',__fake,__ev)`);
ok(info&&info.name==='Inheritance arrives'&&/250,000/.test(info.value)&&/age \d+/.test(info.value),'Chart Element popup over the triangle (below the axis): '+(info&&info.name)+' | '+(info&&info.value));
ctx.__ev={clientX:hit.px+40,clientY:fake.chartArea.bottom+6};
ok(run(`ciOverlayAt('asset',__fake,__ev)`)===null,'no popup away from the triangle');
ok(run(`typeof toggleInhArrows`)==='undefined' && !fs.readFileSync(path.join(root,'index.html'),'utf8').includes('Inheritance arrivals'),'enable button removed');
ok(run(`ageXAxis('x').ticks.padding`)>=10,'x ticks reserve room under the axis line');
const d2=run(`CHART_DEFAULT_POS_BY_COLS[2]`), d3=run(`CHART_DEFAULT_POS_BY_COLS[3]`);
const rowAbove=(d)=>d.inflation.r+1===d.ss.r && d.inflation.c===0 && d.ss.c===0 && d.market.r===d.inflation.r && d.market.c===1 && d.tss.r===d.ss.r && d.tss.c===1;
ok(rowAbove(d2),'2-column default: Inflation · Market return in the row directly above Cumulative household SS · Social Security tax');
ok(rowAbove(d3),'3-column default: Inflation · Market return in the row directly above Cumulative household SS · Social Security tax');
ok(run(`[2,3].every(c=>{ const o={...defaultChartPos(c)}; const P=PREV_DEFAULT_BOTTOM[c]; Object.keys(P).forEach(k=>{ o[k]={r:P[k][0],c:P[k][1]}; }); const n=normalizeChartPos(o,c), d=CHART_DEFAULT_POS_BY_COLS[c]; return Object.keys(P).every(k=>n[k].r===d[k].r&&n[k].c===d[k].c); })`),'a layout saved with the previous default bottom rows (SS · SS tax, then Inflation · Market) takes the new order');
ok(run(`(()=>{ const o=defaultChartPos(2); const P=PREV_DEFAULT_BOTTOM[2]; Object.keys(P).forEach(k=>{ o[k]={r:P[k][0],c:P[k][1]}; }); o.ss={r:9,c:1}; const n=normalizeChartPos(o,2); return n.inflation.r===8&&n.inflation.c===0&&n.ss.r===9; })()`),'a layout where the user moved one of the four is left alone');
ok(run(`(()=>{ const o=defaultChartPos(2); o.inflation={r:3,c:1}; o.incomeQual={r:9,c:1}; const n=normalizeChartPos(o,2); return n.inflation.r===3&&n.inflation.c===1; })()`),'a layout where the user put Inflation elsewhere is kept');
ok(run(`(()=>{const o=normalizeChartPos(defaultChartPos(2),2); const cells=new Set(Object.values(o).map(v=>v.r+','+v.c)); return cells.size===CHART_KEYS.length})()`),'default 2-column layout has no overlapping cells');
// similar-failures count in the banner (the plan was edited above for the arrival test, so re-stamp the run)
run(`mcStateAtRun=mcScenarioKey()`); run(`mcLoadTrial(${tr})`);
ok(/other failed trials? share this cause|No other failed trial shares/.test(banner.innerHTML),'banner shows how many other failed trials share the cause');
run(`mcTrialExit()`);
// ---- A/B comparison ----
run(`mcStateAtRun=mcScenarioKey()`); run(`mcLoadTrial(${tr})`);
ok(run(`mcTrialView.view`)==='B' && run(`mcShowingTrial()`) && run(`lastProjection===mcTrialView.proj`),'trial loads showing B');
const ghostN=run(`Object.values(charts).filter(c=>c&&c._abGhost&&c._abGhost.length).length`);
ok(ghostN>=8,'A is captured as ghost lines on the charts ('+ghostN+' charts)');
const a1=run(`JSON.stringify(charts.asset._abGhost.map(g=>g.pts.length))`), nl=run(`charts.asset.data.labels.length`);
// A's age axis can be a little longer than B's (the stretch years follow each projection's passing ages); both start at the same age, so index j is the same age on both
ok(JSON.parse(a1).every(n=>Math.abs(n-nl)<=5 && n>0),'ghost points are indexed from the same first age as the chart axis (A '+a1+' pts, B axis '+nl+')');
const ymaxB=run(`JSON.stringify(chartYMax)`);
ok(run(`lastProjection===mcTrialView.proj && mcTrialView.scenarioProj!==mcTrialView.proj`),'both A and B projections are held');
// axes are the same on A and B
run(`mcAbSet('A')`);
ok(run(`mcTrialView.view`)==='A' && !run(`mcShowingTrial()`) && run(`lastProjection===mcTrialView.scenarioProj`),'A shows the plan projection');
ok(run(`JSON.stringify(chartYMax)`)===ymaxB,'Y scales are identical on A and B (the flip changes only the data)');
ok(banner.innerHTML.includes('mc-ab-btn on')&&/A &middot; Scenario/.test(banner.innerHTML),'banner A/B control highlights A');
ok(run(`inhArrivals()`).some(a=>a.files.includes('donor')) && run(`(()=>{const l=ltcCounts([60,61]); return true})()`),'A uses the real plan for overlays');
let infA=run(`(()=>{const c=charts.inflation; return {n:c.data.datasets.length, vals:c.data.datasets[1]&&c.data.datasets[1].data.filter(x=>x!=null).length}})()`);
ok(infA.n===3&&infA.vals===0,'inflation chart on A: trial line empty, same three datasets');
run(`mcAbToggle()`); ok(run(`mcTrialView.view`)==='B' && run(`charts.inflation.data.datasets[1].data.filter(x=>x!=null).length`)>=run(`mcTrialView.proj.rows.length`)-1,'toggle (key B) flips back to B and the trial inflation line returns');
// C: cycles through successful runs; B stays the trial that was loaded
{ const c=run(`(()=>{ const b0=mcTrialView.b.trial, out={};
    mcCPress(); out.v1=mcTrialView.view; out.t1=mcTrialView.trial; out.ok1=mcResults.results[mcTrialView.trial].failK<0; out.shown1=mcTrialShown()===mcTrialView.c.proj; out.cur1=mcTrialView.cur;
    mcCPress(); out.v2=mcTrialView.view; out.t2=mcTrialView.trial; out.ok2=mcResults.results[mcTrialView.trial].failK<0;
    mcCStep(-1); out.back=mcTrialView.trial;
    out.state=mcTrialView.state===mcTrialView.c.state; out.btn=/class="mc-ab-btn c on"[^>]*>F &middot; Monte Carlo Success/.test(mcEl('mcTrialBanner').innerHTML);
    mcAbToggle(); out.toA=mcTrialView.view; mcAbToggle(); out.backToC=mcTrialView.view;
    mcAbSet('B'); out.b=mcTrialView.trial===b0&&mcTrialView.b.trial===b0&&mcTrialView.view==='B'; out.shownB=mcTrialShown()===mcTrialView.b.proj;
    mcCPress(); out.fromB=mcTrialView.view+':'+(mcTrialView.trial===mcTrialView.c.trial);   // from B the C button returns to the chosen run, not the next one
    out.okN=mcOkTrials().length; mcAbSet('B'); return out; })()`);
  ok(c.v1==='C'&&c.ok1&&c.shown1&&c.cur1==='C'&&c.v2==='C'&&c.ok2&&c.t2!==c.t1&&c.back===c.t1,'C button shows a successful run and each press moves to the next one ('+c.t1+' → '+c.t2+', Shift+C back to '+c.back+')');
  ok(c.state&&c.btn&&c.toA==='A'&&c.backToC==='C'&&c.b&&c.shownB&&c.fromB==='C:true','C: the trial\'s own state is on the view, the banner marks C, key A / the A button flips plan ↔ last trial, B keeps the loaded trial, C from B returns to the chosen run'); }
{ const q=run(`(()=>{ const out={}; mcAbSet('B'); const b0=mcTrialView.b.trial; mcAbSet('C'); const c0=mcTrialView.c.trial;
    mcTrialStep(1); out.cMoved=mcTrialView.view==='C'&&mcTrialView.c.trial!==c0&&mcResults.results[mcTrialView.c.trial].failK<0&&mcTrialView.b.trial===b0;
    mcAbSet('B'); const b1=mcTrialView.b.trial, c1=mcTrialView.c.trial; mcTrialStep(1);
    out.bMoved=mcTrialView.view==='B'&&mcTrialView.b.trial!==b1&&mcResults.results[mcTrialView.b.trial].failK>=0&&mcTrialView.c.trial===c1;
    const h=mcEl('mcTrialBanner').innerHTML; out.layout=h.indexOf('mc-tb-top')<h.indexOf('Back to scenario')&&h.indexOf('Back to scenario')<h.indexOf('mc-tb-msg');
    out.title=h.includes('Previous Monte Carlo failure (E)'); mcAbSet('C'); out.titleC=mcEl('mcTrialBanner').innerHTML.includes('Previous Monte Carlo success (F)'); mcAbSet('B'); return out; })()`);
  ok(q.cMoved&&q.bMoved,'◀ ▶ step successful runs while C is on and failed trials while B is on, each leaving the other unchanged');
  ok(q.layout&&q.title&&q.titleC,'banner layout is the same for B and C (switch + buttons on one row, message below); the ◀ ▶ titles name the kind'); }
// ghost drawing: B draws, A does not
const fake2={chartArea:{left:0,right:500,top:0,bottom:300}, scales:{x:{getPixelForValue:i=>i*5}, y:{getPixelForValue:v=>300-v/1000}}, _abGhost:[{ax:'y',pts:[1000,2000,null,4000]}], ctx:new Proxy({},{get:(t,p)=>(...a)=>{calls2.push(p)},set:()=>true})};
const calls2=[]; ctx.__f2=fake2;
run(`abGhostPlugin.beforeDatasetsDraw(__f2,{},true)`); ok(calls2.includes('stroke')&&calls2.includes('clip'),'ghost lines are drawn (clipped to the plot) while B is showing');
calls2.length=0; run(`mcAbSet('A')`); run(`abGhostPlugin.beforeDatasetsDraw(__f2,{},true)`); ok(!calls2.includes('stroke'),'no ghost while A is showing');
run(`mcAbSet('B')`);
// alert strip: one red line, details in data-detail, fixed height (no <small>)
const ea=document.getElementById('expenseAlert');
if(!ea.hidden){ ok(ea.textContent==='UNFUNDED'&&!!ea.dataset.detail&&!/<small>/.test(ea.innerHTML),'unfunded alert is one line ("'+ea.textContent+'") with details in the popup text'); }
else { console.log('  (this trial funds every year in the expense chart view; alert strip hidden)'); }
run(`mcTrialExit()`);
// the strip text for a forced shortfall
run(`(()=>{ const pr=computeProjection(); pr.rows[3].expUnfunded=5000; pr.rows[4].expUnfunded=7000; buildExpenseAlert(pr); })()`);
ok(!ea.hidden && ea.textContent==='UNFUNDED' && /first at age \d+ and last at \d+/.test(ea.dataset.detail) && /Total shortfall/.test(ea.dataset.value) && /2 years/.test(ea.dataset.detail),'forced shortfall: "'+ea.textContent+'"; popup value "'+ea.dataset.value.replace('\u0001',' ')+'"');
run(`(()=>{ const pr=computeProjection(); buildExpenseAlert(pr); })()`); ok(ea.hidden===true && ea.textContent==='','alert strip empties (hidden, keeps height by CSS) when nothing is unfunded');
{ const css=fs.readFileSync(path.join(root,'css/styles.css'),'utf8'), html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  ok(/id="scaleBar"[\s\S]*id="assetAlert"[\s\S]*<\/div>\s*<div class="chart-grid"/.test(html)&&!/id="expenseAlert"/.test(html),'IRA-stretch alert stays in the scale-button row; the UNFUNDED tag is not there');
  ok(run(`/id="expenseAlert"/.test((CHART_PANELS.find(p=>p.key==='expense')||{}).tools||'')`),'UNFUNDED tag is in the Annual expenses panel tools row, after the Rescale button (the tools follow it in the panel markup)');
  ok(/\.cp-body \.unfunded-alert/.test(css)===false,'old in-card alert styles removed'); }
{ const fk={chartArea:{left:0,right:500,top:0,bottom:300}, data:{labels:[60,61,62,63,64,65,66,67]}, scales:{x:{getPixelForValue:i=>i*10}}, ctx:new Proxy({},{get:(t,p)=>(...a)=>{ if(p==='fillRect') rects.push(a); }, set:()=>true})}; const rects=[]; ctx.__fk=fk;
  run(`(()=>{ const pr=computeProjection(); lastProjection=pr; const a=Math.round(pr.rows[0].age0); pr.rows[2].expUnfunded=9000; pr.rows[3].expUnfunded=9000; __fk.data.labels=[a,a+1,a+2,a+3,a+4]; })()`);
  run(`unfundedYearsPlugin.beforeDatasetsDraw(__fk,{},true)`); ok(rects.length===2 && rects[0][0]===15 && rects[0][2]===10,'red band drawn behind exactly the two unfunded years'); rects.length=0;
  run(`unfundedYearsPlugin.beforeDatasetsDraw(__fk,{},false)`); ok(rects.length===0,'band off when the chart does not enable it'); run(`recompute()`); }
// ---- Market return chart ----
run(`state.people[0].brokerage.pop(); recompute()`);
{ const m=run(`(()=>{ const pr=lastProjection, S=marketSeries(pr); const c=charts.market; return {keys:S.keys, n:c&&c.data.datasets.length, infl:pr.inflRate.slice(0,3), first:S.keys.map(k=>S.at[k].find(v=>v!=null)), row0:S.at[S.keys[0]][0], hasRates:!!pr.rates&&pr.rates.length>=pr.rows.length, labels:S.keys.map(k=>marketAssetLabel(pr,k))}; })()`);
  ok(m.hasRates && m.keys.length>=1 && m.n===m.keys.length,'plan: market chart has one line per growing asset ('+m.labels.join(' | ')+')');
{ const st=run(`(()=>{ marketSel=-1; buildMarketChart(); const n=charts.market.data.datasets.length, out={all:n}; marketStep(1); out.first=charts.market.data.datasets.length; out.l1=charts.market.data.datasets[0].label; marketStep(1); out.l2=charts.market.data.datasets[0].label; marketStep(-1); out.back=charts.market.data.datasets[0].label; for(let i=0;i<n;i++) marketStep(1); out.wrapped=charts.market.data.datasets.length; marketStep(-1); out.prevFromAll=charts.market.data.datasets.length; marketSel=-1; buildMarketChart(); return out; })()`);
  ok(st.all>=2&&st.first===2&&st.wrapped===st.all&&st.prevFromAll===2&&st.l1!==st.l2&&st.back===st.l1,'market ◀ ▶ buttons: one asset per step (its yearly line + 5-year average; all lines show only the averages), wrap through all lines, ◀ goes back ('+st.l1+' → '+st.l2+')'); }
  ok(m.first.every(v=>v!=null && v>0 && v<20) && m.row0!=null && Math.abs(m.infl[0]-run('state.inflation'))<1e-12,'plan: nominal returns are sensible and inflation per year recorded ('+m.first.map(v=>v.toFixed(2)).join(', ')+'%)'); }
run(`mcStateAtRun=mcScenarioKey(); mcLoadTrial(${tr})`);
{ const m=run(`(()=>{ const pr=lastProjection, S=marketSeries(pr); const vals=S.at[S.keys[0]].filter(v=>v!=null); return {n:vals.length, spread:Math.max(...vals)-Math.min(...vals), sameAsScenario:(()=>{ const P=marketSeries(mcTrialView.scenarioProj); return JSON.stringify(P.at[P.keys[0]])===JSON.stringify(S.at[S.keys[0]]); })(), yaxis:[charts.market.options.scales.y.min,charts.market.options.scales.y.max], dsn:charts.market.data.datasets.length}; })()`);
  ok(m.n>=3 && m.spread>5 && !m.sameAsScenario,'trial: returns move year to year ('+m.spread.toFixed(1)+' pts range) and differ from the plan');
  ok(m.yaxis[0]<=0 && m.yaxis[1]>=10,'trial: Y axis spans the plan and trial ranges ('+m.yaxis.join(' to ')+'%)');
  const before=JSON.stringify(run(`[charts.market.options.scales.y.min,charts.market.options.scales.y.max]`)); run(`mcAbSet('A')`);
  ok(JSON.stringify(run(`[charts.market.options.scales.y.min,charts.market.options.scales.y.max]`))===before,'market Y axis identical on A and B'); run(`mcAbSet('B')`); }
// a plain plan projection (no trial recording) and a Monte Carlo batch trial do not record rates
ok(run(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); const m=mcRunTrial(cfg,3); return REC_RATES===true && m.n>0; })()`),'normal Monte Carlo trials leave recording on for the plan afterwards, and do not break');
ok(run(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); const cap={}; mcRunTrial(cfg,3,null,cap); return !!cap.proj.rates && cap.proj.rates.length>10; })()`),'a replay records rates');
ok(run(`(()=>{ REC_RATES=false; const pr=computeProjection(); REC_RATES=true; return pr.rates===null; })()`),'recording can be switched off');
// % not $ in the Chart Element value line
{ const mk=(key,v)=>run(`ciValueLine('${key}',{ds:{label:'x',data:[${v}]},idx:0},{data:{labels:[70]}})`);
  const iv=mk('inflation',3.04), mv=mk('market',7.26), av=run(`ciValueLine('asset',{ds:{label:'x',data:[250000]},idx:0},{data:{labels:[70]}})`);
  ok(/3\.04%/.test(iv)&&!/\$/.test(iv),'Chart Element value on the inflation chart is a % ('+iv.replace('\u0001',' ')+')');
  ok(/7\.3%/.test(mv)&&!/\$/.test(mv),'Chart Element value on the market chart is a % ('+mv.replace('\u0001',' ')+')');
  ok(/\$250,000/.test(av),'dollar charts still show $');
  const missing=run(`Object.keys(charts).filter(k=>charts[k]).flatMap(k=>charts[k].data.datasets.filter((d,i)=>!ciDescribe(k,d,i)).map(d=>k+': '+d.label))`);
  ok(missing.length===0,'Chart Element description exists for every line of every chart (carried on the dataset as ds.info, stamped by upsertLineChart)'+(missing.length?' — missing: '+missing.join('; '):'')); }
run(`mcTrialExit()`);
ok(run(`CHART_PANELS.some(p=>p.key==='inflation') && CHART_KEYS.includes('inflation') && defaultChartHidden().inflation===true`),'inflation panel is registered and hidden by default');
// Loading another file / Reset to defaults clears the Monte Carlo card (results, trial view, running run) and puts its settings back to the defaults, collapsed
{ const seed=()=>run(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); cfg.ltc.prob=0.9; cfg.returns.volEquity=24; const res=[]; for(let t=0;t<120;t++) res.push(mcRunTrial(cfg,t));
    mcResults={cfg,S:mcSummarize(res),R:mcFailureReasons(res),complete:true,results:res}; mcStateAtRun=mcScenarioKey(); mcLoadTrial(mcResults.R.list[0].trial); })()`);
  seed(); ok(run(`!!mcResults && !!mcTrialView`),'(setup) results and a trial are loaded');
  run(`buildMcPanel(); mcCfg.returns.volEquity=21; mcSaveCfg()`);
  run(`applyLoadedFileText(JSON.stringify(__plan))`);
  ok(run(`mcResults===null && mcTrialView===null && mcStateAtRun===null`),'loading a file drops the Monte Carlo results and the loaded trial');
  ok(document.getElementById('mcTrialBanner').hidden===true,'loading a file hides the trial banner (the card is rebuilt, so its results area starts hidden)');
  ok(run(`mcCfg.returns.volEquity`)===16 && run(`mcCfg.hidden`)===true,'loading a file that holds no card settings puts the card\'s settings back to the defaults, collapsed');
  ok(run(`lastProjection!==null`)&&run(`lastProjection.rows.length`)>0,'charts are back on the plan after the load');
  seed(); run(`mcRun={cancel:false,done:3,results:[]}`);
  run(`resetState()`);
  ok(run(`mcResults===null && mcTrialView===null && mcRun===null`),'Reset to defaults drops results, the trial and a running run');
  ok(run(`mcCfg.returns.volEquity`)===16 && run(`mcCfg.hidden`)===true && run(`state.ui.mcCfg`)===null,'Reset to defaults puts the card\'s settings back to the defaults, collapsed'); }

// ---- The Stress test and Monte Carlo cards' settings (and their order) are part of the plan: saved, restored, reset ----
{ run(`state=hydrateState(__plan); renderAll();`);
  // edit both cards through their forms' own code paths
  run(`mcCfg.trials=250; mcCfg.hidden=false; mcCfg.returns.volEquity=22; mcCfg.ltc.prob=0.8; mcSaveCfg();
       stCfg.hidden=false; stCfg.equityShare=60; stCfg.stag.years=7; stCfg.stag.inflEnd=9; stCfg.lost.actualInflation=true; stCfg.med.enabled=true; stCfg.med.cost=150000; stSaveCfg();
       state.ui.cardOrder=['mcPanel','stressPanel'];`);
  ok(run(`state.ui.mcCfg.trials`)===250 && run(`state.ui.mcCfg.returns.volEquity`)===22 && run(`state.ui.mcCfg.hidden`)===false,'Monte Carlo card settings are kept in state.ui.mcCfg');
  ok(run(`state.ui.stressCfg.equityShare`)===60 && run(`state.ui.stressCfg.stag.inflEnd`)===9 && run(`state.ui.stressCfg.med.cost`)===150000,'Stress test card settings are kept in state.ui.stressCfg');
  // the plan file round trip (what Save writes, what Load reads)
  const text=run(`JSON.stringify(state)`);
  run(`resetState()`);
  ok(run(`mcCfg.trials`)!==250 && run(`stCfg.equityShare`)===100 && run(`mcCfg.hidden`)===true && run(`stCfg.hidden`)===true && run(`state.ui.stressCfg`)===null && run(`state.ui.cardOrder`)===null,'Reset puts both cards back to their defaults (collapsed, default order)');
  run(`applyLoadedFileText(${JSON.stringify(text)})`);
  ok(run(`mcCfg.trials`)===250 && run(`mcCfg.returns.volEquity`)===22 && run(`mcCfg.ltc.prob`)===0.8 && run(`mcCfg.hidden`)===false,'loading a plan file restores the Monte Carlo card settings');
  ok(run(`stCfg.equityShare`)===60 && run(`stCfg.stag.years`)===7 && run(`stCfg.stag.inflEnd`)===9 && run(`stCfg.lost.actualInflation`)===true && run(`stCfg.med.enabled`)===true && run(`stCfg.med.cost`)===150000 && run(`stCfg.hidden`)===false,'loading a plan file restores the Stress test card settings');
  ok(run(`JSON.stringify(state.ui.cardOrder)`)===JSON.stringify(['mcPanel','stressPanel']),'loading a plan file keeps the card order');
  // an autosave reload (hydrateState of the saved state) keeps them too
  run(`state=hydrateState(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')||JSON.parse(${JSON.stringify(text)}))`);
  ok(run(`state.ui.mcCfg&&state.ui.mcCfg.trials`)===250 && run(`state.ui.stressCfg&&state.ui.stressCfg.med.cost`)===150000,'hydrateState keeps the card settings (an older file without them gets null = defaults)');
  ok(run(`hydrateState(JSON.parse(JSON.stringify(Object.assign({},__plan,{ui:undefined})))).ui.mcCfg`)===null,'a plan file from before this setting loads with the card defaults');
  // a redraw with unchanged settings keeps the results table
  run(`stResults={scenarioKey:'x'}; renderAll();`);
  ok(run(`stResults!==null`),'a redraw with the same settings keeps the stress results');
  run(`stResults=null; resetState()`);
}

// ---- Starting fresh closes the chart rows that hold nothing on screen ----
{ run(`resetState()`);   // the default plan has no IDGT portfolio, no IRA ...: charts without a panel
  const r=run(`(()=>{ const pos=state.ui.chartPos, avail=CHART_KEYS.filter(k=>chartAvail[k]), rows=[...new Set(avail.map(k=>pos[k].r))].sort((a,b)=>a-b);
    const cells=CHART_KEYS.map(k=>pos[k].r+','+pos[k].c); const alt=state.ui.chartPosAlt, availAlt=[...new Set(avail.map(k=>alt[k].r))].sort((a,b)=>a-b);
    return {unavail:CHART_KEYS.filter(k=>!chartAvail[k]), rows, contiguous:rows.every((x,i)=>x===i), dup:cells.length!==new Set(cells).size, altContiguous:availAlt.every((x,i)=>x===i),
            altDup:CHART_KEYS.map(k=>alt[k].r+','+alt[k].c).length!==new Set(CHART_KEYS.map(k=>alt[k].r+','+alt[k].c)).size}; })()`);
  ok(r.unavail.length>0,'(setup) some charts have no panel in the default plan: '+r.unavail.join(', '));
  ok(r.contiguous,'after Reset every row up to the last holds a chart on screen (rows '+r.rows.join(',')+')');
  ok(r.altContiguous,'the other grid size (2×N / 3×N) has no empty row either');
  ok(!r.dup&&!r.altDup,'no two charts share a cell after closing the rows');
  // a layout the user arranged is NOT touched by a redraw (only starting fresh compacts)
  run(`state.ui.chartPos=defaultChartPos(chartCols()); renderAll();`);
  ok(run(`state.ui.chartPos.tax.r`)===run(`defaultChartPos(chartCols()).tax.r`),'a redraw keeps a saved layout as it is (the empty row stays until a fresh start)');
  run(`resetState()`);
}
console.log(fails?fails+' FAILED':'all passed'); process.exit(fails?1:0);
