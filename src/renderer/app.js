// ============================================================
// XTERM.JS TERMINAL PREVIEW
// ============================================================
const feroxTerm = new window.Terminal({
  cursorBlink: false,
  disableStdin: true,
  fontSize: 11,
  fontFamily: "'Consolas', 'Courier New', monospace",
  theme: {
    background: '#05080F',
    foreground: '#C9D4E6',
    cursor: '#05080F',
    cyan: '#00E8FF',
    green: '#50D060',
    yellow: '#D0C040',
    red: '#E04040',
    blue: '#3F7FD1',
  },
  scrollback: 500,
  convertEol: true,
  rightClickSelectsWord: true,
});
const feroxFitAddon = new window.FitAddon.FitAddon();
feroxTerm.loadAddon(feroxFitAddon);

let feroxTermMounted = false;

function mountFeroxTerminal() {
  if (feroxTermMounted) return;
  const container = document.getElementById('ferox-terminal');
  if (!container) return;
  feroxTerm.open(container);
  feroxFitAddon.fit();
  feroxTermMounted = true;

  // Ctrl+C to copy selected text
  feroxTerm.attachCustomKeyEventHandler((e) => {
    if (e.ctrlKey && e.key === 'c' && feroxTerm.hasSelection()) {
      navigator.clipboard.writeText(feroxTerm.getSelection());
      return false;
    }
    return true;
  });

  // Refit terminal on window resize and sync PTY size
  window.addEventListener('resize', () => {
    if (feroxTermMounted) {
      feroxFitAddon.fit();
      window.scanner.resizeScanPty(feroxTerm.cols, feroxTerm.rows);
    }
  });
}

// ============================================================
// HEARTBEAT LINE — pixelated EKG, 15fps, pauses when unfocused
// ============================================================
(function initHeartbeat() {
  const canvas = document.getElementById('heartbeat-line');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let offset = 0;
  let hbInterval = null;
  const PIXEL = 4;

  const BEAT = [
    0,0,0,0,0,0,0,0,0,0,
    0,-1,-1,0,
    0,-2,-5,-8, 9, 6,-3,-1,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  ];

  // Cache width — only recalc on resize
  let cachedW = 200;
  window.addEventListener('resize', () => { cachedW = canvas.offsetWidth || 200; });
  setTimeout(() => { cachedW = canvas.offsetWidth || 200; }, 100);

  function render() {
    const w = cachedW;
    const h = 32;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);

    const midY = h >> 1;
    const cols = (w / PIXEL) | 0;

    for (let i = 0; i < cols - 1; i++) {
      const beatIdx = ((cols - 1 - i) + offset) % BEAT.length;
      const y1 = midY + BEAT[beatIdx];
      const beatIdxNext = ((cols - 2 - i) + offset) % BEAT.length;
      const y2 = midY + BEAT[beatIdxNext];
      const spike = Math.abs(BEAT[beatIdx]) > 2;

      ctx.globalAlpha = spike ? 0.9 : 0.25;
      ctx.fillStyle = '#00E8FF';
      ctx.fillRect(i * PIXEL, y1, PIXEL, PIXEL);

      if (Math.abs(y2 - y1) > 0) {
        const top = Math.min(y1, y2);
        ctx.fillRect(i * PIXEL, top, PIXEL, Math.max(y1, y2) - top + PIXEL);
      }

      if (spike) {
        ctx.globalAlpha = 0.12;
        ctx.fillRect(i * PIXEL - PIXEL, y1 - PIXEL * 2, PIXEL * 3, PIXEL * 5);
      }
    }

    ctx.globalAlpha = 1;
    offset++;
  }

  function start() { if (!hbInterval) hbInterval = setInterval(render, 100); } // 10fps
  function stop() { if (hbInterval) { clearInterval(hbInterval); hbInterval = null; } }

  start();
})();

