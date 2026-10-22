// Market path model + tool API (compute/marketScenario.js, compute/scenarioApi.js): node tests/market/market_test.js
const {makeCtx,run}=require('../chat/harness.js');
let fails=0,n=0; const ok=(c,m)=>{ n++; if(!c){ fails++; console.log('  FAIL: '+m); } else console.log('  ok: '+m); };
const J=(ctx,code)=>JSON.parse(run(ctx,'JSON.stringify('+code+')'));
for(const plan of ['Couple_Heir.json','Widow.json']){
  console.log('\n== '+plan);
  const ctx=makeCtx(plan), before=run(ctx,'JSON.stringify(state)');
  const V=o=>{ ctx.__o=o; return J(ctx,'msValidate(__o)'); };
  const call=(name,args,host)=>{ ctx.__a=args; ctx.__h=host||null; return J(ctx,'apiCall('+JSON.stringify(name)+',__a,__h||undefined)'); };

  // 1. validation
  let v=V({label:'x',returnsPct:[-20,'-10',5],inflationPct:[6,7,8]});
  ok(!v.errors.length&&Math.abs(v.path.returns[0]+0.2)<1e-12&&Math.abs(v.path.returns[1]+0.1)<1e-12&&Math.abs(v.path.inflation[2]-0.08)<1e-12,'percent input becomes fractions (numeric strings coerced)');
  ok(v.path.from.mode==='retire'&&v.path.equityShare===100&&v.path.id==='path-x','defaults: starts at retirement, 100% share, id from the label');
  ok(V({returnsPct:[-20,5],inflationPct:[3]}).errors[0].includes('same number'),'inflation list must match the returns list');
  ok(V({returnsPct:[-99]}).errors[0].includes('between -95'),'a return below -95% is rejected');
  ok(V({returnsPct:[]}).errors.length===1&&V({}).errors.length===1&&V(null).errors.length===1,'empty / missing / null rejected');
  ok(V({returnsPct:[1],startYear:1999}).errors.length===1,'a start year in the past is rejected');
  ok(V({returnsPct:[1],equityShare:140}).errors.length===1,'equityShare above 100 rejected');
  ok(V({returnsPct:new Array(61).fill(1)}).errors[0].includes('at most'),'more than 60 yearly values rejected (use the tail)');

  // 2. resolution: dense, full horizon
  const T=run(ctx,'THIS_YEAR');
  ctx.__p=v.path; ctx.__p.from={mode:'year',year:T+2}; ctx.__p.tail={returnPct:4,inflationPct:2.5};
  const R=J(ctx,'(()=>{ const r=msResolve(__p,{n:20,mean:0.03}); return {eq:Array.from(r.eq,x=>Number.isNaN(x)?"nan":x), pi:Array.from(r.pi), cpi:Array.from(r.cpi), start:r.start, win:r.window}; })()');
  ok(R.start===2&&R.eq[0]==='nan'&&R.eq[1]==='nan'&&Math.abs(R.eq[2]+0.2)<1e-12&&Math.abs(R.eq[4]-0.05)<1e-12,'values land on the right calendar years; earlier years keep the plan\'s rate');
  ok(R.eq.slice(5).every(x=>Math.abs(x-0.04)<1e-12)&&R.eq.length===20,'the tail carries a return to EVERY later year of the horizon');
  ok(Math.abs(R.pi[0]-0.03)<1e-12&&Math.abs(R.pi[3]-0.07)<1e-12&&Math.abs(R.pi[10]-0.025)<1e-12,'inflation: plan before, the path\'s values, then the tail');
  ok(Math.abs(R.cpi[4]-(1.03*1.03*1.06*1.07))<1e-12&&R.win[0]===2&&R.win[1]===19,'price level compounds the per-year inflation; window spans to the end');

  // 3. parity with the earlier stress-test arithmetic, and a null path is the plan
  const same=run(ctx,`(()=>{ const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); const sc=stScenarios(cfg)[0]; const base=stRun(null,0,cfg); const start=stStartRow(cfg,base);
    const a=stRun(sc,start,cfg), p=msValidate({id:sc.id,returns:sc.eq,inflation:sc.infl,startsAt:'retirement'}).path, b=msRun(p);
    return JSON.stringify(a.rows)===JSON.stringify(b.proj.rows)&&b.start===start; })()`);
  ok(same,'a path built from the Lost Decade equals the stress test run row for row');
  ok(run(ctx,'JSON.stringify(msRun(null).proj.rows)===JSON.stringify(computeProjection().rows)'),'no path = computeProjection() exactly');
  ok(run(ctx,'MC_HOOK===null&&MC_INFL===null&&REC_RATES===true'),'hooks restored after runs');

  // 4. a tail makes a difference to the whole remaining horizon
  const d=run(ctx,`(()=>{ const a=msValidate({returnsPct:[-30],startsAt:'now'}).path, b=msValidate({returnsPct:[-30],startsAt:'now',afterReturnPct:-3,afterInflationPct:6}).path;
    const ra=msRun(a), rb=msRun(b); const last=r=>r.m.estateFin+r.m.estateRe; return [last(ra),last(rb),ra.res.window[1],rb.res.window[1]]; })()`);
  ok(d[1]<d[0]&&d[2]===0&&d[3]>=40,'long-run -3% and 6% inflation after the list lowers the end result and covers the whole plan (window '+d[3]+')');

  // 5. tools: nothing written to the plan
  let r=call('define_market_scenario',{label:'Two bad years',returnsPct:[-25,-10,6,12],inflationPct:[4,5,3,3],afterReturnPct:5,showInCharts:true});
  ok(!r.isError&&r.cards.map(c=>c.type).join()==='summary,market,chart,chart','define_market_scenario: summary, market and two chart cards');
  ok(r.effects.length===1&&r.effects[0].type==='showMarketPath'&&r.effects[0].id===r.response.marketScenario.scenarioId,'showInCharts asks the host to show it (effect)');
  ok(r.response.marketScenario.asPlaced.length===4&&r.response.marketScenario.asPlaced[0].year>=T&&r.response.yourPlan&&r.response.scenarios[0].kpis,'the model gets the path as placed, plus plan and scenario KPIs');
  const sid=r.response.marketScenario.scenarioId;
  ok(run(ctx,'JSON.stringify(state)')===before,'live plan (including ui.marketPaths) untouched by the tool');
  r=call('define_market_scenario',{label:'Two bad years',returnsPct:[-1,1]}); ok(r.response.marketScenario.scenarioId!==sid,'a second scenario with the same label gets its own id');
  r=call('define_market_scenario',{label:'bad',returnsPct:[-120]}); ok(r.isError&&r.response.problems[0].includes('between -95'),'bad input is returned as problems the model can fix');
  r=call('define_market_scenario',{__error:'Unexpected end'}); ok(r.isError,'truncated JSON arguments answered with an error');
  r=call('list_market_scenarios',{}); const ids=r.response.scenarios.map(x=>x.id);
  ok(['lost','stag','y1966',sid].every(i=>ids.includes(i)),'list: presets and the conversation\'s scenario');
  r=call('list_market_scenarios',{id:sid}); ok(r.response.scenario.returns.length===4&&r.response.scenario.source==='chat','get by id returns the full vectors, stamped source chat');
  r=call('run_market_scenarios',{ids:['y1966',sid],showInCharts:true}); ok(!r.isError&&r.response.scenarios.length===2&&r.effects[0].id==='y1966','run presets and a defined scenario together');
  ok(call('run_market_scenarios',{ids:['nope']}).isError,'unknown id rejected'); ok(call('show_market_scenario_in_charts',{id:'nope'}).isError,'show: unknown id rejected');
  ok(call('show_market_scenario_in_charts',{id:'stag'}).effects[0].id==='stag','show: effect for a preset');
  r=call('get_rows',{run:'r1',fields:['totalAssets']}); ok(!r.isError,'runs of market scenarios work with get_rows');
  // MCP shape
  const mcp=J(ctx,'apiList("mcp")'); ok(mcp.length>=8&&mcp.every(t=>t.name&&t.description&&t.inputSchema&&t.inputSchema.type==='object'),'apiList("mcp") entries are MCP tools/list entries');
  ok(J(ctx,'apiList("neutral")').every(t=>t.parameters),'neutral declarations keep `parameters` for the chat providers');
  ctx.__x=null; const mres=J(ctx,'apiToMcpResult(apiCall("list_market_scenarios",{}))'); ok(mres.content[0].type==='text'&&JSON.parse(mres.content[0].text).scenarios&&mres.isError===false,'apiToMcpResult is an MCP tools/call result');
  ok(J(ctx,'apiResources()').length===5&&J(ctx,'apiReadResource("planner://market-scenarios")').scenarios.length>=4&&J(ctx,'apiReadResource("planner://plan/summary")').kpis,'resources readable');
  r=call('define_market_scenario',{label:'from mcp',returnsPct:[-10]},{source:'mcp'}); ok(J(ctx,'msGet('+JSON.stringify(r.response.marketScenario.scenarioId)+')').source==='mcp','host source is stamped on the scenario');

  // 6. saving is a user action: msSave writes to ui.marketPaths, stress card picks it up with its own start
  ctx.__id=sid;
  const sv=J(ctx,`(()=>{ const p=msGet(__id); msSave(p); const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); cfg.lost.enabled=false; cfg.stag.enabled=false; cfg.y1966.enabled=false;
    const R=stRunAll(cfg); return {saved:state.ui.marketPaths.length, ids:R.results.map(x=>x.id), custom:R.results.map(x=>x.custom), starts:R.results.map(x=>x.start), session:!!msSession[__id], cardStart:R.start}; })()`);
  ok(sv.saved===1&&sv.ids[0]===sid&&sv.custom[0]===true&&sv.session===false,'msSave stores it in the plan and removes the session copy; the stress card runs it as a row');
  ok(JSON.stringify(run(ctx,'JSON.stringify(hydrateState(JSON.parse(JSON.stringify(state))).ui.marketPaths)'))===JSON.stringify(run(ctx,'JSON.stringify(state.ui.marketPaths)')),'saved paths survive a save / load round trip');
  ctx.__bad=null; const hy=J(ctx,'(()=>{ const s=JSON.parse(JSON.stringify(state)); s.ui.marketPaths.push({id:"x",returns:["a"]},{id:"y",returns:[5]},"junk"); return hydrateState(s).ui.marketPaths.length; })()');
  ok(hy===1,'a hand-edited file cannot smuggle in a malformed or out-of-range path (kept 1 of 4)');

  // 7. the old marketStress lever now takes a year-anchored, tailed custom path
  const ms=J(ctx,'specRunBatch([{id:"M",label:"m",levers:[{lever:"marketStress",kind:"custom",returnsPct:[-30,-10],startYear:'+(T+1)+',afterReturnPct:3}]},{id:"L",label:"l",levers:[{lever:"marketStress",kind:"lostDecade"}]}])');
  ok(ms.scenarios.length===2&&ms.scenarios[0].market.startRow===1&&ms.scenarios[0].changed&&ms.scenarios[1].changed,'marketStress lever: custom with startYear + tail, and a preset, both change the plan');
  ok(run(ctx,'MC_HOOK===null&&MC_INFL===null&&REC_RATES===true'),'hooks restored after every run');
}
console.log('\n'+(fails?fails+' of '+n+' FAILED':'all '+n+' passed')); process.exit(fails?1:0);
