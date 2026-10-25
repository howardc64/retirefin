// Writes the app's Excel export with the REAL SheetJS (cached values = the app's), so LibreOffice can recalculate it. See README.md in this folder.
//   node tests/xlsx_e2e/write_workbook.js <plan.json> <out.xlsx> ['{"guardrail":{...},"medShock":{...}}']     (needs: npm i xlsx, e.g. NODE_PATH=/tmp/xl/node_modules)
const fs=require('fs'), vm=require('vm'), path=require('path');
const root=path.resolve(__dirname,'..','..'), XLSX=require('xlsx');
const scripts=require('../../server/scripts.js').browserScripts(root);   // index.html order (server/scripts.js)
const src=fs.readFileSync(path.join(root,'tests/mc/xlsx_trial_test.js'),'utf8');
const i0=src.indexOf('const els={};'), i1=src.indexOf('const colL=');
const i2=src.indexOf('const store={};'), i3=src.indexOf('vm.createContext(ctx);');
let pre=src.slice(i0,i1)+src.slice(i2,i3);           // DOM stub + ctx object (without its fake XLSX)
const body=`const vm=require('vm'),fs=require('fs'),path=require('path'); ${pre.replace(/XLSX,/,'XLSX,')} vm.createContext(ctx); module.exports={ctx,scripts:null};`;
const mod={exports:{}}; new Function('require','module','XLSX',body)(require,mod,XLSX);
const ctx=mod.exports.ctx; ctx.XLSX=XLSX;
let code=''; for(const s of scripts) code+=`\n;/*@@${s}*/\n`+fs.readFileSync(path.join(root,s),'utf8').replace(/^'use strict';/,'');
vm.runInContext(code,ctx,{filename:'app.js'});
const run=s=>vm.runInContext(s,ctx);
ctx.__plan=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8'));
const patch=JSON.parse(process.argv[4]||'{}'); ctx.__patch=patch;
run(`state=hydrateState(__plan); Object.assign(state,{guardrail:Object.assign(state.guardrail,__patch.guardrail||{}), medShock:Object.assign(state.medShock,__patch.medShock||{})}); recompute();`);
// MC_TRIAL=fail | ok  →  export a Monte Carlo trial (the first failed / first successful one of a stressed 120-trial run) instead of the plan
if(process.env.MC_TRIAL){
  run(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); cfg.ltc.prob=0.9; cfg.returns.volEquity=24; const res=[]; for(let t=0;t<120;t++) res.push(mcRunTrial(cfg,t));
    mcResults={cfg,S:mcSummarize(res),R:mcFailureReasons(res),complete:true,results:res}; mcStateAtRun=mcScenarioKey(); })()`);
  run(process.env.MC_TRIAL==='ok'?`mcLoadTrial(mcOkTrials()[0])`:`mcLoadTrial(mcResults.R.list[0].trial)`);
  console.log('trial view',run('mcTrialView.view'),'trial #',run('mcTrialView.trial+1'));
}
console.log('rows',run('lastProjection.rows.length'),'cut decisions',run('lastProjection.rows.filter(r=>r.guard&&r.guard.move<0).length'),'med rows',run('lastProjection.rows.filter(r=>r.expMed>0).length'));
run(`globalThis.__built=xlsxBuildWorkbook(lastProjection,xlsxTrialContext())`);
const built=ctx.__built, wb=XLSX.utils.book_new(); built.sheets.forEach(s=>XLSX.utils.book_append_sheet(wb,s.ws,s.name)); wb.Workbook={Names:built.names, CalcPr:{fullCalcOnLoad:true}};
XLSX.writeFile(wb, process.argv[3]);
