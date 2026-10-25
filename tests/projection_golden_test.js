'use strict';
// Golden test for the projection engine (compute/projection.js). Runs computeProjection() over both sample plans in many situations — as entered, higher inflation, bracket-filling
// Roth conversions, claim-age changes, Monte Carlo trials replayed in full (random returns / lifespans / care / inflation / inheritance) and every stress test — and compares a SHA-256
// of each complete projection (every row, the stretch years, the recorded rates) with tests/projection_golden.json.
// Meant for refactoring the engine: an exact-bytes check, so any change in any number of any output fails.
//   PLANNER_ROOT=. node tests/projection_golden_test.js            compare
//   PLANNER_ROOT=. node tests/projection_golden_test.js --update   accept the current output as the new golden file
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const {makeCtx,loadPlan,run}=require('./mc/mc_harness');
const ROOT=process.env.PLANNER_ROOT||path.join(__dirname,'..');
const GOLD=path.join(__dirname,'projection_golden.json');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').slice(0,16);
const out={};
// uid() (random ids of portfolios, annuities …) appears in the projection's keys: make it repeatable. Reseeded before every plan is built.
let _seed=1; const reseed=()=>{ _seed=1; Math.random=()=>{ _seed=(_seed*9301+49297)%233280; return _seed/233280; }; }; reseed();

