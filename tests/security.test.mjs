// AC-REG-04: static proof that the 0.4.0 work introduced no clipboard paste, no
// script/CDP/network injection and no fifth tool. This reads the real sources; the
// only tolerance is documentation prose that names what is deliberately absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_SCHEMAS, KEYS } from '../lib/contracts.js';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
function walk(directory) {
  const files = [];
  for (const name of readdirSync(join(root, directory))) {
    const relative = join(directory, name);
    const stat = statSync(join(root, relative));
    if (stat.isSymbolicLink()) throw new Error('Do not follow source links: ' + relative);
    if (stat.isDirectory()) files.push(...walk(relative)); else files.push(relative);
  }
  return files;
}
const sources = [...walk('src'), ...walk('helper')];
const text = (file) => readFileSync(join(root, file), 'utf8');
const forbidden = [
  ['clipboard paste shortcut', /Ctrl\s*\+\s*V/i],
  ['clipboard API', /navigator\.clipboard|OpenClipboard|CloseClipboard|SetClipboardData|GetClipboardData|EmptyClipboard|Clipboard\.Set(Text|Image)|System\.Windows\.Forms\.Clipboard|pyperclip/i],
  ['script or CDP injection', /Runtime\.evaluate|Page\.navigate|Input\.dispatchKeyEvent|Debugger\.|chrome-devtools|remote-debugging|DevTools|WebSocket|puppeteer|playwright/i],
  ['network access', /WebClient|HttpClient|WebRequest|https?:\/\/|fetch\s*\(|XMLHttpRequest|net\.connect/i],
];

test('[AC-REG-04] the runtime sources contain no clipboard, script/CDP or network capability', () => {
  const hits = [];
  for (const file of sources) {
    const body = text(file);
    for (const [name, pattern] of forbidden) {
      const match = body.match(pattern);
      if (match) hits.push(`${file}: ${name} (${match[0]})`);
    }
  }
  assert.deepEqual(hits, []);
});

test('[AC-REG-04] exactly the four reviewed tools are registered and the key whitelist is unchanged', () => {
  assert.deepEqual(Object.keys(TOOL_SCHEMAS).sort(), ['mk_control', 'mk_keyboard', 'mk_mouse', 'mk_observe']);
  assert.deepEqual([...KEYS], ['Enter', 'Tab', 'Shift+Tab', 'Escape', 'Backspace', 'Delete', 'Left', 'Right', 'Up', 'Down', 'Home', 'End', 'PageUp', 'PageDown', 'Ctrl+A', 'Ctrl+S', 'Ctrl+Home', 'Ctrl+End']);
  // No application-launch, right-click, wheel or drag capability may appear.
  const launching = [];
  for (const file of sources) {
    const body = text(file);
    for (const pattern of [/CreateProcess|ShellExecute|Process\.Start\s*\(/, /MOUSEEVENTF_RIGHTDOWN|MOUSEEVENTF_RIGHTUP|MOUSEEVENTF_WHEEL|MOUSEEVENTF_HWHEEL|RI_MOUSE_RIGHT_BUTTON_DOWN/, /DragDetect|DoDragDrop|BeginDrag/]) {
      if (pattern.test(body)) launching.push(`${file}: ${pattern}`);
    }
  }
  assert.deepEqual(launching, []);
  // The only native file read is the bundled overlay path asset, which the review already covers.
  const reads = text('helper/Overlay.cs').match(/ReadAllText|ReadAllBytes|File\.Open/g) ?? [];
  assert.deepEqual(reads, ['ReadAllText']);
});

test('[AC-REG-04] savePath is still the only write path in the native helper', () => {
  const native = text('helper/Native.cs');
  // File.WriteAllBytes is the single write primitive; it must live in WritePng and nowhere else.
  const writes = native.match(/File\.WriteAll(Bytes|Text|AllLines)/g) ?? [];
  assert.deepEqual(writes, ['File.WriteAllBytes']);
  assert.match(native, /public static Dictionary<string,object> WritePng\(byte\[\] bytes,string path,int width,int height\)/);
  assert.match(native, /if\(File\.Exists\(full\)\)throw new Failure\("SAVE_EXISTS"/);
});
