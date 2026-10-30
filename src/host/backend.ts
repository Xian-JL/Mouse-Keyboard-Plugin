import type { NativeReceipt, Observation, Settings, WindowIdentity, Request } from '../shared/contracts.js';
export interface Backend {
  begin(run:string, settings:Settings, signal:AbortSignal):Promise<void>;
  targets(run:string,query:string|undefined,signal:AbortSignal):Promise<{windows:WindowIdentity[];total:number;truncated:boolean}>;
  observe(run:string,window:WindowIdentity,signal:AbortSignal):Promise<Observation>;
  act(run:string,window:WindowIdentity,observation:Observation,request:Extract<Request,{tool:'mk_mouse'|'mk_keyboard'}>,signal:AbortSignal):Promise<NativeReceipt>;
  end(run:string):Promise<void>;
  status(run:string):Promise<{inputReady:boolean;overlayVisible:boolean;pendingInputs:number}>;
  dispose():Promise<void>;
  onStop?:((reason:string,run:string)=>void)|undefined;
}
export interface Scope { readonly session:object; readonly agent:object; readonly id:string }
export interface Authority {
  task(scope:Scope):string;
  authorize(scope:Scope,window:WindowIdentity,signal:AbortSignal):Promise<void>;
  stop(scope:Scope,task?:string):void;
}
