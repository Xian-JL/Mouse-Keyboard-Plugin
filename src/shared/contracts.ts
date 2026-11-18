import { randomUUID } from 'node:crypto';
import {DEFAULTS,NUMBER_RANGES} from './settings.js';
import type {Settings,HumanizeProfile} from './settings.js';
export {DEFAULTS};export type {Settings};

export const VERSION = '0.5.2';
export const PROTOCOL = 1;
export const KEYS = ['Enter','Tab','Shift+Tab','Escape','Backspace','Delete','Left','Right','Up','Down','Home','End','PageUp','PageDown','Ctrl+A','Ctrl+S','Ctrl+Home','Ctrl+End'] as const;
export type Key = typeof KEYS[number];
export type ControlState = 'inactive'|'closed'|'opening'|'ready'|'observing'|'acting'|'closing'|'stopped'|'faulted';
export type Execution = 'not_sent'|'sent'|'partially_sent'|'unknown';
export type Verification = 'unverified'|'observed_change'|'verified'|'mismatch';
export type InputMode = 'auto'|'unicode'|'scancode';
export type ObserveAmount = 'full'|'compact'|'none';
export type RequiredAction = 'none'|'reobserve'|'wait'|'rebegin'|'stop';
export type Json = null|boolean|number|string|Json[]|{[key:string]:Json};
export type Obj = Record<string, unknown>;
// The documented error table (spec section 12 / FR-11). Must stay in sync with the
// README table; a regression test compares both against this constant.
export const ERROR_CODES = ['INVALID_ARGUMENT','UNSUPPORTED_INPUT','NOT_AUTHORIZED','USER_BUSY','INPUT_INTERFERENCE','STATE_CHANGED','STALE_SNAPSHOT','OCCLUDED_TARGET','FOCUS_MISMATCH','PASSWORD_FIELD','MULTILINE_UNCONFIRMED','ELEMENT_NOT_FOUND','AMBIGUOUS_TARGET','SAVE_EXISTS','OBSERVATION_TIMEOUT','PROTOCOL_ERROR','CONTROL_CLOSE_FAILED','INPUT_UNKNOWN','USER_STOPPED','HUMANIZE_BUDGET_EXCEEDED'] as const;
export type ErrorCode = typeof ERROR_CODES[number];
const RETRYABLE = new Set<string>(['STATE_CHANGED','FOCUS_MISMATCH','OCCLUDED_TARGET','STALE_SNAPSHOT','USER_BUSY','INPUT_INTERFERENCE','INVALID_COORDINATE','ELEMENT_NOT_FOUND']);
const STOP = new Set<string>(['USER_STOPPED','CONTROL_CLOSE_FAILED','PROTOCOL_ERROR','HELPER_TIMEOUT']);
const REBEGIN = new Set<string>(['CONTROL_CLOSED','TARGET_CHANGED','CONFIG_UNAVAILABLE']);
/**
 * Single source of truth for retry safety (FR-05). A failure may only be retried
 * when nothing was sent AND the reason is transient; anything after a send is
 * never retryable, because replaying it may perform the action twice.
 */
