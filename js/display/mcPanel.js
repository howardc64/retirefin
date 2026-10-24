'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / MONTE CARLO PANEL — one card under the chart grid: settings, Run / Cancel, a result summary,
// a fan chart of household assets by age (10/25/50/75/90th percentile, deterministic plan overlaid) and the
// "still funded through age X" curve. Reads `state` only through compute/monteCarlo.js; draws its own two
// Chart.js canvases (it is not part of the chart-panel registry, so it has no Hide / drag / Same-scale).
// The card's settings (every group, Trials, Seed and its Hide box) are part of the plan: they live in `state.ui.mcCfg` (default null = the card's defaults), so they are saved to file / autosave,
// restored on load and put back to the defaults by Reset.
// Runs on the main thread in small chunks so the page stays responsive and file:// still works.
// ═══════════════════════════════════════════════════════════════
let mcCfg=null, mcRun=null, mcResults=null, mcCharts={fan:null,funded:null}, mcStateAtRun=null;
// A replayed trial loaded into the chart grid (null = the charts show the plan as entered): {trial, proj, state, cap, key, pos}. recompute() (app.js) feeds `proj` to the charts while it is set.
let mcTrialView=null;
// The plan without its display-only `ui` block: what a replay depends on (hiding a chart or moving a panel does not change a trial).
const mcPlanKey=()=>JSON.stringify(Object.assign({},state,{ui:null}));

// Key-order-independent signature of a settings object (a form read and a saved copy list the same keys in different orders).
function cfgSig(o){ return JSON.stringify(o,(k,v)=>(v&&typeof v==='object'&&!Array.isArray(v))?Object.keys(v).sort().reduce((a,x)=>{ a[x]=v[x]; return a; },{}):v); }
function mcDefaultCfg(){ const d=JSON.parse(JSON.stringify(MC_DEFAULTS)); d.hidden=true; return d; }   // the card starts collapsed (Hide checked); a saved choice still wins
function mcLoadCfg(){
  const d=mcDefaultCfg(), s=(typeof state!=='undefined'&&state&&state.ui)?state.ui.mcCfg:null;
  if(s&&typeof s==='object') for(const k in d){ if(s[k]!==undefined) d[k]=(d[k]&&typeof d[k]==='object')?Object.assign(d[k],s[k]):s[k]; }
  return d;
}
function mcSaveCfg(){
  if(typeof state==='undefined'||!state||!mcCfg) return;
  if(!state.ui) state.ui={};
  if(cfgSig(state.ui.mcCfg)===cfgSig(mcCfg)) return;
  state.ui.mcCfg=JSON.parse(JSON.stringify(mcCfg));
  if(typeof saveDebounced==='function') saveDebounced();
}
// Any edit inside the card is kept in the plan right away (not only when Run is pressed).
function mcSyncCfg(){ if(!mcCfg||!mcEl('mcRet')) return; try{ mcReadCfg(); }catch(e){} }
// Called by renderAll() (app.js) after a plan was loaded, reset or switched: show the settings the plan holds. Rebuilds the card only when they differ from what is on screen.
function mcRestore(){
  if(!mcEl('mcPanel')) return;
  const want=mcLoadCfg();
  if(mcCfg&&mcEl('mcBody')&&cfgSig(want)===cfgSig(mcCfg)) return;
  mcResetCard(false); buildMcPanel();
}
const mcEl=id=>document.getElementById(id);
const mcMoney=v=>v==null||!isFinite(v)?'–':(Math.abs(v)>=1e6?'$'+(v/1e6).toFixed(2)+'M':'$'+Math.round(v/1000)+'k');

function buildMcPanel(){
  const host=mcEl('mcPanel'); if(!host) return;
  mcCfg=mcLoadCfg();
  const num=(id,label,val,min,max,step)=>'<label class="mc-f">'+label+'<input type="number" id="'+id+'" value="'+val+'" min="'+min+'" max="'+max+'" step="'+step+'"></label>';
  const grp=(id,title,on,body)=>'<fieldset class="mc-grp" id="'+id+'Grp"><legend><label><input type="checkbox" id="'+id+'"'+(on?' checked':'')+'> '+title+'</label></legend><div class="mc-row">'+body+'</div></fieldset>';
  host.innerHTML=
    '<div class="mc-head"><div class="panel-title">Monte Carlo simulation</div><label class="hide-cb"><input type="checkbox" id="mcHide"'+(mcCfg.hidden?' checked':'')+' autocomplete="off">Hide</label></div>'+
    '<div id="mcBody"><p class="mc-note">Re-runs this plan many times with random market returns, lifespans and Long Term Care. A scenario analysis, not a forecast: the result depends on the assumptions below.</p>'+
    '<div class="mc-grid">'+
      grp('mcRet','Random returns',mcCfg.returns.enabled,num('mcVol','Equity volatility %',mcCfg.returns.volEquity,0,60,1)+num('mcVolRe','Real estate volatility %',mcCfg.returns.volRE,0,40,1)+num('mcRho','Portfolio correlation',mcCfg.returns.rho,0,1,0.05))+
      grp('mcPanic','Systemic panic <small>(correlations converge in a crash; needs random returns)</small>',mcCfg.returns.panic.enabled,
        num('mcPanRho','Panic correlation',mcCfg.returns.panic.rhoPanic,0,1,0.05)+num('mcPanTrig','Crash = market year worse than (std. deviations)',-mcCfg.returns.panic.trigger,0.5,4,0.1)+num('mcPanHold','Lasts (years)',mcCfg.returns.panic.holdYears,1,5,1)+
        '<label class="mc-f mc-chk"><input type="checkbox" id="mcPanRe"'+(mcCfg.returns.panic.includeRE?' checked':'')+'> Property falls with the market too</label>'+
        '<label class="mc-f mc-chk"><input type="checkbox" id="mcPanCmp"'+(mcCfg.returns.panic.compare?' checked':'')+'> Also run the same trials without panic <small>(doubles the run time)</small></label>')+
      grp('mcMort','Random lifespans <small>(replaces the "passes at age" sliders)</small>',mcCfg.mortality.enabled,num('mcMode','Modal age at death',mcCfg.mortality.mode,70,100,1)+num('mcScale','Spread (years)',mcCfg.mortality.scale,4,20,0.5))+
      grp('mcLtc','Random Long Term Care <small>(replaces every LTC card, an inheritance source\'s too)</small>',mcCfg.ltc.enabled,num('mcLtcP','Probability of needing care',mcCfg.ltc.prob,0,1,0.05)+num('mcLtcY','Median years of care',mcCfg.ltc.medianYears,0.5,10,0.5))+
      grp('mcInh','Random inheritance <small>(source plans\' lifespans, care and markets)</small>',mcCfg.inheritance.enabled,num('mcInhCut','Haircut % (not counted on)',mcCfg.inheritance.haircutPct,0,100,5)+'<div class="mc-src" id="mcInhSrc"></div>')+
      grp('mcInf','Random inflation <small>(around the plan\'s rate)</small>',mcCfg.inflation.enabled,num('mcInfSd','Yearly volatility (% pts)',mcCfg.inflation.sigma,0,5,0.1)+num('mcInfPhi','Persistence (0–0.95)',mcCfg.inflation.phi,0,0.95,0.05))+
    '</div>'+
    '<div class="mc-row mc-run">'+num('mcTrials','Trials',mcCfg.trials,50,10000,50)+num('mcSeed','Seed',mcCfg.seed,1,2147483647,1)+
      '<button type="button" class="btn btn-primary" id="mcRunBtn">Run simulation</button><button type="button" class="btn" id="mcCancelBtn" style="display:none">Cancel</button><span id="mcProg" class="mc-prog"></span></div>'+
    '<div id="mcStale" class="mc-stale" style="display:none">The plan changed since this run. Run again to refresh.</div>'+
    '<div id="mcOut" style="display:none"><div id="mcSummary" class="mc-summary"></div><div id="mcReasons"></div><div id="mcStudy" class="mc-study"></div>'+
      '<div class="mc-charts"><div><h4 class="mc-h">Assets by age <small>today\'s $, including real estate; trials still alive at each age</small></h4><div class="mc-cwrap"><canvas id="mcFanCanvas"></canvas></div></div>'+
      '<div><h4 class="mc-h">Share of trials <small>%, by age</small></h4><div class="mc-cwrap"><canvas id="mcFundedCanvas"></canvas></div></div></div>'+
      '<div class="mc-note" id="mcCaveats"></div></div></div>';
  const applyHide=()=>{ host.classList.toggle('mc-collapsed',mcEl('mcHide').checked); };
  mcEl('mcHide').addEventListener('change',()=>{ mcCfg.hidden=mcEl('mcHide').checked; mcSaveCfg(); applyHide(); }); applyHide();
  mcUpdateInhStatus();
  if(!host._mcSyncHooked){ host._mcSyncHooked=true; ['input','change'].forEach(ev=>host.addEventListener(ev,mcSyncCfg)); }   // keep every edit in state.ui.mcCfg
  mcEl('mcRunBtn').onclick=mcStart; mcEl('mcCancelBtn').onclick=()=>{ if(mcRun) mcRun.cancel=true; };
  if(typeof cardStackDecorate==='function') cardStackDecorate();   // draggable title bar (display/cardStack.js)
  ['mcRet','mcPanic','mcMort','mcLtc','mcInh','mcInf'].forEach(id=>{ const sync=()=>mcEl(id+'Grp').classList.toggle('mc-off',!mcEl(id).checked); mcEl(id).addEventListener('change',sync); sync(); });
}

