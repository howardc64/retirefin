'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / CHAT TOOLS — what the chat model may call: run_scenarios, sweep, show_chart, get_rows.
// A tool call is validated and run by compute/scenarioSpec.js on a private clone of the plan; this file keeps the finished runs (in memory
// only), turns a call into (a) a compact result for the model and (b) card descriptors that display/chatCharts.js draws. Nothing here
// writes `state`, and nothing is added to the saved plan file. The only way a scenario reaches the plan is the user's click on a card
// (chatSaveScenario in chatCharts.js → scnAddFromState in scenarios.js).
// ═══════════════════════════════════════════════════════════════
const CHAT_DEFAULT_CHARTS=['assets','annualTax'];
let chatRuns={};        // runId → run object from specRunBatch (+ planKey); 'base' = your plan as entered, refreshed by every call
let chatRunSeq=0;

function chatToolDecls(){ return (typeof specToolSchemas==='function')?specToolSchemas():[]; }
function chatRunStale(run){ return !!run && run.planKey!==specPlanKey(); }

// Give every run of a finished batch its id and remember it.
function chatRegisterBatch(batch){
  const key=batch.planKey;
  batch.base.id='base'; batch.base.planKey=key; chatRuns.base=batch.base;
  batch.scenarios.forEach(r=>{ r.sid=r.id; r.id='r'+(++chatRunSeq); r.planKey=key; chatRuns[r.id]=r; });
}
function chatGetRuns(ids){
  const out=[], missing=[];
  (ids||[]).forEach(id=>{ const r=chatRuns[String(id)]; if(r) out.push(r); else missing.push(String(id)); });
  return {runs:out,missing};
}
const chatToolErr=msg=>({isError:true,response:{error:msg},cards:[]});

function chatChartList(v){
  if(v==null) return {list:CHAT_DEFAULT_CHARTS.slice()};
  if(!Array.isArray(v)||!v.length) return {error:'charts must be a non-empty list of chart names'};
  const bad=v.filter(c=>!SPEC_CHARTS[c]); if(bad.length) return {error:'unknown chart(s): '+bad.join(', ')+'. Available: '+Object.keys(SPEC_CHARTS).join(', ')};
  return {list:v.slice(0,4)};
}

// → {isError, response (object for the model), cards:[descriptor]}
function chatExecTool(name,args){
  args=args||{};
  if(args.__error) return chatToolErr('The tool arguments could not be read as JSON ('+args.__error+'). Send a complete, valid call.');
  try{
    if(name==='run_scenarios'){
      if(!Array.isArray(args.scenarios)||!args.scenarios.length) return chatToolErr('scenarios must be a non-empty list of {id,label,levers}');
      const cl=chatChartList(args.charts); if(cl.error) return chatToolErr(cl.error);
      if(args.metric!=null&&!SPEC_KPIS[args.metric]) return chatToolErr('unknown metric "'+args.metric+'". Available: '+Object.keys(SPEC_KPIS).join(', '));
      const batch=specRunBatch(args.scenarios);
      if(!batch.scenarios.length) return {isError:true,response:{error:'No scenario could be run.',rejected:batch.rejected},cards:[{type:'summary',batch}]};
      chatRegisterBatch(batch);
      const all=[batch.base].concat(batch.scenarios), cards=[{type:'summary',batch}];
      cl.list.forEach(c=>{ try{ cards.push({type:'chart',data:specChartData(c,all,{metric:args.metric}),runIds:all.map(r=>r.id)}); }catch(e){} });
      const resp=specModelSummary(batch); resp.chartsShown=cl.list;
      return {isError:false,response:resp,cards};
    }
    if(name==='sweep'){
      const metric=SPEC_KPIS[args.metric]?args.metric:'finalTotal';
      // The template lacks the swept parameter, so it is not validated alone: each value becomes a full lever that specRunBatch validates (rejections are reported back).
      const t=args.template;
      if(!t||typeof t!=='object'||!SPEC_LEVERS[t.lever]) return chatToolErr('template.lever must be one of: '+Object.keys(SPEC_LEVERS).join(', '));
      const sw=specSweep(t,args.param,args.values);
      if(!sw.scenarios.length) return {isError:true,response:{error:'No value could be run.',rejected:sw.rejected},cards:[]};
      chatRegisterBatch(sw);
      const resp={units:'today\'s dollars',lever:sw.sweep.lever,param:sw.sweep.param,yourPlan:sw.base.kpis,
        results:sw.scenarios.map((r,i)=>({runId:r.id,value:sw.sweep.values[i],status:r.notes[0]&&r.notes[0].status,note:r.notes[0]&&r.notes[0].note||undefined,kpis:r.kpis})),chartShown:metric};
      if(sw.rejected.length) resp.rejected=sw.rejected;
      return {isError:false,response:resp,cards:[{type:'chart',data:specSweepChartData(sw,metric),runIds:sw.scenarios.map(r=>r.id)}]};
    }
    if(name==='show_chart'){
      if(!SPEC_CHARTS[args.chart]) return chatToolErr('unknown chart "'+args.chart+'". Available: '+Object.keys(SPEC_CHARTS).join(', '));
      if(args.metric!=null&&!SPEC_KPIS[args.metric]) return chatToolErr('unknown metric "'+args.metric+'". Available: '+Object.keys(SPEC_KPIS).join(', '));
      const g=chatGetRuns(args.runs); if(g.missing.length) return chatToolErr('unknown runId(s): '+g.missing.join(', ')+'. Known: '+Object.keys(chatRuns).join(', '));
      if(!g.runs.length) return chatToolErr('runs must list at least one runId');
      const runs=g.runs.slice(0,8), stale=runs.some(chatRunStale);
      const resp={shown:args.chart}; if(stale) resp.warning='the plan was edited after some of these runs, so they no longer match the inputs; run the scenarios again for current numbers';
      return {isError:false,response:resp,cards:[{type:'chart',data:specChartData(args.chart,runs,{metric:args.metric}),runIds:runs.map(r=>r.id)}]};
    }
    if(name==='get_rows'){
      const r=chatRuns[String(args.run)]; if(!r) return chatToolErr('unknown runId "'+args.run+'". Known: '+Object.keys(chatRuns).join(', '));
      const resp={run:r.id,label:r.label,csv:specRowsCsv(r,args.fields,args.fromAge,args.toAge)}; if(chatRunStale(r)) resp.warning='the plan was edited after this run';
      return {isError:false,response:resp,cards:[]};
    }
    return chatToolErr('unknown tool "'+name+'". Available: run_scenarios, sweep, show_chart, get_rows');
  }catch(e){
    return chatToolErr(String(e&&e.message||e));
  }
}
function chatClearRuns(){ chatRuns={}; }
