import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { PROTOCOL, VERSION, MkError, id, object,diagnosticDetails } from '../shared/contracts.js';
import {appSearchAliases} from '../shared/apps.js';
import type { Observation, Settings, WindowIdentity, Request, NativeReceipt, Obj } from '../shared/contracts.js';
import type { Backend } from './backend.js';

export interface Transport { write(value:string):void; kill():void; onData(fn:(chunk:Buffer)=>void):void; onExit(fn:()=>void):void }
const children=new Set<number>();
/** Development verification only; never exposed through any model tool. */
export const ownedNativeChildren=():number[]=>[...children];
export function processTransport():Transport {
  const helper=fileURLToPath(new URL('../helper/bootstrap.ps1',import.meta.url));
  const executable=join(process.env.SystemRoot ?? 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  if(process.platform!=='win32'||process.arch!=='x64') throw new MkError('UNSUPPORTED_PLATFORM','Windows x64 interactive desktop is required.');
  if(!existsSync(helper)) throw new MkError('HELPER_START_FAILED','Bundled helper is missing.');
  const child:ChildProcessWithoutNullStreams=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-ParentPid',String(process.pid)],{cwd:dirname(helper),windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});
  if(child.pid)children.add(child.pid);
  child.stderr.on('data',()=>{}); // Never echo native exceptions or desktop data into the host log.
  let exited=false; const exits=new Set<()=>void>();
  const exit=()=>{if(exited)return;exited=true;if(child.pid)children.delete(child.pid);for(const fn of exits)fn();}; child.on('error',exit);child.on('exit',exit);
  child.stdin.on('error',()=>{child.kill();exit();});
  child.stdout.on('error',()=>{child.kill();exit();});
  return {write:value=>{if(exited||!child.stdin.writable)throw new MkError('PROTOCOL_ERROR','Helper is not writable.');child.stdin.write(value);},kill:()=>{child.kill();},onData:fn=>{child.stdout.on('data',fn);},onExit:fn=>{exits.add(fn);if(exited)queueMicrotask(fn);}};
}
interface Pending { resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>; detach:()=>void; method:string;run:string }
export class HelperBridge {
  private transport:Transport|undefined;
  private readonly nonce=id();
  private pending=new Map<string,Pending>();
  private decoder=new StringDecoder('utf8');
  private line=''; private bytes=0; private dead=false;
  private exitPromise:Promise<void>|undefined;
  onStop:((reason:string,run:string)=>void)|undefined;
  get started():boolean {return this.transport!==undefined;}
  constructor(private readonly factory:()=>Transport=processTransport) {}
  private start():void {
    if(this.dead)throw new MkError('HELPER_START_FAILED','Bridge is disposed or faulty; no operation is replayed.');
    if(this.transport)return;
    const t=this.factory(); this.transport=t;
    let exited:()=>void=()=>{};this.exitPromise=new Promise<void>(resolve=>{exited=resolve;});
    t.onData(chunk=>this.data(chunk));t.onExit(()=>{exited();this.broken(new MkError('INPUT_UNKNOWN','Helper exited. Inspect the target before any new input.','unknown'));});
  }
  private broken(error:MkError):void {
    if(this.dead)return;this.dead=true;
    for(const p of this.pending.values()){clearTimeout(p.timer);p.detach();p.reject(p.method==='act'?error:new MkError('PROTOCOL_ERROR','Helper transport became unavailable.'));}
    this.pending.clear();this.transport?.kill();this.onStop?.('HELPER_FAILED','');
  }
  private data(chunk:Buffer):void {
    if(this.dead)return;
    // Bound each line before accumulating decoded strings, including split UTF-8 sequences.
    for(let start=0;start<chunk.length;) {
      const at=chunk.indexOf(10,start),end=at<0?chunk.length:at;const piece=chunk.subarray(start,end);
      this.bytes+=piece.length;if(this.bytes>4*1024*1024){this.broken(new MkError('PROTOCOL_ERROR','Helper response exceeds the protocol budget.'));return;}
      this.line+=this.decoder.write(piece);
      if(at<0)break;
      const line=this.line.replace(/\r$/,'');this.line='';this.bytes=0;
      try {this.message(JSON.parse(line));}catch{this.broken(new MkError('PROTOCOL_ERROR','Malformed helper response.'));return;}
      start=at+1;
    }
  }
  private message(raw:unknown):void {
    const m=object(raw);
    if(m.protocol!==PROTOCOL||m.nonce!==this.nonce)throw new MkError('PROTOCOL_ERROR','Protocol identity mismatch.');
    if(m.event==='stop') {if(typeof m.run!=='string'||typeof m.reason!=='string')throw new Error('bad stop');this.onStop?.(m.reason,m.run);return;}
    if(typeof m.id!=='string'||typeof m.run!=='string')throw new Error('missing identity');
    const p=this.pending.get(m.id);if(!p)return; // Late/cancelled responses never update state.
    if(m.run!==p.run)throw new Error('run mismatch');
    // Validate the complete response while the request still has its timeout and
    // rejection handler. A malformed error must not strand a removed Promise.
    let rejection:MkError|undefined;
    if(m.ok===false) {
      const e=object(m.error);const code=typeof e.code==='string'?e.code:'PROTOCOL_ERROR';
      const execution=['not_sent','sent','partially_sent','unknown'].includes(String(e.execution))?e.execution as NativeReceipt['execution']:(p.method==='act'?'unknown':'not_sent');
      rejection=new MkError(code,'Windows helper rejected this operation; inspect the stage and error code before recovery.',execution,diagnosticDetails(e.details));
    }else if(m.ok!==true)throw new MkError('PROTOCOL_ERROR','Response has no boolean outcome.');
    this.pending.delete(m.id);clearTimeout(p.timer);p.detach();
    if(rejection)p.reject(rejection);else p.resolve(m.value);
  }
  request(method:string,params:Obj,run:string,signal:AbortSignal,timeoutMs:number):Promise<unknown> {
    signal.throwIfAborted();this.start();const requestId=id();
    const line=JSON.stringify({protocol:PROTOCOL,nonce:this.nonce,id:requestId,run,method,params})+'\n';
    if(Buffer.byteLength(line)>256*1024)throw new MkError('INVALID_ARGUMENT','Helper request too large.');
    return new Promise((resolve,reject)=>{
      const expire=(code:string)=>{
        const p=this.pending.get(requestId);if(!p)return;this.pending.delete(requestId);clearTimeout(p.timer);p.detach();
        reject(new MkError(code,'Request stopped; input is never automatically replayed.',method==='act'?'unknown':'not_sent'));
        // Out-of-band end can be read while UIA/input worker is running.
        if(method!=='end')void this.request('end',{},run,new AbortController().signal,3000).catch(()=>this.broken(new MkError('CONTROL_CLOSE_FAILED','Helper cleanup could not be confirmed.','unknown')));
      };
      const abort=()=>expire(signal.reason instanceof MkError?signal.reason.code:'USER_STOPPED');const timer=setTimeout(()=>expire('HELPER_TIMEOUT'),timeoutMs);
      const detach=()=>signal.removeEventListener('abort',abort);
      this.pending.set(requestId,{resolve,reject,timer,detach,method,run});signal.addEventListener('abort',abort,{once:true});
      try {this.transport!.write(line);}catch {expire('PROTOCOL_ERROR');}
    });
  }
  async dispose():Promise<void> {
    this.dead=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.detach();p.reject(new MkError('USER_STOPPED','Plugin disposed.','unknown'));}this.pending.clear();this.transport?.kill();this.transport=undefined;
    if(this.exitPromise){let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([this.exitPromise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new MkError('CONTROL_CLOSE_FAILED','Owned helper process exit was not confirmed.')),3000);})]);}finally{if(timer)clearTimeout(timer);}}
  }
}
export class WindowsBackend implements Backend {
  private bridge:HelperBridge|undefined;
  private idle:ReturnType<typeof setTimeout>|undefined;
  private inputAdmitted=false;
  onStop:((reason:string,run:string)=>void)|undefined;
  constructor(private readonly factory:()=>HelperBridge=()=>new HelperBridge()){}
  private get():HelperBridge {if(!this.bridge){this.bridge=this.factory();this.bridge.onStop=(r,run)=>this.onStop?.(r,run);}return this.bridge;}
  async begin(run:string,settings:Settings,signal:AbortSignal):Promise<void>{if(this.idle)clearTimeout(this.idle);this.idle=undefined;const value=object(await this.get().request('begin',{settings},run,signal,30000));if(value.inputReady!==true||value.protocol!==PROTOCOL||value.version!==VERSION)throw new MkError('HOST_CAPABILITY_MISSING','Native handshake did not establish the required capabilities and matching version.');}
  async targets(run:string,query:string|undefined,signal:AbortSignal):Promise<{windows:WindowIdentity[];total:number;truncated:boolean}>{return await this.get().request('targets',query===undefined?{}:{query,aliases:appSearchAliases(query)},run,signal,3000) as {windows:WindowIdentity[];total:number;truncated:boolean};}
  async observe(run:string,window:WindowIdentity,signal:AbortSignal,includeImage=true,detail:'compact'|'expanded'='compact'):Promise<Observation>{return await this.get().request('observe',{window,includeImage,detail},run,signal,8000) as Observation;}
  async act(run:string,window:WindowIdentity,observation:Observation,request:Extract<Request,{tool:'mk_mouse'|'mk_keyboard'}>,signal:AbortSignal,includeImage=true):Promise<NativeReceipt>{this.inputAdmitted=true;return await this.get().request('act',{window,observation:{fingerprint:observation.fingerprint},request,includeImage},run,signal,40000) as NativeReceipt;}
  async status(run:string):Promise<{inputReady:boolean;overlayVisible:boolean;pendingInputs:number}>{if(!this.bridge)return {inputReady:false,overlayVisible:false,pendingInputs:0};const r=object(await this.bridge.request('status',{},run,new AbortController().signal,1200));if(typeof r.inputReady!=='boolean'||typeof r.overlayVisible!=='boolean'||!Number.isSafeInteger(r.pendingInputs))throw new MkError('PROTOCOL_ERROR','Invalid status response.');return r as {inputReady:boolean;overlayVisible:boolean;pendingInputs:number};}
  async end(run:string):Promise<void>{
    if(!this.bridge||!this.bridge.started)return;
    try{const r=object(await this.bridge.request('end',{},run,new AbortController().signal,3000));if(r.inputReleased!==true||r.overlayVisible!==false||r.pendingInputs!==0)throw new MkError('CONTROL_CLOSE_FAILED','Native input release was not confirmed.','unknown');}
    catch(error){
      if(this.inputAdmitted)throw error; // A killed input worker cannot prove that injected keys were released.
      const old=this.bridge;old.onStop=undefined;await old.dispose();if(this.bridge===old)this.bridge=undefined;return;
    }
    this.inputAdmitted=false;
    if(this.idle)clearTimeout(this.idle);this.idle=setTimeout(()=>{const old=this.bridge;this.bridge=undefined;if(old){old.onStop=undefined;void old.dispose().catch(()=>{});}},120000);this.idle.unref();
  }
  async dispose():Promise<void>{if(this.idle)clearTimeout(this.idle);if(this.bridge)this.bridge.onStop=undefined;await this.bridge?.dispose();this.bridge=undefined;}
}
