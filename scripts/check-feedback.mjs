import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
try{
 const {stdout,stderr}=await promisify(execFile)(join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../helper/bootstrap.ps1',import.meta.url)),'-ParentPid',String(process.pid),'-CompileOnly','-FeedbackRegression'],{windowsHide:true,timeout:30000,maxBuffer:256*1024});
 if(stderr.trim())throw new Error(stderr);const result=JSON.parse(stdout.trim());
 if(result.ok!==true||result.inputSent!==false||result.userDesktopObserved!==false||result.visibleWindowsCreated!==false||result.assertions<160)throw new Error('Invalid feedback regression receipt.');
 console.log(JSON.stringify(result));
}catch(error){console.error(error.stderr??error.message);process.exitCode=1;}