export function recovery(code:string|undefined,execution:Execution,verification?:Verification):{retryable:boolean;requiredAction:RequiredAction} {
  if(code&&STOP.has(code))return {retryable:false,requiredAction:'stop'};
  if(execution!=='not_sent'){
    if(!code&&(verification==='verified'||verification==='observed_change'))return {retryable:false,requiredAction:'none'};
    if(execution==='unknown'&&!code)return {retryable:false,requiredAction:'wait'};
    return {retryable:false,requiredAction:'reobserve'};
  }
  if(code&&REBEGIN.has(code))return {retryable:false,requiredAction:'rebegin'};
  return {retryable:!!code&&RETRYABLE.has(code),requiredAction:code?'reobserve':'none'};
}
export class MkError extends Error {
  public readonly retryable:boolean;
  public readonly requiredAction:RequiredAction;
  constructor(public readonly code:string, message:string, public readonly execution:Execution='not_sent',public readonly details?:Obj) {
    super(message); this.name='MkError';
    const advice=recovery(code,execution);this.retryable=advice.retryable;this.requiredAction=advice.requiredAction;
  }
}
export function diagnosticDetails(raw:unknown):Obj|undefined {
 if(raw===undefined||raw===null)return undefined;
 const bad=():never=>{throw new MkError('PROTOCOL_ERROR','Invalid bounded diagnostic details.','unknown');};
 if(typeof raw!=='object'||Array.isArray(raw)||JSON.stringify(raw).length>2048)return bad();
 const result:Obj={};
 for(const [key,value] of Object.entries(raw)){
  if(['stage','check','requiredAction'].includes(key)){if(typeof value!=='string'||!/^[a-z][a-z0-9-]{0,79}$/.test(value))return bad();if(key==='stage'&&!['visual-comparison','input-arbitration','window-activation','observation','snapshot','focus-validation','element-validation','authorization','native-validation','humanization'].includes(value))return bad();result[key]=value;}
  else if(key==='space'){if(value!=='screen-physical-pixels')return bad();result[key]=value;}
  else if(['region','diffBbox','captureRect'].includes(key)){if(value===null){result[key]=null;continue;}if(!value||typeof value!=='object'||Array.isArray(value))return bad();const rect=value as Obj;if(Object.keys(rect).length!==4||!['left','top','width','height'].every(k=>Number.isSafeInteger(rect[k])&&Math.abs(Number(rect[k]))<=2147483647)||Number(rect.width)<0||Number(rect.height)<0)return bad();result[key]={...rect};}
  // Ambiguous element targets: bounded refs and accessible names, never editor text.
  else if(key==='candidates'){
   if(!Array.isArray(value)||value.length<1||value.length>8)return bad();
   const list:Obj[]=[];
   for(const item of value){if(!item||typeof item!=='object'||Array.isArray(item))return bad();const c=item as Obj;const keys=Object.keys(c);if(keys.length!==3||!['ref','name','role'].every(k=>keys.includes(k)))return bad();
    const ref=c.ref,name=c.name,role=c.role;if(typeof ref!=='string'||!ref.length||ref.length>64)return bad();if(typeof name!=='string'||name.length>128)return bad();if(typeof role!=='string'||role.length>64)return bad();list.push({ref,name,role});}
   result[key]=list;
  }
  else if(['changedPixels','significantPixels','maxChannelDelta','dpi','snapshotAgeMs','waitedMs','plannedDelayMs','budgetMs'].includes(key)){if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>2147483647)return bad();result[key]=value;}
  else if(key==='activationAttempted'){if(typeof value!=='boolean')return bad();result[key]=value;}
  else return bad();
 }
 return result;
}
export const fail = (code:string,message:string):never => { throw new MkError(code,message); };
export const object = (v:unknown):Obj => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v)!==Object.prototype) return fail('INVALID_ARGUMENT','Expected a plain JSON object.');
  return v as Obj;
};
export function exact(v:Obj,keys:readonly string[]):void { for (const k of Object.keys(v)) if (!keys.includes(k)) fail('INVALID_ARGUMENT',`Unknown field: ${k}`); }
export function string(v:unknown,key:string,max=256):string { if (typeof v!=='string'||!v.length||v.length>max) return fail('INVALID_ARGUMENT',`Invalid ${key}.`); return v; }
export function integer(v:unknown,key:string,min:number,max:number):number { if (typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max) return fail('INVALID_ARGUMENT',`Invalid ${key}.`); return v; }
export function boolean(v:unknown,key:string):boolean { if(typeof v!=='boolean') return fail('INVALID_ARGUMENT',`Invalid ${key}.`); return v; }
function optionalBoolean(v:unknown,key:string):boolean|undefined { return v===undefined?undefined:boolean(v,key); }
// Optional evidence file: only the captured PNG is ever written, only to an
// absolute .png path inside an existing directory, and never over an existing file.
export function evidencePath(v:unknown):string {
  if (typeof v!=='string'||v.length<8||v.length>240) return fail('INVALID_ARGUMENT','Invalid savePath.');
  if (/[\u0000-\u001f\u007f]/u.test(v)) return fail('INVALID_ARGUMENT','Invalid savePath.');
  if (!/^(?:[A-Za-z]:[\\/]|\\\\)/u.test(v)||!/\.png$/iu.test(v)) return fail('INVALID_ARGUMENT','savePath must be an absolute Windows path ending in .png.');
  return v;
}
export const id = ():string => randomUUID();
export function decodeSettings(value:unknown):Settings {
  const v=object(value); exact(v,Object.keys(DEFAULTS)); const result={...DEFAULTS};
  for (const k of ['enabled','diagnosticsEnabled','humanizeEnabled'] as const) { if (v[k]!==undefined) { if (typeof v[k]!=='boolean') fail('INVALID_CONFIG',`Invalid ${k}.`); result[k]=v[k] as boolean; } }
  if(v.humanizeProfile!==undefined){if(v.humanizeProfile!=='natural'&&v.humanizeProfile!=='slow')fail('INVALID_CONFIG','Invalid humanizeProfile.');result.humanizeProfile=v.humanizeProfile as 'natural'|'slow';}
  for (const [key,[min,max]] of Object.entries(NUMBER_RANGES)) {const k=key as keyof typeof NUMBER_RANGES;if(v[k]!==undefined) result[k]=integer(v[k],k,min,max);}
  return result;
}
export interface Rect {left:number;top:number;width:number;height:number}
export interface WindowIdentity { hwnd:string; pid:number; created:string; app:string; title:string; rect:Rect; minimized:boolean; foreground:boolean; blocked?:string }
// Region is expressed in returned-image pixels, the same space as mk_mouse x/y.
function regionValue(v:unknown):Rect {
  const r=object(v);exact(r,['left','top','width','height']);
  return {left:integer(r.left,'region.left',-2147483648,2147483647),top:integer(r.top,'region.top',-2147483648,2147483647),width:integer(r.width,'region.width',1,1600),height:integer(r.height,'region.height',1,1200)};
}
export type WaitFor =
 | {kind:'text';value:string;exact:boolean;timeoutMs:number}
 | {kind:'element';value:string;role?:string;exact:boolean;timeoutMs:number}
 | {kind:'pixel';region:Rect;mode:'stable'|'changed';settleSamples:number;minChangedPixels:number;timeoutMs:number};
