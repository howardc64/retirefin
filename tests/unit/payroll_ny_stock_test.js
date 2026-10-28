'use strict';
// Wage contributions, payroll tax, NY / NYC state tax and Stock options.   PLANNER_ROOT=. node tests/unit/payroll_ny_stock_test.js
const {makeCtx, run} = require('../mc/mc_harness');
const ctx = makeCtx(), J = c => run(ctx, c);
let bad = 0;
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) bad++; };
const near = (a, b, t = 0.01) => Math.abs(a - b) <= t;
// NY worked example (joint, NY AGI $150,000, taxable income $133,950): $7,182.43; flat-rate effect at high income
ok('NY recapture example', near(J('nyTax(133950,150000,true)'), 7182.4275, 0.005));
ok('NY flat 5.9% at high NY AGI', near(J('nyTax(100000,300000,false)'), 5900, 0.01));
ok('NY no recapture at NY AGI 100k', near(J('nyTax(100000,100000,false)'), J('calcOrdTax(100000,NY_ORD_SGL)'), 0.01));
// payroll
const pr = JSON.parse(J('JSON.stringify(computePayrollTax([250000,0],"single",1))'));
ok('payroll SS+Medicare+Addl+FUTA', near(pr.ss, 11439) && near(pr.med, 3625) && near(pr.addlMedicare, 450) && near(pr.futa, 42));
// stock schedule: 1600 shares, 16 quarters from Q1 2025, release from Q1 2026 -> first release 5 installments
const s = JSON.parse(J('JSON.stringify(stockSchedule({shares:1600,vestQ:1,vestY:2025,vestN:16,relQ:1,relY:2026},new Date(2026,9,25)))'));
ok('first release = 5 installments', s[0].shares === 500 && s.reduce((a, r) => a + r.shares, 0) === 1600);
ok('releases before today flagged', s.filter(r => r.past).length === 3 && !s[3].past);
// projection
J(`state=defaultState(); state.filingStatus='single'; state.living=60000;
 const a=state.people[0]; a.birthYear=THIS_YEAR-45; state.passing={p1:80,p2:80};
 a.wage.enabled=true;a.wage.amount=200000;a.wage.pretax=20000;a.wage.roth=6000;a.wage.ar=defaultAgeRange('now',0,'custom',60);
 a.ira.enabled=true;a.roth.enabled=true;
 const p1=defaultBrokeragePortfolio(900000); p1.basisPct=60; a.brokerage=[p1];`);
const r = JSON.parse(J('JSON.stringify(computeProjection().rows[1])'));
ok('pre-tax contribution reduces wage base', near(r.pretaxContribTotal, 20000) && near(r.grossWageTotal, 200000));
ok('payroll tax is an expense, wage is not reduced', near(r.wageTotal, 180000, 0.01) && r.payrollTax > 13000 && near(r.expPayroll, r.payrollTax, 0.01));
ok('Roth contribution is an expense', near(r.expRoth, 6000) && r.expTotal >= 66000);
ok('IRA / Roth balances grow by contributions', r.iraBalByPerson[0] > 20000 && r.rothBalByPerson[0] > 6000);
J(`state.people[0].roth.enabled=false`);
ok('contribution ignored while the Roth card is off', near(JSON.parse(J('JSON.stringify(computeProjection().rows[1])')).expRoth, 0));
J(`state.people[0].roth.enabled=true; state.stateTax={enabled:true,state:'NY'}`);
const ny = JSON.parse(J('JSON.stringify(computeProjection().rows[1])')).stateTax;
J(`state.stateTax={enabled:true,state:'NYC'}`);
const nyc = JSON.parse(J('JSON.stringify(computeProjection().rows[1])')).stateTax;
ok('NYC tax > NY tax > 0', ny > 5000 && nyc > ny * 1.3);
// stock options: wage vs capital gain
J(`state.stateTax={enabled:false,state:'CA'}; const g=defaultStockGrant(); g.shares=400;g.marketPrice=50;g.grantPrice=0;g.vestY=THIS_YEAR+1;g.vestQ=1;g.vestN=4;g.relY=THIS_YEAR+1;g.relQ=1;
 state.people[0].stock={enabled:true,hidden:false,grants:[g]};`);
