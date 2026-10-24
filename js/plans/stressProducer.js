'use strict';
// ═══════════════════════════════════════════════════════════════
// PLANS / PRODUCER — stress test results. One plan per scenario row. Sources (each its own owner, so each is cleared and tombstoned on its own):
//   the Stress test card (display/stressPanel.js, `stResults`)  → keys 'st:<scenarioId>'
//   the tool-started stress run (compute/runJobs.js, RJ_STRESS)  → keys 'stl:<scenarioId>'   (registered by plans/jobsProducer.js)
// A stress plan is the plan it was run on plus a market overlay: {baseKey, baseFingerprint, overlay:{type:'stress', …}}. The run's own plan key gives the base fingerprint, so a plan
// made before an edit is still created (stale) if the store first sees it after the edit; staleness is plan-on-screen ≠ plan-it-was-run-on (plIsStale).
// The shock figures of the row (investable assets at the end of the shock, lowest point, guardrail effect …) ride along as plan.meta, and the summary is seeded from the
// row's own measure, so reading a stress plan never re-runs the engine.
// Delete: a derived plan is hidden (tombstone) until its card is run again; the card's results are not touched.
// ═══════════════════════════════════════════════════════════════
const PL_ST_SOURCES=[];
function plRegisterStressSource(fn){ PL_ST_SOURCES.push(fn); }
// A seed summary from an engine measure `m` (compute/monteCarlo.js mcMeasure): same shape as plSummarize, KPIs as the registry derives them from a measure
// (peak one-year tax and lifetime Social Security are not kept in a measure, so they are absent).
function plSeedFromMeasure(m,gapYears){
  if(typeof rrKpisFromMeasure!=='function'||!m||!m.fin) return null;
  const R=Math.round;
  return {kpis:rrKpisFromMeasure(m,gapYears), age0:m.age0, n:m.n, fin:Array.from(m.fin,R), re:Array.from(m.re,R), failAge:m.failAge==null?null:R(m.failAge), shortfall:R(m.shortfall), lifeTax:R(m.lifeTax), draws:null, partial:true};
}
function plSyncStress(){
  PL_ST_SOURCES.forEach(src=>{
    const d=src(); if(!d) return;                                  // source not present in this host
    const sr=d.sr;
    if(!sr||!sr.results){ plReconcile(d.owner,[],{token:null}); return; }
    const base=plBaseFor(sr.planKey); if(!base) return;
    const scens=stScenarios(sr.cfg), specs=[];
    sr.results.forEach(r=>{
      const sc=scens.find(s=>s.id===r.id); if(!sc) return;
      specs.push({key:d.prefix+':'+r.id, label:r.label,
        origin:{kind:'stress',groupId:d.prefix,ref:{scenarioId:r.id,custom:!!r.custom}},
        input:{baseKey:base.baseKey,baseFingerprint:base.baseFingerprint,
          overlay:{type:'stress',scenarioId:r.id,eq:sc.eq,infl:sc.infl,path:sc.path||null,start:r.start,share:r.share/100}},
        meta:{source:d.source||(r.custom?'user':'builtin'),startMode:sr.cfg.start&&sr.cfg.start.mode,equityShare:sr.cfg.equityShare,gapYears:r.gapYears,
          row:{years:r.years,start:r.start,share:r.share,atEnd:r.atEnd,planAtEnd:r.planAtEnd,low:r.low,lowAge:r.lowAge,covered:r.covered,guard:r.guard||null,age0:r.m.age0}},
        summary:()=>plSeedFromMeasure(r.m,r.gapYears)});
    });
    plReconcile(d.owner,specs,{token:sr});
  });
}
plRegisterStressSource(()=>typeof stResults==='undefined'?null:{owner:'stress',prefix:'st',sr:stResults,source:null});
plRegisterProducer('stress',plSyncStress,{remove(p){ plTombstone(p.owner,p.key); return {ok:true,note:'hidden until the stress tests are run again'}; }});
// the tool run has its own owner name; deleting from it behaves the same
plRegisterProducer('stressTool',()=>{},{remove(p){ plTombstone(p.owner,p.key); return {ok:true,note:'hidden until the stress tests are run again'}; }});
