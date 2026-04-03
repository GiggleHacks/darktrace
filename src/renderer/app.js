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
// DATA STREAM — scrolling hacker matrix with binary, hex, IPs
// ============================================================
(function initDataStream() {
  const canvas = document.getElementById('heartbeat-line');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let animInterval = null;
  let cachedW = 200;
  const H = 32;
  const FONT = 8;           // pixel font size
  const COLS_GAP = 10;      // px between columns

  // Scrolling columns of data
  let columns = [];
  let frame = 0;

  // Generate random hacker-ish data fragments
  const FAKE_IPS = [
    '192.168.1.', '10.0.0.', '172.16.0.', '255.255.255.', '8.8.8.',
    '203.0.113.', '198.51.100.', '100.64.0.', '169.254.0.', '224.0.0.',
  ];
  const HEX_CHARS = '0123456789ABCDEF';
  const BINARY = '01';
  const PACKET_WORDS = [
    'SYN', 'ACK', 'FIN', 'RST', 'PSH', 'URG', 'TCP', 'UDP',
    'DNS', 'TLS', 'GET', 'PUT', 'SSH', 'ARP', 'ICMP', 'NUL',
    'TTL', 'MTU', 'NAT', 'VPN', 'HTTP', 'PORT', 'SCAN', 'PING',
  ];

  function randInt(min, max) { return (Math.random() * (max - min + 1) | 0) + min; }
  function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

  function genFragment() {
    const r = Math.random();
    if (r < 0.22) {
      // Binary stream: 8 bits
      let s = '';
      for (let i = 0; i < 8; i++) s += BINARY[randInt(0, 1)];
      return { text: s, color: '#00E8FF', bright: false };
    }
    if (r < 0.40) {
      // Hex pair
      let s = '0x';
      for (let i = 0; i < 4; i++) s += HEX_CHARS[randInt(0, 15)];
      return { text: s, color: '#8B5CF6', bright: false };
    }
    if (r < 0.58) {
      // Fake IP address
      return { text: pick(FAKE_IPS) + randInt(1, 254), color: '#50D060', bright: false };
    }
    if (r < 0.72) {
      // Port number
      return { text: ':' + pick([22, 53, 80, 443, 993, 3306, 3389, 8080, 8443, randInt(1024, 65535)]), color: '#D0C040', bright: false };
    }
    if (r < 0.86) {
      // Protocol / packet keyword
      return { text: pick(PACKET_WORDS), color: '#00E8FF', bright: true };
    }
    // MAC fragment
    let s = '';
    for (let i = 0; i < 3; i++) {
      if (i > 0) s += ':';
      s += HEX_CHARS[randInt(0, 15)] + HEX_CHARS[randInt(0, 15)];
    }
    return { text: s, color: '#607080', bright: false };
  }

  // Each column is a vertical slot with a fragment that scrolls up
  function initColumns() {
    columns = [];
    const numCols = Math.floor(cachedW / (FONT * 5 + COLS_GAP));
    for (let i = 0; i < numCols; i++) {
      columns.push({
        x: i * (cachedW / numCols),
        frag: genFragment(),
        y: randInt(0, H),
        speed: 0.2 + Math.random() * 0.4,
        life: randInt(0, 120),
        maxLife: randInt(60, 180),
        opacity: Math.random() * 0.5 + 0.2,
      });
    }
  }

  window.addEventListener('resize', () => {
    cachedW = canvas.offsetWidth || 200;
    initColumns();
  });
  setTimeout(() => { cachedW = canvas.offsetWidth || 200; initColumns(); }, 100);

  function render() {
    const w = cachedW;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== H) canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, H);

    ctx.font = `${FONT}px "Consolas", "Courier New", monospace`;
    ctx.textBaseline = 'middle';

    for (const col of columns) {
      col.life++;

      // Fade in/out over lifecycle
      let alpha = col.opacity;
      if (col.life < 15) alpha *= col.life / 15;
      if (col.life > col.maxLife - 20) alpha *= Math.max(0, (col.maxLife - col.life) / 20);

      // Occasional bright flash on spawn
      if (col.life < 3) alpha = Math.min(1, alpha + 0.4);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = col.frag.color;

      // Draw the text
      ctx.fillText(col.frag.text, col.x, col.y);

      // Bright fragments get a subtle glow
      if (col.frag.bright && alpha > 0.3) {
        ctx.globalAlpha = alpha * 0.15;
        ctx.fillText(col.frag.text, col.x - 1, col.y);
        ctx.fillText(col.frag.text, col.x + 1, col.y);
      }

      // Scroll upward slowly
      col.y -= col.speed;

      // Respawn when dead
      if (col.life > col.maxLife) {
        col.frag = genFragment();
        col.y = H + randInt(0, 8);
        col.speed = 0.2 + Math.random() * 0.4;
        col.life = 0;
        col.maxLife = randInt(60, 180);
        col.opacity = Math.random() * 0.5 + 0.2;
      }
    }

    // Occasional random "packet flash" — brief horizontal highlight
    if (frame % 30 === 0 && Math.random() < 0.4) {
      const flashY = randInt(4, H - 4);
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = '#00E8FF';
      ctx.fillRect(0, flashY, w, 2);
    }

    ctx.globalAlpha = 1;
    frame++;
  }

  function start() { if (!animInterval) animInterval = setInterval(render, 66); } // ~15fps
  function stop() { if (animInterval) { clearInterval(animInterval); animInterval = null; } }

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
// FILE TYPE ICONS (Win98-style PNGs from icon pack)
// ============================================================
const FILE_TYPE_ICON_PATH = '../../assets/filetype-icons/';

