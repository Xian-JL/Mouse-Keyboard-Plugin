import { randomUUID } from 'node:crypto';
import {DEFAULTS,NUMBER_RANGES} from './settings.js';
import type {Settings} from './settings.js';
export {DEFAULTS};export type {Settings};

export const VERSION = '0.3.0';
export const PROTOCOL = 1;
export const KEYS = ['Enter','Tab','Shift+Tab','Escape','Backspace','Delete','Left','Right','Up','Down','Home','End','PageUp','PageDown','Ctrl+A','Ctrl+S','Ctrl+Home','Ctrl+End'] as const;
export type Key = typeof KEYS[number];
export type ControlState = 'inactive'|'closed'|'opening'|'ready'|'observing'|'acting'|'closing'|'stopped'|'faulted';
export type Execution = 'not_sent'|'sent'|'partially_sent'|'unknown';
export type Verification = 'unverified'|'observed_change'|'verified'|'mismatch';
export type Json = null|boolean|number|string|Json[]|{[key:string]:Json};
export type Obj = Record<string, unknown>;
export class MkError extends Error {
  constructor(public readonly code:string, message:string, public readonly execution:Execution='not_sent',public readonly details?:Obj) { super(message); this.name='MkError'; }
}
export function diagnosticDetails(raw:unknown):Obj|undefined {
 if(raw===undefined||raw===null)return undefined;
 const bad=():never=>{throw new MkError('PROTOCOL_ERROR','Invalid bounded diagnostic details.','unknown');};
 if(typeof raw!=='object'||Array.isArray(raw)||JSON.stringify(raw).length>2048)return bad();
 const result:Obj={};
 for(const [key,value] of Object.entries(raw)){
  if(['stage','check','requiredAction'].includes(key)){if(typeof value!=='string'||!/^[a-z][a-z0-9-]{0,79}$/.test(value))return bad();if(key==='stage'&&!['visual-comparison','input-arbitration','window-activation','observation','snapshot','focus-validation','element-validation','authorization','native-validation'].includes(value))return bad();result[key]=value;}
  else if(key==='space'){if(value!=='screen-physical-pixels')return bad();result[key]=value;}
  else if(['region','diffBbox','captureRect'].includes(key)){if(value===null){result[key]=null;continue;}if(!value||typeof value!=='object'||Array.isArray(value))return bad();const rect=value as Obj;if(Object.keys(rect).length!==4||!['left','top','width','height'].every(k=>Number.isSafeInteger(rect[k])&&Math.abs(Number(rect[k]))<=2147483647)||Number(rect.width)<0||Number(rect.height)<0)return bad();result[key]={...rect};}
  else if(['changedPixels','significantPixels','maxChannelDelta','dpi','snapshotAgeMs','waitedMs'].includes(key)){if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>2147483647)return bad();result[key]=value;}
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
export const id = ():string => randomUUID();
export function decodeSettings(value:unknown):Settings {
  const v=object(value); exact(v,Object.keys(DEFAULTS)); const result={...DEFAULTS};
  for (const k of ['enabled','diagnosticsEnabled'] as const) { if (v[k]!==undefined) { if (typeof v[k]!=='boolean') fail('INVALID_CONFIG',`Invalid ${k}.`); result[k]=v[k] as boolean; } }
  for (const [key,[min,max]] of Object.entries(NUMBER_RANGES)) {const k=key as keyof typeof NUMBER_RANGES;if(v[k]!==undefined) result[k]=integer(v[k],k,min,max);}
  return result;
}
export type Request = {tool:'mk_control';action:'begin'|'end'|'status'}|{tool:'mk_observe';mode:'targets';query?:string}|{tool:'mk_observe';mode:'window';target:string}|{tool:'mk_mouse';action:'click';target:string;snapshot:string;element?:string;x?:number;y?:number}|{tool:'mk_keyboard';action:'type';target:string;snapshot:string;text:string}|{tool:'mk_keyboard';action:'key';target:string;snapshot:string;key:Key};
export function parseRequest(tool:string,input:unknown):Request {
  const v=object(input);
  if(tool==='mk_control') { exact(v,['action']); if(!['begin','end','status'].includes(String(v.action))) fail('INVALID_ARGUMENT','Invalid control action.'); return {tool,action:v.action as 'begin'|'end'|'status'}; }
  if(tool==='mk_observe') {
    exact(v,['mode','target','query']);
    if(v.mode==='targets') { if(v.target!==undefined) fail('INVALID_ARGUMENT','targets does not accept target.'); if(v.query===undefined) return {tool,mode:'targets'}; const query=string(v.query,'query',256); if([...query].length>128) fail('INVALID_ARGUMENT','query too long.'); return {tool,mode:'targets',query}; }
    if(v.mode==='window') { if(v.query!==undefined) fail('INVALID_ARGUMENT','window does not accept query.'); return {tool,mode:'window',target:string(v.target,'target')}; }
    return fail('INVALID_ARGUMENT','Invalid observation mode.');
  }
  if(tool==='mk_mouse') {
    exact(v,['action','target','snapshot','element','x','y']); if(v.action!=='click') fail('INVALID_ARGUMENT','Only one left click is supported.');
    const base={tool:'mk_mouse' as const,action:'click' as const,target:string(v.target,'target'),snapshot:string(v.snapshot,'snapshot')};
    if(v.element!==undefined) { if(v.x!==undefined||v.y!==undefined) fail('INVALID_ARGUMENT','Choose element OR coordinates.'); return {...base,element:string(v.element,'element')}; }
    return {...base,x:integer(v.x,'x',0,1599),y:integer(v.y,'y',0,1199)};
  }
  if(tool==='mk_keyboard') {
    exact(v,['action','target','snapshot','text','key']); const base={tool:'mk_keyboard' as const,target:string(v.target,'target'),snapshot:string(v.snapshot,'snapshot')};
    if(v.action==='type') { if(v.key!==undefined) fail('INVALID_ARGUMENT','type does not accept key.'); const raw=string(v.text,'text',64000); if(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/u.test(raw)||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(raw)) fail('UNSUPPORTED_INPUT','Unsupported text control or Unicode sequence.'); const text=raw.replace(/\r\n?/g,'\n'); if([...text].length>16000||Buffer.byteLength(text)>65536) fail('UNSUPPORTED_INPUT','Text exceeds the bounded input budget.'); return {...base,action:'type',text}; }
    if(v.action==='key') { if(v.text!==undefined||!KEYS.includes(v.key as Key)) fail('UNSUPPORTED_INPUT','Key is outside the allowed set.'); return {...base,action:'key',key:v.key as Key}; }
  }
  return fail('INVALID_ARGUMENT','Unknown tool/action.');
}
export interface Rect {left:number;top:number;width:number;height:number}
export interface WindowIdentity { hwnd:string; pid:number; created:string; app:string; title:string; rect:Rect; minimized:boolean; foreground:boolean; blocked?:string }
export interface ElementInfo {ref:string;runtimeId:string;name:string;role:string;rect:Rect|null;offscreen?:boolean;enabled:boolean;password:boolean;editable:boolean;multiline:'true'|'false'|'unknown';value?:string;selectionStart?:number;selectionEnd?:number}
export interface Observation { window:WindowIdentity; captureRect:Rect; imageSize:{width:number;height:number}; png:string; elements:ElementInfo[]; focusedElement?:ElementInfo; fingerprint:string; capturedAt:string; durationMs:number; coverage:{truncated:boolean;textTruncated:boolean;unstable?:boolean}; warnings:string[] }
export interface NativeReceipt {execution:Execution;verification:Verification;sentCodePoints?:number;reason?:string;observation?:Observation;error?:{code:string;message:string;details?:Obj}}
export function mapPoint(x:number,y:number,rect:Rect,size:{width:number;height:number}):{x:number;y:number} {
  integer(x,'x',0,size.width-1); integer(y,'y',0,size.height-1);
  if(![rect.left,rect.top,rect.width,rect.height,size.width,size.height].every(Number.isFinite)||rect.width<=0||rect.height<=0||size.width<=0||size.height<=0) fail('INVALID_COORDINATE','Invalid image mapping.');
  return {x:Math.min(rect.left+rect.width-1,rect.left+Math.floor((x+.5)*rect.width/size.width)),y:Math.min(rect.top+rect.height-1,rect.top+Math.floor((y+.5)*rect.height/size.height))};
}
export const TOOL_SCHEMAS:Record<string,Obj> = {
  mk_control:{type:'object',properties:{action:{type:'string',enum:['begin','end','status']}},required:['action'],additionalProperties:false},
  mk_observe:{type:'object',properties:{mode:{type:'string',enum:['targets','window']},target:{type:'string'},query:{type:'string',maxLength:256}},required:['mode'],additionalProperties:false},
  mk_mouse:{type:'object',properties:{action:{type:'string',enum:['click']},target:{type:'string'},snapshot:{type:'string'},element:{type:'string'},x:{type:'integer',minimum:0,maximum:1599},y:{type:'integer',minimum:0,maximum:1199}},required:['action','target','snapshot'],additionalProperties:false},
  mk_keyboard:{type:'object',properties:{action:{type:'string',enum:['type','key']},target:{type:'string'},snapshot:{type:'string'},text:{type:'string',maxLength:64000},key:{type:'string',enum:[...KEYS]}},required:['action','target','snapshot'],additionalProperties:false}
};
