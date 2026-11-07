# Mouse-Keyboard-Plugin

用于 DeepSeek Harness Desktop 的最小 Windows 电脑操作插件。当前版本 **0.4.1**，规格 **1.9.1**。0.4.1 是 0.4.0-dev.2 的定版：输入交付确认（`settleMs`/`paceMs`/`inputMode`）、非可编辑目标输入恒开、回执信封与重试安全、观察等待 `waitFor`（text/element/pixel）、按名称定位、回执体积控制与区域证据全部保留；dev.2 的多块输入复验修正、画布坐标点击窄域比对、`targets` 引用稳定性、后置观察重试与 cloaked 窗口过滤一并进入。不引入剪贴板/粘贴、脚本或网络注入，也不新增工具。

## 使用方式

用户正常提出任务即可，模型认为操作电脑更合适时可自行使用插件，无需额外说 computer use、点击或应用名。已有四个工具保持不变。

| 工具 | 作用 |
| --- | --- |
| mk_control | begin开启、end交还、status查询；交还后模型可继续思考和再次开启 |
| mk_observe | targets发现窗口并支持中文别名；window自动恢复最小化并前置目标，再返回观察 |
| mk_mouse | 对当前观察执行一次左键点击，支持元素引用或已交付图片坐标 |
| mk_keyboard | Unicode文本或白名单按键；不隐式全选、提交或粘贴 |

普通任务不再受动作词/目标词筛选，不再逐窗口弹出授权。用户明确禁止电脑操作、宿主只读模式、无当前人工任务、密码字段、安全桌面及更高权限目标仍拒绝。页面、文件、工具和模型文本不能冒充新的人工任务。

物理 Esc 从 begin 起强制停止并锁存；普通追问和模型开关不能解除，真实人工明确继续后才可恢复。用户普通键鼠只使冲突动作让路，保持会话可恢复。系统输入流和焦点仍共享，没有第二套独立键鼠。

## 0.4.0 新增可选参数与错误码

四个工具与既有默认设置不变；下列参数均为可选，省略时行为与 0.3.2 一致。回执信封始终包含 `observation`（对象或 `null`）；`mk_observe window` 仍把观察作为返回值本身。既有参数（`action`、`target`、`snapshot`、`query`、`detail`、`text`、`key`、`x`/`y`、`element`）的名称、必填性与取值不变。

| 工具 | 参数 | 取值与默认 | 说明 |
| --- | --- | --- | --- |
| mk_keyboard | `settleMs` | 整数 0–5000，默认 0 | `type` 与 `key` 都支持；最后一个输入事件后再等目标稳定，回执的 `settledMs` 为实际等待 |
| mk_keyboard | `paceMs` | 整数 0–50，默认 0 | 仅 `type`；分块之间的间隔，计入单动作 40 秒预算 |
| mk_keyboard | `inputMode` | `auto`（默认）、`unicode`、`scancode` | `auto`=可编辑目标走 `unicode`、非可编辑目标（画布/VNC）走 `scancode` 并对不可映射字符回落 `unicode`；`scancode` 仅 ASCII，不可映射字符在发送任何事件前整段拒绝 |
| mk_keyboard、mk_mouse | `observe` | `full`（默认）、`compact`、`none` | `compact`=焦点加最多 20 个其他元素，`coverage.deliveredElements` 如实标注；`none`=回执 `observation` 为 `null`；`savePath` 不受影响 |
| mk_keyboard、mk_mouse | `region` | `{left,top,width,height}`；整数，`width` 1–1600、`height` 1–1200 | 图像像素坐标，必须落在 `imageSize` 内；动作上只裁剪 `savePath` 落盘的 PNG |
| mk_keyboard、mk_mouse | `savePath` | 绝对 Windows 路径，8–240 字符，以 `.png` 结尾，目录需已存在 | 唯一写盘能力；同名文件已存在时返回 `SAVE_EXISTS`，不覆盖 |
| mk_mouse | `elementName` | 1–256 字符 | 用可访问名称在当前快照内定位；与 `element`、`x`/`y` 三者互斥 |
| mk_mouse | `elementRole` | 1–64 字符 | 可选，与 `elementName` 一起做角色精确匹配 |
| mk_mouse | `elementExact` | 布尔，默认 false | false 为包含匹配，true 为全等 |
| mk_observe window | `waitFor` | 见下表 | 仅 window 模式；targets 不接受 |
| mk_observe window | `region` | 同上 | 同时裁剪返回图片与落盘 PNG，并平移 `captureRect` 保持坐标映射正确 |
| mk_observe window | `savePath` | 同上 | 保存原始分辨率 PNG；带 `region` 时保存该区域 |

