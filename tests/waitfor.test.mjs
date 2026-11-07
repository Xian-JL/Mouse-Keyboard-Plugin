// AC-WAIT-01 / AC-WAIT-02 / AC-WAIT-04 / AC-WAIT-06: FR-06 waitFor.
// Parsing, transport plumbing, the controller's receipt-vs-timeout semantics, the real
// pixel/text comparator counters and the documented canvas caveat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRequest } from '../lib/contracts.js';
import { Controller } from '../lib/core.js';
import { WindowsBackend } from '../lib/bridge.js';
import { FakeBackend, authority, scope, signal, settings, observation } from './fixture.mjs';
import { helperSelfTest } from './helper-selftest.mjs';

const pixel = { kind: 'pixel', region: { left: 10, top: 20, width: 100, height: 50 }, mode: 'stable' };
const windowRequest = { mode: 'window', target: 't' };

test('[AC-WAIT-01] waitFor parses the three kinds with documented defaults and bounds', () => {
  assert.deepEqual(parseRequest('mk_observe', { ...windowRequest, waitFor: { kind: 'text', value: 'All built.' } }).waitFor, { kind: 'text', value: 'All built.', exact: false, timeoutMs: 5000 });
  assert.deepEqual(parseRequest('mk_observe', { ...windowRequest, waitFor: { kind: 'element', value: '保存', role: 'Button', timeoutMs: 1200 } }).waitFor, { kind: 'element', value: '保存', role: 'Button', exact: false, timeoutMs: 1200 });
  assert.deepEqual(parseRequest('mk_observe', { ...windowRequest, waitFor: pixel }).waitFor, { kind: 'pixel', region: pixel.region, mode: 'stable', settleSamples: 3, minChangedPixels: 64, timeoutMs: 5000 });
  const changed = parseRequest('mk_observe', { ...windowRequest, waitFor: { ...pixel, mode: 'changed', minChangedPixels: 1, settleSamples: 10 } }).waitFor;
  assert.equal(changed.mode, 'changed');
  assert.equal(changed.minChangedPixels, 1);
  assert.equal(changed.settleSamples, 10);
  for (const bad of [
    { kind: 'text', value: 'x', timeoutMs: 999 },
    { kind: 'text', value: 'x', timeoutMs: 30001 },
    { kind: 'text', value: '' },
    { kind: 'text', value: 'x', unknown: 1 },
    { kind: 'pixel', region: pixel.region },
    { kind: 'pixel', region: pixel.region, mode: 'flicker' },
    { kind: 'pixel', region: { left: 0, top: 0, width: 0, height: 1 }, mode: 'stable' },
    { kind: 'pixel', region: pixel.region, mode: 'stable', settleSamples: 1 },
    { kind: 'pixel', region: pixel.region, mode: 'changed', minChangedPixels: 4097 },
    { kind: 'audio', value: 'x' }
  ]) assert.throws(() => parseRequest('mk_observe', { ...windowRequest, waitFor: bad }), e => e.code === 'INVALID_ARGUMENT');
  // targets mode has no window to wait on.
  assert.throws(() => parseRequest('mk_observe', { mode: 'targets', waitFor: { kind: 'text', value: 'x' } }), e => e.code === 'INVALID_ARGUMENT');
});

test('[AC-WAIT-01] waitFor, region and savePath reach the native observe request', async () => {
  const calls = [];
  const backend = new WindowsBackend(() => ({ request: async (method, params) => { calls.push({ method, params }); return {}; }, dispose: async () => {} }));
  try {
    await backend.observe('r', {}, signal(), false, 'compact', 'E:\\shots\\w.png', { left: 1, top: 2, width: 3, height: 4 }, { kind: 'pixel', region: { left: 5, top: 6, width: 7, height: 8 }, mode: 'changed', settleSamples: 4, minChangedPixels: 9, timeoutMs: 6000 });
    assert.equal(calls[0].method, 'observe');
    assert.deepEqual(calls[0].params.waitFor, { kind: 'pixel', region: { left: 5, top: 6, width: 7, height: 8 }, mode: 'changed', settleSamples: 4, minChangedPixels: 9, timeoutMs: 6000 });
    assert.deepEqual(calls[0].params.region, { left: 1, top: 2, width: 3, height: 4 });
    assert.equal(calls[0].params.savePath, 'E:\\shots\\w.png');
    assert.equal(calls[0].params.detail, 'compact');
  } finally { await backend.dispose(); }
});

