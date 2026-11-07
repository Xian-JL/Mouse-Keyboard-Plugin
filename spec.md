# Mouse-Keyboard-Plugin 技术规格

文档版本：1.9.1。更新日期：2026-11-07。当前实现版本：0.4.1。0.4.0 新增第 12 节（含 12.14 的 dev.2 修订与 0.4.1 的验收口径修订），只约束 0.4.0-dev.1 及以后的构建；0.3.0 的人工验收属于历史基线，不自动继承为本版新增行为的真机验收。

## 1. 版本收束与授权

用户于 2026-10-30 确认前一阶段验收完成，要求整合最小版本，并新增窗口直接前置及模型自主选择电脑操作。本文件将旧规格整合为单一现行契约；原 1.4.0、源代码和历次失败/验收记录保留于 docs/history、artifacts/baselines 和 docs/acceptance。用户确认作为人工阶段收尾记录，不倒填未实测条目的 PASS。

最小运行包只包含 Host、Client、Windows Helper 和必要素材。保留四工具及已有设置兼容，不新增应用启动、浏览器 DOM、文件、剪贴板、右键、滚动、拖拽、任意脚本工具。本版新增的唯一写盘能力是可选 savePath：只把本次捕获的 PNG 原图写入已存在的目录，拒绝覆盖既有文件，不写其它内容、不读文件、不列目录。研发测试入口和历史资料不进入运行包。后续变更先更新规格，再按当前版本构建和逐项验收。

## 2. 模型自主选择

在本插件已由用户启用、宿主允许电脑操作的当前真实人工任务中，模型可自行判断使用电脑是否更合适，直接 begin、发现目标、前置观察、点击和输入。无需人工说 computer use、点击、输入或应用名；取消旧的动作词/对象词门槛和逐窗口授权弹窗。

真实人工任务仍来自当前会话 append-origin/source=user 的新消息，序号不可重放。模型、网页、文件、工具结果和其他 Agent 不能生成新人工任务。显式“不要控制电脑”“只分析，不操作电脑”等限制须尊重；“不要改动已有文字”“不用重新启动”等其他任务限制不能被旧关键词规则误判为全面禁用电脑。

所有目标仍绑定 HWND/PID/进程创建时间，输入不能跨会话或跨 run 继承。只操作与当前任务有关的窗口。宿主 read-only 或缺少 sandboxPolicy 时不得开启控制、激活窗口或提交输入；不修改宿主访问权限。DSH 自身、Helper、密码字段、安全桌面及更高完整性进程继续拒绝。

## 3. 四工具

| 工具 | 参数与行为 |
| --- | --- |
| mk_control | action=begin/end/status；默认 closed；begin 幂等；end 交还电脑但保留工具与后续思考；status 不采集桌面、不启动 Helper、不续期 |
| mk_observe | mode=targets 可带 query（支持共享中文别名）；mode=window 必带 target，可选 detail=compact/expanded（默认 compact）和 savePath（绝对 .png，落在已存在目录），恢复并前置后返回新观察 |
| mk_mouse | 单次左键点击：element 与 x/y 二选一，必须来自当前 target 的最新单次 snapshot；可选 savePath 保存后置观察 |
| mk_keyboard | type Unicode 文本或 key 白名单组合；无隐式全选或提交，不通过粘贴绕过；可选 savePath 保存后置观察 |

键位保留 Enter、Tab、Shift+Tab、Escape、Backspace、Delete、方向键、Home/End、PageUp/PageDown、Ctrl+A/Ctrl+S/Ctrl+Home/Ctrl+End。文本最多 16000 Unicode 码点/64 KiB；只规范化 CRLF/CR 为 LF，拒绝未配对代理项和非白名单控制字符。含 LF 文本需要已确认多行编辑语义。

## 4. 自动恢复与前置

window 观察先校验目标身份、桌面与权限，再处理最小化和前台。采用 Windows 恢复、前置及必要的短时线程输入关联，始终在 finally 中解除关联；不使用模拟 Alt/Win 按键、不永久置顶、不启动应用或强行修改系统前台锁参数。

用户正在按键/拖动或有近期物理活动时让路，不反复抢前台。恢复与激活有界，检查控制代次、Esc、活动代次和目标身份；成功只以真实 IsIconic=false 且 GetForegroundWindow=target 为准，不按 API 返回值冒报。恢复/激活失败返回 WINDOW_RESTORE_FAILED、FOREGROUND_DENIED、ACTIVATION_TIMEOUT 或 USER_BUSY 及数值诊断。

新观察在恢复/前置完成后建立，不复用恢复前的尺寸、DPI、snapshot 或焦点；动作阶段失焦不悄悄重新激活，须重新观察。物理急停监听与激活线程分开，窗口不响应时仍可关闭输入门。

## 5. 执行与证据

snapshot 默认 30000 ms，允许 1000–60000；仅最新可用，动作取得执行资格时单次消费。窗口身份、几何、DPI、前台或 run 变化、用户活动代次变化、Esc 和停用均使旧引用失效。

键盘核对实时 UIA FocusedElement、RuntimeId、所属根窗口、系统焦点 HWND、可见启用和编辑状态，独立比较已观察的完整文本/选区。HasKeyboardFocus=false 仅在可编辑、可键盘聚焦和其他证据一致时兼容。不以整窗画面一致拒绝键盘。

控件点击重新核对身份、边界、启用和可见性，落点命中该控件或其后代，比较落点周围 12 DIP；坐标点击比较完整捕获区域。矩形非有限、空、溢出或不可见的元素不进入可点击引用表，但继续遍历其后代；合法负屏幕坐标保留。

像素允许每通道 2/255 微小色差；系统光标只归一化其已确认的小矩形，前后位置需一致；无 hwndCaret 时仅完整编辑值与折叠选区不变的编辑器内连续窄竖条可获光标容差（宽≤3 DIP，高4–48 DIP）。不固定裁除窗口四边、不忽略任意条带。低对比度变化存在辨识极限，UIA 编辑内容检查独立执行。

结果执行状态为 not_sent/sent/partially_sent/unknown，验证状态为 unverified/observed_change/verified/mismatch；sent 不等于业务成功。只有完整同一编辑器值及选区替换能独立比较时才给 verified。后置观察最多稳定等待 1500 ms；不稳定标 unstable。输入后观察失败保留发送事实，禁止盲目重放。

错误 details 仅有界数值、固定阶段、检查项及标明 screen-physical-pixels 的矩形，贯通 Helper/Bridge/Host；不含业务全文、截图、路径或异常堆栈。截图经实际 DSH 图片附件交给模型；无图片能力时 image=null 并禁止像素猜测，保留元素引用。

可选 savePath 写入的是本次捕获的原始分辨率 PNG，独立于模型图片路由：Path 校验为绝对 Windows 路径、长度 8–240、以 .png 结尾、无控制字符；目录必须已存在；同名文件已存在时返回 SAVE_EXISTS 且不覆盖。落盘发生在身份、焦点、几何与快照复验之后，重试轮次不产生残留文件。观察结果以 saved 返回 path/width/height/bytes。

## 6. Esc、协作与生命周期

begin 起监听真实物理 Esc，包括首次输入前与模型思考阶段；立即关输入门，停止后续块，清理插件资源并锁存。模型不能通过 begin/end/status 解锁；只有新的真实人工明确继续/恢复指令可以解除。普通追问或解释请求不能顺便解除 Esc。

普通用户键鼠不关闭 run；用户活动后至少 250 ms 空闲、无按下键/按钮且活动代次未变化才能提交，逐块再次核对。冲突 USER_BUSY/INPUT_INTERFERENCE 让当前动作停止，保留 ready；部分发送不自动补发，不释放用户按住的状态。共享 Windows 输入流，不承诺独立双鼠标键盘。

