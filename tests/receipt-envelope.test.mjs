// E3 / FR-12.3: the receipt envelope always owns `observation` (value or null).
// Runtime-only assertions: the PTC/SDK type is Observation|null; tests see the real value.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../lib/core.js';
import {FakeBackend,authority,scope,signal,settings} from './fixture.mjs';

const fixture=()=>{const b=new FakeBackend(),a=authority(),s=scope();let now=1;const c=new Controller(b,a,settings,()=>now);return {b,a,s,c,advance:n=>now+=n};};
async function open(f){await f.c.execute(f.s,'mk_control',{action:'begin'},signal());const t=await f.c.execute(f.s,'mk_observe',{mode:'targets'},signal());const target=t.targets[0].target;const o=await f.c.execute(f.s,'mk_observe',{mode:'window',target},signal());return {target,snapshot:o.snapshot};}
// AC-RCPT-03 shape rule: an own key whose type is Observation or null, never undefined.
function ownObservation(receipt,expected){
  assert.equal(Object.hasOwn(receipt,'observation'),true,'envelope receipt must own observation');
  assert.notEqual(typeof receipt.observation,'undefined','observation must never be undefined');
  if(expected==null)assert.equal(receipt.observation,null);
  else {assert.notEqual(receipt.observation,null);assert.equal(typeof receipt.observation,'object');}
  return receipt;
}

test('[E3 AC-RCPT-01] every controller envelope owns observation: control, targets, mouse success, keyboard failure',{timeout:15000},async()=>{
  const f=fixture();
  try {
    ownObservation(await f.c.execute(f.s,'mk_control',{action:'begin'},signal()),null);
    ownObservation(await f.c.execute(f.s,'mk_control',{action:'status'},signal()),null);
    const targets=ownObservation(await f.c.execute(f.s,'mk_observe',{mode:'targets'},signal()),null);
    const target=targets.targets[0].target;
    const shot=await f.c.execute(f.s,'mk_observe',{mode:'window',target},signal());
    assert.equal(typeof shot.snapshot,'string'); // window mode keeps the 0.3.2 payload shape, not a second key
    const click=ownObservation(await f.c.execute(f.s,'mk_mouse',{target,snapshot:shot.snapshot,action:'click',element:'edit'},signal()),'object');
    assert.equal(click.execution,'sent');assert.equal(typeof click.observation.snapshot,'string');
    const shot2=await f.c.execute(f.s,'mk_observe',{mode:'window',target},signal());
    f.b.act=async()=>({execution:'sent',verification:'mismatch',error:{code:'STATE_CHANGED',message:'Focus moved after input.'}});
    const failed=ownObservation(await f.c.execute(f.s,'mk_keyboard',{target,snapshot:shot2.snapshot,action:'type',text:'x'},signal()),null);
    assert.equal(failed.execution,'sent');assert.equal(failed.error.code,'STATE_CHANGED');assert.equal(failed.requiredAction,'reobserve');
    ownObservation(await f.c.execute(f.s,'mk_control',{action:'end'},signal()),null);
  } finally {await f.c.dispose();}
});

test('[E3 AC-RCPT-02] a failed post-observation keeps execution sent with observation null and observationError',{timeout:15000},async()=>{
  const f=fixture();
  try {
    const op=await open(f);
    f.b.act=async()=>({execution:'sent',verification:'unverified',observationError:{code:'OBSERVATION_TIMEOUT',message:'Post-action capture timed out.'}});
    const r=ownObservation(await f.c.execute(f.s,'mk_keyboard',{...op,action:'type',text:'x'},signal()),null);
    assert.equal(r.execution,'sent');assert.equal(r.verification,'unverified');
    assert.deepEqual(r.observationError,{code:'OBSERVATION_TIMEOUT',message:'Post-action capture timed out.'});
    assert.equal(r.retryable,false);assert.equal(r.requiredAction,'reobserve');
  } finally {await f.c.dispose();}
});

test('[E3 AC-RCPT-03] a native receipt that omits observation is normalised to null, never undefined',{timeout:15000},async()=>{
  const f=fixture();
  try {
    const op=await open(f);
    f.b.act=async()=>({execution:'sent',verification:'verified'}); // no observation key at all
    const r=ownObservation(await f.c.execute(f.s,'mk_keyboard',{...op,action:'type',text:'x'},signal()),null);
    assert.equal(r.verification,'verified');assert.equal(r.requiredAction,'none');
    assert.equal(Object.keys(r).includes('observation'),true);
    assert.equal(JSON.stringify(r).includes('"observation":null'),true);
  } finally {await f.c.dispose();}
});
