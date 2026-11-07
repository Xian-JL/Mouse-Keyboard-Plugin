# Mouse-Keyboard-Plugin 0.4.0 优化规格（草案 · 待批准）

文档版本：0.4.0-spec-1。编写日期：2026-11-07。当前实现版本：`0.3.2-dev.0`。
依据：2026-11-05/06 真实实验（UNIX V6++ 实验四，网页 IDE + QEMU/VNC 远程画布，517 次桌面工具调用）中的失败记录。
定位：**本文件是"待实现"的变更规格**，不是已发布契约。实现并在真机验收通过后，本条内容才并入 `spec.md`（作为第 12 节）并升版本号。

---

## 0 阅读方式

- 每条需求（FR）都给出：**现状证据 → 目标行为 → 契约影响 → 实现位置 → 对应验收用例（AC）**。
- 验收矩阵在 §7，逐条可执行、可判定；配套可勾选清单见 `docs/acceptance/0.4.0-checklist.md`。
- 本文所有"文件:行"均指当前仓库 `0.3.2-dev.0`。
- **不得**为了通过验收而放宽既有安全条款；§2.2 列出本次明确不做的改动。

---

## 1 背景：真实失败证据

实验全程 1359 次工具派发，其中桌面控制 517 次（`mk_observe` 267、`mk_mouse` 130、`mk_keyboard` 95、`mk_control` 25）。
下列现象在会话日志中反复出现，且直接造成过实验中断或返工：

| 编号 | 现象 | 日志证据 | 真实后果 |
| --- | --- | --- | --- |
| E1 | 文本输入是异步投递，返回时字符未必全部落地，紧跟的 Enter 抢跑 | 期望 `wc -l src/interrupt/Exception.cpp`，实际得到 `…Exception.cp`；两条命令粘连成 `awk 'NR>=248 && NR<=300 && (/Pagcp src/interrupt/Exception.cpp` | `cp: target …: Not a directory`、`awk: unexpected character`、shell 进入 `>` 续行，需人工恢复 |
| E2 | 向非 UIA 可编辑目标（VNC 画布 / `ControlType.Image`）打字被硬拒；即使放行，仓库侧只有 `KEYEVENTF_UNICODE` 注入（`helper/Native.cs:122` `Unicode()` 置 `wVk=0`），画布收不到真实键序列 | `UNSUPPORTED_INPUT` 在日志出现 89 次；`/bin/PageFaultTest 2` 被送成 `/bin/pagefaulttest 2`，回 `'pagefaulttest' is not an exist command` | 只能修改**已安装副本**的 C# 源码（放开 editable 门禁 + 加 scancode 路径）绕过；仓库版至今没有这两处补丁（`helper/Native.cs` 无 `VkKeyScanW`，`helper/Server.cs:180` 仍是 `!(bool)focused["editable"]` 硬拒） |
| E3 | 动作回执中 `observation` 可能整体缺失，模型侧按契约读取时抛裸 `TypeError` | 两次 `code run failed (exception): TypeError: Cannot read properties of undefined (reading 'snapshot')`（第 11、16 轮），整段程序中断 | 本可只丢一次观察，结果丢失整批操作 |
| E4 | 「动作已执行但后置校验失败」与「动作未执行」共用错误通道，模型重试导致重复执行 | `STATE_CHANGED` 出现 183 次；重试把「连接 GDB／断开」按钮连点两次，界面在 `连接中…/断开/连接 GDB` 之间抖动 | 连接被误断、需重新建断点 |
| E5 | 没有"等待条件"原语，只能 `sleep` + 反复观察 | 会话里多次用 shell `sleep` 当节流器；`CONTROL_CLOSED` 85 次、`STALE_SNAPSHOT` 34 次 | 空转、超时、快照过期 |
| E6 | 每次动作都返回完整观察（约 3–4k tokens） | 39 轮内触发 5 次自动压缩 | 上下文预算被观察挤占 |
| E7 | 改 C# 后必须等 Helper 自然回收（约 120 s）才重新编译 | `mk_control end` 后需等待再 `begin` | 每次插件调参 ≥2 分钟 |

> 说明：E1–E7 中的 `STATE_CHANGED/USER_BUSY/STALE_SNAPSHOT` 等**错误码本身是正确设计**，问题在于语义粒度与配套原语，不在码值。

### 1.1 ⚠️ 实现前必读：安装副本领先于仓库

2026-11-05 为完成真实实验，对**已安装副本**打过两处原生补丁，仓库至今没有（本次已核对）：

