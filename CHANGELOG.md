# Changelog

## 0.5.1 — 2026-11-18

Bound natural pointer plans by distance/sampled speed and a 600–1600ms movement budget; use 40–90 points for ordinary paths instead of unbounded 8px densification. Execute against absolute deadlines, skip overdue intermediate frames, and throttle expensive window and pointer-paint work while retaining per-frame stop/desktop/foreground checks and full final click validation.

Replace symmetric typing gaps with lognormal short intervals, 3–8-character bursts, bounded cluster/rare long pauses and punctuation/space/uppercase context. Keep exact text, explicit off/maxSpeed, cancellation, input ownership and injection markers. Fixed-seed/inert-sink statistics are separate from physical acceptance; 0.5.1 desktop metrics remain to be measured.

## 0.5.0 — 2026-11-18

Add cancellable natural/slow action pacing (default natural), layout-aware ASCII virtual-key input on all controls, per-character schedules, curved pointer movement, hover and 60–120ms click holds. Keep explicit Unicode mode and deterministic off/paceMs=0.

Track and release only owned input across separated events; preserve physical Esc, user arbitration, snapshot checks and retry safety. Reject over-budget slow text before sending input; report dwell/input timing separately from settledMs. Add planner/virtual-sink regression and package validation for the new native component. Physical before/after hook measurements are not claimed by automated checks.


## 0.4.1 — 2026-11-07

Release of the verification-driven corrections first shipped as 0.4.0-dev.2, plus the acceptance-procedure amendments agreed during real-desktop review. No contract, tool or default-setting change relative to 0.4.0-dev.2: `type` revalidates later chunks on identity/owning-window/foreground/enabled-visible/editable/password only (first chunk and every `key` keep the full comparison), a coordinate click inside an observed `ControlType.Image` compares only the 12 DIP neighbourhood with up to three samples about 60 ms apart, `targets` keeps tokens for windows that still exist, a failed post-action observation retries once and names the underlying code, and DWM-cloaked windows stay out of discovery. Terminal emulators still report `verification=mismatch` because their hidden textarea is a transient buffer; judge them by `execution`/`sentCodePoints` and the screenshot.

Acceptance state. `npm run verify` 107/107, `check:helper` 31 assertions and `check:package` pass. The Lead re-verification (`docs/acceptance/0.4.0-lead-verification.md`) confirms F5 (a 96-code-point command lands as one `sent` receipt and executes) and F2 (a second `targets` call no longer invalidates earlier tokens). Canvas input was exercised end to end on the real course page — typing, Enter, four consecutive commands and a coordinate click, all `sent` — but only after the operator focused the canvas once: noVNC exposes its canvas as `ControlType.Image` only once the frame receives focus, so the first programmatic click still falls back to the whole-capture comparison. That enumeration gap and the F1 repainting-window policy remain open for 0.4.2. AC-WAIT-03, AC-WAIT-05 and AC-RCPT-08 are still NOT_RUN; their procedures were amended on 2026-11-07 (1-minute screenshot sweep, 30-second pixel sampling, and one click followed by a 60-second wait respectively).

## 0.4.0-dev.2 — 2026-11-07

Verification-driven corrections. The Lead verification of 0.4.0-dev.1 rejected that build: a long `type` stopped at 64 code points because the per-chunk focus revalidation compared the observed element rect, which our own input moves, and canvas clicks were rejected by the whole-capture pixel comparison because the canvas repaints itself. `type` now revalidates each later chunk on identity, owning window, foreground, enabled/visible, editable and password only; the first chunk and every `key` action keep the full comparison, and text/selection expectations still come from the snapshot. A coordinate click whose point falls inside an observed `ControlType.Image` element now compares only the 12 DIP neighbourhood around the point, with a bounded retry of at most 3 samples about 60 ms apart to absorb canvas cursor blink; non-canvas coordinate clicks still compare the whole capture, and every identity, geometry, foreground and occlusion check is unchanged.

Reference and receipt fixes. `mk_observe targets` now keeps the same token for windows that are still present (same hwnd, pid and creation time), drops tokens for absent windows, and leaves an already returned snapshot valid and single-use, so refreshing the target list no longer requires re-beginning. A failed post-action observation retries once after about 150 ms, and a still-failing `observationError.message` names the underlying code; execution facts are unchanged and no input is replayed. DWM-cloaked windows are excluded from target discovery and treated as gone during revalidation.

Terminal documentation and scope. On terminal emulators such as the xterm.js hidden textarea, `verification` compares against a transient buffer, so `mismatch` means "not comparable" rather than "input failed"; judge by execution/sentCodePoints and the screenshot. 0.4.0-dev.1 was rejected by the Lead verification, and real-desktop re-acceptance for AC-INPUT-03/04/07, AC-WAIT-05 and AC-RCPT-08 is still pending for this build. No clipboard or Ctrl+V, no script/CDP/network injection, no new tool, savePath remains the only write; the Esc latch, human-task authority, single-run mutex, password/DSH-own/secure-desktop/higher-integrity rejections and existing default settings are unchanged.

## 0.4.0-dev.1 — 2026-11-07

