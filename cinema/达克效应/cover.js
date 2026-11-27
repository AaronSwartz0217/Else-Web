const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 封面帧（源帧）：⑩ 标题卡「达克效应」落定、偏下小字已出、全片淡出尚未开始
const COVER_FRAME = 768;
const OUT_NAME = 'dk_cover.png';

const SEGMENTS = [
    { file: 'scenes/A_throne.html', start: 0, len: 113 },
    { file: 'scenes/B_march.html', start: 113, len: 135 },
    { file: 'scenes/C_castle.html', start: 248, len: 427 },
    { file: 'scenes/D_ruins.html', start: 675, len: 113 },
];
function segFor(src) {
    for (const s of SEGMENTS) if (src >= s.start && src < s.start + s.len) return s;
    return SEGMENTS[SEGMENTS.length - 1];
}

async function main() {
    const args = process.argv.slice(2).map(Number).filter(n => Number.isFinite(n));
    const frames = args.length ? args : [COVER_FRAME];

    const exePath = path.join(process.env.USERPROFILE, 'AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe');
    const browser = await chromium.launch({
        headless: true,
        executablePath: fs.existsSync(exePath) ? exePath : undefined,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
    });

    for (const f of frames) {
        const rel = segFor(f).file;
        const abs = path.join(__dirname, rel);
        if (!fs.existsSync(abs)) { console.error(`缺 ${rel}`); continue; }
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
        page.on('pageerror', e => console.error('JS ERROR:', e.message));
        await page.goto('file:///' + abs.replace(/\\/g, '/') + '?frame=0', { waitUntil: 'networkidle' });
        await page.waitForFunction('window.__renderDone === true', { timeout: 30000 });
        const dataUrl = await page.evaluate((frame) => {
            window.renderFrame(frame);
            return document.getElementById('c').toDataURL('image/png');
        }, f);
        // 单帧 → 正式封面名；多帧 → 候选名（用来挑帧）
        const name = frames.length === 1 ? OUT_NAME : `cover_${String(f).padStart(3, '0')}.png`;
        const out = path.join(__dirname, name);
        fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
        console.log(`封面 ${f} (${rel}) -> ${name}`);
        await page.close();
    }
    await browser.close();
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
