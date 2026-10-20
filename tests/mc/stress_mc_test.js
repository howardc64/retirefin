// "Run stress tests + Monte Carlo": inside a scenario's years the trial must use the stress test's own returns AND inflation (nothing random), outside them the random ones.
// Run from the app folder:  PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/stress_mc_test.js
const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(require('fs').readFileSync(process.env.PLAN||'Samples/Couple_Heir.json','utf8'));
const ctx=makeCtx(); loadPlan(ctx,plan);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };

// 1. every random part off: the trial equals the plain stress test, year by year, for every scenario
const eq=run(ctx,`(()=>{
  const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)), base=stRun(null,0,cfg), start=stStartRow(cfg,base), off=JSON.parse(JSON.stringify(MC_DEFAULTS));
  off.returns.enabled=false; off.mortality.enabled=false; off.ltc.enabled=false; off.inheritance.enabled=false; off.inflation.enabled=false;
  return stScenarios(cfg).map(s=>{ const a=mcMeasure(stRun(s,start,cfg),{pass:[0,0],ltcYears:[0,0]}), b=mcRunTrial(off,0,null,null,{scen:s,start,share:cfg.equityShare});
    let d=0; for(let k=0;k<a.n;k++) d=Math.max(d,Math.abs(a.fin[k]-b.fin[k]),Math.abs(a.re[k]-b.re[k])); return {id:s.id,d,n:a.n===b.n}; });
})()`);
eq.forEach(r=>ok(r.d<1e-6&&r.n,'random parts off: '+r.id+' trial == stress test (max diff '+r.d.toExponential(1)+')'));

// 2. everything random ON (Monte Carlo defaults): inside the window every asset gets exactly the scenario's real rate and the year's inflation is the scenario's (or the plan's)
const win=run(ctx,`(()=>{
  const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)), base=stRun(null,0,cfg), start=stStartRow(cfg,base), mc=JSON.parse(JSON.stringify(MC_DEFAULTS)), mean=state.inflation, out=[];
  mc.inflation.enabled=true; mc.returns.enabled=true;
  stScenarios(cfg).forEach(s=>{ let bad=0, checked=0, rand=0;
    for(let t=0;t<40;t++){ const cap={}; mcRunTrial(mc,t,null,cap,{scen:s,start,share:100}); const n=cap.proj.rows.length;
      for(let k=0;k<n;k++){ const j=k-start, pi=cap.infl.pi[k], r=cap.proj.rates[k]; const inW=j>=0&&j<s.eq.length;
        if(inW){ const wantPi=s.infl?s.infl[j]:mean; if(Math.abs(pi-wantPi)>1e-12) bad++;
          Object.keys(r).forEach(key=>{ if(key.slice(0,2)==='re') return; checked++; if(Math.abs(r[key]-((1+s.eq[j])/(1+wantPi)-1))>1e-9) bad++; }); }
        else if(Math.abs(pi-mean)>1e-9) rand++; }
    }
    out.push({id:s.id,bad,checked,rand}); });
  return out;
})()`);
win.forEach(r=>ok(r.bad===0&&r.checked>0,'random parts on: '+r.id+' window uses the scenario\'s returns and inflation ('+r.checked+' asset-years checked, '+r.bad+' off)'));
ok(win.every(r=>r.rand>0),'outside the window the random inflation still applies');

// 3. the Lost Decade without "actual inflation": inflation in its years is the PLAN's, not random
const lost=run(ctx,`(()=>{ const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)), start=stStartRow(cfg,stRun(null,0,cfg)), s=stScenarios(cfg).find(x=>x.id==='lost'), mc=JSON.parse(JSON.stringify(MC_DEFAULTS)); mc.inflation.enabled=true;
  const cap={}; mcRunTrial(mc,5,null,cap,{scen:s,start,share:100}); const m=state.inflation; let d=0; for(let j=0;j<s.eq.length;j++) d=Math.max(d,Math.abs(cap.infl.pi[start+j]-m)); return {d, after:Math.abs(cap.infl.pi[start+s.eq.length+3]-m)}; })()`);
ok(lost.d<1e-12,'Lost Decade (no actual inflation) + random inflation: its years carry the plan\'s inflation (diff '+lost.d.toExponential(1)+')');
ok(lost.after>1e-6,'... and the years after it are random again');

// 4. property keeps the plan's own (non-random) rate inside the window
const prop=run(ctx,`(()=>{ const cfg=JSON.parse(JSON.stringify(ST_DEFAULTS)), start=stStartRow(cfg,stRun(null,0,cfg)), s=stScenarios(cfg)[0], mc=JSON.parse(JSON.stringify(MC_DEFAULTS));
  const a={},b={}; mcRunTrial(mc,1,null,a,{scen:s,start,share:100}); mcRunTrial(mc,2,null,b,{scen:s,start,share:100});
  const keys=Object.keys(a.proj.rates[start]).filter(k=>k.slice(0,2)==='re'); let d=0; keys.forEach(k=>{ for(let j=0;j<s.eq.length;j++){ const x=(a.proj.rates[start+j]||{})[k], y=(b.proj.rates[start+j]||{})[k]; if(x!=null&&y!=null) d=Math.max(d,Math.abs(x-y)); } }); return {n:keys.length,d}; })()`);
ok(prop.n===0||prop.d<1e-9,'property rate inside the window is the same in different trials ('+prop.n+' properties)');
console.log(fails?fails+' FAILED':'all passed'); process.exit(fails?1:0);