// ============================================================
// PIXEL ICON RENDERER (8-bit style)
// ============================================================
const PIXEL_ICONS = {
  // Magnifying glass over links — URL sniffer
  web: [
    '................',
    '......####......',
    '....##....##....',
    '...#........#...',
    '...#..####..#...',
    '...#........#...',
    '....##....##....',
    '......####.#....',
    '...........##...',
    '............##..',
    '.............#..',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  // Envelope — email OSINT
  email: [
    '................',
    '................',
    '................',
    '.##############.',
    '..#..........#..',
    '...#........#...',
    '....#......#....',
    '.....#....#.....',
    '....#......#....',
    '...#........#...',
    '..#..........#..',
    '.##############.',
    '................',
    '................',
    '................',
    '................',
  ],
  // Person with radar waves — username OSINT
  user: [
    '................',
    '......##........',
    '.....####.......',
    '.....####.......',
    '......##........',
    '....######......',
    '...########.....',
    '....######......',
    '..........##....',
    '.........#..#...',
    '........#....#..',
    '..........##....',
    '.........#..#...',
    '................',
    '................',
    '................',
  ],
};

function renderPixelIcons() {
  document.querySelectorAll('.pixel-icon-lg, .pixel-icon').forEach(canvas => {
    const icon = canvas.dataset.icon;
    const grid = PIXEL_ICONS[icon];
    if (!grid) return;

    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const isActive = canvas.closest('.osint-tile.active') || canvas.closest('.osint-btn.active');
    const color = isActive ? '#FFFFFF' : '#8A96A8';

    for (let y = 0; y < grid.length && y < 16; y++) {
      for (let x = 0; x < grid[y].length && x < 16; x++) {
        if (grid[y][x] === '#') {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  });
}

// ============================================================
// TOOL SWITCHING
// ============================================================
function switchTool(toolName) {
  // Toggle menu buttons
  document.querySelectorAll('.osint-tile').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });

  // Toggle config panels
  document.getElementById('config-ferox').classList.toggle('hidden', toolName !== 'ferox');
  document.getElementById('config-maigret').classList.toggle('hidden', toolName !== 'maigret');
  document.getElementById('config-holehe').classList.toggle('hidden', toolName !== 'holehe');

  // Toggle results panels
  document.getElementById('results-ferox').classList.toggle('hidden', toolName !== 'ferox');
  document.getElementById('results-maigret').classList.toggle('hidden', toolName !== 'maigret');
  document.getElementById('results-holehe').classList.toggle('hidden', toolName !== 'holehe');

  // Re-render icons with active color
  renderPixelIcons();
}

document.querySelectorAll('.osint-tile').forEach(btn => {
  btn.addEventListener('click', () => switchTool(btn.dataset.tool));
});

// ============================================================
// DOM — FEROXBUSTER
// ============================================================
const domainInput = document.getElementById('domain');
const wordlistSelect = document.getElementById('wordlist');
const btnBrowse = document.getElementById('btn-browse');
const speedSlider = document.getElementById('speed-slider');
const speedDesc = document.getElementById('speed-desc');
const btnLaunch = document.getElementById('btn-launch');
const btnAbort = document.getElementById('btn-abort');
const feroxCounter = document.getElementById('ferox-counter');
const feroxResults = document.getElementById('ferox-results');

// ============================================================
// DOM — MAIGRET
// ============================================================
const usernameInput = document.getElementById('username');
const btnSearch = document.getElementById('btn-search');
const btnAbortMaigret = document.getElementById('btn-abort-maigret');
const maigretResults = document.getElementById('maigret-results');
const maigretCounter = document.getElementById('maigret-counter');
const maigretPbFill = document.getElementById('maigret-pb-fill');
const maigretStatus = document.getElementById('maigret-status');
const maigretFoundCount = document.getElementById('maigret-found-count');
const maigretTimerEl = document.getElementById('maigret-timer');

// ============================================================
// DOM — SHARED
// ============================================================
const spriteVideo = document.getElementById('sprite-video');
const SPRITE_LOOP_START = 1.0;  // seconds — skip the intro on repeat
const SPRITE_LOOP_END_PAD = 1.0; // seconds — cut off before typing stops
let isScanActive = false;
let spriteLoopInterval = null;

const spriteStage = document.getElementById('sprite-stage');

function startSpriteVideo() {
  isScanActive = true;
  spriteVideo.currentTime = 0;
  spriteVideo.play().catch(() => {});
  spriteStage.classList.add('active');
  if (!spriteLoopInterval) {
    spriteLoopInterval = setInterval(() => {
      if (isScanActive && spriteVideo.duration && spriteVideo.currentTime >= spriteVideo.duration - SPRITE_LOOP_END_PAD) {
        spriteVideo.currentTime = SPRITE_LOOP_START;
      }
    }, 50); // check every 50ms for smooth looping
  }
}

function stopSpriteVideo() {
  isScanActive = false;
  spriteVideo.pause();
  spriteStage.classList.remove('active');
  if (spriteLoopInterval) { clearInterval(spriteLoopInterval); spriteLoopInterval = null; }
}

const btnMute = document.getElementById('btn-mute');
const errorBanner = document.getElementById('error-banner');
const errorText = document.getElementById('error-text');
const errorDismiss = document.getElementById('error-dismiss');

// ============================================================
// SPEED PRESETS
// ============================================================
const SPEED_PRESETS = [
  { threads: 5, depth: 1, desc: '5 threads, depth 1. Stealthy.' },
  { threads: 10, depth: 2, desc: '10 threads, depth 2. Balanced.' },
  { threads: 50, depth: 3, desc: '50 threads, depth 3. May get blocked.' },
];

function updateSpeedDesc() { speedDesc.textContent = SPEED_PRESETS[speedSlider.value].desc; }
speedSlider.addEventListener('input', updateSpeedDesc);
updateSpeedDesc();

function getSelectedStatusCodes() {
  return Array.from(document.querySelectorAll('.status-checks input:checked')).map(c => c.value).join(',');
}

// ============================================================
// SOUND
// ============================================================
const SOUND_SRC = '../../ns-aos-new.wav';
const SOUND_POOL_SIZE = 16;
let soundPool = [], soundIndex = 0, isMuted = false;

function initSoundPool() {
  soundPool = [];
  for (let i = 0; i < SOUND_POOL_SIZE; i++) {
    const a = new Audio(SOUND_SRC); a.volume = 0.35; soundPool.push(a);
  }
}
function playSound() {
  if (isMuted || !soundPool.length) return;
  const a = soundPool[soundIndex]; soundIndex = (soundIndex + 1) % SOUND_POOL_SIZE;
  a.currentTime = 0; a.play().catch(() => {});
}
initSoundPool();

btnMute.addEventListener('click', () => {
  isMuted = !isMuted;
  btnMute.classList.toggle('muted', isMuted);
});

// ============================================================
// ERROR
// ============================================================
function showError(msg) { errorText.textContent = msg; errorBanner.classList.remove('hidden'); }
errorDismiss.addEventListener('click', () => errorBanner.classList.add('hidden'));

// ============================================================
// UTILS
// ============================================================
function stripProtocol(url) {
  return url.replace(/^https?:\/\//i, '');
}

// Store all found URLs for copy-all functionality
let feroxFoundUrls = [];
let maigretFoundUrls = [];

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function cleanDomain(input) {
  let s = input.trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  s = s.split('/')[0].split('?')[0].split('#')[0].replace(/[.:]+$/, '');
  return s;
}

// Connection status element
const connStatus = document.getElementById('conn-status');

// ============================================================
// FEROXBUSTER STATE & LOGIC
// ============================================================
let feroxScanning = false, feroxUrlCount = 0;
let customWordlist = null;
const MAX_RESULTS_DOM = 200;

// Strip ANSI escape codes before regex matching
function stripAnsi(str) { return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''); }

// Regex to detect feroxbuster hit lines: "200      GET       45l      113w     1583c http://..."
const FEROX_HIT_RE = /(\d{3})\s+\w+\s+\S+\s+\S+\s+\S+\s+(https?:\/\/\S+)/;
let feroxLineBuffer = '';

function addFeroxHit(status, url) {
  const empty = feroxResults.querySelector('.results-empty');
  if (empty) empty.remove();
  const entry = document.createElement('div');
  entry.className = 'found-entry';
  const cls = status < 300 ? 's-2xx' : status < 400 ? 's-3xx' : status < 500 ? 's-4xx' : 's-5xx';
  const badge = document.createElement('span');
  badge.className = `status-badge ${cls}`; badge.textContent = status;
  const urlSpan = document.createElement('span');
  urlSpan.className = 'url-text'; urlSpan.textContent = stripProtocol(url);
  entry.appendChild(badge); entry.appendChild(urlSpan);
  entry.addEventListener('click', () => window.scanner.openExternal(url));
  entry.title = 'Click to open';
  feroxResults.appendChild(entry);
  feroxFoundUrls.push(url);

  while (feroxResults.childElementCount > MAX_RESULTS_DOM) {
    feroxResults.removeChild(feroxResults.firstChild);
  }

  feroxResults.scrollTop = feroxResults.scrollHeight;
  feroxUrlCount++;
  feroxCounter.textContent = feroxUrlCount;
  playSound();
}

async function init() {
  await loadWordlists();
  renderPixelIcons();
  mountFeroxTerminal();
}

async function loadWordlists() {
  const lists = await window.scanner.getWordlists();
  wordlistSelect.innerHTML = '';
  if (!lists.length) {
    const o = document.createElement('option'); o.textContent = '(none)'; o.value = ''; wordlistSelect.appendChild(o);
  } else {
    const counts = await Promise.all(lists.map(wl => window.scanner.countWordlist(wl.path)));
    for (let i = 0; i < lists.length; i++) {
      const wl = lists[i];
      const count = counts[i];
      const label = count > 0 ? `${wl.name}  (${count.toLocaleString()})` : wl.name;
      const o = document.createElement('option'); o.textContent = label; o.value = wl.path;
      wordlistSelect.appendChild(o);
    }
  }
  if (customWordlist) {
    const count = await window.scanner.countWordlist(customWordlist.path);
    const label = count > 0 ? `[+] ${customWordlist.name}  (${count.toLocaleString()})` : `[+] ${customWordlist.name}`;
    const o = document.createElement('option'); o.textContent = label; o.value = customWordlist.path;
    wordlistSelect.appendChild(o); wordlistSelect.value = customWordlist.path;
  }
}

btnBrowse.addEventListener('click', async () => {
  const r = await window.scanner.selectWordlist();
  if (r) { customWordlist = r; await loadWordlists(); }
});

function setFeroxState(scanning) {
  feroxScanning = scanning;
  btnLaunch.classList.toggle('hidden', scanning);
  btnAbort.classList.toggle('hidden', !scanning);
  btnLaunch.disabled = scanning;
  domainInput.disabled = scanning;
  wordlistSelect.disabled = scanning;
  btnBrowse.disabled = scanning;
  speedSlider.disabled = scanning;
  document.querySelectorAll('.status-checks input').forEach(c => c.disabled = scanning);
}

// ============================================================
// SCAN WARNING MODAL
// ============================================================
const scanWarnOverlay = document.getElementById('scan-warning-overlay');
const scanWarnDismissCheck = document.getElementById('scan-warn-dismiss');
const scanWarnCancel = document.getElementById('scan-warn-cancel');
const scanWarnProceed = document.getElementById('scan-warn-proceed');
let scanWarnSuppressed = localStorage.getItem('scan-warn-suppress') === '1';
let pendingScanAction = null;

function showScanWarning() {
  return new Promise((resolve) => {
    scanWarnOverlay.classList.remove('hidden');
    scanWarnDismissCheck.checked = false;
    pendingScanAction = resolve;
  });
}

scanWarnCancel.addEventListener('click', () => {
  scanWarnOverlay.classList.add('hidden');
  if (pendingScanAction) { pendingScanAction(false); pendingScanAction = null; }
});

scanWarnProceed.addEventListener('click', () => {
  if (scanWarnDismissCheck.checked) {
    localStorage.setItem('scan-warn-suppress', '1');
    scanWarnSuppressed = true;
  }
  scanWarnOverlay.classList.add('hidden');
  if (pendingScanAction) { pendingScanAction(true); pendingScanAction = null; }
});

// Close on overlay background click
scanWarnOverlay.addEventListener('click', (e) => {
  if (e.target === scanWarnOverlay) {
    scanWarnOverlay.classList.add('hidden');
    if (pendingScanAction) { pendingScanAction(false); pendingScanAction = null; }
  }
});

// ============================================================
// FEROX SCAN LAUNCH
// ============================================================
async function executeScan() {
  const raw = domainInput.value.trim();
  if (!raw) { showError('Enter a target domain.'); return; }

  const domain = cleanDomain(raw);
  if (!domain) { showError('Invalid URL. Enter a valid domain like example.com'); return; }
  domainInput.value = domain;

  const wordlistPath = wordlistSelect.value;
  if (!wordlistPath) { showError('No wordlist selected.'); return; }
  const statusCodes = getSelectedStatusCodes();
  if (!statusCodes) { showError('Select at least one status code.'); return; }

  // Auto-detect protocol
  errorBanner.classList.add('hidden');
  connStatus.textContent = 'Connecting...';
  connStatus.className = 'conn-status testing';

  let targetUrl = null;

  connStatus.textContent = `Trying https://${domain}...`;
  let result = await window.scanner.testConnection(`https://${domain}`);
  if (result.ok) {
    targetUrl = `https://${domain}`;
  } else {
    connStatus.textContent = `Trying http://${domain}...`;
    result = await window.scanner.testConnection(`http://${domain}`);
    if (result.ok) targetUrl = `http://${domain}`;
  }

  if (!targetUrl) {
    connStatus.textContent = 'Could not connect';
    connStatus.className = 'conn-status fail';
    showError(`Cannot reach ${domain}. Check the domain name.`);
    return;
  }

  connStatus.textContent = `Connected to ${targetUrl}`;
  connStatus.className = 'conn-status ok';

  const preset = SPEED_PRESETS[speedSlider.value];

  // Reset state
  feroxUrlCount = 0; feroxCounter.textContent = '0'; feroxFoundUrls = [];
  feroxLineBuffer = '';
  feroxResults.innerHTML = '';
  feroxTerm.clear(); feroxFitAddon.fit();

  setFeroxState(true); startSpriteVideo();

  const scanResult = await window.scanner.startScan({
    url: targetUrl, wordlistPath, threads: preset.threads, depth: preset.depth,
    statusCodes,
  });
  if (scanResult.error) {
    showError(scanResult.error); setFeroxState(false);
    connStatus.textContent = '';
    stopSpriteVideo();
  } else {
    // Sync PTY size with actual terminal dimensions
    window.scanner.resizeScanPty(feroxTerm.cols, feroxTerm.rows);
  }
}

domainInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnLaunch.click(); });
btnLaunch.addEventListener('click', async () => {
  if (!scanWarnSuppressed) {
    const proceed = await showScanWarning();
    if (!proceed) return;
  }
  await executeScan();
});