const FILE_TYPE_COLORS = {
  image:    '#5AAFAA',
  audio:    '#9880C0',
  video:    '#7088C0',
  web:      '#58A8C8',
  css:      '#8078C0',
  js:       '#70B088',
  document: '#60A878',
  database: '#7890A8',
  archive:  '#8878A0',
  unknown:  '#607080',
};

const EXT_TO_FILE_TYPE = {
  png:'image', jpg:'image', jpeg:'image', gif:'image', bmp:'image',
  webp:'image', svg:'image', ico:'image', tiff:'image', tif:'image',
  mp3:'audio', wav:'audio', ogg:'audio', flac:'audio', aac:'audio', wma:'audio',
  mp4:'video', avi:'video', mkv:'video', webm:'video', mov:'video', wmv:'video',
  html:'web', htm:'web', php:'web', asp:'web', aspx:'web', jsp:'web',
  css:'css', js:'js',
  pdf:'document', doc:'document', docx:'document', txt:'document',
  xml:'document', json:'document', csv:'document', log:'document',
  db:'database', sql:'database', sqlite:'database', mdb:'database',
  zip:'archive', rar:'archive', tar:'archive', gz:'archive',
  '7z':'archive', bz2:'archive',
};

function getFileType(url) {
  try {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/')) return 'web';
    const parts = pathname.split('/').pop().split('.');
    if (parts.length < 2) return 'web';
    const ext = parts.pop().toLowerCase();
    return EXT_TO_FILE_TYPE[ext] || 'unknown';
  } catch { return 'unknown'; }
}

