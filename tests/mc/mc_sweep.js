const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(require('fs').readFileSync(process.env.PLAN,'utf8'));
const ctx=makeCtx(); loadPlan(ctx,plan);
const N=1000, HEIR=0.24;
function sweep(label,cfgPatch,amts,startMode){
  console.log('\n'+label);
  console.log('conv $/yr | success | p10 after-tax est | p50 after-tax est | p50 lifetime tax | p90 lifetime tax');
  for(const amt of amts){
    ctx.__a=amt; ctx.__c=cfgPatch; ctx.__N=N; ctx.__H=HEIR; ctx.__sm=startMode||null;
    const o=run(ctx,`(()=>{const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); for(const k in __c) Object.assign(cfg[k],__c[k]);
      const mut=s=>{ s.people[0].roth.enabled=true; s.people[0].ira.conv=__a; if(__sm) s.people[0].ira.convStartMode=__sm; };
      const res=mcRunRange(cfg,0,__N,mut); const at=res.map(r=>r.estateFin+r.estateRe-__H*r.estateIra).sort((a,b)=>a-b); const tx=res.map(r=>r.lifeTax).sort((a,b)=>a-b);
      return {succ:1-res.filter(r=>r.failK>=0).length/res.length, p10:mcQuantile(at,.1), p50:mcQuantile(at,.5), t50:mcQuantile(tx,.5), t90:mcQuantile(tx,.9)}})()`);
    const M=v=>('$'+(v/1e6).toFixed(2)+'M').padStart(8);
    console.log(String(amt).padStart(9)+' | '+(o.succ*100).toFixed(1).padStart(6)+'% | '+M(o.p10)+'          | '+M(o.p50)+'          | $'+String(Math.round(o.t50/1000)).padStart(4)+'k          | $'+String(Math.round(o.t90/1000)).padStart(4)+'k');
  }
}
const full={returns:{enabled:true},mortality:{enabled:true},ltc:{enabled:true}};
sweep('Roth conversion size, converting from RMD age 75 (Roth IRA enabled), full randomness, same 1000 random paths per row',full,[0,48000,96000,144000]);
sweep('Same, but starting conversions NOW (age ~60) instead of at 75',full,[0,24000,48000,96000],'now');
