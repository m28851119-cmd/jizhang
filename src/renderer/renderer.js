// ===== 分类体系 =====
// v1.1 起分类由用户管理：出厂清单在 main.js（首次建库写入 data.db），
// 实际清单通过 window.api.getCategories() 从数据库加载；这里只保留固定配色。
let categories = {};

// ===== 分类固定配色 =====
// 8 个彩色给最常见的 8 个大类（顺序经过色盲安全校验）；灰色给 3 个低频大类。
// 颜色固定跟随分类，不随排行变化；灰色分类靠文字标签辨认。
const GRAY = '#898781';
const CAT_COLORS = {
  '餐饮饮食': '#2a78d6',
  '交通出行': '#eb6834',
  '购物消费': '#1baf7a',
  '娱乐休闲': '#eda100',
  '医疗健康': '#e87ba4',
  '居住日常': '#008300',
  '教育学习': '#6250d6',
  '人情往来': '#e34948'
};
const LOW_CAT_COLORS = { '通讯网络': GRAY, '金融保险': GRAY, '其他支出': GRAY };
function catColor(cat1) {
  return CAT_COLORS[cat1] || LOW_CAT_COLORS[cat1] || GRAY;
}

// ===== 小工具 =====
const $ = (id) => document.getElementById(id);

function pad(n) { return String(n).padStart(2, '0'); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 分 → 元字符串（金额全部以「分」存储，避免小数误差）
function fmtYuan(cents) { return (cents / 100).toFixed(2); }

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : s;
  return d.innerHTML;
}

function dateLabel(dateStr) {
  const today = todayStr();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
  if (dateStr === today) return '今天';
  if (dateStr === yesterday) return '昨天';
  const [yy, mm, dd] = dateStr.split('-');
  return `${Number(mm)}月${Number(dd)}日`;
}

let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

// ===== 全局状态 =====
let allExpenses = [];
let editingId = null;
let pendingDeleteId = null;

// ===== 记一笔表单 =====
function fillCat1(selected) {
  const sel = $('cat1');
  sel.innerHTML = '';
  for (const name of Object.keys(categories)) {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    if (name === selected) o.selected = true;
    sel.appendChild(o);
  }
  // 正在修改的旧账单，其分类可能已被用户删除：临时补一个「已删除」选项，
  // 保证账单文字不被悄悄改动（保存时仍是原文字）
  if (selected && !categories[selected]) {
    const o = document.createElement('option');
    o.value = selected;
    o.textContent = selected + '（已删除）';
    o.selected = true;
    sel.appendChild(o);
  }
}

function fillCat2(cat1, selected) {
  const sel = $('cat2');
  sel.innerHTML = '';
  const subs = categories[cat1] || [];
  for (const s of subs) {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = s;
    if (s === selected) o.selected = true;
    sel.appendChild(o);
  }
  if (selected && !subs.includes(selected)) {
    const o = document.createElement('option');
    o.value = selected;
    o.textContent = selected + '（已删除）';
    o.selected = true;
    sel.appendChild(o);
  }
}

function resetForm() {
  editingId = null;
  $('amount').value = '';
  $('note').value = '';
  $('save').textContent = '保存这笔账';
  $('cancel-edit').classList.add('hidden');
  $('amount').focus();
}

async function handleSave() {
  const amountVal = parseFloat($('amount').value);
  if (!amountVal || amountVal <= 0) {
    showToast('请先输入金额');
    $('amount').focus();
    return;
  }
  const exp = {
    amountCents: Math.round(amountVal * 100),
    cat1: $('cat1').value,
    cat2: $('cat2').value,
    date: $('date').value || todayStr(),
    note: $('note').value.trim(),
    payMethod: $('pay').value
  };
  const wasEdit = editingId != null;
  if (wasEdit) {
    exp.id = editingId;
    await window.api.updateExpense(exp);
    showToast('已保存修改');
  } else {
    await window.api.addExpense(exp);
    showToast('已记账');
  }
  localStorage.setItem('lastCat1', exp.cat1);
  localStorage.setItem('lastCat2', exp.cat2);
  resetForm();
  await loadData();
  if (wasEdit) switchTab('list');
}

