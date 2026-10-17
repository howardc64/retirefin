// Tests for the random-inheritance part of the Monte Carlo add-on. Plan-agnostic: HEIR=<plan with an inheritance source> DONOR=<that source's plan file>
//   HEIR=heir.json DONOR=donor.json node tests/mc_inherit_test.js
const fs=require('fs'), path=require('path'), vm=require('vm');
const {makeCtx,loadPlan,run}=require('./mc_harness');
if(!process.env.HEIR||!process.env.DONOR){ console.log('set HEIR and DONOR to plan files'); process.exit(2); }
const heir=JSON.parse(fs.readFileSync(process.env.HEIR,'utf8')), donorPlan=JSON.parse(fs.readFileSync(process.env.DONOR,'utf8'));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const ctx=makeCtx(); loadPlan(ctx,heir); ctx.__donor=donorPlan;
const J=code=>run(ctx,code);

// which person/source inherits from the donor file?
const loc=J(`(()=>{ for(let i=0;i<state.people.length;i++){ const s=(state.people[i].inheritance&&state.people[i].inheritance.sources)||[]; if(s.length) return {i, file:s[0].file, n:s[0].assets.length, pct:s[0].assets.filter(a=>a.pct>0).length}; } return null; })()`);
if(!loc){ console.log('HEIR has no inheritance source'); process.exit(2); }
console.log('heir person',loc.i,'| source file',loc.file,'|',loc.n,'assets,',loc.pct,'with a % set');

// Re-import the donor through the REAL import code (this is what the Import button does).
J(`(()=>{ const res=inhExtractFromState(hydrateState(__donor)); inhApplySource(state.people[${loc.i}], ${JSON.stringify(loc.file)}, res); syncInheritance(${loc.i}); })()`);
// A donor whose asset keys differ from the imported ones leaves every % at 0: give each asset 50% so the suite still exercises the inheritance path.
J(`(()=>{ const p=state.people[${loc.i}], s=p.inheritance.sources[0]; if(!s.assets.some(a=>a.pct>0)){ s.assets.forEach(a=>{ a.pct=50; }); syncInheritance(${loc.i}); } })()`);
const src=J(`(()=>{ const s=state.people[${loc.i}].inheritance.sources[0]; return {donor:!!s.donor, keys:s.assets.map(a=>a.key), trajKeys:s.donor?Object.keys(s.donor.traj):[], rows:s.donor?Object.values(s.donor.traj)[0].v.length:0, people:s.donor?s.donor.people.length:0, size:JSON.stringify(s.donor||{}).length, startYear:s.startYear} })()`);
ok(src.donor,'import stores a donor block on the source ('+src.size+' bytes, '+src.rows+' yearly rows, '+src.people+' person(s))');
ok(src.keys.every(k=>src.trajKeys.includes(k)),'every imported asset has a value table ('+src.trajKeys.length+' of '+src.keys.length+')');

// 1. EXACTNESS: with the donor's own LTC off, the table at its planned last-passing row == the importer's value
ctx.__noltc=JSON.parse(JSON.stringify(donorPlan)); ctx.__noltc.ltc=Object.assign({},ctx.__noltc.ltc,{enabled:false});
const ex=J(`(()=>{ const res=inhExtractFromState(hydrateState(__noltc)); const idx=res.startYear-1-res.donor.year0; let worst=0; const rows=[]; res.assets.forEach(a=>{ const t=res.donor.traj[a.key]; const d=Math.abs(t.v[idx]-a.value); worst=Math.max(worst,d); rows.push([a.type,a.value,t.v[idx]]); }); return {worst,idx,rows}; })()`);
ok(ex.worst<=1,'table == importer value at the planned last-passing row for every asset (donor LTC off): max diff $'+ex.worst+' over '+ex.rows.length+' assets');

