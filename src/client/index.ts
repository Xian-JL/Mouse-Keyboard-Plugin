import * as React from 'react';
import {DEFAULTS,NUMBER_RANGES,SETTING_LABELS} from '../shared/settings.js';import type {Settings} from '../shared/settings.js';
import {readable,savePatch} from './settings.js';import type {Form} from './settings.js';
export const inject=['slots','configForms'];
const h=React.createElement;
export function SettingsSection({form}:{form:Form}):React.ReactElement {
 const subscribe=React.useCallback((fn:()=>void)=>form.subscribe(fn),[form]);const get=React.useCallback(()=>form.getSnapshot(),[form]);
 const snapshot=React.useSyncExternalStore(subscribe,get,get),prefix=React.useId();
 const [draft,setDraft]=React.useState<Record<string,string>>({}),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('');
 const mounted=React.useRef(true),currentForm=React.useRef(form);currentForm.current=form;React.useEffect(()=>{mounted.current=true;setDraft({});setMessage('');setBusy(false);return()=>{mounted.current=false;};},[form]);
 const ok=readable(snapshot),writable=ok&&snapshot.writable===true&&!busy;
 const commit=async(patch:Partial<Settings>)=>{setBusy(true);setMessage('正在保存…');const active=()=>mounted.current&&currentForm.current===form;try{await savePatch(form,patch);if(active()){setMessage('设置已保存。');setDraft(current=>Object.fromEntries(Object.entries(current).filter(([key])=>!Object.hasOwn(patch,key))));}}catch(error){if(active())setMessage(error instanceof Error?error.message:'保存失败，未确认生效。');}finally{if(active())setBusy(false);}};
 const rows=ok?(Object.keys(DEFAULTS) as Array<keyof Settings>).map(key=>{
  const value=snapshot.value[key],id=prefix+'-'+key;
  const input=typeof value==='boolean'?h('input',{id,type:'checkbox',checked:value,disabled:!writable,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>{void commit({[key]:e.currentTarget.checked});}}):h('input',{id,type:'number',step:1,min:NUMBER_RANGES[key as keyof typeof NUMBER_RANGES]?.[0],max:NUMBER_RANGES[key as keyof typeof NUMBER_RANGES]?.[1],value:draft[key]??String(value),disabled:!writable,onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setDraft(current=>({...current,[key]:e.currentTarget.value})),style:{width:110,font:'inherit'}});
  return h('div',{key,style:{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,padding:'8px 0'}},h('label',{htmlFor:id},SETTING_LABELS[key]),input);
 }):[];
 return h('section',{'aria-label':'Mouse Keyboard Plugin 设置',style:{maxWidth:640,width:'100%',boxSizing:'border-box',padding:16,color:'var(--dsw-alias-label-primary,#1f2937)'}},
  h('h3',null,'鼠标与键盘'),h('p',null,'模型可自行选择电脑操作，自动恢复并前置目标窗口，完成后交还电脑继续思考。操作时显示蓝色指针和右下角 DeepSeek 动画；按 Esc 停止。'),
  !ok?h('p',{role:'alert'},snapshot.status==='loading'?'正在读取插件配置…':'插件配置不可用，当前无法修改。'):snapshot.writable!==true?h('p',{role:'status'},'当前连接为只读，可以查看设置。'):null,...rows,
  ok?h('div',{style:{display:'flex',flexWrap:'wrap',gap:10,marginTop:12}},h('button',{type:'button',disabled:!writable||Object.keys(draft).length===0,onClick:()=>{const patch:Partial<Settings>={};for(const [key,value]of Object.entries(draft))Object.assign(patch,{[key]:Number(value)});void commit(patch);}},'保存数值设置'),h('button',{type:'button',disabled:!writable||!snapshot.value.enabled,onClick:()=>{void commit({enabled:false});}},'立即停用插件')):null,
  h('p',{role:message.includes('失败')?'alert':'status','aria-live':'polite'},message),h('p',{style:{fontSize:12,opacity:.8}},'修改设置会交还电脑并清除旧引用；模型可在当前任务中自行重新开启。')
 );
}
interface ClientContext {get(name:string):unknown;slots:{inject(name:string,callback:()=>unknown):unknown;register(definition:Record<string,unknown>,component:unknown):unknown}}
export function apply(ctx:ClientContext):void {
 const forms=ctx.get('configForms') as {get(id:string):Form}|undefined;if(!forms)throw new Error('Mouse Keyboard Plugin requires native config forms.');const form=forms.get('mouse-keyboard-plugin');
 ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'mouse-keyboard-plugin-settings',order:65,label:()=> '鼠标与键盘',inject:()=>({form})},SettingsSection));
}
