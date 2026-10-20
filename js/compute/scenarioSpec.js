'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / SCENARIO SPEC — the vocabulary an LLM chat uses to ask for "what-if" runs, and the runner that answers them.
// No DOM, never writes the live `state`. Loaded after stressTest.js (uses withTempState, computeProjection, mcMeasure and the stress-test hook).
//
// A scenario is {id, label, levers:[{lever:'ssClaimAge', person:1, age:70}, …]}. The model never writes raw state paths: it picks named
// levers from SPEC_LEVERS, each of which validates its own parameters and sets every dependent field together (e.g. a fixed Roth
// conversion also needs convMode 'fixed' and a Roth IRA that is switched on, or the engine silently ignores it). Each lever comes back
// as 'applied', 'ignored' (with the reason) or 'noEffect' (applied, but the plan's results did not change).
// A run is computeProjection() on a private clone of `state` (withTempState), measured with mcMeasure(), so every number equals what the
// main charts would show if the same changes were typed into the inputs. Everything is in today's dollars.
// Exports (globals): SPEC_LEVERS, SPEC_KPIS, SPEC_CHARTS, specValidateLevers, specApplyLevers, specRunBatch, specSweep, specChartData,
//   specModelSummary, specRowsCsv, specToolSchemas, specPlanKey, specLeverLabel.
// ═══════════════════════════════════════════════════════════════
const SPEC_MAX_SCENARIOS=6, SPEC_MAX_SWEEP=12, SPEC_MAX_ROWS=40, SPEC_SAMPLE_EVERY=5;
const specIsNum=v=>typeof v==='number'&&isFinite(v);
const specClone=o=>JSON.parse(JSON.stringify(o));
function specPlanKey(){ return JSON.stringify(Object.assign({},state,{ui:null})); }

// Parameter types: 'person' (1 or 2), 'integer', 'number', 'boolean', 'string', 'numberArray'.
const SPEC_P_PERSON={type:'person', desc:'1 or 2: which person (1 = first person in the plan)'};
const SPEC_ENABLED={type:'boolean', desc:'true to switch on (default), false to switch off'};

function specPerson(s,n){ const size=s.filingStatus==='married'?2:1; return (Number.isInteger(n)&&n>=1&&n<=size)?s.people[n-1]:null; }
const specIgnore=note=>({status:'ignored',note});
const specOk=note=>({status:'applied',note:note||''});
const specNoPerson=n=>specIgnore('Person '+n+' is not in this plan (it has '+(state.filingStatus==='married'?'2 people':'1 person')+')');
function specSnap(stops,v){ let best=null; stops.forEach(x=>{ if(x!=null&&(best==null||Math.abs(x-v)<Math.abs(best-v))) best=x; }); return best; }

