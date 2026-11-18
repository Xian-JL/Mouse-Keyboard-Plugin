import {randomInt} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import type {Settings,Request} from '../shared/contracts.js';
import type {HumanizeProfile} from '../shared/settings.js';
export interface ActionPacer {delay(first:boolean,changed:boolean,profile:HumanizeProfile,signal:AbortSignal):Promise<number>}
export function humanizeProfile(request:Request,settings:Settings):HumanizeProfile {
 if(!settings.humanizeEnabled)return 'off';
 if(request.tool!=='mk_mouse'&&request.tool!=='mk_keyboard')return 'off';
 if(request.tool==='mk_keyboard'&&request.action==='type'&&request.paceMs===0)return 'off';
 return request.humanize??settings.humanizeProfile;
}
export function abortablePause(ms:number,signal:AbortSignal):Promise<void>{
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
}
export class HumanPacer implements ActionPacer {
 constructor(private readonly random:()=>number=()=>randomInt(0,0x1000000)/0x1000000,private readonly pause:(ms:number,signal:AbortSignal)=>Promise<void>=abortablePause){}
 async delay(first:boolean,changed:boolean,profile:HumanizeProfile,signal:AbortSignal):Promise<number>{
  if(profile==='off')return 0;
  const triangular=(min:number,max:number)=>Math.round(min+(max-min)*(this.random()+this.random())/2);
  let ms=first?triangular(400,1200):triangular(200,600);if(changed)ms+=triangular(500,1500);if(profile==='slow')ms=Math.round(ms*1.4);
  const at=performance.now();await this.pause(ms,signal);return Math.max(0,Math.round(performance.now()-at));
 }
}
