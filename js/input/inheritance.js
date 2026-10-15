'use strict';
// ═══════════════════════════════════════════════════════════════
// INPUT / INHERITANCE — the "Inheritance" card (one per person) and the "Inherited IRA" card.
//
// An inheritance comes from ANOTHER plan file (e.g. a parent's). Importing a file runs that plan's projection, takes what is left after its LAST passing
// (the plan's own definition of the balance at the passing: see computeProjection's stretch block) and lists each asset on the Inheritance card with a
// "% inherited" box (default 0 = not inherited). A non-zero % creates a new asset card for it:
//   • brokerage portfolio  → a Brokerage portfolio card   (cost basis stepped up to the value at the passing; an IDGT keeps its carryover basis %)
//   • real estate          → a Real estate card            (basis stepped up)
//   • pre-tax IRA, Roth IRA → an Inherited IRA card         (must be emptied by the end of the 10th year after it arrives; compute/projection.js)
// Every created asset starts in `startYear`, the calendar year of the last passing in the source plan.
// (An annuity in the source plan is not imported.)
//
// A source is identified by its FILE NAME only (the folder does not matter, the comparison ignores case). Importing the same name again updates every
// asset created from it; removing a source removes every asset created from it.
//
// A created asset remembers the values it was given (`inh.base`). A field that no longer equals its base was changed by the user: it is drawn with a light
// grey background (inheritance.js markInheritedChanges), and a re-import (or a change of the %) leaves it alone while updating every other field.
// Where it is stored: person.inheritance.sources[] (the imported snapshots and the % per asset); the created assets live in the usual lists
// (person.brokerage / person.realEstate / person.inhIras) with `inh` = {file, key, base}.
// ═══════════════════════════════════════════════════════════════
const INH_FIELDS={
  pf:['name','balance','basisPct','growth','yield','qdivPct','teYield','foreignPct','ftcPct','startYear','ar','type','aum','bene'],
  re:['name','balance','basis','exempt','growth','startYear','sellMode','sellAge','sellTo','bene'],
  ira:['name','balance','growth','startYear','rmdStarted','bene','conv','convMode','convIrmaaPct','convOrdPct','convStartMode','convStart','convStartBracket','convStartItemized'],
  roth:['name','balance','growth','startYear','rmdStarted','bene']
};
const INH_LIST={pf:'brokerage', re:'realEstate', ira:'inhIras', roth:'inhIras'};
function inhClone(v){ return v===undefined?undefined:JSON.parse(JSON.stringify(v)); }
function inhEq(a,b){
  const blank=v=>v==null||v==='';
  if(blank(a)&&blank(b)) return true;
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    const ks=new Set([...Object.keys(a),...Object.keys(b)]);
    for(const k of ks) if(!inhEq(a[k],b[k])) return false;
    return true;
  }
  if(typeof a==='number'||typeof b==='number'){ const x=Number(a), y=Number(b); return Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<1e-6; }
  return a===b;
}
function inhFileBase(name){ return String(name||'').split(/[\\/]/).pop(); }
function inhSameFile(a,b){ return inhFileBase(a).toLowerCase()===inhFileBase(b).toLowerCase(); }
function inhMoney(v){ return '$'+Math.round(Number(v)||0).toLocaleString(); }