const SPEC_LEVERS={
  ssClaimAge:{
    desc:'Change the age a person claims Social Security. Ignored if that person is already collecting.',
    params:{person:SPEC_P_PERSON, age:{type:'number',min:62,max:70,desc:'claim age, 62 to 70 (fractions allowed, e.g. 67.5)'}},
    req:['person','age'],
    label:a=>'Person '+a.person+' claims Social Security at '+a.age,
    apply(s,a){
      const p=specPerson(s,a.person); if(!p) return specNoPerson(a.person);
      if(!p.ss.enabled) return specIgnore('Social Security is switched off for Person '+a.person);
      if(p.ss.started) return specIgnore('Person '+a.person+' is already collecting Social Security');
      if(Math.abs(p.ss.claimAge-a.age)<1e-9) return specIgnore('Person '+a.person+' already claims at '+a.age);
      p.ss.claimAge=a.age; return specOk();
    }
  },
  living:{
    desc:'Change household living expenses: give either a new yearly amount or a percent change (today\'s $).',
    params:{amount:{type:'number',min:0,max:5e6,desc:'new living expenses per year, today\'s $'}, pctChange:{type:'number',min:-90,max:300,desc:'percent change to living expenses, e.g. 10 or -15'}},
    req:[],
    check:a=>((a.amount==null)===(a.pctChange==null))?'give exactly one of amount or pctChange':null,
    label:a=>a.amount!=null?'Living expenses $'+Math.round(a.amount).toLocaleString()+' a year':'Living expenses '+(a.pctChange>=0?'+':'')+a.pctChange+'%',
    apply(s,a){ s.living=a.amount!=null?a.amount:(Number(s.living)||0)*(1+a.pctChange/100); return specOk(); }
  },
  inflation:{
    desc:'Set the long-run inflation rate (Social Security COLA follows it).',
    params:{pct:{type:'number',min:0,max:15,desc:'inflation, percent per year, e.g. 3'}}, req:['pct'],
    label:a=>'Inflation '+a.pct+'%',
    apply(s,a){ s.inflation=a.pct/100; return specOk(); }
  },
  returns:{
    desc:'Shift the nominal investment return of the plan\'s assets by a number of percentage points (e.g. -2 for returns two points lower).',
    params:{deltaPct:{type:'number',min:-10,max:10,desc:'percentage points added to each asset\'s growth rate'}, target:{type:'string',desc:'one of all (default: portfolios, IRAs, Roth), portfolios, ira, roth, realEstate'}},
    req:['deltaPct'],
    check:a=>(a.target==null||['all','portfolios','ira','roth','realEstate'].includes(a.target))?null:'target must be one of all, portfolios, ira, roth, realEstate',
    label:a=>'Returns '+(a.deltaPct>=0?'+':'')+a.deltaPct+' points'+((a.target&&a.target!=='all')?' ('+a.target+')':''),
    apply(s,a){
      const t=a.target||'all', size=s.filingStatus==='married'?2:1; let n=0;
      const shift=ch=>{ if(!ch) return; n++;
        if(ch.mode==='fixed'){ ch.mode='custom'; ch.value=a.deltaPct; }          // nominal 0% growth
        else if(ch.mode==='inflation'){ ch.mode='offset'; ch.value=a.deltaPct; }  // inflation + 0
        else ch.value=(Number(ch.value)||0)+a.deltaPct; };                      // offset / custom
      for(let i=0;i<size;i++){
        const p=s.people[i];
        if(t==='all'||t==='portfolios') (p.brokerage||[]).forEach(b=>{ if(b.enabled!==false) shift(b.growth); });
        if((t==='all'||t==='ira')&&p.ira.enabled) shift(p.ira.growth);
        if((t==='all'||t==='ira')) (p.inhIras||[]).forEach(h=>{ if(h&&h.enabled!==false&&h.growth) shift(h.growth); });
        if((t==='all'||t==='roth')&&p.roth&&p.roth.enabled) shift(p.roth.growth);
        if(t==='realEstate') (p.realEstate||[]).forEach(r=>{ if(r.enabled!==false) shift(r.growth); });
      }
      return n?specOk(n+' growth rate'+(n>1?'s':'')+' shifted'):specIgnore('No enabled assets of type "'+t+'" in this plan');
    }
  },
  passingAge:{
    desc:'Change the age a person is assumed to pass (the projection ends there for that person).',
    params:{person:SPEC_P_PERSON, age:{type:'number',min:60,max:110,desc:'planned passing age'}}, req:['person','age'],
    label:a=>'Person '+a.person+' lives to '+a.age,
    apply(s,a){
      const p=specPerson(s,a.person); if(!p) return specNoPerson(a.person);
      const cur=currentAge(p); if(a.age<=cur+0.5) return specIgnore('Person '+a.person+' is already '+cur.toFixed(1)+'; passing age must be higher');
      s.passing[p.id]=a.age; return specOk();
    }
  },
  stopWorking:{
    desc:'Change the age a person stops working (their wage income ends). Ignored if they have no wage income entered.',
    params:{person:SPEC_P_PERSON, age:{type:'number',min:40,max:90,desc:'last working age'}}, req:['person','age'],
    label:a=>'Person '+a.person+' stops working at '+a.age,
    apply(s,a){
      const p=specPerson(s,a.person); if(!p) return specNoPerson(a.person);
      if(!p.wage.enabled||!(p.wage.amount>0)) return specIgnore('Person '+a.person+' has no wage income entered');
      p.wage.ar.endMode='custom'; p.wage.ar.endVal=a.age; return specOk();
    }
  },
  pension:{
    desc:'Change a person\'s pension amount and/or start age (amount in today\'s $ a year).',
    params:{person:SPEC_P_PERSON, amount:{type:'number',min:0,max:2e6,desc:'pension per year, today\'s $'}, startAge:{type:'number',min:40,max:100,desc:'age the pension starts'}},
    req:['person'],
    check:a=>(a.amount==null&&a.startAge==null)?'give amount and/or startAge':null,
    label:a=>'Person '+a.person+' pension'+(a.amount!=null?' $'+Math.round(a.amount).toLocaleString()+'/yr':'')+(a.startAge!=null?' from age '+a.startAge:''),
    apply(s,a){
      const p=specPerson(s,a.person); if(!p) return specNoPerson(a.person);
      const pen=p.pension, notes=[];
      if(a.amount!=null){ pen.amount=a.amount; if(a.amount>0&&!pen.enabled){ pen.enabled=true; notes.push('pension switched on'); } if(a.amount===0) pen.enabled=false; }
      else if(!pen.enabled) return specIgnore('Person '+a.person+' has no pension entered');
      if(a.startAge!=null){ pen.ar.startMode='custom'; pen.ar.startVal=a.startAge; }
      return specOk(notes.join('; '));
    }
  },
  rothConversion:{
    desc:'Set the annual withdraw/conversion from a person\'s pre-tax IRA. mode "fixed" converts a flat amount a year (amount, today\'s $); "bracket" converts as much as fits under the limits (ordPct = highest ordinary bracket %, irmaaPct = Part B % over standard that is still allowed; or noLimit true); "off" stops it. Conversions run every year from startAge until the IRA is empty (there is no end age). Switches the Roth IRA on if a conversion needs it.',
    params:{person:SPEC_P_PERSON, mode:{type:'string',desc:'fixed (default), bracket or off'}, amount:{type:'number',min:0,max:5e6,desc:'fixed mode: dollars converted per year, today\'s $'},
            ordPct:{type:'number',min:0,max:37,desc:'bracket mode: stay below this ordinary bracket % (snapped to 10,12,22,24,32,35,37; 0 = none)'},
            irmaaPct:{type:'number',min:0,max:300,desc:'bracket mode: stay below the IRMAA tier whose Part B surcharge is this % over standard (snapped to the nearest tier)'},
            noLimit:{type:'boolean',desc:'bracket mode: no bracket or IRMAA limit'}, startAge:{type:'number',min:40,max:100,desc:'age conversions begin (default: the IRA\'s own start age)'},
            toRoth:{type:'boolean',desc:'true (default) converts to Roth; false is an ordinary taxable withdrawal that becomes cash income'}},
    req:['person'],
    check:a=>{ const m=a.mode||'fixed'; if(!['fixed','bracket','off'].includes(m)) return 'mode must be fixed, bracket or off';
      if(m==='fixed'&&a.amount==null) return 'mode fixed needs amount'; if(m!=='fixed'&&a.amount!=null) return 'amount is only used with mode fixed'; return null; },
    label:a=>{ const m=a.mode||'fixed'; return 'Person '+a.person+' '+(m==='off'?'stops IRA conversions':m==='fixed'?'converts $'+Math.round(a.amount).toLocaleString()+'/yr from the IRA':'converts IRA up to '+(a.noLimit?'no limit':((a.ordPct!=null?a.ordPct+'% bracket':'')+(a.irmaaPct!=null?' IRMAA +'+a.irmaaPct+'%':'')).trim()||'default limits'))+(a.startAge!=null?' from '+a.startAge:''); },
    apply(s,a){
      const p=specPerson(s,a.person); if(!p) return specNoPerson(a.person);
      if(!p.ira.enabled||!(Number(p.ira.balance)>0)) return specIgnore('Person '+a.person+' has no pre-tax IRA balance to convert');
      const ira=p.ira, m=a.mode||'fixed', notes=[];
      if(m==='off'){ ira.conv=0; ira.convMode='fixed'; return specOk('conversions off'); }
      ira.convToRoth=a.toRoth!==false;
      if(ira.convToRoth&&!(p.roth&&p.roth.enabled)){ p.roth.enabled=true; notes.push('Roth IRA switched on (a conversion needs it)'); }
      ira.convMode=m;
      if(m==='fixed'){ ira.conv=a.amount; }
      else if(a.noLimit){ ira.convOrdPct=null; ira.convIrmaaPct=null; }
      else{
        if(a.ordPct!=null){ const v=specSnap(CONV_ORD_STOPS,a.ordPct); ira.convOrdPct=v; if(v!==a.ordPct) notes.push('ordinary bracket snapped to '+v+'%'); }
        if(a.irmaaPct!=null){ const v=specSnap(CONV_IRMAA_STOPS,a.irmaaPct); ira.convIrmaaPct=v; if(v!==a.irmaaPct) notes.push('IRMAA limit snapped to +'+v+'%'); }
      }
      if(a.startAge!=null){ ira.convStartMode='custom'; ira.convStart=a.startAge; }
      return specOk(notes.join('; '));
    }
  },
  ltc:{
    desc:'Turn long-term care on/off for a person, with its start age (the person\'s own age) and yearly cost (today\'s $).',
    params:{person:SPEC_P_PERSON, enabled:SPEC_ENABLED, startAge:{type:'number',min:60,max:110,desc:'age care starts'}, cost:{type:'number',min:0,max:1e6,desc:'care cost per year, today\'s $'}},
    req:['person'],
    label:a=>a.enabled===false?'Long-term care off':'Person '+a.person+' needs long-term care'+(a.startAge!=null?' from '+a.startAge:'')+(a.cost!=null?' at $'+Math.round(a.cost).toLocaleString()+'/yr':''),
    apply(s,a){
      const p=specPerson(s,a.person); if(!p) return specNoPerson(a.person);
      if(a.enabled===false){ s.ltc.enabled=false; return specOk(); }
      s.ltc.enabled=true; const L=s.ltc.people[a.person-1]||(s.ltc.people[a.person-1]={startAge:85,cost:100000});
      if(a.startAge!=null) L.startAge=a.startAge; if(a.cost!=null) L.cost=a.cost; return specOk();
    }
  },
  medShock:{
    desc:'Add (or remove) a late-life medical shock: an extra yearly medical cost for a number of years starting at a person\'s age.',
    params:{person:SPEC_P_PERSON, enabled:SPEC_ENABLED, age:{type:'number',min:50,max:110,desc:'age the shock starts'}, years:{type:'integer',min:1,max:20,desc:'how many years it lasts'}, cost:{type:'number',min:0,max:1e6,desc:'extra cost per year, today\'s $'}},
    req:['person'],
    label:a=>a.enabled===false?'Medical shock off':'Medical shock'+(a.cost!=null?' $'+Math.round(a.cost).toLocaleString()+'/yr':'')+(a.years!=null?' for '+a.years+' yrs':'')+(a.age!=null?' from age '+a.age:''),
    apply(s,a){
      const p=specPerson(s,a.person); if(!p) return specNoPerson(a.person);
      if(a.enabled===false){ s.medShock.enabled=false; return specOk(); }
      Object.assign(s.medShock,{enabled:true,person:a.person-1}); ['age','years','cost'].forEach(k=>{ if(a[k]!=null) s.medShock[k]=a[k]; }); return specOk();
    }
  },
  guardrail:{
    desc:'Turn spending guardrails on/off: discretionary spending is cut when the withdrawal rate rises above its band.',
    params:{enabled:SPEC_ENABLED, discPct:{type:'number',min:0,max:100,desc:'% of living expenses that is discretionary (can be cut)'}, cutPct:{type:'number',min:0,max:50,desc:'% cut when triggered'}, band:{type:'number',min:0,max:100,desc:'band around the initial withdrawal rate, %'}, prosperity:{type:'boolean',desc:'also raise spending when the rate falls below the band'}, raisePct:{type:'number',min:0,max:50,desc:'% raise when prosperity triggers'}},
    req:[],
    label:a=>a.enabled===false?'Spending guardrails off':'Spending guardrails on',
    apply(s,a){ const g=s.guardrail; g.enabled=a.enabled!==false; ['discPct','cutPct','band','prosperity','raisePct'].forEach(k=>{ if(a[k]!=null) g[k]=a[k]; }); return specOk(); }
  },
  portfolioSales:{
    desc:'Turn on/off "portfolio withdraw": each year portfolios sell as much as fits within an LTCG bracket (0, 15 or 20 percent) and the proceeds become cash income.',
    params:{enabled:SPEC_ENABLED, ltcgPct:{type:'number',min:0,max:20,desc:'highest LTCG bracket to fill: 0, 15 or 20 (snapped)'}},
    req:[],
    label:a=>a.enabled===false?'Portfolio sales off':'Portfolio sales up to the '+(a.ltcgPct!=null?specSnap(LTCG_STOPS,a.ltcgPct):'chosen')+'% LTCG bracket',
    apply(s,a){ s.pfWithdraw.enabled=a.enabled!==false; if(a.ltcgPct!=null) s.pfWithdraw.ltcgPct=specSnap(LTCG_STOPS,a.ltcgPct); return specOk(); }
  },
  stateTax:{
    desc:'Turn state income tax on/off (CA or WA).',
    params:{enabled:SPEC_ENABLED, state:{type:'string',desc:'CA or WA'}}, req:[],
    check:a=>(a.state==null||['CA','WA'].includes(a.state))?null:'state must be CA or WA',
    label:a=>a.enabled===false?'State tax off':'State tax '+(a.state||'on'),
    apply(s,a){ s.stateTax.enabled=a.enabled!==false; if(a.state) s.stateTax.state=a.state; return specOk(); }
  },
  marketStress:{
    desc:'Replace the plan\'s constant returns with a market stress path starting on the first year without wages (or now): lostDecade (actual 2000-2009), stagflation (flat stocks, rising inflation), y1966 (actual 1966-1981), or custom (your own yearly returns). This is a simulation overlay, not a saved input, so it cannot be saved as a Scenario.',
    params:{kind:{type:'string',desc:'lostDecade, stagflation, y1966 or custom'}, startsAt:{type:'string',desc:'retirement (default) or now'}, equityShare:{type:'number',min:0,max:100,desc:'% of each asset that takes the stress return (default 100)'},
            returnsPct:{type:'numberArray',desc:'custom: nominal equity return per year, percent, e.g. [-20,-10,5]'}, inflationPct:{type:'numberArray',desc:'custom: inflation per year, percent (optional)'},
            actualInflation:{type:'boolean',desc:'lostDecade: use actual CPI instead of the plan\'s inflation'}, years:{type:'integer',min:1,max:30,desc:'stagflation: length in years (default 10)'},
            eqReturnPct:{type:'number',min:-20,max:20,desc:'stagflation: nominal equity return per year (default 0)'}, inflStartPct:{type:'number',min:0,max:20,desc:'stagflation: starting inflation (default 6)'}, inflEndPct:{type:'number',min:0,max:20,desc:'stagflation: ending inflation (default 11)'}},
    req:['kind'],
    check:a=>{ if(!['lostDecade','stagflation','y1966','custom'].includes(a.kind)) return 'kind must be lostDecade, stagflation, y1966 or custom';
      if(a.startsAt!=null&&!['retirement','now'].includes(a.startsAt)) return 'startsAt must be retirement or now';
      if(a.kind==='custom'&&!(Array.isArray(a.returnsPct)&&a.returnsPct.length>=1&&a.returnsPct.length<=40)) return 'kind custom needs returnsPct with 1 to 40 values';
      if(a.inflationPct!=null&&(!Array.isArray(a.inflationPct)||a.inflationPct.length!==(a.returnsPct||[]).length)) return 'inflationPct must have the same length as returnsPct'; return null; },
    label:a=>({lostDecade:'Lost Decade (2000-2009 returns)',stagflation:'Stagflation',y1966:'1966 retiree (1966-1981)',custom:'Custom market path'}[a.kind]||'Market stress')+((a.startsAt==='now')?' starting now':' starting at retirement'),
    apply(s,a){ return {status:'applied',note:'',market:a}; }
  }
};

