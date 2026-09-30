'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / ASSET VALUE CHARTS — brokerage/IRA/Roth balances, and
// a separate IDGT-only chart if any IDGT portfolios exist (spec §10).
// ═══════════════════════════════════════════════════════════════
const ASSET_COLORS=['#0f6e56','#2E86AB','#8E44AD','#D06A18','#C0392B','#3DB08A','#7B5EA7','#E85D9A','#1A5276','#B5891D'];

// "Unrealized gain at end of plan" line (spec §4.6 cost basis, §6.7): one line under each asset chart, held in a
// <p class="cn"> in index.html (hidden while empty) and blank whenever no portfolio on the chart tracks cost basis.
function setGainNote(cfg, text){
  const el=document.getElementById(cfg.gainId);
  if(el) el.textContent=text||'';
}

// One builder for both asset charts. `cfg` picks which series belong on the chart
// (main chart: non-IDGT brokerage + pre-tax IRAs; IDGT chart: IDGT brokerage only).
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
  if(!cfg.idgt){
    proj.people.forEach((p,i)=>{
      if(p.ira && p.ira.enabled) series.push({type:'ira', personIdx:i, name:'Pre-tax IRA/401(k)'});
      if(p.roth && p.roth.enabled) series.push({type:'roth', personIdx:i, name:'Roth IRA'});
    });
  }

  const clear=()=>{
    if(charts[cfg.key]){ try{ charts[cfg.key].destroy(); }catch(e){} charts[cfg.key]=null; }
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
  const seriesValues=series.map(s=>allRows.map(r=>{
    // In stretch years, only IRAs whose "IRA stretch" box is checked (and still hold a balance) have a value;
    // everything else is null (not 0) so it draws no band, no line, and no sliver in the transition.
    if(r.stretchYear){
      if(s.type==='portfolio') return null;
      const acct=proj.people[s.personIdx][s.type];   // person.ira / person.roth
      const v=(s.type==='ira'?r.iraBalByPerson:r.rothBalByPerson)[s.personIdx]||0;
      return (acct&&acct.stretch&&v>0)?v:null;
    }
    if(s.type==='ira') return (r.iraBalByPerson&&r.iraBalByPerson[s.personIdx])||0;
    if(s.type==='roth') return (r.rothBalByPerson&&r.rothBalByPerson[s.personIdx])||0;
    const person=r.portfoliosByPerson[s.personIdx];
    const entry=person&&person[s.bi];
    return entry?entry.balance:0;
  }));
  const aligned=seriesValues.map(vals=>alignToAges(ages, vals, labels));

  const Y_MAX=lockedYMax(cfg.key, ()=>{
    let maxT=0;
    for(let i=0;i<labels.length;i++){
      let t=0, any=false;
      aligned.forEach(a=>{ const v=a[i]; if(v!=null){ t+=v; any=true; } });
      if(any) maxT=Math.max(maxT,t);
    }
    return Math.max(50000, Math.ceil(maxT/10000)*10000+10000);
  });

  const seriesLabel=(s,si)=>{
    const personName=displayPersonName(proj.people[s.personIdx], s.personIdx);
    return proj.married ? `${personName} — ${s.name}` : s.name;
  };
  // No gap at the last passing: a stretched band's line and fill run straight on from the last real year into the
  // first stretch year. Accounts that don't continue (brokerage, unchecked IRAs) are null in the stretch years, so
  // they simply end at the last real year and never reach into it.
  const datasets=series.map((s,si)=>{
    const color=ASSET_COLORS[si%ASSET_COLORS.length];
    return {
      label:seriesLabel(s,si), data:aligned[si],
      borderColor:color, backgroundColor:color+'bb',
      borderWidth:3, pointRadius:0, tension:0.25, fill:true, spanGaps:false, stack:'pf'
    };
  });

  // Built fresh every call so it doesn't close over a stale rowByAge/labels from an earlier render.
  const tooltipCallbacks={
    title:i=>{
      const idx=i[0]?i[0].dataIndex:0; const r=rowByAge[labels[idx]];
      if(!r) return [];
      const lines=popupPersonAgeLines(proj,r);
      if(r.stretchYear) lines.push(mrow('IRAs held by heirs', 'year '+r.stretchYear+' of '+STRETCH_YEARS+' after last passing'));
      return lines;
    },
    // Per portfolio: value, net growth after the expenses paid from it, and (Show details) the expense-funding breakdown.
    label:ctx=>{
      if(ctx.raw==null||ctx.raw<1) return null;
      const W=46, lines=[mrow('  '+ctx.dataset.label, fmt(ctx.raw), W)];
      const s=series[ctx.datasetIndex], r=rowByAge[labels[ctx.dataIndex]];
      if(s && s.type==='portfolio' && r){
        const e=(r.portfoliosByPerson[s.personIdx]||[])[s.bi];
        if(e){
          // Net-of-expenses growth % (the actual balance change once dividends used and shares sold come out)
          // is shown whenever the portfolio paid anything that year, then gross growth %.
          const paid=(e.divUsed||0)+(e.sold||0);
          if(paid>0) lines.push(mrow('      Annual growth (net of expenses paid)', (e.netGrowthPct||0).toFixed(1)+'%', W));
          lines.push(mrow('      Annual growth (real)', (e.growthPct||0).toFixed(1)+'%', W));
          if(showDetails){
            if(e.aum) lines.push(mrow('      AUM fee charged on this balance', fmt(e.feeDrag||0), W));
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
            lines.push(mrow('      Cost basis', fmt(e.basis||0), W));
            lines.push(mrow('      Unrealized gain', fmt(e.unrealizedGain||0)+' ('+gainPct.toFixed(0)+'% of value)', W));
            if(e.steppedUp) lines.push(mrow('      Basis stepped up at death', 'reset to value', W));
          }
        }
      }
      return lines;
    }
  };

  upsertLineChart(cfg.key,{canvasId:cfg.canvasId, labels, datasets, yMax:Y_MAX, tooltip:tooltipCallbacks,
    createOptions:()=>({
      ...CHART_BASE,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{display:false},
        tooltip:{...TIP_STYLE,callbacks:justifyTip(tooltipCallbacks)}
      },
      scales:{
        x:ageXAxis(ageAxisLabel(proj)),
        y:{stacked:true,min:0,max:Y_MAX,title:axisTitle(cfg.yTitle),ticks:{...AXIS_TICKS,callback:v=>'$'+Math.round(v/1000)+'k'},grid:AXIS_GRID}
      }
    })});
  legendEl.innerHTML = series.map((s,si)=>
    legendItem(escHtml(seriesLabel(s,si)), ASSET_COLORS[si%ASSET_COLORS.length])
  ).join('');

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
  setGainNote(cfg, gainText);
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

