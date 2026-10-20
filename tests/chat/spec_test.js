// Scenario-spec layer: node tests/chat/spec_test.js   (exit 0 = all pass)
const {makeCtx,run}=require('./harness.js');
let fails=0, n=0;
const ok=(c,m)=>{ n++; if(!c){ fails++; console.log('  FAIL: '+m); } else console.log('  ok: '+m); };
const J=(ctx,code)=>JSON.parse(run(ctx,'JSON.stringify('+code+')'));

for(const plan of ['Couple_Heir.json','Widow.json']){
  console.log('\n== '+plan);
  const ctx=makeCtx(plan);
  const before=run(ctx,'JSON.stringify(state)');
  const R=(scs)=>{ ctx.__s=scs; return run(ctx,scs.length>6?'specRunBatchUncapped(__s)':'specRunBatch(__s)'); };
  const kp=(b,i)=>JSON.stringify(b.scenarios[i].kpis);

  // 1. base equals computeProjection()
  const b0=R([{id:'S1',label:'x',levers:[{lever:'inflation',pct:3}]}]);
  ctx.__b=b0;
  ok(run(ctx,'JSON.stringify(__b.base.proj.rows)===JSON.stringify(computeProjection().rows)'),'base run equals computeProjection() exactly');
  // 2. state untouched
  ok(run(ctx,'JSON.stringify(state)')===before,'live state deep-equal after runs');
  ok(run(ctx,'MC_HOOK===null&&MC_INFL===null&&REC_RATES===true'),'engine hooks restored');

  // 3. validation
  const V=l=>{ ctx.__l=l; return J(ctx,'specValidateLevers(__l)'); };
  ok(V([{lever:'nope'}]).errors[0].includes('unknown lever'),'unknown lever rejected');
  ok(V([{lever:'ssClaimAge',person:1,age:75}]).errors[0].includes('between 62 and 70'),'out-of-range rejected with the range');
  ok(V([{lever:'ssClaimAge',person:1}]).errors[0].includes('missing required parameter "age"'),'missing parameter rejected');
  ok(V([{lever:'ssClaimAge',person:1,age:70,bogus:1}]).errors[0].includes('not a parameter'),'unknown parameter rejected');
  ok(V([{lever:'ssClaimAge',person:'1',age:'68'}]).errors.length===0,'numeric strings are coerced');
  ok(V([{lever:'living',amount:5,pctChange:5}]).errors.length===1,'living needs exactly one of amount/pctChange');
  ok(V([{lever:'rothConversion',person:1,mode:'fixed'}]).errors.length===1,'fixed conversion needs an amount');
  ok(V([{lever:'rothConversion',person:1,mode:'fixed',amount:1e3,endAge:75}]).errors[0].includes('not a parameter'),'conversion endAge rejected (engine has none)');
  ok(V([]).errors.length===1,'empty lever list rejected');
  ok(V([{lever:'marketStress',kind:'custom'}]).errors.length===1,'custom market path needs returnsPct');

  // 4. every lever either changes results, or is reported ignored/noEffect — never silently identical
  const people=run(ctx,'state.filingStatus==="married"?2:1');
  const cases=[
    {lever:'ssClaimAge',person:1,age:62},{lever:'ssClaimAge',person:people,age:70},{lever:'living',pctChange:20},{lever:'inflation',pct:5},{lever:'returns',deltaPct:-2},
    {lever:'passingAge',person:1,age:99},{lever:'stopWorking',person:1,age:60},{lever:'pension',person:1,amount:20000,startAge:70},
    {lever:'rothConversion',person:1,mode:'fixed',amount:60000},{lever:'rothConversion',person:1,mode:'bracket',ordPct:24,irmaaPct:40},
    {lever:'ltc',person:1,startAge:80,cost:150000},{lever:'medShock',person:1,age:75,years:3,cost:80000},{lever:'guardrail',enabled:true},{lever:'guardrail',enabled:false},
    {lever:'portfolioSales',enabled:true,ltcgPct:15},{lever:'stateTax',enabled:true,state:'CA'},{lever:'marketStress',kind:'lostDecade'},{lever:'marketStress',kind:'custom',returnsPct:[-30,-10,5]}
  ];
  const bb=R(cases.map((c,i)=>({id:'C'+i,label:c.lever,levers:[c]})));
  ctx.__bb=bb; const base=JSON.stringify(J(ctx,'__bb.base.kpis'));
  bb.scenarios.forEach((r,i)=>{
    const st=r.notes[0].status, differs=JSON.stringify(r.kpis)!==base;
    const label=JSON.stringify(cases[i]);
    ok((st==='applied'&&r.changed)||st==='ignored'||st==='noEffect',label+' → '+st+(r.notes[0].note?' ('+r.notes[0].note+')':''));
    if(st==='applied') ok(r.changed,label+' applied lever changed the engine output (fingerprint)');
  });
  ok(run(ctx,'JSON.stringify(state)')===before,'state still untouched after 18 levers');
  console.log('  elapsed check: base kpis',base.slice(0,160));

  // 5. noEffect detection: a guardrail switched off when already off
  const g=R([{id:'G',label:'g',levers:[{lever:'guardrail',enabled:false}]}]);
  ok(g.scenarios[0].notes[0].status==='noEffect','inert lever is flagged noEffect');
  // multi-lever: inert lever flagged individually
  const mlt=R([{id:'M',label:'m',levers:[{lever:'living',pctChange:10},{lever:'guardrail',enabled:false}]}]);
  ok(mlt.scenarios[0].notes[0].status==='applied'&&mlt.scenarios[0].notes[1].status==='noEffect','multi-lever: only the inert lever flagged');

  // 6. market stress hurts and hook is cleared
  const ms=R([{id:'M',label:'m',levers:[{lever:'marketStress',kind:'lostDecade',startsAt:'now'}]}]);
  ok(ms.scenarios[0].kpis.finalTotal<ms.base.kpis.finalTotal,'Lost Decade ends with fewer assets than the plan');
  ok(run(ctx,'MC_HOOK===null')&&ms.scenarios[0].market&&ms.scenarios[0].market.years===10,'stress path recorded (10 years), hook cleared');

  // 7. sweep
  ctx.__t={lever:'ssClaimAge',person:1,age:67}; 
  const sw=run(ctx,'specSweep({lever:"ssClaimAge",person:1},"age",[62,63,64,65,66,67,68,69,70])');
  ok(sw.scenarios.length===9&&sw.sweep.values.length===9,'sweep returns 9 runs');
  let threw=false; try{ run(ctx,'specSweep({lever:"ssClaimAge",person:1},"age",[62])'); }catch(e){ threw=true; } ok(threw,'sweep with 1 value rejected');

  // 8. chart data
  ctx.__all=[bb.base].concat(bb.scenarios.slice(0,3));
  for(const c of Object.keys(J(ctx,'SPEC_CHARTS'))){
    ctx.__c=c; const d=J(ctx,'specChartData(__c,__all)');
    ok(d.datasets.length>0&&d.datasets.every(x=>x.data.length===(c==='outcomes'?d.labels.length:d.labels.length)),'chart "'+c+'" has aligned datasets ('+d.datasets.length+' series, '+d.labels.length+' points)');
  }
  // 9. rows csv
  ctx.__r=bb.scenarios[2];
  const a0=run(ctx,'Math.round(__r.proj.rows[0].age0)');
  const csv=run(ctx,'specRowsCsv(__r,["totalAssets","federalTax"],'+a0+','+(a0+3)+')');
  ok(csv.split('\n').length===5&&csv.startsWith('age,totalAssets,federalTax'),'get_rows returns CSV');
  threw=false; try{ run(ctx,'specRowsCsv(__r,["hack"])'); }catch(e){ threw=true; } ok(threw,'unknown row field rejected');
  // 10. model summary is compact
  ctx.__bat=bb; const sum=JSON.stringify(J(ctx,'specModelSummary(__bat)'));
  ok(sum.length<60000,'summary for 18 scenarios is '+sum.length+' chars (~'+Math.round(sum.length/3.5)+' tokens)');
  // 11. tool schemas
  const sch=J(ctx,'specToolSchemas()'); const txt=JSON.stringify(sch);
  ok(sch.length===4&&!txt.includes('additionalProperties')&&!txt.includes('oneOf'),'tool schemas: 4 tools, plain JSON-schema subset');
}
// single vs married specifics
{
  const ctx=makeCtx('Widow.json');
  ctx.__s=[{id:'A',label:'a',levers:[{lever:'ssClaimAge',person:2,age:70}]}];
  const r=run(ctx,'specRunBatch(__s)');
  ok(r.scenarios[0].notes[0].status==='ignored'&&r.scenarios[0].notes[0].note.includes('not in this plan'),'person 2 on a single plan is ignored with a reason');
}
console.log('\n'+(n-fails)+'/'+n+' checks passed');
process.exit(fails?1:0);