必填性与既有参数：`mk_control` 必填 `action`；`mk_observe` 必填 `mode`（`mode=window` 时 `target` 必填）；`mk_mouse` 与 `mk_keyboard` 必填 `action`、`target`、`snapshot`。其余既有参数 `query`、`detail`、`text`、`key`、`element`、`x`/`y` 与上表所有新增参数均为可选，名称、取值与默认值不变。动作枚举：`mk_control.action`=`begin`/`end`/`status`；`mk_observe.mode`=`targets`/`window`（`detail`=`compact`/`expanded`）；`mk_mouse.action`=`click`；`mk_keyboard.action`=`type`/`key`。`key` 的白名单枚举为 `Enter`、`Tab`、`Shift+Tab`、`Escape`、`Backspace`、`Delete`、`Left`、`Right`、`Up`、`Down`、`Home`、`End`、`PageUp`、`PageDown`、`Ctrl+A`、`Ctrl+S`、`Ctrl+Home`、`Ctrl+End`。

`waitFor` 的三种条件（`timeoutMs` 均为 1000–30000，默认 5000；轮询间隔 150 ms）：

| kind | 必填 | 可选 | 默认 |
| --- | --- | --- | --- |
| `text` | `value` 1–256 字符 | `exact`、`timeoutMs` | `exact`=false |
| `element` | `value` 1–256 字符 | `role` 1–64 字符、`exact`、`timeoutMs` | `exact`=false |
| `pixel` | `region`、`mode`=`stable` 或 `changed` | `settleSamples`、`minChangedPixels`、`timeoutMs` | `settleSamples`=3（2–10）、`minChangedPixels`=64（1–4096） |

`waitFor` 命中返回当场的新观察并带 `waitFor.matched=true` 与实际等待；超时不是协议错误，仍返回最后一次观察，附 `OBSERVATION_TIMEOUT` 与 `requiredAction=reobserve`。

错误码摘要（19 个，完整判定见[技术规格](spec.md)第 12.11 节）：

| 代码 | 含义 | 下一步 |
| --- | --- | --- |
| INVALID_ARGUMENT | 参数不合法：未知字段、越界或互斥参数 | 修正参数后作为新请求重试 |
| UNSUPPORTED_INPUT | 文本或路径不受支持：控制字符、超预算、scancode 不可映射 | 改写文本或 `inputMode`；不重放同一请求 |
| NOT_AUTHORIZED | 越权目标或缺少真实人工任务 | 停止；不得绕过 |
| USER_BUSY | 用户正在操作或近期有物理活动 | 让路，空闲后重新观察 |
| INPUT_INTERFERENCE | 输入期间发生用户输入或焦点干扰 | 重新观察；不补发已发送部分 |
| STATE_CHANGED | 观察后几何/DPI/前台/内容或代次变化（也可能在发送后校验时出现） | 重新观察；发送后禁止重放 |
| STALE_SNAPSHOT | 快照过期或已被消费 | 重新观察 |
| OCCLUDED_TARGET | 落点被其他窗口遮挡 | 重新观察并让目标可见 |
| FOCUS_MISMATCH | 焦点或所属窗口与观察不一致 | 重新观察；发送后先 reobserve |
| PASSWORD_FIELD | 目标是密码字段 | 停止；不得绕过 |
| MULTILINE_UNCONFIRMED | 含 LF 但多行语义未确认 | 改用单行文本或先确认多行 |
| ELEMENT_NOT_FOUND | 名称/角色在当前快照 0 匹配 | 重新观察后再次定位 |
| AMBIGUOUS_TARGET | 名称/角色匹配到多个候选 | 用候选 ref 或更精确条件重新定位 |
| SAVE_EXISTS | `savePath` 同名文件已存在 | 换新文件名 |
| OBSERVATION_TIMEOUT | 观察或 `waitFor` 超时（仍返回最后一次观察） | 读最后一次观察，再 reobserve |
| PROTOCOL_ERROR | Helper 响应或通道故障 | 停止接收新输入，等待清理 |
| CONTROL_CLOSE_FAILED | 关闭控制未确认释放 | 停止；按 faulted 报告 |
| INPUT_UNKNOWN | 注入结果未知 | 停止新增输入，重新观察确认 |
| USER_STOPPED | 物理 Esc 或用户停止 | 只有真实人工明确继续后才能重新开始 |

模型侧警告：

- "sent 之后禁止重放；先 reobserve"：只有 `execution=not_sent` 且 `retryable=true` 的回执才可按原参数再试；`sent`/`partially_sent` 表示动作已经影响桌面。
- "kind:text 对画布无效，画布用 kind:pixel"：画布（`ControlType.Image`）没有文本通道，`waitFor.kind=text` 只会超时；等画面变化用 `changed`，等画面稳定用 `stable`。

### 0.4.0-dev.2 可用性说明

