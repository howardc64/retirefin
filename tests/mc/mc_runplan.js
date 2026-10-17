const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(require('fs').readFileSync(process.env.PLAN,'utf8'));
const N=+process.argv[2]||300;
const ctx=makeCtx(); loadPlan(ctx,plan);
function scenario(name,patch,mutateSrc){
  ctx.__p=patch; ctx.__N=N;
  const t=Date.now();
  const out=run(ctx,`(()=>{const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); const P=__p; for(const k in P) Object.assign(cfg[k],P[k]); cfg.trials=__N;
    const mut=${mutateSrc||'null'}; const res=mcRunRange(cfg,0,__N,mut); const S=mcSummarize(res); const D=mcFailureReasons(res);
    return {S:{succ:S.successRate,fail:S.failCount,medFailAge:S.medianFailAge,estate:S.estate,tax:S.lifetimeTax,medShort:S.medianShortfall,fundedThrough:S.fundedThrough.filter((_,k)=>k%5==0)},D}})()`);
  console.log('\n== '+name+'  ('+((Date.now()-t)/1000).toFixed(1)+'s, '+N+' trials)');
  console.log(' success '+(out.S.succ*100).toFixed(1)+'%  failures '+out.S.fail+'  median fail age '+(out.S.medFailAge&&out.S.medFailAge.toFixed(0)));
  const M=v=>'$'+(v/1e6).toFixed(2)+'M';
  console.log(' final assets (today $): p10 '+M(out.S.estate.p10)+'  p50 '+M(out.S.estate.p50)+'  p90 '+M(out.S.estate.p90)+'   lifetime tax p50 $'+Math.round(out.S.tax.p50/1000)+'k p90 $'+Math.round(out.S.tax.p90/1000)+'k');
  return out;
}
const off={returns:{enabled:false},mortality:{enabled:false},ltc:{enabled:false}};
scenario('A. deterministic (plan as entered; every random part off)',off);
scenario('B. returns only (16% vol)',{...off,returns:{enabled:true}});
scenario('C. returns + random lifespans',{...off,returns:{enabled:true},mortality:{enabled:true}});
const full=scenario('D. returns + lifespans + random LTC',{...off,returns:{enabled:true},mortality:{enabled:true},ltc:{enabled:true}});
console.log(' drivers (share of ALL trials -> share of FAILING trials):',JSON.stringify(full.D));
scenario('E. stress: returns only, 20% vol, plan LTC kept',{...off,returns:{enabled:true,volEquity:20}});
