# 最小实现与验证边界

## 当前版本

0.3.0 对应 spec 1.5.1，运行功能代码与用户已验收的 0.2.0-dev.1 一致。历史源码、旧规格及本机详细验收证据保留在本地归档；GitHub 只包含当前版本源码、运行产物和脱敏发布记录，不上传本机环境资料。

## 最小数据流

src/shared 定义参数、设置、诊断和检索别名。Host 的 HumanAuthority 只确认当前真实人工任务与明确限制，不再匹配正向桌面关键词，也没有逐窗口审批缓存或审批服务依赖。Controller 保留会话、run、单次snapshot、全局租约、取消和结果验证；HelperBridge 保留有界JSONL及原生错误透传。Client仍使用宿主configForms，没有另建设置系统。

模型可为普通分析/解释任务自行选择电脑操作。消息来源仍须source=user且为当前会话的新append事件，seq水位跨turn/end保留；工具、文件、页面或模型消息不生成任务。用户明示禁止电脑操作时拒绝，其他“不要改动文字”等任务限制不被误判为禁止整个功能。Esc使用独立会话锁存，普通人工追问也不能自动解除，只有真实明确继续才可恢复。

宿主sandboxPolicy在begin、前置观察和输入前检查，只读/缺失策略不能取得控制权；status/end仍允许用于确认与清理。四工具注册和图片附件路由保持原接缝，不修改DSH源码、访问模式或模型配置。

## 窗口前置

helper/Foreground.cs 将流程和Win32适配分离。前置前由Server提供guard，核对当前run、人工活动代次、按键状态、窗口身份和权限。最小化窗口先ShowWindowAsync(SW_RESTORE)并等待实际状态，再尝试SetForegroundWindow；常规激活未成功时，使用有消息队列的工作线程短时关联前台与目标线程，BringWindowToTop/SetForegroundWindow后在finally中反向解除关联。

不在关联期间等待焦点，不阻塞物理急停的Overlay线程，不使用模拟Alt/Win、不永久置顶或修改前台锁参数。目标/前台窗口已挂起时拒绝；取消或用户活动优先中断。API返回true不是成功条件，必须读取真实前台和最小化状态。撤销关联失败按未知清理故障处理，不能继续输入。

poll等待有界；底层Windows调用及应用挂起仍有系统限制，不能宣称任意应用绝对可前置或绝对实时。新观察在恢复/激活后采集；动作阶段失焦只拒绝，不能暗中抢回前台。系统API参考：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-attachthreadinput 、https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow 、https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-showwindowasync 。

## 保留核心

键盘按实时焦点、控件状态和可读内容核验；引用点击按元素身份、命中与局部画面，像素点击按完整捕获画面。2/255色差及有限光标容差继续保留。物理Esc从begin起生效；普通键鼠活动由InputArbiter让路，部分输入不自动补发。蓝色无描边指针、右下角DeepSeek卡片、输入穿透和截图排除保留。

Helper只通过SendInput提交白名单动作，仅清理自有输入。无浏览器DOM、文件管理、应用启动、剪贴板及任意脚本。默认30秒snapshot、5分钟空闲；拒绝且not_sent不续期。正常end交还后模型仍可继续思考并再次begin。

## 包收束与测试

package.json files仅交付lib/index.js、lib/client.js、依赖共享chunk、helper、assets、cordis.patch.yml、README。5个研发导出core/contracts/bridge/authority/client-settings不进入tarball；源码、测试、旧包、历史文档和证据不进入运行包。研发目录保留这些材料用于回归和追溯。

前置协调器用纯平台假体验证常规/回退/恢复/超时、Esc与用户活动中断、部分关联和异常清理；该测试不操作用户桌面。真实Host工具管线用普通分析消息验证自主begin、只读拒绝及100次原生开关。策略provider为受控夹具，不冒充完整Desktop权限场景；真实Cordis、SystemPrompt和ToolRuntime来自实际安装归档。

隐藏UIA及离屏WPF、协议与版本绑定、确切tarball检查和解包后的真实Host/Helper加载仍执行。所有检查通过后也只表示这些范围通过；新版真实前置、物理Esc、图片路由和混合DPI仍按规格独立验收。未更改已安装插件、认证或网络配置。
