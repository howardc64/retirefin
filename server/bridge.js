'use strict';
// Live bridge (design phase 3, docs/LLM_INTEGRATION_DESIGN.md §6.3): a tiny WebSocket server, bound to 127.0.0.1 only, that lets the open planner page and an MCP host share
// one engine. The page pushes its CURRENT plan (so every tool answers about what is on screen, not about a stale file) and the server asks the page to apply *effects*
// (show a market path in the charts, open the proposals list). The page asks its user to approve each effect type before the first one is applied.
//
// No dependencies: a minimal RFC 6455 implementation (text frames, fragmentation, ping / pong, close). Nothing here knows about the planner; see server/mcp.js for the wiring.
//
// Protocol (JSON text frames; the first frame from a page must be `hello`):
//   page → server   {type:'hello', token, client?}               authenticate; anything else first, a bad token, or a silent socket is closed
//                   {type:'plan', plan:{…}, syncId?, replaced?}   replaced:true = a different plan was loaded (not an edit): the server forgets the runs made on the old one              the plan as the app's Save writes it (≤ maxPlanBytes); syncId answers a syncRequest
//                   {type:'pageRun', kind:'mc'|'stress'|'stmc', mc?, stress?}   a run finished in the page (sent right after the plan it ran on); the server reproduces it from the settings
//                   {type:'synced', id}                           answer to a syncRequest when the plan has not changed since it was last sent
//                   {type:'approvals', types:[…]}                 effect types the user has allowed on this connection (informational for the host)
//                   {type:'effectResult', id, status, note?}      status: applied | denied | unsupported | error
//   server → page   {type:'welcome', session, effects:[…]}        or {type:'denied', reason} and the socket is closed (code 1008)
//                   {type:'planAck', ok, error?, key?}            after each plan
//                   {type:'effect', id, effect:{type,…}, why?}    a request; the page may refuse it
//                   {type:'effectCancel', id}                     the host stopped waiting (timeout)
//                   {type:'syncRequest', id}                      "send your plan now" (asked before each tool call, so a tool never runs on a plan that is up to a second old)
// Security: loopback bind; Host header must name a loopback host (DNS-rebinding guard); a pairing token compared in constant time; after MAX_FAILS wrong tokens the token is
// replaced (so a page that guesses cannot keep guessing); unauthenticated sockets get 1 KB and 5 s; one authenticated page at a time (a newer authenticated page replaces it).
const http = require('http'),
  crypto = require('crypto'),
  {EventEmitter} = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0 O 1 I
const PRE_AUTH_BYTES = 1024,
  PRE_AUTH_MS = 5000,
  MAX_PRE_AUTH = 4,
  MAX_FAILS = 5,
  MAX_WS_FRAME = 1 << 24;
const MAX_PENDING_EFFECTS = 8;

function newToken() {
  const b = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) {
    s += ALPHABET[b[i] % 32];
    if (i % 4 === 3 && i < 11) s += '-';
  }
  return s;
}
const normToken = t =>
  String(t == null ? '' : t)
    .toUpperCase()
    .replace(/[\s-]/g, '');
function tokenOk(given, want) {
  const a = crypto.createHash('sha256').update(normToken(given)).digest(),
    b = crypto.createHash('sha256').update(normToken(want)).digest();
  return crypto.timingSafeEqual(a, b);
}
function hostOk(h, port) {
  if (!h) return false;
  h = String(h).toLowerCase();
  return ['127.0.0.1:' + port, 'localhost:' + port, '[::1]:' + port].includes(h);
}