// ── validation ──────────────────────────────────────────────────
function specCoerce(def,v){
  if(v==null) return undefined;
  if(def.type==='boolean'){ if(v==='true') return true; if(v==='false') return false; return v; }
  if(def.type==='number'||def.type==='integer'||def.type==='person'){ if(typeof v==='string'&&v.trim()!==''&&isFinite(Number(v))) return Number(v); return v; }
  if(def.type==='numberArray'&&Array.isArray(v)) return v.map(x=>(typeof x==='string'&&x.trim()!==''&&isFinite(Number(x)))?Number(x):x);
  return v;
}
// → {errors:[string], levers:[cleaned lever objects]}
function specValidateLevers(levers){
  const errors=[], out=[];
  if(!Array.isArray(levers)||!levers.length) return {errors:['levers must be a non-empty list'],levers:[]};
  if(levers.length>12) return {errors:['at most 12 levers per scenario'],levers:[]};
  levers.forEach((raw,i)=>{
    const name=raw&&raw.lever, def=SPEC_LEVERS[name], where='levers['+i+']';
    if(!def){ errors.push(where+': unknown lever "'+name+'". Available: '+Object.keys(SPEC_LEVERS).join(', ')); return; }
    const a={lever:name}, allowed=Object.keys(def.params), before=errors.length;
    Object.keys(raw).forEach(k=>{
      if(k==='lever'||raw[k]==null) return;
      const pd=def.params[k];
      if(!pd){ errors.push(name+'.'+k+': not a parameter of '+name+'. Parameters: '+allowed.join(', ')); return; }
      const v=specCoerce(pd,raw[k]);
      if(pd.type==='person'){ if(!(v===1||v===2)) errors.push(name+'.'+k+' must be 1 or 2 (got '+JSON.stringify(raw[k])+')'); }
      else if(pd.type==='boolean'){ if(typeof v!=='boolean') errors.push(name+'.'+k+' must be true or false'); }
      else if(pd.type==='string'){ if(typeof v!=='string') errors.push(name+'.'+k+' must be text'); }
      else if(pd.type==='numberArray'){ if(!(Array.isArray(v)&&v.every(specIsNum))) errors.push(name+'.'+k+' must be a list of numbers'); }
      else{
        if(!specIsNum(v)||(pd.type==='integer'&&!Number.isInteger(v))) errors.push(name+'.'+k+' must be '+(pd.type==='integer'?'a whole number':'a number')+' (got '+JSON.stringify(raw[k])+')');
        else if((pd.min!=null&&v<pd.min)||(pd.max!=null&&v>pd.max)) errors.push(name+'.'+k+' must be between '+pd.min+' and '+pd.max+' (got '+v+')');
      }
      a[k]=v;
    });
    (def.req||[]).forEach(k=>{ if(a[k]==null) errors.push(name+': missing required parameter "'+k+'"'); });
    if(errors.length===before&&def.check){ const e=def.check(a); if(e) errors.push(name+': '+e); }
    if(errors.length===before) out.push(a);
  });
  return {errors,levers:out};
}
function specLeverLabel(lv){ const def=SPEC_LEVERS[lv.lever]; try{ return def?def.label(lv):lv.lever; }catch(e){ return lv.lever; } }