function mcReadCfg(){
  const n=(id,d)=>{ const v=parseFloat(mcEl(id).value); return isFinite(v)?v:d; };
  const c=mcCfg;
  c.trials=Math.max(50,Math.min(10000,Math.round(n('mcTrials',c.trials)))); c.seed=Math.max(1,Math.round(n('mcSeed',c.seed)));
  const pn=(c.returns&&c.returns.panic)||{};
  c.returns={enabled:mcEl('mcRet').checked, volEquity:n('mcVol',16), volRE:n('mcVolRe',8), rho:Math.max(0,Math.min(1,n('mcRho',0.8))),
    panic:{enabled:mcEl('mcPanic').checked, rhoPanic:Math.max(0,Math.min(1,n('mcPanRho',0.9))), trigger:-Math.max(0.5,Math.min(4,n('mcPanTrig',1.5))), holdYears:Math.max(1,Math.min(5,Math.round(n('mcPanHold',1)))),
      includeRE:mcEl('mcPanRe').checked, rhoRE:pn.rhoRE>=0?pn.rhoRE:0.5, compare:mcEl('mcPanCmp').checked}};
  c.mortality={enabled:mcEl('mcMort').checked, mode:n('mcMode',87), scale:Math.max(2,n('mcScale',10))};
  c.ltc=Object.assign({},c.ltc,{enabled:mcEl('mcLtc').checked, prob:Math.max(0,Math.min(1,n('mcLtcP',0.5))), medianYears:Math.max(0.5,n('mcLtcY',2))});
  c.inflation=Object.assign({},c.inflation,{enabled:mcEl('mcInf').checked, sigma:Math.max(0,Math.min(5,n('mcInfSd',1.2))), phi:Math.max(0,Math.min(0.95,n('mcInfPhi',0.6)))});
  c.inheritance={enabled:mcEl('mcInh').checked, haircutPct:Math.max(0,Math.min(100,n('mcInhCut',0)))};
  mcSaveCfg(); return c;
}

// Which inheritance sources of this plan the simulation can randomise: only those imported (or live-updated) with a donor table.
function mcUpdateInhStatus(){
  const el=mcEl('mcInhSrc'); if(!el||typeof state==='undefined') return;
  const L=[]; (state.people||[]).forEach(p=>((p.inheritance&&p.inheritance.sources)||[]).forEach(src=>{
    if(!(src.assets||[]).some(a=>a.pct>0)) return;
    L.push('<b>'+String(src.file).replace(/[<>&]/g,'')+'</b>: '+(src.donor&&src.donor.traj?'simulated':'<span class="mc-warn">re-import (or live-link) it to simulate; until then it stays as planned</span>'));
  }));
  el.innerHTML=L.length?L.join('<br>'):'No inherited assets in this plan.';
}
function mcStart(){
  if(mcRun) return;
  mcUpdateInhStatus();
  const cfg=JSON.parse(JSON.stringify(mcReadCfg()));
  if(mcTrialView) mcTrialExit();   // charts back to the plan before a new run
  // Optional paired pass: the same trial numbers (so the same random draws) with the panic switch off, to show what the panic itself costs.
  const pn=cfg.returns.enabled&&cfg.returns.panic&&cfg.returns.panic.enabled&&cfg.returns.panic.compare, cfgOff=pn?JSON.parse(JSON.stringify(cfg)):null; if(pn) cfgOff.returns.panic.enabled=false;
  mcRun={cancel:false, done:0, results:[], done2:0, results2:[]}; mcStateAtRun=mcPlanKey();
  mcEl('mcRunBtn').disabled=true; mcEl('mcCancelBtn').style.display=''; mcEl('mcStale').style.display='none';
  const run=mcRun, t0=Date.now(), total=cfg.trials*(pn?2:1);
  (function chunk(){
    if(run.cancel){ mcEl('mcProg').textContent='Cancelled after '+run.done+' trials.'; return mcFinish(run,cfg,false); }
    const tEnd=Date.now()+40;                       // ~40 ms of work, then yield to the browser
    while(Date.now()<tEnd){
      if(run.done<cfg.trials){ run.results.push(mcRunTrial(cfg,run.done)); run.done++; }
      else if(pn&&run.done2<cfg.trials){ run.results2.push(mcRunTrial(cfgOff,run.done2)); run.done2++; }
      else break;
    }
    const n=run.done+run.done2;
    mcEl('mcProg').textContent=n+' / '+total+' trials'+(pn&&run.done>=cfg.trials?' (without panic, for comparison)':'');
    if(n<total) setTimeout(chunk,0);
    else { mcEl('mcProg').textContent=total+' trials in '+((Date.now()-t0)/1000).toFixed(1)+' s'; mcFinish(run,cfg,true); }
  })();
}

