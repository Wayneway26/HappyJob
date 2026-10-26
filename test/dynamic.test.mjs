/**
 * 动态渲染的表单：页面上原本没有控件，点「下一步」才插入时，悬浮球应该自己出现。
 */
import { loadPage, PROFILE } from './harness.mjs';

const html = '<html><body><h1>第一步：选择岗位</h1><div id="step1">请选择你要投递的岗位</div></body></html>';
const page = await loadPage(html, PROFILE);
const { window } = page;
const doc = window.document;

const shadow = () => doc.getElementById('rh-resume-helper-host').shadowRoot;
const fab = () => shadow().querySelector('.fab');
const badge = () => shadow().querySelector('.badge');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  → ' + detail : ''));
};

await sleep(120);
check('无表单时悬浮球隐藏', fab().style.display === 'none', 'display=' + JSON.stringify(fab().style.display));
check('无表单时徽标为 0', page.scan().matched.length === 0);

// 模拟「下一步」渲染出第二步表单
const form = doc.createElement('form');
form.innerHTML =
  '<div class="fi"><label for="n">姓名</label><input id="n" name="name"></div>' +
  '<div class="fi"><label for="p">手机号码</label><input id="p" name="mobile"></div>' +
  '<div class="fi"><label for="s">毕业院校</label><input id="s" name="school"></div>';
doc.getElementById('step1').appendChild(form);

await sleep(1000);

check('插入表单后徽标更新', Number(badge().textContent) === 3, 'badge=' + badge().textContent);
check('插入表单后悬浮球出现', fab().style.display === 'flex', 'display=' + JSON.stringify(fab().style.display));

// 只改文字、不动控件，不应该触发重扫（徽标保持 3）
doc.getElementById('step1').appendChild(doc.createElement('p')).textContent = '共 3 个字段';
await sleep(800);
check('纯文本变化不干扰计数', Number(badge().textContent) === 3, 'badge=' + badge().textContent);

// 新增控件应该再次更新
const extra = doc.createElement('input');
extra.name = 'email';
extra.setAttribute('aria-label', '电子邮箱');
doc.querySelector('form').appendChild(extra);
await sleep(1000);
check('再次新增控件仍能识别', Number(badge().textContent) === 4, 'badge=' + badge().textContent);

const failed = results.filter((r) => !r.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过');
process.exit(failed.length ? 1 : 0);
