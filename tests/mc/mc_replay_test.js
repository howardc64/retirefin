// Replay test: mcReplayTrial(cfg, i) must reproduce trial i of a run exactly (same fail year, same assets), and hand back what the chart view needs.
//   PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/mc_replay_test.js
const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(require('fs').readFileSync(process.env.PLAN,'utf8'));
const ctx=makeCtx(); loadPlan(ctx,plan);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const out=run(ctx,`(()=>{
  const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); cfg.trials=300; cfg.ltc.prob=0.9; cfg.returns.volEquity=24;
  const before=JSON.stringify(state);
  const results=mcRangeAll(cfg);
  function mcRangeAll(c){ const r=[]; for(let t=0;t<c.trials;t++) r.push(mcRunTrial(c,t)); return r; }
  const R=mcFailureReasons(results), list=R.list;
  const pick=[list[0],list[list.length>>1],list[list.length-1]].filter(Boolean);
  const checks=pick.map(f=>{ const cap=mcReplayTrial(cfg,f.trial), m=results[f.trial];
    return {trial:f.trial, failK:[cap.measure.failK,m.failK], fin:Math.max(...Array.from(m.fin).map((v,i)=>Math.abs(v-cap.measure.fin[i]))),
            rows:[cap.proj.rows.length,m.n], hasInfl:!!cap.infl, piLen:cap.infl?cap.infl.pi.length:0, ltcState:!!cap.state.ltc, sameState:cap.state===state, pass:cap.info.pass}; });
  const sorted=list.every((f,i)=>i===0||list[i-1].failAge<=f.failAge);
  return {nFail:R.nFail, listLen:list.length, sorted, allFail:list.every(f=>results[f.trial].failK>=0), checks, stateUntouched:before===JSON.stringify(state)};
})()`);
console.log('  failed trials:',out.nFail,'checks:',JSON.stringify(out.checks));
ok(out.nFail>0,'the stressed config produces failures to study');
ok(out.listLen===out.nFail && out.allFail,'failed-trial list = every failed trial, each really failed');
ok(out.sorted,'list is sorted by failure age');
ok(out.checks.every(c=>c.failK[0]===c.failK[1]&&c.rows[0]===c.rows[1]&&c.fin===0),'replay reproduces the run exactly (fail row, row count, assets every year)');
ok(out.checks.every(c=>c.hasInfl&&c.piLen>20&&!c.sameState),'replay returns the inflation path and its own copy of the plan');
ok(out.stateUntouched,'real plan state untouched by replays');
console.log(fails?fails+' FAILED':'all passed'); process.exit(fails?1:0);
