// Medical shock + panic in the UI (stub DOM): Expenses card, Stress card group and result tables, Monte Carlo panic rows and paired pass.
//   PLAN=Samples/MFJ.json node tests/mc/medshock_ui_test.js
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'mc_ui_test.js'),'utf8');
const cut=src.indexOf('// stub geometry');
const mod={exports:{}}; new Function('require','module','__dirname','process',src.slice(0,cut)+'\nmodule.exports={run,els,ctx};')(require,mod,__dirname,process);
const {run,els}=mod.exports;
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
mod.exports.ctx.__plan=JSON.parse(fs.readFileSync(path.resolve(process.env.PLAN||'Samples/MFJ.json'),'utf8'));
run(`state=hydrateState(__plan); recompute(); renderMedShockPanel();`);
ok(/Late-life medical shock/.test(els.medShockPanel.innerHTML)&&/msCost/.test(els.medShockPanel.innerHTML),'Expenses card renders');
ok(run('state.medShock.enabled')===false&&run('ASSUMP_HIDE_DEFAULT.medShock')===true,'off and hidden by default');
ok(run(`(()=>{ const p=JSON.parse(JSON.stringify(__plan)); delete p.medShock; const h=hydrateState(p); return h.medShock&&h.medShock.age===80&&h.medShock.enabled===false; })()`),'an older save loads with the defaults');
run(`onEnableToggle('medShock.enabled',true); onNumberInput('medShock.cost','150000'); onNumberInput('medShock.age','76'); recompute();`);   // (number fields recompute after a short delay)
ok(run('state.medShock.enabled&&state.medShock.cost===150000&&state.medShock.age===76')&&run('lastProjection.rows.some(r=>r.expMed===150000)'),'card writes to state and the projection picks it up');
run(`onEnableToggle('medShock.enabled',false);`);
// stress card: the medical shock alone
const E=id=>run(`document.getElementById('${id}')`);
run(`buildStressPanel();`); ['stLost','stStag','stY66'].forEach(id=>{ E(id).checked=false; }); E('stMed').checked=true; E('stStartMode').value='retire'; E('stShare').value='100';
E('stMedAge').value='75'; E('stMedYears').value='3'; E('stMedCost').value='120000'; E('stMedOrd').checked=true; E('stMedWho').value='0';
run(`stStart();`);
const h=els.stSummary.innerHTML;
ok(/Late-life medical shock:/.test(h)&&/Capital gains realised/.test(h)&&/Itemized deduction the shock creates/.test(h),'stress card shows the shock table without any market scenario');
ok(/four withdrawal orders/.test(h)&&/Roth first/.test(h)&&/&#9733;/.test(h),'and the withdrawal-order comparison with the best estate marked');
ok(run('state.medShock.enabled')===false,'plan state untouched');
E('stMedOrd').checked=false; run(`stStart();`);
ok(!/four withdrawal orders/.test(els.stSummary.innerHTML),'order comparison can be switched off');
E('stMedAge').value='150'; run(`stStart();`);
ok(/outside the projection/.test(els.stSummary.innerHTML),'an age beyond the horizon says so');
// Monte Carlo: panic group, paired pass and rows
run(`buildMcPanel();`); E('mcRet').checked=true; E('mcPanic').checked=true; E('mcPanCmp').checked=true; E('mcPanRho').value='0.95'; E('mcPanTrig').value='1.5'; E('mcPanHold').value='2'; E('mcTrials').value='50'; E('mcPanRe').checked=true;
ok(run(`(()=>{ const c=mcReadCfg(); return c.returns.panic.enabled&&c.returns.panic.rhoPanic===0.95&&c.returns.panic.trigger===-1.5&&c.returns.panic.holdYears===2&&c.returns.panic.compare&&c.returns.panic.includeRE; })()`),'panic settings are read from the card');
run(`(()=>{ const cfg=JSON.parse(JSON.stringify(mcReadCfg())), off=JSON.parse(JSON.stringify(cfg)); off.returns.panic.enabled=false; const a=[],b=[]; for(let t=0;t<60;t++){ a.push(mcRunTrial(cfg,t)); b.push(mcRunTrial(off,t)); }
  mcResults={cfg,S:mcSummarize(a),R:mcFailureReasons(a),complete:true,results:a,cmp:mcSummarize(b)}; mcStateAtRun=mcPlanKey(); mcRender(); })()`);
const m=els.mcSummary.innerHTML;
ok(/Systemic panic/.test(m)&&/had a panic year/.test(m)&&/Same trials without panic/.test(m),'Monte Carlo card shows panic rows and the paired comparison');
run(`mcResults.S.panic=null; mcResults.cmp=null; mcRender();`);
ok(!/Systemic panic/.test(els.mcSummary.innerHTML),'no panic rows when off');
console.log(fails?('\n'+fails+' FAILED'):'\nall passed'); process.exit(fails?1:0);