// ── Reading another plan ──
// Runs the other plan's projection (swapping it in as the global `state` for the call) and returns {startYear, assets} or null when nobody in it has anything to leave.
// Values are today's $ at the year of the last passing.
function inhExtractFromState(parent){
  const saved=state; let proj;
  state=parent;
  try{ proj=computeProjection(); } finally{ state=saved; }
  return inhExtractFromProj(parent, proj);
}
// The same from a plan and its ALREADY computed projection (the live link publishes the running plan's own `lastProjection`: no second run).
function inhExtractFromProj(parent, proj){
  if(!proj||!proj.rows.length) return null;
  const last=proj.rows[proj.rows.length-1], infl=parent.inflation;
  const startYear=THIS_YEAR+last.k+1;   // the first year with nobody alive
  const pname=(p,i)=>displayPersonName(p,i);
  const assets=[];
  proj.people.forEach((p,i)=>{
    (p.brokerage||[]).forEach((b,bi)=>{
      const e=last.portfoliosByPerson&&last.portfoliosByPerson[i]&&last.portfoliosByPerson[i][bi];
      if(!e||!(e.balance>0)||!b||b.enabled===false) return;
      const g=realGrowth(b.growth,infl), value=Math.round(e.balance*(1+g));
      if(!(value>0.5)) return;
      let basisPct=100;   // stepped up at the passing…
      if(b.idgt){          // …except an IDGT, outside the estate, which keeps its carryover basis
        const bas=(e.tracked&&e.basis!=null?e.basis:e.balance)/(1+infl);
        basisPct=Math.round(Math.min(100,Math.max(0,bas/value*100))*100)/100;
      }
      const nm=(b.name&&b.name.trim())||('Portfolio '+(bi+1));
      assets.push({key:'pf:'+b.id, type:'pf', label:nm+(b.idgt?' (IDGT)':'')+' — '+pname(p,i), value,
        snap:{name:'Inherited '+nm, balance:value, basisPct, growth:inhClone(b.growth), yield:b.yield, qdivPct:b.qdivPct, teYield:b.teYield, foreignPct:b.foreignPct, ftcPct:b.ftcPct}});
    });
    (p.realEstate||[]).forEach((r,ri)=>{
      const e=last.realEstateByPerson&&last.realEstateByPerson[i]&&last.realEstateByPerson[i][ri];
      if(!e||!(e.balance>0)||!r||r.enabled===false) return;
      const value=Math.round(e.balance*(1+realGrowth(r.growth,infl)));
      if(!(value>0.5)) return;
      const nm=(r.name&&r.name.trim())||('Property '+(ri+1));
      assets.push({key:'re:'+r.id, type:'re', label:nm+' — '+pname(p,i), value,
        snap:{name:'Inherited '+nm, balance:value, basis:value, exempt:0, growth:inhClone(r.growth)}});
    });
    [['ira','Pre-tax IRA',last.iraBalByPerson,p.ira],['roth','Roth IRA',last.rothBalByPerson,p.roth]].forEach(([type,lbl,arr,acct])=>{
      const v=Math.round(Number(arr&&arr[i])||0);
      if(!acct||!acct.enabled||!(v>0.5)) return;
      // Had the deceased already started RMDs? Pre-tax only (a Roth IRA never has lifetime RMDs). Decided automatically from the source plan: the last holder was
      // past the IRA's own RMD start age in their final year, or had taken the IRA over as the surviving spouse (the model takes RMDs by the spouse's age then).
      const rmdStarted=type==='ira'&&inhRmdStarted(parent, proj, p, i);
      assets.push({key:type+':'+p.id, type, label:lbl+' — '+pname(p,i), value:v, rmdStarted,
        snap:{name:'Inherited '+lbl+' ('+pname(p,i)+')', balance:v, growth:inhClone(acct.growth), rmdStarted}});
    });
  });
  return {startYear, assets};
}

// Whether the pre-tax IRA of person `i` of the source plan was already paying RMDs when its last holder passed (see inhExtractFromState).
function inhRmdStarted(parent, proj, p, i){
  const people=proj.people, last=proj.rows[proj.rows.length-1];
  const pass=people.map(q=>parent.passing&&parent.passing[q.id]!=null?parent.passing[q.id]:95);
  const [startAge]=resolveAgeRange(p.ira.ar,p);
  const ownerOld=pass[i]-1>=startAge;                                 // the owner reached the RMD start age while alive
  const spouse=people.length===2?1-i:-1;
  const spouseHeld=!!p.ira.bene&&spouse>=0&&pass[spouse]>pass[i];     // the surviving spouse took it over and has been taking RMDs
  return ownerOld||spouseHeld;
}

