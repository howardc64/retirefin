'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / SCENARIO VIEW — put a scenario of the master scenario list (scenarios/scenarioStore.js) on the main chart grid, whatever made it. One entry point, scShow(ref), that hands the scenario to the
// viewer that already knows how to draw its kind (the A–F buttons and their stepping stay as they are; they and scShow open the same views):
//   scenario → scnSwitch (or Back to scenario when it is the one on screen)   stress, market → mcLoadMarketPath (the D view)
//   Monte Carlo trial → mcLoadTrial (B or C by outcome)                    stress + Monte Carlo trial → mcLoadSm (E or F by outcome)
// → {ok, label} or {ok:false, why}. Never changes the user's scenario. A scenario made before an edit of the scenario on screen cannot be replayed.
// ═══════════════════════════════════════════════════════════════
function scShow(ref){
  if(typeof scResolveRef!=='function') return {ok:false,why:'the scenario list is not available'};
  const r=scResolveRef(ref); if(!r.scenario) return {ok:false,why:r.error};
  const p=r.scenario, k=p.origin.kind, rf=p.origin.ref||{}, label=p.label;
  if(typeof mcRun!=='undefined'&&mcRun) return {ok:false,why:'a Monte Carlo run is in progress'};
  if(p.input.baseKey&&scIsStale(p)) return {ok:false,why:'that scenario was made before the scenario on screen was edited, so it cannot be replayed; run it again'};
  const done=ok=>ok===false?{ok:false,why:'the page could not show it'}:{ok:true,label};
  if(k==='scenario'){
    if(typeof scnSwitch!=='function') return {ok:false,why:'scenarios cannot be switched here'};
    if(rf.scenarioId===scnActive){ if(typeof mcTrialView!=='undefined'&&mcTrialView&&typeof mcTrialExit==='function') mcTrialExit(); return {ok:true,label}; }
    scnSwitch(rf.scenarioId); return {ok:true,label};
  }
  if(k==='stress'||k==='market'){
    if(typeof mcLoadMarketPath!=='function') return {ok:false,why:'this page cannot show market paths'};
    const id=k==='stress'?rf.scenarioId:rf.pathId; let ok=mcLoadMarketPath(id);
    if(!ok&&k==='stress'&&typeof stEnsureFresh==='function'){ stEnsureFresh(); ok=mcLoadMarketPath(id); }
    return done(ok);
  }
  if(k==='mc_trial'){
    if(p.origin.groupId!=='mc:run'||typeof mcLoadTrial!=='function') return {ok:false,why:'trials of tool-started jobs are not shown in the charts; read them with get_scenario detail "series"'};
    mcLoadTrial(rf.trial); return {ok:true,label};
  }
  if(k==='stress_mc_trial'){
    const gid=p.origin.groupId||'', rid=gid.replace(/^stmc:/,'');
    if(!gid.startsWith('stmc:')||typeof mcLoadSm!=='function'||typeof stResults==='undefined'||!stResults||!stResults.mc) return {ok:false,why:'only the stress card\'s own stress + Monte Carlo trials can be shown in the charts'};
    const ri=stResults.mc.rows.findIndex(x=>x.id===rid), row=stResults.mc.rows[ri];
    if(!row||!row.stressDef) return {ok:false,why:'the "no stress" row is not a stress view; show the Monte Carlo trial instead'};
    const kind=row.res[rf.trial]&&row.res[rf.trial].failK<0?'E':'F', L=mcSmList(kind), pos=L.findIndex(x=>x.row===ri&&x.trial===rf.trial);
    if(pos<0) return {ok:false,why:'that trial is not in the stress + Monte Carlo list'};
    mcLoadSm(kind,pos); return {ok:true,label};
  }
  return {ok:false,why:'this kind of scenario ('+k+') cannot be shown in the main charts'};
}
