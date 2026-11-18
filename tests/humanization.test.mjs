import test from 'node:test';import assert from 'node:assert/strict';
import {Controller,HumanPacer,humanizeProfile,abortablePause} from '../lib/core.js';
import {DEFAULTS,decodeSettings,parseRequest,MkError} from '../lib/contracts.js';
import {FakeBackend,authority,scope,signal} from './fixture.mjs';
const enabled=()=>({...DEFAULTS,humanizeEnabled:true});
async function open(c,s){await c.execute(s,'mk_control',{action:'begin'},signal());const t=await c.execute(s,'mk_observe',{mode:'targets'},signal());const target=t.targets[0].target;const o=await c.execute(s,'mk_observe',{mode:'window',target},signal());return {target,snapshot:o.snapshot};}
test('[HUM-01] profile migration preserves explicit false and all old numeric settings',()=>{
 const old={enabled:true,snapshotTtlMs:10000,maxElements:50};const decoded=decodeSettings(old);assert.equal(decoded.snapshotTtlMs,10000);assert.equal(decoded.maxElements,50);assert.equal(decoded.humanizeEnabled,true);assert.equal(decoded.humanizeProfile,'natural');
 assert.equal(decodeSettings({humanizeEnabled:false,humanizeProfile:'slow'}).humanizeEnabled,false);
 for(const bad of [{humanizeEnabled:'true'},{humanizeProfile:'fast'},{humanizeProfile:'off'}])assert.throws(()=>decodeSettings(bad));
});
test('[HUM-01] explicit pace zero is maxSpeed; omission follows the user profile and the master switch wins',()=>{
 const base={action:'type',target:'t',snapshot:'s',text:'A中'};const request=parseRequest('mk_keyboard',base);assert.equal(request.paceMs,undefined);assert.equal(humanizeProfile(request,enabled()),'natural');
 for(const value of ['off','natural','slow'])assert.equal(parseRequest('mk_keyboard',{...base,humanize:value}).humanize,value);
 assert.equal(humanizeProfile(parseRequest('mk_keyboard',{...base,humanize:'slow',paceMs:0}),enabled()),'off');
 assert.equal(humanizeProfile({...request,humanize:'slow'},{...enabled(),humanizeEnabled:false}),'off');
 assert.equal(parseRequest('mk_keyboard',{...base,paceMs:400}).paceMs,400);
 for(const extra of [{humanize:'invalid'},{paceMs:401},{paceMs:-1}])assert.throws(()=>parseRequest('mk_keyboard',{...base,...extra}));
 assert.throws(()=>parseRequest('mk_observe',{mode:'targets',humanize:'off'}));
});
test('[HUM-01] injected clock measures first, subsequent, changed-page and slow dwell bounds',async()=>{
 for(const [first,changed,profile,min,max]of [[true,false,'natural',400,1200],[false,false,'natural',200,600],[true,true,'natural',900,2700],[false,false,'slow',280,840]])for(const random of [0,.5,.99999]){
  const waits=[];const pacer=new HumanPacer(()=>random,async ms=>{waits.push(ms)});await pacer.delay(first,changed,profile,signal());assert.ok(waits[0]>=min&&waits[0]<=max);
 }
 const pacer=new HumanPacer(()=>{throw new Error('off must not sample randomness')},async()=>{throw new Error('off must not wait')});assert.equal(await pacer.delay(true,true,'off',signal()),0);
});
test('[HUM-01] dwell forwards the effective mode, preserves settledMs and backs off after STATE_CHANGED',async()=>{
 const backend=new FakeBackend(),s=scope(),delays=[];const pacer={async delay(first,changed,profile){delays.push({first,changed,profile});return 123}};const c=new Controller(backend,authority(),enabled,()=>1,pacer);
 try{const op=await open(c,s);backend.act=async()=>({execution:'sent',verification:'unverified',settledMs:17,observation:structuredClone(backend.value)});
  const r=await c.execute(s,'mk_keyboard',{...op,action:'type',text:'abc'},signal());assert.equal(r.settledMs,17);assert.equal(r.humanization.dwellMs,123);assert.equal(r.humanization.profile,'natural');assert.deepEqual(delays[0],{first:true,changed:false,profile:'natural'});
  backend.act=async()=>{throw new MkError('STATE_CHANGED','changed')};await assert.rejects(c.execute(s,'mk_mouse',{target:op.target,snapshot:r.observation.snapshot,action:'click',element:'edit'},signal()));
  const next=await c.execute(s,'mk_observe',{mode:'window',target:op.target},signal());backend.act=async(_r,_w,_o,req)=>{assert.equal(req.humanize,'natural');return {execution:'sent',verification:'unverified',observation:null}};
  await c.execute(s,'mk_mouse',{target:op.target,snapshot:next.snapshot,action:'click',element:'edit'},signal());assert.deepEqual(delays.at(-1),{first:false,changed:true,profile:'natural'});
 }finally{await c.dispose()}
});
test('[HUM-05] end during dwell aborts immediately without invoking the input backend',async()=>{
 const backend=new FakeBackend(),s=scope();let entered;const started=new Promise(r=>{entered=r});const c=new Controller(backend,authority(),enabled,()=>1,{async delay(_f,_c,_p,sig){entered();await abortablePause(30000,sig);return 0}});
 try{const op=await open(c,s);const work=c.execute(s,'mk_mouse',{...op,action:'click',element:'edit'},signal());const rejected=assert.rejects(work);await started;const end=await c.execute(s,'mk_control',{action:'end'},signal());await rejected;assert.equal(end.inputReleased,true);assert.equal(backend.acts.length,0);assert.equal((await c.execute(s,'mk_control',{action:'begin'},signal())).controlState,'ready');}finally{await c.dispose()}
});
test('[HUM-05] dwell cannot extend a snapshot TTL or revive expired evidence',async()=>{
 const backend=new FakeBackend(),s=scope();let now=1;const c=new Controller(backend,authority(),enabled,()=>now,{async delay(){now+=30001;return 30001}});
 try{const op=await open(c,s);await assert.rejects(c.execute(s,'mk_mouse',{...op,action:'click',element:'edit'},signal()),e=>e.code==='STALE_SNAPSHOT'&&e.execution==='not_sent');assert.equal(backend.acts.length,0);}finally{await c.dispose()}
});
