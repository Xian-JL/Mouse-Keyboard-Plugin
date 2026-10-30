import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRequest,decodeSettings,mapPoint,KEYS,DEFAULTS} from '../lib/contracts.js';
test('closed schema: commands cannot smuggle scripts, sessions, or unsupported mouse actions',()=>{
  for(const [tool,args] of [['mk_control',{action:'begin',session:'other'}],['mk_observe',{mode:'window',target:'x',query:'a'}],['mk_observe',{mode:'targets',target:'x'}],['mk_mouse',{action:'double_click',target:'a',snapshot:'b',x:0,y:0}],['mk_keyboard',{action:'type',target:'a',snapshot:'b',text:'x',script:'bad'}]])assert.throws(()=>parseRequest(tool,args));
});
test('exactly one target form; coordinates must be bounded finite image integers',()=>{
  for(const values of [{element:'e',x:1,y:1},{x:0},{x:NaN,y:1},{x:1.5,y:2},{x:-1,y:0},{x:1600,y:0},{x:0,y:1200}])assert.throws(()=>parseRequest('mk_mouse',{action:'click',target:'a',snapshot:'b',...values}));
  assert.equal(parseRequest('mk_mouse',{action:'click',target:'a',snapshot:'b',element:'e'}).element,'e');
});
test('Unicode preserved byte for byte except specified newline normalization',()=>{
  const text=' 中文 😀 e\u0301 “引号” \\ abc\r\n第二段\r第三段  ';
  assert.equal(parseRequest('mk_keyboard',{action:'type',target:'a',snapshot:'b',text}).text,' 中文 😀 e\u0301 “引号” \\ abc\n第二段\n第三段  ');
  for(const text of ['\t','\0','a\u0001','\ud800','\udc00','x'.repeat(16001),'😀'.repeat(16001)])assert.throws(()=>parseRequest('mk_keyboard',{action:'type',target:'a',snapshot:'b',text}));
  assert.equal([...parseRequest('mk_keyboard',{action:'type',target:'a',snapshot:'b',text:'😀'.repeat(16000)}).text].length,16000);
});
test('key whitelist admits only the reviewed set; typing never gets an implicit key',()=>{
  for(const key of KEYS)assert.equal(parseRequest('mk_keyboard',{action:'key',target:'a',snapshot:'b',key}).key,key);
  for(const key of ['Win+R','Ctrl+V','Alt+F4','Ctrl+Enter','Ctrl+A;calc','A'])assert.throws(()=>parseRequest('mk_keyboard',{action:'key',target:'a',snapshot:'b',key}));
  assert.throws(()=>parseRequest('mk_keyboard',{action:'type',target:'a',snapshot:'b',text:'x',key:'Enter'}));
});
test('settings preserve false, reject unknown fields and out of range values',()=>{
  assert.equal(decodeSettings({enabled:false}).enabled,false);assert.deepEqual(decodeSettings({}),DEFAULTS);
  for(const v of [{snapshotTtlMs:0},{maxElements:301},{maxTreeDepth:3.5},{enabled:'true'},{allowAnything:true}])assert.throws(()=>decodeSettings(v));
});
test('coordinate mapping uses image pixel centers across negative virtual-screen coordinates',()=>{
  const rect={left:-1920,top:-100,width:1920,height:1080},size={width:960,height:540};
  assert.deepEqual(mapPoint(0,0,rect,size),{x:-1919,y:-99});assert.deepEqual(mapPoint(959,539,rect,size),{x:-1,y:979});
  for(const scale of [1,1.25,1.5,2])for(const [x,y] of [[0,0],[10,20],[100,50]]){const w=Math.round(400*scale),h=Math.round(200*scale);const r=mapPoint(x,y,{left:73,top:91,width:w,height:h},{width:400,height:200});assert.ok(Math.abs(r.x-(73+(x+.5)*w/400))<1);assert.ok(Math.abs(r.y-(91+(y+.5)*h/200))<1);}
  assert.throws(()=>mapPoint(960,0,rect,size));
});
