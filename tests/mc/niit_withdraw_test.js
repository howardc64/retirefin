// Portfolio withdraw "Accept NIIT" (projection.js, Brokerage withdraws). Run: PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/niit_withdraw_test.js
const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(require('fs').readFileSync(process.env.PLAN,'utf8'));
const ctx=makeCtx(); loadPlan(ctx,plan);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const go=(pct,acc)=>{ ctx.__a=[pct,acc]; return run(ctx,`(()=>{ state.pfWithdraw={enabled:true,ltcgPct:__a[0],acceptNiit:__a[1]}; const p=computeProjection(); return p.rows.map(r=>({wd:r.brokerageWd||0,niit:r.niit||0,agi:r.agi,niiIncome:r.niiIncome||0,unf:r.expUnfunded||0}));})()`); };
ok(run(ctx,'defaultState().pfWithdraw.acceptNiit===false'),'default is unchecked');
for(const pct of [0,15,20]){
  const off=go(pct,false), on=go(pct,true), sum=(a,k)=>a.reduce((t,r)=>t+r[k],0);
  console.log(`  bracket ${pct}: NIIT paid  off=${Math.round(sum(off,'niit'))}  on=${Math.round(sum(on,'niit'))};  withdrawn off=${Math.round(sum(off,'wd'))} on=${Math.round(sum(on,'wd'))}`);
  ok(sum(off,'niit')<=sum(on,'niit')+1e-6,'bracket '+pct+': unchecked never pays more NIIT than checked');
  ok(sum(off,'wd')<=sum(on,'wd')+1e-6,'bracket '+pct+': unchecked never sells more than checked');
}
// Accept Social Security Tax Torpedo: unchecked never raises taxable SS through the sale, checked never sells less
const tor=(pct,acc)=>{ ctx.__a=[pct,acc]; return run(ctx,`(()=>{ state.pfWithdraw={enabled:true,ltcgPct:__a[0],acceptNiit:true,acceptTorpedo:__a[1]}; const p=computeProjection(); return p.rows.map(r=>({wd:r.brokerageWd||0,ss:r.taxableSS||0}));})()`); };
ok(run(ctx,'defaultState().pfWithdraw.acceptTorpedo===false'),'torpedo default is unchecked');
for(const pct of [15,20]){
  const off=tor(pct,false), on=tor(pct,true), sum=(a,k)=>a.reduce((t,r)=>t+r[k],0);
  console.log(`  bracket ${pct}: taxable SS  off=${Math.round(sum(off,'ss'))}  on=${Math.round(sum(on,'ss'))};  withdrawn off=${Math.round(sum(off,'wd'))} on=${Math.round(sum(on,'wd'))}`);
  ok(sum(off,'wd')<=sum(on,'wd')+1e-6,'bracket '+pct+': torpedo unchecked never sells more than checked');
}
console.log(fails?'\n'+fails+' FAILED':'\nall passed'); process.exit(fails?1:0);