function startEdit(e) {
  editingId = e.id;
  fillCat1(e.cat1);
  fillCat2(e.cat1, e.cat2);
  $('amount').value = fmtYuan(e.amount_cents);
  $('date').value = e.date;
  $('pay').value = e.pay_method || '微信';
  $('note').value = e.note || '';
  $('save').textContent = '保存修改';
  $('cancel-edit').classList.remove('hidden');
  switchTab('add');
}

// ===== 标签页 =====
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  for (const k of ['add', 'list', 'stats', 'cats', 'game']) {
    $('view-' + k).classList.toggle('hidden', k !== name);
  }
  // 离开「记一笔」页就取消编辑状态：防止用户改着改着切去别处，
  // 回来输入新金额点保存时误把旧账单覆盖掉
  if (name !== 'add' && editingId != null) resetForm();
  if (name === 'stats') renderStats();
  if (name === 'cats') renderCatManager();
}

// ===== 账单列表 + 筛选 =====
function getFilters() {
  return {
    month: $('filter-month').value,
    cat: $('filter-cat').value,
    search: $('filter-search').value.trim().toLowerCase()
  };
}

function filteredExpenses() {
  const f = getFilters();
  return allExpenses.filter((e) => {
    if (f.month && !e.date.startsWith(f.month)) return false;
    if (f.cat && e.cat1 !== f.cat) return false;
    if (f.search && !(e.note + e.cat1 + e.cat2).toLowerCase().includes(f.search)) return false;
    return true;
  });
}

function fillFilterCat() {
  $('filter-cat').innerHTML =
    '<option value="">全部分类</option>' +
    Object.keys(categories).map((c) => `<option value="${c}">${c}</option>`).join('');
}

function refreshMonthOptions() {
  const sel = $('filter-month');
  const cur = sel.value;
  const months = [...new Set(allExpenses.map((e) => e.date.slice(0, 7)))].sort().reverse();
  sel.innerHTML =
    '<option value="">全部月份</option>' +
    months.map((m) => `<option value="${m}">${m.slice(0, 4)}年${Number(m.slice(5))}月</option>`).join('');
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function renderList() {
  const items = filteredExpenses();
  const total = items.reduce((s, e) => s + e.amount_cents, 0);
  const f = getFilters();
  const bar = $('summary-bar');

  let html = `共 ${items.length} 笔 · 合计 ¥${fmtYuan(total)}`;
  if (f.month || f.cat || f.search) {
    const parts = [];
    if (f.month) parts.push(`${f.month.slice(0, 4)}年${Number(f.month.slice(5))}月`);
    if (f.cat) parts.push(f.cat);
    if (f.search) parts.push(`“${$('filter-search').value.trim()}”`);
    html += `<span class="sum-filter-note">（筛选：${parts.join(' + ')}）</span>`;
    html += `<button class="clear-filter" id="clear-filter">清除筛选</button>`;
  }
  bar.innerHTML = html;
  const clearBtn = $('clear-filter');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      $('filter-month').value = '';
      $('filter-cat').value = '';
      $('filter-search').value = '';
      renderList();
    });
  }

  const groups = new Map();
  for (const e of items) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }
  const dates = [...groups.keys()].sort().reverse();
  const listEl = $('list');
  listEl.innerHTML = '';
  if (dates.length === 0) {
    listEl.innerHTML = `<div class="empty">${
      allExpenses.length === 0 ? '还没有账单，先去「记一笔」吧' : '没有符合筛选条件的账单'
    }</div>`;
    return;
  }
  for (const d of dates) {
    const es = groups.get(d);
    const daySum = es.reduce((s, e) => s + e.amount_cents, 0);
    const head = document.createElement('div');
    head.className = 'day-head';
    head.innerHTML = `<span class="day-date">${dateLabel(d)}</span><span class="day-sum">小计 ¥${fmtYuan(daySum)} · ${es.length} 笔</span>`;
    listEl.appendChild(head);
    for (const e of es) listEl.appendChild(buildRow(e));
  }
}