输入全局只允许一个 run，以用户会话级命名互斥协调多个进程；无动作排队。end 优先关闭输入门，取消旧代次，释放自有输入、钩子、覆盖层和租约，确认后才返回 closed/inputReleased=true/overlayVisible=false。关闭失败为 closing/faulted，不伪报释放；旧回调不能恢复新 run。

人工任务结束、取消、Agent/会话销毁、停用和父进程退出均清理。默认控制空闲 300000 ms（60000–900000）；status 和拒绝且 not_sent 的请求不续期，真实已发送操作计为活动。正常 end 后可同任务再次 begin，须重新发现观察；关闭后的 Helper 无控制权，可空闲保留120秒后回收。

## 7. 提示与资源

操作时蓝色 #168BFF 实心箭头无外边线；右下角 DeepSeek 卡片160×64 DIP、logo28×28、加载条72×3、边距16 DIP。使用原始 deepseek.svg，SHA256=8f9443e351b6dacce71871790201b799d92e8bf96a45ef79aeb5e9bf4db423e2。指针热点、截图缩放、物理屏幕与负坐标映射保留现有规则，不二次缩放。

覆盖层不激活、不拦截输入、从截图及 UIA 排除；无可信总量时无百分比或虚假完成。begin/只枚举不显示，输入前显示，10秒空闲可隐藏但不代表关闭；end/Esc/故障/停用后清理。系统减少动画时静态显示。

Helper 使用随包 C#、Windows PowerShell和.NET，无远程驱动/提权；stdio JSONL 协议版本1，nonce/request/run 校验，请求256 KiB、响应4 MiB，截图≤2MiB/1600×1200，UIA≤300/深度10。单动作总预算40秒，启动30秒，发现3秒，观察传输8秒，end3秒。观察内部预算及文本交付按第11节；瞬时错误不重放输入。

## 8. 设置与最小交付

保留 enabled、snapshotTtlMs、controlIdleMs、screenshotMaxWidth/Height、maxElements、maxTreeDepth、diagnosticsEnabled，默认及范围由共享定义产生。缺字段补默认，显式 false/旧值保留；volatile 修改先交还电脑并清旧引用。设置页读取失败不展示可写默认值，保存失败明确提示，不使用 localStorage。

运行包只包含实际 Host/Client 入口、共享产物、Helper、素材和 README；排除研发单测入口、源码、证据和历史包。版本、spec哈希、原图哈希、代码指纹及确切 tarball 绑定，私有本地交付，不自动覆盖已安装包或发布。

## 9. 验收与历史

原107项矩阵保留；下列条款受本版明确用户需求修订：普通任务可自行电脑操作、取消关键词/逐窗口审批、可恢复并前置窗口。不得把旧机制的失败断言原样当新版要求。六类 E2E 仍分别为长文分析输入、显式替换、本地表单、Esc恢复、焦点干扰、三组交还后思考再开启。每版记录所有尝试、失败及证据范围，未运行项不标 PASS。纯函数、模拟后端、隐藏UIA和空开关不代替真实桌面。

用户于2026-10-30确认 dev.3 前一阶段验收完成；已报告的真实记事本闭环和三组六次开关单独归档，未独立测量的 Esc 时限、图片路由及混合 DPI 不倒填通过。本版代码、宿主集成和包检查完成后生成新验收记录；真实新增前置效果由后续人工复验。

### 保留矩阵

