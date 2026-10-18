// updateChartInPlace keeps dataset object identity when the dataset list changes length
const fs=require('fs'),vm=require('vm'); const root=process.argv[2]||process.cwd();   // run from the app folder: node tests/inplace_update_test.js
const src=fs.readFileSync(root+'/js/display/chartHelpers.js','utf8'); const a=src.indexOf('function updateChartInPlace'), b=src.indexOf('// Draw or refresh one line chart');
const ctx={lastProjection:null,console}; vm.createContext(ctx); vm.runInContext(src.slice(a,b),ctx);
const mk=(l,d)=>({label:l,data:d.slice(),borderColor:'x'});
const chart={options:{scales:{}},data:{labels:[1,2,3],datasets:[mk('A',[1,2,3]),mk('Eff',[9,9,9])]}};
const oldA=chart.data.datasets[0], oldE=chart.data.datasets[1];
ctx.chart=chart; ctx.nd=[mk('A',[4,5,6]),mk('IRMAA',[7,7,7]),mk('Eff',[8,8,8])];
vm.runInContext("updateChartInPlace(chart,[1,2,3],nd)",ctx);
const D=chart.data.datasets;
console.log(D.map(d=>d.label+':'+d.data), 'identity kept A:',D[0]===oldA,'Eff:',D[2]===oldE,'IRMAA new:',D[1].label==='IRMAA');
// and removal
ctx.nd2=[mk('A',[1,1,1]),mk('Eff',[2,2,2])]; vm.runInContext("updateChartInPlace(chart,[1,2,3],nd2)",ctx);
console.log(chart.data.datasets.map(d=>d.label), chart.data.datasets[0]===oldA, chart.data.datasets[1]===oldE);
