import OT from './ot';

const A = 'clientA';
const B = 'clientB';

// Construct an op from a raw stream: numbers are retains, strings are inserts,
// negative numbers are deletes.
const streamOp = (clientId, ...stream) => OT.op(clientId, stream);

// TP1: transform(A, B) = [A', B'] must satisfy
//   apply(apply(base, A), B') === apply(apply(base, B), A').
function converges(base, opA, opB) {
  const [a, b] = OT.opTransform(opA, opB);
  const r1 = OT.applyOps(OT.applyOps(base, opA), b);
  const r2 = OT.applyOps(OT.applyOps(base, opB), a);
  return { ok: r1 === r2, r1, r2, a, b };
}

describe('diffToOps', () => {
  test('reconstructs an insertion', () => {
    const op = OT.diffToOps('hello world', 'hello brave world', A);
    expect(OT.applyOps('hello world', op)).toBe('hello brave world');
  });
  test('reconstructs a pure delete', () => {
    const op = OT.diffToOps('hello cruel world', 'hello world', A);
    expect(OT.applyOps('hello cruel world', op)).toBe('hello world');
  });
  test('produces a complete op (base length = source length)', () => {
    const op = OT.diffToOps('abcdef', 'aXbcdef', A);
    expect(OT.baseLength(op)).toBe(6);
    expect(OT.targetLength(op)).toBe(7);
  });
});

describe('insert vs insert', () => {
  test('different positions converge', () => {
    const r = converges('abcd', streamOp(A, 1, 'X', 3), streamOp(B, 3, 'Y', 1));
    expect(r.ok).toBe(true);
  });
  test('same position converges deterministically', () => {
    const r = converges('abcd', streamOp(A, 2, 'X', 2), streamOp(B, 2, 'Y', 2));
    expect(r.ok).toBe(true);
    // A is the first argument, so its insert comes first
    expect(r.r1).toBe('abXYcd');
  });
});

describe('insert vs delete', () => {
  test('insert before delete range converges', () => {
    const r = converges('abcdef', streamOp(A, 1, 'X', 5), streamOp(B, 2, -3, 1));
    expect(r.ok).toBe(true);
  });
  test('insert after delete range converges', () => {
    const r = converges('abcdef', streamOp(A, 5, 'X', 1), streamOp(B, 2, -3, 1));
    expect(r.ok).toBe(true);
  });
  test('insert inside deleted range converges', () => {
    const r = converges('abcdef', streamOp(A, 3, 'X', 3), streamOp(B, 2, -4));
    expect(r.ok).toBe(true);
  });
});

describe('delete vs delete', () => {
  test('disjoint deletes converge', () => {
    const r = converges('abcdefgh', streamOp(A, 1, -2, 5), streamOp(B, 4, -2, 2));
    expect(r.ok).toBe(true);
  });
  test('partial overlap converges', () => {
    const r = converges('abcdefgh', streamOp(A, 3, -2, 3), streamOp(B, 2, -2, 4));
    expect(r.ok).toBe(true);
  });
  test('one fully inside the other converges', () => {
    const r = converges('abcdefgh', streamOp(A, 2, -6), streamOp(B, 4, -2, 2));
    expect(r.ok).toBe(true);
  });
  test('identical ranges converge', () => {
    const r = converges('abcdefgh', streamOp(A, 2, -3, 3), streamOp(B, 2, -3, 3));
    expect(r.ok).toBe(true);
  });
});

describe('opCompose', () => {
  test('composes consecutive edits', () => {
    const first = OT.diffToOps('abc', 'aXbc', A);
    const second = OT.diffToOps('aXbc', 'aXYbc', A);
    const composed = OT.opCompose(first, second);
    expect(OT.applyOps('abc', composed)).toBe('aXYbc');
  });
});

describe('multi-op transform (realistic typing bursts)', () => {
  test('composed local edit vs remote edit converge', () => {
    // Client A types two chars quickly (composed into one op)
    const base = 'abcdef';
    const a1 = OT.diffToOps('abcdef', 'aXbcdef', A);
    const a2 = OT.diffToOps('aXbcdef', 'aXZbcdef', A);
    const local = OT.opCompose(a1, a2);
    // Client B inserts Y at position 2 (relative to base)
    const remote = OT.diffToOps('abcdef', 'abYcdef', B);
    const r = converges(base, local, remote);
    expect(r.ok).toBe(true);
  });
});

describe('opToAbsolute', () => {
  test('insert maps to absolute position', () => {
    const prims = OT.opToAbsolute(streamOp(A, 2, 'X', 3));
    expect(prims).toEqual([{ type: 'insert', pos: 2, text: 'X', clientId: A }]);
  });
  test('delete then insert after maps correctly', () => {
    const prims = OT.opToAbsolute(streamOp(A, 2, -2, 'X', 2));
    expect(prims).toEqual([
      { type: 'delete', pos: 2, len: 2, clientId: A },
      { type: 'insert', pos: 2, text: 'X', clientId: A },
    ]);
  });
});