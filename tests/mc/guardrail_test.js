// Spending guardrails (projection.js, state.guardrail). Run from the app folder:  PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/guardrail_test.js
const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(require('fs').readFileSync(process.env.PLAN,'utf8'));
const ctx=makeCtx(); loadPlan(ctx,plan);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const J=code=>run(ctx,code);
// run the Lost Decade stress with a guardrail patch; returns rows summary + measure
const withG=(patch,scen)=>{ ctx.__p=patch; ctx.__sc=scen||'lost'; return J(`(()=>{
  const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); const start=stStartRow(cfg,stRun(null,0,cfg)); const sc=stScenarios(cfg).find(s=>s.id===__sc);
  return withTempState(s=>{ Object.assign(s.guardrail,__p); }, ()=>{ const p=stRun(sc,start,cfg); const m=mcMeasure(p,{pass:[0,0],ltcYears:[0,0]});
    return {rows:p.rows.map(r=>({k:r.k,g:r.guard||null,liv:r.expLiving,unf:r.expUnfunded,unfunded:r.expUnfunded>1})), base:state.living, fin:Array.from(m.fin), failAge:m.failAge, shortfall:m.shortfall, estate:m.estateFin+m.estateRe, n:m.n, guard:m.guard&&{firstCutK:m.guard.firstCutK,minMult:m.guard.minMult,cutYears:m.guard.cutYears}}; }); })()`); };
const maxdiff=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));

// 1. off == on-with-a-band-that-never-fires (same projection), and off adds no field
const off=withG({enabled:false}), never=withG({enabled:true,band:100000});
ok(off.rows.every(r=>r.g===null),'guardrail off: rows carry no guard field');
ok(never.n===off.n&&maxdiff(never.fin,off.fin)<1e-9&&never.rows.every(r=>r.g&&r.g.mult===1),'enabled but never triggered == off (max diff '+maxdiff(never.fin,off.fin).toExponential(1)+')');