function renderFileTypeIcon(type) {
  const img = document.createElement('img');
  img.className = 'file-type-icon';
  img.src = FILE_TYPE_ICON_PATH + (FILE_TYPE_COLORS[type] ? type : 'unknown') + '.png';
  img.alt = type;
  img.draggable = false;
  return img;
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
  document.getElementById('config-recon').classList.toggle('hidden', toolName !== 'recon');
  document.getElementById('config-extra').classList.toggle('hidden', toolName !== 'extra');

  // Toggle results panels
  document.getElementById('results-ferox').classList.toggle('hidden', toolName !== 'ferox');
  document.getElementById('results-maigret').classList.toggle('hidden', toolName !== 'maigret');
  document.getElementById('results-recon').classList.toggle('hidden', toolName !== 'recon');
  document.getElementById('results-extra').classList.toggle('hidden', toolName !== 'extra');

  // Hide robot sprite on extra tab
  document.getElementById('sprite-stage').classList.toggle('hidden', toolName === 'extra');

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
const btnExtAll = document.getElementById('btn-ext-all');

// Extension filter "ALL" toggle
btnExtAll.addEventListener('click', () => {
  const boxes = document.querySelectorAll('.ext-checks input[type="checkbox"]');
  const allChecked = Array.from(boxes).every(c => c.checked);
  boxes.forEach(c => { c.checked = !allChecked; });
  applyDisplayFilters();
});

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

// Map checkbox extension values to file type categories
const EXT_CHECKBOX_TO_TYPES = {
  'html,htm,php,asp,aspx,jsp': ['web'],
  'png,jpg,jpeg,gif,bmp,webp,svg,ico': ['image'],
  'mp3,wav,ogg,flac,aac,wma': ['audio'],
  'mp4,avi,mkv,webm,mov,wmv': ['video'],
  'pdf,doc,docx,txt,xml,csv': ['document'],
  'js,json,css,zip,rar,tar,gz,7z,db,sql,sqlite,log': ['js', 'css', 'database', 'archive', 'unknown'],
};

function applyDisplayFilters() {
  // Build set of allowed file types from checked boxes
  const allowed = new Set();
  document.querySelectorAll('.ext-checks input[type="checkbox"]').forEach(cb => {
    if (cb.checked) {
      const types = EXT_CHECKBOX_TO_TYPES[cb.value];
      if (types) types.forEach(t => allowed.add(t));
    }
  });

  // If nothing is checked, show everything
  const showAll = allowed.size === 0;
  let visibleCount = 0;

  feroxResults.querySelectorAll('.found-entry').forEach(entry => {
    const ft = entry.dataset.filetype || 'unknown';
    const visible = showAll || allowed.has(ft);
    entry.style.display = visible ? '' : 'none';
    if (visible) visibleCount++;
  });

  feroxCounter.textContent = visibleCount;
}

// Attach filter listeners to all extension checkboxes
document.querySelectorAll('.ext-checks input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('input', applyDisplayFilters);
});

// ============================================================
// SOUND
// ============================================================
const SOUND_SRC = '../../assets/ns-aos-new.wav';
const SOUND_POOL_SIZE = 16;
let soundPool = [], soundIndex = 0, isMuted = false, soundReady = false;

function initSoundPool() {
  soundPool = [];
  for (let i = 0; i < SOUND_POOL_SIZE; i++) {
    const a = new Audio(SOUND_SRC); a.volume = 0.35; soundPool.push(a);
  }
  soundReady = true;
}
function playSound() {
  if (isMuted || !soundReady) return;
  const a = soundPool[soundIndex]; soundIndex = (soundIndex + 1) % SOUND_POOL_SIZE;
  a.currentTime = 0; a.play().catch(() => {});
}

// Defer audio init until first user interaction (bypasses autoplay policy)
document.addEventListener('click', function onFirstClick() {
  if (!soundReady) initSoundPool();
  document.removeEventListener('click', onFirstClick);
}, { once: true });

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

