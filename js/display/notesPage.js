'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / NOTES PAGE — "Notes" button (next to Formulas) fetches
// misc/Note4User.md and opens it as a formatted HTML page in a new
// tab, converting the Markdown at open-time so it's always current
// with whatever misc/Note4User.md actually says.
//
// Limitation (web-platform, not fixable from here): reading a
// sibling file via fetch() only works when this app is served over
// http(s) (e.g. GitHub Pages, or any local dev server) — browsers
// block script-initiated reads of local sibling files when the page
// itself was opened via file://. Chrome enforces this strictly;
// Firefox is more permissive. When it's blocked, openNotesPage()
// shows a clear explanation instead of failing silently.
// ═══════════════════════════════════════════════════════════════

async function openNotesPage(){
  const win = window.open('', '_blank');
  if(!win){ alert('Please allow pop-ups for this page to view the notes in a new tab.'); return; }
  try{
    const res = await fetch('misc/Note4User.md');
    if(!res.ok) throw new Error('HTTP '+res.status);
    const md = await res.text();
    win.document.write(mdPageHtml('Note4User.md', mdToHtml(md)));
  }catch(err){
    win.document.write(mdPageHtml('Note4User.md', `
      <p><strong>Couldn't load misc/Note4User.md automatically.</strong></p>
      <p>If you opened this app directly as a local file (a <code>file://</code> address), browsers
      block a page from reading its own sibling files this way — this isn't something the app can
      work around. Two options:</p>
      <ul>
        <li>Serve the app over <code>http://</code> instead (e.g. host it on GitHub Pages, or run
        any simple local static server from the app's folder) and click Notes again, or</li>
        <li>Open <code>misc/Note4User.md</code> directly in a text editor or browser tab.</li>
      </ul>
      <p class="fp-src">Technical detail: ${err && err.message ? err.message : err}</p>
    `));
  }
  win.document.close();
}

// A small, intentionally non-exhaustive Markdown → HTML converter — enough for a plain-language
// notes file (headings, bold/italic, inline code, fenced code blocks, links, lists, blockquotes,
// horizontal rules, paragraphs). Not a full CommonMark implementation; if Note4User.md needs a
// Markdown feature this doesn't handle, extend this function rather than reaching for a CDN library
// so the Notes button keeps working offline once the page itself has loaded.
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
  let html='', i=0, inUl=false, inOl=false, inQuote=false;
  const closeLists=()=>{ if(inUl){html+='</ul>';inUl=false;} if(inOl){html+='</ol>';inOl=false;} if(inQuote){html+='</blockquote>';inQuote=false;} };
  while(i<lines.length){
    const line=lines[i];
    if(/^```/.test(line)){
      closeLists();
      const buf=[]; i++;
      while(i<lines.length && !/^```/.test(lines[i])){ buf.push(lines[i]); i++; }
      html+=`<pre><code>${esc(buf.join('\n'))}</code></pre>`;
      i++; continue;
    }
    if(/^\s*$/.test(line)){ closeLists(); i++; continue; }
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
    if(/^\s*[-*]\s+/.test(line)){
      if(!inUl){ closeLists(); html+='<ul>'; inUl=true; }
      html+=`<li>${inline(line.replace(/^\s*[-*]\s+/,''))}</li>`;
      i++; continue;
    }
    if(/^\s*\d+\.\s+/.test(line)){
      if(!inOl){ closeLists(); html+='<ol>'; inOl=true; }
      html+=`<li>${inline(line.replace(/^\s*\d+\.\s+/,''))}</li>`;
      i++; continue;
    }
    // Paragraph: consume consecutive non-blank, non-block-starting lines as one <p>.
    closeLists();
    const buf=[line]; i++;
    while(i<lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s+|```|>|\s*[-*]\s+|\s*\d+\.\s+|---|\*\*\*|___)/.test(lines[i])){
      buf.push(lines[i]); i++;
    }
    html+=`<p>${inline(buf.join(' '))}</p>`;
  }
  closeLists();
  return html;
}

function mdPageHtml(title, bodyHtml){
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title} — Retirement Income Planner</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;max-width:780px;margin:32px auto;padding:0 20px;line-height:1.6;color:#1c1c1c;background:#fdfdfb;}
  h1{font-size:26px;} h2{font-size:20px;margin-top:30px;} h3{font-size:16px;margin-top:22px;}
  code{background:#f2f0ea;padding:1px 5px;border-radius:3px;font-family:'SF Mono',Consolas,monospace;font-size:12.5px;}
  pre{background:#f2f0ea;padding:10px 12px;border-radius:5px;overflow-x:auto;}
  pre code{background:none;padding:0;}
  blockquote{border-left:3px solid #b08a3e;margin:0;padding:2px 14px;color:#555;background:#f6f4ee;}
  ul,ol{padding-left:22px;} li{margin-bottom:4px;}
  a{color:#8a5a1c;} hr{border:none;border-top:1px solid #ddd;margin:24px 0;}
  .fp-src{color:#888;font-size:11.5px;}
</style></head>
<body>${bodyHtml}
<hr><p class="fp-src">Rendered from <code>misc/Note4User.md</code> at the moment this tab was opened — click Notes again after editing that file to see changes.</p>
</body></html>`;
}
