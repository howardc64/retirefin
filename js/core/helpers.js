'use strict';
// ═══════════════════════════════════════════════════════════════
// CORE / HELPERS — generic formatting, escaping and math utilities
// used by input, compute and display modules alike.
// ═══════════════════════════════════════════════════════════════
const fmt = n => (n<0?'-$':'$')+Math.round(Math.abs(n)).toLocaleString();
const fmtM = n => fmt(n)+'/mo';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function uid(){return Math.random().toString(36).slice(2,9);}
function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
function escAttr(s){ return String(s==null?'':s).replace(/"/g,'&quot;'); }
