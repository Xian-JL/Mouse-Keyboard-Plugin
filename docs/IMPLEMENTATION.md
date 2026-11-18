# 当前实现：0.5.0 / spec 1.10.0

当前时序与输入通道以文末0.5.0修订为准；下列0.4.x路径段落作为继承基线保留。默认auto的ASCII已改扫描码，设置增加两个节奏字段，不再采用可编辑目标默认Unicode或固定8字段的旧口径。

# 实现与验证边界

## 当前版本

0.4.0-dev.2对应spec 1.9.0。0.3.0是人工确认过的历史基线；本版新增行为独立验证，不复用旧版人工验收结论。历史源码与本机证据留在本地归档，公开仓库保留当前工程和脱敏摘要。

## 生命周期与输入

HumanAuthority和Controller归属于根插件，配置更新先关闭run、清除引用，再重挂载工具。当前任务、序号水位、持续禁用和Esc锁存不被设置更新清空；Agent销毁只释放该Agent资源，会话销毁才删除会话权限。持续禁用需要真实明确允许电脑操作才能解除，Esc可以由任务上下文内的真实明确继续解除。

严重错误即使封装在成功JSON响应中，也触发输入阻断与清理。原生释放失败先关门，Controller保留发送事实；无法确认释放时保持faulted。Bridge完整校验响应后再移除pending，畸形响应与管道错误明确拒绝请求，不自动重放。

0.4.0的输入路径由`inputMode`决定：可编辑目标默认走`unicode`，非可编辑目标（画布/VNC）默认走`scancode`。scancode用`VkKeyScanW`取虚拟键，自己按下的Shift在`finally`中经`ReleaseOwned`释放，Ctrl/Alt映射一律拒绝；整段文本先完成映射规划再发送，任一字符不可映射时在发送任何事件之前失败，避免"发到一半才发现打不出"。`settleMs`在最后一个事件后等待目标稳定，通用确认以`GetLastInputInfo`为据、上限300ms。删除`editable`门禁是恒开决定，不新增设置项，`Settings`仍为8个字段；密码、DSH自身、安全桌面、更高完整性进程、焦点/几何/快照等拒绝项不改。

多块`type`的逐块复验只核对焦点身份、所属窗口、前台、启用/可见与`editable`/密码状态：我们自己的输入会移动光标或改变隐藏textarea的矩形，继续用快照里的RECT比较会把"输入本身造成的变化"误判成`STATE_CHANGED`，长文本因此在块边界被截断。第一个块与所有`key`动作仍做完整比较，文本/选区期望仍来自快照，`verified`/`mismatch`的判定与其它拒绝项不变。

## 观察和前置

先校验窗口身份、桌面和宿主权限，再用有界恢复/前置协调器操作已有窗口。输入关联始终撤销，不模拟Alt/Win、不永久置顶。用户活动优先让路，物理Esc监听在单独Overlay线程运行。

焦点先读取，UIA软遍历800ms、阶段预算1200ms、总观察2500ms。预算不能中断一个已进入的同步UIA提供者调用，Host的8秒观察请求及失败后Helper回收提供外层边界；清理未知不伪报成功。慢读取与几何/内容变化使用不同错误码。

文本只用有界TextPattern或传统Edit的75ms有界消息读取。ValuePattern只参与编辑能力判断，不获取无限全文。多行证据采用原生Edit样式、明确ARIA属性或已观察换行；未知仍拒绝含LF的type，不保证所有网页编辑器的Enter语义。

`mk_observe window`的`waitFor`把等待变成一次调用：`text`/`element`匹配UIA内容，`pixel`比较同一区域的`stable`/`changed`，轮询间隔150ms。命中返回当场的新观察；超时不是协议错误，仍返回最后一次观察并附`OBSERVATION_TIMEOUT`与`requiredAction=reobserve`。画布没有文本通道，对画布只能用`pixel`；pixel只回答稳定/变化，不识别内容，也不读取外部参考图。

