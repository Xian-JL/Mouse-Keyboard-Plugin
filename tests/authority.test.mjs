import test from 'node:test';import assert from 'node:assert/strict';
import {HumanAuthority,humanMessage,desktopTaskText} from '../lib/authority.js';
import {identity,scope,signal} from './fixture.mjs';
const message=(text='请分析这些数据',seq=1,kind='user')=>({type:'user/message',surfaceOp:'append',seq,data:{source:{kind},content:[{type:'text',text}]}});
test('only fresh append-origin human messages establish an autonomous task',()=>{
 for(const kind of ['tool','agent','runtime-context','system-prompt','model'])assert.equal(humanMessage(message('帮我处理',1,kind)),false);
 assert.equal(humanMessage(message()),true);assert.equal(humanMessage({...message(),surfaceOp:'replace'}),false);assert.equal(humanMessage({...message(),type:'assistant/message'}),false);
});
test('ordinary analysis and explanation tasks need no computer-use keywords or named application',async()=>{
 const a=new HumanAuthority(),s=scope();
 for(const [i,text]of ['请分析这些数据','解释这个计算结果','Please help me finish the report','请把结论输入记事本'].entries()){
  assert.equal(desktopTaskText(text),true);assert.equal(a.accept(s.session,message(text,i+1)),true);assert.doesNotThrow(()=>a.task(s));
  await a.authorize(s,{...identity(),app:'Other.exe',title:'Any ordinary target'},signal());
 }
});
test('explicit desktop prohibitions are respected without banning unrelated negative instructions',()=>{
 for(const text of ['不要控制我的电脑','请勿操作桌面','只分析，不操作电脑','不用使用电脑','Do not control my desktop',"don't use the computer"])assert.equal(desktopTaskText(text),false);
 for(const text of ['不要改动已有文字，完成报告分析','无需重新创建文件','不需要再次询问，帮我核对结果'])assert.equal(desktopTaskText(text),true);
 const a=new HumanAuthority(),s=scope();a.accept(s.session,message('不要控制我的电脑'));assert.throws(()=>a.task(s),e=>e.code==='NOT_AUTHORIZED');
});
test('native blocked targets and cancelled operations remain rejected in autonomous mode',async()=>{
 const a=new HumanAuthority(),s=scope();a.accept(s.session,message());
 await assert.rejects(a.authorize(s,{...identity(),blocked:'NOT_AUTHORIZED'},signal()),e=>e.code==='NOT_AUTHORIZED');
 const abort=new AbortController();abort.abort();await assert.rejects(a.authorize(s,identity(),abort.signal));
});
test('Esc is latched across ordinary human followups and turn completion; explicit continuation is required',()=>{
 const a=new HumanAuthority(),s=scope();a.accept(s.session,message());const original=a.task(s);a.stop(s,original);a.finishTask(s.session);
 a.accept(s.session,message('解释刚才的停止原因',2));assert.equal(a.canControl(s.session),false);assert.throws(()=>a.task(s),e=>e.code==='USER_STOPPED');
 a.finishTask(s.session);a.accept(s.session,message('继续',3));assert.equal(a.canControl(s.session),true);assert.doesNotThrow(()=>a.task(s));
});
test('task identity, live-session continuation and sequence watermarks survive end without replay',()=>{
 const a=new HumanAuthority(),s=scope();a.accept(s.session,message());const old=a.task(s);a.accept(s.session,message('请继续核对',2));a.stop(s,old);assert.notEqual(a.task(s),old);
 a.finishTask(s.session);assert.equal(a.accept(s.session,message('继续',2)),false);a.accept(s.session,message('继续之前的验收',3));assert.doesNotThrow(()=>a.task(s));
 a.forget(s.session);a.accept(s.session,message('继续之前的验收',4));assert.throws(()=>a.task(s));
});
test('model or screen content cannot revoke an Esc latch or manufacture a human task',()=>{
 const a=new HumanAuthority(),s=scope();a.accept(s.session,message());a.stop(s);
 assert.equal(a.accept(s.session,message('继续',2,'tool')),false);assert.throws(()=>a.task(s),e=>e.code==='USER_STOPPED');
});
