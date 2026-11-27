/* ============================================================================
   达克效应 · scenes/common.js —— 本片共享工具（四个场景文件都引它，不许各写一份）
   ----------------------------------------------------------------------------
   包含：
     1 数学          2 画布 / 伪 3D 投影 kit      3 预烘焙 sprite（发光 / 天空渐变 / 棋盘抖色）
     4 彩色剪影演员（无脸 · 无五官 · 只要半身 / 背影 / 侧面）  5 2D 恶龙剪影
     6 复古 RPG 对话框字幕（打字机 + 闪烁 ▼）     7 各场 FX（火 / 雪 / 雾 / 萤火 / 沙 / 雷 / 岩浆 / 乌鸦 / 骨 / 光爆）
     8 复古后处理参数 + boot()（画布 / 后处理 / 漫游接线 / renderFrame 出口）

   硬规矩（见 文档/技术栈与风格.md · 共享资源/README.md）：
     · 帧是 frame 的纯函数，禁 Math.random（着色器里也一样）；
     · 渐变、模糊、发光一律预烘焙成 sprite，禁逐帧 createGradient / ctx.filter；
     · 不透明面「远的先画」，遮挡关系全靠绘制顺序；
     · 2D 覆盖层（对话框 / HUD / 闪光）一律最后画；
     · ?roam=1 是旁路，默认路径必须仍走 window.renderFrame(f)。
   ========================================================================== */
