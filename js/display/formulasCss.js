'use strict';
// The stylesheet of the Calculation Reference page.
function fpCss() {
  return `  body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 20px;line-height:1.55;color:#1d1d1f;background:#f5f5f7;-webkit-font-smoothing:antialiased;}
  h1{font-size:28px;letter-spacing:-.02em;margin-bottom:4px;} h2{font-size:20px;letter-spacing:-.015em;margin-top:38px;border-bottom:1px solid #d2d2d7;padding-bottom:4px;}
  h3{font-size:15px;margin-top:22px;color:#1d1d1f;}
  table{border-collapse:collapse;margin:10px 0 18px;width:100%;font-size:13.5px;}
  th,td{border:1px solid #d9d9de;padding:5px 9px;text-align:left;vertical-align:top;}
  th{background:#ececf0;} caption{caption-side:top;text-align:left;font-size:11px;color:#777;margin-bottom:4px;}
  .fp-acr{font-weight:700;white-space:nowrap;} .fp-muted{color:#888;font-size:11.5px;}
  .fp-note{background:#ececf0;border-left:3px solid #007aff;padding:8px 12px;font-size:13px;margin:10px 0;}
  .fp-rmd td{text-align:center;font-size:12.5px;}
  code{background:#ececf0;padding:1px 5px;border-radius:4px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12.5px;}
  ul{padding-left:20px;} li{margin-bottom:5px;}
  .fp-src{color:#888;font-size:11.5px;}
  /* display equations */
  .fp-eq{margin:12px 0;text-align:center;font-family:'STIX Two Text','Cambria Math','Times New Roman',Georgia,serif;font-size:17px;line-height:2.1;overflow-x:auto;}
  .fp-eq .fp-lhs{margin-right:6px;}
  .fp-fr{display:inline-block;vertical-align:middle;text-align:center;margin:0 4px;line-height:1.35;}
  .fp-fr .fp-n{display:block;padding:0 5px 2px;border-bottom:1px solid #1c1c1c;}
  .fp-fr .fp-d{display:block;padding:2px 5px 0;}
  .fp-brace{display:inline-block;vertical-align:middle;width:9px;height:4.6em;margin:0 6px 0 2px;border:1.5px solid #1c1c1c;border-right:none;border-radius:9px 0 0 9px;}
  .fp-pw{display:inline-table;vertical-align:middle;border-collapse:collapse;margin:0;width:auto;font-size:inherit;}
  .fp-pw td{border:none;padding:0 0 0 0;text-align:left;line-height:1.7;}
  .fp-pw .fp-pv{padding-right:26px;white-space:nowrap;}
  .fp-pw .fp-pc{font-size:14.5px;color:#333;white-space:nowrap;}
  .fp-where{font-size:13px;color:#444;margin:-4px 0 14px;text-align:center;}
  .fp-item{margin:0 0 4px;}
  /* table of contents and back-links */
  .fp-toc{background:#fff;border:1px solid #d9d9de;border-radius:10px;padding:10px 18px 12px;margin:16px 0 8px;font-size:14px;}
  .fp-toc ul{margin:2px 0 6px;padding-left:20px;} .fp-toc>ul{padding-left:0;list-style:none;} .fp-toc>ul>li{margin-top:8px;font-weight:700;}
  .fp-toc ul ul{font-weight:400;columns:2;column-gap:28px;} .fp-toc ul ul li{margin-bottom:2px;break-inside:avoid;}
  .fp-toc a{color:#0066d6;text-decoration:none;} .fp-toc a:hover{text-decoration:underline;}
  a.fp-top{font-size:11px;font-weight:400;font-family:inherit;margin-left:10px;color:#999;text-decoration:none;white-space:nowrap;} a.fp-top:hover{color:#1f4f8f;text-decoration:underline;}
  .fp-toc .fp-groups{columns:1;font-weight:700;list-style:none;padding-left:14px;} .fp-toc .fp-groups>li{margin-top:6px;} .fp-toc .fp-groups ul{columns:2;font-weight:400;padding-left:20px;list-style:disc;}
  h2,h3{scroll-margin-top:12px;}
  @media print{ a.fp-top{display:none;} }
  @media screen and (prefers-color-scheme:dark){
    :root{color-scheme:dark;} body{background:#1c1c1e;color:#f5f5f7;} h2{border-bottom-color:#48484a;} h3{color:#e5e5ea;}
    th,td{border-color:#48484a;} th{background:#2c2c2e;} caption,.fp-muted,.fp-src{color:#98989d;}
    .fp-note,.fp-toc{background:#2c2c2e;border-color:#48484a;} code{background:#2c2c2e;}
    .fp-fr .fp-n{border-bottom-color:#e6e3dc;} .fp-brace{border-color:#e6e3dc;}
    .fp-pw .fp-pc{color:#d6d2ca;} .fp-where{color:#b8b4ac;} .fp-toc a{color:#64a8ff;} a.fp-top{color:#8f8b84;}
    a{color:#64a8ff;}
  }`;
}
