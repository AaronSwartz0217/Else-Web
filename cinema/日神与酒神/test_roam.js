const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

/* 三个场景都要能 `?roam=1` 走一圈；并断言"默认路径是帧的纯函数"（同一帧连渲两次像素一致） */
const SCENES = ['scenes/A_apollo.html', 'scenes/B_dionysus.html', 'scenes/C_tragedy.html'];
const browserPath = path.join(process.env.USERPROFILE || '', 'AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(browserPath) ? browserPath : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const report = [];

  for (const file of SCENES) {
    const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(pathToFileURL(path.join(__dirname, file)).href + '?roam=1', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__scene && window.Roam && document.querySelector('#c'));
    const before = await page.evaluate(() => ({ x: window.__scene.CAM.x, z: window.__scene.CAM.z }));
    await page.keyboard.down('KeyS'); await page.waitForTimeout(1800); await page.keyboard.up('KeyS');
    await page.keyboard.down('KeyD'); await page.waitForTimeout(700); await page.keyboard.up('KeyD');
    const after = await page.evaluate(() => ({ x: window.__scene.CAM.x, z: window.__scene.CAM.z }));
    const state = await page.evaluate(() => ({
      size: [document.querySelector('#c').width, document.querySelector('#c').height],
      hud: document.body.innerText.includes('ROAM'),
      glErrors: (window.__scene.app.state.glErrors || []).length,
    }));
    report.push({
      file, roam: true,
      pass: errors.length === 0 && state.hud && state.glErrors === 0 && (before.x !== after.x || before.z !== after.z),
      errors: errors.length, note: state.hud ? 'HUD ok' : 'HUD 缺失',
    });
    await page.close();
  }

  /* 纯函数断言：每个场景都测同一帧连渲两次 */
  for (const file of SCENES) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, file)).href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__renderDone === true);
    const pure = await page.evaluate(() => {
      const f = 300;
      window.renderFrame(f); const a = document.getElementById('c').toDataURL('image/png');
      window.renderFrame(f + 137); window.renderFrame(f); const b = document.getElementById('c').toDataURL('image/png');
      return a === b;
    });
    report.push({ file, roam: false, pass: pure && errors.length === 0, errors: errors.length, note: pure ? '帧纯函数 ok' : '同一帧两次渲染不一致' });
    await page.close();
  }

  const sheet = path.join(__dirname, 'testsnap');
  fs.mkdirSync(sheet, { recursive: true });
  await browser.close();
  console.table(report.map(r => ({ file: r.file, roam: r.roam, pass: r.pass, errors: r.errors, note: r.note })));
  if (report.some(r => !r.pass)) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