// ── Building and updating the created assets ──
// The inherited values of an asset at `pct`%: everything the snapshot holds, with the amounts scaled, plus the defaults for the fields the snapshot leaves out.
function inhBase(entry, startYear, i){
  const f=Math.min(100,Math.max(0,Number(entry.pct)||0))/100, s=inhClone(entry.snap), t=entry.type;
  s.balance=Math.round((Number(s.balance)||0)*f);   // whole dollars
  s.startYear=startYear;
  if(t==='pf'){
    const d=defaultBrokeragePortfolio(0);
    s.ar=inhPfAgeRange(i,startYear,d.ar); s.type='living'; s.aum=false; s.bene=false;   // the portfolio's Start age is the age it was inherited (custom age), End as usual
    s.name=s.name||''; return s;
  }
  if(t==='re'){
    const d=defaultRealEstate(0);
    s.basis=Math.round((Number(s.basis)||0)*f);
    s.sellMode=d.sellMode; s.sellAge=d.sellAge; s.sellTo=d.sellTo; s.bene=false; return s;
  }
  // An inherited IRA starts with the defaults of the matching Pre-tax IRA / Roth IRA card (the source plan's own conversion settings belong to its owner).
  const d=defaultInheritedIra();
  s.rmdStarted=t==='ira'&&entry.snap.rmdStarted!==false; s.bene=false;
  if(t==='ira'){ ['conv','convMode','convIrmaaPct','convOrdPct','convStartMode','convStart','convStartBracket','convStartItemized'].forEach(k=>{ s[k]=inhClone(d[k]); }); }
  return s;
}
function inhNewItem(entry, base, file){
  const t=entry.type, inh={file, key:entry.key, base:inhClone(base)};
  let it;
  if(t==='pf'){ it=defaultBrokeragePortfolio(0); applyPortfolioType(it,'living'); }
  else if(t==='re') it=defaultRealEstate(0);
  else { it=defaultInheritedIra(); it.kind=t; }
  Object.keys(base).forEach(k=>{ it[k]=inhClone(base[k]); });
  it.inh=inh;
  return it;
}
function inhFindItem(p, file, key){
  const lists=['brokerage','realEstate','inhIras'];
  for(const L of lists){ const a=p[L]||[]; for(let j=0;j<a.length;j++){ const x=a[j]; if(x&&x.inh&&inhSameFile(x.inh.file,file)&&x.inh.key===key) return {list:L, idx:j, item:x}; } }
  return null;
}
function inhRemoveItems(p, pred){
  ['brokerage','realEstate','inhIras'].forEach(L=>{ p[L]=(p[L]||[]).filter(x=>!(x&&x.inh&&pred(x.inh))); });
}
// Bring every created asset of person `i` in line with the sources: create what has a % but no asset, update what has both (keeping the user's own changes),
// remove what no longer has a %.
function syncInheritance(i){
  const p=state.people[i]; if(!p) return;
  if(!p.inheritance) p.inheritance={sources:[]};
  const wanted=new Set();
  p.inheritance.sources.forEach(src=>{
    src.assets.forEach(en=>{
      const pct=Math.min(100,Math.max(0,Number(en.pct)||0));
      const found=inhFindItem(p, src.file, en.key);
      if(!(pct>0)) return;           // not inherited: any existing asset is removed below
      wanted.add(src.file.toLowerCase()+'|'+en.key);
      const base=inhBase(en, src.startYear, i), fields=INH_FIELDS[en.type];
      if(found){
        const it=found.item, old=it.inh.base||{}, arUntouched=en.type==='pf'&&inhEq(it.ar, old.ar);
        fields.forEach(f=>{ if(inhEq(it[f], old[f])) it[f]=inhClone(base[f]); });   // untouched by the user → follows the new inheritance value; changed → kept
        it.inh={file:src.file, key:en.key, base:inhClone(base)};
        if(arUntouched&&!inhEq(it.startYear, base.startYear)){   // the user moved the inheritance age: the portfolio's Start follows that age, not the source's
          const ar=inhPfAgeRange(i,it.startYear,it.ar); it.ar=inhClone(ar); it.inh.base.ar=inhClone(ar);
        }
      }else{
        const it=inhNewItem(en, base, src.file);
        p[INH_LIST[en.type]].push(it);
      }
    });
  });
  inhRemoveItems(p, inh=>!wanted.has(String(inh.file).toLowerCase()+'|'+inh.key));
}

