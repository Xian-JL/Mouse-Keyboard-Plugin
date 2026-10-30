import {
  MkError
} from "./chunk-SR45QH7O.js";

// src/host/authority.ts
import { createHash } from "node:crypto";
var continuation = /^(?:请\s*)?(?:继续|恢复|继续操作|恢复操作|继续(?:之前|上次|上一轮|刚才|原来|原有|上一)?的?(?:验收|测试|任务|操作|电脑操作)|继续上一任务|可以继续(?:使用|操作|控制)?(?:电脑)?|恢复(?:电脑|桌面)(?:操作|控制)|解除急停|continue|resume)[。.!！\s]*$/iu;
function desktopTaskText(text) {
  if (!text.trim()) return false;
  return !/(?:不要|不许|禁止|请勿|别再|别|无需|不需要|不用|不)(?:再|自动)?(?:使用|控制|操控|操作)(?:我的|这台|当前|任何|你的)?(?:电脑|计算机|桌面|鼠标|键盘)|(?:不要|不许|禁止|请勿|不用)\s*computer\s*use|(?:do not|don't|never)\s+(?:use|control|operate)\s+(?:(?:my|the)\s+)?(?:computer|desktop|mouse|keyboard)/iu.test(text);
}
function humanMessage(event) {
  if (event.type !== "user/message" || event.surfaceOp !== "append") return false;
  const d = event.data, source = d?.source;
  return source?.kind === "user" && Array.isArray(d?.content) && d.content.some((v) => typeof v === "object" && v !== null && v.type === "text" && typeof v.text === "string" && String(v.text).trim().length > 0);
}
var HumanAuthority = class {
  tasks = /* @__PURE__ */ new WeakMap();
  resumes = /* @__PURE__ */ new WeakMap();
  sequences = /* @__PURE__ */ new WeakMap();
  stopped = /* @__PURE__ */ new WeakSet();
  accept(session, event) {
    if (!humanMessage(event)) return false;
    const seq = event.seq;
    if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0 || seq <= (this.sequences.get(session) ?? -1)) return false;
    const d = event.data;
    let text = d.content.filter((c) => c.type === "text").map((c) => String(c.text)).join("\n").slice(0, 64e3);
    const continuing = continuation.test(text.trim()), previous = this.tasks.get(session) ?? this.resumes.get(session);
    const hasContext = !continuing || !!previous;
    if (continuing && previous) text = previous.text;
    if (continuing && previous) this.stopped.delete(session);
    this.resumes.delete(session);
    this.sequences.set(session, seq);
    this.tasks.set(session, { key: createHash("sha256").update(String(seq)).digest("hex"), text, allowed: hasContext && desktopTaskText(text) });
    return true;
  }
  canControl(session) {
    return this.tasks.get(session)?.allowed === true && !this.stopped.has(session);
  }
  task(scope) {
    const t = this.tasks.get(scope.session);
    if (this.stopped.has(scope.session)) throw new MkError("USER_STOPPED", "Physical stop requires a real human continuation.");
    if (!t || !t.allowed) throw new MkError("NOT_AUTHORIZED", "A current human task is required and explicit desktop restrictions are respected.", "not_sent", { stage: "authorization", requiredAction: "request-human-task" });
    return t.key;
  }
  async authorize(scope, window, signal) {
    this.task(scope);
    signal.throwIfAborted();
    if (window.blocked) throw new MkError(window.blocked, "This window is blocked by the runtime.");
  }
  stop(scope, task) {
    const t = this.tasks.get(scope.session);
    if (t && (task === void 0 || t.key === task)) this.stopped.add(scope.session);
  }
  finishTask(session) {
    const t = this.tasks.get(session);
    if (t) this.resumes.set(session, t);
    this.tasks.delete(session);
  }
  forget(session) {
    this.tasks.delete(session);
    this.resumes.delete(session);
    this.sequences.delete(session);
    this.stopped.delete(session);
  }
};

export {
  desktopTaskText,
  humanMessage,
  HumanAuthority
};