// ── applying ────────────────────────────────────────────────────
// Applies validated levers to the state object `s` (a private clone). → {notes:[{lever,label,status,note}], market:null|{...}}
function specApplyLevers(s,levers){
  const notes=[]; let market=null;
  levers.forEach(lv=>{
    const r=SPEC_LEVERS[lv.lever].apply(s,lv);
    notes.push({lever:lv.lever,label:specLeverLabel(lv),status:r.status,note:r.note||''});
    if(r.market&&r.status==='applied') market=r.market;
  });
  return {notes,market};
}

// ── measures ────────────────────────────────────────────────────
const SPEC_KPIS={   // key → label, kind ('$' | 'age' | 'count')
  finalTotal:{label:'Assets at the end (incl. real estate)',kind:'$'},
  finalInvestable:{label:'Investable assets at the end',kind:'$'},
  lifetimeTax:{label:'Lifetime federal income tax',kind:'$'},
  peakAnnualTax:{label:'Highest one-year tax',kind:'$'},
  peakIrmaaSurcharge:{label:'Highest IRMAA surcharge',kind:'$'},
  conversionsTotal:{label:'Total moved by IRA withdraws/conversions',kind:'$'},
  socialSecurityTotal:{label:'Lifetime Social Security',kind:'$'},
  totalShortfall:{label:'Expenses left unfunded (total)',kind:'$'},
  unfundedYears:{label:'Years with unfunded expenses',kind:'count'},
  firstUnfundedAge:{label:'First age with unfunded expenses',kind:'age'},
  lowestAssets:{label:'Lowest total assets',kind:'$'},
  lowestAssetsAge:{label:'Age of lowest assets',kind:'age'},
  finalPreTaxIra:{label:'Pre-tax IRA left at the end',kind:'$'}
};
function specKpis(proj,m){
  const rows=proj.rows, n=rows.length; let peakTax=0, ss=0, unf=0, low=Infinity, lowK=0;
  rows.forEach((r,k)=>{ const t=r.totalTax||0; if(t>peakTax) peakTax=t; ss+=r.totalSS||0; if(r.expUnfunded>1) unf++; const a=m.fin[k]+m.re[k]; if(a<low){ low=a; lowK=k; } });
  const R=Math.round;
  return {finalTotal:R(m.estateFin+m.estateRe), finalInvestable:R(m.estateFin), lifetimeTax:R(m.lifeTax), peakAnnualTax:R(peakTax), peakIrmaaSurcharge:R(m.irmaaMax), conversionsTotal:R(m.convTotal),
    socialSecurityTotal:R(ss), totalShortfall:R(m.shortfall), unfundedYears:unf, firstUnfundedAge:m.failAge==null?null:R(m.failAge), lowestAssets:R(isFinite(low)?low:0), lowestAssetsAge:R(m.age0+lowK), finalPreTaxIra:R(m.estateIra)};
}
// A string that changes when any result the user would see changes (used to detect levers with no effect).
function specFingerprint(proj,m){
  const R=Math.round; let h='';
  proj.rows.forEach((r,k)=>{ h+=[r.totalTax,r.expTotal,r.totalSS,r.iraTotal,r.rothConvTotal,r.magi,r.expUnfunded,r.odiv,r.ltcg,m.fin[k],m.re[k]].map(v=>R(v||0)).join(',')+';'; });
  return h+proj.rows.length;
}

