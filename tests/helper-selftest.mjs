// Shared, cached execution of the real native helper self-test (compiles helper/*.cs and
// runs Native.SelfTest in-process). Never parses the C# sources: the counters come out of
// executing the mapping code. desktopObserved/inputSent must stay false.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

let cached;
export function helperSelfTest() {
  if (!cached) cached = run();
  return cached;
}
async function run() {
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout, stderr } = await promisify(execFile)(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('../helper/bootstrap.ps1', import.meta.url)), '-ParentPid', String(process.pid), '-CompileOnly'], { windowsHide: true, timeout: 120000, maxBuffer: 256 * 1024 });
  if (stderr.trim()) throw new Error(stderr.trim().slice(0, 512));
  return JSON.parse(stdout.trim());
}
