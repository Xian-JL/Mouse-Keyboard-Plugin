// Exercises real stdio/native startup, mutex, status and cleanup only.
// NEVER calls targets, observe or act; no visible window, desktop capture or input.
// dev.3 installs physical-Esc/cooperative hooks during each ready run; they are removed on end.
import assert from 'node:assert/strict';
import {WindowsBackend,ownedNativeChildren} from '../lib/bridge.js';
import {DEFAULTS} from '../lib/contracts.js';
import {randomUUID} from 'node:crypto';
const first=new WindowsBackend(),second=new WindowsBackend();const events=[];
first.onStop=(reason)=>events.push(reason);second.onStop=(reason)=>events.push(reason);
const signal=new AbortController().signal;const runs=[];const start=performance.now();
try{
 const initial=await first.status('not-started');assert.deepEqual(initial,{inputReady:false,overlayVisible:false,pendingInputs:0});
 const run=randomUUID();await first.begin(run,{...DEFAULTS},signal);const opened=await first.status(run);assert.equal(opened.inputReady,true);assert.equal(opened.overlayVisible,false);
 await assert.rejects(second.begin(randomUUID(),{...DEFAULTS},signal),error=>error.code==='BUSY');
 await first.end(run);
 // Clean up the failed begin before acquiring the same desktop mutex with a new run.
 await second.dispose();
 for(let i=0;i<100;i++){
  const id=randomUUID();await first.begin(id,{...DEFAULTS},signal);assert.equal((await first.status(id)).inputReady,true);await first.end(id);const status=await first.status(id);assert.equal(status.inputReady,false);assert.equal(status.overlayVisible,false);assert.equal(status.pendingInputs,0);runs.push(id);
 }
 assert.equal(new Set(runs).size,100);assert.deepEqual(events,[]);
 console.log(JSON.stringify({ok:true,mode:'real-native-lifecycle-only',cycles:runs.length,crossProcessMutex:true,durationMs:Math.round(performance.now()-start),desktopObserved:false,inputSent:false,visibleWindowsCreated:false}));
}catch(error){console.error(error.code??error.message);process.exitCode=1;}finally{await first.dispose();await second.dispose();assert.deepEqual(ownedNativeChildren(),[]);console.log(JSON.stringify({ownedHelpersRemaining:0,inputSent:false,desktopObserved:false}));}
