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
 const required=['typecheck','build','test','check-audit','check-helper','check-humanization','check-feedback','check-diagnostics','check-host-native','check-profile','check-native','check-visual','check-uia','check-package','pack','package-inspection','packaged-host-native'];
 if(!required.every(label=>report.commands.some(r=>r.label===label&&r.ok))||!report.commands.every(r=>r.ok))throw new Error('Required automatic checks have not passed.');
 const ids=['CTRL-15','CTRL-16','STOP-08','DATA-06','LIFE-11','OBS-13','OBS-14','KEY-15','PKG-05','HUM-01','HUM-02','HUM-03','HUM-04','HUM-05','HUM-06','HUM-08','HUM-09','HUM-10','LAYOUT-01','LAYOUT-02','LAYOUT-03','AUDIT-01'];
 for(const id of ids)if(!report.cases.some(c=>c.id===id&&c.status==='PASS'))throw new Error('Missing explicit regression evidence: '+id);
 for(const entry of report.files){const path=resolve(root,entry.file);if(!path.toLowerCase().startsWith((root+sep).toLowerCase())||(await realpath(path)).toLowerCase()!==path.toLowerCase()||sha(await readFile(path))!==entry.sha256)throw new Error('Files changed after validation: '+entry.file);}
 const archive=resolve(report.tarball);if(!archive.toLowerCase().startsWith((join(root,'artifacts')+sep).toLowerCase())||sha(await readFile(archive))!==report.package.sha256)throw new Error('Release artifact changed.');
 let desktopSmoke=null;
 const smokePath=join(root,'.verification',`release-desktop-${pkg.version}.json`);
 try{
  const smoke=JSON.parse(await readFile(smokePath,'utf8'));
  if(smoke.version!==pkg.version||smoke.sourceHash!==report.sourceHash||smoke.packageSha256!==report.package.sha256||smoke.desktopRestarted!==true)throw new Error('Desktop evidence does not bind the installed release.');
  const ids=['LIVE-01','LIVE-02','LIVE-03','LIVE-04'];if(!Array.isArray(smoke.cases)||smoke.cases.length!==ids.length||!ids.every(id=>smoke.cases.filter(c=>c.id===id&&c.status==='PASS').length===1))throw new Error('Required desktop smoke cases have not all passed.');
  if(!['PASS','NOT_RUN'].includes(smoke.typos?.status))throw new Error('Missing explicit typo acceptance result.');
  const reason=smoke.typos.reason;if(typeof reason!=='string'||!reason.length||reason.length>400)throw new Error('Typo evidence needs a bounded result/reason.');
  desktopSmoke={scope:'requested-v0.6-freeze-smoke',status:'PASS',desktopRestarted:true,cases:ids.map(id=>({id,status:'PASS'})),typos:{status:smoke.typos.status,reason}};
 }catch(error){if(error.code!=='ENOENT'||process.argv.includes('--require-desktop'))throw error;}
 if(process.argv.includes('--require-desktop')&&!desktopSmoke)throw new Error('Required post-restart desktop evidence is missing.');
 const summary={version:pkg.version,specVersion:report.specVersion,basis:'automated-regression',sourceHash:report.sourceHash,package:{name:basename(archive),sha256:report.package.sha256},checks:report.commands.map(({label,ok})=>({label,ok})),regressions:report.cases.filter(c=>ids.includes(c.id)).map(({id,status})=>({id,status})),humanizationValidation:report.parsedResults.find(r=>r.label==='check-humanization')??null,runtimeAudit:report.parsedResults.find(r=>r.label==='check-audit')??null,desktopSmoke,realDesktopAcceptance:desktopSmoke?'PARTIAL':'NOT_RUN',fullMatrixPassInferred:false};
 await writeFile(join(root,'docs/releases',pkg.version+'-validation.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({ok:true,...summary}));
}catch(error){console.error(error.message);process.exitCode=1;}
