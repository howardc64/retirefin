'use strict';
// Compare two snapshots produced by snapshot.js and list every difference.
//   node tests/compare.js [expected.json] [actual.json] [--ignore=/path,/other]
// Defaults: tests/baseline.json vs tests/current.json. Exit code 0 = identical, 1 = differences.
const fs=require('fs'), path=require('path');
const args=process.argv.slice(2), flags=args.filter(a=>a.startsWith('--')), files=args.filter(a=>!a.startsWith('--'));
const ignore=new Set(((flags.find(f=>f.startsWith('--ignore='))||'').slice(9)).split(',').filter(Boolean));
const A=JSON.parse(fs.readFileSync(files[0]||path.join(__dirname,'baseline.json'),'utf8'));
const B=JSON.parse(fs.readFileSync(files[1]||path.join(__dirname,'current.json'),'utf8'));
let diffs=0; const show=(kind,p,x,y)=>{ diffs++; if(diffs<=60) console.log(kind.padEnd(8),p,x!==undefined?String(JSON.stringify(x)).slice(0,90):'', y!==undefined?'->  '+String(JSON.stringify(y)).slice(0,90):''); };
(function walk(x,y,p){
  if(ignore.has(p)) return;
  const ox=x&&typeof x==='object', oy=y&&typeof y==='object';
  if(ox&&oy&&Array.isArray(x)!==Array.isArray(y)) return show('TYPE',p);
  if(ox&&oy&&Array.isArray(x)){
    if(x.length!==y.length) return show('LENGTH',p,x.length,y.length);
    return x.forEach((v,i)=>walk(v,y[i],p+'['+i+']'));
  }
  if(ox&&oy){
    for(const k of new Set([...Object.keys(x),...Object.keys(y)])){
      if(!(k in x)) show('ADDED',p+'/'+k); else if(!(k in y)) show('REMOVED',p+'/'+k); else walk(x[k],y[k],p+'/'+k);
    } return;
  }
  if(x!==y) show('DIFF',p,x,y);
})(A,B,'');
if(diffs>60) console.log('... and '+(diffs-60)+' more');
console.log(diffs?('\n'+diffs+' difference(s).'):'\nIdentical — no differences.');
process.exit(diffs?1:0);
