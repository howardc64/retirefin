// Systemic panic / correlation convergence (monteCarlo.js, returns.panic). Run from the app folder:  PLANNER_ROOT=. PLAN=Samples/Couple_Heir.json node tests/mc/panic_test.js
const {makeCtx,loadPlan,run}=require('./mc_harness');
const plan=JSON.parse(require('fs').readFileSync(process.env.PLAN,'utf8'));
const ctx=makeCtx(); loadPlan(ctx,plan);
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const J=code=>run(ctx,code);
const cfgWith=(pn,extra)=>`(()=>{ const c=JSON.parse(JSON.stringify(MC_DEFAULTS)); Object.assign(c.returns,${JSON.stringify(extra||{})}); Object.assign(c.returns.panic,${JSON.stringify(pn)}); return c; })()`;

// 1. panic off: factors are exactly what they were before the feature (formula exp(sig z - sig^2/2) with the one-factor z)
const same=J(`(()=>{ const c=${cfgWith({enabled:false})}; let md=0; for(let t=0;t<30;t++){ const p=mcPath(c,t,40); for(let k=0;k<40;k+=7){ const sig=0.16, z=Math.sqrt(0.8)*p.zMkt[k]+Math.sqrt(0.2)*p.idio['pf:x']?.[k]; 
   const f=mcFactor(p,'pf:x',k), g=Math.exp(sig*(Math.sqrt(0.8)*p.zMkt[k]+Math.sqrt(0.2)*p.idio['pf:x'][k])-sig*sig/2); md=Math.max(md,Math.abs(f-g)); const fr=mcFactor(p,'re:h',k); md=Math.max(md,Math.abs(fr-Math.exp(0.08*p.zRe[k]-0.0032))); } } return md; })()`);
ok(same<1e-12,'panic off: factors unchanged (max diff '+same.toExponential(1)+')');
// 2. exact normalizer = numerical integral over the market shock
const nq=J(`(()=>{ const sig=0.16,r0=0.8,rp=0.95,t=-1.5; let E=0; const h=1e-3; for(let i=0;i<20000;i++){ const x=-10+(i+0.5)*h, rho=x<t?rp:r0, phi=Math.exp(-x*x/2)/Math.sqrt(2*Math.PI); E+=Math.exp(sig*Math.sqrt(rho)*x+sig*sig*(1-rho)/2)*phi*h; } return [E,mcPanicNorm(sig,r0,rp,t,1)]; })()`);
ok(Math.abs(nq[0]-nq[1])<1e-6,'normalizer matches direct integration ('+nq[0].toFixed(8)+' vs '+nq[1].toFixed(8)+')');
// 3. mean factor is 1 with panic on, at several years, for portfolios and property, hold 1 and 3
for(const hold of [1,3]){
  const m=J(`(()=>{ const c=${cfgWith({enabled:true,rhoPanic:0.95,holdYears:hold,includeRE:true,rhoRE:0.6})}; const N=30000, ks=[0,1,2,10], a=ks.map(()=>0), r=ks.map(()=>0);
    for(let t=0;t<N;t++){ const p=mcPath(c,t,15); ks.forEach((k,i)=>{ a[i]+=mcFactor(p,'pf:x',k); r[i]+=mcFactor(p,'re:h',k); }); } return {a:a.map(v=>v/N), r:r.map(v=>v/N)}; })()`);
  ok(m.a.every(v=>Math.abs(v-1)<0.006)&&m.r.every(v=>Math.abs(v-1)<0.003),'hold '+hold+': mean factor = 1 (portfolio '+m.a.map(v=>v.toFixed(4))+'; property '+m.r.map(v=>v.toFixed(4))+')');
}
// 4. how often a year is a panic year; what the correlation structure does in a panic year.
// The model is one-factor: z_asset = sqrt(rho_k) zMkt + sqrt(1-rho_k) idio. So (a) the loading on the market shock is sqrt(rho_k) and (b) the part that is NOT common has variance 1-rho_k.
// (A correlation measured only inside crash years is lower than rho because conditioning on a big drop shrinks the market's own variance: see the last check.)
const st=J(`(()=>{ const c=${cfgWith({enabled:true,rhoPanic:0.95,holdYears:1,includeRE:true,rhoRE:0.5,trigger:-1.5})}, off=${cfgWith({enabled:false})}, N=40000, k=5; let np=0;
  const D={p:[],n:[]}, X={p:[],n:[]}, Y={p:[],n:[]}, Z={p:[],n:[]}, W={p:[],n:[]}, CP=[], CO=[];
  for(let t=0;t<N;t++){ const p=mcPath(c,t,12), q=mcPath(off,t,12), g=p.panic[k]?'p':'n'; if(p.panic[k]) np++;
    const a=Math.log(mcFactor(p,'pf:a',k)), b=Math.log(mcFactor(p,'pf:b',k)), r=Math.log(mcFactor(p,'re:h',k));
    D[g].push(a-b); X[g].push(p.zMkt[k]); Y[g].push(a); Z[g].push(r);
    if(g==='p'){ CP.push([a,b]); CO.push([Math.log(mcFactor(q,'pf:a',k)),Math.log(mcFactor(q,'pf:b',k))]); } }
  const slope=(x,y)=>{ const n=x.length, mx=x.reduce((a,b)=>a+b,0)/n, my=y.reduce((a,b)=>a+b,0)/n; let sxy=0,sxx=0; for(let i=0;i<n;i++){ sxy+=(x[i]-mx)*(y[i]-my); sxx+=(x[i]-mx)**2; } return sxy/sxx; };
  const vr=a=>{ const m=a.reduce((x,y)=>x+y,0)/a.length; return a.reduce((x,y)=>x+(y-m)**2,0)/a.length; };
  const corr=P=>{ const x=P.map(v=>v[0]), y=P.map(v=>v[1]); const n=x.length, mx=x.reduce((a,b)=>a+b,0)/n, my=y.reduce((a,b)=>a+b,0)/n; let sxy=0,sxx=0,syy=0; for(let i=0;i<n;i++){ sxy+=(x[i]-mx)*(y[i]-my); sxx+=(x[i]-mx)**2; syy+=(y[i]-my)**2; } return sxy/Math.sqrt(sxx*syy); };
  return {freq:np/N, expect:mcPhi(-1.5), idioP:vr(D.p)/(2*0.16*0.16), idioN:vr(D.n)/(2*0.16*0.16), slP:slope(X.p,Y.p)/0.16, slN:slope(X.n,Y.n)/0.16, reP:slope(X.p,Z.p)/0.08, reN:slope(X.n,Z.n)/0.08, cOn:corr(CP), cOff:corr(CO)}; })()`);