function buildRow(e) {
  const row = document.createElement('div');
  row.className = 'exp-row';
  row.innerHTML = `
    <span class="cat-dot" style="background:${catColor(e.cat1)}"></span>
    <div class="exp-main">
      <div class="exp-cat">${esc(e.cat1)} · ${esc(e.cat2)}</div>
      <div class="exp-note">${esc(e.note)}${e.pay_method ? `<span class="pay-badge">${esc(e.pay_method)}</span>` : ''}</div>
    </div>
    <div class="exp-amount">¥${fmtYuan(e.amount_cents)}</div>
    <div class="exp-actions">
      <button class="mini-btn" title="修改">改</button>
      <button class="mini-btn danger" title="删除">删</button>
    </div>`;
  row.querySelector('.mini-btn').addEventListener('click', () => startEdit(e));
  row.querySelector('.mini-btn.danger').addEventListener('click', () => askDelete(e));
  return row;
}

function askDelete(e) {
  pendingDeleteId = e.id;
  $('modal-text').textContent = `${e.date} · ${e.cat1} · ${e.cat2} · ¥${fmtYuan(e.amount_cents)}（删除后不可恢复）`;
  $('modal').classList.remove('hidden');
}

// ===== 统计 =====
function renderStats() {
  const ym = $('stats-month').value || todayStr().slice(0, 7);
  $('stats-month').value = ym;
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = ym === todayStr().slice(0, 7) ? new Date().getDate() : daysInMonth;

  const items = allExpenses.filter((e) => e.date.startsWith(ym));
  const total = items.reduce((s, e) => s + e.amount_cents, 0);
  $('stat-total').textContent = '¥' + fmtYuan(total);
  $('stat-daily').textContent = '¥' + (total > 0 ? (total / days / 100).toFixed(2) : '0.00');
  $('stat-count').textContent = String(items.length);

  const sums = new Map();
  for (const e of items) sums.set(e.cat1, (sums.get(e.cat1) || 0) + e.amount_cents);
  const sorted = [...sums.entries()].sort((a, b) => b[1] - a[1]);
  renderDonut(sorted, total);
  renderRank(sorted, total);
}

function shiftStatsMonth(delta) {
  const [y, m] = ($('stats-month').value || todayStr().slice(0, 7)).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  $('stats-month').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  renderStats();
}

// 环形图：前 7 名分类 + 其余合并为「其他分类」，最多 8 段，段间留 2.5px 空隙
function renderDonut(sorted, total) {
  const svg = $('donut');
  const legend = $('donut-legend');
  svg.innerHTML = '';
  legend.innerHTML = '';
  $('donut-center-val').textContent = '¥' + fmtYuan(total);
  if (sorted.length === 0) {
    legend.innerHTML = '<div class="legend-empty">本月还没有账单</div>';
    return;
  }
  const top = sorted.slice(0, 7);
  const restSum = sorted.slice(7).reduce((s, [, v]) => s + v, 0);
  const segments = top.map(([name, v]) => ({ name, v, color: catColor(name) }));
  if (restSum > 0) segments.push({ name: '其他分类', v: restSum, color: GRAY });

  const R = 78;
  const C = 2 * Math.PI * R;
  const GAP = 2.5;
  const NS = 'http://www.w3.org/2000/svg';
  let acc = 0;
  const tip = $('tip');

  for (const seg of segments) {
    const len = (seg.v / total) * C;
    const drawLen = Math.max(len - GAP, 0.5);
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', 100);
    circle.setAttribute('cy', 100);
    circle.setAttribute('r', R);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', seg.color);
    circle.setAttribute('stroke-width', 34);
    circle.setAttribute('stroke-dasharray', `${drawLen} ${C - drawLen}`);
    circle.setAttribute('stroke-dashoffset', String(-(acc + GAP / 2)));
    circle.setAttribute('transform', 'rotate(-90 100 100)');
    svg.appendChild(circle);

    // 加宽的透明层：让鼠标更容易点到细段
    const hit = document.createElementNS(NS, 'circle');
    hit.setAttribute('cx', 100);
    hit.setAttribute('cy', 100);
    hit.setAttribute('r', R);
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'rgba(0,0,0,0)');
    hit.setAttribute('stroke-width', 16);
    hit.setAttribute('stroke-dasharray', `${Math.max(len, 0.5)} ${C - Math.max(len, 0.5)}`);
    hit.setAttribute('stroke-dashoffset', String(-acc));
    hit.setAttribute('transform', 'rotate(-90 100 100)');
    hit.setAttribute('style', 'pointer-events:stroke;cursor:default');
    svg.appendChild(hit);

    const pct = ((seg.v / total) * 100).toFixed(1);
    hit.addEventListener('mouseenter', () => {
      tip.innerHTML = `<b>${esc(seg.name)}</b> ¥${fmtYuan(seg.v)}（${pct}%）`;
      tip.classList.remove('hidden');
    });
    hit.addEventListener('mousemove', (ev) => {
      tip.style.left = ev.clientX + 14 + 'px';
      tip.style.top = ev.clientY + 14 + 'px';
    });
    hit.addEventListener('mouseleave', () => tip.classList.add('hidden'));

    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-chip" style="background:${seg.color}"></span><span class="legend-name">${esc(seg.name)}</span><span class="legend-val">¥${fmtYuan(seg.v)} · ${pct}%</span>`;
    legend.appendChild(item);
    acc += len;
  }
}

