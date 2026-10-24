'use strict';
// ═══════════════════════════════════════════════════════════════
// PLANS / STORE — the master plan list. One record per plan, whatever defined it (A/B scenario, stress test, Monte Carlo trial, saved market path, what-if).
// No DOM and no engine calls except through plEnsureSummary(). Design: docs/PLAN_STORE_DESIGN.md.
//
//   Plan {id, key, label, owner, origin:{kind, groupId, ref}, input:{state}|{baseKey,baseFingerprint,overlay|draw}, meta, fingerprint, summary|null, summaryFor, createdAt, updatedAt, pinned}
//     id           opaque and stable for the life of the plan ('p1', 'p2' …); references held by a chart view or an LLM survive a re-run
//     key          semantic, unique: 'scn:B', 'st:lostDecade', 'mc:trial:17', 'stmc:lostDecade:17', 'mkt:<pathId>'. Producers upsert on it, so a re-run updates in place
//     owner        the producer that maintains the plan; plReconcile(owner, plans) adds, updates and removes only that owner's plans
//     fingerprint  hash of input.state (UI ignored); summary is computed lazily by plEnsureSummary and is valid while summaryFor === fingerprint
//
//   Producers are registered with plRegisterProducer(name, fn); plSyncAll() runs them (pull model: a reader calls it before reading, nothing hooks edits).
// ═══════════════════════════════════════════════════════════════
const PL_SCHEMA=1;
let PL_BY_ID=new Map(), PL_BY_KEY=new Map(), PL_SEQ=0, PL_LISTENERS=[], PL_PRODUCERS=[];

function plEmit(ev){ PL_LISTENERS.slice().forEach(fn=>{ try{ fn(ev); }catch(e){} }); }
function plSubscribe(fn){ PL_LISTENERS.push(fn); return ()=>{ PL_LISTENERS=PL_LISTENERS.filter(f=>f!==fn); }; }

function plGet(ref){ return PL_BY_ID.get(ref)||PL_BY_KEY.get(ref)||null; }          // by id or by key
function plList(){ return Array.from(PL_BY_ID.values()); }
// find({owner, kind, groupId, key (prefix with *), label (substring, case-insensitive), stale}) → plans in insertion order
function plFind(q){
  q=q||{}; const lab=q.label?String(q.label).toLowerCase():null, pre=q.key&&q.key.endsWith('*')?q.key.slice(0,-1):null;
  return plList().filter(p=>(!q.owner||p.owner===q.owner)&&(!q.kind||p.origin.kind===q.kind)&&(q.groupId==null||p.origin.groupId===q.groupId)
    &&(!q.key||(pre!=null?p.key.startsWith(pre):p.key===q.key))&&(!lab||p.label.toLowerCase().includes(lab)));
}

// Add or update the plan with this key. Keeps id, createdAt and pinned; the summary is dropped only when the input actually changed.
// spec: {key, label, owner, origin, input:{state} | {baseKey, baseFingerprint, overlay|draw}, meta?, summary?} → the stored plan.
//   meta     small JSON the producer wants kept beside the plan (e.g. a stress row's shock figures); replaced on every upsert, never part of the fingerprint
//   summary  an already-known summary, or a function returning one (a producer that has the engine's numbers at hand seeds it, so the engine is not run again);
//            used only when the plan has no valid summary, so a function is only called then
const plCloneInput=inp=>inp.state?{state:plClone(inp.state)}:{baseKey:inp.baseKey,baseFingerprint:inp.baseFingerprint,overlay:plClone(inp.overlay||null),draw:plClone(inp.draw||null)};
function plUpsert(spec){
  if(!spec||!spec.key||!spec.input||!(spec.input.state||spec.input.baseKey)) throw new Error('plUpsert needs {key, input:{state}|{baseKey,baseFingerprint,overlay|draw}}');
  const fp=plInputFingerprint(spec.input), now=Date.now(), old=PL_BY_KEY.get(spec.key), label=String(spec.label||spec.key), metaJ=JSON.stringify(spec.meta==null?null:spec.meta);
  const origin=Object.assign({kind:'scenario',groupId:null,ref:null},spec.origin||(old&&old.origin)||{});
  let p=old, changed=false;
  if(!old){
    p={id:'p'+(++PL_SEQ), key:spec.key, label, owner:spec.owner||null, origin, input:plCloneInput(spec.input), fingerprint:fp, summary:null, summaryFor:null,
      meta:spec.meta==null?null:plClone(spec.meta), createdAt:now, updatedAt:now, pinned:!!spec.pinned};
    PL_BY_ID.set(p.id,p); PL_BY_KEY.set(p.key,p); changed=true;
  } else {
    if(old.fingerprint!==fp){ old.input=plCloneInput(spec.input); old.fingerprint=fp; old.summary=null; old.summaryFor=null; changed=true; }
    else if(spec.input.baseKey&&old.input.baseKey!==spec.input.baseKey){ old.input.baseKey=spec.input.baseKey; changed=true; }   // same run, its base scenario is now named differently (the user switched scenarios)
    if(old.label!==label||JSON.stringify(old.origin)!==JSON.stringify(origin)||JSON.stringify(old.meta)!==metaJ){ old.label=label; old.origin=origin; old.meta=spec.meta==null?null:plClone(spec.meta); changed=true; }
    if(spec.pinned&&!old.pinned){ old.pinned=true; changed=true; }
    if(changed) old.updatedAt=now;
  }
  if(spec.summary&&(!p.summary||p.summaryFor!==p.fingerprint)){ const sm=typeof spec.summary==='function'?spec.summary():spec.summary; if(sm){ p.summary=plClone(sm); p.summaryFor=p.fingerprint; changed=true; } }
  if(changed) plEmit({type:old?'update':'add',plan:p});
  return p;
}
function plRemove(ref){
  const p=plGet(ref); if(!p) return false;
  PL_BY_ID.delete(p.id); PL_BY_KEY.delete(p.key); plEmit({type:'remove',plan:p}); return true;
}
// A group's members go with it (a deleted stress or Monte Carlo run takes its plans along).
function plRemoveGroup(groupId){ return plFind({groupId}).filter(p=>plRemove(p.id)).length; }
function plReset(){ const all=plList(); PL_BY_ID=new Map(); PL_BY_KEY=new Map(); all.forEach(p=>plEmit({type:'remove',plan:p})); }