// Like cleanDomain but keeps subdomains (www, api, etc.) — for recon target
function cleanTarget(input) {
  let s = input.trim();
  if (!s) return '';
  // Strip protocol
  s = s.replace(/^https?:\/\//i, '');
  // Strip path, query, fragment
  s = s.split('/')[0].split('?')[0].split('#')[0];
  // Strip trailing dots/colons (but keep port-less colons for IPv6)
  s = s.replace(/[.]+$/, '');
  // Strip port number (e.g. example.com:443)
  s = s.replace(/:\d+$/, '');
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
  const fileType = getFileType(url);
  const icon = renderFileTypeIcon(fileType);
  const badge = document.createElement('span');
  badge.className = `status-badge ${cls}`; badge.textContent = status;
  const urlSpan = document.createElement('span');
  urlSpan.className = `url-text ft-${fileType}`; urlSpan.textContent = stripProtocol(url);
  entry.dataset.filetype = fileType;
  entry.appendChild(icon); entry.appendChild(badge); entry.appendChild(urlSpan);
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

// ============================================================
// FILTER BARS
// ============================================================
function setupFilter(inputId, listId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('input', () => {
    const query = input.value.toLowerCase().trim();
    const list = document.getElementById(listId);
    const entries = list.querySelectorAll('.found-entry');
    entries.forEach(entry => {
      if (!query) {
        entry.style.display = '';
        return;
      }
      const text = entry.textContent.toLowerCase();
      entry.style.display = text.includes(query) ? '' : 'none';
    });
  });
}

setupFilter('filter-ferox', 'ferox-results');
setupFilter('filter-maigret', 'maigret-results');

// ============================================================
// SAVE REPORT
// ============================================================
function generateReport(title, entries) {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rows = entries.map(e => {
    if (e.status) {
      return `<tr><td class="s${Math.floor(e.status/100)}xx">${e.status}</td><td><a href="${e.url}">${e.url}</a></td></tr>`;
    }
    if (e.site) {
      return `<tr><td>${e.site}</td><td><a href="${e.url}">${e.url}</a></td></tr>`;
    }
    return `<tr><td colspan="2">${e.text || ''}</td></tr>`;
  }).join('\n');

  return {
    filename: `darktrace-${title.toLowerCase().replace(/\s+/g, '-')}-${dateStr}.html`,
    content: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Darktrace Report — ${title}</title>
<style>
  body { background: #0a0e17; color: #c9d4e6; font-family: Consolas, monospace; padding: 24px; }
  h1 { color: #00e8ff; font-size: 18px; letter-spacing: 3px; border-bottom: 1px solid #1a2a3f; padding-bottom: 8px; }
  .meta { color: #8a96a8; font-size: 12px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; color: #8a96a8; font-size: 11px; letter-spacing: 2px; padding: 6px 10px; border-bottom: 1px solid #1a2a3f; }
  td { padding: 4px 10px; font-size: 13px; border-bottom: 1px solid #0a0f18; }
  a { color: #3f7fd1; text-decoration: none; }
  a:hover { color: #00e8ff; text-decoration: underline; }
  .s2xx { color: #50d060; font-weight: bold; }
  .s3xx { color: #d0c040; font-weight: bold; }
  .s4xx { color: #e08030; font-weight: bold; }
  .s5xx { color: #e04040; font-weight: bold; }
  pre { background: #060a14; padding: 12px; border: 1px solid #1a2a3f; border-radius: 3px; white-space: pre-wrap; font-size: 12px; color: #8a96a8; overflow-x: auto; }
</style></head><body>
<h1>DARKTRACE — ${title}</h1>
<div class="meta">Generated: ${now.toLocaleString()}</div>
<table><thead><tr>${entries.length && entries[0].status ? '<th>STATUS</th><th>URL</th>' : entries.length && entries[0].site ? '<th>SITE</th><th>URL</th>' : '<th colspan="2">DATA</th>'}</tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`,
  };
}

function generateReconReport(target, allText) {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return {
    filename: `darktrace-recon-${target.replace(/[^a-zA-Z0-9.-]/g, '_')}-${dateStr}.html`,
    content: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Darktrace Recon — ${target}</title>
<style>
  body { background: #0a0e17; color: #c9d4e6; font-family: Consolas, monospace; padding: 24px; }
  h1 { color: #00e8ff; font-size: 18px; letter-spacing: 3px; border-bottom: 1px solid #1a2a3f; padding-bottom: 8px; }
  .meta { color: #8a96a8; font-size: 12px; margin-bottom: 16px; }
  pre { background: #060a14; padding: 12px; border: 1px solid #1a2a3f; border-radius: 3px; white-space: pre-wrap; font-size: 12px; color: #8a96a8; overflow-x: auto; }
</style></head><body>
<h1>DARKTRACE — NETWORK RECON</h1>
<div class="meta">Target: ${target} | Generated: ${now.toLocaleString()}</div>
<pre>${allText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body></html>`,
  };
}

async function saveBtn(btnId, getReport) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const report = getReport();
    if (!report) return;
    const result = await window.scanner.saveReport(report);
    if (result.ok) {
      btn.textContent = 'SAVED';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'SAVE'; btn.classList.remove('copied'); }, 1500);
    }
  });
}

saveBtn('btn-save-ferox', () => {
  if (!feroxFoundUrls.length) return null;
  const entries = feroxFoundUrls.map(url => {
    // Try to recover status from the DOM
    const row = Array.from(feroxResults.querySelectorAll('.found-entry')).find(e => {
      const urlEl = e.querySelector('.url-text');
      return urlEl && url.includes(urlEl.textContent);
    });
    const statusEl = row && row.querySelector('.status-badge');
    return { status: statusEl ? parseInt(statusEl.textContent) : 200, url };
  });
  return generateReport('URL Scan — ' + (domainInput.value || 'unknown'), entries);
});

saveBtn('btn-save-maigret', () => {
  if (!maigretFoundUrls.length) return null;
  const entries = maigretFoundUrls.map(url => {
    const row = Array.from(maigretResults.querySelectorAll('.found-entry')).find(e => {
      const urlEl = e.querySelector('.url-text');
      return urlEl && url.includes(urlEl.textContent);
    });
    const siteEl = row && row.querySelector('.site-badge');
    return { site: siteEl ? siteEl.textContent : '', url };
  });
  return generateReport('Username OSINT — ' + (usernameInput.value || 'unknown'), entries);
});

saveBtn('btn-save-recon', () => {
  if (!reconAllText) return null;
  return generateReconReport(reconTargetInput.value || 'unknown', reconAllText);
});

// ============================================================
// SPLASH SCREEN
// ============================================================
(function initSplash() {
  const overlay = document.getElementById('splash-overlay');
  if (!overlay) return;

  // Skip if user dismissed permanently
  if (localStorage.getItem('splash-dismissed') === '1') {
    overlay.remove();
    return;
  }

  // Only show now that we know it should be visible
  overlay.classList.add('visible');

  const textEl = document.getElementById('splash-text');
  const cursorEl = document.getElementById('splash-cursor');
  const audio = document.getElementById('splash-audio');
  const muteBtn = document.getElementById('splash-mute');
  const volumeSlider = document.getElementById('splash-volume');
  const acceptBtn = document.getElementById('splash-accept');
  const dismissCheck = document.getElementById('splash-dismiss-check');

  const fullText = 'This software performs active network reconnaissance against remote hosts. All activity may be logged, monitored, and traceable to your IP address.\n\nUnauthorized scanning is a criminal offense in most jurisdictions. The developer assumes no liability whatsoever for your use of this tool.\n\nBy proceeding, you confirm you have authorization to scan your target and accept full legal responsibility.';
  let charIndex = 0;

  // Start music
  audio.volume = 0.8;
  audio.play().catch(() => {});

  // Typewriter effect — 5ms per char
  const typeInterval = setInterval(() => {
    if (charIndex < fullText.length) {
      textEl.textContent += fullText[charIndex];
      charIndex++;
    } else {
      clearInterval(typeInterval);
    }
  }, 12);

  // Mute toggle
  let muted = false;
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    audio.muted = muted;
    muteBtn.textContent = muted ? '🔇' : '🔊';
  });

  // Volume slider
  volumeSlider.addEventListener('input', () => {
    audio.volume = volumeSlider.value / 100;
    if (audio.muted && volumeSlider.value > 0) {
      audio.muted = false; muted = false;
      muteBtn.textContent = '🔊';
    }
  });

  // Dismiss splash
  function dismissSplash() {
    clearInterval(typeInterval);
    audio.pause();
    audio.currentTime = 0;
    if (dismissCheck.checked) {
      localStorage.setItem('splash-dismissed', '1');
    }
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 500);
  }

  acceptBtn.addEventListener('click', dismissSplash);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('splash-overlay')) {
      dismissSplash();
    }
  });
})();

// ============================================================
// NETWORK RECON STATE & LOGIC
// ============================================================
const reconTargetInput = document.getElementById('recon-target');
const btnRecon = document.getElementById('btn-recon');
const btnAbortRecon = document.getElementById('btn-abort-recon');
const reconResultsEl = document.getElementById('recon-results');
const reconPbFill = document.getElementById('recon-pb-fill');
const reconProgress = document.getElementById('recon-progress');
const reconModuleProgressEl = document.getElementById('recon-module-progress');
const reconCurrentModule = document.getElementById('recon-current-module');
const reconPctEl = document.getElementById('recon-pct');
const reconTimerEl = document.getElementById('recon-timer');

let reconRunning = false;
let reconTimerStart = 0;
let reconTimerInterval = null;
let reconModulesTotal = 0;
let reconModulesDone = 0;
let reconAllText = ''; // For copy button

const MODULE_LABELS = {
  'Ping': 'ping',
  'DNS Records': 'dns',
  'Traceroute': 'tracert',
  'WHOIS / RDAP': 'whois',
  'Port Scan': 'ports',
  'IP Geolocation': 'geo',
};

function getSelectedReconModules() {
  return {
    ping: document.getElementById('recon-mod-ping').checked,
    dns: document.getElementById('recon-mod-dns').checked,
    tracert: document.getElementById('recon-mod-tracert').checked,
    whois: document.getElementById('recon-mod-whois').checked,
    ports: document.getElementById('recon-mod-ports').checked,
    geo: document.getElementById('recon-mod-geo').checked,
  };
}

function setReconState(running) {
  reconRunning = running;
  btnRecon.classList.toggle('hidden', running);
  btnAbortRecon.classList.toggle('hidden', !running);
  btnRecon.disabled = running;
  reconTargetInput.disabled = running;
  document.querySelectorAll('.recon-modules input').forEach(c => c.disabled = running);
}

function startReconTimer() {
  reconTimerStart = performance.now();
  reconTimerInterval = setInterval(() => {
    reconTimerEl.textContent = fmtTime(performance.now() - reconTimerStart);
  }, 500);
}

function stopReconTimer() {
  if (reconTimerInterval) { clearInterval(reconTimerInterval); reconTimerInterval = null; }
}

// Format recon module data into readable text
// Returns { text, html } — html is set only when color coding is needed
function formatReconData(name, data) {
  if (!data) return { text: '' };
  if (data.error) return { text: 'Error: ' + data.error };
  if (data.skipped) return { text: data.skipped };

  // Ping: color-code latency values
  if (name === 'Ping' && typeof data === 'string') {
    // Escape HTML entities
    const esc = data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Color-code lines containing "time=" or "time<" with ms values
    const colored = esc.replace(/(time[<=])(\d+)(ms)/gi, (match, prefix, ms) => {
      const val = parseInt(ms, 10);
      let color;
      if (val < 50) color = '#50D060';       // green — excellent
      else if (val < 100) color = '#80D060';  // light green — good
      else if (val < 150) color = '#D0C040';  // yellow — okay
      else if (val < 250) color = '#E08030';  // orange — slow
      else color = '#E04040';                 // red — bad
      return `${prefix}<span style="color:${color};font-weight:bold">${ms}</span>ms`;
    });
    // Also color the summary stats line (Minimum, Maximum, Average)
    const withSummary = colored.replace(/(Minimum|Maximum|Average)\s*=\s*(\d+)(ms)/gi, (match, label, ms) => {
      const val = parseInt(ms, 10);
      let color;
      if (val < 50) color = '#50D060';
      else if (val < 100) color = '#80D060';
      else if (val < 150) color = '#D0C040';
      else if (val < 250) color = '#E08030';
      else color = '#E04040';
      return `${label} = <span style="color:${color};font-weight:bold">${ms}</span>ms`;
    });
    // Color packet loss
    const withLoss = withSummary.replace(/\((\d+)% loss\)/gi, (match, pct) => {
      const val = parseInt(pct, 10);
      let color;
      if (val === 0) color = '#50D060';
      else if (val <= 25) color = '#D0C040';
      else if (val <= 50) color = '#E08030';
      else color = '#E04040';
      return `(<span style="color:${color};font-weight:bold">${pct}%</span> loss)`;
    });
    return { text: data, html: withLoss };
  }

  if (typeof data === 'string') return { text: data };

  let lines = [];

  if (name === 'DNS Records' && typeof data === 'object') {
    for (const [type, val] of Object.entries(data)) {
      lines.push(`  [${type}]`);
      lines.push('  ' + String(val).split('\n').join('\n  '));
      lines.push('');
    }
    return { text: lines.join('\n') };
  }

  if (name === 'WHOIS / RDAP') {
    if (data.ldhName || data.handle || data.name) {
      // RDAP domain response
      const interesting = ['ldhName', 'handle', 'status', 'port43'];
      for (const k of interesting) {
        if (data[k]) lines.push(`  ${k}: ${Array.isArray(data[k]) ? data[k].join(', ') : data[k]}`);
      }
      if (data.events) {
        for (const ev of data.events) {
          lines.push(`  ${ev.eventAction}: ${ev.eventDate}`);
        }
      }
      if (data.entities) {
        for (const ent of data.entities) {
          if (ent.roles) lines.push(`  roles: ${ent.roles.join(', ')}`);
          if (ent.vcardArray && ent.vcardArray[1]) {
            for (const field of ent.vcardArray[1]) {
              if (field[0] === 'fn') lines.push(`    name: ${field[3]}`);
              if (field[0] === 'adr' && field[3]) lines.push(`    address: ${typeof field[3] === 'string' ? field[3] : JSON.stringify(field[3])}`);
              if (field[0] === 'email') lines.push(`    email: ${field[3]}`);
            }
          }
        }
      }
      if (data.nameservers) {
        lines.push('  Nameservers:');
        for (const ns of data.nameservers) lines.push(`    ${ns.ldhName || JSON.stringify(ns)}`);
      }
    } else {
      // ipwhois.app response for IPs
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v !== 'object') lines.push(`  ${k}: ${v}`);
      }
    }
    return { text: lines.join('\n') || JSON.stringify(data, null, 2) };
  }

  if (name === 'Port Scan' && Array.isArray(data)) {
    const open = data.filter(p => p.status === 'open');
    const closed = data.filter(p => p.status === 'closed');
    if (open.length) lines.push(`  Open ports: ${open.map(p => p.port).join(', ')}`);
    if (closed.length) lines.push(`  Closed ports: ${closed.map(p => p.port).join(', ')}`);
    return { text: lines.join('\n') };
  }

  if (name === 'IP Geolocation') {
    const fields = ['query', 'country', 'regionName', 'city', 'zip', 'lat', 'lon', 'timezone', 'isp', 'org', 'as', 'asname', 'reverse'];
    for (const f of fields) {
      if (data[f]) lines.push(`  ${f}: ${data[f]}`);
    }
    return { text: lines.join('\n') };
  }

  // Fallback: stringify
  const fallback = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
  return { text: fallback };
}