// 排行：所有有账的分类，条长按最大分类等比缩放
function renderRank(sorted, total) {
  const el = $('rank-list');
  el.innerHTML = '';
  if (sorted.length === 0) {
    el.innerHTML = '<div class="legend-empty">本月还没有账单</div>';
    return;
  }
  const max = sorted[0][1];
  sorted.forEach(([name, v], i) => {
    const pct = ((v / total) * 100).toFixed(1);
    const item = document.createElement('div');
    item.className = 'rank-item';
    item.innerHTML = `
      <div class="rank-head">
        <span class="rank-idx">${i + 1}</span>
        <span class="rank-name">${esc(name)}</span>
        <span class="rank-val">¥${fmtYuan(v)} · ${pct}%</span>
      </div>
      <div class="rank-bar-track"><div class="rank-bar" style="width:${((v / max) * 100).toFixed(1)}%;background:${catColor(name)}"></div></div>`;
    el.appendChild(item);
  });
}

// ===== 分类管理（v1.1 自定义分类）=====
let pendingCatDel = null; // {type:'cat1', cat1} | {type:'cat2', cat1, cat2}
let catInputState = null; // {mode:'add1'} | {mode:'add2', cat1} | {mode:'rename1', cat1} | {mode:'rename2', cat1, cat2}

function renderCatManager() {
  const el = $('cat-list');
  el.innerHTML = '';
  const names = Object.keys(categories);
  if (names.length === 0) {
    el.innerHTML = '<div class="empty">还没有分类，点右上角「添加一级分类」</div>';
    return;
  }
  for (const cat1 of names) {
    const subs = categories[cat1] || [];
    const n1 = allExpenses.filter((e) => e.cat1 === cat1).length;
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.innerHTML = `
      <div class="cat-card-head">
        <span class="cat-dot" style="background:${catColor(cat1)}"></span>
        <span class="cat-name">${esc(cat1)}</span>
        <span class="cat-bill-hint">${n1 > 0 ? n1 + ' 笔账单' : ''}</span>
        <span class="cat-head-spacer"></span>
        <button class="mini-btn" data-act="rename1">改名</button>
        <button class="mini-btn danger" data-act="del1">删除</button>
      </div>
      <div class="cat-subs">
        ${subs
          .map(
            (s) =>
              `<span class="cat-chip">${esc(s)}<button class="chip-x" data-act="del2" data-sub="${esc(s)}" title="删除小类">×</button></span>`
          )
          .join('')}
        <span class="cat-chip cat-chip-add" data-act="add2">+ 添加小类</span>
      </div>`;
    card.querySelector('[data-act="rename1"]').addEventListener('click', () => openCatInput('rename1', cat1));
    card.querySelector('[data-act="del1"]').addEventListener('click', () => confirmDelCat1(cat1));
    card.querySelector('[data-act="add2"]').addEventListener('click', () => openCatInput('add2', cat1));
    card.querySelectorAll('[data-act="del2"]').forEach((btn) => {
      btn.addEventListener('click', () => confirmDelCat2(cat1, btn.dataset.sub));
    });
    el.appendChild(card);
  }
}

