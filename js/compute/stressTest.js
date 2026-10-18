'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / STRESS TESTS — deterministic "what if the worst decade came first" scenarios.
// No DOM. Loaded after monteCarlo.js (uses withTempState, mcMeasure, MC_HOOK / MC_INFL / REC_RATES from projection.js).
//
// A scenario is a fixed vector of nominal equity returns (and optionally a fixed vector of yearly inflation) that is forced onto the
// plan starting on a chosen year — by default the first year with no wage income ("Day 1 of retirement") — instead of the plan's
// constant growth rates. Everything else (the plan's own passing ages, Social Security, LTC, taxes) is exactly as entered, so the
// result isolates market / inflation risk. It reuses the Monte Carlo hooks, so with the stress off a run equals computeProjection().
//
// Units. The engine works in today's $. A nominal return r in a year with inflation π enters as the real rate (1+r)/(1+π)−1, and the
// scenario's price level is handed to the engine as MC_INFL, so everything that is fixed in nominal dollars (a no-COLA pension,
// un-indexed tax thresholds, cost basis, depreciation) follows the scenario's inflation. Living expenses, Social Security COLA and the
// indexed tax brackets track inflation, i.e. they are constant in today's $ — the same thing as "multiply the expense requirement by
// the elevated inflation rate each year" in nominal terms, while the assets are held flat in nominal terms (real value shrinks).
//
// What is hit: every growing asset except real estate (brokerage, IDGT, pre-tax / Roth / inherited IRA). `equityShare` % of each of
// them earns the scenario's equity return; the rest keeps the plan's own return (nominal, repriced by the scenario's inflation
// for 'inflation ± x%' growth, which keeps its real rate). Real estate keeps the plan's own rate.
//
// Data: S&P 500 total return (Damodaran, NYU Stern, "Historical Returns on Stocks, Bonds and Bills") and CPI-U December-to-December
// change (BLS), in %. Rounded as published; calendar years.
// ═══════════════════════════════════════════════════════════════

const ST_HIST={
  lost:  {from:2000, eq:[-9.03,-11.85,-21.97,28.36,10.74,4.83,15.61,5.48,-36.55,25.94],                                 cpi:[3.4,1.6,2.4,1.9,3.3,3.4,2.5,4.1,0.1,2.7]},
  y1966: {from:1966, eq:[-9.97,23.80,10.81,-8.24,3.56,14.22,18.76,-14.31,-25.90,37.00,23.83,-6.98,6.51,18.52,31.74,-4.70], cpi:[3.5,3.0,4.7,6.2,5.6,3.3,3.4,8.7,12.3,6.9,4.9,6.7,9.0,13.3,12.5,8.9]}
};

const ST_DEFAULTS={
  start:{mode:'retire', years:0},                                   // 'retire' = first year without wages (0 if the plan has none), 'now' = this year, 'custom' = `years` from now
  equityShare:100,                                                   // % of each non-property asset that earns the scenario's equity return
  lost:{enabled:true, actualInflation:false},                        // 2000–2009 actual returns; inflation stays the plan's unless actualInflation
  stag:{enabled:true, years:10, eqReturn:0, inflStart:6, inflEnd:11},// synthetic: flat nominal equities, inflation ramping inflStart → inflEnd (linear over `years`)
  y1966:{enabled:true}                                               // 1966–1981 actual returns and CPI
};

// ── scenario definitions ──────────────────────────────────────
// {id, label, note, eq:[nominal yearly equity return as a fraction], infl:[yearly inflation fraction] | null (plan's rate)}
function stScenarios(cfg){
  const pct=a=>a.map(v=>v/100), out=[];
  if(cfg.lost.enabled){
    const H=ST_HIST.lost;
    out.push({id:'lost', label:'Lost Decade ('+H.from+'–'+(H.from+H.eq.length-1)+')', eq:pct(H.eq), infl:cfg.lost.actualInflation?pct(H.cpi):null,
      note:'Actual S&P 500 total returns, '+(cfg.lost.actualInflation?'actual CPI':'the plan\'s own inflation')+'. Compounded nominal return of the decade: '+((H.eq.reduce((a,v)=>a*(1+v/100),1)-1)*100).toFixed(0)+'%.'});
  }
  if(cfg.stag.enabled){
    const S=cfg.stag, n=Math.max(1,Math.round(S.years)), eq=[], infl=[];
    for(let i=0;i<n;i++){ eq.push((Number(S.eqReturn)||0)/100); infl.push(((Number(S.inflStart)||0)+(n>1?(Number(S.inflEnd)-Number(S.inflStart))*i/(n-1):0))/100); }
    out.push({id:'stag', label:'Stagflation ('+n+' yrs, flat stocks, inflation '+S.inflStart+'→'+S.inflEnd+'%)', eq, infl,
      note:'Synthetic: nominal equity return fixed at '+S.eqReturn+'% a year while inflation ramps from '+S.inflStart+'% to '+S.inflEnd+'%; real value of invested assets falls by the inflation rate each year.'});
  }
  if(cfg.y1966.enabled){
    const H=ST_HIST.y1966;
    out.push({id:'y1966', label:'1966 retiree (actual '+H.from+'–'+(H.from+H.eq.length-1)+')', eq:pct(H.eq), infl:pct(H.cpi),
      note:'Actual S&P 500 total returns and CPI, '+H.eq.length+' years: nominal stocks roughly tripled while prices more than tripled, with the 1973–74 crash and double-digit inflation inside it.'});
  }
  return out;
}

