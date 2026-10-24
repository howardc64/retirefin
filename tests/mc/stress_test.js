// Stress tests (compute/stressTest.js). Run from the app folder:  PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/stress_test.js
const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(require('fs').readFileSync(process.env.PLAN,'utf8'));
const ctx=makeCtx(); loadPlan(ctx,plan);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const J=x=>{ ctx.__x=x; return run(ctx,'__x'); };

// helper: run a scenario given as data and return the engine rows' invested+property totals
const totals=(scenJson,start,cfgPatch)=>{ ctx.__s=scenJson; ctx.__st=start; ctx.__cp=cfgPatch||{};
  return run(ctx,`(()=>{const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); Object.assign(cfg,__cp); const p=stRun(__s,__st,cfg); const m=mcMeasure(p,{pass:[0,0],ltcYears:[0,0]}); return {fin:Array.from(m.fin),re:Array.from(m.re),failK:m.failK,tax:m.lifeTax,n:m.n,rows:p.rows.length}})()`); };
const maxdiff=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));

// 1. scenario that equals the plan's own assumptions == deterministic projection
const ref=totals(null,0);
const plain=run(ctx,`(()=>{const p=computeProjection(); const m=mcMeasure(p,{pass:[0,0],ltcYears:[0,0]}); return {fin:Array.from(m.fin),n:m.n}})()`);
ok(ref.n===plain.n&&maxdiff(ref.fin,plain.fin)<1e-9,'stRun(null) == computeProjection()');
// a scenario whose "equity" return equals the plan's own nominal rate and inflation == plan inflation must not move anything
// (use equityShare 0: nothing is hit, only the inflation path is the plan's)
const noop=totals({eq:[-0.5,-0.5,-0.5],infl:null},0,{equityShare:0});
ok(noop.n===plain.n&&maxdiff(noop.fin,plain.fin)<1e-6,'equityShare 0 and plan inflation == deterministic (max diff '+maxdiff(noop.fin,plain.fin).toExponential(1)+')');

// 2. a -30% year on Day 1 lowers invested assets from year 0 on; a +0% real year (return == inflation) is neutral for a plan whose growth is "inflation + 0"
const crash=totals({eq:[-0.3],infl:null},0);
ok(crash.fin[0]<plain.fin[0]&&crash.fin[5]<plain.fin[5],'-30% in year 0 lowers invested assets (yr0 '+Math.round(plain.fin[0])+' -> '+Math.round(crash.fin[0])+')');

// 3. sequence matters: same 3 returns, reversed order, same ending only without withdrawals — with withdrawals bad-first is worse
const bad=totals({eq:[-0.3,0.0,0.3],infl:null},0), good=totals({eq:[0.3,0.0,-0.3],infl:null},0);
const last=a=>a.fin[a.fin.length-1];
ok(bad.fin[3]<=good.fin[3]+1e-6,'losses first leave less than gains first (yr3 '+Math.round(bad.fin[3])+' vs '+Math.round(good.fin[3])+')');

// 4. exact real-rate arithmetic of the hook
const h=run(ctx,`(()=>{const mean=state.inflation; const infl=stInflation({infl:[0.08,0.10],eq:[0,0]},2,mean,10); const hk=stHook({eq:[0,0.05]},2,mean,infl,1);
 return {pi:Array.from(infl.pi).slice(0,5), mean, r0:hk(0.03,'pf:x',2,{mode:'custom',value:5}), r1:hk(0.03,'pf:x',3,{mode:'custom',value:5}), re:hk(0.03,'re:x',2,{mode:'custom',value:5}), out:hk(0.03,'pf:x',5,{mode:'custom',value:5}), cpi2:infl.cpi[3]/infl.cpi[2]}})()`);
ok(Math.abs(h.r0-(1/1.08-1))<1e-12,'year of 0% nominal return with 8% inflation = '+(h.r0*100).toFixed(2)+'% real');
ok(Math.abs(h.r1-(1.05/1.10-1))<1e-12,'+5% nominal with 10% inflation = '+(h.r1*100).toFixed(2)+'% real');
ok(Math.abs(h.re-((1.03)*(1+h.mean)/1.08-1))<1e-12,'property keeps the plan\'s nominal rate, repriced by the scenario inflation');
ok(Math.abs(h.out-0.03)<1e-12,'outside the window the plan\'s own real rate is back');
ok(Math.abs(h.pi[2]-0.08)<1e-12&&Math.abs(h.pi[1]-h.mean)<1e-12&&Math.abs(h.cpi2-1.08)<1e-12,'inflation path placed at the start row; plan\'s rate elsewhere');

// 5. more inflation with flat nominal stocks is worse than the same stocks at plan inflation
const flatScenarioInfl=totals({eq:Array(10).fill(0),infl:null},0), flatHighInfl=totals({eq:Array(10).fill(0),infl:Array(10).fill(0.09)},0);
ok(flatHighInfl.fin[9]<flatScenarioInfl.fin[9],'flat stocks + 9% inflation ends the decade lower than flat stocks at plan inflation ('+Math.round(flatHighInfl.fin[9])+' vs '+Math.round(flatScenarioInfl.fin[9])+')');

