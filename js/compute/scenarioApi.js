'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / SCENARIO API — the one tool surface that any LLM host drives: the in-page chat today, an MCP server (or any other transport) tomorrow.
// No DOM, never writes the live scenario. Loaded after scenarioSpec.js and marketScenario.js.
//
//   apiRegister({name, description, inputSchema, handler(args, host) → {isError, response, cards?, effects?}})
//   apiList(fmt, host)      → the tool declarations (a tool with `hosts:[…]` is listed, and callable, only for those host sources) ('neutral': {name, description, parameters}  — what chat.js maps to Gemini / Anthropic;
//                                                       'mcp':     {name, description, inputSchema} — exactly an MCP `tools/list` entry)
//   apiCall(name, args, host) → the handler's result (never throws: a failure is {isError:true, response:{error}} so the model can correct itself)
//   apiToMcpResult(result)  → {content:[{type:'text', text}], isError}   — exactly an MCP `tools/call` result
//   apiResources() / apiReadResource(uri) → MCP-style read-only context (the scenario summary, the market scenario library, the lever catalog)
//
// A handler returns three separate things, so no transport has to know about another one's UI:
//   response  the compact JSON the model sees,
//   cards     optional display descriptors for a host that can draw them (display/chatCharts.js); a headless MCP host ignores them,
//   effects   optional requests to change what is ON SCREEN (e.g. {type:'showMarketPath', id}); a host applies the ones it supports (chat.js → chatApplyEffects).
// Nothing a handler does writes `state`: market scenarios a model defines live in `msSession` (memory) until the USER saves one (a card button → msSave), and every run is on a private
// clone of the scenario. `host` = {source:'chat'|'mcp', …}; the source is stamped on every scenario a call defines.
// ═══════════════════════════════════════════════════════════════
const API_TOOLS={}, API_ORDER=[];
function apiRegister(def){
  if(!def||!def.name||typeof def.handler!=='function') throw new Error('a tool needs a name and a handler');
  if(!API_TOOLS[def.name]) API_ORDER.push(def.name);
  API_TOOLS[def.name]=def;
}
function apiList(fmt,host){
  return API_ORDER.filter(n=>!API_TOOLS[n].hosts||(host&&API_TOOLS[n].hosts.includes(host))).map(n=>{ const t=API_TOOLS[n], schema=typeof t.inputSchema==='function'?t.inputSchema():t.inputSchema;
    const d=typeof t.description==='function'?t.description():t.description;
    return fmt==='mcp'?{name:t.name,description:d,inputSchema:schema}:{name:t.name,description:d,parameters:schema}; });
}
const apiErr=msg=>({isError:true,response:{error:msg},cards:[],effects:[]});
function apiCall(name,args,host){
  args=args||{};
  if(args.__error) return apiErr('The tool arguments could not be read as JSON ('+args.__error+'). Send a complete, valid call.');
  const t=API_TOOLS[name]; if(!t) return apiErr('unknown tool "'+name+'". Available: '+API_ORDER.join(', '));
  if(t.hosts&&!t.hosts.includes((host&&host.source)||'chat')) return apiErr('the tool "'+name+'" is not available to this host');   // e.g. Monte Carlo job tools are for the MCP server
  try{ const r=t.handler(args,host||{source:'chat'}); r.cards=r.cards||[]; r.effects=r.effects||[]; return r; }
  catch(e){ return apiErr(String(e&&e.message||e)); }
}
function apiToMcpResult(r){ return {content:[{type:'text',text:JSON.stringify(r.response)}],isError:!!r.isError}; }

// ── the run store (in memory only) ───────────────────────────────
let apiRuns={}, apiRunSeq=0;      // runId → run object (+ scenarioKey); 'base' = your scenario as entered, refreshed by every call
function apiRegisterBatch(batch){
  const key=batch.scenarioKey;
  batch.base.id='base'; batch.base.scenarioKey=key; apiRuns.base=batch.base;
  batch.scenarios.forEach(r=>{ r.sid=r.id; r.id='r'+(++apiRunSeq); r.scenarioKey=key; apiRuns[r.id]=r; });
}
function apiGetRuns(ids){
  const out=[], missing=[];
  (ids||[]).forEach(id=>{ const r=apiRuns[String(id)]; if(r) out.push(r); else missing.push(String(id)); });
  return {runs:out,missing};
}
function apiClearRuns(){ apiRuns={}; for(const k in msSession) delete msSession[k]; }
const apiRunStale=run=>!!run&&run.scenarioKey!==specScenarioKey();
const API_DEFAULT_CHARTS=['assets','annualTax'];
function apiChartList(v){
  if(v==null) return {list:API_DEFAULT_CHARTS.slice()};
  if(!Array.isArray(v)||!v.length) return {error:'charts must be a non-empty list of chart names'};
  const bad=v.filter(c=>!SPEC_CHARTS[c]); if(bad.length) return {error:'unknown chart(s): '+bad.join(', ')+'. Available: '+Object.keys(SPEC_CHARTS).join(', ')};
  return {list:v.slice(0,4)};
}

