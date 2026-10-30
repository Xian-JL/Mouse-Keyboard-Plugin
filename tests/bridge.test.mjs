import test from 'node:test';import assert from 'node:assert/strict';
import {HelperBridge,WindowsBackend} from '../lib/bridge.js';import {MkError,DEFAULTS} from '../lib/contracts.js';
class Transport {
  data;exit;messages=[];killed=false;handler;
  onData(fn){this.data=fn;}onExit(fn){this.exit=fn;}
  write(line){const req=JSON.parse(line);this.messages.push(req);this.handler?.(req);}
  emit(req,value={},extra={}){this.data(Buffer.from(JSON.stringify({protocol:1,nonce:req.nonce,id:req.id,run:req.run,ok:true,value,...extra})+'\n'));}
  kill(){this.killed=true;this.exit?.();}
}
const fixture=()=>{const t=new Transport();let starts=0;const b=new HelperBridge(()=>{starts++;return t;});return {t,b,starts:()=>starts};};
test('bridge remains lazy; a valid response is correlated with request/run and UTF-8 can span chunks',async()=>{
 const {b,t,starts}=fixture();assert.equal(starts(),0);const p=b.request('status',{},'r',new AbortController().signal,1000);const req=t.messages[0];const wire=Buffer.from(JSON.stringify({protocol:1,nonce:req.nonce,id:req.id,run:'r',ok:true,value:{text:'中文😀'}})+'\n');for(let i=0;i<wire.length;i++)t.data(wire.subarray(i,i+1));assert.deepEqual(await p,{text:'中文😀'});assert.equal(starts(),1);await b.dispose();
});
test('wrong nonce or run faults the channel, never authorizing another task',async()=>{
 for(const extra of [{nonce:'wrong'},{run:'other'}]){const {b,t}=fixture();const p=b.request('status',{},'r',new AbortController().signal,1000);const rejected=assert.rejects(p);t.emit(t.messages[0],{},extra);await rejected;assert.equal(t.killed,true);await b.dispose();}
});
test('response after cancellation and duplicate response cannot update a new request',async()=>{
 const {b,t}=fixture(),a=new AbortController();const p=b.request('observe',{},'r',a.signal,1000);const rejected=assert.rejects(p,e=>e.code==='CONTROL_CLOSED');const req=t.messages[0];a.abort(new MkError('CONTROL_CLOSED','normal model end'));t.emit(req,{old:true});const end=t.messages.find(m=>m.method==='end');t.emit(end,{inputReleased:true});await rejected;
 const fresh=b.request('status',{},'new',new AbortController().signal,1000);t.emit(req,{old:true});t.emit(t.messages.at(-1),{fresh:true});assert.deepEqual(await fresh,{fresh:true});await b.dispose();
});
test('large line and stdout contamination fail closed with bounded accumulation',async()=>{
 for(const bytes of [Buffer.alloc(4*1024*1024+1,65),Buffer.from('compiler banner\n')]){const {b,t}=fixture();const p=b.request('status',{},'r',new AbortController().signal,1000);const rejected=assert.rejects(p);t.data(bytes);await rejected;assert.equal(t.killed,true);await b.dispose();}
});
test('timed-out input is unknown, never automatically reissued',async()=>{
 const {b,t}=fixture();t.handler=req=>{if(req.method==='end')queueMicrotask(()=>t.emit(req,{inputReleased:true}));};await assert.rejects(b.request('act',{},'r',new AbortController().signal,5),e=>e.code==='HELPER_TIMEOUT'&&e.execution==='unknown');assert.equal(t.messages.filter(m=>m.method==='act').length,1);assert.equal(t.messages.filter(m=>m.method==='end').length,1);await b.dispose();
});
test('helper death cannot become an ordinary not-sent input failure',async()=>{
 const {b,t}=fixture();const p=b.request('act',{},'r',new AbortController().signal,1000);const rejected=assert.rejects(p,e=>e.execution==='unknown');t.exit();await rejected;await b.dispose();
});
test('oversized request is rejected before writing to the child',async()=>{
 const {b,t}=fixture();assert.throws(()=>b.request('act',{text:'a'.repeat(300000)},'r',new AbortController().signal,1000));assert.equal(t.messages.length,0);await b.dispose();
});
test('startup failure without a child cannot leave a phantom desktop lease or restart during end',async()=>{
 let calls=0;const backend=new WindowsBackend(()=>new HelperBridge(()=>{calls++;throw new MkError('HELPER_START_FAILED','Synthetic missing executable.');}));
 await assert.rejects(backend.begin('r',{...DEFAULTS},new AbortController().signal));await backend.end('r');assert.equal(calls,1);await backend.dispose();
});
