/**
 * UI 冒烟测试：悬浮球 → 打开面板 → 点一键填充 → 撤销
 */
import { loadPage, PROFILE } from './harness.mjs';

const html = `<!DOCTYPE html><html><body>
<form>
  <div class="fi"><label>姓名</label><input name="name" /></div>
  <div class="fi"><label>手机号</label><input name="phone" /></div>
  <div class="fi"><label>邮箱</label><input name="email" /></div>
  <div class="fi"><label>自我评价</label><textarea name="selfEval"></textarea></div>
</form></body></html>`;

const page = await loadPage(html, PROFILE);
const { window } = page;
const host = window.document.getElementById('rh-resume-helper-host');
let fail = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) fail++;
};

check('悬浮球已注入', !!host && !!host.shadowRoot);
const fab = host.shadowRoot.querySelector('.fab');
check('悬浮球存在', !!fab);
check('徽标已显示匹配数', host.shadowRoot.querySelector('.badge').textContent !== '0');

fab._toggle(true);
const panel = host.shadowRoot.querySelector('.panel');
check('面板已打开', !panel.classList.contains('hide'));

const fillBtn = panel.querySelector('[data-act="fill"]');
check('存在填充按钮', !!fillBtn);
fillBtn.click();
await new Promise((r) => setTimeout(r, 350));

check('姓名已填', window.document.querySelector('[name=name]').value === PROFILE.name);
check('手机号已填', window.document.querySelector('[name=phone]').value === PROFILE.phone);
check('邮箱已填', window.document.querySelector('[name=email]').value === PROFILE.email);
check('自我评价已填', window.document.querySelector('[name=selfEval]').value === PROFILE.selfEval);

// 切到复制标签
panel.querySelector('.tab[data-tab="copy"]').click();
const copyRows = panel.querySelectorAll('.cp');
check('复制标签渲染出条目', copyRows.length > 5);

// 再切回来撤销
panel.querySelector('.tab[data-tab="fill"]').click();
const undoBtn = panel.querySelector('[data-act="undo"]');
check('撤销按钮可用', undoBtn && !undoBtn.disabled);
if (undoBtn) {
  undoBtn.click();
  await new Promise((r) => setTimeout(r, 60));
  check('撤销后姓名清空', window.document.querySelector('[name=name]').value === '');
}

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);
