import type { NativeReceipt, Observation, Settings, WindowIdentity, Request, WaitFor, Rect, InputLayoutInfo } from '../shared/contracts.js';
export interface Backend {
  begin(run:string, settings:Settings, signal:AbortSignal):Promise<void>;
  targets(run:string,query:string|undefined,signal:AbortSignal):Promise<{windows:WindowIdentity[];total:number;truncated:boolean}>;
  observe(run:string,window:WindowIdentity,signal:AbortSignal,includeImage?:boolean,detail?:'compact'|'expanded',savePath?:string,region?:Rect,waitFor?:WaitFor):Promise<Observation>;
  act(run:string,window:WindowIdentity,observation:Observation,request:Extract<Request,{tool:'mk_mouse'|'mk_keyboard'}>,signal:AbortSignal,includeImage?:boolean):Promise<NativeReceipt>;
  end(run:string):Promise<void|{inputLayout?:InputLayoutInfo}>;
  status(run:string):Promise<{inputReady:boolean;overlayVisible:boolean;pendingInputs:number;inputLayout?:InputLayoutInfo}>;
  dispose():Promise<void>;
  onStop?:((reason:string,run:string)=>void)|undefined;
}
export interface Scope { readonly session:object; readonly agent:object; readonly id:string }
export interface Authority {
  task(scope:Scope):string;
  authorize(scope:Scope,window:WindowIdentity,signal:AbortSignal):Promise<void>;
  stop(scope:Scope,task?:string):void;
}