// 2. the cut rule is exact: a cut is decided iff wr > iwr*(1+band), applied x(1-cut) to NEXT year's discretionary spending
const on=withG({enabled:true,discPct:30,band:20,cutPct:10,sunsetYears:0});
const R=on.rows, RD=R.slice(0,-1), cuts=R.filter(r=>r.g.move<0);   // RD: rows that decide something (the last row has no next year)
ok(cuts.length>0,'the Lost Decade trips the guardrail ('+cuts.length+' cut decisions, first in row '+(cuts[0]&&cuts[0].k)+')');
ok(RD.every(r=>(r.g.move<0)===(r.g.iwr!=null&&r.g.wr>r.g.iwr*1.2+1e-12)),'cut iff withdrawal rate > IWR x 1.2 (every row)');
ok(R.slice(1).every((r,i)=>Math.abs(r.g.mult-R[i].g.nextMult)<1e-12)&&cuts.every(r=>Math.abs(r.g.nextMult-r.g.mult*0.9)<1e-12),'next row runs with mult x 0.9 after a cut, unchanged otherwise');
// 3. tripwire: a cut fires exactly when the start-of-year balance is below the tripwire computed from the same year's spending
ok(RD.every(r=>r.g.iwr==null||(r.g.move<0)===(r.g.bal0<r.g.tripwire-1e-6)),'cut iff start balance < tripwire (every row)');
// 4. essential floor: living spending never below (1-discPct) x the plan's amount; a 100% cut leaves exactly the essential part
const full=withG({enabled:true,discPct:30,band:20,cutPct:100,sunsetYears:0});
// (the base amount changes in Long Term Care years, so compare with the same row of the no-guardrail run)
ok(full.rows.every((r,i)=>r.liv>=off.rows[i].liv*0.7-1e-6),'even a 100% cut keeps essential spending (>= 70% of that year\'s living)');
ok(full.rows.some((r,i)=>r.g.mult===0&&Math.abs(r.liv-off.rows[i].liv*0.7)<1e-6),'a 100% cut reaches exactly the essential amount');
// 5. IWR comes from the first year without wages / or from the target
ok(on.rows.find(r=>r.g.iwr!=null).g.iwr>0,'initial IWR set ('+(on.rows.find(r=>r.g.iwr!=null).g.iwr*100).toFixed(2)+'%)');
const tgt=withG({enabled:true,iwrMode:'target',targetWR:2,sunsetYears:0});
ok(tgt.rows.every(r=>r.g.iwr===0.02),'target mode: IWR = the entered 2%');
// 6. sunset: no decision (cut or raise) that would apply within the last N years
const sun=withG({enabled:true,sunsetYears:15});
const noSun=withG({enabled:true,sunsetYears:0});
const lastCutNoSun=Math.max(-1,...noSun.rows.filter(r=>r.g.move<0).map(r=>r.k)), lastCutSun=Math.max(-1,...sun.rows.filter(r=>r.g.move<0).map(r=>r.k));
ok(lastCutSun<=lastCutNoSun&&sun.rows.filter(r=>r.g.move!==0).every(r=>sun.rows.length-1-r.k>=16),'no decision inside the last 15 rows (last at row '+lastCutSun+' of '+(sun.rows.length-1)+')');
// 7. prosperity rule: raises only after cuts, never above 1
const pros=withG({enabled:true,prosperity:true,raisePct:10,sunsetYears:0});
ok(pros.rows.every(r=>r.g.mult<=1+1e-12&&r.g.nextMult<=1+1e-12),'prosperity never raises spending above the plan');
// 8. guardrails never make the stress outcome worse
ok(on.shortfall<=off.shortfall+1e-6&&(off.failAge==null?on.failAge==null:(on.failAge==null||on.failAge>=off.failAge)),'with guardrails the shortfall is no larger and the money lasts no shorter (shortfall '+Math.round(off.shortfall)+' -> '+Math.round(on.shortfall)+')');
const stag=withG({enabled:true,sunsetYears:0},'stag'), stagOff=withG({enabled:false},'stag');
ok(stag.shortfall<=stagOff.shortfall+1e-6,'same for stagflation (shortfall '+Math.round(stagOff.shortfall)+' -> '+Math.round(stag.shortfall)+')');
// 9. stress panel numbers
const all=J(`(()=>{ return withTempState(s=>{ s.guardrail.enabled=true; }, ()=>{ const r=stRunAll(JSON.parse(JSON.stringify(ST_DEFAULTS))); return r.results.map(x=>({id:x.id,g:x.guard})); }); })()`);
ok(all.every(x=>x.g&&x.g.off),'stRunAll returns guardrail details with the no-guardrail comparison');
console.log(JSON.stringify(all.map(x=>({id:x.id,firstCutAge:x.g.firstCutAge,firstCutBal:x.g.firstCutBal&&Math.round(x.g.firstCutBal),cutYears:x.g.cutYears,minMult:x.g.minMult}))));
// 10. Monte Carlo: paired on the same seeds, guardrails never lower the success rate; summary has the guardrail block
const mc=J(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); cfg.trials=150; const o={};
  for(const on of [false,true]) o[on]=withTempState(s=>{ s.guardrail.enabled=on; }, ()=>{ const rs=mcRunRange(cfg,0,150); const sm=mcSummarize(rs); return {success:sm.successRate, guard:sm.guard&&{n:sm.guard.n,pCut:sm.guard.pCut,medianDepth:sm.guard.medianDepth,fan:sm.guard.livFan.map(f=>f[5])}}; });
  return o; })()`);
ok(mc.true.success>=mc.false.success-1e-12,'Monte Carlo success '+(mc.false.success*100).toFixed(1)+'% -> '+(mc.true.success*100).toFixed(1)+'% with guardrails');
ok(mc.false.guard===null&&mc.true.guard&&mc.true.guard.n===150,'summary: guardrail block only when on; '+JSON.stringify(mc.true.guard));
// 11. state untouched, hooks restored
ok(J('state.guardrail.enabled')===false&&J('MC_HOOK===null&&MC_INFL===null'),'plan state and engine hooks restored');
console.log(fails?('\n'+fails+' FAILED'):'\nall passed'); process.exit(fails?1:0);
