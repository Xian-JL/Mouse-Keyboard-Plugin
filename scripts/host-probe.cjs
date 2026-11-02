// Runs ONLY inside the packaged Electron's Node mode. Never boots the desktop UI or tools.
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=process.argv[2];
async function main(){
 const base=process.env.MK_DSH_NODE_MODULES?path.join(process.env.MK_DSH_NODE_MODULES,'@deepseek-ai'):path.join(root,'resources','app.asar','dsh','node_modules','@deepseek-ai');
 const cordis=await import(pathToFileURL(path.join(base,'cordis','lib','index.js')).href);
 const system=await import(pathToFileURL(path.join(base,'dsh-system-prompt','lib','index.js')).href);
 const tools=await import(pathToFileURL(path.join(base,'dsh-tools','lib','index.js')).href);
 const Context=cordis.Context??cordis.default;const ctx=new Context();
 let sandboxMode='danger-full-access';ctx.provide('sandboxPolicy');ctx.set('sandboxPolicy',{resolve:()=>({mode:sandboxMode})});
 await ctx.plugin(system.default??system.SystemPrompt);
 await ctx.plugin(tools.default??tools.ToolRuntime);
 const mod=await import(pathToFileURL(process.env.MK_PLUGIN_ENTRY??path.join(__dirname,'..','lib','index.js')).href);
 // A deliberately inert attachment provider: status/end are the only exercised calls.
 ctx.provide('attachments');ctx.set('attachments',{saveImage(){throw new Error('Host probe must not capture or store desktop images.');}});
 const handle=ctx.plugin(mod,{});await handle;
 const toolService=ctx.get('tools');
 const found=['mk_control','mk_observe','mk_mouse','mk_keyboard'].map(name=>({name,visible:!!toolService.get(name)}));
 if(found.some(x=>!x.visible))throw new Error('Four tools were not registered.');
 const session={id:'mk-host-contract-probe',isOwnSeq:()=>true},agent={id:session.id,session,ctx};
 const definition=toolService.get('mk_control');
 const exec={agent,signal:new AbortController().signal,callId:'probe'};
 const status=await definition.execute({action:'status'},exec);const end=await definition.execute({action:'end'},exec);
 if(status.controlState!=='closed'||end.controlState!=='closed'||status.inputGateOpen!==false)throw new Error('Probe unexpectedly enabled desktop input.');
 const pipeline=await toolService.execute({name:'mk_control',arguments:{action:'status'},agent,callId:'pipeline-check',signal:new AbortController().signal});
 if(pipeline.isError||pipeline.concludesTurn)throw new Error('Native ToolRuntime pipeline failed or incorrectly concluded the turn: '+JSON.stringify(pipeline));
 const parsed=JSON.parse(pipeline.content.find(b=>b.type==='text').text);if(parsed.controlState!=='closed')throw new Error('Invalid pipeline output.');
 const denied=await toolService.execute({name:'mk_control',arguments:{action:'begin'},agent,callId:'diagnostic-check',signal:new AbortController().signal});
 const deniedValue=JSON.parse(denied.content.find(b=>b.type==='text').text);if(deniedValue.error?.code!=='NOT_AUTHORIZED'||deniedValue.error?.details?.stage!=='authorization')throw new Error('Structured details were lost in the real tool pipeline.');
 const {updateVolatile}=await import(pathToFileURL(path.join(base,'cosmokit','lib','index.js')).href);
 const config=handle.config;
 if(typeof config?.enabled?.get!=='function')throw new Error('Expected the real host volatile reference contract.');
 for(let i=0;i<20;i++){
  const disabled=cordis.resolveConfig(mod,{enabled:false});updateVolatile(config.enabled,disabled.enabled);handle.ctx.emit('loader/volatile-update',[['enabled']]);
  await new Promise(r=>setTimeout(r,5));if(toolService.get('mk_control'))throw new Error('Disabled plugin left its model tools visible.');
  const enabled=cordis.resolveConfig(mod,{enabled:true});updateVolatile(config.enabled,enabled.enabled);handle.ctx.emit('loader/volatile-update',[['enabled']]);
  await new Promise(r=>setTimeout(r,5));if(!toolService.get('mk_control'))throw new Error('Enabled plugin did not re-register tools.');
 }
 let nativeCycles=0;
 if(process.argv.includes('--native-cycles')){
  ctx.emit('session/event',session,{type:'user/message',surfaceOp:'append',seq:1,data:{source:{kind:'user'},content:[{type:'text',text:'请分析计算结果并核对报告'}]}});
  await new Promise(r=>setImmediate(r));
  sandboxMode='read-only';const restricted=await toolService.execute({name:'mk_control',arguments:{action:'begin'},agent,callId:'readonly-begin',signal:new AbortController().signal});if(JSON.parse(restricted.content.find(b=>b.type==='text').text).error?.code!=='NOT_AUTHORIZED')throw new Error('Read-only policy admitted begin.');const readonlyWindow=await toolService.execute({name:'mk_observe',arguments:{mode:'window',target:'blocked-before-lookup'},agent,callId:'readonly-window',signal:new AbortController().signal});if(JSON.parse(readonlyWindow.content.find(b=>b.type==='text').text).error?.code!=='NOT_AUTHORIZED')throw new Error('Read-only policy admitted foreground observation.');sandboxMode='danger-full-access';
  const call=async(action,index)=>{const r=await toolService.execute({name:'mk_control',arguments:{action},agent,callId:'native-'+index+'-'+action,signal:new AbortController().signal});if(r.isError)throw new Error('Real-host lifecycle pipeline failed.');const value=JSON.parse(r.content.find(b=>b.type==='text').text);if(value.ok===false)throw new Error('Real-host lifecycle rejected: '+JSON.stringify(value));return value;};
  for(let i=0;i<100;i++){const opened=await call('begin',i);if(opened.controlState!=='ready'||opened.overlayVisible!==false)throw new Error('Unexpected native open state.');const closed=await call('end',i);if(closed.controlState!=='closed'||closed.inputReleased!==true||closed.overlayVisible!==false)throw new Error('Native release unconfirmed.');nativeCycles++;}
 }
 await handle.dispose();
 if(['mk_control','mk_observe','mk_mouse','mk_keyboard'].some(name=>toolService.get(name)))throw new Error('Tools were not removed on disposal.');
 await ctx.fiber.dispose();
 console.log(JSON.stringify({ok:true,hostVersion:require(path.join(base,process.env.MK_DSH_NODE_MODULES?'dsh-tools':'dsh','package.json')).version,tools:found,status,end,toolPipeline:true,volatileEnableCycles:20,autonomousTaskWithoutDesktopKeywords:nativeCycles>0,readOnlyControlAndForegroundDenied:nativeCycles>0,nativeControlCycles:nativeCycles,disposed:true,desktopObserved:false,inputSent:false,scope:'real Cordis + SystemPrompt + ToolRuntime; synthetic event fixture, not a real model or full Desktop profile'}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