for(const planFile of ['Couple_Heir.json','Widow.json']){
  const plan=JSON.parse(fs.readFileSync(path.join(ROOT,'Samples',planFile),'utf8'));
  const ctx=makeCtx(); loadPlan(ctx,plan);
  const J=code=>run(ctx,code);
  const P=planFile.replace('.json','');
  const proj=expr=>hash(J(`JSON.stringify(${expr})`));
  const fresh=()=>{ loadPlan(ctx,plan); };

  out[P+' as entered']=proj('computeProjection()');
  J('state.inflation=0.05'); out[P+' inflation 5%']=proj('computeProjection()'); fresh();
  J(`state.people.forEach(p=>{ if(p.ira&&p.ira.enabled){ p.ira.convMode='bracket'; p.ira.convToRoth=true; if(p.roth) p.roth.enabled=true; } })`); out[P+' bracket Roth conversion']=proj('computeProjection()'); fresh();
  J(`state.people.forEach(p=>{ if(p.ss&&p.ss.enabled&&!p.ss.started) p.ss.claimAge=70; })`); out[P+' SS claim at 70']=proj('computeProjection()'); fresh();
  J(`state.people.forEach(p=>{ if(p.ira&&p.ira.enabled){ p.ira.stretch=true; p.ira.bene=true; } })`); out[P+' IRA stretch + spouse']=proj('computeProjection()'); fresh();

  // Monte Carlo trials replayed in full, every random part on
  J(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); cfg.trials=12; cfg.ltc.prob=0.9; cfg.inflation.enabled=true; cfg.inheritance.enabled=true; globalThis.__mcfg=cfg; })()`);
  for(let t=0;t<8;t++) out[P+' MC trial '+t]=proj(`mcReplayTrial(__mcfg,${t}).proj`);
  // every stress test (and the same under Monte Carlo)
  J(`globalThis.__scfg=JSON.parse(JSON.stringify(ST_DEFAULTS))`);
  const ids=J(`stScenarios(__scfg).map(s=>s.id)`);
  for(const id of ids) out[P+' stress '+id]=proj(`stReplay(__scfg,${JSON.stringify(id)}).proj`);
}


// ── A "kitchen sink" plan built in code: every income source, IRA + Roth, three portfolios (one IDGT, AUM), SCGL, future NIIT … then one switch at a time (the samples use few features).
{
  const ctx=makeCtx(); const J=code=>run(ctx,code);
  const SINK=`state=defaultState(); state.living=90000; state.scgl=20000; state.aumFee={mode:'pct',value:0.75};
    state.futureTax={enabled:true,niitStartYear:THIS_YEAR+8,niitSingle:400000,niitMarried:500000};
    const [a,b]=state.people; a.wage.enabled=true; a.wage.amount=120000; a.wage.ar=defaultAgeRange('now',0,'custom',66);
    a.ss.pia=3000; a.ss.claimAge=67; b.ss.pia=1800; b.ss.claimAge=65; a.pension.enabled=true; a.pension.amount=24000;
    const rn=defaultRental(); rn.amount=18000; rn.depreciation=6000; b.rentals=[rn];
    a.ira.enabled=true; a.ira.balance=900000; a.ira.aum=true; a.ira.stretch=true; a.ira.conv=20000;
    b.roth.enabled=true; b.roth.balance=250000; b.roth.stretch=true; b.ira.enabled=true; b.ira.balance=150000;
    const p1=defaultBrokeragePortfolio(600000); p1.payExp=true; p1.aum=true; p1.basisPct=55; p1.foreignPct=10; p1.name='Main';
    const p2=defaultBrokeragePortfolio(300000); p2.idgt=true; p2.payExp=true; p2.basisPct=30; p2.name='Trust';
    const p3=defaultBrokeragePortfolio(200000); p3.payExp=false; p3.basisPct=80; p3.teYield=2; p3.name='Muni';
    a.brokerage=[p1,p3]; b.brokerage=[p2];`;
  const VARIANTS={
    'plain':'',
    'LTC':`state.ltc.enabled=true; state.ltc.people=[{startAge:80,cost:120000},{startAge:84,cost:90000}];`,
    'basis swap':`state.basisSwap=true;`,
    'portfolio withdraw':`state.pfWithdraw={enabled:true,ltcgPct:15,acceptNiit:true,acceptTorpedo:false};`,
    'medical shock':`state.medShock={enabled:true,person:0,age:75,years:3,cost:80000};`,
    'guardrail':`state.guardrail.enabled=true; state.guardrail.prosperity=true;`,
    'CA state tax':`state.stateTax={enabled:true,state:'CA'};`,
    'bracket conversion':`const [a,b]=state.people; a.ira.convMode='bracket'; a.ira.convToRoth=true; a.roth.enabled=true; a.roth.balance=50000;`,
    'conversion trigger bracket':`const [a,b]=state.people; a.ira.convMode='fixed'; a.ira.convToRoth=true; a.roth.enabled=true; a.ira.convStartMode='bracket';`,
    'conversion trigger LTC':`const [a,b]=state.people; a.ira.convToRoth=true; a.roth.enabled=true; a.ira.convStartMode='ltc'; state.ltc.enabled=true;`,
    'plain IRA withdraw':`const [a,b]=state.people; a.ira.convToRoth=false; a.ira.conv=30000;`,
    'annuity':`const [a,b]=state.people; const an=defaultAnnuity(); an.value=250000; an.premium=150000; an.payout=15000; a.annuities=[an]; const an2=defaultAnnuity(); an2.value=100000; an2.payoutMode='pct'; an2.tax='exclusion'; an2.bene=true; b.annuities=[an2];`,
    'real estate sold at LTC':`const [a,b]=state.people; const re=defaultRealEstate(); re.balance=500000; re.basis=200000; re.exempt=250000; re.sellMode='ltc'; re.bene=true; a.realEstate=[re]; state.ltc.enabled=true; const re2=defaultRealEstate(); re2.balance=300000; re2.sellMode='age'; re2.sellAge=78; b.realEstate=[re2];`,
    'inherited IRAs':`const [a,b]=state.people; const i1=defaultInheritedIra(); i1.balance=200000; i1.startYear=THIS_YEAR+3; a.inhIras=[i1]; const i2=defaultInheritedIra(); i2.kind='roth'; i2.balance=100000; i2.startYear=THIS_YEAR+1; i2.bene=true; b.inhIras=[i2];`,
    'single filer':`state.filingStatus='single';`,
    'IRA stretch heirs + passing ages':`state.passing[state.people[0].id]=80; state.passing[state.people[1].id]=92;`,
    'withdraw order':`state.withdrawOrder={enabled:true,steps:[]};`,
    'high inflation':`state.inflation=0.06;`,
    'one person without SS':`a.ss.enabled=false;`,
    'annuity exempt payout':`const an=defaultAnnuity(); an.value=250000; an.premium=150000; an.tax='exempt'; an.exemptPct=60; an.payout=15000; an.pb='initial'; a.annuities=[an]; const an3=defaultAnnuity(); an3.value=80000; an3.tax='taxable'; an3.pb='fixed'; an3.pbFixed=50000; an3.payout=8000; b.annuities=[an3];`,
    'withdraw order, every asset kind':`state.living=260000; a.wage.enabled=false; const re=defaultRealEstate(); re.balance=400000; re.basis=100000; re.sellMode='never'; a.realEstate=[re];
       state.withdrawOrder={enabled:true,steps:[{asset:'re:'+re.id},{asset:'pf:'+p1.id},{asset:'ira:'+a.id},{asset:'roth:'+b.id},{asset:'pf:'+p2.id},{asset:'pf:'+p3.id}]};`,
    'withdraw order, property shortfall sale to chosen portfolio':`state.living=300000; a.wage.enabled=false; const re=defaultRealEstate(); re.balance=700000; re.basis=100000; re.exempt=100000; re.sellTo=p3.id; re.niitStatus='business'; re.bene=true; a.realEstate=[re]; state.withdrawOrder={enabled:true,steps:[{asset:'re:'+re.id},{asset:'pf:'+p1.id}]};`,
    'property sold at passing, joint':`state.passing[a.id]=80; state.passing[b.id]=92; const re=defaultRealEstate(); re.balance=600000; re.basis=200000; re.bene=true; re.sellMode='passing'; re.sellTo=p3.id; a.realEstate=[re]; const re2=defaultRealEstate(); re2.balance=300000; re2.sellMode='passing'; b.realEstate=[re2];`,
    'basis swap with a low-basis IDGT':`state.basisSwap=true; const p4=defaultBrokeragePortfolio(300000); p4.payExp=true; p4.basisPct=95; p4.name='High basis'; b.brokerage=[p2,p4]; const p5=defaultBrokeragePortfolio(200000); p5.payExp=true; p5.basisPct=20; p5.idgt=true; p5.name='IDGT2'; a.brokerage=[p1,p3,p5];`,
    'conversion trigger itemized':`a.ira.convToRoth=true; a.roth.enabled=true; a.ira.convStartMode='itemized'; a.ira.convStartItemized=1000; state.ltc.enabled=true; state.ltc.people=[{startAge:70,cost:90000},{startAge:75,cost:90000}];`,
    'portfolio withdraw without NIIT room':`state.pfWithdraw={enabled:true,ltcgPct:20,acceptNiit:false,acceptTorpedo:false}; a.wage.enabled=false;`,
    'portfolio withdraw, torpedo accepted':`state.pfWithdraw={enabled:true,ltcgPct:5,acceptNiit:true,acceptTorpedo:true}; a.wage.enabled=false;`,
    'first to pass owns the annuity, property and inherited IRA':`state.passing[a.id]=78; state.passing[b.id]=93; const an=defaultAnnuity(); an.value=250000; an.payout=15000; an.bene=true; a.annuities=[an]; const re=defaultRealEstate(); re.balance=600000; re.basis=200000; re.bene=true; re.sellMode='passing'; a.realEstate=[re]; const i1=defaultInheritedIra(); i1.balance=300000; i1.startYear=THIS_YEAR+1; i1.bene=true; a.inhIras=[i1];`,
    'second to pass owns the annuity and property':`state.passing[a.id]=93; state.passing[b.id]=78; const an=defaultAnnuity(); an.value=250000; an.payout=15000; an.bene=true; b.annuities=[an]; const re=defaultRealEstate(); re.balance=600000; re.basis=200000; re.bene=true; re.sellMode='passing'; b.realEstate=[re]; b.ira.stretch=false; b.ira.bene=true; a.ira.bene=true;`,
    'guardrail no prosperity':`state.guardrail.enabled=true; state.guardrail.band=5; state.guardrail.cutPct=15; state.living=130000;`
  };
  for(const [name,code] of Object.entries(VARIANTS)){
    reseed(); J('{'+SINK+code.replace('const [a,b]=state.people;','')+'}'); out['sink '+name]=hash(J('JSON.stringify(computeProjection())'));
  }
  reseed(); J('{'+SINK+[VARIANTS['LTC'],VARIANTS['annuity'],VARIANTS['real estate sold at LTC']].map(c=>c.replace('const [a,b]=state.people;','')).join('')+'}');
  J(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); cfg.trials=12; cfg.ltc.prob=0.9; cfg.inflation.enabled=true; globalThis.__mcfg=cfg; globalThis.__scfg=JSON.parse(JSON.stringify(ST_DEFAULTS)); })()`);
  for(let t=0;t<6;t++) out['sink everything, MC trial '+t]=hash(J(`JSON.stringify(mcReplayTrial(__mcfg,${t}).proj)`));
  reseed(); J('{'+SINK+VARIANTS['guardrail'].replace('state.guardrail.prosperity=true;','state.guardrail.prosperity=true; state.guardrail.band=3; state.living=125000;')+'}');
  for(let t=0;t<6;t++) out['sink guardrail, MC trial '+t]=hash(J(`JSON.stringify(mcReplayTrial(__mcfg,${t}).proj)`));
  for(const id of J(`stScenarios(__scfg).map(s=>s.id)`)) out['sink everything, stress '+id]=hash(J(`JSON.stringify(stReplay(__scfg,${JSON.stringify(id)}).proj)`));
}

if(process.argv.includes('--update')){ fs.writeFileSync(GOLD,JSON.stringify(out,null,1)+'\n'); console.log('golden updated: '+Object.keys(out).length+' projections'); process.exit(0); }
const gold=JSON.parse(fs.readFileSync(GOLD,'utf8'));
let fails=0;
for(const k of new Set([...Object.keys(gold),...Object.keys(out)])){ const ok=gold[k]===out[k]; if(!ok){ fails++; console.log('FAIL '+k+' '+(gold[k]||'(missing)')+' -> '+(out[k]||'(missing)')); } }
console.log(fails?fails+' of '+Object.keys(out).length+' projections differ':'all '+Object.keys(out).length+' projections identical to the golden file');
process.exit(fails?1:0);
