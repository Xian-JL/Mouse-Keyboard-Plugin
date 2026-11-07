// AC-SIZE-01 / AC-SIZE-02: FR-08 receipt size control. The projection is pure, and the
// controller must apply it to the post-action observation without touching savePath.
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectObservation, COMPACT_ELEMENTS } from '../lib/contracts.js';
import { Controller } from '../lib/core.js';
import { FakeBackend, authority, scope, signal, settings, observation } from './fixture.mjs';

function bigObservation(count = 40) {
  const value = observation();
  value.elements = Array.from({ length: count }, (_, i) => ({ ref: 'r' + i, runtimeId: String(i), name: 'Control ' + i, role: i % 2 ? 'Button' : 'Edit', rect: { left: -200 + i, top: 10, width: 20, height: 10 }, enabled: true, password: false, editable: false, multiline: 'unknown', value: 'x'.repeat(80) }));
  value.focusedElement = value.elements[count - 1];
  return value;
}
function fixture() {
  const b = new FakeBackend(), a = authority(), s = scope();
  const c = new Controller(b, a, settings, () => 1);
  return { b, a, s, c };
}
async function open(f) {
  await f.c.execute(f.s, 'mk_control', { action: 'begin' }, signal());
  const t = await f.c.execute(f.s, 'mk_observe', { mode: 'targets' }, signal());
  const target = t.targets[0].target;
  const o = await f.c.execute(f.s, 'mk_observe', { mode: 'window', target }, signal());
  return { target, snapshot: o.snapshot };
}

test('[AC-SIZE-02] compact keeps the focus plus at most 20 other elements and reports honest coverage', () => {
  const data = bigObservation(40);
  const compact = projectObservation(data, 'compact');
  assert.equal(compact.elements.length, COMPACT_ELEMENTS);
  assert.ok(compact.elements.length <= 21);
  assert.equal(compact.elements[0].ref, data.focusedElement.ref, 'the focused element must be delivered first');
  assert.equal(compact.coverage.availableElements, 40);
  assert.equal(compact.coverage.deliveredElements, compact.elements.length);
  assert.equal(compact.focusedElement.ref, data.focusedElement.ref);
  assert.equal(projectObservation(data, 'none'), null);
  assert.equal(projectObservation(data, 'full'), data);
});

test('[AC-SIZE-01] observe:none drops the observation and shrinks the receipt by at least 80%', async () => {
  const f = fixture();
  try {
    let captured;
    f.b.act = async (_run, _w, _o, request) => { captured = request; return { execution: 'sent', verification: 'unverified', observation: bigObservation(40) }; };
    const op = await open(f);
    const none = await f.c.execute(f.s, 'mk_keyboard', { ...op, action: 'type', text: 'x', observe: 'none', savePath: 'E:\\shots\\a.png' }, signal());
    assert.equal(none.observation, null);
    assert.equal('observation' in none, true);
    assert.equal(captured.savePath, 'E:\\shots\\a.png', 'savePath is forwarded regardless of the observation amount');
    const reopened = await open(f);
    const full = await f.c.execute(f.s, 'mk_keyboard', { ...reopened, action: 'type', text: 'x', observe: 'full' }, signal());
    assert.equal(typeof full.observation, 'object');
    const noneBytes = Buffer.byteLength(JSON.stringify(none));
    const fullBytes = Buffer.byteLength(JSON.stringify(full));
    assert.ok(fullBytes > 1000, 'the full receipt must actually carry the elements');
    assert.ok(noneBytes <= fullBytes * 0.2, `observe:none must cut receipts by >=80% (${noneBytes} vs ${fullBytes})`);
  } finally { await f.c.dispose(); }
});

test('[AC-SIZE-02] the controller compacts the post-action observation and keeps it usable as the next snapshot', async () => {
  const f = fixture();
  try {
    f.b.act = async () => ({ execution: 'sent', verification: 'verified', observation: bigObservation(40) });
    const op = await open(f);
    const compact = await f.c.execute(f.s, 'mk_keyboard', { ...op, action: 'type', text: 'x', observe: 'compact' }, signal());
    assert.equal(compact.execution, 'sent');
    assert.ok(Array.isArray(compact.observation.elements));
    assert.ok(compact.observation.elements.length <= 21);
    assert.equal(compact.observation.coverage.deliveredElements, compact.observation.elements.length);
    assert.equal(compact.observation.coverage.availableElements, 40);
    assert.equal(typeof compact.observation.snapshot, 'string');
    // The compacted post-observation must remain a valid single-use snapshot.
    const next = await f.c.execute(f.s, 'mk_mouse', { target: op.target, snapshot: compact.observation.snapshot, action: 'click', element: compact.observation.focusedElement.ref }, signal());
    assert.equal(next.execution, 'sent');
  } finally { await f.c.dispose(); }
});
