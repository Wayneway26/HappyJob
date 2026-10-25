/**
 * 测试脚手架：在 jsdom 里加载插件脚本，模拟真实页面。
 * 运行前需要 jsdom：JSDOM_PATH=/path/to/jsdom/lib/api.js node test/xxx.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { JSDOM } = await import(process.env.JSDOM_PATH || 'jsdom');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadPage(html, profile) {
  const dom = new JSDOM(html, {
    url: 'http://localhost/apply.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;

  // jsdom 的布局全是 0，这里假装元素都可见
  window.Element.prototype.getBoundingClientRect = function () {
    return { width: 220, height: 32, top: 0, left: 0, right: 220, bottom: 32, x: 0, y: 0, toJSON() {} };
  };

  const store = { profile };
  window.chrome = {
    storage: {
      local: {
        get: async (k) => (typeof k === 'string' ? { [k]: store[k] } : store),
        set: async (o) => Object.assign(store, o)
      }
    },
    runtime: {
      onMessage: { addListener() {} },
      sendMessage: () => Promise.resolve({ ok: true }),
      openOptionsPage() {},
      getURL: (p) => 'chrome-extension://test/' + p
    }
  };

  const run = (f) => window.eval(fs.readFileSync(path.join(root, f), 'utf8'));
  run('src/lib/schema.js');
  run('src/content/content.js');
  await new Promise((r) => setTimeout(r, 40));

  return {
    window,
    store,
    scan: () => window.__RH_DEBUG__.scan(),
    fill: (o) => window.__RH_DEBUG__.fill(o || {})
  };
}

export function readFields(window, scope) {
  const out = [];
  window.document.querySelectorAll((scope || 'body') + ' input, ' + (scope || 'body') + ' select, ' + (scope || 'body') + ' textarea').forEach((el) => {
    if (el.type === 'file' || el.type === 'hidden') return;
    if (el.type === 'radio' || el.type === 'checkbox') {
      if (el.checked) {
        const lab = el.closest('label');
        out.push({ name: el.name || el.id, value: lab ? lab.textContent.trim() : el.value });
      }
      return;
    }
    out.push({ name: el.name || el.id, value: el.value });
  });
  return out;
}

export const PROFILE = {
  name: '张三', gender: '男', birthday: '2003-05-18', nation: '汉族', political: '共青团员',
  marital: '未婚', idCard: '440101200305180011', phone: '13800138000', email: 'zhangsan@example.com',
  wechat: 'zs_wechat', qq: '123456789',
  hometown: '广东 汕头', province: '广东省', city: '深圳市', address: '南山区科技园 1 号',
  school: '深圳大学', college: '计算机与软件学院', major: '软件工程', eduLevel: '本科', degree: '学士',
  studyMode: '全日制', enrollDate: '2022-09', gradDate: '2026-06', gpa: '3.6 / 88', rank: '5/120',
  englishLevel: 'CET-6', englishScore: '535', computerLevel: '国家二级',
  intention: '后端开发工程师', expectedCity: '深圳', expectedSalary: '面议',
  availableDate: '2026-07', jobSource: '校园宣讲会', acceptAdjust: '是',
  expCompany: '腾讯科技', expPosition: '后端开发实习生', expStart: '2025-07', expEnd: '2025-10',
  expDesc: '负责招聘系统接口开发，QPS 提升 30%。',
  projName: '校园二手交易平台', projRole: '后端负责人', projStart: '2025-03', projEnd: '2025-06',
  projDesc: '基于 SpringBoot + MySQL，日活 2000+。',
  campus: '计算机协会技术部部长', awards: '2024 国家励志奖学金；蓝桥杯省一',
  skills: 'Java / Go / MySQL / Docker', selfEval: '学习能力强，能扛事，喜欢把问题挖到底。',
  portfolio: 'github.com/zhangsan', emergencyName: '张大山', emergencyPhone: '13900139000',
  custom: []
};
