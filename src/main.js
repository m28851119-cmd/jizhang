const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { DatabaseSync } = require('node:sqlite');

let db;
let dataDir;

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