// The producer owns a set of plans: upsert every spec, remove its other plans (the user deleted them, or the run was replaced). Pinned plans survive a
// removal only if the producer lists them again; pinning is for the UI to keep a promoted trial between runs, so a producer may pass keepPinned:true.
// Tombstones: plans a user deleted from a derived run (a stress row, a trial) are skipped until the run is replaced. The producer passes opts.token (any value that
// changes when the source run is replaced, e.g. the results object); a new token forgets that owner's tombstones.
let PL_DEAD=new Map(), PL_TOKEN=new Map();
function plTombstone(owner,key){ if(!PL_DEAD.has(owner)) PL_DEAD.set(owner,new Set()); PL_DEAD.get(owner).add(key); }
function plUnTombstone(owner,key){ const d=PL_DEAD.get(owner); if(d) d.delete(key); }
function plReconcile(owner, specs, opts){
  opts=opts||{};
  if('token' in opts&&PL_TOKEN.get(owner)!==opts.token){ PL_TOKEN.set(owner,opts.token); PL_DEAD.delete(owner); }
  const dead=PL_DEAD.get(owner); if(dead&&dead.size) specs=specs.filter(sp=>!dead.has(sp.key));
  const keep=new Set(), out=specs.map(sp=>{ const p=plUpsert(Object.assign({},sp,{owner})); keep.add(p.key); return p; });
  plFind({owner}).forEach(p=>{ if(!keep.has(p.key)&&!(opts.keepPinned&&p.pinned)) plRemove(p.id); });
  return out;
}

// A producer: fn() syncs its plans from its source; opts.remove(plan) → {ok, why?} deletes the plan AT THE SOURCE (the store is an index over the sources, so
// removing only the record would bring it back on the next sync). A producer without remove cannot be deleted from.
function plRegisterProducer(name,fn,opts){ PL_PRODUCERS=PL_PRODUCERS.filter(p=>p.name!==name); PL_PRODUCERS.push({name,fn,remove:opts&&opts.remove||null}); }
function plSyncAll(){ PL_PRODUCERS.forEach(p=>{ try{ p.fn(); }catch(e){ if(typeof console!=='undefined') console.warn('plan producer '+p.name+' failed',e); } }); return plList(); }
function plDelete(ref){
  plSyncAll(); const p=plGet(ref); if(!p) return {ok:false,why:'no such plan "'+ref+'"'};
  const prod=PL_PRODUCERS.find(x=>x.name===p.owner); if(!prod||!prod.remove) return {ok:false,why:'plans of kind "'+p.origin.kind+'" cannot be deleted'};
  let r; try{ r=prod.remove(p); }catch(e){ r={ok:false,why:String(e&&e.message||e)}; }
  if(r&&r.ok) plSyncAll();
  return r||{ok:false,why:'not deleted'};
}

// Which scenario plan a run was made on: the one whose inputs still hash to the run's own plan key (so a run made on A stays attached to A after the user switches to B),
// else the scenario on screen (the plan was edited since, and the run is stale). `runKey` = the plan key string the run recorded (specPlanKey() at run time).
// → {baseKey, baseFingerprint} or null while the scenario plans do not exist yet.
function plBaseFor(runKey){
  const fp=plHash(runKey||''), sc=plList().filter(p=>p.origin.kind==='scenario'), hit=sc.find(p=>p.fingerprint===fp);
  if(hit) return {baseKey:hit.key,baseFingerprint:fp};
  const live=sc.find(p=>p.key==='scn:'+(typeof scnActive!=='undefined'?scnActive:'A'));
  return live?{baseKey:live.key,baseFingerprint:fp}:null;
}

// Run the engine once for this plan if its summary is missing or out of date. This is the only place the store calls the engine.
function plEnsureSummary(ref){
  const p=plGet(ref); if(!p) return null;
  if(!p.summary||p.summaryFor!==p.fingerprint){ const r=plResolve(p); p.summary=plSummarize(r.state,r.overlay,r.draw); p.summaryFor=p.fingerprint; }
  return p.summary;
}
// A delta plan (stress, trial, lever) is stale when the plan on screen is no longer the one it was run on; a snapshot (an A/B scenario) is never stale by itself.
// `liveFp` = plFingerprint(state), passed in by callers that check many plans.
function plIsStale(p,liveFp){ if(!p.input.baseKey) return false; return p.input.baseFingerprint!==(liveFp||plFingerprint(state)); }
// Slim row for lists: no input, no series. `stale` is relative to the live plan's fingerprint (only meaningful for plans derived from it).
function plRow(p,liveFp){ return {id:p.id,key:p.key,label:p.label,owner:p.owner,origin:p.origin,pinned:p.pinned,stale:plIsStale(p,liveFp),updatedAt:p.updatedAt,hasSummary:!!p.summary&&p.summaryFor===p.fingerprint}; }
