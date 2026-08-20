// Operational Transformation engine for CodeBridge.
// Port of ot.js's TextOperation (retain/insert/delete streams) plus helpers.
// UMD so it can be required from the Node server and imported by the client bundle.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CodeBridgeOT = factory();
  }
})(typeof window !== 'undefined' ? window : {}, function () {

  // An operation is { ops: [...], clientId }. Each op in the stream is:
  //   positive int  -> retain (advance cursor, copy n chars)
  //   string        -> insert
  //   negative int  -> delete (n chars at the cursor)
  // The stream is relative to the cursor position in the base document.

  var isRetain = function (o) {
    return typeof o === 'number' && o > 0;
  };
  var isInsert = function (o) {
    return typeof o === 'string';
  };
  var isDelete = function (o) {
    return typeof o === 'number' && o < 0;
  };

  // Merge helpers: keep ops arrays canonical (adjacent same-type ops merged,
  // inserts before deletes) so that equality and length checks are stable.
  function pushRetain(ops, n) {
    if (!n) return;
    if (isRetain(ops[ops.length - 1])) {
      ops[ops.length - 1] += n;
    } else {
      ops.push(n);
    }
  }
  function pushInsert(ops, s) {
    if (!s) return;
    var last = ops[ops.length - 1];
    if (isInsert(last)) {
      ops[ops.length - 1] += s;
    } else if (isDelete(last)) {
      if (isInsert(ops[ops.length - 2])) {
        ops[ops.length - 2] += s;
      } else {
        ops[ops.length] = ops[ops.length - 1];
        ops[ops.length - 2] = s;
      }
    } else {
      ops.push(s);
    }
  }
  function pushDelete(ops, n) {
    if (!n) return;
    if (isDelete(ops[ops.length - 1])) {
      ops[ops.length - 1] += n;
    } else {
      ops.push(-n);
    }
  }

  // Build an operation from a clientId and a raw stream of ops.
  function op(clientId, stream) {
    return { ops: stream.slice(), clientId: clientId };
  }

  function baseLength(op) {
    var b = 0;
    for (var i = 0; i < op.ops.length; i++) {
      var o = op.ops[i];
      if (isRetain(o)) b += o;
      else if (isDelete(o)) b -= o;
    }
    return b;
  }

  function targetLength(op) {
    var t = 0;
    for (var i = 0; i < op.ops.length; i++) {
      var o = op.ops[i];
      if (isRetain(o)) t += o;
      else if (isInsert(o)) t += o.length;
    }
    return t;
  }

  // Compute the op that turns `before` into `after`. Result is a complete op
  // (base length = before.length) so it composes and transforms correctly.
  function diffToOps(before, after, clientId) {
    var p = 0;
    var bl = before.length;
    var al = after.length;
    while (p < bl && p < al && before[p] === after[p]) p++;
    var s = 0;
    while (s < bl - p && s < al - p && before[bl - 1 - s] === after[al - 1 - s]) s++;
    var mb = bl - p - s;
    var ma = al - p - s;
    var ops = [];
    if (p > 0) ops.push(p);
    if (mb > 0) ops.push(-mb);
    if (ma > 0) ops.push(after.slice(p, p + ma));
    if (s > 0) ops.push(s);
    return { ops: ops, clientId: clientId };
  }

  // Apply an op stream to a document string.
  function applyOps(doc, op) {
    var out = [];
    var i = 0;
    for (var k = 0; k < op.ops.length; k++) {
      var o = op.ops[k];
      if (isRetain(o)) {
        out.push(doc.slice(i, i + o));
        i += o;
      } else if (isInsert(o)) {
        out.push(o);
      } else {
        i -= o;
      }
    }
    return out.join('');
  }

  // Convert a stream op into absolute-position primitives (relative to the
  // evolving document), for applying to a rich editor like Monaco.
  function opToAbsolute(op) {
    var prims = [];
    var cursor = 0; // position in the base document
    var deleted = 0; // chars removed before the cursor
    for (var k = 0; k < op.ops.length; k++) {
      var o = op.ops[k];
      if (isRetain(o)) {
        cursor += o;
      } else if (isInsert(o)) {
        prims.push({ type: 'insert', pos: cursor - deleted, text: o, clientId: op.clientId });
      } else {
        var pos = cursor - deleted;
        prims.push({ type: 'delete', pos: pos, len: -o, clientId: op.clientId });
        cursor += -o;
        deleted += -o;
      }
    }
    return prims;
  }

  // Transform two concurrent operations A and B (both relative to the same
  // base) into A' and B' such that apply(apply(base, A), B') ===
  // apply(apply(base, B), A'). Single interleaved pass over both streams;
  // same-position inserts tie-break by argument order (A first), which is the
  // deterministic rule ot.js relies on.
  function opTransform(A, B) {
    if (baseLength(A) !== baseLength(B)) {
      throw new Error(
        'transform: base lengths differ (' + baseLength(A) + ' vs ' + baseLength(B) + ')'
      );
    }
    var ops1 = A.ops, ops2 = B.ops;
    var aPrime = [], bPrime = [];
    var i1 = 0, i2 = 0;
    var o1 = ops1[i1++], o2 = ops2[i2++];
    while (true) {
      if (o1 === undefined && o2 === undefined) break;

      if (isInsert(o1)) {
        pushInsert(aPrime, o1);
        pushRetain(bPrime, o1.length);
        o1 = ops1[i1++];
        continue;
      }
      if (isInsert(o2)) {
        pushRetain(aPrime, o2.length);
        pushInsert(bPrime, o2);
        o2 = ops2[i2++];
        continue;
      }
      if (o1 === undefined) {
        throw new Error('transform: first operation is too short');
      }
      if (o2 === undefined) {
        throw new Error('transform: first operation is too long');
      }

      var minl;
      if (isRetain(o1) && isRetain(o2)) {
        if (o1 > o2) {
          minl = o2;
          o1 = o1 - o2;
          o2 = ops2[i2++];
        } else if (o1 === o2) {
          minl = o2;
          o1 = ops1[i1++];
          o2 = ops2[i2++];
        } else {
          minl = o1;
          o2 = o2 - o1;
          o1 = ops1[i1++];
        }
        pushRetain(aPrime, minl);
        pushRetain(bPrime, minl);
      } else if (isDelete(o1) && isDelete(o2)) {
        // overlapping deletes: consume the shared part, no output
        if (-o1 > -o2) {
          o1 = o1 - o2;
          o2 = ops2[i2++];
        } else if (o1 === o2) {
          o1 = ops1[i1++];
          o2 = ops2[i2++];
        } else {
          o2 = o2 - o1;
          o1 = ops1[i1++];
        }
      } else if (isDelete(o1) && isRetain(o2)) {
        if (-o1 > o2) {
          minl = o2;
          o1 = o1 + o2;
          o2 = ops2[i2++];
        } else if (-o1 === o2) {
          minl = o2;
          o1 = ops1[i1++];
          o2 = ops2[i2++];
        } else {
          minl = -o1;
          o2 = o2 + o1;
          o1 = ops1[i1++];
        }
        pushDelete(aPrime, minl);
      } else if (isRetain(o1) && isDelete(o2)) {
        if (o1 > -o2) {
          minl = -o2;
          o1 = o1 + o2;
          o2 = ops2[i2++];
        } else if (o1 === -o2) {
          minl = o1;
          o1 = ops1[i1++];
          o2 = ops2[i2++];
        } else {
          minl = o1;
          o2 = o2 + o1;
          o1 = ops1[i1++];
        }
        pushDelete(bPrime, minl);
      } else {
        throw new Error("transform: the two operations aren't compatible");
      }
    }
    return [op(A.clientId, aPrime), op(B.clientId, bPrime)];
  }

  // Compose consecutive operations: apply(apply(base, A), B) ===
  // apply(base, compose(A, B)).
  function opCompose(A, B) {
    if (targetLength(A) !== baseLength(B)) {
      throw new Error(
        'compose: base length of B must equal target length of A (' +
          baseLength(B) + ' vs ' + targetLength(A) + ')'
      );
    }
    var ops1 = A.ops, ops2 = B.ops;
    var out = [];
    var i1 = 0, i2 = 0;
    var o1 = ops1[i1++], o2 = ops2[i2++];
    while (true) {
      if (o1 === undefined && o2 === undefined) break;

      if (isDelete(o1)) {
        pushDelete(out, o1);
        o1 = ops1[i1++];
        continue;
      }
      if (isInsert(o2)) {
        pushInsert(out, o2);
        o2 = ops2[i2++];
        continue;
      }
      if (o1 === undefined) {
        throw new Error('compose: first operation is too short');
      }
      if (o2 === undefined) {
        throw new Error('compose: first operation is too long');
      }

      if (isRetain(o1) && isRetain(o2)) {
        if (o1 > o2) {
          pushRetain(out, o2);
          o1 = o1 - o2;
          o2 = ops2[i2++];
        } else if (o1 === o2) {
          pushRetain(out, o1);
          o1 = ops1[i1++];
          o2 = ops2[i2++];
        } else {
          pushRetain(out, o1);
          o2 = o2 - o1;
          o1 = ops1[i1++];
        }
      } else if (isInsert(o1) && isDelete(o2)) {
        if (o1.length > -o2) {
          o1 = o1.slice(-o2);
          o2 = ops2[i2++];
        } else if (o1.length === -o2) {
          o1 = ops1[i1++];
          o2 = ops2[i2++];
        } else {
          o2 = o2 + o1.length;
          o1 = ops1[i1++];
        }
      } else if (isInsert(o1) && isRetain(o2)) {
        if (o1.length > o2) {
          pushInsert(out, o1.slice(0, o2));
          o1 = o1.slice(o2);
          o2 = ops2[i2++];
        } else if (o1.length === o2) {
          pushInsert(out, o1);
          o1 = ops1[i1++];
          o2 = ops2[i2++];
        } else {
          pushInsert(out, o1);
          o2 = o2 - o1.length;
          o1 = ops1[i1++];
        }
      } else if (isRetain(o1) && isDelete(o2)) {
        if (o1 > -o2) {
          pushDelete(out, o2);
          o1 = o1 + o2;
          o2 = ops2[i2++];
        } else if (o1 === -o2) {
          pushDelete(out, o2);
          o1 = ops1[i1++];
          o2 = ops2[i2++];
        } else {
          pushDelete(out, o1);
          o2 = o2 + o1;
          o1 = ops1[i1++];
        }
      } else {
        throw new Error('compose: incompatible operations');
      }
    }
    return op(A.clientId, out);
  }

  function opEqual(A, B) {
    if (!A || !B || A.ops.length !== B.ops.length) return false;
    for (var i = 0; i < A.ops.length; i++) {
      if (A.ops[i] !== B.ops[i]) return false;
    }
    return true;
  }

  function opIsNoop(op) {
    return op.ops.length === 0 || (op.ops.length === 1 && isRetain(op.ops[0]));
  }

  // Inverse of an operation (for undo), given the document the op applies to.
  function invertOp(op, doc) {
    var strIndex = 0;
    var ops = [];
    for (var i = 0; i < op.ops.length; i++) {
      var o = op.ops[i];
      if (isRetain(o)) {
        pushRetain(ops, o);
        strIndex += o;
      } else if (isInsert(o)) {
        pushDelete(ops, o.length);
      } else {
        pushInsert(ops, doc.slice(strIndex, strIndex - o));
        strIndex -= o;
      }
    }
    return op(op.clientId, ops);
  }

  return {
    op: op,
    isRetain: isRetain,
    isInsert: isInsert,
    isDelete: isDelete,
    baseLength: baseLength,
    targetLength: targetLength,
    diffToOps: diffToOps,
    applyOps: applyOps,
    opToAbsolute: opToAbsolute,
    opTransform: opTransform,
    opCompose: opCompose,
    opEqual: opEqual,
    opIsNoop: opIsNoop,
    invertOp: invertOp,
  };
});