let r1 = JSON.parse(J('JSON.stringify(computeProjection().rows[1])'));
ok('stock gain counts as wage (checked)', near(r1.stockWageTotal, 20000, 0.5) && r1.stockLtcgTotal === 0);
J('state.people[0].stock.grants[0].wage=false');
r1 = JSON.parse(J('JSON.stringify(computeProjection().rows[1])'));
ok('stock gain as capital gain (unchecked)', r1.stockWageTotal === 0 && near(r1.stockLtcgTotal, 20000, 0.5) && r1.ltcg >= 20000);
J('state.people[0].stock.grants[0].vestY=2020; state.people[0].stock.grants[0].relY=2020');
ok('releases before today skipped', JSON.parse(J('JSON.stringify(computeProjection().rows.reduce((a,r)=>a+r.stockWageTotal+r.stockLtcgTotal,0))')) === 0);
// save / load keeps grants and fills fields
J(`state=hydrateState(JSON.parse(JSON.stringify(Object.assign(defaultState(),{people:[Object.assign(defaultPerson(0),{stock:{enabled:true,hidden:false,grants:[{name:'x',shares:5}]}}),defaultPerson(1)]}))))`);
ok('hydrate fills grant fields', J('state.people[0].stock.grants[0].wage') === true && J('state.people[0].stock.grants[0].vestN') === 16);
ok('income card order has stock after wage', J('normalizeIncomeOrder(["wage","ss"]).slice(0,3).join()') === 'wage,stock,ss');

// payroll tax is not deductible: income tax is computed on the wage after the pre-tax contribution, not on the wage after payroll tax
J(`state=defaultState(); state.filingStatus='single'; state.living=60000; state.stateTax={enabled:false,state:'CA'};
 state.people[0].birthYear=THIS_YEAR-45; state.passing={p1:80,p2:80};
 state.people[0].wage.enabled=true;state.people[0].wage.amount=200000;state.people[0].wage.pretax=20000;state.people[0].wage.ar=defaultAgeRange('now',0,'custom',60);
 state.people[0].ira.enabled=true; state.people[0].brokerage=[Object.assign(defaultBrokeragePortfolio(900000),{basisPct:60})];`);
const w1 = JSON.parse(J('JSON.stringify(computeProjection().rows[1])'));
ok('taxable wage = gross - pre-tax contribution (payroll tax not deducted)', near(w1.wageTaxableTotal, 180000) && near(w1.wageTotal, 180000, 0.01) && w1.expTotal >= 60000 + w1.payrollTax - 0.01);
ok('income tax base includes the whole taxable wage', w1.nonSSOrdinary >= 180000 - 0.01);
// California SDI 1.3% of all wages
const ca = JSON.parse(J('JSON.stringify(computePayrollTax([250000,0],"single",1,{enabled:true,state:"CA"}))'));
ok('CA SDI 1.3% on all wages', near(ca.caSdi, 3250) && near(ca.total, 11439 + 3625 + 450 + 42 + 3250));
// Washington PFML (employee 71.43% of 1.13%, to the SS base) + WA Cares 0.58% (no cap); exemption removes WA Cares
const wa = JSON.parse(J('JSON.stringify(computePayrollTax([250000,0],"single",1,{enabled:true,state:"WA"}))'));
ok('WA PFML to SS base + WA Cares on all wages', near(wa.waPfml, 0.0113 * 0.7143 * 184500, 0.01) && near(wa.waCares, 1450, 0.01));
const wx = JSON.parse(J('JSON.stringify(computePayrollTax([250000,0],"single",1,{enabled:true,state:"WA",waLtcExempt:true}))'));
ok('WA Cares exemption', wx.waCares === 0 && near(wx.waPfml, wa.waPfml, 0.01));
const off = JSON.parse(J('JSON.stringify(computePayrollTax([250000,0],"single",1,{enabled:false,state:"CA"}))'));
ok('no state payroll tax while State income tax is off', off.stateTotal === 0);
// stock: market price in future $ is a fixed nominal price
ok('stockGain today\'s $ default', near(J('stockGain({shares:100,market:50,grant:0},1.5)'), 5000));
ok('stockGain future $ divides by price level', near(J('stockGain({shares:100,market:50,grant:0,marketFuture:true},1.25)'), 4000));
ok('new grant defaults to today\'s $', J('defaultStockGrant(1).marketFuture') === false);
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