// ── Import / remove ──
function inhImportClick(i){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json'; inp.multiple=true;
  inp.addEventListener('change',()=>{ const files=[...inp.files]; if(files.length) inhImportFiles(i, files); });
  inp.click();
}
function inhReadFile(f){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error||new Error('read failed')); r.readAsText(f); }); }
async function inhImportFiles(i, files){
  const p=state.people[i], done=[], failed=[];
  for(const f of files){
    const name=inhFileBase(f.name);
    try{
      const parsed=JSON.parse(await inhReadFile(f));
      if(!parsed||typeof parsed!=='object'||!Array.isArray(parsed.people)) throw new Error('not a plan file');
      const res=inhExtractFromState(hydrateState(parsed));
      if(!res) throw new Error('nobody in that plan has a projection');
      inhApplySource(p, name, res);
      done.push(name);
    }catch(err){ failed.push(name+' ('+(err&&err.message?err.message:err)+')'); }
  }
  syncInheritance(i);
  renderIncomeForms(); recompute(); saveDebounced();
  if(failed.length) alert('Could not import: '+failed.join('; '));
  else if(done.length) flashMsg('Imported '+done.join(', ')+'.');
}
// Add the source, or — when a source of the same file name exists — refresh it: the % of an asset that is still in the file is kept.
function inhApplySource(p, file, res){
  if(!p.inheritance) p.inheritance={sources:[]};
  const old=p.inheritance.sources.find(s=>inhSameFile(s.file,file));
  const pctOf={}; if(old) old.assets.forEach(a=>{ pctOf[a.key]=a.pct; });
  const src={id:old?old.id:uid(), file:old?old.file:file, importedAt:new Date().toISOString(), startYear:res.startYear,
    assets:res.assets.map(a=>({key:a.key, type:a.type, label:a.label, value:a.value, snap:a.snap, pct:pctOf[a.key]!=null?pctOf[a.key]:0}))};
  if(old) ['live','liveId','liveName','liveHash','liveChain'].forEach(k=>{ if(old[k]!==undefined) src[k]=old[k]; });   // the live link (input/liveLink.js) survives a refresh
  if(old) p.inheritance.sources[p.inheritance.sources.indexOf(old)]=src; else p.inheritance.sources.push(src);
}
function inhRemoveSource(i, si){
  const p=state.people[i], src=p.inheritance.sources[si]; if(!src) return;
  const n=['brokerage','realEstate','inhIras'].reduce((t,L)=>t+(p[L]||[]).filter(x=>x&&x.inh&&inhSameFile(x.inh.file,src.file)).length,0);
  if(!confirm('Remove '+src.file+' and the '+n+' asset'+(n===1?'':'s')+' created from it?')) return;
  inhRemoveItems(p, inh=>inhSameFile(inh.file,src.file));
  p.inheritance.sources.splice(si,1);
  renderIncomeForms(); recompute(); saveDebounced();
}
function onInhPct(i, si, ai, val){
  const en=state.people[i].inheritance.sources[si].assets[ai];
  en.pct=Math.min(100,Math.max(0,val===''?0:+val||0));
  syncInheritance(i);
  inhRenderKeepingView();
  recompute(); saveDebounced();
}
// Re-render the cards without the view jumping to the cards just created: the scroll positions are put back, and when the user Tabbed (or clicked) on to
// another field, that field is focused again (the render rebuilds every input) without scrolling to it — so all the % can be typed in a row.
let inhNextFocus=null;
document.addEventListener('focusout',e=>{
  const root=document.getElementById('perPersonIncome'), t=e.relatedTarget;
  inhNextFocus=(root&&t&&root.contains(t))?[...root.querySelectorAll('input,select,button,textarea')].indexOf(t):null;
},true);
function inhRenderKeepingView(){
  const root=document.getElementById('perPersonIncome'), next=inhNextFocus;
  const saved=[[window,window.scrollX,window.scrollY]];
  for(let el=root;el;el=el.parentElement) if(el.scrollTop||el.scrollLeft) saved.push([el,el.scrollLeft,el.scrollTop]);
  renderIncomeForms();
  const restore=()=>saved.forEach(([el,x,y])=>{ if(el===window) window.scrollTo(x,y); else{ el.scrollLeft=x; el.scrollTop=y; } });
  restore();
  if(next!=null&&next>=0){ const t=root.querySelectorAll('input,select,button,textarea')[next]; if(t){ t.focus({preventScroll:true}); if(t.select&&t.type==='number') t.select(); } }
  restore(); requestAnimationFrame(restore);
}
// Removing an inherited asset by hand also sets its % to 0, so it does not come back on the next sync / re-import.
function inhDropEntryFor(p, item){
  if(!item||!item.inh) return;
  p.inheritance.sources.forEach(src=>{ if(inhSameFile(src.file,item.inh.file)) src.assets.forEach(a=>{ if(a.key===item.inh.key) a.pct=0; }); });
}
function removeInhIra(i, ii){
  const p=state.people[i]; inhDropEntryFor(p, p.inhIras[ii]); p.inhIras.splice(ii,1);
  renderIncomeForms(); recompute(); saveDebounced();
}

