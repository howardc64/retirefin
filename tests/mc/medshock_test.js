// Late-life medical shock (projection.js state.medShock) and its liquidity / tax-drag diagnostic (stressTest.js stMedRun).
//   PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/medshock_test.js
const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(require('fs').readFileSync(process.env.PLAN,'utf8'));
const ctx=makeCtx(); loadPlan(ctx,plan);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const J=code=>run(ctx,code);
const AGE=75, COST=120000, YEARS=3;
const proj=(shock,extra)=>J(`withTempState(s=>{ s.medShock=Object.assign({enabled:${!!shock},person:0,age:${AGE},years:${YEARS},cost:${COST}},${JSON.stringify(extra||{})}); }, ()=>{ const p=computeProjection();
  return p.rows.map(r=>({k:r.k,age:r.age0,med:r.expMed||0,ltc:r.expLtc,ltcStarted:r.ltcStarted,cost:r.ltcCostByPerson,liv:r.expLiving,tot:r.expTotal,item:r.itemized,floor:r.agiFloor,used:r.usedItemized,agi:r.agi,tax:(r.totalTax||0)+(r.stateTax||0),conv:r.taxConverged,unf:r.expUnfunded,
   inc:r.expFromIncome,div:r.expFromDiv,sales:r.expFromSales,ira:r.expFromIra,roth:r.expFromRoth,re:r.expFromRe,expTax:r.expTax})); })`);
const off=proj(false), on=proj(true);
// 1. off: no field; on: exactly YEARS rows carry the cost
ok(off.every(r=>r.med===0),'shock off: no expMed on any row');
const win=on.filter(r=>r.med>0);
ok(win.length===YEARS&&win.every(r=>r.med===COST),'shock on: exactly '+YEARS+' rows carry '+COST+' (ages '+win.map(r=>Math.round(r.age))+')');
ok(win.every(r=>Math.abs(r.ltc-off[r.k].ltc-COST)<1e-9&&r.cost.reduce((a,b)=>a+b,0)-off[r.k].cost.reduce((a,b)=>a+b,0)===COST),'folded into the Long Term Care cost line (expLtc and ltcCostByPerson)');
ok(on.every((r,k)=>r.ltcStarted===off[k].ltcStarted&&(r.med>0||Math.abs(r.liv-off[k].liv)<1e-9)),'household living expenses do not switch to the care amount (ltcStarted untouched)');
ok(on.every((r,k)=>r.med>0||(Math.abs(r.ltc-off[k].ltc)<1e-9)),'rows outside the shock keep the same care cost');
// 2. the itemized deduction sees it: itemized = max(0, cost - 7.5% AGI floor), used when it beats the standard deduction
ok(win.every(r=>Math.abs(r.item-Math.max(0,r.ltc-r.floor))<1e-6),'itemized deduction = shock (+ any care cost) above the 7.5% AGI floor in every shock year');
ok(win.some(r=>r.used),'the shock makes itemizing worthwhile in at least one year');
// 3. accounting: what pays the extra spending = the shock + the extra tax (+ extra IRMAA etc.)
const sum=(a,f)=>a.reduce((t,r)=>t+f(r),0), W=win.map(r=>r.k);
const dPaid=sum(W.map(k=>on[k]),r=>r.inc+r.div+r.sales+r.ira+r.roth+r.re+r.unf)-sum(W.map(k=>off[k]),r=>r.inc+r.div+r.sales+r.ira+r.roth+r.re+r.unf);
const dTot=sum(W.map(k=>on[k]),r=>r.tot)-sum(W.map(k=>off[k]),r=>r.tot);
ok(Math.abs(dPaid-dTot)<1,'the accounts that pay in the shock years add up to the extra spending ('+Math.round(dPaid)+' vs '+Math.round(dTot)+')');
ok(Math.abs(dTot-(YEARS*COST+sum(W.map(k=>on[k]),r=>r.expTax)-sum(W.map(k=>off[k]),r=>r.expTax)))<1500,'extra spending = shock + extra income tax (within IRMAA / fee effects)');
ok(on.every(r=>r.conv!==false),'tax iteration converged in every year');
// 4. second person / a person who is not there
const p2=proj(true,{person:1});
ok(p2.filter(r=>r.med>0).length<=YEARS,'person 2 selected: costs follow that person\'s age ('+p2.filter(r=>r.med>0).length+' rows)');
ok(proj(true,{age:150}).every(r=>r.med===0),'a shock beyond the horizon adds nothing');
// 5. the diagnostic
ctx.__cfg=null;
const D=J(`(()=>{ const c=JSON.parse(JSON.stringify(ST_DEFAULTS)); c.med=Object.assign(c.med,{enabled:true,age:${AGE},years:${YEARS},cost:${COST},orders:true}); const r=stMedRun(c);
  return {r, stateOk:state.medShock.enabled===false&&state.withdrawOrder.enabled===false, noMed:stMedRun(Object.assign({},c,{med:Object.assign({},c.med,{enabled:false})}))}; })()`);