// ── running ─────────────────────────────────────────────────────
// One scenario on a private clone of the live plan. `sc.levers` must already be validated. → run object (proj and measure kept in memory).
function specRunScenario(sc){
  let applied={notes:[],market:null};
  return withTempState(s=>{ applied=specApplyLevers(s,sc.levers||[]); }, ()=>{
    let marketInfo=null;
    try{
      if(applied.market){
        const mk=applied.market, cfg=specClone(ST_DEFAULTS);
        cfg.equityShare=mk.equityShare!=null?mk.equityShare:100; cfg.start={mode:mk.startsAt==='now'?'now':'retire',years:0};
        cfg.lost={enabled:mk.kind==='lostDecade',actualInflation:!!mk.actualInflation}; cfg.y1966={enabled:mk.kind==='y1966'};
        cfg.stag=Object.assign({},cfg.stag,{enabled:mk.kind==='stagflation'});
        if(mk.years!=null) cfg.stag.years=mk.years; if(mk.eqReturnPct!=null) cfg.stag.eqReturn=mk.eqReturnPct; if(mk.inflStartPct!=null) cfg.stag.inflStart=mk.inflStartPct; if(mk.inflEndPct!=null) cfg.stag.inflEnd=mk.inflEndPct;
        const scen=mk.kind==='custom'?{id:'custom',label:'Custom path',eq:mk.returnsPct.map(v=>v/100),infl:mk.inflationPct?mk.inflationPct.map(v=>v/100):null}:stScenarios(cfg)[0];
        REC_RATES=false; const pre=computeProjection(); REC_RATES=true;
        const start=stStartRow(cfg,pre), mean=state.inflation, infl=stInflation(scen,start,mean,80), share=Math.max(0,Math.min(1,cfg.equityShare/100));
        MC_HOOK=stHook(scen,start,mean,infl,share); MC_INFL=infl;
        marketInfo={label:scen.label||mk.kind, startRow:start, startAge:pre.rows.length?Math.round(pre.rows[0].age0+start):null, years:scen.eq.length};
      }
      REC_RATES=false;
      const proj=computeProjection(), m=mcMeasure(proj,{pass:[0,0],ltcYears:[0,0]});
      return {proj,m,notes:applied.notes,market:marketInfo};
    } finally{ MC_HOOK=null; MC_INFL=null; REC_RATES=true; }
  });
}

// The live plan with these (validated) levers applied, as a plain plan object a Scenario can be made from. A market-stress lever is a simulation overlay
// and has no plan form: it is reported in `market` and not included. → {plan, notes, market}
function specBuildState(levers){
  let plan=null, applied=null;
  withTempState(s=>{ applied=specApplyLevers(s,levers); plan=specClone(s); }, ()=>null);
  return {plan,notes:applied.notes,market:applied.market};
}

