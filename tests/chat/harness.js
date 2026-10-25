// Loads the engine (via the existing tests/mc/mc_harness.js) plus the scenario-spec layer into a Node vm. No DOM, no npm.
const path=require('path'), fs=require('fs'), vm=require('vm');
const ROOT=process.env.PLANNER_ROOT||path.join(__dirname,'..','..');
process.env.PLANNER_ROOT=ROOT;
const mc=require('../mc/mc_harness.js');
function makeCtx(planFile){
  const ctx=mc.makeCtx();
  require('../../server/scripts.js').engineScripts(ROOT,['scenario']).forEach(f=>{ const fp=path.join(ROOT,'js',f); if(fs.existsSync(fp)) vm.runInContext(fs.readFileSync(fp,'utf8'),ctx,{filename:f}); });   // the scenario layer, in index.html order
  if(planFile) mc.loadPlan(ctx,JSON.parse(fs.readFileSync(path.join(ROOT,'Samples',planFile),'utf8')));
  return ctx;
}
module.exports={makeCtx,run:mc.run,ROOT};