ok(Math.abs(st.freq-st.expect)<0.004,'panic years: '+(st.freq*100).toFixed(2)+'% (a -1.5 sigma year has probability '+(st.expect*100).toFixed(2)+'%)');
ok(Math.abs(st.idioN-0.2)<0.02&&Math.abs(st.idioP-0.05)<0.01,'idiosyncratic variance share: normal years '+st.idioN.toFixed(3)+' (1-rho = 0.2), panic years '+st.idioP.toFixed(3)+' (0.05)');
ok(Math.abs(st.slN-Math.sqrt(0.8))<0.03&&Math.abs(st.slP-Math.sqrt(0.95))<0.03,'portfolio loading on the market shock: normal '+st.slN.toFixed(3)+' (sqrt .8 = '+Math.sqrt(0.8).toFixed(3)+'), panic '+st.slP.toFixed(3)+' (sqrt .95 = '+Math.sqrt(0.95).toFixed(3)+')');
ok(Math.abs(st.reN)<0.03&&Math.abs(st.reP-Math.sqrt(0.5))<0.03,'property loading on the market shock: normal '+st.reN.toFixed(3)+' (0), panic '+st.reP.toFixed(3)+' (sqrt .5 = '+Math.sqrt(0.5).toFixed(3)+')');
ok(st.cOn>st.cOff+0.25,'measured inside crash years two portfolios move together much more with panic on: correlation '+st.cOff.toFixed(2)+' -> '+st.cOn.toFixed(2));
const hf=J(`(()=>{ const c=${cfgWith({enabled:true,holdYears:2})}; let n=0,N=40000; for(let t=0;t<N;t++){ const p=mcPath(c,t,12); if(p.panic[5]) n++; } return [n/N, 1-Math.pow(1-mcPhi(-1.5),2)]; })()`);
ok(Math.abs(hf[0]-hf[1])<0.005,'hold 2 years: panic share '+(hf[0]*100).toFixed(2)+'% vs '+(hf[1]*100).toFixed(2)+'% expected');
// 5. includeRE off leaves property alone; rhoPanic below rho is not a surge (treated as no change)
const re=J(`(()=>{ const c=${cfgWith({enabled:true,includeRE:false})}; let md=0; for(let t=0;t<200;t++){ const p=mcPath(c,t,12); for(let k=0;k<12;k++) md=Math.max(md,Math.abs(mcFactor(p,'re:h',k)-Math.exp(0.08*p.zRe[k]-0.0032))); } return md; })()`);
ok(re<1e-12,'includeRE off: property factors untouched');
const low=J(`(()=>{ const c=${cfgWith({enabled:true,rhoPanic:0.5,includeRE:false})}, d=${cfgWith({enabled:false})}; let md=0; for(let t=0;t<200;t++){ const p=mcPath(c,t,12), q=mcPath(d,t,12); for(let k=0;k<12;k++) md=Math.max(md,Math.abs(mcFactor(p,'pf:x',k)-mcFactor(q,'pf:x',k))); } return md; })()`);
ok(low<1e-9,'a panic rho below the normal rho changes nothing (max diff '+low.toExponential(1)+')');
// 6. trials: panic years counted; same seed same result; aggregate success not higher than without panic
const tr=J(`(()=>{ const on=${cfgWith({enabled:true,rhoPanic:0.95,holdYears:2})}, off=${cfgWith({enabled:false})}; on.trials=off.trials=250;
  const a=mcRunRange(on,0,250), a2=mcRunRange(on,0,3), b=mcRunRange(off,0,250); const sa=mcSummarize(a), sb=mcSummarize(b), fr=mcFailureReasons(a);
  return {succOn:sa.successRate, succOff:sb.successRate, pan:sa.panic, offPan:sb.panic, repro:a2.every((r,i)=>r.shortfall===a[i].shortfall&&r.panic10===a[i].panic10), factor:fr.factors.some(f=>/panic/.test(f.label)), offFactor:mcFailureReasons(b).factors.some(f=>/panic/.test(f.label))}; })()`);
ok(tr.repro,'same seed + trial index -> identical result with panic on');
ok(tr.pan&&tr.pan.pFirst10>0.1&&tr.offPan===null&&tr.factor&&!tr.offFactor,'summary: panic block and failure factor only when on ('+JSON.stringify(tr.pan)+')');
ok(tr.succOn<=tr.succOff+0.01,'success with panic '+(tr.succOn*100).toFixed(1)+'% vs without '+(tr.succOff*100).toFixed(1)+'% (same seeds)');
ok(J('MC_HOOK===null&&MC_INFL===null'),'engine hooks restored');
console.log(fails?('\n'+fails+' FAILED'):'\nall passed'); process.exit(fails?1:0);