| 用例 | 场景 | 通过标准 | 证据 |
| --- | --- | --- | --- |
| HOST-01 | 在本机当前 DSH 的隔离 Profile 安装构建包 | 真实加载成功且仅注册四个工具，默认 closed，无重复核心依赖导致的身份异常 | 安装回执、版本、工具目录 |
| HOST-02 | Host 服务缺失 | 明确失败或限定只读能力，不伪装完整可用 | 受控集成记录 |
| HOST-03 | 当前预发布宿主的 peer 校验 | 真实通过并记录宿主和各关键 peer 版本 | 宿主检查结果 |
| HOST-04 | 停用、启用、热重载 | 工具不重复；旧代次不能动作；新实例不被旧清理破坏 | 注册与资源计数 |
| HOST-05 | 配置保存和重启 | Profile 内恢复正确，不影响其他 Profile | 前后配置摘要 |
| HOST-06 | 只读设置、读取失败、保存失败 | 界面准确显示失败，不能控制桌面或伪装保存成功 | 失败注入记录 |
| HOST-07 | 非法配置和显式 false | 明确解码结果，false 不丢失，无全配置无提示重置 | 单元与集成记录 |
| OBS-01 | 多个普通应用窗口及超过 40 个候选 | 发现真实窗口，引用绑定稳定身份，筛选先于限额且截断准确，禁止目标无内部内容泄露 | 真机与 Helper 记录 |
| OBS-02 | 两个同名窗口 | 不猜测目标；必要时报告歧义 | 真机截图及回执 |
| OBS-03 | PID / HWND 复用或进程重启 | 旧引用拒绝，不能操作新实例 | 受控模拟及真机重启 |
| OBS-04 | 最小化、关闭和窗口移出屏幕 | 最小化可恢复前置，关闭拒绝；裁切和错误准确 | 真机记录 |
| OBS-05 | UIA 树超过上限、节点缺名称 | 明确截断，不编造控件，不错误指向其他节点 | 合成窗口 |
| OBS-06 | UIA 卡住或应用不响应 | 超时有界，急停仍可用，不遗留工作进程 | 故障注入与资源记录 |
| OBS-07 | UIA 与截图采集间发生变化 | 重采一次或失败，不返回伪一致快照 | 受控变化记录 |
| OBS-08 | 没有 UIA 的可视画布 | 图片路由可完成观察；文本路由准确表达不足 | 两类模型路由记录 |
| OBS-09 | 锁屏、安全桌面或权限不等 | 拒绝操作，不自动提权 | 可安全执行的真机检查及边界测试 |
| MOUSE-01 | 按控件引用点击测试按钮 | 目标按钮实际收到且只收到一次点击 | 夹具计数和回执 |
| MOUSE-02 | 按截图坐标点击 | 动作落点与映射一致，误差不超过 2 个物理像素 | 独立落点记录 |
| MOUSE-03 | 100%、125%、150%、200% 缩放 | 均正确映射，不能二次缩放 | 各倍率真机证据 |
| MOUSE-04 | 混合 DPI 双屏及负坐标显示器 | 两屏均正确，跨屏后旧观察失效 | 双屏真机证据 |
| MOUSE-05 | 截图缩小与部分窗口裁切 | 与独立公式一致，边界点无越界 | 单元与真机对照 |
| MOUSE-06 | 观察后移动窗口、缩放或改变内容 | 不点旧位置，返回需重观察 | 动态夹具 |
| MOUSE-07 | 其他窗口遮挡落点 | 遮挡窗口没有收到点击 | 双窗口夹具计数 |
| MOUSE-08 | 非法、越界、NaN 或非整数坐标 | 在任何移动和输入前拒绝 | schema 与 Helper 测试 |
| MOUSE-09 | 观察超时或重复使用引用 | 无输入，明确失效原因 | 集成回执 |
| MOUSE-10 | 按下成功、释放失败 | 不遗留按下状态，返回部分或未知事实 | 输入故障注入 |
| MOUSE-11 | WinUI 无 hwndCaret 的光标闪烁与真实界面变化 | 有依据的光标容差及第 25 节微小色差可通过；显著目标变化、可读文本变化及几何变化拒绝 | 合成像素回归及真实 WinUI 复验 |
| KEY-01 | 中文、英文、全角标点、引号、反斜杠 | 目标值逐字匹配，不依赖输入法组合 | 夹具原始值 |
| KEY-02 | Emoji、非 BMP 字符、组合字符 | 编码正确，无丢字、重复或拆坏代理对 | 独立码点对照 |
| KEY-03 | 多行分析与 CRLF 输入 | 按既定规范换行，不触发提交 | 多行控件计数与值 |
| KEY-04 | 单行输入框和未知换行语义 | 含 LF 输入被拒绝，无部分提交 | 夹具事件记录 |
| KEY-05 | 原有文本及选区插入 | 不隐式清空；预期值计算和验证正确 | 前后值与选择范围 |
| KEY-06 | 显式 Ctrl+A 后输入 | 两次动作使用正确观察链，替换结果匹配 | 集成记录 |
| KEY-07 | 焦点被抢、切到其他应用 | 新窗口不收到文本，原动作停止 | 双应用真机检查 |
| KEY-08 | 密码字段与禁用字段 | 不泄露值、不输入、不走坐标绕过 | 合成敏感控件 |
| KEY-09 | 非法控制字符、超长文本、未知快捷键 | 输入前拒绝且不截断偷发 | 边界测试 |
| KEY-10 | 所有允许按键 | 在合成应用中与说明一致，无额外按键 | 事件日志 |
| KEY-11 | 用户预先按住修饰键 | 不产生未请求组合，不释放用户拥有的状态 | 真机输入测试 |
| KEY-12 | 输入中断、超时或 Helper 断开 | 已发送边界保守准确，无自动重放 | 故障注入 |
| KEY-13 | UIA FocusedElement 正确但 HasKeyboardFocus 为 false | 交叉证据充分时允许输入；同进程其他控件、其他窗口、系统焦点变化、禁用与密码均拒绝 | 证据组合回归及真实 WinUI 复验 |
| VER-01 | 输入通道成功但控件拒绝文本 | 不能报告 verified | 拒绝输入夹具 |
| VER-02 | 输入已发送但后置截图失败 | 保留 sent，验证不可用，不重做 | 故障注入 |
| VER-03 | 完整文本可读回 | 正确判断匹配与不匹配 | 独立对照器 |
| VER-04 | 只读到文本前缀或尾部 | 不报告整段已验证 | 截断夹具 |
| VER-05 | 动画导致截图变化 | 不把像素变化当业务完成 | 动画夹具 |
| VER-06 | 点击后出现目标相关模态框 | 新观察绑定真实窗口，旧引用失效 | 真机与夹具 |
| VER-07 | DSH running 转 idle、失败或用户停止 | 采用真实状态，不伪报成功 | 真实宿主事件记录 |
| UI-01 | 开始实际输入 | 输入前出现右下角 DeepSeek 动画状态卡片、DSH 提示和蓝色无外边线指针 | 真机录屏或逐帧证据 |
| UI-02 | 白、黑、灰、近蓝背景和高 DPI | 实心蓝色 #168BFF，无描边、外边线及模拟轮廓；尖端与真实落点一致，同色限制如实记录 | 栅格像素、绘制配置及落点对照 |
| UI-03 | 覆盖层点击穿透和焦点 | 不抢输入，不阻止目标按钮收到点击 | 夹具与窗口焦点记录 |
| UI-04 | Helper 截图和 UIA | 不包含自有提示层及其控件 | 附件和树快照 |
| UI-05 | 覆盖层失败 | 无输入发送，错误可定位 | 故障注入 |
| UI-06 | 跨屏、任务栏和显示器变化 | 提示可见，指针无错屏和残影 | 真机证据 |
| STOP-01 | 长文本中物理 Esc | 满足停止时限，后续文字不继续提交 | 输入事件时间线 |
| STOP-02 | 插件主动发送 Escape | 不触发用户急停 | 注入标记与状态记录 |
| STOP-03 | 协作期间用户普通键鼠活动 | 不关闭 run、不撤销授权，冲突动作让路且不误发；物理 Esc 仍锁存停止 | 受控事件与真机录屏 |
| STOP-04 | DSH 停止和工具取消 | 旧回调不能继续输入或重新显示覆盖层 | 取消故障注入 |
| STOP-05 | 模型在停止后重试 | 被拒绝；真实人工明确继续后才能重新观察 | 宿主与模型记录 |
| STOP-06 | UIA 观察挂起时急停 | 急停监听仍响应，未发生副作用 | 阻塞夹具与时间线 |
| ANIM-01 | 原始 SVG 与分发素材 | 原文件哈希不变，viewBox 比例保留，包内相对加载，无外部请求或运行时下载 | 文件哈希、包清单和资源加载记录 |
| ANIM-02 | 默认大小与右下锚点 | 默认 160 × 64 DIP、图形 28 × 28 DIP，边距 16 DIP，整体不超过上限，不画屏幕边缘蓝光 | 真机尺寸和布局记录 |
| ANIM-03 | 100%、125%、150%、200% 和混合 DPI | 尺寸、字形和锚点正确，无模糊拉伸、裁切、错屏或多份残留 | 多倍率和双屏真机证据 |
| ANIM-04 | 点击卡片覆盖的业务控件、输入和焦点 | 真正目标收到一次点击，文字准确，卡片不截获按键、不抢焦点 | 夹具计数、原文和焦点记录 |
| ANIM-05 | 目标点靠近右下角及任务栏 | 有界避让且无抖动，位置在工作区内，不移动业务窗口，不改变点击坐标 | 真机录屏和物理落点 |
| ANIM-06 | 动画运行时截图、UIA 与变化检测 | 图片和控件树不含图标、条带、文案及动画；不因自身动画触发 STATE_CHANGED | 快照对照及采集记录 |
| ANIM-07 | 动态素材、无可信进度和状态切换 | 使用不定加载动画，无假百分比、假完成；文案与输入、读回和等待阶段一致 | 真机录屏及阶段时间线 |
| ANIM-08 | end、急停、取消、重新 begin 和迟到回调 | 动画与指针一同清理，思考期间不显示，新 run 无旧动画恢复 | 控制时间线和资源快照 |
| ANIM-09 | Windows 减少动画与动画播放异常 | 静态图标和提示保留，核心点击输入正常，急停仍有效，不偷加高频闪烁 | 系统设置及故障注入 |
| ANIM-10 | SVG 缺失、转换失败或整个卡片不可见 | 错误定位准确，不无提示发送输入；不下载或换图绕过 | 素材失败注入 |
| ANIM-11 | 100 次控制开关和显示器变更 | 无额外窗口、动画时钟、渲染回调或素材资源累积 | 窗口与资源计数 |
| ANIM-12 | 同夹具动画 / 静态提示对照 | 点击、文本、验证及急停通过同一标准；无额外桌面采集、逐帧 IPC 或持久写入，耗时按阶段记录 | 受控对照和追踪记录 |
| CTRL-01 | 刚装载、重启或用户重新启用 | 默认 closed，无采集和输入，不能从磁盘恢复旧 run | 真宿主状态及 Helper 记录 |
| CTRL-02 | begin、重复 begin、end、重复 end | 开启和关闭幂等，无重复资源；关闭回执字段与实际状态相符 | 状态机和资源计数 |
| CTRL-03 | 同一人工任务反复开关 | 连续 100 次成功，每次新开均为新代次，未要求人工逐次授权 | 集成时间线及资源对照 |
| CTRL-04 | 正常 end 后继续推理和调用其他工具 | 当前 DSH 回合不被取消，后续输出和非桌面工具正常，无桌面输入或观察 | 真模型轨迹、宿主事件和输入记录 |
| CTRL-05 | end 后复用旧 target / snapshot | 全部拒绝；重新 begin 后也必须重新发现和观察 | token 隔离测试 |
| CTRL-06 | 输入期间并发 end | 优先关闭输入门，停止后续块，准确报告已发送部分，不能等整段输入自然完成才交还 | 分块事件时间线 |
| CTRL-07 | closing 时 begin 或桌面请求 | 拒绝，无旧新动作交错，无提前 closed | 控制并发故障注入 |
| CTRL-08 | end 清理超时或 Helper 无响应 | pending / closing 或 failed / faulted，输入门关闭，不谎报完全释放 | 故障注入和实际资源 |
| CTRL-09 | 人工 Esc 急停后模型 end 再 begin | 停止锁存仍有效，必须真实人工继续，不能靠开关绕过 | 真实人工事件及模型回执 |
| CTRL-10 | 会话 A end，会话 B 开启 | A 租约真实释放后 B 可以获取；A 旧回调不影响 B | 双会话及跨 Host 测试 |
| CTRL-11 | 配置空闲时限（默认 300 秒）或回合终止 | 自动关闭并释放；status 和失败请求不延长租约，正常空闲关闭不冒充人工停止 | 可控时钟与真实宿主事件 |
| CTRL-12 | 结束后只 status 或继续思考 | 不重启 Helper、不读取桌面、不激活窗口、不重现指针 | 采集计数、焦点与窗口记录 |
| CTRL-13 | 关闭时截图、UIA 或输入响应晚到 | 不恢复控制、不提交过期截图、不显示旧动画、不污染新 run | 迟到响应故障注入 |
| CTRL-14 | 插件总开关被用户关闭 | 模型不能 begin 自恢复，enabled 和其他配置不被模型 end 改写 | 设置与工具目录对照 |
| LIFE-01 | 两个 Agent 同时动作 | 只有一个获得输入权，另一个 BUSY，不排队 | 多会话测试 |
| LIFE-02 | 不同 Profile / Host 进程并发 | 用户会话级互斥有效 | 双实例真机测试 |
| LIFE-03 | Helper 崩溃、重启 | 旧动作不回放，旧 target 和 snapshot 无效 | 故障记录 |
| LIFE-04 | 20 次启停、卸载与重新加载 | 无自有进程、覆盖层、监听和键状态泄漏 | 资源前后快照 |
| LIFE-05 | Host 突然退出 | Helper 在规定时间退出且无后续输入 | 进程树和时间线 |
| LIFE-06 | 迟到、错 ID、旧 run、重复响应 | 不能污染当前会话或触发动作 | 协议注入测试 |
| LIFE-07 | 超长、损坏、无换行和 stdout 污染 | 有界失败，无无限内存增长 | 协议边界测试 |
| LIFE-08 | 取消后先关再开插件 | 旧异步结果不恢复控制状态 | 代次测试 |
| LIFE-09 | 工具参数尝试指定 session / script / exe | 严格拒绝，不透传危险字段 | schema 与 Helper 测试 |
| DATA-01 | 默认和诊断日志 | 不含输入全文、密码、截图、完整标题和用户路径 | 日志内容审查 |
| DATA-02 | 临时截图失败和取消 | 本插件临时文件清理，已提交会话附件不误删 | 文件范围与引用记录 |
| DATA-03 | 观察内容包含指令或伪授权 | 不改变人工授权边界 | 注入内容夹具 |
| PKG-01 | 构建后打包 | Host / Helper / 必要 Client 齐全，无本机绝对依赖 | 包清单和产物检查 |
| PKG-02 | 包版本和规格版本 | 验收对应同一份实际构建 | 提交、SHA-256 与版本记录 |
| PKG-03 | 隔离卸载 | 无关插件、用户文件和真实 Profile 不变 | 前后差异摘要 |
| MOUSE-12 | 200% 边缘 10×92 / 12×80 像素色差 1–2 | 局部/完整像素比较不因微小色差失败；目标区域显著变化仍拒绝 | 生产比较器合成回归及 WinUI 真机复验 |
| KEY-14 | 整窗装饰动画但焦点和内容不变 | 键盘不依赖整窗哈希，真实焦点或文本变化仍拒绝 | 动作核验测试及 WinUI 输入复验 |
| STOP-07 | 用户输入与插件协作 | 普通键鼠不关闭 run，冲突无误发；Esc 在首次输入前和输入期间均停止 | 事件回归和物理真机复验 |
| OBS-10 | 已授权窗口在后台 | 有界激活并确认；用户忙碌时让路，拒绝和超时原因明确 | 受控激活检查与真机复验 |
| DATA-04 | 中文别名、明确继续与消息重放 | 查询别名一致；仅真实人工明确延续恢复范围；重放拒绝 | 生产授权和检索测试 |
| OBS-11 | 不可见与无效 UIA 几何 | 不返回哨兵可点击坐标，不过滤正常负坐标 | 不可见夹具与几何边界测试 |
| LIFE-10 | 原生结构化失败穿透三层 | 数值诊断完整，非法或过大详情拒绝，不泄漏文本 | 真实协议与工具管线测试 |
| DATA-05 | 普通任务由模型自主选择电脑操作 | 无关键词和逐窗口审批；真实任务、显式禁用、来源与重放防护保留 | 原生宿主管线和授权回归 |
| OBS-12 | 工具恢复并前置后台/最小化窗口 | 真实前台确认、短时输入关联始终撤销，Esc/用户活动取消不迟到抢焦点 | 前置协调器故障测试与真机复验 |
| PKG-04 | 最小运行包 | 仅运行入口和所需产物；排除研发入口，包可实际加载 | tarball检查及真实宿主加载 |