function mcFinish(run,cfg,complete){
  if(run.discard){ mcRun=null; return; }   // the plan was replaced (load / reset) while it ran: nothing to show
  mcRun=null; mcEl('mcRunBtn').disabled=false; mcEl('mcCancelBtn').style.display='none';
  if(run.results.length<50){ return; }
  mcResults={cfg, S:mcSummarize(run.results), R:mcFailureReasons(run.results), complete, results:run.results, cmp:(complete&&run.results2.length===cfg.trials)?mcSummarize(run.results2):null};
  mcRender();
  if(complete&&typeof llmBridgeRunDone==='function') llmBridgeRunDone('mc',cfg,null);   // the live bridge's tools can then read this run
}

// Chart.js options shared by both charts. The app's own overlay plugins (LTC bar, IRMAA lines, labels…) are global, so switch them off here.
const MC_NO_OVERLAYS={unfundedYears:false,inhArrival:false,abGhost:false,ltcBar:false,incomeOverlay:false,magiOverlay:false,ordLabels:false,thinLine:false,lineHalo:false,stretchTint:false};
function mcChartOpts(extra){
  const o={responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:Object.assign({legend:{position:'top',align:'start',labels:{boxWidth:14,boxHeight:10,font:{size:11},filter:it=>!String(it.text).startsWith('_')}}},MC_NO_OVERLAYS,extra.plugins||{}),
    scales:{x:{title:{display:true,text:ageAxisLabel(lastProjection)},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:12},grid:{display:false}}}};
  o.scales.y=Object.assign({beginAtZero:true},extra.y||{}); return o;
}

// Spending guardrails (Expenses card): how often the household had to cut, when, how deep, and the living-expense path. Empty when guardrails are off.
function mcGuardRows(g){
  if(!g) return '';
  const pc=v=>Math.round(v*100)+'%', mid=g.livFan[1].filter(v=>v!=null), lo=g.livFan[0].filter(v=>v!=null);
  return '<tr><td>Trials that had to cut spending</td><td>'+pc(g.pCut)+(g.medianFirstCutAge!=null?' · first cut at a median age of '+Math.round(g.medianFirstCutAge):'')+'</td></tr>'+
    '<tr><td>Depth of the deepest cut (share of discretionary spending)</td><td>median '+pc(g.medianDepth)+' · 90th pct '+pc(g.p90Depth)+' · '+pc(g.pCutOver25)+' of trials cut 25% or more</td></tr>'+
    '<tr><td>Years spent below the planned spending</td><td>median '+Math.round(g.medianCutYears)+' · spending given up in total: median '+mcMoney(g.medianCutTotal)+', 90th pct '+mcMoney(g.p90CutTotal)+' (today\'s $)</td></tr>'+
    (lo.length?'<tr><td>Living expenses, worst-case path (10th pct)</td><td>lowest year '+mcMoney(Math.min(...lo))+' vs. median path lowest '+mcMoney(Math.min(...mid))+'</td></tr>':'');
}
// Systemic panic (correlation convergence): how many trials met a crash early on, and, when the paired pass was run, what the panic itself cost.
function mcPanicRows(pn,cmp,S){
  if(!pn) return '';
  const pc=v=>(v*100).toFixed(1)+'%';
  let h='<tr><td>Systemic panic</td><td>'+Math.round(pn.pFirst10*100)+'% of trials had a panic year in the first 10 years ('+pn.meanFirst10.toFixed(1)+' on average); in those years every portfolio moves more together</td></tr>';
  if(cmp){ const d=(S.successRate-cmp.successRate)*100; h+='<tr><td>Same trials without panic</td><td>success '+pc(cmp.successRate)+' without, '+pc(S.successRate)+' with &mdash; the panic costs '+(Math.abs(d)<0.05?'nothing measurable':Math.abs(d).toFixed(1)+' points')+'</td></tr>'; }
  return h;
}
function mcRender(){
  const {cfg,S,R}=mcResults, det=lastProjection?mcMeasure(lastProjection,{pass:[0,0],ltcYears:[0,0]}):null;
  mcEl('mcOut').style.display='';
  const pct=v=>(v*100).toFixed(0)+'%', detEnd=det?det.estateFin+det.estateRe:null;
  mcEl('mcSummary').innerHTML=
    '<div class="mc-big">'+(S.successRate*100).toFixed(1)+'% <span>of '+S.N+' trials stayed '+(S.guard?'funded <b>with spending guardrails</b> (cutting discretionary spending when needed)':'fully funded')+'</span></div>'+
    '<table class="mc-tbl"><tr><td>Assets in the last projected year (today\'s $)</td><td>10th pct '+mcMoney(S.estate.p10)+' · median '+mcMoney(S.estate.p50)+' · 90th pct '+mcMoney(S.estate.p90)+(detEnd!=null?' · plan as entered '+mcMoney(detEnd):'')+'</td></tr>'+
    '<tr><td>Lifetime income tax</td><td>median '+mcMoney(S.lifetimeTax.p50)+' · 90th pct '+mcMoney(S.lifetimeTax.p90)+'</td></tr>'+mcGuardRows(S.guard)+mcPanicRows(S.panic,mcResults.cmp,S)+'</table>'+(mcResults.complete?'':'<div class="mc-stale">Cancelled run: partial results.</div>');

  // why trials ran short
  if(!R.nFail){ mcEl('mcReasons').innerHTML='<div class="mc-reasons"><h4 class="mc-h">Why trials ran short</h4><p class="mc-note">No trial ran short.</p></div>'; }
  else {
    const bars=R.primary.map(x=>'<div class="mc-bar"><div class="mc-bar-lbl">'+x.label+'</div><div class="mc-bar-track"><div class="mc-bar-fill" style="width:'+(x.share*100).toFixed(1)+'%"></div></div><div class="mc-bar-val">'+pct(x.share)+' <small>('+x.count+')</small></div></div>').join('');
    const rows=R.factors.map(f=>'<tr><td>'+f.label+'</td><td>'+pct(f.prevalence)+'</td><td>'+pct(f.shareOfFailures)+'</td><td><b>'+(f.failRateWith*100).toFixed(0)+'%</b> vs '+(f.failRateWithout*100).toFixed(0)+'%</td></tr>').join('');
    mcEl('mcReasons').innerHTML='<div class="mc-reasons"><h4 class="mc-h">Why trials ran short <small>'+R.nFail+' of '+S.N+' trials; first shortfall at a median age of '+(S.medianFailAge?S.medianFailAge.toFixed(0):'–')+', median total shortfall '+mcMoney(S.medianShortfall)+'</small></h4>'+
      '<div class="mc-sub">Main cause of each failure <small>(one cause per trial, in this order of priority)</small></div>'+bars+
      '<div class="mc-sub">Risk factors <small>(a trial can have several)</small></div>'+
      '<table class="mc-tbl mc-ftbl"><tr><th>Factor</th><th>In all trials</th><th>In failures</th><th>Failure rate with vs without</th></tr>'+rows+'</table></div>';
  }

  mcRenderStudy();

  // charts
  const lastK=Math.max(...S.fan[2].map((v,k)=>v==null?-1:k)), n=lastK+1;
  const ages=[]; for(let k=0;k<n;k++) ages.push(Math.round(S.age0+k));
  const cut=a=>a.slice(0,n);
  // datasets 0=10th 1=25th 2=median 3=75th 4=90th; labels starting with '_' are hidden from the legend. Bands: 10–25 light, 25–75 dark, 75–90 light.
  const lbl=['_10th','_25th','Median','25th–75th percentile','10th–90th percentile'], fill=[false,'-1',false,'-2','-1'], bg=['','rgba(15,110,86,0.14)','','rgba(15,110,86,0.32)','rgba(15,110,86,0.14)'];
  const ds=S.fan.map((d,i)=>({label:lbl[i],data:cut(d),borderColor:i===2?'#0f6e56':'rgba(15,110,86,0.30)',backgroundColor:bg[i]||'#0f6e56',borderWidth:i===2?2.5:1,pointRadius:0,fill:fill[i]}));
  if(det) ds.push({label:'Plan as entered',data:ages.map((_,k)=>k<det.n?det.fin[k]+det.re[k]:null),borderColor:'#b45309',borderDash:[6,4],borderWidth:2,pointRadius:0,fill:false});
  const mk=(key,id,data,opts)=>{ if(mcCharts[key]) mcCharts[key].destroy(); mcCharts[key]=new Chart(mcEl(id),{type:'line',data,options:opts}); };
  mk('fan','mcFanCanvas',{labels:ages,datasets:ds},mcChartOpts({y:{ticks:{callback:v=>mcMoney(v)}},plugins:{tooltip:{filter:it=>!String(it.dataset.label).startsWith('_'),callbacks:{label:c=>c.dataset.label+': '+mcMoney(c.parsed.y)}}}}));
  mk('funded','mcFundedCanvas',{labels:ages,datasets:[{label:'Fully funded through this age',data:cut(S.fundedThrough).map(v=>v*100),borderColor:'#0f6e56',backgroundColor:'rgba(15,110,86,0.12)',fill:true,pointRadius:0,borderWidth:2.5},{label:'Still alive (either person)',data:cut(S.alive).map(v=>v*100),borderColor:'#6b7280',borderDash:[4,3],pointRadius:0,borderWidth:1.5,fill:false}]},
     mcChartOpts({y:{min:0,max:100,ticks:{callback:v=>v+'%'}},plugins:{tooltip:{callbacks:{label:c=>c.dataset.label+': '+c.parsed.y.toFixed(1)+'%'}}}}));
  mcEl('mcCaveats').innerHTML='Not random in this version: Social Security and pension amounts, tax law. Inherited assets come from each source plan\'s own simulated lifespan, care and the same market shocks (sources imported before the donor table existed stay as planned). Returns are lognormal with the plan\'s growth rates as the average; inflation is a persistent process around the plan\'s rate that moves fixed-dollar items (no-COLA pension, un-indexed thresholds, cost basis) and nominal-rate growth, while "inflation ± X%" growth keeps its real rate; mortality is a unisex Gompertz curve (modal age '+cfg.mortality.mode+'); LTC replaces the LTC card. Survivor living expenses and pension survivorship follow the plan\'s own settings.';
}