btnAbort.addEventListener('click', async () => {
  await window.scanner.abortScan(); setFeroxState(false);
  feroxLineBuffer = '';
  connStatus.textContent = 'Scan terminated';
  connStatus.className = 'conn-status fail';
  stopSpriteVideo();
});

// Pipe raw feroxbuster output directly to terminal
window.scanner.onScanData((data) => {
  if (feroxTermMounted) feroxTerm.write(data);

  // Scan lines for hit detection (sound + URL list + counter)
  feroxLineBuffer += data;
  const lines = feroxLineBuffer.split('\n');
  feroxLineBuffer = lines.pop(); // keep incomplete line
  for (const line of lines) {
    const clean = stripAnsi(line);
    const m = clean.match(FEROX_HIT_RE);
    if (m) {
      addFeroxHit(parseInt(m[1], 10), m[2]);
    }
  }
});

window.scanner.onScanComplete((code) => {
  setFeroxState(false);
  stopSpriteVideo();

  if (code === 0 || code === null) {
    connStatus.textContent = `Scan complete — ${feroxUrlCount} endpoints found`;
    connStatus.className = 'conn-status ok';
  } else if (code === -1) {
    connStatus.textContent = 'feroxbuster failed to start';
    connStatus.className = 'conn-status fail';
  } else {
    connStatus.textContent = `Scan exited with code ${code}`;
    connStatus.className = 'conn-status fail';
  }
});

