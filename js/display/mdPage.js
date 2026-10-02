'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / MD PAGE — shared Markdown → HTML viewer used by the
// "Usage" and "Notes" buttons (see usagePage.js / notesPage.js).
//
// openMdPage(file, label) opens a new tab, fetch()es the Markdown
// file (e.g. misc/Usage.md), converts it to HTML at the moment of
// opening with mdToHtml(), and wraps it in mdPageHtml(). Editing the
// .md file therefore needs no code change — the next click shows it.
//
// Limitation (web-platform, not fixable from here): reading a
// sibling file via fetch() only works when this app is served over
// http(s) (e.g. GitHub Pages, or any local dev server) — browsers
// block script-initiated reads of local sibling files when the page
// itself was opened via file://. Chrome enforces this strictly;
// Firefox is more permissive. When it's blocked, openMdPage()
// shows a clear explanation instead of failing silently.
// ═══════════════════════════════════════════════════════════════

async function openMdPage(file, label){
  const name = file.split('/').pop();
  const win = window.open('', '_blank');
  if(!win){ alert('Please allow pop-ups for this page to view the '+label.toLowerCase()+' in a new tab.'); return; }
  try{
    const res = await fetch(file);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const md = await res.text();
    win.document.write(mdPageHtml(name, mdToHtml(md), file, label));
  }catch(err){
    win.document.write(mdPageHtml(name, `
      <p><strong>Couldn't load ${escHtml(file)} automatically.</strong></p>
      <p>If you opened this app directly as a local file (a <code>file://</code> address), browsers
      block a page from reading its own sibling files this way — this isn't something the app can
      work around. Two options:</p>
      <ul>
        <li>Serve the app over <code>http://</code> instead (e.g. host it on GitHub Pages, or run
        any simple local static server from the app's folder) and click ${escHtml(label)} again, or</li>
        <li>Open <code>${escHtml(file)}</code> directly in a text editor or browser tab.</li>
      </ul>
      <p class="fp-src">Technical detail: ${err && err.message ? escHtml(err.message) : escHtml(String(err))}</p>
    `, file, label));
  }
  win.document.close();
}