// ── lever scenarios (the original four tools, moved here from display/chatTools.js unchanged in behaviour) ──
const apiSchemas=()=>{ const o={}; specToolSchemas().forEach(t=>{ o[t.name]=t; }); return o; };
apiRegister({name:'run_scenarios', description:()=>apiSchemas().run_scenarios.description, inputSchema:()=>apiSchemas().run_scenarios.parameters, handler(args){
  if(!Array.isArray(args.scenarios)||!args.scenarios.length) return apiErr('scenarios must be a non-empty list of {id,label,levers}');
  const cl=apiChartList(args.charts); if(cl.error) return apiErr(cl.error);
  if(args.metric!=null&&!SPEC_KPIS[args.metric]) return apiErr('unknown metric "'+args.metric+'". Available: '+Object.keys(SPEC_KPIS).join(', '));
  const batch=specRunBatch(args.scenarios);
  if(!batch.scenarios.length) return {isError:true,response:{error:'No scenario could be run.',rejected:batch.rejected},cards:[{type:'summary',batch}]};
  apiRegisterBatch(batch);
  const all=[batch.base].concat(batch.scenarios), cards=[{type:'summary',batch}];
  cl.list.forEach(c=>{ try{ cards.push({type:'chart',data:specChartData(c,all,{metric:args.metric}),runIds:all.map(r=>r.id)}); }catch(e){} });
  const resp=specModelSummary(batch); resp.chartsShown=cl.list;
  return {isError:false,response:resp,cards};
}});
apiRegister({name:'sweep', description:()=>apiSchemas().sweep.description, inputSchema:()=>apiSchemas().sweep.parameters, handler(args){
  const metric=SPEC_KPIS[args.metric]?args.metric:'finalTotal', t=args.template;
  if(!t||typeof t!=='object'||!SPEC_LEVERS[t.lever]) return apiErr('template.lever must be one of: '+Object.keys(SPEC_LEVERS).join(', '));
  const sw=specSweep(t,args.param,args.values);
  if(!sw.scenarios.length) return {isError:true,response:{error:'No value could be run.',rejected:sw.rejected},cards:[]};
  apiRegisterBatch(sw);
  const resp={units:'today\'s dollars',lever:sw.sweep.lever,param:sw.sweep.param,yourScenario:sw.base.kpis,
    results:sw.scenarios.map((r,i)=>({runId:r.id,value:sw.sweep.values[i],status:r.notes[0]&&r.notes[0].status,note:r.notes[0]&&r.notes[0].note||undefined,kpis:r.kpis})),chartShown:metric};
  if(sw.rejected.length) resp.rejected=sw.rejected;
  return {isError:false,response:resp,cards:[{type:'chart',data:specSweepChartData(sw,metric),runIds:sw.scenarios.map(r=>r.id)}]};
}});
apiRegister({name:'show_chart', description:()=>apiSchemas().show_chart.description, inputSchema:()=>apiSchemas().show_chart.parameters, handler(args){
  if(!SPEC_CHARTS[args.chart]) return apiErr('unknown chart "'+args.chart+'". Available: '+Object.keys(SPEC_CHARTS).join(', '));
  if(args.metric!=null&&!SPEC_KPIS[args.metric]) return apiErr('unknown metric "'+args.metric+'". Available: '+Object.keys(SPEC_KPIS).join(', '));
  const g=apiGetRuns(args.runs); if(g.missing.length) return apiErr('unknown runId(s): '+g.missing.join(', ')+'. Known: '+Object.keys(apiRuns).join(', '));
  if(!g.runs.length) return apiErr('runs must list at least one runId');
  const runs=g.runs.slice(0,8), stale=runs.some(apiRunStale), resp={shown:args.chart};
  if(stale) resp.warning='the scenario was edited after some of these runs, so they no longer match the inputs; run the scenarios again for current numbers';
  return {isError:false,response:resp,cards:[{type:'chart',data:specChartData(args.chart,runs,{metric:args.metric}),runIds:runs.map(r=>r.id)}]};
}});
apiRegister({name:'get_rows', description:()=>apiSchemas().get_rows.description, inputSchema:()=>apiSchemas().get_rows.parameters, handler(args){
  const r=apiRuns[String(args.run)]; if(!r) return apiErr('unknown runId "'+args.run+'". Known: '+Object.keys(apiRuns).join(', '));
  const resp={run:r.id,label:r.label,csv:specRowsCsv(r,args.fields,args.fromAge,args.toAge)}; if(apiRunStale(r)) resp.warning='the scenario was edited after this run';
  return {isError:false,response:resp};
}});