// ── Study a trial: replay one trial (same seed + trial number = the same random draws) and load it into the chart grid ──
function mcRenderStudy(){
  const host=mcEl('mcStudy'); if(!host) return;
  const {S,R,results}=mcResults, L=R.list||[];
  const money=v=>mcMoney(v);
  const opts=L.slice(0,300).map(f=>'<option value="'+f.trial+'">#'+(f.trial+1)+' · runs out at '+Math.round(f.failAge)+' · '+f.causeShort+' · short '+money(f.shortfall)+'</option>').join('');
  host.innerHTML='<h4 class="mc-h">Study one trial <small>loads it into the charts above (a copy; your plan is not changed)</small></h4><div class="mc-row">'+
    (L.length?'<button type="button" class="btn" data-mc-pick="first">Earliest failure</button><button type="button" class="btn" data-mc-pick="median">Median failure</button><button type="button" class="btn" data-mc-pick="worst">Largest shortfall</button>'+
      '<label class="mc-f">Failed trials'+(L.length>300?' (first 300)':'')+'<select id="mcTrialSel">'+opts+'</select></label><button type="button" class="btn" id="mcTrialSelGo">Load</button>':'')+
    '<label class="mc-f">Any trial #<input type="number" id="mcTrialNum" min="1" max="'+S.N+'" step="1" value="1"></label><button type="button" class="btn" id="mcTrialNumGo">Load</button></div>';
  const pick=how=>{
    if(!L.length) return;
    const f=how==='first'?L[0]:how==='median'?L[Math.floor((L.length-1)/2)]:L.reduce((a,b)=>b.shortfall>a.shortfall?b:a);
    mcLoadTrial(f.trial);
  };
  host.querySelectorAll('[data-mc-pick]').forEach(b=>b.onclick=()=>pick(b.dataset.mcPick));
  const sel=mcEl('mcTrialSel'); if(sel) mcEl('mcTrialSelGo').onclick=()=>mcLoadTrial(parseInt(sel.value,10));
  mcEl('mcTrialNumGo').onclick=()=>{ const n=parseInt(mcEl('mcTrialNum').value,10); if(n>=1&&n<=S.N) mcLoadTrial(n-1); };
}

// Is the plan still the one the loaded trial was replayed from?
function mcTrialStillValid(){ return !!mcTrialView && mcPlanKey()===mcTrialView.key; }

// A/B: A = the plan as entered, B = the loaded trial. What the charts show is mcTrialShown(); mcShowingTrial() is true while B is on.
const mcTrialShown=()=>mcTrialView?(mcTrialView.view==='A'?mcTrialView.planProj:mcTrialView.proj):null;
const mcShowingTrial=()=>!!mcTrialView&&mcTrialView.view!=='A';

