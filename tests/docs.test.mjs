// AC-DOC-01 / AC-DOC-02: the documented error table and tool parameters must match
// the code constants exactly. This parses the real documents; nothing is hard-coded here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ERROR_CODES, TOOL_SCHEMAS } from '../lib/contracts.js';

const spec = readFileSync(new URL('../spec.md', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');

function section(text, start, end) {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `missing section: ${start}`);
  const to = end === undefined ? text.length : text.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return text.slice(from, to);
}
const codes = (block) => [...block.matchAll(/^\|\s*`?([A-Z][A-Z_]{3,})`?\s*\|/gm)].map(m => m[1]);
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('[AC-DOC-01] the spec error table and the README error table list exactly the code constants', () => {
  assert.equal(ERROR_CODES.length, 19);
  const specCodes = codes(section(spec, '### 12.11', '### 12.12'));
  assert.deepEqual(specCodes, [...ERROR_CODES], 'spec.md 12.11 rows must equal ERROR_CODES in order');
  const readmeCodes = codes(section(readme, '错误码摘要', '模型侧警告'));
  assert.deepEqual(readmeCodes, [...ERROR_CODES], 'README error summary must equal ERROR_CODES in order');
  const unique = new Set(ERROR_CODES);
  assert.equal(unique.size, ERROR_CODES.length, 'there must be no duplicate or extra codes');
  for (const code of ['INVALID_COORDINATE', 'HELPER_TIMEOUT']) {
    assert.ok(!readmeCodes.includes(code), `${code} is a pre-existing code outside the FR-11 table`);
  }
});

test('[AC-DOC-02] every TOOL_SCHEMAS parameter name, enum value and required field is documented', () => {
  const newParams = ['settleMs', 'paceMs', 'inputMode', 'observe', 'region', 'savePath', 'waitFor', 'elementName', 'elementRole', 'elementExact'];
  const requiredParagraph = section(readme, '必填性与既有参数', '\n\n');
  for (const [tool, schema] of Object.entries(TOOL_SCHEMAS)) {
    assert.ok(readme.includes(tool), `README must name ${tool}`);
    const properties = Object.keys(schema.properties);
    for (const key of properties) {
      assert.match(readme, new RegExp('`' + escape(key) + '`'), `README must document ${tool}.${key}`);
    }
    const required = schema.required ?? [];
    assert.deepEqual([...required].sort(), properties.filter(key => required.includes(key)).sort());
    for (const key of required) {
      assert.match(requiredParagraph, new RegExp('`' + escape(key) + '`'), `README must state that ${tool}.${key} is required`);
    }
    for (const [key, property] of Object.entries(schema.properties)) {
      for (const value of property.enum ?? []) {
        assert.match(readme, new RegExp('(^|[^A-Za-z0-9_])' + escape(value) + '([^A-Za-z0-9_]|$)', 'm'), `README must document the enum value ${tool}.${key}=${value}`);
      }
    }
  }
  // New parameters are optional: none of them may be described as required.
  for (const key of newParams) {
    assert.doesNotMatch(requiredParagraph, new RegExp('`' + escape(key) + '`'), `${key} is optional and must not be listed as required`);
  }
  assert.ok(TOOL_SCHEMAS.mk_keyboard.properties.key.enum.includes('Ctrl+Home'));
  assert.match(readme, /Ctrl\+Home/, 'README must list the allowed key enum values');
});

test('[AC-DOC-02] the README tool table and spec section 12 agree on every new parameter', () => {
  const section12 = section(spec, '## 12.', undefined);
  const newParams = ['settleMs', 'paceMs', 'inputMode', 'observe', 'region', 'savePath', 'waitFor', 'elementName', 'elementRole', 'elementExact'];
  for (const key of newParams) {
    assert.match(section12, new RegExp('`' + escape(key) + '`'), `spec section 12 must define ${key}`);
    assert.match(readme, new RegExp('`' + escape(key) + '`'), `README must define ${key}`);
  }
  // The three locked reconciliations must be stated, not silently dropped.
  assert.match(section12, /inputPaceMs/);
  assert.match(section12, /ELEMENT_NOT_FOUND/);
  assert.match(section12, /mk_observe/);
});
