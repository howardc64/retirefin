const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(require('fs').readFileSync(process.env.PLAN,'utf8'));
const ctx=makeCtx(); loadPlan(ctx,plan);
function go(label,inf){
  ctx.__i=inf;
  const o=run(ctx,`(()=>{const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); Object.assign(cfg.inflation,__i); const res=mcRunRange(cfg,0,1000);
   const e=res.map(r=>r.estateFin+r.estateRe).sort((a,b)=>a-b), t=res.map(r=>r.lifeTax).sort((a,b)=>a-b);
   return {succ:1-res.filter(r=>r.failK>=0).length/res.length,p10:mcQuantile(e,.1),p50:mcQuantile(e,.5),p90:mcQuantile(e,.9),tax50:mcQuantile(t,.5),tax90:mcQuantile(t,.9)}})()`);
  const M=v=>'$'+(v/1e6).toFixed(2)+'M';
  console.log(label.padEnd(34),(o.succ*100).toFixed(1)+'%  assets p10 '+M(o.p10)+' p50 '+M(o.p50)+' p90 '+M(o.p90)+'  tax p50 $'+Math.round(o.tax50/1e3)+'k p90 $'+Math.round(o.tax90/1e3)+'k');
}
go('inflation fixed at 3%',{enabled:false});
go('random (1.2% vol, persistence .6)',{enabled:true});
go('stress (2.5% vol, persistence .8)',{enabled:true,sigma:2.5,phi:0.8});