// First row in which the household has stopped earning wages ("Day 1 of retirement"); 0 if the plan has no wages at all.
function stRetireRow(proj){
  let last=-1; proj.rows.forEach((r,k)=>{ if((r.wageTotal||0)>0.5) last=k; });
  return last+1;
}
function stStartRow(cfg, baseProj){
  const m=cfg.start.mode;
  if(m==='now') return 0;
  if(m==='custom') return Math.max(0,Math.round(Number(cfg.start.years)||0));
  return stRetireRow(baseProj);
}

// Inflation path for a scenario placed at `start`: {pi, cpi} in the shape the engine expects (pi[k] of row k, cpi[k] = price level at the start of row k).
function stInflation(scen, start, mean, n){
  const pi=new Float64Array(n), cpi=new Float64Array(n+1); cpi[0]=1;
  for(let k=0;k<n;k++){ const j=k-start; pi[k]=(scen.infl&&j>=0&&j<scen.infl.length)?scen.infl[j]:mean; cpi[k+1]=cpi[k]*(1+pi[k]); }
  return {pi,cpi};
}
const ST_NO_SHOCK=key=>key.charCodeAt(0)===114 && key.charCodeAt(1)===101;   // 're:…' (household property) keeps the plan's own rate
// The engine's growth hook for a scenario: g = the plan's real rate, `ch` = the Change spec it came from (see projection.js gk()).
function stHook(scen, start, mean, infl, share){
  const L=scen.eq.length;
  return (g,key,k,ch)=>{
    const pi=infl.pi[k], nominalFixed=!!ch&&(ch.mode==='fixed'||ch.mode==='custom');
    const planNom=nominalFixed?(1+g)*(1+mean)-1:(1+g)*(1+pi)-1;      // nominal rate the plan means: fixed / custom are nominal, inflation ± x follows the year's inflation
    const j=k-start; let nom=planNom;
    if(j>=0&&j<L&&!ST_NO_SHOCK(key)) nom=share*scen.eq[j]+(1-share)*planNom;
    return (1+nom)/(1+pi)-1;
  };
}

// Run the plan under one scenario (or, with scen=null, as entered). Returns the engine's projection plus a short summary.
// `record` (a replay shown in the charts) also records each asset's yearly rate for the Market return chart; batch runs skip it.
function stRun(scen, start, cfg, record){
  const nRows=80;
  return withTempState(()=>{}, ()=>{
    if(scen){
      const mean=state.inflation, infl=stInflation(scen,start,mean,nRows), share=Math.max(0,Math.min(1,(Number(cfg.equityShare)||0)/100));
      MC_HOOK=stHook(scen,start,mean,infl,share); MC_INFL=infl;
    }
    REC_RATES=!!record;
    try{ return computeProjection(); }
    finally{ MC_HOOK=null; MC_INFL=null; REC_RATES=true; }
  });
}

// One scenario in full, for the chart grid (the card's D button): {proj, state (a private copy of the plan), cap-like fields, measure, scen, start}.
function stReplay(cfg, id){
  const baseProj=stRun(null,0,cfg), start=stStartRow(cfg,baseProj), scen=stScenarios(cfg).find(s=>s.id===id);
  if(!scen) return null;
  const proj=stRun(scen,start,cfg,true), measure=mcMeasure(proj,{pass:[0,0],ltcYears:[0,0]});
  return {proj, state:JSON.parse(JSON.stringify(state)), infl:scen.infl?stInflation(scen,start,state.inflation,80):null, meanInfl:state.inflation, scen, start, measure, info:{pass:[0,0],ltcYears:[0,0],inh:{n:0,shift:null,orig:0,now:0}}};
}

// All scenarios against the plan as entered. Returns {start, startAge, base, results:[{id,label,note,m,...}]}.
function stRunAll(cfg){
  const baseProj=stRun(null,0,cfg), start=stStartRow(cfg,baseProj), base=mcMeasure(baseProj,{pass:[0,0],ltcYears:[0,0]});
  const results=stScenarios(cfg).map(sc=>{
    const proj=stRun(sc,start,cfg), m=mcMeasure(proj,{pass:[0,0],ltcYears:[0,0]});
    const end=Math.min(start+sc.eq.length-1, m.n-1, base.n-1);                      // last row of the shock
    const atEnd=start<=end?m.fin[end]:null, planAtEnd=start<=end?base.fin[end]:null;
    let low=Infinity, lowK=-1; for(let k=Math.min(start,m.n-1);k<m.n;k++) if(m.fin[k]<low){ low=m.fin[k]; lowK=k; }
    let gapYears=0; proj.rows.forEach(r=>{ if(r.expUnfunded>1) gapYears++; });
    return {id:sc.id, label:sc.label, note:sc.note, years:sc.eq.length, m, atEnd, planAtEnd, low:isFinite(low)?low:null, lowAge:lowK>=0?m.age0+lowK:null, gapYears,
            estate:m.estateFin+m.estateRe, covered:start<m.n};
  });
  return {start, startAge:baseProj.rows[0].age0+start, startCovered:start<baseProj.rows.length, base, baseEstate:base.estateFin+base.estateRe, results};
}

if(typeof module!=='undefined') module.exports={ST_HIST,ST_DEFAULTS,stScenarios,stRetireRow,stStartRow,stInflation,stHook,stRun,stReplay,stRunAll};