const S=D.r.sum;
ok(D.r.covered&&Math.abs(S.cost-YEARS*COST)<1e-6&&S.years===YEARS,'diagnostic: '+YEARS+' years x '+COST+' = '+S.cost+' at ages '+S.startAge.toFixed(0)+'-'+S.endAge.toFixed(0));
const paid=Object.values(S.paid).reduce((a,b)=>a+b,0);
ok(Math.abs(paid-(S.cost+(S.taxShockYears)))<S.cost*0.02+500,'who paid: '+Object.entries(S.paid).map(([k,v])=>k+' '+Math.round(v)).join(', ')+' (sums to the shock plus extra tax)');
ok(S.estate<S.estateBase,'the shock lowers the estate ('+Math.round(S.estateBase)+' -> '+Math.round(S.estate)+')');
ok(S.notConverged===0&&S.maxIters>0,'tax solver converged in all years (max '+S.maxIters+' iterations)');
ok(D.noMed===null&&D.stateOk,'disabled returns null; plan state and withdrawal order untouched');
ok(D.r.orders&&D.r.orders.length>=2&&D.r.orders.every(o=>o.sum&&isFinite(o.sum.taxLifetime)),'compares '+D.r.orders.length+' withdrawal orders: '+D.r.orders.map(o=>o.label+' (tax '+Math.round(o.sum.taxLifetime)+')').join('; '));
ok(/Built-in/.test(D.r.orders[0].label),'first order is the built-in one when the plan sets no order');
// 6. a huge forced sale still solves (medical deduction shrinks as the sale raises AGI)
const big=J(`withTempState(s=>{ s.medShock={enabled:true,person:0,age:${AGE},years:5,cost:600000}; }, ()=>{ const p=computeProjection(); return p.rows.filter(r=>r.expMed>0).map(r=>[r.taxConverged,r.taxIters,Math.round(r.ltcgGross),Math.round(r.itemized),Math.round(r.agi)]); })`);
ok(big.length>0&&big.every(r=>r[0]!==false),'a $600k x 5-year shock: solver converged ('+JSON.stringify(big[0])+' = converged, iterations, LTCG, itemized, AGI)');
// 7. Monte Carlo: the shock applies in every trial and never helps
const mc=J(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); const o={}; for(const on of [false,true]) o[on]=withTempState(s=>{ s.medShock={enabled:on,person:0,age:${AGE},years:${YEARS},cost:${COST*3}}; }, ()=>mcSummarize(mcRunRange(cfg,0,150)).successRate); return o; })()`);
ok(mc.true<=mc.false+1e-12,'Monte Carlo success '+(mc.false*100).toFixed(1)+'% -> '+(mc.true*100).toFixed(1)+'% with the shock (same seeds)');
ok(J('state.medShock.enabled')===false&&J('MC_HOOK===null&&MC_INFL===null'),'plan state and hooks restored');
console.log(fails?('\n'+fails+' FAILED'):'\nall passed'); process.exit(fails?1:0);
