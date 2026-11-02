import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {FakeBackend,signal} from './fixture.mjs';

// Run the actual Host entry in memory with an inert transport boundary.
// No helper process, hook, desktop enumeration, capture or input is started.
const root=fileURLToPath(new URL('../',import.meta.url));
const compiled=await build({entryPoints:[root+'src/host/index.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'inert-native-boundary',setup(b){b.onResolve({filter:/^\.\/bridge\.js$/},()=>({path:'inert',namespace:'test-backend'}));b.onLoad({filter:/.*/,namespace:'test-backend'},()=>({contents:'export class WindowsBackend {constructor(){return globalThis.__mkRuntimeTestBackend;}}',loader:'js'}));}}]});
const entry=new Module(root+'in-memory-runtime-test.cjs');entry.filename=root+'in-memory-runtime-test.cjs';entry.paths=Module._nodeModulePaths(root);entry._compile(compiled.outputFiles[0].text,entry.filename);

function context(parent){
 const callbacks=new Map(),cleanups=[],tools=parent?.tools??new Map(),logs=parent?.logs??[],services=parent?.services??new Map([['sandboxPolicy',{resolve:()=>({mode:'danger-full-access'})}],['llm',{resolveModelInfo:async()=>({inputModalities:[]})}]]);
 const ctx={toolsMap:tools,logs,services,get:n=>services.get(n),logger:{info:s=>logs.push(JSON.parse(s))},tools:{register(def){tools.set(def.name,def);cleanups.push(()=>{if(tools.get(def.name)===def)tools.delete(def.name)})}},systemPrompt:{section(){}},on(n,f){let list=callbacks.get(n);if(!list){list=[];callbacks.set(n,list)}list.push(f)},effect(f){cleanups.push(f())},async emit(n,...args){for(const f of callbacks.get(n)??[])await f(...args)},plugin(def){const child=context({tools,logs,services});def.apply(child);const handle=Promise.resolve();handle.dispose=()=>child.dispose();return handle},async dispose(){for(const fn of cleanups.reverse())await fn?.()}};return ctx;
}
const message=(seq,text)=>({type:'user/message',surfaceOp:'append',seq,data:{source:{kind:'user'},content:[{type:'text',text}]}});
async function fixture(config={}){const backend=new FakeBackend(),ctx=context();globalThis.__mkRuntimeTestBackend=backend;try{await entry.exports.apply(ctx,config)}finally{delete globalThis.__mkRuntimeTestBackend}const session={id:'runtime-test',isOwnSeq:()=>true};const exec={agent:{id:session.id,session,options:{provider:'test',model:'text-only'}},signal:signal(),callId:'runtime-call'};return {ctx,backend,config,session,exec,call:(name,args)=>ctx.toolsMap.get(name).execute(args,exec),human:(seq,text)=>ctx.emit('session/event',session,message(seq,text)),update:()=>ctx.emit('loader/volatile-update')};}

test('[CTRL-16,STOP-08] numeric configuration updates retain the current task; disable/re-enable cannot erase Esc',async()=>{
 const f=await fixture();try{
  await f.human(1,'请核对计算结果');assert.equal((await f.call('mk_control',{action:'begin'})).controlState,'ready');
  f.config.snapshotTtlMs=45000;await f.update();assert.equal((await f.call('mk_control',{action:'begin'})).controlState,'ready');
  const status=await f.call('mk_control',{action:'status'});f.backend.onStop('USER_STOPPED',status.run);await new Promise(r=>setImmediate(r));
  f.config.enabled=false;await f.update();assert.equal(f.ctx.toolsMap.size,0);await f.human(2,'解释刚才为什么停止');f.config.enabled=true;await f.update();assert.equal((await f.call('mk_control',{action:'begin'})).error.code,'USER_STOPPED');
  await f.human(3,'继续');assert.equal((await f.call('mk_control',{action:'begin'})).controlState,'ready');
 }finally{await f.ctx.dispose()}
});

test('prohibitions, sequence watermarks and turn completion survive runtime remounts',async()=>{
 const f=await fixture();try{
  await f.human(1,'不要操作电脑');await f.update();await f.human(2,'解释数字');assert.equal((await f.call('mk_control',{action:'begin'})).error.code,'NOT_AUTHORIZED');
  await f.human(3,'允许你操作电脑');assert.equal((await f.call('mk_control',{action:'begin'})).controlState,'ready');
  await f.ctx.emit('session/event',f.session,{type:'turn/end'});await f.update();await f.human(3,'重复消息');assert.equal((await f.call('mk_control',{action:'begin'})).error.code,'NOT_AUTHORIZED');
  await f.human(4,'继续');assert.equal((await f.call('mk_control',{action:'begin'})).controlState,'ready');
 }finally{await f.ctx.dispose()}
});

test('text-only model capability skips native image encoding and diagnostics retain receipt failures',async()=>{
 const f=await fixture({diagnosticsEnabled:true});let requestedImage,expanded;
 f.backend.observe=async(_r,_w,_s,image,detail)=>{requestedImage=image;expanded=detail;return {...structuredClone(f.backend.value),png:''}};
 f.backend.act=async()=>({execution:'unknown',verification:'unverified',error:{code:'INPUT_UNKNOWN',message:'Never logged private payload',details:{stage:'input-arbitration',check:'interrupted'}}});
 try{
  await f.human(1,'核对数据');await f.call('mk_control',{action:'begin'});const t=await f.call('mk_observe',{mode:'targets'});const target=t.targets[0].target;const o=await f.call('mk_observe',{mode:'window',target,detail:'expanded'});
  assert.equal(requestedImage,false);assert.equal(expanded,'expanded');assert.equal(o.image,null);assert.equal(Object.hasOwn(o,'imageBytes'),false);
  await f.call('mk_mouse',{action:'click',target,snapshot:o.snapshot,element:'edit'});const log=f.ctx.logs.at(-1);assert.equal(log.code,'INPUT_UNKNOWN');assert.equal(log.execution,'unknown');assert.equal(log.stage,'input-arbitration');assert.equal(JSON.stringify(log).includes('Never logged'),false);
  f.backend.act=async()=>({execution:'partially_sent',verification:'unverified',error:{code:'USER_BUSY',message:'Private text'}});await f.call('mk_control',{action:'begin'});const t2=await f.call('mk_observe',{mode:'targets'});const target2=t2.targets[0].target;const o2=await f.call('mk_observe',{mode:'window',target:target2});await f.call('mk_mouse',{action:'click',target:target2,snapshot:o2.snapshot,element:'edit'});assert.equal(f.ctx.logs.at(-1).execution,'partially_sent');assert.equal(f.ctx.logs.at(-1).code,'USER_BUSY');
 }finally{await f.ctx.dispose()}
});
