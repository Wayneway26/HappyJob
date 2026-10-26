/**
 * 多段经历：教育经历 / 实习经历可以有多条，页面上有多段时按顺序填。
 */
import { loadPage, PROFILE } from './harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  → ' + detail : ''));
};

const twoBlocks = `<html><body>
  <fieldset>
    <label>公司名称</label><input name="company1" />
    <label>职位</label><input name="position1" />
    <label>工作内容</label><textarea name="desc1"></textarea>
  </fieldset>
  <fieldset>
    <label>公司名称</label><input name="company2" />
    <label>职位</label><input name="position2" />
    <label>工作内容</label><textarea name="desc2"></textarea>
  </fieldset>
</body></html>`;

// 1) 两段经历 → 按顺序填进两个区块
const p2 = Object.assign({}, PROFILE, {
  experiences: [
    { expCompany: '腾讯科技', expPosition: '后端开发实习生', expStart: '2025-07', expEnd: '2025-10', expDesc: '负责招聘系统接口开发' },
    { expCompany: '字节跳动', expPosition: '前端开发实习生', expStart: '2024-07', expEnd: '2024-09', expDesc: '负责活动页搭建' }
  ]
});
const page = await loadPage(twoBlocks, p2);
await sleep(60);
const r = page.fill({});
const v = (sel) => page.window.document.querySelector(sel).value;

check('填充数量为 6', r.filled === 6, 'filled=' + r.filled);
check('第一段公司', v('[name=company1]') === '腾讯科技', v('[name=company1]'));
check('第二段公司', v('[name=company2]') === '字节跳动', v('[name=company2]'));
check('第二段职位', v('[name=position2]') === '前端开发实习生', v('[name=position2]'));
check('第二段描述', v('[name=desc2]').indexOf('活动页') >= 0, v('[name=desc2]'));

// 2) 旧数据只有扁平字段 → 自动迁移成第一段
const legacy = Object.assign({}, PROFILE);
delete legacy.experiences;
delete legacy.educations;
const page2 = await loadPage(twoBlocks, legacy);
await sleep(60);
check('旧数据迁移出 1 段', page2.window.RH.getProfile === undefined ? false : true);
const migrated = await page2.window.RH.getProfile();
check('迁移后 experiences 长度 1', migrated.experiences.length === 1, 'len=' + migrated.experiences.length);
page2.fill({});
check('旧数据填第一段', page2.window.document.querySelector('[name=company1]').value === '腾讯科技');
check('旧数据不重复填第二段', page2.window.document.querySelector('[name=company2]').value === '');

// 3) 复制模式：两段都要能整段复制
const copyText = page2.window.RH.toPlainText(Object.assign({}, migrated, {
  experiences: p2.experiences
}));
check('纯文本含第 1 段标题', copyText.indexOf('【实习 / 工作经历 1】') >= 0);
check('纯文本含第 2 段标题', copyText.indexOf('【实习 / 工作经历 2】') >= 0);
check('纯文本含两家公司', copyText.indexOf('腾讯科技') >= 0 && copyText.indexOf('字节跳动') >= 0);

const failed = results.filter((x) => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过');
process.exit(failed.length ? 1 : 0);