## 10. 0.3.0 发布授权与验收依据

2026-10-30 用户明确表示“我已经验收过，是正确的。可以把当前作为插件的0.3.0版本，发布到我的github仓库中”。据此以用户确认验收为本次版本发布依据，不再要求重复人工确认。

本次仅变更版本常量、发布元数据、说明与发布检查；src/及helper/运行源码对已验收0.2.0-dev.1逐文件比较，除版本常量外必须完全一致。任何功能源码差异都阻断该发布路径，不能借用户确认发布未经验收的新功能。

发布还须完成当前代码自动回归、原生编译与纯逻辑、实际宿主/Helper及确切包检查；绑定规格、代码和tarball哈希。release:check核对用户确认、功能源码等价及这些证据。原accept:release保留为完整矩阵验收门槛，两者含义不同。旧矩阵未运行项仍保留NOT_RUN/PARTIAL，不因用户允许本次发布而伪造为全部PASS。

GitHub只发布必要源码、运行产物和脱敏说明；开发依赖、历史资料、临时证据、测试配置、实际Profile、API密钥和本机网络修复材料不发布。本地包保留private以防误发npm，本次只授权GitHub发布。

## 11. 0.3.1 可靠性和观察优化

本节修订前文对应行为。用户于2026-11-02要求完成优化、升为0.3.1并推送现有仓库。开发与自动验证不得宣称代替物理Esc、混合DPI、真实浏览器/编辑器输入验收。

错误通过成功JSON响应返回时也必须执行控制策略。execution=unknown，或错误为CONTROL_CLOSE_FAILED、INPUT_UNKNOWN、PROTOCOL_ERROR、HELPER_TIMEOUT、USER_STOPPED，均停止接收当前run的新输入，清除引用并请求清理。保留原始发送事实；清理确认后closed，否则faulted且inputReleased=false。普通USER_BUSY/INPUT_INTERFERENCE仍可让路后重新观察。原生释放失败先关闭输入门，再交由Host清理，不等待模型自行决定。

