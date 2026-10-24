'use strict';
// ═══════════════════════════════════════════════════════════════
// PLANS / PRODUCER — what a tool (the chat, an MCP host) started, from compute/runJobs.js: the tool stress run (RJ_STRESS → 'stl:<scenarioId>') and the finished or cancelled
// Monte Carlo jobs (RJ_JOBS → groups 'mcj:<job>' and 'mcj:<job>:<scenario>'). They plug into the stress and Monte Carlo producers as extra sources, so they follow the same rules.
// Load after plans/stressProducer.js and plans/monteCarloProducer.js. Headless hosts (no cards) get only these.
// ═══════════════════════════════════════════════════════════════
plRegisterStressSource(()=>typeof RJ_STRESS==='undefined'?null:{owner:'stressTool',prefix:'stl',source:'llm',sr:RJ_STRESS?{results:RJ_STRESS.results,cfg:RJ_STRESS.cfg,planKey:RJ_STRESS.planKey}:null,_t:RJ_STRESS});
plRegisterMcSource(()=>{
  if(typeof RJ_JOBS==='undefined') return null;
  const groups=[];
  RJ_JOBS.forEach(j=>{
    if(j.status!=='done'&&j.status!=='cancelled') return;
    j.rows.forEach(row=>{
      if(!row.res.length) return;
      const id='mcj:'+j.id+(row.id==='none'?'':':'+row.id);
      groups.push({id,kind:row.stressDef?'stress_mc_trial':'mc_trial',keyPrefix:id+':trial:',label:(row.stressDef?row.label+' + ':'')+'Monte Carlo job '+j.id,cfg:j.cfg,res:row.res,stressDef:row.stressDef||null,runKey:j.planKey});
    });
  });
  return {owner:'jobs',token:null,groups};
});
