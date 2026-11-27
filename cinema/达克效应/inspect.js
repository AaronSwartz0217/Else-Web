const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/* ============================================================================
   逐帧图像检测（项目长期约定：出片前必跑；漏画 / 全黑这类事故肉眼拦不住）
   用法：node inspect.js [目录] [步长]
         testsnap/ 里存的是**源帧**；frames/ 里存的是**输出帧**（= 源帧 / 0.75）
   检测项：(a) 非全黑 / 非全白 + 亮度方差；(b) 关键色块（红 / 橙 / 暗）；
           (c) 亮部像素量（米白殿堂 / 雪原 / 标题卡）
   判据按**源帧**分段给 —— 每支片的配色都不同，紧贴某个 RGB 会误报
   任一项不过 → 非 0 退出，可直接当出片闸门
   ========================================================================== */
const DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'testsnap');
const SPEED = 0.75;

function expectFor(src) {
    if (src < 10) return { note: '片头淡入（黑起，不做色块判据）' };
    if (src < 113) return { red: 3000, brightMin: 1500, note: '① 王国·宝座（米白殿堂 + 红毯）' };
    if (src < 158) return { brightMin: 30000, note: '② 雪山（高亮雪原）' };
    if (src < 203) return { dark: 20000, note: '③ 森林（暗绿）' };
    if (src < 248) return { orange: 400, note: '④ 荒漠（红橙）' };
    if (src < 293) return { orange: 400, red: 400, note: '⑤ 城堡远景（紫黄昏 + 窗火）' };
    if (src < 383) return { orange: 300, note: '⑥ 勇士一·龙炎' };
    if (src < 473) return { note: '⑦ 勇士二·利爪' };
    if (src < 563) return { note: '⑧ 勇士三·对话' };
    if (src < 675) return { orange: 300, note: '⑨ 勇士四·尖刺' };
    if (src >= 774) return { note: '⑩ 片尾淡出（标题卡已落定，不做色块判据）' };
    return { brightMin: 1200, note: '⑩ 废墟之上（大殿点题）' };
}

async function main() {
    if (!fs.existsSync(DIR)) { console.error('目录不存在：', DIR); process.exit(2); }
    const step = Math.max(1, parseInt(process.argv[3] || '1', 10) || 1);
    const files = fs.readdirSync(DIR).filter(f => /\.png$/i.test(f)).sort().filter((_, i) => i % step === 0);
    if (!files.length) { console.error('目录里没有 PNG：', DIR); process.exit(2); }

    const exePath = path.join(process.env.USERPROFILE, 'AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe');
    const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(exePath) ? exePath : undefined });
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    await page.goto('about:blank');

    let failed = 0;
    console.log(`inspect: ${files.length} images in ${DIR}\n`);
    console.log(' file#   src   mean  std     red  orange    dark  bright   verdict');
    console.log('------------------------------------------------------------------');

    for (const name of files) {
        const buf = fs.readFileSync(path.join(DIR, name));
        const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
        const st = await page.evaluate(async ({ dataUrl }) => {
            const img = new Image();
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            const c2 = cv.getContext('2d', { willReadFrequently: true });
            c2.drawImage(img, 0, 0);
            const d = c2.getImageData(0, 0, cv.width, cv.height).data;
            const counts = { red: 0, orange: 0, dark: 0 };
            let n = 0, sum = 0, sum2 = 0, dark = 0, light = 0, nearWhite = 0;
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i + 1], b = d[i + 2];
                const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                n++; sum += L; sum2 += L * L;
                if (L < 8) dark++; else if (L > 247) light++;
                const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
                if (mn > 200 && mx - mn < 30) nearWhite++;
                if (r > 130 && g < 0.42 * r && b < 0.62 * r) counts.red++;
                else if (r > 170 && g >= 0.34 * r && g <= 0.62 * r && b < 0.45 * r) counts.orange++;
                if (r < 120 && g < 120 && b < 120) counts.dark++;
            }
            const mean = sum / n;
            return { n, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), darkFrac: dark / n, lightFrac: light / n, nearWhite, counts };
        }, { dataUrl });

        const m = /(\d+)/.exec(name);
        const fileFrame = m ? parseInt(m[1], 10) : -1;
        const src = /^frame_/i.test(name) ? Math.round(fileFrame * SPEED) : fileFrame;   // 输出帧 → 源帧
        const exp = expectFor(src);
        // 过曝帧（龙炎 / 白光吞没 / 白光束）色块必被冲掉 —— 亮帧只查「不全黑不全白 + 有层次」
        const lit = st.mean >= 130;
        const fails = [];
        if (st.mean < 12 || st.darkFrac > 0.96) fails.push('全黑');
        if (st.mean > 250 || st.lightFrac > 0.96) fails.push('全白');
        if (st.std < 12) fails.push('无层次');
        if (!lit && exp.red && st.counts.red < exp.red) fails.push(`红块少(${st.counts.red})`);
        if (!lit && exp.orange && st.counts.orange < exp.orange) fails.push(`橙块少(${st.counts.orange})`);
        if (exp.dark && st.counts.dark < exp.dark) fails.push(`暗块少(${st.counts.dark})`);
        if (!lit && exp.brightMin && st.nearWhite < exp.brightMin) fails.push(`亮部少(${st.nearWhite})`);
        if (fails.length) failed++;

        console.log(
            `${String(fileFrame).padStart(5)}  ${String(src).padStart(4)}  ${st.mean.toFixed(0).padStart(4)}  ${st.std.toFixed(0).padStart(3)}  ` +
            `${String(st.counts.red).padStart(6)}  ${String(st.counts.orange).padStart(6)}  ` +
            `${String(st.counts.dark).padStart(6)}  ${String(st.nearWhite).padStart(6)}   ` +
            (fails.length ? 'FAIL: ' + fails.join(' / ') : 'OK   ' + (exp.note || ''))
        );
    }

    await browser.close();
    console.log('------------------------------------------------------------------');
    if (failed) { console.log(`✗ ${failed}/${files.length} 帧未通过`); process.exit(1); }
    console.log(`✓ ${files.length}/${files.length} 帧全部通过`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
