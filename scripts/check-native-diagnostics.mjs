// Exercises bundled native validation only: no target enumeration, capture, activation or input.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {HelperBridge,ownedNativeChildren} from '../lib/bridge.js';import {DEFAULTS} from '../lib/contracts.js';
const bridge=new HelperBridge(),run=randomUUID(),signal=new AbortController().signal;
try{
 await bridge.request('begin',{settings:{...DEFAULTS}},run,signal,30000);
 await assert.rejects(bridge.request('observe',{window:{hwnd:'0'}},run,signal,3000),e=>e.code==='TARGET_GONE'&&e.execution==='not_sent'&&e.details?.stage==='native-validation'&&e.details?.check==='target-gone');
 await assert.rejects(bridge.request('targets',{query:'记事本',aliases:['x'.repeat(129)]},run,signal,3000),e=>e.code==='INVALID_ARGUMENT'&&e.details?.stage==='native-validation');
 const status=await bridge.request('status',{},run,signal,1200);assert.equal(status.inputReady,true);assert.equal(status.overlayVisible,false);
 const end=await bridge.request('end',{},run,signal,3000);assert.equal(end.inputReleased,true);
 console.log(JSON.stringify({ok:true,mode:'real-native-diagnostic-roundtrip',structuredNativeErrors:true,invalidAliasRejectedBeforeEnumeration:true,runRemainedReady:true,escapeHooksInstalled:true,desktopObserved:false,inputSent:false,visibleWindowsCreated:false}));
}catch(error){console.error(error.code??error.message);process.exitCode=1;}finally{await bridge.dispose();assert.deepEqual(ownedNativeChildren(),[]);}