// ── frames ───────────────────────────────────────────────────────
function encodeFrame(opcode, payload) {
  const p = Buffer.isBuffer(payload) ? payload : Buffer.from(payload == null ? '' : String(payload), 'utf8'),
    n = p.length;
  let head;
  if (n < 126) {
    head = Buffer.from([0x80 | opcode, n]);
  } else if (n < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeUInt32BE(0, 2);
    head.writeUInt32BE(n, 6);
  }
  return Buffer.concat([head, p]);
}
// Incremental parser: feed(chunk) → calls onMessage(text) / onClose(code) / onPing(buf) / onPong(); throws a {code, msg} for a protocol violation.
class FrameParser {
  constructor(maxBytes, h) {
    this.buf = Buffer.alloc(0);
    this.max = maxBytes;
    this.h = h;
    this.parts = [];
    this.size = 0;
    this.op = 0;
  }
  feed(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = !!(b[0] & 0x80),
        rsv = b[0] & 0x70,
        op = b[0] & 0x0f,
        masked = !!(b[1] & 0x80);
      let len = b[1] & 0x7f,
        off = 2;
      if (rsv) throw {code: 1002, msg: 'reserved bits set'};
      if (!masked) throw {code: 1002, msg: 'client frames must be masked'};
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        if (b.readUInt32BE(2) !== 0) throw {code: 1009, msg: 'frame too large'};
        len = b.readUInt32BE(6);
        off = 10;
      }
      if (len > this.max) throw {code: 1009, msg: 'frame too large'};
      if (b.length < off + 4 + len) return;
      const mask = b.slice(off, off + 4),
        data = Buffer.from(b.slice(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = b.slice(off + 4 + len);
      if (op >= 0x8) {
        if (!fin || len > 125) throw {code: 1002, msg: 'bad control frame'};
        if (op === 0x8) this.h.onClose(len >= 2 ? data.readUInt16BE(0) : 1005);
        else if (op === 0x9) this.h.onPing(data);
        else if (op === 0xa) this.h.onPong();
        else throw {code: 1002, msg: 'unknown opcode'};
        continue;
      }
      if (op === 0x1 || op === 0x2) {
        if (this.parts.length) throw {code: 1002, msg: 'new message inside a fragmented one'};
        this.op = op;
      } else if (op === 0x0) {
        if (!this.parts.length) throw {code: 1002, msg: 'continuation without a start'};
      } else throw {code: 1002, msg: 'unknown opcode'};
      this.parts.push(data);
      this.size += len;
      if (this.size > this.max) throw {code: 1009, msg: 'message too large'};
      if (fin) {
        const all = Buffer.concat(this.parts);
        this.parts = [];
        this.size = 0;
        if (this.op === 0x2) throw {code: 1003, msg: 'binary frames are not supported'};
        this.h.onMessage(all.toString('utf8'));
      }
    }
  }
}

