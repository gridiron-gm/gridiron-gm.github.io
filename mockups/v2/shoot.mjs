// Screenshot v2 mockup pages: node mockups/v2/shoot.mjs name=path?query[@widths] ...
// Widths default to 1440 and 390 (390 is a true phone viewport at 2x). Serves the project on port 8125.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(root, 'mockups/v2/screens'); mkdirSync(OUT, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8125'], { cwd: root, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=9335', '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'ggv2-')), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets; for (let i = 0; i < 40 && !targets; i++) { await sleep(250); try { targets = await (await fetch('http://127.0.0.1:9335/json')).json(); } catch {} }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const wait = {}, errors = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && wait[m.id]) { wait[m.id](m.result || m); delete wait[m.id]; } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
const cdp = (method, params = {}) => new Promise(r => { wait[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
await cdp('Runtime.enable');
try {
  for (const arg of process.argv.slice(2)) {
    const name = arg.slice(0, arg.indexOf('=')), rest = arg.slice(arg.indexOf('=') + 1); const [url, ws_] = rest.split('@'); const widths = ws_ ? ws_.split(',').map(Number) : [1440, 390];
    for (const w of widths) {
      const mobile = w < 500, dpr = mobile ? 2 : 1;
      await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: dpr, mobile });
      await cdp('Page.navigate', { url: 'http://localhost:8125/' + url });
      let h = 0;
      for (let i = 0; i < 100 && !h; i++) { await sleep(150); const r = await cdp('Runtime.evaluate', { expression: 'document.title' }); const m = /^H:(\d+)/.exec(r.result?.value || ''); if (m) h = +m[1]; }
      await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: Math.min(h || 1800, mobile ? 4200 : 4800), deviceScaleFactor: dpr, mobile });
      await sleep(700);
      const sw = await cdp('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth' });
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, `${name}-${w}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`mockups/v2/screens/${name}-${w}.png  ${w}x${h}${sw.result.value > w ? '  OVERFLOW ' + sw.result.value : ''}`);
    }
  }
} finally { console.log('page errors: ' + (errors.join(' | ') || 'none')); ws.close(); chrome.kill(); srv.kill(); }
