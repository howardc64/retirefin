'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / ASSET VALUE CHARTS — brokerage, real estate, IRA/Roth balances, and
// a separate IDGT-only chart if any IDGT portfolios exist (spec §10).
// ═══════════════════════════════════════════════════════════════
// Asset colors: one hue family per person (first person blues, second greens), a different shade for each of that person's assets, so who holds
// what reads at a glance, and a third family (amber / orange) for every real estate property whoever holds it. No band shares a hue with the red
// IRA stretch bar or the red tax lines. Adjacent bands alternate between the families. Cycles after 6 assets per family; a plan with one person
// and no property uses blues only.
const ASSET_SHADES=[
  ['#1B4F8A','#2E86C1','#85C1E9','#154360','#5DADE2','#AED6F1'],
  ['#0B6B4F','#27AE60','#82E0AA','#14532D','#58D68D','#ABEBC6'],
  ['#C26A0E','#E9A23B','#F5C77A','#8F4F08','#F0B35C','#FAE0B0']   // real estate
];
function assetSeriesColors(series){
  const used={};
  return series.map(s=>{ const pi=s.type==='realestate'?2:Math.min(1,s.personIdx||0), k=used[pi]=(used[pi]||0); used[pi]++; const sh=ASSET_SHADES[pi]; return sh[k%sh.length]; });
}
// A band's fill is its color at 0xbb alpha. The popup's color boxes need that same look but opaque (the box's own white backing is turned off so
// the cost-basis key can be an empty dashed box), so blend the color over white here.
function hexOverWhite(hex,a){
  const n=parseInt(hex.slice(1),16);
  return 'rgb('+[(n>>16)&255,(n>>8)&255,n&255].map(v=>Math.round(a*v+(1-a)*255)).join(',')+')';
}

// Horizontal scroll of the main Asset value chart. The chart shows the same window of ages (same number of X labels, same width) as the IDGT chart; when the 10-year
// IRA stretch runs past that window, the ◀ ▶ buttons on the X axis scroll it (5 years a click). Not saved: the chart opens at the start.
let assetScroll=0, assetScrollMax=0, assetScrollN=0;
const ASSET_SCROLL_STEP=5;
function syncAssetScrollButtons(){
  const box=document.getElementById('assetXScroll'); if(!box) return;
  box.hidden=assetScrollMax<=0;
  const [b,f]=box.querySelectorAll('button'); if(b) b.disabled=assetScroll<=0; if(f) f.disabled=assetScroll>=assetScrollMax;
}
function scrollAssetX(dir){
  assetScroll=Math.max(0,Math.min(assetScrollMax,assetScroll+dir*ASSET_SCROLL_STEP));
  const ch=charts.asset;
  if(ch){ ch.options.scales.x.min=assetScroll; ch.options.scales.x.max=assetScroll+assetScrollN-1; ch.update('none'); }
  syncAssetScrollButtons();
}

