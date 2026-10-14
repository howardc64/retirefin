'use strict';
// ═══════════════════════════════════════════════════════════════
// CORE / MARKDOWN — the one Markdown → HTML converter of the app, shared by the Usage / Tips pages (display/mdPage.js) and the chat bubbles (display/chat.js).
// Everything is HTML-escaped first, so untrusted text (a model reply) cannot inject markup; the options below tune it for each user.
// ═══════════════════════════════════════════════════════════════
// A small, intentionally non-exhaustive Markdown → HTML converter — enough for a plain-language
// document (headings, bold/italic, inline code, fenced code blocks, links, lists, blockquotes,
// horizontal rules, tables, paragraphs, and bullet / numbered lists nested by indentation; headings get an id so [text](#id) links work). Not a full CommonMark implementation; if a misc/*.md file needs a
// Markdown feature this doesn't handle, extend this function rather than reaching for a CDN library
// so the Tips and Usage buttons keep working offline once the page itself has loaded.
function mdToHtml(md, opts){
  opts=opts||{};
  // opts.breaks: a single newline inside a paragraph is a <br> (chat replies) instead of a space (documents)
  // opts.flatHeadings: a # heading is a bold paragraph, not an <hN> (chat bubbles)
  // opts.tableWrap: class of a <div> wrapped around each table, for horizontal scrolling (chat bubbles)
  // opts.links === false: [text](url) stays plain text (untrusted text such as a model reply)
  // opts.ids === false: headings get no id (ids exist so [text](#id) links of a document work)
  const SEP=opts.breaks?'<br>':' ';
  const esc = s => escHtml(s);
  // Inline formatting, applied after block-level structure below has consumed a line's raw text.
  function inline(s){
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
    if(opts.links!==false) s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (all,txt,url)=>/^\s*(javascript|data|vbscript):/i.test(url)?all:'<a href="'+url+'" rel="noopener">'+txt+'</a>');   // never a script / data URL
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
      const htxt=line.replace(/^#{1,6}\s+/,''), hid=htxt.toLowerCase().replace(/[`*_]/g,'').replace(/[^\p{L}\p{N}\s-]/gu,'').trim().replace(/\s+/g,'-');   // GitHub-style slug
      html+=opts.flatHeadings?`<p><strong>${inline(htxt)}</strong></p>`:`<h${level}${opts.ids===false?'':` id="${esc(hid)}"`}>${inline(htxt)}</h${level}>`;
      i++; continue;
    }
    if(/^(---|\*\*\*|___)\s*$/.test(line)){ closeLists(); html+='<hr>'; i++; continue; }
    if(/^>\s?/.test(line)){
      if(!inQuote){ closeLists(); html+='<blockquote>'; inQuote=true; }
      html+=`<p>${inline(line.replace(/^>\s?/,''))}</p>`;
      i++; continue;
    }
    // A table: a header row, a |---|---| separator row, then body rows (cells split on |; inline formatting applies in each cell).
    if(/^\s*\|.*\|\s*$/.test(line) && i+1<lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i+1])){
      closeLists();
      const cells=r=>r.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim());
      if(opts.tableWrap) html+=`<div class="${opts.tableWrap}">`;
      html+='<table><thead><tr>'+cells(line).map(c=>`<th>${inline(c)}</th>`).join('')+'</tr></thead><tbody>';
      i+=2;
      while(i<lines.length && /^\s*\|.*\|\s*$/.test(lines[i])){ html+='<tr>'+cells(lines[i]).map(c=>`<td>${inline(c)}</td>`).join('')+'</tr>'; i++; }
      html+='</tbody></table>'+(opts.tableWrap?'</div>':''); continue;
    }
    let m;
    if((m=line.match(BULLET))){ listItem('ul',indentOf(m[1]),m[2]); i++; continue; }
    if((m=line.match(NUMBER))){ listItem('ol',indentOf(m[1]),m[2]); i++; continue; }
    // An indented, non-list line directly under a list item is that item's wrapped continuation text.
    if(stack.length && /^\s+\S/.test(line)){ html+=SEP+inline(line.trim()); i++; continue; }
    // Paragraph: consume consecutive non-blank, non-block-starting lines as one <p>.
    closeLists();
    const buf=[line]; i++;
    while(i<lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s+|```|>|\||---|\*\*\*|___)/.test(lines[i]) && !BULLET.test(lines[i]) && !NUMBER.test(lines[i])){
      buf.push(lines[i]); i++;
    }
    html+=`<p>${opts.breaks?buf.map(inline).join(SEP):inline(buf.join(' '))}</p>`;   // with breaks each line is formatted alone, then joined by <br>
  }
  closeLists();
  return html;
}