// A small, intentionally non-exhaustive Markdown → HTML converter — enough for a plain-language
// document (headings, bold/italic, inline code, fenced code blocks, links, lists, blockquotes,
// horizontal rules, paragraphs, and bullet / numbered lists nested by indentation). Not a full CommonMark implementation; if a misc/*.md file needs a
// Markdown feature this doesn't handle, extend this function rather than reaching for a CDN library
// so the Notes and Usage buttons keep working offline once the page itself has loaded.
function mdToHtml(md){
  const esc = s => escHtml(s);
  // Inline formatting, applied after block-level structure below has consumed a line's raw text.
  function inline(s){
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return s;
  }
  const lines = md.replace(/\r\n/g,'\n').split('\n');
  let html='', i=0, inQuote=false;
  // Lists nest by indentation (a tab counts as 4 spaces). `stack` holds one entry per open <ul>/<ol>; the current
  // <li> stays open until the next item so a deeper-indented list can nest inside it.
  const stack=[];
  const BULLET=/^(\s*)[-*+•◦▪‣]\s+(.*)$/, NUMBER=/^(\s*)\d+[.)]\s+(.*)$/;
  const indentOf=ws=>ws.replace(/\t/g,'    ').length;
  const closeTop=()=>{ const t=stack.pop(); if(t.liOpen) html+='</li>'; html+=`</${t.type}>`; };
  const closeLists=()=>{ while(stack.length) closeTop(); if(inQuote){html+='</blockquote>';inQuote=false;} };
  function listItem(type,indent,text){
    if(inQuote){ html+='</blockquote>'; inQuote=false; }
    if(!stack.length || indent>stack[stack.length-1].indent){
      stack.push({type,indent,liOpen:false}); html+=`<${type}>`;        // new (possibly nested) list
    } else {
      while(stack.length>1 && indent<stack[stack.length-1].indent) closeTop();   // back out to the matching level
      const t=stack[stack.length-1];
      if(t.type!==type){ closeTop(); stack.push({type,indent,liOpen:false}); html+=`<${type}>`; }
      else if(t.liOpen){ html+='</li>'; t.liOpen=false; }
    }
    html+=`<li>${inline(text)}`; stack[stack.length-1].liOpen=true;
  }
  while(i<lines.length){
    const line=lines[i];
    if(/^```/.test(line)){
      closeLists();
      const buf=[]; i++;
      while(i<lines.length && !/^```/.test(lines[i])){ buf.push(lines[i]); i++; }
      html+=`<pre><code>${esc(buf.join('\n'))}</code></pre>`;
      i++; continue;
    }
    if(/^\s*$/.test(line)){
      // a blank line ends a list unless the next non-blank line is another list item (loose list)
      let j=i+1; while(j<lines.length && /^\s*$/.test(lines[j])) j++;
      if(!(stack.length && j<lines.length && (BULLET.test(lines[j])||NUMBER.test(lines[j])))) closeLists();
      i++; continue;
    }
    if(/^#{1,6}\s+/.test(line)){
      closeLists();
      const level=line.match(/^#+/)[0].length;
      html+=`<h${level}>${inline(line.replace(/^#{1,6}\s+/,''))}</h${level}>`;
      i++; continue;
    }
    if(/^(---|\*\*\*|___)\s*$/.test(line)){ closeLists(); html+='<hr>'; i++; continue; }
    if(/^>\s?/.test(line)){
      if(!inQuote){ closeLists(); html+='<blockquote>'; inQuote=true; }
      html+=`<p>${inline(line.replace(/^>\s?/,''))}</p>`;
      i++; continue;
    }
    let m;
    if((m=line.match(BULLET))){ listItem('ul',indentOf(m[1]),m[2]); i++; continue; }
    if((m=line.match(NUMBER))){ listItem('ol',indentOf(m[1]),m[2]); i++; continue; }
    // An indented, non-list line directly under a list item is that item's wrapped continuation text.
    if(stack.length && /^\s+\S/.test(line)){ html+=' '+inline(line.trim()); i++; continue; }
    // Paragraph: consume consecutive non-blank, non-block-starting lines as one <p>.
    closeLists();
    const buf=[line]; i++;
    while(i<lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s+|```|>|---|\*\*\*|___)/.test(lines[i]) && !BULLET.test(lines[i]) && !NUMBER.test(lines[i])){
      buf.push(lines[i]); i++;
    }
    html+=`<p>${inline(buf.join(' '))}</p>`;
  }
  closeLists();
  return html;
}

function mdPageHtml(title, bodyHtml, file, label){
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escHtml(title)} — Retirement Income Planner</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;max-width:780px;margin:32px auto;padding:0 20px;line-height:1.6;color:#1c1c1c;background:#fdfdfb;}
  h1{font-size:26px;} h2{font-size:20px;margin-top:30px;} h3{font-size:16px;margin-top:22px;}
  code{background:#f2f0ea;padding:1px 5px;border-radius:3px;font-family:'SF Mono',Consolas,monospace;font-size:12.5px;}
  pre{background:#f2f0ea;padding:10px 12px;border-radius:5px;overflow-x:auto;}
  pre code{background:none;padding:0;}
  blockquote{border-left:3px solid #b08a3e;margin:0;padding:2px 14px;color:#555;background:#f6f4ee;}
  ul,ol{padding-left:22px;} li{margin-bottom:4px;} li>ul,li>ol{margin-top:4px;margin-bottom:0;}
  a{color:#8a5a1c;} hr{border:none;border-top:1px solid #ddd;margin:24px 0;}
  .fp-src{color:#888;font-size:11.5px;}
</style></head>
<body>${bodyHtml}
<hr><p class="fp-src">Rendered from <code>${escHtml(file)}</code> at the moment this tab was opened — click ${escHtml(label)} again after editing that file to see changes.</p>
</body></html>`;
}
