'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / ASSET VALUE CHARTS — brokerage/IRA/Roth balances, and
// a separate IDGT-only chart if any IDGT portfolios exist (spec §10).
// ═══════════════════════════════════════════════════════════════
const assetCharts={asset:null, idgt:null};
const ASSET_COLORS=['#0f6e56','#2E86AB','#8E44AD','#D06A18','#C0392B','#3DB08A','#7B5EA7','#E85D9A','#1A5276','#B5891D'];

// "Embedded gain at end of plan" line (spec §4.6 cost basis, §6.7): a second line under a chart's note. It is
// created on first use next to the note element (index.html doesn't need a matching element) and
// hidden whenever there's nothing to say (no portfolio on this chart has cost basis tracked).
function setGainNote(cfg, noteEl, text){
  if(!noteEl) return;
  const id=cfg.noteId+'Gain';
  let el=document.getElementById(id);
  if(!el){
    el=document.createElement('div'); el.id=id; el.className=noteEl.className; el.style.marginTop='6px';
    noteEl.parentNode.insertBefore(el, noteEl.nextSibling);
  }
  el.textContent=text||''; el.style.display=text?'':'none';
}

// One builder for both asset charts. `cfg` picks which series belong on the chart
// (main chart: non-IDGT brokerage + pre-tax IRAs; IDGT chart: IDGT brokerage only).
function buildAssetChartFor(cfg){
  if(typeof Chart==='undefined'||!lastProjection) return;
  const proj=lastProjection, rows=proj.rows;
  const noteEl=document.getElementById(cfg.noteId);
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

  const clear=(msg)=>{
    if(assetCharts[cfg.key]){ try{ assetCharts[cfg.key].destroy(); }catch(e){} assetCharts[cfg.key]=null; }
    legendEl.innerHTML=''; noteEl.textContent=msg||'';
    setGainNote(cfg, noteEl, '');
  };
  if(card) card.style.display = series.length ? '' : 'none';
  if(!series.length){ clear(cfg.emptyMsg); return; }
  if(!rows.length){ clear(''); return; }

  const labels=ageLabelRange(rows[0].age0,chartMaxAge(proj));
  const ages=rows.map(r=>r.age0);
  const rowByAge={}; rows.forEach(r=>rowByAge[Math.round(r.age0)]=r);
  const seriesValues=series.map(s=>rows.map(r=>{
    if(s.type==='ira') return (r.iraBalByPerson&&r.iraBalByPerson[s.personIdx])||0;
    if(s.type==='roth') return (r.rothBalByPerson&&r.rothBalByPerson[s.personIdx])||0;
    const person=r.portfoliosByPerson[s.personIdx];
    const entry=person&&person[s.bi];
    return entry?entry.balance:0;
  }));
  const aligned=seriesValues.map(vals=>alignToAges(ages, vals, labels));

  if(chartYMax[cfg.key]==null){
    let maxT=0;
    for(let i=0;i<labels.length;i++){
      let t=0, any=false;
      aligned.forEach(a=>{ const v=a[i]; if(v!=null){ t+=v; any=true; } });
      if(any) maxT=Math.max(maxT,t);
    }
    chartYMax[cfg.key] = Math.max(50000, Math.ceil(maxT/10000)*10000+10000);
  }
  const Y_MAX=chartYMax[cfg.key];

  const seriesLabel=(s,si)=>{
    const personName=displayPersonName(proj.people[s.personIdx], s.personIdx);
    return proj.married ? `${personName} — ${s.name}` : s.name;
  };
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
    title:i=>{ const idx=i[0]?i[0].dataIndex:0; const r=rowByAge[labels[idx]]; return r?popupPersonAgeLines(proj,r):[]; },
    // Per portfolio: value, then the tax drag and fee drag applied that year (all today's $).
    label:ctx=>{
      if(ctx.raw==null||ctx.raw<1) return null;
      const W=46, lines=[mrow('  '+ctx.dataset.label, fmt(ctx.raw), W)];
      const s=series[ctx.datasetIndex], r=rowByAge[labels[ctx.dataIndex]];
      if(s && s.type==='portfolio' && r){
        const e=(r.portfoliosByPerson[s.personIdx]||[])[s.bi];
        if(e){
          if(!cfg.idgt){
            // Main (non-IDGT) chart, spec §10: value; if Expenses is checked, net-of-expenses
            // growth % (and, only when Show details is on, the expense breakdown behind it); then gross growth %.
            if(e.expense){
              if(showDetails){
                lines.push(mrow('      Tax drag', fmt(e.taxDrag||0), W));
                lines.push(mrow('      Fee drag', fmt(e.feeDrag||0), W));
                lines.push(mrow('      Withdrawal', fmt(e.livingCost||0), W));
                lines.push(mrow('      LTCG realized', fmt(e.ltcg||0), W));
              }
              lines.push(mrow('      Annual growth (net of expenses)', (e.netGrowthPct||0).toFixed(1)+'%', W));
            }
            lines.push(mrow('      Annual growth (real)', (e.growthPct||0).toFixed(1)+'%', W));
          } else {
            // IDGT chart, spec §10: value, annual growth %; tax drag/fee drag are shown only when Show details is on,
            // and withdrawal isn't part of this popup at all.
            lines.push(mrow('      Annual growth (real)', (e.growthPct||0).toFixed(1)+'%', W));
            if(showDetails){
              lines.push(mrow('      Tax drag', fmt(e.taxDrag||0), W));
              lines.push(mrow('      Fee drag', fmt(e.feeDrag||0), W));
            }
          }
          // Cost basis / unrealized gain (spec §4.6, cost basis) — Show details only, both charts, only for
          // portfolios with basis tracked. A step-up (owner passed, portfolio continues to spouse,
          // non-IDGT) is flagged in the year it happens.
          if(showDetails && e.tracked){
            const gainPct=e.balance>0?e.unrealizedGain/e.balance*100:0;
            // Dividend waterfall: dividends pay the year's outflows first, leftovers are reinvested,
            // and only a shortfall is sold (which is what realizes gain).
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

  let chart=assetCharts[cfg.key];
  if(chart){
    updateChartInPlace(chart, labels, datasets);
    chart.options.scales.y.max=Y_MAX;
    chart.options.plugins.tooltip.callbacks=justifyTip(tooltipCallbacks);
    chart.update();
  } else {
    assetCharts[cfg.key]=new Chart(document.getElementById(cfg.canvasId),{type:'line',data:{labels,datasets},options:{
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
    }});
  }
  legendEl.innerHTML = series.map((s,si)=>
    `<span class="li"><span class="ls" style="background:${ASSET_COLORS[si%ASSET_COLORS.length]}"></span>${escHtml(seriesLabel(s,si))}</span>`
  ).join('');
  noteEl.textContent = cfg.note;

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
  setGainNote(cfg, noteEl, gainText);
}

function buildAssetChart(){
  buildAssetChartFor({
    key:'asset', idgt:false, canvasId:'assetChart', legendId:'assetLegend', noteId:'assetChartNote',
    yTitle:"Asset value (today's $)", totalLabel:'Total asset value',
    emptyMsg:'Add a non-IDGT brokerage portfolio, or enable a pre-tax IRA/401(k) or Roth IRA, to see this chart.',
    note:`Each band is one brokerage portfolio (IDGTs excluded), pre-tax IRA/401(k) balance, or Roth IRA balance, compounding at its own configured growth rate (brokerage/IRA balances also net of tax drag and fee drag), in today's dollars. A brokerage band drops to zero once its owner passes, unless "Continues to spouse" is checked; an inherited pre-tax or Roth IRA continues under the surviving spouse until they pass, then drops to zero. A Roth IRA also grows from any Annual Roth conversion configured on the matching pre-tax IRA. Y-axis locked — use Rescale if the stack runs off the top.`
  });
}
function buildIdgtChart(){
  buildAssetChartFor({
    key:'idgt', idgt:true, cardId:'idgtCard', canvasId:'idgtChart', legendId:'idgtLegend', noteId:'idgtChartNote',
    yTitle:"IDGT value (today's $)", totalLabel:'Total IDGT value',
    emptyMsg:'',
    note:`Each band is one brokerage portfolio flagged as an IDGT, compounding at its own configured growth rate less tax drag and fee drag, in today's dollars. Dividend income from IDGT portfolios is still included in household income and tax. A band drops to zero once its owner passes, unless "Continues to spouse" is checked. Y-axis locked — use Rescale if the stack runs off the top.`
  });
}