// ── market scenarios: full-horizon yearly stock returns and inflation (compute/marketScenario.js) ──
// The built-in library (Lost Decade, Stagflation, 1966 retiree) as MarketPaths, with the Stress card's defaults.
function apiBuiltinPaths(){
  const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); cfg.custom={enabled:false};
  return stScenarios(cfg).map(sc=>msValidate({id:sc.id,label:sc.label,note:sc.note,source:'builtin',returns:sc.eq,inflation:sc.infl,startsAt:'retire',equityShare:100}).path);
}
function apiPathById(id){ id=String(id); return msGet(id)||apiBuiltinPaths().find(p=>p.id===id)||null; }
// Build the run object (same shape as a lever scenario's, so every existing chart, KPI table and `get_rows` works on it).
function apiMarketRun(path,baseFp){
  const out=msRun(path), startAge=out.proj.rows.length?Math.round(out.proj.rows[0].age0+out.start):null, d=msDescribe(path);
  const r={proj:out.proj,m:out.m,notes:[{lever:'marketScenario',label:path.label+' ('+d.years+' yearly values from '+d.startsAt+')',status:'applied',note:''}],levers:[{lever:'marketScenario',id:path.id}],
    market:{label:path.label,startRow:out.start,startAge,years:path.returns.length,pathId:path.id}};
  r.kpis=specKpis(r.proj,r.m); r.fp=specFingerprint(r.proj,r.m); r.changed=baseFp==null?true:r.fp!==baseFp;
  if(!r.changed){ r.notes[0].status='noEffect'; r.notes[0].note='the scenario\'s results did not change (the path may start after the scenario ends)'; }
  r.id=path.id; r.label=path.label; return r;
}
function apiRunMarketPaths(paths){
  const scenarioKey=specScenarioKey(), baseRun=specRunScenario({levers:[]}); baseRun.id='base'; baseRun.label='Your scenario'; baseRun.levers=[]; baseRun.kpis=specKpis(baseRun.proj,baseRun.m);
  const baseFp=specFingerprint(baseRun.proj,baseRun.m);
  return {scenarioKey,base:baseRun,scenarios:paths.map(p=>apiMarketRun(p,baseFp)),rejected:[]};
}
// The few numbers the model needs to check that its path was read as intended: the first years as placed on the scenario, and what the engine did with them.
function apiPathTable(path,run){
  const age0=run.proj.rows.length?run.proj.rows[0].age0:null, start=run.market.startRow, out=[];
  for(let j=0;j<Math.min(path.returns.length,10);j++) out.push({year:THIS_YEAR+start+j,age:age0==null?null:Math.round(age0+start+j),stockReturnPct:Math.round(path.returns[j]*1000)/10,
    inflationPct:path.inflation?Math.round(path.inflation[j]*1000)/10:'entered'});
  return out;
}
const API_PATH_PROPS={
  label:{type:'string',description:'short human label, e.g. "Two bad years then recovery"'},
  returnsPct:{type:'array',items:{type:'number'},description:'nominal stock return per year, in percent, one value per year from the start (e.g. [-25,-10,5,12]); 1 to '+MS_MAX_YEARS+' values; each between -95 and 200'},
  inflationPct:{type:'array',items:{type:'number'},description:'optional: inflation per year in percent, SAME number of values as returnsPct; omit to keep the scenario\'s own inflation'},
  startsAt:{type:'string',description:'where the first value lands: retirement (default, first year without wages), now, or year (with startYear)'},
  startYear:{type:'integer',description:'calendar year of the first value (with startsAt year, or alone); '+THIS_YEAR+' or later'},
  afterReturnPct:{type:'number',description:'optional: nominal stock return for EVERY year after the list, to the end of the scenario (default: the scenario\'s own growth rates)'},
  afterInflationPct:{type:'number',description:'optional: inflation for every year after the list (default: the scenario\'s own inflation)'},
  equityShare:{type:'number',description:'% of each portfolio / IRA that earns the path\'s return, the rest keeps the scenario\'s rate (default 100); property is never hit'},
  note:{type:'string',description:'optional one-line description'}
};
apiRegister({name:'define_market_scenario',
  description:'Define a year-by-year market scenario (stock returns and, optionally, inflation for each future year), run it on the user\'s scenario with the app\'s own engine and compare it with the scenario as entered. '+
    'Use it when the user describes a market path ("two bad years then recovery", "inflation 8% for five years") that the preset stress tests do not cover. Returns are NOMINAL; inflation per year is optional. The scenario is kept for this conversation only; '+
    'the user can add it to the Stress test card from the result card. Set showInCharts true when the user asks to see it, to put it on the main charts (the B view, a replay that never changes their scenario).',
  inputSchema:{type:'object',properties:Object.assign({id:{type:'string',description:'optional short id; reuse an id to replace that scenario'},showInCharts:{type:'boolean',description:'true to display it in the app\'s main charts now'},charts:{type:'array',items:{type:'string'},description:'charts to draw in the chat (default assets and annualTax)'}},API_PATH_PROPS),required:['label','returnsPct']},
  handler(args,host){
    const src=(host&&host.source)||'chat', v=msValidate(args,{source:src});
    if(v.errors.length) return {isError:true,response:{error:'The market scenario was not accepted.',problems:v.errors}};
    const cl=apiChartList(args.charts); if(cl.error) return apiErr(cl.error);
    const taken={}; msSaved().forEach(p=>{ taken[p.id]=1; }); apiBuiltinPaths().forEach(p=>{ taken[p.id]=1; });
    if(args.id==null) Object.keys(msSession).forEach(k=>{ taken[k]=1; });   // an explicit id replaces that session scenario; otherwise never reuse one
    const path=v.path; if(taken[path.id]) path.id=msUniqueId(path.id,taken);
    msSessionAdd(path);
    const batch=apiRunMarketPaths([path]); apiRegisterBatch(batch);
    const run=batch.scenarios[0], all=[batch.base].concat(batch.scenarios), cards=[{type:'summary',batch},{type:'market',path:msClone(path),runId:run.id,describe:msDescribe(path)}];
    cl.list.forEach(c=>{ try{ cards.push({type:'chart',data:specChartData(c,all,{}),runIds:all.map(r=>r.id)}); }catch(e){} });
    const resp=specModelSummary(batch); resp.marketScenario=Object.assign(msDescribe(path),{scenarioId:path.id,runId:run.id,asPlaced:apiPathTable(path,run)}); resp.chartsShown=cl.list;
    const effects=[]; if(args.showInCharts===true){ effects.push({type:'showMarketPath',id:path.id}); resp.shownInCharts=true; }
    return {isError:false,response:resp,cards,effects};
  }});
