// Tool dispatcher (display/chatTools.js) without a browser: node tests/chat/tools_test.js
const fs=require('fs'), path=require('path'), vm=require('vm');
const {makeCtx,run,ROOT}=require('./harness.js');
let fails=0,n=0; const ok=(c,m)=>{ n++; if(!c){ fails++; console.log('  FAIL: '+m);} else console.log('  ok: '+m); };
const J=(ctx,code)=>JSON.parse(run(ctx,'JSON.stringify('+code+')'));
const ctx=makeCtx('Couple_Heir.json');
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/display/chatTools.js'),'utf8'),ctx,{filename:'display/chatTools.js'});
const call=(name,args)=>{ ctx.__a=args; return run(ctx,'chatExecTool('+JSON.stringify(name)+',__a)'); };
const before=run(ctx,'JSON.stringify(state)');

let r=call('run_scenarios',{scenarios:[{id:'S1',label:'Living +10%',levers:[{lever:'living',pctChange:10}]},{id:'S2',label:'bad',levers:[{lever:'ssClaimAge',person:1,age:80}]}]});
ok(!r.isError&&r.response.scenarios.length===1&&r.response.rejected.length===1,'a bad scenario is rejected with its reason while the good one runs');
ok(r.cards.length===3&&r.cards[0].type==='summary'&&r.cards[1].data.chart==='assets','default cards: summary, assets, annualTax');
ok(r.response.scenarios[0].runId==='r1'&&call('get_rows',{run:'r1',fields:['totalAssets','federalTax'],fromAge:61,toAge:63}).response.csv.split('\n').length===4,'run ids are stored and usable by get_rows');
r=call('show_chart',{chart:'cumulativeTax',runs:['base','r1']}); ok(!r.isError&&r.cards[0].data.chart==='cumulativeTax','show_chart draws from stored runs');
r=call('show_chart',{chart:'outcomes',runs:['base','r1'],metric:'lifetimeTax'}); ok(!r.isError&&r.cards[0].data.type==='bar','outcomes chart with a chosen metric');
ok(call('show_chart',{chart:'nope',runs:['r1']}).isError,'unknown chart rejected'); ok(call('show_chart',{chart:'assets',runs:['r99']}).isError,'unknown run id rejected');
ok(call('get_rows',{run:'r1',fields:['password']}).isError,'unknown row field rejected');
ok(call('run_scenarios',{scenarios:[]}).isError,'empty scenario list rejected'); ok(call('run_scenarios',{scenarios:[{id:'a',label:'a',levers:[{lever:'living',pctChange:5}]}],charts:['bogus']}).isError,'unknown chart in charts rejected');
ok(call('run_scenarios',{__error:'Unexpected end of JSON'}).isError,'a truncated tool call (parse error) is answered with an error the model can fix');
ok(call('nope',{}).isError,'unknown tool rejected');
// the bug the browser test found: a sweep template has no value for the swept parameter
r=call('sweep',{template:{lever:'ssClaimAge',person:2},param:'age',values:[62,64,66,68,70],metric:'finalTotal'});
ok(!r.isError&&r.response.results.length===5&&r.cards[0].data.type==='sweep','sweep with a template lacking the swept parameter runs 5 values');
r=call('sweep',{template:{lever:'ssClaimAge',person:2},param:'age',values:[50,80]}); ok(r.isError&&r.response.rejected.length===2,'sweep values outside the lever range are all reported rejected');
ok(call('sweep',{template:{lever:'nope'},param:'age',values:[1,2]}).isError,'sweep with an unknown lever rejected');
ok(call('sweep',{template:{lever:'ssClaimAge',person:1},param:'age',values:[62]}).isError,'sweep with one value rejected');
// staleness
run(ctx,'state.living+=1'); r=call('show_chart',{chart:'assets',runs:['r1']}); ok(r.response.warning&&/edited/.test(r.response.warning),'show_chart warns that a run is stale after a plan edit');
run(ctx,'state.living-=1');
ok(run(ctx,'JSON.stringify(state)')===before,'live plan untouched by every tool call');
console.log('\n'+(n-fails)+'/'+n+' checks passed'); process.exit(fails?1:0);