// 2. persistence + sanitizer
const rt=J(`(()=>{ const s=JSON.parse(JSON.stringify(state)); const h=hydrateState(s); const a=state.people[${loc.i}].inheritance.sources[0].donor, b=h.people[${loc.i}].inheritance.sources[0].donor; const c=sanitizeDonorBlock(JSON.parse(JSON.stringify(a))); return {saved:JSON.stringify(a)===JSON.stringify(b), clean:!!c&&JSON.stringify(c)===JSON.stringify(a)}; })()`);
ok(rt.saved,'donor block survives save + load (hydrateState keeps it)');
ok(rt.clean,'sanitizeDonorBlock accepts a genuine block unchanged');
const bad=J(`(()=>{ const a=state.people[${loc.i}].inheritance.sources[0].donor, mk=f=>{ const c=JSON.parse(JSON.stringify(a)); f(c); return sanitizeDonorBlock(c); };
  const k=Object.keys(a.traj)[0];
  return [ mk(c=>{c.v=2}), mk(c=>{c.people=[]}), mk(c=>{c.traj[k].v[0]='x'}), mk(c=>{c.traj[k].v=new Array(500).fill(1)}), mk(c=>{c.traj[k].cls='zz'}), mk(c=>{c.people[0].birthYear=NaN}), sanitizeDonorBlock(null), sanitizeDonorBlock('x') ].map(x=>x===null) })()`);
ok(bad.every(Boolean),'sanitizeDonorBlock rejects '+bad.length+' kinds of malformed block');

