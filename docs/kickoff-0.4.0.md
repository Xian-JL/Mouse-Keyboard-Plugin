# 0.4.0 实施任务（给新对话的提示词）

> 用法：把本文件正文整段复制给新对话的第一条消息即可。

---

你负责把 `E:\Codex_workspace\Mouse-Keyboard-Plugin` 从 `0.3.2-dev.0` 升级到 `0.4.0`：按规格实现、自测、出包。**规格是唯一依据**，凡与既有 `spec.md` 冲突处，以 `spec.md` 的硬约束为准，并在汇报里指出冲突。

## 必读（按顺序）

1. `docs/optimization-spec-0.4.0.md` —— 本次变更规格（12 条 FR、35+ 条验收 AC、实施顺序）
2. `docs/acceptance/0.4.0-checklist.md` —— 验收人将逐条执行的清单
3. `spec.md` —— 现行 1.7.0 契约（第 1、2、6、9 节的硬约束不得违反）
4. `docs/IMPLEMENTATION.md`、`README.md`、`CHANGELOG.md`

## 已定决策（不要再询问）

- **FR-03 恒开**：删除 `helper/Server.cs:180` 的 `!(bool)focused["editable"]` 门禁，**不新增配置项**；密码字段、DSH 自身窗口、Helper、安全桌面、更高完整性进程、焦点复验、快照有效期等拒绝项一律保持不变。
- **FR-06 不做 OCR**：`mk_observe.waitFor` 支持 `text` / `element` / `pixel` 三种；`pixel` 只有 `stable` 与 `changed` 两种模式，**不读取外部参考图、不识别画面内容**。

## 第 0 步（必须先做，否则会回归）

仓库落后于本机安装副本两处补丁，先把它们回灌仓库并补测试：

1. `helper/Native.cs`：新增基于 `VkKeyScanW` 的 scancode 注入（含 Shift 按下/释放；`VkKeyScanW` 返回 Ctrl/Alt 位时一律 `UNSUPPORTED_INPUT`，不模拟组合键）。
2. `helper/Server.cs`：`type` 分支按 `inputMode` 分流（可编辑→`unicode`，非可编辑/画布→`scancode`），并保证自己按下的 Shift 在 `finally` 中释放。

只读参考（**不要整文件覆盖**，先 diff 确认这两处）：
`C:\Users\HUAWEI\.dsh\profiles\desktop\node_modules\mouse-keyboard-plugin\helper\{Native.cs,Server.cs}`

## 实施顺序

- 批 1：FR-04（回执信封）+ FR-05（执行语义/重试安全）+ FR-12 前两个测试
- 批 2：FR-01（settle/pace）+ FR-02（输入路径）+ FR-03（恒开）+ 对应测试
- 批 3：FR-06（waitFor）+ FR-07（名称/角色定位）+ FR-08（回执体积）+ FR-11（错误码全表）
- 批 4：FR-09（region 证据）+ FR-10（Helper 重建脚本）

每批结束执行 `npm run verify`（typecheck + build + test），必须全绿再进入下一批；`check:helper`、`check:package` 在批 2 与批 4 各跑一次。

## 硬约束（违反即不合格）

- 不引入粘贴/剪贴板/`Ctrl+V`、不注入脚本/CDP/网络、不新增启动应用/文件读写（`savePath` 仍为唯一写盘）/右键/滚轮/拖拽工具。
- 不放宽 Esc 锁存、真实人工任务来源、单 run 互斥、密码/DSH 自身/安全桌面拒绝。
- 不修改现有默认配置值（`snapshotTtlMs=30000`、`controlIdleMs=300000`、`maxElements=300` 等）。
- 测试必须真实执行；未运行的用例只能标 `NOT_RUN`，**禁止编造 PASS**。

## 交付物

1. 代码：`src/**`、`helper/**` 的改动，`npm run verify` 全绿。
2. 测试：`tests/settle.test.mjs`、`canvas-input.test.mjs`、`receipt-envelope.test.mjs`、`retry-safety.test.mjs`（文件名可微调，但用例必须一一对应规格 §1 的 E1–E4）。
3. 文档：`spec.md` 新增第 12 节（并入本规格）、`CHANGELOG.md` 增加 `0.4.0` 条目、`README.md` 工具表更新。
4. `docs/acceptance/0.4.0.md`：逐条 AC 的结果（`PASS/FAIL/PARTIAL/NOT_RUN`）+ 证据（测试名、回执片段、命令输出）。
5. 包：`artifacts/<时间戳>/mouse-keyboard-plugin-0.4.0-dev.1.tgz` 及 SHA-256。

## 版本与发布

- 版本推到 `0.4.0-dev.1`；**不要** `git push`、**不要**发布到 GitHub 或 npm —— 发布需要用户单独授权。
- 允许在本机 profile 安装做真机自测，但安装前先把
  `C:\Users\HUAWEI\.dsh\profiles\desktop\node_modules\mouse-keyboard-plugin`
  备份为 `.bak-<日期>`；注意 `package.json` 里 `file:` tgz 路径与 pnpm-lock 的同步。
- 安装后必须重启 DeepSeek Harness 才生效；测试期间不要长时间占用用户桌面。

## 汇报格式

结束时先给一张表：`FR → 实现位置（文件:行）→ 对应 AC → 自测结果`，再把需要真机验收的条目单列（画布输入、settle 实际效果、region 截图、waitFor.pixel 实测）。真机项不要自评 `PASS`，留给验收人。

验收人（Lead）将按 `docs/acceptance/0.4.0-checklist.md` 逐条复核；不通过的条目会带证据打回，重跑对应 AC。
