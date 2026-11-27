/* ============================================================================
   共享资源 / roam.js —— 伪 3D / WebGL 场景的交互漫游自检控制器（跨案例复用）
   ----------------------------------------------------------------------------
   为什么要有它：静态关键帧看不出「机位摆错 / 前后景互相遮挡 / 某面永远背光 /
   主体被吃掉」。只有走进空间绕一圈、逐帧走一遍才暴露。
   所以本仓库的纪律是：**凡是用了伪 3D 空间或 WebGL 后处理的 scene.html，
   都必须支持 `?roam=1`**（规则见 文档/技术栈与风格.md §3.1）。

   ★ 纪律（最重要的一条）：漫游是**旁路**。
     - `?roam=1`：走实时循环 + 自由相机；
     - 默认（无参数）：必须仍走 `window.renderFrame(f)`，且仍**是帧的纯函数**。
     宿主场景只需要做一件事——在「按帧定机位」那段加一道 `if (!ROAM) camBeat(f);`，
     别让自由相机的状态被出片路径带进去。

   ★ 用法（宿主 scene.html）—— 注意：下面的示例整体是本注释的一部分，
     function setCam()  —— 由当前 CAM 重算投影与可见性
     function drawScene(f) —— 用当前 CAM 画一帧（含后处理）

     let roam = null;
     if (ROAM) {
       roam = Roam.create({
         cam: CAM,                    // 会被就地修改：{x,y,z,pitch,yaw,focal}
         total: TOTAL_FRAMES,         // 源帧总数
         applyCam: setCam,            // 改完 cam 调一次（重算投影）
         draw: drawScene,             // 用当前 CAM 画一帧（含后处理）
         clamp: c => {                // 可选：把相机关在空间里
           c.x = clamp(c.x, -1.6, 1.6);
           c.y = clamp(c.y, 0.70, 2.40);
           c.z = clamp(c.z, -1.00, 4.60);
         },
         hud: () => '空间 3.8 × 3.30 × 9.2',   // 可选：HUD 追加一行
       });
       roam.start();
     } else {
       renderFrame(window.__frame);
     }

   操作：WASD 平移 / Q·E 升降 / Shift 加速 / 拖拽转视角 / [ ] 逐帧 / 空格 播放暂停 / R 复位
   ========================================================================== */
