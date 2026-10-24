'use strict';
// ═══════════════════════════════════════════════════════════════
// SCENARIOS / PRODUCER — the 🆎 scenario set (display/scenarios.js). One record per scenario, key 'scn:<id>'. The scenario on screen is `state`, the others are scnSnaps.
// Read-only on the set: scUpsert clones the snapshots in and nothing here changes scnOrder / scnSnaps / state.
// Headless (no scenario set: the MCP engine): one plan, 'scn:A', the plan as loaded.
// Delete: a scenario that is not on screen is removed through scnDeleteOther (display/scenarios.js); the one on screen cannot be (switch away first); the last one never.
// ═══════════════════════════════════════════════════════════════
const SC_OWNER_SCN='scenarioSet';
function scSyncScenarios(){
  const specs=[];
  if(typeof scnOrder==='undefined'||typeof scnActive==='undefined'){
    specs.push({key:'scn:A',label:'Scenario A',origin:{kind:'scenario',groupId:null,ref:{scenarioId:'A'}},input:{state:state}});
  } else scnOrder.forEach(id=>{
    const st=(id===scnActive)?state:(typeof scnSnaps!=='undefined'?scnSnaps[id]:null);
    if(!st) return;
    specs.push({key:'scn:'+id, label:(typeof scnLabel==='function'?scnLabel(id):'Scenario '+id),
      origin:{kind:'scenario',groupId:null,ref:{scenarioId:id}}, input:{state:st}});
  });
  scReconcile(SC_OWNER_SCN,specs);
}
scRegisterProducer(SC_OWNER_SCN,scSyncScenarios,{remove(p){
  if(typeof scnDeleteOther!=='function') return {ok:false,why:'scenarios can only be deleted from the page'};
  return scnDeleteOther(p.origin.ref.scenarioId);
}});
