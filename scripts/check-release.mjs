// Automated release evidence gate. Full desktop acceptance remains accept:release.
import {readFile,realpath,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,resolve,sep,basename} from 'node:path';
const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 const report=JSON.parse(await readFile(join(root,'docs/acceptance',`v${pkg.version}.json`),'utf8'));
 const specification=await readFile(join(root,'spec.md'),'utf8');
 if(report.version!==pkg.version||report.specVersion!==specification.match(/文档版本：([^。]+)/)?.[1])throw new Error('Evidence does not bind the current version/specification.');
 const required=['typecheck','build','test','check-helper','check-feedback','check-diagnostics','check-host-native','check-profile','check-native','check-visual','check-uia','check-package','pack','package-inspection','packaged-host-native'];
 if(!required.every(label=>report.commands.some(r=>r.label===label&&r.ok))||!report.commands.every(r=>r.ok))throw new Error('Required automatic checks have not passed.');
 const ids=['CTRL-15','CTRL-16','STOP-08','DATA-06','LIFE-11','OBS-13','OBS-14','KEY-15','PKG-05'];
 for(const id of ids)if(!report.cases.some(c=>c.id===id&&c.status==='PASS'))throw new Error('Missing explicit regression evidence: '+id);
 for(const entry of report.files){const path=resolve(root,entry.file);if(!path.toLowerCase().startsWith((root+sep).toLowerCase())||(await realpath(path)).toLowerCase()!==path.toLowerCase()||sha(await readFile(path))!==entry.sha256)throw new Error('Files changed after validation: '+entry.file);}
 const archive=resolve(report.tarball);if(!archive.toLowerCase().startsWith((join(root,'artifacts')+sep).toLowerCase())||sha(await readFile(archive))!==report.package.sha256)throw new Error('Release artifact changed.');
 const summary={version:pkg.version,specVersion:report.specVersion,basis:'automated-regression',sourceHash:report.sourceHash,package:{name:basename(archive),sha256:report.package.sha256},checks:report.commands.map(({label,ok})=>({label,ok})),regressions:report.cases.filter(c=>ids.includes(c.id)).map(({id,status})=>({id,status})),realDesktopAcceptance:'NOT_RUN',fullMatrixPassInferred:false};
 await writeFile(join(root,'docs/releases',pkg.version+'-validation.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({ok:true,...summary}));
}catch(error){console.error(error.message);process.exitCode=1;}