HumanAuthority和Controller归属于插件根生命周期，配置重挂载只关闭run及重挂载工具，不重置任务、消息序号、用户禁用和Esc锁存。Agent销毁只回收该Agent的控制资源；会话销毁才删除会话权限状态。显式电脑禁用跨回合持续到真实人工明确允许，例如“允许你操作电脑”；普通追问或含义不明确的“继续”不解除禁用。Esc在有任务上下文时可由真实明确“继续/恢复”解除。语言规则为保守辅助，模型仍须遵守完整用户指令，不宣称完整自然语言理解。

Bridge校验完整错误响应后才移除pending请求。任何畸形响应、无布尔ok、非法详情、流断开都明确拒绝受影响请求，不能因计时器先清理而永久悬挂。stdin/stdout错误转为受控通道故障。

UIA先读取焦点证据，焦点有独立16000 UTF-16单元预算，其余编辑器合计2048；遍历软预算800ms，UIA阶段超过1200ms和总观察超过2500ms返回OBSERVATION_TIMEOUT及阶段，不将耗时冒报STATE_CHANGED。几何/DPI变化仍返回STATE_CHANGED。UIA同步提供者调用无法由.NET计时器强行中断；Host观察8秒期限及失败后Helper进程回收为外层边界，未确认清理时不冒报释放。

文本优先用有长度上限的TextPattern.GetText；传统Edit的有界读取使用75ms SendMessageTimeout。禁止无限GetText(-1)及先读完整ValuePattern.Value再截断。无法有界读取的提供者标valueUnavailable，输入验证降为unverified，不把未知值当空值。选区范围读取以完整已读值长度为界。多行语义接受传统Edit样式、明确ARIA multiline属性或已观察到的换行；证据不足仍unknown并拒绝含LF的type，不单凭Document角色推定多行。

私有Snapshot保留校验所需原始有界证据；交付使用独立投影，不能修改原始数据。默认compact焦点预览≤512 UTF-16单元、其他单控件≤128、总文本≤1024，元素JSON合计≤48KiB；expanded分别为4096/512/8192/128KiB。焦点优先且始终提供可用引用，元素列表不重复焦点正文，截断和值预览须标记。投影预览不能替代原生完整值验证；verified仅基于私有完整证据。expanded不是无限全文接口。

Host在观察和动作前识别当前模型图片能力。不支持图片时Helper跳过PNG编码与传输，但仍做内部捕获、指纹和点击保护；image=null，坐标点击继续禁止。后置观察可直接作为下一动作的新快照，不强制重复观察。timings返回UIA/捕获/编码/总耗时，diagnostics只记录受限错误码、执行/验证状态、阶段、检查、耗时和字节数，无业务内容。

公共CI覆盖Node22.19与24、原生回归、隐藏UIA、离屏绘制和确切tarball检查/解包加载。SDK回归固定DSH0.2.1-rc.3及rc.5，不把SDK管线测试当完整Desktop验收。release:check检查当前版本自动证据、源码/spec/安装包绑定；accept:release继续保留完整矩阵门槛。发布摘要明确真实桌面测试范围，不复用0.3.0的人工确认冒充0.3.1确认。

| 用例 | 场景 | 通过标准 | 证据 |
| --- | --- | --- | --- |
| CTRL-15 | 严重错误以JSON回执返回 | 受控回执触发关闭，清理失败不伪报释放，发送事实保留 | 故障后端回归 |
| CTRL-16 | 设置重挂载与当前任务 | 当前任务和序号保留，旧run/快照失效，回合结束不被重挂载复活 | Host内存管线 |
| STOP-08 | 设置启停后的Esc锁存 | 普通追问仍拒绝，真实明确继续才允许 | Host内存管线 |
| DATA-06 | 持续禁用电脑 | 普通追问/继续不解除，明确允许才解除 | 来源与状态回归 |
| LIFE-11 | 畸形错误响应 | 原请求明确失败，超过自身时限不能仍悬挂 | Bridge故障注入 |
| OBS-13 | 精简和展开投影 | 有界、焦点优先、不重复正文、不修改私有证据 | 生产投影器合成回归 |
| OBS-14 | 慢观察分类与纯文本路径 | 慢稳定观察不误报变化，纯文本不请求PNG，阶段预算有明确超时 | 受控Host/原生回归 |
| KEY-15 | 多行证据来源 | 原生样式/ARIA/已观察换行与unknown分支符合规则 | 生产规则与隐藏控件回归 |
| PKG-05 | 公共安装包与SDK管线 | 确切包检查、包内原生编译及两版本SDK加载通过 | check:package |

## 12. 0.4.0 输入交付、回执信封与观察等待

本节是 0.4.0-dev.1 新增的规范性条款，细化并修订第 3、5、6 节中与输入交付、回执形状和观察等待相关的行为。第 1、2、6、9 节的硬约束保持原样：本节不放宽真实人工任务来源、单 run 互斥、Esc 锁存、密码字段/DSH 自身/安全桌面/更高完整性进程拒绝、既有默认设置值，也不改变"savePath 是唯一写盘能力"这一边界。文中"必须"为强制条款；本节未列出的行为继续按第 1–11 节执行。本节不预置任何验收结论，0.4.0-dev.1 构建包的真机验收记录由验收人单独给出。

### 12.1 输入交付确认（FR-01）

`mk_keyboard` 新增可选 `settleMs`（整数 0–5000，默认 0，`type` 与 `key` 都接受）与 `paceMs`（整数 0–50，默认 0，仅 `type`）。一次输入动作返回时，输入必须已交付到足以让后续动作安全接续，且这一事实可判定。通用确认对所有目标生效：`SendInput` 之后必须轮询 `GetLastInputInfo()`，直到 `dwTime` 前进到覆盖本次注入的最后事件时间，上限 300 ms；超时不得伪报已验证，必须返回 `execution="sent"`、`verification="unverified"`、`requiredAction="reobserve"`。`settleMs` 表示最后一个输入事件之后再等待目标稳定的毫秒数，`settledMs` 必须回报本次实际额外等待的毫秒数。可读回目标（`editable=true` 且有完整值证据）在通用确认之外必须轮询焦点控件文本，仅当连续两次采样间隔 ≥120 ms、两次值一致且等于预期值时才可 `verification="verified"`；超过 `settleMs`（>0 时）或默认 1200 ms 仍不一致时，值可读回必须 `verification="mismatch"`，值不可读回必须 `"unverified"`。`deliveredAt`（ISO 时间）仅在 `execution` 不为 `not_sent` 时出现，`not_sent` 回执不得携带 `deliveredAt`。`paceMs` 是分块或逐字符之间的间隔，与 `settleMs` 一并计入单动作 40 秒总预算。

### 12.2 输入路径选择（FR-02）

`mk_keyboard` 的 `type` 新增可选 `inputMode`=`auto`、`unicode`、`scancode`，默认 `auto`。`auto`：`editable=true` 的目标必须走 `unicode`（0.3.2 既有路径）；`editable=false` 的目标必须走 `scancode`，逐字符映射，遇到不可映射字符时回落到该字符的 `unicode` 注入；若回落路径也不可用，必须 `UNSUPPORTED_INPUT`，不得静默丢字。`unicode`：所有目标都走 `unicode`。`scancode`：使用 `VkKeyScanW` 取 `(vk, shiftState)`，并必须满足：

