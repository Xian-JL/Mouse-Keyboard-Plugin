import { performance } from 'node:perf_hooks';
import { DEFAULTS, MkError, id, mapPoint, parseRequest,diagnosticDetails } from '../shared/contracts.js';
import type { Settings, ControlState, WindowIdentity, Observation, Obj, Request, NativeReceipt } from '../shared/contracts.js';
import type { Authority, Backend, Scope } from './backend.js';
interface Entry {scope:Scope;state:ControlState;run:string|null;epoch:number;task:string|null;reason:string;halted:boolean;abort:AbortController;pending:boolean;targets:Map<string,WindowIdentity>;snapshot:{token:string;target:string;at:number;data:Observation;imageAvailable:boolean}|null;timer:ReturnType<typeof setTimeout>|undefined;closing:Promise<Obj>|undefined}
export class Controller {
  private entries=new Map<object,Entry>();private owner:Entry|undefined;private disposed=false;
  constructor(private readonly backend:Backend,private readonly authority:Authority,private readonly settings:()=>Settings=()=>({...DEFAULTS}),private readonly now:()=>number=()=>performance.now()) {
    backend.onStop=(reason,run)=>{for(const e of this.entries.values())if(e.run!==null&&(!run||e.run===run)){void this.close(e,reason,reason!=='IDLE_CLOSED');}};
  }
  private entry(scope:Scope):Entry {
    let e=this.entries.get(scope.agent);
    if(e&&e.scope.session!==scope.session)throw new MkError('NOT_AUTHORIZED','Agent/session identity changed.');
    if(!e){e={scope,state:'closed',run:null,epoch:0,task:null,reason:'initial',halted:false,abort:new AbortController(),pending:false,targets:new Map(),snapshot:null,timer:undefined,closing:undefined};this.entries.set(scope.agent,e);}
    return e;
  }
  private async status(e:Entry,transition='completed'):Promise<Obj> {const epoch=e.epoch;let native:{inputReady:boolean;overlayVisible:boolean;pendingInputs:number}|undefined;let authorized=false;try{this.authority.task(e.scope);authorized=true;}catch{}try{if(e.run!==null)native=await this.backend.status(e.run);}catch{}return {transition,controlState:e.state,run:e.run,controlEpoch:e.epoch,reason:e.reason,inputGateOpen:epoch===e.epoch&&native?.inputReady===true&&['ready','observing','acting'].includes(e.state),inputReleased:e.run===null&&e.state!=='faulted',pendingInputs:e.pending&&e.state==='acting'?1:0,overlayVisible:e.run===null?false:(epoch===e.epoch?native?.overlayVisible??null:null),referencesInvalidated:e.targets.size===0&&e.snapshot===null,requiresHumanAuthorization:e.halted||!authorized};}
  private touch(e:Entry):void {if(e.timer)clearTimeout(e.timer);const expire=()=>{if(e.pending){e.timer=setTimeout(expire,100);e.timer.unref();return;}void this.close(e,'idle',false);};e.timer=setTimeout(expire,this.settings().controlIdleMs);e.timer.unref();}
  private async begin(e:Entry,signal:AbortSignal):Promise<Obj> {
    if(this.disposed||!this.settings().enabled)throw new MkError('CONFIG_UNAVAILABLE','Plugin is disabled or disposed.');
    if(e.halted||e.state==='stopped')throw new MkError('USER_STOPPED','Human stop cannot be reset by a model.');
    if(e.state==='closing')throw new MkError('CONTROL_CLOSING','Wait for input cleanup.');
    if(e.state==='faulted')throw new MkError('CONTROL_CLOSE_FAILED','Confirm cleanup with end before beginning again.');
    if(e.run!==null)return this.status(e,e.state==='opening'?'pending':'completed');
    const task=this.authority.task(e.scope);
    if(this.owner&&this.owner!==e)throw new MkError('BUSY','Another run owns the desktop; requests are not queued.');
    this.owner=e;e.state='opening';e.run=id();e.epoch++;e.task=task;e.reason='begin';e.abort=new AbortController();
    const epoch=e.epoch;const fused=AbortSignal.any([signal,e.abort.signal]);
    try {await this.backend.begin(e.run,this.settings(),fused);if(fused.aborted||e.epoch!==epoch||e.state!=='opening')throw new MkError('USER_STOPPED','Opening was cancelled.');e.state='ready';this.touch(e);return this.status(e);}catch(error){if(e.epoch===epoch)await this.close(e,'begin_failed',false);throw error;}
  }
  private close(e:Entry,reason:string,stopped:boolean):Promise<Obj> {
    if(stopped){e.halted=true;this.authority.stop(e.scope,e.task??undefined);}
    if(e.closing)return e.closing;
    if(e.run===null){if(e.halted)e.state='stopped';e.reason=reason;return this.status(e);}
    const run=e.run; e.epoch++;e.abort.abort(new MkError(stopped?'USER_STOPPED':'CONTROL_CLOSED','This run is ending.'));e.state='closing';e.snapshot=null;e.targets.clear();if(e.timer)clearTimeout(e.timer);e.timer=undefined;e.reason=reason;
    e.closing=(async()=>{
      try {await this.backend.end(run);e.run=null;e.pending=false;e.state=e.halted?'stopped':'closed';if(this.owner===e)this.owner=undefined;return this.status(e);}
      catch {e.state=e.halted?'stopped':'faulted';return {...await this.status(e,'failed'),error:{code:'CONTROL_CLOSE_FAILED',message:'Input release could not be confirmed; do not replay actions.'}};}
      finally{e.closing=undefined;}
    })();return e.closing;
  }
  async execute(scope:Scope,tool:string,args:unknown,signal:AbortSignal,includeImage=true):Promise<Obj> {
    const req=parseRequest(tool,args);const e=this.entry(scope);
    if(req.tool==='mk_control'){
      if(req.action==='status')return this.status(e,e.state==='closing'?'pending':'completed');
      if(req.action==='end')return this.close(e,'model_end',e.state==='stopped');
      return this.begin(e,signal);
    }
    if(this.disposed||!this.settings().enabled)throw new MkError('CONFIG_UNAVAILABLE','Plugin is disabled.');
    if(e.state==='stopped')throw new MkError('USER_STOPPED','A human must resume after stop.');
    if(e.state==='closing')throw new MkError('CONTROL_CLOSING','Input cleanup is in progress.');
    if(e.state!=='ready'||!e.run){if(e.pending)throw new MkError('BUSY','One desktop operation is already in flight.');throw new MkError('CONTROL_CLOSED','Call mk_control begin before desktop observation or input.');}
    if(this.authority.task(scope)!==e.task){await this.close(e,'task_changed',false);throw new MkError('NOT_AUTHORIZED','Task changed; begin a fresh run.');}
    const run=e.run,epoch=e.epoch;const fused=AbortSignal.any([signal,e.abort.signal]);e.pending=true;e.state=req.tool==='mk_observe'?'observing':'acting';let inputInvoked=false;let refreshLease=true;let knownExecution:NativeReceipt['execution']='not_sent';
    const valid=()=>{if(fused.aborted||epoch!==e.epoch||this.disposed)throw new MkError('CONTROL_CLOSED','Run changed; late results discarded.',knownExecution);};
    try {
      let result:Obj;
      if(req.tool==='mk_observe'&&req.mode==='targets') {
        const r=await this.backend.targets(run,req.query,fused);valid();e.targets.clear();e.snapshot=null;
        const targets=r.windows.map(w=>{const token=id();e.targets.set(token,w);return {target:token,app:w.app,title:w.title,minimized:w.minimized,foreground:w.foreground,operable:!w.blocked,reason:w.blocked??null};});result={targets,total:r.total,truncated:r.truncated};
      } else {
        const target='target' in req?req.target:'';const w=e.targets.get(target);if(!w)throw new MkError('TARGET_CHANGED','Unknown target; discover again.');
        if(w.blocked)throw new MkError(w.blocked,'This target is not permitted.');
        await this.authority.authorize(scope,w,fused);valid();
        if(req.tool==='mk_observe') {const observation=await this.backend.observe(run,w,fused,includeImage,req.detail);valid();result=this.keep(e,target,observation);}
        else {
          const snap=e.snapshot;e.snapshot=null;
          if(!snap||snap.token!==req.snapshot||snap.target!==target||this.now()-snap.at>this.settings().snapshotTtlMs)throw new MkError('STALE_SNAPSHOT','Observe the current target before every action.');
          if(req.tool==='mk_mouse'&&req.element===undefined&&!snap.imageAvailable)throw new MkError('HOST_CAPABILITY_MISSING','This model did not receive the image. Use observed element refs; do not guess pixel coordinates.');
          if(req.tool==='mk_mouse'&&req.element===undefined)mapPoint(req.x!,req.y!,snap.data.captureRect,snap.data.imageSize);
          if(req.tool==='mk_mouse'&&req.element!==undefined&&!snap.data.elements.some(x=>x.ref===req.element))throw new MkError('STATE_CHANGED','Element was not in this snapshot.');
          if(req.tool==='mk_keyboard'&&req.action==='type'&&req.text.includes('\n')&&snap.data.focusedElement?.multiline!=='true')throw new MkError('MULTILINE_UNCONFIRMED','The focused editor was not confirmed multiline.');
          inputInvoked=true;knownExecution='unknown';const receipt=await this.backend.act(run,w,snap.data,req,fused,includeImage);if(receipt&&['not_sent','sent','partially_sent','unknown'].includes(receipt.execution))knownExecution=receipt.execution;valid();
          this.validateReceipt(receipt);
          const {observation,...facts}=receipt;result={actionId:id(),target,...facts};
          if(receipt.execution==='unknown'||['CONTROL_CLOSE_FAILED','INPUT_UNKNOWN','USER_STOPPED','HELPER_TIMEOUT','PROTOCOL_ERROR'].includes(receipt.error?.code??'')){
            // Error receipts are successful transport responses, not successful operations.
            // Preserve sending facts, invalidate evidence and close before admitting more input.
            result.control=await this.close(e,receipt.error?.code??'INPUT_UNKNOWN',receipt.error?.code==='USER_STOPPED');
            return result;
          }
          if(receipt.execution==='not_sent'&&receipt.error)refreshLease=false;
          if(observation)result.observation=this.keep(e,target,observation);
        }
      }
      valid();if(refreshLease)this.touch(e);return result;
    } catch(error) {
      const e2=error instanceof MkError?error:new MkError(inputInvoked?'INPUT_UNKNOWN':'PROTOCOL_ERROR','Backend failed; input must not be automatically replayed.',inputInvoked?'unknown':'not_sent');
      if(epoch===e.epoch&&(fused.aborted||['USER_STOPPED','INPUT_UNKNOWN','HELPER_TIMEOUT','PROTOCOL_ERROR'].includes(e2.code)))await this.close(e,fused.aborted?'caller_cancelled':e2.code,true);
      throw e2;
    } finally {if(epoch===e.epoch){e.pending=false;if(e.state==='observing'||e.state==='acting')e.state='ready';}}
  }
  private validateReceipt(r:NativeReceipt):void {if(!r||!['not_sent','sent','partially_sent','unknown'].includes(r.execution)||!['unverified','observed_change','verified','mismatch'].includes(r.verification))throw new MkError('PROTOCOL_ERROR','Invalid input receipt.','unknown');if(r.execution!=='sent'&&r.verification==='verified')throw new MkError('PROTOCOL_ERROR','Incomplete input cannot be marked verified.','unknown');if(r.error?.details){const details=diagnosticDetails(r.error.details);if(details)r.error.details=details;else delete r.error.details;}}
  private keep(e:Entry,target:string,data:Observation):Obj {
    if(!data||!data.window||typeof data.png!=='string'||data.png.length>3*1024*1024||!Array.isArray(data.elements)||!Number.isFinite(data.durationMs)||data.durationMs<0||data.durationMs>2500)throw new MkError('PROTOCOL_ERROR','Native observation is invalid or inconsistent.');
    const token=id();e.snapshot={token,target,at:this.now(),data,imageAvailable:false};const {png,...rest}=data;return {target,snapshot:token,coordinateSpace:'window-image-pixels',elementRectSpace:'screen-physical-pixels',...rest,imageBytes:png};
  }
  imagePresented(scope:Scope,token:string,available:boolean):void {const e=this.entries.get(scope.agent);if(e?.scope.session===scope.session&&e.snapshot?.token===token)e.snapshot.imageAvailable=available;}
  invalidateObservation(scope:Scope):void {const e=this.entries.get(scope.agent);if(e?.scope.session===scope.session)e.snapshot=null;}
  async stopSession(session:object,reason:string,manual=false):Promise<void>{await Promise.all([...this.entries.values()].filter(e=>e.scope.session===session).map(e=>this.close(e,reason,manual)));}
  async suspend(reason:string):Promise<void>{await Promise.all([...this.entries.values()].map(e=>this.close(e,reason,false)));}
  async forgetAgent(agent:object):Promise<void>{const e=this.entries.get(agent);if(e){await this.close(e,'agent_disposed',false);if(e.run===null)this.entries.delete(agent);}}
  async forgetSession(session:object):Promise<void>{await this.stopSession(session,'session_disposed');for(const [agent,e] of this.entries)if(e.scope.session===session&&e.run===null)this.entries.delete(agent);}
  humanResumed(session:object):void{for(const e of this.entries.values())if(e.scope.session===session&&e.state==='stopped'&&e.run===null){e.state='closed';e.halted=false;}}
  async dispose():Promise<void>{this.disposed=true;await Promise.all([...this.entries.values()].map(e=>this.close(e,'disposed',false)));for(const e of this.entries.values())if(e.timer)clearTimeout(e.timer);this.entries.clear();this.owner=undefined;await this.backend.dispose();}
}
