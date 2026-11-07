// E2 / FR-12.2: scancode input and the non-editable typing path.
// (a) genuinely compiles and runs helper/Native.cs through bootstrap.ps1 -CompileOnly and
//     reads the SelfTest JSON required by docs/internal-interface-0.4.0.md section 4;
// (b)/(c) lock the Host-side contract in parseRequest/Controller. No desktop is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {Controller} from '../lib/core.js';
import {parseRequest} from '../lib/contracts.js';
import {FakeBackend,authority,scope,signal,settings} from './fixture.mjs';

const run=promisify(execFile);
const base={action:'type',target:'a',snapshot:'b'};
const fixture=()=>{const b=new FakeBackend(),a=authority(),s=scope();let now=1;const c=new Controller(b,a,settings,()=>now);return {b,a,s,c,advance:n=>now+=n};};
async function open(f){await f.c.execute(f.s,'mk_control',{action:'begin'},signal());const t=await f.c.execute(f.s,'mk_observe',{mode:'targets'},signal());const target=t.targets[0].target;const o=await f.c.execute(f.s,'mk_observe',{mode:'window',target},signal());return {target,snapshot:o.snapshot};}

// One compile per test process, shared by every assertion below; this is the same invocation
// as scripts/check-helper.mjs, so a red result here means the real C# helper is not ready.
let selfTestResult;
const selfTest=()=>selfTestResult??=runSelfTest();
async function runSelfTest(){
  const executable=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  try {
    const {stdout,stderr}=await run(executable,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../helper/bootstrap.ps1',import.meta.url)),'-ParentPid',String(process.pid),'-CompileOnly'],{windowsHide:true,timeout:30000,maxBuffer:128*1024});
    if(stderr.trim())throw new Error(`native self-test wrote stderr: ${stderr.trim()}`);
    return JSON.parse(stdout.trim());
  } catch(error) {throw new Error(`native self-test failed: ${error.stderr??error.message}`);}
}

test('[E2 AC-INPUT-05/08/09] the real native self-test compiles and reports scancode Shift plan and typing gates',{timeout:60000},async()=>{
  const value=await selfTest(),detail=JSON.stringify(value);
  assert.equal(value.ok,true,detail);
  assert.equal(value.desktopObserved,false,detail);
  assert.equal(value.inputSent,false,detail);
  assert.ok(Number.isSafeInteger(value.assertions)&&value.assertions>0,`missing assertions counter: ${detail}`);
  const scancode=value.scancode;
  assert.ok(scancode&&typeof scancode==='object',`missing scancode counters (interface section 4): ${detail}`);
  // AC-INPUT-05: a plan exists, uppercase letters need Shift down/up pairs, unmappable input is rejected.
  assert.ok(Number.isSafeInteger(scancode.plan)&&scancode.plan>0,`scancode.plan must be a positive integer: ${detail}`);
  assert.ok(Number.isSafeInteger(scancode.shiftPairs)&&scancode.shiftPairs>0,`scancode.shiftPairs must be positive: ${detail}`);
  assert.ok(Number.isSafeInteger(scancode.rejected)&&scancode.rejected>0,`scancode.rejected must be positive: ${detail}`);
  assert.equal(scancode.release,true,`scancode.release must confirm ReleaseOwned hygiene: ${detail}`);
  const typing=value.typing;
  assert.ok(typing&&typeof typing==='object',`missing typing counters (interface section 4): ${detail}`);
  assert.equal(typing.nonEditableAccepted,true,`typing.nonEditableAccepted (AC-INPUT-08): ${detail}`); // FR-03 gate removed
  assert.equal(typing.passwordRejected,true,`typing.passwordRejected (AC-INPUT-09): ${detail}`);      // password still refused
  assert.equal(typing.multilineRejected,true,`typing.multilineRejected: ${detail}`);                  // MULTILINE_UNCONFIRMED kept
  // 0.4.0-dev.2 F5/F6 hooks: the real mapper proves rect-insensitive identity and canvas hit-testing.
  const focus=value.focus;
  assert.ok(focus&&typeof focus==='object',`missing focus counters (0.4.0-dev.2 F5): ${detail}`);
  assert.equal(focus.identityIgnoresRect,true,`focus.identityIgnoresRect (F5 long-text revalidation): ${detail}`);
  assert.equal(focus.stateRejectsRect,true,`focus.stateRejectsRect: ${detail}`);
  const canvas=value.canvas;
  assert.ok(canvas&&typeof canvas==='object',`missing canvas counters (0.4.0-dev.2 F6): ${detail}`);
  assert.equal(canvas.hit,true,`canvas.hit (F6 canvas click scope): ${detail}`);
  assert.equal(canvas.miss,true,`canvas.miss: ${detail}`);
  assert.equal(canvas.clamped,true,`canvas.clamped: ${detail}`);
});

test('[E2 AC-INPUT-06] scancode non-ASCII is rejected by parseRequest before anything reaches the backend',{timeout:15000},async()=>{
  const args={...base,inputMode:'scancode',text:'中文命令'};
  assert.throws(()=>parseRequest('mk_keyboard',args),e=>e.code==='UNSUPPORTED_INPUT');
  const f=fixture();
  try {
    const op=await open(f);
    const before=f.b.calls.filter(c=>c==='act').length;
    await assert.rejects(f.c.execute(f.s,'mk_keyboard',{...op,action:'type',text:'中文命令',inputMode:'scancode'},signal()),e=>e.code==='UNSUPPORTED_INPUT');
    assert.equal(f.b.calls.filter(c=>c==='act').length,before);
    assert.deepEqual(f.b.acts,[]);
    // The rejected request never reached the snapshot either: ASCII scancode can still use it.
    const accepted=await f.c.execute(f.s,'mk_keyboard',{...op,action:'type',text:'PageFaultTest 2',inputMode:'scancode'},signal());
    assert.equal(accepted.execution,'sent');assert.equal(f.b.acts.length,1);assert.equal(f.b.acts[0].inputMode,'scancode');
  } finally {await f.c.dispose();}
});

test('[E2 AC-INPUT-05] inputMode defaults, scancode accepts ASCII, bounds are enforced and the act request is verbatim',{timeout:15000},async()=>{
  assert.equal(parseRequest('mk_keyboard',{...base,text:'x'}).inputMode,'auto');
  for(const mode of ['unicode','scancode'])assert.equal(parseRequest('mk_keyboard',{...base,text:'PageFaultTest 2',inputMode:mode}).inputMode,mode);
  assert.equal(parseRequest('mk_keyboard',{...base,text:'PageFaultTest 2',inputMode:'scancode'}).text,'PageFaultTest 2');
  for(const inputMode of ['physical','SCANCODE',''])assert.throws(()=>parseRequest('mk_keyboard',{...base,text:'x',inputMode}),e=>e.code==='INVALID_ARGUMENT');
  for(const settleMs of [-1,5001,1.5,'5',NaN])assert.throws(()=>parseRequest('mk_keyboard',{...base,text:'x',settleMs}),e=>e.code==='INVALID_ARGUMENT');
  for(const paceMs of [-1,51,1.5,'5',NaN])assert.throws(()=>parseRequest('mk_keyboard',{...base,text:'x',paceMs}),e=>e.code==='INVALID_ARGUMENT');
  assert.equal(parseRequest('mk_keyboard',{...base,text:'x',settleMs:5000,paceMs:50}).settleMs,5000);
  assert.equal(parseRequest('mk_keyboard',{...base,text:'x',settleMs:5000,paceMs:50}).paceMs,50);
  // action:key accepts settleMs only, never paceMs/inputMode.
  assert.equal(parseRequest('mk_keyboard',{...base,action:'key',key:'Enter',settleMs:5}).settleMs,5);
  for(const extra of [{paceMs:1},{inputMode:'auto'}])assert.throws(()=>parseRequest('mk_keyboard',{...base,action:'key',key:'Enter',...extra}),e=>e.code==='INVALID_ARGUMENT');
  const f=fixture();
  try {
    const op=await open(f);
    await f.c.execute(f.s,'mk_keyboard',{...op,action:'type',text:'PageFaultTest 2',inputMode:'scancode',paceMs:7,settleMs:120},signal());
    const request=f.b.acts[0];
    assert.deepEqual({inputMode:request.inputMode,paceMs:request.paceMs,settleMs:request.settleMs},{inputMode:'scancode',paceMs:7,settleMs:120});
    assert.equal(request.text,'PageFaultTest 2');assert.equal(request.tool,'mk_keyboard');assert.equal(request.action,'type');
  } finally {await f.c.dispose();}
});

test('[E2 AC-INPUT-08] non-editable focus still forwards the type request without a host editable gate',{timeout:15000},async()=>{
  const f=fixture();f.b.value.focusedElement.editable=false;f.b.value.elements[0].editable=false;
  try {
    const op=await open(f);
    const r=await f.c.execute(f.s,'mk_keyboard',{...op,action:'type',text:'/bin/PageFaultTest 2'},signal());
    assert.equal(r.execution,'sent');assert.equal(f.b.acts.length,1);
    assert.equal(f.b.acts[0].text,'/bin/PageFaultTest 2');assert.equal(f.b.acts[0].inputMode,'auto');
  } finally {await f.c.dispose();}
});
