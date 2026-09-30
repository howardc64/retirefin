'use strict';
// One-shot regression check:  node tests/check.js
// Takes a fresh snapshot of the current code and compares it with tests/baseline.json.
// After an INTENTIONAL change to charts/output, review the diff and refresh the baseline with:
//   node tests/check.js --update
const {spawnSync}=require('child_process'), path=require('path'), fs=require('fs');
const here=__dirname, cur=path.join(here,'current.json'), base=path.join(here,'baseline.json');
const run=(f,args)=>spawnSync(process.execPath,[path.join(here,f),...args],{stdio:'inherit'}).status;
if(run('snapshot.js',[cur])!==0) process.exit(2);
if(process.argv.includes('--update')){ fs.copyFileSync(cur,base); console.log('baseline updated:',base); process.exit(0); }
if(!fs.existsSync(base)){ console.log('No baseline yet — run:  node tests/check.js --update'); process.exit(2); }
process.exit(run('compare.js',[base,cur]));