function billCount2(cat1, cat2) {
  return allExpenses.filter((e) => e.cat1 === cat1 && e.cat2 === cat2).length;
}

function openCatInput(mode, cat1, cat2) {
  catInputState = { mode, cat1, cat2 };
  const t = $('cat-modal-title');
  const text = $('cat-modal-text');
  const input = $('cat-modal-input');
  if (mode === 'add1') {
    t.textContent = '添加一级分类';
    text.textContent = '新分类会自动带一个小类「其他」，随后可再添加更多小类。';
    input.value = '';
  } else if (mode === 'add2') {
    t.textContent = `给「${cat1}」添加小类`;
    text.textContent = '';
    input.value = '';
  } else if (mode === 'rename1') {
    t.textContent = `修改「${cat1}」的名称`;
    const n = allExpenses.filter((e) => e.cat1 === cat1).length;
    text.textContent = n > 0 ? `改名后，已有 ${n} 笔账单会一起改成新名字。` : '该分类下还没有账单。';
    input.value = cat1;
  } else if (mode === 'rename2') {
    t.textContent = `修改「${cat2}」的名称`;
    const n = billCount2(cat1, cat2);
    text.textContent = n > 0 ? `改名后，已有 ${n} 笔账单会一起改成新名字。` : '该小类下还没有账单。';
    input.value = cat2;
  }
  $('modal-cat').classList.remove('hidden');
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
}

function confirmDelCat1(cat1) {
  pendingCatDel = { type: 'cat1', cat1 };
  const n = allExpenses.filter((e) => e.cat1 === cat1).length;
  $('modal-text').textContent =
    n > 0
      ? `删除「${cat1}」后，已有 ${n} 笔账单会保留原分类文字，照常显示和统计，只是以后记账不能再选它。确定删除？`
      : `该分类下没有账单。确定删除「${cat1}」？`;
  $('modal-ok').textContent = '删除';
  $('modal').classList.remove('hidden');
}

function confirmDelCat2(cat1, cat2) {
  pendingCatDel = { type: 'cat2', cat1, cat2 };
  const n = billCount2(cat1, cat2);
  $('modal-text').textContent =
    n > 0
      ? `删除「${cat2}」后，已有 ${n} 笔账单会保留原分类文字，照常显示和统计，只是以后记账不能再选它。确定删除？`
      : `该小类下没有账单。确定删除「${cat2}」？`;
  $('modal-ok').textContent = '删除';
  $('modal').classList.remove('hidden');
}

// 分类变动后：重载分类清单与账单（改名会同步改账单文字）、
// 保住下拉框当前选择、刷新相关页面
async function refreshCategories() {
  categories = await window.api.getCategories();
  allExpenses = await window.api.listExpenses();
  const names = Object.keys(categories);
  const cur1 = $('cat1').value;
  const keep1 = names.includes(cur1) ? cur1 : names[0];
  fillCat1(keep1);
  const subs = categories[keep1] || [];
  const keep2 = subs.includes($('cat2').value) ? $('cat2').value : subs[0];
  fillCat2(keep1, keep2);
  fillFilterCat();
  refreshMonthOptions();
  renderList();
  renderCatManager();
  renderStats();
}

// ===== 2048 小游戏 =====
let gameBoard = []; // 16 个格子，0 = 空
let gameScore = 0;
let gameBest = 0;
let gameWon = false; // 是否已达成 2048（提示一次后继续玩）
let gameOverFlag = false;

function gameInit() {
  gameBoard = new Array(16).fill(0);
  gameScore = 0;
  gameWon = false;
  gameOverFlag = false;
  gameBest = Number(localStorage.getItem('game2048-best') || 0);
  $('game-best').textContent = gameBest;
  $('game-over').classList.add('hidden');
  gameSpawn();
  gameSpawn();
  gameRender();
}

