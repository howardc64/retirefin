const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(require('fs').readFileSync(process.env.PLAN,'utf8'));
const ctx=makeCtx(); loadPlan(ctx,plan);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };

// 1. deterministic reference
const ref=run(ctx,`(()=>{const p=computeProjection(); return p.rows.map(r=>({fin:(()=>{let f=0;r.portfoliosByPerson.forEach(l=>l.forEach(e=>{if(e&&e.balance>0)f+=e.balance}));r.iraBalByPerson.forEach(v=>f+=v||0);r.rothBalByPerson.forEach(v=>f+=v||0);(r.inhIraByPerson||[]).forEach(l=>l.forEach(e=>{if(e&&e.live)f+=e.balance||0}));return f})(),tax:r.totalTax}))})()`);
// 2. trial with everything off must equal it
function trial(cfgPatch){
  ctx.__p=cfgPatch;
  return run(ctx,`(()=>{const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); const P=__p; for(const k in P) Object.assign(cfg[k]||(cfg[k]={}),P[k]); Object.assign(cfg,P.top||{}); const m=mcRunTrial(cfg,7); return {n:m.n,fin:Array.from(m.fin),lifeTax:m.lifeTax,fail:m.failK,pass:m.pass}})()`);
}
const maxdiff=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));
let t=trial({returns:{enabled:false},mortality:{enabled:false},ltc:{enabled:false},inflation:{enabled:false}});
ok(t.n===ref.length && maxdiff(t.fin,ref.map(r=>r.fin))<1e-6,'all randomness off == deterministic ('+t.n+' rows, max diff '+maxdiff(t.fin,ref.map(r=>r.fin)).toExponential(1)+')');
t=trial({returns:{enabled:true,volEquity:0,volRE:0},mortality:{enabled:false},ltc:{enabled:false},inflation:{enabled:false}});
ok(t.n===ref.length && maxdiff(t.fin,ref.map(r=>r.fin))<1e-4,'returns on with zero volatility == deterministic (max diff '+maxdiff(t.fin,ref.map(r=>r.fin)).toExponential(1)+')');
// 3. mean-preserving factor
const m=run(ctx,`(()=>{const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); let s=0,s2=0,n=0; for(let tr=0;tr<400;tr++){const p=mcPath(cfg,tr,40); for(let k=0;k<40;k++){const f=mcFactor(p,'pf:abc',k); s+=f; s2+=Math.log(f)**2; n++;}} return {mean:s/n, sd:Math.sqrt(s2/n)}})()`);
ok(Math.abs(m.mean-1)<0.01,'mean of return factor = '+m.mean.toFixed(4)+' (want 1), log-sd '+m.sd.toFixed(3)+' (want .16)');
// 4. reproducibility
const a=trial({}), b=trial({}); ok(JSON.stringify(a)===JSON.stringify(b),'same seed + trial index -> identical result');
// 5. mortality calibration
const cal=run(ctx,`(()=>{const c=MC_DEFAULTS.mortality; let e=0; for(let x=60;x<111;x+=0.1) e+=mcSurvival(60,x,c)*0.1; return {e60:e, s95:mcSurvival(60,95,c), s85:mcSurvival(60,85,c), s75:mcSurvival(60,75,c)}})()`);
console.log('  mortality from age 60: life expectancy +'+cal.e60.toFixed(1)+' yrs; P(reach 75)='+cal.s75.toFixed(2)+' P(85)='+cal.s85.toFixed(2)+' P(95)='+cal.s95.toFixed(2));

// 6. inflation: zero volatility == deterministic; and fixed-dollar items follow the random price level
t=trial({returns:{enabled:false},mortality:{enabled:false},ltc:{enabled:false},inflation:{enabled:true,sigma:0}});
ok(t.n===ref.length && maxdiff(t.fin,ref.map(r=>r.fin))<1e-3,'inflation on with zero volatility == deterministic (max diff '+maxdiff(t.fin,ref.map(r=>r.fin)).toExponential(1)+')');
const pen=run(ctx,`(()=>{const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); cfg.inflation.sigma=3; cfg.inflation.phi=0.7;
  const path=mcPath(cfg,3,70); const mean=state.inflation; const infl=mcInflation(path,mean); let worst=0, ratio=null;
  const rows=(MC_INFL=infl, (()=>{try{return computeProjection().rows}finally{MC_INFL=null}})());
  for(const k of [5,10,20]){ worst=Math.max(worst,Math.abs(rows[k].pension-24000/infl.cpi[k])); }
  const det=computeProjection().rows;
  return {worst, k20:rows[20].pension, k20det:det[20].pension, cpi20:infl.cpi[20], cpi20det:Math.pow(1+mean,20)}})()`);
ok(pen.worst<1e-6,'no-COLA pension = $24,000 / price level (max error '+pen.worst.toExponential(1)+'); k=20: $'+Math.round(pen.k20)+' random vs $'+Math.round(pen.k20det)+' planned (price level '+pen.cpi20.toFixed(3)+' vs '+pen.cpi20det.toFixed(3)+')');
const im=run(ctx,`(()=>{const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); let s=0,s2=0,n=0,r20=0; for(let tr=0;tr<600;tr++){const p=mcPath(cfg,tr,70); const f=mcInflation(p,0.03); r20+=f.cpi[20]/Math.pow(1.03,20); for(let k=0;k<30;k++){s+=f.pi[k]; s2+=(f.pi[k]-0.03)**2; n++;}} return {mean:s/n, sd:Math.sqrt(s2/n), r20:r20/600}})()`);
ok(Math.abs(im.mean-0.03)<0.0015,'mean inflation '+(im.mean*100).toFixed(2)+'% (plan 3%), sd '+(im.sd*100).toFixed(2)+'%, mean price level after 20 yrs = '+im.r20.toFixed(3)+' x planned');
console.log(fails?('\n'+fails+' FAILED'):'\nall passed');
