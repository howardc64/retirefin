'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / MONTE CARLO — runs computeProjection() many times against a temporary clone of
// `state`, with random (but seeded, reproducible) market returns, lifespans and Long Term Care.
// No DOM access. Loaded after projection.js and whatIf.js (uses withTempState, currentAge, MC_HOOK).
//
// What is random (each part can be switched off in the settings):
//   • returns   — every growth rate the scenario uses (brokerage, IRA, Roth, inherited IRA, real estate) is multiplied
//                 each year by a lognormal factor with mean exactly 1, so the average return is the one the user
//                 typed and only the spread is added (no silent "volatility drag" on the plan's assumptions).
//   • panic     — optional (returns.panic): after a multi-sigma market drop the portfolios stop diversifying — their pairwise correlation rises to
//                 rhoPanic (and property's to rhoRE) for that year and the next holdYears-1. The mean return stays exactly the plan's (mcPanicNorm).
//   • mortality — each person's passing age is drawn from a Gompertz survival curve (conditional on current age)
//                 instead of the fixed "passes at age" slider.
//   • ltc       — each person needs care with probability `prob`; care lasts a lognormal number of years and ends
//                 at their passing; the annual cost is scaled by a lognormal factor. Replaces the plan's fixed LTC.
//   • inheritance — the source plan of each inherited asset gets its own lifespan (same model), Long Term Care and the household's market shocks;
//                 the asset arrives in the year that plan's last person passes, worth that year's value from the table captured at import
//                 (compute/donorTraj.js). A part that is switched off above uses the source plan's own figure for the donor.
//   • inflation — yearly inflation follows an AR(1) process around the plan's inflation rate (persistent: high-inflation decades
//                 come in runs). The engine is in today's $ and Social Security COLA / indexed brackets track inflation, so what
//                 inflation changes is everything fixed in nominal dollars: a no-COLA pension, un-indexed tax thresholds, cost
//                 basis, depreciation, the home-sale exclusion, and any growth entered as a fixed or custom NOMINAL rate.
//                 Growth entered as "inflation ± X%" keeps its real rate.
// NOT random yet: Social Security / pension amounts, tax law.
// ═══════════════════════════════════════════════════════════════

const MC_DEFAULTS={
  trials:500,
  seed:20261016,
  returns:{enabled:true, volEquity:16, volRE:8, rho:0.8,
    panic:{enabled:false, rhoPanic:0.9, trigger:-1.5, holdYears:1, includeRE:true, rhoRE:0.5, compare:false}},   // panic = correlation convergence (see mcFactor): in a year the market shock is below `trigger` sigmas (and the next holdYears-1 years) every equity-like asset's correlation with the others rises to rhoPanic, property's to rhoRE   // vol in % per year; rho = correlation of each portfolio's shock with the market shock
  mortality:{enabled:true, mode:87, scale:10},               // Gompertz: modal age at death `mode`, dispersion `scale` (years). Unisex, placeholder for an SSA table
  ltc:{enabled:true, prob:0.5, medianYears:2, yearsSigma:0.7, costSigma:0.25, minStartAge:65},
  inflation:{enabled:true, sigma:1.2, phi:0.6, min:-2, max:12},
  inheritance:{enabled:true, haircutPct:0}   // only acts on an inheritance source that carries a donor table (compute/donorTraj.js); haircutPct = % of every inherited asset not counted on   // sigma = sd of the yearly shock in % points; phi = year-to-year persistence; yearly rate clamped to [min,max] %
};

