// Loads the planner's engine files (no DOM) into a vm context so computeProjection() can run in Node.
const fs=require('fs'), vm=require('vm'), path=require('path');
const ROOT=process.env.PLANNER_ROOT||path.join(__dirname,'..');
const FILES=['core/constants.js','core/helpers.js','compute/socialSecurityCalc.js','compute/rmd.js','compute/tax.js','core/state.js','compute/dates.js','compute/ageRange.js','compute/projection.js','compute/whatIf.js','compute/donorTraj.js','compute/monteCarlo.js','compute/stressTest.js','input/inheritance.js'];
function makeCtx(){
  const el=()=>new Proxy(function(){}, {get:(t,p)=>p==='style'?{}:p==='classList'?{add(){},remove(){},toggle(){}}:el(), apply:()=>el(), set:()=>true});
  const doc={getElementById:()=>el(),createElement:()=>el(),addEventListener(){},removeEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[],body:el(),title:''};
  const ctx={console,Math,JSON,Date,Number,String,Array,Object,Infinity,isFinite,parseFloat,parseInt,
    document:doc,location:{search:''},localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    sessionStorage:{getItem(){return null},setItem(){}},navigator:{},URLSearchParams,setTimeout,clearTimeout};
  ctx.window=ctx; vm.createContext(ctx);
  for(const f of FILES){ const fp=path.join(ROOT,'js',f); if(fs.existsSync(fp)) vm.runInContext(fs.readFileSync(fp,'utf8'),ctx,{filename:f}); }
  return ctx;
}
function loadPlan(ctx, planJson){
  ctx.__plan=planJson;
  vm.runInContext('Object.assign(state, hydrateState(__plan))',ctx);
}
module.exports={makeCtx,loadPlan,run:(ctx,code)=>vm.runInContext(code,ctx)};
