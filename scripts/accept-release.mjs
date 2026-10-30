import {readFile,realpath} from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {join,resolve,sep} from 'node:path';
const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
try{
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 const report=JSON.parse(await readFile(join(root,'docs','acceptance',`v${pkg.version}.json`),'utf8'));
 const spec=await readFile(join(root,'spec.md'),'utf8');const specVersion=spec.match(/文档版本：([^。]+)/)?.[1];
 if(report.version!==pkg.version||report.specVersion!==specVersion)throw new Error('Acceptance does not bind this version/spec.');
 if(report.overall!=='PASS'||report.completeVersion!==true||report.cases.some(r=>r.status!=='PASS')||report.e2e.length!==6||report.e2e.some(r=>r.status!=='PASS'))throw new Error('RELEASE_BLOCKED: complete specification and real model/desktop acceptance have not passed.');
 for(const entry of report.files){const file=resolve(root,entry.file);if(!file.toLowerCase().startsWith((root+sep).toLowerCase())||(await realpath(file)).toLowerCase()!==file.toLowerCase())throw new Error('Source evidence path is invalid.');if(createHash('sha256').update(await readFile(file)).digest('hex')!==entry.sha256)throw new Error('Source changed after acceptance.');}
 const archive=resolve(report.tarball);if(!archive.toLowerCase().startsWith(join(root,'artifacts').toLowerCase()+sep))throw new Error('Artifact path is invalid.');
 if(createHash('sha256').update(await readFile(archive)).digest('hex')!==report.package.sha256)throw new Error('Artifact changed after acceptance.');
 console.log('Release acceptance PASS; publication still requires explicit user authorization.');
}catch(error){console.error(error.message);process.exitCode=1;}
