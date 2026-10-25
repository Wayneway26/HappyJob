/**
 * background.js —— 快捷键、跨 frame 广播、首次安装引导
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

/** 把填充指令广播到当前标签页的所有 frame（主页面 + iframe 里的表单） */
async function fillActiveTab(extra) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return { ok: false, error: 'no-tab' };
  try {
    const res = await chrome.tabs.sendMessage(tab.id, Object.assign({ type: 'RH_FILL' }, extra || {}));
    return res || { ok: true };
  } catch (e) {
    return { ok: false, error: 'not-ready' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'RH_OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'RH_BROADCAST_FILL') {
    fillActiveTab({ framesOnly: true }).then(sendResponse);
    return true; // 异步
  }

  if (msg.type === 'RH_PROFILE_UPDATED') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((t) => {
        if (t.id) chrome.tabs.sendMessage(t.id, { type: 'RH_PROFILE_UPDATED' }).catch(() => {});
      });
    });
    sendResponse({ ok: true });
    return;
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'fill-form') return;
  const r = await fillActiveTab({});
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: r && r.filled ? '#059669' : '#94a3b8' });
    await chrome.action.setBadgeText({ tabId: tab.id, text: r && r.filled ? String(r.filled) : '0' });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(() => {}), 4000);
  } catch (e) {
    /* 某些页面不支持 badge，忽略 */
  }
});
