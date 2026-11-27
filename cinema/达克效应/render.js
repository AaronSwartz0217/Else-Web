const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FPS = 30;
// 全片 0.75 倍速：输出帧数 = 源帧数 / 0.75，逐帧采样动画的 0.75× 位置
//（场景是帧的纯函数，只换采样密度 —— 拿到的是真正不同的帧，不靠 ffmpeg 抽帧凑时长）
const SPEED = 0.75;
const TOTAL_SRC = 788;
const TOTAL_FRAMES = Math.round(TOTAL_SRC / SPEED);   // 1051 ≈ 35.0s @30fps
const OUT_DIR = path.join(__dirname, 'frames');

// 多文件分段：每个 scene 只负责自己那一段全局源帧，逐段 goto 对应文件
const SEGMENTS = [
    { file: 'scenes/A_throne.html', start: 0, len: 113, name: '① 王国·宝座' },
    { file: 'scenes/B_march.html', start: 113, len: 135, name: '②③④ 行进' },
    { file: 'scenes/C_castle.html', start: 248, len: 427, name: '⑤⑥⑦⑧⑨ 城堡与四勇士' },
    { file: 'scenes/D_ruins.html', start: 675, len: 113, name: '⑩ 废墟之上' },
];

function segFor(src) {
    for (const s of SEGMENTS) if (src >= s.start && src < s.start + s.len) return s;
    return SEGMENTS[SEGMENTS.length - 1];
}

async function main() {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    console.log(`Starting render: ${TOTAL_FRAMES} frames at ${FPS}fps · 0.75× · ${SEGMENTS.length} scene files`);

    const exePath = path.join(
        process.env.USERPROFILE,
        'AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe'
    );
    const browser = await chromium.launch({
        headless: true,
        executablePath: fs.existsSync(exePath) ? exePath : undefined,
        // headless 下启用软件 WebGL（SwiftShader），否则后处理 shader 无法编译
        args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
            '--enable-webgl',
        ],
    });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
    });

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
        await page.waitForFunction('window.__renderDone === true', { timeout: 30000 });
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
            console.log(`Frame ${f}/${TOTAL_FRAMES} (src ${src.toFixed(1)} · ${segFor(src).name}) - ${fps.toFixed(1)} fps - ETA ${remain.toFixed(0)}s`);
        }
    }

    if (page) await page.close();
    await browser.close();
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Render complete! ${rendered} frames written in ${totalTime}s`);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
