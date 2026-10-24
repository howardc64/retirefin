'use strict';
// ═══════════════════════════════════════════════════════════════
// SCENARIOS / STORE — the master scenario list. One record per scenario, whatever defined it (A/B scenario, stress test, Monte Carlo trial, saved market path, what-if).
// No DOM and no engine calls except through scEnsureSummary(). Design: docs/SCENARIO_STORE_DESIGN.md.
//
//   Scenario {id, key, label, owner, origin:{kind, groupId, ref}, input:{state}|{baseKey,baseFingerprint,overlay|draw}, meta, fingerprint, summary|null, summaryFor, createdAt, updatedAt, pinned}
//     id           opaque and stable for the life of the scenario ('p1', 'p2' …); references held by a chart view or an LLM survive a re-run
//     key          semantic, unique: 'scn:B', 'st:lostDecade', 'mc:trial:17', 'stmc:lostDecade:17', 'mkt:<pathId>'. Producers upsert on it, so a re-run updates in place
//     owner        the producer that maintains the scenario; scReconcile(owner, scenarios) adds, updates and removes only that owner's scenarios
//     fingerprint  hash of input.state (UI ignored); summary is computed lazily by scEnsureSummary and is valid while summaryFor === fingerprint
//
//   Producers are registered with scRegisterProducer(name, fn); scSyncAll() runs them (pull model: a reader calls it before reading, nothing hooks edits).
// ═══════════════════════════════════════════════════════════════
let SC_BY_ID=new Map(), SC_BY_KEY=new Map(), SC_SEQ=0, SC_PRODUCERS=[];


function scGet(ref){ return SC_BY_ID.get(ref)||SC_BY_KEY.get(ref)||null; }          // by id or by key
function scList(){ return Array.from(SC_BY_ID.values()); }
// find({owner, kind, groupId, key (prefix with *), label (substring, case-insensitive), stale}) → scenarios in insertion order
function scFind(q){
  q=q||{}; const lab=q.label?String(q.label).toLowerCase():null, pre=q.key&&q.key.endsWith('*')?q.key.slice(0,-1):null;
  return scList().filter(p=>(!q.owner||p.owner===q.owner)&&(!q.kind||p.origin.kind===q.kind)&&(q.groupId==null||p.origin.groupId===q.groupId)
    &&(!q.key||(pre!=null?p.key.startsWith(pre):p.key===q.key))&&(!lab||p.label.toLowerCase().includes(lab)));
}

// Add or update the scenario with this key. Keeps id, createdAt and pinned; the summary is dropped only when the input actually changed.
// spec: {key, label, owner, origin, input:{state} | {baseKey, baseFingerprint, overlay|draw}, meta?, summary?} → the stored plan.
//   meta     small JSON the producer wants kept beside the plan (e.g. a stress row's shock figures); replaced on every upsert, never part of the fingerprint
//   summary  an already-known summary, or a function returning one (a producer that has the engine's numbers at hand seeds it, so the engine is not run again);
//            used only when the scenario has no valid summary, so a function is only called then
const scCloneInput=inp=>inp.state?{state:scClone(inp.state)}:{baseKey:inp.baseKey,baseFingerprint:inp.baseFingerprint,overlay:scClone(inp.overlay||null),draw:scClone(inp.draw||null)};
function scUpsert(spec){
  if(!spec||!spec.key||!spec.input||!(spec.input.state||spec.input.baseKey)) throw new Error('scUpsert needs {key, input:{state}|{baseKey,baseFingerprint,overlay|draw}}');
  const fp=scInputFingerprint(spec.input), now=Date.now(), old=SC_BY_KEY.get(spec.key), label=String(spec.label||spec.key), metaJ=JSON.stringify(spec.meta==null?null:spec.meta);
  const origin=Object.assign({kind:'scenario',groupId:null,ref:null},spec.origin||(old&&old.origin)||{});
  let p=old, changed=false;
  if(!old){
    p={id:'p'+(++SC_SEQ), key:spec.key, label, owner:spec.owner||null, origin, input:scCloneInput(spec.input), fingerprint:fp, summary:null, summaryFor:null,
      meta:spec.meta==null?null:scClone(spec.meta), createdAt:now, updatedAt:now, pinned:!!spec.pinned};
    SC_BY_ID.set(p.id,p); SC_BY_KEY.set(p.key,p); changed=true;
  } else {
    if(old.fingerprint!==fp){ old.input=scCloneInput(spec.input); old.fingerprint=fp; old.summary=null; old.summaryFor=null; changed=true; }
    else if(spec.input.baseKey&&old.input.baseKey!==spec.input.baseKey){ old.input.baseKey=spec.input.baseKey; changed=true; }   // same run, its base scenario is now named differently (the user switched scenarios)
    if(old.label!==label||JSON.stringify(old.origin)!==JSON.stringify(origin)||JSON.stringify(old.meta)!==metaJ){ old.label=label; old.origin=origin; old.meta=spec.meta==null?null:scClone(spec.meta); changed=true; }
    if(spec.pinned&&!old.pinned){ old.pinned=true; changed=true; }
    if(changed) old.updatedAt=now;
  }
  if(spec.summary&&(!p.summary||p.summaryFor!==p.fingerprint)){ const sm=typeof spec.summary==='function'?spec.summary():spec.summary; if(sm){ p.summary=scClone(sm); p.summaryFor=p.fingerprint; changed=true; } }
  return p;
}
function scRemove(ref){
  const p=scGet(ref); if(!p) return false;
  SC_BY_ID.delete(p.id); SC_BY_KEY.delete(p.key); return true;
}
// A group's members go with it (a deleted stress or Monte Carlo run takes its scenarios along).
function scRemoveGroup(groupId){ return scFind({groupId}).filter(p=>scRemove(p.id)).length; }
function scReset(){ SC_BY_ID=new Map(); SC_BY_KEY=new Map(); }

