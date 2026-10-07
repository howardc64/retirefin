'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / ASSET VALUE CHARTS — brokerage, real estate, IRA/Roth balances, and
// a separate IDGT-only chart if any IDGT portfolios exist (spec §10).
// ═══════════════════════════════════════════════════════════════
const ASSET_COLORS=['#0f6e56','#2E86AB','#8E44AD','#D06A18','#C0392B','#3DB08A','#7B5EA7','#E85D9A','#1A5276','#B5891D'];
// A band's fill is its color at 0xbb alpha. The popup's color boxes need that same look but opaque (the box's own white backing is turned off so
// the cost-basis key can be an empty dashed box), so blend the color over white here.
function hexOverWhite(hex,a){
  const n=parseInt(hex.slice(1),16);
  return 'rgb('+[(n>>16)&255,(n>>8)&255,n&255].map(v=>Math.round(a*v+(1-a)*255)).join(',')+')';
}

// "Unrealized gain at end of plan" line (spec §4.6 cost basis, §6.7): one line under each asset chart, held in a
// <p class="cn"> in index.html (hidden while empty) and blank whenever no portfolio on the chart tracks cost basis.
function setGainNote(cfg, text){
  const el=document.getElementById(cfg.gainId);
  if(el) el.textContent=text||'';
}

// The two "devalue" sliders (state.ui, saved with the plan): a haircut on the embedded tax cost of each asset, so a band shows
// roughly what it is worth after tax. LTCG devalue removes that % of a brokerage portfolio's UNREALIZED GAIN (basis is never
// touched); ordinary-income devalue removes that % of a pre-tax IRA's value. Roth is left alone. Returns fractions 0–1.
function assetDevalue(){
  const u=(typeof state!=='undefined'&&state&&state.ui)||{};
  const f=(v,d)=>{ const n=Number(v); return Math.min(100,Math.max(0,Number.isFinite(n)&&v!=null&&v!==''?n:d))/100; };
  // [0] = years up to the last passing, [1] = the stretch years after it (heirs' anticipated brackets).
  return [{ltcg:f(u.ltcgDevalue,DEFAULT_LTCG_DEVALUE), ord:f(u.ordDevalue,DEFAULT_ORD_DEVALUE)},
          {ltcg:f(u.ltcgDevalue2,DEFAULT_LTCG_DEVALUE2), ord:f(u.ordDevalue2,DEFAULT_ORD_DEVALUE2)}];
}

