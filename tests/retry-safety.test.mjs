// E4 / FR-12.4: retry safety. A failure after the input was sent is never retryable and
// is never reported as not_sent; only definitely-not-sent transient failures may retry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../lib/core.js';
import {MkError,recovery,ERROR_CODES} from '../lib/contracts.js';
import {FakeBackend,authority,scope,signal,settings} from './fixture.mjs';

const STOP_CODES=['USER_STOPPED','CONTROL_CLOSE_FAILED','PROTOCOL_ERROR','HELPER_TIMEOUT'];
const fixture=()=>{const b=new FakeBackend(),a=authority(),s=scope();let now=1;const c=new Controller(b,a,settings,()=>now);return {b,a,s,c,advance:n=>now+=n};};
async function open(f){await f.c.execute(f.s,'mk_control',{action:'begin'},signal());const t=await f.c.execute(f.s,'mk_observe',{mode:'targets'},signal());const target=t.targets[0].target;const o=await f.c.execute(f.s,'mk_observe',{mode:'window',target},signal());return {target,snapshot:o.snapshot};}

test('[E4 AC-RCPT-05] sent + STATE_CHANGED is never retryable, maps to reobserve, and stays sent',{timeout:15000},async()=>{
  assert.deepEqual(recovery('STATE_CHANGED','sent','mismatch'),{retryable:false,requiredAction:'reobserve'});
  const derived=new MkError('STATE_CHANGED','Focus moved after input.','sent');
  assert.equal(derived.retryable,false);assert.equal(derived.requiredAction,'reobserve');assert.equal(derived.execution,'sent');
  const f=fixture();
  try {
    const op=await open(f);
    f.b.act=async()=>({execution:'sent',verification:'mismatch',observation:null,error:{code:'STATE_CHANGED',message:'Focus moved after input.'}});
    const r=await f.c.execute(f.s,'mk_keyboard',{...op,action:'type',text:'x'},signal());
    assert.equal(r.execution,'sent');assert.notEqual(r.execution,'not_sent');
    assert.equal(r.retryable,false);assert.equal(r.requiredAction,'reobserve');assert.equal(r.error.code,'STATE_CHANGED');
  } finally {await f.c.dispose();}
});

test('[E4 AC-RCPT-06] pre-send USER_BUSY and STALE_SNAPSHOT stay retryable with reobserve',{timeout:15000},async()=>{
  for(const code of ['USER_BUSY','STALE_SNAPSHOT']){
    assert.deepEqual(recovery(code,'not_sent'),{retryable:true,requiredAction:'reobserve'});
    const derived=new MkError(code,'Synthetic transient refusal.','not_sent');
    assert.equal(derived.retryable,true);assert.equal(derived.requiredAction,'reobserve');assert.equal(derived.execution,'not_sent');
  }
  assert.deepEqual(recovery('INVALID_COORDINATE','not_sent'),{retryable:true,requiredAction:'reobserve'}); // FR-05.1
  const f=fixture();
  try {
    const op=await open(f);
    f.advance(30001); // the real controller rejects the reused snapshot before calling act
    await assert.rejects(f.c.execute(f.s,'mk_mouse',{...op,action:'click',element:'edit'},signal()),e=>e.code==='STALE_SNAPSHOT'&&e.retryable===true&&e.requiredAction==='reobserve'&&e.execution==='not_sent');
    f.b.observe=async()=>{throw new MkError('USER_BUSY','Human activity in progress.','not_sent');};
    await assert.rejects(f.c.execute(f.s,'mk_observe',{mode:'window',target:op.target},signal()),e=>e.code==='USER_BUSY'&&e.retryable===true&&e.requiredAction==='reobserve'&&e.execution==='not_sent');
  } finally {await f.c.dispose();}
});

