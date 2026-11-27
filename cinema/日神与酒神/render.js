const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FPS = 30;
const SPEED = 1;
const TOTAL_FRAMES = 1800;                       // 60.0s @30fps（三段 × 600）
const OUT_DIR = path.join(__dirname, 'frames');

/* 三个场景文件分段：每个 scene 只负责自己那 600 帧，逐段 goto 对应文件 */
const SEGMENTS = [
    { file: 'scenes/A_apollo.html', start: 0, len: 600, name: '① 日神 · 光明庭院' },
    { file: 'scenes/B_dionysus.html', start: 600, len: 600, name: '② 酒神 · 夜里的狂欢' },
    { file: 'scenes/C_tragedy.html', start: 1200, len: 600, name: '③ 悲剧 · 半圆剧场' },
];
function segFor(src) {
    for (const s of SEGMENTS) if (src >= s.start && src < s.start + s.len) return s;
    return SEGMENTS[SEGMENTS.length - 1];
}

async function main() {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log(`Starting render: ${TOTAL_FRAMES} frames at ${FPS}fps · real WebGL2 3D · ${SEGMENTS.length} scenes`);

    const exePath = path.join(
        process.env.USERPROFILE,
        'AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe'
    );
    const browser = await chromium.launch({
        headless: true,
        executablePath: fs.existsSync(exePath) ? exePath : undefined,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
    });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

    const startTime = Date.now();
    let rendered = 0, loadedRel = null, page = null;

    async function useSegment(rel) {
        if (loadedRel === rel && page) return;
        if (page) { await page.close(); page = null; }
        page = await context.newPage();
        page.on('pageerror', err => console.error(`JS ERROR[${rel}]:`, err.message));
        page.on('console', msg => { if (msg.type() === 'error') console.error(`PAGE ERROR[${rel}]:`, msg.text()); });
        const abs = path.join(__dirname, rel);
        await page.goto('file:///' + abs.replace(/\\/g, '/') + '?frame=0', { waitUntil: 'networkidle' });
        await page.waitForFunction('window.__renderDone === true', { timeout: 60000 });
        loadedRel = rel;
        console.log(`  → 加载 ${rel}`);
    }

    for (let f = 0; f < TOTAL_FRAMES; f++) {
        const outFile = path.join(OUT_DIR, `frame_${String(f).padStart(4, '0')}.png`);
        if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) continue;   // 断点续跑

        const src = f * SPEED;
        await useSegment(segFor(src).file);

        const dataUrl = await page.evaluate((frame) => {
            window.renderFrame(frame);
            return document.getElementById('c').toDataURL('image/png');
        }, src);

        fs.writeFileSync(outFile, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
        rendered++;

        if (f % 30 === 0 || f === TOTAL_FRAMES - 1) {
            const elapsed = (Date.now() - startTime) / 1000;
            const fps = rendered / elapsed;
            const remain = (TOTAL_FRAMES - f - 1) / (fps || 1);
            console.log(`Frame ${f}/${TOTAL_FRAMES} (${segFor(src).name}) - ${fps.toFixed(2)} fps - ETA ${remain.toFixed(0)}s`);
        }
    }

    if (page) await page.close();
    await browser.close();
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Render complete! ${rendered} frames written in ${totalTime}s`);
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