// One builder for both asset charts. `cfg` picks which series belong on the chart
// (main chart: non-IDGT brokerage + pre-tax IRAs + Roth + annuities; IDGT chart: IDGT brokerage only).
function buildAssetChartFor(cfg){
  if(typeof Chart==='undefined'||!lastProjection) return;
  const proj=lastProjection, rows=proj.rows;
  const legendEl=document.getElementById(cfg.legendId);
  const card=cfg.cardId?document.getElementById(cfg.cardId):null;

  // Stable, ordered list of series driven by the current input shape, so each series keeps its
  // color/position across renders as long as the underlying assets aren't added/removed.
  const series=[];
  proj.people.forEach((p,i)=>{
    (p.brokerage||[]).forEach((b,bi)=>{
      if(!b||b.enabled===false) return;
      if(!!b.idgt!==cfg.idgt) return;
      series.push({type:'portfolio', personIdx:i, bi, name:(b.name&&b.name.trim())||('Portfolio '+(bi+1))});
    });
  });
  // Real estate sits directly above the brokerage portfolios and below the IRAs in the stack (series order = stack order, bottom to top).
  if(!cfg.idgt){
    proj.people.forEach((p,i)=>{
      (p.realEstate||[]).forEach((r,ri)=>{
        if(!r||r.enabled===false||!(Number(r.balance)>0)) return;
        series.push({type:'realestate', personIdx:i, ri, name:(r.name&&r.name.trim())||('Property '+(ri+1))});
      });
    });
  }
  if(!cfg.idgt){
    proj.people.forEach((p,i)=>{
      if(p.ira && p.ira.enabled) series.push({type:'ira', personIdx:i, name:'Pre-tax IRA/401(k)'});
      if(p.roth && p.roth.enabled) series.push({type:'roth', personIdx:i, name:'Roth IRA'});
      (p.annuities||[]).forEach((a,ai)=>{
        if(!a||a.enabled===false||!(Number(a.value)>0)) return;
        series.push({type:'annuity', personIdx:i, ai, name:(a.name&&a.name.trim())||('Annuity '+(ai+1))});
      });
    });
  }

  const clear=()=>{
    if(charts[cfg.key]){ try{ charts[cfg.key].destroy(); }catch(e){} charts[cfg.key]=null; }
    if(!cfg.idgt){ if(charts.assetConv){ try{ charts.assetConv.destroy(); }catch(e){} charts.assetConv=null; } const sd=document.getElementById('assetConvSide'); if(sd) sd.style.display='none'; }
    legendEl.innerHTML='';
    setGainNote(cfg, '');
  };
  if(card) card.style.display = series.length ? '' : 'none';
  if(!series.length){ clear(); return; }
  if(!rows.length){ clear(); return; }

  // IRA stretch: on the main chart only, the 10 years after the household's last passing carry just the
  // pre-tax / Roth IRA bands (proj.stretch, compute/projection.js). The axis is extended if those years
  // run past the shared axis end; brokerage bands have no value there, so they simply stop.
  const stretch=(!cfg.idgt&&proj.stretch)||[];
  const allRows=rows.concat(stretch);
  const endAge=Math.max(chartMaxAge(proj), stretch.length?Math.round(stretch[stretch.length-1].age0):0);
  const labels=ageLabelRange(rows[0].age0,endAge);
  const ages=allRows.map(r=>r.age0);
  const rowByAge={}; allRows.forEach(r=>rowByAge[Math.round(r.age0)]=r);
  const dv=assetDevalue();
  const annEntry=(s,r)=>{ const person=r.annuitiesByPerson&&r.annuitiesByPerson[s.personIdx]; return person&&person[s.ai]; };
  const entryOf=(s,r)=>{ const person=r.portfoliosByPerson&&r.portfoliosByPerson[s.personIdx]; return person&&person[s.bi]; };
  const reEntry=(s,r)=>{ const person=r.realEstateByPerson&&r.realEstateByPerson[s.personIdx]; return person&&person[s.ri]; };
  // Face (un-devalued) value of one series in one row. In stretch years, only accounts that carry on have a value —
  // non-IDGT brokerage, and IRAs whose \"IRA stretch\" box is checked (and still hold a balance); everything else is
  // null (not 0) so it draws no band, no line, and no sliver in the transition.
  const faceOf=(s,r)=>{
    if(s.type==='realestate'){   // held by heirs in the stretch years only while the property still has a value
      const e=reEntry(s,r);
      return r.stretchYear?((e&&e.balance>0)?e.balance:null):(e?e.balance:0);
    }
    if(s.type==='annuity'){
      if(r.stretchYear) return null;   // an annuity ends with the household's last passing (no stretch)
      const e=annEntry(s,r); return e&&e.live?e.balance:0;
    }
    if(r.stretchYear){
      if(s.type==='portfolio'){ const e=entryOf(s,r); return (e&&e.balance>0)?e.balance:null; }
      const acct=proj.people[s.personIdx][s.type];   // person.ira / person.roth
      const v=(s.type==='ira'?r.iraBalByPerson:r.rothBalByPerson)[s.personIdx]||0;
      return (acct&&acct.stretch&&v>0)?v:null;
    }
    if(s.type==='ira') return (r.iraBalByPerson&&r.iraBalByPerson[s.personIdx])||0;
    if(s.type==='roth') return (r.rothBalByPerson&&r.rothBalByPerson[s.personIdx])||0;
    const e=entryOf(s,r);
    return e?e.balance:0;
  };
  // Plotted value = face value less the devalue haircut that applies to that kind of asset.
  const valueOf=(s,r)=>{
    const f=faceOf(s,r); if(f==null) return null;
    const d=dv[r.stretchYear?1:0];   // set 2 after the last passing, set 1 before
    if(s.type==='ira') return f*(1-d.ord);
    if(s.type==='annuity'){ const e=annEntry(s,r); return f-((e&&e.taxableEmbedded)||0)*d.ord; }   // ordinary-income haircut on the taxable part of the contract
    if(s.type==='portfolio'){ const e=entryOf(s,r); return f-((e&&e.tracked)?(e.unrealizedGain||0):0)*d.ltcg; }
    return f;
  };
  // Dashed line: total cost basis of this chart's portfolios (a portfolio that doesn't track basis counts at full value =
  // no gain). It is NOT devalued, so the gap between it and the top of the brokerage bands is the unrealized gain.
  // It is drawn only in rows where the applicable LTCG devalue is 0%: any LTCG devalue pulls the band toward 100% basis
  // (at 100% the band's top IS the basis), so the line would no longer mark the top of the unrealized gain.
  const hasPf=series.some(s=>s.type==='portfolio');
  const basisOf=r=>{
    if(dv[r.stretchYear?1:0].ltcg>0) return null;
    let t=0, any=false;
    series.forEach(s=>{
      if(s.type!=='portfolio') return;
      const e=entryOf(s,r); if(!e||!(e.balance>0)) return;
      t+=e.tracked?(e.basis||0):e.balance; any=true;
    });
    return any?t:null;
  };
  // Value (face, before any withdraw cost) of this chart's portfolios in a row — the denominator for the dashed line's cost basis %.
  const pfValueOf=r=>{ let t=0; series.forEach(s=>{ if(s.type!=='portfolio') return; const e=entryOf(s,r); if(e&&e.balance>0) t+=e.balance; }); return t; };
  const aligned=series.map(s=>alignToAges(ages, allRows.map(r=>valueOf(s,r)), labels));
  const alignedFace=series.map(s=>alignToAges(ages, allRows.map(r=>faceOf(s,r)), labels));
  const alignedBasis=hasPf?alignToAges(ages, allRows.map(basisOf), labels):null;
  const showBasis=!!alignedBasis && alignedBasis.some(v=>v!=null);   // no line (and no legend key) when every row is LTCG-devalued
  // Real estate cost basis: one dotted line inside each property's band. Real estate is not devalued, so the line always shows. A band's
  // height is its value, so the line plots at (top of everything stacked below the band) + (cost basis), i.e. basis % of the way up the band.
  const reBasis=[];   // [{si, basis:[$ per label], line:[plotted height per label]}]
  series.forEach((s,si)=>{
    if(s.type!=='realestate') return;
    const basis=alignToAges(ages, allRows.map(r=>{ const e=reEntry(s,r); return (e&&e.balance>0)?e.basis:null; }), labels);
    const line=basis.map((b,idx)=>{
      if(b==null) return null;
      let below=0; for(let j=0;j<si;j++){ const v=aligned[j][idx]; if(v!=null) below+=v; }
      return below+b;
    });
    if(line.some(v=>v!=null)) reBasis.push({si, basis, line});
  });

  const Y_MAX=lockedYMax(cfg.key, ()=>{
    let maxT=0;
    for(let i=0;i<labels.length;i++){
      let t=0, any=false;
      alignedFace.forEach(a=>{ const v=a[i]; if(v!=null){ t+=v; any=true; } });   // face values, so the locked scale holds as the devalue sliders move
      if(any) maxT=Math.max(maxT,t);
    }
    return Math.max(50000, Math.ceil(maxT/10000)*10000+10000);
  });

  const seriesLabel=(s,si)=>{
    const personName=displayPersonName(proj.people[s.personIdx], s.personIdx);
    return proj.married ? `${personName} — ${s.name}` : s.name;
  };
  // No gap at the last passing: a stretched band's line and fill run straight on from the last real year into the
  // first stretch year. Accounts that don't continue (IDGT, unchecked IRAs) are null in the stretch years, so
  // they simply end at the last real year and never reach into it.
  const datasets=series.map((s,si)=>{
    const color=ASSET_COLORS[si%ASSET_COLORS.length];
    return {
      label:seriesLabel(s,si), data:aligned[si],
      borderColor:color, backgroundColor:color+'bb',
      borderWidth:3, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'pf', order:1
    };
  });
  // Dashed cost-basis line, in its own stack group so it plots at its own value rather than on top of the bands; order 0 = drawn on top.
  if(showBasis) datasets.push({
    label:'Brokerage cost basis', data:alignedBasis,
    borderColor:'#1f1f1f', backgroundColor:'transparent', borderWidth:2.5, borderDash:[8,5],
    pointRadius:0, tension:0.25, fill:false, spanGaps:false, stack:'basis', order:0
  });
  // Datasets after the bands are cost-basis lines; `extra` says which kind each one is (same order as the datasets pushed here).
  const extra=[];
  if(showBasis) extra.push({kind:'pf'});
  reBasis.forEach(rb=>{
    datasets.push({
      label:seriesLabel(series[rb.si],rb.si)+' cost basis', data:rb.line,
      borderColor:'#1f1f1f', backgroundColor:'transparent', borderWidth:2.5, borderDash:[1,5], borderCapStyle:'round',
      pointRadius:0, tension:0.25, fill:false, spanGaps:false, stack:'basis-re-'+rb.si, order:0   // its own stack group, so it plots at its own height rather than on top of the bands
    });
    extra.push({kind:'re', si:rb.si, basis:rb.basis});
  });

  // Built fresh every call so it doesn't close over a stale rowByAge/labels from an earlier render.
  const tooltipCallbacks={
    title:i=>{
      const idx=i[0]?i[0].dataIndex:0; const r=rowByAge[labels[idx]];
      if(!r) return [];
      const lines=popupPersonAgeLines(proj,r);
      if(r.stretchYear) lines.push(mrow('Assets held by heirs', 'year '+r.stretchYear+' of '+STRETCH_YEARS+' after last passing'));
      return lines;
    },
    // Per portfolio: value, net growth after the expenses paid from it, and (Show details) the expense-funding breakdown.
    // Popup color box: bands keep their translucent fill (blended over white, since the box's own white backing is off — see
    // multiKeyBackground below); every cost-basis row gets a black dashed box with nothing inside it.
    labelColor:ctx=>{
      if(ctx.datasetIndex>=series.length) return {borderColor:'#000', backgroundColor:'transparent', borderWidth:2, borderDash:[3,2], borderRadius:0};
      const c=ASSET_COLORS[ctx.datasetIndex%ASSET_COLORS.length];
      return {borderColor:c, backgroundColor:hexOverWhite(c,0xbb/255), borderWidth:3, borderRadius:0};
    },
    label:ctx=>{
      if(ctx.raw==null) return null;
      const W=46;
      if(ctx.datasetIndex>=series.length){
        const m=extra[ctx.datasetIndex-series.length]||{};
        if(m.kind==='re'){
          // The line plots at a stacked height, so read the cost basis itself, then show it in $ and as a % of the property's value.
          const b=m.basis[ctx.dataIndex], rr=rowByAge[labels[ctx.dataIndex]], e=rr?reEntry(series[m.si],rr):null;
          if(b==null) return null;
          return [mrow('  '+ctx.dataset.label+' (dotted line)', fmt(b)+(e&&e.balance>0?' ('+(b/e.balance*100).toFixed(0)+'% of value)':''), W)];
        }
        if(ctx.raw<1) return null;
        const rb=rowByAge[labels[ctx.dataIndex]], tv=rb?pfValueOf(rb):0;
        // Name the portfolio in front: the one portfolio on this chart, or a generic name when the line totals several.
        const pfs=series.filter(x=>x.type==='portfolio');
        const pfName=pfs.length===1?seriesLabel(pfs[0],series.indexOf(pfs[0])):'Portfolios';
        return [mrow('  '+pfName+' cost basis (dashed line)', fmt(ctx.raw)+(tv>0?' ('+(ctx.raw/tv*100).toFixed(0)+'% of value)':''), W)];
      }
      if(ctx.raw<1) return null;
      const lines=[mrow('  '+ctx.dataset.label, fmt(ctx.raw), W)];
      const s=series[ctx.datasetIndex], r=rowByAge[labels[ctx.dataIndex]];
      // Show the face value whenever a withdraw-cost slider has changed what's plotted.
      const face=r?faceOf(s,r):null;
      if(face!=null && face-ctx.raw>=1) lines.push(mrow('      Face value before withdraw cost', fmt(face), W));
      if(s && s.type==='annuity' && r){
        const e=annEntry(s,r);
        if(e && e.live){
          if(e.payout>0){
            lines.push(mrow('      Payout this year', fmt(e.payout)+'/yr', W));
            if(showDetails){
              lines.push(mrow('        taxable', fmt(e.taxable||0), W));
              lines.push(mrow('        tax-exempt', fmt(e.taxFree||0), W));
            }
          }
          if(showDetails) lines.push(mrow('      Taxable embedded in value', fmt(e.taxableEmbedded||0), W));
          if(e.passing){
            lines.push(mrow('      Passing benefit (to heirs, after this year)', fmt(e.passing.amount), W));
            lines.push(mrow('        taxable', fmt(e.passing.taxable), W));
            lines.push(mrow('        tax-exempt', fmt(e.passing.taxFree), W));
          }
        }
      }
      if(s && s.type==='realestate' && r){
        const e=reEntry(s,r);
        if(e){
          lines.push(mrow('      Annual growth (real)', (e.growthPct||0).toFixed(1)+'%', W));
          if(showDetails){
            lines.push(mrow('      Unrealized gain', fmt(e.unrealizedGain||0)+' ('+(e.balance>0?e.unrealizedGain/e.balance*100:0).toFixed(0)+'% of value)', W));
            if(e.steppedUp) lines.push(mrow('      Basis stepped up at death', 'reset to value', W));
          }
        }
      }
      if(s && s.type==='portfolio' && r){
        const e=(r.portfoliosByPerson[s.personIdx]||[])[s.bi];
        if(e){
          // Net-of-expenses growth % (the actual balance change once dividends used and shares sold come out)
          // is shown whenever the portfolio paid anything that year, then gross growth %.
          const paid=(e.divUsed||0)+(e.sold||0);
          if(paid>0) lines.push(mrow('      Annual growth (net of expenses paid)', (e.netGrowthPct||0).toFixed(1)+'%', W));
          lines.push(mrow('      Annual growth (real)', (e.growthPct||0).toFixed(1)+'%', W));
          // Cost basis as a % of this portfolio's value (100% = no unrealized gain; shown for portfolios that track basis).
          if(e.tracked && e.balance>0) lines.push(mrow('      Cost basis (% of value)', ((e.basis||0)/e.balance*100).toFixed(0)+'%', W));
          if(showDetails){
            if(e.aum&&!e.idgt) lines.push(mrow('      AUM fee charged on this balance', fmt(e.feeDrag||0), W));
            lines.push(mrow('      LTCG realized', fmt(e.ltcg||0), W));
          }
          // Cost basis / unrealized gain (spec §4.6) — Show details only. A step-up (owner passed, portfolio
          // continues to spouse, non-IDGT) is flagged in the year it happens.
          if(showDetails && e.tracked){
            const gainPct=e.balance>0?e.unrealizedGain/e.balance*100:0;
            // Household expenses are paid by household income first (not shown per portfolio), then this portfolio's
            // dividends (leftovers are reinvested), then shares sold — which is what realizes gain.
            lines.push(mrow('      Dividends used for expenses', fmt(e.divUsed||0), W));
            lines.push(mrow('      Dividends reinvested', fmt(e.divReinvested||0), W));
            lines.push(mrow('      Sold to cover shortfall', fmt(e.sold||0), W));
            if(e.reinvest) lines.push(mrow('      Excess income reinvested', fmt(e.excessReinvested||0), W));
            if(e.taxExempt>0) lines.push(mrow('      Tax-exempt income paid out', fmt(e.taxExempt), W));
            lines.push(mrow('      Cost basis', fmt(e.basis||0), W));
            lines.push(mrow('      Unrealized gain', fmt(e.unrealizedGain||0)+' ('+gainPct.toFixed(0)+'% of value)', W));
            if(e.steppedUp) lines.push(mrow('      Basis stepped up at death', 'reset to value', W));
            if(e.swapAmt>0) lines.push(mrow('      Asset/basis swap with IDGT', fmt(e.swapAmt)+' swapped', W));
          }
        }
      }
      return lines;
    }
  };

  // Grey tint + label behind the stretch window (main chart only): starts at the first stretch year's age on the axis.
  const stretchOpts=stretch.length?{fromIdx:Math.max(0,labels.indexOf(Math.round(stretch[0].age0))), label:STRETCH_YEARS+' year stretched IRA window'}:null;
  upsertLineChart(cfg.key,{canvasId:cfg.canvasId, labels, datasets, yMax:Y_MAX, tooltip:tooltipCallbacks,
    refresh:o=>{ o.plugins.stretchTint=stretchOpts||false; },
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{display:false},
        stretchTint:stretchOpts||false,
        tooltip:{...TIP_STYLE,multiKeyBackground:'transparent',callbacks:justifyTip(tooltipCallbacks)}
      },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle(cfg.yTitle),ticks:{...AXIS_TICKS,callback:v=>'$'+Math.round(v/1000)+'k'},grid:AXIS_GRID}
      }
    })});
  if(!cfg.idgt) buildRothConvChart({proj, rows, allRows, labels, ages, rowByAge, series, seriesLabel});
  legendEl.innerHTML = series.map((s,si)=>
    legendItem(escHtml(seriesLabel(s,si)), ASSET_COLORS[si%ASSET_COLORS.length])
  ).join('') + (showBasis ? legendItem('Cost basis (dashed) — brokerage above it is unrealized gain', null, 'border-top:2px dashed #1f1f1f;background:transparent;height:2px;margin-top:4px') : '')
    + (reBasis.length ? legendItem('Cost basis (dotted) — real estate above it is unrealized gain', null, 'border-top:2px dotted #1f1f1f;background:transparent;height:2px;margin-top:4px') : '');

  // Embedded (unrealized) gain in the plan's final year, across this chart's tracked portfolios.
  const last=rows[rows.length-1], tracked=[];
  series.forEach((s,si)=>{
    if(s.type!=='portfolio') return;
    const e=(last.portfoliosByPerson[s.personIdx]||[])[s.bi];
    if(e && e.tracked) tracked.push({label:seriesLabel(s,si), gain:e.unrealizedGain||0, value:e.balance||0});
  });
  let gainText='';
  if(tracked.length){
    const gain=tracked.reduce((a,t)=>a+t.gain,0), value=tracked.reduce((a,t)=>a+t.value,0);
    gainText=`Unrealized gain at end of plan (${ageAxisLabel(proj)} ${Math.round(last.age0)}): ${fmt(gain)} on ${fmt(value)} of portfolio value (${value>0?(gain/value*100).toFixed(0):0}%).`
      +(tracked.length>1?' By portfolio: '+tracked.map(t=>t.label+' '+fmt(t.gain)).join(' · ')+'.':'')
      +(cfg.idgt
        ? ' IDGT assets keep their original (carryover) cost basis at death, so this gain generally stays taxable to whoever later sells.'
        : ' Non-IDGT portfolios generally receive a step-up in cost basis at death, so heirs would not owe tax on this gain.');
  }
  // Say what the sliders did to the bands, so a reader never mistakes a devalued band for face value.
  const pct=x=>Math.round(x*100)+'%';
  const devParts=[];
  const hasIra=!cfg.idgt && series.some(s=>s.type==='ira'||s.type==='annuity');
  const setTxt=d=>{ const t=[]; if(hasPf && d.ltcg>0) t.push(pct(d.ltcg)+' of unrealized gain (brokerage)'); if(hasIra && d.ord>0) t.push(pct(d.ord)+' of pre-tax IRA / taxable annuity value'); return t.join(' and '); };
  const t1=setTxt(dv[0]), t2=stretch.length?setTxt(dv[1]):'';
  if(t1) devParts.push('before the last passing, bands are reduced by '+t1);
  if(t2) devParts.push('after it (heirs), by '+t2);
  if(devParts.length) gainText=(gainText?gainText+' ':'')+'Withdraw cost: '+devParts.join('; ')+'.';
  setGainNote(cfg, gainText);
}

