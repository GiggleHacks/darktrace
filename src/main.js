const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const pty = require('node-pty');

let mainWindow = null;
let scanProcess = null;
let maigretProcess = null;
let holeheProcess = null;
let windowDestroyed = false;

function safeSend(sender, ...args) {
  try {
    if (!windowDestroyed && sender && !sender.isDestroyed()) {
      sender.send(...args);
    }
  } catch {}
}

function getWordlistDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'wordlists');
  }
  return path.join(__dirname, '..', 'wordlists');
}

function getFeroxbusterPath() {
  const bundledName = process.platform === 'win32' ? 'feroxbuster.exe' : 'feroxbuster';
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', bundledName)
    : path.join(__dirname, '..', 'assets', 'bin', bundledName);
  if (fs.existsSync(bundled)) return bundled;
  return 'feroxbuster';
}

function getPythonPath() {
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, 'python', 'python.exe')
    : path.join(__dirname, '..', 'assets', 'python', 'python.exe');
  if (fs.existsSync(bundled)) return bundled;
  return 'python';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1190,
    height: 1050,
    minWidth: 800,
    minHeight: 700,
    backgroundColor: '#05080F',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => {
    windowDestroyed = true;
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

function killAllProcesses() {
  if (scanProcess) { try { scanProcess.kill(); } catch {} scanProcess = null; }
  if (maigretProcess) { try { maigretProcess.kill(); } catch {} maigretProcess = null; }
  if (holeheProcess) { try { holeheProcess.kill(); } catch {} holeheProcess = null; }
}

app.on('before-quit', killAllProcesses);

app.on('window-all-closed', () => {
  killAllProcesses();
  app.quit();
});

// --- Feroxbuster IPC ---

ipcMain.handle('get-wordlists', async () => {
  const dir = getWordlistDir();
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    return files.map(f => ({ name: f, path: path.join(dir, f) }));
  } catch { return []; }
});

ipcMain.handle('select-wordlist', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Wordlist',
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return { name: path.basename(result.filePaths[0]), path: result.filePaths[0] };
});

ipcMain.handle('check-feroxbuster', async () => {
  const feroxPath = getFeroxbusterPath();
  if (feroxPath !== 'feroxbuster') return true;
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execFile(cmd, ['feroxbuster'], (err) => resolve(!err));
  });
});

ipcMain.handle('test-connection', async (_event, url) => {
  const https = require('https');
  const http = require('http');
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 10000, rejectUnauthorized: false }, (res) => {
      req.destroy();
      resolve({ ok: true, status: res.statusCode });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Connection timed out' }); });
  });
});

ipcMain.handle('count-wordlist', async (_event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(l => l.trim()).length;
  } catch { return 0; }
});

ipcMain.handle('start-scan', async (event, config) => {
  if (scanProcess) return { error: 'Scan already running' };

  // Validate inputs
  if (!config.url || typeof config.url !== 'string' || !/^https?:\/\/.+/.test(config.url)) {
    return { error: 'Invalid target URL' };
  }
  if (!config.wordlistPath || typeof config.wordlistPath !== 'string' || !fs.existsSync(config.wordlistPath)) {
    return { error: 'Invalid wordlist path' };
  }

  const args = [
    '-u', config.url,
    '-w', config.wordlistPath,
    '-t', String(config.threads || 10),
    '--no-state', '--limit-bars', '3',
  ];
  if (config.statusCodes) args.push('-s', config.statusCodes);
  if (config.depth) args.push('-d', String(config.depth));

  try {
    scanProcess = pty.spawn(getFeroxbusterPath(), args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 8,
      cwd: process.cwd(),
      env: process.env,
    });
  } catch (err) {
    return { error: `Failed to start feroxbuster: ${err.message}` };
  }

  // PTY merges stdout+stderr into one stream — pipe it raw
  scanProcess.onData((data) => {
    safeSend(event.sender,'scan-data', data);
  });

  scanProcess.onExit(({ exitCode }) => {
    safeSend(event.sender,'scan-complete', exitCode);
    scanProcess = null;
  });

  return { ok: true };
});

