const { contextBridge, ipcRenderer } = require('electron');

// 向界面暴露安全的记账接口（界面代码无法直接碰数据库）
contextBridge.exposeInMainWorld('api', {
  addExpense: (exp) => ipcRenderer.invoke('expenses:add', exp),
  listExpenses: () => ipcRenderer.invoke('expenses:list'),
  updateExpense: (exp) => ipcRenderer.invoke('expenses:update', exp),
  deleteExpense: (id) => ipcRenderer.invoke('expenses:delete', id),
  exportCsv: () => ipcRenderer.invoke('expenses:export-csv'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  // 分类管理（v1.1）
  getCategories: () => ipcRenderer.invoke('categories:list'),
  addCat1: (name) => ipcRenderer.invoke('categories:add-cat1', name),
  addCat2: (cat1, name) => ipcRenderer.invoke('categories:add-cat2', cat1, name),
  renameCat1: (oldName, newName) => ipcRenderer.invoke('categories:rename-cat1', oldName, newName),
  renameCat2: (cat1, oldName, newName) => ipcRenderer.invoke('categories:rename-cat2', cat1, oldName, newName),
  deleteCat1: (name) => ipcRenderer.invoke('categories:delete-cat1', name),
  deleteCat2: (cat1, name) => ipcRenderer.invoke('categories:delete-cat2', cat1, name),
  restoreDefaults: () => ipcRenderer.invoke('categories:restore-defaults'),
  // 应用设置（如游戏最高分，存账本文件）
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value)
});