// ============================================================
// MAIGRET STATE & LOGIC
// ============================================================
let maigretSearching = false, maigretFoundTotal = 0;
let maigretTimerStart = 0, maigretTimerInterval = null;
let maigretSiteTotal = 500;
let maigretLineCount = 0;

// New DOM refs for maigret progress
const maigretProgress = document.getElementById('maigret-progress');
const maigretChecked = document.getElementById('maigret-checked');
const maigretSiteTotalEl = document.getElementById('maigret-site-total');
const maigretPctEl = document.getElementById('maigret-pct');
const maigretRateEl = document.getElementById('maigret-rate');
const maigretCurrentSite = document.getElementById('maigret-current-site');

function startMaigretTimer() {
  maigretTimerStart = performance.now();
  maigretLineCount = 0;
  // Single interval drives timer + progress estimation
  maigretTimerInterval = setInterval(maigretProgressTick, 500);
}

function stopMaigretTimer() {
  if (maigretTimerInterval) { clearInterval(maigretTimerInterval); maigretTimerInterval = null; }
}

function maigretProgressTick() {
  const elapsed = performance.now() - maigretTimerStart;
  maigretTimerEl.textContent = fmtTime(elapsed);

  // We can't know exact progress — maigret doesn't report per-site.
  // Show scanning activity: line count as proxy, no fake percentage.
  maigretFoundCount.textContent = `${maigretFoundTotal} found`;
}