- 画布坐标点击的比对范围：落点在观察到的 `ControlType.Image`（画布/VNC）内时，发送前只比较落点周围 12 DIP，并用最多 3 次、间隔约 60 ms 的重采吸收画布光标闪烁。画布持续动画时先 `waitFor` pixel `stable` 或重新观察，不要连续盲点。
- 终端类目标的 `verification`：xterm 一类终端（隐藏 textarea）的文本是临时缓冲，`verification=mismatch` 可能只是"无法比较"，不代表输入失败；以 `execution`/`sentCodePoints` 和后置截图为据，不要因此重放同一动作。
- `mk_observe targets` 的引用稳定：再次刷新列表不再使仍然存在的窗口 id 失效（同一 HWND+PID+创建时间保持同一 token）；已不存在窗口的 id 会被丢弃，已返回的快照在消费前仍然有效，且仍按单次消费处理（一次动作后需重新观察）。
- cloaked/UWP 子窗口过滤：DWM cloak 的窗口不出现在 `targets` 结果中，复验时按"已消失"处理；UWP 内容持续重绘的窗口仍可能因画面变化拒绝坐标点击，建议先等稳定或改用元素引用。

## 自动前置

调用 mk_observe window 即恢复并前置已有目标，无需第五个工具。先尝试常规激活，必要时采用短时线程输入关联，始终清理；不永久置顶、不模拟 Alt/Win、不修改系统前台锁。用户忙碌、窗口不响应或系统拒绝时返回明确错误；不会把前置请求已提交当成已成功。

只控制已有窗口；不新增应用启动、文件管理、剪贴板、浏览器DOM、右键、滚轮或拖拽。

## 证据与提示

蓝色 #168BFF 实心无描边指针，右下角 DeepSeek 动画卡片，按Esc停止。窗口截图只经宿主附件交给当前模型；无图片输入时保留UIA证据并禁止猜测像素点击。

mk_observe window、mk_mouse 和 mk_keyboard 可带可选 `savePath`（绝对 Windows 路径，以 .png 结尾，目录需已存在）：把本次捕获的原始分辨率图像写入该文件，同名文件已存在时返回 SAVE_EXISTS 且不覆盖。它只写 PNG 像素，不读文件、不列目录、不改变观察与输入的既有校验。

每次动作使用新观察，默认有效期30秒。键盘核对真实焦点及编辑状态；控件点击比较身份、命中和局部画面；坐标点击比较完整捕获区域（落点在画布/`ControlType.Image` 内时改为只比较落点周围 12 DIP，见上文）。sent只是已提交，verified必须有独立读回。失败和超时不自动重放。

## 设置兼容与交付

保留总开关和原数值设置。快照默认30000毫秒，空闲关闭默认300000毫秒；旧显式值和false保留。设置修改先交还电脑，保存失败明确提示。正常end不卸载工具，模型可在当前任务再次begin。

运行包仅包含Host/Client入口、共享产物、Helper与素材；5个研发测试入口及源码、历史和证据不进入安装包。完整工程保留测试和历史便于回归。SVG原文件不修改，构建校验原图哈希；版本与规格哈希绑定。

使用目标 Desktop 自带 CLI 安装，完整退出后重新打开 DSH：

```powershell
dsh plugin --profile desktop add https://github.com/Xian-JL/Mouse-Keyboard-Plugin/releases/download/v0.3.1/mouse-keyboard-plugin-0.3.1.tgz
```

也可从 [GitHub Releases](https://github.com/Xian-JL/Mouse-Keyboard-Plugin/releases) 下载 tgz 后用本地路径安装。发布文件同时提供 SHA256 校验值；本项目仅发布到 GitHub，未发布 npm。

## 验证

`npm run verify:development` 执行类型、构建、状态/来源/协议、前置协调器、真实宿主管线、Helper循环、隐藏UIA、离屏视觉、确切包检查和解包加载。自动验证不操作用户桌面；前置协调器通过可控平台故障注入验证，不宣称已经真机前置成功。

发布依据与限制见 [0.3.1 发布记录](docs/releases/0.3.1.md)、[技术规格](spec.md) 和 [人工自检步骤](docs/acceptance/manual.md)。自动测试证据与用户确认分开记录，没有把全部未测场景标为通过。

## 0.3.1 的观察与恢复

严重错误回执会关闭控制，未确认释放时保留faulted；设置变化保留任务和Esc锁存。明确禁止电脑操作跨回合持续，重新允许可发送“允许你操作电脑”；普通“继续”不会取消这项禁止。Esc在任务上下文内仍可用明确“继续”恢复。

window观察默认detail=compact，焦点正文预览最多512个UTF-16单元，其他控件使用更小的共享预算；需要更多上下文时可请求detail=expanded。valueTruncated/valuePreview表示预览不完整，原生完整证据仍独立用于验证。动作返回的observation已经是新快照，下一步可以直接使用。

纯文本模型不再请求PNG编码与交付，内部视觉保护仍保留。观察返回分阶段timings；慢读取报告OBSERVATION_TIMEOUT，几何/画面变化仍使用原有错误。多行证据不足仍拒绝含换行输入，不把所有Document控件默认视作多行。

新检出代码可执行`npm ci --ignore-scripts`、`npm run verify`、`npm run check:helper`、`npm run check:feedback`、`npm run check:uia`、`npm run check:visual`和`npm run check:package`。最后一项会从npm获取固定版本DSH SDK，在隔离目录验证包内入口，不修改实际Desktop Profile。

DeepSeek 图标使用项目已有的用户提供素材，不代表 DeepSeek 或其他产品官方背书。
