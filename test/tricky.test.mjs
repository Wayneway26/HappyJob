/**
 * 干扰项测试：验证「公司名称」「验证码」「紧急联系人」这些不会被乱填。
 */
import { loadPage, readFields, PROFILE } from './harness.mjs';

const html = `<!DOCTYPE html><html><body>
<form id="f">
  <div class="login">
    <input name="username" placeholder="用户名" />
    <input type="password" name="pwd" placeholder="密码" />
    <button type="button">登录</button>
  </div>

  <div class="fi"><label>公司名称</label><input name="companyName" /></div>
  <div class="fi"><label>学校名称</label><input name="schoolName" /></div>
  <div class="fi"><label>项目名称</label><input name="projectName" /></div>
  <div class="fi"><label>紧急联系人姓名</label><input name="emName" /></div>
  <div class="fi"><label>短信验证码</label><input name="smsCode" /></div>
  <div class="fi"><label>邮政编码</label><input name="zip" /></div>
  <div class="fi"><label>招聘信息来源</label><input name="source" /></div>
  <div class="fi"><label>期望工作城市</label><input name="expectCity" /></div>
  <div class="fi"><label>所学专业</label><input name="major" /></div>
  <div class="fi"><label>专业排名</label><input name="rank" /></div>
  <div class="fi"><label>英语四级成绩</label><input name="cet4" /></div>
  <div class="fi"><label>英语水平</label><input name="engLevel" /></div>

  <div class="row">
    <input name="a1" placeholder="请输入姓名" />
    <input name="a2" placeholder="请输入手机号" />
    <input name="a3" placeholder="请输入邮箱" />
  </div>

  <div class="fi"><label>姓名</label><input name="nameFilled" value="李四" /></div>
  <input name="kw" placeholder="搜索职位" />
  <input type="file" name="cv" />
</form>
</body></html>`;

const EXPECT = {
  username: '',
  pwd: '',
  companyName: PROFILE.expCompany,
  schoolName: PROFILE.school,
  projectName: PROFILE.projName,
  emName: PROFILE.emergencyName,
  smsCode: '',
  zip: '',
  source: PROFILE.jobSource,
  expectCity: '深圳',
  major: PROFILE.major,
  rank: PROFILE.rank,
  cet4: PROFILE.englishScore,
  engLevel: PROFILE.englishLevel,
  a1: PROFILE.name,
  a2: PROFILE.phone,
  a3: PROFILE.email,
  nameFilled: '李四',
  kw: ''
};

const page = await loadPage(html, PROFILE);
const result = page.fill({});
await new Promise((r) => setTimeout(r, 60));
const fields = readFields(page.window, '#f');
const map = Object.fromEntries(fields.map((f) => [f.name, f.value]));

let fail = 0;
console.log('=== 干扰项测试 ===');
Object.entries(EXPECT).forEach(([k, want]) => {
  const got = map[k] === undefined ? '(未检测到)' : map[k];
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${k.padEnd(12)} 期望「${want}」 实际「${got}」`);
});

console.log(`\n填充 ${result.filled} 项，跳过 ${result.skipped} 项，检测 ${result.total} 个控件`);
console.log(fail ? `\n${fail} 项不符合预期` : '\n全部通过');
process.exit(fail ? 1 : 0);
