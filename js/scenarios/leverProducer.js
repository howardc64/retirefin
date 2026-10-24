'use strict';
// ═══════════════════════════════════════════════════════════════
// SCENARIOS / PRODUCER — what-if lever scenarios a tool ran (compute/scenarioApi.js, apiRuns: run_scenarios, sweep, imports). One scenario per run, key 'lev:<runId>'.
// Input: the scenario it was run on plus {type:'levers', levers}. The tool's own numbers seed the summary (no engine run). A scenario edited since makes the run stale.
// Delete forgets the run (apiRuns entry); the user's scenario and scenarios are not touched.
// ═══════════════════════════════════════════════════════════════
function scSyncLevers(){
  if(typeof apiRuns==='undefined') return;
  const specs=[];
  Object.keys(apiRuns).forEach(id=>{
    if(id==='base') return; const r=apiRuns[id];
    if(!r||(r.market&&r.market.pathId)||!r.kpis) return;
    const base=scBaseFor(r.scenarioKey||''); if(!base) return;
    const m=r.m, R=Math.round;
    specs.push({key:'lev:'+id,label:r.label,origin:{kind:'lever',groupId:null,ref:{runId:id}},
      input:{baseKey:base.baseKey,baseFingerprint:base.baseFingerprint,overlay:{type:'levers',levers:r.levers||[]}},
      meta:{source:'llm',sid:r.sid||null},
      summary:()=>({kpis:r.kpis,age0:m&&m.age0,n:m&&m.n,fin:m&&m.fin?Array.from(m.fin,R):null,re:m&&m.re?Array.from(m.re,R):null,
        failAge:m&&m.failAge!=null?R(m.failAge):null,shortfall:m?R(m.shortfall):null,lifeTax:m?R(m.lifeTax):null,draws:null})});
  });
  scReconcile('levers',specs);
}
scRegisterProducer('levers',scSyncLevers,{remove(p){ delete apiRuns[p.origin.ref.runId]; return {ok:true}; }});
