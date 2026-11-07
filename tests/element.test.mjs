// AC-ELEM-01 / AC-ELEM-02 / AC-ELEM-03: FR-07 locate by accessible name + role.
// Pure host-side parsing and recovery, the real native matcher counters, and the host rule
// that a text-only model may still click by name (no guessed pixels).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, diagnosticDetails, MkError } from '../lib/contracts.js';
import { Controller } from '../lib/core.js';
import { FakeBackend, authority, scope, signal, settings } from './fixture.mjs';
import { helperSelfTest } from './helper-selftest.mjs';

const base = { action: 'click', target: 't', snapshot: 's' };

test('[AC-ELEM-01] elementName/elementRole/elementExact parse and are mutually exclusive with element and x/y', () => {
  assert.deepEqual(parseRequest('mk_mouse', { ...base, elementName: '命令行' }), { tool: 'mk_mouse', ...base, elementName: '命令行' });
  const withRole = parseRequest('mk_mouse', { ...base, elementName: '命令行', elementRole: 'TabItem', elementExact: true });
  assert.equal(withRole.elementRole, 'TabItem');
  assert.equal(withRole.elementExact, true);
  assert.throws(() => parseRequest('mk_mouse', { ...base, elementName: 'a', element: 'ref' }), e => e.code === 'INVALID_ARGUMENT');
  assert.throws(() => parseRequest('mk_mouse', { ...base, elementName: 'a', x: 1, y: 2 }), e => e.code === 'INVALID_ARGUMENT');
  assert.throws(() => parseRequest('mk_mouse', { ...base, elementRole: 'TabItem' }), e => e.code === 'INVALID_ARGUMENT');
  assert.throws(() => parseRequest('mk_mouse', { ...base, elementExact: true }), e => e.code === 'INVALID_ARGUMENT');
  assert.throws(() => parseRequest('mk_mouse', { ...base, elementName: 'a', elementExact: 'yes' }), e => e.code === 'INVALID_ARGUMENT');
});

test('[AC-ELEM-02] ambiguous targets expose at most 8 bounded candidates and never editor text', () => {
  const candidates = Array.from({ length: 8 }, (_, i) => ({ ref: 'r' + i, name: 'Button ' + i, role: 'Button' }));
  const details = diagnosticDetails({ stage: 'element-validation', check: 'element-ambiguous', candidates });
  assert.equal(details.candidates.length, 8);
  assert.deepEqual(Object.keys(details.candidates[0]).sort(), ['name', 'ref', 'role']);
  assert.throws(() => diagnosticDetails({ candidates: [...candidates, { ref: 'x', name: 'y', role: 'z' }] }), e => e.code === 'PROTOCOL_ERROR');
  assert.throws(() => diagnosticDetails({ candidates: [{ ref: 'x', name: 'y' }] }), e => e.code === 'PROTOCOL_ERROR');
  assert.throws(() => diagnosticDetails({ candidates: [{ ref: 'x', name: 'n'.repeat(129), role: 'z' }] }), e => e.code === 'PROTOCOL_ERROR');
  assert.throws(() => diagnosticDetails({ candidates: [{ ref: 'x', name: 'y', role: 'z', value: 'secret' }] }), e => e.code === 'PROTOCOL_ERROR');
  const error = new MkError('AMBIGUOUS_TARGET', 'Two candidates.', 'not_sent');
  assert.equal(error.retryable, false);
  assert.equal(error.requiredAction, 'reobserve');
});

test('[AC-ELEM-03] a missing name is a retryable, definitely-not-sent failure', () => {
  const error = new MkError('ELEMENT_NOT_FOUND', 'No match.', 'not_sent');
  assert.equal(error.retryable, true);
  assert.equal(error.requiredAction, 'reobserve');
});

test('[AC-ELEM-01] a text-only caller may click by observed name even when it has no image', async () => {
  const b = new FakeBackend(), a = authority(), s = scope();
  const c = new Controller(b, a, settings, () => 1);
  let seen;
  b.act = async (_run, _w, _o, request) => { seen = request; return { execution: 'sent', verification: 'unverified', observation: null }; };
  try {
    await c.execute(s, 'mk_control', { action: 'begin' }, signal());
    const t = await c.execute(s, 'mk_observe', { mode: 'targets' }, signal());
    const target = t.targets[0].target;
    const o = await c.execute(s, 'mk_observe', { mode: 'window', target }, signal());
    const receipt = await c.execute(s, 'mk_mouse', { target, snapshot: o.snapshot, action: 'click', elementName: 'Editor' }, signal());
    assert.equal(receipt.execution, 'sent');
    assert.equal(seen.elementName, 'Editor');
    // Coordinate clicks still demand the image; name lookups do not.
    const o2 = await c.execute(s, 'mk_observe', { mode: 'window', target }, signal());
    await assert.rejects(c.execute(s, 'mk_mouse', { target, snapshot: o2.snapshot, action: 'click', x: 1, y: 2 }, signal()), e => e.code === 'HOST_CAPABILITY_MISSING');
  } finally { await c.dispose(); }
});

test('[AC-ELEM-01] the native matcher really resolves unique/ambiguous/missing names', async () => {
  const receipt = await helperSelfTest();
  assert.equal(receipt.ok, true);
  assert.equal(receipt.desktopObserved, false);
  assert.equal(receipt.inputSent, false);
  assert.ok(receipt.elements, 'the self-test must report element matcher counters');
  assert.equal(receipt.elements.unique, true);
  assert.equal(receipt.elements.ambiguous, true);
  assert.equal(receipt.elements.notFound, true);
  assert.ok(Number.isSafeInteger(receipt.elements.candidates));
  assert.ok(receipt.elements.candidates <= 8, 'candidate details stay bounded to 8');
});
