// Regression tests for audit findings F-01 (RMD start age) and F-02 (NIIT on rental income / property sales).
// Run: node tests/unit/rmd_niit_test.js
process.env.PLANNER_ROOT=require('path').join(__dirname,'..','..');
const {makeCtx,loadPlan,run}=require('../mc/mc_harness');
const fs=require('fs'), path=require('path');
const ctx=makeCtx();
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const near=(a,b,t=0.01)=>Math.abs(a-b)<=t;

// ── F-01: RMD start age by birth year / month ──
const age=(y,m)=>run(ctx,`rmdAgeForBirthYear(${y},${m===undefined?'undefined':m})`);
ok(age(1949,6)===70.5,'born June 1949 (just before July 1) → 70½');
ok(age(1949,7)===72,'born July 1949 (on/after July 1) → 72');
ok(age(1949,12)===72,'born December 1949 → 72');
ok(age(1948,12)===70.5,'born 1948 → 70½');
ok(age(1940,1)===70.5,'born 1940 → 70½');
ok(age(1950,1)===72 && age(1950,12)===72,'born 1950 → 72');
ok(age(1951,1)===73,'born 1951 → 73');
ok(age(1959,12)===73,'born 1959 → 73');
ok(age(1960,1)===75,'born 1960 → 75');
ok(age(1975,6)===75,'born 1975 → 75');
ok(age(1949)===70.5,'1949 with no month reads as January → 70½ (app-wide default)');
const fd=(y,m)=>JSON.parse(run(ctx,`JSON.stringify(rmdFirstDistribution(${y},${m}))`));
ok(fd(1949,6).year===2019 && fd(1949,6).firstDeadline.year===2020 && fd(1949,6).firstDeadline.month===4,'June 1949: 70½ in Dec 2019, first RMD by April 1, 2020');
ok(fd(1948,10).year===2019,'Oct 1948: 70½ rolls into April 2019');
ok(fd(1949,7).year===2021 && fd(1949,7).age===72,'July 1949: age 72 in 2021');
ok(fd(1950,3).year===2022 && fd(1950,3).firstDeadline.year===2023,'1950: first RMD year 2022, April 1, 2023');
ok(fd(1959,5).year===2032 && fd(1959,5).firstDeadline.day===1,'1959: age 73 in 2032');
ok(fd(1960,1).year===2035 && fd(1960,1).firstDeadline.year===2036,'1960: age 75 in 2035, April 1, 2036');
// resolveAgeRange uses it, month included
const rs=(y,m)=>run(ctx,`resolveAgeRange({startMode:'rmd',endMode:'passing'},{id:'p1',birthYear:${y},birthMonth:${m}})[0]`);
ok(rs(1949,6)===70.5 && rs(1949,7)===72,'resolveAgeRange honors the birth month at the 1949 boundary');

// ── F-02: NIIT base ──
const plan=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','Samples','Widow.json'),'utf8'));
loadPlan(ctx,plan);
const scenario=(rentalStatus,reStatus)=>run(ctx,`(()=>{
  Object.assign(state, hydrateState(${JSON.stringify(plan)}));
  const p=state.people[0];
  p.rentals=[Object.assign(defaultRental(0),{enabled:true,amount:60000,ar:defaultAgeRange('now',0,'passing',0),niitStatus:${JSON.stringify(rentalStatus)}})];
  p.realEstate=[Object.assign(defaultRealEstate(0),{enabled:true,balance:1500000,basis:200000,exempt:0,sellMode:'age',sellAge:Math.ceil(currentAge(p))+2,niitStatus:${JSON.stringify(reStatus)}})];
  const pr=computeProjection();
  return pr.rows.map(r=>({nii:r.niiIncome,niit:r.niit,agi:r.agi,ltcg:r.ltcg,rentalNII:r.rentalNII,reX:r.reNiitExcl,odivNQ:r.odivNQ,qdiv:r.qdiv,ann:0,rental:r.rental,reGain:r.reSaleGain}));
})()`);
const base=scenario('passive','investment'), biz=scenario('business','business');
const r0=base[0], b0=biz[0];
ok(near(r0.rentalNII,60000,1),'passive rental: its $60,000 is net investment income');
ok(near(r0.nii-b0.nii,60000,1),'passive rental raises NII by exactly the rental income vs an active-business rental');
ok(b0.rentalNII===0,'active-business rental contributes 0 NII');
ok(near(r0.rental,b0.rental,0.001),'classification does not change taxable income / AGI');
ok(near(r0.agi,b0.agi,0.001),'AGI identical for both classifications');
const sale=base.findIndex(r=>r.reGain>0);
ok(sale>=0,'scenario has a property sale year');
const rs0=base[sale], bs=biz[sale];
ok(rs0.nii>=rs0.ltcg+rs0.rentalNII-1,'investment property: the sale gain is inside NII');
ok(near(rs0.nii-bs.nii, rs0.rentalNII+rs0.reGain,1),'business property + business rental drops exactly the gain and the rental from NII');
ok(bs.niit<rs0.niit,'NIIT in the sale year is lower when the property is an active business asset');
ok(bs.reX>0 && near(bs.reX,bs.reGain,1),'row reports the NII-excluded gain');
// Up to and including the sale year both runs share the same portfolios, so the passive/investment run never pays less NIIT.
// (Later years differ: the business-classed run paid less tax on the sale, keeps more assets, and so has slightly higher AGI; there NIIT is capped by MAGI over the threshold, not by NII.)
ok(base.slice(0,sale+1).every((r,i)=>r.niit>=biz[i].niit-1e-6),'through the sale year, passive/investment classification never lowers NIIT');
// default for older saves without the field
const legacy=run(ctx,`(()=>{ const pl=${JSON.stringify(plan)}; pl.people[0].rentals=[{enabled:true,amount:1000}]; pl.people[0].realEstate=[{balance:1,basis:1}]; const h=hydrateState(pl); return [h.people[0].rentals[0].niitStatus,h.people[0].realEstate[0].niitStatus]; })()`);
ok(legacy[0]==='passive'&&legacy[1]==='investment','saves without niitStatus default to passive / investment');
console.log(fails?'\n'+fails+' FAILED':'\nall passed'); process.exit(fails?1:0);
