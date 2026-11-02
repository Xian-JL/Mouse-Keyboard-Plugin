import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';import os from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url));const started=new Date();
const stamp=started.toISOString().replace(/[:.]/g,'-');const evidence=join(root,'.verification','runs',stamp);await mkdir(evidence,{recursive:true});
const npm=process.env.npm_execpath??join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));const spec=await readFile(join(root,'spec.md'),'utf8');const specVersion=spec.match(/文档版本：([^。]+)/)?.[1];
const results=[];
async function run(label,exe,args,extra={}){
 const at=performance.now();let stdout='',stderr='',exitCode=0;
 try{const r=await promisify(execFile)(exe,args,{cwd:root,windowsHide:true,env:{...process.env,NO_COLOR:'1',...extra},timeout:label==='check-package'?360000:60000,maxBuffer:2*1024*1024});stdout=r.stdout;stderr=r.stderr;}catch(error){exitCode=typeof error.code==='number'?error.code:1;stdout=error.stdout??'';stderr=error.stderr??error.message;}
 const record={label,ok:exitCode===0,exitCode,durationMs:Math.round(performance.now()-at),stdout,stderr};results.push(record);await writeFile(join(evidence,label+'.json'),JSON.stringify(record,null,2)+'\n');
 console.log(`${label}: ${record.ok?'PASS':'FAIL'} (${record.durationMs} ms)`);return record;
}
const scripts=['typecheck','build','test','check:helper','check:feedback','check:diagnostics','check:host-native','check:profile','check:native','check:visual','check:uia','check:package'];
for(const script of scripts){const r=await run(script.replaceAll(':','-'),process.execPath,[npm,'run',script]);if(!r.ok&&['typecheck','build'].includes(script))break;}
let packageInfo=null,tarball=null;
if(results.every(r=>r.ok)){
 const destination=join(root,'artifacts',stamp);await mkdir(destination,{recursive:true});
 const p=await run('pack',process.execPath,[npm,'pack','--ignore-scripts','--json','--pack-destination',destination]);
 if(p.ok){const meta=JSON.parse(p.stdout);tarball=join(destination,meta[0].filename);
  const inspect=await run('package-inspection','python',['-B',join(root,'scripts','inspect-package.py'),tarball,join(root,'.verification','package-'+stamp)]);
  if(inspect.ok){packageInfo=JSON.parse(inspect.stdout);await run('packaged-host-native',process.execPath,[join(root,'scripts','check-host.mjs'),'--native-cycles'],{MK_PLUGIN_ENTRY:packageInfo.entry});}
 }
}
const files=[];async function walk(directory){for(const e of await readdir(join(root,directory),{withFileTypes:true})){if(e.isSymbolicLink())throw new Error('Do not follow source links.');const name=directory+'/'+e.name;if(e.isDirectory())await walk(name);else if(e.isFile())files.push(name);}}
for(const d of ['src','helper','scripts','tests','assets','lib'])await walk(d);files.push('package.json','package-lock.json','README.md','spec.md','cordis.patch.yml','deepseek.svg','.github/workflows/ci.yml','CHANGELOG.md');
const hashes=[];for(const file of files.sort())hashes.push({file,sha256:createHash('sha256').update(await readFile(join(root,file))).digest('hex')});
const sourceHash=createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
const parsedResults=results.flatMap(r=>r.stdout.split(/\r?\n/).flatMap(line=>{try{const value=JSON.parse(line);return value&&typeof value==='object'&&!Array.isArray(value)?[{label:r.label,...value}]:[];}catch{return [];}}));
const proof=(...labels)=>labels;
const coverage={
 'HOST-01':['PARTIAL',proof('check-host-native','check-profile','packaged-host-native'),'真实宿主服务和包内代码已加载，隔离配置组合通过；未执行真实 Desktop GUI 启动及完整安装生命周期。'],
 'HOST-03':['PASS',proof('check-host-native','check-profile'),'针对本机 0.2.1-rc.3 的实际模块与配置组合，不扩展到其他宿主版本。'],
 'HOST-04':['PARTIAL',proof('check-host-native','test'),'真实 volatile 启停 20 次与工具卸载通过；有实际输入和覆盖层的热重载仍未测。'],
 'HOST-06':['PARTIAL',proof('test','check-host-native'),'设置解码、动态引用及 Client 只读/读取失败/保存失败的受控渲染和写入已测；真实 Desktop 交互未验收。'],
 'HOST-07':['PASS',proof('test','check-host-native'),'默认值、显式 false、非法字段与边界解码，真实 volatile 引用已核对。'],
 'OBS-03':['PARTIAL',proof('test'),'会话、run 和目标引用隔离有受控证据；未进行真实窗口句柄复用或目标进程重启。'],
 'OBS-05':['PARTIAL',proof('check-uia'),'隐藏合成控件的值截断通过；完整树深度、节点总量及缺名称场景未完成真窗验证。'],
 'OBS-08':['PARTIAL',proof('test'),'无图片时禁止坐标猜测的受控路径通过；真实画布和模型图片路由未验收。'],
 'MOUSE-02':['PARTIAL',proof('test','check-helper'),'独立坐标公式及原生结构自检通过，不证明物理落点。'],
 'MOUSE-03':['PARTIAL',proof('test','check-visual'),'四倍率纯函数和离屏渲染通过，不等于真实显示器缩放验收。'],
 'MOUSE-05':['PARTIAL',proof('test','check-helper'),'映射纯逻辑通过，真实屏幕裁切和边界点击未执行。'],
 'MOUSE-08':['PASS',proof('test'),'非法坐标在生产解析/映射路径中拒绝，未进入执行器。'],
 'MOUSE-09':['PASS',proof('test'),'快照过期和重复引用均在调用输入执行器之前拒绝。'],
 'MOUSE-11':['PARTIAL',proof('check-feedback'),'直接运行生产原生比较逻辑的合成像素回归通过，覆盖光标和拒绝边界；尚未对 Windows 11 记事本进行新版真实点击复验。'],
 'MOUSE-12':['PARTIAL',proof('check-feedback'),'生产比较器验证 200% 边缘 5/10/12 像素色差 1–2、整窗微小色差及局部显著变化；不是实际 WinUI 采集和点击。'],
 'KEY-01':['PARTIAL',proof('test','check-uia'),'Unicode 参数与隐藏控件读回通过；未使用 SendInput 写入真实应用。'],
 'KEY-02':['PARTIAL',proof('test','check-helper','check-uia'),'代理对与组合字符处理验证不替代目标应用实际输入。'],
 'KEY-03':['PARTIAL',proof('test','check-uia'),'换行规范化和隐藏控件多行识别通过，真实多段输入未执行。'],
 'KEY-04':['PASS',proof('test'),'多行语义 unknown 的文本被 Host 拒绝，输入执行器未调用。'],
 'KEY-08':['PARTIAL',proof('check-uia'),'隐藏密码控件值确实不回传，真实输入拒绝路径未发送事件验证。'],
 'KEY-09':['PASS',proof('test','check-helper'),'控制字符、长度和键位白名单在输入前验证。'],
 'KEY-10':['PARTIAL',proof('test','check-helper'),'白名单及原生键码构造已测，所有真实按键语义未执行。'],
 'KEY-12':['PARTIAL',proof('test'),'受控超时和取消不重放，真实部分输入未执行。'],
 'KEY-13':['PARTIAL',proof('check-feedback','check-uia'),'焦点证据组合与不可见控件读取已测；未将纯逻辑证据冒充实际 WinUI 焦点和 SendInput 输入验收。'],
 'KEY-14':['NOT_RUN',[],'键盘生产路径已改为焦点与编辑状态核验；没有真实 WinUI 输入证据，不因源码检查标为通过。'],
 'STOP-03':['PARTIAL',proof('test','check-feedback'),'普通用户活动让路且不锁存的受控路径通过；真实物理竞争和误发边界未验收。'],
 'STOP-07':['PARTIAL',proof('test','check-feedback','check-host-native'),'仲裁器、物理/注入 Esc 区分、首动作前停止状态机及 begin/end 钩子生命周期已测；实际按 Esc 延迟和用户并行未实测。'],
 'OBS-10':['PARTIAL',proof('check-feedback'),'生产前置协调器覆盖恢复、常规激活、关联回退及清理；未对用户真实窗口执行前置。'],
 'OBS-12':['PARTIAL',proof('check-feedback','check-helper'),'生产协调器以可控平台测试恢复/取消/用户活动/挂起/失败清理；Win32实际前置效果待人工复验。'],
 'OBS-11':['PARTIAL',proof('check-feedback','check-uia'),'原生几何拒绝与不可见 UIA 夹具通过；真实 WinUI 输出过滤未复验。'],
 'VER-01':['PARTIAL',proof('test'),'未知输入不能标 verified；真实拒收文本的应用未验收。'],
 'VER-02':['PARTIAL',proof('test'),'发送/验证状态分离与迟到结果有受控证据；真实附件失败未执行。'],
 'VER-04':['PARTIAL',proof('check-uia'),'值截断事实可读回，但实际输入后的验证完整性尚未验收。'],
 'VER-07':['PARTIAL',proof('check-host-native'),'正常 end 不 concludeTurn，未用真实模型任务证明最终结果表达。'],
 'UI-01':['PARTIAL',proof('check-visual'),'实际 WPF 绘制代码已离屏检查，未在用户桌面显示。'],
 'UI-02':['PARTIAL',proof('check-visual','test'),'蓝色无描边和四倍率 PNG 可核对，真实 DPI 落点未测。'],
 'ANIM-01':['PASS',proof('build','package-inspection','packaged-host-native','check-visual'),'源 SVG 哈希不变，包内相对资源和真实 WPF 几何可用。'],
 'ANIM-02':['PARTIAL',proof('check-visual'),'默认离屏尺寸正确，真实右下工作区锚点未验收。'],
 'ANIM-03':['PARTIAL',proof('check-visual'),'四倍率离屏尺寸通过，真实混合 DPI 双屏未验收。'],
 'ANIM-07':['PARTIAL',proof('check-visual'),'静态图形及动画编排已实现，真实阶段切换和动态观看未验收。'],
 'ANIM-08':['PARTIAL',proof('test','check-host-native'),'控制关闭和旧代次隔离已测，有可见覆盖层的真实切换未测。'],
 'ANIM-11':['PARTIAL',proof('check-native','check-host-native'),'无输入生命周期资源通过；可见卡片 100 次及拔插显示器未执行。'],
 'CTRL-01':['PASS',proof('test','check-host-native'),'默认 closed、重新启用 closed，status/end 不启动观察或输入。'],
 'CTRL-02':['PASS',proof('test','check-host-native','check-native'),'控制幂等、释放确认及同任务重复使用，验证限定为无输入生命周期。'],
 'CTRL-03':['PASS',proof('test','check-host-native','check-native','packaged-host-native'),'真实工具管线与 Helper 完成 100 次开关，人工来源为合成事件，不冒充真实模型任务。'],
 'CTRL-04':['PARTIAL',proof('check-host-native'),'真实 ToolRuntime 不结束回合且后续管线可调用；模型思考仍未验收。'],
 'CTRL-05':['PASS',proof('test'),'新 run 不接受旧 target/snapshot，图片交付与坐标许可隔离。'],
 'CTRL-06':['PARTIAL',proof('test'),'受控输入等待中的 end 取消通过，真实输入块中断未执行。'],
 'CTRL-07':['PASS',proof('test'),'关闭等待中拒绝 begin 和动作，不启动新 run。'],
 'CTRL-08':['PASS',proof('test'),'注入关闭确认失败时 faulted，inputReleased 不伪报 true。'],
 'CTRL-09':['PARTIAL',proof('test'),'人工停止锁存和真实来源继续的逻辑已测；物理 Esc 与真实模型未测。'],
 'CTRL-11':['PARTIAL',proof('test','check-host-native'),'可控时钟验证默认五分钟、配置边界、status/拒绝不续期、忙碌后失败不续期及正常空闲重新 begin；真实模型思考和 Helper 实际到期仍待验收。'],
 'CTRL-12':['PASS',proof('test','check-host-native'),'关闭后的 status 为纯状态读取，无 Helper 启动/观察/输入。'],
 'CTRL-13':['PASS',proof('test'),'迟到取消、观察和已发送结果不能恢复旧控制或停止新 run。'],
 'CTRL-14':['PASS',proof('test','check-host-native'),'真实配置引用停用后撤回四工具，正常 end 不改 enabled。'],
 'LIFE-01':['PARTIAL',proof('test','check-native'),'Agent 租约及跨进程互斥通过，未发送并发真实输入。'],
 'LIFE-02':['PASS',proof('check-native'),'同用户不同 Helper 进程的命名互斥确实拒绝第二拥有者。'],
 'LIFE-03':['PARTIAL',proof('test'),'传输死亡结果未知且不重放，真实输入中进程死亡未测试。'],
 'LIFE-04':['PARTIAL',proof('check-host-native','check-native'),'20 次宿主启停和无输入 Helper 退出通过，真实按键/覆盖层资源未测。'],
 'LIFE-06':['PASS',proof('test'),'nonce、请求、run、迟到和重复响应均有受控协议证据。'],
 'LIFE-07':['PASS',proof('test'),'超长/污染行受限失败，UTF-8 分片可正确组装。'],
 'LIFE-08':['PARTIAL',proof('test','check-host-native'),'代次与配置子上下文隔离已测，实际输入期间启停未测。'],
 'LIFE-09':['PASS',proof('test'),'工具 schema 和生产解析器拒绝 session/script/exe 等未知参数。'],
 'DATA-03':['PASS',proof('test'),'runtime、model、agent 来源和标题不能生成新的人工授权。'],
 'DATA-04':['PASS',proof('test','check-feedback'),'生产授权/检索路径验证中文别名、明确人工继续、同会话范围和序号重放拒绝。'],
 'DATA-05':['PASS',proof('test','check-host-native'),'普通分析/解释任务可自主 begin，普通窗口无逐次审批；显式禁用、Esc锁存、消息来源与read-only防护有回归及实际工具管线证据。'],
 'LIFE-10':['PARTIAL',proof('test','check-diagnostics','check-host-native'),'实际原生错误经 Bridge 保留详情；真实 Host 管线保留授权错误详情；真实窗口动作错误的完整链路仍待验收。'],
 'PKG-01':['PASS',proof('package-inspection','packaged-host-native'),'检查确切 tarball；从解包后的 lib 加载真实宿主与 Helper，不靠源目录 lib。'],
 'PKG-02':['PASS',proof('build','package-inspection'),'版本一致性、源码指纹与确切 tarball SHA-256 已记录。'],
 'PKG-03':['PARTIAL',proof('check-host-native','check-profile'),'真实服务卸载及隔离组合通过；真实安装卸载完整流程未执行。'],
 'PKG-04':['PASS',proof('package-inspection','packaged-host-native'),'确切包排除5个研发入口、源码/测试/历史资料，包内真实Host与Helper可装载。']
};
// New regressions identify the requirement they actually execute. A command
// succeeding without its case marker cannot silently award that case PASS.
const executedIds=new Set(parsedResults.filter(r=>r.ok===true).flatMap(r=>r.checkedCaseIds??[]));
const nodeTests=results.find(r=>r.label==='test'&&r.ok)?.stdout??'';
for(const match of nodeTests.matchAll(/✔ \[([A-Z0-9,-]+)\]/g))for(const id of match[1].split(','))executedIds.add(id);
for(const id of ['CTRL-15','CTRL-16','STOP-08','DATA-06','LIFE-11','OBS-13','OBS-14','KEY-15'])coverage[id]=[executedIds.has(id)?'PASS':'NOT_RUN',proof(id==='OBS-13'||id==='KEY-15'?'check-feedback':'test'),'本版自动回归明确输出此用例ID；只证明规格限定的受控/纯逻辑场景，不替代真实应用输入。'];
coverage['PKG-05']=[results.some(r=>r.label==='check-package'&&r.ok)?'PASS':'NOT_RUN',proof('check-package'),'确切tarball和包内Helper、rc.3/rc.5 SDK管线通过；未操作实际Desktop Profile。'];
const rows=spec.split(/\r?\n/).flatMap(line=>{const m=line.match(/^\| ((?:HOST|OBS|MOUSE|KEY|VER|UI|STOP|CTRL|ANIM|LIFE|DATA|PKG)-\d+) \| (.*?) \|/);if(!m)return [];const c=coverage[m[1]]??['NOT_RUN',[],'需要真实桌面、显示器、人工输入或完整模型任务证据；本轮未执行。'];const available=c[1].filter(label=>results.some(r=>r.label===label&&r.ok));let status=c[0];if(status!=='NOT_RUN'&&available.length<c[1].length)status=available.length?'PARTIAL':'NOT_RUN';return [{id:m[1],scenario:m[2],status,evidence:available,note:c[2]}];});
if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Duplicate spec case IDs.');
const overall=results.every(r=>r.ok)?'PARTIAL':'FAIL';const counts=Object.fromEntries(['PASS','PARTIAL','NOT_RUN'].map(s=>[s,rows.filter(r=>r.status===s).length]));
const report={version:pkg.version,specVersion,overall,completeVersion:false,startedAt:started.toISOString(),finishedAt:new Date().toISOString(),scope:'No user-window enumeration, screenshots, activation or keyboard/mouse input. Hidden synthetic UIA and offscreen graphics only.',environment:{windows:os.release(),arch:process.arch,node:process.version,cpu:os.cpus()[0]?.model,memoryGiB:Math.round(os.totalmem()/1024**3),actualMonitorDpi:'NOT_MEASURED',modelRoute:'NOT_USED'},sourceHash,files:hashes,commands:results.map(({stdout,stderr,...r})=>r),parsedResults,package:packageInfo,tarball,caseCounts:counts,cases:rows,e2e:Array.from({length:6},(_,i)=>({id:`E2E-0${i+1}`,status:'NOT_RUN',reason:'No real model or user desktop input was exercised.'}))};
const docs=join(root,'docs','acceptance');await mkdir(docs,{recursive:true});await writeFile(join(docs,`v${pkg.version}.json`),JSON.stringify(report,null,2)+'\n');
let md=`# ${pkg.version} 开发构建验收记录\n\n日期：${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(started)}。规格：${specVersion}。总判定：**${overall}**。这不是已完成或完整验收通过的版本。\n\n## 本轮范围\n\n本轮未枚举或截图用户业务窗口，未激活用户应用，未发送真实键盘鼠标输入。运行了不可见合成 UIA、离屏 WPF、真实宿主工具管线及无输入原生开关。本轮未修改用户真实 Desktop Profile；用户已安装的版本保持原状。本版 begin 会安装 Esc/协作监听，end 撤销；无输入开关测试不能称为没有监听钩子。\n\n## 构建绑定\n\n源码及运行文件指纹：\`${sourceHash}\`。确切包：\`${tarball??'未生成'}\`。包 SHA-256：\`${packageInfo?.sha256??'未生成'}\`。逐文件哈希和命令证据见同目录 JSON，原始输出在 \`${evidence}\`。\n\n## 自动检查\n\n| 检查 | 结果 | 耗时 ms |\n| --- | --- | --- |\n`;
for(const r of results)md+=`| ${r.label} | ${r.ok?'PASS':'FAIL'} | ${r.durationMs} |\n`;
md+=`\n## 逐条规格验收\n\nPASS ${counts.PASS} 项、PARTIAL ${counts.PARTIAL} 项、NOT_RUN ${counts.NOT_RUN} 项。这些数量不能替代各条证据范围。完整要求仍是 ${rows.length} 项矩阵及六类真实模型任务；原有用例保留，用户明确变更的协作策略按 spec ${specVersion} 验收，未测项目不改为通过。\n\n| 用例 | 状态 | 已验证范围与缺口 |\n| --- | --- | --- |\n`;
for(const row of rows)md+=`| ${row.id} | ${row.status} | ${row.note} |\n`;
md+='\n## 真实模型端到端\n\nE2E-01 至 E2E-06 均为 NOT_RUN。合成人工事件、模拟后端、原生空开关和隐藏控件读回都不计作真实模型自主操作验收。\n\n## 剩余工作\n\n真实点击和输入、目标应用兼容、物理 Esc 和用户协作、覆盖层穿透及截图排除、实际 DPI 双屏、完整模型截图链路，以及客户端设置与故障呈现仍需受控验收。最小 Client 设置页已有实现和受控测试，但未在真实 Desktop 验收。所有这些缺口保留，当前 private 开发包不晋级为完成版。\n';
await writeFile(join(docs,`v${pkg.version}.md`),md,'utf8');
await writeFile(join(evidence,'summary.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({overall,completeVersion:false,version:pkg.version,specVersion,caseCounts:counts,tarball,report:join(docs,`v${pkg.version}.md`),sourceHash}));
if(overall==='FAIL')process.exitCode=1;
