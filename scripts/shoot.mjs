import { chromium } from 'playwright-core';

const URL = process.env.SHOT_URL || 'http://localhost:4173/';
const OUT = process.env.SHOT_OUT || 'screenshots/shot.png';
const W = Number(process.env.SHOT_W || 1536);
const H = Number(process.env.SHOT_H || 1024);
const WAIT = Number(process.env.SHOT_WAIT || 5000);

const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({
  executablePath: exe,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--hide-scrollbars',
  ],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
// wait for the render loop to actually reveal the scene, then let it settle
await page.waitForFunction(
  () => window.__scene && document.getElementById('loader')?.classList.contains('is-hidden'),
  { timeout: 25000 },
).catch(() => console.log('WARN: readiness wait timed out'));
await page.waitForTimeout(WAIT);
await page.screenshot({ path: OUT });
await browser.close();

if (errors.length) {
  console.log('--- page errors ---');
  console.log(errors.join('\n'));
} else {
  console.log('no page errors');
}
console.log('saved ' + OUT);