// 3. all randomness OFF => identical to the deterministic projection (the inheritance block must be inert)
const refCode=`(()=>{ const p=computeProjection(); return p.rows.map(r=>{let f=0; r.portfoliosByPerson.forEach(l=>l.forEach(e=>{if(e&&e.balance>0)f+=e.balance})); r.iraBalByPerson.forEach(v=>f+=v||0); r.rothBalByPerson.forEach(v=>f+=v||0); (r.inhIraByPerson||[]).forEach(l=>l.forEach(e=>{if(e&&e.live)f+=e.balance||0})); return f}) })()`;
const ref=J(refCode);
const trial=(patch,idx)=>{ ctx.__p=patch; return J(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); const P=__p; for(const k in P) Object.assign(cfg[k],P[k]); const m=mcRunTrial(cfg,${idx||7}); return {n:m.n,fin:Array.from(m.fin),shift:m.inhShift,ratio:m.inhRatio,inhN:m.inhN,fail:m.failK}; })()`); };
const OFF={returns:{enabled:false},mortality:{enabled:false},ltc:{enabled:false},inflation:{enabled:false},inheritance:{enabled:true}};
const maxd=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));
let t=trial(OFF);
ok(t.n===ref.length&&maxd(t.fin,ref)<1e-6&&t.inhN>0,'every random part off, inheritance on == deterministic (max diff '+maxd(t.fin,ref).toExponential(1)+', '+t.inhN+' source applied)');
// 3b. an old plan whose source has no donor block still works and is unchanged
J(`delete state.people[${loc.i}].inheritance.sources[0].donor`);
t=trial({...OFF,returns:{enabled:true},mortality:{enabled:true},ltc:{enabled:true},inflation:{enabled:true}});
ok(t.inhN===0,'source without a donor block: inheritance left as planned (no error)');
J(`(()=>{ const res=inhExtractFromState(hydrateState(__donor)); inhApplySource(state.people[${loc.i}], ${JSON.stringify(loc.file)}, res); syncInheritance(${loc.i}); })()`);

// 4. property tests of each random part
const stat=(patch,N)=>{ ctx.__p=patch; ctx.__N=N; return J(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); const P=__p; for(const k in P) Object.assign(cfg[k],P[k]); let sh=[],rt=[]; for(let i=0;i<__N;i++){ const m=mcRunTrial(cfg,i); sh.push(m.inhShift); rt.push(m.inhRatio); } const mean=a=>a.reduce((x,y)=>x+y,0)/a.length; return {shift:{mean:mean(sh),min:Math.min(...sh),max:Math.max(...sh)}, ratio:{mean:mean(rt),min:Math.min(...rt),max:Math.max(...rt)}}; })()`); };
let a=stat({...OFF,mortality:{enabled:true,mode:55,scale:3}},40);
ok(a.shift.max<0,'donor passing very early -> inheritance arrives earlier (shift '+a.shift.min+'..'+a.shift.max+' yrs)');
a=stat({...OFF,mortality:{enabled:true,mode:112,scale:3}},40);
ok(a.shift.mean>5,'donor living very long -> inheritance arrives later (shift '+a.shift.min+'..'+a.shift.max+' yrs)');
a=stat({...OFF,mortality:{enabled:true}},300);
ok(a.shift.min<0&&a.shift.max>0,'default lifespan model -> arrival year varies both ways (shift mean '+a.shift.mean.toFixed(1)+', range '+a.shift.min+'..'+a.shift.max+')');
const hc=stat({...OFF,inheritance:{enabled:true,haircutPct:20}},5);
ok(Math.abs(hc.ratio.mean-0.8)<1e-3,'20% haircut -> inherited amounts exactly 0.80 of plan (got '+hc.ratio.mean.toFixed(4)+')');
const lt0=stat({...OFF,ltc:{enabled:true,prob:0,medianYears:2}},200), lt1=stat({...OFF,ltc:{enabled:true,prob:1,medianYears:6}},200);
ok(lt1.ratio.mean<lt0.ratio.mean,'more donor Long Term Care -> smaller inheritance (mean ratio '+lt0.ratio.mean.toFixed(3)+' with none vs '+lt1.ratio.mean.toFixed(3)+' with heavy care)');
// mean preservation needs a donor without a fixed-dollar care bill (that bill makes the payoff convex, so its mean legitimately differs from the plan's)
J(`(()=>{ const res=inhExtractFromState(hydrateState(__noltc)); inhApplySource(state.people[${loc.i}], ${JSON.stringify(loc.file)}, res); syncInheritance(${loc.i}); })()`);
const rr=stat({...OFF,returns:{enabled:true}},1500);
ok(Math.abs(rr.ratio.mean-1)<0.08,'random returns are mean-preserving for the inheritance, donor without care costs (mean ratio '+rr.ratio.mean.toFixed(3)+', range '+rr.ratio.min.toFixed(2)+'..'+rr.ratio.max.toFixed(2)+')');
const rr0=stat({...OFF,returns:{enabled:false}},5);
ok(Math.abs(rr0.ratio.mean-1)<1e-9,'returns off -> inheritance exactly as planned (ratio '+rr0.ratio.mean.toFixed(6)+')');
J(`(()=>{ const res=inhExtractFromState(hydrateState(__donor)); inhApplySource(state.people[${loc.i}], ${JSON.stringify(loc.file)}, res); syncInheritance(${loc.i}); })()`);
const same=J(`JSON.stringify(mcRunTrial(Object.assign(JSON.parse(JSON.stringify(MC_DEFAULTS))),11).fin)===JSON.stringify(mcRunTrial(JSON.parse(JSON.stringify(MC_DEFAULTS)),11).fin)`);
ok(same,'same seed + trial -> identical result with random inheritance on');

// 5. the question that matters: how much does the fixed-inheritance assumption flatter the plan?
const summ=(inhOn)=>{ ctx.__on=inhOn; return J(`(()=>{ const cfg=JSON.parse(JSON.stringify(MC_DEFAULTS)); cfg.inheritance.enabled=__on; const r=mcRunRange(cfg,0,600); const e=r.map(x=>x.estateFin+x.estateRe).sort((a,b)=>a-b); return {succ:1-r.filter(x=>x.failK>=0).length/r.length, p10:mcQuantile(e,.1), p50:mcQuantile(e,.5)}; })()`); };
const A=summ(false), B=summ(true), M=v=>'$'+(v/1e6).toFixed(2)+'M';
console.log('\n  inheritance fixed as planned : funded '+(A.succ*100).toFixed(1)+'%  assets p10 '+M(A.p10)+' median '+M(A.p50));
console.log('  inheritance random           : funded '+(B.succ*100).toFixed(1)+'%  assets p10 '+M(B.p10)+' median '+M(B.p50));
console.log(fails?('\n'+fails+' FAILED'):'\nall passed'); process.exit(fails?1:0);
