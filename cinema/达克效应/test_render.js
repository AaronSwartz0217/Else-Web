const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/* 极值帧预览（源帧）。四场景各自取「信号极值」，不撒均匀点。
   用法：node test_render.js [源帧 源帧 ...]   —— 不给参数就跑下面的默认表 */
const OUT_DIR = path.join(__dirname, 'testsnap');

const SEGMENTS = [
    { file: 'scenes/A_throne.html', start: 0, len: 113 },
    { file: 'scenes/B_march.html', start: 113, len: 135 },
    { file: 'scenes/C_castle.html', start: 248, len: 427 },
    { file: 'scenes/D_ruins.html', start: 675, len: 113 },
];

const DEFAULT_FRAMES = [
    // A ① 王国·宝座
    6,    // 火盆第一盏亮起
    32,   // 推轨到位 · 四勇士跪 · 字幕
    56,   // 国王抬手到位
    70,   // 白光射出 · 横向光带
    92,   // 起身转身 → 出门 · 空殿
    // B ②③④
    120,  // 雪山 · 风雪
    135,  // 雪山 · 巨峰全景
    180,  // 森林 · 树根与萤火
    200,  // 森林 · 光斑打背
    225,  // 荒漠 · 红月 + 枯骨
    245,  // 荒漠 · 风沙抹脚印
    // C ⑤⑥⑦⑧⑨
    270,  // 城堡远景 · 雷闪
    305,  // 勇士一举剑
    350,  // 龙炎喷涌
    368,  // 白光吞没
    400,  // 勇士二翻滚
    445,  // 利爪黑影覆盖
    500,  // 勇士三踱步
    545,  // 红光一闪
    590,  // 勇士四疾冲
    648,  // 拔刺那一帧
    668,  // 龙崩解
    // D ⑩ 废墟之上
    700,  // 拉远俯视 · 尸山
    740,  // 远处又一批勇士走来
    770,  // 标题卡「达克效应」
];

function fileForFrame(f) {
    for (const s of SEGMENTS) if (f >= s.start && f < s.start + s.len) return s.file;
    return SEGMENTS[SEGMENTS.length - 1].file;
}

async function main() {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const argFrames = process.argv.slice(2).map(Number).filter(n => Number.isFinite(n));
    const FRAMES = argFrames.length ? argFrames : DEFAULT_FRAMES;

    const exePath = path.join(process.env.USERPROFILE, 'AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe');
    const browser = await chromium.launch({
        headless: true,
        executablePath: fs.existsSync(exePath) ? exePath : undefined,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
    });

    // 按场景分组，一个场景只开一次页面
    const groups = new Map();
    for (const f of FRAMES) {
        const rel = fileForFrame(f);
        if (!groups.has(rel)) groups.set(rel, []);
        groups.get(rel).push(f);
    }

    for (const [rel, frames] of groups) {
        const abs = path.join(__dirname, rel);
        if (!fs.existsSync(abs)) { console.warn(`!! 缺 ${rel}，跳过 ${frames.length} 帧`); continue; }
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
        page.on('pageerror', e => console.error('JS ERROR[' + rel + ']:', e.message));
        page.on('console', m => { if (m.type() === 'error') console.error('PAGE ERROR[' + rel + ']:', m.text()); });
        await page.goto('file:///' + abs.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
        await page.waitForFunction('window.__renderDone === true', { timeout: 30000 });
        for (const f of frames) {
            const dataUrl = await page.evaluate((frame) => {
                window.renderFrame(frame);
                return document.getElementById('c').toDataURL('image/png');
            }, f);
            const out = path.join(OUT_DIR, `snap${String(f).padStart(4, '0')}.png`);
            fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
            console.log(`snap ${String(f).padStart(4, '0')} -> ${path.basename(out)}  (${rel})`);
        }
        await page.close();
    }
    await browser.close();
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