// Every projection of the card: A (the plan) and whichever of B (Monte Carlo failure), C (Monte Carlo success), D (stress test), E (stress + Monte Carlo success), F (stress + Monte Carlo failure) are loaded.
function mcViewProjs(v){ return [v.planProj].concat([v.b,v.c,v.d,v.e,v.f].filter(Boolean).map(t=>t.proj)); }
// Fit every chart's Y scale to the larger of A and B (dry passes, nothing drawn), so flipping A/B changes only the data, never the axes.
function mcFitBoth(){
  const v=mcTrialView, keys=Object.keys(chartYMax), mx={};
  mcViewProjs(v).forEach(pr=>{
    keys.forEach(k=>{ chartYMax[k]=null; }); lastProjection=pr; window.dryPass=true;
    try{ buildAllCharts(); } finally{ window.dryPass=false; }
    keys.forEach(k=>{ if(chartYMax[k]!=null) mx[k]=Math.max(mx[k]||0,chartYMax[k]); });
  });
  keys.forEach(k=>{ chartYMax[k]=mx[k]!=null?mx[k]:null; });
  applySameScale(DEFAULT_SAME_SCALE);   // the income / expense / tax charts start on one common scale, as in a new plan
}
// Draw A once without animation and keep every chart's lines as (age index, value) points per Y axis: the faint "ghost" of A drawn behind B (abGhost plugin, overlayPlugin.js).
// Panels are opened while this runs (a collapsed chart has no size), then put back as they were.
function mcCaptureGhosts(){
  const v=mcTrialView, prev=window.liveDrag; window.liveDrag=true;   // update('none'): positions are final, no tween
  try{
    expandAllChartPanels(); lastProjection=v.planProj; renderCharts();
    Object.keys(charts).forEach(k=>{
      const c=charts[k]; if(!c) return;
      if(k==='ss'||!c.chartArea){ c._abGhost=null; return; }
      c._abGhost=c.data.datasets.map((ds,i)=>{
        const meta=c.getDatasetMeta(i), sc=c.scales[ds.yAxisID||meta.yAxisID||'y']; if(!sc||meta.hidden||ds.hidden) return null;
        return {ax:sc.id, pts:meta.data.map(p=>(p&&!p.skip&&Number.isFinite(p.x)&&Number.isFinite(p.y))?sc.getValueForPixel(p.y):null)};
      }).filter(Boolean);
    });
  } finally{ window.liveDrag=prev; syncChartPanels(); }
}
function mcReplayOk(){
  if(mcPlanKey()!==mcStateAtRun){ mcEl('mcStale').style.display=''; alert('The plan changed since this run, so this trial can no longer be replayed exactly. Run the simulation again.'); return false; }
  return true;
}
// Put trial B's or C's fields on the view itself: the other charts and overlays read mcTrialView.state / .cap / .trial / .proj for the trial on screen.
function mcUseTrial(v,which){ const t=v[({B:'b',C:'c',D:'d',E:'e',F:'f'})[which]||'b']; if(!t) return; ['trial','proj','state','cap','pos','cause','sm'].forEach(f=>{ v[f]=t[f]; }); v.cur=({C:1,D:1,E:1,F:1})[which]?which:'B'; }
// C: successful trials (the ones that stayed funded), in trial order. Each C click shows the next one.
function mcOkTrials(){ if(!mcResults) return []; if(!mcResults._ok) mcResults._ok=mcResults.results.reduce((a,r,i)=>{ if(r.failK<0) a.push(i); return a; },[]); return mcResults._ok; }
function mcLoadSuccess(trial){
  if(!mcResults||mcRun||!mcReplayOk()) return;
  const cap=mcReplayTrial(mcResults.cfg,trial), old=mcTrialView;
  const t={trial, proj:cap.proj, state:cap.state, cap, pos:-1, cause:null, okPos:mcOkTrials().indexOf(trial)};
  if(old){ old.c=t; mcUseTrial(old,'C'); old.view='C'; }
  else mcTrialView=Object.assign({planProj:computeProjection(), key:mcPlanKey(), view:'C', cur:'C', b:null, c:t, d:null}, t);   // first thing loaded is a success (e.g. "Any trial #"): start the A/B/C/D view with C on
  mcFitBoth(); mcCaptureGhosts();
  lastProjection=mcTrialView.proj; renderCharts(); mcShowBanner();
  const bn=mcEl('mcTrialBanner'); if(bn&&bn.scrollIntoView&&!old) bn.scrollIntoView({behavior:'smooth',block:'start'});
}
function mcCStep(d){   // next / previous successful trial (wraps around)
  const ok=mcOkTrials(); if(!mcTrialView||!ok.length) return;
  const cur=mcTrialView.c?mcTrialView.c.okPos:-1;
  mcLoadSuccess(ok[cur<0?(d>0?0:ok.length-1):(cur+d+ok.length)%ok.length]);
}
// The C button: from A or B it shows the successful run already chosen (the first one the first time); on C it moves on to the next.
function mcCPress(){ const v=mcTrialView; if(!v) return; if(v.view==='C'||!v.c) mcCStep(1); else mcAbSet('C'); }
// D: stress tests (display/stressPanel.js). The list is the card's scenarios in table order; each D click shows the next one (key D; Shift+D goes back; wraps).
// Pressing D with no stress results for this plan runs the stress tests with the card's current settings first.
// The D list: the stress card's results (table order), then every other market scenario the app knows (saved in the plan, or defined in the chat), so a scenario a model or the user defined
// can be shown and stepped to without running the card. Each entry {id,label}; the card's results come first so the table's "Show in charts" indexes stay valid.
function mcDList(){
  const out=[], seen={};
  ((typeof stResults!=='undefined'&&stResults)?stResults.results:[]).forEach(r=>{ out.push(r); seen[r.id]=1; });
  if(typeof msList==='function') msList().forEach(p=>{ if(!seen[p.id]){ out.push({id:p.id,label:p.label,path:true}); seen[p.id]=1; } });
  return out;
}
function mcLoadStress(idx){
  if(typeof stEnsureFresh!=='function'||mcRun) return;
  stEnsureFresh();   // run the stress tests with the card's settings when there are no results for the plan as it is now
  const L=mcDList(); if(!L.length) return;
  idx=((idx%L.length)+L.length)%L.length;
  mcShowD(L[idx].id, idx, L[idx].label);
}
// Load one market scenario (by id) as the D view: a replay on a private copy of the plan, with its yearly returns and inflation in the Market return / Inflation charts.
// Works with no stress-test run: a path is placed by its own `from`, the presets by the Stress card's settings. → true when shown
function mcLoadMarketPath(id){
  if(typeof mcRun!=='undefined'&&mcRun) return false;
  const L=mcDList(); let idx=L.findIndex(x=>x.id===id);
  if(idx<0){ const p=apiPathById(id); if(!p) return false; msSessionAdd(p); idx=mcDList().findIndex(x=>x.id===id); }
  const e=mcDList()[idx]; return mcShowD(e.id, idx, e.label);
}
function mcShowD(id, idx, label){
  const cfg=(typeof stResults!=='undefined'&&stResults)?stResults.cfg:stDefaultCfg();
  const known=stScenarios(cfg).some(s=>s.id===id), p=known?null:apiPathById(id);
  const rp=stReplay(cfg,id,p?[stPathScenario(p)]:[]); if(!rp) return false;
  const t={trial:-1, proj:rp.proj, state:rp.state, cap:rp, pos:-1, cause:null, idx, id, label};
  const old=mcTrialView, planProj=(old&&old.planProj)||computeProjection();
  if(old){ old.d=t; mcUseTrial(old,'D'); old.view='D'; }
  else mcTrialView=Object.assign({planProj, key:mcPlanKey(), view:'D', cur:'D', b:null, c:null, d:t}, t);
  mcFitBoth(); mcCaptureGhosts();
  lastProjection=mcTrialView.proj; renderCharts(); mcShowBanner();
  const bn=mcEl('mcTrialBanner'); if(bn&&bn.scrollIntoView&&!old) bn.scrollIntoView({behavior:'smooth',block:'start'});
  return true;
}
function mcDStep(d){ const v=mcTrialView, n=mcDList().length||3; mcLoadStress(v&&v.d?v.d.idx+d:(d>0?0:n-1)); }
function mcDPress(){ const v=mcTrialView; if(!v||v.view==='D'||!v.d) mcDStep(1); else mcAbSet('D'); }
// E / F: the trials of the Stress test card's "Run stress tests + Monte Carlo" run (display/stressPanel.js): a Monte Carlo trial played under a stress scenario, so the stress test's returns and inflation
// replace the random ones inside its years and the rest of the trial's draws (lifespans, care, inheritance, other years) stay random. E = one that stayed funded, F = one that ran short.
// The list is every such trial of every scenario, scenario by scenario, in trial order; each E / F click shows the next one (key E / F; Shift goes back; wraps).
function mcSmList(kind){
  const M=(typeof stResults!=='undefined'&&stResults)?stResults.mc:null; if(!M) return [];
  const out=[]; M.rows.forEach((row,ri)=>{ if(!row.stressDef) return; row.res.forEach((m,t)=>{ if((m.failK<0)===(kind==='E')) out.push({row:ri,trial:t}); }); });
  return out;
}
function mcSmReplayOk(){
  if(typeof stResults==='undefined'||!stResults||stResults.planKey!==mcPlanKey()){ alert('The plan changed since the stress test + Monte Carlo run, so this trial can no longer be replayed exactly. Run it again.'); return false; }
  return true;
}
function mcLoadSm(kind,pos){
  if(mcRun||(typeof stMcRun!=='undefined'&&stMcRun)) return;
  const L=mcSmList(kind); if(!L.length||!mcSmReplayOk()) return;
  pos=((pos%L.length)+L.length)%L.length;
  const it=L[pos], row=stResults.mc.rows[it.row], cap={};
  cap.measure=mcRunTrial(stResults.mc.cfg,it.trial,null,cap,row.stressDef); cap.scen=row.stressDef.scen; cap.start=row.stressDef.start; cap.mcCfg=stResults.mc.cfg;
  const t={trial:it.trial, proj:cap.proj, state:cap.state, cap, pos:-1, cause:null, sm:{pos, n:L.length, label:row.label, row:it.row}};
  const old=mcTrialView, planProj=(old&&old.planProj)||computeProjection(), k=kind.toLowerCase();
  if(old){ old[k]=t; mcUseTrial(old,kind); old.view=kind; }
  else mcTrialView=Object.assign({planProj, key:mcPlanKey(), view:kind, cur:kind, b:null, c:null, d:null, e:null, f:null, [k]:t}, t);
  mcFitBoth(); mcCaptureGhosts();
  lastProjection=mcTrialView.proj; renderCharts(); mcShowBanner();
  const bn=mcEl('mcTrialBanner'); if(bn&&bn.scrollIntoView&&!old) bn.scrollIntoView({behavior:'smooth',block:'start'});
}
function mcSmStep(kind,d){ const v=mcTrialView, n=mcSmList(kind).length, cur=v&&v[kind.toLowerCase()]; if(!n) return; mcLoadSm(kind,cur?cur.sm.pos+d:(d>0?0:n-1)); }
function mcSmPress(kind){ const v=mcTrialView; if(!v||v.view===kind||!v[kind.toLowerCase()]) mcSmStep(kind,1); else mcAbSet(kind); }
// The "Show in charts" buttons of the stress card's Monte Carlo table: the first success / failure of that scenario's row.
function mcSmRow(kind,ri){ const L=mcSmList(kind), i=L.findIndex(x=>x.row===ri); if(i>=0) mcLoadSm(kind,i); }
function mcLoadTrial(trial){
  if(!mcResults||mcRun) return;
  // A trial that stayed funded is a Monte Carlo SUCCESS (C), not a failure (B): "Any trial #" can name either kind, and B is the failure view.
  const res=mcResults.results&&mcResults.results[trial];
  if(res&&res.failK<0){ mcLoadSuccess(trial); return; }
  if(!mcReplayOk()) return;
  const cap=mcReplayTrial(mcResults.cfg,trial), L=mcResults.R.list||[], pos=L.findIndex(f=>f.trial===trial);
  const planProj=(mcTrialView&&mcTrialView.planProj)||computeProjection();   // A: the plan as entered (the plan cannot have changed while a trial is loaded)
  const t={trial, proj:cap.proj, state:cap.state, cap, pos, cause:pos>=0?L[pos].causeShort:null};
  mcTrialView=Object.assign({planProj, key:mcPlanKey(), view:'B', cur:'B', b:t, c:(mcTrialView&&mcTrialView.c)||null, d:(mcTrialView&&mcTrialView.d)||null, e:(mcTrialView&&mcTrialView.e)||null, f:(mcTrialView&&mcTrialView.f)||null}, t);   // b = the trial loaded by the study row / ◀ ▶, c = the successful run of the C button; the fields of whichever is shown are copied onto the view (mcUseTrial)
  mcFitBoth(); mcCaptureGhosts();
  lastProjection=cap.proj; renderCharts(); mcShowBanner();
  const b=mcEl('mcTrialBanner'); if(b&&b.scrollIntoView) b.scrollIntoView({behavior:'smooth',block:'start'});
}
function mcTrialClear(){
  mcTrialView=null; restoreChartYMax();
  allCharts().forEach(c=>{ c._abGhost=null; });
  const b=mcEl('mcTrialBanner'); if(b){ b.hidden=true; b.innerHTML=''; }
  const g=mcEl('chartGrid'); if(g){ g.classList.remove('trial-view'); g.classList.remove('trial-view-a'); g.classList.remove('trial-view-c'); g.classList.remove('trial-view-d'); g.classList.remove('trial-view-e'); g.classList.remove('trial-view-f'); }
}
function mcTrialExit(){ mcTrialClear(); recompute(); }
// Flip between A (plan) and B (trial): the charts tween from one to the other on fixed axes; B also shows A as a faint dashed ghost.
function mcAbSet(view){
  const v=mcTrialView; if(!v||v.view===view) return;
  if(view==='C'&&!v.c){ mcCStep(1); return; }
  if(view==='D'&&!v.d){ mcDStep(1); return; }
  if((view==='E'&&!v.e)||(view==='F'&&!v.f)){ mcSmStep(view,1); return; }
  if(view!=='A') mcUseTrial(v,view);
  v.view=view; lastProjection=mcTrialShown(); renderCharts(); mcShowBanner(true);
}
function mcAbToggle(){ if(mcTrialView) mcAbSet(mcTrialView.view==='A'?(mcTrialView.cur||'B'):'A'); }   // B key: plan <-> the trial last shown (B or C)
// The buttons' letters are not the internal view ids (B = failure, C = success, D = stress test, E / F = stress + MC success / failure, which tests and saved code still use).
// Shown to the user: A Plan, B Stress test, C Stress + MC failure, D Stress + MC success, E Monte Carlo failure, F Monte Carlo success.
const MC_LET={A:'A',D:'B',F:'C',E:'D',B:'E',C:'F'}, MC_KEY={A:'A',B:'D',C:'F',D:'E',E:'B',F:'C'};   // internal view id -> shown letter, and back (the keyboard)
function mcBStep(d){   // Monte Carlo failures (internal view B): the next / previous failed trial
  const L=mcResults&&mcResults.R.list||[]; if(!mcTrialView||!L.length) return;
  const bp=mcTrialView.b?mcTrialView.b.pos:mcTrialView.pos, i=bp<0?(d>0?0:L.length-1):Math.max(0,Math.min(L.length-1,bp+d));
  mcLoadTrial(L[i].trial);
}
function mcBPress(){ const v=mcTrialView; if(!v) return; if(v.view==='B'||!v.b) mcBStep(1); else mcAbSet('B'); }
document.addEventListener('keydown',e=>{
  if(!mcTrialView||e.ctrlKey||e.metaKey||e.altKey||!/^[aAbBcCdDeEfF]$/.test(e.key)) return;
  const t=e.target, tag=t&&t.tagName; if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
  e.preventDefault();
  const k=MC_KEY[e.key.toUpperCase()];   // the internal view the pressed letter stands for
  if(k==='A') mcAbSet('A');
  else if(k==='D'){ if(e.shiftKey) mcDStep(-1); else mcDPress(); }
  else if(k==='E'||k==='F'){ if(e.shiftKey) mcSmStep(k,-1); else mcSmPress(k); }
  else if(k==='B'){ if(e.shiftKey) mcBStep(-1); else mcBPress(); }
  else if(e.shiftKey&&mcTrialView.view==='C') mcCStep(-1);   // Shift+F: previous successful Monte Carlo run
  else mcCPress();
});
function mcTrialStep(d){   // previous / next trial of the kind on screen: a failed trial while B is on, a successful run while C is on, a stress test while D is on
  if(mcTrialView&&mcTrialView.cur==='D'){ mcDStep(d); return; }
  if(mcTrialView&&(mcTrialView.cur==='E'||mcTrialView.cur==='F')){ mcSmStep(mcTrialView.cur,d); return; }
  if(mcTrialView&&mcTrialView.cur==='C'){ mcCStep(d); return; }
  mcBStep(d);
}
function mcShowBanner(keep){
  const v=mcTrialView, b=mcEl('mcTrialBanner'); if(!v||!b) return;
  const isSm=v.cur==='E'||v.cur==='F', m=v.cap.measure, cfg=isSm?v.cap.mcCfg:(mcResults?mcResults.cfg:null), n=v.proj.married?2:1, L=(mcResults&&mcResults.R.list)||[];
  const pctS=x=>(x>=0?'+':'\u2212')+Math.abs(Math.round(x*100))+'%';
  const isD=v.cur==='D', draws=[];
  let similar='', head;
  const verdict=m.failK>=0?'<b>money runs out at age '+Math.round(m.failAge)+'</b>'+(v.cause?' ('+v.cause+')':''):'<b>stays funded</b> to the end';
  if(isD){
    const rp=v.cap, sc=rp.scen, st=mcDList().length;
    head='Stress test <b>'+v.d.label+'</b> ('+(v.d.idx+1)+' of '+st+'): '+verdict+'. '+MC_LET.D+' is a replay, not your plan; the dashed grey lines are A.';
    draws.push('shock starts at age '+(rp.proj.rows[0].age0+rp.start).toFixed(0)+' · '+sc.eq.length+' years · stock return '+Math.round((sc.eq.reduce((a,x)=>a*(1+x),1)-1)*100)+'% compounded'+(sc.infl?' · inflation '+Math.round(sc.infl[0]*1000)/10+'% to '+Math.round(Math.max.apply(null,sc.infl)*1000)/10+'% peak':' · plan\'s inflation'));
  } else if(isSm){
    const sc=v.cap.scen, inf=v.cap.info, sm=v.sm;
    head='Stress + Monte Carlo '+(v.cur==='E'?'success':'failure')+' <b>#'+(v.trial+1)+'</b> under <b>'+sm.label+'</b> ('+(sm.pos+1)+' of '+sm.n+'): '+verdict+'. '+MC_LET[v.cur]+' is a replay, not your plan; the dashed grey lines are A.';
    draws.push('shock starts at age '+(v.proj.rows[0].age0+v.cap.start).toFixed(0)+' · '+sc.eq.length+' years · stock return '+Math.round((sc.eq.reduce((a,x)=>a*(1+x),1)-1)*100)+'% compounded'+(sc.infl?' · inflation '+Math.round(sc.infl[0]*1000)/10+'% to '+Math.round(Math.max.apply(null,sc.infl)*1000)/10+'% peak':''));
    if(cfg.mortality.enabled) draws.push('passes at '+inf.pass.slice(0,n).join(' / '));
    if(cfg.ltc.enabled) draws.push('care '+inf.ltcYears.slice(0,n).map(y=>y>0?y.toFixed(1)+' yr':'none').join(' / '));
    if(cfg.inflation.enabled||sc.infl) draws.push('prices after 15 yrs '+pctS(m.inflRatio15-1)+' vs plan');
    if(cfg.inheritance.enabled&&m.inhN>0) draws.push('inheritance '+(m.inhShift===0?'on time':Math.abs(m.inhShift)+' yr '+(m.inhShift>0?'late':'early'))+', '+Math.round(m.inhRatio*100)+'% of planned');
  } else {
    const inf=v.cap.info;
    if(cfg.mortality.enabled) draws.push('passes at '+inf.pass.slice(0,n).join(' / '));
    if(cfg.ltc.enabled) draws.push('care '+inf.ltcYears.slice(0,n).map(y=>y>0?y.toFixed(1)+' yr':'none').join(' / '));
    if(cfg.returns.enabled) draws.push('market, first 10 yrs '+pctS(Math.exp(m.early10)-1)+' vs expected');
    if(cfg.inflation.enabled) draws.push('prices after 15 yrs '+pctS(m.inflRatio15-1)+' vs plan');
    if(cfg.inheritance.enabled&&m.inhN>0) draws.push('inheritance '+(m.inhShift===0?'on time':Math.abs(m.inhShift)+' yr '+(m.inhShift>0?'late':'early'))+', '+Math.round(m.inhRatio*100)+'% of planned');
    if(v.pos>=0){ const me=L[v.pos], same=L.filter(f=>f.cause===me.cause).length-1;
      similar=same>0?' <span title="Failed trials whose main cause is the same as this one ('+me.causeShort+')">'+same+' other failed trial'+(same>1?'s':'')+' share this cause ('+Math.round((same+1)/L.length*100)+'% of failures).</span>':' No other failed trial shares this cause.'; }
    head='Monte Carlo '+(v.cur==='C'?'success':'failure')+' <b>#'+(v.trial+1)+'</b> of '+mcResults.S.N+': '+verdict+'. '+MC_LET[v.cur]+' is a replay, not your plan; the dashed grey lines are A.'+similar;
  }
  const on=x=>v.view===x?' on':'';
  const stepC=v.cur==='C', stepD=isD, stepN=isSm?mcSmList(v.cur).length:(stepD?(mcDList().length||3):(stepC?mcOkTrials().length:L.length)), stepWhat=isSm?(v.cur==='E'?'stress + Monte Carlo success (D)':'stress + Monte Carlo failure (C)'):(stepD?'stress test (B)':(stepC?'Monte Carlo success (F)':'Monte Carlo failure (E)'));   // ◀ ▶ step through whichever kind is on screen
  b.innerHTML='<div class="mc-tb-top"><span class="mc-tb-title">Stress test card</span><span class="mc-ab" title="Flip the charts between the plan (A), a stress test (B), a Monte Carlo trial played under a stress test that ran short (C) or stayed funded (D), a Monte Carlo failure (E) and a Monte Carlo success (F). Keys: A the plan; B the next stress test (Shift+B the previous); C / D the next stress + Monte Carlo failure / success; E / F the next Monte Carlo failure / success (Shift goes back)">'+
    '<button type="button" class="mc-ab-btn'+on('A')+'" onclick="mcAbSet(\'A\')">A &middot; Plan</button>'+
    '<button type="button" class="mc-ab-btn d'+on('D')+'" onclick="mcDPress()" title="The stress tests of the Stress tests card. Click again for the next one (key: B; Shift+B goes back)">B &middot; Stress Test</button>'+
    '<button type="button" class="mc-ab-btn f'+on('F')+'" onclick="mcSmPress(\'F\')"'+(mcSmList('F').length?'':' disabled')+' title="A Monte Carlo trial played under a stress test that ran out of money. Needs a run of Run stress tests + Monte Carlo. Click again for the next one (key: C; Shift+C goes back)">C &middot; Stress + Monte Carlo Failure</button>'+
    '<button type="button" class="mc-ab-btn e'+on('E')+'" onclick="mcSmPress(\'E\')"'+(mcSmList('E').length?'':' disabled')+' title="A Monte Carlo trial played under a stress test that stayed funded to the end. Needs a run of Run stress tests + Monte Carlo. Click again for the next one (key: D; Shift+D goes back)">D &middot; Stress + Monte Carlo Success</button>'+
    '<button type="button" class="mc-ab-btn'+on('B')+'" onclick="mcBPress()"'+(v.b||L.length?'':' disabled')+' title="A Monte Carlo failure (loaded from the Monte Carlo card, Study one trial). Click again for the next one (key: E; Shift+E goes back)">E &middot; Monte Carlo Failure</button>'+
    '<button type="button" class="mc-ab-btn c'+on('C')+'" onclick="mcCPress()"'+(mcOkTrials().length?'':' disabled')+' title="A Monte Carlo trial that stayed funded to the end. Click again for the next one (key: F; Shift+F goes back)">F &middot; Monte Carlo Success</button></span>'+
    '<span class="mc-tb-sp"></span>'+
    '<button type="button" class="btn" onclick="mcTrialStep(-1)" title="Previous '+stepWhat+'"'+(stepN?'':' disabled')+'>&#9664;</button><button type="button" class="btn" onclick="mcTrialStep(1)" title="Next '+stepWhat+'"'+(stepN?'':' disabled')+'>&#9654;</button>'+
    '<button type="button" class="btn btn-primary" onclick="mcTrialExit()">Back to plan</button></div>'+
    '<div class="mc-tb-msg">'+head+'</div>'+
    (draws.length?'<div class="mc-tb-draws">'+draws.join(' · ')+'</div>':'');
  b.hidden=false; const g=mcEl('chartGrid'); if(g){ g.classList.toggle('trial-view',v.view==='B'); g.classList.toggle('trial-view-c',v.view==='C'); g.classList.toggle('trial-view-d',v.view==='D'); g.classList.toggle('trial-view-e',v.view==='E'); g.classList.toggle('trial-view-f',v.view==='F'); g.classList.toggle('trial-view-a',v.view==='A'); }
}