// Run a batch: your plan as entered (id 'base') plus each scenario. → {planKey, base, scenarios:[run], rejected:[{id,label,errors}]}
function specRunBatch(scenarios){
  if(!Array.isArray(scenarios)||!scenarios.length) throw new Error('scenarios must be a non-empty list');
  if(scenarios.length>SPEC_MAX_SCENARIOS) throw new Error('at most '+SPEC_MAX_SCENARIOS+' scenarios per call');
  const planKey=specPlanKey(), rejected=[], ok=[], seen={};
  scenarios.forEach((raw,i)=>{
    const id=String((raw&&raw.id)||('S'+(i+1))), label=String((raw&&raw.label)||id);
    if(seen[id]){ rejected.push({id,label,errors:['duplicate scenario id "'+id+'"']}); return; } seen[id]=1;
    const v=specValidateLevers(raw&&raw.levers);
    if(v.errors.length) rejected.push({id,label,errors:v.errors}); else ok.push({id,label,levers:v.levers});
  });
  const baseRun=specRunScenario({levers:[]}); baseRun.id='base'; baseRun.label='Your plan'; baseRun.levers=[]; baseRun.kpis=specKpis(baseRun.proj,baseRun.m);
  const baseFp=specFingerprint(baseRun.proj,baseRun.m), alone={};
  const runs=ok.map(sc=>{
    const r=specRunScenario(sc); r.id=sc.id; r.label=sc.label; r.levers=sc.levers; r.kpis=specKpis(r.proj,r.m);
    r.fp=specFingerprint(r.proj,r.m); r.changed=r.fp!==baseFp;
    // Which levers did anything? One lever: the scenario itself. Several: each applied lever run alone against the plan.
    const applied=r.notes.filter(n=>n.status==='applied');
    if(!r.changed){ applied.forEach(n=>{ n.status='noEffect'; n.note=(n.note?n.note+'; ':'')+'the plan\'s results did not change'; }); }
    else if(sc.levers.length>1){
      r.notes.forEach((n,i)=>{ if(n.status!=='applied') return;
        const key=JSON.stringify(sc.levers[i]); if(!(key in alone)){ const one=specRunScenario({levers:[sc.levers[i]]}); alone[key]=specFingerprint(one.proj,one.m)!==baseFp; }
        if(!alone[key]){ n.status='noEffect'; n.note=(n.note?n.note+'; ':'')+'no effect on its own'; } });
    }
    return r;
  });
  return {planKey,base:baseRun,scenarios:runs,rejected};
}

// Vary one parameter of one lever. template = a lever object (without `param`); values = up to 12 numbers. → same shape as specRunBatch plus {sweep:{param,values}}
function specSweep(template,param,values){
  if(!template||!SPEC_LEVERS[template.lever]) throw new Error('template.lever must be one of: '+Object.keys(SPEC_LEVERS).join(', '));
  const def=SPEC_LEVERS[template.lever];
  if(!def.params[param]||!['number','integer'].includes(def.params[param].type)) throw new Error('param "'+param+'" is not a numeric parameter of '+template.lever);
  if(!Array.isArray(values)||values.length<2||values.length>SPEC_MAX_SWEEP) throw new Error('values must list 2 to '+SPEC_MAX_SWEEP+' numbers');
  const vals=values.map(Number); if(!vals.every(specIsNum)) throw new Error('values must be numbers');
  const scenarios=vals.map((v,i)=>({id:'v'+(i+1), label:param+' = '+v, levers:[Object.assign({},template,{[param]:v})]}));
  // a sweep may list more values than one call may carry scenarios, so it runs in chunks of SPEC_MAX_SCENARIOS
  const out=specRunBatchUncapped(scenarios); out.sweep={param,values:vals,lever:template.lever}; return out;
}
function specRunBatchUncapped(scenarios){
  const keep=scenarios.slice(); const chunks=[]; for(let i=0;i<keep.length;i+=SPEC_MAX_SCENARIOS) chunks.push(keep.slice(i,i+SPEC_MAX_SCENARIOS));
  const parts=chunks.map(specRunBatch);
  return {planKey:parts[0].planKey, base:parts[0].base, scenarios:[].concat(...parts.map(p=>p.scenarios)), rejected:[].concat(...parts.map(p=>p.rejected))};
}

