'use strict';
// ═══════════════════════════════════════════════════════════════
// PLANS / PRODUCER — market scenarios (compute/marketScenario.js): the ones saved in the plan (state.ui.marketPaths) and those defined in this session (msSession).
// One plan per path, key 'mkt:<pathId>': the plan on screen plus a {type:'market', path} overlay, placed by the path's own start. Always current (re-based on the plan on screen
// at every sync), like the registry's market runs. Delete removes the path itself (saved ones from the plan, session ones from memory).
// ═══════════════════════════════════════════════════════════════
function plSyncMarket(){
  if(typeof msList!=='function') return;
  const base=plBaseFor(plStateKey(state)); if(!base) return;
  plReconcile('market',msList().map(p=>({key:'mkt:'+p.id,label:p.label,
    origin:{kind:'market',groupId:null,ref:{pathId:p.id}},
    input:{baseKey:base.baseKey,baseFingerprint:base.baseFingerprint,overlay:{type:'market',path:p}},
    meta:{source:p.source||'user',describe:msDescribe(p)}})));
}
plRegisterProducer('market',plSyncMarket,{remove(p){
  const id=p.origin.ref.pathId;
  if(typeof stRemovePath==='function') stRemovePath(id); else msRemove(id);
  if(typeof saveDebounced==='function') saveDebounced();
  return {ok:true};
}});