// ── Cards ──
function inhBadge(item){
  if(!item||!item.inh) return '';
  const src=item.inh;
  return `<div class="inh-badge" title="Created by the Inheritance card. A field with a grey background was changed from its inherited value.">Inherited from <strong>${escHtml(inhFileBase(src.file))}</strong></div>`;
}
// The holder (beneficiary owner) of an inherited asset is the person whose card it sits on. The asset enters the plan in `startYear`; the card shows the holder's AGE in
// that year instead (age = whole years, as on every other age field), and converts back to the calendar year for the projection (which still reads `startYear`).
function inhHolderIdx(path){ const m=/people\.(\d+)\./.exec(path); return m?+m[1]:0; }
function inhAgeOfYear(i, year){ const p=state.people[i]; return p&&Number.isFinite(Number(year))?Math.floor(currentAge(p))+(Number(year)-THIS_YEAR):''; }
function inhYearOfAge(i, age){ const p=state.people[i]; return THIS_YEAR+(Number(age)-Math.floor(currentAge(p))); }
function inhAgeField(path, item, label){
  const i=inhHolderIdx(path), p=state.people[i]; if(!p) return '';
  const lo=Math.floor(currentAge(p)), hi=Math.max(lo,100);
  const age=inhAgeOfYear(i,item.startYear);
  return `<div class="field full"><label>${label||('Inherited at '+escHtml(displayPersonName(p,i))+"'s age")}</label><input type="number" min="${lo}" max="${hi}" step="1" value="${age}" oninput="onInhAge('${path}.startYear', ${i}, this.value, this)"><div class="item-note inh-yr-note" style="margin-top:4px">${inhYearNote(item.startYear)}</div></div>`;
}
// An inherited portfolio's age range starts at the age its holder inherits it (Start = Custom age), so the card shows when it begins; the End keeps its default.
function inhPfAgeRange(i, startYear, dflt){
  const ar=inhClone(dflt||defaultAgeRange('now',0,'passing',0)), age=inhAgeOfYear(i,startYear);
  if(age!==''){ ar.startMode='custom'; ar.startVal=age; }
  return ar;
}
// Older saves (and plans made before this rule): an inherited portfolio whose Start is still the untouched default 'Now' gets the inheritance age.
function inhAlignPortfolioStarts(s){
  (s.people||[]).forEach((p,i)=>(p.brokerage||[]).forEach(b=>{
    if(!b||!b.inh||!Number.isFinite(Number(b.startYear))||!b.ar) return;
    const nowAr=a=>a&&a.startMode==='now';
    if(!nowAr(b.ar)) return;
    const age=Math.floor(currentAge(p))+(Number(b.startYear)-THIS_YEAR);
    if(!Number.isFinite(age)) return;
    const was=inhClone(b.ar); b.ar.startMode='custom'; b.ar.startVal=age;
    if(b.inh.base&&b.inh.base.ar&&nowAr(b.inh.base.ar)){ b.inh.base.ar.startMode='custom'; b.inh.base.ar.startVal=age; }
  }));
}
function inhYearNote(year){ return Number.isFinite(Number(year))?('Age of the beneficiary owner in the year of the last passing in the source plan (calendar year '+Number(year)+').'):''; }
// Changing the age an inherited portfolio is inherited at moves its Start age with it, unless the user has set that Start themselves (it then differs from the inherited value and is kept).
function inhFollowPortfolioStart(startYearPath, i, year, inputEl){
  const m=/^(people\.\d+\.brokerage\.\d+)\.startYear$/.exec(startYearPath); if(!m) return;
  let it=state; m[1].split('.').forEach(k=>{ it=it&&it[/^\d+$/.test(k)?+k:k]; });
  if(!it||!it.inh||!it.ar) return;
  const old=it.inh.base&&it.inh.base.ar, fresh=inhPfAgeRange(i,year,it.ar);
  if(old&&!inhEq(it.ar,old)) return;   // the user's own Start / End: kept
  it.ar=inhClone(fresh); if(it.inh.base) it.inh.base.ar=inhClone(fresh);
  const card=inputEl&&inputEl.closest&&inputEl.closest('.portfolio-card, .item'); if(!card) return;
  const num=card.querySelector('input[oninput*=".ar.startVal"]'), sel=num&&num.closest('.arow')&&num.closest('.arow').querySelector('select');
  if(sel) sel.value='custom'; if(num){ num.style.display='inline-block'; num.value=fresh.startVal; }
}
function onInhAge(startYearPath, i, val, inputEl){
  if(val===''||!Number.isFinite(Number(val))) return;
  const lo=Math.floor(currentAge(state.people[i])), age=Math.max(lo,Math.min(120,Math.round(Number(val))));
  const year=inhYearOfAge(i,age);
  setPath(startYearPath, year);
  inhFollowPortfolioStart(startYearPath, i, year, inputEl);
  const note=inputEl&&inputEl.parentNode&&inputEl.parentNode.querySelector('.inh-yr-note'); if(note) note.textContent=inhYearNote(year);
  recomputeDebounced(); saveDebounced();
}
// Extra fields at the top of an inherited portfolio / property card: the age (of its holder) at which it enters the plan.
function inhYearField(path, item){
  if(!item||!item.inh) return '';
  return `<div class="field full">${inhBadge(item)}</div>
    ${inhAgeField(path,item)}
    <div class="field full"><div class="item-note">The balance below is its value in that year (today's $); it is not in the plan before then.</div></div>`;
}
function buildInheritanceCard(pid, i, p, married){
  const sources=(p.inheritance&&p.inheritance.sources)||[];
  const one=!married?'':` (${escHtml(displayPersonName(p,i))} inherits)`;
  const hidden=!p.inheritance||p.inheritance.hidden!==false;   // starts hidden
  return `<div class="item">
      <div class="item-head wrap" onclick="toggleItem(this)">
        <label>Inheritance${one}</label>
        <div class="item-head-right">
          <button type="button" class="btn" style="padding:3px 9px;font-size:10px" onclick="event.stopPropagation(); inhImportClick(${i})" title="Import the assets left after the last passing in another plan file">＋ Import plan file</button>
          <label class="hide-toggle" title="Collapse this card to save space — imported files and inherited assets are still used" onclick="event.stopPropagation()"><input type="checkbox" ${hidden?'checked':''} onclick="onHideToggle('${pid}.inheritance.hidden', this.checked, this.closest('.item'))"> Hide</label>
        </div>
      </div>
      <div class="item-body ${hidden?'':'open'} portfolio-list">
        ${sources.length?sources.map((s,si)=>`
          <div class="item inh-src" style="margin:0;padding:10px 11px">
            <div class="item-head"><label title="${escAttr(s.file)}"><span class="ttl" style="font-size:12px"><strong>${escHtml(s.file)}</strong></span></label>
              <div class="item-head-right"><button type="button" class="btn btn-danger" style="padding:2px 8px;font-size:10px" onclick="inhRemoveSource(${i},${si})" title="Remove this file and every asset created from it">Remove</button></div></div>
            ${typeof liveSourceHtml==='function'?liveSourceHtml(s,i,si):''}
            <div class="item-note">Last passing in <strong>${s.startYear}</strong>. Imported ${escHtml(new Date(s.importedAt).toLocaleDateString())}. Import the same file name again to update its assets.</div>
            ${s.assets.length?`<div class="inh-assets">${s.assets.map((a,ai)=>`
              <div class="inh-asset"><div class="inh-asset-name">${escHtml(a.label)}</div>
                <div class="inh-pct"><input type="number" min="0" max="100" step="5" value="${Number(a.pct)||0}" onchange="onInhPct(${i},${si},${ai},this.value)" aria-label="Percent inherited"><span>%</span></div>
                <div class="item-note inh-asset-detail">${inhMoney(a.value)} at the passing${a.type==='ira'?' · pre-tax: withdrawals taxed':a.type==='roth'?' · Roth: withdrawals untaxed':a.type==='pf'?' · basis stepped up':a.type==='re'?' · basis stepped up':''}</div></div>`).join('')}</div>`
              :`<div class="item-note">Nothing in that plan is left after the last passing.</div>`}
          </div>`).join(''):`<div class="item-note">Import another plan file (for example a parent's) to inherit assets that are left after its last passing. Each asset starts at 0% (not inherited); set a % to create an asset card for it. Only the file's active scenario is read, and the file is not changed.</div>`}
      </div>
    </div>`;
}
function buildInhIraCard(pid, i, p, married){
  const list=Array.isArray(p.inhIras)?p.inhIras:[];
    const chk=(on,handler,label)=>`<div class="field full"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:normal;font-size:12px"><input type="checkbox" ${on?'checked':''} onchange="${handler}"> ${label}</label></div>`;
  return `<div class="item">
      <div class="item-head" onclick="toggleItem(this)"><label>Inherited IRA</label></div>
      <div class="item-body open portfolio-list">
        ${list.length?list.map((x,ii)=>{
          const xp=pid+'.inhIras.'+ii, roth=x.kind==='roth', ab=personAgeBounds(i);
          // The Pre-tax IRA card's settings (or the Roth IRA card's for a Roth) that an inherited IRA can have, plus the year it arrives and how the 10-year rule is met.
          // No start / end age (it starts when inherited and is empty by year 10) and no IRA stretch (never beyond 10 years, even if inherited again by a spouse or in another plan).
          const conv=roth?'':`
              <div class="field full"><label>Annual withdraw</label>
                <select onchange="onConvMode('${xp}',this.value)">
                  <option value="fixed" ${(x.convMode||'fixed')==='fixed'?'selected':''}>$/yr, today's $</option>
                  <option value="bracket" ${x.convMode==='bracket'?'selected':''}>Below IRMAA &amp; tax brackets</option>
                </select>
                ${x.convMode==='bracket'
                  ? `<div class="conv-sliders">${convSliderHtml(xp,'ord',x)}${convSliderHtml(xp,'irmaa',x)}</div>
                     <div class="cn" style="margin-top:4px">Withdraws as much of this IRA as fits <strong>below both</strong> brackets: taxable ordinary income stays below the chosen ordinary bracket, and MAGI stays below the chosen IRMAA bracket. Slide to 0 to block withdrawals, or to the end for no limit.</div>`
                  : pairHtml('inhconv_'+i+'_'+ii, xp+'.conv', 0, Math.max(0,Number(x.balance)||0), 1000, x.conv||0, {kind:'inhira',i:i,ii:ii}, true)}
                <div class="cn" style="margin-top:8px">An inherited IRA cannot be converted to a Roth IRA: the withdrawn amount is taxed as ordinary income and is spendable household cash.</div></div>
              <div class="field full"><label>Withdraw start</label>
                <select onchange="onAgeRangeMode('${xp}','convStartMode',this.value)">
                  <option value="now" ${(x.convStartMode||'now')==='now'||x.convStartMode==='rmd'?'selected':''}>When inherited</option>
                  <option value="custom" ${x.convStartMode==='custom'?'selected':''}>Custom age</option>
                  <option value="bracket" ${x.convStartMode==='bracket'?'selected':''}>When tax bracket is below x%</option>
                  <option value="itemized" ${x.convStartMode==='itemized'?'selected':''}>When itemized deductions &gt; a value</option>
                  <option value="ltc" ${x.convStartMode==='ltc'?'selected':''}>When LTC starts</option>
                </select>
                ${x.convStartMode==='custom'?pairHtml('inhconvStart_'+i+'_'+ii, xp+'.convStart', ab[0], ab[1], 1, Math.min(ab[1],Math.max(ab[0],Number(x.convStart)||ab[0])), {kind:'person',i:i}):''}
                ${convStartTriggerHtml(xp, x)}</div>`;
          return `
          <div class="item portfolio-card inhira-card" data-inh-card="inhIras|${i}|${ii}" style="margin:0;padding:10px 11px">
            ${cardHeader(`<span class="ih-title" style="font-size:12px">${escHtml((x.name&&x.name.trim())||(roth?'Inherited Roth IRA':'Inherited IRA'))}</span>`, xp+'.enabled', x.enabled!==false, xp+'.hidden', !!x.hidden, `<button type="button" class="btn btn-danger" style="padding:2px 8px;font-size:10px" onclick="removeInhIra(${i},${ii})">Remove</button>`)}
            <div class="item-body ${x.hidden?'':'open'} portfolio-fields">
              ${inhBadge(x)}
              <div class="field full"><label>Name</label><input type="text" maxlength="60" value="${escAttr(x.name||'')}" oninput="onInhIraName('${xp}',this.value,this)"></div>
              ${inhAgeField(xp,x)}
              <div class="field full"><label>Balance when inherited (today's $)</label><input type="number" class="money" min="0" step="5000" value="${x.balance||0}" oninput="onInhIraBalance('${xp}',${i},${ii},this.value)"></div>
              ${renderChangeRow(xp+'.growth', x.growth, 3)}
              ${conv}
              <div class="field full"><label>Required withdrawals (${roth?'tax-free':'taxed as ordinary income'})</label>
                <div class="item-note" style="margin-top:2px">${roth?'A Roth IRA has no yearly requirement: the whole balance is withdrawn in year 10 after the start year.':(x.rmdStarted!==false?'The original owner had already started RMDs, so an RMD is taken every year from year 1 on, by the age of whoever holds the account now (the spouse\'s age once a spouse takes it over), and whatever is left is withdrawn in year 10 after the start year.':'The original owner had not started RMDs, so nothing is required until year 10 after the start year, when the whole balance is withdrawn.')} This is automatic. The 10 years never extend: if the holder passes, a spouse (below) takes over only what is left of them; otherwise the account ends.</div></div>
              ${married?chk(x.bene,`onBeneToggle('${xp}.bene', this.checked)`,'Inherited by spouse'):''}
            </div>
          </div>`;}).join(''):`<div class="item-note">Inherited pre-tax and Roth IRAs appear here when you give them a % on the Inheritance card.</div>`}
      </div>
    </div>`;
}
// Balance box: also re-bounds the fixed-conversion slider (0 … balance), like the Pre-tax IRA card.
function onInhIraBalance(path, i, ii, val){
  onNumberInput(path+'.balance', val);
  const max=Math.max(0,+val||0), id='inhconv_'+i+'_'+ii, r=document.getElementById(id+'_r');
  if(r){ r.max=max; if(+r.value>max){ setPair(id, max); setPath(path+'.conv', max); } }
}
function onInhIraName(path,val,inputEl){
  setPath(path+'.name', val);
  const t=inputEl.closest('.inhira-card').querySelector('.ih-title'); if(t) t.textContent=val.trim()||'Inherited IRA';
  recomputeDebounced(); saveDebounced();
}

// ── Grey background on a field changed from its inherited value ──
// The cards are built as HTML strings, so each control is matched to the asset field it edits from its own handler text, then compared with `inh.base`.
function inhValueAt(obj, path){ return path.split('.').reduce((o,k)=>(o==null?undefined:o[k]), obj); }
function inhControlField(el, prefix){
  const txt=(el.getAttribute('oninput')||'')+' '+(el.getAttribute('onchange')||'')+' '+(el.getAttribute('onclick')||'');
  if(!txt.trim()) return null;
  let m;
  const esc=prefix.replace(/\./g,'\\.');
  if((m=txt.match(new RegExp("onChangeMode\\('"+esc+"\\.([A-Za-z0-9_.]+)'")))) return m[1]+'.mode';
  if((m=txt.match(new RegExp("onAgeRangeMode\\('"+esc+"\\.([A-Za-z0-9_.]+)','(\\w+)'")))) return m[1]+'.'+m[2];
  if((m=txt.match(new RegExp("'"+esc+"\\.([A-Za-z0-9_.]+)'")))) return m[1];
  if((m=txt.match(new RegExp("onAgeRangeMode\\('"+esc+"','(\\w+)'")))) return m[1];   // a field of the card itself (e.g. the conversion start)
  if((m=txt.match(new RegExp("onConvStop\\('"+esc+"','(ord|irmaa)'")))) return m[1]==='ord'?'convOrdPct':'convIrmaaPct';
  if(new RegExp("onConvStartBracket\\('"+esc+"'").test(txt)) return 'convStartBracket';
  if(new RegExp("onConvMode\\('"+esc+"'").test(txt)) return 'convMode';
  if(/onInhIraBalance\(/.test(txt)) return 'balance';
  if(/onBasisInput\(/.test(txt)) return 'basisPct';
  if(/onPortfolioType\(/.test(txt)) return 'type';
  if(/onPortfolioName\(/.test(txt)||/onRealEstateName\(/.test(txt)||/onInhIraName\(/.test(txt)) return 'name';
  if(/onRealEstateBasis\(/.test(txt)) return 'basis';
  if((m=txt.match(/onRealEstateSell\('[^']+',\d+,'(\w+)'/))) return m[1];
  return null;
}
function markInheritedChanges(root){
  (root||document).querySelectorAll('[data-inh-card]').forEach(card=>{
    const [list,pi,idx]=card.dataset.inhCard.split('|'), p=state.people[+pi], it=p&&p[list]&&p[list][+idx];
    if(!it||!it.inh) return;
    const prefix='people.'+pi+'.'+list+'.'+idx, base=it.inh.base||{};
    card.querySelectorAll('input,select').forEach(el=>{
      if(el.type==='checkbox'&&!/\.(bene|aum)'/.test((el.getAttribute('onchange')||''))) return;   // Enable / Hide boxes are not parameters
      const f=inhControlField(el, prefix); if(!f) return;
      const changed=!inhEq(inhValueAt(it,f), inhValueAt(base,f));
      el.classList.toggle('inh-changed', changed);
    });
  });
}
function initInheritedMarks(root){
  if(root._inhWired) return; root._inhWired=true;
  const upd=()=>markInheritedChanges(root);
  root.addEventListener('input',upd); root.addEventListener('change',upd);
}
