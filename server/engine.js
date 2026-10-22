'use strict';
// Loads the planner's engine (no DOM, no browser) into a Node vm, together with the scenario / run-registry layers, and loads a saved plan file into it.
// Used by server/mcp.js; the file list mirrors tests/mc/mc_harness.js + tests/chat/harness.js.
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const FILES=['core/constants.js','core/helpers.js','compute/socialSecurityCalc.js','compute/rmd.js','compute/tax.js','core/state.js','compute/dates.js','compute/ageRange.js','compute/projection.js','compute/whatIf.js','compute/donorTraj.js','compute/monteCarlo.js','compute/stressTest.js','compute/marketScenario.js','input/inheritance.js','compute/scenarioSpec.js','compute/scenarioApi.js','compute/runRegistry.js','compute/runJobs.js'];
function makeEngine(opts){
  opts=opts||{};
  const el=()=>new Proxy(function(){}, {get:(t,p)=>p==='style'?{}:p==='classList'?{add(){},remove(){},toggle(){}}:el(), apply:()=>el(), set:()=>true});
  const doc={getElementById:()=>el(),createElement:()=>el(),addEventListener(){},removeEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[],body:el(),title:''};
  const err=(...a)=>process.stderr.write(a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')+'\n');   // stdout belongs to the protocol
  const ctx={console:{log:err,error:err,warn:err,info:err},Math,JSON,Date,Number,String,Array,Object,Infinity,isFinite,parseFloat,parseInt,Set,Map,Promise,WeakMap,
    document:doc,location:{search:''},localStorage:{getItem(){return null},setItem(){},removeItem(){}},sessionStorage:{getItem(){return null},setItem(){}},navigator:{},URLSearchParams,setTimeout,clearTimeout};
  ctx.window=ctx; ctx.globalThis=ctx; vm.createContext(ctx);
  for(const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT,'js',f),'utf8'),ctx,{filename:f});
  if(opts.names===false||opts.names===undefined) vm.runInContext('RR_TOOL_NAMES=false',ctx);   // names become "Person N" unless the operator asks otherwise
  const run=code=>vm.runInContext(code,ctx);
  // Load a plan file (the JSON the app's Save writes). The 🆎 scenario set lives in the browser's storage, not in the file, so only the plan itself is loaded.
  function loadPlan(file){
    ctx.__plan=JSON.parse(fs.readFileSync(file,'utf8'));
    run('{ const h=hydrateState(__plan); Object.keys(state).forEach(k=>{ delete state[k]; }); Object.assign(state,h); }');
  }
  return {ctx,run,loadPlan,ROOT};
}
module.exports={makeEngine,ROOT};