- `VkKeyScanW` 返回 `-1`，或 `shiftState` 含 Ctrl（`0x02`）/Alt（`0x04`）位时，该字符必须判为不可映射并以 `UNSUPPORTED_INPUT` 拒绝；不得模拟组合键。
- `shiftState` 含 Shift（`0x01`）位时，必须在按键对之前按下 Shift、之后释放，并在 `finally` 中经 `ReleaseOwned` 释放自身按下的 Shift，不得污染用户按住的修饰键状态。
- `\n` 仍映射为 VK 13；非 ASCII（≥128）字符在 `scancode` 模式下永远不可映射。
- 必须"先规划后发送"：整段文本先完成映射规划，任一字符不可映射时，在发送任何事件之前以 `UNSUPPORTED_INPUT` 拒绝，不得部分发送后才发现失败。请求解析阶段必须对 `scancode` 加非 ASCII 文本先行拒绝，原生侧再次强制同一规则。
- `Enter`、`Tab`、`Backspace`、方向键、`Delete`、`Home`/`End`、`PageUp`/`PageDown` 仍走既有 VK 表。

### 12.3 非可编辑目标输入恒开（FR-03）

`type` 必须删除 0.3.2 的 `editable` 门禁并恒开：不得以配置项、参数或环境变量重新关闭或绕过，不得新增设置项，`Settings` 结构必须保持 0.3.2 的 8 个字段不变（避免配置迁移）。除此项外，`type` 的其余拒绝项必须与 0.3.2 完全一致、不得放宽：密码字段 `PASSWORD_FIELD`；DSH 自身窗口、Helper、安全桌面与更高完整性进程 `NOT_AUTHORIZED`；焦点元素不可见或未启用、所属根窗口不等于观察目标、窗口几何/DPI 变化 `FOCUS_MISMATCH`/`STATE_CHANGED`；快照过期或已被消费 `STALE_SNAPSHOT`；用户按住修饰键 `USER_BUSY`；含 LF 且多行编辑语义未确认 `MULTILINE_UNCONFIRMED`；文本预算、Unicode 与控制字符校验 `UNSUPPORTED_INPUT`。`diagnostics` 必须记录 `inputTarget`=`editable` 或 `non-editable`，且不得记录文本内容。已知残余风险必须如实保留：文本以按键序列送到当前焦点，焦点若落在网页工具栏或带单键快捷键的页面上，字母可能触发页面快捷键；本版缓解手段为每块复验焦点（`RequireFocus`）、快照单次消费与 `diagnostics` 标注，不提供"仅画布角色放行"。

### 12.4 回执信封（FR-04）

任何工具回执必须始终包含 `observation` 键，值为观察对象或 `null`；不得以省略字段表达缺失。回执信封的字段集合固定为：`execution`（`not_sent`/`sent`/`partially_sent`/`unknown`）、`verification`（`unverified`/`observed_change`/`verified`/`mismatch`）、`retryable`、`requiredAction`、`observation`（对象或 `null`）、`observationError`（仅动作已执行但拍照失败时）、`deliveredAt`（仅非 `not_sent` 时）、`settledMs`（本次实际额外等待）、`diagnostics`（仅含有界数值与固定枚举，如 `inputTarget`）、`error`（仅失败时，含 `code`/`message`/有界 `details`）；动作类回执另带 `actionId` 与 `target`。工具错误的回执同样使用该信封（`ok:false`、`observation=null`），不得让调用方读到缺失字段。动作本身成功、仅后置观察失败时，必须 `observation=null` 并给出 `observationError:{code,message}`；它与 `error` 语义分离：前者是"动作已执行但拍不了照"，后者是动作本身的失败。`mk_observe` 的 `mode=window` 保持 0.3.2 形状：观察就是返回值本身，不额外套一层 `observation` 键；"`observation` 恒存在"约束回执信封，即 `mk_control`、`mk_observe targets`、`mk_mouse`、`mk_keyboard` 以及每一个工具错误。兼容性：`receipt.observation?.x` 行为不变；直接读取 `receipt.observation.x` 的调用方在缺失时得到明确的 `null`（按可空类型处理），而不是 `undefined`。

### 12.5 执行语义与重试安全（FR-05）

回执必须在既有 `execution`/`verification` 之外携带 `retryable`（布尔）与 `requiredAction`=`none`、`reobserve`、`wait`、`rebegin`、`stop`，并按下列判定表逐条实现：

| 条件 | retryable | requiredAction |
| --- | --- | --- |
| `execution="not_sent"` 且 `error.code` ∈ {STATE_CHANGED, FOCUS_MISMATCH, OCCLUDED_TARGET, STALE_SNAPSHOT, USER_BUSY, INPUT_INTERFERENCE, INVALID_COORDINATE} | true | reobserve |
| `execution="not_sent"` 且 `error.code` = ELEMENT_NOT_FOUND | true | reobserve |
| `error.code` ∈ {USER_STOPPED, CONTROL_CLOSE_FAILED, PROTOCOL_ERROR, HELPER_TIMEOUT} | false | stop |
| `execution="unknown"` 且未命中以上错误码 | false | wait |
| 无错误，且 `execution` 为 `sent`/`partially_sent`，`verification` 为 `verified`/`observed_change` | false | none |
| 其余（含一切发送后 `mismatch`/`unverified` 失败） | false | reobserve |

`execution="sent"`/`partially_sent`/`unknown` 必须 `retryable=false`；`sent` 与 `not_sent` 永不混用。已发送后的校验失败（含 `STATE_CHANGED`）必须 `verification="mismatch"` 或 `"unverified"`、`requiredAction="reobserve"`，不得回 `not_sent`。`requiredAction="rebegin"` 仍由 0.3.x 既有码（`CONTROL_CLOSED`、`TARGET_CHANGED`、`CONFIG_UNAVAILABLE`）沿用，它们不在 12.11 的 19 码表内，本节不改变其既有语义。模型侧文档（本节与 README）必须写明：`sent` 之后禁止重放同一动作，先重新观察。

### 12.6 观察等待条件 waitFor（FR-06）

`mk_observe` 的 `mode=window` 新增可选 `waitFor`；`mode=targets` 不接受 `waitFor`。三种 kind 的形状为：`{kind:"text",value:1–256 字符,exact?:false,timeoutMs?}`；`{kind:"element",value:1–256 字符,role?:1–64 字符,exact?:false,timeoutMs?}`；`{kind:"pixel",region:Rect,mode:"stable"|"changed",settleSamples?:2–10,minChangedPixels?:1–4096,timeoutMs?}`。所有 kind 的 `timeoutMs` 为 1000–30000，默认 5000；未知或多余键必须 `INVALID_ARGUMENT`。

必须按 150 ms 间隔轮询。命中时必须返回当场的**新观察**（等价于刚做过一次 window 观察，`durationMs` 为实际等待时长），并附 `waitFor:{kind,matched:true,waitedMs,timeoutMs}`。超时不是协议错误：必须返回 `ok:true` 和最后一次观察，同时附 `error.code=OBSERVATION_TIMEOUT`（含 `stage="observation"`、`check="wait-timeout"`、`waitedMs`）、`execution="not_sent"`、`requiredAction="reobserve"` 与 `waitFor:{kind,matched:false,waitedMs,timeoutMs}`。`waitFor` 只影响等待，不改变观察内容与快照有效期语义。

