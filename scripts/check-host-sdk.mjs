import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const npm=process.env.npm_execpath??join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const run=promisify(execFile);
try{
 const versions=process.env.MK_DSH_SDK_VERSION?[process.env.MK_DSH_SDK_VERSION]:['0.2.1-rc.3','0.2.1-rc.5'];
 for(const version of versions){
  if(!/^0\.2\.1-rc\.[35]$/.test(version))throw new Error('Only reviewed SDK versions are accepted.');
  const home=join(root,'.verification','sdk-'+version);await mkdir(home,{recursive:true});
  const definition={private:true,type:'module',dependencies:{'@deepseek-ai/cordis':'4.0.5','@deepseek-ai/dsh-tools':version,'@deepseek-ai/dsh-system-prompt':version}};
  const json=JSON.stringify(definition,null,2)+'\n';let changed=true;try{changed=await readFile(join(home,'package.json'),'utf8')!==json}catch{}
  if(changed)await writeFile(join(home,'package.json'),json);
  await run(process.execPath,[npm,'install','--ignore-scripts','--no-audit','--no-fund','--prefix',home],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:1024*1024});
  const result=await run(process.execPath,[join(root,'scripts/host-probe.cjs'),root],{cwd:root,windowsHide:true,env:{...process.env,MK_DSH_NODE_MODULES:join(home,'node_modules')},timeout:30000,maxBuffer:256*1024});
  const receipt=JSON.parse(result.stdout.trim());if(receipt.ok!==true||receipt.hostVersion!==version||receipt.inputSent!==false)throw new Error('SDK receipt invalid.');console.log(JSON.stringify(receipt));
 }
}catch(error){console.error(error.stderr??error.message);process.exitCode=1;}