test('[E4 AC-RCPT-07] USER_STOPPED and CONTROL_CLOSE_FAILED require stop and are never retryable',{timeout:15000},async()=>{
  for(const code of ['USER_STOPPED','CONTROL_CLOSE_FAILED']){
    assert.deepEqual(recovery(code,'not_sent'),{retryable:false,requiredAction:'stop'});
    const derived=new MkError(code,'Synthetic terminal failure.','not_sent');
    assert.equal(derived.retryable,false);assert.equal(derived.requiredAction,'stop');
  }
  const f=fixture();
  try {
    const begin=await f.c.execute(f.s,'mk_control',{action:'begin'},signal());
    f.b.onStop('USER_STOPPED',begin.run);await new Promise(r=>setImmediate(r));
    const halted=await f.c.execute(f.s,'mk_control',{action:'status'},signal());
    assert.equal(halted.requiredAction,'stop');assert.equal(halted.retryable,false);
    await assert.rejects(f.c.execute(f.s,'mk_control',{action:'begin'},signal()),e=>e.code==='USER_STOPPED'&&e.requiredAction==='stop'&&e.retryable===false);
    await f.c.execute(f.s,'mk_control',{action:'end'},signal());
  } finally {await f.c.dispose();}
  const g=fixture();
  try {
    await g.c.execute(g.s,'mk_control',{action:'begin'},signal());
    g.b.failure={method:'end',code:'CONTROL_CLOSE_FAILED'};
    const r=await g.c.execute(g.s,'mk_control',{action:'end'},signal());
    assert.equal(r.controlState,'faulted');assert.equal(r.inputReleased,false);
    assert.equal(r.error.code,'CONTROL_CLOSE_FAILED');assert.equal(r.requiredAction,'stop');assert.equal(r.retryable,false);
  } finally {g.b.failure=null;await g.c.dispose();}
});

test('[E4 AC-RCPT-05/06/07] execution=unknown never retries, MkError derives the same advice, post-send is never not_sent',{timeout:15000},async()=>{
  assert.deepEqual(recovery(undefined,'unknown'),{retryable:false,requiredAction:'wait'});
  assert.deepEqual(recovery('STATE_CHANGED','unknown'),{retryable:false,requiredAction:'reobserve'});
  for(const code of [undefined,...ERROR_CODES.filter(c=>!STOP_CODES.includes(c))]){
    const advice=recovery(code,'unknown');
    assert.equal(advice.retryable,false,`${code}/unknown must never retry`);
    assert.ok(advice.requiredAction==='wait'||advice.requiredAction==='reobserve',`${code}/unknown -> ${advice.requiredAction}`);
  }
  const ALLOWED=['none','reobserve','wait','rebegin','stop'];
  for(const code of [undefined,...ERROR_CODES])for(const execution of ['sent','partially_sent','unknown']){
    const advice=recovery(code,execution);
    assert.equal(advice.retryable,false,`${code}/${execution} must never be retryable`);
    assert.ok(ALLOWED.includes(advice.requiredAction),`${code}/${execution} -> ${advice.requiredAction}`);
  }
  for(const code of ERROR_CODES)for(const execution of ['not_sent','sent','partially_sent','unknown']){
    const error=new MkError(code,'Synthetic.',execution),advice=recovery(code,execution);
    assert.equal(error.execution,execution);
    assert.equal(error.retryable,advice.retryable,`${code}/${execution}`);
    assert.equal(error.requiredAction,advice.requiredAction,`${code}/${execution}`);
    if(execution!=='not_sent')assert.notEqual(error.execution,'not_sent');
  }
  const f=fixture();
  try {
    const op=await open(f);
    f.b.act=async()=>({execution:'unknown',verification:'unverified'});
    const r=await f.c.execute(f.s,'mk_keyboard',{...op,action:'type',text:'x'},signal());
    assert.equal(r.execution,'unknown');assert.notEqual(r.execution,'not_sent');
    assert.equal(r.retryable,false);assert.equal(r.requiredAction,'wait');
  } finally {await f.c.dispose();}
});
