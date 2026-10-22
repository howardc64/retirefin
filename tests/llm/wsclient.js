'use strict';
// A minimal WebSocket CLIENT for the bridge tests (Node has no global WebSocket before v22, and the tests must also send malformed frames on purpose).
const http=require('http'), crypto=require('crypto');
function maskFrame(op,payload,o){
  o=o||{}; const p=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload),'utf8'), n=p.length, mask=crypto.randomBytes(4), fin=o.fin===false?0:0x80;
  let head; if(n<126) head=Buffer.from([fin|op,(o.unmasked?0:0x80)|n]); else if(n<65536){ head=Buffer.alloc(4); head[0]=fin|op; head[1]=(o.unmasked?0:0x80)|126; head.writeUInt16BE(n,2); } else { head=Buffer.alloc(10); head[0]=fin|op; head[1]=(o.unmasked?0:0x80)|127; head.writeUInt32BE(0,2); head.writeUInt32BE(n,6); }
  if(o.unmasked) return Buffer.concat([head,p]);
  const m=Buffer.from(p); for(let i=0;i<n;i++) m[i]^=mask[i&3]; return Buffer.concat([head,mask,m]);
}
// connect(port, {host}) → Promise<client>; client: {messages[], closed:{code}|null, send(obj), sendRaw(buf), waitFor(pred,ms), close(), status}
function connect(port,o){
  o=o||{};
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:o.path||'/',headers:Object.assign({Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':crypto.randomBytes(16).toString('base64'),Host:o.host||('127.0.0.1:'+port)},o.headers||{})});
    req.on('upgrade',(res,sock)=>{
      const c={messages:[],closed:null,sock,pongs:0,status:101,waiters:[]};
      let buf=Buffer.alloc(0), frags=[];
      const note=()=>{ c.waiters=c.waiters.filter(w=>{ const hit=c.messages.find(w.pred); if(hit){ clearTimeout(w.t); w.res(hit); return false; } if(c.closed&&w.orClosed){ clearTimeout(w.t); w.res(null); return false; } return true; }); };
      sock.on('data',d=>{
        buf=Buffer.concat([buf,d]);
        for(;;){
          if(buf.length<2) break; const fin=!!(buf[0]&0x80), op=buf[0]&15; let len=buf[1]&0x7f, off=2;
          if(len===126){ if(buf.length<4) break; len=buf.readUInt16BE(2); off=4; } else if(len===127){ if(buf.length<10) break; len=buf.readUInt32BE(6); off=10; }
          if(buf.length<off+len) break; const data=buf.slice(off,off+len); buf=buf.slice(off+len);
          if(op===8){ c.closed={code:data.length>=2?data.readUInt16BE(0):1005}; }
          else if(op===9){ sock.write(maskFrame(10,data)); }
          else if(op===10){ c.pongs++; c.lastPong=data; }
          else { frags.push(data); if(fin){ const t=Buffer.concat(frags).toString('utf8'); frags=[]; try{ c.messages.push(JSON.parse(t)); }catch(e){ c.messages.push({__raw:t}); } } }
        }
        note();
      });
      sock.on('close',()=>{ if(!c.closed) c.closed={code:1006}; c.ended=true; note(); });
      sock.on('error',()=>{});
      c.send=obj=>sock.write(maskFrame(1,JSON.stringify(obj)));
      c.sendRaw=b=>sock.write(b);
      c.waitFor=(pred,ms)=>new Promise((res,rej)=>{ const hit=c.messages.find(pred); if(hit) return res(hit); const w={pred,res,orClosed:false,t:setTimeout(()=>{ c.waiters=c.waiters.filter(x=>x!==w); rej(new Error('timeout waiting for a message')); },ms||5000)}; c.waiters.push(w); });
      c.waitClosed=ms=>new Promise(res=>{ if(c.closed&&c.ended) return res(c.closed); const w={pred:()=>false,res:()=>res(c.closed),orClosed:true,t:setTimeout(()=>res(c.closed),ms||3000)}; c.waiters.push(w); });
      c.close=()=>{ try{ sock.write(maskFrame(8,Buffer.from([3,232]))); sock.end(); }catch(e){} };
      resolve(c);
    });
    req.on('response',res=>{ res.resume(); resolve({status:res.statusCode,messages:[],closed:{code:0},refused:true}); });
    req.on('error',e=>reject(e));
    req.end();
  });
}
module.exports={connect,maskFrame};