// 随机挑一个空格放 2（90%）或 4（10%）
function gameSpawn() {
  const empty = [];
  gameBoard.forEach((v, i) => {
    if (v === 0) empty.push(i);
  });
  if (empty.length === 0) return;
  gameBoard[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
}

function gameRender() {
  const el = $('game-board');
  el.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const cell = document.createElement('div');
    const v = gameBoard[i];
    cell.className = 'game-cell' + (v > 0 ? (v <= 2048 ? ' t' + v : ' t-super') : '');
    cell.textContent = v > 0 ? String(v) : '';
    el.appendChild(cell);
  }
  $('game-score').textContent = String(gameScore);
  if (gameScore > gameBest) {
    gameBest = gameScore;
    localStorage.setItem('game2048-best', String(gameBest));
    $('game-best').textContent = String(gameBest);
  }
}

// 方向 → 取格坐标：把棋盘按方向拆成 4 条线（k = 第几条，t = 线上第几个）
function gameCellAt(k, t, dir) {
  if (dir === 'left') return [k, t];
  if (dir === 'right') return [k, 3 - t];
  if (dir === 'up') return [t, k];
  return [3 - t, k]; // down
}

// 一条线向起点靠拢 + 相邻相同合并一次
function gameSlide(line) {
  const nums = line.filter((v) => v > 0);
  const out = [];
  let gained = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      out.push(nums[i] * 2);
      gained += nums[i] * 2;
      i++;
    } else {
      out.push(nums[i]);
    }
  }
  while (out.length < 4) out.push(0);
  return { arr: out, gained, changed: line.join(',') !== out.join(',') };
}

function gameCanMove() {
  for (let i = 0; i < 16; i++) if (gameBoard[i] === 0) return true;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      if (gameBoard[r * 4 + c] === gameBoard[r * 4 + c + 1]) return true;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++)
      if (gameBoard[r * 4 + c] === gameBoard[(r + 1) * 4 + c]) return true;
  return false;
}

function gameMove(dir) {
  if (gameOverFlag) return;
  const lines = [];
  for (let k = 0; k < 4; k++) {
    const line = [];
    for (let t = 0; t < 4; t++) {
      const [r, c] = gameCellAt(k, t, dir);
      line.push(gameBoard[r * 4 + c]);
    }
    lines.push(gameSlide(line));
  }
  if (!lines.some((l) => l.changed)) return; // 动不了就不算一步
  for (let k = 0; k < 4; k++) {
    for (let t = 0; t < 4; t++) {
      const [r, c] = gameCellAt(k, t, dir);
      gameBoard[r * 4 + c] = lines[k].arr[t];
    }
  }
  gameScore += lines.reduce((s, l) => s + l.gained, 0);
  gameSpawn();
  gameRender();
  if (!gameWon && Math.max(...gameBoard) >= 2048) {
    gameWon = true;
    showToast('恭喜达成 2048！可以继续挑战更高分');
  }
  if (!gameCanMove()) {
    gameOverFlag = true;
    $('game-over').classList.remove('hidden');
  }
}

// ===== 数据读写 =====
async function loadData() {
  allExpenses = await window.api.listExpenses();
  refreshMonthOptions();
  renderList();
  renderStats();
}