// Create a module result card in the results area
function addReconModuleResult(name, status, data) {
  // Check if card already exists
  let card = reconResultsEl.querySelector(`.recon-card[data-module="${name}"]`);
  if (!card) {
    const empty = reconResultsEl.querySelector('.results-empty');
    if (empty) empty.remove();

    card = document.createElement('div');
    card.className = 'recon-card';
    card.dataset.module = name;

    const header = document.createElement('div');
    header.className = 'recon-card-header';

    const indicator = document.createElement('span');
    indicator.className = 'recon-card-indicator';

    const title = document.createElement('span');
    title.className = 'recon-card-title';
    title.textContent = name;

    const statusBadge = document.createElement('span');
    statusBadge.className = 'recon-card-status';

    header.appendChild(indicator);
    header.appendChild(title);
    header.appendChild(statusBadge);

    const body = document.createElement('pre');
    body.className = 'recon-card-body';

    card.appendChild(header);
    card.appendChild(body);
    reconResultsEl.appendChild(card);

    // Toggle collapse on header click
    header.addEventListener('click', () => {
      card.classList.toggle('collapsed');
    });
  }

  const indicator = card.querySelector('.recon-card-indicator');
  const statusBadge = card.querySelector('.recon-card-status');
  const body = card.querySelector('.recon-card-body');

  if (status === 'running') {
    card.classList.add('running');
    card.classList.remove('done', 'error');
    indicator.className = 'recon-card-indicator running';
    statusBadge.textContent = 'RUNNING';
    statusBadge.className = 'recon-card-status running';
    body.textContent = 'Gathering data...';
  } else {
    card.classList.remove('running');
    card.classList.add('done');
    indicator.className = 'recon-card-indicator done';
    const formatted = formatReconData(name, data);
    if (formatted.html) {
      body.innerHTML = formatted.html;
    } else {
      body.textContent = formatted.text || 'No data';
    }
    reconAllText += `\n=== ${name} ===\n${formatted.text}\n`;

    const hasError = data && (data.error || data.skipped);
    if (hasError) {
      statusBadge.textContent = data.skipped ? 'SKIPPED' : 'ERROR';
      statusBadge.className = 'recon-card-status ' + (data.skipped ? 'skipped' : 'error');
      indicator.className = 'recon-card-indicator ' + (data.skipped ? 'skipped' : 'error');
    } else {
      statusBadge.textContent = 'DONE';
      statusBadge.className = 'recon-card-status done';
    }

    reconModulesDone++;
    reconModuleProgressEl.textContent = `${reconModulesDone}/${reconModulesTotal}`;
    const pct = Math.round((reconModulesDone / reconModulesTotal) * 100);
    reconPbFill.style.width = pct + '%';
    reconPctEl.textContent = pct + '%';

    playSound();
  }

  reconResultsEl.scrollTop = reconResultsEl.scrollHeight;
}

reconTargetInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnRecon.click(); });

btnRecon.addEventListener('click', async () => {
  const raw = reconTargetInput.value.trim();
  if (!raw) { showError('Enter a domain or IP address.'); return; }

  // Clean the input: strip protocol, www, path, query, port
  const target = cleanTarget(raw);
  if (!target) { showError('Could not parse a valid domain or IP from that input.'); return; }

  // Validate the cleaned result: only safe characters
  if (!/^[a-zA-Z0-9.\-:]+$/.test(target)) {
    showError('Invalid target. Could not extract a valid domain or IP address.');
    return;
  }

  // Update the input field to show the cleaned value
  reconTargetInput.value = target;

  if (!scanWarnSuppressed) {
    const proceed = await showScanWarning();
    if (!proceed) return;
  }

  const modules = getSelectedReconModules();
  reconModulesTotal = Object.values(modules).filter(Boolean).length;
  if (reconModulesTotal === 0) { showError('Select at least one module.'); return; }

  // Reset state
  reconModulesDone = 0;
  reconAllText = `Network Recon: ${target}\nDate: ${new Date().toISOString()}\n`;
  reconResultsEl.innerHTML = '';
  reconPbFill.style.width = '0%';
  reconPbFill.classList.remove('complete', 'indeterminate');
  reconPbFill.style.opacity = '1';
  reconModuleProgressEl.textContent = `0/${reconModulesTotal}`;
  reconPctEl.textContent = '0%';
  reconTimerEl.textContent = '00:00';
  reconProgress.className = 'progress-section scanning';
  reconCurrentModule.innerHTML = '<span class="pb-label">Starting recon...</span>';
  errorBanner.classList.add('hidden');

  setReconState(true);
  startReconTimer();
  startSpriteVideo();

  const result = await window.scanner.startRecon({ target, modules });
  if (result.error) {
    showError(result.error);
    setReconState(false);
    stopReconTimer();
    reconProgress.className = 'progress-section';
    stopSpriteVideo();
  }
});

