/* popup.js —— 弹窗逻辑 */
const $ = (s) => document.querySelector(s);
let tab = null;
let profile = null;

function isFillablePage(url) {
  return /^https?:\/\//i.test(url || '');
}

async function sendToTab(msg) {
  if (!tab || !tab.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    // 扩展刚装好、或页面在扩展安装前就打开了：手动注入一次
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['src/lib/schema.js', 'src/content/content.js']
      });
      return await chrome.tabs.sendMessage(tab.id, msg);
    } catch (err) {
      return null;
    }
  }
}

function renderRing(pct) {
  const deg = Math.round((pct / 100) * 360);
  $('#ring').style.background = `conic-gradient(#ff5a36 ${deg}deg, #ffe9de ${deg}deg)`;
  $('#ringNum').textContent = pct + '%';
}

function missingRequired(p) {
  return RH.allFields()
    .filter((f) => f.required && !String(p[f.key] || '').trim())
    .map((f) => f.label);
}

async function init() {
  $('#ver').textContent = 'v' + (RH.version || '1.0.0');
  profile = await RH.getProfile();
  const pct = RH.completeness(profile);
  renderRing(pct);

  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = t;

  if (!isFillablePage(tab && tab.url)) {
    $('#pageHint').textContent = '当前页面不支持自动填充';
    $('#btnFill').disabled = true;
    $('#matchedNum').textContent = '–';
    $('#totalNum').textContent = '–';
    $('#tip').innerHTML = '请打开招聘网站的网申页面（<b>http/https</b>）后再试。浏览器内置页面、扩展商店等无法注入脚本。';
    return;
  }

  try {
    $('#pageHint').textContent = new URL(tab.url).hostname.replace(/^www\./, '');
  } catch (e) {
    $('#pageHint').textContent = '当前页面';
  }

  const s = await sendToTab({ type: 'RH_SCAN' });
  if (s && s.ok) {
    $('#matchedNum').textContent = s.matched;
    $('#totalNum').textContent = s.units;
    if (!s.units) {
      $('#tip').innerHTML = '这个页面没检测到表单输入框。如果是登录页或列表页，先进到<b>具体的网申填写页</b>再点填充。';
    }
  } else {
    $('#matchedNum').textContent = '0';
    $('#totalNum').textContent = '0';
    $('#tip').innerHTML = '页面脚本还没准备好，刷新一下页面再试，或直接点「一键填充」（会自动重试）。';
  }

  const miss = missingRequired(profile);
  if (miss.length) {
    $('#tip').innerHTML = '资料还差 <b>' + miss.length + '</b> 项必填：' + miss.join('、') +
      '。点「编辑我的资料」补全，填充会更完整。';
  }
}

$('#btnFill').addEventListener('click', async () => {
  const btn = $('#btnFill');
  btn.disabled = true;
  const label = btn.querySelector('strong');
  const old = label.textContent;
  label.textContent = '填充中…';

  const r = await sendToTab({ type: 'RH_FILL' });

  label.textContent = old;
  btn.disabled = false;

  if (!r) {
    $('#tip').innerHTML = '<span class="warn">无法连接页面脚本。</span> 请刷新页面后重试；如果是 PDF 或浏览器内置页面则不支持。';
    return;
  }
  if (r.ok === false) {
    $('#tip').innerHTML = '<span class="warn">填充失败：' + (r.error || '未知错误') + '</span>';
    return;
  }

  $('#fillNum').textContent = r.filled;
  $('#matchedNum').textContent = r.matched;
  $('#totalNum').textContent = r.total;

  let html = '<span class="toast-line">已填充 <b>' + r.filled + '</b> 项</span>';
  if (r.skipped) html += '，跳过 ' + r.skipped + ' 项已有内容';
  if (r.unmatched && r.unmatched.length) {
    html += '<br>没识别出来：' + r.unmatched.slice(0, 5).join('、') +
      '（可点「打开悬浮面板」→「复制」手动粘贴）';
  }
  $('#tip').innerHTML = html;
});

$('#btnPanel').addEventListener('click', async () => {
  const r = await sendToTab({ type: 'RH_TOGGLE_PANEL' });
  if (!r || !r.ok) {
    $('#tip').innerHTML = '<span class="warn">这个页面打不开面板。</span> 刷新页面后重试。';
    return;
  }
  window.close();
});

$('#btnCopyAll').addEventListener('click', async () => {
  const text = RH.toPlainText(profile);
  if (!text) {
    $('#tip').innerHTML = '资料还是空的，先点「编辑我的资料」填一下吧。';
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    $('#tip').innerHTML = '<span class="toast-line">已复制全部资料</span>，可以直接粘贴到任何表单或文档里。';
  } catch (e) {
    $('#tip').innerHTML = '<span class="warn">复制失败</span>，请点「编辑我的资料」里的一键复制。';
  }
});

$('#btnOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

$('#btnShortcut').addEventListener('click', () => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  $('#tip').innerHTML = '在任何网页按 <b>' + (isMac ? '⌘ + Shift + F' : 'Ctrl + Shift + F') +
    '</b> 即可填充。若被占用，可在 <b>chrome://extensions/shortcuts</b> 里改键。';
});

init();
