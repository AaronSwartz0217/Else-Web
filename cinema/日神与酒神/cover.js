const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/* 封面：点题卡刻完、尚未淡出那一帧（③ 悲剧节尾巴 · 源帧 1780） */
const COVER_FRAME = 1780;
const COVER_SCENE = 'scenes/C_tragedy.html';
const OUT_NAME = 'apollo_dionysus_cover.png';

async function main() {
    const args = process.argv.slice(2).map(Number).filter(n => Number.isFinite(n));
    const frames = args.length ? args : [COVER_FRAME];
    const exePath = path.join(process.env.USERPROFILE, 'AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe');
    const browser = await chromium.launch({
        headless: true, executablePath: fs.existsSync(exePath) ? exePath : undefined,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
    });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => console.error('JS ERROR:', e.message));
    page.on('console', m => { if (m.type() === 'error') console.error('PAGE ERROR:', m.text()); });
    await page.goto('file:///' + path.join(__dirname, COVER_SCENE).replace(/\\/g, '/') + '?frame=0', { waitUntil: 'networkidle' });
    await page.waitForFunction('window.__renderDone === true', { timeout: 40000 });

    for (const f of frames) {
        const dataUrl = await page.evaluate((frame) => {
            window.renderFrame(frame);
            return document.getElementById('c').toDataURL('image/png');
        }, f);
        const name = frames.length === 1 ? OUT_NAME : `cover_${String(f).padStart(4, '0')}.png`;
        fs.writeFileSync(path.join(__dirname, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
        console.log(`封面 ${f} -> ${name}`);
    }
    await browser.close();
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