// The producer owns a set of scenarios: upsert every spec, remove its other scenarios (the user deleted them, or the run was replaced). Pinned scenarios survive a
// removal only if the producer lists them again; pinning is for the UI to keep a promoted trial between runs, so a producer may pass keepPinned:true.
// Tombstones: scenarios a user deleted from a derived run (a stress row, a trial) are skipped until the run is replaced. The producer passes opts.token (any value that
// changes when the source run is replaced, e.g. the results object); a new token forgets that owner's tombstones.
let SC_DEAD=new Map(), SC_TOKEN=new Map();
function scTombstone(owner,key){ if(!SC_DEAD.has(owner)) SC_DEAD.set(owner,new Set()); SC_DEAD.get(owner).add(key); }
function scUnTombstone(owner,key){ const d=SC_DEAD.get(owner); if(d) d.delete(key); }
function scReconcile(owner, specs, opts){
  opts=opts||{};
  if('token' in opts&&SC_TOKEN.get(owner)!==opts.token){ SC_TOKEN.set(owner,opts.token); SC_DEAD.delete(owner); }
  const dead=SC_DEAD.get(owner); if(dead&&dead.size) specs=specs.filter(sp=>!dead.has(sp.key));
  const keep=new Set(), out=specs.map(sp=>{ const p=scUpsert(Object.assign({},sp,{owner})); keep.add(p.key); return p; });
  scFind({owner}).forEach(p=>{ if(!keep.has(p.key)&&!(opts.keepPinned&&p.pinned)) scRemove(p.id); });
  return out;
}

// A producer: fn() syncs its plans from its source; opts.remove(plan) → {ok, why?} deletes the plan AT THE SOURCE (the store is an index over the sources, so
// removing only the record would bring it back on the next sync). A producer without remove cannot be deleted from.
function scRegisterProducer(name,fn,opts){ SC_PRODUCERS=SC_PRODUCERS.filter(p=>p.name!==name); SC_PRODUCERS.push({name,fn,remove:opts&&opts.remove||null}); }
function scSyncAll(){ SC_PRODUCERS.forEach(p=>{ try{ p.fn(); }catch(e){ if(typeof console!=='undefined') console.warn('scenario producer '+p.name+' failed',e); } }); return scList(); }
function scDelete(ref){
  scSyncAll(); const p=scGet(ref); if(!p) return {ok:false,why:'no such scenario "'+ref+'"'};
  const prod=SC_PRODUCERS.find(x=>x.name===p.owner); if(!prod||!prod.remove) return {ok:false,why:'scenarios of kind "'+p.origin.kind+'" cannot be deleted'};
  let r; try{ r=prod.remove(p); }catch(e){ r={ok:false,why:String(e&&e.message||e)}; }
  if(r&&r.ok) scSyncAll();
  return r||{ok:false,why:'not deleted'};
}

// Which user scenario (A to F) a run was made on: the one whose inputs still hash to the run's own scenario key (so a run made on A stays attached to A after the user switches to B),
// else the scenario on screen (the scenario was edited since, and the run is stale). `runKey` = the scenario key string the run recorded (specScenarioKey() at run time).
// → {baseKey, baseFingerprint} or null while the user scenarios do not exist yet.
function scBaseFor(runKey){
  const fp=scHash(runKey||''), sc=scList().filter(p=>p.origin.kind==='scenario'), hit=sc.find(p=>p.fingerprint===fp);
  if(hit) return {baseKey:hit.key,baseFingerprint:fp};
  const live=sc.find(p=>p.key==='scn:'+(typeof scnActive!=='undefined'?scnActive:'A'));
  return live?{baseKey:live.key,baseFingerprint:fp}:null;
}

// Run the engine once for this scenario if its summary is missing or out of date. This is the only place the store calls the engine.
function scEnsureSummary(ref){
  const p=scGet(ref); if(!p) return null;
  if(!p.summary||p.summaryFor!==p.fingerprint){ const r=scResolve(p); p.summary=scSummarize(r.state,r.overlay,r.draw); p.summaryFor=p.fingerprint; }
  return p.summary;
}
// A delta scenario (stress, trial, lever) is stale when the scenario on screen is no longer the one it was run on; a snapshot (an A/B scenario) is never stale by itself.
// `liveFp` = scFingerprint(state), passed in by callers that check many scenarios.
function scIsStale(p,liveFp){ if(!p.input.baseKey) return false; return p.input.baseFingerprint!==(liveFp||scFingerprint(state)); }
// Slim row for lists: no input, no series. `stale` is relative to the live plan's fingerprint (only meaningful for scenarios derived from it).
function scRow(p,liveFp){ return {id:p.id,key:p.key,label:p.label,owner:p.owner,origin:p.origin,pinned:p.pinned,stale:scIsStale(p,liveFp),updatedAt:p.updatedAt,hasSummary:!!p.summary&&p.summaryFor===p.fingerprint}; }
