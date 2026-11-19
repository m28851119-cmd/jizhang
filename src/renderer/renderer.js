// ===== 分类体系（与 CLAUDE.md 第 5 节一致）=====
const CATEGORIES = {
  '餐饮饮食': ['早餐', '午餐', '晚餐', '夜宵', '买菜做饭', '零食水果', '咖啡奶茶', '外卖', '其他'],
  '交通出行': ['公交地铁', '打车', '火车高铁', '飞机', '加油充电', '停车费', '共享单车', '其他'],
  '购物消费': ['服饰鞋包', '数码家电', '日用百货', '美妆个护', '烟酒', '宠物相关', '母婴用品', '其他'],
  '居住日常': ['房租房贷', '水电燃气', '物业费', '家具家居', '维修保养', '家政保洁', '其他'],
  '通讯网络': ['手机话费', '宽带网络', '影音会员', '软件订阅', '其他'],
  '娱乐休闲': ['电影演出', '游戏充值', '运动健身', '旅游度假', 'KTV酒吧', '其他'],
  '医疗健康': ['看病买药', '体检', '牙科', '保健品', '其他'],
  '教育学习': ['学费培训', '考试报名', '教材书籍', '文具用品', '其他'],
  '人情往来': ['请客送礼', '红包礼金', '孝敬长辈', '慈善捐款', '其他'],
  '金融保险': ['保险', '银行手续费', '利息还款', '其他'],
  '其他支出': ['无法归类的支出']
};

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
  for (const name of Object.keys(CATEGORIES)) {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    if (name === selected) o.selected = true;
    sel.appendChild(o);
  }
}

function fillCat2(cat1, selected) {
  const sel = $('cat2');
  sel.innerHTML = '';
  const subs = CATEGORIES[cat1] || [];
  for (const s of subs) {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = s;
    if (s === selected) o.selected = true;
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
  for (const k of ['add', 'list', 'stats']) {
    $('view-' + k).classList.toggle('hidden', k !== name);
  }
  if (name === 'stats') renderStats();
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
    Object.keys(CATEGORIES).map((c) => `<option value="${c}">${c}</option>`).join('');
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
    fillCat2($('cat1').value, CATEGORIES[$('cat1').value][0]);
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

  // 删除确认弹窗
  $('modal-cancel').addEventListener('click', () => $('modal').classList.add('hidden'));
  $('modal-ok').addEventListener('click', async () => {
    if (pendingDeleteId == null) return;
    await window.api.deleteExpense(pendingDeleteId);
    pendingDeleteId = null;
    $('modal').classList.add('hidden');
    showToast('已删除');
    await loadData();
  });
}

// ===== 启动 =====
(function init() {
  const lastCat1 = localStorage.getItem('lastCat1');
  const validCat1 = lastCat1 && CATEGORIES[lastCat1] ? lastCat1 : '餐饮饮食';
  const lastCat2 = localStorage.getItem('lastCat2');
  fillCat1(validCat1);
  fillCat2(validCat1, lastCat2 && CATEGORIES[validCat1].includes(lastCat2) ? lastCat2 : CATEGORIES[validCat1][0]);
  $('date').value = todayStr();
  $('stats-month').value = todayStr().slice(0, 7);
  fillFilterCat();
  bindEvents();
  loadData();
})();