// ── charts: data only (display/chatCharts.js draws it) ─────────
const SPEC_CHARTS={
  assets:{title:'Total assets (today\'s $)',type:'line'},
  annualTax:{title:'Federal income tax + IRMAA per year (today\'s $)',type:'line'},
  cumulativeTax:{title:'Cumulative federal tax + IRMAA (today\'s $)',type:'line'},
  unfundedExpenses:{title:'Expenses the plan could not pay (today\'s $)',type:'line'},
  magi:{title:'MAGI per year (today\'s $)',type:'line'},
  irmaa:{title:'Medicare IRMAA surcharge per year (today\'s $)',type:'line'},
  socialSecurityCumulative:{title:'Cumulative Social Security (today\'s $)',type:'line'},
  incomeBySource:{title:'Income by source, one scenario (today\'s $)',type:'stack'},
  outcomes:{title:'Outcome by scenario',type:'bar'}
};
const SPEC_ROW_FIELDS={   // fields the model may read with get_rows / chart: name → row accessor (per-year, today's $)
  wages:r=>r.wageTotal, socialSecurity:r=>r.totalSS, pension:r=>r.pension, rental:r=>r.rental, dividends:r=>r.odiv, realizedGains:r=>r.ltcg, iraDistributions:r=>r.iraTotal,
  rothConversions:r=>r.rothConvTotal, iraForExpenses:r=>r.iraExpTotal, rothForExpenses:r=>r.rothExpTotal, agi:r=>r.agi, magi:r=>r.magi, taxableSocialSecurity:r=>r.taxableSS,
  federalTax:r=>r.totalTax, stateTax:r=>r.stateTax, irmaaSurcharge:r=>r.irmaaSurcharge, livingExpenses:r=>r.expLiving, ltcExpenses:r=>r.expLtc, totalExpenses:r=>r.expTotal,
  unfundedExpenses:r=>r.expUnfunded, marginalRatePct:r=>(Number(r.marginalRate)||0)*100
};
const specNum=v=>Math.round(Number(v)||0);
function specRowAssets(run,k){ return run.m.fin[k]+run.m.re[k]; }
// → {title,type,labels:[age...],datasets:[{label,runId,isBase,data}],metric?} ; `runs` = run objects (base first when present)
function specChartData(chart,runs,opts){
  opts=opts||{};
  const def=SPEC_CHARTS[chart]; if(!def) throw new Error('unknown chart "'+chart+'". Available: '+Object.keys(SPEC_CHARTS).join(', '));
  if(!runs||!runs.length) throw new Error('no runs to draw');
  const longest=runs.reduce((a,r)=>r.proj.rows.length>a.proj.rows.length?r:a,runs[0]);
  const labels=longest.proj.rows.map(r=>Math.round(r.age0));
  const pad=(a)=>{ const o=a.slice(); while(o.length<labels.length) o.push(null); return o; };
  const perRun=f=>runs.map(r=>({label:r.label,runId:r.id,isBase:r.id==='base',data:pad(f(r))}));
  const cum=a=>{ let t=0; return a.map(v=>(t+=v)); };
  const taxIrmaa=r=>r.proj.rows.map(x=>specNum((x.totalTax||0)+(x.irmaaSurcharge||0)));
  let datasets, title=def.title, type=def.type;
  switch(chart){
    case 'assets': datasets=perRun(r=>r.proj.rows.map((_,k)=>specNum(specRowAssets(r,k)))); break;
    case 'annualTax': datasets=perRun(taxIrmaa); break;
    case 'cumulativeTax': datasets=perRun(r=>cum(taxIrmaa(r))); break;
    case 'unfundedExpenses': datasets=perRun(r=>r.proj.rows.map(x=>specNum(x.expUnfunded))); break;
    case 'magi': datasets=perRun(r=>r.proj.rows.map(x=>specNum(x.magi))); break;
    case 'irmaa': datasets=perRun(r=>r.proj.rows.map(x=>specNum(x.irmaaSurcharge))); break;
    case 'socialSecurityCumulative': datasets=perRun(r=>cum(r.proj.rows.map(x=>specNum(x.totalSS)))); break;
    case 'incomeBySource': {
      const r=runs[runs.length>1&&runs[0].id==='base'?1:0]; title='Income by source: '+r.label+' (today\'s $)';
      const parts=[['Wages',x=>x.wageTotal],['Social Security',x=>x.totalSS],['Pension',x=>x.pension],['Rental',x=>x.rental],['Annuities',x=>(x.annuity||0)+(x.annuityTE||0)],['Dividends',x=>x.odiv],['Realized gains',x=>x.ltcg],
        ['IRA distributions',x=>(x.iraTotal||0)+(x.iraExpTotal||0)],['Roth withdrawals',x=>x.rothExpTotal]];
      datasets=parts.map(([label,f])=>({label,runId:r.id,isBase:false,data:pad(r.proj.rows.map(x=>specNum(f(x))))})).filter(d=>d.data.some(v=>v));
      labels.length=0; r.proj.rows.forEach(x=>labels.push(Math.round(x.age0))); break; }
    case 'outcomes': {
      const metric=opts.metric&&SPEC_KPIS[opts.metric]?opts.metric:'finalTotal'; title=SPEC_KPIS[metric].label+' by scenario'+(SPEC_KPIS[metric].kind==='$'?' (today\'s $)':'');
      labels.length=0; runs.forEach(r=>labels.push(r.label));
      datasets=[{label:SPEC_KPIS[metric].label,runId:'*',isBase:false,data:runs.map(r=>r.kpis[metric]),perBar:runs.map(r=>r.id==='base')}]; return {chart,title,type,labels,datasets,kind:SPEC_KPIS[metric].kind,metric}; }
  }
  return {chart,title,type,labels,datasets,kind:'$'};
}
// A sweep as one line: metric against the swept value.
function specSweepChartData(sweepResult,metric){
  metric=SPEC_KPIS[metric]?metric:'finalTotal'; const rs=sweepResult.scenarios, b=sweepResult.base;
  return {chart:'sweep',type:'sweep',title:SPEC_KPIS[metric].label+' by '+sweepResult.sweep.param+' ('+sweepResult.sweep.lever+')',xTitle:sweepResult.sweep.param,labels:sweepResult.sweep.values.slice(),
    datasets:[{label:SPEC_KPIS[metric].label,runId:'*',isBase:false,data:rs.map(r=>r.kpis[metric])}], baseline:b.kpis[metric], kind:SPEC_KPIS[metric].kind, metric};
}

// ── what goes back to the model (compact; no per-year rows beyond a sample) ──
function specSample(arr){ const out=[]; arr.forEach((v,k)=>{ if(k%SPEC_SAMPLE_EVERY===0||k===arr.length-1) out.push(v); }); return out; }
function specRunSummary(run,base){
  const ages=run.proj.rows.map(r=>Math.round(r.age0)), o={runId:run.id,label:run.label,kpis:run.kpis};
  if(run.id!=='base'){
    o.levers=run.notes.map(n=>({lever:n.lever,what:n.label,status:n.status,note:n.note||undefined}));
    o.changeVsYourPlan={}; Object.keys(SPEC_KPIS).forEach(k=>{ const a=run.kpis[k], b=base.kpis[k]; if(a!=null&&b!=null&&a!==b) o.changeVsYourPlan[k]=a-b; });
    if(run.market) o.marketStress=run.market;
  }
  o.sampledEveryYears=SPEC_SAMPLE_EVERY; o.sampleAges=specSample(ages);
  o.totalAssets=specSample(run.proj.rows.map((_,k)=>specNum(specRowAssets(run,k))));
  o.federalTaxPlusIrmaa=specSample(run.proj.rows.map(x=>specNum((x.totalTax||0)+(x.irmaaSurcharge||0))));
  return o;
}
function specModelSummary(batch){
  const o={units:'today\'s dollars; ages are the first person\'s age unless stated', yourPlan:specRunSummary(batch.base,batch.base), scenarios:batch.scenarios.map(r=>specRunSummary(r,batch.base))};
  if(batch.rejected.length) o.rejected=batch.rejected;
  return o;
}

