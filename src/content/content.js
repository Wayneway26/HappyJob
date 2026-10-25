/**
 * content.js —— 页面侧：表单识别、智能填充、悬浮面板
 */
(function () {
  if (window.__RH_LOADED__) return;
  window.__RH_LOADED__ = true;

  const RH = window.RH;
  if (!RH) return;

  const IS_TOP = window.top === window;
  const HOST_ID = 'rh-resume-helper-host';
  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'file', 'image', 'range', 'color', 'password', 'search']);
  const LONG_KEYS = new Set(['expDesc', 'projDesc', 'selfEval', 'awards', 'skills', 'campus']);

  let profile = RH.defaults();
  let lastScan = null;
  let lastResult = null;
  let undoStack = [];
  let panelOpen = false;
  let shadow = null;
  let host = null;

  /* ============================ 工具函数 ============================ */

  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/请输入|请填写|请选择|please\s*enter|enter\s*your/g, '')
      .replace(/[^0-9a-z\u4e00-\u9fa5]+/g, '');

  function cleanText(node, max) {
    max = max || 120;
    if (!node) return '';
    let clone;
    try {
      clone = node.cloneNode(true);
    } catch (e) {
      return '';
    }
    clone.querySelectorAll('input,textarea,select,option,button,script,style,svg').forEach((n) => n.remove());
    const t = String(clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    return t.slice(0, max);
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
  }

  function inOurHost(el) {
    return !!(host && host.contains(el));
  }

  function isFillable(el) {
    if (inOurHost(el)) return false;
    if (el.disabled) return false;
    const tag = el.tagName;
    if (tag === 'INPUT') {
      if (SKIP_TYPES.has((el.type || 'text').toLowerCase())) return false;
      if (el.readOnly) return false;
    } else if (tag === 'TEXTAREA') {
      if (el.readOnly) return false;
    } else if (tag !== 'SELECT' && !el.isContentEditable) {
      return false;
    }
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (!isVisible(el)) return false;
    const hint = norm([el.placeholder, el.id, el.className, el.name].join(' '));
    if (/搜索|search|关键词|keyword/.test(hint)) return false;
    return true;
  }

  function countControls(node) {
    if (!node || !node.querySelectorAll) return 99;
    return node.querySelectorAll('input:not([type="hidden"]),textarea,select').length;
  }

  /** 从输入框向上找「这一个字段」的容器：只包含 1 个控件，或一组同名单选框 */
  function findContainer(el, groupEls) {
    if (groupEls && groupEls.length > 1) {
      let node = groupEls[0].parentElement;
      while (node && node !== document.body) {
        if (groupEls.every((e) => node.contains(e))) {
          const others = node.querySelectorAll('input:not([type="hidden"]),textarea,select');
          if (others.length <= groupEls.length + 1) return node;
        }
        node = node.parentElement;
      }
      return groupEls[0].parentElement;
    }
    let node = el.parentElement;
    for (let i = 0; i < 5 && node && node !== document.body; i++) {
      const n = countControls(node);
      const t = cleanText(node, 140);
      if (n <= 1 && t.length <= 120) return node;
      if (n > 5) break;
      node = node.parentElement;
    }
    return el.parentElement;
  }

  /** 取元素前方最近的、含文字的兄弟节点 */
  function prevText(el, stopAt) {
    let node = el.previousElementSibling;
    let hops = 0;
    while (node && hops < 3) {
      if (node.querySelector && node.querySelector('input,textarea,select')) return '';
      const t = cleanText(node, 60);
      if (t) return t;
      node = node.previousElementSibling;
      hops++;
    }
    return '';
  }

  function labelFor(el) {
    const out = [];
    if (el.id) {
      try {
        document.querySelectorAll('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]')
          .forEach((l) => out.push(cleanText(l, 40)));
      } catch (e) { /* id 非法，忽略 */ }
    }
    const wrap = el.closest && el.closest('label');
    if (wrap) out.push(cleanText(wrap, 40));
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      lb.split(/\s+/).forEach((id) => {
        const n = document.getElementById(id);
        if (n) out.push(cleanText(n, 40));
      });
    }
    const aria = el.getAttribute('aria-label');
    if (aria) out.push(aria);
    return out.join(' ');
  }

  /** 构造用于打分的上下文 */
  function buildContext(unit) {
    const el = unit.el;
    const attrRaw = [
      el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.title,
      el.getAttribute('autocomplete'), el.getAttribute('data-field'),
      el.getAttribute('data-name'), el.getAttribute('data-label'), el.getAttribute('data-prop')
    ].filter(Boolean).join(' ');

    const container = unit.container || findContainer(el, unit.els);
    const n = countControls(container);
    const containerText = n <= Math.max(1, (unit.els || []).length) ? cleanText(container, 100) : '';
    const prev = prevText(container) || prevText(el, container);
    const nearRaw = [prev, containerText].filter(Boolean).join(' ');

    // 表格布局（<td>姓名</td><td><input></td>）时，容器本身没字，把前一格文字当标签用
    const labelRaw = [labelFor(el), unit.groupLabel || ''].filter(Boolean).join(' ');
    const labelNorm = norm(labelRaw + ' ' + containerText + ' ' + (containerText.length < 8 ? prev : ''));

    return {
      attrRaw: attrRaw,
      attrNorm: norm(attrRaw),
      labelRaw: labelRaw,
      labelNorm: labelNorm,
      nearRaw: nearRaw,
      nearNorm: norm(nearRaw)
    };
  }

  /* ============================ 打分匹配 ============================ */

  function scoreRule(rule, ctx, unit) {
    // 每个关键词单独打分，取最高的一个（再给第二名一点点加成），
    // 避免「城市」和「市」同时命中把「期望工作城市」这种更具体的规则挤掉。
    const parts = [];
    const consider = (kw, wAttr, wLabel, wNear, cap) => {
      const k = norm(kw);
      if (!k) return;
      const bonus = Math.min(k.length, cap);
      let c = 0;
      if (ctx.attrNorm.indexOf(k) >= 0) c += wAttr + bonus;
      if (ctx.labelNorm.indexOf(k) >= 0) c += wLabel + bonus;
      else if (ctx.nearNorm.indexOf(k) >= 0) c += wNear;
      if (c > 0) parts.push(c);
    };

    (rule.strong || []).forEach((k) => consider(k, 12, 10, 5, 6));
    (rule.weak || []).forEach((k) => consider(k, 6, 5, 3, 4));

    parts.sort((a, b) => b - a);
    let score = (parts[0] || 0) + Math.min(parts[1] || 0, 2);
    (rule.negative || []).forEach((k) => {
      const nk = norm(k);
      if (!nk) return;
      if (ctx.attrNorm.indexOf(nk) >= 0 || ctx.labelNorm.indexOf(nk) >= 0 || ctx.nearNorm.indexOf(nk) >= 0) {
        score -= 30;
      }
    });

    if (rule.autocomplete && unit.el.getAttribute && unit.el.getAttribute('autocomplete')) {
      const ac = unit.el.getAttribute('autocomplete').toLowerCase();
      if (ac.split(/\s+/).indexOf(rule.autocomplete) >= 0) score += 18;
    }

    const isTA = unit.el.tagName === 'TEXTAREA';
    const isChoice = unit.type === 'choice';
    if (LONG_KEYS.has(rule.key)) {
      if (isTA) score += 6;
      else if (isChoice) score -= 12;
      else score -= 6;
    } else if (isTA) {
      score -= 8;
    }

    return score;
  }

  function buildRules(p) {
    const rules = [];
    RH.SECTIONS.forEach((s) => s.fields.forEach((f) => rules.push(f)));
    (p.custom || []).forEach((c, i) => {
      if (!c || !c.label || !String(c.value || '').trim()) return;
      rules.push({
        key: '__custom_' + i,
        label: c.label,
        type: 'text',
        strong: [c.label],
        weak: [],
        negative: [],
        _value: c.value
      });
    });
    return rules;
  }

  function valueOf(rule, p) {
    if (rule._value != null) return String(rule._value);
    if (rule.key === 'expText') return RH.expText(p);
    if (rule.key === 'projText') return RH.projText(p);
    return String(p[rule.key] || '');
  }

  function matchUnit(unit, rules, p) {
    const ctx = buildContext(unit);
    let best = null;
    let bestScore = 0;
    for (const r of rules) {
      const s = scoreRule(r, ctx, unit);
      if (s > bestScore) {
        bestScore = s;
        best = r;
      }
    }
    if (!best || bestScore < 9) return null;
    const v = valueOf(best, p).trim();
    if (!v) return null;
    return { rule: best, score: bestScore, value: v, ctx };
  }

  /* ============================ 收集表单 ============================ */

  function buildUnits() {
    const els = Array.from(
      document.querySelectorAll('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
    ).filter(isFillable);

    const units = [];
    const groups = new Map();

    els.forEach((el) => {
      const isChoice = el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox');
      if (isChoice) {
        const key = 'g:' + (el.name || el.id || 'x' + units.length);
        if (!groups.has(key)) {
          const u = { el: el, els: [], type: 'choice' };
          groups.set(key, u);
          units.push(u);
        }
        groups.get(key).els.push(el);
      } else {
        units.push({ el: el, els: [el], type: 'input' });
      }
    });

    units.forEach((u) => {
      u.container = findContainer(u.el, u.els);
      if (u.type === 'choice') {
        // 单选组：把组内选项文字剥掉，剩下的就是题目（如「性别」「是否服从调剂」）
        let t = cleanText(u.container, 160);
        const opts = Array.from(new Set(
          u.els.map((e) => cleanText(e.closest('label') || e.parentElement, 20)).filter(Boolean)
        )).sort((a, b) => b.length - a.length);
        opts.forEach((o) => {
          if (t.endsWith(o)) t = t.slice(0, -o.length);
          else if (t.startsWith(o)) t = t.slice(o.length);
          else t = t.split(o).join(' ');
        });
        u.groupLabel = t.trim();
      }
    });

    return units;
  }

  function unitLabel(u) {
    const lb = labelFor(u.el).trim();
    if (lb) return lb.slice(0, 24);
    const ph = (u.el.placeholder || '').trim();
    if (ph) return ph.slice(0, 24);
    const c = u.container ? cleanText(u.container, 40) : '';
    if (c && c.length <= 20) return c;
    return (u.el.name || u.el.id || '未命名字段').slice(0, 24);
  }

  function hasValue(el) {
    if (el.tagName === 'SELECT') {
      const t = (el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].text : '').trim();
      return !!t && !/^(请选择|--|—|select|choose)/i.test(t) && t !== '';
    }
    if (el.isContentEditable) return !!el.textContent.trim();
    return !!String(el.value || '').trim();
  }

  /* ============================ 写入值 ============================ */

  function setNativeValue(el, value) {
    const proto =
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype :
      el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (el._valueTracker) {
      try { el._valueTracker.setValue(''); } catch (e) { /* 忽略 */ }
    }
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function formatForInput(el, value) {
    const type = (el.type || '').toLowerCase();
    if (type === 'date') {
      const m = value.match(/(\d{4})\D+(\d{1,2})(?:\D+(\d{1,2}))?/);
      if (!m) return null;
      return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3] || '01').padStart(2, '0');
    }
    if (type === 'month') {
      const m = value.match(/(\d{4})\D+(\d{1,2})/);
      if (!m) return null;
      return m[1] + '-' + String(m[2]).padStart(2, '0');
    }
    if (type === 'number') {
      const n = value.replace(/[^\d.]/g, '');
      return n || null;
    }
    return value;
  }

  function fillSelect(el, value) {
    const opts = Array.from(el.options || []);
    if (!opts.length) return false;
    const target = norm(value);
    if (!target) return false;
    const real = opts.filter((o) => !/^(请选择|--|—|-|select|choose|全部)/i.test((o.text || '').trim()));

    const isYearList = real.length > 3 && real.every((o) => /^\d{4}\s*年?$/.test((o.text || '').trim()));
    const isMonthList = real.length >= 12 && real.every((o) => /^\d{1,2}\s*月?$/.test((o.text || '').trim()));

    if (isYearList) {
      const y = (value.match(/\d{4}/) || [])[0];
      const hit = real.find((o) => (o.text || '').indexOf(y) >= 0);
      if (hit) { setNativeValue(el, hit.value); return true; }
    }
    if (isMonthList) {
      const m = value.match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
      if (m) {
        const hit = real.find((o) => String(parseInt((o.text || '').replace(/\D/g, ''), 10)) === String(parseInt(m[1], 10)));
        if (hit) { setNativeValue(el, hit.value); return true; }
      }
    }

    let hit = real.find((o) => norm(o.text) === target || norm(o.value) === target);
    if (!hit) hit = real.find((o) => norm(o.text).indexOf(target) >= 0 || target.indexOf(norm(o.text)) >= 0);
    if (!hit) {
      const y = (value.match(/\d{4}/) || [])[0];
      if (y) hit = real.find((o) => (o.text || '').indexOf(y) >= 0);
    }
    if (!hit) return false;
    setNativeValue(el, hit.value);
    return true;
  }

  function fillText(el, value) {
    if (el.tagName === 'SELECT') return fillSelect(el, value);
    if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const v = formatForInput(el, value);
    if (v == null) return false;
    el.focus();
    setNativeValue(el, v);
    el.blur();
    return true;
  }

  function choiceText(el) {
    const lab = el.closest && el.closest('label');
    if (lab) {
      const t = cleanText(lab, 20);
      if (t) return t;
    }
    if (el.id) {
      const l = document.querySelector('label[for="' + el.id + '"]');
      if (l) return cleanText(l, 20);
    }
    const next = el.nextSibling;
    if (next && next.nodeType === 3 && String(next.textContent).trim()) return String(next.textContent).trim();
    const parent = el.parentElement;
    if (parent) {
      const t = cleanText(parent, 20);
      if (t && t.length <= 12) return t;
    }
    return el.value || '';
  }

  function fillChoice(unit, value) {
    const target = norm(value);
    let best = null;
    for (const el of unit.els) {
      const t = norm(choiceText(el));
      if (!t) continue;
      if (t === target) { best = el; break; }
      if (!best && (t.indexOf(target) >= 0 || target.indexOf(t) >= 0)) best = el;
    }
    if (!best) return false;
    if (best.type === 'radio' || best.type === 'checkbox') {
      if (!best.checked) best.click();
      else best.checked = true;
    }
    return true;
  }

  /* ============================ 填充主流程 ============================ */

  function scanPage(p) {
    const units = buildUnits();
    const rules = buildRules(p);
    const matched = [];
    const unmatched = [];

    units.forEach((u) => {
      const m = matchUnit(u, rules, p);
      if (m) matched.push({ unit: u, rule: m.rule, value: m.value, label: unitLabel(u) });
      else if (u.type === 'input' || u.els.length > 1) unmatched.push({ label: unitLabel(u), unit: u });
    });

    return { units: units.length, matched, unmatched };
  }

  function fillAll(opts) {
    opts = opts || {};
    const overwrite = !!opts.overwrite;
    const p = profile;
    const scan = scanPage(p);
    undoStack = [];

    let filled = 0;
    let skipped = 0;
    const filledList = [];

    scan.matched.forEach((m) => {
      const u = m.unit;
      try {
        if (u.type === 'choice') {
          const prev = u.els.map((e) => e.checked);
          if (!overwrite && u.els.some((e) => e.checked)) { skipped++; return; }
          if (fillChoice(u, m.value)) {
            undoStack.push({ type: 'choice', els: u.els, prev });
            filled++;
            filledList.push({ label: m.label, value: m.value, rule: m.rule.label });
          }
        } else {
          if (!overwrite && hasValue(u.el)) { skipped++; return; }
          const prev = u.el.isContentEditable ? u.el.textContent : u.el.value;
          if (fillText(u.el, m.value)) {
            undoStack.push({ type: 'value', el: u.el, prev, editable: u.el.isContentEditable });
            filled++;
            filledList.push({ label: m.label, value: m.value, rule: m.rule.label });
          }
        }
      } catch (e) {
        /* 单个字段失败不影响整体 */
      }
    });

    lastScan = scan;
    // 省市级联：等第一个下拉触发完再补一次
    if (filled) {
      setTimeout(() => retryEmptySelects(p), 500);
      setTimeout(() => retryEmptySelects(p), 1400);
    }

    return {
      filled,
      skipped,
      total: scan.units,
      matched: scan.matched.length,
      unmatched: scan.unmatched.slice(0, 10).map((x) => x.label),
      filledList: filledList.slice(0, 30)
    };
  }

  function retryEmptySelects(p) {
    const rules = buildRules(p);
    const keys = new Set(['province', 'city', 'gradDate', 'enrollDate', 'eduLevel', 'degree', 'gender']);
    buildUnits().forEach((u) => {
      if (u.el.tagName !== 'SELECT' || hasValue(u.el)) return;
      const m = matchUnit(u, rules, p);
      if (!m || !keys.has(m.rule.key)) return;
      if (fillSelect(u.el, m.value)) undoStack.push({ type: 'value', el: u.el, prev: '' });
    });
  }

  function undoFill() {
    let n = 0;
    for (let i = undoStack.length - 1; i >= 0; i--) {
      const a = undoStack[i];
      try {
        if (a.type === 'choice') {
          a.els.forEach((e, idx) => { e.checked = a.prev[idx]; });
        } else if (a.editable) {
          a.el.textContent = a.prev;
        } else {
          setNativeValue(a.el, a.prev);
        }
        n++;
      } catch (e) { /* 忽略 */ }
    }
    undoStack = [];
    return n;
  }

  /* ============================ 复制 ============================ */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ============================ 悬浮面板 ============================ */

  const PANEL_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .fab {
      position: fixed; right: 22px; bottom: 22px; width: 50px; height: 50px; border-radius: 16px;
      background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; border: none; cursor: grab;
      box-shadow: 0 8px 24px rgba(79,70,229,.38); display: flex; align-items: center; justify-content: center;
      font-size: 19px; font-weight: 700; letter-spacing: .5px; user-select: none; z-index: 2147483646;
      transition: transform .15s ease, box-shadow .15s ease; touch-action: none;
    }
    .fab:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(79,70,229,.45); }
    .fab.dragging { cursor: grabbing; transform: none; }
    .badge {
      position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px;
      border-radius: 10px; background: #ef4444; color: #fff; font-size: 11px; line-height: 20px;
      text-align: center; border: 2px solid #fff; font-weight: 600;
    }
    .badge.hide { display: none; }
    .panel {
      position: fixed; right: 22px; bottom: 84px; width: 340px; max-height: 68vh; background: #fff;
      border-radius: 16px; box-shadow: 0 18px 50px rgba(15,23,42,.22), 0 0 0 1px rgba(15,23,42,.06);
      display: flex; flex-direction: column; overflow: hidden; z-index: 2147483646; color: #0f172a;
    }
    .panel.hide { display: none; }
    .head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 10px; }
    .logo {
      width: 32px; height: 32px; border-radius: 10px; background: linear-gradient(135deg,#4f46e5,#7c3aed);
      color: #fff; font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center;
    }
    .title { font-size: 14px; font-weight: 650; }
    .sub { font-size: 11.5px; color: #64748b; margin-top: 2px; }
    .sub b { color: #4f46e5; }
    .x { margin-left: auto; border: none; background: transparent; font-size: 20px; color: #94a3b8; cursor: pointer; line-height: 1; padding: 2px 4px; }
    .x:hover { color: #0f172a; }
    .tabs { display: flex; gap: 4px; padding: 0 12px; border-bottom: 1px solid #f1f5f9; }
    .tab {
      border: none; background: transparent; padding: 8px 10px; font-size: 12.5px; color: #64748b;
      cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
    }
    .tab.on { color: #4f46e5; border-bottom-color: #4f46e5; font-weight: 600; }
    .gear {
      margin-left: auto; border: none; background: transparent; color: #94a3b8;
      font-size: 11.5px; cursor: pointer; padding: 8px 2px; font-family: inherit;
    }
    .gear:hover { color: #4f46e5; }
    .body { padding: 12px 14px 14px; overflow-y: auto; }
    .row { display: flex; gap: 8px; }
    .btn {
      flex: 1; border: none; border-radius: 9px; padding: 9px 10px; font-size: 12.5px; cursor: pointer;
      background: #eef2ff; color: #4338ca; font-weight: 600; transition: background .15s;
    }
    .btn:hover { background: #e0e7ff; }
    .btn.primary { background: linear-gradient(135deg,#4f46e5,#7c3aed); color: #fff; }
    .btn.primary:hover { filter: brightness(1.06); }
    .btn.ghost { background: #f8fafc; color: #475569; }
    .btn:disabled { opacity: .55; cursor: default; }
    .stat { margin: 12px 0 8px; font-size: 12px; color: #475569; background: #f8fafc; border-radius: 8px; padding: 8px 10px; line-height: 1.6; }
    .stat b { color: #059669; }
    .list { margin-top: 6px; }
    .item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px dashed #f1f5f9; font-size: 12px; }
    .item:last-child { border-bottom: none; }
    .k { color: #64748b; width: 84px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .v { color: #0f172a; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cp { border: none; background: #f1f5f9; color: #475569; border-radius: 6px; padding: 3px 8px; font-size: 11px; cursor: pointer; flex: none; }
    .cp:hover { background: #e2e8f0; }
    .cp.ok { background: #d1fae5; color: #047857; }
    .hint { margin-top: 10px; font-size: 11px; color: #94a3b8; line-height: 1.6; }
    .sec { font-size: 11px; color: #94a3b8; margin: 12px 0 4px; font-weight: 600; letter-spacing: .3px; }
    .search { width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; font-size: 12px; outline: none; margin-bottom: 8px; }
    .search:focus { border-color: #a5b4fc; }
    .empty { text-align: center; color: #94a3b8; font-size: 12px; padding: 18px 0; }
    .toast {
      position: fixed; right: 22px; bottom: 84px; background: #0f172a; color: #fff; font-size: 12px;
      padding: 8px 12px; border-radius: 8px; z-index: 2147483647; opacity: 0; transition: opacity .2s;
    }
    .toast.show { opacity: .95; }
  `;

  function el(tag, attrs, html) {
    const n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    if (html != null) n.innerHTML = html;
    return n;
  }

  function toast(msg) {
    if (!shadow) return;
    let t = shadow.querySelector('.toast');
    if (!t) {
      t = el('div', { class: 'toast' });
      shadow.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  function openOptions() {
    try {
      chrome.runtime.sendMessage({ type: 'RH_OPEN_OPTIONS' });
    } catch (e) { /* 忽略 */ }
  }

  function renderCopyTab(query) {
    const q = (query || '').trim().toLowerCase();
    const parts = [];
    RH.SECTIONS.forEach((s) => {
      const rows = [];
      s.fields.forEach((f) => {
        const v = String(profile[f.key] || '').trim();
        if (!v) return;
        if (q && (f.label + v).toLowerCase().indexOf(q) < 0) return;
        rows.push(
          '<div class="item"><span class="k">' + esc(f.label) + '</span>' +
          '<span class="v" title="' + esc(v) + '">' + esc(v.replace(/\n/g, ' ')) + '</span>' +
          '<button class="cp" data-copy="' + esc(v) + '">复制</button></div>'
        );
      });
      if (rows.length) parts.push('<div class="sec">' + esc(s.title) + '</div>' + rows.join(''));
    });
    (profile.custom || []).forEach((c) => {
      if (!c || !c.label || !c.value) return;
      if (q && (c.label + c.value).toLowerCase().indexOf(q) < 0) return;
      parts.push(
        '<div class="item"><span class="k">' + esc(c.label) + '</span>' +
        '<span class="v" title="' + esc(c.value) + '">' + esc(c.value.replace(/\n/g, ' ')) + '</span>' +
        '<button class="cp" data-copy="' + esc(c.value) + '">复制</button></div>'
      );
    });
    return parts.length ? parts.join('') : '<div class="empty">还没有填写资料，点「设置」去补充吧</div>';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderFillTab(result) {
    const r = result || null;
    let html = '<div class="row">' +
      '<button class="btn primary" data-act="fill">一键填充本页</button>' +
      '<button class="btn ghost" data-act="undo"' + (undoStack.length ? '' : ' disabled') + '>撤销</button>' +
      '</div>';

    if (r) {
      html += '<div class="stat">已填充 <b>' + r.filled + '</b> 项' +
        (r.skipped ? ' · 跳过已有内容 ' + r.skipped + ' 项' : '') +
        ' · 页面共 ' + r.total + ' 个输入框</div>';
      if (r.filledList && r.filledList.length) {
        html += '<div class="sec">已填充</div><div class="list">';
        r.filledList.forEach((f) => {
          html += '<div class="item"><span class="k">' + esc(f.rule) + '</span>' +
            '<span class="v" title="' + esc(f.value) + '">' + esc(f.value.replace(/\n/g, ' ')) + '</span></div>';
        });
        html += '</div>';
      }
      if (r.unmatched && r.unmatched.length) {
        html += '<div class="sec">没识别出来（可去「复制」里手动贴）</div><div class="list">';
        r.unmatched.forEach((l) => {
          html += '<div class="item"><span class="v" style="color:#94a3b8">' + esc(l) + '</span></div>';
        });
        html += '</div>';
      }
    } else {
      html += '<div class="stat">已读取资料，点上面的按钮开始填充。默认只填空着的格子，不会覆盖你已经写好的内容。</div>';
    }

    html += '<div class="hint">小提示：简历附件受浏览器安全限制，需要手动上传；剩下的字段可以切到「复制」逐个粘贴。</div>';
    return html;
  }

  function buildPanel() {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:static;';
    (document.body || document.documentElement).appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);

    const fab = el('button', { class: 'fab', title: '校招简历助手（点击打开）' }, '简<span class="badge hide">0</span>');
    const panel = el('div', { class: 'panel hide' });

    shadow.appendChild(fab);
    shadow.appendChild(panel);

    let pos = { right: 22, bottom: 22 };

    const placeFab = () => {
      fab.style.right = pos.right + 'px';
      fab.style.bottom = pos.bottom + 'px';
      fab.style.left = 'auto';
      fab.style.top = 'auto';
      panel.style.right = Math.min(pos.right, Math.max(8, window.innerWidth - 360)) + 'px';
      panel.style.bottom = pos.bottom + 62 + 'px';
    };

    chrome.storage.local.get('fabPos').then((r) => {
      if (r && r.fabPos) { pos = r.fabPos; placeFab(); }
    }).catch(() => {});

    // 拖动
    let drag = null;
    fab.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom, moved: false };
      fab.classList.add('dragging');
      fab.setPointerCapture(e.pointerId);
    });
    fab.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      pos = {
        right: Math.max(8, Math.min(window.innerWidth - 60, drag.right - dx)),
        bottom: Math.max(8, Math.min(window.innerHeight - 60, drag.bottom - dy))
      };
      placeFab();
    });
    fab.addEventListener('pointerup', (e) => {
      fab.classList.remove('dragging');
      if (drag && drag.moved) {
        chrome.storage.local.set({ fabPos: pos }).catch(() => {});
      } else {
        togglePanel(true);
      }
      drag = null;
      try { fab.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    });

    // 面板交互
    panel.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('.x')) { togglePanel(false); return; }
      const tab = t.closest('.tab');
      if (tab) {
        panel.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b === tab));
        const name = tab.dataset.tab;
        const body = panel.querySelector('.body');
        if (name === 'copy') {
          body.innerHTML = '<input class="search" placeholder="搜索字段或内容…">' + renderCopyTab('');
          const input = body.querySelector('.search');
          input.addEventListener('input', () => {
            const list = body.querySelectorAll('.item, .sec, .empty');
            list.forEach((n) => n.remove());
            body.insertAdjacentHTML('beforeend', renderCopyTab(input.value));
            input.focus();
          });
        } else {
          body.innerHTML = renderFillTab(lastResult);
        }
        return;
      }
      const cp = t.closest('.cp');
      if (cp) {
        const ok = await copyText(cp.dataset.copy || '');
        cp.textContent = ok ? '已复制' : '失败';
        cp.classList.toggle('ok', ok);
        setTimeout(() => { cp.textContent = '复制'; cp.classList.remove('ok'); }, 1200);
        return;
      }
      const act = t.closest('[data-act]');
      if (act) {
        if (act.dataset.act === 'fill') {
          act.disabled = true;
          act.textContent = '填充中…';
          const r = fillAll({});
          lastResult = r;
          updateBadge(r.matched);
          // 顺便让 iframe 里的表单也填一遍
          try { chrome.runtime.sendMessage({ type: 'RH_BROADCAST_FILL' }); } catch (err) { /* 忽略 */ }
          setTimeout(() => {
            panel.querySelector('.body').innerHTML = renderFillTab(r);
          }, 260);
          toast('已填充 ' + r.filled + ' 项');
        } else if (act.dataset.act === 'undo') {
          const n = undoFill();
          lastResult = null;
          panel.querySelector('.body').innerHTML = renderFillTab(null);
          toast(n ? '已撤销 ' + n + ' 项' : '没有可撤销的内容');
        }
      }
    });

    function updateBadge(n) {
      const b = fab.querySelector('.badge');
      if (!b) return;
      b.textContent = String(n);
      b.classList.toggle('hide', !n);
      // 页面上没有可填字段时不打扰用户（可从弹窗里强制打开面板）
      fab.style.display = n > 0 ? 'flex' : 'none';
    }

    function togglePanel(open) {
      panelOpen = open === undefined ? !panelOpen : open;
      if (panelOpen) renderPanelShell();
      panel.classList.toggle('hide', !panelOpen);
    }

    function renderPanelShell() {
      panel.innerHTML =
        '<div class="head">' +
        '<div class="logo">简</div><div><div class="title">校招简历助手</div>' +
        '<div class="sub">检测到 <b>' + (lastScan ? lastScan.units : 0) + '</b> 个输入框</div></div>' +
        '<button class="x" title="关闭">×</button>' +
        '</div>' +
        '<div class="tabs">' +
        '<button class="tab on" data-tab="fill">填充</button>' +
        '<button class="tab" data-tab="copy">复制</button>' +
        '<button class="gear" data-tab="settings">设置</button>' +
        '</div>' +
        '<div class="body">' + renderFillTab(lastResult) + '</div>';
      const setBtn = panel.querySelector('[data-tab="settings"]');
      if (setBtn) setBtn.addEventListener('click', openOptions);
      if (panelOpen) scanAndRefresh();
    }

    function scanAndRefresh() {
      const s = scanPage(profile);
      lastScan = s;
      updateBadge(s.matched.length);
      const sub = panel.querySelector('.sub b');
      if (sub) sub.textContent = String(s.units);
    }

    fab._scan = scanAndRefresh;
    fab._toggle = togglePanel;
    fab._updateBadge = updateBadge;

    // 先扫一次拿到徽标数字；SPA 可能渲染慢，没找到就多等几次再扫
    const kickScan = (attempt) => {
      try {
        if (!panelOpen) {
          const s = scanPage(profile);
          lastScan = s;
          updateBadge(s.matched.length);
          if (s.matched.length) return;
        }
      } catch (e) { /* 忽略 */ }
      if (attempt < 3) {
        setTimeout(() => kickScan(attempt + 1), [1200, 3000, 6000][attempt] || 6000);
      }
    };
    kickScan(0);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panelOpen) togglePanel(false);
    });

    // SPA 重渲染可能把 host 删掉
    setInterval(() => {
      if (host && !host.isConnected) {
        (document.body || document.documentElement).appendChild(host);
      }
    }, 2000);
  }

  /* ============================ 消息通道 ============================ */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'RH_PING':
        sendResponse({ ok: true, top: IS_TOP });
        break;
      case 'RH_FILL':
        if (msg.framesOnly && IS_TOP) { sendResponse({ ok: true, ignored: true }); break; }
        try {
          const r = fillAll({ overwrite: !!msg.overwrite });
          lastResult = r;
          if (IS_TOP && host) {
            const badge = host.shadowRoot.querySelector('.badge');
            if (badge) {
              badge.textContent = String(r.matched);
              badge.classList.toggle('hide', !r.matched);
            }
          }
          sendResponse(Object.assign({ ok: true }, r));
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message) });
        }
        break;
      case 'RH_SCAN':
        try {
          const s = scanPage(profile);
          lastScan = s;
          sendResponse({ ok: true, units: s.units, matched: s.matched.length });
        } catch (e) {
          sendResponse({ ok: false });
        }
        break;
      case 'RH_TOGGLE_PANEL':
        if (IS_TOP && host && host.shadowRoot) {
          const fab = host.shadowRoot.querySelector('.fab');
          if (fab && fab._toggle) fab._toggle();
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
        break;
      case 'RH_PROFILE_UPDATED':
        RH.getProfile().then((p) => {
          profile = p;
          if (IS_TOP && host && host.shadowRoot) {
            const fab = host.shadowRoot.querySelector('.fab');
            if (fab && fab._scan) fab._scan();
          }
        });
        sendResponse({ ok: true });
        break;
      default:
        break;
    }
  });

  /* ============================ 启动 ============================ */

  RH.getProfile().then((p) => {
    profile = p;
    if (IS_TOP) {
      const boot = () => {
        if (document.body) buildPanel();
        else setTimeout(boot, 300);
      };
      boot();
    }
  });

  // 供调试
  window.__RH_DEBUG__ = {
    scan: () => scanPage(profile),
    fill: (o) => fillAll(o || {}),
    units: () => buildUnits(),
    ctx: (selector) => {
      const el = document.querySelector(selector);
      const unit = buildUnits().find((u) => u.el === el || u.els.indexOf(el) >= 0);
      return unit ? buildContext(unit) : null;
    },
    explain: (selector) => {
      const el = document.querySelector(selector);
      if (!el) return [];
      const unit = buildUnits().find((u) => u.el === el || u.els.indexOf(el) >= 0);
      if (!unit) return [];
      const ctx = buildContext(unit);
      return buildRules(profile)
        .map((r) => ({ key: r.key, score: scoreRule(r, ctx, unit), value: valueOf(r, profile) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }
  };
})();
