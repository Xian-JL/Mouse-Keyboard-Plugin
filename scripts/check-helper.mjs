import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const run=promisify(execFile);
const executable=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
try {
  const {stdout,stderr}=await run(executable,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../helper/bootstrap.ps1',import.meta.url)),'-ParentPid',String(process.pid),'-CompileOnly'],{windowsHide:true,timeout:30000,maxBuffer:128*1024});
  if(stderr.trim())throw new Error(stderr);
  const value=JSON.parse(stdout.trim());if(value.ok!==true||value.desktopObserved!==false||value.inputSent!==false)throw new Error('Unexpected native validation receipt.');
  console.log(JSON.stringify(value));
}catch(error){console.error(error.stderr??error.message);process.exitCode=1;}
