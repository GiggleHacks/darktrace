const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const pty = require('node-pty');

let mainWindow = null;
let scanProcess = null;
let maigretProcess = null;
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
    height: 860,
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
    const opts = {
      timeout: 15000,
      rejectUnauthorized: false,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    };
    const req = mod.get(url, opts, (res) => {
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
    '-a', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    '--no-state', '--limit-bars', '3',
  ];
  if (config.statusCodes) args.push('-s', config.statusCodes);
  if (config.depth) args.push('-d', String(config.depth));
  if (config.extensions) args.push('-x', config.extensions);

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

// --- Network Recon IPC ---

let reconProcess = null;
let reconAborted = false;

// Detect if input is an IP address
function isIP(str) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(str) || /^[0-9a-fA-F:]+$/.test(str);
}

// Validate recon target: domain or IP, no shell injection
function isValidTarget(str) {
  if (!str || typeof str !== 'string') return false;
  const clean = str.trim();
  if (clean.length > 253) return false;
  // Allow domains and IPs only — no spaces, semicolons, pipes, etc.
  return /^[a-zA-Z0-9.\-:]+$/.test(clean);
}

// Run a shell command and return stdout as string
function runCmd(cmd, args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, args, {
        windowsHide: true,
        timeout: timeoutMs,
        env: process.env,
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString('utf-8'); });
      proc.stderr.on('data', (d) => { stderr += d.toString('utf-8'); });
      proc.on('error', () => resolve({ ok: false, error: 'Command not found: ' + cmd }));
      proc.on('close', (code) => {
        resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code });
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

// Fetch JSON from a URL (Node built-in https), follows redirects up to 5 hops
function fetchJSON(url, timeoutMs = 15000, maxRedirects = 5) {
  const https = require('https');
  const http = require('http');
  return new Promise((resolve) => {
    function doFetch(fetchUrl, redirectsLeft) {
      const mod = fetchUrl.startsWith('https') ? https : http;
      const req = mod.get(fetchUrl, {
        timeout: timeoutMs,
        headers: { 'User-Agent': 'DarktraceCrawler/1.0', 'Accept': 'application/json' },
      }, (res) => {
        // Follow redirects
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location && redirectsLeft > 0) {
          req.destroy();
          const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, fetchUrl).href;
          doFetch(next, redirectsLeft - 1);
          return;
        }
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve({ ok: true, data: JSON.parse(body), status: res.statusCode }); }
          catch { resolve({ ok: true, data: body, status: res.statusCode }); }
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timed out' }); });
    }
    doFetch(url, maxRedirects);
  });
}

// Port scan using PowerShell Test-NetConnection
function scanPort(target, port, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const cmd = `Test-NetConnection -ComputerName '${target}' -Port ${port} -WarningAction SilentlyContinue | Select-Object -ExpandProperty TcpTestSucceeded`;
    const proc = spawn('powershell', ['-NoProfile', '-Command', cmd], {
      windowsHide: true,
      timeout: timeoutMs,
    });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('error', () => resolve({ port, status: 'error' }));
    proc.on('close', () => {
      const result = out.trim().toLowerCase();
      resolve({ port, status: result === 'true' ? 'open' : 'closed' });
    });
  });
}

