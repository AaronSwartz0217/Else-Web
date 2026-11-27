/* ============================================================================
   日神与酒神 · 三个 3D 场景的共享工具箱（scenes/common.js）
   ----------------------------------------------------------------------------
   为什么要它：三个场景（光明庭院 / 夜里的狂欢 / 半圆剧场）共用同一套"接法"——
   真实 WebGL2 管线 + 双画布（#glc 3D+后处理 → #c 2D 文字层）+ 相机表 + 标注层。
   这些一旦各写一份，就会出现"某个场景漫游坏了 / 标注引线乱指 / 后处理忘了收"。

   纪律（都是踩过的坑，见 文档/03_检测与排错/问题与解决.md #42–#44）：
     1) billboard 的模型矩阵一律在**所有 position 更新之后**由 boot 统一生成
        （场景的 update() 只管改 position / 材质，不许自己算 model）；
     2) 机位表写三段式：落定 → 驻留（极缓推近）→ 离开，关键帧不压拍边界；
     3) 文字层永远画在后处理之后；
     4) 帧是纯函数、禁 Math.random（抖动用 srnd）。
   ========================================================================== */
window.DION = (function () {
  'use strict';
  const W = 1920, H = 1080, FPS = 30, TAU = Math.PI * 2;

  /* ---------------- 数学（纯函数） ---------------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function srnd(seed) { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  const subA = (f, a, b, c, d) => { if (f < a) return 0; if (f < b) return smoothstep(a, b, f); if (f < c) return 1; if (f < d) return 1 - smoothstep(c, d, f); return 0; };
  function seq(f, keys) {
    if (f <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (f <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i], u = (f - a[0]) / (b[0] - a[0]);
        return lerp(a[1], b[1], u * u * (3 - 2 * u));
      }
    }
    return keys[keys.length - 1][1];
  }
  function aimFrom(eye, tgt) {
    const dx = tgt[0] - eye[0], dy = tgt[1] - eye[1], dz = tgt[2] - eye[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    return { yaw: Math.atan2(-dx, dz), pitch: Math.asin(clamp(dy / L, -1, 1)) };
  }
  const fwdOf = (yaw, pitch) => { const cp = Math.cos(pitch); return [-Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp]; };

  /* ---------------- 画布 / 烘焙器 ---------------- */
  function mk(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); fn(g, w, h); return c; }
  function grainOver(g, w, h, n, a) {
    for (let i = 0; i < n; i++) {
      const x = (i * 157.31) % w, y = (i * 289.73) % h;
      g.fillStyle = 'rgba(255,250,240,' + (0.35 * a + 0.65 * a * (((i * 61) % 11) / 11)).toFixed(3) + ')';
      g.fillRect(x, y, 1.7, 1.7);
    }
  }
  /* 天空 / 天幕：一条竖直线性渐变 */
  function makeSky(stops) {
    return mk(512, 512, (g, w, h) => {
      const lg = g.createLinearGradient(0, 0, 0, h);
      for (const s of stops) lg.addColorStop(s[0], s[1]);
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
    });
  }
  /* 辉光 / 地面光池（透明底，可用于 billboard 光晕，也可用于地面 decal） */
  function makeGlow(inner, mid, size) {
    return mk(size || 256, size || 256, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h / 2, w * 0.02, w / 2, h / 2, w * 0.5);
      rg.addColorStop(0, inner); rg.addColorStop(0.45, mid); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
  }
  /* 火焰：向上收的水滴形，内部近白、外缘橙红 */
  function makeFlame() {
    return mk(256, 384, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const cx = w / 2;
      const layers = [
        { r: 0.96, col: ['rgba(255,92,24,0.55)', 'rgba(255,60,10,0.05)'], w: 1.00 },
        { r: 0.70, col: ['rgba(255,168,60,0.90)', 'rgba(255,120,20,0.10)'], w: 0.78 },
        { r: 0.42, col: ['rgba(255,246,214,0.98)', 'rgba(255,220,120,0.20)'], w: 0.50 },
      ];
      for (const L of layers) {
        const hh = h * L.r, ww = w * L.w * 0.42;
        const rg = g.createLinearGradient(0, h - hh, 0, h);
        rg.addColorStop(0, L.col[1]); rg.addColorStop(0.42, L.col[0]); rg.addColorStop(1, L.col[1]);
        g.fillStyle = rg;
        g.beginPath();
        g.moveTo(cx, h - hh);
        g.bezierCurveTo(cx + ww * 0.55, h - hh * 0.62, cx + ww, h - hh * 0.28, cx + ww * 0.72, h - 6);
        g.quadraticCurveTo(cx, h + 8, cx - ww * 0.72, h - 6);
        g.bezierCurveTo(cx - ww, h - hh * 0.28, cx - ww * 0.55, h - hh * 0.62, cx, h - hh);
        g.closePath(); g.fill();
      }
    });
  }
  /* 铺地石：浅色石板 + 接缝 + 细颗粒 */
  function makePaving(base, joint, cols, rows) {
    return mk(512, 512, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const cw = w / cols, ch = h / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const t = srnd(r * 13.1 + c * 7.7);
        g.fillStyle = 'rgba(255,255,255,' + (0.03 + 0.05 * t).toFixed(3) + ')';
        g.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
      }
      g.strokeStyle = joint; g.lineWidth = 3;
      for (let c = 0; c <= cols; c++) { g.beginPath(); g.moveTo(c * cw, 0); g.lineTo(c * cw, h); g.stroke(); }
      for (let r = 0; r <= rows; r++) { g.beginPath(); g.moveTo(0, r * ch); g.lineTo(w, r * ch); g.stroke(); }
      grainOver(g, w, h, 2200, 0.06);
    });
  }
  /* 树冠 / 丝柏 / 水面 / 星空 / 面具 / 大理石纹 */
  function makeCanopy(col, dark) {
    return mk(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        const x = srnd(i * 3.7) * w, y = srnd(i * 9.1) * h * 0.86, r = 18 + srnd(i * 5.3) * 46;
        g.fillStyle = (i % 3 === 0) ? dark : col;
        g.globalAlpha = 0.55 + 0.35 * srnd(i * 2.1);
        g.beginPath(); g.ellipse(x, y, r, r * 0.72, 0, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    });
  }
  function makeCypress(col, dark) {
    return mk(256, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = dark;
      g.beginPath(); g.moveTo(w * 0.5, 12);
      g.bezierCurveTo(w * 0.78, h * 0.30, w * 0.74, h * 0.62, w * 0.60, h * 0.92);
      g.lineTo(w * 0.40, h * 0.92);
      g.bezierCurveTo(w * 0.26, h * 0.62, w * 0.22, h * 0.30, w * 0.5, 12);
      g.closePath(); g.fill();
      g.fillStyle = col;
      for (let i = 0; i < 150; i++) {
        const t = i / 150, y = 30 + t * (h * 0.86);
        const x = w * 0.5 + (srnd(i * 4.1) - 0.5) * (w * 0.46) * (1 - t * 0.35);
        g.globalAlpha = 0.5 + 0.4 * srnd(i * 6.7);
        g.fillRect(x, y, 2.4, 7 + srnd(i * 2.9) * 12);
      }
      g.globalAlpha = 1;
    });
  }
  function makeWater(skyTop, skyBot) {
    return mk(512, 512, (g, w, h) => {
      const lg = g.createLinearGradient(0, 0, 0, h);
      lg.addColorStop(0, skyTop); lg.addColorStop(1, skyBot);
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 320; i++) {
        const y = srnd(i * 5.9) * h, x = srnd(i * 11.3) * w, len = 20 + srnd(i * 7.1) * 120;
        g.strokeStyle = 'rgba(255,255,255,' + (0.05 + 0.20 * srnd(i * 2.3)).toFixed(3) + ')';
        g.lineWidth = 1 + srnd(i * 3.3) * 2.6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (srnd(i * 4.7) - 0.5) * 3); g.stroke();
      }
    });
  }
  function makeStars() {
    return mk(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 420; i++) {
        const x = srnd(i * 3.9) * w, y = srnd(i * 8.3) * h * 0.8, r = 0.7 + srnd(i * 6.1) * 1.9;
        g.fillStyle = 'rgba(226,236,255,' + (0.25 + 0.6 * srnd(i * 4.3)).toFixed(3) + ')';
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
    });
  }
  /* 希腊剧场面具：两只大眼睛 + 一张嘴，四副表情 */
  function makeMask(k) {
    return mk(256, 320, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const base = ['#D8C9A6', '#C9B48C', '#B9A583', '#D2BE9A'][k];
      g.fillStyle = base;
      g.beginPath(); g.moveTo(w * 0.5, 8);
      g.bezierCurveTo(w * 0.94, 26, w * 0.92, h * 0.62, w * 0.5, h * 0.97);
      g.bezierCurveTo(w * 0.08, h * 0.62, w * 0.06, 26, w * 0.5, 8);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.30)';
      g.beginPath(); g.ellipse(w * 0.5, h * 0.5, w * 0.40, h * 0.42, 0, 0, TAU); g.fill();
      g.fillStyle = '#221E20';
      g.beginPath(); g.ellipse(w * 0.33, h * 0.42, w * 0.13, h * 0.075, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(w * 0.67, h * 0.42, w * 0.13, h * 0.075, 0, 0, TAU); g.fill();
      const open = [0.05, 0.09, 0.14, 0.07][k];
      g.beginPath();
      g.moveTo(w * 0.32, h * (0.66 - open));
      g.quadraticCurveTo(w * 0.5, h * (0.80 + open * 0.4), w * 0.68, h * (0.66 - open));
      g.quadraticCurveTo(w * 0.5, h * (0.70 + open), w * 0.32, h * (0.66 - open));
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(90,70,44,0.55)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(w * 0.5, 8); g.lineTo(w * 0.5, h * 0.97); g.stroke();
      grainOver(g, w, h, 900, 0.05);
    });
  }
  /* 大理石纹（雕像用） */
  function marbleFill(g, w, h, top, bot) {
    const lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, top); lg.addColorStop(1, bot);
    g.fillStyle = lg;
  }

  /* ---------------- 人物 / 雕像（预烘焙姿态，参数化一台画笔） ---------------- */
  const FIG_W = 256, FIG_H = 384;
  function strokeLimb(g, a, b, c, lw) {
    g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.stroke();
  }
  /* 姿态：返回"近直的两段"关节（正面视角手臂自然垂在身侧；腿只靠脚的前后错位表达步态） */
  function poseKind(kind, i) {
    const n = { walk: 12, dance: 12, sway: 6, raise: 6, statue: 6 }[kind] || 6;
    const t = (i % n) / n * TAU;
    let kneeSwing = 0, armSwing = 0, armUp = 0, bob = 0, twist = 0;
    if (kind === 'walk') { kneeSwing = Math.sin(t); armSwing = -Math.sin(t) * 0.9; bob = Math.abs(Math.cos(t)) * 0.012; }
    if (kind === 'sway') { kneeSwing = Math.sin(t) * 0.32; armSwing = -Math.sin(t) * 0.35; bob = 0.008 * Math.cos(t); twist = Math.sin(t) * 0.10; }
    if (kind === 'dance') {
      kneeSwing = Math.sin(t) * 0.9; armSwing = -Math.sin(t) * 1.25; bob = Math.abs(Math.cos(t * 2)) * 0.05;
      armUp = 0.30 + 0.42 * (0.5 + 0.5 * Math.sin(t * 2)); twist = Math.sin(t) * 0.26;
    }
    if (kind === 'raise') { armUp = [0.05, 0.30, 0.60, 0.82, 0.90, 0.92][i % 6]; bob = 0.004 * (i % 6); }
    if (kind === 'statue') {
      kneeSwing = [0, 0.18, -0.12, 0.10, 0, -0.16][i % 6];
      armSwing = 0; armUp = [0, 0.10, 0.44, 0.20, 0.62, 0.06][i % 6];
      twist = [0, -0.06, 0.08, 0, 0.10, -0.05][i % 6];
    }
    const hipY = 0.520 + bob, shY = 0.800 + bob, headY = 0.880 + bob;
    const legs = [], arms = [];
    for (const s of [-1, 1]) {
      const hip = { x: s * 0.045 + twist * 0.3, y: hipY };
      const sw = s < 0 ? kneeSwing : -kneeSwing;
      const foot = { x: s * 0.052 + sw * 0.108, y: Math.max(0.008, 0.010 + Math.max(0, sw) * 0.072) };
      const knee = { x: lerp(hip.x, foot.x, 0.52) + s * 0.018 + sw * 0.020, y: lerp(hip.y, foot.y, 0.52) - Math.abs(sw) * 0.010 };
      legs.push({ hip, knee, foot, s });
    }
    for (const s of [-1, 1]) {
      const sh = { x: s * 0.080 + twist * 0.4, y: shY };
      const sw = (s < 0 ? armSwing : -armSwing) * 0.07;
      const aUp = armUp * (s < 0 ? 0.78 : 1.0);
      const hand = { x: s * (0.084 + 0.026 * aUp) + sw + twist * 0.5, y: (aUp > 0.05 ? 0.600 + aUp * 0.300 : 0.520) };
      const el = { x: lerp(sh.x, hand.x, 0.52) + s * 0.016, y: lerp(sh.y, hand.y, 0.52) };
      arms.push({ sh, el, hand, s });
    }
    return { hipY, shY, headY, legs, arms };
  }
  function paintFigure(g, w, h, kind, i, pal) {
    const u = h * 0.94, ox = w * 0.5, oy = h * 0.955;
    const px = x => ox + x * u, py = y => oy - y * u;
    const P = poseKind(kind, i);
    g.clearRect(0, 0, w, h);
    /* 1) 统一填充（先整体，再统一描边 → 消除部件接缝） */
    for (const l of P.legs) {
      g.strokeStyle = pal.body;
      strokeLimb(g, { x: px(l.hip.x), y: py(l.hip.y) }, { x: px(l.knee.x), y: py(l.knee.y) }, { x: px(l.foot.x), y: py(l.foot.y) }, u * (pal.legW || 0.062));
    }
    marbleFill(g, w, h, pal.coatTop || pal.coat, pal.coatBot || pal.coat);
    g.beginPath();
    g.moveTo(px(-0.086), py(P.shY));
    g.quadraticCurveTo(px(-0.108 - (pal.flare || 0)), py(P.hipY - 0.10), px(-0.104 - (pal.flare || 0)), py(pal.skirt || 0.392));
    g.lineTo(px(0.104 + (pal.flare || 0)), py(pal.skirt || 0.392));
    g.quadraticCurveTo(px(0.108 + (pal.flare || 0)), py(P.hipY - 0.10), px(0.086), py(P.shY));
    g.closePath(); g.fill();
    g.beginPath(); g.moveTo(px(-0.086), py(P.shY)); g.lineTo(px(0.086), py(P.shY));
    g.lineTo(px(0.058), py(P.shY + 0.052)); g.lineTo(px(-0.058), py(P.shY + 0.052)); g.closePath();
    g.fillStyle = pal.body; g.fill();
    g.fillStyle = pal.body;
    g.beginPath(); g.arc(px(0), py(P.headY), u * 0.060, 0, TAU); g.fill();
    g.fillRect(px(-0.022), py(P.shY + 0.016), u * 0.044, u * 0.034);
    for (const a of P.arms) {
      strokeLimb(g, { x: px(a.sh.x), y: py(a.sh.y) }, { x: px(a.el.x), y: py(a.el.y) }, { x: px(a.hand.x), y: py(a.hand.y) }, u * (pal.armW || 0.052));
    }
    /* 2) 类别附加：长袍褶 / 羊腿 / 羊角 / 尾巴 / 面具 / 长矛 */
    if (kind === 'statue' || kind === 'walk') {          // 长袍褶（造型感）
      g.strokeStyle = pal.fold; g.lineWidth = u * 0.011;
      for (let k = -2; k <= 2; k++) {
        g.beginPath();
        g.moveTo(px(k * 0.030), py(P.hipY - 0.02));
        g.quadraticCurveTo(px(k * 0.040 + 0.014), py(0.50), px(k * 0.046), py(pal.skirt || 0.392));
        g.stroke();
      }
    }
    if (pal.goat) {                                       // 萨提尔：羊的跖行腿 + 角 + 尾
      g.strokeStyle = pal.goatCol || '#2C2430';
      for (const s of [-1, 1]) {
        const hip = { x: s * 0.048, y: P.hipY };
        const hock = { x: s * 0.052 + (s < 0 ? -0.030 : 0.030), y: 0.30 };
        const hoof = { x: s * 0.048 + (s < 0 ? 0.036 : -0.036), y: Math.max(0.008, 0.012 + (i % 6) * 0.004) };
        strokeLimb(g, { x: px(hip.x), y: py(hip.y) }, { x: px(hock.x), y: py(hock.y) }, { x: px(hoof.x), y: py(hoof.y) }, u * 0.058);
      }
      g.strokeStyle = pal.goatCol || '#2C2430'; g.lineWidth = u * 0.020;
      g.beginPath(); g.moveTo(px(-0.058), py(P.headY + 0.048));
      g.quadraticCurveTo(px(-0.140), py(P.headY + 0.070), px(-0.156), py(P.headY + 0.150)); g.stroke();
      g.beginPath(); g.moveTo(px(0.058), py(P.headY + 0.048));
      g.quadraticCurveTo(px(0.140), py(P.headY + 0.070), px(0.156), py(P.headY + 0.150)); g.stroke();
      g.lineWidth = u * 0.012;
      g.beginPath(); g.moveTo(px(0.104), py(P.hipY - 0.03));
      g.quadraticCurveTo(px(0.170), py(P.hipY - 0.10), px(0.150), py(P.hipY + 0.06)); g.stroke();
      g.fillStyle = pal.goatCol || '#2C2430';
      g.beginPath(); g.ellipse(px(0), py(P.headY + 0.030), u * 0.040, u * 0.030, 0, 0, TAU); g.fill();   // 山羊胡
    }
    if (pal.mask) {                                      // 面具（扣在脸上）
      g.fillStyle = pal.maskCol || '#D8C9A6';
      g.beginPath(); g.ellipse(px(0), py(P.headY), u * 0.062, u * 0.074, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(20,16,20,0.75)';
      g.beginPath(); g.ellipse(px(-0.022), py(P.headY + 0.010), u * 0.016, u * 0.010, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(px(0.022), py(P.headY + 0.010), u * 0.016, u * 0.010, 0, 0, TAU); g.fill();
    }
    /* 2.5) 形影：与御光相反的一侧压一道暗边（大理石/皮肤的体积感） */
    if (pal.shadeA) {
      g.save(); g.globalAlpha = pal.shadeA; g.strokeStyle = pal.shade || 'rgba(70,66,60,1)';
      for (const l of P.legs) strokeLimb(g, { x: px(l.hip.x) - 1.9, y: py(l.hip.y) + 1.3 }, { x: px(l.knee.x) - 1.9, y: py(l.knee.y) + 1.3 }, { x: px(l.foot.x) - 1.9, y: py(l.foot.y) + 1.3 }, u * 0.030);
      for (const a of P.arms) strokeLimb(g, { x: px(a.sh.x) - 1.9, y: py(a.sh.y) + 1.3 }, { x: px(a.el.x) - 1.9, y: py(a.el.y) + 1.3 }, { x: px(a.hand.x) - 1.9, y: py(a.hand.y) + 1.3 }, u * 0.026);
      g.globalAlpha = pal.shadeA * 0.75;
      g.fillStyle = pal.shade || 'rgba(70,66,60,1)';
      g.beginPath();
      g.moveTo(px(-0.086), py(P.shY));
      g.quadraticCurveTo(px(-0.108 - (pal.flare || 0)), py(P.hipY - 0.10), px(-0.104 - (pal.flare || 0)), py(pal.skirt || 0.392));
      g.lineTo(px(-0.050), py(pal.skirt || 0.392));
      g.lineTo(px(-0.044), py(P.shY));
      g.closePath(); g.fill();
      g.restore();
    }
    /* 3) 御光：同一条路径用暖色细线偏移重描一次 */
    g.save();
    g.globalAlpha = pal.rimA || 0.5; g.strokeStyle = pal.rim || '#FFE2A8';
    for (const l of P.legs) strokeLimb(g, { x: px(l.hip.x) + 1.6, y: py(l.hip.y) - 1.4 }, { x: px(l.knee.x) + 1.6, y: py(l.knee.y) - 1.4 }, { x: px(l.foot.x) + 1.6, y: py(l.foot.y) - 1.4 }, u * 0.019);
    for (const a of P.arms) strokeLimb(g, { x: px(a.sh.x) + 1.6, y: py(a.sh.y) - 1.4 }, { x: px(a.el.x) + 1.6, y: py(a.el.y) - 1.4 }, { x: px(a.hand.x) + 1.6, y: py(a.hand.y) - 1.4 }, u * 0.016);
    g.restore();
    if (pal.torch && P.arms.length) {                    // 歌队手里的火把
      const hand = P.arms[1].hand;
      const hx = px(hand.x), hy = py(hand.y);
      g.strokeStyle = pal.torchPole || '#4A3B2A'; g.lineWidth = u * 0.014;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx, hy - u * 0.13); g.stroke();
      const fg = g.createLinearGradient(0, hy - u * 0.30, 0, hy - u * 0.10);
      fg.addColorStop(0, 'rgba(255,150,60,0.0)'); fg.addColorStop(0.45, 'rgba(255,196,110,0.95)'); fg.addColorStop(1, 'rgba(255,250,220,0.95)');
      g.fillStyle = fg;
      g.beginPath();
      g.moveTo(hx, hy - u * 0.32);
      g.quadraticCurveTo(hx + u * 0.030, hy - u * 0.20, hx + u * 0.020, hy - u * 0.115);
      g.quadraticCurveTo(hx, hy - u * 0.085, hx - u * 0.020, hy - u * 0.115);
      g.quadraticCurveTo(hx - u * 0.030, hy - u * 0.20, hx, hy - u * 0.32);
      g.closePath(); g.fill();
    }
    return P;
  }

  /* ---------------- 几何工具 ---------------- */
  function mergeParts(app, GL3D, parts) {
    const M4 = GL3D.Mat4, pos = [], idx = [], uv = [];
    let base = 0;
    for (const p of parts) {
      const g = p.geo, m = p.m || M4.identity();
      for (let i = 0; i < g.positions.length; i += 3) {
        const t = M4.transformPoint(m, [g.positions[i], g.positions[i + 1], g.positions[i + 2]]);
        pos.push(t[0], t[1], t[2]);
      }
      const u = g.uvs || new Array(g.positions.length / 3 * 2).fill(0);
      for (let i = 0; i < u.length; i++) uv.push(u[i]);
      const gi = g.indices || Array.from({ length: g.positions.length / 3 }, (_, i) => i);
      for (let i = 0; i < gi.length; i++) idx.push(gi[i] + base);
      base += g.positions.length / 3;
    }
    return app.createMesh({ positions: pos, indices: idx, uvs: uv });
  }
  const boxAt = (GL3D, w, h, d, x, y, z, rot) => ({ geo: GL3D.Geometry.box(w, h, d), m: GL3D.Mat4.trs([x, y, z], rot || [0, 0, 0]) });
  const cylAt = (GL3D, r, h, x, y, z, seg) => ({ geo: cylinder(GL3D, r, h, seg || 12), m: GL3D.Mat4.trs([x, y, z]) });
  /* 圆柱（低分段）：用于柱子 / 酒桶 / 火把杆 */
  function cylinder(GL3D, r, h, seg) {
    const pos = [], uvs = [], idx = [];
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
      const b = i * 4;
      pos.push(x0, -h / 2, z0, x1, -h / 2, z1, x1, h / 2, z1, x0, h / 2, z0);
      uvs.push(i / seg, 0, (i + 1) / seg, 0, (i + 1) / seg, 1, i / seg, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    return { positions: pos, indices: idx, uvs: uvs };
  }

  /* ---------------- 应用 / 相机 / 渲染 ---------------- */
  let app = null, glc, disp, dctx, VP = null, CAM = null, sceneCfg = null, items = [], DYN = {};
  const M4of = () => window.GL3D.Mat4;

  function makeCanvases() {
    const s = document.createElement('style');
    s.textContent = 'html,body{margin:0;padding:0;background:#05060A;overflow:hidden}'
      + 'canvas{display:block;position:fixed;left:0;top:0;width:1920px;height:1080px}#c{z-index:2}#glc{z-index:1}';
    document.head.appendChild(s);
    glc = document.createElement('canvas'); glc.id = 'glc'; glc.width = W; glc.height = H;
    disp = document.createElement('canvas'); disp.id = 'c'; disp.width = W; disp.height = H;
    document.body.appendChild(glc); document.body.appendChild(disp);
    dctx = disp.getContext('2d');
  }
  function viewProj() {
    const c = app.state.camera, M4 = M4of();
    return M4.multiply(M4.perspective(c.fov, W / H, c.near, c.far), M4.lookAt(c.eye, c.target, c.up));
  }
  function project(p) {
    const m = VP; if (!m) return null;
    const x = p[0], y = p[1], z = p[2];
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.02) return null;
    return { x: (cx / cw * 0.5 + 0.5) * W, y: (1 - (cy / cw * 0.5 + 0.5)) * H };
  }
  function setCam() {
    const f3 = fwdOf(CAM.yaw, CAM.pitch);
    app.state.camera.eye = [CAM.x, CAM.y, CAM.z];
    app.state.camera.target = [CAM.x + f3[0], CAM.y + f3[1], CAM.z + f3[2]];
    app.state.camera.fov = 2 * Math.atan((H / 2) / CAM.focal);
  }
  function camBeat(f) {
    const K = sceneCfg.camk;
    let i = 0;
    for (; i < K.length - 1; i++) if (f <= K[i + 1].f) break;
    const a = K[i], b = K[Math.min(i + 1, K.length - 1)];
    const u = b.f === a.f ? 0 : smoothstep(0, 1, (f - a.f) / (b.f - a.f));
    const eye = [lerp(a.eye[0], b.eye[0], u), lerp(a.eye[1], b.eye[1], u), lerp(a.eye[2], b.eye[2], u)];
    const tgt = [lerp(a.tgt[0], b.tgt[0], u), lerp(a.tgt[1], b.tgt[1], u), lerp(a.tgt[2], b.tgt[2], u)];
    const A = aimFrom(eye, tgt);
    CAM.x = eye[0]; CAM.y = eye[1]; CAM.z = eye[2]; CAM.yaw = A.yaw; CAM.pitch = A.pitch;
    CAM.focal = lerp(a.focal, b.focal, u);
  }
  function setLighting(f) {
    const K = sceneCfg.light;
    let i = 0; for (; i < K.length - 1; i++) if (f <= K[i + 1].f) break;
    const a = K[i], b = K[Math.min(i + 1, K.length - 1)];
    const u = b.f === a.f ? 0 : smoothstep(0, 1, (f - a.f) / (b.f - a.f));
    const L = app.state.light;
    L.ambient = [lerp(a.amb[0], b.amb[0], u), lerp(a.amb[1], b.amb[1], u), lerp(a.amb[2], b.amb[2], u)];
    L.color = [lerp(a.col[0], b.col[0], u), lerp(a.col[1], b.col[1], u), lerp(a.col[2], b.col[2], u)];
    L.direction = b.dir || a.dir;
  }
  function setPost(f) {
    const P = sceneCfg.post, p = app.state.post;
    p.exposure = seq(f, P.exp); p.contrast = seq(f, P.con); p.saturation = seq(f, P.sat);
    p.vignette = seq(f, P.vig); p.grain = seq(f, P.grain); p.chroma = seq(f, P.chr);
  }

  /* ---------------- 文字层（画在后处理之后） ---------------- */
  const PAL = { ivory: '#EFEAE0', dim: '#B9B2A4', brass: '#E8C27A', rust: '#C86A4A', wine: '#B3344B', wineHi: '#E8708A' };
  const FONT = (size, w) => (w || 700) + ' ' + size + 'px "Microsoft YaHei","SimHei",sans-serif';
  const KWCOL = { brass: PAL.brass, rust: PAL.rust, wine: PAL.wine, ivory: PAL.ivory };
  function drawSpaced(text, x, y, size, col, alpha, spacing, align) {
    dctx.font = FONT(size, 600); dctx.textAlign = 'left';
    const chars = text.split(''); let total = 0;
    for (const c of chars) total += dctx.measureText(c).width + spacing;
    total -= spacing;
    let cx = align === 'c' ? x - total / 2 : align === 'r' ? x - total : x;
    dctx.globalAlpha = alpha;
    for (const c of chars) { dctx.fillStyle = col; dctx.fillText(c, cx, y); cx += dctx.measureText(c).width + spacing; }
    dctx.globalAlpha = 1;
    return total;
  }
  function drawKicker(f) {
    const K = sceneCfg.kicker; if (!K) return;
    const a = subA(f, K.from, K.from + 20, K.to - 26, K.to - 6);
    if (a <= 0.004) return;
    dctx.globalAlpha = a;
    drawSpaced(K.main, 74, 96, 26, PAL.ivory, a, 3.2, 'l');
    drawSpaced(K.sub, 74, 128, 15, 'rgba(200,192,178,0.72)', a, 4.4, 'l');
    dctx.strokeStyle = 'rgba(232,194,122,0.45)'; dctx.lineWidth = 1.2;
    dctx.beginPath(); dctx.moveTo(74, 148); dctx.lineTo(494, 148); dctx.stroke();
    for (let i = 0; i < 3; i++) {
      const on = i <= K.act;
      dctx.fillStyle = on ? (i === K.act ? PAL.brass : 'rgba(232,194,122,0.5)') : 'rgba(255,255,255,0.16)';
      dctx.fillRect(74 + i * 32, 162, 22, i === K.act ? 5 : 3);
    }
    dctx.globalAlpha = 1;
  }
  function drawCaption(cap, f) {
    const a = subA(f, cap.s, cap.s + 12, cap.e - 12, cap.e);
    if (a <= 0.005) return;
    const revF = Math.max(0, (f - cap.s - 3) * 0.80);
    dctx.font = FONT(cap.size || 46);
    const size = cap.size || 46;
    const chars = [];
    if (cap.kw) {
      const i0 = cap.t.indexOf(cap.kw);
      if (i0 >= 0) for (let i = 0; i < cap.t.length; i++) chars.push({ ch: cap.t[i], k: i >= i0 && i < i0 + cap.kw.length });
    }
    if (!chars.length) for (const ch of cap.t) chars.push({ ch, k: false });
    let total = 0; for (const c of chars) total += dctx.measureText(c.ch).width;
    const sx = cap.align === 'c' ? cap.lx - total / 2 : cap.align === 'r' ? cap.lx - total : cap.lx;
    const p = project(cap.a);
    const lineA = a * smoothstep(0.4, 5, revF);
    const onScreen = p && p.x > -30 && p.x < W + 30 && p.y > -30 && p.y < H + 30;
    if (onScreen && lineA > 0.01) {
      const bx = clamp(p.x, sx - 14, sx + total + 14), by = clamp(p.y, cap.ly - size * 1.02, cap.ly + 16);
      dctx.strokeStyle = 'rgba(232,194,122,' + (0.5 * lineA).toFixed(3) + ')'; dctx.lineWidth = 1.6;
      dctx.beginPath(); dctx.moveTo(p.x, p.y); dctx.lineTo(bx, by); dctx.stroke();
      dctx.beginPath(); dctx.arc(p.x, p.y, 8.6, 0, TAU);
      dctx.strokeStyle = 'rgba(232,194,122,' + (0.34 * lineA).toFixed(3) + ')'; dctx.lineWidth = 1.2; dctx.stroke();
      dctx.beginPath(); dctx.arc(p.x, p.y, 4.0, 0, TAU);
      dctx.fillStyle = 'rgba(245,232,200,' + (0.88 * lineA).toFixed(3) + ')'; dctx.fill();
    }
    let x = sx, j = 0;
    dctx.textAlign = 'left'; dctx.lineJoin = 'round';
    const stroke = Math.max(4, size * 0.14);
    for (const c of chars) {
      const ca = clamp(revF - j, 0, 1);
      if (ca <= 0.004) break;
      const al = a * (0.35 + 0.65 * ca);
      dctx.strokeStyle = 'rgba(7,9,12,' + (0.78 * al).toFixed(3) + ')'; dctx.lineWidth = stroke;
      dctx.strokeText(c.ch, x, cap.ly);
      dctx.fillStyle = c.k ? KWCOL[cap.kc] : PAL.ivory;
      dctx.globalAlpha = al; dctx.fillText(c.ch, x, cap.ly); dctx.globalAlpha = 1;
      x += dctx.measureText(c.ch).width; j++;
    }
    dctx.globalAlpha = 1;
  }
  function drawCard(f) {
    const C = sceneCfg.card; if (!C) return;
    const a = subA(f, C.from, C.from + 26, C.to - 14, C.to);
    dctx.globalAlpha = Math.max(0.02, a);
    dctx.drawImage(C.darkTex, 0, 0, W, H);
    dctx.globalAlpha = 1;
    if (a <= 0.005) return;
    dctx.globalAlpha = a;
    drawSpaced(C.tag, 960, 366, 24, PAL.brass, a * 0.9, 6.2, 'c');
    dctx.font = FONT(112, 800); dctx.textAlign = 'center';
    dctx.shadowColor = PAL.wine; dctx.shadowBlur = 46; dctx.fillStyle = PAL.wine;
    dctx.fillText(C.title, 960, 522);
    dctx.shadowBlur = 0;
    dctx.strokeStyle = 'rgba(179,52,75,0.72)'; dctx.lineWidth = 2;
    dctx.beginPath(); dctx.moveTo(780, 586); dctx.lineTo(1140, 586); dctx.stroke();
    for (const ln of C.lines) {
      const revF = Math.max(0, (f - ln.s) * 0.6);
      dctx.font = FONT(ln.size, ln.col === PAL.dim ? 500 : 700);
      let total = 0; for (const ch of ln.t) total += dctx.measureText(ch).width;
      let x = 960 - total / 2, j = 0;
      for (const ch of ln.t) {
        const ca = clamp(revF - j, 0, 1);
        if (ca <= 0.004) break;
        dctx.globalAlpha = a * (0.3 + 0.7 * ca);
        dctx.lineJoin = 'round'; dctx.lineWidth = Math.max(4, ln.size * 0.13);
        dctx.strokeStyle = 'rgba(5,6,9,0.8)'; dctx.strokeText(ch, x, ln.y);
        dctx.fillStyle = ln.col; dctx.fillText(ch, x, ln.y);
        x += dctx.measureText(ch).width; j++;
      }
      dctx.globalAlpha = 1;
    }
    dctx.globalAlpha = 1;
  }

  /* ---------------- 主渲染 ---------------- */
  function render(f) {
    if (!ROAM) camBeat(f);
    setCam(); setLighting(f); setPost(f);
    if (sceneCfg.update) sceneCfg.update(f, { DYN, items, app, T: api, CAM });
    const M4 = M4of(), eye = app.state.camera.eye;
    for (const it of items) if (it.billboard) it.model = M4.billboard(it.position, eye, it.scale || [1, 1, 1]);   // ★ 位置更新之后统一生成（#42）
    app.state.frame = f;
    app.render(items);
    dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.globalAlpha = 1; dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, W, H);
    dctx.drawImage(glc, 0, 0, W, H);
    VP = viewProj();
    drawKicker(f);
    for (const cap of sceneCfg.caps || []) drawCaption(cap, f);
    drawCard(f);
  }

  let ROAM = false;
  function boot(cfg) {
    sceneCfg = cfg;
    makeCanvases();
    ROAM = new URLSearchParams(location.search).get('roam') === '1';
    window.__frame = parseInt(new URLSearchParams(location.search).get('frame') ?? String(cfg.range[0]));
    app = window.GL3D.create(glc, { clearColor: cfg.clearColor || [0.03, 0.035, 0.05, 1], maxDpr: 2, preserveDrawingBuffer: true, antialias: false });
    app.state.camera.near = cfg.near || 0.22; app.state.camera.far = cfg.far || 200;
    const start = cfg.camk[0].eye;
    CAM = { x: start[0], y: start[1], z: start[2], yaw: 0, pitch: 0, focal: cfg.camk[0].focal || 1150 };
    const built = cfg.build(app, api, window.GL3D);
    items = built.items; DYN = built.DYN || {};
    setCam();
    window.__scene = { CAM, app, DYN, items, project, renderFrame: f => render(f), M4: window.GL3D.Mat4 };
    window.renderFrame = f => render(f);
    let roam = null;
    if (ROAM) {
      const rc = cfg.roam || {};
      roam = window.Roam.create({
        cam: CAM, total: cfg.range[1], applyCam: () => { setCam(); render(roam.frame); }, draw: render,
        clamp: rc.clamp || (() => {}), hud: () => rc.hud || '',
      });
      window.__renderDone = true;
      roam.start();
    } else {
      render(window.__frame);
      window.__renderDone = true;
    }
  }

  /* ---------------- 对外接口 ---------------- */
  const api = {
    W, H, FPS, TAU, clamp, lerp, smoothstep, srnd, subA, seq, aimFrom, fwdOf,
    mk, makeSky, makeGlow, makeFlame, makePaving, makeCanopy, makeCypress, makeWater, makeStars, makeMask,
    FIG_W, FIG_H, paintFigure, poseKind,
    mergeParts, boxAt, cylAt, cylinder,
    boot, project, render,
    PAL, FONT, drawSpaced,
  };
  return api;
})();
