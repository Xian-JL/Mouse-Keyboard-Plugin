import {
  appSearchAliases
} from "./chunk-WEZG6JDV.js";
import {
  MkError,
  PROTOCOL,
  VERSION,
  diagnosticDetails,
  id,
  object
} from "./chunk-SR45QH7O.js";

// src/host/bridge.ts
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
var children = /* @__PURE__ */ new Set();
var ownedNativeChildren = () => [...children];
function processTransport() {
  const helper = fileURLToPath(new URL("../helper/bootstrap.ps1", import.meta.url));
  const executable = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (process.platform !== "win32" || process.arch !== "x64") throw new MkError("UNSUPPORTED_PLATFORM", "Windows x64 interactive desktop is required.");
  if (!existsSync(helper)) throw new MkError("HELPER_START_FAILED", "Bundled helper is missing.");
  const child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helper, "-ParentPid", String(process.pid)], { cwd: dirname(helper), windowsHide: true, stdio: ["pipe", "pipe", "pipe"], shell: false });
  if (child.pid) children.add(child.pid);
  child.stderr.on("data", () => {
  });
  let exited = false;
  const exits = /* @__PURE__ */ new Set();
  const exit = () => {
    if (exited) return;
    exited = true;
    if (child.pid) children.delete(child.pid);
    for (const fn of exits) fn();
  };
  child.on("error", exit);
  child.on("exit", exit);
  return { write: (value) => {
    if (exited || !child.stdin.writable) throw new MkError("PROTOCOL_ERROR", "Helper is not writable.");
    child.stdin.write(value);
  }, kill: () => {
    child.kill();
  }, onData: (fn) => {
    child.stdout.on("data", fn);
  }, onExit: (fn) => {
    exits.add(fn);
    if (exited) queueMicrotask(fn);
  } };
}
var HelperBridge = class {
  constructor(factory = processTransport) {
    this.factory = factory;
  }
  factory;
  transport;
  nonce = id();
  pending = /* @__PURE__ */ new Map();
  decoder = new StringDecoder("utf8");
  line = "";
  bytes = 0;
  dead = false;
  exitPromise;
  onStop;
  get started() {
    return this.transport !== void 0;
  }
  start() {
    if (this.dead) throw new MkError("HELPER_START_FAILED", "Bridge is disposed or faulty; no operation is replayed.");
    if (this.transport) return;
    const t = this.factory();
    this.transport = t;
    let exited = () => {
    };
    this.exitPromise = new Promise((resolve) => {
      exited = resolve;
    });
    t.onData((chunk) => this.data(chunk));
    t.onExit(() => {
      exited();
      this.broken(new MkError("INPUT_UNKNOWN", "Helper exited. Inspect the target before any new input.", "unknown"));
    });
  }
  broken(error) {
    if (this.dead) return;
    this.dead = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.detach();
      p.reject(p.method === "act" ? error : new MkError("PROTOCOL_ERROR", "Helper transport became unavailable."));
    }
    this.pending.clear();
    this.transport?.kill();
    this.onStop?.("HELPER_FAILED", "");
  }
  data(chunk) {
    if (this.dead) return;
    for (let start = 0; start < chunk.length; ) {
      const at = chunk.indexOf(10, start), end = at < 0 ? chunk.length : at;
      const piece = chunk.subarray(start, end);
      this.bytes += piece.length;
      if (this.bytes > 4 * 1024 * 1024) {
        this.broken(new MkError("PROTOCOL_ERROR", "Helper response exceeds the protocol budget."));
        return;
      }
      this.line += this.decoder.write(piece);
      if (at < 0) break;
      const line = this.line.replace(/\r$/, "");
      this.line = "";
      this.bytes = 0;
      try {
        this.message(JSON.parse(line));
      } catch {
        this.broken(new MkError("PROTOCOL_ERROR", "Malformed helper response."));
        return;
      }
      start = at + 1;
    }
  }
  message(raw) {
    const m = object(raw);
    if (m.protocol !== PROTOCOL || m.nonce !== this.nonce) throw new MkError("PROTOCOL_ERROR", "Protocol identity mismatch.");
    if (m.event === "stop") {
      if (typeof m.run !== "string" || typeof m.reason !== "string") throw new Error("bad stop");
      this.onStop?.(m.reason, m.run);
      return;
    }
    if (typeof m.id !== "string" || typeof m.run !== "string") throw new Error("missing identity");
    const p = this.pending.get(m.id);
    if (!p) return;
    if (m.run !== p.run) throw new Error("run mismatch");
    this.pending.delete(m.id);
    clearTimeout(p.timer);
    p.detach();
    if (m.ok === true) p.resolve(m.value);
    else {
      const e = object(m.error);
      const code = typeof e.code === "string" ? e.code : "PROTOCOL_ERROR";
      const execution = ["not_sent", "sent", "partially_sent", "unknown"].includes(String(e.execution)) ? e.execution : p.method === "act" ? "unknown" : "not_sent";
      try {
        p.reject(new MkError(code, "Windows helper rejected this operation; inspect the stage and error code before recovery.", execution, diagnosticDetails(e.details)));
      } catch (error) {
        p.reject(error);
        throw error;
      }
    }
  }
  request(method, params, run, signal, timeoutMs) {
    signal.throwIfAborted();
    this.start();
    const requestId = id();
    const line = JSON.stringify({ protocol: PROTOCOL, nonce: this.nonce, id: requestId, run, method, params }) + "\n";
    if (Buffer.byteLength(line) > 256 * 1024) throw new MkError("INVALID_ARGUMENT", "Helper request too large.");
    return new Promise((resolve, reject) => {
      const expire = (code) => {
        const p = this.pending.get(requestId);
        if (!p) return;
        this.pending.delete(requestId);
        clearTimeout(p.timer);
        p.detach();
        reject(new MkError(code, "Request stopped; input is never automatically replayed.", method === "act" ? "unknown" : "not_sent"));
        if (method !== "end") void this.request("end", {}, run, new AbortController().signal, 3e3).catch(() => this.broken(new MkError("CONTROL_CLOSE_FAILED", "Helper cleanup could not be confirmed.", "unknown")));
      };
      const abort = () => expire(signal.reason instanceof MkError ? signal.reason.code : "USER_STOPPED");
      const timer = setTimeout(() => expire("HELPER_TIMEOUT"), timeoutMs);
      const detach = () => signal.removeEventListener("abort", abort);
      this.pending.set(requestId, { resolve, reject, timer, detach, method, run });
      signal.addEventListener("abort", abort, { once: true });
      try {
        this.transport.write(line);
      } catch {
        expire("PROTOCOL_ERROR");
      }
    });
  }
  async dispose() {
    this.dead = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.detach();
      p.reject(new MkError("USER_STOPPED", "Plugin disposed.", "unknown"));
    }
    this.pending.clear();
    this.transport?.kill();
    this.transport = void 0;
    if (this.exitPromise) {
      let timer;
      try {
        await Promise.race([this.exitPromise, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new MkError("CONTROL_CLOSE_FAILED", "Owned helper process exit was not confirmed.")), 3e3);
        })]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  }
};
var WindowsBackend = class {
  constructor(factory = () => new HelperBridge()) {
    this.factory = factory;
  }
  factory;
  bridge;
  idle;
  inputAdmitted = false;
  onStop;
  get() {
    if (!this.bridge) {
      this.bridge = this.factory();
      this.bridge.onStop = (r, run) => this.onStop?.(r, run);
    }
    return this.bridge;
  }
  async begin(run, settings, signal) {
    if (this.idle) clearTimeout(this.idle);
    this.idle = void 0;
    const value = object(await this.get().request("begin", { settings }, run, signal, 3e4));
    if (value.inputReady !== true || value.protocol !== PROTOCOL || value.version !== VERSION) throw new MkError("HOST_CAPABILITY_MISSING", "Native handshake did not establish the required capabilities and matching version.");
  }
  async targets(run, query, signal) {
    return await this.get().request("targets", query === void 0 ? {} : { query, aliases: appSearchAliases(query) }, run, signal, 3e3);
  }
  async observe(run, window, signal) {
    return await this.get().request("observe", { window }, run, signal, 5500);
  }
  async act(run, window, observation, request, signal) {
    this.inputAdmitted = true;
    return await this.get().request("act", { window, observation: { fingerprint: observation.fingerprint }, request }, run, signal, 4e4);
  }
  async status(run) {
    if (!this.bridge) return { inputReady: false, overlayVisible: false, pendingInputs: 0 };
    const r = object(await this.bridge.request("status", {}, run, new AbortController().signal, 1200));
    if (typeof r.inputReady !== "boolean" || typeof r.overlayVisible !== "boolean" || !Number.isSafeInteger(r.pendingInputs)) throw new MkError("PROTOCOL_ERROR", "Invalid status response.");
    return r;
  }
  async end(run) {
    if (!this.bridge || !this.bridge.started) return;
    try {
      const r = object(await this.bridge.request("end", {}, run, new AbortController().signal, 3e3));
      if (r.inputReleased !== true || r.overlayVisible !== false || r.pendingInputs !== 0) throw new MkError("CONTROL_CLOSE_FAILED", "Native input release was not confirmed.", "unknown");
    } catch (error) {
      if (this.inputAdmitted) throw error;
      const old = this.bridge;
      old.onStop = void 0;
      await old.dispose();
      if (this.bridge === old) this.bridge = void 0;
      return;
    }
    this.inputAdmitted = false;
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      const old = this.bridge;
      this.bridge = void 0;
      if (old) {
        old.onStop = void 0;
        void old.dispose().catch(() => {
        });
      }
    }, 12e4);
    this.idle.unref();
  }
  async dispose() {
    if (this.idle) clearTimeout(this.idle);
    if (this.bridge) this.bridge.onStop = void 0;
    await this.bridge?.dispose();
    this.bridge = void 0;
  }
};

export {
  ownedNativeChildren,
  processTransport,
  HelperBridge,
  WindowsBackend
};
