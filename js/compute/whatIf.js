'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / WHAT-IF ENGINE — runs computeProjection() against a
// temporary clone of state (without disturbing the real state or
// the on-screen forms), used by the SS claim-age comparison chart.
// ═══════════════════════════════════════════════════════════════
function pickIdxP0FromState(s){
  if(s.filingStatus!=='married') return 0;
  return currentAge(s.people[0])>=currentAge(s.people[1])?0:1;
}
function withTempState(mutate, run){
  const backup=state;
  state=JSON.parse(JSON.stringify(backup));
  try{ mutate(state); return run(); }
  finally{ state=backup; }
}

function computeSSScenario(p0ClaimAge){
  return withTempState(s=>{
    const idxP0=pickIdxP0FromState(s);
    const married=s.filingStatus==='married';
    const people=married?s.people:[s.people[0]];
    const p0=people[idxP0];
    if(!p0.ss.started) p0.ss.claimAge=p0ClaimAge;
  }, ()=>{
    const proj=computeProjection();
    let cum=0; const ages=[],cumulative=[],perYear=[];
    const ssByAge={}; // rounded age0 -> per-person monthly SS at that age
    proj.rows.forEach(r=>{
      cum+=r.totalSS; ages.push(r.age0); cumulative.push(cum); perYear.push(r.totalSS);
      ssByAge[Math.round(r.age0)]=r.ssByPerson.map(v=>v/12);
    });
    const p0=proj.people[proj.idxP0];
    const monthly = p0.ss.started ? p0.ss.pia : p0.ss.pia*ssOwnFactor(p0ClaimAge, p0.ss.fra);
    return{ages,cumulative,perYear,totalHousehold:cum,monthly,started:p0.ss.started,
      ssByAge, idxP0:proj.idxP0, married:proj.married,
      peopleNames:proj.people.map((pp,i)=>displayPersonName(pp,i))};
  });
}
function ssROI(perYearCand, perYearBase){
  const n=Math.min(perYearCand.length, perYearBase.length);
  const deltas=[]; for(let k=0;k<n;k++) deltas.push(perYearCand[k]-perYearBase[k]);
  const npv=r=>deltas.reduce((s,d,k)=>s+d/Math.pow(1+r,k),0);
  let lo=-0.5,hi=1.0;
  if(npv(lo)*npv(hi)>0) return null;
  for(let i=0;i<80;i++){ const mid=(lo+hi)/2; (npv(mid)*npv(lo)<0)?(hi=mid):(lo=mid); }
  return (lo+hi)/2;
}
