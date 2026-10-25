'use strict';
// ═══════════════════════════════════════════════════════════════
// DISPLAY / MD PAGE — shared Markdown → HTML viewer used by the
// "Usage" and "Tips" buttons (openUsagePage / openNotesPage below). The Markdown converter itself is core/markdown.js (shared with the chat).
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

async function openMdPage(file, label) {
  const name = file.split('/').pop();
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow pop-ups for this page to view the ' + label.toLowerCase() + ' in a new tab.');
    return;
  }
  try {
    const res = await fetch(file);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const md = await res.text();
    win.document.write(mdPageHtml(name, mdToHtml(md), file, label));
  } catch (err) {
    win.document.write(
      mdPageHtml(
        name,
        `
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
    `,
        file,
        label
      )
    );
  }
  win.document.close();
}

function mdPageHtml(title, bodyHtml, file, label) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escHtml(title)} — Retirement Income Planner</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;max-width:780px;margin:32px auto;padding:0 20px;line-height:1.6;color:#1c1c1c;background:#fdfdfb;}
  h1{font-size:26px;} h2{font-size:20px;margin-top:34px;padding-bottom:4px;border-bottom:2px solid #e6dfcf;} h3{font-size:16px;margin-top:24px;color:#5b4a1f;}
  table{border-collapse:collapse;width:100%;margin:12px 0 16px;font-size:14px;line-height:1.45;}
  th,td{border:1px solid #ddd6c4;padding:6px 10px;text-align:left;vertical-align:top;} th{background:#f2eedf;font-weight:600;}
  tbody tr:nth-child(even){background:#faf8f1;}
  p{margin:8px 0;}
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

// The two buttons. Usage (left of Save) shows misc/Usage.md; Tips (right of Formulas) shows misc/Note4User.md.
function openUsagePage() {
  return openMdPage('misc/Usage.md', 'Usage');
}
function openNotesPage() {
  return openMdPage('misc/Note4User.md', 'Tips');
}
