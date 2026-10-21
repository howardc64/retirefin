'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHAT TOOLS — the chat's thin adapter over compute/scenarioApi.js (the transport-neutral tool registry an MCP server would use too).
// The tools themselves (run_scenarios, sweep, show_chart, get_rows, define_market_scenario, list_market_scenarios, run_market_scenarios, show_market_scenario_in_charts)
// are registered there; this file only (a) hands their declarations to chat.js, (b) runs a call as the in-page chat host, and (c) applies the `effects` a tool asks for
// to the screen. Nothing here writes `state`, and nothing is added to the saved plan file: a scenario reaches the plan only by the user's click on a card
// (Save as Scenario → scnAddFromState; Add to Stress test card → msSave).
// ═══════════════════════════════════════════════════════════════
const chatRuns=new Proxy({},{get:(t,k)=>apiRuns[k],has:(t,k)=>k in apiRuns,ownKeys:()=>Reflect.ownKeys(apiRuns),getOwnPropertyDescriptor:(t,k)=>Object.getOwnPropertyDescriptor(apiRuns,k)});   // read-only view of the API's run store (cards and tests read it)
function chatToolDecls(){ return (typeof apiList==='function')?apiList('neutral'):[]; }
function chatRunStale(run){ return apiRunStale(run); }
// → {isError, response (object for the model), cards:[descriptor], effects:[{type,…}]}
function chatExecTool(name,args){ return apiCall(name,args,{source:'chat'}); }
function chatClearRuns(){ apiClearRuns(); }

// What a tool asked to change on screen. Unknown effect types are ignored (a newer API than this page). → list of short status strings for the chat
function chatApplyEffects(effects){
  const notes=[];
  (effects||[]).forEach(e=>{
    try{
      if(e.type==='showMarketPath'&&typeof mcLoadMarketPath==='function'){ const ok=mcLoadMarketPath(e.id); notes.push(ok?'Showing "'+(apiPathById(e.id)||{label:e.id}).label+'" in the main charts (D view). Use Back to plan to return.':'Could not show that scenario in the charts.'); }
    }catch(err){ console.error('chat effect',err); }
  });
  return notes;
}