ipcMain.handle('start-recon', async (event, config) => {
  if (!isValidTarget(config.target)) {
    return { error: 'Invalid target. Enter a domain name or IP address.' };
  }

  reconAborted = false;
  const target = config.target.trim();
  const modules = config.modules || {};
  const targetIsIP = isIP(target);

  // Helper to send progress updates
  function send(channel, data) {
    safeSend(event.sender, channel, data);
  }

  function sendModule(name, status, data) {
    send('recon-module', { name, status, data });
  }

  // ========== MODULE: PING ==========
  if (modules.ping && !reconAborted) {
    sendModule('Ping', 'running', null);
    const r = await runCmd('ping', ['-n', '4', target], 20000);
    sendModule('Ping', 'done', r.stdout || r.stderr || r.error);
  }

  // ========== MODULE: DNS ==========
  if (modules.dns && !reconAborted) {
    sendModule('DNS Records', 'running', null);
    const results = {};
    const recordTypes = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'SOA', 'CNAME'];

    if (targetIsIP) {
      // Reverse DNS for IP
      const r = await runCmd('nslookup', [target], 15000);
      results['PTR (Reverse DNS)'] = r.ok ? r.stdout : r.error || r.stderr;
    } else {
      for (const type of recordTypes) {
        if (reconAborted) break;
        const r = await runCmd('nslookup', ['-type=' + type, target], 15000);
        results[type] = r.stdout || r.stderr || 'No results';
      }
      // Also do PTR if we can resolve the IP
      const aResult = await runCmd('nslookup', [target], 10000);
      const ipMatch = aResult.stdout && aResult.stdout.match(/Address:\s+(\d+\.\d+\.\d+\.\d+)/g);
      if (ipMatch && ipMatch.length > 1) {
        const ip = ipMatch[ipMatch.length - 1].replace('Address:', '').trim();
        results['Resolved IP'] = ip;
        const ptr = await runCmd('nslookup', [ip], 10000);
        results['PTR (Reverse DNS)'] = ptr.stdout || 'No PTR record';
      }
    }
    sendModule('DNS Records', 'done', results);
  }

  // ========== MODULE: TRACEROUTE ==========
  if (modules.tracert && !reconAborted) {
    sendModule('Traceroute', 'running', null);
    const r = await runCmd('tracert', ['-d', '-w', '2000', '-h', '30', target], 60000);
    sendModule('Traceroute', 'done', r.stdout || r.stderr || r.error);
  }

  // ========== MODULE: WHOIS (RDAP) ==========
  if (modules.whois && !reconAborted) {
    sendModule('WHOIS / RDAP', 'running', null);
    let whoisData = null;

    if (targetIsIP) {
      // IP WHOIS via ipwhois.app
      const r = await fetchJSON(`https://ipwhois.app/json/${target}`);
      whoisData = r.ok ? r.data : { error: r.error };
    } else {
      // Domain WHOIS via RDAP
      const r = await fetchJSON(`https://rdap.org/domain/${target}`);
      if (r.ok && typeof r.data === 'object') {
        whoisData = r.data;
      } else {
        // Fallback: try who.is scraping alternative
        whoisData = { error: r.error || 'RDAP lookup failed' };
      }
    }
    sendModule('WHOIS / RDAP', 'done', whoisData);
  }

  // ========== MODULE: PORT SCAN ==========
  if (modules.ports && !reconAborted) {
    sendModule('Port Scan', 'running', null);
    const commonPorts = [21, 22, 25, 53, 80, 110, 143, 443, 445, 993, 995, 3306, 3389, 5432, 8080, 8443];
    const portResults = [];

    // Scan ports in batches of 4 for speed
    for (let i = 0; i < commonPorts.length && !reconAborted; i += 4) {
      const batch = commonPorts.slice(i, i + 4);
      const results = await Promise.all(batch.map(p => scanPort(target, p)));
      portResults.push(...results);
      // Send intermediate results
      send('recon-port-update', portResults.filter(p => p.status === 'open'));
    }
    sendModule('Port Scan', 'done', portResults);
  }

  // ========== MODULE: IP GEOLOCATION ==========
  if (modules.geo && !reconAborted) {
    sendModule('IP Geolocation', 'running', null);
    let ip = target;

    // Resolve domain to IP first if needed
    if (!targetIsIP) {
      const dns = require('dns').promises;
      try {
        const addrs = await dns.resolve4(target);
        if (addrs.length > 0) ip = addrs[0];
      } catch { /* use target as-is */ }
    }

    const r = await fetchJSON(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,query`);
    sendModule('IP Geolocation', 'done', r.ok ? r.data : { error: r.error });
  }

  // Signal completion
  send('recon-complete', reconAborted ? 'aborted' : 'done');
  return { ok: true };
});

ipcMain.handle('abort-recon', async () => {
  reconAborted = true;
  return true;
});

// --- Shared ---

ipcMain.handle('save-report', async (_event, { filename, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Report',
    defaultPath: filename,
    filters: [
      { name: 'HTML Report', extensions: ['html'] },
      { name: 'Text File', extensions: ['txt'] },
    ],
  });
  if (result.canceled || !result.filePath) return { ok: false };
  try {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});
