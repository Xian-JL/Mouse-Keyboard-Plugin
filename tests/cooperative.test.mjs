import test from 'node:test';import assert from 'node:assert/strict';
import {HumanAuthority,appSearchAliases} from '../lib/authority.js';
import {HelperBridge,WindowsBackend} from '../lib/bridge.js';
import {Controller} from '../lib/core.js';
import {MkError,diagnosticDetails} from '../lib/contracts.js';
import {FakeBackend,authority,scope,signal,settings,identity} from './fixture.mjs';
function msg(seq,text,kind='user'){return {type:'user/message',surfaceOp:'append',seq,data:{source:{kind},content:[{type:'text',text}]}};}
test('explicit human continuations preserve a live task and ordinary targets need no separate approval',async()=>{
 for(const text of ['继续之前的验收','继续上一任务','继续上次测试','请继续上一轮的验收。']){
  const a=new HumanAuthority(),s=scope();a.accept(s.session,msg(1,'请核对报告内容'));a.finishTask(s.session);a.accept(s.session,msg(2,text));
  await a.authorize(s,{...identity(),app:'notepad.exe'},signal());await a.authorize(s,{...identity(),app:'other.exe'},signal());
  await assert.rejects(a.authorize(s,{...identity(),blocked:'NOT_AUTHORIZED'},signal()));
 }
});
test('continuation without live context, tool continuation and sequence replay never grant control',()=>{
 const a=new HumanAuthority(),s=scope();a.accept(s.session,msg(2,'继续之前的验收'));assert.throws(()=>a.task(s));
 a.accept(s.session,msg(3,'请把结论输入记事本窗口'));a.finishTask(s.session);
 assert.equal(a.accept(s.session,msg(3,'继续之前的验收')),false);assert.equal(a.accept(s.session,msg(4,'继续之前的验收','tool')),false);assert.throws(()=>a.task(s));
 a.accept(s.session,msg(5,'继续之前的验收'));assert.doesNotThrow(()=>a.task(s));a.forget(s.session);a.accept(s.session,msg(6,'继续之前的验收'));assert.throws(()=>a.task(s));
});
test('Chinese and executable aliases use the same exact alias family; arbitrary text is unchanged',()=>{
 assert.deepEqual(appSearchAliases('记事本'),appSearchAliases('Notepad.exe'));assert.ok(appSearchAliases('记事本').includes('notepad.exe'));
 assert.deepEqual(appSearchAliases('MSedge'),appSearchAliases('Edge'));assert.deepEqual(appSearchAliases('记事本里的任意内容'),[]);assert.deepEqual(appSearchAliases(undefined),[]);
});
test('native details remain bounded metadata; payload text, unknown fields and invalid geometry are refused',()=>{
 const d={stage:'visual-comparison',space:'screen-physical-pixels',region:{left:-200,top:10,width:100,height:100},diffBbox:{left:-190,top:30,width:10,height:92},changedPixels:920,significantPixels:0,maxChannelDelta:2,dpi:192,snapshotAgeMs:1000};assert.deepEqual(diagnosticDetails(d),d);
 for(const invalid of [{text:'private'},{stage:'private\nwindow text'},{region:{left:0,top:0,width:-1,height:1}},{changedPixels:Infinity},{stage:'x'.repeat(3000)}])assert.throws(()=>diagnosticDetails(invalid),e=>e.code==='PROTOCOL_ERROR');
});
class Wire {messages=[];onData(fn){this.data=fn;}onExit(fn){this.exit=fn;}write(raw){this.messages.push(JSON.parse(raw));}kill(){this.exit?.();}}
test('Bridge preserves structured native visual rejection and definitely-not-sent status',async()=>{
 const t=new Wire(),b=new HelperBridge(()=>t);try{
  const p=b.request('act',{},'r',signal(),1000);const rejected=assert.rejects(p,e=>e.code==='STATE_CHANGED'&&e.execution==='not_sent'&&e.details.stage==='visual-comparison'&&e.details.diffBbox.width===10);
  const req=t.messages[0];t.data(Buffer.from(JSON.stringify({...req,params:undefined,method:undefined,ok:false,error:{code:'STATE_CHANGED',execution:'not_sent',details:{stage:'visual-comparison',diffBbox:{left:1,top:2,width:10,height:92}}}})+'\n'));await rejected;
 }finally{await b.dispose();}
});
test('Windows target search forwards aliases without starting any user-window query during test',async()=>{
 let request;const bridge={request:async(method,params)=>{request={method,params};return {windows:[],total:0,truncated:false};},dispose:async()=>{}};
 const b=new WindowsBackend(()=>bridge);try{await b.targets('r','记事本',signal());assert.equal(request.params.query,'记事本');assert.ok(request.params.aliases.includes('notepad.exe'));}finally{await b.dispose();}
});
async function opened(c,s){await c.execute(s,'mk_control',{action:'begin'},signal());const targets=await c.execute(s,'mk_observe',{mode:'targets'},signal());const target=targets.targets[0].target;const o=await c.execute(s,'mk_observe',{mode:'window',target},signal());return {target,snapshot:o.snapshot};}
test('human activity and pointer interference refuse an action without latching or closing control',async()=>{
 for(const code of ['USER_BUSY','INPUT_INTERFERENCE','FOCUS_MISMATCH','FOREGROUND_DENIED','ACTIVATION_TIMEOUT']){
  const b=new FakeBackend(),a=authority(),s=scope(),c=new Controller(b,a,settings);try{
   const op=await opened(c,s);b.failure={method:'act',code};await assert.rejects(c.execute(s,'mk_mouse',{...op,action:'click',element:'edit'},signal()),e=>e.code===code);
   const status=await c.execute(s,'mk_control',{action:'status'},signal());assert.equal(status.controlState,'ready');assert.equal(status.requiresHumanAuthorization,false);assert.equal(a.stopped,false);assert.equal(b.calls.includes('end'),false);
  }finally{await c.dispose();}
 }
});
test('partial text due to user activity preserves facts and does not replay or revoke authorization',async()=>{
 const b=new FakeBackend(),a=authority(),s=scope(),c=new Controller(b,a,settings);b.act=async()=>({execution:'partially_sent',verification:'unverified',sentCodePoints:32,error:{code:'USER_BUSY',message:'Yield.',details:{stage:'input-arbitration',requiredAction:'reobserve'}}});
 try{const op=await opened(c,s);const r=await c.execute(s,'mk_keyboard',{...op,action:'type',text:'测试'},signal());assert.equal(r.execution,'partially_sent');assert.equal(r.error.details.stage,'input-arbitration');assert.equal((await c.execute(s,'mk_control',{action:'status'},signal())).controlState,'ready');assert.equal(a.stopped,false);}finally{await c.dispose();}
});
test('physical Esc before the first action still latches stop; ordinary begin/end cannot bypass it',async()=>{
 const b=new FakeBackend(),a=authority(),s=scope(),c=new Controller(b,a,settings);try{const begin=await c.execute(s,'mk_control',{action:'begin'},signal());b.onStop('USER_STOPPED',begin.run);await new Promise(r=>setImmediate(r));assert.equal((await c.execute(s,'mk_control',{action:'status'},signal())).controlState,'stopped');await c.execute(s,'mk_control',{action:'end'},signal());await assert.rejects(c.execute(s,'mk_control',{action:'begin'},signal()),e=>e.code==='USER_STOPPED');assert.equal(b.calls.includes('act'),false);}finally{await c.dispose();}
});