function addMaigretHit(siteName, url) {
  const empty = maigretResults.querySelector('.results-empty');
  if (empty) empty.remove();
  const entry = document.createElement('div');
  entry.className = 'found-entry';
  const badge = document.createElement('span');
  badge.className = 'site-badge'; badge.textContent = siteName;
  const urlSpan = document.createElement('span');
  urlSpan.className = 'url-text'; urlSpan.textContent = stripProtocol(url);
  entry.appendChild(badge); entry.appendChild(urlSpan);
  entry.addEventListener('click', () => window.scanner.openExternal(url));
  entry.title = 'Click to open';
  maigretResults.appendChild(entry); maigretResults.scrollTop = maigretResults.scrollHeight;
  maigretFoundUrls.push(url);
  maigretFoundTotal++; maigretCounter.textContent = maigretFoundTotal;
  maigretFoundCount.textContent = `${maigretFoundTotal} found`;
  // Show current site being checked
  maigretCurrentSite.textContent = url;
  playSound();
}

function setMaigretState(searching) {
  maigretSearching = searching;
  btnSearch.classList.toggle('hidden', searching);
  btnAbortMaigret.classList.toggle('hidden', !searching);
  btnSearch.disabled = searching; usernameInput.disabled = searching;
  document.querySelectorAll('.scope-option input').forEach(r => r.disabled = searching);
}

usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnSearch.click(); });
btnSearch.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  if (!username) { showError('Enter a username.'); return; }
  const allSites = document.querySelector('input[name="scope"][value="all"]').checked;
  maigretSiteTotal = allSites ? 3000 : 500;

  maigretFoundTotal = 0; maigretCounter.textContent = '0'; maigretFoundUrls = [];
  maigretFoundCount.textContent = '0 found';
  maigretPbFill.style.width = ''; maigretPbFill.style.opacity = '1';
  maigretPbFill.classList.remove('complete');
  maigretPbFill.classList.add('indeterminate');
  maigretSiteTotalEl.textContent = maigretSiteTotal;
  maigretPctEl.textContent = '';
  maigretRateEl.textContent = '';
  maigretTimerEl.textContent = '00:00';
  maigretCurrentSite.textContent = '';
  maigretProgress.className = 'progress-section scanning';
  maigretResults.innerHTML = '';
  const maigretEmptyMsg = document.createElement('div');
  maigretEmptyMsg.className = 'results-empty';
  maigretEmptyMsg.textContent = 'Searching ' + username + ' across ' + maigretSiteTotal + ' sites...';
  maigretResults.appendChild(maigretEmptyMsg);
  errorBanner.classList.add('hidden');

  setMaigretState(true); startMaigretTimer(); startSpriteVideo();

  const result = await window.scanner.startMaigret({ username, allSites, topSites: 500 });
  if (result.error) {
    showError(result.error); setMaigretState(false); stopMaigretTimer();
    maigretProgress.className = 'progress-section';
    stopSpriteVideo();
  }
});