function waitForValue(v:unknown):WaitFor {
  const w=object(v);const timeoutMs=w.timeoutMs===undefined?5000:integer(w.timeoutMs,'timeoutMs',1000,30000);
  if(w.kind==='text'){exact(w,['kind','value','exact','timeoutMs']);return {kind:'text',value:string(w.value,'value',256),exact:optionalBoolean(w.exact,'exact')??false,timeoutMs};}
  if(w.kind==='element'){exact(w,['kind','value','role','exact','timeoutMs']);return {kind:'element',value:string(w.value,'value',256),...(w.role===undefined?{}:{role:string(w.role,'role',64)}),exact:optionalBoolean(w.exact,'exact')??false,timeoutMs};}
  if(w.kind==='pixel'){
    exact(w,['kind','region','mode','settleSamples','minChangedPixels','timeoutMs']);
    if(w.mode!=='stable'&&w.mode!=='changed')return fail('INVALID_ARGUMENT','Invalid waitFor.mode.');
    return {kind:'pixel',region:regionValue(w.region),mode:w.mode,settleSamples:w.settleSamples===undefined?3:integer(w.settleSamples,'settleSamples',2,10),minChangedPixels:w.minChangedPixels===undefined?64:integer(w.minChangedPixels,'minChangedPixels',1,4096),timeoutMs};
  }
  return fail('INVALID_ARGUMENT','Invalid waitFor.kind.');
}
export type Request = {tool:'mk_control';action:'begin'|'end'|'status'}|{tool:'mk_observe';mode:'targets';query?:string}|{tool:'mk_observe';mode:'window';target:string;detail?:'compact'|'expanded';savePath?:string;region?:Rect;waitFor?:WaitFor}|{tool:'mk_mouse';action:'click';target:string;snapshot:string;element?:string;elementName?:string;elementRole?:string;elementExact?:boolean;x?:number;y?:number;savePath?:string;region?:Rect;observe?:ObserveAmount;humanize?:HumanizeProfile}|{tool:'mk_keyboard';action:'type';target:string;snapshot:string;text:string;settleMs?:number;paceMs?:number;inputMode?:InputMode;savePath?:string;region?:Rect;observe?:ObserveAmount;humanize?:HumanizeProfile}|{tool:'mk_keyboard';action:'key';target:string;snapshot:string;key:Key;settleMs?:number;savePath?:string;region?:Rect;observe?:ObserveAmount;humanize?:HumanizeProfile};
function observeAmount(v:unknown):ObserveAmount|undefined { if(v===undefined)return undefined; if(v!=='full'&&v!=='compact'&&v!=='none')return fail('INVALID_ARGUMENT','Invalid observe amount.'); return v; }
function humanizeValue(v:unknown):HumanizeProfile|undefined {if(v===undefined)return undefined;if(v!=='off'&&v!=='natural'&&v!=='slow')return fail('INVALID_ARGUMENT','Invalid humanize profile.');return v;}
function settleValue(v:unknown):number|undefined { return v===undefined?undefined:integer(v,'settleMs',0,5000); }
export function parseRequest(tool:string,input:unknown):Request {
  const v=object(input);
  if(tool==='mk_control') { exact(v,['action']); if(!['begin','end','status'].includes(String(v.action))) fail('INVALID_ARGUMENT','Invalid control action.'); return {tool,action:v.action as 'begin'|'end'|'status'}; }
  if(tool==='mk_observe') {
    exact(v,['mode','target','query','detail','savePath','region','waitFor']);
    if(v.mode==='targets') { if(v.target!==undefined||v.detail!==undefined||v.savePath!==undefined||v.region!==undefined||v.waitFor!==undefined) fail('INVALID_ARGUMENT','targets does not accept target, detail, savePath, region or waitFor.'); if(v.query===undefined) return {tool,mode:'targets'}; const query=string(v.query,'query',256); if([...query].length>128) fail('INVALID_ARGUMENT','query too long.'); return {tool,mode:'targets',query}; }
    if(v.mode==='window') {
      if(v.query!==undefined) fail('INVALID_ARGUMENT','window does not accept query.');
      if(v.detail!==undefined&&!['compact','expanded'].includes(String(v.detail)))fail('INVALID_ARGUMENT','Invalid observation detail.');
      return {tool,mode:'window',target:string(v.target,'target'),...(v.detail!==undefined?{detail:v.detail as 'compact'|'expanded'}:{}),...(v.savePath===undefined?{}:{savePath:evidencePath(v.savePath)}),...(v.region===undefined?{}:{region:regionValue(v.region)}),...(v.waitFor===undefined?{}:{waitFor:waitForValue(v.waitFor)})};
    }
    return fail('INVALID_ARGUMENT','Invalid observation mode.');
  }
  if(tool==='mk_mouse') {
    exact(v,['action','target','snapshot','element','x','y','elementName','elementRole','elementExact','savePath','region','observe','humanize']); if(v.action!=='click') fail('INVALID_ARGUMENT','Only one left click is supported.');
    const base={tool:'mk_mouse' as const,action:'click' as const,target:string(v.target,'target'),snapshot:string(v.snapshot,'snapshot'),...(v.savePath===undefined?{}:{savePath:evidencePath(v.savePath)}),...(v.region===undefined?{}:{region:regionValue(v.region)}),...(observeAmount(v.observe)===undefined?{}:{observe:observeAmount(v.observe)!}),...(humanizeValue(v.humanize)===undefined?{}:{humanize:humanizeValue(v.humanize)!})};
    if(v.element!==undefined) {
      if(v.x!==undefined||v.y!==undefined) fail('INVALID_ARGUMENT','Choose element OR coordinates.');
      if(v.elementName!==undefined||v.elementRole!==undefined||v.elementExact!==undefined) fail('INVALID_ARGUMENT','Choose element OR elementName, not both.');
      return {...base,element:string(v.element,'element')};
    }
    if(v.elementName!==undefined) {
      if(v.x!==undefined||v.y!==undefined) fail('INVALID_ARGUMENT','Choose elementName OR coordinates.');
      if(v.elementExact!==undefined&&typeof v.elementExact!=='boolean') fail('INVALID_ARGUMENT','Invalid elementExact.');
      return {...base,elementName:string(v.elementName,'elementName',256),...(v.elementRole===undefined?{}:{elementRole:string(v.elementRole,'elementRole',64)}),...(v.elementExact===undefined?{}:{elementExact:v.elementExact as boolean})};
    }
    if(v.elementRole!==undefined||v.elementExact!==undefined) fail('INVALID_ARGUMENT','elementRole and elementExact require elementName.');
    return {...base,x:integer(v.x,'x',0,1599),y:integer(v.y,'y',0,1199)};
  }
  if(tool==='mk_keyboard') {
    exact(v,['action','target','snapshot','text','key','savePath','region','observe','settleMs','paceMs','inputMode','humanize']);
    const base={tool:'mk_keyboard' as const,target:string(v.target,'target'),snapshot:string(v.snapshot,'snapshot'),...(v.savePath===undefined?{}:{savePath:evidencePath(v.savePath)}),...(v.region===undefined?{}:{region:regionValue(v.region)}),...(observeAmount(v.observe)===undefined?{}:{observe:observeAmount(v.observe)!}),...(humanizeValue(v.humanize)===undefined?{}:{humanize:humanizeValue(v.humanize)!}),...(settleValue(v.settleMs)===undefined?{}:{settleMs:settleValue(v.settleMs)!})};
    if(v.action==='type') {
      if(v.key!==undefined) fail('INVALID_ARGUMENT','type does not accept key.');
      const raw=string(v.text,'text',64000); if(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/u.test(raw)||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(raw)) fail('UNSUPPORTED_INPUT','Unsupported text control or Unicode sequence.');
      const text=raw.replace(/\r\n?/g,'\n'); if([...text].length>16000||Buffer.byteLength(text)>65536) fail('UNSUPPORTED_INPUT','Text exceeds the bounded input budget.');
      const mode=v.inputMode===undefined?'auto':v.inputMode; if(mode!=='auto'&&mode!=='unicode'&&mode!=='scancode') fail('INVALID_ARGUMENT','Invalid inputMode.');
      const paceMs=v.paceMs===undefined?undefined:integer(v.paceMs,'paceMs',0,400);
      // A physical scancode plan only exists for ASCII; reject before anything is observed or sent.
      if(mode==='scancode'&&/[^\x00-\x7F]/u.test(text)) fail('UNSUPPORTED_INPUT','scancode input covers ASCII only; use inputMode unicode or auto.');
      return {...base,action:'type',text,...(paceMs===undefined?{}:{paceMs}),inputMode:mode as InputMode};
    }
    if(v.action==='key') {
      if(v.text!==undefined||!KEYS.includes(v.key as Key)) fail('UNSUPPORTED_INPUT','Key is outside the allowed set.');
      if(v.paceMs!==undefined||v.inputMode!==undefined) fail('INVALID_ARGUMENT','key does not accept paceMs or inputMode.');
      return {...base,action:'key',key:v.key as Key};
    }
  }
  return fail('INVALID_ARGUMENT','Unknown tool/action.');
}
export interface ElementInfo {ref:string;runtimeId:string;name:string;role:string;rect:Rect|null;offscreen?:boolean;enabled:boolean;password:boolean;editable:boolean;multiline:'true'|'false'|'unknown';value?:string;valueTruncated?:boolean;valuePreview?:boolean;valueUnavailable?:boolean;evidenceInFocusedElement?:boolean;selectionStart?:number;selectionEnd?:number}
export interface WaitForOutcome {kind:'text'|'element'|'pixel';matched:boolean;waitedMs:number;timeoutMs:number}
export interface Observation { window:WindowIdentity; captureRect:Rect; imageSize:{width:number;height:number}; png:string; saved?:{path:string;width:number;height:number;bytes:number}; elements:ElementInfo[]; focusedElement?:ElementInfo; fingerprint:string; capturedAt:string; durationMs:number; timings?:{uiaMs:number;captureMs:number;encodeMs:number;totalMs:number};imageEncoded?:boolean;detail?:'compact'|'expanded';coverage:{truncated:boolean;textTruncated:boolean;unstable?:boolean;availableElements?:number;deliveredElements?:number}; warnings:string[]; waitFor?:WaitForOutcome; error?:{code:string;message:string;details?:Obj} }
// The receipt envelope (FR-04): `observation` always exists, holding an observation or null.
export interface NativeReceipt {execution:Execution;verification:Verification;sentCodePoints?:number;reason?:string;retryable?:boolean;requiredAction?:RequiredAction;observation:Observation|null;observationError?:{code:string;message:string};deliveredAt?:string;settledMs?:number;humanization?:{profile:HumanizeProfile;dwellMs?:number;inputDurationMs?:number;plannedDelayMs?:number;mouseMoveEvents?:number;mouseMoveDurationMs?:number};diagnostics?:{inputTarget?:'editable'|'non-editable'};error?:{code:string;message:string;details?:Obj}}
export const COMPACT_ELEMENTS = 21;
/**
 * FR-08: the model-facing projection of a post-action observation. The native
 * full observation is never mutated; `none` returns null and `compact` keeps the
 * focused element plus at most 20 others with an honest delivered count.
 */