(function () {
  'use strict';
  if (window.Roam) return;

  function createRoam(opt) {
    const cam = opt.cam;
    if (!cam) throw new Error('Roam.create: 缺少 opt.cam');
    const draw = opt.draw;
    if (typeof draw !== 'function') throw new Error('Roam.create: 缺少 opt.draw');
    const total = Math.max(1, opt.total || 1);
    const applyCam = opt.applyCam || function () {};
    const clampCam = opt.clamp || function () {};
    const speed = opt.speed || 0.90;                 // m/s（Shift ×3）
    const fps = opt.fps || 22.5;                     // 源帧推进速率 = 30 × 0.75，与成片同速
    const dragGain = opt.dragGain || 0.0032;         // rad / px
    const invertY = !!opt.invertY;
    const home = { x: cam.x, y: cam.y, z: cam.z, pitch: cam.pitch, yaw: cam.yaw, focal: cam.focal };

    let frame = opt.frame0 || 0, playing = true, acc = 0;
    let running = false, last = 0;
    let dragging = false, lx = 0, ly = 0;
    let hudEl = null;
    const keys = Object.create(null);

    /* ---- HUD：用 DOM 叠层，不画进画布 —— 保证漫游再怎么看也不会污染出片帧 ---- */
    function hud() {
      if (hudEl) return hudEl;
      hudEl = document.createElement('div');
      hudEl.style.cssText =
        'position:fixed;left:14px;bottom:14px;z-index:99;pointer-events:none;'
        + 'font:600 13px/1.62 Consolas,"Courier New",monospace;white-space:pre;'
        + 'color:#cfe6f2;background:rgba(6,12,16,0.74);border:1px solid rgba(150,200,220,0.35);'
        + 'border-radius:6px;padding:9px 13px;text-shadow:0 0 6px rgba(120,200,240,0.55)';
      document.body.appendChild(hudEl);
      return hudEl;
    }
    const deg = r => (r * 180 / Math.PI).toFixed(1);
    function paint() {
      hud().textContent =
        'ROAM  frame ' + String(frame).padStart(4, '0') + ' / ' + total + '   ' + (playing ? '▶' : '❚❚') + '\n'
        + 'cam   x ' + cam.x.toFixed(2) + '   y ' + cam.y.toFixed(2) + '   z ' + cam.z.toFixed(2) + '\n'
        + 'view  yaw ' + deg(cam.yaw) + '°   pitch ' + deg(cam.pitch) + '°   focal ' + Math.round(cam.focal) + '\n'
        + (opt.hud ? opt.hud(cam, frame) + '\n' : '')
        + 'WASD 平移   Q/E 升降   Shift 加速   [ ] 逐帧   空格 播放/暂停   R 复位   拖拽 转视角';
    }

    /* ---- 输入 ---- */
    function onKey(e, down) {
      const c = e.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight',
           'Space', 'BracketLeft', 'BracketRight', 'KeyR'].indexOf(c) < 0) return;
      e.preventDefault();
      keys[c] = down;
      if (!down) return;
      if (c === 'Space') playing = !playing;                       // 播放 / 暂停
      if (c === 'KeyR') {                                          // 复位机位与帧号
        cam.x = home.x; cam.y = home.y; cam.z = home.z;
        cam.pitch = home.pitch; cam.yaw = home.yaw; cam.focal = home.focal;
        frame = opt.frame0 || 0; applyCam(); draw(frame); paint();
      }
      if (c === 'BracketLeft') { playing = false; frame = (frame - 1 + total) % total; applyCam(); draw(frame); paint(); }
      if (c === 'BracketRight') { playing = false; frame = (frame + 1) % total; applyCam(); draw(frame); paint(); }
    }
    function onDown(e) {
      dragging = true; lx = e.clientX; ly = e.clientY;
      if (e.currentTarget && e.currentTarget.setPointerCapture && e.pointerId !== undefined) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      document.body.style.cursor = 'grabbing';
    }
    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      cam.yaw += dx * dragGain;
      cam.pitch = Math.max(-1.15, Math.min(1.15, cam.pitch + dy * dragGain * (invertY ? -1 : 1)));
      applyCam(); draw(frame); paint();
    }
    function onUp() { dragging = false; document.body.style.cursor = ''; }

    /* ---- 实时循环 ---- */
    function tick(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;

      if (playing) {                                  // 帧推进（源帧速率 = 22.5 帧/秒）
        acc += dt * fps;
        const n = Math.floor(acc);
        if (n > 0) { frame = (frame + n) % total; acc -= n; }
      }

      // 位移：前 = 视线方向，右 = 视线右方（对齐本仓库 proj() 的 yaw 约定：yaw 为负 = 视线偏左）
      const tx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      const tz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      const ty = (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0);
      if (tx || tz || ty) {
        const s = speed * ((keys.ShiftLeft || keys.ShiftRight) ? 3 : 1) * dt;
        const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
        const fwdX = -sy, fwdZ = cy;                  // 视线方向
        const rgtX = cy, rgtZ = sy;                   // 视线右方
        cam.x += (tx * rgtX + tz * fwdX) * s;
        cam.z += (tx * rgtZ + tz * fwdZ) * s;
        cam.y += ty * s;
        clampCam(cam);
        applyCam();
      }
      draw(frame);
      paint();
      requestAnimationFrame(tick);
    }

    return {
      start() {
        if (running) return;
        running = true;
        window.addEventListener('keydown', e => onKey(e, true));
        window.addEventListener('keyup', e => onKey(e, false));
        window.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        window.addEventListener('blur', () => { dragging = false; });
        applyCam(); draw(frame); paint();
        last = performance.now();
        requestAnimationFrame(tick);
      },
      stop() { running = false; if (hudEl) hudEl.remove(); hudEl = null; },
      get frame() { return frame; },
      set frame(f) { frame = ((f % total) + total) % total; },
      get cam() { return cam; },
    };
  }

  window.Roam = { create: createRoam };
})();
