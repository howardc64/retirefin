'use strict';
// The 🤖 LLM popup (display/llmPanel.js) with the real app scripts and a stub DOM:  node tests/llm/llm_ui_test.js
const fs=require('fs'), path=require('path');
const head=fs.readFileSync(path.resolve(__dirname,'../mc/mc_ui_test.js'),'utf8').split('// ---- Monte Carlo trial view')[0];
const body=`
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
ctx.__plan=JSON.parse(fs.readFileSync(path.join(root,'Samples/Couple_Heir.json'),'utf8'));
run('state=hydrateState(__plan); recompute();');
const card=()=>document.getElementById('llmCard').innerHTML;
const planJson=()=>run('JSON.stringify(Object.assign({},state,{ui:null}))');
const before=planJson();
ok(/id="llmBtn"/.test(fs.readFileSync(path.join(root,'index.html'),'utf8'))&&/runRegistry\\.js/.test(fs.readFileSync(path.join(root,'index.html'),'utf8')),'index.html has the 🤖 LLM button and loads runRegistry.js');
// export tab
run('openLlmCard("export")'); ok(/Send to an LLM/.test(card())&&/Your plan as entered/.test(card())&&/Download JSON/.test(card()),'export tab lists the plan and offers Download / Copy / Preview');
ok(/Only your plan so far/.test(card()),'with nothing else run the tab says how to get more runs in');
run('stResults=Object.assign(stRunAll(stLoadCfg()),{cfg:stLoadCfg(),planKey:JSON.stringify(Object.assign({},state,{ui:null}))})'); run('renderLlmCard()');
ok(/stress test/.test(card())&&/Lost Decade/.test(card()),'after the stress tests are run they appear as runs');
run('llmToggleRun("st:lost",false)'); const b=run('llmBuild()'); ok(!b.bundle.runs.some(r=>r.id==='st:lost')&&b.bundle.runs.some(r=>r.id==='plan')&&b.tokens>500,'unticking a run removes it from the file; the plan stays; size is estimated ('+b.tokens+' tokens)');
run('llmShowPreview()'); ok(/About [\\d,]+ tokens/.test(card())&&/planner\\.analysis\\/1/.test(card()),'Preview shows the size and the start of the file');
run('llmSetOpt("tier","standard")'); ok(run('llmBuild()').bundle.series&&run('llmOpts.tier')==='standard','the Standard tier adds yearly values');
// import tab
run('llmSetTab("import")'); ok(/Check &amp; add/.test(card())&&/No proposals yet/.test(card()),'import tab starts empty');
document.getElementById('llmImportText').value='nothing useful'; run('llmImportRun()'); ok(/No JSON object/.test(card())&&/llm-err/.test(card()),'pasting text with no JSON gives an error message');
const reply='Sure! \`\`\`json\\n'+JSON.stringify({schema:'planner.scenarios/1',scenarios:[{kind:'lever',label:'Spend 10% less',why:'tests the cushion',levers:[{lever:'living',pctChange:-10}]},{kind:'market',label:'Bad start',why:'sequence risk',returnsPct:[-20,-5,5,8,8],afterReturnPct:6},{kind:'lever',label:'Broken',levers:[{lever:'zzz'}]}]})+'\\n\`\`\`';
document.getElementById('llmImportText').value=reply; run('llmImportRun()');
ok(/Added 2 proposals/.test(card())&&/Not accepted: &quot;Broken/.test(card()),'a fenced reply is read: 2 proposals added, the broken one reported with its name');
ok(/Spend 10% less/.test(card())&&/Bad start/.test(card())&&/tests the cushion/.test(card())&&/Against your plan/.test(card()),'proposals show label, reason and the change against the plan');
ok(/Show in main charts/.test(card())&&/Add to Scenario set/.test(card())&&/Add to Stress test card/.test(card())&&/Dismiss/.test(card()),'each proposal has the review buttons');
ok(planJson()===before,'importing and listing proposals did not change the plan');
// nothing reaches the plan except a click
const pids=run('rrProposals().map(p=>p.pid)');
const nScn=run('scnOrder.length'); run('llmAddLever('+JSON.stringify(pids[0])+',false)'); ok(run('scnOrder.length')===nScn+1&&/Saved as Scenario/.test(card()),'Add to Scenario set (a click) adds the what-if as a 🆎 scenario');
ok(run('state.ui.marketPaths.length')===0,'the market proposal is still not in the plan');
run('llmAdd('+JSON.stringify(pids[1])+')'); ok(run('state.ui.marketPaths.length')===1&&/Stress test card/.test(card()),'Add to Stress test card (a click) saves the path in the plan');
run('llmShow('+JSON.stringify(pids[1])+')'); ok(run('!!mcTrialView&&mcTrialView.view==="D"'),'Show in main charts replays the market path (internal view D, shown as B)'); run('mcTrialExit()');
run('llmDismiss('+JSON.stringify(pids[0])+')'); ok(run('rrProposals().length')===1,'Dismiss removes a proposal');
// plans tab
run('llmSetTab("plans")'); ok(/Plans/.test(card())&&/Scenario A/.test(card())&&/Lost Decade/.test(card())&&/llmPlanDelete/.test(card()),'Plans tab lists scenarios and stress rows with delete buttons');
run('llmPlanDelete("st:stag")'); ok(!/Stagflation/.test(card().split('llm-runs')[1]||'')||run('plGet("st:stag")===null'),'deleting a stress plan hides it');
ok(/Deleted/.test(card()),'delete reports');
run('llmSetTab("import")');
// staleness
run('state.living+=1000'); run('renderLlmCard()'); ok(/plan edited since/.test(card()),'after a plan edit the remaining proposal is marked');
run('state.living-=1000');
run('llmClearAll()'); ok(run('rrProposals().length')===0,'Dismiss all clears the list');
// stress / Monte Carlo proposals (phase 2)
const rep2='{"schema":"planner.scenarios/1","scenarios":[{"kind":"stress","label":"Harsh stagflation","why":"inflation worry","config":{"stag":{"years":8,"eqReturn":-2,"inflEnd":10},"lost":{"enabled":false},"y1966":{"enabled":false}}},{"kind":"montecarlo","label":"Longer lives","why":"family history","config":{"trials":60,"mortality":{"mode":92}}}]}';
run('llmSetTab("import")'); document.getElementById('llmImportText').value=rep2; run('llmImportRun()');
ok(/Added 2 proposals/.test(card())&&/Harsh stagflation/.test(card())&&/Money lasts/.test(card())&&/Stagflation/.test(card()),'a stress proposal shows each scenario outcome in a table');
ok(/Longer lives/.test(card())&&/(Running|Waiting)/.test(card()),'a Monte Carlo proposal shows its job progress');
ok(/Apply to the card/.test(card())&&/Apply &amp; run/.test(card()),'both kinds offer Apply to the card / Apply & run');
const before2=planJson(); const sid2=run('rrProposals().find(p=>p.kind==="stress").pid'), mid2=run('rrProposals().find(p=>p.kind==="montecarlo").pid');
run('mcRun=null'); run('llmApplyCfg('+JSON.stringify(mid2)+',false)'); ok(run('state.ui.mcCfg.mortality.mode')===92&&run('state.ui.mcCfg.trials')===60&&run('state.ui.mcCfg.hidden')===false,'Apply to the card puts the Monte Carlo settings in the card (and opens it)');
run('llmApplyCfg('+JSON.stringify(sid2)+',false)'); ok(run('state.ui.stressCfg.stag.years')===8&&run('state.ui.stressCfg.lost.enabled')===false&&run('state.ui.stressCfg.med&&state.ui.stressCfg.med.enabled===false'),'Apply to the card puts the stress settings in the card and keeps the card own medical-shock setting');
ok(planJson()===before2,'applying card settings does not change the plan itself (they are viewer settings)');
run('llmClearAll()');
run('closeLlmCard()');
console.log(fails?fails+' FAILED':'all passed'); process.exit(fails?1:0);
`;
eval(head+body);
