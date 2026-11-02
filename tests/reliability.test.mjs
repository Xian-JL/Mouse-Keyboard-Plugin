import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller} from '../lib/core.js';
import {HumanAuthority,desktopTaskText} from '../lib/authority.js';
import {HelperBridge,WindowsBackend} from '../lib/bridge.js';
import {FakeBackend,authority,scope,signal,settings} from './fixture.mjs';

const message=(seq,text)=>({type:'user/message',surfaceOp:'append',seq,data:{source:{kind:'user'},content:[{type:'text',text}]}});
async function opened(c,s){await c.execute(s,'mk_control',{action:'begin'},signal());const t=await c.execute(s,'mk_observe',{mode:'targets'},signal());const target=t.targets[0].target;const o=await c.execute(s,'mk_observe',{mode:'window',target},signal());return {target,snapshot:o.snapshot};}

test('[CTRL-15] fatal JSON receipts close control and retain sending facts; failed cleanup never reports release',async()=>{
 for(const code of ['CONTROL_CLOSE_FAILED','INPUT_UNKNOWN','PROTOCOL_ERROR'])for(const cleanupFails of [false,true]){
  const b=new FakeBackend(),s=scope(),a=authority(),c=new Controller(b,a,settings);
  b.act=async()=>({execution:'unknown',verification:'unverified',sentCodePoints:32,error:{code,message:'Synthetic failure.'}});
  try{const op=await opened(c,s);if(cleanupFails)b.failure={method:'end',code:'CONTROL_CLOSE_FAILED'};
   const r=await c.execute(s,'mk_mouse',{...op,action:'click',element:'edit'},signal());
   assert.equal(r.execution,'unknown');assert.equal(r.sentCodePoints,32);assert.equal(r.error.code,code);assert.equal(b.calls.includes('end'),true);
   const status=await c.execute(s,'mk_control',{action:'status'},signal());assert.equal(status.inputGateOpen,false);assert.equal(status.inputReleased,!cleanupFails);assert.equal(status.controlState,cleanupFails?'faulted':'closed');
   await assert.rejects(c.execute(s,'mk_mouse',{...op,action:'click',element:'edit'},signal()));
  }finally{b.failure=null;await c.dispose();}
 }
});

test('[DATA-06] prohibitions persist across followups, turn completion and plain continue; explicit permission releases them',()=>{
 const a=new HumanAuthority(),s=scope();a.accept(s.session,message(1,'不要再动我的电脑'));assert.equal(a.canControl(s.session),false);
 a.finishTask(s.session);a.accept(s.session,message(2,'解释这个数字'));assert.equal(a.canControl(s.session),false);
 a.finishTask(s.session);a.accept(s.session,message(3,'继续'));assert.equal(a.canControl(s.session),false);
 a.accept(s.session,message(4,'允许你操作电脑'));assert.equal(a.canControl(s.session),true);
 for(const text of ['仅回答问题，不要进行桌面交互','Do not interact with my computer','请勿擅自接管这台电脑'])assert.equal(desktopTaskText(text),false);
 assert.equal(desktopTaskText('不需要再询问，核对数据'),true);
});

test('an agent ending does not erase a session prohibition or Esc latch',async()=>{
 const a=new HumanAuthority(),b=new FakeBackend(),s=scope(),c=new Controller(b,a,settings);
 try{a.accept(s.session,message(1,'核对数据'));await c.execute(s,'mk_control',{action:'begin'},signal());a.stop(s);await c.forgetAgent(s.agent);a.finishTask(s.session);a.accept(s.session,message(2,'解释停止原因'));assert.throws(()=>a.task(s),e=>e.code==='USER_STOPPED');a.accept(s.session,message(3,'继续'));assert.doesNotThrow(()=>a.task(s));}finally{await c.dispose();}
});

test('[LIFE-11] malformed error responses reject their original request instead of losing the timer',async()=>{
 for(const invalid of [null,[],{}, {code:'STATE_CHANGED',details:{text:'private'}}]){
  let data,exit;const wire={onData(f){data=f},onExit(f){exit=f},kill(){exit?.()},write(line){const r=JSON.parse(line);queueMicrotask(()=>data(Buffer.from(JSON.stringify({protocol:1,nonce:r.nonce,id:r.id,run:r.run,ok:false,error:invalid})+'\n')))}};
  const bridge=new HelperBridge(()=>wire);
  try{const outcome=await Promise.race([bridge.request('observe',{},'run',signal(),25).then(()=> 'resolved',()=> 'rejected'),new Promise(r=>setTimeout(()=>r('stranded'),100))]);assert.equal(outcome,'rejected');}finally{await bridge.dispose();}
 }
});

test('[OBS-14] image encoding choice and expanded detail reach native observation and post-action requests',async()=>{
 const calls=[];const backend=new WindowsBackend(()=>({request:async(method,params)=>{calls.push({method,params});return {}},dispose:async()=>{}}));
 try{await backend.observe('r',{},signal(),false,'expanded');await backend.act('r',{}, {fingerprint:'f'},{tool:'mk_keyboard'},signal(),false);assert.equal(calls[0].params.includeImage,false);assert.equal(calls[0].params.detail,'expanded');assert.equal(calls[1].params.includeImage,false);}finally{await backend.dispose();}
});

test('stable observations taking 501–2500ms are usable and no longer classified as changed',async()=>{
 const b=new FakeBackend(),s=scope(),c=new Controller(b,authority(),settings);b.value.durationMs=1100;
 try{const op=await opened(c,s);assert.ok(op.snapshot);b.value.durationMs=2501;await assert.rejects(c.execute(s,'mk_observe',{mode:'window',target:op.target},signal()),e=>e.code==='PROTOCOL_ERROR');}finally{await c.dispose();}
});
