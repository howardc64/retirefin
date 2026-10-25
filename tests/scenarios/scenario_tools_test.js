// list_scenarios / get_scenario / compare_scenarios / show_scenario / delete_scenario, the reference resolver and scShow. Node only, no browser.
//   PLANNER_ROOT=. node tests/scenarios/scenario_tools_test.js
const fs=require('fs'), path=require('path'), vm=require('vm');
const {makeCtx,run,ROOT}=require('../chat/harness.js');
let fails=0,n=0; const ok=(c,m)=>{ n++; if(!c){ fails++; console.log('  FAIL: '+m); } else console.log('  ok: '+m); };
const ctx=makeCtx('Couple_Heir.json');
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/display/scenarioView.js'),'utf8'),ctx,{filename:'display/scenarioView.js'});
const J=code=>JSON.parse(run(ctx,'JSON.stringify('+code+')'));
const call=(name,args)=>{ ctx.__a=args||{}; return JSON.parse(run(ctx,'JSON.stringify(apiCall('+JSON.stringify(name)+',__a))')); };

// ── the same world as the run-registry test ──
call('run_scenarios',{scenarios:[{id:'S1',label:'Living +10%',levers:[{lever:'living',pctChange:10}]},{id:'S2',label:'Living -5%',levers:[{lever:'living',pctChange:-5}]}]});
call('define_market_scenario',{label:'Two bad years',returnsPct:[-25,-10,5,12,10]});
run(ctx,`var scnNames={A:'',B:'Spend more'}; function scnLabel(id){ return 'Scenario '+id+(scnNames[id]?' — '+scnNames[id]:''); }
  (()=>{ const alt=JSON.parse(JSON.stringify(state)); alt.living=state.living*1.3; scnOrder=['A','B']; scnActive='A'; scnSnaps={B:alt}; })()`);
const buildCards=()=>run(ctx,`(()=>{ const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); stResults=Object.assign(stRunAll(cfg),{cfg,scenarioKey:scStateKey(state)});
  const mc=JSON.parse(JSON.stringify(MC_DEFAULTS)); mc.trials=60; mc.seed=7; const res=mcRunRange(mc,0,60);
  mcResults={cfg:mc,S:mcSummarize(res),R:mcFailureReasons(res),complete:true,results:res}; mcStateAtRun=scStateKey(state); globalThis.mcScenarioKey=()=>scStateKey(state);
  const sc=stScenarios(cfg)[0], base=stRun(null,0,cfg), start=stStartRow(cfg,base), sd={scen:sc,start,share:100}, r2=[]; for(let t=0;t<60;t++) r2.push(mcRunTrial(mc,t,null,null,sd));
  stResults.mc={cfg:mc,rows:[{id:'none',label:'Monte Carlo alone',stress:false,stressDef:null,res:res,S:mcSummarize(res)},{id:sc.id,label:sc.label,stress:true,stressDef:sd,res:r2,S:mcSummarize(r2)}]}; })()`);
buildCards();
run(ctx,'rjRunStress(rjClone(ST_DEFAULTS))');
const stateBefore=run(ctx,'JSON.stringify(state)');

// ── registration ──
const names=J('apiList("mcp").map(t=>t.name)');
['list_scenarios','get_scenario','compare_scenarios','show_scenario','delete_scenario'].forEach(t=>ok(names.includes(t),'tool registered: '+t));

// ── list_scenarios ──
let r=call('list_scenarios',{}); ok(!r.isError,'list_scenarios ok');
const L=r.response.scenarios, keys=L.map(p=>p.ref);
ok(['scn:A','scn:B','lev:r1','lev:r2','st:lost','st:stag','st:y1966','stl:lost'].every(k=>keys.includes(k))&&keys.some(k=>k.startsWith('mkt:')),'every source is listed: '+keys.length+' plans');
ok(keys.some(k=>/^mc:trial:\d+$/.test(k))&&keys.some(k=>/^stmc:lost:\d+$/.test(k)),'exemplar trials are plans');
ok(L.every(p=>p.how&&p.label&&typeof p.stale==='boolean'&&p.kpis&&p.kpis.finalTotal>0),'every plan has how, label, stale, headline numbers');
ok(new Set(keys).size===keys.length,'refs are unique');
ok(L[0].ref==='scn:A'&&L.filter(p=>p.kind==='scenario').length===2,'scenarios come first');
const groups=r.response.monteCarloRuns.map(g=>g.group); ok(['mc:run','stmc:none','stmc:lost'].every(g=>groups.includes(g))&&r.response.monteCarloRuns.every(g=>g.trials===60&&g.stale===false),'Monte Carlo runs are listed with their size');
ok(call('list_scenarios',{kinds:['stress']}).response.scenarios.every(p=>p.kind==='stress')&&call('list_scenarios',{group:'stl'}).response.scenarios.length===3,'filters: kind and group');
ok(call('list_scenarios',{label:'lost'}).response.scenarios.length>=2&&!('kpis' in call('list_scenarios',{kinds:['scenario'],withKpis:false}).response.scenarios[0]),'filters: label; withKpis false');
const runsList=J('rrListRuns()'), byRun=id=>runsList.find(x=>x.id===id);
ok(JSON.stringify(L.find(p=>p.ref==='scn:B').kpis)===JSON.stringify(byRun('scn:B').kpis)&&JSON.stringify(L.find(p=>p.ref==='st:lost').kpis)===JSON.stringify(byRun('st:lost').kpis),'list_scenarios numbers equal list_runs numbers');

