/**
 * 页面冒烟测试：资料页能否渲染、弹窗能否初始化
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE } from './harness.mjs';

const { JSDOM } = await import(process.env.JSDOM_PATH || 'jsdom');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeChrome(store) {
  return {
    storage: { local: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o) } },
    runtime: { sendMessage: () => Promise.resolve({ ok: true }), openOptionsPage() {}, getURL: (p) => 'chrome-extension://x/' + p, lastError: null },
    tabs: { query: async () => [{ id: 1, url: 'https://job.example.com/apply' }], sendMessage: async () => ({ ok: true, matched: 5, units: 9 }), create() {} },
    scripting: { executeScript: async () => [] },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} }
  };
}

let fail = 0;
const check = (n, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) fail++; };

/* ---------- 资料编辑页 ---------- */
{
  const html = fs.readFileSync(path.join(root, 'src/options/options.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'chrome-extension://x/src/options/options.html', runScripts: 'outside-only' });
  const store = { profile: JSON.parse(JSON.stringify(PROFILE)) };
  dom.window.chrome = makeChrome(store);
  dom.window.confirm = () => true;
  dom.window.eval(fs.readFileSync(path.join(root, 'src/lib/schema.js'), 'utf8'));
  dom.window.eval(fs.readFileSync(path.join(root, 'src/options/options.js'), 'utf8'));
  await new Promise((r) => setTimeout(r, 60));

  const doc = dom.window.document;
  check('资料页渲染出分区', doc.querySelectorAll('.card[data-section]').length >= 7);
  check('渲染出姓名输入框', doc.querySelector('[data-key="name"]').value === PROFILE.name);
  check('渲染出学历下拉', doc.querySelector('[data-key="eduLevel"]').getAttribute('list') === 'dl-eduLevel');
  check('完成度进度条有值', doc.querySelector('#meterText').textContent !== '0% 完成');

  // 改一个值 → 自动保存
  const input = doc.querySelector('[data-key="phone"]');
  input.value = '13911112222';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 800));
  check('修改后自动保存到 storage', store.profile.phone === '13911112222');

  // 自定义字段
  doc.querySelector('#btnAddCustom').click();
  check('可以新增自定义字段', doc.querySelectorAll('.custom-row').length === 1);
}

/* ---------- 弹窗 ---------- */
{
  const html = fs.readFileSync(path.join(root, 'src/popup/popup.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'chrome-extension://x/src/popup/popup.html', runScripts: 'outside-only' });
  const store = { profile: JSON.parse(JSON.stringify(PROFILE)) };
  dom.window.chrome = makeChrome(store);
  dom.window.navigator.clipboard = { writeText: async () => {} };
  dom.window.eval(fs.readFileSync(path.join(root, 'src/lib/schema.js'), 'utf8'));
  dom.window.eval(fs.readFileSync(path.join(root, 'src/popup/popup.js'), 'utf8'));
  await new Promise((r) => setTimeout(r, 80));

  const doc = dom.window.document;
  check('弹窗显示域名', doc.querySelector('#pageHint').textContent.includes('job.example.com'));
  check('弹窗显示完成度', /%$/.test(doc.querySelector('#ringNum').textContent));
  check('填充按钮可用', !doc.querySelector('#btnFill').disabled);
  check('显示可填字段数', doc.querySelector('#matchedNum').textContent === '5');
}

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);
