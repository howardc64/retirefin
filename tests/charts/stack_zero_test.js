// Stack total near the top of a stack (chartInfo.js) and the 0% line plugin (overlayPlugin.js).
const fs=require('fs'), vm=require('vm'), path=require('path');
const root=process.env.PLANNER_ROOT||path.join(__dirname,'..','..');
let pass=0, fail=0; const ck=(n,c)=>{ console.log((c?'PASS ':'FAIL ')+n); c?pass++:fail++; };
const ctx={document:{addEventListener(){},getElementById(){return null;},createElement(){return {style:{}};}},window:{},console};
ctx.window=ctx; vm.createContext(ctx);
const load=f=>vm.runInContext(fs.readFileSync(path.join(root,'js/display',f),'utf8')+'\n;this.__x=typeof ciElementAt!=="undefined"?{ciElementAt,CI_TOTAL_NAME}:null;',ctx,{filename:f});
// the plugin file needs Chart and BRACKET_COLOR
ctx.BRACKET_COLOR='#111'; ctx.Chart={registry:{plugins:{get:()=>null}},register(p){(ctx.__plugins=ctx.__plugins||{})[p.id]=p;}};
try{ load('overlayPlugin.js'); }catch(e){ console.log('overlayPlugin load note:',e.message); }
try{ load('chartInfo.js'); }catch(e){ console.log('chartInfo load note:',e.message); }
const X=ctx.__x;
ck('chartInfo exposes ciElementAt and the total names', !!X && X.CI_TOTAL_NAME.income==='Total income' && Object.keys(X.CI_TOTAL_NAME).length===13);
if(X){
  // two filled bands (10 + 20) and a dashed non-filled line (5) in the same stack; the stack top is at y=100
  const ds=[{fill:true,stack:'s',data:[10,10,10]},{fill:true,stack:'s',data:[20,20,20]},{fill:false,stack:'s',data:[5,5,5]}];
  const ys=[[150,150,150],[100,100,100],[70,70,70]];
  const chart={width:300,height:200,canvas:{getBoundingClientRect:()=>({left:0,top:0,width:300,height:200})},
    chartArea:{left:0,right:300,top:0,bottom:200}, data:{datasets:ds,labels:[60,61,62]},
    getElementsAtEventForMode:()=>[{index:1}], getDatasetMeta:i=>({hidden:false,data:[0,1,2].map(k=>({x:k*100,y:ys[i][k]}))}), isDatasetVisible:()=>true,
    scales:{x:{getPixelForValue:v=>(v-60)*100},y:{}}};
  const at=py=>X.ciElementAt(chart,{clientX:100,clientY:py,x:100,y:py},'income');
  let r; try{ r=at(93); }catch(e){ console.log('call note:',e.message); }
  ck('slightly above the top edge gives the stack total, filled bands only', r&&r.stackTotal===30);
  let onTop; try{ onTop=at(101); }catch(e){}
  ck('on or just below the top edge gives the top band, not the total', !onTop||onTop.stackTotal==null);
  let tooHigh; try{ tooHigh=at(60); }catch(e){}
  ck('well above the stack gives nothing', !tooHigh||tooHigh.stackTotal==null);
  let far; try{ far=at(130); }catch(e){}
  ck('well inside a band does not give the total', !far||far.stackTotal==null);
  let none; try{ none=X.ciElementAt(chart,{clientX:100,clientY:93,x:100,y:93},'somethingElse'); }catch(e){}
  ck('a chart without a total name never gives one', !none||none.stackTotal==null);
}
const zp=(ctx.__plugins||{}).zeroLine;
ck('zeroLine plugin registered', !!zp && zp.id==='zeroLine');
if(zp){
  const calls=[]; const c2={save(){},restore(){},beginPath(){},rect(){},clip(){},setLineDash(){},moveTo(x,y){calls.push(['m',y]);},lineTo(){calls.push(['l']);},stroke(){calls.push(['s']);}};
  const mk=y0=>({ctx:c2,chartArea:{left:0,right:100,top:10,bottom:110},scales:{y:{getPixelForValue:()=>y0}}});
  zp.beforeDatasetsDraw(mk(60),{},true); ck('draws at the pixel of 0', calls.some(c=>c[0]==='m'&&c[1]===60.5));
  calls.length=0; zp.beforeDatasetsDraw(mk(300),{},true); ck('draws nothing when 0 is off the chart', calls.length===0);
  calls.length=0; zp.beforeDatasetsDraw(mk(60),{},undefined); ck('draws nothing when not enabled', calls.length===0);
}
console.log('stack_zero_test: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