// ── the bridge ───────────────────────────────────────────────────
// opts: {port (0 = any free port), token (fixed; default random), log(fn), maxPlanBytes, effects:[types the host can request], pingMs, preAuthMs}
function makeBridge(opts) {
  opts = opts || {};
  const ev = new EventEmitter(),
    log = opts.log || (() => {}),
    maxPlan = opts.maxPlanBytes || 8 * 1024 * 1024,
    effects = (opts.effects || []).slice();
  let server = null,
    port = 0,
    token = opts.token ? String(opts.token) : newToken(),
    fails = 0,
    session = null,
    seq = 0,
    pingTimer = null;
  const pre = new Set(),
    pending = new Map(),
    syncs = new Map();
  if (opts.token && normToken(opts.token).length < 12) throw new Error('the bridge token must have at least 12 letters or digits');

  const state = () => ({
    listening: !!server,
    port,
    connected: !!session,
    session: session && session.id,
    planAt: (session && session.planAt) || null,
    approvals: session ? session.approvals.slice() : [],
    client: (session && session.client) || null
  });
  function rotate(why) {
    token = newToken();
    fails = 0;
    log('token replaced (' + why + '); new pairing code: ' + token);
    ev.emit('token', token);
  }
  function sendJson(c, o) {
    if (c && !c.dead)
      try {
        c.sock.write(encodeFrame(0x1, JSON.stringify(o)));
      } catch (e) {}
  }
  function kill(c, code, reason) {
    if (c.dead) return;
    c.dead = true;
    clearTimeout(c.timer);
    try {
      const r = Buffer.from(String(reason || '').slice(0, 100));
      const p = Buffer.alloc(2 + r.length);
      p.writeUInt16BE(code, 0);
      r.copy(p, 2);
      c.sock.write(encodeFrame(0x8, p));
    } catch (e) {}
    try {
      c.sock.end();
      setTimeout(() => {
        try {
          c.sock.destroy();
        } catch (e) {}
      }, 500).unref();
    } catch (e) {}
    pre.delete(c);
    if (session === c) dropSession('closed');
  }
  function dropSession(why) {
    const s = session;
    session = null;
    if (!s) return;
    pending.forEach((p, id) => {
      clearTimeout(p.timer);
      p.resolve({status: 'disconnected', note: 'the page disconnected before answering'});
    });
    pending.clear();
    syncs.forEach(y => {
      clearTimeout(y.t);
      y.res({status: 'disconnected'});
    });
    syncs.clear();
    log('page disconnected (' + why + ')');
    ev.emit('disconnect', why);
  }
  function onMessage(c, text) {
    let m;
    try {
      m = JSON.parse(text);
    } catch (e) {
      return kill(c, 1008, 'not JSON');
    }
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return kill(c, 1008, 'bad message');
    if (!c.authed) {
      if (m.type !== 'hello') return kill(c, 1008, 'hello first');
      if (!tokenOk(m.token, token)) {
        sendJson(c, {type: 'denied', reason: 'wrong pairing code'});
        fails++;
        log('rejected a page: wrong pairing code (' + fails + '/' + MAX_FAILS + ')');
        ev.emit('rejected', fails);
        kill(c, 1008, 'denied');
        if (fails >= MAX_FAILS) rotate('too many wrong codes');
        return;
      }
      fails = 0;
      c.authed = true;
      c.parser.max = maxPlan + 1024;
      clearTimeout(c.timer);
      pre.delete(c);
      if (session) {
        const old = session;
        sendJson(old, {type: 'denied', reason: 'replaced by a newer page'});
        dropSession('replaced');
        kill(old, 1000, 'replaced');
      }
      c.id = 's' + ++seq + '-' + crypto.randomBytes(3).toString('hex');
      c.approvals = [];
      c.planAt = null;
      c.client = typeof m.client === 'string' ? m.client.slice(0, 40).replace(/[^\w .:-]/g, '') : 'page';
      session = c;
      sendJson(c, {type: 'welcome', session: c.id, effects});
      log('page connected (' + c.client + ')');
      ev.emit('connect', state());
      return;
    }
    if (m.type === 'plan') {
      if (!m.plan || typeof m.plan !== 'object' || Array.isArray(m.plan))
        return sendJson(c, {type: 'planAck', ok: false, error: 'plan must be an object'});
      c.planAt = Date.now();
      ev.emit('plan', m.plan, {replaced: m.replaced === true, reply: o => sendJson(c, Object.assign({type: 'planAck'}, o))});
      settleSync(m.syncId);
      return;
    }
    if (m.type === 'synced') {
      settleSync(m.id);
      return;
    }
    if (m.type === 'pageRun') {
      // the user ran something in the page: the server reproduces it (see rjFromPage); only small settings objects come in
      const plain = o => (o && typeof o === 'object' && !Array.isArray(o) && JSON.stringify(o).length < 20000 ? o : null);
      if (m.kind === 'mc' || m.kind === 'stress' || m.kind === 'stmc')
        ev.emit('pageRun', {kind: m.kind, mc: plain(m.mc), stress: plain(m.stress)});
      return;
    }
    if (m.type === 'approvals') {
      c.approvals = Array.isArray(m.types)
        ? m.types
            .filter(t => typeof t === 'string')
            .slice(0, 20)
            .map(t => t.slice(0, 40))
        : [];
      ev.emit('approvals', c.approvals.slice());
      return;
    }
    if (m.type === 'effectResult') {
      const p = pending.get(String(m.id));
      if (!p) return;
      pending.delete(String(m.id));
      clearTimeout(p.timer);
      p.resolve({
        status: ['applied', 'denied', 'unsupported', 'error'].includes(m.status) ? m.status : 'error',
        note: typeof m.note === 'string' ? m.note.slice(0, 300) : ''
      });
      return;
    }
    if (m.type === 'bye') return kill(c, 1000, 'bye');
    // anything else is ignored (a newer page may send more than this server knows)
  }
  function settleSync(id) {
    if (id == null) return;
    const y = syncs.get(String(id));
    if (!y) return;
    syncs.delete(String(id));
    clearTimeout(y.t);
    y.res({status: 'synced'});
  }
  function onUpgrade(req, sock) {
    const key = req.headers['sec-websocket-key'];
    const refuse = (code, msg) => {
      try {
        sock.write('HTTP/1.1 ' + code + ' ' + msg + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      } catch (e) {}
      sock.destroy();
    };
    if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13')
      return refuse(400, 'Bad Request');
    if (!hostOk(req.headers.host, port)) {
      log('refused a request with Host ' + req.headers.host);
      return refuse(403, 'Forbidden');
    }
    if ((req.url || '/').split('?')[0] !== '/') return refuse(404, 'Not Found');
    if (pre.size >= MAX_PRE_AUTH) return refuse(503, 'Service Unavailable');
    const accept = crypto
      .createHash('sha1')
      .update(key + GUID)
      .digest('base64');
    sock.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n'
    );
    sock.setNoDelay(true);
    const c = {sock, authed: false, dead: false, alive: true, id: null, approvals: [], planAt: null, client: null};
    c.parser = new FrameParser(PRE_AUTH_BYTES, {
      onMessage: t => onMessage(c, t),
      onClose: () => kill(c, 1000, 'closing'),
      onPing: d => {
        try {
          sock.write(encodeFrame(0xa, d));
        } catch (e) {}
      },
      onPong: () => {
        c.alive = true;
      }
    });
    pre.add(c);
    c.timer = setTimeout(() => {
      if (!c.authed) kill(c, 1008, 'no hello');
    }, opts.preAuthMs || PRE_AUTH_MS);
    c.timer.unref();
    sock.on('data', d => {
      try {
        c.parser.feed(d);
      } catch (e) {
        kill(c, (e && e.code) || 1002, (e && e.msg) || 'protocol error');
      }
    });
    sock.on('close', () => {
      c.dead = true;
      clearTimeout(c.timer);
      pre.delete(c);
      if (session === c) dropSession('socket closed');
    });
    sock.on('error', () => {});
  }
  function start() {
    return new Promise((resolve, reject) => {
      if (server) return resolve({port, token});
      server = http.createServer((req, res) => {
        res.writeHead(426, {'content-type': 'text/plain'});
        res.end('retirement planner bridge: WebSocket only\n');
      });
      server.on('upgrade', onUpgrade);
      server.on('error', e => {
        server = null;
        reject(e);
      });
      server.listen(opts.port || 0, '127.0.0.1', () => {
        port = server.address().port;
        log('listening on ws://127.0.0.1:' + port);
        pingTimer = setInterval(() => {
          if (session) {
            if (!session.alive) {
              kill(session, 1001, 'no pong');
              return;
            }
            session.alive = false;
            try {
              session.sock.write(encodeFrame(0x9, ''));
            } catch (e) {}
          }
        }, opts.pingMs || 20000);
        pingTimer.unref();
        resolve({port, token});
      });
    });
  }
  function close() {
    clearInterval(pingTimer);
    if (session) kill(session, 1001, 'server stopping');
    pre.forEach(c => kill(c, 1001, 'server stopping'));
    pending.forEach(p => {
      clearTimeout(p.timer);
      p.resolve({status: 'disconnected', note: 'the bridge stopped'});
    });
    pending.clear();
    syncs.forEach(y => {
      clearTimeout(y.t);
      y.res({status: 'disconnected'});
    });
    syncs.clear();
    return new Promise(r => {
      if (!server) return r();
      const s = server;
      server = null;
      s.close(() => r());
      setTimeout(r, 300).unref();
    });
  }
  // Ask the page to apply an effect. → Promise<{status, note}>; status: applied | denied | unsupported | error | timeout | noPage | disconnected | busy
  function requestEffect(effect, o) {
    o = o || {};
    if (!session) return Promise.resolve({status: 'noPage', note: 'no page is connected to the bridge'});
    if (!effect || typeof effect.type !== 'string') return Promise.resolve({status: 'error', note: 'bad effect'});
    if (pending.size >= MAX_PENDING_EFFECTS) return Promise.resolve({status: 'busy', note: 'too many effects are waiting for the user'});
    const id = 'e' + ++seq + '-' + crypto.randomBytes(2).toString('hex');
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        pending.delete(id);
        if (session) sendJson(session, {type: 'effectCancel', id});
        resolve({status: 'timeout', note: 'the user did not answer in time'});
      }, o.timeoutMs || 30000);
      pending.set(id, {resolve, timer});
      sendJson(session, {type: 'effect', id, effect, why: typeof o.why === 'string' ? o.why.slice(0, 200) : undefined});
    });
  }
  // Ask the page for its plan right now. → Promise<{status:'synced'|'timeout'|'noPage'|'disconnected'}>; 'synced' means the page's plan has been delivered (and the 'plan' event handled) or is unchanged.
  function requestSync(ms) {
    if (!session) return Promise.resolve({status: 'noPage'});
    const id = 'y' + ++seq;
    return new Promise(res => {
      const t = setTimeout(() => {
        syncs.delete(id);
        res({status: 'timeout'});
      }, ms || 1000);
      syncs.set(id, {res, t});
      sendJson(session, {type: 'syncRequest', id});
    });
  }
  Object.assign(ev, {start, close, requestEffect, requestSync, state, rotate: () => rotate('requested')});
  Object.defineProperties(ev, {token: {get: () => token}, port: {get: () => port}}); // live values (Object.assign would copy them once)
  return ev;
}

module.exports = {makeBridge, newToken, encodeFrame, FrameParser, tokenOk, hostOk, GUID};
