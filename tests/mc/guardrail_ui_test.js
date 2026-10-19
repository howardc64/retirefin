// Spending guardrails in the UI (stub DOM): the Expenses card renders and saves; the Stress test and Monte Carlo cards show the guardrail results.
//   PLAN=Samples/Couple_Heir.json node tests/mc/guardrail_ui_test.js
const fs=require('fs'), vm=require('vm'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'mc_ui_test.js'),'utf8');
const cut=src.indexOf('// stub geometry');                       // reuse the loader (DOM stub + app bundle) of mc_ui_test.js, not its checks
const mod={exports:{}}; new Function('require','module','__dirname','process',src.slice(0,cut)+'\nmodule.exports={run,els,ctx};')(require,mod,__dirname,process);
const {run,els}=mod.exports;
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
mod.exports.ctx.__plan=JSON.parse(fs.readFileSync(path.resolve(process.env.PLAN||'Samples/Couple_Heir.json'),'utf8'));
run(`state=hydrateState(__plan); recompute(); renderGuardrailPanel();`);
ok(/Spending guardrails/.test(els.guardrailPanel.innerHTML)&&/grBand/.test(els.guardrailPanel.innerHTML),'Expenses card renders');
ok(run('state.guardrail.enabled')===false&&run('ASSUMP_HIDE_DEFAULT.guardrail')===true,'off and hidden by default');
// an old save without the field loads with the defaults
ok(run(`(()=>{ const p=JSON.parse(JSON.stringify(__plan)); delete p.guardrail; const h=hydrateState(p); return h.guardrail&&h.guardrail.band===20&&h.guardrail.enabled===false; })()`),'an older save without the field loads with the guardrail defaults');
run(`onEnableToggle('guardrail.enabled',true); onNumberInput('guardrail.band','25');`);
ok(run('state.guardrail.enabled===true&&state.guardrail.band===25'),'enable box and number fields write to state.guardrail');
run(`buildStressPanel();`); const E=id=>run(`document.getElementById('${id}')`); ['stLost','stStag','stY66'].forEach(id=>{ E(id).checked=true; }); E('stStartMode').value='retire'; E('stShare').value='100';   // the stub DOM has no form defaults
run(`stStart();`);
ok(/Spending guardrails are on/.test(els.stSummary.innerHTML)&&/Invested balance that tripped it/.test(els.stSummary.innerHTML),'Stress test card shows the guardrail table');
run(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); const res=[]; for(let t=0;t<60;t++) res.push(mcRunTrial(cfg,t));
  mcResults={cfg,S:mcSummarize(res),R:mcFailureReasons(res),complete:true,results:res}; mcStateAtRun=mcPlanKey(); mcRender(); })()`);
ok(/Trials that had to cut spending/.test(els.mcSummary.innerHTML)&&/with spending guardrails/.test(els.mcSummary.innerHTML),'Monte Carlo card shows the guardrail rows');
run(`onEnableToggle('guardrail.enabled',false);`);
run(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); const res=[]; for(let t=0;t<20;t++) res.push(mcRunTrial(cfg,t)); mcResults={cfg,S:mcSummarize(res),R:mcFailureReasons(res),complete:true,results:res}; mcRender(); })()`);
ok(!/Trials that had to cut/.test(els.mcSummary.innerHTML),'with guardrails off the Monte Carlo card is unchanged');
console.log(fails?('\n'+fails+' FAILED'):'\nall passed'); process.exit(fails?1:0);
