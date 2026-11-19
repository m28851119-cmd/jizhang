const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { DatabaseSync } = require('node:sqlite');

let db;
let dataDir;

// 出厂分类清单（v1.1 起用户可在软件内增删改；此清单仅用于首次建库和「恢复默认分类」）
const DEFAULT_CATEGORIES = {
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

// 初始化数据库：数据文件放在「我的文档\我要记账数据\data.db」
function initDb() {
  dataDir = path.join(app.getPath('documents'), '我要记账数据');
  fs.mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(path.join(dataDir, 'data.db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount_cents INTEGER NOT NULL,
      cat1 TEXT NOT NULL,
      cat2 TEXT NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      pay_method TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  // v1.1：分类清单表（用户可增删改）；账单里仍只存分类文字
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      cat1 TEXT NOT NULL,
      cat2 TEXT NOT NULL,
      PRIMARY KEY (cat1, cat2)
    )
  `);
  const n = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (n === 0) seedDefaultCategories();
  // 应用设置表（如游戏最高分）：与账本同文件，备份 data.db 即全备份
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

function seedDefaultCategories() {
  const ins = db.prepare('INSERT OR IGNORE INTO categories (cat1, cat2) VALUES (?, ?)');
  for (const [cat1, subs] of Object.entries(DEFAULT_CATEGORIES)) {
    for (const cat2 of subs) ins.run(cat1, cat2);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: '我要记账',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// —— 数据存取通道（界面通过 window.api 调用）——
ipcMain.handle('expenses:add', (e, exp) => {
  const r = db
    .prepare('INSERT INTO expenses (amount_cents, cat1, cat2, date, note, pay_method) VALUES (?, ?, ?, ?, ?, ?)')
    .run(exp.amountCents, exp.cat1, exp.cat2, exp.date, exp.note, exp.payMethod);
  return { id: Number(r.lastInsertRowid) };
});

ipcMain.handle('expenses:list', () => {
  return db.prepare('SELECT * FROM expenses ORDER BY date DESC, id DESC').all();
});

ipcMain.handle('expenses:update', (e, exp) => {
  db.prepare('UPDATE expenses SET amount_cents=?, cat1=?, cat2=?, date=?, note=?, pay_method=? WHERE id=?')
    .run(exp.amountCents, exp.cat1, exp.cat2, exp.date, exp.note, exp.payMethod, exp.id);
  return { ok: true };
});

ipcMain.handle('expenses:delete', (e, id) => {
  db.prepare('DELETE FROM expenses WHERE id=?').run(id);
  return { ok: true };
});

// —— 分类管理通道（v1.1 自定义分类）——
function catsAsObject() {
  const rows = db.prepare('SELECT cat1, cat2 FROM categories ORDER BY rowid').all();
  const out = {};
  for (const r of rows) (out[r.cat1] = out[r.cat1] || []).push(r.cat2);
  return out;
}

function cleanName(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return { err: '名称不能为空' };
  if (s.length > 12) return { err: '名称不能超过 12 个字' };
  return { name: s };
}

ipcMain.handle('categories:list', () => catsAsObject());

// 添加一级分类：自动带一个小类「其他」（两层兜底设计）
ipcMain.handle('categories:add-cat1', (e, name) => {
  const r = cleanName(name);
  if (r.err) return { ok: false, msg: r.err };
  if (db.prepare('SELECT 1 FROM categories WHERE cat1=?').get(r.name)) return { ok: false, msg: '已存在同名一级分类' };
  db.prepare('INSERT INTO categories (cat1, cat2) VALUES (?, ?)').run(r.name, '其他');
  return { ok: true };
});

ipcMain.handle('categories:add-cat2', (e, cat1, name) => {
  const r = cleanName(name);
  if (r.err) return { ok: false, msg: r.err };
  if (!db.prepare('SELECT 1 FROM categories WHERE cat1=?').get(cat1)) return { ok: false, msg: '一级分类不存在' };
  if (db.prepare('SELECT 1 FROM categories WHERE cat1=? AND cat2=?').get(cat1, r.name)) return { ok: false, msg: '已存在同名小类' };
  db.prepare('INSERT INTO categories (cat1, cat2) VALUES (?, ?)').run(cat1, r.name);
  return { ok: true };
});

// 改名（一级/二级）：经界面确认后，已有账单文字同步更新
ipcMain.handle('categories:rename-cat1', (e, oldName, newName) => {
  const r = cleanName(newName);
  if (r.err) return { ok: false, msg: r.err };
  if (r.name === oldName) return { ok: true };
  if (db.prepare('SELECT 1 FROM categories WHERE cat1=?').get(r.name)) return { ok: false, msg: '已存在同名一级分类' };
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE categories SET cat1=? WHERE cat1=?').run(r.name, oldName);
    db.prepare('UPDATE expenses SET cat1=? WHERE cat1=?').run(r.name, oldName);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true };
});

ipcMain.handle('categories:rename-cat2', (e, cat1, oldName, newName) => {
  const r = cleanName(newName);
  if (r.err) return { ok: false, msg: r.err };
  if (r.name === oldName) return { ok: true };
  if (db.prepare('SELECT 1 FROM categories WHERE cat1=? AND cat2=?').get(cat1, r.name)) return { ok: false, msg: '已存在同名小类' };
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE categories SET cat2=? WHERE cat1=? AND cat2=?').run(r.name, cat1, oldName);
    db.prepare('UPDATE expenses SET cat2=? WHERE cat1=? AND cat2=?').run(r.name, cat1, oldName);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true };
});

// 删除分类：账单保留原分类文字（用户拍板），照常显示与统计
ipcMain.handle('categories:delete-cat1', (e, name) => {
  const thisCat = db.prepare('SELECT COUNT(*) AS c FROM categories WHERE cat1=?').get(name).c;
  if (thisCat === 0) return { ok: false, msg: '分类不存在' };
  const total = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (total - thisCat < 1) return { ok: false, msg: '至少要保留一个一级分类' };
  db.prepare('DELETE FROM categories WHERE cat1=?').run(name);
  return { ok: true };
});

ipcMain.handle('categories:delete-cat2', (e, cat1, name) => {
  const subs = db.prepare('SELECT COUNT(*) AS c FROM categories WHERE cat1=?').get(cat1).c;
  if (subs <= 1) return { ok: false, msg: '每个一级分类至少要保留一个小类' };
  db.prepare('DELETE FROM categories WHERE cat1=? AND cat2=?').run(cat1, name);
  return { ok: true };
});

// 恢复默认分类：把出厂清单中缺失的补回来（已有改名的不动）
ipcMain.handle('categories:restore-defaults', () => {
  const ins = db.prepare('INSERT OR IGNORE INTO categories (cat1, cat2) VALUES (?, ?)');
  let added = 0;
  for (const [cat1, subs] of Object.entries(DEFAULT_CATEGORIES)) {
    for (const cat2 of subs) added += Number(ins.run(cat1, cat2).changes);
  }
  return { ok: true, added };
});

// 导出全部账单为 CSV（Excel 可直接打开；带 BOM 保证中文不乱码）
function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

ipcMain.handle('expenses:export-csv', async () => {
  const rows = db
    .prepare('SELECT date, cat1, cat2, amount_cents, pay_method, note FROM expenses ORDER BY date DESC, id DESC')
    .all();
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出账单',
    defaultPath: path.join(app.getPath('documents'), `我要记账-账单导出-${today}.csv`),
    filters: [{ name: 'CSV 表格', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { canceled: true };

  const lines = [['日期', '一级分类', '二级分类', '金额(元)', '支付方式', '备注'].join(',')];
  for (const r of rows) {
    lines.push(
      [r.date, r.cat1, r.cat2, (r.amount_cents / 100).toFixed(2), r.pay_method, r.note]
        .map(csvEscape)
        .join(',')
    );
  }
  fs.writeFileSync(filePath, '﻿' + lines.join('\r\n'), 'utf-8');
  return { ok: true, path: filePath };
});

// 打开数据文件夹（方便用户备份）
ipcMain.handle('app:open-data-folder', () => {
  shell.openPath(dataDir);
  return { ok: true };
});

// —— 应用设置通道（键值对，如游戏最高分）——
ipcMain.handle('settings:get', (e, key) => {
  const r = db.prepare('SELECT value FROM app_settings WHERE key=?').get(String(key));
  return r ? r.value : null;
});

ipcMain.handle('settings:set', (e, key, value) => {
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(String(key), String(value));
  return { ok: true };
});

app.whenReady().then(() => {
  try {
    initDb();
  } catch (err) {
    dialog.showErrorBox('数据初始化失败', String((err && err.message) || err));
    app.quit();
    return;
  }
  createWindow();

  // macOS：点击 Dock 图标且没有窗口时重新开窗
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 关闭所有窗口时退出
app.on('window-all-closed', () => {
  app.quit();
});
