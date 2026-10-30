// A user-approved, version-only promotion is distinct from full-matrix acceptance.
import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,resolve,sep} from 'node:path';
const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 const report=JSON.parse(await readFile(join(root,'docs/acceptance',`v${pkg.version}.json`),'utf8'));
 const approval=JSON.parse(await readFile(join(root,'docs/acceptance',`v${pkg.version}-user-acceptance.json`),'utf8'));
 const baseline=JSON.parse(await readFile(join(root,'docs/acceptance',`v${approval.acceptedBaselineVersion}.json`),'utf8'));
 if(pkg.version!==approval.version||approval.authority!=='direct-human-user-message'||!approval.statement||approval.runtimeChangesPermitted!=='version-constants-only')throw new Error('Release has no matching explicit human acceptance.');
 if(baseline.sourceHash!==approval.acceptedBaselineSourceHash)throw new Error('Accepted baseline evidence changed.');
 const specification=await readFile(join(root,'spec.md'),'utf8');
 if(report.version!==pkg.version||report.specVersion!==specification.match(/文档版本：([^。]+)/)?.[1])throw new Error('Release evidence does not bind the current version/specification.');
 const required=['typecheck','build','test','check-helper','check-feedback','check-diagnostics','check-host-native','check-profile','check-native','check-visual','check-uia','pack','package-inspection','packaged-host-native'];
 if(!required.every(label=>report.commands.some(r=>r.label===label&&r.ok))||!report.commands.every(r=>r.ok))throw new Error('Required release checks have not passed.');
 let runtimeFiles=0;
 for(const entry of baseline.files.filter(e=>e.file.startsWith('src/')||e.file.startsWith('helper/'))){
  let bytes=await readFile(join(root,entry.file));
  if(['src/shared/contracts.ts','helper/Server.cs'].includes(entry.file))bytes=Buffer.from(bytes.toString('utf8').replaceAll(pkg.version,approval.acceptedBaselineVersion));
  if(sha(bytes)!==entry.sha256)throw new Error('Runtime changed beyond version constants: '+entry.file);runtimeFiles++;
 }
 const currentRuntime=report.files.filter(e=>e.file.startsWith('src/')||e.file.startsWith('helper/'));
 if(currentRuntime.length!==runtimeFiles)throw new Error('Runtime files were added or removed after human acceptance.');
 for(const entry of report.files){const path=resolve(root,entry.file);if(!path.toLowerCase().startsWith((root+sep).toLowerCase())||(await realpath(path)).toLowerCase()!==path.toLowerCase()||sha(await readFile(path))!==entry.sha256)throw new Error('Files changed after release validation: '+entry.file);}
 const archive=resolve(report.tarball);if(!archive.toLowerCase().startsWith((join(root,'artifacts')+sep).toLowerCase())||sha(await readFile(archive))!==report.package.sha256)throw new Error('Release artifact changed.');
 console.log(JSON.stringify({ok:true,version:pkg.version,basis:'explicit-user-acceptance-and-version-only-promotion',acceptedBaselineVersion:approval.acceptedBaselineVersion,runtimeFilesCompared:runtimeFiles,allRequiredChecksPassed:true,fullMatrixPassInferred:false,sha256:report.package.sha256}));
}catch(error){console.error(error.message);process.exitCode=1;}