`text` 在每轮采样的 UIA 结果里做包含匹配（`exact=true` 时全等）；`element` 按 12.7 的匹配规则。二者只对 UIA 可读内容生效：画布（`ControlType.Image`）没有文本节点，对其使用 `text` 只会超时，文档必须写明这一点。`pixel` 的 `region` 采用窗口图像像素坐标（与 `mk_mouse` 的 `x`/`y` 同一坐标系），必须落在当前捕获区域内，越界必须 `INVALID_COORDINATE`。`mode="stable"` 要求连续 `settleSamples`（默认 3）次采样的区域差异都在既有容差内（单通道 ≤2/255，只归一化已确认的系统光标小矩形）；画布内 VNC 光标闪烁不在归一化之列，持续刷新的内容会一直不稳定并最终超时。`mode="changed"` 相对调用开始时的基线，变化像素数 ≥ `minChangedPixels`（默认 64）即命中。`pixel` 只回答"画面变了/稳定了"，不识别内容；本版不做 OCR、不读取任何外部参考图，因此不提供 `matches` 模式。

### 12.7 元素按名称/角色定位（FR-07）

`mk_mouse` 新增可选 `elementName`（1–256 字符）、`elementRole`（1–64 字符）、`elementExact`（布尔，默认 false）；`elementName` 与 `element`、`x`/`y` 三者互斥，`elementRole` 与 `elementExact` 只在给出 `elementName` 时允许。匹配在**当前快照**的元素表内进行：名称默认包含匹配，`elementExact=true` 时全等；角色可选。0 个匹配必须 `ELEMENT_NOT_FOUND`（`execution="not_sent"`、`retryable=true`、`requiredAction="reobserve"`）。≥2 个匹配必须 `AMBIGUOUS_TARGET`，`details.candidates` 给出最多 8 个 `{ref,name,role}`，有界且不含文本正文。命中后仍走既有 `SameElementState`、`BelongsToWindow`、密码与遮挡校验。

### 12.8 回执体积控制 observe（FR-08）

`mk_mouse` 与 `mk_keyboard` 新增可选 `observe`=`full`、`compact`、`none`，默认 `full`。`compact` 必须把 `elements` 截断为焦点加最多 20 个其他元素，并以 `coverage.deliveredElements` 如实标注实际交付数量，不得虚报覆盖。`none` 必须 `observation=null`，只返回 `execution`/`verification`/`requiredAction` 与既有诊断。无论取哪个值，`savePath` 仍必须照常写入原始 PNG。默认值不变，旧调用方行为不变（除 `observation` 变为恒存在）。

### 12.9 区域证据 region（FR-09）

`mk_observe` 的 `mode=window` 与 `mk_mouse`/`mk_keyboard` 的 `savePath` 新增可选 `region:{left,top,width,height}`（整数；`left`/`top` 为有符号整数，`width` 1–1600、`height` 1–1200）。坐标必须是本次捕获图像的像素坐标并落在 `imageSize` 内，越界必须 `INVALID_COORDINATE`。保存的必须是该区域**原始分辨率**的 PNG，不缩放。在 `mk_observe window` 上，`region` 还必须同时裁剪返回的 `image`，并把 `captureRect` 相应平移/收缩，使返回图像的坐标映射（`mk_mouse` 的 `x`/`y`）仍然正确；在 `mk_mouse`/`mk_keyboard` 上，`region` 只裁剪 `savePath` 落盘的 PNG，不改变后置观察的返回图像。`region` 不改变身份、焦点、几何与快照复验，也不改变 `SAVE_EXISTS` 语义。

### 12.10 研发用 Helper 重建入口（FR-10）

必须提供研发脚本 `scripts/dev-helper-rebuild.mjs`：结束当前 run、终止 Helper 进程、重新 `begin`，使 C# 改动无需等待约 120 秒的自然回收。该脚本只属于研发流程，必须排除在运行包之外，不得注册为工具、不得被 Host 或 Helper 在运行时调用；它不改变第 8 节的最小交付清单。

### 12.11 错误码与 requiredAction 全表（FR-11）

下表必须与代码常量 `ERROR_CODES` 一一对应，无遗漏、无多余；README 摘要表同源对齐。"是否已发送""是否可重试"由 12.5 的判定规则推导，"建议下一步"是给模型的操作建议，不新增语义。

| 代码 | 含义 | 是否已发送 | 是否可重试 | 建议下一步 |
| --- | --- | --- | --- | --- |
| INVALID_ARGUMENT | 参数不合法：未知字段、类型或范围越界、互斥参数同时给出 | 否 | 否 | 修正参数后作为新请求重试 |
| UNSUPPORTED_INPUT | 输入内容不受支持：控制字符、未配对代理项、超预算、scancode 不可映射或非 ASCII | 否 | 否 | 改写文本或改 `inputMode`；不得重放同一请求 |
| NOT_AUTHORIZED | 越权目标或缺少真实人工任务：DSH 自身/Helper、安全桌面、更高完整性进程、宿主只读 | 否 | 否 | 停止；不得绕过，等待真实人工任务与授权 |
| USER_BUSY | 用户正在按键/拖动或近期有物理活动 | 否 | 是（须 not_sent） | 让路，等用户空闲后重新观察再试 |
| INPUT_INTERFERENCE | 输入期间发生用户输入或焦点干扰 | 否；分块中发生时保留已发送部分 | 是（须 not_sent；部分发送后为否） | 重新观察；不补发、不重放已发送部分 |
| STATE_CHANGED | 观察后窗口几何/DPI/前台/内容或代次变化；也可能出现在已发送后的校验阶段 | 发送前为否；发送后校验为是 | 是（仅 not_sent）；发送后为否 | 发送前：重新观察后重试；发送后：禁止重放，先 reobserve |
| STALE_SNAPSHOT | 快照过期或已被消费 | 否 | 是（须 not_sent） | 重新观察后再动作 |
| OCCLUDED_TARGET | 落点被其他窗口遮挡 | 否 | 是（须 not_sent） | 重新观察并让目标可见 |
| FOCUS_MISMATCH | 键盘焦点、所属根窗口或系统焦点与观察不一致 | 发送前为否；发送后校验为是 | 是（仅 not_sent） | 重新观察；发送后先 reobserve |
| PASSWORD_FIELD | 目标是密码字段 | 否 | 否 | 停止；不得以坐标或其它方式绕过 |
| MULTILINE_UNCONFIRMED | 含 LF 文本但多行编辑语义未确认 | 否 | 否 | 改用单行文本或先确认多行语义 |
| ELEMENT_NOT_FOUND | 当前快照元素表内按名称/角色 0 匹配 | 否 | 是 | 重新观察（元素表变化后再次定位） |
| AMBIGUOUS_TARGET | 名称/角色匹配到 ≥2 个候选 | 否 | 否 | 用 `details.candidates` 的 ref 或更精确的名称/角色重新定位 |
| SAVE_EXISTS | `savePath` 同名文件已存在，拒绝覆盖 | 否 | 否 | 更换新文件名后重新调用 |
| OBSERVATION_TIMEOUT | 观察或 `waitFor` 等待超时（仍返回最后一次观察） | 否 | 否 | 读最后一次观察判断现状，再 reobserve |
| PROTOCOL_ERROR | Helper 响应畸形、协议校验失败或通道故障 | 未知 | 否 | 停止接收新输入；等待清理，不重放 |
| CONTROL_CLOSE_FAILED | 关闭控制失败，未确认释放 | 按实际动作保留发送事实 | 否 | 停止；按 faulted 报告并等待清理，不重放 |
| INPUT_UNKNOWN | 注入结果未知：按下/释放或发送边界不明确 | 未知 | 否 | 停止新增输入；重新观察并人工确认，禁止重放 |
| USER_STOPPED | 物理 Esc 或用户停止，输入门已关闭 | 否；已发送块保留事实 | 否 | 停止；只有真实人工明确继续后才能重新开始 |