// One builder for both asset charts. `cfg` picks which series belong on the chart
// (main chart: non-IDGT brokerage + pre-tax IRAs + Roth + annuities; IDGT chart: IDGT brokerage only).
function buildAssetChartFor(cfg){
  if(typeof Chart==='undefined'||!lastProjection) return;
  const proj=lastProjection, rows=proj.rows;

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
    if(!cfg.idgt){ assetScrollMax=0; assetScroll=0; syncAssetScrollButtons(); }
  };
  if(cfg.idgt) setChartAvailable(cfg.key, series.length>0);   // no IDGT portfolio: no IDGT chart (its grid cell stays blank)
  if(!series.length){ clear(); return; }
  if(!rows.length){ clear(); return; }

  // IRA stretch: on the main chart only, the 10 years after the household's last passing carry just the
  // pre-tax / Roth IRA bands (proj.stretch, compute/projection.js). The axis is extended if those years
  // run past the shared axis end; brokerage bands have no value there, so they simply stop.
  const stretch=(!cfg.idgt&&proj.stretch)||[];
  const allRows=rows.concat(stretch);
  const endAge=Math.max(chartMaxAge(proj), stretch.length?Math.round(stretch[stretch.length-1].age0):0);
  const labels=ageLabelRange(rows[0].age0,endAge);
  // Visible window = the shared axis (what the IDGT chart shows); the stretch years beyond it are reached by scrolling (main chart only).
  const winN=ageLabelRange(rows[0].age0,chartMaxAge(proj)).length;
  let xMin, xMax;
  if(!cfg.idgt){
    assetScrollN=winN; assetScrollMax=Math.max(0,labels.length-winN); assetScroll=Math.max(0,Math.min(assetScrollMax,assetScroll));
    if(assetScrollMax>0){ xMin=assetScroll; xMax=assetScroll+winN-1; }
    syncAssetScrollButtons();
  }
  const ages=allRows.map(r=>r.age0);
  const rowByAge={}; allRows.forEach(r=>rowByAge[Math.round(r.age0)]=r);
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
  const valueOf=faceOf;   // plotted value = face value
  // Dashed lines: one cost-basis line inside EACH tracked portfolio's band (a portfolio's basis resets when its own owner passes, so each steps up at its own
  // time). The gap between the line and the top of its band is that portfolio's unrealized gain. Like the real estate lines, a band's
  // height is its value, so the line plots at (top of everything stacked below the band) + (cost basis).
  const aligned=series.map(s=>alignToAges(ages, allRows.map(r=>valueOf(s,r)), labels));
  const alignedFace=series.map(s=>alignToAges(ages, allRows.map(r=>faceOf(s,r)), labels));
  const pfBasis=[];   // [{si, basis:[$ per label], line:[plotted height per label]}]
  series.forEach((s,si)=>{
    if(s.type!=='portfolio') return;
    const basis=alignToAges(ages, allRows.map(r=>{
      const e=entryOf(s,r); return (e&&e.balance>0&&e.tracked)?(e.basis||0):null;
    }), labels);
    const line=basis.map((b,idx)=>{
      if(b==null) return null;
      let below=0; for(let j=0;j<si;j++){ const v=aligned[j][idx]; if(v!=null) below+=v; }
      return below+b;
    });
    if(line.some(v=>v!=null)) pfBasis.push({si, basis, line});
  });
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

  // Ownership facts for Chart Element (the popup words it for the hovered year, see ciOwnerText in chartInfo.js): who holds the asset, whether a
  // portfolio / property is "Joint owned with spouse" (both are owners while both live), and `bene` (it continues to the surviving spouse).
  const ownerInfoOf=s=>{
    const p=proj.people[s.personIdx];
    const item=s.type==='portfolio'?(p.brokerage||[])[s.bi]:s.type==='realestate'?(p.realEstate||[])[s.ri]:s.type==='annuity'?(p.annuities||[])[s.ai]:(s.type==='ira'||s.type==='roth')?p[s.type]:null;
    const bene=!!(item&&item.bene);
    return {own:s.personIdx, bene, joint:bene&&(s.type==='portfolio'||s.type==='realestate')};
  };
  const seriesLabel=(s,si)=>{
    const personName=displayPersonName(proj.people[s.personIdx], s.personIdx);
    return proj.married ? `${personName} — ${s.name}` : s.name;
  };
  // No gap at the last passing: a stretched band's line and fill run straight on from the last real year into the
  // first stretch year. Accounts that don't continue (IDGT, unchecked IRAs) are null in the stretch years, so
  // they simply end at the last real year and never reach into it.
  const colorOf=assetSeriesColors(series);
  const datasets=series.map((s,si)=>{
    const color=colorOf[si];
    return {
      label:seriesLabel(s,si), vzKind:s.type, ciOwnerInfo:ownerInfoOf(s), data:aligned[si],
      borderColor:color, backgroundColor:hexOverWhite(color,0xbb/255),   // opaque (the old look blended over white): translucent fills piled up wherever bands overlap, so a band changed shade when the bands above it ended
      borderWidth:3, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'pf', order:1
    };
  });
  // Dashed cost-basis lines (one per portfolio), each in its own stack group so it plots at its own value rather than on top of the bands; order 0 = drawn on top.
  // Datasets after the bands are cost-basis lines; `extra` says which kind each one is (same order as the datasets pushed here).
  const extra=[];
  pfBasis.forEach(pb=>{
    datasets.push({
      label:seriesLabel(series[pb.si],pb.si)+' cost basis', vzKind:'pfBasis', ciOwnerInfo:ownerInfoOf(series[pb.si]), data:pb.line, ciValues:pb.basis,   // data = plotted height (stack below + basis); ciValues = the cost basis itself, for Chart Element
      borderColor:'#1f1f1f', backgroundColor:'transparent', borderWidth:2.5, borderDash:[8,5],
      pointRadius:0, tension:0.25, fill:false, spanGaps:false, stack:'basis-pf-'+pb.si, order:0
    });
    extra.push({kind:'pf', si:pb.si, basis:pb.basis});
  });
  reBasis.forEach(rb=>{
    datasets.push({
      label:seriesLabel(series[rb.si],rb.si)+' cost basis', vzKind:'reBasis', ciOwnerInfo:ownerInfoOf(series[rb.si]), data:rb.line, ciValues:rb.basis,
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
      const c=colorOf[ctx.datasetIndex];
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
        // Portfolio basis line: read the cost basis itself (the line plots at a stacked height), then show it in $ and as a % of that portfolio's value.
        const b=m.basis[ctx.dataIndex], rr=rowByAge[labels[ctx.dataIndex]], e=rr?entryOf(series[m.si],rr):null;
        if(b==null) return null;
        return [mrow('  '+ctx.dataset.label+' (dashed line)', fmt(b)+(e&&e.balance>0?' ('+(b/e.balance*100).toFixed(0)+'% of value)':''), W)];
      }
      if(ctx.raw<1) return null;
      const lines=[mrow('  '+ctx.dataset.label, fmt(ctx.raw), W)];
      const s=series[ctx.datasetIndex], r=rowByAge[labels[ctx.dataIndex]];
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
          // Sold at the end of this year: the gain is realized LTCG, its tax comes out of the sale, and the rest moves to the designated portfolio.
          if(e.sale&&e.sale.shortfall) lines.push(mrow('      Sold at start of year to cover expenses', fmt(e.sale.value)+' → gain '+fmt(e.sale.gain)+(e.sale.exempt>0?' (after '+fmt(e.sale.exempt)+' exemption)':'')+', tax added '+fmt(e.sale.tax), W), mrow('        pays expenses', fmt(e.sale.applied), W), mrow('        moves to portfolio (100% basis)', fmt(e.sale.net), W));
          else if(e.sale) lines.push(mrow('      Sold at year end: gain taxed as LTCG', fmt(e.sale.gain)+(e.sale.exempt>0?' (after '+fmt(e.sale.exempt)+' exemption)':'')+' → tax '+fmt(e.sale.tax), W), mrow('        moves to portfolio (100% basis)', fmt(e.sale.net), W));
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
          const paid=(e.divUsed||0)+(e.sold||0)+(e.withdrawn||0);
          if(e.withdrawn>0.5) lines.push(mrow('      Withdrawn (household cash income)', fmt(e.withdrawn), W));
          if(paid>0) lines.push(mrow('      Annual growth (net of expenses paid)', (e.netGrowthPct||0).toFixed(1)+'%', W));
          lines.push(mrow('      Annual growth (real)', (e.growthPct||0).toFixed(1)+'%', W));
          // Real estate sold into this portfolio at the start of this year (value and cost basis both move in).
          (e.reSaleIn||[]).forEach(x=>{
            lines.push(mrow('      Sold into portfolio: '+x.name, fmt(x.value)+' after tax, at a 100% basis', W));
            if(x.gain>0) lines.push(mrow('        gain taxed as LTCG', fmt(x.gain)+' → tax '+fmt(x.tax), W));
          });
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

  // Red bar + label above the stretch window (main chart only): starts at the first stretch year's age on the axis.
  const stretchOpts=stretch.length?{fromIdx:Math.max(0,labels.indexOf(Math.round(stretch[0].age0))), label:'stretch IRA'}:null;
  upsertLineChart(cfg.key,{canvasId:cfg.canvasId, labels, datasets, yMax:Y_MAX, tooltip:tooltipCallbacks,
    refresh:o=>{ o.plugins.stretchTint=stretchOpts||false; o.scales.x.min=xMin; o.scales.x.max=xMax; },
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{display:false},
        stretchTint:stretchOpts||false,
        tooltip:{...TIP_STYLE,enabled:false,external:externalTooltip,callbacks:justifyTip(tooltipCallbacks)}   // external HTML popup: the built-in canvas popup is clipped at the canvas edge
      },
      scales:{
        x:{...ageXAxis(ageAxisLabel(proj)),min:xMin,max:xMax},
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle(cfg.yTitle),ticks:yAxisTicks,grid:AXIS_GRID}
      }
    })});
}

function buildAssetChart(){
  buildAssetChartFor({ key:'asset', idgt:false, canvasId:'assetChart', yTitle:"Asset value (today's $)" });
}
function buildIdgtChart(){
  buildAssetChartFor({ key:'idgt', idgt:true, canvasId:'idgtChart', yTitle:"IDGT value (today's $)" });
}
