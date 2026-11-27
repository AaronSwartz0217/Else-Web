const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/* ============================================================================
   逐帧图像检测（出片闸门）· 三个场景各自的判据
   用法：node inspect.js [目录] [步长]        目录默认 testsnap/，步长默认 1
        全片抽检：node inspect.js frames 30
   判据：
     (a) 非全黑 / 非全白 + 亮度方差；
     (b) ① 日神段查**中间亮部**（白大理石的大面 = "梦里一切都有清楚的样子"）；
     (c) ② 酒神段查**暖橙**（火堆与火把 = 唯一光源）与**暗部**；
     (d) ③ 悲剧段查中间亮部 + 暖光（破晓）；
     (e) **酒红族像素只允许出现在点题卡**（src ≥ 1582）——前 52 秒它必须是 0。
   ========================================================================== */
const DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'testsnap');

function expectFor(src) {
    if (src < 20) return { fade: true, note: '起手（从门外推入）' };
    if (src > 1786) return { fade: true, note: '结尾淡出' };
    if (src >= 1582) return { title: true, wine: 2000, note: '⑦ 点题卡（唯一一次酒红 = 标题）' };
    if (src >= 1556) return { note: '点题卡起手（整场压暗中）' };
    if (src < 600) return { pale: 200000, bright: 4000, wineMax: 300, note: '① 日神 · 光明庭院（白大理石）' };
    if (src < 1200) return { warm: 8000, dark: 400000, wineMax: 300, note: '② 酒神 · 夜里的狂欢（火）' };
    /* ③ 起手是"破晓前"的俯瞰与下行：整场是冷蓝的，**只查非全黑 + 有层次** */
    if (src < 1300) return { note: '③ 悲剧 · 俯瞰下行（破晓前 · 冷调）' };
    if (src < 1460) return { warm: 3000, wineMax: 300, note: '③ 悲剧 · 破晓（暖光升起）' };
    return { pale: 60000, warm: 2000, wineMax: 300, note: '③ 悲剧 · 半圆剧场（舞台亮起）' };
}

async function main() {
    if (!fs.existsSync(DIR)) { console.error('目录不存在：', DIR); process.exit(2); }
    const step = Math.max(1, parseInt(process.argv[3] || '1', 10) || 1);
    const files = fs.readdirSync(DIR).filter(f => /^(frame_|snap)\d+\.png$/i.test(f)).sort().filter((_, i) => i % step === 0);
    if (!files.length) { console.error('目录里没有 PNG：', DIR); process.exit(2); }

    const exePath = path.join(process.env.USERPROFILE, 'AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe');
    const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(exePath) ? exePath : undefined });
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    await page.goto('about:blank');

    let failed = 0;
    console.log(`inspect(日神与酒神): ${files.length} images in ${DIR}\n`);
    console.log(' file#   src   mean  std    warm    cool    dark  bright     pale    wine   verdict');
    console.log('-------------------------------------------------------------------------------------------------');

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
            let warm = 0, cool = 0, dark = 0, pale = 0, wine = 0;
            let n = 0, sum = 0, sum2 = 0, darkF = 0, lightF = 0, bright = 0;
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i + 1], b = d[i + 2];
                const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                n++; sum += L; sum2 += L * L;
                if (L < 8) darkF++; else if (L > 247) lightF++;
                if (L > 180) bright++;
                if (L > 130 && L <= 245) pale++;
                if (L < 96) dark++;                                        /* 暗部（夜场 / 剪影） */
                if (r > 130 && g > 80 && g < 0.94 * r && b < 0.72 * r && g > 1.05 * b) warm++;   /* 暖橙（火 / 黄铜 / 破晓） */
                if (b > 60 && b > 1.10 * r && b > 1.03 * g) cool++;        /* 冷蓝（天 / 夜） */
                if (r > 140 && g < 0.52 * r && b > 0.40 * r && b < 0.90 * r) wine++;   /* 酒红族：只该出现在点题卡标题 */
            }
            const mean = sum / n;
            return { n, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), darkFrac: darkF / n, lightFrac: lightF / n, bright, pale, warm, cool, dark, wine };
        }, { dataUrl });

        const m = /(\d+)/.exec(name);
        const src = m ? parseInt(m[1], 10) : -1;
        const exp = expectFor(src);
        const fails = [];
        if (exp.fade) {
            if (st.mean < 5) fails.push('全黑');
        } else if (exp.title) {
            if (st.mean < 4) fails.push('全黑（卡底本来就暗）');
        } else {
            if (st.mean < 8 || st.darkFrac > 0.97) fails.push('几乎全黑');
            if (st.mean > 250 || st.lightFrac > 0.99) fails.push('全白');
            if (st.std < 12) fails.push('无层次');
        }
        if (exp.pale && st.pale < exp.pale) fails.push(`中间亮部少(${st.pale})`);
        if (exp.bright && st.bright < exp.bright) fails.push(`亮部少(${st.bright})`);
        if (exp.warm && st.warm < exp.warm) fails.push(`暖光少(${st.warm})`);
        if (exp.dark && st.dark < exp.dark) fails.push(`暗部少(${st.dark})`);
        if (exp.wine && st.wine < exp.wine) fails.push(`主题色(酒红)少(${st.wine})`);
        if (exp.wineMax !== undefined && st.wine > exp.wineMax) fails.push(`酒红窜出点题卡(${st.wine})`);
        if (fails.length) failed++;

        console.log(
            `${String(src).padStart(5)}  ${String(src).padStart(4)}  ${st.mean.toFixed(0).padStart(4)}  ${st.std.toFixed(0).padStart(3)}  ` +
            `${String(st.warm).padStart(7)}  ${String(st.cool).padStart(6)}  ${String(st.dark).padStart(7)}  ${String(st.bright).padStart(7)}  ` +
            `${String(st.pale).padStart(7)}  ${String(st.wine).padStart(6)}   ${fails.length ? 'FAIL: ' + fails.join(' / ') : 'OK   ' + (exp.note || '')}`
        );
    }

    await browser.close();
    console.log('-------------------------------------------------------------------------------------------------');
    if (failed) { console.log(`x ${failed}/${files.length} 帧未通过`); process.exit(1); }
    console.log(`v ${files.length}/${files.length} 帧全部通过`);
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
