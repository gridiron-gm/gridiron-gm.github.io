// Screenshot the redesign mockups at 1440px and a true 390px phone viewport (Chrome DevTools protocol).
// Usage: node mockups/shoot.mjs   (serves the project on port 8123 while it runs)
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'mockups/screens'); mkdirSync(OUT, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const srv = spawn('python3', ['-m', 'http.server', '8123'], { cwd: root, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=9333', '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'nflgm-shot-')), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40 && !targets; i++) { await sleep(250); try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); } catch {} }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const wait = {};
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && wait[m.id]) { wait[m.id](m.result); delete wait[m.id]; } });
const cdp = (method, params = {}) => new Promise(r => { wait[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
const only = process.argv[2];
try {
  for (const s of ['hub', 'roster', 'player', 'trade']) {
    if (only && only !== s) continue;
    for (const w of [1440, 390]) {
      const mobile = w < 500, dpr = mobile ? 2 : 1;
      await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: dpr, mobile });
      await cdp('Page.navigate', { url: `http://localhost:8123/mockups/index.html?screen=${s}` });
      let h = 0;
      for (let i = 0; i < 80 && !h; i++) { await sleep(150); const r = await cdp('Runtime.evaluate', { expression: 'document.title' }); const m = /^H:(\d+)/.exec(r.result.value || ''); if (m) h = +m[1]; }
      await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
      await sleep(600);
      const ov = await cdp('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth' });
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      const f = join(OUT, `${s}-${w}.png`); writeFileSync(f, Buffer.from(shot.data, 'base64'));
      console.log(`mockups/screens/${s}-${w}.png  ${w}x${h}  (page width ${ov.result.value})`);
    }
  }
} finally { ws.close(); chrome.kill(); srv.kill(); }
