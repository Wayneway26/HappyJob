/* options.js —— 资料编辑页 */
let profile = null;
let saveTimer = null;

const $ = (s) => document.querySelector(s);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ---------------- 渲染 ---------------- */

function fieldHTML(f) {
  const v = profile[f.key] == null ? '' : String(profile[f.key]);
  const wide = f.type === 'textarea' ? ' wide' : '';
  const req = f.required ? '<span class="req">*</span>' : '';
  let control = '';

  if (f.type === 'textarea') {
    control = `<textarea data-key="${f.key}" rows="3" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea>`;
  } else if (f.type === 'select') {
    const id = 'dl-' + f.key;
    control =
      `<input type="text" data-key="${f.key}" list="${id}" value="${esc(v)}" placeholder="${esc(f.ph || (f.options || []).slice(0, 2).join(' / '))}" autocomplete="off" />` +
      `<datalist id="${id}">${(f.options || []).map((o) => `<option value="${esc(o)}"></option>`).join('')}</datalist>`;
  } else if (f.type === 'date' || f.type === 'month') {
    const ok = f.type === 'month' ? /^\d{4}-\d{2}$/.test(v) : /^\d{4}-\d{2}-\d{2}$/.test(v);
    const type = !v || ok ? f.type : 'text';
    control = `<input type="${type}" data-key="${f.key}" value="${esc(v)}" placeholder="${esc(f.ph || '')}" />`;
  } else {
    control = `<input type="text" data-key="${f.key}" value="${esc(v)}" placeholder="${esc(f.ph || '')}" autocomplete="off" />`;
  }

  return `<div class="field${wide}">
    <label>${esc(f.label)}${req}<span class="key-tip">${esc(f.key)}</span></label>
    ${control}
  </div>`;
}

function renderSections() {
  const html = RH.SECTIONS.map((s) => {
    return `<section class="card" data-section="${s.id}">
      <div class="card-head">
        <div>
          <h2>${esc(s.title)}</h2>
          <p>${esc(s.desc || '')}</p>
        </div>
      </div>
      <div class="grid">${s.fields.map(fieldHTML).join('')}</div>
    </section>`;
  }).join('');
  $('#sections').innerHTML = html;
}

function renderCustom() {
  const list = $('#customList');
  const arr = profile.custom || [];
  list.innerHTML = arr.map((c, i) => `
    <div class="custom-row" data-idx="${i}">
      <input type="text" data-prop="label" value="${esc(c.label || '')}" placeholder="问题 / 字段名，如：是否服从调剂" />
      <input type="text" data-prop="value" value="${esc(c.value || '')}" placeholder="你的答案，如：是" />
      <button class="del" data-del="${i}" title="删除">×</button>
    </div>`).join('');
  $('#customEmpty').style.display = arr.length ? 'none' : 'block';
}

function renderMeter() {
  const pct = RH.completeness(profile);
  $('#meterFill').style.width = pct + '%';
  $('#meterText').textContent = pct + '% 完成';
}

/* ---------------- 保存 ---------------- */

function scheduleSave() {
  renderMeter();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 600);
}

async function doSave(silent) {
  await RH.saveProfile(profile);
  try {
    chrome.runtime.sendMessage({ type: 'RH_PROFILE_UPDATED' });
  } catch (e) { /* 忽略 */ }
  if (!silent) toast('已保存');
}

/* ---------------- 事件 ---------------- */

function bind() {
  $('#sections').addEventListener('input', (e) => {
    const el = e.target;
    const key = el.dataset.key;
    if (!key) return;
    profile[key] = el.value;
    scheduleSave();
  });

  $('#customList').addEventListener('input', (e) => {
    const row = e.target.closest('.custom-row');
    if (!row) return;
    const idx = Number(row.dataset.idx);
    const prop = e.target.dataset.prop;
    if (!prop || !profile.custom[idx]) return;
    profile.custom[idx][prop] = e.target.value;
    scheduleSave();
  });

  $('#customList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    profile.custom.splice(Number(btn.dataset.del), 1);
    renderCustom();
    doSave(true);
  });

  $('#btnAddCustom').addEventListener('click', () => {
    profile.custom = profile.custom || [];
    profile.custom.push({ label: '', value: '' });
    renderCustom();
    const rows = $('#customList').querySelectorAll('.custom-row');
    const last = rows[rows.length - 1];
    if (last) last.querySelector('input').focus();
  });

  $('#btnSave').addEventListener('click', () => doSave(false));

  $('#btnExport').addEventListener('click', () => {
    const data = JSON.stringify(profile, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const a = document.createElement('a');
    a.href = url;
    a.download = '校招资料-' + stamp + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('已导出 JSON 备份');
  });

  $('#btnImport').addEventListener('click', () => $('#fileInput').click());

  $('#fileInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!obj || typeof obj !== 'object') throw new Error('格式不对');
        const merged = Object.assign(RH.defaults(), obj);
        merged.custom = Array.isArray(obj.custom) ? obj.custom : [];
        profile = merged;
        renderSections();
        renderCustom();
        renderMeter();
        doSave(true);
        toast('导入成功');
      } catch (err) {
        toast('导入失败：不是有效的资料 JSON');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  $('#btnCopyAll').addEventListener('click', async () => {
    const text = RH.toPlainText(profile);
    if (!text) { toast('资料还是空的'); return; }
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制全部资料');
    } catch (e) {
      toast('复制失败，请检查浏览器权限');
    }
  });

  $('#btnClear').addEventListener('click', () => {
    if (!confirm('确定清空所有已保存的资料吗？建议先「导出」备份。')) return;
    profile = RH.defaults();
    renderSections();
    renderCustom();
    renderMeter();
    doSave(true);
    toast('已清空');
  });

  $('#btnDemo').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('demo/form.html') });
  });

  window.addEventListener('beforeunload', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      RH.saveProfile(profile);
    }
  });
}

/* ---------------- 启动 ---------------- */

(async function init() {
  profile = await RH.getProfile();
  profile.custom = profile.custom || [];
  renderSections();
  renderCustom();
  renderMeter();
  bind();
})();
