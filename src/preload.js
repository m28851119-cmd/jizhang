const { contextBridge, ipcRenderer } = require('electron');

// 向界面暴露安全的记账接口（界面代码无法直接碰数据库）
contextBridge.exposeInMainWorld('api', {
  addExpense: (exp) => ipcRenderer.invoke('expenses:add', exp),
  listExpenses: () => ipcRenderer.invoke('expenses:list'),
  updateExpense: (exp) => ipcRenderer.invoke('expenses:update', exp),
  deleteExpense: (id) => ipcRenderer.invoke('expenses:delete', id),
  exportCsv: () => ipcRenderer.invoke('expenses:export-csv'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder')
});
