// Read-only audit of the shipped automation implementation; no desktop or input.
import {readdir,readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));const sources=[];
async function walk(dir){for(const e of await readdir(join(root,dir),{withFileTypes:true})){if(e.isSymbolicLink())throw new Error('Unexpected runtime source link');const p=dir+'/'+e.name;if(e.isDirectory())await walk(p);else if(/\.(ts|tsx|cs|ps1)$/.test(p))sources.push({file:p,text:await readFile(join(root,p),'utf8')});}}
await walk('src');await walk('helper');sources.sort((a,b)=>a.file.localeCompare(b.file));
function find(pattern,scope=()=>true){const hits=[];for(const s of sources.filter(scope))for(const [index,line] of s.text.split(/\r?\n/).entries())if(pattern.test(line))hits.push({file:s.file,line:index+1,text:line});return hits;}
const definitions=[
 ['cdp',/cdp|devtools|Runtime\.evaluate|Page\.addScript|debugger/i],
 ['target-script',/ExecuteJavaScript|dispatchEvent|\.click\(\)|insertAdjacentHTML|evaluate\(/i],
 ['helper-network',/HttpClient|WebRequest|fetch\(|XMLHttpRequest|WebSocket/i,s=>s.file.startsWith('helper/')],
 ['clipboard',/OpenClipboard|SetClipboardData|clipboard|readText|writeText/i],
 ['other-input-api',/\b(?:keybd_event|mouse_event|SetCursorPos|PostThreadMessage|SendMessageW?|SendMessageA)\s*\(/i],
 ['remote-code',/WriteProcessMemory|VirtualAllocEx|CreateRemoteThread|NtWriteVirtualMemory/i],
 ['ocr',/Tesseract|Windows\.Media\.Ocr|OcrEngine|RecognizeAsync/i]
];
function reviewed(h){if(h.file==='helper/Server.cs'&&(/bool readText=false/.test(h.text)||/int budget=readText\?16000:0/.test(h.text)))return 'Internal boolean selects bounded UIA text reading; no clipboard API.';
 if(h.file==='src/host/index.ts'&&(/const instructions=/.test(h.text)||/mk_keyboard:/.test(h.text))&&/No[^.]*clipboard/.test(h.text))return 'Negative tool instructions; not an executable capability.';return null;}
const categories=definitions.map(([id,pattern,scope])=>{const hits=find(pattern,scope),accepted=hits.map(h=>({...h,note:id==='clipboard'?reviewed(h):null}));return {id,literalHits:hits.length,unreviewedHits:accepted.filter(h=>!h.note).length,references:accepted.map(({file,line,note})=>({file,line,note}))};});
const post=find(/\bPostMessage\s*\(/);const postAllowed=post.length===2&&post.every(h=>h.file==='helper/Native.cs'&&(/static extern bool PostMessage\(/.test(h.text)||/return PostMessage\(window,0x50,IntPtr.Zero,layout\);/.test(h.text)));
const readMessages=find(/\bSendMessageTimeout\s*\(/);const readsAllowed=readMessages.length===2&&readMessages.every(h=>h.file==='helper/Native.cs'&&(/static extern IntPtr SendMessageTimeout\(/.test(h.text)||/SendMessageTimeout\(new IntPtr\(c.NativeWindowHandle\),13,/.test(h.text)));
const sends=find(/Native\.SendInput\s*\(/);const inputAllowed=sends.length===2&&sends.every(h=>h.file==='helper/Server.cs');
const native=sources.find(s=>s.file==='helper/Native.cs').text;const constructors=['Move','Mouse','Key','Unicode','ScanInputs'].every(n=>new RegExp('\\b'+n+'\\(').test(native));
const ok=categories.every(c=>c.unreviewedHits===0)&&postAllowed&&readsAllowed&&inputAllowed&&constructors&&/Marker=0x4D4B5031/.test(native);
console.log(JSON.stringify({ok,scope:'src-and-helper-static-audit',categories,inputProvider:'SendInput',inputCallSites:sends.map(({file,line})=>({file,line})),postMessage:{ok:postAllowed,purpose:'WM_INPUTLANGCHANGEREQUEST only',references:post.map(({file,line})=>({file,line}))},readOnlyWindowMessage:{ok:readsAllowed,purpose:'WM_GETTEXT (13), bounded read only',references:readMessages.map(({file,line})=>({file,line}))},markerPreserved:/Marker=0x4D4B5031/.test(native),desktopObserved:false,inputSent:false}));if(!ok)process.exitCode=1;
