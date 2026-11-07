// Development-only helper rebuild: kill any running packaged Helper, then prove that the
// current C# sources compile and complete a real begin/end handshake immediately, instead
// of waiting for the 120 s idle recycle. Never shipped: scripts/ is excluded from the
// runtime package, and this file opens no window, reads no file and injects no input.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULTS } from '../lib/contracts.js';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const bootstrap = join(root, 'helper', 'bootstrap.ps1');
const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const dry = args.includes('--dry-run');
/** Run a PowerShell script without shell-quoting problems. */
async function powershellScript(script, timeout = 30000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, timeout, maxBuffer: 256 * 1024 });
  return stdout.trim();
}
const listScript = "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*bootstrap.ps1*' } | Select-Object -Property ProcessId,ParentProcessId | ConvertTo-Json -Compress";
async function helperPids() {
  try {
    const raw = await powershellScript(listScript, 20000);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : [parsed]).map(v => Number(v.ProcessId)).filter(Number.isSafeInteger).sort((a, b) => a - b);
  } catch { return []; }
}
async function killAll(pids) {
  if (!pids.length) return;
  await powershellScript(`Stop-Process -Id ${pids.join(',')} -Force -ErrorAction SilentlyContinue`, 20000);
}
/** A real protocol session against the freshly compiled Helper. */
async function handshake(timeoutMs = 60000) {
  const started = Date.now();
  const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', bootstrap, '-ParentPid', String(process.pid)], { cwd: join(root, 'helper'), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const nonce = randomUUID(), runId = randomUUID();
  let buffer = '', stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString('utf8').slice(0, 512); });
  const send = (method, params) => child.stdin.write(JSON.stringify({ protocol: 1, nonce, id: randomUUID(), run: runId, method, params }) + '\n');
  const next = (predicate) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Helper handshake timed out within ' + timeoutMs + ' ms.')); }, timeoutMs);
    const onData = chunk => { buffer += chunk.toString('utf8'); for (;;) { const at = buffer.indexOf('\n'); if (at < 0) break; const line = buffer.slice(0, at).trim(); buffer = buffer.slice(at + 1); if (!line) continue; let value; try { value = JSON.parse(line); } catch { continue; } if (predicate(value)) { cleanup(); resolve(value); return; } } };
    const onExit = () => { cleanup(); reject(new Error('Helper exited during the handshake.')); };
    const cleanup = () => { clearTimeout(timer); child.stdout.off('data', onData); child.off('exit', onExit); };
    child.stdout.on('data', onData); child.on('exit', onExit);
  });
  try {
    send('begin', { settings: { ...DEFAULTS } });
    const begin = await next(v => v && v.ok === true && v.value && v.value.inputReady === true);
    const beginMs = Date.now() - started;
    send('end', {});
    const end = await next(v => v && v.ok === true && v.value && v.value.inputReleased === true && v.value.pendingInputs === 0);
    return { pid: child.pid, beginMs, endMs: Date.now() - started, protocol: begin.value.protocol, version: begin.value.version, overlayHidden: end.value.overlayVisible === false, stderr: stderr.trim().slice(0, 256) };
  } finally { try { child.stdin.end(); } catch {} if (!keep) { try { child.kill(); } catch {} } }
}
try {
  const before = await helperPids();
  if (!dry) {
    await killAll(before);
    // Wait for the killed processes to disappear so the global single-run mutex is free
    // before the fresh Helper compiles and begins.
    for (let attempt = 0; attempt < 40; attempt++) { if (!(await helperPids()).length) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const after = dry ? before : await helperPids();
  const receipt = { ok: false, mode: 'development-helper-rebuild', dryRun: dry, killedPids: before.filter(pid => !after.includes(pid)), remainingPids: after, helperPidsChanged: before.join(',') !== after.join(','), inputSent: false, desktopObserved: false, filesRead: false };
  if (!dry) {
    const session = await handshake();
    receipt.session = session;
    receipt.helperPidsChanged = receipt.killedPids.length > 0 || before.join(',') !== after.join(',');
    receipt.ok = session.version !== undefined && session.beginMs > 0;
    receipt.note = 'A fresh Helper compiled the current C# sources and completed begin/end immediately; no 120 s idle recycle was needed.';
  } else {
    receipt.ok = true;
    receipt.note = 'Dry run only: listed helper PIDs, killed and started nothing.';
  }
  console.log(JSON.stringify(receipt));
  if (!receipt.ok) process.exitCode = 1;
} catch (error) {
  console.error('MK_DEV_REBUILD_FAILED: ' + (error?.message ?? String(error)));
  process.exitCode = 1;
}