// Rows for get_rows: CSV of chosen fields for a run, between two ages (first person's age).
function specRowsCsv(run,fields,fromAge,toAge){
  const bad=(fields||[]).filter(f=>!(f in SPEC_ROW_FIELDS)&&f!=='totalAssets'&&f!=='investableAssets');
  if(!fields||!fields.length||bad.length) throw new Error('fields must be chosen from: totalAssets, investableAssets, '+Object.keys(SPEC_ROW_FIELDS).join(', ')+(bad.length?' (unknown: '+bad.join(', ')+')':''));
  const lines=['age,'+fields.join(',')]; let n=0;
  run.proj.rows.forEach((r,k)=>{
    const age=Math.round(r.age0); if((fromAge!=null&&age<fromAge)||(toAge!=null&&age>toAge)) return; if(n>=SPEC_MAX_ROWS) return; n++;
    lines.push([age].concat(fields.map(f=>f==='totalAssets'?specNum(specRowAssets(run,k)):f==='investableAssets'?specNum(run.m.fin[k]):specNum(SPEC_ROW_FIELDS[f](r)))).join(','));
  });
  if(n>=SPEC_MAX_ROWS) lines.push('(limited to '+SPEC_MAX_ROWS+' rows; narrow fromAge/toAge for the rest)');
  return lines.join('\n');
}

// ── tool declarations (neutral JSON schema; chat.js maps them to each provider) ──
function specLeverItemSchema(){
  const props={lever:{type:'string',description:'one of: '+Object.keys(SPEC_LEVERS).join(', ')}};
  Object.keys(SPEC_LEVERS).forEach(name=>{ const def=SPEC_LEVERS[name];
    Object.keys(def.params).forEach(k=>{ const d=def.params[k], t=d.type==='person'?'integer':d.type==='numberArray'?'array':d.type;
      if(props[k]){ if(props[k].type!==t) throw new Error('lever parameter "'+k+'" has conflicting types'); props[k].description+=' | '+name+': '+d.desc; return; }
      props[k]={type:t,description:name+': '+d.desc}; if(t==='array') props[k].items={type:'number'}; }); });
  return {type:'object',properties:props,required:['lever']};
}
function specToolSchemas(){
  const item=specLeverItemSchema();
  const catalog=Object.keys(SPEC_LEVERS).map(n=>'- '+n+'('+Object.keys(SPEC_LEVERS[n].params).join(', ')+'): '+SPEC_LEVERS[n].desc).join('\n');
  const chartNames=Object.keys(SPEC_CHARTS), kpiNames=Object.keys(SPEC_KPIS);
  return [
    {name:'run_scenarios',
     description:'Run what-if scenarios on the user\'s plan with the app\'s own projection engine and show the results as charts in the chat. Up to '+SPEC_MAX_SCENARIOS+' scenarios per call; your plan as entered is always included for comparison. Each scenario is a list of levers (never raw settings):\n'+catalog+'\nThe result lists every lever as applied, ignored (with why) or noEffect: report ignored / noEffect levers to the user instead of presenting unchanged numbers as a finding.',
     parameters:{type:'object',properties:{
       scenarios:{type:'array',description:'1 to '+SPEC_MAX_SCENARIOS+' scenarios',items:{type:'object',properties:{id:{type:'string',description:'short id, e.g. S1'},label:{type:'string',description:'short human label'},levers:{type:'array',items:item}},required:['id','label','levers']}},
       charts:{type:'array',description:'charts to draw now (default assets and annualTax). Any of: '+chartNames.join(', '),items:{type:'string'}},
       metric:{type:'string',description:'for the outcomes chart: one of '+kpiNames.join(', ')}},required:['scenarios']}},
    {name:'sweep',
     description:'Vary ONE numeric parameter of ONE lever over 2 to '+SPEC_MAX_SWEEP+' values (e.g. Social Security claim age 62 to 70) and chart a headline measure against it. `template` is a lever object without the swept parameter.',
     parameters:{type:'object',properties:{template:item,param:{type:'string',description:'the numeric parameter to vary, e.g. age'},values:{type:'array',items:{type:'number'},description:'2 to '+SPEC_MAX_SWEEP+' values'},metric:{type:'string',description:'measure to chart, one of: '+kpiNames.join(', ')+' (default finalTotal)'}},required:['template','param','values']}},
    {name:'show_chart',
     description:'Draw a chart from runs already computed in this conversation (no computation). Use the runId values returned by run_scenarios ("base" is your plan as entered).',
     parameters:{type:'object',properties:{chart:{type:'string',description:'one of: '+chartNames.join(', ')},runs:{type:'array',items:{type:'string'},description:'runIds to draw'},metric:{type:'string',description:'outcomes chart only: one of '+kpiNames.join(', ')}},required:['chart','runs']}},
    {name:'get_rows',
     description:'Read yearly values of one computed run as CSV (at most '+SPEC_MAX_ROWS+' rows). Fields: totalAssets, investableAssets, '+Object.keys(SPEC_ROW_FIELDS).join(', ')+'.',
     parameters:{type:'object',properties:{run:{type:'string',description:'runId'},fields:{type:'array',items:{type:'string'}},fromAge:{type:'number'},toAge:{type:'number'}},required:['run','fields']}}
  ];
}
