'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / DONOR TRAJECTORY — what the Monte Carlo simulation needs to know about an inheritance's SOURCE plan.
//
// Importing a plan file (input/inheritance.js) or receiving a live-link snapshot (input/liveLink.js) normally yields only the value of each asset at the
// source plan's own last passing. A Monte Carlo trial draws a different last-passing year, so it also needs each asset's value in every other year.
// buildDonorBlock() captures that, once, at import time:
//
//   { v:1, year0, filing, inflation,
//     people:[{birthYear, birthMonth, passing, ltc:{startAge,cost}}],     // what a lifespan / LTC draw needs (no names)
//     ltcOn,                                                              // was the source plan's own LTC switched on
//     traj:{ [assetKey]:{cls:'eq'|'re', v:[value at the END of row k, k=0…]} } }   // same formula as the importer's `value`, today's $
//
// How the table is made: the source plan is run once more on a private copy with its Long Term Care OFF (a trial draws its own LTC; counting the plan's
// as well would double it) and with the person who passes LAST (by calendar year) kept alive to DONOR_MAX_AGE (so any drawn lifespan has a value). Everything before the last
// passing — including the first passing's survivor effects — stays as planned, so for a source plan without LTC the table at the plan's own last-passing
// row equals the importer's value exactly (tests/mc_inherit_test.js checks that).
// Pure compute: reads the source plan it is given, never the app's own `state` (it swaps `state` for a copy while it runs, as inhExtractFromState does).
// ═══════════════════════════════════════════════════════════════
const DONOR_MAX_AGE=110;

function buildDonorBlock(parent, proj, assets){
  if(!parent||!proj||!proj.rows||!proj.rows.length||!assets||!assets.length) return null;
  const want=new Set(assets.map(a=>a.key)), infl=parent.inflation;
  const pass=proj.people.map(q=>parent.passing&&parent.passing[q.id]!=null?Number(parent.passing[q.id]):95);
  // who passes LAST is decided by calendar year (birth date + passing age), not by passing age: two people can share an age yet pass years apart
  const lastRow=proj.people.map((q,i)=>Math.ceil(pass[i]-currentAge(q))-1), maxLast=Math.max(...lastRow);
  const saved=state; let proj2;
  try{
    const c=JSON.parse(JSON.stringify(parent));
    c.ltc=Object.assign({},c.ltc,{enabled:false});
    c.passing=Object.assign({},c.passing);
    proj.people.forEach((q,i)=>{ if(lastRow[i]>=maxLast) c.passing[q.id]=DONOR_MAX_AGE; });
    state=c; proj2=computeProjection();
  }catch(e){ return null; } finally{ state=saved; }
  const rows=proj2.rows, n=rows.length, traj={};
  const at=(arr,i,j)=>(arr&&arr[i]!==undefined&&(j===undefined?arr[i]:arr[i][j]));
  proj2.people.forEach((p,i)=>{
    (p.brokerage||[]).forEach((b,bi)=>{
      const key='pf:'+b.id; if(!want.has(key)) return;
      const g=realGrowth(b.growth,infl), v=[];
      for(let k=0;k<n;k++){ const e=at(rows[k].portfoliosByPerson,i,bi); v.push(e&&e.balance>0?Math.round(e.balance*(1+g)):0); }
      traj[key]={cls:'eq',v};
    });
    (p.realEstate||[]).forEach((r,ri)=>{
      const key='re:'+r.id; if(!want.has(key)) return;
      const g=realGrowth(r.growth,infl), v=[];
      for(let k=0;k<n;k++){ const e=at(rows[k].realEstateByPerson,i,ri); v.push(e&&e.balance>0?Math.round(e.balance*(1+g)):0); }
      traj[key]={cls:'re',v};
    });
    [['ira','iraBalByPerson'],['roth','rothBalByPerson']].forEach(([type,f])=>{
      const key=type+':'+p.id; if(!want.has(key)) return;
      const v=[]; for(let k=0;k<n;k++) v.push(Math.round(Number(at(rows[k][f],i))||0));
      traj[key]={cls:'eq',v};
    });
  });
  if(!Object.keys(traj).length) return null;
  const L=parent.ltc||{};
  return {v:1, year0:THIS_YEAR, filing:parent.filingStatus, inflation:infl, ltcOn:!!L.enabled,
    people:proj.people.map((q,i)=>{ const l=(L.people&&L.people[i])||{}; return {birthYear:q.birthYear, birthMonth:q.birthMonth||1, passing:pass[i], ltc:{startAge:Number(l.startAge)||0, cost:Number(l.cost)||0}}; }),
    traj};
}

// Validate a donor block that arrives from outside (live-link message, loaded file): right shape, finite numbers, bounded size. Returns a clean copy or null.
function sanitizeDonorBlock(d){
  try{
    if(!d||typeof d!=='object'||d.v!==1||!Number.isFinite(Number(d.year0))) return null;
    if(!Array.isArray(d.people)||d.people.length<1||d.people.length>2||!d.traj||typeof d.traj!=='object') return null;
    const people=d.people.map(p=>{
      const by=Number(p.birthYear), bm=Number(p.birthMonth)||1, ps=Number(p.passing), sa=Number(p.ltc&&p.ltc.startAge)||0, co=Number(p.ltc&&p.ltc.cost)||0;
      if(![by,bm,ps].every(Number.isFinite)||by<1850||by>2100||ps<0||ps>130) throw new Error('person');
      return {birthYear:by, birthMonth:Math.min(12,Math.max(1,Math.round(bm))), passing:ps, ltc:{startAge:sa, cost:Math.max(0,co)}};
    });
    const keys=Object.keys(d.traj); if(!keys.length||keys.length>200) return null;
    const traj={};
    for(const k of keys){
      const t=d.traj[k]; if(!t||(t.cls!=='eq'&&t.cls!=='re')||!Array.isArray(t.v)||t.v.length<1||t.v.length>120) return null;
      const v=t.v.map(Number); if(!v.every(Number.isFinite)) return null;
      traj[String(k).slice(0,80)]={cls:t.cls, v:v.map(x=>Math.max(0,Math.round(x)))};
    }
    return {v:1, year0:Math.round(Number(d.year0)), filing:d.filing==='married'?'married':'single', inflation:Number(d.inflation)||0, ltcOn:!!d.ltcOn, people, traj};
  }catch(e){ return null; }
}
if(typeof module!=='undefined') module.exports={buildDonorBlock,sanitizeDonorBlock};