Input delivery and retry safety (FR-01–FR-05). `mk_keyboard` type accepts optional `settleMs` (0–5000, default 0), `paceMs` (0–50, default 0) and `inputMode` (`auto`/`unicode`/`scancode`). A type now confirms delivery against `GetLastInputInfo` with a 300 ms cap and reports `deliveredAt`/`settledMs`; a readable editor is only reported `verified` after two identical samples at least 120 ms apart. `auto` sends unicode to editable controls and physical scancodes to non-editable ones (VkKeyScanW mapping, owned Shift press/release, Ctrl/Alt mappings refused, the whole text planned before anything is sent). The editable gate is removed and always on without a new setting, while password, DSH-own, Helper, secure-desktop, higher-integrity, focus, geometry, snapshot and multiline rejections are unchanged. Every receipt now carries `observation` (object or null) plus `observationError`, and `retryable`/`requiredAction` separate "not sent and transient" from "already sent": a post-send validation failure is never `not_sent` and never retryable. The two native patches previously present only in the installed copy — `VkKeyScanW` scancode injection in `helper/Native.cs` and removal of the `editable` gate in `helper/Server.cs` — are reflowed into this repository so a rebuild keeps the capability the installed copy already had.

Observation (FR-06–FR-09). `mk_observe window` accepts `waitFor` with `text`, `element` and `pixel` (stable/changed) kinds at a 150 ms poll; a timeout returns the last observation with `OBSERVATION_TIMEOUT` instead of a protocol error. A canvas has no text channel, so `kind:text` only times out there; use `kind:pixel`. `mk_mouse` can locate by `elementName`/`elementRole`/`elementExact` (mutually exclusive with `element` and `x`/`y`) and reports `ELEMENT_NOT_FOUND` or `AMBIGUOUS_TARGET` with at most 8 bounded candidates. `observe: full|compact|none` trims the post-action observation (compact keeps the focus plus at most 20 others with an honest delivered count) while `savePath` still writes the full PNG. `region` saves the selected area of the captured image at original resolution; on `mk_observe` it also crops the returned image and shifts `captureRect` so coordinate mapping stays correct, and on actions it only crops the saved file.

Engineering (FR-10–FR-12). A dev-only `scripts/dev-helper-rebuild.mjs` restarts the Helper so C# changes apply without waiting for natural recycling; it is never shipped. The new spec section 12 publishes the 19-code table with sent/retryable/next-step values derived from the frozen internal interface, and four regression files map to E1–E4: settle delivery, canvas/scancode input, receipt envelope and retry safety. Automated checks do not substitute for real-desktop acceptance.

Scope guarantees. No clipboard or Ctrl+V, no script, CDP or network injection, no new tool; `savePath` remains the only write path. The physical-Esc latch, human-task authority, single-run mutex, password, DSH-own, secure-desktop and higher-integrity rejections and all existing default settings are unchanged. Real-desktop acceptance is NOT_RUN for this build.

## 0.3.2-dev.0 — 2026-11-05

Optional evidence files. mk_observe window, mk_mouse and mk_keyboard accept `savePath`: an absolute .png path inside an existing directory receives the full-resolution capture. Names are never overwritten (SAVE_EXISTS), saving happens only after identity, focus, geometry and snapshot revalidation, and the observation reports `saved` with path, width, height and bytes. Text-only model routes can still save evidence because the file path is independent of image delivery.

No new tool, no file reads or listings, no change to authority, arbitration, snapshot or input semantics.

## 0.3.1 — 2026-11-02

Fatal input/cleanup error receipts now close control while retaining execution facts. Malformed helper responses reject pending requests, and pipe errors fail through the controlled transport path.

Configuration remounts preserve the live human task, sequence watermark, explicit desktop prohibition and physical-Esc latch. Agent disposal no longer erases session authority. A desktop prohibition requires explicit human permission to clear.

Observation is focus-first with compact/expanded bounded text projections. Private verification evidence stays separate. Text-only model routes skip PNG encoding/transfer while retaining internal visual checks. Slow reads report phase-specific observation timeouts; bounded text retrieval and conservative multiline evidence improve compatibility.

Diagnostics retain receipt failures without logging desktop contents. Windows CI covers Node 22.19/24, hidden UIA, offscreen rendering, installable package inspection and unpacked SDK loading on DSH 0.2.1-rc.3/rc.5. Real application input, physical stop latency and mixed-monitor DPI still require separate desktop acceptance.

## 0.3.0 — 2026-10-30

Promoted the user-accepted 0.2.0-dev.1 implementation without functional changes.

Models can choose desktop interaction for an ordinary user task. Window observation restores minimized targets and brings them to the foreground. The plugin retains four tools, physical Esc stop, cooperative input arbitration, UIA evidence and a blue cursor with a DeepSeek activity badge.

The release includes prebuilt runtime files and an installable tarball. Development caches, local environment records and credentials are excluded from the GitHub repository and runtime package.

Acceptance is based on the user's explicit confirmation, runtime-source equivalence and fresh automated checks. Unmeasured full-matrix scenarios are not reported as tested.