btnAbortRecon.addEventListener('click', async () => {
  await window.scanner.abortRecon();
  setReconState(false);
  stopReconTimer();
  reconPbFill.classList.remove('indeterminate');
  reconProgress.className = 'progress-section stopped';
  reconCurrentModule.innerHTML = '<span class="pb-label">Aborted</span>';
  stopSpriteVideo();
});

// Listen for module updates
window.scanner.onReconModule((msg) => {
  reconCurrentModule.innerHTML = `<span class="pb-label">${msg.status === 'running' ? 'Running' : 'Completed'}:</span> <strong>${msg.name}</strong>`;
  addReconModuleResult(msg.name, msg.status, msg.data);
});

window.scanner.onReconComplete((status) => {
  setReconState(false);
  stopReconTimer();
  stopSpriteVideo();

  if (status === 'done') {
    reconPbFill.style.width = '100%';
    reconPbFill.classList.add('complete');
    reconProgress.className = 'progress-section complete';
    reconPctEl.textContent = '100%';
    reconCurrentModule.innerHTML = '<span class="pb-label">Recon complete</span>';
  } else {
    reconProgress.className = 'progress-section stopped';
    reconCurrentModule.innerHTML = '<span class="pb-label">Aborted</span>';
  }
});

// Copy button for recon
setupCopyBtn('btn-copy-recon', () => reconAllText ? [reconAllText] : []);

// ============================================================
// EXTRA TOOLS — open links in browser
// ============================================================
document.querySelectorAll('.extra-tool-card').forEach(card => {
  card.addEventListener('click', () => {
    const url = card.dataset.url;
    if (url) window.scanner.openExternal(url);
  });
});

// ============================================================
// INIT
// ============================================================
init();