`INVALID_COORDINATE`（坐标越界，可重试）与 `HELPER_TIMEOUT`（须 stop）是 0.3.x 既有码，参与 12.5 的判定，但不属于 FR-11 的 19 码，本节不因它们扩表。

### 12.12 回归夹具（FR-12）

必须提供四个回归文件，把 `docs/optimization-spec-0.4.0.md` 第 1 节的现网失败 E1–E4 固化为自动断言，而不是只写在文档里：

| 测试文件 | 固化的现网失败 | 必须断言 |
| --- | --- | --- |
| tests/settle.test.mjs | E1：长文本后紧跟 Enter，后端按到达顺序记账 | 设置 settleMs 后文本不截断，Enter 之后不再出现该文本的字符 |
| tests/canvas-input.test.mjs | E2：非可编辑/画布目标打字被拒或收不到键序列 | scancode 模式下大写字母的 VK 序列含 Shift 按下与释放、顺序与文本一致；`ReleaseOwned` 后无残留；密码与未确认多行仍拒绝 |
| tests/receipt-envelope.test.mjs | E3：后置观察字段缺失导致 `TypeError` | 后置观察失败时 `observation === null` 且存在 `observationError` |
| tests/retry-safety.test.mjs | E4：已发送后的校验失败被当成未发送而重试 | `execution="sent"` 的校验失败必须 `retryable=false` 且 `requiredAction="reobserve"` |

这四个文件是本节新增行为的自动回归证据；它们通过不等于真机验收通过，真机条目仍按第 9 节的纪律单独记录。

### 12.13 与 0.4.0 规格的对齐说明

以下三点是对 `docs/optimization-spec-0.4.0.md` 草案内部矛盾的处理结论，属于显式收敛，不是新增语义：

(a) `paceMs` 默认取 `0`，且不新增 `inputPaceMs` 设置。FR-01 原本要求 `paceMs` 默认取设置项，但 FR-03 与第 8 节要求 `Settings` 保持 8 个字段、本次不得新增设置项，也不得改动既有默认值；两者冲突时以"不新增设置"的硬约束为准。

(b) 可重试集合 = FR-05.1 的列表（STATE_CHANGED、FOCUS_MISMATCH、OCCLUDED_TARGET、STALE_SNAPSHOT、USER_BUSY、INPUT_INTERFERENCE、INVALID_COORDINATE）再加 FR-07 明确要求 `retryable=true` 的 `ELEMENT_NOT_FOUND`；`OBSERVATION_TIMEOUT` 仍为 `retryable=false`、`requiredAction="reobserve"`。

(c) `mk_observe` 的 `mode=window` 把观察作为返回值本身（0.3.2 形状），不额外增加 `observation` 键；因此"`observation` 恒存在"适用于回执信封——`mk_control`、`mk_observe targets`、`mk_mouse`、`mk_keyboard` 以及每一个工具错误。

这三处差异来自草案自身的不一致（设置项、重试集合、观察形状），已由本节条款收敛；实现与文档不得各自解释。

## 12.14 0.4.0-dev.2 修订（Lead 复核后）

本节是 0.4.0-dev.2 的修订条款，逐条取代第 12 节中与之冲突的旧表述；第 12 节其余条款、12.11 的 19 码表与 0.4.0 硬约束（不引入剪贴板/`Ctrl+V`、不新增工具、Esc 锁存、真实人工任务授权、单 run 互斥、密码/DSH 自身/安全桌面/更高完整性拒绝、既有默认设置值）继续有效。本节只描述契约变化，不预置验收结论；dev.1 的 Lead 复核发现与 dev.2 的真机复验由验收人单独记录。

(a) **F5 多块 `type` 的逐块复验**（取代第 5 节键盘核对在逐块复验上的旧读法——每块发送前都与快照中的元素状态完整比较）：`type` 文本超过一个发送块时，后续块在发送前只复验键盘焦点与目标上下文——焦点元素身份（FocusedElement/RuntimeId）、所属根窗口、系统前台、元素启用与可见、`editable` 与密码状态；**不再**比较观察时记录的元素 RECT（长文本输入本身会移动光标或隐藏 textarea，RECT 必然变化）。第一个块与所有 `key` 动作仍执行完整比较（含 RECT、完整文本与选区证据）。文本与选区的期望值仍来自观察快照，`verified`/`mismatch` 的判定依据不变。此修正不放宽身份、窗口、前台、启用/可见、`editable`、密码、`NoHeldModifiers`、快照有效期与命中归属等任何拒绝项。

(b) **F6 画布坐标点击的比对范围**（取代第 5 节"坐标点击比较完整捕获区域"对画布类目标的适用）：当坐标点击的落点落在当前观察中某个 `ControlType.Image`（画布/VNC）元素内时，发送前的像素比对只覆盖落点周围 12 DIP 的邻域，而不是整个捕获区域；为吸收画布光标闪烁，允许有界重采（最多 3 次采样，间隔约 60 ms），重采后仍不一致才拒绝。非画布目标的坐标点击继续比较完整捕获区域。身份、几何、前台、遮挡、快照有效期与命中归属等检查全部不变。

(c) **F2 `mk_observe targets` 的引用稳定性**（取代此前"调用 `targets` 即令旧 target id 失效"的行为）：`targets` 不再使仍然存在的窗口引用失效——同一窗口（HWND、PID、进程创建时间三者一致）在多次 `targets` 调用之间保持同一 target token；已不存在的窗口其 token 被丢弃；已返回的快照仍然有效，并保持单次消费语义。第 5 节列出的其他引用失效条件（窗口身份、几何、DPI、前台、run、活动代次、Esc、停用）不变，只是"被 `targets` 刷新"不再是失效原因。

(d) **F3 后置观察的重试与错误信息**（细化并取代 12.4 中关于 `observationError` 的旧描述）：动作后的后置观察失败时，必须在约 150 ms 后重试一次；仍失败时回执的 `observationError.message` 必须点名底层错误码，使调用方能区分"动作已执行但拍不了照"与动作本身失败。重试只针对拍照，不重发任何输入；`execution`/`sent` 事实、`verification`、`retryable`/`requiredAction` 与"禁止重放"规则均不变。

(e) **F4 cloaked DWM 窗口**（取代此前"所有顶层窗口均可作为发现候选"的行为）：发现阶段必须排除 DWM cloak 的窗口（`DWMWA_CLOAKED` 非 0），它们不得出现在 `mk_observe targets` 的结果中；身份复验阶段遇到 cloak 状态必须按"窗口已消失"处理并拒绝动作。目的是避免对 UWP 子窗口返回错误画面或给出不可用候选。此排除不改变无标题、不可见、更高完整性进程、DSH 自身等其余过滤。

(f) **F7 终端模拟器上的 `verification` 语义**（细化并取代 12.1 中 `verification` 对"可读回值"的假设，仅针对终端类目标；不改变既有判定代码）：对 xterm.js 隐藏 textarea 一类以临时缓冲承载编辑值的终端模拟器，`verification` 比较的不是稳定编辑器值，`mismatch` 只表示"无法比较"，不表示输入失败。此时必须以 `execution`/`sentCodePoints` 与后置截图判断输入是否送达，不得因 `mismatch` 重放同一动作；`verified` 仍只在完整编辑器值与选区可独立比较时给出。

上述六项之外，0.4.0 的硬约束未改变：不引入剪贴板、粘贴或 `Ctrl+V`，不引入脚本/CDP/网络注入，不新增工具，`savePath` 仍是唯一写盘能力，Esc 锁存、真实人工任务授权、单 run 互斥、密码/DSH 自身/安全桌面/更高完整性拒绝与既有默认设置值全部保持。0.4.0-dev.2 相对 dev.1 只做上述修正。
