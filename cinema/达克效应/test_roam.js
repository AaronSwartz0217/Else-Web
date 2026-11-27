const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SCENES = ['A_throne.html', 'B_march.html', 'C_castle.html', 'D_ruins.html'];
const browserPath = path.join(process.env.USERPROFILE || '',
  'AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(browserPath) ? browserPath : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const report = [];

  for (const file of SCENES) {
    const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const url = pathToFileURL(path.join(__dirname, 'scenes', file)).href + '?roam=1';
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.DK && window.Roam && document.querySelector('canvas'));
    const before = await page.evaluate(() => ({ x: DK.CAM.x, z: DK.CAM.z }));
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(2400); // 软件 WebGL 下复杂场景需要等待完整帧
    await page.keyboard.up('KeyS');
    const after = await page.evaluate(() => ({ x: DK.CAM.x, z: DK.CAM.z }));
    const state = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const box = canvas.getBoundingClientRect();
      return {
        pixelSize: [canvas.width, canvas.height],
        displaySize: [Math.round(box.width), Math.round(box.height)],
        hud: document.body.innerText.includes('ROAM')
      };
    });
    report.push({ file, pass: errors.length === 0 && state.hud &&
      (before.x !== after.x || before.z !== after.z), errors, state });
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(__dirname, '漫游.html')).href, { waitUntil: 'load' });
  await page.click('[data-scene="castle"]');
  await page.waitForFunction(() => document.querySelector('#world').src.includes('C_castle.html'));
  await page.waitForTimeout(400);
  const preview = path.join(__dirname, 'testsnap', '漫游入口预览.png');
  fs.mkdirSync(path.dirname(preview), { recursive: true });
  await page.screenshot({ path: preview });
  report.push({ file: '漫游.html', pass: errors.length === 0, errors,
    scene: await page.textContent('#sceneLabel') });

  await browser.close();
  console.table(report.map(item => ({ file: item.file, pass: item.pass,
    errors: item.errors.length, scene: item.scene || '' })));
  if (report.some(item => !item.pass)) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
