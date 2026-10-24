// Loads the engine (via the existing tests/mc/mc_harness.js) plus the scenario-spec layer into a Node vm. No DOM, no npm.
const path=require('path'), fs=require('fs'), vm=require('vm');
const ROOT=process.env.PLANNER_ROOT||path.join(__dirname,'..','..');
process.env.PLANNER_ROOT=ROOT;
const mc=require('../mc/mc_harness.js');
function makeCtx(planFile){
  const ctx=mc.makeCtx();
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/compute/scenarioSpec.js'),'utf8'),ctx,{filename:'compute/scenarioSpec.js'});
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/compute/scenarioApi.js'),'utf8'),ctx,{filename:'compute/scenarioApi.js'});
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/compute/runRegistry.js'),'utf8'),ctx,{filename:'compute/runRegistry.js'});
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/compute/runJobs.js'),'utf8'),ctx,{filename:'compute/runJobs.js'});
  ['plans/planSpec.js','plans/planStore.js','plans/scenarioSetProducer.js','plans/stressProducer.js','plans/monteCarloProducer.js','plans/marketProducer.js','plans/leverProducer.js','plans/jobsProducer.js','plans/planTools.js'].forEach(f=>{ const fp=path.join(ROOT,'js',f); if(fs.existsSync(fp)) vm.runInContext(fs.readFileSync(fp,'utf8'),ctx,{filename:f}); });
  if(planFile) mc.loadPlan(ctx,JSON.parse(fs.readFileSync(path.join(ROOT,'Samples',planFile),'utf8')));
  return ctx;
}
module.exports={makeCtx,run:mc.run,ROOT};