// Half-size companion chart (right of the main asset chart): annual Roth conversion $ (today's $), one stacked band per pre-tax IRA that
// converts, in the same color as that IRA's band on the main chart. Same X labels and 1:1 aspect ratio as the main chart; own Y scale that
// starts at the combined value of all pre-tax IRAs (locked until Rescale); sparser ticks; no legend. External HTML popup (see externalTooltip):
// owners + ages, each IRA's conversion, and the total — all in today's $.
function buildRothConvChart(ctx){
  const {proj, rows, allRows, labels, ages, rowByAge, series, seriesLabel}=ctx;
  const side=document.getElementById('assetConvSide');
  const convSeries=[];   // [{personIdx, color, label}]
  series.forEach((s,si)=>{
    if(s.type!=='ira') return;
    const p=proj.people[s.personIdx];
    if(!(p.roth&&p.roth.enabled)) return;                                   // conversions need the Roth IRA turned on
    if(!(p.ira.convMode==='bracket' || Number(p.ira.conv)>0)) return;      // and a conversion set up
    convSeries.push({personIdx:s.personIdx, color:ASSET_COLORS[si%ASSET_COLORS.length],
      label:proj.married?`${displayPersonName(p,s.personIdx)} \u2014 IRA conversion`:'IRA conversion'});
  });
  if(!convSeries.length){
    if(charts.assetConv){ try{ charts.assetConv.destroy(); }catch(e){} charts.assetConv=null; }
    if(side) side.style.display='none';
    return;
  }
  if(side) side.style.display='';
  const data=convSeries.map(cs=>alignToAges(ages, allRows.map(r=>r.stretchYear?null:((r.rothConvByPerson&&r.rothConvByPerson[cs.personIdx])||0)), labels));
  // Initial Y range = combined value of all pre-tax IRAs (today's $), held until Rescale.
  const Y_MAX=lockedYMax('assetConv', ()=>{
    const tot=proj.people.reduce((a,p)=>a+((p.ira&&p.ira.enabled)?(Number(p.ira.balance)||0):0),0);
    return Math.max(10000, Math.ceil(tot/10000)*10000);
  });
  const datasets=convSeries.map((cs,ci)=>({
    label:cs.label, data:data[ci], borderColor:cs.color, backgroundColor:cs.color+'bb',
    borderWidth:3, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'conv', order:1
  }));
  const tip={
    title:items=>{ const r=rowByAge[labels[items[0]?items[0].dataIndex:0]]; return r?popupPersonAgeLines(proj,r):[]; },
    label:c=>(c.raw==null)?null:mrow('  '+c.dataset.label, fmt(c.raw)+'/yr'),
    footer:items=>{
      const idx=items[0]?items[0].dataIndex:0;
      const total=data.reduce((t,d)=>t+(d[idx]||0),0);
      return ['', mrow('Total Roth IRA conversion', fmt(total)+'/yr')];
    }
  };
  
  upsertLineChart('assetConv',{canvasId:'assetConvChart', labels, datasets, yMax:Y_MAX, tooltip:tip,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{display:false}, tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(tip)} },
      scales:{
        x:{...ageXAxis(ageAxisLabel(proj)), ticks:{...AXIS_TICKS,maxTicksLimit:7}},
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle("Roth conversion (today's $)"),ticks:{...AXIS_TICKS,maxTicksLimit:5,callback:v=>'$'+Math.round(v/1000)+'k'},grid:AXIS_GRID}
      }
    })});
}

function buildAssetChart(){
  buildAssetChartFor({
    key:'asset', idgt:false, canvasId:'assetChart', legendId:'assetLegend', gainId:'assetChartGain',
    yTitle:"Asset value (today's $)", totalLabel:'Total asset value',
  });
}
function buildIdgtChart(){
  buildAssetChartFor({
    key:'idgt', idgt:true, cardId:'idgtCard', canvasId:'idgtChart', legendId:'idgtLegend', gainId:'idgtChartGain',
    yTitle:"IDGT value (today's $)", totalLabel:'Total IDGT value',
  });
}