apiRegister({name:'list_market_scenarios',
  description:'List the market scenarios the app can run: the presets (lost = Lost Decade 2000-2009, stag = stagflation, y1966 = 1966 retiree), the ones saved in the scenario, and the ones defined in this conversation. With id, returns that scenario\'s full yearly vectors.',
  inputSchema:{type:'object',properties:{id:{type:'string',description:'optional: return the full yearly returns and inflation of this scenario'}}},
  handler(args){
    if(args.id!=null){ const p=apiPathById(args.id); if(!p) return apiErr('unknown market scenario "'+args.id+'"'); return {isError:false,response:{scenario:p,summary:msDescribe(p)}}; }
    const row=p=>Object.assign(msDescribe(p),{where:p.source==='builtin'?'preset':(msSaved().some(s=>s.id===p.id)?'saved in the scenario':'this conversation')});
    return {isError:false,response:{scenarios:apiBuiltinPaths().concat(msList()).map(row)}};
  }});
apiRegister({name:'run_market_scenarios',
  description:'Run one or more EXISTING market scenarios (by id from list_market_scenarios: presets, saved or defined earlier) on the user\'s scenario and compare them with the scenario as entered. Up to '+SPEC_MAX_SCENARIOS+' ids. showInCharts puts the first one on the main charts.',
  inputSchema:{type:'object',properties:{ids:{type:'array',items:{type:'string'},description:'market scenario ids'},showInCharts:{type:'boolean'},charts:{type:'array',items:{type:'string'}}},required:['ids']},
  handler(args){
    if(!Array.isArray(args.ids)||!args.ids.length||args.ids.length>SPEC_MAX_SCENARIOS) return apiErr('ids must list 1 to '+SPEC_MAX_SCENARIOS+' market scenario ids');
    const cl=apiChartList(args.charts); if(cl.error) return apiErr(cl.error);
    const paths=[], missing=[]; args.ids.forEach(id=>{ const p=apiPathById(id); if(p) paths.push(p); else missing.push(String(id)); });
    if(missing.length) return apiErr('unknown market scenario id(s): '+missing.join(', ')+'. Use list_market_scenarios.');
    const batch=apiRunMarketPaths(paths); apiRegisterBatch(batch);
    const all=[batch.base].concat(batch.scenarios), cards=[{type:'summary',batch}];
    cl.list.forEach(c=>{ try{ cards.push({type:'chart',data:specChartData(c,all,{}),runIds:all.map(r=>r.id)}); }catch(e){} });
    const resp=specModelSummary(batch); resp.chartsShown=cl.list;
    const effects=args.showInCharts===true?[{type:'showMarketPath',id:paths[0].id}]:[]; if(effects.length) resp.shownInCharts=paths[0].id;
    return {isError:false,response:resp,cards,effects};
  }});
