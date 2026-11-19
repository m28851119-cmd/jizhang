// —— 两级分类数据（与 CLAUDE.md 分类体系一致）——
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
  '其他支出': ['其他支出']
};

const $ = (id) => document.getElementById(id);

const cat1El = $('cat1');
const cat2El = $('cat2');
const amountEl = $('amount');
const dateEl = $('date');
const payEl = $('pay');
const noteEl = $('note');
const saveBtn = $('save');
const cancelEditBtn = $('cancel-edit');
const toastEl = $('toast');

let editingId = null; // 正在修改的账单 id（null = 新增模式）
let expenses = []; // 当前账单缓存

// —— 初始化表单 ——
for (const name of Object.keys(CATEGORIES)) {
  const opt = document.createElement('option');
  opt.textContent = name;
  cat1El.appendChild(opt);
}

function fillCat2() {
  cat2El.innerHTML = '';
  for (const sub of CATEGORIES[cat1El.value]) {
    const opt = document.createElement('option');
    opt.textContent = sub;
    cat2El.appendChild(opt);
  }
}
cat1El.addEventListener('change', () => {
  fillCat2();
  if (!editingId) localStorage.setItem('lastCat1', cat1El.value);
});
fillCat2();

// 默认记住上次使用的分类
const lastCat1 = localStorage.getItem('lastCat1');
if (lastCat1 && CATEGORIES[lastCat1]) cat1El.value = lastCat1;
fillCat2();
const lastCat2 = localStorage.getItem('lastCat2');
if (lastCat2 && CATEGORIES[cat1El.value].includes(lastCat2)) cat2El.value = lastCat2;
cat2El.addEventListener('change', () => {
  if (!editingId) localStorage.setItem('lastCat2', cat2El.value);
});

// 日期默认今天
function setToday() {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  dateEl.value = `${y}-${m}-${d}`;
}
setToday();

// —— 小工具 ——
let toastTimer;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2200);
}

function fmtMoney(cents) {
  return '¥' + (cents / 100).toFixed(2);
}

function dateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (d.getFullYear() === today.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// —— 页签切换 ——
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $('view-add').classList.toggle('hidden', name !== 'add');
  $('view-list').classList.toggle('hidden', name !== 'list');
  if (name === 'list') renderList();
}
document.querySelectorAll('.tab:not([disabled])').forEach((t) => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

// —— 保存（新增 / 修改）——
async function handleSave() {
  const value = parseFloat(amountEl.value);
  if (!isFinite(value) || value <= 0) {
    showToast('请输入正确的金额');
    amountEl.focus();
    return;
  }
  const exp = {
    amountCents: Math.round(value * 100),
    cat1: cat1El.value,
    cat2: cat2El.value,
    date: dateEl.value || undefined,
    note: noteEl.value.trim(),
    payMethod: payEl.value
  };

  if (editingId) {
    exp.id = editingId;
    await window.api.updateExpense(exp);
    showToast('已保存修改');
  } else {
    await window.api.addExpense(exp);
    showToast('已记下这笔账');
  }

  // 记住分类
  localStorage.setItem('lastCat1', cat1El.value);
  localStorage.setItem('lastCat2', cat2El.value);

  // 重置表单
  editingId = null;
  amountEl.value = '';
  noteEl.value = '';
  setToday();
  saveBtn.textContent = '保存这笔账';
  cancelEditBtn.classList.add('hidden');
  amountEl.focus();

  await refreshList();
}
saveBtn.addEventListener('click', handleSave);
noteEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSave();
});

// 取消修改
cancelEditBtn.addEventListener('click', () => {
  editingId = null;
  amountEl.value = '';
  noteEl.value = '';
  setToday();
  saveBtn.textContent = '保存这笔账';
  cancelEditBtn.classList.add('hidden');
  showToast('已取消修改');
});

// —— 账单列表 ——
async function refreshList() {
  try {
    expenses = await window.api.listExpenses();
  } catch (err) {
    showToast('读取账单失败：' + (err && err.message ? err.message : err));
    return;
  }
  renderList();
}

function renderList() {
  const listEl = $('list');
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 本月汇总
  let monthSum = 0;
  let monthCount = 0;
  for (const e of expenses) {
    if (e.date && e.date.startsWith(thisMonth)) {
      monthSum += e.amount_cents;
      monthCount++;
    }
  }
  const bar = $('summary-bar');
  if (monthCount > 0) {
    bar.innerHTML = `${now.getFullYear()}年${now.getMonth() + 1}月 · 共 ${monthCount} 笔 · 合计 <strong>${fmtMoney(monthSum)}</strong>`;
  } else {
    bar.innerHTML = '本月还没有账单';
  }

  // 按日期分组
  if (expenses.length === 0) {
    listEl.innerHTML = '<div class="empty">还没有账单，记下第一笔吧</div>';
    return;
  }

  let html = '';

  // 先按日期分组（expenses 已按日期倒序）
  const groups = [];
  for (const e of expenses) {
    const g = groups[groups.length - 1];
    if (!g || g.date !== e.date) groups.push({ date: e.date, items: [] });
    groups[groups.length - 1].items.push(e);
  }

  for (const g of groups) {
    const daySum = g.items.reduce((s, e) => s + e.amount_cents, 0);
    html += `<div class="day-header"><span>${dateLabel(g.date)}</span><span class="day-sum">合计 ${fmtMoney(daySum)}</span></div>`;
    for (const e of g.items) {
      const meta = [e.pay_method, e.note].filter(Boolean).join(' · ');
      html += `
        <div class="expense-row" data-id="${e.id}">
          <div class="row-main">
            <div class="row-cat">${e.cat1} · ${e.cat2}</div>
            ${meta ? `<div class="row-meta">${meta}</div>` : ''}
          </div>
          <div class="row-right">
            <div class="row-amount">-${fmtMoney(e.amount_cents)}</div>
            <div class="row-actions">
              <button class="mini-btn" data-act="edit">编辑</button>
              <button class="mini-btn danger-text" data-act="del">删除</button>
            </div>
          </div>
        </div>`;
    }
  }
  listEl.innerHTML = html;
}

// 列表操作（编辑 / 删除）
$('list').addEventListener('click', (e) => {
  const btn = e.target.closest('.mini-btn');
  if (!btn) return;
  const row = btn.closest('.expense-row');
  const id = Number(row.dataset.id);
  const exp = expenses.find((x) => x.id === id);
  if (!exp) return;

  if (btn.dataset.act === 'edit') {
    // 载入表单
    editingId = id;
    amountEl.value = (exp.amount_cents / 100).toFixed(2);
    cat1El.value = exp.cat1;
    fillCat2();
    cat2El.value = exp.cat2;
    dateEl.value = exp.date;
    payEl.value = exp.pay_method || '微信';
    noteEl.value = exp.note || '';
    saveBtn.textContent = '保存修改';
    cancelEditBtn.classList.remove('hidden');
    switchTab('add');
  } else if (btn.dataset.act === 'del') {
    // 确认弹窗
    $('modal-text').textContent = `删除「${exp.cat1} · ${exp.cat2}」${fmtMoney(exp.amount_cents)}（${dateLabel(exp.date)}）这笔账？删除后无法恢复。`;
    $('modal').classList.remove('hidden');
    $('modal-ok').onclick = async () => {
      $('modal').classList.add('hidden');
      await window.api.deleteExpense(id);
      showToast('已删除');
      await refreshList();
    };
    $('modal-cancel').onclick = () => $('modal').classList.add('hidden');
  }
});

// —— 启动：读取账单 ——
refreshList();
