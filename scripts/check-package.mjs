// Reproducible on a clean checkout; does not install or open a Desktop profile.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),stamp=randomUUID();
const npm=process.env.npm_execpath??join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const run=promisify(execFile);
try{
 const destination=join(root,'artifacts','package-'+stamp);await mkdir(destination,{recursive:true});
 const packed=await run(process.execPath,[npm,'pack','--ignore-scripts','--json','--pack-destination',destination],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:256*1024});
 const tarball=join(destination,JSON.parse(packed.stdout)[0].filename);
 const inspection=await run('python',['-B',join(root,'scripts/inspect-package.py'),tarball,join(root,'.verification','package-'+stamp)],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:256*1024});const receipt=JSON.parse(inspection.stdout);
 const helper=join(dirname(receipt.entry),'../helper/bootstrap.ps1');
 const native=await run(join(process.env.SystemRoot??'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-ParentPid',String(process.pid),'-CompileOnly'],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:256*1024});if(JSON.parse(native.stdout).ok!==true)throw new Error('Packaged helper validation failed.');
 await run(process.execPath,[join(root,'scripts/check-host-sdk.mjs')],{cwd:root,windowsHide:true,env:{...process.env,MK_PLUGIN_ENTRY:receipt.entry},timeout:300000,maxBuffer:512*1024});
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));const spec=await readFile(join(root,'spec.md'));
 const manifest={version:pkg.version,sha256:receipt.sha256,specSha256:createHash('sha256').update(spec).digest('hex'),checks:{archiveInspection:true,packagedHelper:true,packagedSdkVersions:['0.2.1-rc.3','0.2.1-rc.5']},realDesktopAcceptance:'NOT_RUN',inputSent:false};
 await writeFile(join(destination,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(join(destination,'SHA256SUMS.txt'),receipt.sha256+'  '+JSON.parse(packed.stdout)[0].filename+'\n');
 console.log(JSON.stringify({ok:true,version:pkg.version,tarball,manifest:join(destination,'release-manifest.json'),...manifest}));
}catch(error){console.error(error.stderr??error.message);process.exitCode=1;}