function fixture(onObserve) {
  const b = new FakeBackend(), a = authority(), s = scope();
  const c = new Controller(b, a, settings, () => 1);
  return { b, a, s, c };
}
async function open(f) {
  await f.c.execute(f.s, 'mk_control', { action: 'begin' }, signal());
  const t = await f.c.execute(f.s, 'mk_observe', { mode: 'targets' }, signal());
  return t.targets[0].target;
}

test('[AC-WAIT-01] a hit returns the fresh observation with the real wait duration', async () => {
  const f = fixture();
  f.b.observe = async () => { const value = observation(); value.durationMs = 1400; value.waitFor = { kind: 'text', matched: true, waitedMs: 1400, timeoutMs: 5000 }; return structuredClone(value); };
  try {
    const target = await open(f);
    const result = await f.c.execute(f.s, 'mk_observe', { mode: 'window', target, waitFor: { kind: 'text', value: 'All built.' } }, signal());
    assert.equal(result.waitFor.matched, true);
    assert.equal(result.waitFor.waitedMs, 1400);
    assert.equal(result.durationMs, 1400);
    assert.equal(result.error, undefined);
    assert.equal(result.execution, undefined, 'a successful observation keeps the 0.3.x payload shape');
    assert.equal(typeof result.snapshot, 'string');
  } finally { await f.c.dispose(); }
});

test('[AC-WAIT-02] a timeout is a not-sent receipt that still carries the last observation', async () => {
  const f = fixture();
  f.b.observe = async () => {
    const value = observation();
    value.durationMs = 8000;
    value.waitFor = { kind: 'pixel', matched: false, waitedMs: 8000, timeoutMs: 8000 };
    value.error = { code: 'OBSERVATION_TIMEOUT', message: 'The wait condition did not hold.', details: { stage: 'observation', check: 'wait-timeout', waitedMs: 8000, requiredAction: 'reobserve' } };
    return structuredClone(value);
  };
  try {
    const target = await open(f);
    const result = await f.c.execute(f.s, 'mk_observe', { mode: 'window', target, waitFor: { kind: 'pixel', region: pixel.region, mode: 'stable', timeoutMs: 8000 } }, signal());
    assert.equal(result.execution, 'not_sent');
    assert.equal(result.requiredAction, 'reobserve');
    assert.equal(result.retryable, false);
    assert.equal(result.error.code, 'OBSERVATION_TIMEOUT');
    assert.equal(result.waitFor.matched, false);
    assert.ok(Array.isArray(result.elements) && result.elements.length > 0, 'the last observation must still be readable');
    assert.equal(typeof result.fingerprint, 'string');
  } finally { await f.c.dispose(); }
});

test('[AC-WAIT-04] the canvas has no text channel; kind:text is documented as timing out there, pixel is the canvas channel', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const spec = readFileSync(new URL('../spec.md', import.meta.url), 'utf8');
  const line = /kind:text 对画布无效，画布用 kind:pixel/;
  assert.match(readme, line);
  assert.match(spec, /画布（`ControlType\.Image`）没有文本节点/);
});

test('[AC-WAIT-06] the native comparator distinguishes stable frames from >=64 changed pixels', async () => {
  const receipt = await helperSelfTest();
  assert.equal(receipt.ok, true);
  assert.equal(receipt.desktopObserved, false);
  assert.equal(receipt.inputSent, false);
  assert.ok(receipt.waitFor, 'the self-test must report waitFor comparator counters');
  assert.equal(receipt.waitFor.stable, true);
  assert.equal(receipt.waitFor.changed, true);
  assert.equal(receipt.waitFor.textMatch, true);
  assert.equal(receipt.waitFor.elementMatch, true);
});
