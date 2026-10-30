import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../lib/core.js';
import {DEFAULTS,decodeSettings,MkError} from '../lib/contracts.js';
import {FakeBackend,authority,scope,signal,deferred} from './fixture.mjs';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,config={}){t.mock.timers.enable({apis:['setTimeout']});const b=new FakeBackend(),a=authority(),s=scope();let now=0;const c=new Controller(b,a,()=>decodeSettings(config),()=>now);return {b,a,s,c,tick(ms){now+=ms;t.mock.timers.tick(ms);}};}
test('old persisted config keeps explicit settings and receives only missing new defaults',()=>{
 const old={enabled:false,snapshotTtlMs:10000,maxElements:50};const value=decodeSettings(old);
 assert.equal(value.enabled,false);assert.equal(value.snapshotTtlMs,10000);assert.equal(value.controlIdleMs,300000);
 assert.equal(DEFAULTS.snapshotTtlMs,30000);
 for(const settings of [{snapshotTtlMs:60001},{controlIdleMs:0},{controlIdleMs:59999},{controlIdleMs:900001}])assert.throws(()=>decodeSettings(settings));
 assert.equal(decodeSettings({controlIdleMs:60000,snapshotTtlMs:60000}).controlIdleMs,60000);
});
test('default idle survives 60 seconds; status and invalid requests cannot extend five-minute lease',async t=>{
 const f=fixture(t);try{
  await f.c.execute(f.s,'mk_control',{action:'begin'},signal());f.tick(60000);
  assert.equal((await f.c.execute(f.s,'mk_control',{action:'status'},signal())).controlState,'ready');
  f.tick(239999);await assert.rejects(f.c.execute(f.s,'mk_observe',{mode:'window',target:'bad'},signal()),e=>e.code==='TARGET_CHANGED');
  assert.equal((await f.c.execute(f.s,'mk_control',{action:'status'},signal())).controlState,'ready');
  f.tick(1);await settle();const closed=await f.c.execute(f.s,'mk_control',{action:'status'},signal());
  assert.equal(closed.controlState,'closed');assert.equal(closed.inputReleased,true);assert.equal(f.a.stopped,false);
  assert.equal((await f.c.execute(f.s,'mk_control',{action:'begin'},signal())).controlState,'ready');
 }finally{await f.c.dispose();}
});
test('only successful desktop requests refresh configured idle and renewal does not reuse snapshots',async t=>{
 const f=fixture(t,{controlIdleMs:60000});try{
  await f.c.execute(f.s,'mk_control',{action:'begin'},signal());f.tick(59999);
  await f.c.execute(f.s,'mk_observe',{mode:'targets'},signal());f.tick(59999);
  assert.equal((await f.c.execute(f.s,'mk_control',{action:'status'},signal())).controlState,'ready');
  f.tick(1);await settle();assert.equal((await f.c.execute(f.s,'mk_control',{action:'status'},signal())).controlState,'closed');
 }finally{await f.c.dispose();}
});
test('an active bounded desktop request completes before idle is judged; failed work does not renew',async t=>{
 const f=fixture(t,{controlIdleMs:60000});try{
  await f.c.execute(f.s,'mk_control',{action:'begin'},signal());f.tick(59999);
  const d=deferred();f.b.delays.targets=d;const pending=f.c.execute(f.s,'mk_observe',{mode:'targets'},signal());
  const failure=assert.rejects(pending);await settle();f.tick(1000);assert.equal(f.b.calls.includes('end'),false);
  d.reject(new MkError('TARGET_GONE','Synthetic recoverable rejection'));await failure;f.tick(100);await settle();
  assert.equal((await f.c.execute(f.s,'mk_control',{action:'status'},signal())).controlState,'closed');
 }finally{await f.c.dispose();}
});
test('a snapshot after 10 seconds can act under the new default but cannot bypass configured expiry',async t=>{
 const f=fixture(t);try{
  await f.c.execute(f.s,'mk_control',{action:'begin'},signal());const targets=await f.c.execute(f.s,'mk_observe',{mode:'targets'},signal());const target=targets.targets[0].target;
  let o=await f.c.execute(f.s,'mk_observe',{mode:'window',target},signal());f.tick(10001);
  assert.equal((await f.c.execute(f.s,'mk_mouse',{target,snapshot:o.snapshot,action:'click',element:'edit'},signal())).execution,'sent');
  o=await f.c.execute(f.s,'mk_observe',{mode:'window',target},signal());f.tick(30001);
  const before=f.b.calls.filter(x=>x==='act').length;await assert.rejects(f.c.execute(f.s,'mk_keyboard',{target,snapshot:o.snapshot,action:'type',text:'x'},signal()),e=>e.code==='STALE_SNAPSHOT');
  assert.equal(f.b.calls.filter(x=>x==='act').length,before);
 }finally{await f.c.dispose();}
});
test('a definitely-not-sent cooperative rejection cannot renew idle through a successful protocol receipt',async t=>{
 const f=fixture(t,{controlIdleMs:60000});try{
  await f.c.execute(f.s,'mk_control',{action:'begin'},signal());const targets=await f.c.execute(f.s,'mk_observe',{mode:'targets'},signal());const target=targets.targets[0].target;
  f.tick(40000);const o=await f.c.execute(f.s,'mk_observe',{mode:'window',target},signal());f.tick(20000);
  f.b.act=async()=>({execution:'not_sent',verification:'unverified',error:{code:'USER_BUSY',message:'Yield.'}});
  await f.c.execute(f.s,'mk_keyboard',{target,snapshot:o.snapshot,action:'type',text:'x'},signal());
  f.tick(40000);await settle();assert.equal((await f.c.execute(f.s,'mk_control',{action:'status'},signal())).controlState,'closed');
 }finally{await f.c.dispose();}
});
