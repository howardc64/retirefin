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
const TAX_TOL=0.005, TAX_MAX_ITERS=30;
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
  // A configured Roth conversion (flat today's-$ amount, spec §4.4) moves money out of the
  // pre-tax IRA and into this person's Roth IRA each year the pre-tax IRA still has a balance
  // — independent of the RMD/withdrawal age window — as long as the Roth IRA below is enabled;
  // the converted amount is added to ordinary income for tax purposes (§9.4, computed below).
  const iraW=people.map(()=>({})), iraBal=people.map(()=>({})), iraConv=people.map(()=>({})), iraAum=people.map(()=>({})), rothAum=people.map(()=>({}));
  people.forEach((p,i)=>{
    if(!p.ira.enabled) return;
    let bal=Number(p.ira.balance)||0;
    const [startAge,ownerEndAge]=resolveAgeRange(p.ira.ar,p);
    const g=realGrowth(p.ira.growth,inflation);
    const rothOk=!!(p.roth&&p.roth.enabled);
    const convAmt=rothOk?Math.max(0,Number(p.ira.conv)||0):0;
    // Conversion start: 'rmd' (default) = the IRA's own Start age (the RMD start), 'now' = today, 'custom' = ira.convStart.
    // Never earlier than the owner's current age.
    const cMode=p.ira.convStartMode||'rmd';
    const convStartAge=Math.max(curAges[i], cMode==='custom'?(Number(p.ira.convStart)||0):(cMode==='now'?0:startAge));
    for(let k=0;k<=yearsToProject;k++){
      const ownerAge=curAges[i]+k;
      const ownerAlive=ownerAge<passAges[i];
      const otherIdx=1-i;
      const spouseAge=(married&&people.length===2)?curAges[otherIdx]+k:Infinity;
      const spouseAlive=married&&people.length===2&&spouseAge<passAges[otherIdx];
      // AUM box: the start-of-year balance counts toward the household AUM balance while the account is held by the
      // household (owner alive, or inherited by a living spouse) — not while held by heirs under the stretch option.
      if(p.ira.aum && (ownerAlive || (p.ira.bene&&spouseAlive))) iraAum[i][k]=bal;

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
          if(!p.ira.stretch) break;
          iraW[i][k]=0;
          bal=bal*(1+g);
          iraBal[i][k]=bal;
          continue;
        }
        if(bal<=0){ iraW[i][k]=0; iraBal[i][k]=0; continue; }
        const div=rmdDivisor(spouseAge);
        const wd=div?Math.min(bal/div,bal):0;
        iraW[i][k]=wd;
        bal=Math.max(0,(bal-wd)*(1+g));
        iraBal[i][k]=bal;
        continue;
      }

      if(ownerAge>=ownerEndAge){
        iraW[i][k]=0;
        const conv=ownerAge>=convStartAge?Math.min(convAmt,bal):0;
        iraConv[i][k]=conv;
        bal=Math.max(0,bal-conv)*(1+g);
        iraBal[i][k]=bal;
        continue;
      }

      if(ownerAge>=startAge&&bal>0){
        const div=rmdDivisor(ownerAge), wd=div?Math.min(bal/div,bal):0;
        iraW[i][k]=wd;
        bal=Math.max(0,bal-wd);
      }else{
        iraW[i][k]=0;
      }
      const conv=ownerAge>=convStartAge?Math.min(convAmt,bal):0;
      iraConv[i][k]=conv;
      bal=Math.max(0,bal-conv)*(1+g);
      iraBal[i][k]=bal;
    }
  });

  // ── Roth IRA: tax-free growth, funded by its starting balance plus any Roth conversion
  // amount converted from the matching pre-tax IRA above this year. No withdrawals or RMDs
  // are modeled — it only ever grows until its owner (or, if "continues to spouse", the
  // surviving spouse) passes.
  const rothBal=people.map(()=>({}));
  people.forEach((p,i)=>{
    if(!(p.roth&&p.roth.enabled)) return;
    let bal=Number(p.roth.balance)||0;
    const g=realGrowth(p.roth.growth,inflation);
    for(let k=0;k<=yearsToProject;k++){
      const ownerAge=curAges[i]+k;
      const ownerAlive=ownerAge<passAges[i];
      const otherIdx=1-i;
      const spouseAge=(married&&people.length===2)?curAges[otherIdx]+k:Infinity;
      const spouseAlive=married&&people.length===2&&spouseAge<passAges[otherIdx];

      if(p.roth.aum && (ownerAlive || (p.roth.bene&&spouseAlive))) rothAum[i][k]=bal;   // start-of-year, as for the pre-tax IRA
      if(!ownerAlive){
        if(!(p.roth.bene&&spouseAlive)){
          // Same "IRA stretch" rule as the pre-tax IRA above: held by heirs and still compounding.
          if(!p.roth.stretch) break;
          bal=bal*(1+g);
          rothBal[i][k]=bal;
          continue;
        }
        bal=bal*(1+g);
        rothBal[i][k]=bal;
        continue;
      }
      const conv=(iraConv[i]&&iraConv[i][k])||0;
      bal=(bal+conv)*(1+g);
      rothBal[i][k]=bal;
    }
  });

  // ── Annuities (per person, any number) ──
  // Simulated up front, year by year, in today's $ — an annuity's path does not depend on the tax calculation, so it is
  // computed once here and the projection loop below just reads it. Per year (start-of-year account value V, benefit base B):
  //   • Payout (inside the Start–End age range): with the Living Benefit Rider, the guaranteed amount = payout rate × benefit
  //     base at the first payout year, level in nominal $ (so it shrinks in today's $); it is taken from the account value
  //     first and, once that is gone, paid by the insurer for as long as the range lasts. Without the rider it is the entered
  //     amount (grown by its annual change), capped at what the account holds.
  //   • Rider fee = fee % × benefit base, taken from the account value. The benefit base rolls up (nominal %) until payouts
  //     start, optionally stepping up to the account value (anniversary step-up); afterwards it is fixed in nominal $.
  //   • V(next) = (V − withdrawal − rider fee) × (1 + credited growth) × (1 − contract fee %).
  // Tax treatment of the payout (nominal $ bookkeeping, results converted back to today's $):
  //   taxable   — qualified / IRA annuity: 100% ordinary income.
  //   lifo      — non-qualified deferred: withdrawals come out gain first (taxable), then return of premium (tax-free);
  //               amounts paid by the insurer after the account value is gone are fully taxable.
  //   exclusion — non-qualified annuitized: tax-free share = premium ÷ expected total payout (to the owner's passing age),
  //               until the premium is recovered, then fully taxable.
  //   exempt    — a fixed % of every payout is tax-exempt (e.g. a Roth or tax-free contract).
  function simulateAnnuity(a, i){
    const none={on:false, yr:[]};
    if(!a||a.enabled===false) return none;
    const V0=Math.max(0,Number(a.value)||0);
    if(!(V0>0)) return none;
    const hasPrem=a.premium!=null&&a.premium!==''&&Number.isFinite(Number(a.premium));
    const prem0=Math.max(0, hasPrem?Number(a.premium):V0);
    const g=realGrowth(a.growth,inflation), fee=clamp(Number(a.feePct)||0,0,100)/100, netF=(1+g)*(1-fee);
    const rider=!!a.rider;
    const hasBase=a.riderBase!=null&&a.riderBase!==''&&Number.isFinite(Number(a.riderBase));
    let B=rider?(hasBase?Math.max(0,Number(a.riderBase)):V0):0;
    const rollup=(Number(a.riderRollup)||0)/100, rate=(Number(a.riderRate)||0)/100, rFee=(Number(a.riderFee)||0)/100;
    const cola=realGrowth(a.change,inflation), reqAmt=Math.max(0,Number(a.payout)||0);
    let V=V0, kStart=null, gpReal0=0;
    const yr=[];
    for(let k=0;k<=yearsToProject;k++){
      const ownerAge=curAges[i]+k, ownerAlive=ownerAge<passAges[i];
      const spouseAlive=married&&people.length===2&&(curAges[1-i]+k<passAges[1-i]);
      if(!(ownerAlive||(a.bene&&spouseAlive))) break;   // the contract ends with its owner unless it continues to the spouse
      const [sA,eA]=resolveAgeRange(a.ar,people[i]);
      const rangeAge=ownerAlive?ownerAge:passAges[i]-1;
      const inWindow=rangeAge>=sA&&rangeAge<eA;
      let payout=0, fromV=0, insurer=0;
      if(inWindow){
        if(rider){
          if(kStart===null){ kStart=k; gpReal0=rate*B; }
          payout=gpReal0/Math.pow(1+inflation,k-kStart);
          fromV=Math.min(V,payout); insurer=payout-fromV;
        }else if(V>0){
          payout=Math.min(reqAmt*Math.pow(1+cola,k), V); fromV=payout;
        }
      }
      const riderFeeAmt=rider?Math.min(Math.max(0,V-fromV), rFee*B):0;
      const Vend=Math.max(0,V-fromV-riderFeeAmt)*netF;
      yr[k]={bal:V, base:B, payout, fromV, insurer, riderFee:riderFeeAmt, started:kStart!==null&&kStart<=k};
      if(rider){
        if(kStart!==null) B=B/(1+inflation);
        else{ B=B*(1+rollup)/(1+inflation); if(a.riderStepUp) B=Math.max(B,Vend); }
      }
      V=Vend;
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
        const gain=Math.max(0,vNom-premRem), fromVNom=y.fromV*nk, insNom=y.insurer*nk;
        const taxFromV=Math.min(fromVNom,gain), ret=fromVNom-taxFromV;
        embedded=gain/nk; premRem=Math.max(0,premRem-ret);
        freeNom=ret; taxNom=taxFromV+insNom;
      }
      y.taxable=taxNom/nk; y.taxFree=freeNom/nk; y.taxableEmbedded=embedded;
      y.nonQual=(mode==='lifo'||mode==='exclusion');
    });
    return {on:true, yr, rider, mode};
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
  const pfState=people.map(p=>(p.brokerage||[]).map(b=>{
    const bal0=Number(b&&b.balance)||0, tracked=pfTracksBasis(b);
    const bas0=tracked?clamp(pfBasisEntered(b)?bal0*Number(b.basisPct)/100:bal0, 0, bal0):0;
    return {bal:bal0, dead:false, tracked, basis:bas0, stepped:false, steppedNow:false};
  }));

  // ── Suspended Capital-Gain Loss (SCGL) carryforward, spec §4.5/§8.3 ──
  // A household-level pool (today's $) that shields realized LTCG from tax, dollar-for-dollar,
  // until it's exhausted. Tracked as a running balance across years, consumed before growth/
  // inflation considerations apply (it's a fixed today's-$ pool, not itself inflation-adjusted).
  let scglRemaining=state.scglEnabled===false?0:Math.max(0,Number(state.scgl)||0);   // unchecked Enable → no SCGL

  const sumArr=a=>a.reduce((x,y)=>x+y,0);
  const rows=[];
  for(let k=0;k<=yearsToProject;k++){
    const ages=people.map((p,i)=>curAges[i]+k);
    const alive=people.map((p,i)=>ages[i]<passAges[i]);
    if(!alive.some(Boolean)) break;
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
      if(!y) return {id:a&&a.id, name:nm, balance:0, base:0, payout:0, taxable:0, taxFree:0, insurerPaid:0, riderFee:0, taxableEmbedded:0, rider:!!(a&&a.rider), nonQual:false, live:false};
      return {id:a.id, name:nm, balance:y.bal, base:y.base, payout:y.payout, taxable:y.taxable, taxFree:y.taxFree, insurerPaid:y.insurer, riderFee:y.riderFee, taxableEmbedded:y.taxableEmbedded, rider:run.rider, nonQual:y.nonQual, live:true};
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
      st.steppedNow=false;
      if(!alive[i] && !st.dead && st.tracked && !st.stepped){
        st.stepped=true;
        if(!b.idgt){ st.basis=st.bal; st.steppedNow=true; }
      }
      return st.dead?0:st.bal;
    }));
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
    // balances of every portfolio whose AUM box is checked (and that is enabled, inside its age range and funded).
    // '% AUM balance' × that sum, or a fixed $/yr (entered in today's $ for year 0, flat nominal, so it shrinks with inflation).
    // The charge is split across the checked accounts pro rata to balance (for display); the whole fee is a household expense
    // paid by the pool below — i.e. only by portfolios with "Pay expenses" checked.
    const aumMode=(state.aumFee&&state.aumFee.mode==='fixed')?'fixed':'pct';
    const aumVal=(state.aumFee&&state.aumFee.enabled===false)?0:Math.max(0,Number(state.aumFee&&state.aumFee.value)||0);   // unchecked Enable → no fee
    const aumBase=people.map((p,i)=>(p.brokerage||[]).map((b,bi)=>(b&&b.aum&&pfVals[i][bi].active&&!pfState[i][bi].dead&&pfBalNow[i][bi]>0)?pfBalNow[i][bi]:0));
    // IRAs (pre-tax and Roth) with their AUM box checked add their start-of-year balances to the AUM balance.
    const aumBalanceIra=people.reduce((a,p,i)=>a+(iraAum[i][k]||0)+(rothAum[i][k]||0),0);
    const aumBalance=aumBase.reduce((a,row)=>a+row.reduce((x,y)=>x+y,0),0)+aumBalanceIra;
    const aumFee=aumBalance>0?(aumMode==='pct'?aumBalance*aumVal/100:aumVal/Math.pow(1+inflation,k)):0;
    // ── Household expense funding waterfall (spec §4.6) ──
    // Expenses = household living expenses (today's $, flat in real terms) + the household IRMAA surcharge + the
    // AUM fee + THIS YEAR'S INCOME TAX (tax drag is an expense). Funded by, in order: (1) household
    // income, (2) portfolio dividends (leftovers are reinvested), (3) portfolio asset sales (each sale realizes
    // LTCG = amount sold × the portfolio's unrealized-gain fraction).
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
    const rothConvByPerson=people.map((p,i)=>iraConv[i][k]||0);

    const wageTotal=wageByPerson.reduce((a,b)=>a+b,0);
    const iraTotal=iraByPerson.reduce((a,b)=>a+b,0);
    const rothConvTotal=rothConvByPerson.reduce((a,b)=>a+b,0);

    // Ordinary side of the return that does not depend on LTCG, computed once outside the iteration. (Taxable Social Security does
    // depend on LTCG — provisional income includes QDIV and LTCG — so it is computed inside taxOn() below.)
    const filing = married && alive[0] && alive[1] ? 'married' : 'single';
    const ssThresholdFactor = Math.pow(1+inflation,-k); // un-indexed SS-tax thresholds, in today's $
    const nonSSOrdinary = wageTotal+pension+rental+annuity+iraTotal+rothConvTotal+odivNQ;
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
    const ltcLiving=ltcStarted>=2?Math.max(0,Number(ltc.living2)||0):(ltcStarted===1?Math.max(0,Number(ltc.living1!=null?ltc.living1:state.living)||0):null);
    const ltcActive=ltcLiving!==null;
    // Itemized deduction = LTC cost above the 7.5%-of-AGI floor; AGI includes realized LTCG, so it is computed inside taxOn() below.
    // Enhanced deduction for seniors (Schedule 1-A Part V): each living person who is 65 by the end of this tax year (birth year
    // + 65 ≤ year; the model tracks birth year and month only, so a Jan 1 birthday exactly 65 years earlier is not picked up),
    // for tax years 2025–2028 only. The amount depends on AGI, so it is evaluated inside taxOn() and in the SST/marginal helper.
    const taxYear=THIS_YEAR+k;
    const seniorN=(taxYear>=SENIOR_FIRST_YEAR&&taxYear<=SENIOR_LAST_YEAR)?people.reduce((n,p,i)=>n+((alive[i]&&(Number(p.birthYear)||0)+65<=taxYear)?1:0),0):0;
    const seniorOf=agiX=>computeSeniorDeduction(seniorN, agiX, filing, ssThresholdFactor);
    const ordBrk = filing==='married'?MFJ_ORD:SGL_ORD;
    const qBrk = filing==='married'?MFJ_QDIV:SGL_QDIV;
    const expLiving=Math.max(0,Number(ltcActive?ltcLiving:state.living)||0);
    const expIrmaa=irmaaSurcharge;
    // The whole AUM fee is a household expense (paid by the pay-expenses portfolios via the waterfall).
    const expAum=aumFee;

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
      let cand=poolPf.filter(x=>x.avail-x.divUsed>0.005), guard=0;
      while(expNeed>0.005 && cand.length && guard++<8){
        const B=cand.reduce((a,x)=>a+x.bal,0); let given=0; const next=[];
        cand.forEach(x=>{
          const room=Math.max(0,x.avail-x.divUsed-x.sold), amt=Math.min(expNeed*x.bal/B, room);
          x.sold+=amt; given+=amt; if(room-amt>0.005) next.push(x);
        });
        expNeed-=given; cand=next;
      }
      const expUnfunded=Math.max(0,expNeed);
      const expFromSales=expTotal-expFromIncome-expFromDiv-expUnfunded;
      // Realized LTCG = sold × gain fraction, for every portfolio (IDGT included, on its own sales).
      poolPf.forEach(x=>{ x.ltcg=x.sold*x.f; });
      let ltcgGross=0; pfx.forEach(list=>list.forEach(x=>{ if(x) ltcgGross+=x.ltcg; }));
      return {expTotal, expFromIncome, expFromDiv, expFromSales, expUnfunded, ltcgGross};
    }
    // The year's tax given gross realized LTCG. Spec §8.3: available SCGL (suspended capital-gain loss
    // carryforward) eliminates realized LTCG dollar-for-dollar, before tax, so only the net-of-SCGL amount is taxed.
    // Pure (does not consume the SCGL pool) — the pool is drawn down once, after the iteration converges.
    function taxOn(ltcgGross){
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
      return {scglUsed, ltcg, qualIncome, qualTax, taxableSS, provisional, ordIncome, agi, incomeTax, niiIncome, niit, totalTax, agiFloor, itemized, usedItemized, ded, seniorDed, ordTI, ordTax};
    }

    // ── Tax ↔ LTCG fixed-point iteration ──
    // T_{n+1} = Tax( LTCG( Waterfall( living + IRMAA + AUM fee + T_n ) ) ). More tax → more expenses → more shares
    // sold → more LTCG → more tax, but each extra tax dollar creates well under a dollar of new tax (LTCG is
    // taxed at ≤ ~24% including NIIT, and only the gain share of a sale is LTCG), so the map is a contraction:
    // the error shrinks ~4× per round and a few rounds settle it to the cent. Warm-started from last year's tax.
    let taxIn=(k>0&&rows[k-1])?(rows[k-1].totalTax||0):0, wf, tx, taxIters=0, taxConverged=false;
    while(taxIters<TAX_MAX_ITERS){
      wf=runWaterfall(taxIn); tx=taxOn(wf.ltcgGross); taxIters++;
      if(Math.abs(tx.totalTax-taxIn)<TAX_TOL){ taxConverged=true; break; }
      taxIn=tx.totalTax;
    }
    // wf was funded with `taxIn`; tx is the tax that wf produces (they differ by < TAX_TOL once converged).
    const expTax=taxIn;
    const {expTotal, expFromIncome, expFromDiv, expFromSales, expUnfunded}=wf;
    const {scglUsed, ltcg, qualIncome, qualTax, taxableSS, provisional, ordIncome, agi, incomeTax, niiIncome, niit, totalTax, agiFloor, itemized, usedItemized, ded, seniorDed, ordTI, ordTax}=tx;
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
    const ltcgByPersonGross=people.map((p,i)=>{ let t=0; pfx[i].forEach(x=>{ if(x) t+=x.ltcg; }); return t; });
    const shieldFrac = ltcgGross>0 ? scglUsed/ltcgGross : 0;
    const ltcgByPerson = ltcgByPersonGross.map(v=>v*(1-shieldFrac));
    const {sst,marginalRate} = computeSSTAndMarginal(nonSSOrdinary, totalSS, filing, qdiv, ltcg, ded, ordBrk, qBrk, incomeTax, ssThresholdFactor, seniorOf, teIncome+annuityTE);

    // Brokerage portfolio asset value (today's $), including the IDGT flag so charts can split them.
    const portfoliosByPerson=people.map((p,i)=>(p.brokerage||[]).map((b,bi)=>{
      const st=pfState[i][bi], bal=pfBalNow[i][bi], tracked=!!st.tracked&&bal>0;
      return {
        id:b.id, name:(b.name&&b.name.trim())||('Portfolio '+(bi+1)), balance:bal, idgt:!!b.idgt, aum:!!b.aum, payExp:!!b.payExp, feeDrag:0, ltcg:0,
        // Cost-basis tracking (spec §4.6, cost basis) — start-of-year values, after any step-up this year.
        tracked, basis:tracked?st.basis:null, unrealizedGain:tracked?Math.max(0,bal-st.basis):null, steppedUp:tracked&&!!st.steppedNow,
        divUsed:0, divReinvested:0, sold:0, excessReinvested:0, taxExempt:0, reinvest:!!b.reinvest   // expense waterfall (filled in the roll-forward below): dividends used, dividends reinvested, shares sold
      };
    }));
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

    const iraBalByPerson = people.map((p,i)=> iraBal[i][k]!=null?iraBal[i][k]:0);
    const rothBalByPerson = people.map((p,i)=> rothBal[i][k]!=null?rothBal[i][k]:0);
    rows.push({
      k, age0: idxP0!=null? ages[idxP0]:ages[0],
      ages, alive, filing,
      wageByPerson, wageTotal, ssByPerson, totalSS, pension, rental, pensionByPerson, rentalByPerson, rentalDep, rentalDepByPerson, teIncome, teByPerson, annuity, annuityTE, annuityByPerson, annuityTEByPerson, annuitiesByPerson, annuityBalance,
      odiv, qdiv, odivNQ, ltcg, ltcgGross, scglUsed, scglRemaining, odivByPerson, qdivByPerson, odivNQByPerson, ltcgByPerson,
      ftcByPerson, foreignTaxCredit,
      iraByPerson, iraTotal, iraBalByPerson, rothConvByPerson, rothConvTotal, rothBalByPerson, portfoliosByPerson, embeddedGain, embeddedGainIdgt,
      nonSSOrdinary, taxableSS, provisional, ordIncome, std:ded, seniorDeduction:seniorDed, seniorEligible:seniorN, stdDeduction:std, ltcStarted, ltcCostByPerson, agiFloor, itemized, usedItemized, ordTI, ordTax, qualIncome, qualTax,
      sst, marginalRate,
      niiIncome, niit,
      irmaaSurcharge,
      expLiving, expLtc, expIrmaa, expAum, aumBalance, aumBalanceIra, aumFee, expTax, expTotal, expFromIncome, expFromDiv, expFromSales, expUnfunded, cashIncome, excessIncome, excessReinvested, taxIters, taxConverged,
      totalTax, agi, magi:agi+teIncome+annuityTE
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
      if(iraBalByPerson.some(v=>v>0)||rothBalByPerson.some(v=>v>0)) any=true;
      stretch.push({k, stretchYear:n, age0:ages[idxP0], ages, alive:ages.map(()=>false), iraBalByPerson, rothBalByPerson, portfoliosByPerson});
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