// 6. full run: the three scenarios, retirement row, summaries
const all=J(run(ctx,`(()=>{const r=stRunAll(JSON.parse(JSON.stringify(ST_DEFAULTS))); return {start:r.start,startAge:r.startAge,base:{failAge:r.base.failAge,estate:r.baseEstate},res:r.results.map(x=>({id:x.id,label:x.label,failAge:x.m.failAge,estate:x.estate,atEnd:x.atEnd,scenarioAtEnd:x.scenarioAtEnd,low:x.low,lowAge:x.lowAge,gap:x.gapYears,short:x.m.shortfall}))}})()`));
console.log(JSON.stringify(all,null,1));
ok(all.res.length===3,'three scenarios by default');
ok(all.res.every(r=>r.atEnd==null||r.atEnd<=r.scenarioAtEnd+1e-6),'every stress ends its shock window at or below the plan');
ok(all.start>=0,'start row '+all.start+' (age '+all.startAge.toFixed(1)+')');
// 7. start modes
const modes=J(run(ctx,`(()=>{const c=JSON.parse(JSON.stringify(ST_DEFAULTS)); const b=stRun(null,0,c); const o=[]; for(const m of ['now','retire','custom']){ c.start={mode:m,years:7}; o.push(stStartRow(c,b)); } return o})()`));
ok(modes[0]===0&&modes[2]===7,'start modes now / custom = '+modes[0]+' / '+modes[2]+' (retire = '+modes[1]+')');
// 8. reproducible and state untouched
const before=run(ctx,'JSON.stringify(state)'); run(ctx,'stRunAll(JSON.parse(JSON.stringify(ST_DEFAULTS)))'); ok(run(ctx,'JSON.stringify(state)')===before&&run(ctx,'MC_HOOK===null&&MC_INFL===null&&REC_RATES===true'),'plan state and engine hooks restored after a run');
// 9. "Run stress tests + Monte Carlo": mcRunTrial's `stress` argument. Where they collide the stress test wins, everything else stays random.
const offCfg=`(()=>{ const c=JSON.parse(JSON.stringify(MC_DEFAULTS)); c.returns.enabled=false; c.mortality.enabled=false; c.ltc.enabled=false; c.inflation.enabled=false; c.inheritance.enabled=false; return c; })()`;
const eqOff=J(run(ctx,`(()=>{ const c=${offCfg}, sc=stScenarios(JSON.parse(JSON.stringify(ST_DEFAULTS))).find(x=>x.id==='y1966'), cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); const start=stStartRow(cfg,stRun(null,0,cfg));
  const a=mcRunTrial(c,3,null,null,{scen:sc,start,share:100}), b=stRun(sc,start,cfg), m=mcMeasure(b,{pass:[0,0],ltcYears:[0,0]}); return {n:a.n,nb:m.n,d:Math.max(...Array.from(a.fin).map((v,i)=>Math.abs(v-m.fin[i])))}; })()`));
ok(eqOff.n===eqOff.nb&&eqOff.d<1e-6,'every random part off: stress + Monte Carlo trial == the stress test (max diff '+eqOff.d.toExponential(1)+')');
const win=J(run(ctx,`(()=>{ const c=${offCfg}; c.returns.enabled=true; const sc={id:'x',eq:[-0.2,-0.1,0.05,0.1,0.0],infl:null};
  const f=(seed,st)=>{ c.seed=seed; return Array.from(mcRunTrial(c,1,null,null,st).fin); };
  const A=f(11,{scen:sc,start:0,share:100}), B=f(99,{scen:sc,start:0,share:100}), C=f(11,null), D=f(99,null);
  return {inWin:Math.max(...[0,1,2,3,4].map(k=>Math.abs(A[k]-B[k]))), after:Math.abs(A[9]-B[9]), noStressDiffer:Math.abs(C[2]-D[2])}; })()`));
ok(win.inWin<1e-6,'inside the scenario years the random returns are replaced (two seeds agree, diff '+win.inWin.toExponential(1)+')');
ok(win.after>1&&win.noStressDiffer>1,'after the window, and with no stress, the random returns still differ by seed');
const rate=J(run(ctx,`(()=>{ const c=JSON.parse(JSON.stringify(MC_DEFAULTS)); c.trials=60; const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); const R=stRunAll(cfg), sc=stScenarios(cfg).find(x=>x.id==='y1966');
  const go=st=>{ const r=[]; for(let t=0;t<c.trials;t++) r.push(mcRunTrial(c,t,null,null,st)); const S=mcSummarize(r); return {sr:S.successRate,med:S.estate.p50}; };
  const none=go(null), bad=go({scen:sc,start:R.start,share:100}); return {none,bad,hook:MC_HOOK===null&&MC_INFL===null&&REC_RATES===true}; })()`));
// (the success RATE can rise: the scenario's fixed returns replace the random bad tail inside its window; the median final assets are the reliable signal)
ok(rate.bad.med<rate.none.med&&rate.hook,'the 1966 retiree lowers the median final assets of the Monte Carlo trials: '+Math.round(rate.none.med/1000)+'k -> '+Math.round(rate.bad.med/1000)+'k (success '+(rate.none.sr*100).toFixed(1)+'% -> '+(rate.bad.sr*100).toFixed(1)+'%), hooks reset');

console.log(fails?('\n'+fails+' FAILED'):'\nall passed'); process.exit(fails?1:0);
