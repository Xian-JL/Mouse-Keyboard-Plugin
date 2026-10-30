import {DEFAULTS,NUMBER_RANGES} from '../shared/settings.js';
import type {Settings} from '../shared/settings.js';
export interface FormSnapshot {status:string;value?:Partial<Settings>;writable:boolean}
export interface Form {getSnapshot():FormSnapshot;subscribe(fn:()=>void):()=>void;mutate(ops:Array<{op:'set';path:string[];value:boolean|number}>):Promise<boolean>}
export function readable(snapshot:FormSnapshot):snapshot is FormSnapshot&{value:Settings} {
 if(snapshot.status!=='ready'||!snapshot.value)return false;
 for(const key of Object.keys(DEFAULTS) as Array<keyof Settings>){const v=snapshot.value[key];if(typeof DEFAULTS[key]!==typeof v)return false;if(typeof v==='number'){const r=NUMBER_RANGES[key as keyof typeof NUMBER_RANGES];if(!r||!Number.isSafeInteger(v)||v<r[0]||v>r[1])return false;}}
 return true;
}
/** Native ConfigFormController owns the namespace's serialized/revisioned write queue. */
export async function savePatch(form:Form,patch:Partial<Settings>):Promise<void>{
 const s=form.getSnapshot();if(!readable(s))throw new Error('配置尚未读取成功，未保存。');if(s.writable!==true)throw new Error('当前连接只读，未保存。');
 const next={...s.value,...patch};if(!readable({status:'ready',writable:true,value:next}))throw new Error('设置值超出允许范围，未保存。');
 for(const key of Object.keys(patch))if(!Object.hasOwn(DEFAULTS,key))throw new Error('未知设置字段，未保存。');
 const ops=Object.entries(patch).map(([field,value])=>({op:'set' as const,path:[field],value:value as boolean|number}));if(!ops.length)return;
 if(await form.mutate(ops)!==true)throw new Error('保存失败，宿主未确认设置已生效。');
}