(function () {
  'use strict';
  if (window.DK) return;

  const W = 1920, H = 1080, TAU = Math.PI * 2;

  /* ======================= 1 数学 ======================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const srnd = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const subA = (f, a, b, c, d) => {
    if (f < a) return 0; if (f < b) return smoothstep(a, b, f);
    if (f < c) return 1; if (f < d) return 1 - smoothstep(c, d, f); return 0;
  };
  const wave = (f, period, phase) => Math.sin((f / period + (phase || 0)) * TAU);
  const stepT = (f, n) => Math.floor(f / n) * n;          // 8bit 光栅感：把时间量化成阶梯

  /* ======================= 2 画布 / 伪 3D ======================= */
  let sctx = null;
  const CAM = { x: 0, y: 1.60, z: 0, focal: 1000, pitch: 0, yaw: 0 };
  const NEAR = 0.22;
  function attach(ctx) { sctx = ctx; }

  function camSpace(x, y, z) {
    let cx = x - CAM.x, cy = y - CAM.y, cz = z - CAM.z;
    if (CAM.yaw) { const c = Math.cos(CAM.yaw), s = Math.sin(CAM.yaw); const nx = cx * c - cz * s, nz = cx * s + cz * c; cx = nx; cz = nz; }
    if (CAM.pitch) { const c = Math.cos(CAM.pitch), s = Math.sin(CAM.pitch); const ny = cy * c + cz * s, nz = -cy * s + cz * c; cy = ny; cz = nz; }
    return { x: cx, y: cy, z: cz };
  }
  // 世界坐标 → 屏幕（返回 null = 在近平面之后，必须丢掉）
  function proj(x, y, z) {
    const p = camSpace(x, y, z);
    if (p.z < NEAR) return null;
    const k = CAM.focal / p.z;
    return { x: W / 2 + p.x * k, y: H / 2 - p.y * k, s: k, cz: p.z };
  }
  // 多边形：逐边做近平面裁剪（不做就会「整块消失 / 尽头黑洞」）
  function projPoly(pts) {
    const cp = pts.map(p => camSpace(p[0], p[1], p[2]));
    const out = [];
    for (let i = 0; i < cp.length; i++) {
      const a = cp[i], b = cp[(i + 1) % cp.length];
      const ain = a.z >= NEAR, bin = b.z >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (NEAR - a.z) / (b.z - a.z);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR });
      }
    }
    return out.map(p => { const s = CAM.focal / p.z; return { x: W / 2 + p.x * s, y: H / 2 - p.y * s, s, cz: p.z }; });
  }
  function pathOf(q) {
    sctx.beginPath(); sctx.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < q.length; i++) sctx.lineTo(q[i].x, q[i].y);
    sctx.closePath();
  }
  function face(pts, fill, alpha) {
    const q = projPoly(pts); if (q.length < 3) return;
    sctx.save(); if (alpha !== undefined) sctx.globalAlpha *= alpha;
    pathOf(q); sctx.fillStyle = fill; sctx.fill(); sctx.restore();
  }
  function faceO(pts, fill, stroke, lw, alpha) {
    const q = projPoly(pts); if (q.length < 3) return;
    sctx.save(); if (alpha !== undefined) sctx.globalAlpha *= alpha;
    pathOf(q); sctx.fillStyle = fill; sctx.fill();
    if (stroke) { sctx.lineWidth = lw || 1.5; sctx.strokeStyle = stroke; sctx.stroke(); }
    sctx.restore();
  }
  function seg3(A, B, col, widthWorld, alpha, dash) {
    const a = proj(A[0], A[1], A[2]), b = proj(B[0], B[1], B[2]); if (!a || !b) return;
    sctx.save(); sctx.globalAlpha = alpha; sctx.strokeStyle = col; sctx.lineCap = 'round';
    if (dash) sctx.setLineDash(dash);
    sctx.lineWidth = Math.max(1.0, widthWorld * ((a.s + b.s) / 2));
    sctx.beginPath(); sctx.moveTo(a.x, a.y); sctx.lineTo(b.x, b.y); sctx.stroke(); sctx.restore();
  }
  function dot3(x, y, z, rWorld, col, alpha) {
    const p = proj(x, y, z); if (!p) return;
    const r = Math.max(0.7, rWorld * p.s);
    sctx.save(); sctx.globalAlpha = alpha; sctx.fillStyle = col;
    sctx.beginPath(); sctx.arc(p.x, p.y, r, 0, TAU); sctx.fill(); sctx.restore();
  }
  // 水平面（y 固定）上的椭圆多边形
  function discY(cx, cz, rx, rz, y, n) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push([cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz]); }
    return pts;
  }
  // 在 3D 平面上贴一张 2D 图（角序：TL / TR / BL —— 顺序写反只会把图斜抻）
  function localPlane(TL, TR, BL, iw, ih, fn, alpha) {
    const tl = proj(TL[0], TL[1], TL[2]), tr = proj(TR[0], TR[1], TR[2]), bl = proj(BL[0], BL[1], BL[2]);
    if (!tl || !tr || !bl) return;
    sctx.save(); if (alpha !== undefined) sctx.globalAlpha *= alpha;
    sctx.setTransform((tr.x - tl.x) / iw, (tr.y - tl.y) / iw, (bl.x - tl.x) / ih, (bl.y - tl.y) / ih, tl.x, tl.y);
    fn(iw, ih); sctx.restore();
  }
  // 世界坐标锚点上的 2D 剪影（billboard）：feet=(x,y,z)，hw = 米高
  // fn(k) 在「单位空间」里画：脚在 y=0，头顶 y≈-1，+x 右 +y 下
  function billboard(x, y, z, hw, fn, alpha) {
    const p = proj(x, y, z); if (!p) return null;
    const k = p.s * hw;
    sctx.save();
    if (alpha !== undefined) sctx.globalAlpha *= alpha;
    sctx.translate(p.x, p.y); sctx.scale(k, k);
    fn(k);
    sctx.restore();
    return p;
  }

  /* ======================= 3 预烘焙 sprite ======================= */
  const cache = {};
  function bakeCanvas(key, w, h, fn) {
    if (cache[key]) return cache[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    return (cache[key] = c);
  }
  function bakeGlow(color) {
    return bakeCanvas('glow:' + color, 512, 512, (x, S) => {
      const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, color.replace('A', '0.95'));
      g.addColorStop(0.30, color.replace('A', '0.40'));
      g.addColorStop(0.66, color.replace('A', '0.10'));
      g.addColorStop(1, color.replace('A', '0'));
      x.fillStyle = g; x.fillRect(0, 0, S, S);
    });
  }
  const glow = c => (cache['glow:' + c] || bakeGlow(c));
  function glowAt(cx, cy, rx, ry, sprite, alpha, comp) {
    if (alpha <= 0.006 || !isFinite(cx) || !isFinite(cy) || rx <= 0 || ry <= 0) return;
    sctx.save(); sctx.globalAlpha = alpha;
    if (comp) sctx.globalCompositeOperation = comp;
    sctx.translate(cx, cy); sctx.scale(rx, ry);
    sctx.drawImage(sprite, -1, -1, 2, 2); sctx.restore();
  }
  // 竖直天空渐变（烘焙成 4×512 再拉伸）
  function skyGrad(key, stops, y0, y1, alpha, comp) {
    const c = bakeCanvas('sky:' + key, 4, 512, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      for (const s of stops) g.addColorStop(s[0], s[1]);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    sctx.save(); if (comp) sctx.globalCompositeOperation = comp;
    if (alpha !== undefined) sctx.globalAlpha = alpha;
    sctx.drawImage(c, 0, y0, W, y1 - y0); sctx.restore();
  }
  // 16bit 棋盘抖色叠层（2px 棋盘，一次性建 pattern）
  let CHECKP = null;
  function checkerOverlay(alpha) {
    if (alpha <= 0.008) return;
    if (!CHECKP) {
      const c = document.createElement('canvas'); c.width = c.height = 4;
      const x = c.getContext('2d');
      x.fillStyle = 'rgba(0,0,0,1)'; x.fillRect(0, 0, 2, 2); x.fillRect(2, 2, 2, 2);
      CHECKP = sctx.createPattern(c, 'repeat');
    }
    sctx.save(); sctx.globalAlpha = alpha; sctx.fillStyle = CHECKP;
    sctx.fillRect(0, 0, W, H); sctx.restore();
  }
  function rrect(x, y, w, h, r) {
    sctx.beginPath();
    sctx.moveTo(x + r, y);
    sctx.arcTo(x + w, y, x + w, y + h, r);
    sctx.arcTo(x + w, y + h, x, y + h, r);
    sctx.arcTo(x, y + h, x, y, r);
    sctx.arcTo(x, y, x + w, y, r);
    sctx.closePath();
  }
  // 一片柔和色带（雾 / 光柱 / 反光）——用发光 sprite 拉扁，不新建渐变
  function band(cx, cy, rx, ry, col, alpha, comp) {
    glowAt(cx, cy, rx, ry, glow(col), alpha, comp);
  }

  // 世界锚点上的剪影演员（billboard 的进阶版：可镜像 / 旋转 / 调透明度）
  // o = {fill, rim, rimA, rimDX, out, alpha, mir, rot, variant, detail, metal}
  function silhouette(x, y, z, hw, pose, o) {
    o = o || {};
    const p = proj(x, y, z);
    if (!p) return null;
    const k = p.s * hw;
    sctx.save();
    if (o.alpha !== undefined) sctx.globalAlpha *= clamp(o.alpha, 0, 1);
    sctx.translate(p.x, p.y);
    sctx.rotate(o.rot || 0);
    sctx.scale(k * (o.mir ? -1 : 1), k);
    drawActor(pose, o);
    sctx.restore();
    return p;
  }

  /* ======================= 4 彩色剪影演员 ======================= */
  const OUT = 'rgba(6,5,10,0.92)';          // 剪影外描的暗边

  function tapered(a, b, wa, wb) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1e-6;
    const nx = -dy / L, ny = dx / L;
    sctx.beginPath();
    sctx.moveTo(a[0] + nx * wa, a[1] + ny * wa);
    sctx.lineTo(b[0] + nx * wb, b[1] + ny * wb);
    sctx.lineTo(b[0] - nx * wb, b[1] - ny * wb);
    sctx.lineTo(a[0] - nx * wa, a[1] - ny * wa);
    sctx.closePath();
    if (wa > 1e-4) { sctx.moveTo(a[0] + wa, a[1]); sctx.arc(a[0], a[1], wa, 0, TAU); }
    if (wb > 1e-4) { sctx.moveTo(b[0] + wb, b[1]); sctx.arc(b[0], b[1], wb, 0, TAU); }
  }
  // 只描边模式：让一个多部件剪影「先把所有描边铺在底层，再统一填充」——
  // 否则后画的部件描边会压在先画的部件上，接缝处露出一条深色线（看着像碎块拼的）
  let OUT_K = 1;           // 描边粗细倍率
  let STROKE_ONLY = false; // 只描边不填充（描边铺底用）
  let MONO = false;        // 单色模式：填充时忽略 fill2（用于画整只龙的暗色外轮廓副本）
  function paintPath(fill, out, lw) {
    if (!STROKE_ONLY && fill) { sctx.fillStyle = fill; sctx.fill(); }
    if (out) { sctx.strokeStyle = out; sctx.lineWidth = (lw || 0.007) * OUT_K; sctx.stroke(); }
  }
  /* 平滑曲线：把折线多边形画成「描出来的」有机形（Catmull-Rom → 三次贝塞尔）。
     剪影要是几块直边面片拼的，一眼就假；同一条轮廓用曲线连起来才像一只生物。*/
  function smoothPath(pts, closed) {
    const n = pts.length;
    sctx.beginPath(); sctx.moveTo(pts[0][0], pts[0][1]);
    const at = i => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1 + (closed ? 1 : 0); i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      sctx.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
        p2[0], p2[1]);
    }
    if (closed) sctx.closePath();
  }
  function smoothPoly(pts, fill, out, lw) { smoothPath(pts, true); paintPath(fill, out, lw); }
  function smoothStroke(pts, col, lw, alpha) {
    sctx.save(); if (alpha !== undefined) sctx.globalAlpha *= alpha;
    smoothPath(pts, false);
    sctx.strokeStyle = col; sctx.lineWidth = lw; sctx.lineCap = 'round'; sctx.stroke();
    sctx.restore();
  }
  // caps：'a'/'b'/'ab'/'none' —— 哪一端补圆帽。埋进父部件里的那一端**不要补帽**，
  //       否则圆帽的描边会露在父部件轮廓之外，没人盖得住，看着就是一道缝。
  function fillLimb(pts, wa, wb, fill, out, lw, caps) {
    const n = pts.length - 1;
    const capA = !caps || caps.indexOf('a') >= 0;
    const capB = !caps || caps.indexOf('b') >= 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1];
      const w0 = lerp(wa, wb, i / n), w1 = lerp(wa, wb, (i + 1) / n);
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6;
      const nx = -dy / L, ny = dx / L;
      sctx.beginPath();
      sctx.moveTo(a[0] + nx * w0, a[1] + ny * w0);
      sctx.lineTo(b[0] + nx * w1, b[1] + ny * w1);
      sctx.lineTo(b[0] - nx * w1, b[1] - ny * w1);
      sctx.lineTo(a[0] - nx * w0, a[1] - ny * w0);
      sctx.closePath();
      // 圆帽只补在两端（跟着描边走）—— 中间关节补圆帽会在肢体上留下一串圆珠
      if (i === 0 && capA && w0 > 1e-4) { sctx.moveTo(a[0] + w0, a[1]); sctx.arc(a[0], a[1], w0, 0, TAU); }
      if (i === n - 1 && capB && w1 > 1e-4) { sctx.moveTo(b[0] + w1, b[1]); sctx.arc(b[0], b[1], w1, 0, TAU); }
      paintPath(fill, out, lw);
    }
    for (let i = 1; i < n; i++) {                    // 中间关节：只填充不描边，接缝就隐形
      const w = lerp(wa, wb, i / n);
      if (w <= 1e-4) continue;
      sctx.beginPath(); sctx.arc(pts[i][0], pts[i][1], w, 0, TAU);
      paintPath(fill, null);
    }
  }
  function fillDisc(cx, cy, r, fill, out, lw) {
    sctx.beginPath(); sctx.arc(cx, cy, r, 0, TAU);
    paintPath(fill, out, lw);
  }
  function fillPoly(pts, fill, out, lw) {
    sctx.beginPath(); sctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sctx.lineTo(pts[i][0], pts[i][1]);
    sctx.closePath(); paintPath(fill, out, lw);
  }

  /* 骨架（单位空间：脚 y=0，头顶 y≈-1） */
  function baseJ() {
    return {
      head: [0, -0.885, 0.078],
      neck: [0, -0.800], hip: [0, -0.455], torso: [0.118, 0.098],
      arms: [
        [[0.105, -0.795], [0.120, -0.620], [0.112, -0.470]],   // 左（+x）
        [[-0.105, -0.795], [-0.120, -0.620], [-0.112, -0.470]], // 右
      ],
      legs: [
        [[0.046, -0.455], [0.052, -0.235], [0.052, -0.015]],
        [[-0.046, -0.455], [-0.052, -0.235], [-0.052, -0.015]],
      ],
      cloak: 0.16, capeTop: -0.03, extras: null,
    };
  }
  // 通用骨架绘制：先画轮廓光（往光源方向偏移一点点，垫在底下），再画主剪影
  function drawActor(J, o) {
    o = o || {};
    const fill = o.fill || '#0d0d13', out = o.out === undefined ? OUT : o.out;
    const paint = (col, ol) => {
      for (const L of J.legs) fillLimb(L, 0.062, 0.046, col, ol, 0.007);
      if (J.cloak > 0) {
        const sw = J.torso[0], hw = J.torso[1];
        fillPoly([
          [-sw * 1.05, J.neck[1] - J.capeTop],
          [sw * 1.05, J.neck[1] - J.capeTop],
          [J.cloak, J.hip[1] + 0.07],
          [J.cloak * 0.66, J.hip[1] + 0.16],
          [-J.cloak * 0.66, J.hip[1] + 0.16],
          [-J.cloak, J.hip[1] + 0.07],
        ], col, ol);
        // 肩甲 / 兜帽斜线
        fillPoly([
          [-sw * 1.05, J.neck[1] - J.capeTop], [sw * 1.05, J.neck[1] - J.capeTop],
          [sw * 0.58, J.neck[1] + 0.11], [-sw * 0.58, J.neck[1] + 0.11],
        ], col, ol);
      } else {
        tapered(J.hip, J.neck, J.torso[1], J.torso[0]);
        paintPath(col, ol, 0.007);
      }
      for (const A of J.arms) fillLimb(A, 0.043, 0.030, col, ol, 0.006);
      fillDisc(J.head[0], J.head[1], J.head[2], col, ol, 0.006);
      if (J.extras) J.extras(col, ol);
    };
    if (o.rim) {                                     // 彩色轮廓光
      sctx.save(); sctx.globalAlpha *= (o.rimA === undefined ? 0.95 : o.rimA);
      const dx = o.rimDX === undefined ? -0.017 : o.rimDX;
      const dy = o.rimDY === undefined ? 0 : o.rimDY;
      sctx.translate(dx, dy);
      paint(o.rim, null);
      sctx.restore();
    }
    paint(fill, out);

    // 服装与装备层：四位勇士共用同一骨架，但靠肩甲、束带和随身装备读出不同性格。
    // 这些线条故意保持低多边形/剪影感，避免突然跳成写实人物。
    const variant = o.variant === undefined ? -1 : o.variant;
    const detail = o.detail || 'rgba(92,94,112,0.92)';
    const metal = o.metal || 'rgba(190,166,104,0.94)';
    const beltY = J.hip[1] - 0.035;
    const shoulderY = J.neck[1] + 0.075;
    sctx.save();
    sctx.lineCap = 'round'; sctx.lineJoin = 'round';
    // 腰带、披风中缝、靴口：让黑色人物不再是一整块。
    fillPoly([[-J.torso[0] * 1.10, beltY - 0.014], [J.torso[0] * 1.10, beltY - 0.014],
      [J.torso[0] * 1.02, beltY + 0.020], [-J.torso[0] * 1.02, beltY + 0.020]], detail, null);
    if (J.cloak > 0) {
      smoothStroke([[0, shoulderY + 0.06], [0.012, (shoulderY + J.hip[1]) * 0.5], [-0.008, J.hip[1] + 0.10]], detail, 0.012, 0.82);
      smoothStroke([[-0.08, shoulderY + 0.08], [-0.10, J.hip[1] - 0.02]], detail, 0.008, 0.55);
      smoothStroke([[0.08, shoulderY + 0.08], [0.10, J.hip[1] - 0.02]], detail, 0.008, 0.55);
    }
    for (const L of J.legs) {
      const ankle = L[L.length - 1], knee = L[Math.max(0, L.length - 2)];
      const dx = ankle[0] - knee[0], dy2 = ankle[1] - knee[1], ll = Math.hypot(dx, dy2) || 1;
      const nx = -dy2 / ll * 0.050, ny = dx / ll * 0.050;
      fillPoly([[ankle[0] + nx, ankle[1] + ny - 0.055], [ankle[0] - nx, ankle[1] - ny - 0.055],
        [ankle[0] - nx * 0.86, ankle[1] - ny + 0.015], [ankle[0] + nx * 0.86, ankle[1] + ny + 0.015]], detail, null);
    }
    if (variant === 0) {                                  // 勇士一：重剑、双肩甲
      fillPoly([[-0.19, shoulderY - 0.035], [-0.075, shoulderY - 0.070], [-0.045, shoulderY + 0.015], [-0.18, shoulderY + 0.040]], metal, null);
      fillPoly([[0.19, shoulderY - 0.035], [0.075, shoulderY - 0.070], [0.045, shoulderY + 0.015], [0.18, shoulderY + 0.040]], metal, null);
      smoothStroke([[-0.14, shoulderY - 0.02], [0.10, beltY + 0.06]], metal, 0.020, 0.72);
      fillPoly([[0.105, beltY + 0.035], [0.145, beltY + 0.035], [0.145, beltY + 0.075], [0.105, beltY + 0.075]], metal, null);
    } else if (variant === 1) {                           // 勇士二：轻装、交叉束带与护腕
      smoothStroke([[-0.12, shoulderY - 0.015], [0.10, beltY + 0.045]], detail, 0.022, 0.95);
      smoothStroke([[0.12, shoulderY - 0.015], [-0.10, beltY + 0.045]], detail, 0.022, 0.95);
      for (const A of J.arms) {
        const p = A[A.length - 1]; fillDisc(p[0], p[1], 0.040, metal, null);
      }
      fillPoly([[-0.16, beltY + 0.01], [-0.09, beltY - 0.01], [-0.02, beltY + 0.19], [-0.06, beltY + 0.21]], detail, null);
    } else if (variant === 2) {                           // 勇士三：高领、卷轴袋（更像思考者）
      fillPoly([[-0.12, shoulderY - 0.075], [0.12, shoulderY - 0.075], [0.085, shoulderY + 0.035], [-0.085, shoulderY + 0.035]], detail, null);
      smoothStroke([[-0.10, shoulderY], [0.14, beltY + 0.05]], metal, 0.014, 0.78);
      fillPoly([[0.095, beltY + 0.025], [0.205, beltY + 0.045], [0.19, beltY + 0.18], [0.08, beltY + 0.15]], detail, null);
      fillDisc(0.142, beltY + 0.083, 0.020, metal, null);
    } else if (variant === 3) {                           // 勇士四：单肩扣、短刃与醒目的金色观察者标记
      fillPoly([[-0.19, shoulderY - 0.055], [-0.02, shoulderY - 0.080], [0.02, shoulderY + 0.018], [-0.16, shoulderY + 0.045]], detail, null);
      fillDisc(-0.075, shoulderY - 0.012, 0.030, metal, null);
      smoothStroke([[-0.07, shoulderY + 0.015], [0.12, beltY + 0.06]], metal, 0.016, 0.86);
      fillPoly([[0.10, beltY + 0.025], [0.145, beltY + 0.015], [0.18, beltY + 0.22], [0.135, beltY + 0.24]], detail, null);
    }
    sctx.restore();
  }

  /* ---- 姿势库（t = 0..1 相位） ---- */
  const POSE = {
    // 背影站立（四勇士排队出发）
    standBack(t) {
      const J = baseJ(); const s = t === undefined ? 0 : t;
      J.cloak = 0.165;
      J.legs = [[[0.05, -0.455], [0.055, -0.24], [0.055, -0.015]],
                [[-0.05, -0.455], [-0.055, -0.24], [-0.055, -0.015]]];
      return J;
    },
    // 背影行走（t 步态相位）
    walkBack(t) {
      const J = POSE.standBack(); const a = Math.sin(t * TAU) * 0.055;
      J.legs = [
        [[0.05, -0.455], [0.05 + a, -0.24], [0.05 + a * 1.6, -0.015]],
        [[-0.05, -0.455], [-0.05 - a, -0.24], [-0.05 - a * 1.6, -0.015]],
      ];
      J.arms = [
        [[0.105, -0.795], [0.125, -0.62], [0.10 - a, -0.48]],
        [[-0.105, -0.795], [-0.125, -0.62], [-0.10 + a, -0.48]],
      ];
      return J;
    },
    // 单膝跪地背影（前腿撑起、后腿跪地；总高约为站姿的 0.71）
    kneelBack() {
      const J = baseJ();
      J.hip = [0, -0.340]; J.neck = [0, -0.560]; J.torso = [0.126, 0.106];
      J.head = [0, -0.635, 0.074]; J.cloak = 0.185; J.capeTop = -0.03;
      J.legs = [
        [[0.040, -0.340], [0.115, -0.215], [0.148, -0.012]],         // 前腿：抬膝、脚掌着地
        [[-0.040, -0.340], [-0.135, -0.245], [-0.258, -0.085]],      // 后腿：膝盖着地、小腿向后
      ];
      J.arms = [
        [[0.100, -0.555], [0.148, -0.455], [0.142, -0.345]],          // 左手扶膝
        [[-0.100, -0.555], [-0.132, -0.450], [-0.122, -0.378]],
      ];
      return J;
    },
    // 侧面行走（t 步态相位）—— 行进剪影
    walkSide(t) {
      const J = baseJ(); const s = Math.sin(t * TAU), c = Math.cos(t * TAU);
      J.cloak = 0.175;
      J.hip = [0, -0.455]; J.neck = [0.035, -0.792]; J.head = [0.050, -0.880, 0.078];
      J.extras = (col, ol) => {                            // 身后的披风拖尾（读出「在走」）
        fillPoly([[-0.055, -0.775], [-0.075, -0.520], [-0.235, -0.300], [-0.095, -0.430], [-0.02, -0.690]], col, ol, 0.005);
      };
      J.legs = [
        [[0.02, -0.455], [0.02 + s * 0.10, -0.24], [0.02 + s * 0.20, -0.012]],
        [[-0.02, -0.455], [-0.02 - s * 0.10, -0.24], [-0.02 - s * 0.20, -0.012]],
      ];
      J.arms = [
        [[0.085, -0.795], [0.085 - s * 0.09, -0.62], [0.085 - s * 0.15, -0.49]],
        [[-0.085, -0.795], [-0.085 + s * 0.09, -0.62], [-0.085 + s * 0.15, -0.49]],
      ];
      J.lean = 0;
      return J;
    },
    // 侧面疾跑（t 步态相位，速度快）
    runSide(t) {
      const J = baseJ(); const s = Math.sin(t * TAU), c = Math.cos(t * TAU);
      J.cloak = 0.235; J.capeTop = -0.06;
      J.neck = [0.03, -0.795]; J.hip = [0, -0.445];
      J.legs = [
        [[0.02, -0.445], [0.02 + s * 0.17, -0.26], [0.02 + s * 0.30, -0.02]],
        [[-0.02, -0.445], [-0.02 - s * 0.16, -0.24], [-0.02 - s * 0.26, -0.02]],
      ];
      J.arms = [
        [[0.085, -0.79], [0.10 - c * 0.02, -0.64], [0.055 - s * 0.10, -0.52]],
        [[-0.085, -0.79], [-0.16, -0.70], [-0.20 + s * 0.04, -0.62]],
      ];
      return J;
    },
    // 侧面翻滚（t 0..1：整个身体卷成一个团并整体旋转）
    rollSide(t) {
      const J = baseJ();
      J.cloak = 0.26;
      J.hip = [0.02, -0.36]; J.neck = [0.13, -0.62];
      J.head = [0.20, -0.66, 0.075];
      J.legs = [
        [[0.02, -0.36], [0.16, -0.30], [0.22, -0.18]],
        [[0.00, -0.36], [-0.12, -0.30], [-0.15, -0.16]],
      ];
      J.arms = [
        [[0.12, -0.60], [0.24, -0.52], [0.20, -0.38]],
        [[0.15, -0.60], [0.05, -0.50], [-0.02, -0.42]],
      ];
      J.extras = null;
      return J;
    },
    // 侧面举剑（剑尖朝上）
    sword(t) {
      const J = baseJ();
      J.cloak = 0.22;
      J.neck = [0.01, -0.795]; J.hip = [0, -0.455];
      J.legs = [
        [[0.045, -0.455], [0.10, -0.24], [0.13, -0.012]],
        [[-0.045, -0.455], [-0.12, -0.24], [-0.17, -0.012]],
      ];
      const u = t === undefined ? 1 : t;                 // 抬手程度
      const ay = lerp(-0.52, -0.90, u);
      J.arms = [
        [[0.085, -0.79], [0.16, lerp(-0.63, -0.80, u)], [0.22, lerp(-0.50, -0.92, u)]],
        [[-0.085, -0.79], [-0.14, -0.66], [-0.10, ay + 0.10]],
      ];
      J.extras = (col, ol) => {
        const hx = 0.22, hy = lerp(-0.49, -0.94, u), tipY = hy - 0.96;
        // 剑身：亮钢色（在暗底上「反光刺眼」，不是剪影）
        fillPoly([[hx - 0.013, hy], [hx + 0.013, hy], [hx + 0.009, tipY], [hx - 0.009, tipY]], 'rgba(216,224,238,1)', ol, 0.006);
        // 剑格：金
        fillPoly([[hx - 0.078, hy + 0.020], [hx + 0.064, hy + 0.020], [hx + 0.050, hy - 0.014], [hx - 0.060, hy - 0.014]],
          'rgba(230,192,96,1)', ol, 0.006);
        // 剑柄：暗
        fillPoly([[hx - 0.015, hy + 0.020], [hx + 0.015, hy + 0.020], [hx + 0.013, hy + 0.150], [hx - 0.013, hy + 0.150]],
          col, ol, 0.005);
      };
      return J;
    },
    // 侧面踱步（t 来回）
    pace(t) {
      const J = POSE.walkSide(t * 0.5);
      J.cloak = 0.21;
      return J;
    },
    // 侧面半身张口（无五官：只做「张口」的剪影动作）
    talk(t) {
      const J = baseJ();
      J.cloak = 0.22;
      J.neck = [0.02, -0.795]; J.hip = [0.0, -0.455];
      J.legs = [
        [[0.05, -0.455], [0.13, -0.25], [0.19, -0.012]],
        [[-0.05, -0.455], [-0.10, -0.25], [-0.16, -0.012]],
      ];
      J.extras = (col, ol) => {                          // 张开的嘴（只有轮廓缺口，没有五官）
        const m = lerp(0.012, 0.052, clamp(t === undefined ? 1 : t, 0, 1));
        sctx.beginPath();
        sctx.ellipse(J.head[0] + 0.055, J.head[1] + 0.020, 0.022, m, 0, 0, TAU);
        sctx.fillStyle = 'rgba(0,0,0,0.0)'; sctx.globalCompositeOperation = 'destination-out';
        sctx.fill(); sctx.globalCompositeOperation = 'source-over';
      };
      return J;
    },
    // 侧面伸手（去拔刺）
    reach(t) {
      const J = baseJ();
      J.cloak = 0.22;
      J.neck = [0.05, -0.80]; J.hip = [0.0, -0.455];
      const u = t === undefined ? 1 : t;
      J.arms = [
        [[0.085, -0.795], [0.30, -0.79], [0.52, -0.80 + 0.02 * u]],
        [[-0.085, -0.795], [-0.15, -0.68], [-0.16, -0.58]],
      ];
      J.legs = [
        [[0.05, -0.455], [0.10, -0.25], [0.14, -0.012]],
        [[-0.05, -0.455], [-0.12, -0.25], [-0.18, -0.012]],
      ];
      return J;
    },
    // 国王端坐侧面（王冠尖利）
    king(t) {
      const J = baseJ();
      J.hip = [-0.02, -0.500]; J.neck = [-0.02, -0.845]; J.torso = [0.135, 0.120];
      J.head = [-0.02, -0.925, 0.076];
      J.legs = [[[-0.02, -0.50], [0.20, -0.455], [0.20, -0.02]], [[-0.03, -0.50], [-0.22, -0.455], [-0.22, -0.02]]];
      const u = t === undefined ? 0 : t;                 // 抬手程度
      J.arms = [
        [[-0.10, -0.84], [0.02, -0.72], [0.10, -0.60]],
        [[-0.12, -0.84], [-0.22, lerp(-0.70, -0.95, u)], [-0.20, lerp(-0.58, -1.04, u)]],
      ];
      J.extras = (col, ol) => {                          // 王冠：三根尖齿
        const cx = -0.02, cy = -0.985;
        fillPoly([
          [cx - 0.085, cy + 0.030], [cx + 0.085, cy + 0.030],
          [cx + 0.085, cy - 0.005], [cx + 0.048, cy - 0.072],
          [cx + 0.014, cy - 0.008], [cx - 0.014, cy - 0.098],
          [cx - 0.048, cy - 0.008], [cx - 0.085, cy - 0.072],
        ], col, ol, 0.005);
      };
      return J;
    },
  };

  /* 2D 恶龙剪影（侧视，x -1.2..2.2，脚 y=0，背脊有尖刺）
     o = {fill, out, t, rim, rimDX, eye, eyeCol, spikeGold, spikeHide, headDip, mouthGlow} */
  function drawDragon(o) {
    o = o || {};
    // 主色＝身体 / 次级色 fill2＝翼·尾·后腿·角 —— 双色才看得出「哪里是哪里」
    const fill = o.fill || '#e8732c';
    const fill2 = o.fill2 || '#c2561d';                // 次级色只做明暗差，不做「裂口」
    const out = o.out === undefined ? 'rgba(58,17,4,0.95)' : o.out;
    const t = o.t || 0;
    const dip = o.headDip || 0;                        // 低头 0..1
    const dy = 0.30 * dip;
    const style = o.style || 'ink';                    // facet 硬切面 / ink 墨线 / cut 剪纸粗边
    const fill3 = o.fill3 || '#f59a4e';                // 切面风的受光面
    const INK = 'rgba(126,46,10,0.72)';                // 墨线风的结构线
    // 背线（尖刺就长在这条线上）；第 4 根仍然是剧情中的“答案”。
    const SPINE = [[0.02, -1.34], [0.24, -1.43], [0.48, -1.48], [0.70, -1.42],
                   [0.91, -1.30], [1.04, -1.12], [1.10, -0.92]];
    const paint = (col, ol) => {
      const flat = (style === 'ink');                  // 墨线风：单色，靠内部墨线读形体
      const c2 = (col === fill && !MONO) ? (flat ? fill : fill2) : col;
      const P = (pts, f, o2, lw) => (style === 'facet' ? facePoly(pts, f, o2, lw) : smoothPoly(pts, f, o2, lw));
      // —— 蝠翼：四根翼指 + 内凹翼膜，先画在身体后面，轮廓比旧版更像龙翼 ——
      P([[0.18, -1.34], [0.54, -2.12], [0.98, -2.58], [1.34, -2.42], [1.20, -2.08],
         [1.68, -2.02], [1.48, -1.70], [1.82, -1.48], [1.28, -1.42], [1.05, -1.18],
         [0.64, -1.14], [0.34, -1.20]], c2, ol, 0.012);
      smoothStroke([[0.30, -1.30], [0.62, -1.88], [0.98, -2.44]], col, 0.030, 1);
      smoothStroke([[0.42, -1.28], [0.94, -1.70], [1.55, -1.94]], col, 0.026, 1);
      smoothStroke([[0.52, -1.25], [1.02, -1.46], [1.68, -1.49]], col, 0.022, 0.92);
      // —— 远后腿：蜥蜴式反关节 + 三趾爪 ——
      fillLimb([[0.44, -0.96], [0.54, -0.58], [0.45, -0.22], [0.60, -0.10]], 0.15, 0.075, c2, ol, 0.009, 'a');
      P([[0.42, -0.13], [0.65, -0.18], [0.86, -0.10], [0.66, -0.055], [0.82, 0.00],
         [0.57, -0.015], [0.45, -0.05]], c2, ol, 0.007);
      // —— 近后腿：粗壮大腿、细踝和分趾，避免“穿靴子的人腿” ——
      fillLimb([[0.72, -1.00], [0.66, -0.60], [0.78, -0.26], [0.70, -0.10]], 0.20, 0.085, col, ol, 0.010, 'a');
      P([[0.59, -0.14], [0.77, -0.18], [1.02, -0.09], [0.79, -0.035], [0.96, 0.025],
         [0.70, -0.005], [0.56, -0.055]], col, ol, 0.007);
      // —— 远前爪与近前爪：肘部前伸，腕部落地，末端为三根锐爪 ——
      fillLimb([[0.16, -1.20], [-0.02, -0.90], [-0.16, -0.55]], 0.105, 0.055, c2, ol, 0.008, 'a');
      P([[-0.28, -0.54], [-0.10, -0.58], [0.00, -0.51], [-0.16, -0.47], [-0.02, -0.42], [-0.22, -0.44], [-0.34, -0.48]], c2, ol, 0.006);
      fillLimb([[0.02, -1.18], [-0.16, -0.84], [-0.34, -0.46]], 0.115, 0.060, col, ol, 0.008, 'a');
      P([[-0.48, -0.44], [-0.28, -0.50], [-0.14, -0.42], [-0.34, -0.38], [-0.18, -0.32], [-0.42, -0.35], [-0.54, -0.39]], col, ol, 0.006);
      // —— 躯干：胸深、腰收、臀部抬高，保持四足动物的水平重心 ——
      P([[-0.04, -0.98], [0.20, -0.76], [0.62, -0.68], [0.96, -0.76], [1.10, -0.98],
         [1.00, -1.24], [0.70, -1.45], [0.28, -1.43], [0.02, -1.26]], col, ol, 0.012);
      // —— 颈：S 形上举；根部埋进躯干、**头端埋进头里且不补圆帽** ——
      fillLimb([[0.18, -1.22 - dy * 0.5], [-0.16, -1.54 - dy * 0.8], [-0.46, -1.78 - dy], [-0.66, -1.86 - dy]], 0.24, 0.075, col, ol, 0.010, 'a');
      // —— 头：眉骨、长吻、分开的下颌与后掠角；不再像圆头鸭嘴 ——
      P([[-0.50, -2.00 - dy], [-0.76, -2.04 - dy], [-1.05, -1.96 - dy], [-1.18, -1.84 - dy],
         [-1.14, -1.72 - dy], [-0.92, -1.69 - dy], [-0.70, -1.62 - dy], [-0.50, -1.75 - dy]], col, ol, 0.009);
      P([[-0.66, -1.66 - dy], [-0.94, -1.67 - dy], [-1.12, -1.59 - dy], [-1.03, -1.50 - dy],
         [-0.76, -1.52 - dy], [-0.57, -1.58 - dy]], c2, ol, 0.007);
      facePoly([[-0.62, -2.02 - dy], [-0.94, -1.98 - dy], [-0.76, -2.13 - dy]], c2, ol, 0.006);
      facePoly([[-0.60, -2.02 - dy], [-0.27, -2.34 - dy], [-0.40, -1.98 - dy]], c2, ol, 0.006);
      facePoly([[-0.48, -2.00 - dy], [-0.06, -2.22 - dy], [-0.30, -1.91 - dy]], c2, ol, 0.006);
      // 颌缘锯齿只露三颗，足够传达牙齿，不破坏剪影风格。
      for (let i = 0; i < 3; i++) {
        const tx = -1.02 + i * 0.12;
        facePoly([[tx, -1.66 - dy], [tx + 0.055, -1.66 - dy], [tx + 0.030, -1.57 - dy]], '#f6dca8', null, 0);
      }
      // —— 长尾：从臀部自然延伸、先抬后甩，末端是小型矛尖 ——
      fillLimb([[0.96, -0.98], [1.34, -0.84], [1.68, -0.62], [1.98, -0.48], [2.20, -0.56]], 0.14, 0.035, c2, ol, 0.009, 'b');
      P([[2.12, -0.62], [2.34, -0.74], [2.29, -0.54], [2.42, -0.40], [2.16, -0.47]], c2, ol, 0.006);
      // —— 风格分化：① 切面 ② 墨线 ③ 剪纸 ——
      if (style === 'facet') {                         // 受光面：再压两块亮色，做出切面体积
        facePoly([[0.30, -1.33], [0.62, -1.43], [0.98, -1.18], [0.92, -0.82], [0.56, -0.74], [0.20, -1.02]], fill3, null, 0.012);
        facePoly([[0.42, -1.38], [0.72, -2.00], [1.02, -2.36], [1.20, -2.08], [0.90, -1.64], [0.60, -1.28]], fill3, null, 0.012);
        // 胸颈受光切面与腹甲，让大型生物更有体积。
        facePoly([[-0.02, -1.22], [-0.22, -1.50], [-0.45, -1.73], [-0.36, -1.57], [-0.10, -1.20], [0.18, -0.92]], '#ef8738', null, 0.009);
      }
      if (style === 'ink') {                           // 墨线：脊线 / 颈线 / 腹线（同色系深橙）
        smoothStroke([[0.12, -1.34], [0.42, -1.42], [0.74, -1.38], [1.00, -1.14]], INK, 0.020, 1);
        smoothStroke([[0.02, -1.12], [-0.20, -1.46], [-0.46, -1.74]], INK, 0.017, 1);
        smoothStroke([[0.18, -0.88], [0.56, -0.72], [0.96, -0.78]], INK, 0.015, 1);
        smoothStroke([[0.48, -0.28], [0.74, -0.30]], INK, 0.013, 1);
      }
      // 腹甲分节与翼膜纹理：同色系细线，不会切碎整体轮廓。
      for (let i = 0; i < 5; i++) {
        const u = i / 4;
        smoothStroke([[-0.42 + u * 0.34, -1.70 + u * 0.48], [-0.24 + u * 0.36, -1.62 + u * 0.50]], INK, 0.010, 0.56);
      }
      // —— 背脊尖刺（沿背线，保留尖角；i=3 那根＝故事里那根刺）——
      for (let i = 0; i < SPINE.length; i++) {
        const p = SPINE[i];
        const gold = (i === 3 && o.spikeGold && !o.spikeHide);
        if (i === 3 && o.spikeHide) continue;
        const h = (i === 3 ? 0.82 : 0.20 + 0.08 * Math.sin(i * 1.3)) - Math.abs(i - 3) * 0.010;
        const w = (i === 3 ? 0.052 : 0.030);
        facePoly([[p[0] - w, p[1]], [p[0] + w, p[1]], [p[0], p[1] - h]],
          gold ? o.spikeGold : c2, gold ? 'rgba(255,246,210,0.85)' : ol, gold ? 0.006 : 0.004);
      }
    };
    // —— 主层：纯填充、无内部描边 → 各部件之间绝无深色接缝线。
    //    外轮廓由「彩色剪影 vs 场景底色」的对比提供；场景可另给一层柔光环(o.rim)。
    if (o.rim) {
      sctx.save(); sctx.globalAlpha *= 0.9;
      sctx.translate(o.rimDX === undefined ? 0.018 : o.rimDX, 0);
      paint(o.rim, null); sctx.restore();
    }
    paint(fill, null);
    // 背上那根刺单独打光 —— 它是全片的「答案」，必须在龙身上一眼认出
    if (o.spikeGold && !o.spikeHide) {
      const p = SPINE[3];
      sctx.save();
      glowAt(p[0], p[1] - 0.56, 0.80, 0.80, glow('rgba(255,196,86,A)'), 0.42, 'lighter');
      glowAt(p[0], p[1] - 0.56, 0.34, 0.34, glow('rgba(255,246,206,A)'), 0.70, 'lighter');
      sctx.restore();
    }
    if (o.mouthGlow) {                                    // 口中聚火
      sctx.save(); sctx.globalAlpha = clamp(o.mouthGlow, 0, 1);
      glowAt(-1.00, -1.66 - dy, 0.62, 0.40, glow('rgba(255,168,64,A)'), 1.0, 'lighter');
      glowAt(-1.00, -1.66 - dy, 0.26, 0.18, glow('rgba(255,244,204,A)'), 1.0, 'lighter');
      sctx.restore();
    }
    if (o.eye) {                                          // 只有一点红光，不算五官
      sctx.save(); sctx.globalAlpha = clamp(o.eye, 0, 1);
      glowAt(-0.78, -1.88 - dy, 0.26, 0.18, glow(o.eyeCol || 'rgba(255,60,40,A)'), 1.0, 'lighter');
      sctx.restore();
    }
  }
  function facePoly(pts, fill, out, lw) {
    sctx.beginPath(); sctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sctx.lineTo(pts[i][0], pts[i][1]);
    sctx.closePath(); paintPath(fill, out, lw);
  }

  /* ======================= 6 RPG 对话框 ======================= */
  const TXT = {};
  function bakeText(key, text, fs, color, glowCol, sp, family) {
    if (TXT[key]) return TXT[key];
    const fam = family || '"Microsoft YaHei","SimHei",sans-serif';
    const pad = 30;
    const m = document.createElement('canvas').getContext('2d');
    m.font = `700 ${fs}px ${fam}`;
    if (sp) m.letterSpacing = sp;
    const w = Math.ceil(m.measureText(text).width) + pad * 2;
    const h = Math.ceil(fs * 1.5) + pad * 2;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.font = `700 ${fs}px ${fam}`;
    if (sp) x.letterSpacing = sp;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (glowCol) { x.shadowColor = glowCol; x.shadowBlur = Math.round(fs * 0.40); }
    x.fillStyle = color; x.fillText(text, w / 2, h / 2);
    return (TXT[key] = { c, w, h, chars: text.length, text });
  }
  function drawText(sp, cx, cy, reveal, alpha, scale) {
    const n = clamp(reveal, 0, 1), s = scale || 1;
    if (n <= 0.002 || alpha <= 0.01) return;
    const w = sp.w * s, h = sp.h * s, x0 = cx - w / 2, y0 = cy - h / 2;
    sctx.save(); sctx.globalAlpha = alpha;
    sctx.beginPath(); sctx.rect(x0, y0, w * n + 2, h); sctx.clip();
    sctx.drawImage(sp.c, x0, y0, w, h);
    sctx.restore();
  }
  function typeK(key, text, fs, color, glowCol, sp, start, perChar) {
    const s = bakeText(key, text, fs, color, glowCol, sp);
    return clamp(Math.floor((curF - start) / perChar), 0, s.chars) / s.chars;
  }
  let curF = 0;
  const DIALOG_STYLE = {
    bw: 1300, bh: 176, by: H - 250,
    fill: 'rgba(26,19,14,0.91)',
    frame: 'rgba(228,196,122,0.95)', frame2: 'rgba(96,72,38,0.95)',
    col: 'rgba(246,240,222,0.97)', glow: 'rgba(255,214,130,0.55)',
    fs: 46, sp: '3px',
  };
  /* 复古 RPG 对话框：粗边框 + 方角章 + 打字机 + 闪烁 ▼
     opt: {by, alpha, col, frame, fs, perChar, label} */
  function dialog(text, start, opt) {
    const o = Object.assign({}, DIALOG_STYLE, opt || {});
    const f = curF;
    if (f < start - 6) return;
    const s = bakeText('dlg:' + text, text, o.fs, o.col, o.glow, o.sp);
    const reveal = clamp(Math.floor((f - start) / (o.perChar || 2.4)), 0, s.chars) / s.chars;
    const tin = smoothstep(start - 6, start + 4, f);
    const a = tin * (o.alpha === undefined ? 1 : o.alpha);
    if (a <= 0.01) return;
    const bx = W / 2 - o.bw / 2, by = o.by, bw = o.bw, bh = o.bh;
    sctx.save(); sctx.globalAlpha = a;
    rrect(bx, by, bw, bh, 8); sctx.fillStyle = o.fill; sctx.fill();
    sctx.lineWidth = 4; sctx.strokeStyle = o.frame; sctx.stroke();
    rrect(bx + 7, by + 7, bw - 14, bh - 14, 5);
    sctx.lineWidth = 2; sctx.strokeStyle = o.frame2; sctx.stroke();
    // 四角方块章（16bit 对话框的固定装饰）
    sctx.fillStyle = o.frame;
    const cs = 9;
    for (const p of [[bx + 12, by + 12], [bx + bw - 12 - cs, by + 12], [bx + 12, by + bh - 12 - cs], [bx + bw - 12 - cs, by + bh - 12 - cs]]) {
      sctx.fillRect(p[0], p[1], cs, cs);
    }
    if (o.label) {
      sctx.font = '700 26px "Consolas","Courier New",monospace';
      sctx.fillStyle = o.labelCol || o.frame; sctx.textAlign = 'left'; sctx.textBaseline = 'top';
      sctx.fillText(o.label, bx + 26, by - 34);
    }
    sctx.restore();
    // 文字
    drawText(s, bx + bw / 2, by + bh / 2 + 2, reveal, a);
    // 打字光标 / 完成后的 ▼
    if (reveal < 0.999) {
      if (Math.floor(f / 6) % 2 === 0) {
        const cut = bx + bw / 2 - s.w / 2 + s.w * reveal;
        sctx.save(); sctx.globalAlpha = a * 0.85; sctx.fillStyle = o.col;
        sctx.fillRect(cut + 3, by + bh / 2 - s.h * 0.30, 4, s.h * 0.6); sctx.restore();
      }
    } else if (Math.floor(f / 14) % 2 === 0) {
      sctx.save(); sctx.globalAlpha = a; sctx.fillStyle = o.frame;
      const px = bx + bw - 46, py = by + bh - 34;
      sctx.beginPath(); sctx.moveTo(px, py); sctx.lineTo(px + 20, py); sctx.lineTo(px + 10, py + 14);
      sctx.closePath(); sctx.fill(); sctx.restore();
    }
  }
  // 屏幕中间 / 上方的大号字幕（淡入淡出，不走对话框）
  function caption(text, inA, inB, outA, outB, opt) {
    const o = opt || {};
    const s = bakeText('cap:' + text, text, o.fs || 46, o.col || 'rgba(242,236,222,0.96)', o.glow || 'rgba(0,0,0,0.9)', o.sp || '2px');
    const a = subA(curF, inA, inB, outA, outB) * (o.alpha === undefined ? 1 : o.alpha);
    if (a <= 0.01) return;
    drawText(s, o.cx === undefined ? W / 2 : o.cx, o.cy === undefined ? 470 : o.cy, 1, a, o.scale || 1);
  }
  // 章节标签（左上角，复古 RPG 味）；dark=true 用于米白亮底场景
  function chapterLabel(text, alpha, dark) {
    if (alpha <= 0.01) return;
    const key = (dark ? 'chapD:' : 'chap:') + text;
    const s = bakeText(key, text, 28,
      dark ? 'rgba(62,46,28,0.95)' : 'rgba(240,226,190,0.9)',
      dark ? 'rgba(255,252,240,0.7)' : 'rgba(0,0,0,0.85)', '4px');
    sctx.save(); sctx.globalAlpha = alpha;
    sctx.drawImage(s.c, 74, 58, s.w, s.h);
    sctx.fillStyle = dark ? 'rgba(158,120,58,0.95)' : 'rgba(228,196,122,0.85)';
    sctx.fillRect(74, 58 + s.h + 4, 150, 2);
    sctx.restore();
  }

  /* ======================= 7 各场 FX（全部确定性） ======================= */
  // 8bit 火盆火苗：阶梯化、分层的多边形火舌
  function fxFlame(cx, cy, w, h, seed, alpha, fuel) {
    if (alpha <= 0.01) return;
    const t = stepT(curF, 2), fu = fuel === undefined ? 1 : fuel;
    sctx.save(); sctx.globalAlpha = alpha; sctx.globalCompositeOperation = 'lighter';
    glowAt(cx, cy - h * 0.35, w * 2.4, h * 1.5, glow('rgba(255,132,40,A)'), 0.30 * fu, 'lighter');
    const layers = [
      { k: 1.00, col: 'rgba(255,96,20,0.85)' },
      { k: 0.70, col: 'rgba(255,168,52,0.90)' },
      { k: 0.40, col: 'rgba(255,232,150,0.95)' },
    ];
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const n = 6;
      sctx.beginPath();
      sctx.moveTo(cx - w * L.k, cy);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const x = cx - w * L.k + 2 * w * L.k * u;
        const fk = 0.55 + 0.45 * srnd(seed * 3.3 + li * 7.1 + Math.floor(t / 2) * 1.7 + i * 2.3);
        const y = cy - h * L.k * fk;
        sctx.lineTo(x, y);
      }
      sctx.lineTo(cx + w * L.k, cy);
      sctx.closePath();
      sctx.fillStyle = L.col; sctx.fill();
    }
    sctx.restore();
  }
  // 火星上扬
  function fxEmbers(cx, cy, spread, rise, n, seed, alpha) {
    if (alpha <= 0.01) return;
    sctx.save(); sctx.globalAlpha = alpha; sctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const sp = 0.35 + srnd(seed + i * 3.1) * 0.9;
      const y = cy - ((curF * sp * rise / 30 + srnd(seed + i * 7.3) * rise) % rise);
      const x = cx + (srnd(seed + i * 5.7) - 0.5) * spread + Math.sin((curF / 26 + i) * 1.1) * 8;
      const a = (0.35 + 0.5 * srnd(seed + i * 2.9)) * (1 - (cy - y) / rise);
      sctx.fillStyle = i % 3 === 0 ? 'rgba(255,214,140,1)' : 'rgba(255,126,42,1)';
      sctx.fillRect(x, y, 2.4, 2.4);
      if (a > 0.2) glowAt(x, y, 9, 9, glow('rgba(255,140,50,A)'), a * 0.5, 'lighter');
    }
    sctx.restore();
  }
  // 雪 / 沙尘粒子（横向风）
  function fxParticles(opt) {
    const o = Object.assign({ n: 260, wind: -2.6, fall: 5.0, len: 26, col: 'rgba(226,240,255,0.82)', alpha: 1, seed: 11, size: 2.0, gust: 1 }, opt);
    if (o.alpha <= 0.01) return;
    sctx.save(); sctx.globalAlpha = o.alpha;
    const dr = Math.sin(curF * 0.02 * o.gust) * 30;                  // 阵风
    for (let i = 0; i < o.n; i++) {
      const sp = 0.5 + srnd(o.seed + i * 2.3);
      const x = ((srnd(o.seed + i * 3.7) * (W + 400) + curF * o.wind * sp + dr) % (W + 400) + W + 400) % (W + 400);
      const y = ((srnd(o.seed + i * 5.1) * H + curF * o.fall * sp) % H + H) % H;
      const a = 0.25 + 0.6 * srnd(o.seed + i * 7.9);
      sctx.globalAlpha = o.alpha * a;
      sctx.fillStyle = o.col;
      if (o.len > 0) {
        sctx.fillRect(x - o.len * 0.5, y, o.len * (0.5 + 0.7 * sp), o.size);
      } else {
        sctx.fillRect(x, y, o.size, o.size);
      }
    }
    sctx.restore();
  }
  // 雾带（多层柔和横带，缓慢漂移）
  function fxFog(cy, rx, ry, col, alpha, n, seed) {
    if (alpha <= 0.01) return;
    const cnt = n || 3;
    for (let i = 0; i < cnt; i++) {
      const off = Math.sin((curF / (120 + i * 40) + srnd(seed + i) * 3) * TAU) * rx * 0.18;
      band(W / 2 + off, cy + i * ry * 0.75, rx * (1 - i * 0.12), ry, col, alpha * (1 - i * 0.22), 'source-over');
    }
  }
  // 萤火虫（确定性漂浮）
  function fxFireflies(n, x0, y0, x1, y1, seed, alpha) {
    if (alpha <= 0.01) return;
    sctx.save(); sctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const bx = x0 + srnd(seed + i * 3.1) * (x1 - x0);
      const by = y0 + srnd(seed + i * 5.3) * (y1 - y0);
      const x = bx + Math.sin((curF / 46 + srnd(seed + i) * 6.2) * TAU) * 26;
      const y = by + Math.sin((curF / 33 + srnd(seed + i * 2) * 6.2) * TAU) * 18;
      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((curF / 17 + i * 1.7) * TAU));
      const a = alpha * pulse * (0.4 + 0.6 * srnd(seed + i * 8.1));
      sctx.globalAlpha = a;
      sctx.fillStyle = 'rgba(206,255,150,1)';
      sctx.fillRect(x, y, 2.6, 2.6);
      glowAt(x, y, 26, 26, glow('rgba(176,255,120,A)'), a * 0.6, 'lighter');
    }
    sctx.restore();
  }
  // 2D 锯齿闪电（8bit 光栅感：折线按 2px 步进）
  function fxBolt(x0, y0, x1, y1, seed, alpha, col) {
    if (alpha <= 0.01) return;
    const segs = 9, t = stepT(curF, 2);
    sctx.save(); sctx.globalAlpha = alpha;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const jag = (i === 0 || i === segs) ? 0 : (srnd(seed + t * 0.7 + i * 3.7) - 0.5) * 46;
      pts.push([lerp(x0, x1, u) + jag, lerp(y0, y1, u) + (i > 0 && i < segs ? (srnd(seed + t + i * 7.1) - 0.5) * 22 : 0)]);
    }
    glowAt((x0 + x1) / 2, (y0 + y1) / 2, 420, 190, glow(col || 'rgba(190,214,255,A)'), alpha * 0.16, 'lighter');
    sctx.strokeStyle = col || 'rgba(214,232,255,0.95)'; sctx.lineWidth = 5; sctx.lineJoin = 'miter';
    sctx.beginPath(); sctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sctx.lineTo(Math.round(pts[i][0]), Math.round(pts[i][1]));
    sctx.stroke();
    sctx.strokeStyle = 'rgba(255,255,255,0.95)'; sctx.lineWidth = 2;
    sctx.stroke();
    sctx.restore();
  }
  // 乌鸦（绕圈飞的小剪影）
  function fxCrows(cx, cy, R, n, seed, alpha) {
    if (alpha <= 0.01) return;
    sctx.save(); sctx.globalAlpha = alpha;
    for (let i = 0; i < n; i++) {
      const a = (curF / (150 + i * 30) + srnd(seed + i) * 3) * TAU + i * 1.7;
      const x = cx + Math.cos(a) * R * (0.6 + 0.5 * srnd(seed + i * 3.3));
      const y = cy + Math.sin(a) * R * 0.34;
      const flap = Math.sin((curF / 6 + i * 2) * TAU);
      const s = 0.9 + 0.4 * srnd(seed + i * 5.1);
      sctx.save(); sctx.translate(x, y); sctx.scale(s, s); sctx.fillStyle = 'rgba(10,8,14,0.95)';
      sctx.beginPath();
      sctx.moveTo(-13, -flap * 7); sctx.quadraticCurveTo(0, -2, 13, -flap * 7);
      sctx.quadraticCurveTo(0, 4, -13, -flap * 7);
      sctx.fill();
      sctx.beginPath(); sctx.ellipse(0, 1, 4.6, 3.0, 0, 0, TAU); sctx.fill();
      sctx.restore();
    }
    sctx.restore();
  }
  // 白骨（牛头骨 / 肋骨）剪影，画在世界坐标地面
  function fxBone(x, y, z, hw, kind, alpha) {
    billboard(x, y, z, hw, () => {
      sctx.save(); sctx.globalAlpha = alpha; sctx.fillStyle = 'rgba(222,214,196,0.90)';
      if (kind === 0) {                                  // 头骨
        sctx.beginPath(); sctx.ellipse(0, -0.52, 0.36, 0.30, 0, 0, TAU); sctx.fill();
        sctx.fillRect(-0.06, -0.30, 0.12, 0.30);
      } else if (kind === 1) {                            // 肋骨扇形
        for (let i = 0; i < 5; i++) {
          sctx.save(); sctx.translate(-0.4 + i * 0.20, -0.20);
          sctx.rotate(-0.5 + i * 0.22);
          sctx.fillRect(0, 0, 0.06, 0.46); sctx.restore();
        }
      } else {                                            // 长骨堆
        sctx.save(); sctx.rotate(-0.35); sctx.fillRect(-0.46, -0.16, 0.92, 0.10); sctx.restore();
        sctx.save(); sctx.rotate(0.30); sctx.fillRect(-0.36, -0.06, 0.72, 0.09); sctx.restore();
        sctx.beginPath(); sctx.arc(-0.44, -0.12, 0.09, 0, TAU); sctx.fill();
        sctx.beginPath(); sctx.arc(0.40, -0.20, 0.09, 0, TAU); sctx.fill();
      }
      sctx.restore();
    });
  }
  // 光爆 / 火花
  function fxSparks(cx, cy, n, R, seed, alpha, col) {
    if (alpha <= 0.01) return;
    sctx.save(); sctx.globalAlpha = alpha; sctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = srnd(seed + i * 3.3) * TAU;
      const rr = R * (0.25 + 0.75 * srnd(seed + i * 5.1));
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.7;
      sctx.fillStyle = col || 'rgba(255,226,160,1)';
      sctx.fillRect(x, y, 3, 3);
    }
    sctx.restore();
  }
  // 全屏过曝 / 压黑
  function screenFlash(col, alpha, comp) {
    if (alpha <= 0.004) return;
    sctx.save(); sctx.globalAlpha = clamp(alpha, 0, 1);
    if (comp) sctx.globalCompositeOperation = comp;
    sctx.fillStyle = col; sctx.fillRect(0, 0, W, H); sctx.restore();
  }
  // 地裂岩浆光（世界坐标折线 + 发光）；宽度按世界米数给，随景深自动收缩
  function fxLavaCrack(pts, alpha, col, wWorld) {
    if (alpha <= 0.01) return;
    const ww = wWorld || 0.12;
    sctx.save(); sctx.globalCompositeOperation = 'lighter';
    const c = col || 'rgba(255,104,32,A)';
    for (let i = 0; i < pts.length - 1; i++) {
      const a = proj(pts[i][0], pts[i][1], pts[i][2]), b = proj(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
      if (!a || !b) continue;
      const w = ww * ((a.s + b.s) / 2);
      sctx.globalAlpha = alpha * 0.48;
      sctx.strokeStyle = c; sctx.lineWidth = Math.max(2, w * 3.0); sctx.lineCap = 'round';
      sctx.beginPath(); sctx.moveTo(a.x, a.y); sctx.lineTo(b.x, b.y); sctx.stroke();
      sctx.globalAlpha = alpha * 0.85;
      sctx.strokeStyle = 'rgba(255,222,150,0.95)'; sctx.lineWidth = Math.max(1, w * 0.9);
      sctx.beginPath(); sctx.moveTo(a.x, a.y); sctx.lineTo(b.x, b.y); sctx.stroke();
    }
    sctx.restore();
  }

  /* ======================= 8 后处理 + boot ======================= */
  // 复古 RPG 基线：扫描线略重（像老 CRT）、色差小、暖调、颗粒中等
  const POST_BASE = { curve: 0.045, chroma: 0.05, scan: 0.40, grain: 0.05, glitch: 0.018, grade: 0.10, vig: 0.34, wobble: 0.0022, fade: 1 };
  function postRetro(p) { return Object.assign({}, POST_BASE, p || {}); }

  /**
   * 场景启动器。
   * opt = {
   *   total     全局源帧总数（如 788）
   *   seg       [SEG_START, SEG_LEN] 本文件负责的全局帧区间
   *   cam       初始机位 {x,y,z,pitch,yaw,focal}
   *   bg        底色
   *   scene(f)  画一帧（f = 全局源帧，已 clamp 到本段）
   *   setCam(f) 可选：按帧定机位（内部已有 if(!ROAM) 保护）
   *   post(f)   可选：返回本帧后处理参数
   *   clamp(c)  可选：漫游相机约束
   *   hud()     可选：漫游 HUD 追加行
   * }
   */
  function boot(opt) {
    const P = new URLSearchParams(location.search);
    const ROAM = P.get('roam') === '1';
    window.__frame = parseInt(P.get('frame') || '0', 10) || 0;

    const TOTAL = opt.total;
    const S0 = opt.seg[0], SL = opt.seg[1];

    const disp = document.getElementById('c');
    const dctx = disp.getContext('2d');
    if (ROAM) {
      // 漫游模式按 16:9 等比适配窗口；只改 CSS 尺寸，不改变 1920×1080 出片像素。
      document.documentElement.style.background = '#030306';
      document.body.style.background = '#030306';
      disp.style.cssText += ';position:fixed;left:50%;top:50%;'
        + 'width:min(100vw,177.7778vh);height:min(100vh,56.25vw);'
        + 'transform:translate(-50%,-50%);cursor:grab;touch-action:none;user-select:none';
    }
    const fx = PostFX.create({ W, H });
    attach(fx.sctx);
    Object.assign(CAM, opt.cam);
    const BG = opt.bg || '#07060a';

    function renderFrame(fg) {
      const f = clamp(fg, S0, S0 + SL);
      curF = f;
      if (!ROAM && opt.setCam) opt.setCam(f);
      fx.sctx.setTransform(1, 0, 0, 1, 0, 0);
      fx.sctx.globalAlpha = 1; fx.sctx.globalCompositeOperation = 'source-over';
      fx.sctx.fillStyle = BG; fx.sctx.fillRect(0, 0, W, H);
      opt.scene(f);
      const pp = Object.assign({ frame: f }, postRetro(opt.post ? opt.post(f) : null));
      pp.fade = ROAM ? 1 : Math.min(pp.fade === undefined ? 1 : pp.fade, subA(fg, -3, 5, TOTAL - 12, TOTAL));
      const ok = fx.post(pp);
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.clearRect(0, 0, W, H);
      dctx.drawImage(ok ? fx.glC : fx.sceneC, 0, 0);
    }
    window.renderFrame = renderFrame;

    let roam = null;
    if (ROAM) {
      roam = Roam.create({
        cam: CAM,
        total: SL,
        applyCam: function () { },
        draw: function (lf) { renderFrame(S0 + lf); },
        clamp: opt.clamp,
        hud: opt.hud,
      });
      roam.start();
    } else {
      renderFrame(window.__frame);
      window.__renderDone = true;
    }
    return { ROAM, fx, sctx, dctx, renderFrame, S0, SL, TOTAL, roam };
  }

  window.DK = {
    W, H, TAU,
    clamp, lerp, smoothstep, easeOutCubic, easeInOut, srnd, subA, wave, stepT,
    CAM, NEAR, attach, camSpace, proj, projPoly, face, faceO, seg3, dot3, discY, localPlane,
    billboard, silhouette, paintPath, fillLimb, fillDisc, fillPoly, drawActor, POSE, drawDragon, facePoly,
    bakeCanvas, bakeGlow, glow, glowAt, skyGrad, checkerOverlay, rrect, band,
    bakeText, drawText, typeK, dialog, caption, chapterLabel,
    fxFlame, fxEmbers, fxParticles, fxFog, fxFireflies, fxBolt, fxCrows, fxBone, fxSparks, screenFlash, fxLavaCrack,
    POST_BASE, postRetro, boot,
    get ctx() { return sctx; },
    get frame() { return curF; },
  };
})();
