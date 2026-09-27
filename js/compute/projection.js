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
  const iraW=people.map(()=>({})), iraBal=people.map(()=>({})), iraConv=people.map(()=>({}));
  people.forEach((p,i)=>{
    if(!p.ira.enabled) return;
    let bal=Number(p.ira.balance)||0;
    const [startAge,ownerEndAge]=resolveAgeRange(p.ira.ar,p);
    const g=realGrowth(p.ira.growth,inflation);
    const rothOk=!!(p.roth&&p.roth.enabled);
    const convAmt=rothOk?Math.max(0,Number(p.ira.conv)||0):0;
    for(let k=0;k<=yearsToProject;k++){
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
        if(!(p.ira.bene&&spouseAlive)) break;
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
        const conv=Math.min(convAmt,bal);
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
      const conv=Math.min(convAmt,bal);
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

      if(!ownerAlive){
        if(!(p.roth.bene&&spouseAlive)) break;
        bal=bal*(1+g);
        rothBal[i][k]=bal;
        continue;
      }
      const conv=(iraConv[i]&&iraConv[i][k])||0;
      bal=(bal+conv)*(1+g);
      rothBal[i][k]=bal;
    }
  });

  // ── Pension / rental: always per-person ──
  function personAgedItemActive(item, ownerIdx, k){
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
    const g=realGrowth(item.change, inflation);
    return item.amount*Math.pow(1+g,k);
  }

  // ── Brokerage portfolio balances (today's $) ──
  // Balances are simulated year by year: each year's tax drag depends on that year's total tax (TT),
  // so a closed-form (1+g)^k no longer applies. Change per year = growth − tax drag − fee drag − withdrawal.
  const pfState=people.map(p=>(p.brokerage||[]).map(b=>({bal:Number(b&&b.balance)||0, dead:false})));

  // ── Suspended Capital-Gain Loss (SCGL) carryforward, spec §4.5/§8.3 ──
  // A household-level pool (today's $) that shields realized LTCG from tax, dollar-for-dollar,
  // until it's exhausted. Tracked as a running balance across years, consumed before growth/
  // inflation considerations apply (it's a fixed today's-$ pool, not itself inflation-adjusted).
  let scglRemaining=Math.max(0,Number(state.scgl)||0);

  const rows=[];
  for(let k=0;k<=yearsToProject;k++){
    const ages=people.map((p,i)=>curAges[i]+k);
    const alive=people.map((p,i)=>ages[i]<passAges[i]);
    if(!alive.some(Boolean)) break;
    // Younger household member's current age this year (spec §4.3 LTCG "% of TT x age/100" mode):
    // the younger of the two while both are alive, else whoever is left, else the sole person.
    const livingAgesNow=ages.filter((a,ix)=>alive[ix]);
    const youngerHouseholdAge=livingAgesNow.length?Math.min(...livingAgesNow):Math.min(...ages);

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

    const rentalByPerson = people.map((p,i)=>personAgedItemActive(p.rental,i,k));
    const rental = rentalByPerson.reduce((a,b)=>a+b,0);

    // Brokerage portfolio income — each portfolio produces ODIV and QDIV.
    function brokerageValues(portfolio, ownerIdx, k, bal){
      if(!portfolio||!portfolio.enabled||!(bal>0)) return {odiv:0,qdiv:0,ltcg:0,ftc:0,cap:0};

      const ownerAge=curAges[ownerIdx]+k;
      const ownerAlive=ownerAge<passAges[ownerIdx];
      const otherIdx=1-ownerIdx;
      const spouseAlive=married&&people.length===2&&
        (curAges[otherIdx]+k<passAges[otherIdx]);

      // Before the owner passes, use the portfolio's configured age range.
      if(ownerAlive){
        const [sA,eA]=resolveAgeRange(portfolio.ar,people[ownerIdx]);
        if(ownerAge<sA||ownerAge>=eA) return {odiv:0,qdiv:0,ltcg:0,ftc:0,cap:0};
      }else{
        // If inheritance is enabled, the portfolio continues for the spouse
        // after the owner passes. Do not re-apply the deceased owner's
        // "end age = passing" check, which would otherwise stop the income.
        if(!(portfolio.bene&&spouseAlive)) return {odiv:0,qdiv:0,ltcg:0,ftc:0,cap:0};
      }

      // `bal` is this year's starting balance from the running simulation above;
      // spouse continuation therefore keeps the same projected portfolio.
      const odiv=Math.max(0,bal*(Number(portfolio.yield)||0)/100);
      const qdiv=odiv*clamp(Number(portfolio.qdivPct)||0,0,100)/100;
      // Realized LTCG (spec 4.4): a flat amount, or a % of the portfolio's own configured annual
      // withdrawal (or that % scaled by the younger household member's age/100, clamped to 1 — a
      // rough stand-in for unrealized gains getting realized more readily later in retirement).
      // Both modes are now deterministic per-portfolio numbers (no dependency on total tax), since
      // the % modes are keyed off the configured withdrawal input, not TT — so there's no longer any
      // fixed-point iteration needed to resolve LTCG before Total Tax.
      const on=pfExpense(portfolio), pctMode=portfolio.ltcgMode==='pct'||portfolio.ltcgMode==='pctAge';
      const ageFactor=portfolio.ltcgMode==='pctAge'?clamp(youngerHouseholdAge/100,0,1):1;
      const withdrawAmt=Math.max(0,Number(portfolio.living)||0); // configured annual withdrawal, today's $
      const ltcg=on?(pctMode
        ? Math.min(bal, clamp(Number(portfolio.ltcg)||0,0,100)/100*withdrawAmt*ageFactor)
        : Math.min(Math.max(0,Number(portfolio.ltcg)||0), bal)):0;
      // Foreign tax credit (spec §4.4, §9.4): active whenever Expenses is checked OR the
      // portfolio is an IDGT (a foreign-asset-holding trust is the natural home for this pair),
      // independent of each other — unlike tax drag/fee drag/withdrawal/LTCG above, which require
      // Expenses regardless of IDGT. Subtracted from the household's Total Tax, not added to income.
      const ftcOn = pfExpense(portfolio) || !!portfolio.idgt;
      const ftc = ftcOn ? bal*clamp(Number(portfolio.foreignPct)||0,0,100)/100*clamp(Number(portfolio.ftcPct)||0,0,100)/100 : 0;
      return {odiv,qdiv,ltcg,ftc,cap:bal};
    }
    // Start-of-year balance for every portfolio. A portfolio stops existing once its owner has
    // passed unless it is marked to continue to a surviving spouse.
    const pfBalNow=people.map((p,i)=>(p.brokerage||[]).map((b,bi)=>{
      const st=pfState[i][bi];
      if(!b||!b.enabled) return 0;
      const spouseAlive=married&&people.length===2&&alive[1-i];
      if(!alive[i] && !(b.bene&&spouseAlive)) st.dead=true;
      return st.dead?0:st.bal;
    }));
    const brokerageByPerson=people.map((p,i)=>{
      let odiv=0,qdiv=0,ltcg=0,ftc=0;
      (p.brokerage||[]).forEach((b,bi)=>{const v=brokerageValues(b,i,k,pfBalNow[i][bi]);odiv+=v.odiv;qdiv+=v.qdiv;ltcg+=v.ltcg;ftc+=v.ftc;});
      return {odiv,qdiv,ltcg,ftc};
    });

    // Brokerage portfolio asset value (today's $), including the IDGT flag so charts can split them.
    const portfoliosByPerson=people.map((p,i)=>(p.brokerage||[]).map((b,bi)=>({
      id:b.id, name:(b.name&&b.name.trim())||('Portfolio '+(bi+1)), balance:pfBalNow[i][bi], idgt:!!b.idgt, expense:!!b.expense, taxDrag:0, feeDrag:0, livingCost:0, ltcg:0
    })));

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

    const filing = married && alive[0] && alive[1] ? 'married' : 'single';
    const ssThresholdFactor = Math.pow(1+inflation,-k); // un-indexed SS-tax thresholds, in today's $
    const nonSSOrdinary = wageTotal+pension+rental+iraTotal+rothConvTotal+odivNQ;
    const{taxableSS,provisional}=computeTaxableSS(nonSSOrdinary, totalSS, filing, ssThresholdFactor);
    const std = filing==='married'?STD_MFJ:STD_SGL;
    const ordBrk = filing==='married'?MFJ_ORD:SGL_ORD;
    const qBrk = filing==='married'?MFJ_QDIV:SGL_QDIV;

    const ordIncome = nonSSOrdinary+taxableSS;
    const ordTI = Math.max(0, ordIncome-std);
    const ordTax = calcOrdTax(ordTI, ordBrk);
    // Realized LTCG comes from portfolios (spec 4.4): a flat amount, or a % of that portfolio's own
    // configured withdrawal amount (optionally scaled by age) — both computed per-portfolio in
    // brokerageValues() above, deterministically, with no dependency on Total Tax. Spec §8.3:
    // available SCGL (suspended capital-gain loss carryforward) then eliminates realized LTCG
    // dollar-for-dollar, before tax, so only the *net-of-SCGL* amount is actually taxed/displayed.
    const sumArr=a=>a.reduce((x,y)=>x+y,0);
    const ltcgByPersonGross=brokerageByPerson.map(v=>v.ltcg), ltcgGross=sumArr(ltcgByPersonGross);
    const scglUsed=Math.min(scglRemaining,Math.max(0,ltcgGross));
    scglRemaining=Math.max(0,scglRemaining-scglUsed);
    const ltcg=Math.max(0,ltcgGross-scglUsed); // net-of-SCGL LTCG — what's actually taxed/displayed
    // Prorate the SCGL shield across people/portfolios so the per-person breakdown
    // (used by the income chart's tooltip) still sums to the net total above.
    const shieldFrac = ltcgGross>0 ? scglUsed/ltcgGross : 0;
    const ltcgByPerson = ltcgByPersonGross.map(v=>v*(1-shieldFrac));
    const qualIncome = qdiv+ltcg;
    const qualTax = calcQualTax(ordTI, qualIncome, qBrk);
    const agi = nonSSOrdinary+taxableSS+qdiv+ltcg;
    const incomeTax = ordTax+qualTax; // ordinary + qualified only — the SST hypothetical below mirrors this basis
    const {sst,marginalRate} = computeSSTAndMarginal(nonSSOrdinary, totalSS, filing, qdiv, ltcg, std, ordBrk, qBrk, incomeTax, ssThresholdFactor);
    // §9.4 NIIT: 3.8% of the lesser of net investment income (ODIV−QDIV + QDIV + LTCG) or MAGI (~AGI)
    // over the un-indexed threshold. Added on top of ordinary + qualified tax for Total Tax (TT).
    const niiIncome = odivNQ+qdiv+ltcg;
    const niit = computeNIIT(niiIncome, agi, filing, ssThresholdFactor, state.futureTax, THIS_YEAR+k);
    // §9.4: foreign tax credit offsets the ordinary+qualified tax (not NIIT), floored at 0.
    const incomeTaxAfterFtc = Math.max(0, incomeTax-foreignTaxCredit);
    const totalTax = incomeTaxAfterFtc+niit;

    // Roll each brokerage balance forward one year: growth − tax drag (share of TT) − fee drag − withdrawal.
    people.forEach((p,i)=>(p.brokerage||[]).forEach((b,bi)=>{
      const st=pfState[i][bi], bal=pfBalNow[i][bi];
      if(st.dead||!(bal>0)){ st.bal=0; return; }
      const g=realGrowth(b.growth,inflation);
      const feeMode=b.fee&&b.fee.mode==='fixed'?'fixed':'pct';
      const feeVal=Math.max(0,Number(b.fee&&b.fee.value)||0);
      const feePct=feeMode==='pct'?feeVal/100:0;
      // A fixed fee is a flat nominal amount (entered in today's $ for year 0), so in today's-dollar
      // terms it shrinks each year with inflation.
      const feeFixed=feeMode==='fixed'?feeVal/Math.pow(1+inflation,k):0;
      // Drag $ applied this year (capped at what the portfolio can actually pay), kept for tooltips.
      const avail=Math.max(0,bal*(1+g));
      const exp=pfExpense(b);   // tax drag, fees and withdrawal only apply when Expenses is checked
      const feeD=exp?Math.min(bal*feePct+feeFixed, avail):0;
      const taxD=exp?Math.min(clamp(Number(b.taxDrag)||0,0,100)/100*totalTax, avail-feeD):0;
      const withdrawD=exp?Math.min(Math.max(0,Number(b.living)||0), avail-feeD-taxD):0; // flat in today's $ = inflation-adjusted
      st.bal=Math.max(0, avail-feeD-taxD-withdrawD);
      // Realized LTCG for this portfolio this year (spec 4.4), kept for tooltips — mirrors the
      // amount-mode/pct-of-withdrawal(×age)-mode logic in brokerageValues() above. Deterministic:
      // unlike tax drag, LTCG here is keyed off the portfolio's own configured withdrawal amount,
      // not Total Tax, so it doesn't need to wait for totalTax to be final — recomputed here only
      // for symmetry with the other per-portfolio tooltip fields.
      const ltcgAmt=exp?((b.ltcgMode==='pct'||b.ltcgMode==='pctAge')
        ? Math.min(bal, clamp(Number(b.ltcg)||0,0,100)/100*Math.max(0,Number(b.living)||0)*(b.ltcgMode==='pctAge'?clamp(youngerHouseholdAge/100,0,1):1))
        : Math.min(Math.max(0,Number(b.ltcg)||0), bal)):0;
      const entry=portfoliosByPerson[i][bi];
      entry.taxDrag=taxD; entry.feeDrag=feeD; entry.livingCost=withdrawD; entry.growthPct=g*100; entry.ltcg=ltcgAmt;
      // Net growth after subtracting tax drag, fee drag and withdrawal from this
      // year's return (spec §10: "annual growth % with expenses subtracted").
      entry.netGrowthPct = bal>0 ? ((st.bal/bal)-1)*100 : 0;
    }));

    const iraBalByPerson = people.map((p,i)=> iraBal[i][k]!=null?iraBal[i][k]:0);
    const rothBalByPerson = people.map((p,i)=> rothBal[i][k]!=null?rothBal[i][k]:0);
    rows.push({
      k, age0: idxP0!=null? ages[idxP0]:ages[0],
      ages, alive, filing,
      wageByPerson, wageTotal, ssByPerson, totalSS, pension, rental, pensionByPerson, rentalByPerson,
      odiv, qdiv, odivNQ, ltcg, ltcgGross, scglUsed, scglRemaining, odivByPerson, qdivByPerson, odivNQByPerson, ltcgByPerson,
      ftcByPerson, foreignTaxCredit,
      iraByPerson, iraTotal, iraBalByPerson, rothConvByPerson, rothConvTotal, rothBalByPerson, portfoliosByPerson,
      nonSSOrdinary, taxableSS, provisional, ordIncome, std, ordTI, ordTax, qualIncome, qualTax,
      sst, marginalRate,
      niiIncome, niit,
      totalTax, agi
    });
  }
  return {rows, people, idxP0, married};
}

function displayPersonName(person, idx){
  const entered = person && typeof person.name==='string' ? person.name.trim() : '';
  return entered || `Person ${idx+1}`;
}
function p0Name(proj){ return displayPersonName(proj.people[proj.idxP0], proj.idxP0); }
// X-axis title shared by every age-axis chart: the older person's (P0's) name, e.g. "Alice's age".
function ageAxisLabel(proj){ return proj ? p0Name(proj)+"'s age" : 'Age'; }