// A different plan is being loaded (file, sample) or the app is reset: the old results, the loaded trial and a run in progress belong to the old plan. Drop them.
// `settings` (Reset to defaults only): also put the card's own settings (volatility, trials, seed ...) back to MC_DEFAULTS, collapsed; loading a file does the same (the settings are not part of a plan file, so a different plan starts from the defaults).
function mcResetCard(settings){
  if(typeof llmBridgeReplaced==='function') llmBridgeReplaced();   // the live bridge's server forgets the runs made on the old plan
  if(mcRun){ mcRun.cancel=true; mcRun.discard=true; mcRun=null; }   // a running chunk loop stops at its next tick
  if(mcTrialView) mcTrialClear();
  Object.keys(mcCharts).forEach(k=>{ if(mcCharts[k]){ mcCharts[k].destroy(); mcCharts[k]=null; } });
  mcResults=null; mcStateAtRun=null; if(typeof plMcClearPromoted==='function') plMcClearPromoted();   // master plan list: promoted trials belong to the old plan
  if(settings){ if(typeof state!=='undefined'&&state&&state.ui) state.ui.mcCfg=null; buildMcPanel(); return; }
  ['mcOut','mcStale'].forEach(id=>{ const e=mcEl(id); if(e) e.style.display='none'; });
  ['mcSummary','mcReasons','mcStudy','mcCaveats','mcProg'].forEach(id=>{ const e=mcEl(id); if(e){ if(id==='mcProg') e.textContent=''; else e.innerHTML=''; } });
  const run=mcEl('mcRunBtn'), can=mcEl('mcCancelBtn'); if(run) run.disabled=false; if(can) can.style.display='none';
  mcUpdateInhStatus();
}
// Called from recompute() (app.js): flag results that no longer match the plan.
function mcMarkStale(){
  mcUpdateInhStatus();
  const el=mcEl('mcStale'); if(!el||!mcResults||mcRun) return;
  el.style.display=(mcPlanKey()!==mcStateAtRun)?'':'none';
}
document.addEventListener('DOMContentLoaded',buildMcPanel);
