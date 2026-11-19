const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { DatabaseSync } = require('node:sqlite');

let db;

// 初始化数据库：数据文件放在「我的文档\我要记账数据\data.db」
function initDb() {
  const dir = path.join(app.getPath('documents'), '我要记账数据');
  fs.mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(path.join(dir, 'data.db'));
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