btnAbortMaigret.addEventListener('click', async () => {
  await window.scanner.abortMaigret(); setMaigretState(false); stopMaigretTimer();
  maigretPbFill.classList.remove('indeterminate');
  maigretPbFill.style.width = '0%';
  maigretProgress.className = 'progress-section stopped';
  maigretCurrentSite.textContent = '';
  stopSpriteVideo();
});

const MAIGRET_HIT_RE = /^\[\+\]\s+(.+?):\s+(https?:\/\/\S+)/;

window.scanner.onMaigretLine((line) => {
  maigretLineCount++;
  const m = line.match(MAIGRET_HIT_RE);
  if (m) addMaigretHit(m[1], m[2]);
});

window.scanner.onMaigretError(() => { maigretLineCount++; });

window.scanner.onMaigretComplete((code) => {
  setMaigretState(false); stopMaigretTimer();
  maigretCurrentSite.textContent = '';
  stopSpriteVideo();

  maigretPbFill.classList.remove('indeterminate');
  if (code === 0 || code === null) {
    maigretPctEl.textContent = '100%';
    maigretPbFill.style.width = '100%';
    maigretPbFill.classList.add('complete');
    maigretProgress.className = 'progress-section complete';
  } else {
    maigretPbFill.style.width = '0%';
    maigretProgress.className = 'progress-section stopped';
  }
});

// ============================================================
// HOLEHE STATE & LOGIC
// ============================================================
const emailInput = document.getElementById('email-input');
const btnEmailSearch = document.getElementById('btn-email-search');
const btnAbortHolehe = document.getElementById('btn-abort-holehe');
const holeheResults = document.getElementById('holehe-results');
const holeheCounter = document.getElementById('holehe-counter');
const holehePbFill = document.getElementById('holehe-pb-fill');
const holeheChecked = document.getElementById('holehe-checked');
const holeheTotal = document.getElementById('holehe-total');
const holehePct = document.getElementById('holehe-pct');
const holeheFoundCount = document.getElementById('holehe-found-count');
const holeheTimerEl = document.getElementById('holehe-timer');
const holeheProgress = document.getElementById('holehe-progress');

let holeheSearching = false, holeheFoundTotal = 0;
let holeheTimerStart = 0, holeheTimerInterval = null;
let holeheSitesChecked = 0;
const HOLEHE_TOTAL_SITES = 121;
let holeheFoundUrls = [];

function startHoleheTimer() {
  holeheTimerStart = performance.now();
  holeheTimerInterval = setInterval(() => {
    holeheTimerEl.textContent = fmtTime(performance.now() - holeheTimerStart);
  }, 1000);
}

function stopHoleheTimer() {
  if (holeheTimerInterval) { clearInterval(holeheTimerInterval); holeheTimerInterval = null; }
}

function addHoleheHit(service) {
  const empty = holeheResults.querySelector('.results-empty');
  if (empty) empty.remove();
  const entry = document.createElement('div');
  entry.className = 'found-entry';
  const badge = document.createElement('span');
  badge.className = 'site-badge'; badge.textContent = service;
  entry.appendChild(badge);
  entry.addEventListener('click', () => window.scanner.openExternal('https://' + service));
  entry.title = 'Click to open';
  holeheResults.appendChild(entry); holeheResults.scrollTop = holeheResults.scrollHeight;
  holeheFoundUrls.push(service);
  holeheFoundTotal++; holeheCounter.textContent = holeheFoundTotal;
  holeheFoundCount.textContent = `${holeheFoundTotal} found`;
  playSound();
}