| 补丁 | 安装副本 `C:\Users\HUAWEI\.dsh\profiles\desktop\node_modules\mouse-keyboard-plugin\` | 仓库 `E:\Codex_workspace\Mouse-Keyboard-Plugin\` |
| --- | --- | --- |
| 大小写/scancode 注入 | `helper/Native.cs` 含 `VkKeyScanW`（2 处） | `grep -c VkKeyScanW helper/Native.cs` = **0** |
| 非可编辑目标可输入 | `helper/Server.cs:180` 已去掉 `!(bool)focused["editable"]` 门禁 | `helper/Server.cs:180` 仍为硬拒 |

因此**第 0 步**：先把这两处"现网可用补丁"回灌仓库（作为 FR-02/FR-03 的基线并补测试），
再从仓库重新构建。否则一打包就会把用户现在能用的能力弄丢——这是本次优化的第一个回归风险。

---

## 2 范围

### 2.1 本次包含

| 类 | 内容 |
| --- | --- |
| 缺陷修复 | FR-01 输入交付确认、FR-02 输入路径选择、FR-03 非可编辑目标输入、FR-04 回执信封、FR-05 执行语义与重试安全 |
| 能力补齐 | FR-06 观察等待条件、FR-07 元素按名称/角色定位、FR-08 回执体积控制 |
| 工程 | FR-09 区域裁剪证据（P2）、FR-10 Helper 重建入口（P2）、FR-11 错误码与 requiredAction 全表、FR-12 现网失败场景固化为回归夹具 |

### 2.2 明确不做（硬约束，实现时不得违反）

1. **不引入粘贴/剪贴板**：`type` 仍逐字符注入，不得用 `Ctrl+V`、不得写剪贴板实现"快"。
2. **不引入脚本注入、CDP、浏览器 DOM 操作、网络注入**；不新增启动应用/文件读写（`savePath` 仍是唯一写盘能力）/右键/滚轮/拖拽工具。
3. **不放宽 Esc 锁存**：物理 Esc 仍立即关输入门并锁存；不得提供模型侧解锁手段。
4. **不降低授权门槛**：真实人工任务来源、单 run 互斥、密码字段/DSH 自身/安全桌面拒绝全部保留。
5. **不伪造成功**：`execution`/`verification` 语义只允许更精确，不允许把失败写成成功；未实测项不得标 PASS。
6. **不改默认值**：`snapshotTtlMs=30000`、`controlIdleMs=300000`、`maxElements=300`、`maxTreeDepth=10` 等保持不变；新开关默认关闭。

### 2.3 契约影响总览

| 变更 | 类型 | 破坏性 |
| --- | --- | --- |
| `mk_keyboard` 新增 `settleMs`/`paceMs`/`inputMode` | 可选参数 | 否 |
| 回执新增 `retryable`/`requiredAction`/`deliveredAt`/`settledMs`；`observation` 恒存在（可为 `null`） | 新增字段 | 否（旧字段语义不变） |
| `mk_observe` 新增 `waitFor` | 可选参数 | 否 |
| `mk_mouse` 新增 `elementName`/`elementRole`（与 `element`/`x,y` 三者互斥） | 可选参数 | 否 |
| `mk_mouse`/`mk_keyboard` 新增 `observe:'full'|'compact'|'none'` | 可选参数 | 否（默认 `full`） |
| 删除 `type` 的 `editable` 门禁（恒开） | 行为放宽 | 是（能力变强，安全边界缩小，见 FR-03） |
| 协议版本 | 仍为 1；请求/回执只增字段 | 否 |

---

## 3 需求

### FR-01 输入交付确认（P0）

**现状**：`helper/Server.cs` 的 `type` 分支按 32 字符分块 `SendInput`，发完立即 `execution="sent"` 返回，不等待目标消费；调用方必须自行 `sleep`。
**目标**：一次 `mk_keyboard` 返回时，输入必须已经"落地到足以让后续动作安全接续"，且这一事实可判定。

**契约**
- 新增可选参数：
  - `settleMs`：整数 0–5000，默认 `0`（= 仅做通用确认）；含义：在最后一个输入事件之后，再等待目标稳定这么久才返回。
  - `paceMs`：整数 0–50，默认取设置 `inputPaceMs`；含义：分块之间（或每字符之间）的间隔。
  - `inputMode`：`'auto'|'unicode'|'scancode'`，默认 `'auto'`（见 FR-02）。
- 通用确认（对所有目标生效）：`SendInput` 之后轮询 `GetLastInputInfo()`，直到 `dwTime` 前进到覆盖本次注入的最后事件时间，上限 300 ms；超时则 `execution='sent'` + `verification='unverified'` + `requiredAction='reobserve'`。
- 可读回目标（`editable=true` 且有完整值证据）：在通用确认之外，轮询焦点控件文本，连续两次采样（间隔 ≥120 ms）一致且等于预期值 → `verification='verified'`；超过 `settleMs`（若 >0）或默认 1200 ms 仍不一致 → `verification='mismatch'`（值可读回时）或 `'unverified'`。
- 新增回执字段：`deliveredAt`（ISO 时间）、`settledMs`（本次实际等待毫秒）。

**实现位置**：`helper/Server.cs` type/key 分支（当前 176–196 行）；`helper/Native.cs` 新增 `WaitInputDelivered(int ms)`、`WaitTextStable(...)`；`src/shared/contracts.ts` 的 `parseRequest`/`TOOL_SCHEMAS`；`src/host/bridge.ts` 透传新字段。
**验收**：AC-INPUT-01～04。

---

### FR-02 输入路径选择：unicode / scancode / auto（P0）

**现状**：所有 `type` 一律走 `Native.Unicode(c)`（`helper/Native.cs:122`，`dwFlags` 含 `KEYEVENTF_UNICODE`、`wVk=0`），由 `helper/Server.cs` 按 32 字符分块发送。该方式在标准编辑控件可用，但在**画布/远程桌面/浏览器 canvas**（VNC）只产生 `WM_CHAR`：浏览器收不到 keydown，画布拿不到按键。仓库里没有任何 scancode/VK 文本路径（`grep -c VkKeyScanW helper/Native.cs` = 0）。
**目标**：`auto` 模式下按目标类型自动选路，且失败时明确报错而不是静默丢字。

**规则**
| 目标证据 | 路径 |
| --- | --- |
| `editable=true` 的 UIA 控件 | `unicode`（现状，保持） |
| `editable=false` 且已由 FR-03 显式允许（画布/图片/未知角色） | `scancode` |
| `auto` 遇到无法映射的字符 | 落到 `unicode`；若目标为非可编辑且 `unicode` 也不可用，返回 `UNSUPPORTED_INPUT`（**不得静默丢字**） |

**scancode 规则**：用 `VkKeyScanW` 取 `(vk, shiftState)`；`shiftState` 含 `0x01` 时先按下 Shift、结束后释放；含 `0x02`(Ctrl)/`0x04`(Alt) 时拒绝（`UNSUPPORTED_INPUT`，不模拟组合键）；`Enter/Tab/Backspace/方向键/Delete/Home/End/PageUp/PageDown` 走既有 VK 表。仅覆盖 `VkKeyScanW` 可映射字符（ASCII 与常见符号）；中文等非映射字符在 `scancode` 模式下明确失败。
**键状态卫生**：自己按下的 Shift 必须在 `finally` 中释放，不得污染用户按住状态（沿用 `ReleaseOwned`）。

**实现位置**：`helper/Native.cs` 新增 `Ascii(char)`/`Scancode(char)`；`helper/Server.cs` type 分支按 `inputMode` 分流。
**验收**：AC-INPUT-05～07。

---

### FR-03 向非可编辑目标输入：恒开（P0，用户 2026-11-07 决定）

**现状**：`helper/Server.cs:180` `if(action=="type"){…||!(bool)focused["editable"]) throw new Failure("UNSUPPORTED_INPUT");` 硬拒。实验里 89 次命中，最终只能改**已安装副本**源码放开。
**决定**：不做配置开关，**恒开**——把已安装副本的现状固化为契约，避免"重装后突然打不了字"。
**目标**：仓库版与已安装副本行为一致；改动落在仓库并由测试覆盖，而不是留在某台机器的 node_modules 里。

**契约**
- 删除 `helper/Server.cs:180` 的 `!(bool)focused["editable"]` 门禁；`type` 只保留原有校验：非密码字段、`MULTILINE_UNCONFIRMED`（含 LF 时）、`ValidateText` 预算。
- 不新增任何设置项；`Settings` 结构保持 0.3.2 的 8 个字段不变（避免配置迁移）。
- **仍然必须拒绝**（与 0.3.2 完全一致，不得放宽）：
  1. 密码字段（`password=true`）；
  2. DSH 自身窗口、Helper、安全桌面、更高完整性进程（沿用 `authority.ts`）；
  3. 焦点元素不可见或未启用；
  4. 所属根窗口不等于观察时的目标窗口、窗口几何/DPI 变化（`FOCUS_MISMATCH` / `STATE_CHANGED`）；
  5. 快照过期或已被消费（`STALE_SNAPSHOT`）；
  6. 用户按住修饰键（`NoHeldModifiers` → `USER_BUSY`）。
- `diagnostics` 记录 `inputTarget='non-editable'`（不含文本内容），便于事后审计这次输入去了非编辑控件。
- **已知残余风险（如实记录）**：文本会以按键序列送到当前焦点。若焦点落在网页工具栏、带单键快捷键的页面等非画布控件上，字母可能触发页面快捷键。缓解手段：`RequireFocus` 每块复验焦点、快照单次消费、`diagnostics` 标注。后续如需更严，可另立 FR 增加"仅画布角色放行"，本次不做。

**实现位置**：`helper/Server.cs:180`（删除门禁）、`helper/Server.cs` 回执/诊断处、`src/host/bridge.ts` 透传。
**验收**：AC-INPUT-08～10。

---

### FR-04 回执信封：`observation` 恒存在（P0）

**现状**：`NativeReceipt.observation?: Observation`（`contracts.ts:83`）——失败或后置观察不可用时**整个字段消失**。模型（PTC 程序）按"成功必有 observation"写代码时，`r.observation.snapshot` 抛 `TypeError`，整段 `run_code` 中断（E3，2 次）。
**目标**：任何回执的字段形状固定；缺失用 `null` 表达。

**契约**
- 所有工具回执**始终**包含 `observation`：值或 `null`。
- 后置观察失败时新增 `observationError: {code, message}`（与 `error` 区分：前者是"动作成功了，但拍不了照"，后者是动作本身的失败）。
- 文档与 `TOOL_SCHEMAS` 的返回说明同步更新；`src/host/index.ts` 的返回类型改 `Observation|null`。
- 兼容：旧调用方读 `observation?.x` 行为不变；读 `r.observation.x` 的现在会得到明确 `null` 而不是 `undefined`（同样抛错，但**文档已声明可空**，且 PTC 生成的 SDK 类型里体现为 `Observation | null`）。

**实现位置**：`contracts.ts:83`、`src/host/index.ts`、`helper/Server.cs` 回执组装处（当前 196 行附近）。
**验收**：AC-RCPT-01～04。

---

### FR-05 执行语义与重试安全（P0）

**现状**：错误对象只有 `code/message/execution/details`，调用方无法区分"能不能重试"。实验里 `STATE_CHANGED` 出现在**动作已发送之后**的校验阶段，模型按错误重试 → 连点两次（E4）。
**目标**：让"是否已执行、能否重试、下一步该做什么"成为回执的一等字段。

**契约（新增回执字段）**
```jsonc
{
  "execution": "not_sent|sent|partially_sent|unknown",   // 既有
  "verification": "unverified|observed_change|verified|mismatch", // 既有
  "retryable": false,          // 新增：是否可安全重试同一动作
  "requiredAction": "none|reobserve|wait|rebegin|stop",   // 新增
  "observation": null,          // 新增：恒存在，见 FR-04
  "observationError": {"code": "...", "message": "..."}   // 新增：仅在拍照失败时出现
}
```
**判定规则（必须逐条实现，并用测试锁定）**
1. `retryable=true` **仅当**：`execution="not_sent"` 且 `error.code ∈ {STATE_CHANGED, FOCUS_MISMATCH, OCCLUDED_TARGET, STALE_SNAPSHOT, USER_BUSY, INPUT_INTERFERENCE, INVALID_COORDINATE}`。
2. `execution="sent"/"partially_sent"/"unknown"` ⇒ `retryable=false`，`requiredAction ∈ {reobserve, wait}`；`sent` 永不与 `not_sent` 混用。
3. `USER_STOPPED`、`CONTROL_CLOSE_FAILED`、`PROTOCOL_ERROR`、`HELPER_TIMEOUT` ⇒ `requiredAction="stop"`。
4. 已发送后的校验失败（含 `STATE_CHANGED`）一律 `verification="mismatch"|"unverified"`，`requiredAction="reobserve"`，**不得**回 `not_sent`。
5. 模型侧文档（README 工具表 + PTC 生成说明）必须写明：`sent` 之后禁止重放。

**实现位置**：`src/shared/contracts.ts`（错误与回执类型、`MkError` 增加 `retryable/requiredAction` 推导）、`src/host/controller.ts`、`helper/Server.cs` 的 `Failure` 处（当前 `RequireFocus`/`CheckHit` 等固定传 `not_sent`）。
**验收**：AC-RCPT-05～08。

---

### FR-06 观察等待条件 `waitFor`（P1，用户 2026-11-07 决定：不做 OCR）

**现状**：只能 `sleep` 后反复 `mk_observe`；VNC 画布没有文本通道，只能靠人肉等待（E5）。
**目标**：把"等某个条件成立"变成一次调用。条件分两类：**UIA 可读文本/元素**，以及**画面像素**（画布唯一可判定的通道）。

**契约**：`mk_observe`（仅 `mode=window`）新增可选 `waitFor`：

```jsonc
// 1) UIA 文本
{"kind":"text","value":"All built.","exact":false,"timeoutMs":5000}
// 2) UIA 元素
{"kind":"element","value":"保存","role":"Button","timeoutMs":5000}
// 3) 画面像素：等区域稳定（终端输出结束、提示符已绘出）
{"kind":"pixel","region":{"left":560,"top":700,"width":900,"height":300},
 "mode":"stable","settleSamples":3,"timeoutMs":8000}
