# Mouse-Keyboard-Plugin

用于 DeepSeek Harness Desktop 的最小 Windows 电脑操作插件。当前版本 **0.3.1**，规格 **1.6.0**。本版修复异常控制、配置更新与持续限制，并优化观察效率；0.3.0 的人工验收保留为历史证据，本版新增行为的真实桌面兼容性单独记录。

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

## 自动前置

调用 mk_observe window 即恢复并前置已有目标，无需第五个工具。先尝试常规激活，必要时采用短时线程输入关联，始终清理；不永久置顶、不模拟 Alt/Win、不修改系统前台锁。用户忙碌、窗口不响应或系统拒绝时返回明确错误；不会把前置请求已提交当成已成功。

只控制已有窗口；不新增应用启动、文件管理、剪贴板、浏览器DOM、右键、滚轮或拖拽。

## 证据与提示

蓝色 #168BFF 实心无描边指针，右下角 DeepSeek 动画卡片，按Esc停止。窗口截图只经宿主附件交给当前模型；无图片输入时保留UIA证据并禁止猜测像素点击。

每次动作使用新观察，默认有效期30秒。键盘核对真实焦点及编辑状态；控件点击比较身份、命中和局部画面；坐标点击比较完整捕获区域。sent只是已提交，verified必须有独立读回。失败和超时不自动重放。

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