function setHoleheState(searching) {
  holeheSearching = searching;
  btnEmailSearch.classList.toggle('hidden', searching);
  btnAbortHolehe.classList.toggle('hidden', !searching);
  btnEmailSearch.disabled = searching; emailInput.disabled = searching;
}

emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnEmailSearch.click(); });
btnEmailSearch.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  if (!email) { showError('Enter an email address.'); return; }
  if (!email.includes('@')) { showError('Enter a valid email address.'); return; }

  holeheFoundTotal = 0; holeheCounter.textContent = '0'; holeheFoundUrls = [];
  holeheFoundCount.textContent = '0 found';
  holeheSitesChecked = 0;
  holeheChecked.textContent = '0';
  holeheTotal.textContent = HOLEHE_TOTAL_SITES;
  holehePct.textContent = '0%';
  holehePbFill.style.width = '0%';
  holehePbFill.classList.remove('complete', 'indeterminate');
  holeheTimerEl.textContent = '00:00';
  holeheProgress.className = 'progress-section scanning';
  holeheResults.innerHTML = '';
  const holeheEmptyMsg = document.createElement('div');
  holeheEmptyMsg.className = 'results-empty';
  holeheEmptyMsg.textContent = 'Checking ' + email + ' across ' + HOLEHE_TOTAL_SITES + ' services...';
  holeheResults.appendChild(holeheEmptyMsg);
  errorBanner.classList.add('hidden');

  setHoleheState(true); startHoleheTimer(); startSpriteVideo();

  const result = await window.scanner.startHolehe({ email });
  if (result.error) {
    showError(result.error); setHoleheState(false); stopHoleheTimer();
    holeheProgress.className = 'progress-section';
    stopSpriteVideo();
  }
});

btnAbortHolehe.addEventListener('click', async () => {
  await window.scanner.abortHolehe(); setHoleheState(false); stopHoleheTimer();
  holeheProgress.className = 'progress-section stopped';
  stopSpriteVideo();
});

// Holehe output: [+] service.com = registered, [-] = not registered, [x] = rate limited
// Progress bar from stderr: 45%|████▌     | 55/121
const HOLEHE_HIT_RE = /^\[\+\]\s+(\S+)/;
const HOLEHE_PROGRESS_RE = /(\d+)\/(\d+)/;

window.scanner.onHoleheLine((line) => {
  const hitMatch = line.match(HOLEHE_HIT_RE);
  if (hitMatch) addHoleheHit(hitMatch[1]);

  // Count all result lines ([+], [-], [x])
  if (line.startsWith('[+]') || line.startsWith('[-]') || line.startsWith('[x]')) {
    holeheSitesChecked++;
    const pct = Math.min(Math.round((holeheSitesChecked / HOLEHE_TOTAL_SITES) * 100), 100);
    holeheChecked.textContent = holeheSitesChecked;
    holehePct.textContent = `${pct}%`;
    holehePbFill.style.width = `${pct}%`;
  }
});

window.scanner.onHoleheComplete((code) => {
  setHoleheState(false); stopHoleheTimer();
  stopSpriteVideo();

  if (code === 0 || code === null) {
    holeheChecked.textContent = HOLEHE_TOTAL_SITES;
    holehePct.textContent = '100%';
    holehePbFill.style.width = '100%';
    holehePbFill.classList.add('complete');
    holeheProgress.className = 'progress-section complete';
  } else {
    holeheProgress.className = 'progress-section stopped';
  }
});

// ============================================================
// COPY BUTTONS
// ============================================================
function setupCopyBtn(btnId, getUrls) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const urls = getUrls();
    if (!urls.length) return;
    navigator.clipboard.writeText(urls.join('\n')).then(() => {
      btn.textContent = 'COPIED';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'COPY'; btn.classList.remove('copied'); }, 1500);
    });
  });
}

setupCopyBtn('btn-copy-ferox', () => feroxFoundUrls);
setupCopyBtn('btn-copy-maigret', () => maigretFoundUrls);
setupCopyBtn('btn-copy-holehe', () => holeheFoundUrls);

// ============================================================
// INIT
// ============================================================
init();
