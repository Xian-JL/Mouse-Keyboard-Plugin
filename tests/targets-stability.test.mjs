// F2 / 0.4.0-dev.2: mk_observe targets is discovery, not a target change.
// Repeated discovery must keep tokens for windows still present, drop tokens for absent
// windows, leave an already returned snapshot valid (still single-use/TTL bound), and never
// let a new or reappearing window alias an old token.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../lib/core.js';
import {FakeBackend,identity,authority,scope,signal,settings} from './fixture.mjs';

const fixture=()=>{const b=new TargetsBackend(),a=authority(),s=scope();let now=1;const c=new Controller(b,a,settings,()=>now);return {b,a,s,c,advance:n=>now+=n};};
const begin=f=>f.c.execute(f.s,'mk_control',{action:'begin'},signal());
const targets=f=>f.c.execute(f.s,'mk_observe',{mode:'targets'},signal());
const observe=(f,target)=>f.c.execute(f.s,'mk_observe',{mode:'window',target},signal());
const token=(list,title)=>list.targets.find(t=>t.title===title)?.target;
const window=(hwnd,title)=>({...identity(),hwnd,title});

// Discovery backend: the Lead-visible window list changes between calls; observe/act behave
// like FakeBackend. The fixture's wait() bookkeeping (calls/delays/failure/abort) is reused.
class TargetsBackend extends FakeBackend {
  windows=[];
  async targets(run,q,signal){await this.wait('targets',signal);return {windows:this.windows.map(w=>structuredClone(w)),total:this.windows.length,truncated:false};}
}

test('[F2] repeated targets keeps the token for a window still present; the first token still reaches the backend',{timeout:15000},async()=>{
  const f=fixture(),alpha=window('aaa','Alpha');f.b.windows=[alpha];
  try {
    await begin(f);
    const t1=token(await targets(f),'Alpha');
    assert.equal(typeof t1,'string');
    // Same hwnd+pid+created, but title/foreground/rect moved: it is still the same window.
    f.b.windows=[{...alpha,title:'Alpha (renamed)',foreground:false,rect:{...alpha.rect,left:-150}}];
    const second=await targets(f);
    assert.equal(second.targets.length,1);
    assert.equal(token(second,'Alpha (renamed)'),t1);
    const snap=await observe(f,t1);
    const r=await f.c.execute(f.s,'mk_mouse',{target:t1,snapshot:snap.snapshot,action:'click',element:'edit'},signal());
    assert.equal(r.execution,'sent');assert.equal(r.target,t1);
    assert.equal(f.b.acts.length,1);assert.equal(f.b.acts[0].element,'edit');
  } finally {await f.c.dispose();}
});

test('[F2] a window absent from the refreshed list loses its token; acting on it is TARGET_CHANGED with no act',{timeout:15000},async()=>{
  const f=fixture(),alpha=window('aaa','Alpha'),bravo=window('bbb','Bravo');f.b.windows=[alpha,bravo];
  try {
    await begin(f);
    const first=await targets(f);
    const tokenA=token(first,'Alpha'),tokenB=token(first,'Bravo');
    assert.equal(typeof tokenA,'string');assert.notEqual(tokenA,tokenB);
    const snap=await observe(f,tokenA);
    f.b.windows=[bravo]; // Alpha disappears from discovery
    const second=await targets(f);
    assert.equal(second.targets.length,1);
    assert.equal(second.targets[0].target,tokenB);
    assert.equal(second.targets.some(t=>t.target===tokenA),false);
    const before=f.b.calls.filter(c=>c==='act').length;
    await assert.rejects(f.c.execute(f.s,'mk_mouse',{target:tokenA,snapshot:snap.snapshot,action:'click',element:'edit'},signal()),e=>e.code==='TARGET_CHANGED');
    assert.equal(f.b.calls.filter(c=>c==='act').length,before);
  } finally {await f.c.dispose();}
});

test('[F2] a snapshot taken before repeated targets stays usable and is still single-use',{timeout:15000},async()=>{
  const f=fixture();f.b.windows=[window('aaa','Alpha')];
  try {
    await begin(f);
    const t=token(await targets(f),'Alpha');
    const snap=await observe(f,t);
    const again=await targets(f);
    assert.equal(token(again,'Alpha'),t); // discovery did not invalidate the token
    const r=await f.c.execute(f.s,'mk_mouse',{target:t,snapshot:snap.snapshot,action:'click',element:'edit'},signal());
    assert.equal(r.execution,'sent');assert.equal(f.b.acts.length,1);
    // Discovery keeps the token, but the snapshot itself is still consumed exactly once.
    await assert.rejects(f.c.execute(f.s,'mk_mouse',{target:t,snapshot:snap.snapshot,action:'click',element:'edit'},signal()),e=>e.code==='STALE_SNAPSHOT');
    assert.equal(f.b.acts.length,1);
  } finally {await f.c.dispose();}
});

test('[F2] new windows get fresh tokens, absent windows are dropped and reappearing windows never alias old tokens',{timeout:15000},async()=>{
  const f=fixture(),alpha=window('aaa','Alpha'),bravo=window('bbb','Bravo');f.b.windows=[alpha];
  try {
    await begin(f);
    const tokenA1=token(await targets(f),'Alpha');
    f.b.windows=[alpha,bravo];
    const second=await targets(f);
    const tokenB=token(second,'Bravo');
    assert.equal(token(second,'Alpha'),tokenA1);assert.notEqual(tokenB,tokenA1);assert.equal(typeof tokenB,'string');
    f.b.windows=[bravo]; // Alpha is gone: its token must be dropped
    const third=await targets(f);
    assert.deepEqual(third.targets.map(t=>t.target),[tokenB]);
    f.b.windows=[alpha,bravo]; // Alpha reappears: this is a discovery of a newly listed window
    const fourth=await targets(f);
    const tokenA2=token(fourth,'Alpha');
    assert.equal(token(fourth,'Bravo'),tokenB);
    assert.notEqual(tokenA2,tokenA1);assert.notEqual(tokenA2,tokenB);
  } finally {await f.c.dispose();}
});
