import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';import {join} from 'node:path';
try{
 const result=await promisify(execFile)(join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../helper/bootstrap.ps1',import.meta.url)),'-ParentPid',String(process.pid),'-CompileOnly','-SyntheticUia'],{windowsHide:true,timeout:20000,maxBuffer:256*1024});
 if(result.stderr.trim())throw new Error(result.stderr);const value=JSON.parse(result.stdout.trim());if(value.ok!==true||value.inputSent!==false||value.visibleWindowsCreated!==false||value.userDesktopObserved!==false)throw new Error('Unexpected fixture result.');console.log(JSON.stringify(value));
}catch(error){console.error(error.stderr??error.message);process.exitCode=1;}
