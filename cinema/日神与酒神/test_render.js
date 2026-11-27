const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/* 三个场景文件分段（与 render.js 同一张表） */
const SEGMENTS = [
  { file: 'scenes/A_apollo.html', start: 0, len: 600, name: '① 日神 · 光明庭院' },
  { file: 'scenes/B_dionysus.html', start: 600, len: 600, name: '② 酒神 · 夜里的狂欢' },
  { file: 'scenes/C_tragedy.html', start: 1200, len: 600, name: '③ 悲剧 · 半圆剧场' },
];
function segFor(src) {
  for (const s of SEGMENTS) if (src >= s.start && src < s.start + s.len) return s;
  return SEGMENTS[SEGMENTS.length - 1];
}

const OUT_DIR = path.join(__dirname, 'testsnap');
/* 极值帧：每拍建立 / 转折 / 每个动作峰值 / 字幕刻完 / 首尾（§6.1） */
const FRAMES = [
  26, 96, 170, 250, 320, 390, 450, 510, 570,          // ① 日神（9）
  626, 700, 760, 840, 920, 990, 1060, 1150,           // ② 酒神（8）
  1246, 1320, 1380, 1450, 1520, 1600, 1680, 1780, 1795, // ③ 悲剧（9）
];

async function main() {
    const only = process.argv[2];                       // 可选：只跑某一段（A / B / C）
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const exePath = path.join(process.env.USERPROFILE, 'AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe');
    const browser = await chromium.launch({
        headless: true,
        executablePath: fs.existsSync(exePath) ? exePath : undefined,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
    });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    let page = null, loaded = null;

    async function useSegment(rel) {
        if (loaded === rel && page) return;
        if (page) { await page.close(); page = null; }
        page = await context.newPage();
        page.on('pageerror', err => console.error('JS ERROR[' + rel + ']:', err.message));
        page.on('console', msg => { if (msg.type() === 'error') console.error('PAGE ERROR[' + rel + ']:', msg.text()); });
        const abs = path.join(__dirname, rel);
        await page.goto('file:///' + abs.replace(/\\/g, '/') + '?frame=0', { waitUntil: 'networkidle' });
        await page.waitForFunction('window.__renderDone === true', { timeout: 40000 });
        loaded = rel;
        console.log('  → 加载 ' + rel);
    }

    const list = FRAMES.filter(f => !only || segFor(f).file.indexOf(only) >= 0);
    const t0 = Date.now();
    for (const f of list) {
        await useSegment(segFor(f).file);
        const dataUrl = await page.evaluate((frame) => {
            window.renderFrame(frame);
            return document.getElementById('c').toDataURL('image/png');
        }, f);
        const out = path.join(OUT_DIR, `snap${String(f).padStart(4, '0')}.png`);
        fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
        console.log(`snap ${f} (${segFor(f).name}) -> ${path.basename(out)}`);
    }
    const dt = (Date.now() - t0) / 1000;
    console.log(`${list.length} frames in ${dt.toFixed(1)}s  (${(list.length / dt).toFixed(2)} fps)`);
    await browser.close();
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
