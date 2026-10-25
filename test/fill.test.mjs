/**
 * 主流程测试：用插件自带的 demo/form.html 跑一遍完整填充。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPage, readFields, PROFILE } from './harness.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'demo/form.html'), 'utf8');

const page = await loadPage(html, PROFILE);
const result = page.fill({});
await new Promise((r) => setTimeout(r, 60));

const rows = readFields(page.window, '#applyForm');
const empty = rows.filter((r) => !r.value);

console.log('=== 填充统计 ===');
console.log(`filled=${result.filled} skipped=${result.skipped} total=${result.total} matched=${result.matched}`);
console.log('\n=== 字段结果 ===');
rows.forEach((r) => console.log(`${r.value ? '✓' : '—'} ${r.name.padEnd(16)} ${String(r.value).replace(/\n/g, ' / ').slice(0, 60)}`));
console.log('\n=== 仍为空 ===');
console.log(empty.length ? empty.map((r) => r.name).join(', ') : '（无）');
console.log('\n=== 未识别（页面字段） ===');
console.log((result.unmatched || []).join(' | ') || '（无）');

const ok = result.filled === 28 && empty.length === 0;
console.log(ok ? '\n全部通过' : `\n预期填充 28 项，实际 ${result.filled} 项`);
process.exit(ok ? 0 : 1);
