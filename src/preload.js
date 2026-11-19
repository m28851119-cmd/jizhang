const { contextBridge } = require('electron');

// 预留通道：后续「数据存取」功能在这里向界面暴露安全的接口
contextBridge.exposeInMainWorld('app', {});