export function projectObservation(data:Observation,amount:ObserveAmount='full'):Observation|null {
  if(amount==='none')return null;
  if(amount!=='compact')return data;
  const focus=data.focusedElement;
  const others=data.elements.filter(e=>!focus||e.ref!==focus.ref);
  const elements=(focus?[focus,...others]:others).slice(0,COMPACT_ELEMENTS);
  return {...data,elements,coverage:{...data.coverage,availableElements:data.elements.length,deliveredElements:elements.length}};
}
export function mapPoint(x:number,y:number,rect:Rect,size:{width:number;height:number}):{x:number;y:number} {
  integer(x,'x',0,size.width-1); integer(y,'y',0,size.height-1);
  if(![rect.left,rect.top,rect.width,rect.height,size.width,size.height].every(Number.isFinite)||rect.width<=0||rect.height<=0||size.width<=0||size.height<=0) fail('INVALID_COORDINATE','Invalid image mapping.');
  return {x:Math.min(rect.left+rect.width-1,rect.left+Math.floor((x+.5)*rect.width/size.width)),y:Math.min(rect.top+rect.height-1,rect.top+Math.floor((y+.5)*rect.height/size.height))};
}
const regionSchema={type:'object',properties:{left:{type:'integer'},top:{type:'integer'},width:{type:'integer',minimum:1,maximum:1600},height:{type:'integer',minimum:1,maximum:1200}},required:['left','top','width','height'],additionalProperties:false};
const waitForSchema={type:'object',properties:{kind:{type:'string',enum:['text','element','pixel']},value:{type:'string',maxLength:256},role:{type:'string',maxLength:64},exact:{type:'boolean'},region:regionSchema,mode:{type:'string',enum:['stable','changed']},settleSamples:{type:'integer',minimum:2,maximum:10},minChangedPixels:{type:'integer',minimum:1,maximum:4096},timeoutMs:{type:'integer',minimum:1000,maximum:30000}},required:['kind'],additionalProperties:false};
export const TOOL_SCHEMAS:Record<string,Obj> = {
  mk_control:{type:'object',properties:{action:{type:'string',enum:['begin','end','status']}},required:['action'],additionalProperties:false},
  mk_observe:{type:'object',properties:{mode:{type:'string',enum:['targets','window']},target:{type:'string'},query:{type:'string',maxLength:256},detail:{type:'string',enum:['compact','expanded'],description:'Window mode only. Compact is the default; request expanded only if more text context is needed.'},savePath:{type:'string',maxLength:240,description:'Window mode only. Absolute Windows .png path inside an existing directory. Writes this full-resolution capture; refuses to overwrite an existing file. Use it to keep local evidence images.'},region:regionSchema,waitFor:{...waitForSchema,description:'Window mode only. Wait until a condition holds: text/element match UIA content (a canvas has no text channel), pixel stable|changed compares the region against itself or the call-start baseline. On timeout the last observation is returned with OBSERVATION_TIMEOUT. No OCR, no reference image.'}},required:['mode'],additionalProperties:false},
  mk_mouse:{type:'object',properties:{humanize:{type:'string',enum:['off','natural','slow']},action:{type:'string',enum:['click']},target:{type:'string'},snapshot:{type:'string'},element:{type:'string'},elementName:{type:'string',maxLength:256,description:'Locate by accessible name in the current snapshot instead of a ref. Mutually exclusive with element and x/y.'},elementRole:{type:'string',maxLength:64,description:'Optional exact role for elementName lookups.'},elementExact:{type:'boolean',description:'Require an exact name match; the default is a contains match.'},x:{type:'integer',minimum:0,maximum:1599},y:{type:'integer',minimum:0,maximum:1199},observe:{type:'string',enum:['full','compact','none'],description:'Post-action observation size. compact keeps the focus plus at most 20 elements; none returns only the execution facts. Default full.'},region:regionSchema,savePath:{type:'string',maxLength:240,description:'Optional absolute .png path for the post-action observation. Region crops the saved file only. Never overwrites an existing file.'}},required:['action','target','snapshot'],additionalProperties:false},
  mk_keyboard:{type:'object',properties:{action:{type:'string',enum:['type','key']},target:{type:'string'},snapshot:{type:'string'},text:{type:'string',maxLength:64000},key:{type:'string',enum:[...KEYS]},settleMs:{type:'integer',minimum:0,maximum:5000,description:'Extra wait after the last input event so the target consumes the text before the action returns. Default 0.'},paceMs:{type:'integer',minimum:0,maximum:400,description:'Nominal inter-character gap in ms, randomized in natural/slow mode. Explicit 0 selects maxSpeed; omitted uses the profile.'},humanize:{type:'string',enum:['off','natural','slow'],description:'Action pacing profile. Default follows settings; off selects maxSpeed. Physical Esc and injection markers remain active.'},inputMode:{type:'string',enum:['auto','unicode','scancode'],description:'auto uses target-layout scan-code mappings for ASCII on all controls and Unicode for non-ASCII. Explicit unicode is retained; scancode accepts ASCII mappings only.'},observe:{type:'string',enum:['full','compact','none'],description:'Post-action observation size. Default full.'},region:regionSchema,savePath:{type:'string',maxLength:240,description:'Optional absolute .png path for the post-action observation. Region crops the saved file only. Never overwrites an existing file.'}},required:['action','target','snapshot'],additionalProperties:false}
};