apiRegister({name:'show_market_scenario_in_charts',
  description:'Put an existing market scenario (id from list_market_scenarios or define_market_scenario) on the app\'s main chart grid as a replay (the B view: all charts, the Market return and Inflation charts show its yearly values; the scenario itself is not changed and the user can go Back to scenario).',
  inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id']},
  handler(args){ const p=apiPathById(args.id); if(!p) return apiErr('unknown market scenario "'+args.id+'". Use list_market_scenarios.'); return {isError:false,response:{requested:p.id,note:'shown in the main charts if this host has a display'},effects:[{type:'showMarketPath',id:p.id}]}; }});

// ── resources (read-only context an MCP client can attach) ───────
function apiResources(){ return [
  {uri:'planner://scenario/summary',name:'Scenario summary',mimeType:'application/json',description:'Household, inflation, and headline results of the scenario as entered'},
  {uri:'planner://market-scenarios',name:'Market scenarios',mimeType:'application/json',description:'Presets, saved and in-conversation market scenarios'},
  {uri:'planner://runs',name:'Runs',mimeType:'application/json',description:'Every scenario result the app holds (the scenario as entered, user scenarios, lever, market, stress, stress + Monte Carlo, Monte Carlo) with headline numbers'},
  {uri:'planner://analysis/summary',name:'Analysis bundle (summary)',mimeType:'application/json',description:'The planner.analysis/1 bundle at summary detail: scenario, every run, comparison, glossary, lever catalog'},
  {uri:'planner://levers',name:'Scenario levers',mimeType:'application/json',description:'Every named what-if lever and its parameters'}]; }
function apiReadResource(uri){
  if(uri==='planner://levers') return {levers:Object.keys(SPEC_LEVERS).map(n=>({name:n,description:SPEC_LEVERS[n].desc,params:Object.keys(SPEC_LEVERS[n].params)}))};
  if(uri==='planner://runs') return {runs:rrListRuns()};
  if(uri==='planner://analysis/summary') return rrBuildBundle({tier:'summary'});
  if(uri==='planner://market-scenarios') return apiCall('list_market_scenarios',{}).response;
  if(uri==='planner://scenario/summary'||uri==='planner://plan/summary'){ const b=specRunScenario({levers:[]}); return {filingStatus:state.filingStatus,inflationPct:state.inflation*100,people:state.filingStatus==='married'?2:1,kpis:specKpis(b.proj,b.m)}; }
  throw new Error('unknown resource "'+uri+'"');
}

if(typeof module!=='undefined') module.exports={apiRegister,apiList,apiCall,apiToMcpResult,apiResources,apiReadResource};
