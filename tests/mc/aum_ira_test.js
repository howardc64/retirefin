// AUM box on pre-tax IRA / Roth IRA / inherited IRA. Run from the app folder:  PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/aum_ira_test.js
const fs=require('fs'), path=require('path');
const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(fs.readFileSync(path.resolve(process.env.PLAN||'Samples/Couple_Heir.json'),'utf8'));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const ctx=makeCtx(); loadPlan(ctx,plan);
const J=c=>run(ctx,c);
const proj=(mut)=>{ ctx.__m=mut||''; return J(`(()=>{ const saved=JSON.stringify(state); try{ ${mut||''}; const p=computeProjection(); return p.rows.map(r=>({k:r.k,aumBalance:r.aumBalance,aumFee:r.aumFee,expAum:r.expAum,pf:r.aumBalPf,ira:r.aumBalIra,roth:r.aumBalRoth,inh:r.aumBalInh,iraBal:r.iraBalByPerson.slice(),totalTax:r.totalTax})); } finally{ Object.assign(state, JSON.parse(saved)); } })()`); };
const sum=(a,f)=>a.reduce((t,r)=>t+(f(r)||0),0);
const SET1=`state.aumFee={enabled:true,mode:'pct',value:1}; state.people.forEach(p=>{ p.brokerage.forEach(b=>{b.aum=false}); p.ira.aum=false; p.roth.aum=false; (p.inhIras||[]).forEach(x=>{x.aum=false}); });`;
const base=proj(SET1);
ok(sum(base,r=>r.aumBalance)===0&&sum(base,r=>r.aumFee)===0,'all AUM boxes off: no AUM balance, no fee');
// pre-tax IRA
let r=proj(SET1+`state.people[0].ira.aum=true;`);
ok(sum(r,x=>x.ira)>0&&sum(r,x=>x.aumFee)>0&&r.every(x=>Math.abs(x.aumFee-x.aumBalance*0.01)<1e-6),'pre-tax IRA box: fee = 1% x IRA balance each year (total fee '+Math.round(sum(r,x=>x.aumFee))+')');
ok(Math.abs(r[0].ira-plan.people[0].ira.balance)<1e-6,'year 0 AUM base = the IRA starting balance, before the RMD/withdraw ('+Math.round(r[0].ira)+')');
ok(r.every(x=>x.pf===0&&x.roth===0&&x.inh===0),'only the IRA is in the base');
// Roth
r=proj(SET1+`state.people[0].roth.aum=true;`);
ok(sum(r,x=>x.roth)>0&&r.every(x=>Math.abs(x.aumFee-x.aumBalance*0.01)<1e-6),'Roth IRA box: fee = 1% x Roth balance (total fee '+Math.round(sum(r,x=>x.aumFee))+')');
// inherited IRA
const hasInh=J('state.people.some(p=>(p.inhIras||[]).length>0)');
if(hasInh){
  r=proj(SET1+`state.people.forEach(p=>(p.inhIras||[]).forEach(x=>{x.aum=true}));`);
  const first=r.findIndex(x=>x.inh>0), last=r.map(x=>x.inh>0).lastIndexOf(true);
  ok(first>0&&sum(r,x=>x.aumFee)>0,'inherited IRA box: base appears only once it arrives (rows '+first+'..'+last+')');
  ok(last-first<=10,'inherited IRA is charged only from arrival to the year-10 emptying ('+(last-first+1)+' rows)');
}
// portfolio unchanged (regression): box on a portfolio gives the same as before
r=proj(SET1+`state.people[0].brokerage[0].aum=true;`);
ok(r.every(x=>Math.abs(x.aumBalance-x.pf)<1e-6)&&sum(r,x=>x.aumFee)>0,'portfolio box still works and IRAs add nothing');
// both: additive
const a=proj(SET1+`state.people[0].brokerage[0].aum=true;`), b=proj(SET1+`state.people[0].ira.aum=true;`), c=proj(SET1+`state.people[0].brokerage[0].aum=true; state.people[0].ira.aum=true;`);
ok(Math.abs(c[0].aumFee-(a[0].aumFee+b[0].aumFee))<1e-6&&c[0].aumFee>a[0].aumFee,'year 0: portfolio + IRA fees are additive (later years differ because the fee itself changes the balances)');
// fixed-mode fee is split but unchanged in total
r=proj(`state.aumFee={enabled:true,mode:'fixed',value:5000}; state.people[0].ira.aum=true;`);
ok(Math.abs(r[0].aumFee-5000)<1e-6,'fixed $ fee is charged once when only an IRA is checked');
// disabling the fee turns it all off
r=proj(SET1+`state.people[0].ira.aum=true; state.aumFee.enabled=false;`);
ok(sum(r,x=>x.aumFee)===0,'AUM fee unchecked: no fee even with IRA boxes on');
// the fee is an extra expense -> more is withdrawn / more spent: total tax or assets differ; at least expAum equals aumFee
r=proj(SET1+`state.people[0].ira.aum=true;`);
ok(r.every(x=>Math.abs(x.expAum-x.aumFee)<1e-6),'expAum == aumFee (all of it is a household expense)');
// save/load keeps the flag
const rt=J(`(()=>{ state.people[0].ira.aum=true; state.people[0].roth.aum=true; const h=hydrateState(JSON.parse(JSON.stringify(state))); return [h.people[0].ira.aum,h.people[0].roth.aum]; })()`);
ok(rt[0]===true&&rt[1]===true,'aum flags survive save + load');
const old=J(`(()=>{ const s=JSON.parse(JSON.stringify(state)); delete s.people[0].ira.aum; delete s.people[0].roth.aum; const h=hydrateState(s); return [h.people[0].ira.aum,h.people[0].roth.aum]; })()`);
ok(old[0]===false&&old[1]===false,'older saves without the flag load with it off');
console.log(fails?('\n'+fails+' FAILED'):'\nall passed'); process.exit(fails?1:0);
