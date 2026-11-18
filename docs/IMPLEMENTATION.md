# 当前实现：0.6.0 / spec 1.14.0

能力冻结，后续只修缺陷。运行行为继承0.5.5；完整契约以spec.md第12章为准。以下描述当前实现，不把旧0.4.x默认通道或8字段配置继续称作现行规则。

## 工具与控制生命周期

仅mk_control、mk_observe、mk_mouse和mk_keyboard。HumanAuthority与Controller属于根插件，任务来源、水位、禁止项和Esc锁存跨配置重挂载保留；设置变化先关闭run并清引用。新的合法任务可由模型自行选择桌面方式，不需要用户额外说computer use。单桌面互斥，普通用户活动让路，Esc锁存停止。

输入门、代次、快照TTL、目标进程身份/完整性、焦点和像素独立核验；密码、DSH自身、安全桌面和高完整性目标拒绝。动作取消或部分提交只清理自有按住状态，不回滚或自动重放。清理未确认保留faulted/unknown，不冒报释放。

## 输入通道与脚本审计

Server.Send和ReleaseOwned是两处SendInput提交点。Move/Mouse/Key/Unicode与ScanInputs构造事件并保留MKP1及系统注入属性；普通文本、快捷键和回删都使用这一通道。没有目标CDP、DOM/脚本执行、远程进程代码/内存写入、粘贴或helper联网路径。PowerShell5.1只编译/启动插件自己的C#helper，Client JavaScript只渲染DSH设置面板，不向受控应用执行代码。

PostMessage唯一输入布局例外为WM_INPUTLANGCHANGEREQUEST(0x50)。SendMessageTimeout只以WM_GETTEXT(13)有界读取传统Edit，其他观察依赖UIA与窗口像素，均不是合成输入消息。check:audit和0.6.0验收记录列出原始正则命中及逐条复核；负面帮助字符串和readText布尔参数不当作实际API能力。

## input-layout

begin报告pending；窗口前置和授权通过后、快照前，以实际焦点输入线程HKL=0x04090409为ready判据。记录按PID+进程创建时间+输入线程划分，每线程每run最多一次准备；只查询已加载US并通知实际焦点窗口，不额外切主窗口，不加载/修改语言列表、区域设置或Win热键。每次请求前重新核验控制门、用户活动和前台，等待最多1000ms。

ImmGetContext==0时imeNative=false；有效context查询失败保留null，context始终释放。焦点已US时辅助IME信息不足/冲突只产生有界warnings，可state=ready而verified=false；foregroundLayout只诊断主线程差异，不能否决ready。真正非US仍拒绝。每次新按下前复查，用户切回中文时不反复抢切，已发部分不重放。

end不恢复布局，只读最后目标线程并报告restored=false；目标不可用则unknown/current=null。新begin清空记录。已入队系统消息无法撤回的限制保留；元数据中的verified与正文verification是两回事。

## 时序、纠错与交付

HumanPacer做可取消动作前等待并复查TTL。Humanizer预规划所有输入，natural/slow使用对数正态短间隔、簇间/长尾/上下文停顿；off和显式paceMs=0保留快速确定性路径。普通字符分开发送按下/抬起，代理对原子提交。计划最多20秒、输入执行30秒，外层请求另有预算。

auto的ASCII经目标布局扫描码、非ASCII走Unicode；显式Unicode不变。type可显式allowTypos，只有完整可读的普通编辑器、有效选区、US布局和非命令文本才能启用，typoRate默认1.5%且最多两处。错字/一个Backspace/正确字符均为显式SendInput计划，回删前读回完整值与光标；额外字母计入sentCodePoints。正文最终与原始请求的选区替换期望比较，差异mismatch，证据不足unverified。

鼠标沿弧长在名义8ms网格规划，绝对截止调度允许跳过过期中间点；实际钩子约61–64Hz的已知偏差保留，不继续调参。元素内落点抖动≤2px，图像坐标精确，点击前完整核验不放宽。natural输入期成对请求/释放1ms分辨率，保留高精度等待器、无自旋，诊断报告请求/释放与回退/超时。请求精度不等同实际事件速率。

最后输入交付确认上限300ms；settledMs仅为额外稳定等待，humanization另报dwell/输入/移动时长。sent不是业务成功，后置观察失败保留发送事实并报告observationError。发布不把虚拟sink或计时探针当真实输入。

## 观察、证据与验证范围

UIA有界遍历、值预算和选区证据独立于公开compact/expanded预览；文本截断明确标记，完整私有快照才参与验证。像素捕获、前台协调和DPI检查保留；waitFor只等待UIA文字/元素或区域稳定/变化，不做OCR。savePath仍为唯一用户指定写盘能力，不改历史课程取证规则。

运行包只包含Host/Client共享产物、helper、素材、README和补丁；开发源码/测试/私有证据不打包。版本、SVG和spec-binding由构建校验。全量自动验证含SDK、原生空开关、隐藏UIA和离屏绘制；新增check:audit。

release:check核对源码、自动证据和确切包；--require-desktop还要求同hash的新版本重启后四条指定实机冒烟及typos结论。该结论不替代完整历史矩阵，accept:release严格要求保持。本次定稿范围、已知偏差、实机记录与NOT_RUN分别见docs/acceptance/0.6.0.md。
