// Integration simulation: models the ot.js single-outstanding-op client/server
// protocol end-to-end using stream operations. Usage:
//   node src/ot.simulation.js          (run all 1000 seeds)
//   $env:DEBUG_SEED="7"; node src/ot.simulation.js   (trace one seed)
const OT = require('./ot');

const HISTORY_LIMIT = 200;
const DEBUG_SEED = Number(process.env.DEBUG_SEED || 0);

let SEED = 0;
const debug = (...a) => {
  if (DEBUG_SEED && DEBUG_SEED === SEED) console.log(...a);
};

function makeServer() {
  return { code: '', rev: 0, history: [] };
}

// ot.js-style server edit: transform the incoming op against every history op
// with rev > baseRev (the ops the client has not seen), apply, record.
function serverEdit(srv, clientId, baseRev, ops) {
  const oldestRev = srv.history.length ? srv.history[0].rev : 0;
  if (baseRev + 1 < oldestRev || baseRev > srv.rev) {
    return { resync: true, baseRev, curRev: srv.rev };
  }
  let transformed = ops;
  for (const h of srv.history) {
    if (h.rev > baseRev) {
      transformed = OT.opTransform(transformed, h.ops)[0];
    }
  }
  srv.code = OT.applyOps(srv.code, transformed);
  srv.rev += 1;
  srv.history.push({ rev: srv.rev, clientId, ops: transformed });
  if (srv.history.length > HISTORY_LIMIT) {
    srv.history.splice(0, srv.history.length - HISTORY_LIMIT);
  }
  return { rev: srv.rev, ops: transformed };
}

function makeClient(id) {
  return { id, doc: '', revRef: 0, outstanding: null, buffer: null, seq: 0, resynced: false };
}

// Client local edit. Composes into a buffer while an op is outstanding;
// otherwise sends immediately. Returns a payload to send, or null.
function clientLocalEdit(c, newDoc) {
  const prev = c.doc;
  if (newDoc === prev) return null;
  c.doc = newDoc;
  const ops = OT.diffToOps(prev, newDoc, c.id);
  if (OT.opIsNoop(ops)) return null;
  if (c.outstanding) {
    c.buffer = c.buffer ? OT.opCompose(c.buffer, ops) : ops;
    return null;
  }
  const opId = ++c.seq;
  c.outstanding = ops;
  return { baseRev: c.revRef, ops, opId };
}

// Client receives a broadcast op (already transformed by the server against
// everything the client has seen). Rebases outstanding/buffer.
function clientReceiveOp(c, rev, ops) {
  if (rev <= c.revRef) return;
  c.revRef = rev;
  if (OT.opIsNoop(ops)) return;
  if (c.outstanding) {
    const pair1 = OT.opTransform(c.outstanding, ops);
    if (c.buffer) {
      const pair2 = OT.opTransform(c.buffer, pair1[1]);
      c.doc = OT.applyOps(c.doc, pair2[1]);
      c.outstanding = pair1[0];
      c.buffer = pair2[0];
    } else {
      c.doc = OT.applyOps(c.doc, pair1[1]);
      c.outstanding = pair1[0];
    }
  } else {
    c.doc = OT.applyOps(c.doc, ops);
  }
}

// Client receives an ack for its outstanding op. If a buffer is queued, send
// it with the current revision. Returns the payload to send, or null.
function clientReceiveAck(c, opId, rev, ops) {
  if (rev > c.revRef) c.revRef = rev;
  if (!c.outstanding || !OT.opEqual(c.outstanding, ops)) {
    c.outstanding = null;
    c.buffer = null;
    c.resynced = true;
    return null;
  }
  c.outstanding = null;
  if (c.buffer) {
    const opId2 = ++c.seq;
    c.outstanding = c.buffer;
    c.buffer = null;
    return { baseRev: c.revRef, ops: c.outstanding, opId: opId2 };
  }
  return null;
}

