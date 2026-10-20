// Regression tests for audit finding F-05: California exemption-credit phase-out.
// Run: node tests/unit/ca_credit_phaseout_test.js
process.env.PLANNER_ROOT=require('path').join(__dirname,'..','..');
const {makeCtx,run}=require('../mc/mc_harness');
const ctx=makeCtx();
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const near=(a,b,t=1e-6)=>Math.abs(a-b)<=t;
const red=(agi,married,f=1)=>run(ctx,`caCreditReduction(${agi},${married},${f})`);
const SG=run(ctx,'CA_CREDIT_PHASEOUT_SGL'), MJ=run(ctx,'CA_CREDIT_PHASEOUT_MFJ');

// ── the rule (FTB Form 540 AGI Limitation Worksheet): $6 per $2,500 or part of it, per credit ──
ok(red(SG,false)===0 && red(SG-1,false)===0 && red(0,false)===0,'at or below the single threshold: no reduction');
ok(red(SG+1,false)===6,'$1 over: one step, $6 off each credit');
ok(red(SG+2500,false)===6,'exactly one step over: still $6 (an exact multiple does not round up)');
ok(red(SG+2501,false)===12,'$2,501 over: two steps, $12');
ok(red(SG+25000,false)===60,'ten full steps: $60');
ok(red(MJ,true)===0 && red(MJ+1,true)===6,'married uses the married threshold (and $6 per person, i.e. $12 for the pair)');
ok(red(SG+1,true)===0,'a single-threshold income is under the married threshold: no reduction for a couple');
// FTB's own worked example (2021 booklet): federal AGI $225,000, threshold $212,288 → 6 steps, $36 off each credit. Same rule, other year's numbers:
ok(near(Math.ceil((225000-212288)/2500)*6,36),'FTB booklet example arithmetic: (225,000 − 212,288) ÷ 2,500 → 6 steps → $36');
// un-indexed step and $6 shrink with the deflator f (today's $): same slope, finer grid
ok(near(red(SG+1,false,0.5),3) && near(red(SG+1250,false,0.5),3) && near(red(SG+1251,false,0.5),6),'with f = 0.5 the step is $1,250 and the reduction $3 per step');

// ── computeStateTax('CA') ──
const caTax=(agi,filing,nAlive,nSenior,f=1)=>run(ctx,`computeStateTax('CA',{agi:${agi},taxableSS:0,expLtc:0,ltcgPortfolio:0,filing:'${filing}',nAlive:${nAlive},nSenior:${nSenior},f:${f}})`);
const P=run(ctx,'CA_PERSONAL_CREDIT'), S=run(ctx,'CA_SENIOR_CREDIT');
// below the threshold the credits are whole
const lo=caTax(100000,'single',1,1), loNoCred=caTax(100000,'single',0,0);
ok(near(loNoCred-lo,P+S),'below the threshold both credits count in full ('+(loNoCred-lo)+')');
// 5 steps over: each credit loses $30
const agi5=SG+12500, hi=caTax(agi5,'single',1,1), hiNo=caTax(agi5,'single',0,0);
ok(near(hiNo-hi,(P-30)+(S-30)),'five steps over: each credit is $30 smaller → credits worth '+(hiNo-hi));
// fully phased out: 27 steps = $162 ≥ $158
const agiBig=SG+27*2500, bigNo=caTax(agiBig,'single',0,0), big=caTax(agiBig,'single',1,1);
ok(near(bigNo,big),'27 steps over: credits are gone, tax is the same with or without them');
const agi26=SG+26*2500, d26=caTax(agi26,'single',0,0)-caTax(agi26,'single',1,1);
ok(near(d26,2*(P-156)),'26 steps: $156 off each credit, $2 left on each ('+d26+')');
// a couple, one senior: personal ×2, senior ×1, married threshold
const cpl=caTax(MJ+5000,'married',2,1), cplNo=caTax(MJ+5000,'married',0,0);
ok(near(cplNo-cpl,2*(P-12)+1*(S-12)),'couple, two steps over the married threshold: 2 personal + 1 senior credit, each $12 smaller');
// the credit can never make the phase-out negative (tax never rises above no-credit tax)
ok(caTax(agiBig*3,'single',1,1)>=caTax(agiBig*3,'single',0,0)-1e-9,'phase-out never turns a credit into a charge');
// uses FEDERAL AGI, not AGI less taxable SS
const withSS=run(ctx,`computeStateTax('CA',{agi:${SG+12500},taxableSS:60000,expLtc:0,ltcgPortfolio:0,filing:'single',nAlive:1,nSenior:1,f:1})`);
const withSSnoCred=run(ctx,`computeStateTax('CA',{agi:${SG+12500},taxableSS:60000,expLtc:0,ltcgPortfolio:0,filing:'single',nAlive:0,nSenior:0,f:1})`);
ok(near(withSSnoCred-withSS,(P-30)+(S-30)),'the phase-out keys off federal AGI even though taxable Social Security is not taxed by California');
// ── representative returns, worked by hand from FTB's published 2026 Schedule X / Y (Tax News, October 2026), std deduction $5,900 / $11,800, credit $158 ──
// (independent of the app's bracket code; federal AGI = California AGI here, no Social Security, no LTC)
const rep=[
  ['single, both credits, AGI $300,000 (16 steps, $96 off each: $62 left)',        300000,'single', 1,1, 23544.86],
  ['couple both 65+, AGI $200,000 (under the threshold: 4 credits of $158)',       200000,'married',2,2,  9505.72],
  ['couple both 65+, AGI $530,000 (4 steps, $24 off each: $134 left)',             530000,'married',2,2, 40291.72],
  ['couple, AGI $600,000 (credits fully phased out)',                              600000,'married',2,2, 47337.72],
  ['surviving spouse filing single, 65+, AGI $275,000 (6 steps, $36 off: $122)',   275000,'single', 1,1, 21099.86]];
rep.forEach(([name,agi,filing,n,ns,want])=>{ const got=caTax(agi,filing,n,ns); ok(Math.abs(got-want)<0.01,name+': tax '+got.toFixed(2)+' vs hand-worked '+want.toFixed(2)); });
console.log(fails?'\n'+fails+' FAILED':'\nall passed'); process.exit(fails?1:0);
