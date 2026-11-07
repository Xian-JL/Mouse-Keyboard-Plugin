// E1 / FR-12.1: text delivery is asynchronous; a following Enter must not overtake it.
// The simulated backend books input units into a ledger in target-consumption order and
// only waits for the whole stream when the request carries settleMs. No desktop is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../lib/core.js';
import {FakeBackend,authority,scope,signal,settings} from './fixture.mjs';

const CHUNK=200; // native sends 32-char blocks; the simulation only needs several async units
const tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fixture=()=>{const b=new DeliveryBackend(),a=authority(),s=scope();let now=1;const c=new Controller(b,a,settings,()=>now);return {b,a,s,c,advance:n=>now+=n};};
async function open(f){await f.c.execute(f.s,'mk_control',{action:'begin'},signal());const t=await f.c.execute(f.s,'mk_observe',{mode:'targets'},signal());const target=t.targets[0].target;const o=await f.c.execute(f.s,'mk_observe',{mode:'window',target},signal());return {target,snapshot:o.snapshot};}

// Arrival order = target-consumption order. `type` streams chunks asynchronously and only
// the settleMs path holds the act receipt until the stream has landed (plus the settle wait).
class DeliveryBackend extends FakeBackend {
  ledger=[];field='';lastReceipt=null;lastTypeReceipt=null;
  async act(run,w,observation,request,signal){
    this.acts.push(structuredClone(request));
    if(request.tool==='mk_keyboard'){
      if(request.action==='type'){
        const chunks=[];for(let i=0;i<request.text.length;i+=CHUNK)chunks.push(request.text.slice(i,i+CHUNK));
        const deliver=(async()=>{for(const chunk of chunks){await tick(1);this.ledger.push({kind:'text',value:chunk});this.field+=chunk;}})();
        const settleMs=request.settleMs??0;
        if(settleMs>0)await deliver;
        const settleStart=performance.now();
        if(settleMs>0)await tick(settleMs);
        const settledMs=settleMs>0?Math.round(performance.now()-settleStart):0;
        return this.lastTypeReceipt=this.lastReceipt={execution:'sent',verification:this.field===request.text?'verified':'unverified',observation:structuredClone(this.value),deliveredAt:new Date().toISOString(),settledMs};
      }
      this.ledger.push({kind:'key',value:request.key});
      return this.lastReceipt={execution:'sent',verification:'unverified',observation:structuredClone(this.value),deliveredAt:new Date().toISOString(),settledMs:0};
    }
    return this.lastReceipt={execution:'sent',verification:'unverified',observation:structuredClone(this.value),deliveredAt:new Date().toISOString(),settledMs:0};
  }
}

test('[E1 AC-INPUT-01] settleMs holds the receipt until async delivery lands, so the whole 2000-char text is booked before the following Enter',{timeout:15000},async()=>{
  const f=fixture();
  try {
    const text='x'.repeat(2000-33)+'wc -l src/interrupt/Exception.cpp';assert.equal(text.length,2000);
    const op=await open(f);
    const run=await f.c.execute(f.s,'mk_keyboard',{...op,action:'type',text,settleMs:10,paceMs:2,inputMode:'unicode'},signal());
    const typeRequest=f.b.acts[0];
    // The parsed request reaches the backend verbatim: settleMs/paceMs/inputMode unchanged.
    assert.deepEqual({settleMs:typeRequest.settleMs,paceMs:typeRequest.paceMs,inputMode:typeRequest.inputMode},{settleMs:10,paceMs:2,inputMode:'unicode'});
    const typeReceipt=f.b.lastTypeReceipt;
    assert.ok(typeReceipt.settledMs>0,`settledMs must be positive, got ${typeReceipt.settledMs}`);
    assert.equal(run.settledMs,typeReceipt.settledMs);assert.ok(run.settledMs>0);
    assert.equal(run.deliveredAt,typeReceipt.deliveredAt);assert.ok(Number.isFinite(Date.parse(run.deliveredAt)));
    assert.equal(run.execution,'sent');assert.equal(run.verification,'verified');
    // A fresh snapshot is required for the follow-up action, exactly like the real tool contract.
    const between=await open(f);
    await f.c.execute(f.s,'mk_keyboard',{...between,action:'key',key:'Enter',settleMs:1},signal());
    const textUnits=f.b.ledger.filter(u=>u.kind==='text');
    assert.equal(textUnits.map(u=>u.value).join(''),text); // no truncated tail
    const enterAt=f.b.ledger.findIndex(u=>u.kind==='key');
    assert.ok(enterAt>0,`Enter must be booked after the text, ledger=${JSON.stringify(f.b.ledger.map(u=>u.kind))}`);
    assert.equal(f.b.ledger[enterAt].value,'Enter');
    assert.equal(f.b.ledger.slice(enterAt+1).some(u=>u.kind==='text'),false); // no glued command tail
    assert.equal(f.b.ledger.filter(u=>u.kind==='key').length,1);
  } finally {await f.c.dispose();}
});

test('[E1 AC-INPUT-02] the settleMs=0 default still forwards defaults verbatim and reports the backend verdict',{timeout:15000},async()=>{
  const f=fixture();
  try {
    const op=await open(f);
    const run=await f.c.execute(f.s,'mk_keyboard',{...op,action:'type',text:'pwd'},signal());
    const request=f.b.acts[0],receipt=f.b.lastTypeReceipt;
    assert.equal(request.settleMs,undefined); // absent means the native default 0
    assert.equal(request.paceMs,0);
    assert.equal(request.inputMode,'auto');
    assert.equal(run.execution,receipt.execution);
    assert.equal(run.verification,receipt.verification); // the verdict is the backend's, not a host constant
    assert.equal(run.settledMs,receipt.settledMs);assert.equal(run.settledMs,0);
    assert.equal(run.deliveredAt,receipt.deliveredAt);assert.ok(Number.isFinite(Date.parse(run.deliveredAt)));
    // Negative control for E1: without a settle wait the follow-up Enter is booked before
    // the asynchronous text stream reaches the ledger, which is the real-world truncation race.
    const between=await open(f);
    await f.c.execute(f.s,'mk_keyboard',{...between,action:'key',key:'Enter',settleMs:0},signal());
    assert.equal(f.b.ledger[0]?.kind,'key');assert.equal(f.b.ledger[0]?.value,'Enter');
    assert.equal(f.b.ledger.some(u=>u.kind==='text'),false);
  } finally {await f.c.dispose();}
});

test('[E1 AC-INPUT-02] an explicit settleMs=0 is forwarded as 0 and keeps the backend verdict',{timeout:15000},async()=>{
  const f=fixture();
  try {
    const op=await open(f);
    const run=await f.c.execute(f.s,'mk_keyboard',{...op,action:'type',text:'pwd',settleMs:0},signal());
    const request=f.b.acts[0],receipt=f.b.lastTypeReceipt;
    assert.equal(request.settleMs,0);assert.equal(request.paceMs,0);assert.equal(request.inputMode,'auto');
    assert.equal(run.execution,receipt.execution);assert.equal(run.verification,receipt.verification);
    assert.equal(run.settledMs,0);assert.equal(run.deliveredAt,receipt.deliveredAt);
  } finally {await f.c.dispose();}
});