`region`使用返回图像的像素坐标（与`mk_mouse`的x/y同域），必须落在`imageSize`内。`mk_observe`上它同时裁剪返回图片与落盘PNG，并平移`captureRect`，使后续坐标映射仍正确；动作上它只裁剪`savePath`的PNG。落盘仍是原始分辨率，不缩放，也不改变身份、焦点、几何和快照复验。

画布类目标的坐标点击在发送前只比较落点周围12 DIP：`ControlType.Image`（画布/VNC）会因光标闪烁和自身重绘整窗变化，整窗比对会把"画面在动"误判成目标变化。落点落在观察到的`Image`元素内时改用局部邻域比对，并允许最多3次、间隔约60ms的重采；非画布坐标点击仍比较完整捕获区域，身份、几何、前台与遮挡检查不变。

## 模型交付与验证

私有Snapshot保留完整的有界焦点证据。默认compact预览焦点512个UTF-16单元，expanded为4096；共享文本与元素JSON另设上限。投影不修改私有数据，焦点正文不重复交付，所有截断明确标记。verified依赖原生完整值及选区替换比较，公开预览并不充当完整验证。

Host先识别模型图片能力，再决定是否要求PNG编码。纯文本模型仍有内部捕获和点击保护，但无PNG交付与坐标许可。后置观察可直接用于下一动作。timings与结构化诊断用于测量阶段耗时、错误和结果字节数，不写输入全文、标题、截图或路径。

0.4.0起每个回执信封都带`observation`（对象或`null`），后置观察失败时用`observationError`区分"动作已执行但拍不了照"与动作本身失败；`mk_observe window`仍把观察作为返回值本身。`retryable`/`requiredAction`由发送事实推导：只有`execution=not_sent`且属于瞬时错误才可重试，任何已发送后的失败都不得报`not_sent`，也不得重放。`observe=none`时`observation`为`null`，但`savePath`仍写完整PNG。

## 包与自动检查

运行包只含Host/Client入口、共享chunk、Helper、素材和README。研发导出、源码、测试、证据和历史不进入安装包；SVG原图哈希、规格和版本绑定。

公共CI使用Node22.19/24，运行状态/协议/来源与Host重挂载回归、生产原生比较和投影、隐藏UIA、离屏WPF以及确切包检查。check:package从固定rc.3/rc.5 SDK加载包内Host并编译包内Helper，不要求本地Desktop安装。本机实际rc.5另做Cordis/ToolRuntime与100次无输入开关。

这些自动检查不操作业务窗口，不代替浏览器/Electron实际输入、物理Esc时限、图片模型真实交付、覆盖层穿透或混合DPI验收。release:check验证当前自动证据与源码/包哈希，公开脱敏摘要；accept:release仍要求完整矩阵。实际Desktop Profile、认证和网络配置不由验证脚本修改。


## 0.5.0时序与交付修订

当前版本0.5.0/spec1.10.0。HumanPacer在Controller内做可取消dwell，随后再次核对TTL与代次。新增全局natural/slow设置及每次动作humanize参数；global false和显式paceMs=0保留可控的快速路径，旧8个数值/开关默认不变。

Humanizer在输入前完成键盘和运动计划，ASCII按目标布局走虚拟键映射，非ASCII保留Unicode；显式Unicode不变。逐事件等待通过小片段检查，代理对作为原子单元。OwnedInputs记录实际已发送前缀并提供同一套生产清理；只跳过自身按下状态，不忽略真实用户活动。按下之后的自有释放允许正常焦点变化，新的按下仍重验目标。

鼠标先曲线接近/悬停再到点，长路径自适应补帧；只在已知元素内抖动，坐标点不盲目抖动。点击前复验实时元素状态。蓝色指针跟随路径，单次计划延迟20秒和执行30秒内部边界预留外层40秒清理时间。

settledMs仅计交付后的额外等待，humanization另报dwellMs/inputDurationMs/plannedDelayMs/mouseMoveEvents。计划器统计与虚拟故障注入不代表真实SendInput或低级钩子采样；本轮未运行的实机项明确记录NOT_RUN。
