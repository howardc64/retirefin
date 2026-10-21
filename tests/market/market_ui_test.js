'use strict';
// Display side of the market scenarios (stub DOM, real app scripts): the chat tool → effect → D view, the chat card, saving to the Stress card.
//   node tests/market/market_ui_test.js
const fs=require('fs'), path=require('path');
const head=fs.readFileSync(path.resolve(__dirname,'../mc/mc_ui_test.js'),'utf8').split('// ---- Monte Carlo trial view')[0];
const body=`
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
ctx.__plan=JSON.parse(fs.readFileSync(path.join(root,'Samples/Couple_Heir.json'),'utf8'));
run('state=hydrateState(__plan); recompute();');
const before=run('JSON.stringify(Object.assign({},state,{ui:null}))');
// 1. the chat tool asks for the charts; the host applies the effect
const r=run('(()=>{ const r=chatExecTool("define_market_scenario",{label:"Lost five years",returnsPct:[-30,-15,-5,8,10],inflationPct:[3,3,4,4,3],afterReturnPct:5,showInCharts:true}); return {isError:r.isError,fx:r.effects,cards:r.cards.map(c=>c.type)}; })()');
ok(!r.isError&&r.fx.length===1&&r.cards.includes('market'),'define_market_scenario returns a show effect and a market card');
ok(run('mcTrialView===null'),'nothing is shown until the host applies the effect (a tool never touches the display itself)');
const notes=run('chatApplyEffects(chatExecTool("define_market_scenario",{label:"Lost five years 2",returnsPct:[-30,-15,-5,8,10],afterReturnPct:5,showInCharts:true}).effects)');
ok(notes.length===1&&/Showing/.test(notes[0]),'chatApplyEffects reports what it showed');
ok(run('!!mcTrialView&&mcTrialView.view==="D"&&lastProjection===mcTrialView.proj'),'the main charts now read the replayed projection (D view)');
ok(document.getElementById('mcTrialBanner').innerHTML.includes('Lost five years 2'),'the banner names the scenario');
ok(run('mcTrialView.cap.scen.eq.length===5&&mcTrialView.cap.infl&&mcTrialView.cap.infl.pi.length>=80'),'the replay carries the yearly inflation path for the Inflation / Market charts');
const rates=run('(()=>{ const p=mcTrialView.proj; return {first:p.rates[0]&&Object.keys(p.rates[0]).length>0, n:p.inflRate.length}; })()');
ok(rates.first&&rates.n>5,'asset rates and inflation are recorded for the Market return chart');
ok(run('mcDList().some(x=>x.id===mcTrialView.d.id)'),'the scenario is in the D list (◀ ▶ and the D key reach it)');
ok(run('JSON.stringify(Object.assign({},state,{ui:null}))')===before,'the plan itself is unchanged by showing it');
run('mcTrialExit()'); ok(run('mcTrialView===null&&lastProjection!==null'),'Back to plan leaves the view');
// 2. the card, and saving is a user click
const nCards=run('(()=>{ const box=document.createElement("div"); chatRenderCards(chatExecTool("define_market_scenario",{label:"card test",returnsPct:[-10,5]}).cards,box); return box.children.length; })()');
ok(nCards>=3,'chatRenderCards draws the summary, market and chart cards ('+nCards+')');
ok(run('state.ui.marketPaths.length')===0,'defining a scenario in the chat saved nothing in the plan');
const sid=run('msList().find(p=>p.label==="card test").id');
run('stAddPath(msGet('+JSON.stringify(sid)+'))');
ok(run('state.ui.marketPaths.length')===1&&run('stScenarios(stLoadCfg()).some(s=>s.id==='+JSON.stringify(sid)+')'),'Add to Stress test card saves it in the plan and the card lists it');
run("buildStressPanel(); stEl('stCustom').checked=true; stEl('stStartMode').value='retire'; stEl('stShare').value='100'; stEl('stYears').value='0'"); run('stStart(false)'); ok(run('stResults&&stResults.results.some(r=>r.custom&&r.id==='+JSON.stringify(sid)+')'),'Run stress tests includes the saved path as a row');
run('mcLoadStress(stResults.results.findIndex(r=>r.id==='+JSON.stringify(sid)+'))'); ok(run('mcTrialView&&mcTrialView.view==="D"&&mcTrialView.d.id==='+JSON.stringify(sid)),'the table\\'s Show in charts loads it as D');
run('mcTrialExit()');
// 3. the plan file carries the saved paths
const saved=run('JSON.stringify(state)'); run('state=hydrateState(JSON.parse(JSON.stringify(state)))'); ok(run('JSON.stringify(state)')===saved||run('state.ui.marketPaths.length')===1,'saved paths round-trip through hydrateState');
console.log(fails?fails+' FAILED':'all passed'); process.exit(fails?1:0);
`;
eval(head+body);