// ── get_scenario: summary and aliases ──
const gp=ref=>call('get_scenario',{ref}); const key=ref=>{ const x=gp(ref); return x.isError?('ERR '+x.response.error):x.response.ref; };
ok(key('scn:B')==='scn:B'&&key('scenario B')==='scn:B'&&key('Scenario b')==='scn:B'&&key('B')==='scn:B'&&key('plan')==='scn:A','scenario aliases: key, "scenario B", "B", "plan"');
ok(key('stress Lost Decade')==='st:lost'&&key('stress test: stagflation')==='st:stag'&&key('st:y1966')==='st:y1966','stress aliases: by name and key');
ok(key('market Two bad years').startsWith('mkt:')&&key('what-if r1')==='lev:r1'&&key('lev:r2')==='lev:r2','market and what-if aliases');
ok(key('Lost Decade').startsWith('ERR')&&/several scenarios/.test(gp('Lost Decade').response.error)&&!/stmc:lost:\d/.test(gp('Lost Decade').response.error),'an ambiguous label is refused with candidates (trials not among them): '+gp('Lost Decade').response.error.slice(0,90));
ok(/no scenario matches/.test(gp('zzz nothing').response.error)&&/no scenario Q/.test(gp('Q').response.error),'unknown refs say so');
const gB=gp('scenario B').response;
ok(gB.kpis.finalTotal===byRun('scn:B').kpis.finalTotal&&gB.changeVsScenario&&gB.changeVsScenario.finalTotal<0&&gB.stale===false,'scenario B: numbers, change vs the plan on screen (more spending → fewer assets)');
// trials by number: the first ask makes the plan; it matches the run's own trial
const g5=gp('mc trial 5'); ok(!g5.isError&&g5.response.ref==='mc:trial:5'&&g5.response.requested===true,'"mc trial 5" makes trial 5 a plan');
ok(key('mc app #6')==='mc:trial:5'&&key('mc trial 5')==='mc:trial:5','"mc app #6" (the app\'s number) is trial 5 (0-based)');
ok(/trial 5 \(#6\)/.test(String(g5.response.label)),'a trial plan\'s label carries the app\'s number: '+g5.response.label);
const run5=J('(()=>{const m=mcResults.results[5]; return {est:Math.round(m.estateFin+m.estateRe),fail:m.failAge==null?null:Math.round(m.failAge)}; })()');
ok(g5.response.kpis.finalTotal===run5.est&&g5.response.kpis.firstUnfundedAge===run5.fail,'trial 5 equals the run\'s own trial');
ok(g5.response.drawn&&Array.isArray(g5.response.drawn.passingAges),'trial plans report what was drawn');
ok(key('monte carlo #6')==='mc:trial:6'&&key('mc:trial:7')==='mc:trial:7','trial aliases: "monte carlo #6", "mc:trial:7"');
ok(/0 to 59/.test(gp('mc trial 99').response.error),'a trial past the end is refused: '+gp('mc trial 99').response.error);
ok(/^mc:trial:\d+$/.test(key('mc earliestFailure'))&&/^mc:trial:\d+$/.test(key('mc typicalSuccess')),'exemplar aliases: "mc earliestFailure", "mc typicalSuccess"');
ok(key('stress+mc Lost Decade trial 7')==='stmc:lost:7'&&key('stmc:lost:8')==='stmc:lost:8'&&key('stress + monte carlo lost #9')==='stmc:lost:9','stress + Monte Carlo aliases');

// ── get_scenario: inputs ──
const iB=gp('scenario B').response, iB2=call('get_scenario',{ref:'scenario B',detail:'inputs'}).response;
ok(iB2.inputs.state&&iB2.inputs.state.living&&!('ui' in iB2.inputs.state),'scenario inputs: the full input data, without the UI part');
ok(iB2.inputs.differsFromScenarioOnScreen.changes.some(c=>c.path==='living'&&c.thisScenario>c.onScreen),'scenario inputs: differs from the plan on screen by living expenses');
const iS=call('get_scenario',{ref:'st:lost',detail:'inputs'}).response.inputs;
ok(iS.baseScenario==='scn:A'&&iS.overlay.type==='stress'&&iS.overlay.years===10&&iS.overlay.stockReturnsPct.length===10&&iS.madeOnTheCurrentScenario===true,'stress inputs: base plan, overlay, years, returns');
const iT=call('get_scenario',{ref:'mc trial 5',detail:'inputs'}).response.inputs;
ok(iT.overlay.type==='monte_carlo_trial'&&iT.overlay.seed===7&&iT.overlay.trialsInRun===60&&iT.overlay.trial===5&&iT.overlay.settings&&iT.overlay.drawn,'trial inputs: seed, trial number, settings, what was drawn');
const iM=call('get_scenario',{ref:'market Two bad years',detail:'inputs'}).response.inputs; ok(iM.overlay.type==='market'&&iM.overlay.stockReturnsPct.join()==='-25,-10,5,12,10','market inputs: the path');
const iL=call('get_scenario',{ref:'lev:r1',detail:'inputs'}).response.inputs; ok(iL.overlay.type==='levers'&&iL.overlay.levers.length>=1,'what-if inputs: the levers');
ok(run(ctx,'JSON.stringify(state)')===stateBefore,'live state untouched by any of this');

// ── get_scenario: series ──
const sT=call('get_scenario',{ref:'mc trial 5',detail:'series'}).response.series, gt=call('get_trial',{trial:'5'}).response.series;
ok(sT.rows.length>20&&JSON.stringify(sT.rows)===JSON.stringify(gt.rows),'trial series equal get_trial\'s series');
const sB=call('get_scenario',{ref:'scenario B',detail:'series'}).response.series, gr=call('get_run',{id:'scn:B',detail:'series'}).response.series;
ok(JSON.stringify(sB)===JSON.stringify(gr),'scenario series equal get_run\'s series');
const sS=call('get_scenario',{ref:'st:lost',detail:'series',fromAge:70,toAge:75}).response.series; ok(sS.rows.length>=1&&sS.rows.every(x=>x[0]>=70&&x[0]<=75),'series honours fromAge / toAge');

// ── compare_scenarios ──
r=call('compare_scenarios',{refs:['scenario B','st:lost','mc trial 5','nope']}); const cp=r.response;
ok(!r.isError&&cp.baseline==='scn:A'&&cp.scenarios.length===3&&cp.scenarios.every(p=>p.changeVsBaseline)&&cp.unresolved.length===1,'compare_scenarios: three plans with change vs the plan, one unresolved');
ok(call('compare_scenarios',{refs:['zzz']}).isError&&call('compare_scenarios',{refs:[]}).isError,'compare_scenarios refuses nothing-to-compare');

// ── show_scenario ──
r=call('show_scenario',{ref:'scenario B'}); ok(!r.isError&&r.effects.length===1&&r.effects[0].type==='showScenario'&&r.effects[0].ref==='scn:B','show_scenario asks the page to show it');
ok(call('show_scenario',{ref:'lev:r1'}).isError,'what-if runs cannot be shown on the main charts');
// scShow dispatch with stubbed viewers
run(ctx,`var __calls=[]; var mcRun=null, mcTrialView=null; function scnSwitch(id){ __calls.push(['scn',id]); } function mcLoadMarketPath(id){ __calls.push(['path',id]); return true; } function mcLoadTrial(t){ __calls.push(['trial',t]); }
  function mcSmList(k){ const out=[]; stResults.mc.rows.forEach((row,ri)=>{ if(!row.stressDef) return; row.res.forEach((m,t)=>{ if((m.failK<0)===(k==='E')) out.push({row:ri,trial:t}); }); }); return out; } function mcLoadSm(k,pos){ __calls.push(['sm',k,pos]); }`);
const sh=ref=>{ ctx.__r=ref; return JSON.parse(run(ctx,'JSON.stringify(scShow(__r))')); }, calls=()=>J('__calls.splice(0)');
let x=sh('scenario B'); ok(x.ok&&JSON.stringify(calls())==='[["scn","B"]]','scShow: a scenario → scnSwitch');
x=sh('st:stag'); ok(x.ok&&JSON.stringify(calls())==='[["path","stag"]]','scShow: a stress row → the D view of that scenario');
x=sh('market Two bad years'); ok(x.ok&&calls()[0][0]==='path','scShow: a market scenario → the D view');
x=sh('mc trial 5'); ok(x.ok&&JSON.stringify(calls())==='[["trial",5]]','scShow: a Monte Carlo trial → mcLoadTrial');
x=sh('stmc:lost:7'); const smc=calls(); ok(x.ok&&smc[0][0]==='sm'&&/^[EF]$/.test(smc[0][1])&&smc[0][2]>=0,'scShow: a stress + Monte Carlo trial → E/F list position');
ok(!sh('stmc:none:3').ok&&/no stress/.test(sh('stmc:none:3').why),'scShow: the no-stress row is refused with a reason');
ok(!sh('lev:r1').ok,'scShow: a what-if run is refused');

// ── delete_scenario ──
ok(call('delete_scenario',{ref:'scenario B'}).isError&&/user's own/.test(call('delete_scenario',{ref:'scenario B'}).response.error),'a tool cannot delete the user\'s scenario');
run(ctx,"state.ui=state.ui||{}; state.ui.marketPaths=[msClone(msList()[0])]; state.ui.marketPaths[0].id='saved-one'; state.ui.marketPaths[0].label='Saved one'; state.ui.marketPaths[0].source='user';");
ok(call('delete_scenario',{ref:'market Saved one'}).isError,'a tool cannot delete the user\'s saved market scenario');
ok(!call('delete_scenario',{ref:'lev:r1'}).isError&&!J('Object.keys(API_STORE.runs)').includes('r1')&&!J('rrListRuns().map(r=>r.id)').includes('lev:r1')&&!call('list_scenarios',{}).response.scenarios.some(p=>p.ref==='lev:r1'),'deleting a what-if run forgets it everywhere');
ok(!call('delete_scenario',{ref:'st:stag'}).isError&&!call('list_scenarios',{}).response.scenarios.some(p=>p.ref==='st:stag')&&J('rrListRuns().map(r=>r.id)').includes('st:stag')===false,'deleting a stress row hides it from the plan list and the run list');
ok(J('stResults.results.some(r=>r.id==="stag")'),'…without touching the card\'s own results');
ok(!call('delete_scenario',{ref:'mc earliestFailure'}).isError&&call('list_scenarios',{}).response.scenarios.filter(p=>p.kind==='mc_trial').length===call('list_scenarios',{kinds:['mc_trial']}).response.scenarios.length,'deleting an exemplar trial hides it');
// re-running the stress card brings the row back
run(ctx,`(()=>{ const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); const mc=stResults.mc; stResults=Object.assign(stRunAll(cfg),{cfg,scenarioKey:scStateKey(state),mc}); })()`);
ok(call('list_scenarios',{}).response.scenarios.some(p=>p.ref==='st:stag'),'running the stress tests again brings the hidden row back');

// ── stale ──
run(ctx,'state.living+=1000');
const st=call('list_scenarios',{}).response.scenarios, stale=st.filter(p=>p.stale).map(p=>p.ref), fresh=st.filter(p=>!p.stale).map(p=>p.ref);
ok(stale.includes('st:lost')&&stale.some(k=>k.startsWith('mc:trial:'))&&stale.includes('stl:lost'),'after an edit, stress and trial plans are stale: '+stale.length+' of '+st.length);
ok(fresh.includes('scn:A')&&fresh.includes('scn:B')&&fresh.some(k=>k.startsWith('mkt:')),'scenarios and market plans are current (re-based on the edited plan)');
const gs=gp('st:lost').response; ok(gs.stale&&/edited/.test(gs.warning)&&gs.kpis.finalTotal>0,'a stale plan says so and still reports the numbers it was made with');
ok(call('show_scenario',{ref:'st:lost'}).isError,'a stale plan cannot be shown');
ok(/edited/.test(call('get_scenario',{ref:'mc trial 30'}).response.error),'a trial cannot be asked from a stale run');
console.log(fails?('\n'+fails+' of '+n+' FAILED'):('\nall '+n+' passed')); process.exit(fails?1:0);
