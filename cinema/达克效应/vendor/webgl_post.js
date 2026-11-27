/* ============================================================================
   共享资源 / webgl_post.js —— 「2D 打底 → WebGL 片元后处理 → 显示画布」管线（跨案例复用）
   ----------------------------------------------------------------------------
   管线长这样（看清这三层，绝大多数 bug 都能定位）：

        sceneC  (2D 离屏)  ──►  glC (WebGL)  ──►  #c (2D 显示画布, render.js 抓它)
         所有场景绘制          全屏 shader 后处理        合成结果

   为什么 `#c` 必须仍是 **2D canvas**：render.js 用 `toDataURL()` 抓帧，
   第 2 步的性能坑与解法（见 文档/问题与解决.md #3/#4）完全不变。

   ★ 硬约束：
     - 着色器里同样**禁止 Math.random**（逐帧闪烁），颗粒 / 抖动一律用 GLSL 的 hash(uFrame)；
     - 后处理参数**按幕给**（postParams(f)）：越到后面色差 / 撕裂 / 颗粒越重，
       让同一层 shader 兼职「情绪推进」——但**别把"读字"的那几幕搞糊**（见 §6.14）。
     - headless 下 WebGL 默认不可用，**必须**给 chromium 加 HEADLESS_ARGS。

   ★ 用法：
     <script src="../共享资源/webgl_post.js"></script>
     const fx = PostFX.create({ W: 1920, H: 1080 });        // 默认用房子那套 CRT
     function render(f) {
       clearScene(fx.sctx);          // 画在 fx.sceneC 上
       drawXxx(f);
       fx.post(postParams(f));       // 喂 shader → 出 glC
       dctx.drawImage(fx.glC, 0, 0); // 合成到 #c（render.js 抓的就是它）
     }
   ========================================================================== */
(function () {
  'use strict';
  if (window.PostFX) return;

  /* 全屏三角带：顶点着色器只做「把 aPos 映射到 uv」 */
  const VS = [
    'attribute vec2 aPos; varying vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }',
  ].join('\n');

  /* 房子默认这套 CRT 后处理：桶形畸变 / RGB 色差 / 扫描线 / 确定性颗粒 / 故障切片 /
     冷暖分级 / 暗角 / 横向抖动 / 整体淡出。uniform 名与 DEFAULTS 一一对应。 */
  const FS_CRT = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex; uniform vec2 uRes; uniform float uFrame;',
    'uniform float uCurve, uChroma, uScan, uGrain, uGlitch, uGrade, uVig, uWobble, uFade;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 cc = uv - 0.5; float r2 = dot(cc, cc);',
    '  uv += cc * r2 * uCurve;',
    '  float band = floor(uv.y * 28.0);',
    '  uv.x += (hash(vec2(band, floor(uFrame * 0.7))) - 0.5) * uWobble;',
    '  float g = step(1.0 - uGlitch, hash(vec2(band, floor(uFrame))));',
    '  uv.x += g * (hash(vec2(band, 7.0)) - 0.5) * 0.12 * uGlitch;',
    '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }',
    '  float off = uChroma * (0.0018 + r2 * 0.010);',
    '  vec3 col;',
    '  col.r = texture2D(uTex, uv + vec2(off, 0.0)).r;',
    '  col.g = texture2D(uTex, uv).g;',
    '  col.b = texture2D(uTex, uv - vec2(off, 0.0)).b;',
    '  float scan = 0.93 + 0.07 * sin(uv.y * uRes.y * 3.14159);',
    '  col *= mix(1.0, scan, uScan);',
    '  col.r *= 1.0 + 0.10 * uGrade; col.b *= 1.0 - 0.10 * uGrade;',
    '  col *= 1.0 - uVig * smoothstep(0.22, 0.85, r2 * 2.0);',
    '  col += (hash(uv * uRes + uFrame) - 0.5) * uGrain;',
    '  col *= uFade;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}',
  ].join('\n');

  /* headless 必须加：否则 shader 编译失败、整片全黑（见 文档/问题与解决.md #18） */
  const HEADLESS_ARGS = [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl',
  ];

  /* 房子默认参数（《框架效应》POST1 同值）。按幕覆盖见 postParams(f)。 */
  const DEFAULTS = {
    frame: 0,
    curve: 0.05, chroma: 0.09, scan: 0.30, grain: 0.045,
    glitch: 0.03, grade: -0.10, vig: 0.30, wobble: 0.003, fade: 1.0,
  };

  function create(opt) {
    const W = opt.W, H = opt.H;
    const fsSrc = opt.fs || FS_CRT;

    const sceneC = document.createElement('canvas'); sceneC.width = W; sceneC.height = H;
    const sctx = sceneC.getContext('2d');
    const glC = document.createElement('canvas'); glC.width = W; glC.height = H;
    const gl = glC.getContext('webgl', {
      preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false,
    });

    let prog = null, locs = null, locsL = null, tex = null, warned = Object.create(null);

    if (!gl) {
      console.error('[PostFX] WebGL 取不到 context —— headless 请用 PostFX.HEADLESS_ARGS 启动 chromium；'
        + '此时 post() 返回 false，宿主可退回 dctx.drawImage(sceneC, 0, 0) 直出 2D 图层。');
      return { sceneC, sctx, glC, gl: null, post: () => false };
    }

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('[PostFX] shader 编译失败：\n' + gl.getShaderInfoLog(sh));
      }
      return sh;
    }
    function init() {
      const vs = compile(gl.VERTEX_SHADER, VS);
      const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
      prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('[PostFX] program 链接失败：\n' + gl.getProgramInfoLog(prog));
      }
      gl.useProgram(prog);

      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

      // 反射出所有 uniform，post() 按名字喂参数 —— 换一套自定义 FS 也不用改这里
      // 同时建一份小写索引：参数写 'curve' 能对上 shader 里的 'uCurve'（大小写与 u 前缀都不计较）
      locs = {}; locsL = {};
      const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const u = gl.getActiveUniform(prog, i);
        if (!u) continue;
        locs[u.name] = { loc: gl.getUniformLocation(prog, u.name), type: u.type };
        locsL[u.name.toLowerCase()] = locs[u.name];
      }

      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.viewport(0, 0, W, H);

      gl.uniform1i(locs.uTex.loc, 0);
      gl.uniform2f(locs.uRes.loc, W, H);
    }
    init();

    /* 每帧调一次：p 里带上这帧要用的全部参数（含 frame），未给的走 DEFAULTS */
    function post(p) {
      const par = Object.assign({}, DEFAULTS, p || {});
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneC);
      for (const k in par) {
        const kl = k.toLowerCase();
        const u = locs[k] || locsL[kl] || locsL['u' + kl];
        if (!u) {
          if (!warned[k]) { warned[k] = 1; console.warn('[PostFX] 参数 "' + k + '" 在 shader 里没有同名 uniform，已忽略'); }
          continue;
        }
        const v = par[k];
        if (u.type === gl.FLOAT) gl.uniform1f(u.loc, v);
        else if (u.type === gl.FLOAT_VEC2) gl.uniform2f(u.loc, v[0], v[1]);
        else if (u.type === gl.FLOAT_VEC3) gl.uniform3f(u.loc, v[0], v[1], v[2]);
        else gl.uniform1i(u.loc, v);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    }

    return { sceneC, sctx, glC, gl, post, get program() { return prog; } };
  }

  window.PostFX = { create, VS, FS_CRT, HEADLESS_ARGS, DEFAULTS };
})();
