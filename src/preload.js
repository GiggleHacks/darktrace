const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scanner', {
  // Feroxbuster
  getWordlists: () => ipcRenderer.invoke('get-wordlists'),
  selectWordlist: () => ipcRenderer.invoke('select-wordlist'),
  checkFeroxbuster: () => ipcRenderer.invoke('check-feroxbuster'),
  countWordlist: (filePath) => ipcRenderer.invoke('count-wordlist', filePath),
  testConnection: (url) => ipcRenderer.invoke('test-connection', url),
  startScan: (config) => ipcRenderer.invoke('start-scan', config),
  abortScan: () => ipcRenderer.invoke('abort-scan'),
  onScanData: (callback) => {
    ipcRenderer.removeAllListeners('scan-data');
    ipcRenderer.on('scan-data', (_e, data) => callback(data));
  },
  onScanComplete: (callback) => {
    ipcRenderer.removeAllListeners('scan-complete');
    ipcRenderer.on('scan-complete', (_e, code, msg) => callback(code, msg));
  },
  resizeScanPty: (cols, rows) => ipcRenderer.invoke('resize-scan-pty', cols, rows),

  // Maigret
  checkMaigret: () => ipcRenderer.invoke('check-maigret'),
  startMaigret: (config) => ipcRenderer.invoke('start-maigret', config),
  abortMaigret: () => ipcRenderer.invoke('abort-maigret'),
  onMaigretLine: (callback) => {
    ipcRenderer.removeAllListeners('maigret-line');
    ipcRenderer.on('maigret-line', (_e, line) => callback(line));
  },
  onMaigretError: (callback) => {
    ipcRenderer.removeAllListeners('maigret-stderr');
    ipcRenderer.on('maigret-stderr', (_e, text) => callback(text));
  },
  onMaigretComplete: (callback) => {
    ipcRenderer.removeAllListeners('maigret-complete');
    ipcRenderer.on('maigret-complete', (_e, code, msg) => callback(code, msg));
  },

  // Holehe
  startHolehe: (config) => ipcRenderer.invoke('start-holehe', config),
  abortHolehe: () => ipcRenderer.invoke('abort-holehe'),
  onHoleheLine: (callback) => {
    ipcRenderer.removeAllListeners('holehe-line');
    ipcRenderer.on('holehe-line', (_e, line) => callback(line));
  },
  onHoleheComplete: (callback) => {
    ipcRenderer.removeAllListeners('holehe-complete');
    ipcRenderer.on('holehe-complete', (_e, code, msg) => callback(code, msg));
  },

  // Shared
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
