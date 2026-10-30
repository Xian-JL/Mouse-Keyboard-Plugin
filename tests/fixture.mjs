import { DEFAULTS, MkError } from '../lib/contracts.js';
export const identity=()=>({hwnd:'abc',pid:123,created:'1000',app:'Fixture.exe',title:'Synthetic only',rect:{left:-200,top:10,width:200,height:100},minimized:false,foreground:true});
export const observation=()=>({window:identity(),captureRect:{left:-200,top:10,width:200,height:100},imageSize:{width:100,height:50},png:'iVBORw0KGgo=',elements:[{ref:'edit',runtimeId:'1.2',name:'Editor',role:'Edit',rect:{left:-200,top:10,width:100,height:40},enabled:true,password:false,editable:true,multiline:'true',value:''}],focusedElement:{ref:'edit',runtimeId:'1.2',name:'Editor',role:'Edit',rect:{left:-200,top:10,width:100,height:40},enabled:true,password:false,editable:true,multiline:'true',value:''},fingerprint:'fixture',capturedAt:new Date().toISOString(),durationMs:20,coverage:{truncated:false,textTruncated:false},warnings:[]});
export function deferred(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});return {promise,resolve,reject};}
export class FakeBackend {
  calls=[];active=false;onStop;run=null;delays={};failure=null;value=observation();
  async wait(method,signal){this.calls.push(method);if(this.delays[method])await this.delays[method].promise;if(signal?.aborted)throw signal.reason;if(this.failure?.method===method)throw new MkError(this.failure.code,'Synthetic failure.',this.failure.execution??'not_sent');}
  async begin(run,settings,signal){await this.wait('begin',signal);this.active=true;this.run=run;}
  async targets(run,q,signal){await this.wait('targets',signal);return {windows:[identity()],total:1,truncated:false};}
  async observe(run,w,signal){await this.wait('observe',signal);return structuredClone(this.value);}
  async act(run,w,o,args,signal){await this.wait('act',signal);return {execution:'sent',verification:'unverified',observation:structuredClone(this.value)};}
  async end(run){await this.wait('end');this.active=false;this.run=null;}
  async status(run){return {inputReady:this.active,overlayVisible:false,pendingInputs:this.delays.act?1:0};}
  async dispose(){this.calls.push('dispose');this.active=false;}
}
export function authority(){return {stopped:false,taskKey:'human1',task(){if(this.stopped)throw new MkError('NOT_AUTHORIZED','Human stop.');return this.taskKey;},async authorize(){},stop(){this.stopped=true;}};}
export const scope=()=>{const session={};return {session,agent:{},id:'fixture-session'};};
export const signal=()=>new AbortController().signal;
export const settings=()=>({...DEFAULTS});