function run(numClients, numEdits, seed) {
  SEED = seed;
  const srv = makeServer();
  const clients = Array.from({ length: numClients }, (_, i) => makeClient('client' + i));
  const deliveries = [];
  let rng = seed;
  const rand = (n) => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng % n;
  };

  const processServerEdit = (msg) => {
    const out = serverEdit(srv, clients[msg.from].id, msg.baseRev, msg.ops);
    if (out.resync) {
      const c = clients[msg.from];
      c.outstanding = null;
      c.buffer = null;
      c.resynced = true;
      debug('RESYNC c' + msg.from, 'baseRev', msg.baseRev, 'srv.rev', srv.rev);
      return;
    }
    debug('SRV c' + msg.from, 'baseRev', msg.baseRev, '-> rev', out.rev, 'code', JSON.stringify(srv.code), 'ops', JSON.stringify(out.ops));
    for (let i = 0; i < clients.length; i++) {
      if (i === msg.from) {
        deliveries.push({ kind: 'ack', to: i, opId: msg.opId, rev: out.rev, ops: out.ops });
      } else {
        deliveries.push({ kind: 'op', to: i, rev: out.rev, ops: out.ops });
      }
    }
  };

  const deliver = () => {
    const d = deliveries.shift();
    if (d.kind === 'op') {
      clientReceiveOp(clients[d.to], d.rev, d.ops);
      debug('OP -> c' + d.to, 'rev', d.rev, 'ops', JSON.stringify(d.ops), 'doc', JSON.stringify(clients[d.to].doc), 'revRef', clients[d.to].revRef, 'out', JSON.stringify(clients[d.to].outstanding && clients[d.to].outstanding.ops), 'buf', JSON.stringify(clients[d.to].buffer && clients[d.to].buffer.ops));
    } else {
      const payload = clientReceiveAck(clients[d.to], d.opId, d.rev, d.ops);
      debug('ACK -> c' + d.to, 'opId', d.opId, 'rev', d.rev, 'ops', JSON.stringify(d.ops), 'revRef', clients[d.to].revRef, 'out', JSON.stringify(clients[d.to].outstanding && clients[d.to].outstanding.ops), 'buf', JSON.stringify(clients[d.to].buffer && clients[d.to].buffer.ops));
      if (payload) {
        debug('SEND c' + d.to, 'baseRev', payload.baseRev, 'ops', JSON.stringify(payload.ops.ops));
        processServerEdit(Object.assign({ from: d.to }, payload));
      }
    }
  };

  const makeEdit = () => {
    const ci = rand(numClients);
    const c = clients[ci];
    const doc = c.doc;
    const pos = rand(doc.length + 1);
    const ch = String.fromCharCode(97 + rand(26));
    const payload = clientLocalEdit(c, doc.slice(0, pos) + ch + doc.slice(pos));
    if (payload) {
      debug('EDIT c' + ci, JSON.stringify(c.doc), 'baseRev', payload.baseRev, 'ops', JSON.stringify(payload.ops.ops));
      processServerEdit(Object.assign({ from: ci }, payload));
    }
  };

  let editsDone = 0;
  let guard = 0;
  while ((editsDone < numEdits || deliveries.length) && guard++ < 1000000) {
    if (editsDone >= numEdits) {
      deliver();
      continue;
    }
    if (!deliveries.length) {
      editsDone++;
      makeEdit();
      continue;
    }
    if (rand(2) === 0) {
      editsDone++;
      makeEdit();
    } else {
      deliver();
    }
  }

  const allSame = clients.every((c) => c.doc === srv.code);
  const anyResync = clients.some((c) => c.resynced);
  return { converged: allSame, resync: anyResync, serverDoc: srv.code, clients };
}

let pass = 0;
let fail = 0;
let resyncs = 0;
const failures = [];

for (let seed = 1; seed <= 1000; seed++) {
  const r = run(3, 10, seed);
  if (r.converged) {
    pass++;
    if (r.resync) resyncs++;
  } else {
    fail++;
    if (failures.length < 5) {
      failures.push(seed);
      console.log('FAIL seed', seed, 'server:', JSON.stringify(r.serverDoc), 'clients:', r.clients.map((c) => JSON.stringify(c.doc)).join(' | '));
    }
  }
}

console.log(`PASS ${pass} / ${pass + fail}  (${resyncs} runs hit a resync path, still converged)`);