// ── seeded random numbers ──────────────────────────────────────
function mcHash(str){ let h=2166136261>>>0; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
function mcRng(seed){          // mulberry32
  let a=seed>>>0;
  return function(){ a=(a+0x6D2B79F5)>>>0; let t=a; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
}
function mcNormal(rng){        // Box–Muller
  let u=0; while(u===0) u=rng();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng());
}

// ── lifespan: Gompertz, conditional on being alive at `age` ────
// S(x|a) = exp(-e^{(a-M)/b} (e^{(x-a)/b} - 1)); inverse: x = a + b ln(1 - ln(u) e^{(M-a)/b}).
function mcSampleDeathAge(age, cfg, rng){
  let u=0; while(u===0) u=rng();
  const x=age+cfg.scale*Math.log(1-Math.log(u)*Math.exp((cfg.mode-age)/cfg.scale));
  return Math.min(110, x);
}
// Probability of living from `age` to `to` (for the calibration printout).
function mcSurvival(age, to, cfg){ return Math.exp(-Math.exp((age-cfg.mode)/cfg.scale)*(Math.exp((to-age)/cfg.scale)-1)); }

// ── systemic panic: correlation convergence ──────────────────────
// Standard normal CDF by Simpson's rule on the density (exact to ~1e-12; only a handful of distinct arguments per run, see mcPanicNorm).
const MC_PHI_CACHE=new Map();
function mcPhi(x){
  if(x<=-12) return 0; if(x>=12) return 1;
  let c=MC_PHI_CACHE.get(x); if(c!==undefined) return c;
  c=mcPhiCalc(x); if(MC_PHI_CACHE.size>500) MC_PHI_CACHE.clear(); MC_PHI_CACHE.set(x,c); return c;
}
function mcPhiCalc(x){
  const n=4000, h=(x+12)/n; let sum=0;
  for(let i=0;i<=n;i++){ const t=-12+i*h, f=Math.exp(-t*t/2)/Math.sqrt(2*Math.PI); sum+=f*(i===0||i===n?1:(i%2?4:2)); }
  return Math.min(1,Math.max(0,sum*h/3));
}
// With a correlation that depends on the market shock itself, an asset's shock z = sqrt(rho_k) zMkt + sqrt(1-rho_k) idio is no longer standard normal, so the plain factor
// exp(sig z - sig^2/2) would drift away from mean 1 (a silent change to the average return the user typed). The exact mean of exp(sig z) is
//   exp(sig^2/2) * [ u (Phi(t - sig sqrt(rhoP)) + 1 - Phi(t - sig sqrt(rho0))) + (1 - u) ]
// (t = trigger; u = chance that no panic year came before within the hold window, i.e. the panic can only start with this year's own shock); the factor divides by it.
const MC_PN_CACHE=new Map();
function mcPanicNorm(sig, rho0, rhoP, t, u){
  const key=sig+'|'+rho0+'|'+rhoP+'|'+t+'|'+u; let v=MC_PN_CACHE.get(key);
  if(v===undefined){ v=Math.exp(sig*sig/2)*(u*(mcPhi(t-sig*Math.sqrt(rhoP))+1-mcPhi(t-sig*Math.sqrt(rho0)))+(1-u)); if(MC_PN_CACHE.size>500) MC_PN_CACHE.clear(); MC_PN_CACHE.set(key,v); }
  return v;
}

// ── one trial's random draws (all derived from seed + trial index, so scenarios share them) ──
function mcPath(cfg, trial, nYears){
  const base=(cfg.seed>>>0)^Math.imul(trial+1,0x9E3779B1);
  const rngM=mcRng(base), rngL=mcRng(base^0xA5A5A5A5), rngC=mcRng(base^0x5A5A5A5A), rngR=mcRng(base^0x3C3C3C3C);
  const path={};
  // lifespans and LTC are drawn in a fixed order so they never depend on which parts are switched on
  path.u=[0,1].map(()=>({life:rngL(), lifeAge:rngL(), needs:rngC(), dur:mcNormal(rngC), cost:mcNormal(rngC)}));
  const rngI=mcRng(base^0x7F7F7F7F);
  path.zMkt=new Float64Array(nYears); path.zRe=new Float64Array(nYears); path.zInf=new Float64Array(nYears+2);
  for(let k=0;k<nYears;k++){ path.zMkt[k]=mcNormal(rngM); path.zRe[k]=mcNormal(rngR); }
  for(let k=0;k<nYears+2;k++) path.zInf[k]=mcNormal(rngI);
  // Panic years (correlation convergence): a year is a panic year if the market shock is below `trigger` sigmas in it or in one of the previous holdYears-1 years.
  // Depends on the pre-drawn market shocks only, so mcFactor stays a pure function of (key, k) within the trial.
  path.panic=null;
  const PN=cfg.returns&&cfg.returns.enabled&&cfg.returns.panic;
  if(PN&&PN.enabled){ const hold=Math.max(1,Math.round(Number(PN.holdYears)||1)); path.panic=new Uint8Array(nYears); let last=-1e9; for(let k=0;k<nYears;k++){ if(path.zMkt[k]<PN.trigger) last=k; path.panic[k]=(k-last<hold)?1:0; } }
  path.idio={}; path.cfg=cfg; path.trial=trial; path.base=base; path.nYears=nYears;
  return path;
}
// Mean-1 lognormal multiplier for one asset in one year. Idiosyncratic part is a pure function of (key, k, trial).
function mcFactor(path, key, k){
  const R=path.cfg.returns;
  if(k>=path.nYears) k=path.nYears-1;
  const isRe=(key.charCodeAt(0)===114 && key.charCodeAt(1)===101) || key.indexOf('|re:')>0;   // 're:…' (household) or '<source id>|re:…' (an inheritance source's property)
  const sig=(isRe?R.volRE:R.volEquity)/100;
  let idio=path.idio[key];
  if(!idio){ const r=mcRng(path.base^mcHash(key)); idio=path.idio[key]=new Float64Array(path.nYears); for(let i=0;i<path.nYears;i++) idio[i]=mcNormal(r); }
  const rho0=isRe?0:Math.max(0,Math.min(1,R.rho)), PN=path.panic?R.panic:null;
  if(PN&&(!isRe||PN.includeRE)){
    // correlation convergence: rho_k jumps to the panic level in a panic year (never below the normal level); property is tied to the market only in a panic
    const rhoP=Math.max(rho0,Math.min(1,isRe?PN.rhoRE:PN.rhoPanic)), rho=path.panic[k]?rhoP:rho0;
    const z=Math.sqrt(rho)*path.zMkt[k]+Math.sqrt(1-rho)*(isRe?path.zRe[k]:idio[k]);
    const hold=Math.max(1,Math.round(Number(PN.holdYears)||1)), p=mcPhi(PN.trigger), u=Math.pow(1-p,Math.min(k,hold-1));
    return Math.exp(sig*z)/mcPanicNorm(sig,rho0,rhoP,PN.trigger,u);
  }
  const z=isRe?path.zRe[k]:(Math.sqrt(rho0)*path.zMkt[k]+Math.sqrt(1-rho0)*idio[k]);
  return Math.exp(sig*z-sig*sig/2);
}

// Inflation path for one trial: pi[k] = rate of year k, cpi[k] = price level at the start of year k (relative to today).
function mcInflation(path, mean){
  const I=path.cfg.inflation, n=path.nYears+2, pi=new Float64Array(n), cpi=new Float64Array(n+1);
  const sd=I.sigma/100, lo=I.min/100, hi=I.max/100; let prev=mean; cpi[0]=1;
  for(let k=0;k<n;k++){ let v=mean+I.phi*(prev-mean)+sd*path.zInf[k]; v=Math.min(hi,Math.max(lo,v)); pi[k]=v; prev=v; cpi[k+1]=cpi[k]*(1+v); }
  return {pi,cpi};
}

// One person's Long Term Care draw from their stored uniforms/normals: {start age, years of care, annual cost}. Care ends at passing.
// Shared by the household's own people and by an inheritance's source plan, so both follow the same rules.
function mcLtcDraw(u, L, pass, cur, baseCost){
  const minStart=Math.max(L.minStartAge||65, Math.ceil(cur)+1);   // care before 65 is too rare to model; nobody who passes before then needs it
  if(u.needs<L.prob && pass>minStart){
    const yrs=Math.max(0.5, L.medianYears*Math.exp(L.yearsSigma*u.dur));
    const start=Math.min(pass-1, Math.max(minStart, Math.round(pass-yrs)));
    return {start, years:pass-start, cost:baseCost*Math.exp(L.costSigma*u.cost-L.costSigma*L.costSigma/2)};
  }
  return {start:200, years:0, cost:baseCost};
}
// A passing age from a stored uniform (Gompertz, conditional on being alive at `age`).
function mcPassFromU(age, M, uLife){
  const x=age+M.scale*Math.log(1-Math.log(Math.max(1e-12,uLife))*Math.exp((M.mode-age)/M.scale));
  return Math.max(Math.floor(age)+1, Math.min(110, Math.round(x)));
}

// ── the state changes for one trial, applied to the temporary clone ──
function mcApply(s, cfg, path, info){
  const married=s.filingStatus==='married';
  const people=married?s.people:[s.people[0]];
  if(cfg.mortality.enabled){
    people.forEach((p,i)=>{
      const pass=mcPassFromU(currentAge(p), cfg.mortality, path.u[i].life);
      s.passing[p.id]=pass; info.pass[i]=pass;
    });
  } else people.forEach((p,i)=>{ info.pass[i]=s.passing[p.id]!=null?s.passing[p.id]:95; });
  if(cfg.ltc.enabled){
    s.ltc.enabled=true;
    people.forEach((p,i)=>{
      const base=(s.ltc.people[i]&&s.ltc.people[i].cost)||100000;
      const d=mcLtcDraw(path.u[i], cfg.ltc, info.pass[i], currentAge(p), base);
      s.ltc.people[i]={startAge:d.start, cost:d.cost}; info.ltcYears[i]=d.years;
    });
  }
  mcApplyInheritance(s,cfg,path,info);
}

// ── random inheritance ──
// Last row (0 = this year) in which somebody is alive, given each person's passing age — the same rule the engine and the importer use.
function mcDonorLastRow(people, passes){ let K=0; people.forEach((p,i)=>{ K=Math.max(K,Math.ceil(passes[i]-currentAge(p))-1); }); return Math.max(0,K); }

// One inheritance source in one trial: the year it arrives and each asset's value relative to the source plan's own figure (1 = as planned).
// A random part that is switched off uses the plan's own number for the donor, so with every part off every factor is exactly 1.
function mcDonorOutcome(cfg, path, src){
  const D=src.donor, keys=Object.keys(D.traj), scenarioPass=D.people.map(p=>p.passing);
  const rng=mcRng(path.base^mcHash('donor:'+src.id));
  const u=D.people.map(()=>({life:rng(), needs:rng(), dur:mcNormal(rng), cost:mcNormal(rng)}));
  const pass=cfg.mortality.enabled?D.people.map((p,i)=>mcPassFromU(currentAge(p),cfg.mortality,u[i].life)):scenarioPass.slice();
  const Kp=mcDonorLastRow(D.people,scenarioPass), Ks=mcDonorLastRow(D.people,pass);
  // donor's Long Term Care: the plan's own (cost × years from its start age to passing) or a random draw of the same shape
  let drainP=0, drainS=0;
  D.people.forEach((p,i)=>{
    const scenarioYears=(pp)=>D.ltcOn&&p.ltc.cost>0?p.ltc.cost*Math.max(0,pp-p.ltc.startAge):0;   // the plan's rule: from its start age until the passing
    drainP+=scenarioYears(scenarioPass[i]);
    if(cfg.ltc.enabled){ const d=mcLtcDraw(u[i],cfg.ltc,pass[i],currentAge(p),p.ltc.cost>0?p.ltc.cost:0); drainS+=d.cost*d.years; }
    else drainS+=scenarioYears(pass[i]);   // care not random: the plan's rule still ends at the DRAWN passing (no care bill for a donor who passes before the start age)
  });
  // the household's own market shocks up to the donor's last year (so a bad market hits both), per asset
  const shock={};
  keys.forEach(k=>{ let f=1; if(cfg.returns.enabled) for(let j=0;j<=Ks;j++) f*=mcFactor(path,src.id+'|'+k,j); shock[k]=f; });
  const values=(K,sh,drain)=>{
    const out={}; let liq=0;
    keys.forEach(k=>{ const t=D.traj[k], x=t.v[Math.max(0,Math.min(t.v.length-1,THIS_YEAR+K-D.year0))]*(sh?sh[k]:1); out[k]=x; if(t.cls==='eq') liq+=x; });
    const dl=liq>0?Math.min(1,drain/liq):0;               // care costs are paid from the liquid assets, pro rata; property is untouched
    keys.forEach(k=>{ if(D.traj[k].cls==='eq') out[k]*=1-dl; });
    return out;
  };
  const vp=values(Kp,null,drainP), vs=values(Ks,shock,drainS), keep=1-Math.max(0,Math.min(100,Number(cfg.inheritance.haircutPct)||0))/100, f={};
  keys.forEach(k=>{ const e=src.assets.find(a=>a.key===k), denom=vp[k]>1?vp[k]:Math.max(1,(e&&e.value)||1); f[k]=vs[k]/denom*keep; });
  return {startYear:THIS_YEAR+Ks+1, plannedYear:THIS_YEAR+Kp+1, f, pass};
}

// Apply it to the trial's copy of the plan: every asset created from the source gets its balance scaled and its start year (and, if untouched, start age) moved.
function mcApplyInheritance(s, cfg, path, info){
  if(!cfg.inheritance||!cfg.inheritance.enabled) return;
  s.people.forEach(p=>{
    ((p.inheritance&&p.inheritance.sources)||[]).forEach(src=>{
      if(!src.donor||!src.donor.traj||!src.donor.people||!src.donor.people.length) return;
      const out=mcDonorOutcome(cfg,path,src), shift=out.startYear-out.plannedYear, file=String(src.file).toLowerCase();
      let touched=false;
      ['brokerage','realEstate','inhIras'].forEach(L=>(p[L]||[]).forEach(it=>{
        if(!it||!it.inh||String(it.inh.file).toLowerCase()!==file) return;
        const f=out.f[it.inh.key]; if(f===undefined) return;
        const was=Number(it.balance)||0;
        it.balance=Math.round(was*f); if(L==='realEstate') it.basis=Math.round((Number(it.basis)||0)*f);
        it.startYear=(Number(it.startYear)||Number(src.startYear)||THIS_YEAR)+shift;
        // a portfolio's start age is the age it was inherited, unless the user changed it
        if(L==='brokerage'&&it.ar&&it.ar.startMode==='custom'&&it.inh.base&&JSON.stringify(it.ar)===JSON.stringify(it.inh.base.ar)) it.ar.startVal=Number(it.ar.startVal)+shift;
        info.inh.orig+=was; info.inh.now+=it.balance; touched=true;
      }));
      if(touched){ info.inh.n++; info.inh.shift=info.inh.shift==null?shift:Math.max(info.inh.shift,shift); }   // shift = latest arrival across sources
    });
  });
}

// ── numbers pulled from one projection ──
function mcMeasure(proj, info){
  const rows=proj.rows, n=rows.length;
  const fin=new Float64Array(n), re=new Float64Array(n);
  let failK=-1, shortfall=0, lifeTax=0, irmaaMax=0, convTotal=0;
  for(let k=0;k<n;k++){
    const r=rows[k]; let f=0, h=0;
    (r.portfoliosByPerson||[]).forEach(l=>l.forEach(e=>{ if(e&&e.balance>0) f+=e.balance; }));
    (r.iraBalByPerson||[]).forEach(v=>{ f+=v||0; }); (r.rothBalByPerson||[]).forEach(v=>{ f+=v||0; });
    (r.inhIraByPerson||[]).forEach(l=>l.forEach(e=>{ if(e&&e.live) f+=e.balance||0; }));
    (r.realEstateByPerson||[]).forEach(l=>l.forEach(e=>{ if(e&&e.balance>0) h+=e.balance; }));
    fin[k]=f; re[k]=h;
    if(r.expUnfunded>1){ shortfall+=r.expUnfunded; if(failK<0) failK=k; }
    lifeTax+=r.totalTax||0; if((r.irmaaSurcharge||0)>irmaaMax) irmaaMax=r.irmaaSurcharge; convTotal+=r.rothConvTotal||0;
  }
  // Spending guardrails (rows carry `guard` only when state.guardrail is on): how often and how deep the scenario had to cut, and the living-expense path.
  let guardM=null;
  if(rows[0]&&rows[0].guard){
    const liv=new Float64Array(n); let firstCutK=-1, minMult=1, cutYears=0, cutTotal=0, firstCutBal=null;
    for(let k=0;k<n;k++){
      const g=rows[k].guard; liv[k]=rows[k].expLiving||0;
      if(g.mult<1){ cutYears++; cutTotal+=g.cutAmt; if(g.mult<minMult) minMult=g.mult; }
      if(g.move<0&&firstCutK<0){ firstCutK=k; firstCutBal=g.bal0; }
    }
    guardM={liv, firstCutK, firstCutAge:firstCutK>=0?rows[0].age0+firstCutK:null, firstCutBal, minMult, cutYears, cutTotal};
  }
  const last=n-1, fr=failK>=0?rows[failK]:null;
  return {ltcAtFail:!!fr&&(((fr.expLtc||0)-(fr.expMed||0))>0||(fr.ltcStarted||0)>0), singleAtFail:!!fr&&fr.filing==='single', n, age0:rows[0].age0, fin, re, failK, failAge:failK>=0?rows[failK].age0:null, shortfall, lifeTax, irmaaMax, convTotal,
          estateFin:fin[last], estateRe:re[last], estateIra:(rows[last].iraBalByPerson||[]).reduce((a,v)=>a+(v||0),0), pass:info.pass.slice(), ltcYears:info.ltcYears.slice(),
          guard:guardM,           inhN:info.inh?info.inh.n:0, inhShift:info.inh&&info.inh.shift!=null?info.inh.shift:0, inhRatio:info.inh&&info.inh.orig>0?info.inh.now/info.inh.orig:1};
}

// Run ONE trial. `mutate(s)` (optional) changes the cloned state first — used for what-if sweeps on the same random paths.
// `capture` (optional object) is filled with what a replay needs: the full projection, the trial's own copy of the scenario (its drawn lifespans / care / inheritance),
// the inflation path and the draws. Same seed + trial index = the same trial, so a failed trial is replayed rather than stored (see mcReplayTrial).
// `stress` (optional, the Stress test card's "run with Monte Carlo"): {scen, start, share} from compute/stressTest.js. INSIDE the scenario's years the stress test is in full control of returns and
// inflation, exactly as in the plain stress test (stRun): its stock return (equityShare % of every non-property asset; the rest, and property, keep the plan's own rate) and its inflation (the
// scenario's own, or the plan's constant rate when the scenario defines none) REPLACE the random ones. Before and after those years the trial's random returns and inflation apply as set on the
// Monte Carlo card, and everything else (lifespans, care, inheritance) stays random. With every random part off the trial equals stRun(scen, start) exactly.
// Inflation path of a stress trial: the scenario's years carry the scenario's inflation (or the plan's constant rate), every other year the trial's own (`infl`, null = the plan's constant rate).
function mcStressInflation(st, infl, mean, n){
  const S=st.scen, L=S.eq.length;
  const pi=new Float64Array(n), cpi=new Float64Array(n+1); cpi[0]=1;
  for(let k=0;k<n;k++){ const j=k-st.start; pi[k]=(j>=0&&j<L)?(S.infl&&j<S.infl.length?S.infl[j]:mean):(infl?infl.pi[k]:mean); cpi[k+1]=cpi[k]*(1+pi[k]); }
  return {pi,cpi};
}
function mcRunTrial(cfg, trial, mutate, capture, stress){
  const nYears=70, path=mcPath(cfg,trial,nYears), info={pass:[0,0],ltcYears:[0,0],inh:{n:0,shift:null,orig:0,now:0}};
  return withTempState(s=>{ if(mutate) mutate(s); mcApply(s,cfg,path,info); }, ()=>{
    const mean=state.inflation; let infl=(cfg.inflation&&cfg.inflation.enabled)?mcInflation(path,mean):null;
    if(stress) infl=mcStressInflation(stress,infl,mean,nYears+2);
    const sShare=stress?Math.max(0,Math.min(1,(Number(stress.share)||0)/100)):0;
    MC_HOOK=(cfg.returns.enabled||infl||stress)?((g,key,k,ch)=>{
      if(stress){   // inside the scenario's years the stress test's own returns and inflation apply, with nothing random (same arithmetic as stHook in compute/stressTest.js)
        const j=k-stress.start;
        if(j>=0&&j<stress.scen.eq.length){
          const pi=infl.pi[k], nominalFixed=!!ch&&(ch.mode==='fixed'||ch.mode==='custom');
          const scenarioNom=nominalFixed?(1+g)*(1+mean)-1:(1+g)*(1+pi)-1;      // the nominal rate the scenario means: fixed / custom are nominal, inflation ± x follows the year's inflation
          const nom=(key.charCodeAt(0)===114&&key.charCodeAt(1)===101)?scenarioNom:sShare*stress.scen.eq[j]+(1-sShare)*scenarioNom;   // 're:…' (property) keeps the plan's own rate
          return (1+nom)/(1+pi)-1;
        }
      }
      // a nominal-fixed rate ('fixed' / 'custom') is worth more or less in today's $ when the year's inflation differs from the plan's
      if(infl&&ch&&(ch.mode==='fixed'||ch.mode==='custom')) g=(1+g)*(1+mean)/(1+infl.pi[k])-1;
      return cfg.returns.enabled?(1+g)*mcFactor(path,key,k)-1:g;
    }):null;
    MC_INFL=infl; REC_RATES=!!capture;   // only a replay records each asset's yearly rate (the Market return chart)
    try{
      const proj=computeProjection();
      const m=mcMeasure(proj, info), sg=cfg.returns.volEquity/100;
      if(capture){ capture.proj=proj; capture.state=state; capture.info=info; capture.infl=infl; capture.meanInfl=mean; capture.trial=trial; }
      let c=0; for(let k=0;k<10;k++) c+=sg*path.zMkt[k]-sg*sg/2;   // log of the market factor compounded over the first 10 years (0 = as expected)
      m.early10=cfg.returns.enabled?c:0;
      m.panicOn=!!path.panic; m.panic10=0; if(path.panic) for(let k=0;k<10;k++) m.panic10+=path.panic[k];   // panic years among the first 10
      m.inflRatio15=infl?infl.cpi[15]/Math.pow(1+mean,15):1;      // price level after 15 years vs. the plan's constant rate (1 = as planned, 1.15 = 15% higher)
      return m;
    } finally{ MC_HOOK=null; MC_INFL=null; REC_RATES=true; }
  });
}

// Replay one trial in full: {measure, proj, state, info, infl, meanInfl, trial}. `state` is the trial's private copy of the scenario (the real scenario is untouched).
function mcReplayTrial(cfg, trial){ const cap={}; cap.measure=mcRunTrial(cfg,trial,null,cap); return cap; }

// Run a batch of trials [from, to). Synchronous; the caller chunks it to keep a UI responsive (or runs several chunks in workers).
function mcRunRange(cfg, from, to, mutate){ const out=[]; for(let t=from;t<to;t++) out.push(mcRunTrial(cfg,t,mutate)); return out; }

// ── summary statistics ──
function mcQuantile(sortedArr, q){ const n=sortedArr.length; if(!n) return NaN; const x=(n-1)*q, lo=Math.floor(x), hi=Math.ceil(x); return sortedArr[lo]+(sortedArr[hi]-sortedArr[lo])*(x-lo); }
function mcSummarize(results){
  const N=results.length, maxN=Math.max(...results.map(r=>r.n));
  const age0=results[0].age0;
  const fail=results.filter(r=>r.failK>=0);
  const fanQ=[0.1,0.25,0.5,0.75,0.9], fan=fanQ.map(()=>new Array(maxN).fill(null)), alive=new Array(maxN).fill(0), fundedThrough=new Array(maxN).fill(0);
  for(let k=0;k<maxN;k++){
    const col=[]; let ok=0;
    for(const r of results){ if(k<r.n) col.push(r.fin[k]+r.re[k]); if(r.failK<0||r.failK>k) ok++; }
    alive[k]=col.length/N; fundedThrough[k]=ok/N;
    if(col.length>=Math.max(20,N*0.05)){ col.sort((a,b)=>a-b); fanQ.forEach((q,qi)=>{ fan[qi][k]=mcQuantile(col,q); }); }
  }
  const estate=results.map(r=>r.estateFin+r.estateRe).sort((a,b)=>a-b);
  const tax=results.map(r=>r.lifeTax).sort((a,b)=>a-b);
  const failAges=fail.map(r=>r.failAge).sort((a,b)=>a-b);
  // Spending guardrails: share of trials that had to cut, when, how deep, and the fan of the living-expense path (today's $).
  let guard=null;
  const gr=results.filter(r=>r.guard);
  if(gr.length){
    const cut=gr.filter(r=>r.guard.firstCutK>=0), ages=cut.map(r=>r.guard.firstCutAge).sort((x,y)=>x-y);
    const depth=gr.map(r=>1-r.guard.minMult).sort((x,y)=>x-y), tot=gr.map(r=>r.guard.cutTotal).sort((x,y)=>x-y), yrs=gr.map(r=>r.guard.cutYears).sort((x,y)=>x-y);
    const livFan=[0.1,0.5,0.9].map(()=>new Array(maxN).fill(null));
    for(let k=0;k<maxN;k++){ const col=[]; for(const r of gr) if(k<r.n) col.push(r.guard.liv[k]); if(col.length>=Math.max(20,N*0.05)){ col.sort((x,y)=>x-y); [0.1,0.5,0.9].forEach((q,qi)=>{ livFan[qi][k]=mcQuantile(col,q); }); } }
    guard={n:gr.length, pCut:cut.length/gr.length, medianFirstCutAge:ages.length?mcQuantile(ages,0.5):null, medianDepth:mcQuantile(depth,0.5), p90Depth:mcQuantile(depth,0.9),
           medianCutYears:mcQuantile(yrs,0.5), medianCutTotal:mcQuantile(tot,0.5), p90CutTotal:mcQuantile(tot,0.9), pCutOver25:depth.filter(d=>d>=0.25).length/depth.length, livFan};
  }
  const panic=results.some(r=>r.panicOn)?{pFirst10:results.filter(r=>r.panic10>0).length/N, meanFirst10:results.reduce((a,r)=>a+r.panic10,0)/N}:null;
  return {N, age0, successRate:1-fail.length/N, failCount:fail.length,
          medianFailAge:failAges.length?mcQuantile(failAges,0.5):null,
          estate:{p10:mcQuantile(estate,0.1),p25:mcQuantile(estate,0.25),p50:mcQuantile(estate,0.5),p75:mcQuantile(estate,0.75),p90:mcQuantile(estate,0.9)},
          lifetimeTax:{p50:mcQuantile(tax,0.5),p90:mcQuantile(tax,0.9)},
          medianShortfall:fail.length?mcQuantile(fail.map(r=>r.shortfall).sort((a,b)=>a-b),0.5):0,
          guard, panic, fanQ, fan, alive, fundedThrough, estateSorted:estate};
}
// Why did trials run short? Two views:
//  primary: each failing trial gets ONE cause, by what was happening in the year the money ran short (first match wins):
//           LTC costs running -> a survivor household -> weak first-10-year returns -> a very long life -> other.
//  factors: for each risk factor, the share of failures that had it and the failure rate with vs. without it (all trials),
//           which shows what actually drives failure rather than what merely coincides with it.
function mcFailureReasons(results){
  const N=results.length, F=results.filter(r=>r.failK>=0), nf=F.length;
  const e=results.map(r=>r.early10).sort((a,b)=>a-b), cut=mcQuantile(e,0.25);
  const firstDeath=r=>Math.min(...r.pass), lastDeath=r=>Math.max(...r.pass);
  const ic=mcQuantile(results.map(r=>r.inflRatio15).sort((a,b)=>a-b),0.75), highInf=r=>r.inflRatio15>=ic&&ic>1.001;
  const primaryOf=r=>r.ltcAtFail?'ltc':r.singleAtFail?'survivor':(r.early10<=cut&&cut<0?'returns':(highInf(r)?'inflation':(lastDeath(r)>=92?'longlife':'other')));
  const labels={ltc:'Long Term Care costs were running when the money ran out', survivor:'Survivor household after the first passing (income falls, spending does not)',
                returns:'Weak market returns in the first 10 years (worst quarter of trials)', inflation:'High inflation over the first 15 years (worst quarter of trials)', longlife:'A very long life (last passing at 92 or later)', other:'Other'};
  const prim={}; Object.keys(labels).forEach(k=>prim[k]={key:k,label:labels[k],count:0,shorts:[]});
  F.forEach(r=>{ const c=prim[primaryOf(r)]; c.count++; c.shorts.push(r.shortfall); });
  const primary=Object.values(prim).filter(x=>x.count>0).map(x=>({key:x.key,label:x.label,count:x.count,share:nf?x.count/nf:0,medianShortfall:mcQuantile(x.shorts.sort((a,b)=>a-b),0.5)})).sort((a,b)=>b.count-a.count);
  const defs=[
    ['Any Long Term Care',           r=>r.ltcYears.some(y=>y>0)],
    ['Long Term Care of 4+ years',   r=>Math.max(...r.ltcYears)>=4],
    ['First passing before 80',      r=>firstDeath(r)<80],
    ['Weak first 10 years of returns',r=>r.early10<=cut&&cut<0],
    ['High inflation, first 15 years',r=>highInf(r)],
    ['Last passing at 92 or later',  r=>lastDeath(r)>=92]
  ];
  if(results.some(r=>r.panicOn)) defs.splice(4,0,['A market panic in the first 10 years (correlations surge)',r=>r.panic10>0]);
  if(results.some(r=>r.inhN>0)) defs.splice(5,0,['Inheritance 3+ years late or 25%+ smaller',r=>r.inhN>0&&(r.inhShift>=3||r.inhRatio<=0.75)]);
  const factors=defs.map(([label,pred])=>{
    const has=results.filter(pred), hasF=has.filter(r=>r.failK>=0).length, no=N-has.length, noF=nf-hasF;
    return {label, prevalence:has.length/N, shareOfFailures:nf?hasF/nf:0, failRateWith:has.length?hasF/has.length:0, failRateWithout:no?noF/no:0};
  });
  // Every failed trial, earliest failure first (ties: larger shortfall first). `trial` is the 0-based trial index = the index into `results`, so mcReplayTrial(cfg, trial) reruns it.
  const shortLbl={ltc:'LTC costs',survivor:'survivor household',returns:'weak early returns',inflation:'high inflation',longlife:'very long life',other:'other'};
  const list=[]; results.forEach((r,i)=>{ if(r.failK>=0){ const c=primaryOf(r); list.push({trial:i, failAge:r.failAge, shortfall:r.shortfall, cause:c, causeShort:shortLbl[c]}); } });
  list.sort((a,b)=>a.failAge-b.failAge||b.shortfall-a.shortfall||a.trial-b.trial);
  return {nFail:nf, primary, factors, list};
}

if(typeof module!=='undefined') module.exports={mcPhi,mcPanicNorm,MC_DEFAULTS,mcRng,mcNormal,mcSampleDeathAge,mcSurvival,mcPath,mcFactor,mcInflation,mcDonorOutcome,mcRunTrial,mcReplayTrial,mcRunRange,mcSummarize,mcFailureReasons,mcQuantile};
