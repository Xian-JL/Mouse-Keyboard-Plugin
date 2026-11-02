import {
  MkError
} from "./chunk-IZ6KISJG.js";

// src/host/authority.ts
import { createHash } from "node:crypto";
var continuation = /^(?:请\s*)?(?:继续|恢复|继续操作|恢复操作|继续(?:之前|上次|上一轮|刚才|原来|原有|上一)?的?(?:验收|测试|任务|操作|电脑操作)|继续上一任务|可以继续(?:使用|操作|控制)?(?:电脑)?|恢复(?:电脑|桌面)(?:操作|控制)|解除急停|continue|resume)[。.!！\s]*$/iu;
var desktopGrant = /^(?:请\s*)?(?:(?:现在|重新|再次)?(?:允许|可以|授权)(?:你|模型)?(?:再次|重新|继续)?(?:使用|控制|操控|操作|接管)(?:我的|这台|当前)?(?:电脑|计算机|桌面|鼠标|键盘)|(?:继续|恢复)(?:使用|控制|操控|操作)?(?:我的)?(?:电脑|桌面)(?:操作|控制)?|(?:allow|permit)\s+(?:desktop|computer)\s+(?:use|control)|(?:resume|continue)\s+(?:computer|desktop)\s+(?:use|control))[。.!！\s]*$/iu;
function desktopTaskText(text) {
  if (!text.trim()) return false;
  return !/(?:不要|不许|禁止|请勿|别|无需|不需要|不用|不)(?:再|自动|擅自|自行|继续|直接)?\s*(?:使用|控制|操控|操作|动|触碰|接管|访问)\s*(?:我的|这台|当前|任何|你的)?\s*(?:电脑|计算机|桌面|鼠标|键盘)|(?:不要|不许|禁止|请勿|别|无需|不需要|不用|不)(?:再|自动|擅自|自行|继续|直接)?\s*(?:进行|执行|使用)?\s*(?:电脑|计算机|桌面|键鼠)\s*(?:交互|操作|控制)|(?:不要|不许|禁止|请勿|不用)\s*computer\s*use|(?:do not|don't|never)\s+(?:use|control|operate|touch|interact\s+with|take\s+over)\s+(?:(?:my|the|this|any)\s+)?(?:computer|desktop|mouse|keyboard)/iu.test(text);
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
  prohibited = /* @__PURE__ */ new WeakSet();
  accept(session, event) {
    if (!humanMessage(event)) return false;
    const seq = event.seq;
    if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0 || seq <= (this.sequences.get(session) ?? -1)) return false;
    const d = event.data;
    let text = d.content.filter((c) => c.type === "text").map((c) => String(c.text)).join("\n");
    const grant = desktopGrant.test(text.trim()), continuing = continuation.test(text.trim()) || grant, previous = this.tasks.get(session) ?? this.resumes.get(session);
    if (!desktopTaskText(text) || text.length > 64e3) this.prohibited.add(session);
    if (grant) this.prohibited.delete(session);
    const hasContext = !continuing || !!previous;
    if (continuing && previous && !grant) text = previous.text;
    if ((continuing && previous || grant) && !this.prohibited.has(session)) this.stopped.delete(session);
    this.resumes.delete(session);
    this.sequences.set(session, seq);
    this.tasks.set(session, { key: createHash("sha256").update(String(seq)).digest("hex"), text: text.slice(0, 64e3), allowed: (hasContext || grant) && !this.prohibited.has(session) });
    return true;
  }
  canControl(session) {
    return this.tasks.get(session)?.allowed === true && !this.stopped.has(session) && !this.prohibited.has(session);
  }
  task(scope) {
    const t = this.tasks.get(scope.session);
    if (this.stopped.has(scope.session)) throw new MkError("USER_STOPPED", "Physical stop requires a real human continuation.");
    if (!t || !t.allowed || this.prohibited.has(scope.session)) throw new MkError("NOT_AUTHORIZED", "A current human task is required; a desktop prohibition persists until the human explicitly permits desktop use.", "not_sent", { stage: "authorization", requiredAction: this.prohibited.has(scope.session) ? "request-human-desktop-permission" : "request-human-task" });
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
    this.prohibited.delete(session);
  }
};

export {
  desktopTaskText,
  humanMessage,
  HumanAuthority
};