// ===== 事件绑定 =====
function bindEvents() {
  // 记一笔
  $('cat1').addEventListener('change', () => {
    fillCat2($('cat1').value, (categories[$('cat1').value] || [])[0]);
  });
  $('save').addEventListener('click', handleSave);
  $('cancel-edit').addEventListener('click', resetForm);
  $('amount').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSave();
  });

  // 标签页
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  // 筛选
  for (const id of ['filter-month', 'filter-cat', 'filter-search']) {
    $(id).addEventListener('input', renderList);
  }

  // 备份
  $('btn-export').addEventListener('click', async () => {
    const res = await window.api.exportCsv();
    if (res && res.ok) showToast('已导出：' + res.path);
  });
  $('btn-open-folder').addEventListener('click', async () => {
    await window.api.openDataFolder();
    showToast('已打开数据文件夹，复制「data.db」即可备份');
  });

  // 统计月份切换
  $('month-prev').addEventListener('click', () => shiftStatsMonth(-1));
  $('month-next').addEventListener('click', () => shiftStatsMonth(1));
  $('stats-month').addEventListener('change', renderStats);

  // 删除确认弹窗（账单删除 / 分类删除共用）
  $('modal-cancel').addEventListener('click', () => {
    pendingCatDel = null;
    $('modal').classList.add('hidden');
  });
  $('modal-ok').addEventListener('click', async () => {
    if (pendingCatDel) {
      const d = pendingCatDel;
      pendingCatDel = null;
      $('modal').classList.add('hidden');
      const res =
        d.type === 'cat1'
          ? await window.api.deleteCat1(d.cat1)
          : await window.api.deleteCat2(d.cat1, d.cat2);
      showToast(res && res.ok ? '已删除分类' : (res && res.msg) || '删除失败');
      await refreshCategories();
      return;
    }
    if (pendingDeleteId == null) return;
    await window.api.deleteExpense(pendingDeleteId);
    pendingDeleteId = null;
    $('modal').classList.add('hidden');
    showToast('已删除');
    await loadData();
  });

  // 分类管理页
  $('btn-add-cat1').addEventListener('click', () => openCatInput('add1'));
  $('btn-restore-defaults').addEventListener('click', async () => {
    const res = await window.api.restoreDefaults();
    showToast(res && res.added > 0 ? `已补回 ${res.added} 个默认分类` : '默认分类都在，无需恢复');
    await refreshCategories();
  });

  // 分类输入弹窗（添加/改名）
  $('cat-modal-cancel').addEventListener('click', () => {
    catInputState = null;
    $('modal-cat').classList.add('hidden');
  });
  $('cat-modal-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('cat-modal-ok').click();
  });
  $('cat-modal-ok').addEventListener('click', async () => {
    const s = catInputState;
    if (!s) return;
    const val = $('cat-modal-input').value.trim();
    if (!val) {
      showToast('请输入名称');
      return;
    }
    let res;
    if (s.mode === 'add1') res = await window.api.addCat1(val);
    else if (s.mode === 'add2') res = await window.api.addCat2(s.cat1, val);
    else if (s.mode === 'rename1') res = await window.api.renameCat1(s.cat1, val);
    else res = await window.api.renameCat2(s.cat1, s.cat2, val);
    if (res && res.ok) {
      $('modal-cat').classList.add('hidden');
      catInputState = null;
      showToast(s.mode === 'rename1' || s.mode === 'rename2' ? '已改名' : '已添加');
      await refreshCategories();
    } else {
      showToast((res && res.msg) || '操作失败');
    }
  });

  // 2048 小游戏
  document.querySelectorAll('.game-btn').forEach((b) => {
    b.addEventListener('click', () => gameMove(b.dataset.dir));
  });
  $('btn-game-new').addEventListener('click', gameInit);
  $('btn-game-restart').addEventListener('click', gameInit);
  document.addEventListener('keydown', (e) => {
    // 只在游戏页响应方向键，避免干扰其他页面的输入框
    if ($('view-game').classList.contains('hidden')) return;
    const map = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      KeyW: 'up',
      KeyS: 'down',
      KeyA: 'left',
      KeyD: 'right'
    };
    const dir = map[e.code];
    if (!dir) return;
    e.preventDefault();
    gameMove(dir);
  });
}

// ===== 启动 =====
(async function init() {
  categories = await window.api.getCategories();
  const names = Object.keys(categories);
  const lastCat1 = localStorage.getItem('lastCat1');
  const validCat1 = lastCat1 && categories[lastCat1] ? lastCat1 : names[0];
  const lastCat2 = localStorage.getItem('lastCat2');
  const validCat2 =
    validCat1 && lastCat2 && (categories[validCat1] || []).includes(lastCat2)
      ? lastCat2
      : (categories[validCat1] || [])[0];
  fillCat1(validCat1);
  fillCat2(validCat1, validCat2);
  $('date').value = todayStr();
  $('stats-month').value = todayStr().slice(0, 7);
  fillFilterCat();
  bindEvents();
  gameInit();
  loadData();
})();
