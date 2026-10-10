'use strict';
// ═══════════════════════════════════════════════════════════════
// COMPUTE / PROJECTION ENGINE — builds one row per year, all values
// in today's $ (spec §2, §8, §9, §10). This is the app's core model;
// everything under js/display/ just reads its output rows.
// ═══════════════════════════════════════════════════════════════

// Real (today's-dollar) annual growth rate implied by a "change" spec.
// change = {mode:'fixed'|'inflation'|'offset'|'custom', value:number(percent)}
function realGrowth(change, inflation){
  if(!change) return 0;
  switch(change.mode){
    case 'fixed': return 1/(1+inflation)-1; // nominal 0% growth, so it erodes with inflation
    case 'inflation': return 0;
    case 'offset': return (change.value||0)/100/(1+inflation); // nominal = inflation + offset
    case 'custom': return (1+(change.value||0)/100)/(1+inflation)-1;
    default: return 0;
  }
}

// Share of a portfolio's value that is unrealized gain (average-cost method): 0 when basis >= value.
function pfGainFraction(bal, basis){ return bal>0 ? Math.max(0,(bal-basis)/bal) : 0; }

// Years an IRA keeps compounding after the household's last passing (see the stretch block at the end).
const STRETCH_YEARS=10;
// Tax↔LTCG fixed-point iteration (see computeProjection): stop when the tax moves less than TAX_TOL dollars, at most TAX_MAX_ITERS rounds.
const TAX_TOL=0.005, TAX_MAX_ITERS=60;
function computeProjection(){
  const inflation=state.inflation;
  const married=state.filingStatus==='married';
  const people=married?state.people:[state.people[0]];
  const curAges=people.map(p=>currentAge(p));
  const passAges=people.map(p=>state.passing[p.id]!=null?state.passing[p.id]:95);
  const idxP0 = married ? (curAges[0]>=curAges[1]?0:1) : 0;
  const yearsToProject=Math.max(1,Math.ceil(Math.max(...people.map((p,i)=>passAges[i]-curAges[i]))));

  // ── Social Security: own/spousal amount at claim, per person (monthly, today's $) ──
  const ssMonthly=people.map((p,i)=>{
    const s=p.ss;
    if(!s.enabled) return {own:0, claimAgeEff:Infinity};
    if(s.started) return {own:s.pia, claimAgeEff:curAges[i]};
    const own=s.pia*ssOwnFactor(s.claimAge, s.fra);
    return {own, pia:s.pia, fra:s.fra, claimAgeEff:s.claimAge};
  });
  if(married && people.length===2){
    for(let i=0;i<2;i++){
      const other=1-i, s=people[i].ss, so=people[other].ss;
      if(s.enabled && !s.started && so.enabled){
        const otherPIA = so.pia;
        const spousalFRA=0.5*otherPIA;
        const spousalAtClaim=spousalFRA*ssSpousalFactor(s.claimAge, s.fra);
        ssMonthly[i].own=Math.max(ssMonthly[i].own, spousalAtClaim);
      }
    }
  }

  // ── Pre-tax IRA / 401(k) RMD schedule, plus optional annual Roth conversion ──
  // Continue RMDs after an owner's death by transferring the remaining
  // balance to the spouse when the IRA is marked to continue to spouse.
  // A Roth conversion moves money out of the pre-tax IRA and into this person's Roth IRA each year the pre-tax IRA still has a
  // balance (from the conversion start age, independent of the RMD/withdrawal age window) as long as the Roth IRA below is enabled;
  // the converted amount is added to ordinary income for tax purposes (§9.4). Two modes (`ira.convMode`):
  //   'fixed'   — a flat today's-$ amount per year (spec §4.4), capped at the balance left after the RMD.
  //   'bracket' — as much as fits under the IRMAA % and ordinary-bracket % entered. That depends on the year's other income, taxable
  //               Social Security, realized LTCG and the tax itself, so it is solved inside the year loop (see "Roth conversion
  //               solve" below); the IRA / Roth balances are therefore advanced one year at a time: pre(k) = RMD and start-of-year
  //               balances, post(k, conv) = apply the conversion and grow. Every other mode behaves exactly as when the whole
  //               schedule was simulated up front.
  const iraW=people.map(()=>({})), iraBal=people.map(()=>({})), iraConv=people.map(()=>({}));
  const iraSim=people.map((p,i)=>{
    const sim={bal:0, done:true, open:false, room:0, fixed:0, mode:'fixed', trigger:null, started:false, startedK:null, live:false, rothOk:false, convAmt:0, pre(){}, post(){}};
    if(!p.ira.enabled) return sim;
    sim.bal=Number(p.ira.balance)||0; sim.done=false;
    const [startAge,ownerEndAge]=resolveAgeRange(p.ira.ar,p);
    const g=realGrowth(p.ira.growth,inflation);
    const rothOk=!!(p.roth&&p.roth.enabled);
    sim.mode=(rothOk&&p.ira.convMode==='bracket')?'bracket':'fixed';
    const convAmt=(rothOk&&sim.mode==='fixed')?Math.max(0,Number(p.ira.conv)||0):0;
    // Conversion start: 'rmd' (default) = the IRA's own Start age (the RMD start), 'now' = today, 'custom' = ira.convStart.
    // Never earlier than the owner's current age.
    // Trigger starts ('bracket' | 'itemized' | 'ltc') are not age based: the year loop below decides, once that year's tax picture is known,
    // whether the trigger is met; from then on (`started`) the IRA converts every year like 'now' would.
    const cMode=p.ira.convStartMode||'rmd';
    sim.trigger=(cMode==='bracket'||cMode==='itemized'||cMode==='ltc')?cMode:null;
    sim.rothOk=rothOk; sim.convAmt=convAmt;
    const convStartAge=Math.max(curAges[i], cMode==='custom'?(Number(p.ira.convStart)||0):((cMode==='now'||sim.trigger)?0:startAge));
    // Start of year k: AUM balance, RMD, and the room left for a conversion. `open` = a conversion decision is pending (post() finishes the year).
    sim.pre=function(k){
      sim.open=false; sim.room=0; sim.fixed=0; sim.live=false;
      if(sim.done) return;
      const ownerAge=curAges[i]+k;
      const ownerAlive=ownerAge<passAges[i];
      const otherIdx=1-i;
      const spouseAge=(married&&people.length===2)?curAges[otherIdx]+k:Infinity;
      const spouseAlive=married&&people.length===2&&spouseAge<passAges[otherIdx];

      // While the owner is alive, use the owner's RMD schedule and the
      // owner's configured end age.  Once the owner passes, an IRA marked
      // for spouse continuation becomes an inherited IRA and keeps paying
      // RMDs while the spouse is alive.  Crucially, the owner's passing age
      // is NOT reused as the inherited IRA's end age. Conversions stop at death.
      if(!ownerAlive){
        iraConv[i][k]=0;
        if(!(p.ira.bene&&spouseAlive)){
          // Not (or no longer) inherited by a living spouse. Normally the account ends here; with the
          // "IRA stretch" box checked it is instead held by heirs: no RMDs/withdrawals, still compounding
          // (through the last passing here, then STRETCH_YEARS more in the stretch block at the end).
          if(!p.ira.stretch){ sim.done=true; return; }
          iraW[i][k]=0;
          sim.bal=sim.bal*(1+g);
          iraBal[i][k]=sim.bal;
          return;
        }
        if(sim.bal<=0){ iraW[i][k]=0; iraBal[i][k]=0; return; }
        const div=rmdDivisor(spouseAge);
        const wd=div?Math.min(sim.bal/div,sim.bal):0;
        iraW[i][k]=wd;
        sim.bal=Math.max(0,sim.bal-wd);
        sim.open=true;   // growth is applied in post(), after any draw to pay household expenses (no conversion: room and fixed stay 0)
        return;
      }

      if(ownerAge>=ownerEndAge){
        iraW[i][k]=0;
      }else if(ownerAge>=startAge&&sim.bal>0){
        const div=rmdDivisor(ownerAge), wd=div?Math.min(sim.bal/div,sim.bal):0;
        iraW[i][k]=wd;
        sim.bal=Math.max(0,sim.bal-wd);
      }else{
        iraW[i][k]=0;
      }
      sim.open=true; sim.live=true;
      sim.room=(sim.trigger?sim.started:ownerAge>=convStartAge)?sim.bal:0;       // the most that could be converted this year
      sim.fixed=Math.min(convAmt,sim.room);              // 'fixed' mode amount (0 for 'bracket' mode)
    };
    // `draw` = pre-tax IRA withdrawn this year to pay household expenses once the portfolios are exhausted (expense funding waterfall below).
    sim.post=function(k,conv,draw){
      if(!sim.open) return;
      iraConv[i][k]=conv;
      sim.bal=Math.max(0,sim.bal-conv-(draw||0))*(1+g);
      iraBal[i][k]=sim.bal;
    };
    return sim;
  });

  // ── Roth IRA: tax-free growth, funded by its starting balance plus any Roth conversion
  // amount converted from the matching pre-tax IRA above this year. No RMDs are modeled; the only
  // withdrawal is the last-resort draw that pays household expenses once the portfolios and the
  // pre-tax IRA are exhausted. It otherwise grows until its owner (or, if "continues to spouse", the
  // surviving spouse) passes. Stepped like the pre-tax IRA: pre(k) then post(k, conv).
  const rothBal=people.map(()=>({}));
  const rothSim=people.map((p,i)=>{
    const sim={bal:0, done:true, open:false, pre(){}, post(){}};
    if(!(p.roth&&p.roth.enabled)) return sim;
    sim.bal=Number(p.roth.balance)||0; sim.done=false;
    const g=realGrowth(p.roth.growth,inflation);
    sim.pre=function(k){
      sim.open=false;
      if(sim.done) return;
      const ownerAge=curAges[i]+k;
      const ownerAlive=ownerAge<passAges[i];
      const otherIdx=1-i;
      const spouseAge=(married&&people.length===2)?curAges[otherIdx]+k:Infinity;
      const spouseAlive=married&&people.length===2&&spouseAge<passAges[otherIdx];

      if(!ownerAlive){
        if(!(p.roth.bene&&spouseAlive)){
          // Same "IRA stretch" rule as the pre-tax IRA above: held by heirs and still compounding.
          if(!p.roth.stretch){ sim.done=true; return; }
          sim.bal=sim.bal*(1+g);
          rothBal[i][k]=sim.bal;
          return;
        }
        sim.open=true;   // inherited by the living spouse: growth is applied in post(), after any draw to pay household expenses
        return;
      }
      sim.open=true;
    };
    sim.post=function(k,conv,draw){
      if(!sim.open) return;
      sim.bal=Math.max(0,sim.bal+conv-(draw||0))*(1+g);
      rothBal[i][k]=sim.bal;
    };
    return sim;
  });

  // ── Annuities (per person, any number) ──
  // Simulated up front, year by year, in today's $ — an annuity's path does not depend on the tax calculation, so it is
  // computed once here and the projection loop below just reads it. Per year (V = start-of-year account value):
  //   • Payout (inside the Start–End age range): either a fixed nominal $ amount (no inflation / COLA, so it shrinks in
  //     today's $) or a % of the account value that year; never more than the account holds.
  //   • V(next) = (V − payout) × (1 + credited growth) — the credited growth is already net of all fees.
  //   • Passing benefit: paid to heirs when the contract ends (the owner's passing, or the surviving spouse's if the contract
  //     continues to the spouse): a fixed nominal $ amount, the initial account value (nominal), or the account value then.
  //     It is information for the legacy (not household cash flow); its taxable / tax-exempt split is computed below.
  // Tax treatment of the payout (nominal $ bookkeeping, results converted back to today's $):
  //   taxable   — qualified / IRA annuity: 100% ordinary income.
  //   lifo      — non-qualified deferred: withdrawals come out gain first (taxable), then return of premium (tax-free).
  //   exclusion — non-qualified annuitized: tax-free share = premium ÷ expected total payout (to the owner's passing age),
  //               until the premium is recovered, then fully taxable.
  //   exempt    — a fixed % of every payout is tax-exempt (e.g. a Roth or tax-free contract).
  // Passing benefit tax: qualified → all taxable; non-qualified → taxable above the remaining premium (premium returned
  // tax-free); exempt → the exempt % is tax-free.
  function simulateAnnuity(a, i){
    const none={on:false, yr:[]};
    if(!a||a.enabled===false) return none;
    const V0=Math.max(0,Number(a.value)||0);
    if(!(V0>0)) return none;
    const hasPrem=a.premium!=null&&a.premium!==''&&Number.isFinite(Number(a.premium));
    const prem0=Math.max(0, hasPrem?Number(a.premium):V0);
    const g=realGrowth(a.growth,inflation);
    const byPct=a.payoutMode==='pct', fixedNom=Math.max(0,Number(a.payout)||0), pct=clamp(Number(a.payoutPct)||0,0,100)/100;
    let V=V0, endK=null;
    const yr=[];
    for(let k=0;k<=yearsToProject;k++){
      const ownerAge=curAges[i]+k, ownerAlive=ownerAge<passAges[i];
      const spouseAlive=married&&people.length===2&&(curAges[1-i]+k<passAges[1-i]);
      if(!(ownerAlive||(a.bene&&spouseAlive))){ endK=k; break; }   // the contract ends with its owner unless it continues to the spouse
      const [sA,eA]=resolveAgeRange(a.ar,people[i]);
      const rangeAge=ownerAlive?ownerAge:passAges[i]-1;
      const inWindow=rangeAge>=sA&&rangeAge<eA;
      let payout=0;
      if(inWindow&&V>0) payout=byPct?V*pct:Math.min(fixedNom/Math.pow(1+inflation,k), V);
      yr[k]={bal:V, payout, fromV:payout};
      V=Math.max(0,V-payout)*(1+g);
    }
    // Tax split of each payout.
    const mode=a.tax||'lifo', exPct=clamp(Number(a.exemptPct!=null?a.exemptPct:100)||0,0,100)/100;
    let premRem=prem0, expTotalNom=0;
    yr.forEach((y,k)=>{ expTotalNom+=y.payout*Math.pow(1+inflation,k); });
    const ER=expTotalNom>0?Math.min(1,prem0/expTotalNom):0;
    yr.forEach((y,k)=>{
      const nk=Math.pow(1+inflation,k), payNom=y.payout*nk, vNom=y.bal*nk;
      let taxNom=payNom, freeNom=0, embedded=y.bal;
      if(mode==='exempt'){ freeNom=payNom*exPct; taxNom=payNom-freeNom; embedded=y.bal*(1-exPct); }
      else if(mode==='exclusion'){
        embedded=Math.max(0,vNom-premRem)/nk;
        freeNom=Math.min(ER*payNom, premRem); premRem-=freeNom; taxNom=payNom-freeNom;
      }else if(mode==='lifo'){
        const gain=Math.max(0,vNom-premRem), fromVNom=y.fromV*nk;
        const taxFromV=Math.min(fromVNom,gain), ret=fromVNom-taxFromV;
        embedded=gain/nk; premRem=Math.max(0,premRem-ret);
        freeNom=ret; taxNom=taxFromV;
      }
      y.taxable=taxNom/nk; y.taxFree=freeNom/nk; y.taxableEmbedded=embedded;
      y.nonQual=(mode==='lifo'||mode==='exclusion');
      y.passing=null;
    });
    // Passing benefit, recorded on the contract's last live year.
    if(endK!==null&&endK>=1&&yr[endK-1]){
      const nk=Math.pow(1+inflation,endK), opt=a.pb||'value';
      const bNom=opt==='fixed'?Math.max(0,Number(a.pbFixed)||0):(opt==='initial'?V0:V*nk);
      let tax=bNom, free=0;
      if(mode==='exempt'){ free=bNom*exPct; tax=bNom-free; }
      else if(mode!=='taxable'){ free=Math.min(bNom,premRem); tax=bNom-free; }
      yr[endK-1].passing={amount:bNom/nk, taxable:tax/nk, taxFree:free/nk, option:opt};
    }
    return {on:true, yr, mode};
  }
  const annuityRun=people.map((p,i)=>(p.annuities||[]).map(a=>simulateAnnuity(a,i)));

  // ── Pension / rental: always per-person ──
  // `depreciation` = true returns the item's annual depreciation instead of its income amount (same on/off rules and age range).
  function personAgedItemActive(item, ownerIdx, k, depreciation){
    if(!item.enabled) return 0;
    const owner=people[ownerIdx];
    const age=curAges[ownerIdx]+k;
    const ownerAlive = age<passAges[ownerIdx];
    if(!ownerAlive){
      // Owner has passed: this income only continues if it's marked as
      // going to the spouse on passing, we're married, and the spouse
      // is still alive; otherwise it stops.
      if(!married || !item.bene) return 0;
      const otherIdx=1-ownerIdx;
      if(!(curAges[otherIdx]+k<passAges[otherIdx])) return 0;
    }
    const [sA,eA]=resolveAgeRange(item.ar, owner);
    // Judge the owner's age range at the owner's LAST living year once they've passed, so a
    // survivor benefit isn't cut off by an end age of "passing" (= the owner's own passing age).
    const rangeAge = ownerAlive ? age : passAges[ownerIdx]-1;
    if(rangeAge<sA||rangeAge>=eA) return 0;
    if(depreciation){
      // Straight-line depreciation is a fixed nominal dollar amount, so in today's $ it shrinks by inflation each year
      // (same convention as the fixed-$ AUM fee). Entered in today's $ for year 0.
      return Math.max(0,Number(item.depreciation)||0)/Math.pow(1+inflation,k);
    }
    const g=realGrowth(item.change, inflation);
    return item.amount*Math.pow(1+g,k);
  }

  // ── Brokerage portfolio balances (today's $) ──
  // Balances are simulated year by year. Change per year = growth − (dividends used for expenses + shares sold).
  // ALL expenses — the household living expenses (state.living), the household IRMAA surcharge, the AUM fee on the
  // AUM-checked portfolios and IRAs, and the year's income tax — are pooled and funded in this order (spec §4.6):
  //   (1) household income (wages, Social Security, pension, rental, IRA RMDs), then
  //   (2) portfolio dividends (ODIV) — any dividend not needed is reinvested (adds cost basis), then
  //   (3) portfolio asset sales for whatever is left, which realize LTCG from the tracked cost basis.
  // Only portfolios with "Pay expenses" checked (IDGT or not) supply dividends and asset sales to that pool; no portfolio pays
  // any expense on its own account, so the AUM fee is paid by the pay-expenses portfolios, not by the portfolio it is charged on.
  // Cost basis is tracked in today's $ alongside every portfolio's balance: `basis` starts at the entered cost
  // basis % × start balance (blank = no unrealized gain today, i.e. basis = balance), clamped to [0, balance].
  // `stepped` marks that the owner-death step-up has been considered; `steppedNow` flags the year it applied.
  // Asset / basis swap timing: row of the last passing (first row with nobody alive) minus `basisSwapYears` (at least 1), not before row 0.
  const lastPassRow=Math.max(...people.map((p,i)=>Math.max(0,Math.ceil(passAges[i]-curAges[i]-1e-9))));
  const swapRow=Math.max(0,lastPassRow-Math.max(1,Math.round(Number(state.basisSwapYears)||BASIS_SWAP_YEARS_DEFAULT)));
  const pfState=people.map(p=>(p.brokerage||[]).map(b=>{
    const bal0=Number(b&&b.balance)||0, tracked=pfTracksBasis(b);
    const bas0=tracked?clamp(pfBasisEntered(b)?bal0*Number(b.basisPct)/100:bal0, 0, bal0):0;
    return {bal:bal0, dead:false, tracked, basis:bas0, stepped:false, steppedNow:false, swapAmt:0};
  }));
  // Real estate: a passive asset (no income, no expenses paid from it, never sold). Value grows at its own real rate; cost basis (blank = no
  // unrealized gain today) is a fixed nominal amount, so in today's $ it erodes by inflation, and it steps up to value when the owner passes
  // (a property not jointly owned leaves the plan at that point, like a brokerage portfolio).
  const reState=people.map(p=>(p.realEstate||[]).map(r=>{
    const bal0=Math.max(0,Number(r&&r.balance)||0);
    const bas0=clamp(reBasisEntered(r)?Number(r.basis):bal0, 0, bal0);   // dollars, today's $; blank = no unrealized gain
    return {bal:bal0, dead:false, basis:bas0, stepped:false, steppedNow:false, sold:false};
  }));
  // Selling a property (optional, per property; default never). The row it is sold in, by `sellMode`:
  //   'age'     — the first row the OWNER is at least `sellAge` (row 0 if already past it);
  //   'ltc'     — the row the LAST person to start long-term care starts it (the latest start row among the people whose LTC starts; never if LTC is off);
  //   'passing' — the last row of the plan, the year the last person passes.
  // Order of a sale: (1) the basis is adjusted for a passing — stepped up to value if the owner has passed (a 'passing' sale is made at the passing, so it is
  // always stepped up first); (2) any taxable gain (value − basis) is realized LTCG that year, so it goes through the household's tax like portfolio LTCG
  // (SCGL shield, qualified brackets, NIIT, taxable Social Security); the tax it adds is paid out of the sale; (3) the remaining value (value − that tax) and
  // a 100% after-tax basis are forwarded to the designated portfolio. An 'age' / 'ltc' sale is made at the END of its year at that year's end value (so
  // the tax is known and the property's band runs to the end of its last year); the portfolio has the money from the next year. A 'passing' sale is at
  // the start of the last year, already stepped up, so it has no gain and no tax.
  const lastRowK=Math.max(0,lastPassRow-1);
  const ltcStartRows=(state.ltc&&state.ltc.enabled)?people.map((p,j)=>{
    const L=(state.ltc.people&&state.ltc.people[j])||{}, sAge=Number(L.startAge)||0;
    return sAge<passAges[j]?Math.max(0,Math.ceil(sAge-curAges[j]-1e-9)):null;
  }).filter(v=>v!=null):[];
  const reSaleRow=people.map((p,i)=>(p.realEstate||[]).map(r=>{
    const mode=(r&&r.sellMode)||'never';
    if(mode==='age'){ const a=Number(r.sellAge); return a>0?Math.max(0,Math.ceil(a-curAges[i]-1e-9)):null; }
    if(mode==='ltc') return ltcStartRows.length?Math.max(...ltcStartRows):null;
    if(mode==='passing') return lastRowK;
    return null;
  }));

  // ── Suspended Capital-Gain Loss (SCGL) carryforward, spec §4.5/§8.3 ──
  // A household-level pool (today's $) that shields realized LTCG from tax, dollar-for-dollar,
  // until it's exhausted. Tracked as a running balance across years, consumed before growth/
  // inflation considerations apply (it's a fixed today's-$ pool, not itself inflation-adjusted).
  let scglRemaining=state.scglEnabled===false?0:Math.max(0,Number(state.scgl)||0);   // unchecked Enable → no SCGL

  // ── Expense-shortfall withdrawal order (Assumptions → "Expense shortfall withdrawal order") ──
  // Off (default): the built-in order — pay-expenses portfolios pro rata, then the pre-tax IRAs, then the Roth IRAs. On: the user's steps
  // are tried one at a time in order, each drawing what is still needed from its one asset; an asset that is not listed is never drawn on.
  // Asset keys: 'pf:<portfolio id>', 'ira:<person id>', 'roth:<person id>', 're:<property id>'. A key that no longer exists (or belongs to a
  // person not in the household) is skipped, as is a repeat.
  const woIdx={};
  people.forEach((p,i)=>{
    (p.brokerage||[]).forEach((b,bi)=>{ if(b&&b.id!=null) woIdx['pf:'+b.id]={t:'pf',i,bi}; });
    woIdx['ira:'+p.id]={t:'ira',i}; woIdx['roth:'+p.id]={t:'roth',i};
    (p.realEstate||[]).forEach((r,ri)=>{ if(r&&r.id!=null) woIdx['re:'+r.id]={t:'re',i,ri}; });
  });
  const woSteps=(state.withdrawOrder&&state.withdrawOrder.enabled)?(()=>{
    const seen={}, out=[];
    (state.withdrawOrder.steps||[]).forEach(s=>{ const key=s&&s.asset; if(key&&woIdx[key]&&!seen[key]){ seen[key]=1; out.push(woIdx[key]); } });
    return out;
  })():null;

  const sumArr=a=>a.reduce((x,y)=>x+y,0);
  const rows=[];
  for(let k=0;k<=yearsToProject;k++){
    const ages=people.map((p,i)=>curAges[i]+k);
    const alive=people.map((p,i)=>ages[i]<passAges[i]);
    if(!alive.some(Boolean)) break;
    // Start-of-year IRA / Roth state (RMDs, AUM balances, room to convert); the conversion itself is decided below, after the year's other income is known.
    people.forEach((p,i)=>{ iraSim[i].pre(k); rothSim[i].pre(k); });
    // Start-of-year balances (after the RMD) that could be sold to pay expenses if the portfolios run out. Captured now because post() below
    // advances the balances. A conversion leaves the pre-tax IRA and lands in the Roth IRA the same year, so it is netted/added in runWaterfall.
    const iraStart=people.map((p,i)=>iraSim[i].open?Math.max(0,iraSim[i].bal):0);
    const rothStart=people.map((p,i)=>rothSim[i].open?Math.max(0,rothSim[i].bal):0);
    // wages
    const wageByPerson=people.map((p,i)=>{
      if(!p.wage.enabled||!alive[i]) return 0;
      const [sA,eA]=resolveAgeRange(p.wage.ar, p);
      if(ages[i]<sA||ages[i]>=eA) return 0;
      const g=realGrowth(p.wage.change, inflation);
      return p.wage.amount*Math.pow(1+g,k);
    });

    // social security (with survivor switch-over)
    const ssByPerson=people.map((p,i)=>{
      if(!alive[i]||!p.ss.enabled) return 0;
      if(ages[i]<ssMonthly[i].claimAgeEff) return 0;
      let amt=ssMonthly[i].own*12;
      if(married && people.length===2){
        const other=1-i;
        if(!alive[other] && people[other].ss.enabled){
          const deceasedAmt=ssMonthly[other].own*12;
          amt=Math.max(amt, deceasedAmt);
        }
      }
      return amt;
    });
    const totalSS=ssByPerson.reduce((a,b)=>a+b,0);

    // pension / rental — always per person
    const pensionByPerson = people.map((p,i)=>personAgedItemActive(p.pension,i,k));
    const pension = pensionByPerson.reduce((a,b)=>a+b,0);

    // Rental properties: any number per person; each has its own on/off, age range, annual change and survivor flag.
    const rentalByPerson = people.map((p,i)=>(p.rentals||[]).reduce((a,r)=>a+personAgedItemActive(r,i,k),0));
    const rental = rentalByPerson.reduce((a,b)=>a+b,0);
    // Rental depreciation: a non-cash expense already deducted in the entered (taxable) rental income, so it is added back to the
    // household's cash income stream but is never taxed (it is not part of `nonSSOrdinary` / AGI).
    const rentalDepByPerson = people.map((p,i)=>(p.rentals||[]).reduce((a,r)=>a+personAgedItemActive(r,i,k,true),0));
    const rentalDep = rentalDepByPerson.reduce((a,b)=>a+b,0);

    // Annuity payouts this year (see simulateAnnuity). The taxable part is ordinary income; the tax-exempt part is untaxed but is
    // household cash income and, like other tax-exempt income, counts toward provisional income (SS taxation) and MAGI (IRMAA).
    // Non-qualified taxable payouts are also net investment income (NIIT).
    const annuitiesByPerson=people.map((p,i)=>(p.annuities||[]).map((a,ai)=>{
      const run=annuityRun[i][ai], y=run&&run.on?run.yr[k]:null;
      const nm=(a&&a.name&&a.name.trim())||('Annuity '+(ai+1));
      if(!y) return {id:a&&a.id, name:nm, balance:0, payout:0, taxable:0, taxFree:0, taxableEmbedded:0, passing:null, nonQual:false, live:false};
      return {id:a.id, name:nm, balance:y.bal, payout:y.payout, taxable:y.taxable, taxFree:y.taxFree, taxableEmbedded:y.taxableEmbedded, passing:y.passing, nonQual:y.nonQual, live:true};
    }));
    const annuityByPerson=annuitiesByPerson.map(l=>sumArr(l.map(e=>e.taxable)));
    const annuityTEByPerson=annuitiesByPerson.map(l=>sumArr(l.map(e=>e.taxFree)));
    const annuity=sumArr(annuityByPerson), annuityTE=sumArr(annuityTEByPerson);
    const annuityNII=sumArr(annuitiesByPerson.map(l=>sumArr(l.map(e=>e.nonQual?e.taxable:0))));
    const annuityBalance=sumArr(annuitiesByPerson.map(l=>sumArr(l.map(e=>e.balance))));

    // Brokerage portfolio income — each portfolio produces ODIV and QDIV (and a foreign tax credit).
    // Realized LTCG is NOT computed here: it comes from the household expense waterfall below (asset sales).
    // `active` = the portfolio is inside its age range (or continuing to a surviving spouse); an inactive
    // portfolio just compounds — it produces no dividends and is not touched to fund expenses.
    const NOPF={odiv:0,qdiv:0,ftc:0,te:0,active:false};
    function brokerageValues(portfolio, ownerIdx, k, bal){
      if(!portfolio||!portfolio.enabled||!(bal>0)) return NOPF;

      const ownerAge=curAges[ownerIdx]+k;
      const ownerAlive=ownerAge<passAges[ownerIdx];
      const otherIdx=1-ownerIdx;
      const spouseAlive=married&&people.length===2&&
        (curAges[otherIdx]+k<passAges[otherIdx]);

      // Before the owner passes, use the portfolio's configured age range.
      if(ownerAlive){
        const [sA,eA]=resolveAgeRange(portfolio.ar,people[ownerIdx]);
        if(ownerAge<sA||ownerAge>=eA) return NOPF;
      }else{
        // If inheritance is enabled, the portfolio continues for the spouse
        // after the owner passes. Do not re-apply the deceased owner's
        // "end age = passing" check, which would otherwise stop the income.
        if(!(portfolio.bene&&spouseAlive)) return NOPF;
      }

      // `bal` is this year's starting balance from the running simulation above;
      // spouse continuation therefore keeps the same projected portfolio.
      const odiv=Math.max(0,bal*(Number(portfolio.yield)||0)/100);
      const qdiv=odiv*clamp(Number(portfolio.qdivPct)||0,0,100)/100;
      // Foreign tax credit (spec §4.4, §9.4): always active, independent of the AUM box
      // and the IDGT flag. Subtracted from the household's Total Tax, not added to income.
      const ftc = bal*clamp(Number(portfolio.foreignPct)||0,0,100)/100*clamp(Number(portfolio.ftcPct)||0,0,100)/100;
      // Tax-exempt income (e.g. municipal-bond interest): a yield on the start-of-year balance, paid out of the portfolio's total
      // return to the household. It is untaxed (never in AGI) but counts as household cash income (see cashIncome below).
      const te=Math.max(0,bal*(Number(portfolio.teYield)||0)/100);
      return {odiv,qdiv,ftc,te,active:true};
    }
    // Real estate sales, part 1 — a 'passing' sale (start of the last year): the basis is stepped up to value first, so there is no gain and no tax; the whole
    // value, at a 100% basis, goes to the designated portfolio. (Sales on an age / LTC date are made at year-end, below, because they are taxed.)
    // The designated portfolio: the one chosen on the property (`sellTo`), else the owner's first non-IDGT portfolio, else the spouse's; it must be enabled and held.
    const pfHeldAt=(ti,b,aliveArr)=>{ const st=pfState[ti][(people[ti].brokerage||[]).indexOf(b)];
      return !!b&&b.enabled!==false&&!!st&&!st.dead&&(aliveArr[ti]||(b.bene&&married&&people.length===2&&aliveArr[1-ti])); };
    const pickSaleTarget=(i,r,aliveArr)=>{
      const cands=[]; people.forEach((q,ti)=>(q.brokerage||[]).forEach((b,bi)=>{ if(b&&!b.idgt) cands.push({ti,bi,b}); }));
      return (r.sellTo&&cands.find(c=>c.b.id===r.sellTo&&pfHeldAt(c.ti,c.b,aliveArr)))
        ||cands.find(c=>c.ti===i&&pfHeldAt(c.ti,c.b,aliveArr))||cands.find(c=>pfHeldAt(c.ti,c.b,aliveArr))||null; };
    const saleLabel=(r,ri)=>(r.name||'').trim()||('Property '+(ri+1));
    people.forEach((p,i)=>(p.realEstate||[]).forEach((r,ri)=>{
      const st=reState[i][ri];
      if(!r||r.enabled===false||r.sellMode!=='passing'||st.dead||st.sold||!(st.bal>0)||reSaleRow[i][ri]!==k) return;
      const spouseAlive=married&&people.length===2&&alive[1-i];
      if(!alive[i]&&!(r.bene&&spouseAlive)) return;                    // already gone with its owner; the normal path below marks it dead
      const pick=pickSaleTarget(i,r,alive); if(!pick) return;
      const T=pfState[pick.ti][pick.bi], value=st.bal;
      T.bal+=value; T.basis+=value;                                    // basis stepped up at the passing, then carried at 100%
      T.saleIn=(T.saleIn||[]).concat([{name:saleLabel(r,ri), value, basis:value, gain:0, tax:0}]);
      st.sold=true; st.dead=true; st.bal=0; st.basis=0;
    }));
    // Start-of-year balance for every portfolio. A portfolio stops existing once its owner has
    // passed unless it is marked to continue to a surviving spouse.
    const pfBalNow=people.map((p,i)=>(p.brokerage||[]).map((b,bi)=>{
      const st=pfState[i][bi];
      if(!b||!b.enabled) return 0;
      const spouseAlive=married&&people.length===2&&alive[1-i];
      if(!alive[i] && !(b.bene&&spouseAlive)) st.dead=true;
      // Step-up in basis (spec §4.6, cost basis): the year the owner has passed and the portfolio continues to
      // the surviving spouse, a tracked, non-IDGT portfolio's basis resets to its value (unrealized
      // gain → 0). IDGT assets are outside the owner's estate, so they keep their carryover basis.
      st.steppedNow=false; st.swapAmt=0;
      if(!alive[i] && !st.dead && st.tracked && !st.stepped){
        st.stepped=true;
        if(!b.idgt){ st.basis=st.bal; st.steppedNow=true; }
      }
      return st.dead?0:st.bal;
    }));
    // Asset / basis swap (Assumptions, off by default). The IDGT's swap power lets the household trade assets of equal value with the IDGT, so the
    // low-basis assets end up in the owner's estate (stepped up at the last passing) and the high-basis assets in the IDGT (carryover basis).
    // A swap of `S` of value moves the basis in proportion to the assets traded: the living portfolio gives up S × its basis ratio and takes S × the
    // IDGT's basis ratio, the IDGT the reverse, so total basis is unchanged and so are both balances (growth/dividends are unaffected).
    // It happens at the start of the year, (A) when a living-expense portfolio's basis steps up after the first passing (married; no setting), and
    // (B) `basisSwapYears` years before the last passing (single or married). Done only when it helps and is possible: the living portfolio and the
    // IDGT both exist (not dead), are funded and track cost basis, and the IDGT's basis ratio is lower than the living portfolio's. A swap is between
    // assets held by the same person: a portfolio is held by its owner while alive and, after the owner passes, by the spouse if its "Joint owned
    // with spouse" box is checked (otherwise it is gone, `dead`, and cannot be swapped).
    // IDGTs with the lowest basis % are used first, the living portfolios with the highest basis % first; S = min(value left, IDGT value left).
    if(state.basisSwap){
      // Current holder of a portfolio: its owner while alive; once the owner has passed, the spouse if "Joint owned with spouse" is checked.
      const holder=(i,b)=>alive[i]?i:((b&&b.bene&&married&&people.length===2&&alive[1-i])?1-i:-1);
      const swapWith=living=>{
        const idgts=[];
        people.forEach((p,j)=>(p.brokerage||[]).forEach((b,bj)=>{
          const t=pfState[j][bj];
          const own=holder(j,b);                                // who holds it now (-1 = nobody: it has gone)
          if(b&&b.enabled&&b.idgt&&!t.dead&&own>=0&&t.tracked&&t.bal>0.005) idgts.push({s:t, cap:t.bal, own});
        }));
        if(!idgts.length||!living.length) return;
        living.sort((x,y)=>(y.t.basis/y.t.bal)-(x.t.basis/x.t.bal));
        living.forEach(Lx=>{
          const L=Lx.t; let left=L.bal;
          idgts.sort((x,y)=>(x.s.basis/x.s.bal)-(y.s.basis/y.s.bal));
          idgts.forEach(g=>{
            if(!(left>0.005)||!(g.cap>0.005)||g.own!==Lx.own) return;   // a swap is between assets held by the same person
            const rL=L.basis/L.bal, rI=g.s.basis/g.s.bal;
            if(!(rI<rL-1e-9)) return;                     // nothing to gain: the IDGT's assets do not have a lower basis %
            const amt=Math.min(left,g.cap), shift=amt*(rL-rI);
            L.basis-=shift; g.s.basis+=shift;
            L.swapAmt+=amt; g.s.swapAmt+=amt; left-=amt; g.cap-=amt;
          });
        });
      };
      const livingStates=pick=>{ const out=[];
        people.forEach((p,i)=>(p.brokerage||[]).forEach((b,bi)=>{ const t=pfState[i][bi];
          if(b&&b.enabled&&!b.idgt&&!t.dead&&t.tracked&&t.bal>0.005&&pick(t)){ const own=holder(i,b); if(own>=0) out.push({t, own}); } }));
        return out; };
      swapWith(livingStates(t=>t.steppedNow));                                  // (A) after the first passing (the stepped-up portfolio)
      if(k===swapRow) swapWith(livingStates(()=>true));                         // (B) N years before the last passing
    }
    // Dividends / foreign tax credit per portfolio (independent of expenses).
    const pfVals=people.map((p,i)=>(p.brokerage||[]).map((b,bi)=>brokerageValues(b,i,k,pfBalNow[i][bi])));

    // Household IRMAA surcharge for this year (today's $; the tier tables are indexed, so they aren't deflated):
    // the tier reached by the MAGI (AGI + tax-exempt income) from TWO years earlier (IRMAA's real look-back: the premium for year Y is set from the
    // tax return for year Y−2; it also means this year's AGI — which depends on this year's LTCG, which depends on asset
    // sales, which fund this surcharge — is never needed, so there is no circularity) × the number of living people age 65+.
    // Years 0 and 1 have no projected AGI two years back (the model has no pre-projection history), so they are $0.
    // Filing status is this year's.
    // IRMAA's MAGI = AGI + tax-exempt interest, so the tax-exempt income of that year counts toward the tier.
    const priorAGI = (k>=2 && rows[k-2]) ? ((rows[k-2].agi||0)+(rows[k-2].teIncome||0)+(rows[k-2].annuityTE||0)) : 0;
    const irmaaEnrolled = people.reduce((n,p,i)=>n+((alive[i]&&ages[i]>=65)?1:0),0);
    const irmaaFiling = married && alive[0] && alive[1] ? 'married' : 'single';
    const irmaaTier = (irmaaFiling==='married'?IRMAA_MFJ:IRMAA_SGL).slice().reverse().find(t=>priorAGI>=t.magi);
    const irmaaSurcharge = irmaaTier ? irmaaTier.surch*irmaaEnrolled : 0;
    // The IRMAA surcharge is always a household expense (no per-portfolio opt-in); it is paid by the pool below.
    // AUM fee (spec §4.6): a household assumption (`state.aumFee`) charged on the AUM balance = the start-of-year
    // balances of every non-IDGT portfolio whose AUM box is checked (and that is enabled, inside its age range and funded). IDGTs and IRAs (pre-tax and Roth) are never charged.
    // '% AUM balance' × that sum, or a fixed $/yr (entered in today's $ for year 0, flat nominal, so it shrinks with inflation).
    // The charge is split across the checked accounts pro rata to balance (for display); the whole fee is a household expense
    // paid by the pool below — i.e. only by portfolios with "Pay expenses" checked.
    const aumMode=(state.aumFee&&state.aumFee.mode==='fixed')?'fixed':'pct';
    const aumVal=(state.aumFee&&state.aumFee.enabled===false)?0:Math.max(0,Number(state.aumFee&&state.aumFee.value)||0);   // unchecked Enable → no fee
    const aumBase=people.map((p,i)=>(p.brokerage||[]).map((b,bi)=>(b&&b.aum&&!b.idgt&&pfVals[i][bi].active&&!pfState[i][bi].dead&&pfBalNow[i][bi]>0)?pfBalNow[i][bi]:0));
    const aumBalance=aumBase.reduce((a,row)=>a+row.reduce((x,y)=>x+y,0),0);
    const aumFee=aumBalance>0?(aumMode==='pct'?aumBalance*aumVal/100:aumVal/Math.pow(1+inflation,k)):0;
    // ── Household expense funding waterfall (spec §4.6) ──
    // Expenses = household living expenses (today's $, flat in real terms) + the household IRMAA surcharge + the
    // AUM fee + THIS YEAR'S INCOME TAX (tax drag is an expense). Funded by, in order: (1) household
    // income, (2) portfolio dividends (leftovers are reinvested), (3) portfolio asset sales (each sale realizes
    // LTCG = amount sold × the portfolio's unrealized-gain fraction), then — only once the portfolios are exhausted —
    // (4) pre-tax IRA withdraw (ordinary income, so it adds to the tax that is itself an expense) and (5) Roth IRA withdrawn (tax-free).
    // Circularity: tax ← LTCG ← asset sales ← expenses ← tax. It is resolved by fixed-point iteration (see the
    // solver below): guess the tax, run the waterfall, recompute the tax, repeat until it stops changing.
    // Household cash income: wages, Social Security, pension, rental (+ its depreciation add-back), tax-exempt income and IRA RMDs. The Roth-conversion
    // amount is excluded (it moves to the Roth IRA, it isn't spendable). Gross — the tax it triggers is itself
    // one of the expenses it pays for.
    // Tax-exempt income per person (portfolio `teYield` × start-of-year balance, capped at what the portfolio can pay out). It is
    // untaxed — never in AGI — but is household cash income, so it pays expenses and any excess can be reinvested.
    const teByPerson=people.map((p,i)=>(p.brokerage||[]).reduce((a,b,bi)=>{
      const v=pfVals[i][bi]; if(!v.active||pfState[i][bi].dead) return a;
      const avail=Math.max(0,pfBalNow[i][bi]*(1+realGrowth(b.growth,inflation)));
      return a+Math.min(v.te||0, avail);
    },0));
    const teIncome=teByPerson.reduce((a,b)=>a+b,0);
    const cashIncome = sumArr(wageByPerson)+totalSS+pension+rental+rentalDep+teIncome+annuity+annuityTE+people.reduce((a,p,i)=>a+(iraW[i][k]||0),0);
    // Per-portfolio working entries. Only live, funded portfolios have one.
    const pfx=people.map(()=>[]);
    const poolPf=[];   // portfolios inside their age range with "Pay expenses" checked — the only sources for household expenses
    people.forEach((p,i)=>(p.brokerage||[]).forEach((b,bi)=>{
      const st=pfState[i][bi], bal=pfBalNow[i][bi];
      if(st.dead||!(bal>0)) return;
      const v=pfVals[i][bi];
      const g=realGrowth(b.growth,inflation), avail=Math.max(0,bal*(1+g));
      const feeShare=aumBalance>0?aumFee*aumBase[i][bi]/aumBalance:0;   // this portfolio's share of the AUM fee
      const feeD=feeShare;   // informational: the AUM fee charged on this balance (paid by the pool, not by this portfolio)
      const x={active:v.active, idgt:!!b.idgt, payExp:!!b.payExp, reinvest:!!b.reinvest, feeShare, bal, g, avail, feeD, odiv:v.odiv, te:Math.min(v.te||0, avail),
               f:st.tracked?pfGainFraction(bal,st.basis):0, divUsed:0, sold:0, ltcg:0, excessIn:0};
      pfx[i][bi]=x;
      // Only portfolios with "Pay expenses" checked contribute dividends and asset sales to household expenses.
      if(x.active && x.payExp) poolPf.push(x);
    }));

    // Dividends / foreign tax credit per person — independent of the waterfall and of LTCG.
    const brokerageByPerson=people.map((p,i)=>{
      let odiv=0,qdiv=0,ftc=0;
      (p.brokerage||[]).forEach((b,bi)=>{const v=pfVals[i][bi];odiv+=v.odiv;qdiv+=v.qdiv;ftc+=v.ftc;});
      return {odiv,qdiv,ftc};
    });
    const odivByPerson=brokerageByPerson.map(v=>v.odiv);
    const qdivByPerson=brokerageByPerson.map(v=>v.qdiv);
    const odivNQByPerson=people.map((p,i)=>Math.max(0,odivByPerson[i]-qdivByPerson[i]));
    const odiv=odivByPerson.reduce((a,b)=>a+b,0), qdiv=qdivByPerson.reduce((a,b)=>a+b,0);
    const odivNQ=odivNQByPerson.reduce((a,b)=>a+b,0);
    // Foreign tax credit (spec §4.4, §9.4): summed across every brokerage portfolio (both people),
    // then subtracted from Total Tax below — a nonrefundable credit against regular income tax,
    // not against NIIT (mirrors how the real-world credit doesn't offset the investment surtax).
    const ftcByPerson=brokerageByPerson.map(v=>v.ftc);
    const foreignTaxCredit=ftcByPerson.reduce((a,b)=>a+b,0);

    // IRA withdrawals, plus any Roth conversion amount (taxed as ordinary income, spec §4.4)
    const iraByPerson=people.map((p,i)=>iraW[i][k]||0);

    const wageTotal=wageByPerson.reduce((a,b)=>a+b,0);
    const iraTotal=iraByPerson.reduce((a,b)=>a+b,0);

    // Ordinary side of the return that does not depend on LTCG, computed once outside the iteration. (Taxable Social Security does
    // depend on LTCG — provisional income includes QDIV and LTCG — so it is computed inside taxOn() below.)
    const filing = married && alive[0] && alive[1] ? 'married' : 'single';
    const ssThresholdFactor = Math.pow(1+inflation,-k); // un-indexed SS-tax thresholds, in today's $
    const nonSSBase = wageTotal+pension+rental+annuity+iraTotal+odivNQ;   // + the Roth conversion (decided below) = nonSSOrdinary
    const std = filing==='married'?STD_MFJ:STD_SGL;
    // Long Term Care: from the LTC start age (older person's age) the LTC cost is an extra expense and the household
    // living expense switches to the post-LTC amount. Both are today's $ (flat in real terms = inflating in future $).
    // Per person: triggered once that person (alive at the start) reaches their own LTC start age; the cost runs while they are alive.
    // The household living expense becomes the 1st-LTC amount once the first LTC has started, and the 2nd-LTC amount once the second has.
    const ltc=state.ltc||{};
    let expLtc=0, ltcStarted=0; const ltcCostByPerson=people.map(()=>0);
    if(ltc.enabled) people.forEach((p,i)=>{
      const L=(ltc.people&&ltc.people[i])||{}, sAge=Number(L.startAge)||0;
      if(!(sAge<passAges[i]) || ages[i]<sAge) return;
      ltcStarted++;
      if(alive[i]){ ltcCostByPerson[i]=Math.max(0,Number(L.cost)||0); expLtc+=ltcCostByPerson[i]; }
    });
    const ltcLiving=ltcStarted>=2?Math.max(0,Number(ltc.living2)||0):(ltcStarted===1?Math.max(0,Number(ltc.living1!=null?ltc.living1:ltcLiving1Default(married))||0):null);
    const ltcActive=ltcLiving!==null;
    // Itemized deduction = LTC cost above the 7.5%-of-AGI floor; AGI includes realized LTCG, so it is computed inside taxOn() below.
    // Enhanced deduction for seniors (Schedule 1-A Part V): each living person who is 65 by the end of this tax year (birth year
    // + 65 ≤ year; the model tracks birth year and month only, so a Jan 1 birthday exactly 65 years earlier is not picked up),
    // for tax years 2025–2028 only. The amount depends on AGI, so it is evaluated inside taxOn() and in the SST/marginal helper.
    const taxYear=THIS_YEAR+k;
    const seniorN=(taxYear>=SENIOR_FIRST_YEAR&&taxYear<=SENIOR_LAST_YEAR)?people.reduce((n,p,i)=>n+((alive[i]&&(Number(p.birthYear)||0)+65<=taxYear)?1:0),0):0;
    const seniorOf=agiX=>computeSeniorDeduction(seniorN, agiX, filing, ssThresholdFactor);
    const ordBrk = filing==='married'?MFJ_ORD:SGL_ORD;
    // State income tax (Assumptions → State tax): off unless enabled. Paid like federal tax (a household expense funded by the waterfall),
    // but kept apart from Total Tax (TT) so the Total Income Tax chart can stack it on top as its own line.
    const stCode=(state.stateTax&&state.stateTax.enabled)?state.stateTax.state:null;
    const stN=people.reduce((n,p,i)=>n+(alive[i]?1:0),0), stSenior=people.reduce((n,p,i)=>n+((alive[i]&&ages[i]>=65)?1:0),0);
    const qBrk = filing==='married'?MFJ_QDIV:SGL_QDIV;
    const expLiving=Math.max(0,Number(ltcActive?ltcLiving:state.living)||0);
    const expIrmaa=irmaaSurcharge;
    // The whole AUM fee is a household expense (paid by the pay-expenses portfolios via the waterfall).
    const expAum=aumFee;

    // Real estate sales, part 2 — taxed sales on an age / LTC date, made at the END of this year at the year-end value. (1) The basis steps up to value if the
    // owner has already passed (the property continues only with a surviving spouse, if jointly owned); (2) the gain over the (inflation-eroded) basis is realized
    // LTCG this year (value − exemption × owners alive − basis), added to the portfolio sales' LTCG in the waterfall below; (3) after the tax it adds, the rest goes to the designated portfolio (which must
    // still be held next year) at a 100% basis. The last year of the plan is excluded (the owner's passing then steps the basis up anyway).
    const aliveNext=people.map((p,i)=>ages[i]+1<passAges[i]);
    const reSales=[];
    people.forEach((p,i)=>(p.realEstate||[]).forEach((r,ri)=>{
      const st=reState[i][ri];
      if(!r||r.enabled===false||r.sellMode==='passing'||st.dead||st.sold||!(st.bal>0)||reSaleRow[i][ri]!==k||k>=lastRowK) return;
      const spouseAlive=married&&people.length===2&&alive[1-i];
      if(!alive[i]&&!(r.bene&&spouseAlive)) return;
      const pick=pickSaleTarget(i,r,aliveNext); if(!pick) return;
      const valEnd=st.bal*(1+realGrowth(r.growth,inflation));
      const basisNow=(!alive[i]&&!st.stepped)?st.bal:st.basis;          // (1) stepped up on the owner's passing
      const basEnd=clamp(basisNow/(1+inflation), 0, valEnd);
      // Exemption per living owner (this property's owner, plus the spouse when it is jointly owned). It is a fixed nominal amount, so like the cost basis it
      // erodes with inflation in today's $: the amount entered, divided by (1 + inflation) for each year up to this year's end.
      const ownersAlive=(alive[i]?1:0)+((r.bene&&married&&people.length===2&&alive[1-i])?1:0);
      const exempt=Math.max(0,Number(r.exempt)||0)/Math.pow(1+inflation,k+1)*ownersAlive;
      reSales.push({i, ri, ti:pick.ti, bi:pick.bi, name:saleLabel(r,ri), valEnd, basEnd, ownersAlive, exempt, gain:Math.max(0,valEnd-exempt-basEnd), tax:0, net:valEnd});
    }));
    const reGainTotal=reSales.reduce((a,x)=>a+x.gain,0);
    // Real estate sold to cover an expense shortfall (a 'sell' step in the withdrawal order). The whole property is sold at the START of this year at its
    // start-of-year value, so the proceeds are available for this year's expenses: (1) the basis is stepped up to value if the owner has passed; (2) the gain
    // over the (inflation-eroded) basis and the exemption is realized LTCG this year, taxed with everything else (the tax is an ordinary household expense,
    // paid by the same waterfall); (3) what the shortfall does not use goes to the designated portfolio at a 100% basis (it is in the balance from next year;
    // with no portfolio to take it, it leaves the model). A property with a scheduled sale this year (age / LTC / passing) is left to that sale.
    function reShortInfo(i,ri){
      const r=(people[i].realEstate||[])[ri], st=reState[i][ri];
      if(!r||r.enabled===false||st.dead||st.sold||!(st.bal>0)) return null;
      const spouseAlive=married&&people.length===2&&alive[1-i];
      if(!alive[i]&&!(r.bene&&spouseAlive)) return null;
      if(reSales.some(x=>x.i===i&&x.ri===ri)) return null;
      const value=st.bal, basis=clamp((!alive[i]&&!st.stepped)?st.bal:st.basis, 0, value);
      const ownersAlive=(alive[i]?1:0)+((r.bene&&married&&people.length===2&&alive[1-i])?1:0);
      const exempt=Math.max(0,Number(r.exempt)||0)/Math.pow(1+inflation,k)*ownersAlive;
      const pick=pickSaleTarget(i,r,aliveNext);
      return {i, ri, ti:pick?pick.ti:null, bi:pick?pick.bi:null, name:saleLabel(r,ri), value, basis, exempt, ownersAlive, gain:Math.max(0,value-exempt-basis)};
    }
    // One pass of the funding waterfall for a given income-tax expense `taxExp`. Resets and refills every pool
    // portfolio's divUsed / sold / ltcg and returns the funding split.
    function runWaterfall(taxExp){
      const expTotal=expLiving+expLtc+expIrmaa+expAum+taxExp;
      poolPf.forEach(x=>{ x.divUsed=0; x.sold=0; x.ltcg=0; });
      const expFromIncome=Math.min(expTotal,cashIncome);
      let expNeed=expTotal-expFromIncome;
      // (2) dividends, shared pro rata to each portfolio's ODIV
      const poolOdiv=poolPf.reduce((a,x)=>a+x.odiv,0);
      const expFromDiv=Math.min(poolOdiv,expNeed);
      if(poolOdiv>0) poolPf.forEach(x=>{ x.divUsed=expFromDiv*x.odiv/poolOdiv; });
      expNeed-=expFromDiv;
      // (3) asset sales, shared pro rata to balance; a portfolio that runs out hands its remainder to the others
      const needBeforeSales=expNeed;
      let cand=woSteps?[]:poolPf.filter(x=>x.avail-x.divUsed-x.te>0.005), guard=0;   // (with a withdrawal order, the steps below do the selling)   // tax-exempt income is paid out of the same total return, so it is reserved before any sale
      while(expNeed>0.005 && cand.length && guard++<8){
        const B=cand.reduce((a,x)=>a+x.bal,0); let given=0; const next=[];
        cand.forEach(x=>{
          const room=Math.max(0,x.avail-x.divUsed-x.te-x.sold), amt=Math.min(expNeed*x.bal/B, room);
          x.sold+=amt; given+=amt; if(room-amt>0.005) next.push(x);
        });
        expNeed-=given; cand=next;
      }
      // (4) pre-tax IRA, then (5) Roth IRA, for what the portfolios could not cover. Each is shared pro rata to balance across the
      // people's accounts. A pre-tax IRA withdraw is ordinary income (taxOn adds it, and the tax-expense iteration grosses it up); a Roth IRA
      // sale is tax-free. Converted dollars have left the pre-tax IRA and sit in the Roth IRA the same year.
      const iraAvail=iraStart.map((b,i)=>Math.max(0,b-(convByPerson[i]||0)));
      const rothAvail=rothStart.map((b,i)=>b+(convByPerson[i]||0));
      const drawPro=(avail,need)=>{ const tot=avail.reduce((a,b)=>a+b,0), amt=Math.min(Math.max(0,need),tot); return avail.map(v=>tot>0?amt*v/tot:0); };
      let expFromSales, iraExpByPerson, rothExpByPerson, expFromIra, expFromRoth, expFromRe=0, reShort=[];
      if(!woSteps){
        expFromSales=needBeforeSales-Math.max(0,expNeed);
        iraExpByPerson=drawPro(iraAvail, expNeed);
        expFromIra=iraExpByPerson.reduce((a,b)=>a+b,0);
        expNeed-=expFromIra;
        rothExpByPerson=drawPro(rothAvail, expNeed);
        expFromRoth=rothExpByPerson.reduce((a,b)=>a+b,0);
        expNeed-=expFromRoth;
      }else{
        // The user's withdrawal order replaces (3)–(5) and the pro-rata sharing: the shortfall that dividends left is taken from the listed assets one at a
        // time, in order, each as far as it can go. Tax follows the asset: a portfolio sale realizes LTCG on its gain share (and must be a Living expense & income portfolio — payExp, as
        // always); a pre-tax IRA draw is ordinary income; a Roth IRA draw is tax-free; a property is sold whole (see reShortInfo).
        poolPf.forEach(x=>{ x.sold=0; });
        expNeed=needBeforeSales;
        iraExpByPerson=people.map(()=>0); rothExpByPerson=people.map(()=>0);
        let sales=0;
        for(const s of woSteps){
          if(!(expNeed>0.005)) break;
          if(s.t==='pf'){
            const x=pfx[s.i][s.bi]; if(!x||!x.active||!x.payExp) continue;
            const amt=Math.min(expNeed, Math.max(0,x.avail-x.divUsed-x.te-x.sold));
            x.sold+=amt; sales+=amt; expNeed-=amt;
          }else if(s.t==='ira'){
            const amt=Math.min(expNeed, iraAvail[s.i]); iraExpByPerson[s.i]+=amt; expNeed-=amt;
          }else if(s.t==='roth'){
            const amt=Math.min(expNeed, rothAvail[s.i]); rothExpByPerson[s.i]+=amt; expNeed-=amt;
          }else{
            const c=reShortInfo(s.i,s.ri); if(!c) continue;
            const applied=Math.min(expNeed, c.value);
            expNeed-=applied; expFromRe+=applied;
            reShort.push(Object.assign({}, c, {applied, excess:c.value-applied}));
          }
        }
        expFromSales=sales;
        expFromIra=iraExpByPerson.reduce((a,b)=>a+b,0);
        expFromRoth=rothExpByPerson.reduce((a,b)=>a+b,0);
      }
      const expUnfunded=Math.max(0,expNeed);
      // Realized LTCG = sold × gain fraction, for every portfolio (IDGT included, on its own sales).
      poolPf.forEach(x=>{ x.ltcg=x.sold*x.f; });
      const reShortGain=reShort.reduce((a,x)=>a+x.gain,0);
      let ltcgGross=reGainTotal+reShortGain; pfx.forEach(list=>list.forEach(x=>{ if(x) ltcgGross+=x.ltcg; }));   // portfolio sales' LTCG + the gain on a property sold this year (step 2)
      return {expTotal, expFromIncome, expFromDiv, expFromSales, expFromIra, expFromRoth, expFromRe, expUnfunded, ltcgGross, iraExpByPerson, rothExpByPerson, reShort, reShortGain};
    }
    // The year's tax given gross realized LTCG. Spec §8.3: available SCGL (suspended capital-gain loss
    // carryforward) eliminates realized LTCG dollar-for-dollar, before tax, so only the net-of-SCGL amount is taxed.
    // Pure (does not consume the SCGL pool) — the pool is drawn down once, after the iteration converges.
    function taxOn(ltcgGross, conv, iraExp, reGainAll){
      const nonSSOrdinary=nonSSBase+conv+(iraExp||0);   // ordinary income excluding Social Security, including this year's Roth conversion and any pre-tax IRA withdraw for expenses
      const scglUsed=Math.min(scglRemaining,Math.max(0,ltcgGross));
      const ltcg=Math.max(0,ltcgGross-scglUsed); // net-of-SCGL LTCG — what's actually taxed/displayed
      const qualIncome=qdiv+ltcg;
      // Provisional income = ALL non-SS income in AGI (ordinary, QDIV, net LTCG) + tax-exempt income + 50% of SS, so taxable SS
      // moves with the realized LTCG and is solved inside the same tax ↔ LTCG iteration.
      const {taxableSS,provisional}=computeTaxableSS(nonSSOrdinary+qdiv+ltcg+teIncome+annuityTE, totalSS, filing, ssThresholdFactor);
      const ordIncome=nonSSOrdinary+taxableSS;
      const agi=nonSSOrdinary+taxableSS+qdiv+ltcg;
      const agiFloor=0.075*Math.max(0,agi);
      const itemized=Math.max(0, expLtc-agiFloor);
      const usedItemized=itemized>std;
      const ded=Math.max(std,itemized);
      const seniorDed=seniorOf(agi);   // on top of the standard/itemized deduction; does not reduce AGI
      const ordTI=Math.max(0, ordIncome-ded-seniorDed);
      const ordTax=calcOrdTax(ordTI, ordBrk);
      const qualTax=calcQualTax(ordTI, qualIncome, qBrk);
      const incomeTax=ordTax+qualTax; // ordinary + qualified only — the SST hypothetical below mirrors this basis
      // §9.4 NIIT: 3.8% of the lesser of net investment income (ODIV−QDIV + QDIV + LTCG) or MAGI (~AGI)
      // over the un-indexed threshold. Added on top of ordinary + qualified tax for Total Tax (TT).
      const niiIncome=odivNQ+qdiv+ltcg+annuityNII;
      const niit=computeNIIT(niiIncome, agi, filing, ssThresholdFactor, state.futureTax, THIS_YEAR+k);
      // §9.4: foreign tax credit offsets the ordinary+qualified tax (not NIIT), floored at 0.
      const totalTax=Math.max(0, incomeTax-foreignTaxCredit)+niit;
      // State tax (not part of totalTax). Washington taxes only portfolio gains, so a property sale's gain (and the SCGL it uses first) is left out.
      const stateTax=stCode?computeStateTax(stCode,{agi, taxableSS, expLtc, ltcgPortfolio:Math.max(0,ltcgGross-(reGainAll==null?reGainTotal:reGainAll)-scglUsed), filing, nAlive:stN, nSenior:stSenior, f:ssThresholdFactor}):0;
      return {stateTax, scglUsed, ltcg, qualIncome, qualTax, taxableSS, provisional, ordIncome, agi, incomeTax, niiIncome, niit, totalTax, agiFloor, itemized, usedItemized, ded, seniorDed, ordTI, ordTax};
    }

    // ── Tax ↔ LTCG fixed-point iteration ──
    // T_{n+1} = Tax( LTCG( Waterfall( living + IRMAA + AUM fee + T_n ) ) ). More tax → more expenses → more shares
    // sold → more LTCG → more tax, but each extra tax dollar creates well under a dollar of new tax (LTCG is
    // taxed at ≤ ~24% including NIIT, and only the gain share of a sale is LTCG), so the map is a contraction:
    // the error shrinks ~4× per round and a few rounds settle it to the cent. Warm-started from last year's tax
    // (and, during the conversion search below, from the previous trial).
    let taxIn=(k>0&&rows[k-1])?((rows[k-1].totalTax||0)+(rows[k-1].stateTax||0)):0;
    function solveTax(convTotal){
      let it=0, ok=false, w, t, saleTax=0;
      while(it<TAX_MAX_ITERS){
        w=runWaterfall(taxIn); t=taxOn(w.ltcgGross, convTotal, w.expFromIra, reGainTotal+w.reShortGain); it++;
        // The tax a property sale adds (this year's tax with the gain minus without it) is paid out of the sale, so the waterfall funds only the rest.
        // (A property sold to cover a shortfall is not netted here: its tax is an ordinary expense, paid by the same waterfall.)
        saleTax=reGainTotal>0?Math.max(0,(t.totalTax+t.stateTax)-(()=>{ const u=taxOn(w.ltcgGross-reGainTotal, convTotal, w.expFromIra, w.reShortGain); return u.totalTax+u.stateTax; })()):0;
        const funded=t.totalTax+t.stateTax-saleTax;
        if(Math.abs(funded-taxIn)<TAX_TOL){ ok=true; break; }
        taxIn=funded;
      }
      return {wf:w, tx:t, saleTax, iters:it, converged:ok};
    }

    // ── Roth conversion solve ──
    // 'fixed' IRAs convert their flat amount. 'bracket' IRAs convert as much as fits under BOTH limits entered (AND — the stricter limit
    // sets the amount), one person at a time in person order (each given the conversions already settled): the largest amount c in
    // [0, room after RMD] with
    //   • taxable ordinary income stays BELOW the chosen ordinary bracket, i.e. ≤ where that bracket starts (stop 0 = nothing converts;
    //     the first bracket's start is $0, which fills just the standard deduction; no-limit stop = no ceiling), and
    //   • MAGI (AGI + tax-exempt income) stays BELOW the IRMAA line labeled with the chosen Part B % (stop 0 = nothing converts; no-limit
    //     stop = no ceiling). IRMAA looks back two years, so this year's MAGI sets the premium of year k+2: it applies to anyone alive
    //     now and 63+ (on Medicare by then), using the filing status of the latest of k+2/k+1/k in which someone is alive.
    // Both measures rise with c, but c also moves taxable Social Security, the tax, the asset sales that fund it and so the realized LTCG
    // — a circular dependence — so each trial c runs the full tax ↔ LTCG iteration above, and the search over c is iterated too
    // (false position with bisection safeguards) until the largest feasible c is pinned to a few cents.
    const convByPerson=people.map(()=>0);
    const convTotalOf=()=>convByPerson.reduce((a,b)=>a+b,0);
    // Trigger starts: an IRA whose conversion start is 'bracket' / 'itemized' / 'ltc' and has not started yet checks its trigger against this year's
    // tax with NO conversion (everyone's conversion held at 0, so the test is on the household's own income and deductions). Once met it stays started.
    //   bracket  — taxable ordinary income stays at or below where the chosen bracket starts (same reading as the "below bracket" limit).
    //   itemized — the itemized deduction (LTC cost above the 7.5%-of-AGI floor), in today's $, exceeds the entered value.
    //   ltc      — the first LTC start has been reached (needs Long Term Care enabled).
    const trigPending=i=>{ const s=iraSim[i]; return !!(s.trigger&&!s.started&&s.live&&s.rothOk&&s.bal>0); };
    let noConvOrdTI=null, noConvItemized=null;   // the no-conversion tax picture the triggers test (exported for reference)
    // Solved whenever a Roth conversion is possible this year (any start mode), so the export always shows the no-conversion picture.
    const trigLive=people.some((p,i)=>iraSim[i].live&&iraSim[i].rothOk&&iraSim[i].bal>0);
    if(trigLive){
      const r0=solveTax(0);
      noConvOrdTI=r0.tx.ordTI; noConvItemized=r0.tx.itemized;
      people.forEach((p,i)=>{
        if(!trigPending(i)) return;
        const sim=iraSim[i];
        let go=false;
        if(sim.trigger==='ltc') go=ltcStarted>=1;
        else if(sim.trigger==='bracket'){ const b=Number(p.ira.convStartBracket); go=r0.tx.ordTI<=convOrdTop(Number.isFinite(b)?b:24, ordBrk)+0.005; }
        else go=r0.tx.itemized>(Number(p.ira.convStartItemized)||0);
        if(go){ sim.started=true; sim.startedK=k; sim.room=sim.bal; sim.fixed=Math.min(sim.convAmt,sim.room); }
      });
    }
    people.forEach((p,i)=>{ convByPerson[i]=iraSim[i].fixed||0; });
    let convTrials=0;
    function convLimits(p){
      const num=v=>(v!=null&&v!==''&&Number.isFinite(Number(v)))?Number(v):null;
      const ordIn=num(p.ira.convOrdPct), irmIn=num(p.ira.convIrmaaPct);
      let ordTop=Infinity, magiCap=Infinity, ordOn=false, magiOn=false;
      if(ordIn!=null){ ordOn=true; ordTop=convOrdTop(ordIn, ordBrk); }
      if(irmIn!=null){
        // This year's MAGI sets the IRMAA premium of year k+2, for anyone who will be on Medicare (65+) then. A person alive now and 63+ is
        // exposed whether or not they live to k+2 — so the limit keeps applying right up to the last years (no end-of-plan conversion
        // spike). Filing status is that of the latest of k+2, k+1, k in which anyone is still alive.
        const exposed=people.some((q,j)=>curAges[j]+k<passAges[j] && curAges[j]+k+2>=65);
        if(exposed){
          let fm=false;
          for(const dk of [2,1,0]){
            const al=people.map((q,j)=>curAges[j]+k+dk<passAges[j]);
            if(al.some(Boolean)){ fm=married&&al.length===2&&al[0]&&al[1]; break; }
          }
          magiCap=convMagiCap(irmIn, fm?IRMAA_MFJ:IRMAA_SGL);
          magiOn=true;
        }
      }
      return {ordTop, magiCap, ordOn, magiOn};
    }
    people.forEach((p,i)=>{
      const sim=iraSim[i];
      if(sim.mode!=='bracket'||!(sim.room>0)) return;
      const lim=convLimits(p);
      if(!lim.ordOn&&!lim.magiOn){ convByPerson[i]=sim.room; return; }   // no limit applies (both sliders at "no limit", or only an IRMAA limit and nobody is IRMAA-exposed yet): convert it all
      // Headroom under the stricter active limit when person i converts c (negative = over a limit). Non-increasing in c.
      const slack=c=>{
        convByPerson[i]=c; convTrials++;
        const r=solveTax(convTotalOf());
        const so=lim.ordOn?lim.ordTop-r.tx.ordTI:Infinity, sm=lim.magiOn?lim.magiCap-(r.tx.agi+teIncome+annuityTE):Infinity;
        return Math.min(so,sm);
      };
      const hi=sim.room;
      let a=0, fa=slack(0);
      if(fa<0){ convByPerson[i]=0; return; }               // already over a limit before converting anything
      let b=hi, fb=slack(b);
      if(fb>=0){ convByPerson[i]=hi; return; }              // the whole balance fits
      let side=0;
      for(let n=0;n<60&&b-a>0.01;n++){
        let c=a+(b-a)*fa/(fa-fb);                          // false position
        if(!(c>a&&c<b)||n%4===3) c=(a+b)/2;                // safeguard: bisect now and then / if the interpolation misbehaves
        const fc=slack(c);
        if(fc>=0){ a=c; fa=fc; if(side===1) fb/=2; side=1; if(fc<0.005) break; }
        else { b=c; fb=fc; if(side===-1) fa/=2; side=-1; }
      }
      convByPerson[i]=a;                                    // the largest amount known to fit
    });
    const rothConvByPerson=convByPerson.slice();
    const rothConvTotal=convTotalOf();
    const fin=solveTax(rothConvTotal);
    const wf=fin.wf, tx=fin.tx, taxIters=fin.iters, taxConverged=fin.converged, reSaleTax=fin.saleTax;
    // Advance the IRA / Roth balances one year now that this year's expense draws are known (conversion and draw both leave the pre-tax IRA;
    // the conversion enters the Roth IRA, and the Roth draw leaves it).
    people.forEach((p,i)=>{ iraSim[i].post(k,rothConvByPerson[i],wf.iraExpByPerson[i]); rothSim[i].post(k,rothConvByPerson[i],wf.rothExpByPerson[i]); });
    const iraExpByPerson=wf.iraExpByPerson, iraExpTotal=wf.expFromIra, rothExpByPerson=wf.rothExpByPerson, rothExpTotal=wf.expFromRoth;
    const nonSSOrdinary = nonSSBase+rothConvTotal+iraExpTotal;
    // wf was funded with `taxIn`; tx is the tax that wf produces (they differ by < TAX_TOL once converged).
    const expTax=taxIn;
    const {expTotal, expFromIncome, expFromDiv, expFromSales, expFromIra, expFromRoth, expFromRe, expUnfunded}=wf;
    const {scglUsed, ltcg, qualIncome, qualTax, taxableSS, provisional, ordIncome, agi, incomeTax, niiIncome, niit, totalTax, stateTax, agiFloor, itemized, usedItemized, ded, seniorDed, ordTI, ordTax}=tx;
    const ltcgGross=wf.ltcgGross;
    scglRemaining=Math.max(0,scglRemaining-scglUsed);
    // Excess income: household cash income left after ALL expenses (living, LTC, IRMAA, AUM fee and this year's tax) are paid.
    // It is only positive when income alone covered every expense, so no dividends were used and no shares sold that year.
    // It is reinvested at year-end into the live, in-range portfolios with \"Reinvest excess income\" checked, shared pro rata to
    // start-of-year balance. With no such portfolio the excess simply leaves the model (as before this option existed).
    const excessIncome=Math.max(0, cashIncome-expTotal);
    const reinvPf=[]; pfx.forEach(list=>list.forEach(x=>{ if(x&&x.active&&x.reinvest) reinvPf.push(x); }));
    const reinvBase=reinvPf.reduce((a,x)=>a+x.bal,0);
    if(excessIncome>0&&reinvBase>0) reinvPf.forEach(x=>{ x.excessIn=excessIncome*x.bal/reinvBase; });
    const excessReinvested=reinvBase>0?excessIncome:0;
    // Per-person gross LTCG, then prorate the SCGL shield across people/portfolios so the per-person breakdown
    // (used by the income chart's tooltip) still sums to the net total above.
    const ltcgByPersonGross=people.map((p,i)=>{ let t=0; pfx[i].forEach(x=>{ if(x) t+=x.ltcg; }); reSales.forEach(x=>{ if(x.i===i) t+=x.gain; }); wf.reShort.forEach(x=>{ if(x.i===i) t+=x.gain; }); return t; });
    const shieldFrac = ltcgGross>0 ? scglUsed/ltcgGross : 0;
    const ltcgByPerson = ltcgByPersonGross.map(v=>v*(1-shieldFrac));
    const {sst,marginalRate,sstOrdTI,sstTaxNoSS,mProv,mTSS,mTI,mTax} = computeSSTAndMarginal(nonSSOrdinary, totalSS, filing, qdiv, ltcg, ded, ordBrk, qBrk, incomeTax, ssThresholdFactor, seniorOf, teIncome+annuityTE);

    // Split of the marginal rate: the part from the ordinary brackets (incl. the SS torpedo) and the part from ordinary income pushing qualified income into a higher tier.
    const marginalQual=Math.max(0,(calcQualTax(mTI, qualIncome, qBrk)-qualTax)/100), marginalOrd=marginalRate-marginalQual;

    // Brokerage portfolio asset value (today's $), including the IDGT flag so charts can split them.
    const portfoliosByPerson=people.map((p,i)=>(p.brokerage||[]).map((b,bi)=>{
      const st=pfState[i][bi], bal=pfBalNow[i][bi], tracked=!!st.tracked&&bal>0;
      return {
        id:b.id, name:(b.name&&b.name.trim())||('Portfolio '+(bi+1)), balance:bal, idgt:!!b.idgt, aum:!!b.aum&&!b.idgt, payExp:!!b.payExp, feeDrag:0, ltcg:0,
        // Cost-basis tracking (spec §4.6, cost basis) — start-of-year values, after any step-up this year.
        tracked, basis:tracked?st.basis:null, unrealizedGain:tracked?Math.max(0,bal-st.basis):null, steppedUp:tracked&&!!st.steppedNow, swapAmt:tracked?(st.swapAmt||0):0,
        reSaleIn:st.saleIn||[],   // properties sold into this portfolio (value after the sale tax, and its basis), received at the start of this year
        divUsed:0, divReinvested:0, sold:0, excessReinvested:0, taxExempt:0, reinvest:!!b.reinvest   // expense waterfall (filled in the roll-forward below): dividends used, dividends reinvested, shares sold
      };
    }));
    pfState.forEach(list=>list.forEach(t=>{ t.saleIn=[]; }));   // consumed above; sales made at the end of this year are added below and show up next year
    // Share the sale tax across this year's sales by gain, and set what each forwards: value after tax (step 3).
    reSales.forEach(x=>{ x.tax=reGainTotal>0?reSaleTax*x.gain/reGainTotal:0; x.net=x.valEnd-x.tax; });
    // Household embedded (unrealized) gain across tracked portfolios, split by whether basis steps up at death.
    let embeddedGain=0, embeddedGainIdgt=0;
    portfoliosByPerson.forEach(list=>list.forEach(e=>{ if(e.tracked){ if(e.idgt) embeddedGainIdgt+=e.unrealizedGain; else embeddedGain+=e.unrealizedGain; } }));

    // Roll each brokerage balance forward one year: growth − (dividends used for expenses + shares sold), from the
    // household waterfall above. Basis (average-cost method): sales remove basis in proportion to cost share
    // (1 − gain fraction); dividends not needed for expenses are reinvested (already-taxed income, adds basis);
    // and because everything is in today's $ while basis is a fixed nominal amount, basis erodes by inflation.
    // Growth is total return, so dividends used vs. shares sold move the balance identically; only basis and
    // realized gain differ.
    people.forEach((p,i)=>(p.brokerage||[]).forEach((b,bi)=>{
      const st=pfState[i][bi], bal=pfBalNow[i][bi], x=pfx[i][bi];
      if(st.dead||!(bal>0)||!x){ st.bal=0; st.basis=0; return; }
      st.bal=Math.max(0, x.avail-x.divUsed-x.sold-x.te+x.excessIn);   // tax-exempt income is paid out to the household   // excess income is added at year-end, like the sales come out
      const reinvested=Math.max(0,x.odiv-x.divUsed);
      // Reinvested dividends and reinvested excess income are after-tax money put in, so both add cost basis.
      if(st.tracked) st.basis=clamp((st.basis-x.sold*(1-x.f)+reinvested+x.excessIn)/(1+inflation), 0, st.bal);
      const entry=portfoliosByPerson[i][bi];
      entry.feeDrag=x.feeD; entry.growthPct=x.g*100;
      entry.divUsed=x.divUsed; entry.divReinvested=reinvested; entry.sold=x.sold; entry.excessReinvested=x.excessIn; entry.taxExempt=x.te;
      entry.ltcg=x.ltcg;   // the exact (pre-SCGL) gain realized and taxed this year
      // Net growth after expenses paid from this portfolio (dividends used + shares sold) — actual balance change.
      entry.netGrowthPct = ((st.bal/bal)-1)*100;
    }));

    // Properties sold at the start of this year to cover the shortfall: show them in the asset chart's sale line, and share the tax their gain added
    // (this year's tax with the gain minus without it, informational) across them by gain.
    const shortGainTotal=wf.reShortGain;
    let shortTax=0;
    if(shortGainTotal>0){ const u=taxOn(ltcgGross-shortGainTotal, rothConvTotal, wf.expFromIra, reGainTotal); shortTax=Math.max(0,(tx.totalTax+tx.stateTax)-(u.totalTax+u.stateTax)); }
    const reShortSales=wf.reShort.map(x=>Object.assign({}, x, {valEnd:x.value, basEnd:x.basis, tax:shortGainTotal>0?shortTax*x.gain/shortGainTotal:0, net:x.excess, atStart:true, shortfall:true}));
    // Real estate, start-of-year values (today's $) for the asset chart, then roll each property forward one year.
    const realEstateByPerson=people.map((p,i)=>(p.realEstate||[]).map((r,ri)=>{
      const st=reState[i][ri], on=!!r&&r.enabled!==false;
      st.steppedNow=false;
      if(on){
        const spouseAlive=married&&people.length===2&&alive[1-i];
        if(!alive[i]&&!(r.bene&&spouseAlive)) st.dead=true;
        if(!alive[i]&&!st.dead&&!st.stepped){ st.stepped=true; st.basis=st.bal; st.steppedNow=true; }
      }
      const bal=(on&&!st.dead)?st.bal:0;
      return {id:r.id, name:(r.name&&r.name.trim())||('Property '+(ri+1)), balance:bal,
        basis:bal>0?Math.min(st.basis,bal):0, unrealizedGain:bal>0?Math.max(0,bal-st.basis):0,
        steppedUp:bal>0&&st.steppedNow, growthPct:realGrowth(r.growth,inflation)*100,
        sale:(reSales.find(x=>x.i===i&&x.ri===ri)||reShortSales.find(x=>x.i===i&&x.ri===ri)||null)};   // sold at the end of THIS year: {valEnd, basEnd, gain, tax, net, to}
    }));
    people.forEach((p,i)=>(p.realEstate||[]).forEach((r,ri)=>{
      const st=reState[i][ri], e=realEstateByPerson[i][ri];
      if(!(e.balance>0)){ st.bal=0; st.basis=0; return; }
      st.bal=e.balance*(1+realGrowth(r.growth,inflation));
      st.basis=clamp(st.basis/(1+inflation), 0, st.bal);
    }));
    // Property sales made at the end of this year (step 3): the value after the sale tax, at a 100% basis, joins the designated portfolio (added after that
    // portfolio's own roll-forward above, so it is in the balance from the start of next year); the property is gone.
    // A property sold to cover a shortfall (start of the year): the part of the proceeds the shortfall did not use joins the designated portfolio.
    reShortSales.forEach(x=>{
      const st=reState[x.i][x.ri];
      if(x.ti!=null&&x.excess>0.005){
        const T=pfState[x.ti][x.bi];
        T.bal+=x.excess; T.basis+=x.excess;
        T.saleIn=(T.saleIn||[]).concat([{name:x.name, value:x.excess, basis:x.excess, gain:x.gain, tax:x.tax}]);
      }
      st.sold=true; st.dead=true; st.bal=0; st.basis=0;
    });
    reSales.forEach(x=>{
      const st=reState[x.i][x.ri], T=pfState[x.ti][x.bi];
      T.bal+=x.net; T.basis+=x.net;
      T.saleIn=(T.saleIn||[]).concat([{name:x.name, value:x.net, basis:x.net, gain:x.gain, tax:x.tax}]);
      st.sold=true; st.dead=true; st.bal=0; st.basis=0;
    });

    const iraBalByPerson = people.map((p,i)=> iraBal[i][k]!=null?iraBal[i][k]:0);
    const rothBalByPerson = people.map((p,i)=> rothBal[i][k]!=null?rothBal[i][k]:0);
    rows.push({
      k, age0: idxP0!=null? ages[idxP0]:ages[0],
      ages, alive, filing,
      wageByPerson, wageTotal, ssByPerson, totalSS, pension, rental, pensionByPerson, rentalByPerson, rentalDep, rentalDepByPerson, teIncome, teByPerson, annuity, annuityTE, annuityByPerson, annuityTEByPerson, annuitiesByPerson, annuityBalance,
      odiv, qdiv, odivNQ, ltcg, ltcgGross, reSaleGain:reGainTotal+shortGainTotal, reSaleTax, scglUsed, scglRemaining, odivByPerson, qdivByPerson, odivNQByPerson, ltcgByPerson,
      ftcByPerson, foreignTaxCredit,
      iraByPerson, iraTotal, iraExpByPerson, iraExpTotal, rothExpByPerson, rothExpTotal, iraBalByPerson, rothConvByPerson, rothConvTotal, rothBalByPerson, portfoliosByPerson, realEstateByPerson, embeddedGain, embeddedGainIdgt,
      nonSSOrdinary, taxableSS, provisional, ordIncome, std:ded, seniorDeduction:seniorDed, seniorEligible:seniorN, stdDeduction:std, ltcStarted, ltcCostByPerson, noConvOrdTI, noConvItemized, convTriggerStartedByPerson:iraSim.map(s=>s.startedK===k), agiFloor, itemized, usedItemized, ordTI, ordTax, qualIncome, qualTax,
      sst, marginalRate, marginalOrd, marginalQual, sstOrdTI, sstTaxNoSS, mProv, mTSS, mTI, mTax,
      niiIncome, niit,
      irmaaSurcharge,
      expLiving, expLtc, expIrmaa, expAum, aumBalance, aumFee, expTax, expTotal, expFromIncome, expFromDiv, expFromSales, expFromIra, expFromRoth, expFromRe, expUnfunded, cashIncome, excessIncome, excessReinvested, taxIters, taxConverged,
      convTrials,
      totalTax, stateTax, stateCode:stCode, agi, magi:agi+teIncome+annuityTE
    });
  }
  // ── Legacy "stretch": the 10 years after the household's last passing (STRETCH_YEARS). Two things carry on, with no
  // expenses, withdrawals or RMDs modeled (heirs' own taxes are out of scope):
  //   • every non-IDGT brokerage portfolio still holding a balance in the last row keeps compounding at its own real
  //     growth rate, with its basis stepped up to value at the passing (spec §4.6) and then eroding by inflation, so
  //     the unrealized gain in these years is only growth since the passing. IDGT portfolios are outside the estate
  //     and stop at the last row, as before.
  //   • any pre-tax / Roth IRA with its own "IRA stretch" checkbox on (`ira.stretch` / `roth.stretch`) and a balance.
  // These are NOT projection rows (income/tax charts and the Excel summary never see them); they're returned
  // separately as `stretch` for the asset chart / export. Stretch year 1 is the balance at the passing itself.
  const stretch=[];
  if(rows.length){
    const last=rows[rows.length-1];
    const gIra=people.map(p=>realGrowth(p.ira.growth,inflation));
    const gRoth=people.map(p=>p.roth&&p.roth.growth?realGrowth(p.roth.growth,inflation):0);
    const gPf=people.map(p=>(p.brokerage||[]).map(b=>realGrowth(b.growth,inflation)));
    const gRe=people.map(p=>(p.realEstate||[]).map(r=>realGrowth(r.growth,inflation)));
    let any=false;
    for(let n=1;n<=STRETCH_YEARS;n++){
      const k=last.k+n, ages=curAges.map(a=>a+k);
      const iraBalByPerson=people.map((p,i)=>{ const b=(last.iraBalByPerson[i]||0); return (p.ira.enabled&&p.ira.stretch&&b>0)?b*Math.pow(1+gIra[i],n):0; });
      const rothBalByPerson=people.map((p,i)=>{ const b=(last.rothBalByPerson[i]||0); return (p.roth&&p.roth.enabled&&p.roth.stretch&&b>0)?b*Math.pow(1+gRoth[i],n):0; });
      // null = this portfolio does not continue (IDGT, disabled, or already gone at the last row).
      const portfoliosByPerson=(last.portfoliosByPerson||[]).map((list,i)=>list.map((e,bi)=>{
        if(!e||e.idgt||!(e.balance>0)) return null;
        const g=gPf[i][bi], balance=e.balance*Math.pow(1+g,n), basis=e.balance*(1+g)/Math.pow(1+inflation,n-1);
        any=true;
        return {id:e.id, name:e.name, balance, idgt:false, aum:false, payExp:false, feeDrag:0, ltcg:0, tracked:true,
                basis:Math.min(basis,balance), unrealizedGain:Math.max(0,balance-basis), steppedUp:n===1,
                divUsed:0, divReinvested:0, sold:0, growthPct:g*100, netGrowthPct:g*100};
      }));
      // Real estate still held at the last row carries on like a non-IDGT portfolio: basis stepped up at the passing, then eroding by inflation.
      const realEstateByPerson=(last.realEstateByPerson||[]).map((list,i)=>list.map((e,ri)=>{
        if(!e||!(e.balance>0)) return null;
        const g=gRe[i][ri], balance=e.balance*Math.pow(1+g,n), basis=e.balance*(1+g)/Math.pow(1+inflation,n-1);
        any=true;
        return {id:e.id, name:e.name, balance, basis:Math.min(basis,balance), unrealizedGain:Math.max(0,balance-basis), steppedUp:n===1, growthPct:g*100};
      }));
      if(iraBalByPerson.some(v=>v>0)||rothBalByPerson.some(v=>v>0)) any=true;
      stretch.push({k, stretchYear:n, age0:ages[idxP0], ages, alive:ages.map(()=>false), iraBalByPerson, rothBalByPerson, portfoliosByPerson, realEstateByPerson});
    }
    if(!any) stretch.length=0;
  }
  return {rows, stretch, people, idxP0, married};
}

function displayPersonName(person, idx){
  const entered = person && typeof person.name==='string' ? person.name.trim() : '';
  return entered || `Person ${idx+1}`;
}
function p0Name(proj){ return displayPersonName(proj.people[proj.idxP0], proj.idxP0); }
// X-axis title shared by every age-axis chart: the older person's (P0's) name, e.g. "Alice's age".
function ageAxisLabel(proj){ return proj ? p0Name(proj)+"'s age" : 'Age'; }