// 4) 画面像素：等区域相对调用开始发生变化（点了 Run / 出现弹窗）
{"kind":"pixel","region":{"left":560,"top":700,"width":900,"height":300},
 "mode":"changed","minChangedPixels":64,"timeoutMs":8000}
```

**通用规则**
- 轮询间隔 150 ms；`timeoutMs` 1000–30000，默认 5000。
- 命中即返回**当场的新观察**（等价于刚做了一次 `window` 观察，`durationMs` 为实际等待时长）。
- 超时：`error.code=OBSERVATION_TIMEOUT`、`execution=not_sent`、`requiredAction="reobserve"`，并**仍返回最后一次观察**（便于判定现状）。
- `waitFor` 只影响等待，不改变观察内容与快照有效期语义。

**`kind:"text"/"element"`**
- 在每轮采样的 UIA 结果里匹配；`text` 默认包含匹配（`exact=true` 时全等），`element` 走 FR-07 的匹配规则。
- **只对 UIA 可读内容生效**。画布（`ControlType.Image`）没有文本节点，对其使用 `text` 只会超时——文档必须写明这一点。

**`kind:"pixel"`（画布场景的唯一手段）**
- `region` 采用**窗口图像像素坐标**（与 `mk_mouse` 的 `x/y` 同一坐标系），必须落在当前捕获区域内；越界返回 `INVALID_COORDINATE`。
- `mode:"stable"`：连续 `settleSamples`（默认 3，范围 2–10）次采样的区域差异都在容差内即命中。容差沿用既有像素比较器：单通道 ≤ `2/255`、只归一化系统光标已确认的小矩形。**注意**：画布内 VNC 自带的光标闪烁不在归一化之列，`settleSamples` 与容差需按实测调；持续刷新的内容（如 `top`）会一直不稳定 → 超时。
- `mode:"changed"`：相对**调用开始时**的基线，变化像素数 ≥ `minChangedPixels`（默认 64，范围 1–4096）即命中；用于"等某个动作真的发生"。
- `pixel` 只回答"画面变了/稳定了"，**不识别内容**；需要内容时由模型读图判断。
- **不读取任何外部参考图**（不破坏"运行包不读文件"约束），因此不提供 `matches` 模式。

**实现位置**：`contracts.ts`（解析与 `TOOL_SCHEMAS`）、`helper/Server.cs`（观察分支的 pixel 采样，复用 `Native` 现有帧比较）、`src/host/controller.ts`（超时与 `OBSERVATION_TIMEOUT`）。
**验收**：AC-WAIT-01～06。

---

### FR-07 元素定位：`ref` 之外支持名称/角色（P1）

**现状**：`mk_mouse` 的 `element` 只接受观察里的 `ref`（`helper/Server.cs:170` `snap.Elements.TryGetValue(reference)`）。实验里 ref 很快过期，只能退回坐标点击，而坐标对布局变化极脆（E1 的坐标表维护成本）。
**目标**：允许用可访问名称 + 角色定位，并在歧义时明确失败。

**契约**：新增可选参数（与 `element`、`x/y` 三者互斥）：
```jsonc
{"elementName":"命令行","elementRole":"TabItem","elementExact":false}
```
- 在**当前快照**的元素表内匹配：名称（默认包含匹配，`elementExact=true` 时精确）+ 角色（可选）。
- 0 个匹配 → `ELEMENT_NOT_FOUND`（`execution=not_sent`，`retryable=true`，`requiredAction="reobserve"`）。
- ≥2 个匹配 → `AMBIGUOUS_TARGET`，`details.candidates` 给出最多 8 个 `{ref,name,role}`（有界、无文本正文）。
- 命中后仍走既有 `SameElementState`/`BelongsToWindow`/密码与遮挡校验。

**实现位置**：`contracts.ts` 解析、`helper/Server.cs` 点击分支。
**验收**：AC-ELEM-01～03。

---

### FR-08 回执体积控制 `observe`（P1）

**现状**：每次动作都回完整观察（E6）。
**契约**：`mk_mouse`/`mk_keyboard` 新增可选 `observe: 'full'|'compact'|'none'`，默认 `full`。
- `compact`：`elements` 截断为焦点 + 最多 20 个，`coverage.deliveredElements` 如实标注；
- `none`：`observation=null`，仅返回 `execution/verification/requiredAction`。
- 无论哪种取值，`savePath` 仍照常写原始 PNG。

**验收**：AC-SIZE-01～02。

---

### FR-09 区域证据 `region`（P2，可选）

`mk_observe window` 与动作的 `savePath` 增加可选 `region:{left,top,width,height}`（图像像素坐标，必须在 `imageSize` 内）：保存的是该区域的原始分辨率 PNG；返回的 `image` 也按该区域给出。用于 GDB 十六进制小字这类**必须放大才能读**的场景（实验中靠 Pillow 手工裁剪 94 次）。
**验收**：AC-REGION-01。

---

### FR-10 Helper 重建入口（P2，仅研发）

`scripts/dev-helper-rebuild.mjs`：结束当前 run、终止 Helper 进程、重新 `begin`，使 C# 改动立即生效（替代等 120 s 自然回收）。**只进研发脚本，不进运行包**。
**验收**：AC-DEV-01。

---

### FR-11 错误码与 `requiredAction` 全表（P0，文档）

现状错误分散在代码里，模型侧只能靠猜。新增一张全表（`spec.md` 第 12 节 + README 摘要），列出：`INVALID_ARGUMENT / UNSUPPORTED_INPUT / NOT_AUTHORIZED / USER_BUSY / INPUT_INTERFERENCE / STATE_CHANGED / STALE_SNAPSHOT / OCCLUDED_TARGET / FOCUS_MISMATCH / PASSWORD_FIELD / MULTILINE_UNCONFIRMED / ELEMENT_NOT_FOUND / AMBIGUOUS_TARGET / SAVE_EXISTS / OBSERVATION_TIMEOUT / PROTOCOL_ERROR / CONTROL_CLOSE_FAILED / INPUT_UNKNOWN / USER_STOPPED` 的**含义 / 是否已发送 / 是否可重试 / 建议下一步**。
**验收**：AC-DOC-01～02（表与代码常量一一对应，无遗漏无多余）。

---

### FR-12 现网失败固化为回归夹具（P0）

把 §1 的 E1–E4 变成自动化回归，而不是只写在文档里：
1. `tests/settle.test.mjs`：长文本 + 立即 Enter 的竞态（模拟后端按"到达顺序"记账，断言 `settleMs` 生效后不截断）；
2. `tests/canvas-input.test.mjs`：`inputMode=scancode` 的大小写/Shift 序列（断言 VK 序列含 Shift 按下-释放，且 `ReleaseOwned` 后无残留）；
3. `tests/receipt-envelope.test.mjs`：后置观察失败时 `observation === null` 且存在 `observationError`；
4. `tests/retry-safety.test.mjs`：`execution="sent"` 的校验失败 ⇒ `retryable=false` 且 `requiredAction="reobserve"`。
夹具可用 `tests/fixtures/*.cs`（已有 `ForegroundRegression.cs`/`FeedbackRegression.cs`/`HiddenUia.cs` 的合成窗口模式）。
**验收**：AC-REG-01～04。

---

## 4 非功能需求

| 编号 | 要求 | 判定 |
| --- | --- | --- |
| NFR-01 | `type` 16000 码点预算不变；`settleMs`/`paceMs` 计入单动作 40 s 总预算 | 单元测试断言超预算时返回 `HELPER_TIMEOUT` |
| NFR-02 | 新增字段不携带业务文本；`diagnostics` 仍只含有界数值与固定枚举 | 代码审查 + `DATA-01` 用例 |
| NFR-03 | 默认配置下行为与 0.3.2 完全一致（除 `observation` 变为恒存在） | 旧测试全绿 + AC-RCPT-01 |
| NFR-04 | 协议仍为 1；新增字段可被旧 Host 忽略 | `check-package` + 版本对表 |
| NFR-05 | 运行包体积增量 ≤ 20 KiB（不含测试） | `check-package` 报告 |

---

## 5 验收方法与判定规则

1. **自动**：`npm run verify`（typecheck + build + 全部 `tests/*.test.mjs`）必须全绿；`cmd /c npm run check:helper` 编译通过。
2. **半自动**：`node scripts/check-uia.mjs`、`check:feedback`、`check:package` 按既有脚本执行。
3. **真机**：凡是需要真实桌面/画布/输入法/混合 DPI 的条目（AC 表中标 `[真机]`），必须在**当前 DSH 的隔离 Profile**上安装构建包后手工执行，并保留回执/录屏/截图作为证据。
4. **判定**：每条 AC 只能记 `PASS / FAIL / PARTIAL / NOT_RUN`。**未运行不得记 PASS**；`PARTIAL` 必须写明缺哪一段证据（沿用 `spec.md` 第 9 节纪律）。
5. **证据形态**：工具回执 JSON 片段（脱敏）、测试用例名与输出行、真机截图/录屏文件名、Helper 编译输出。
6. **回归门槛**：`accept:release` 的既有 150+ 矩阵不得因本次改动出现新的 FAIL；本规格的 AC 全部 `PASS` 或经用户书面接受的 `PARTIAL` 才能并入 `spec.md` 并发布。

---

## 6 实施顺序（建议）

1. **第 1 批（P0 修复，可整批交付）**：FR-04（回执信封）→ FR-05（执行语义）→ FR-12 对应测试。改动集中在 `contracts.ts`/`controller.ts`/`Server.cs` 回执组装，风险低、收益最高。
2. **第 2 批（P0 输入链路）**：FR-01（settle/pace）→ FR-02（scancode）→ FR-03（配置项）→ FR-12 测试。需要动 Helper 输入路径，必须配真机验收。
3. **第 3 批（P1 能力）**：FR-06（waitFor）→ FR-07（名称定位）→ FR-08（体积）→ FR-11（文档全表）。
4. **第 4 批（P2）**：FR-09、FR-10。
每批完成后：更新 `spec.md`（新增第 12 节）、`CHANGELOG.md`、`README.md` 工具表，并把 `package.json` 版本推到 `0.4.0-dev.N`。

---

## 7 验收矩阵（我会按这张表逐条验收）

| AC | 需求 | 类型 | 步骤 | 通过标准 |
| --- | --- | --- | --- | --- |
| AC-INPUT-01 | FR-01 | 自动 | 合成后端注入 2000 字符长文本，紧跟一个 Enter 动作 | 记账序列中 Enter 之后不再有该文本的字符；`settledMs>0` |
| AC-INPUT-02 | FR-01 | 自动 | `settleMs=0`（默认）与 `settleMs=800` 各跑一次 | 默认路径仍返回 `deliveredAt`，且 `verification` 与读回值一致 |
| AC-INPUT-03 | FR-01 | 真机 | 记事本里输入 `wc -l src/interrupt/Exception.cpp` 后立即 Enter | 文本完整无截断；回执 `verification=verified` |
| AC-INPUT-04 | FR-01 | 真机 | 向 VNC/画布连续输入三条命令，每条之间不手工 sleep | 三条命令按序完整执行，无粘连、无续行状态 |
| AC-INPUT-05 | FR-02 | 自动 | `inputMode=scancode` 输入 `PageFaultTest`（含大写） | 生成的 VK 序列含 Shift 按下/释放，字母键为对应 VK，顺序与文本一致 |
| AC-INPUT-06 | FR-02 | 自动 | `inputMode=scancode` 输入中文 | 返回 `UNSUPPORTED_INPUT`，且**未发送任何事件** |
| AC-INPUT-07 | FR-02 | 真机 | 画布上输入 `/bin/PageFaultTest 2` | 大小写正确、命令被 shell 接受（不再出现 `not an exist command`） |
| AC-INPUT-08 | FR-03 | 自动 | 对非编辑焦点（`editable=false`）做 `type`，不设任何开关 | 发送成功（不再 `UNSUPPORTED_INPUT`）；`diagnostics` 含 `inputTarget=non-editable` |
| AC-INPUT-09 | FR-03 | 自动 | 非编辑焦点但 `password=true`；或焦点在 DSH 自身窗口 | 仍拒绝（`PASSWORD_FIELD` / `NOT_AUTHORIZED`），无事件发送 |
| AC-INPUT-10 | FR-03 | 真机 | 画布内输入 `/bin/PageFaultTest 2` 与三条连续 shell 命令 | 命令被 shell 正确接受；密码框、DSH 窗口、安全桌面仍拒绝 |
| AC-RCPT-01 | FR-04 | 自动 | 所有工具的成功/失败回执枚举 | 每条回执都有 `observation` 键（值可为 null），无缺失 |
| AC-RCPT-02 | FR-04 | 自动 | 让后置观察失败（注入） | `observation=null` 且 `observationError` 存在；`execution=sent` |
| AC-RCPT-03 | FR-04 | 自动 | PTC/SDK 生成的类型 | `observation` 类型为 `Observation \| null`，文档一致 |
| AC-RCPT-04 | FR-04 | 自动 | 旧调用方式 `receipt.observation?.x` | 行为与 0.3.2 相同（类型检查通过） |
| AC-RCPT-05 | FR-05 | 自动 | 动作已发送、后置校验失败 | `retryable=false`，`requiredAction=reobserve`，`execution≠not_sent` |
| AC-RCPT-06 | FR-05 | 自动 | `USER_BUSY`/`STALE_SNAPSHOT` 等在发送前失败 | `retryable=true`，`requiredAction=reobserve` |
| AC-RCPT-07 | FR-05 | 自动 | `USER_STOPPED`/`CONTROL_CLOSE_FAILED` | `requiredAction=stop`，`retryable=false` |
| AC-RCPT-08 | FR-05 | 真机 | 点「连接 GDB」**一次**，随后**等待 60 秒再继续**（期间不做任何动作） | 不做第二次点击；60 秒后连接状态未被翻转；回执 `retryable=false`、`requiredAction=reobserve` |
| AC-WAIT-01 | FR-06 | 自动 | `waitFor.kind=text` 命中 | 返回新观察，`durationMs` 小于超时 |
| AC-WAIT-02 | FR-06 | 自动 | `waitFor` 超时 | `OBSERVATION_TIMEOUT`，仍返回最后一次观察，`requiredAction=reobserve` |
| AC-WAIT-03 | FR-06 | 真机 | 触发一次 Build，**每 1 分钟截图一次**判断构建是否结束（看到 `All built.` 或提示符回到可输入态即结束） | 1 分钟粒度下能判断出结束时刻，且截图顺序与真实构建时长一致；不要求 `waitFor{kind:text}` 命中（xterm 不暴露文本属已知边界） |
| AC-WAIT-04 | FR-06 | 自动 | 对画布使用 `kind=text` | 明确超时（不误判为命中）；文档已写明画布无文本通道 |
| AC-WAIT-05 | FR-06 | 真机 | 画布执行命令后等待输出结束；**采样间隔固定 30 秒**（相邻两次采样画面一致即判稳定） | 第二次采样与第一次一致即 PASS；截图显示提示符已回到 `[/]#`。30 秒间隔用于跨过画布光标闪烁，不要求 150 ms 连续稳定 |
| AC-WAIT-06 | FR-06 | 自动 | 静止画面下 `mode=changed` 跑满 3 s；随后制造一次可见变化 | 静止期间不误命中；变化发生后命中且 `durationMs` 合理 |
| AC-ELEM-01 | FR-07 | 自动 | 按 `elementName`+`elementRole` 唯一定位 | 点击落在该控件，回执 `execution=sent` |
| AC-ELEM-02 | FR-07 | 自动 | 名称匹配到多个元素 | `AMBIGUOUS_TARGET`，`candidates≤8`，无文本正文泄露 |
| AC-ELEM-03 | FR-07 | 自动 | 名称不存在 | `ELEMENT_NOT_FOUND`，`retryable=true`，`requiredAction=reobserve` |
| AC-SIZE-01 | FR-08 | 自动 | `observe=none` | `observation=null`，字节数较 full 下降 ≥80% |
| AC-SIZE-02 | FR-08 | 自动 | `observe=compact` | `elements≤21`，`coverage` 如实标注 |
| AC-REGION-01 | FR-09 | 真机 | 对 GDB 控制台区域取 `region` | 落盘 PNG 尺寸等于 region，文字可读 |
| AC-DEV-01 | FR-10 | 自动 | 运行开发脚本 | Helper 进程号变化，C# 改动无需等待 120 s 生效 |
| AC-DOC-01 | FR-11 | 自动 | 比对文档表与代码常量 | 一一对应，无遗漏/多余 |
| AC-DOC-02 | FR-11 | 自动 | README 工具表与 `TOOL_SCHEMAS` | 参数名、枚举值、必填项完全一致 |
| AC-REG-01 | FR-12 | 自动 | `npm test` 新增四个用例 | 全绿，且用例名可对应 E1–E4 |
| AC-REG-02 | 兼容 | 自动 | `npm run verify` 全量 | 旧用例无新增 FAIL |
| AC-REG-03 | 兼容 | 自动 | `check:helper` / `check:package` | 编译与包检查通过，体积增量 ≤20 KiB |
| AC-REG-04 | 安全 | 自动 | 静态检查：无 `Ctrl+V`、无剪贴板 API、无 CDP/网络注入 | 0 命中 |

---

## 8 交付物（新对话完成时要给出）

1. 代码：`src/**`、`helper/**` 的改动，且 `npm run verify` 全绿。
2. 测试：`tests/settle.test.mjs`、`canvas-input.test.mjs`、`receipt-envelope.test.mjs`、`retry-safety.test.mjs`。
3. 文档：`spec.md` 新增第 12 节（本文件内容并入）、`CHANGELOG.md` 新增 `0.4.0` 条目、`README.md` 工具表更新。
4. 记录：`docs/acceptance/0.4.0.md`（逐条 AC 的 PASS/FAIL/PARTIAL/NOT_RUN + 证据），未跑的必须如实标 NOT_RUN。
5. 包：`artifacts/` 下与版本号绑定的 tarball 及 SHA-256，供我在隔离 Profile 安装后真机验收。

---

## 9 已定决策与待确认

**已定（2026-11-07）**
1. FR-03 **恒开**：删除 `editable` 门禁，不新增开关；密码/DSH/安全桌面等拒绝项不变。
2. FR-06 **不做 OCR**：`waitFor` 支持 `text` / `element` / `pixel` 三种；画布只走 `pixel`（stable/changed），不读取外部参考图、不识别内容。

**待确认**
3. 版本号与发布范围：按 `0.4.0` 发布到 GitHub，还是保持 `0.4.0-dev.N` 只做本地安装验收（默认按后者，发布需单独授权）。