ipcMain.handle('abort-scan', async () => {
  if (scanProcess) { scanProcess.kill(); scanProcess = null; return true; }
  return false;
});

ipcMain.handle('resize-scan-pty', async (_event, cols, rows) => {
  if (scanProcess) {
    try { scanProcess.resize(cols, rows); } catch {}
  }
});

// --- Maigret IPC ---

ipcMain.handle('check-maigret', async () => {
  const pythonPath = getPythonPath();
  return new Promise((resolve) => {
    execFile(pythonPath, ['-m', 'maigret', '--version'], (err) => resolve(!err));
  });
});

ipcMain.handle('start-maigret', async (event, config) => {
  if (maigretProcess) return { error: 'Username search already running' };

  // Validate username: alphanumeric, underscores, dots, hyphens only
  if (!config.username || typeof config.username !== 'string' || !/^[\w.\-]{1,64}$/.test(config.username)) {
    return { error: 'Invalid username. Use only letters, numbers, underscores, dots, and hyphens.' };
  }

  const pythonPath = getPythonPath();
  const args = [
    '-m', 'maigret',
    config.username,
    '--timeout', '15',
    '--no-color',
    '--no-progressbar',
    '--no-recursion',
  ];

  if (config.allSites) {
    args.push('-a');
  } else {
    args.push('--top-sites', String(config.topSites || 500));
  }

  try {
    maigretProcess = spawn(pythonPath, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
  } catch (err) {
    return { error: `Failed to start maigret: ${err.message}` };
  }

  let lineBuffer = '';
  maigretProcess.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString('utf-8');
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) safeSend(event.sender,'maigret-line', line.trim());
    }
  });

  maigretProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf-8').trim();
    if (text) safeSend(event.sender,'maigret-stderr', text);
  });

  maigretProcess.on('error', (err) => {
    safeSend(event.sender,'maigret-complete', -1, err.message);
    maigretProcess = null;
  });

  maigretProcess.on('close', (code) => {
    if (lineBuffer.trim()) safeSend(event.sender,'maigret-line', lineBuffer.trim());
    safeSend(event.sender,'maigret-complete', code);
    maigretProcess = null;
  });

  return { ok: true };
});

ipcMain.handle('abort-maigret', async () => {
  if (maigretProcess) { maigretProcess.kill(); maigretProcess = null; return true; }
  return false;
});

// --- Holehe IPC ---

function getHolehePath() {
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, 'python', 'Scripts', 'holehe.exe')
    : path.join(__dirname, '..', 'assets', 'python', 'Scripts', 'holehe.exe');
  if (fs.existsSync(bundled)) return bundled;
  return 'holehe';
}

ipcMain.handle('start-holehe', async (event, config) => {
  if (holeheProcess) return { error: 'Email search already running' };

  // Validate email format
  if (!config.email || typeof config.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) {
    return { error: 'Invalid email address' };
  }

  const holehePath = getHolehePath();
  const args = [config.email, '--no-color'];

  try {
    holeheProcess = spawn(holehePath, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
  } catch (err) {
    return { error: `Failed to start holehe: ${err.message}` };
  }

  let lineBuffer = '';
  holeheProcess.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString('utf-8');
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) safeSend(event.sender,'holehe-line', line.trim());
    }
  });

  holeheProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf-8').trim();
    if (text) safeSend(event.sender,'holehe-stderr', text);
  });

  holeheProcess.on('error', (err) => {
    safeSend(event.sender,'holehe-complete', -1, err.message);
    holeheProcess = null;
  });

  holeheProcess.on('close', (code) => {
    if (lineBuffer.trim()) safeSend(event.sender,'holehe-line', lineBuffer.trim());
    safeSend(event.sender,'holehe-complete', code);
    holeheProcess = null;
  });

  return { ok: true };
});

ipcMain.handle('abort-holehe', async () => {
  if (holeheProcess) { holeheProcess.kill(); holeheProcess = null; return true; }
  return false;
});

// --- Shared ---

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});
