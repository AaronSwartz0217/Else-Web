/* 3D 街机厅：Three.js 场景 + 投币推镜 */
(function () {
    'use strict';

    var THREE = window.THREE;
    if (!THREE) {
        document.documentElement.classList.add('no-three');
        console.warn('Three.js 未加载，回退 2D 街机厅');
        return;
    }

    var RING_R = 2.2;
    var PROJECTS = [
        { id: 'hpwy', marquee: 'PHANTOM SOUL', neon: 0x22e6ff, neon2: 0x7b5cff, body: 0xd40f2c },
        { id: 'wupo', marquee: 'SPIRIT TALES', neon: 0xffca3a, neon2: 0xff8a1f, body: 0xf2c200 },
        { id: 'finch', marquee: 'FINCH ROOM', neon: 0xff7bd5, neon2: 0xffb86b, body: 0xd81e8c },
        { id: 'robot', marquee: 'ROBOT EXPRESS', neon: 0x7dff8a, neon2: 0x22e6ff, body: 0x18b46a },
        { id: 'universal', marquee: 'RENDER LAB', neon: 0xff4fd8, neon2: 0x5b8cff, body: 0x00a6c8 }
    ];
    PROJECTS.forEach(function (p, i) {
        var a = i * Math.PI * 2 / 5;
        p.angle = a;
        p.x = Math.sin(a) * RING_R;
        p.z = Math.cos(a) * RING_R;
    });

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var screenSources = {};
    Array.prototype.forEach.call(document.querySelectorAll('.cabinet'), function (el) {
        var cv = el.querySelector('canvas.attract');
        if (cv) screenSources[el.dataset.game] = cv;
    });

    /* ---------- 渲染器 ---------- */
    var host = document.createElement('div');
    host.id = 'hall3d';
    host.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(host, document.body.firstChild);

    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x04040c, 1);
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    host.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04040c);
    scene.fog = new THREE.Fog(0x04040c, 28, 100);
    var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 120);

    var raycaster = new THREE.Raycaster();
    var pointer = new THREE.Vector2();

    function colorHex(n) {
        return '#' + ('000000' + n.toString(16)).slice(-6);
    }

    /* ---------- 纹理生成 ---------- */
    var marqueeRecords = [];

    function paintMarquee(record) {
        var cv = record.canvas;
        var c = cv.getContext('2d');
        var w = cv.width, h = cv.height;
        c.clearRect(0, 0, w, h);

        var g = c.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, colorHex(record.neon2));
        g.addColorStop(0.5, '#1a0f38');
        g.addColorStop(1, colorHex(record.neon));
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(0,0,0,.42)';
        c.fillRect(10, 10, w - 20, h - 20);
        c.strokeStyle = colorHex(record.neon);
        c.lineWidth = 6;
        c.strokeRect(6, 6, w - 12, h - 12);

        c.fillStyle = 'rgba(255,255,255,.8)';
        for (var i = 0; i < 32; i++) {
            c.beginPath();
            c.arc(16 + i * 15.4, 13, 2, 0, Math.PI * 2);
            c.fill();
        }

        var size = 44;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        do {
            c.font = 'bold ' + size + 'px "Press Start 2P","Courier New",monospace';
            size -= 2;
        } while (c.measureText(record.text).width > w - 70 && size > 16);
        c.shadowColor = colorHex(record.neon);
        c.shadowBlur = 18;
        c.fillStyle = '#ffffff';
        c.fillText(record.text, w / 2, h / 2 + 4);
        c.shadowBlur = 0;
    }

    function makeMarqueeTexture(text, neon, neon2) {
        var cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 128;
        var record = { canvas: cv, text: text, neon: neon, neon2: neon2 };
        paintMarquee(record);
        marqueeRecords.push(record);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        record.texture = tex;
        return tex;
    }

    function makeFloorTexture() {
        var cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 512;
        var c = cv.getContext('2d');
        c.fillStyle = '#070b18';
        c.fillRect(0, 0, 512, 512);
        c.strokeStyle = 'rgba(34,230,255,.38)';
        c.lineWidth = 3;
        for (var i = 0; i <= 8; i++) {
            var p = i * 64;
            c.beginPath(); c.moveTo(p, 0); c.lineTo(p, 512); c.stroke();
            c.beginPath(); c.moveTo(0, p); c.lineTo(512, p); c.stroke();
        }
        c.strokeStyle = 'rgba(255,79,216,.22)';
        c.lineWidth = 6;
        for (var j = -4; j < 8; j++) {
            c.beginPath();
            c.moveTo(j * 128, 0);
            c.lineTo(j * 128 + 512, 512);
            c.stroke();
        }
        var tex = new THREE.CanvasTexture(cv);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(6, 6);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeBackTexture(p) {
        var cv = document.createElement('canvas');
        cv.width = 320;
        cv.height = 400;
        var c = cv.getContext('2d');
        c.fillStyle = '#0a0d18';
        c.fillRect(0, 0, 320, 400);
        c.strokeStyle = colorHex(p.neon);
        c.lineWidth = 4;
        c.strokeRect(8, 8, 304, 384);

        c.save();
        c.beginPath();
        c.rect(8, 300, 304, 92);
        c.clip();
        for (var i = -8; i < 24; i++) {
            c.fillStyle = i % 2 ? colorHex(p.body) : '#f4f4fa';
            c.beginPath();
            c.moveTo(i * 32, 400);
            c.lineTo(i * 32 + 40, 400);
            c.lineTo(i * 32 + 120, 300);
            c.lineTo(i * 32 + 80, 300);
            c.closePath();
            c.fill();
        }
        c.restore();

        c.beginPath();
        c.arc(160, 160, 78, 0, Math.PI * 2);
        c.fillStyle = '#05070f';
        c.fill();
        c.lineWidth = 8;
        c.strokeStyle = colorHex(p.neon);
        c.shadowColor = colorHex(p.neon);
        c.shadowBlur = 22;
        c.stroke();
        c.shadowBlur = 0;
        c.fillStyle = '#ffffff';
        c.font = 'bold 74px "Press Start 2P","Courier New",monospace';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('E', 160, 166);

        c.fillStyle = 'rgba(255,255,255,.9)';
        c.font = 'bold 18px "Courier New",monospace';
        c.fillText('ELSE ARCADE', 160, 268);

        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeCarpetTexture() {
        var cv = document.createElement('canvas');
        cv.width = 1024;
        cv.height = 1024;
        var c = cv.getContext('2d');
        c.fillStyle = '#071022';
        c.fillRect(0, 0, 1024, 1024);
        var rings = [
            ['#12224a', 480],
            ['#1a2f66', 400],
            ['#12224a', 320],
            ['#1a2f66', 240],
            ['#12224a', 160]
        ];
        rings.forEach(function (r) {
            c.beginPath();
            c.arc(512, 512, r[1], 0, Math.PI * 2);
            c.fillStyle = r[0];
            c.fill();
        });
        c.strokeStyle = 'rgba(34,230,255,.55)';
        c.lineWidth = 4;
        [440, 360, 280, 200].forEach(function (r) {
            c.beginPath();
            c.arc(512, 512, r, 0, Math.PI * 2);
            c.stroke();
        });
        c.strokeStyle = 'rgba(255,203,58,.5)';
        c.lineWidth = 3;
        for (var i = 0; i < 24; i++) {
            var a = i * Math.PI / 12;
            c.beginPath();
            c.moveTo(512 + Math.cos(a) * 150, 512 + Math.sin(a) * 150);
            c.lineTo(512 + Math.cos(a) * 470, 512 + Math.sin(a) * 470);
            c.stroke();
        }
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makePosterTexture(variant) {
        var cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 384;
        var c = cv.getContext('2d');
        var palettes = [
            ['#ff2d55', '#ffca3a', '#22e6ff'],
            ['#22e6ff', '#ff4fd8', '#7dff8a'],
            ['#ffca3a', '#ff5a1f', '#ff4fd8']
        ];
        var pal = palettes[variant % palettes.length];
        c.fillStyle = '#080b16';
        c.fillRect(0, 0, 256, 384);
        c.fillStyle = pal[0];
        c.fillRect(16, 16, 224, 130);
        c.fillStyle = '#060912';
        c.beginPath();
        c.arc(128, 81, 48, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = pal[1];
        c.beginPath();
        c.arc(128, 81, 34, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = pal[2];
        for (var i = 0; i < 3; i++) {
            c.fillRect(16, 166 + i * 26, 224 - i * 44, 12);
        }
        c.fillStyle = '#ffffff';
        c.font = 'bold 30px "Press Start 2P","Courier New",monospace';
        c.textAlign = 'center';
        c.fillText('PLAY', 128, 268);
        c.fillText('NOW', 128, 306);
        c.fillStyle = pal[2];
        c.font = 'bold 16px "Courier New",monospace';
        c.fillText('ELSE ARCADE', 128, 352);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makePanelTexture(p) {
        var cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 192;
        var c = cv.getContext('2d');
        c.fillStyle = '#0b0f1a';
        c.fillRect(0, 0, 512, 192);
        c.fillStyle = colorHex(p.body);
        c.fillRect(0, 0, 512, 58);
        c.fillStyle = '#080b14';
        c.font = 'bold 30px "Press Start 2P","Courier New",monospace';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText('1P', 22, 30);
        c.fillStyle = colorHex(p.neon);
        c.font = 'bold 16px "Courier New",monospace';
        c.fillText('PLAYER ONE', 90, 31);
        c.fillStyle = '#f4f4fa';
        c.font = 'bold 15px "Courier New",monospace';
        c.fillText('MOVE · ACTION · START', 22, 108);
        c.fillStyle = 'rgba(255,255,255,.14)';
        for (var i = 0; i < 6; i++) {
            c.fillRect(22 + i * 70, 128, 48, 8);
        }
        c.strokeStyle = 'rgba(255,255,255,.28)';
        c.lineWidth = 3;
        c.strokeRect(1, 1, 510, 190);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeSideArtTexture(p) {
        var cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 512;
        var c = cv.getContext('2d');
        c.fillStyle = '#0a0e1a';
        c.fillRect(0, 0, 256, 512);
        c.fillStyle = colorHex(p.body);
        c.beginPath();
        c.moveTo(0, 130);
        c.lineTo(256, 40);
        c.lineTo(256, 390);
        c.lineTo(0, 470);
        c.closePath();
        c.fill();
        c.fillStyle = '#f4f4fa';
        for (var i = 0; i < 3; i++) {
            c.save();
            c.translate(24 + i * 8, 250);
            c.rotate(-0.22);
            c.fillRect(0, 0, 180, 14);
            c.restore();
        }
        c.strokeStyle = colorHex(p.neon);
        c.lineWidth = 8;
        c.strokeRect(16, 16, 224, 480);
        c.fillStyle = colorHex(p.neon);
        c.beginPath();
        c.arc(128, 200, 46, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#0a0e1a';
        c.beginPath();
        c.arc(128, 200, 30, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,.9)';
        c.fillRect(40, 420, 176, 10);
        c.fillRect(70, 444, 116, 6);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeGlassTexture() {
        var cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 320;
        var c = cv.getContext('2d');
        c.clearRect(0, 0, 512, 320);
        var g = c.createLinearGradient(0, 0, 512, 320);
        g.addColorStop(0, 'rgba(255,255,255,.26)');
        g.addColorStop(0.22, 'rgba(255,255,255,.03)');
        g.addColorStop(0.5, 'rgba(255,255,255,.16)');
        g.addColorStop(0.58, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,255,255,.08)');
        c.fillStyle = g;
        c.fillRect(0, 0, 512, 320);
        c.fillStyle = 'rgba(255,255,255,.22)';
        c.beginPath();
        c.moveTo(60, 320);
        c.lineTo(190, 0);
        c.lineTo(240, 0);
        c.lineTo(110, 320);
        c.closePath();
        c.fill();
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeCoinSignTexture() {
        var cv = document.createElement('canvas');
        cv.width = 1024;
        cv.height = 256;
        var c = cv.getContext('2d');
        c.clearRect(0, 0, 1024, 256);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = 'bold 88px "Press Start 2P","Courier New",monospace';
        var g = c.createLinearGradient(0, 0, 1024, 0);
        g.addColorStop(0, '#22e6ff');
        g.addColorStop(0.5, '#ff4fd8');
        g.addColorStop(1, '#ffca3a');
        c.shadowColor = '#ff4fd8';
        c.shadowBlur = 34;
        c.fillStyle = g;
        c.fillText('INSERT COIN', 512, 118);
        c.shadowBlur = 8;
        c.fillStyle = 'rgba(255,255,255,.85)';
        c.font = 'bold 26px "Courier New",monospace';
        c.fillText('▼   ▼   ▼', 512, 202);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeSidewalkTexture() {
        var cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 256;
        var c = cv.getContext('2d');
        c.fillStyle = '#3a4150';
        c.fillRect(0, 0, 256, 256);
        c.strokeStyle = '#161a24';
        c.lineWidth = 3;
        for (var i = 0; i <= 4; i++) {
            var p = i * 64;
            c.beginPath(); c.moveTo(p, 0); c.lineTo(p, 256); c.stroke();
            c.beginPath(); c.moveTo(0, p); c.lineTo(256, p); c.stroke();
        }
        c.strokeStyle = 'rgba(255,255,255,.05)';
        c.lineWidth = 1;
        for (var j = 0; j < 6; j++) {
            c.beginPath(); c.moveTo(0, 20 + j * 42); c.lineTo(256, 20 + j * 42); c.stroke();
        }
        var tex = new THREE.CanvasTexture(cv);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(10, 2);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeAsphaltTexture() {
        var cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 512;
        var c = cv.getContext('2d');
        c.fillStyle = '#0a0b10';
        c.fillRect(0, 0, 512, 512);
        for (var i = 0; i < 1400; i++) {
            var g = 20 + Math.random() * 40;
            c.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 8) + ',.35)';
            c.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
        }
        c.strokeStyle = 'rgba(255,255,255,.045)';
        c.lineWidth = 2;
        for (var k = 0; k < 4; k++) {
            c.beginPath();
            c.moveTo(0, 60 + k * 120);
            c.lineTo(512, 60 + k * 120);
            c.stroke();
        }
        var tex = new THREE.CanvasTexture(cv);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(8, 4);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeBuildingTexture(base, seed) {
        var cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 512;
        var c = cv.getContext('2d');
        c.fillStyle = base;
        c.fillRect(0, 0, 256, 512);
        c.fillStyle = 'rgba(0,0,0,.4)';
        c.fillRect(0, 0, 256, 28);
        var s = seed;
        function rnd() {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        }
        for (var row = 0; row < 13; row++) {
            for (var col = 0; col < 6; col++) {
                var lit = rnd() > 0.42;
                var x = 18 + col * 38;
                var y = 44 + row * 33;
                c.fillStyle = lit ? (rnd() > 0.5 ? '#ffd27a' : '#8fe6ff') : 'rgba(255,255,255,.045)';
                c.globalAlpha = lit ? 0.9 : 1;
                c.fillRect(x, y, 24, 15);
            }
        }
        c.globalAlpha = 1;
        c.fillStyle = 'rgba(255,79,216,.22)';
        c.fillRect(0, 470, 256, 42);
        c.fillStyle = 'rgba(255,255,255,.5)';
        c.fillRect(0, 466, 256, 3);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeSkyTexture() {
        var cv = document.createElement('canvas');
        cv.width = 1024;
        cv.height = 384;
        var c = cv.getContext('2d');
        var g = c.createLinearGradient(0, 0, 0, 384);
        g.addColorStop(0, '#03030a');
        g.addColorStop(0.55, '#150f2e');
        g.addColorStop(0.82, '#2c1442');
        g.addColorStop(1, '#4a1f46');
        c.fillStyle = g;
        c.fillRect(0, 0, 1024, 384);
        for (var i = 0; i < 130; i++) {
            c.fillStyle = 'rgba(255,255,255,' + (0.2 + Math.random() * 0.7) + ')';
            c.fillRect(Math.random() * 1024, Math.random() * 260, 2, 2);
        }
        c.fillStyle = 'rgba(255,79,216,.16)';
        c.fillRect(0, 330, 1024, 54);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeCafeSignTexture() {
        var cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 192;
        var c = cv.getContext('2d');
        c.clearRect(0, 0, 512, 192);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.shadowColor = '#ff8a3d';
        c.shadowBlur = 30;
        c.fillStyle = '#ffe2b8';
        c.font = 'bold 96px Georgia,"Times New Roman",serif';
        c.fillText('CAFÉ', 256, 78);
        c.shadowBlur = 8;
        c.fillStyle = '#8fe6ff';
        c.font = 'bold 20px "Courier New",monospace';
        c.fillText('PSYCHOLOGY TALKS', 256, 152);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeCafeWindowTexture() {
        var cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 256;
        var c = cv.getContext('2d');
        var g = c.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, '#2a160d');
        g.addColorStop(0.55, '#6b3a1e');
        g.addColorStop(1, '#d08a4a');
        c.fillStyle = g;
        c.fillRect(0, 0, 512, 256);
        c.fillStyle = 'rgba(255,214,160,.9)';
        for (var i = 0; i < 3; i++) {
            c.beginPath();
            c.arc(110 + i * 146, 72, 16, 0, Math.PI * 2);
            c.fill();
            c.fillRect(108 + i * 146, 16, 4, 56);
        }
        c.fillStyle = 'rgba(30,15,8,.85)';
        c.fillRect(0, 170, 512, 18);
        c.fillRect(30, 120, 8, 60);
        c.fillRect(120, 108, 60, 70);
        c.fillStyle = 'rgba(255,222,180,.75)';
        c.beginPath();
        c.arc(250, 175, 38, 0, Math.PI * 2);
        c.arc(380, 178, 32, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(20,10,6,.9)';
        c.fillRect(242, 176, 16, 40);
        c.fillRect(374, 178, 12, 38);
        c.fillStyle = 'rgba(255,236,200,.28)';
        c.fillRect(0, 0, 512, 14);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    /* ---------- 房间 ---------- */
    var floor = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.52, metalness: 0.42 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    var wallMat = new THREE.MeshStandardMaterial({ color: 0x080c1c, roughness: 0.92 });
    var backWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), wallMat);
    backWall.position.set(0, 7, -13.2);
    scene.add(backWall);

    var sideWall = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), wallMat);
    sideWall.rotation.y = Math.PI / 2;
    sideWall.position.set(-11, 6, -0.7);
    scene.add(sideWall);
    var sideWall2 = sideWall.clone();
    sideWall2.rotation.y = -Math.PI / 2;
    sideWall2.position.x = 11;
    scene.add(sideWall2);

    var ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(22, 26),
        new THREE.MeshStandardMaterial({ color: 0x050810, roughness: 1 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 6.2, -0.7);
    scene.add(ceiling);

    /* 环形地毯与地灯 */
    var carpet = new THREE.Mesh(
        new THREE.CircleGeometry(4.9, 64),
        new THREE.MeshStandardMaterial({ map: makeCarpetTexture(), roughness: 0.95 })
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = 0.006;
    scene.add(carpet);

    [3.35, 4.55].forEach(function (radius, i) {
        var ring = new THREE.Mesh(
            new THREE.TorusGeometry(radius, 0.03, 8, 96),
            new THREE.MeshBasicMaterial({ color: i ? 0xff4fd8 : 0x22e6ff })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        scene.add(ring);
    });

    var core = new THREE.Mesh(
        new THREE.CircleGeometry(0.85, 48),
        new THREE.MeshBasicMaterial({ color: 0x22e6ff, transparent: true, opacity: 0.32 })
    );
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.02;
    scene.add(core);

    /* 天花板灯环与灯泡 */
    var truss = new THREE.Mesh(
        new THREE.TorusGeometry(2.7, 0.055, 10, 80),
        new THREE.MeshBasicMaterial({ color: 0xff4fd8 })
    );
    truss.rotation.x = -Math.PI / 2;
    truss.position.y = 4.95;
    scene.add(truss);

    var bulbGeo = new THREE.SphereGeometry(0.085, 12, 10);
    var bulbColors = [0xff2d55, 0xffca3a, 0x22e6ff, 0x7dff8a, 0xff4fd8];
    for (var b = 0; b < 10; b++) {
        var ba = b * Math.PI / 5;
        var bulb = new THREE.Mesh(
            bulbGeo,
            new THREE.MeshBasicMaterial({ color: bulbColors[b % bulbColors.length] })
        );
        bulb.position.set(Math.sin(ba) * 2.7, 4.88, Math.cos(ba) * 2.7);
        scene.add(bulb);
    }

    /* 墙上海报 */
    [-5.2, 0, 5.2].forEach(function (x, i) {
        var poster = new THREE.Mesh(
            new THREE.PlaneGeometry(1.9, 2.85),
            new THREE.MeshBasicMaterial({ map: makePosterTexture(i) })
        );
        poster.position.set(x, 2.2, -13.16);
        scene.add(poster);
        var frame = new THREE.Mesh(
            new THREE.BoxGeometry(2.02, 2.97, 0.05),
            new THREE.MeshBasicMaterial({ color: 0xf4f4fa })
        );
        frame.position.set(x, 2.2, -13.2);
        scene.add(frame);
    });

    var coinSign = new THREE.Mesh(
        new THREE.PlaneGeometry(6.4, 1.6),
        new THREE.MeshBasicMaterial({ map: makeCoinSignTexture(), transparent: true })
    );
    coinSign.position.set(0, 3.55, -13.13);
    scene.add(coinSign);

    [-7.7, 7.7].forEach(function (x, i) {
        var wallTube = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, 4.2, 0.07),
            new THREE.MeshBasicMaterial({ color: i ? 0xffca3a : 0x22e6ff })
        );
        wallTube.position.set(x, 2.9, -13.14);
        scene.add(wallTube);
    });

    var wallBase = new THREE.Mesh(
        new THREE.BoxGeometry(23, 0.05, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xff4fd8 })
    );
    wallBase.position.set(0, 0.32, -13.18);
    scene.add(wallBase);

    var coinGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.014, 18);
    var coinMat = new THREE.MeshStandardMaterial({
        color: 0xffca3a,
        emissive: new THREE.Color(0x8a5a00),
        emissiveIntensity: 0.6,
        metalness: 0.9,
        roughness: 0.25
    });
    for (var ci = 0; ci < 9; ci++) {
        var coin = new THREE.Mesh(coinGeo, coinMat);
        var ca = ci * 1.9 + 0.6;
        var cr = 3.3 + (ci % 3) * 0.45;
        coin.position.set(Math.sin(ca) * cr, 0.04, Math.cos(ca) * cr);
        coin.rotation.y = ca;
        scene.add(coin);
    }

    var discoLight = new THREE.PointLight(0xdfe8ff, 0.85, 14);
    discoLight.position.set(0, 4.1, 0);
    scene.add(discoLight);

    scene.add(new THREE.AmbientLight(0x9fb4ff, 0.3));
    var keyLight = new THREE.DirectionalLight(0xffffff, 0.38);
    keyLight.position.set(4, 8, 6);
    scene.add(keyLight);
    var redLight = new THREE.PointLight(0xff2d55, 1.2, 18);
    redLight.position.set(-4, 4.2, 3);
    scene.add(redLight);
    var cyanLight = new THREE.PointLight(0x22e6ff, 1.1, 18);
    cyanLight.position.set(4.4, 4.2, 2);
    scene.add(cyanLight);
    var yellowLight = new THREE.PointLight(0xffca3a, 0.9, 18);
    yellowLight.position.set(0, 4.4, -3.6);
    scene.add(yellowLight);

    [-3.4, 3.4].forEach(function (x, i) {
        var spot = new THREE.SpotLight(i ? 0x22e6ff : 0xff4fd8, 1.5, 20, 0.58, 0.7, 1.2);
        spot.position.set(x, 5.8, 3.8);
        spot.target.position.set(0, 1.0, 0);
        scene.add(spot);
        scene.add(spot.target);
    });

    var dustGeo = new THREE.BufferGeometry();
    var dustCount = 280;
    var dustPos = new Float32Array(dustCount * 3);
    for (var d = 0; d < dustCount; d++) {
        dustPos[d * 3] = (Math.random() - 0.5) * 18;
        dustPos[d * 3 + 1] = Math.random() * 5.6 + 0.2;
        dustPos[d * 3 + 2] = (Math.random() - 0.5) * 14 - 1;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    var dust = new THREE.Points(
        dustGeo,
        new THREE.PointsMaterial({ color: 0xbfe4ff, size: 0.022, transparent: true, opacity: 0.5, depthWrite: false })
    );
    scene.add(dust);

    /* ---------- 店面与街道 ---------- */
    var FRONT_Z = 12;
    var frameMat = new THREE.MeshStandardMaterial({ color: 0x0d1220, metalness: 0.65, roughness: 0.32 });
    var metalMat = new THREE.MeshStandardMaterial({ color: 0xd3dae8, metalness: 0.9, roughness: 0.22 });

    var mullions = [-9.6, -6.6, -3.4, -1.05, 1.05, 3.4, 6.6, 9.6];
    mullions.forEach(function (x) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.3, 0.2), frameMat);
        m.position.set(x, 2.35, FRONT_Z);
        scene.add(m);
        addEdges(m, 0xffffff, 0.5);
    });

    var header = new THREE.Mesh(new THREE.BoxGeometry(19.5, 0.4, 0.24), frameMat);
    header.position.set(0, 4.8, FRONT_Z);
    scene.add(header);
    addEdges(header, 0xffffff, 0.5);

    var sill = new THREE.Mesh(new THREE.BoxGeometry(19.5, 0.3, 0.24), frameMat);
    sill.position.set(0, 0.25, FRONT_Z);
    scene.add(sill);
    addEdges(sill, 0xffffff, 0.5);

    var bulkhead = new THREE.Mesh(
        new THREE.BoxGeometry(19.5, 1.4, 0.22),
        new THREE.MeshStandardMaterial({ color: 0x070b14, roughness: 0.85 })
    );
    bulkhead.position.set(0, 5.7, FRONT_Z);
    scene.add(bulkhead);
    addEdges(bulkhead, 0xffffff, 0.4);

    [-10.35, 10.35].forEach(function (x) {
        var fill = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4.4, 0.24), frameMat);
        fill.position.set(x, 2.4, FRONT_Z);
        scene.add(fill);
        addEdges(fill, 0xffffff, 0.4);
    });

    var glassMat = new THREE.MeshBasicMaterial({
        color: 0xa9d8ff,
        transparent: true,
        opacity: 0.09,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    var reflMat = new THREE.MeshBasicMaterial({
        map: makeGlassTexture(),
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    function addPane(a, b, top, bottom) {
        var w = b - a - 0.16;
        var h = top - bottom;
        var cx = (a + b) / 2;
        var cy = (top + bottom) / 2;
        var pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
        pane.position.set(cx, cy, FRONT_Z);
        scene.add(pane);
        var refl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), reflMat);
        refl.position.set(cx, cy, FRONT_Z + 0.014);
        scene.add(refl);
    }

    addPane(-9.6, -6.6, 4.55, 0.42);
    addPane(-6.6, -3.4, 4.55, 0.42);
    addPane(-3.4, -1.05, 4.55, 0.42);
    addPane(1.05, 3.4, 4.55, 0.42);
    addPane(3.4, 6.6, 4.55, 0.42);
    addPane(6.6, 9.6, 4.55, 0.42);
    /* 可开启的双开玻璃门 */
    var doorLeaves = [];
    function buildDoorLeaf(hingeX, innerDir) {
        var leaf = new THREE.Group();
        leaf.position.set(hingeX, 0, FRONT_Z);

        var pane = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 3.06), glassMat);
        pane.position.set(innerDir * 0.525, 1.99, 0);
        leaf.add(pane);
        var refl = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 3.06), reflMat);
        refl.position.set(innerDir * 0.525, 1.99, 0.012);
        leaf.add(refl);

        var innerStile = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.18, 0.12), frameMat);
        innerStile.position.set(innerDir * 1.0, 2.0, 0);
        leaf.add(innerStile);
        var outerStile = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.18, 0.12), frameMat);
        outerStile.position.set(innerDir * 0.03, 2.0, 0);
        leaf.add(outerStile);
        var topRail = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.12), frameMat);
        topRail.position.set(innerDir * 0.525, 3.56, 0);
        leaf.add(topRail);
        var bottomRail = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.12), frameMat);
        bottomRail.position.set(innerDir * 0.525, 0.43, 0);
        leaf.add(bottomRail);

        var pull = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.8, 12), metalMat);
        pull.position.set(innerDir * 0.93, 1.22, -0.13);
        leaf.add(pull);

        scene.add(leaf);
        doorLeaves.push({ group: leaf, open: innerDir * 1.28 });
    }
    buildDoorLeaf(-1.05, 1);
    buildDoorLeaf(1.05, -1);

    var doorHit = new THREE.Mesh(
        new THREE.PlaneGeometry(19.2, 4.2),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    );
    doorHit.position.set(0, 2.35, FRONT_Z + 0.03);
    scene.add(doorHit);

    var doorTop = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.16, 0.22), frameMat);
    doorTop.position.set(0, 3.64, FRONT_Z);
    scene.add(doorTop);
    addEdges(doorTop, 0xffffff, 0.5);

    var frontNeonTop = new THREE.Mesh(
        new THREE.BoxGeometry(19.2, 0.045, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xff4fd8 })
    );
    frontNeonTop.position.set(0, 4.58, FRONT_Z - 0.14);
    scene.add(frontNeonTop);
    var frontNeonBottom = new THREE.Mesh(
        new THREE.BoxGeometry(19.2, 0.045, 0.05),
        new THREE.MeshBasicMaterial({ color: 0x22e6ff })
    );
    frontNeonBottom.position.set(0, 0.4, FRONT_Z - 0.14);
    scene.add(frontNeonBottom);

    var awning = new THREE.Mesh(
        new THREE.BoxGeometry(20.4, 0.16, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x090d18, roughness: 0.7, metalness: 0.3 })
    );
    awning.position.set(0, 4.98, FRONT_Z + 0.72);
    scene.add(awning);
    addEdges(awning, 0xffffff, 0.55);
    var awningGlow = new THREE.Mesh(
        new THREE.BoxGeometry(19.6, 0.04, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xffca3a })
    );
    awningGlow.position.set(0, 4.89, FRONT_Z + 1.5);
    scene.add(awningGlow);

    var doorMat = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.03, 1.35),
        new THREE.MeshStandardMaterial({ color: 0x0a0f1c, roughness: 0.9 })
    );
    doorMat.position.set(0, 0.02, FRONT_Z - 1.15);
    scene.add(doorMat);
    addEdges(doorMat, 0xff4fd8, 0.5);

    /* 人行道与街道 */
    var sidewalkTex = makeSidewalkTexture();
    var sidewalk = new THREE.Mesh(
        new THREE.PlaneGeometry(36, 5.6),
        new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.88 })
    );
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(0, 0.006, 14.9);
    scene.add(sidewalk);

    var curb = new THREE.Mesh(
        new THREE.BoxGeometry(36, 0.16, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.8 })
    );
    curb.position.set(0, 0.08, 17.75);
    scene.add(curb);

    var road = new THREE.Mesh(
        new THREE.PlaneGeometry(56, 17),
        new THREE.MeshStandardMaterial({ map: makeAsphaltTexture(), roughness: 0.95, metalness: 0.05 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.004, 26.6);
    scene.add(road);

    var dashMat = new THREE.MeshBasicMaterial({ color: 0xffca3a });
    for (var dx = -26; dx <= 26; dx += 3.6) {
        var dash = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.012, 0.15), dashMat);
        dash.position.set(dx, 0.02, 26.6);
        scene.add(dash);
    }

    var buildings = [
        { x: -15, w: 9, h: 13, base: '#141a2a', seed: 11 },
        { x: -4.5, w: 8, h: 8.5, base: '#1b1526', seed: 37 },
        { x: 5, w: 10, h: 15, base: '#101a2c', seed: 73 },
        { x: 15.5, w: 8, h: 10.5, base: '#221626', seed: 129 }
    ];
    buildings.forEach(function (b, i) {
        var bm = new THREE.Mesh(
            new THREE.BoxGeometry(b.w, b.h, 4),
            new THREE.MeshStandardMaterial({
                map: makeBuildingTexture(b.base, b.seed),
                emissive: new THREE.Color(0x222a44),
                emissiveIntensity: 0.35,
                roughness: 0.85
            })
        );
        bm.position.set(b.x, b.h / 2, 35.5);
        scene.add(bm);
        var roofNeon = new THREE.Mesh(
            new THREE.BoxGeometry(b.w * 0.8, 0.06, 0.06),
            new THREE.MeshBasicMaterial({ color: i % 2 ? 0x22e6ff : 0xff4fd8 })
        );
        roofNeon.position.set(b.x, b.h + 0.12, 33.55);
        scene.add(roofNeon);
    });

    var sky = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 40),
        new THREE.MeshBasicMaterial({ map: makeSkyTexture(), fog: false })
    );
    sky.position.set(0, 15, 55);
    scene.add(sky);

    [-6.2, 6.2].forEach(function (x) {
        var pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.09, 4.9, 12),
            new THREE.MeshStandardMaterial({ color: 0x2c323e, metalness: 0.7, roughness: 0.35 })
        );
        pole.position.set(x, 2.45, 16.2);
        scene.add(pole);
        var arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.07), pole.material);
        arm.position.set(x + (x > 0 ? -0.5 : 0.5), 4.9, 16.2);
        scene.add(arm);
        var lamp = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 12, 10),
            new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
        );
        lamp.position.set(x + (x > 0 ? -1.0 : 1.0), 4.86, 16.2);
        scene.add(lamp);
        var lampLight = new THREE.PointLight(0xffc07a, 1.25, 16);
        lampLight.position.copy(lamp.position);
        scene.add(lampLight);
    });

    var moonLight = new THREE.DirectionalLight(0x9fc4ff, 0.35);
    moonLight.position.set(-8, 16, 30);
    scene.add(moonLight);

    /* 街对面的咖啡厅 */
    var cafe = new THREE.Group();
    cafe.position.set(-4.5, 0, 33.25);
    var cafeBody = new THREE.Mesh(
        new THREE.BoxGeometry(7.4, 3.4, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x1b1010, roughness: 0.7, metalness: 0.15 })
    );
    cafeBody.position.y = 1.7;
    cafe.add(cafeBody);
    addEdges(cafeBody, 0xf4e6c8, 0.4);

    var cafeWindow = new THREE.Mesh(
        new THREE.PlaneGeometry(5.6, 1.9),
        new THREE.MeshBasicMaterial({ map: makeCafeWindowTexture() })
    );
    cafeWindow.position.set(0, 1.5, 0.14);
    cafe.add(cafeWindow);

    [-2.6, -1.3, 0, 1.3, 2.6].forEach(function (x) {
        var mullion = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 2.02, 0.08),
            new THREE.MeshStandardMaterial({ color: 0x2a1a12, metalness: 0.5, roughness: 0.4 })
        );
        mullion.position.set(x, 1.5, 0.17);
        cafe.add(mullion);
    });
    var cafeSill = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 0.14, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.6 })
    );
    cafeSill.position.set(0, 0.5, 0.18);
    cafe.add(cafeSill);

    var cafeSign = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 1.2),
        new THREE.MeshBasicMaterial({ map: makeCafeSignTexture(), transparent: true })
    );
    cafeSign.position.set(0, 3.0, 0.16);
    cafe.add(cafeSign);

    var cafeAwning = new THREE.Mesh(
        new THREE.BoxGeometry(7.8, 0.16, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x3a1f14, roughness: 0.7 })
    );
    cafeAwning.position.set(0, 2.72, 0.62);
    cafe.add(cafeAwning);
    addEdges(cafeAwning, 0xf4e6c8, 0.5);

    for (var aw = 0; aw < 8; aw++) {
        var stripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.62, 0.02, 1.14),
            new THREE.MeshBasicMaterial({ color: aw % 2 ? 0xf4e6c8 : 0xc4562e })
        );
        stripe.position.set(-3.05 + aw * 0.87, 2.81, 0.62);
        cafe.add(stripe);
    }

    var cafeLight = new THREE.PointLight(0xffb56b, 1.6, 14);
    cafeLight.position.set(0, 2.4, 1.6);
    cafe.add(cafeLight);
    scene.add(cafe);

    [-7.2, 7.2].forEach(function (x) {
        var sconce = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.5, 0.12),
            new THREE.MeshBasicMaterial({ color: 0xffc07a })
        );
        sconce.position.set(x, 3.1, FRONT_Z - 0.16);
        scene.add(sconce);
    });
    var entryLight = new THREE.PointLight(0xffc07a, 1.2, 12);
    entryLight.position.set(0, 3.6, FRONT_Z + 0.9);
    scene.add(entryLight);

    /* ---------- 机柜 ---------- */
    var groups = [];
    var screenTextures = [];

    function addEdges(mesh, color, opacity) {
        var lines = new THREE.LineSegments(
            new THREE.EdgesGeometry(mesh.geometry),
            new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity })
        );
        lines.position.copy(mesh.position);
        lines.rotation.copy(mesh.rotation);
        lines.scale.copy(mesh.scale);
        mesh.parent.add(lines);
        return lines;
    }

    function buildCabinet(p) {
        var g = new THREE.Group();
        g.position.set(p.x, 0, p.z);
        g.rotation.y = p.angle;
        g.userData.gameId = p.id;

        var bodyMat = new THREE.MeshStandardMaterial({
            color: p.body,
            emissive: new THREE.Color(p.body),
            emissiveIntensity: 0.5,
            roughness: 0.5,
            metalness: 0.15
        });
        var body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.9), bodyMat);
        body.position.y = 1.15;
        g.add(body);
        addEdges(body, 0xffffff, 0.9);

        var sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.body).multiplyScalar(0.82), roughness: 0.5, metalness: 0.3 });
        var sideArtTex = makeSideArtTexture(p);
        [-0.812, 0.812].forEach(function (sx) {
            var side = new THREE.Mesh(new THREE.BoxGeometry(0.024, 1.7, 0.8), sideMat);
            side.position.set(sx, 1.22, 0.02);
            g.add(side);
            addEdges(side, 0xffffff, 0.65);
            var art = new THREE.Mesh(
                new THREE.PlaneGeometry(0.72, 1.56),
                new THREE.MeshBasicMaterial({ map: sideArtTex })
            );
            art.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
            art.position.set(sx + (sx > 0 ? 0.016 : -0.016), 1.22, 0.02);
            g.add(art);
            var accent = new THREE.Mesh(
                new THREE.BoxGeometry(0.03, 1.1, 0.14),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            accent.position.set(sx, 1.4, 0.12);
            g.add(accent);
        });

        var base = new THREE.Mesh(
            new THREE.BoxGeometry(1.76, 0.12, 1.06),
            new THREE.MeshStandardMaterial({ color: 0x0c1020, roughness: 0.7 })
        );
        base.position.y = 0.06;
        g.add(base);
        addEdges(base, 0xffffff, 0.45);

        var marqueeFrame = new THREE.Mesh(
            new THREE.BoxGeometry(1.54, 0.46, 0.08),
            new THREE.MeshStandardMaterial({ color: 0xf4f4fa, roughness: 0.45, metalness: 0.15 })
        );
        marqueeFrame.position.set(0, 2.03, 0.41);
        g.add(marqueeFrame);
        addEdges(marqueeFrame, 0xffffff, 0.8);

        var marquee = new THREE.Mesh(
            new THREE.PlaneGeometry(1.4, 0.36),
            new THREE.MeshBasicMaterial({ map: makeMarqueeTexture(p.marquee, p.neon, p.neon2) })
        );
        marquee.position.set(0, 2.03, 0.456);
        g.add(marquee);
        addEdges(marquee, 0xffffff, 0.9);

        var canopy = new THREE.Mesh(
            new THREE.BoxGeometry(1.72, 0.16, 1.0),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color(p.body).multiplyScalar(0.55),
                roughness: 0.4,
                metalness: 0.35
            })
        );
        canopy.position.set(0, 2.33, 0.03);
        g.add(canopy);
        addEdges(canopy, 0xffffff, 0.9);
        var canopyGlow = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.035, 0.035),
            new THREE.MeshBasicMaterial({ color: p.neon })
        );
        canopyGlow.position.set(0, 2.24, 0.54);
        g.add(canopyGlow);

        for (var cb = 0; cb < 7; cb++) {
            var bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.026, 8, 6),
                new THREE.MeshBasicMaterial({ color: cb % 2 ? 0xffca3a : 0xffffff })
            );
            bulb.position.set(-0.66 + cb * 0.22, 2.42, 0.5);
            g.add(bulb);
        }

        [-0.79, 0.79].forEach(function (sx) {
            var trim = new THREE.Mesh(
                new THREE.BoxGeometry(0.035, 2.18, 0.035),
                new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            trim.position.set(sx, 1.15, 0.462);
            g.add(trim);
        });

        var bezel = new THREE.Mesh(
            new THREE.BoxGeometry(1.34, 0.96, 0.2),
            new THREE.MeshStandardMaterial({ color: 0x05030e, roughness: 0.5, metalness: 0.2 })
        );
        bezel.position.set(0, 1.52, 0.39);
        g.add(bezel);
        addEdges(bezel, 0xffffff, 0.85);

        var screwMat = new THREE.MeshStandardMaterial({ color: 0xe8ecf8, metalness: 0.9, roughness: 0.2 });
        [[-0.61, 1.96], [0.61, 1.96], [-0.61, 1.08], [0.61, 1.08]].forEach(function (pos) {
            var screw = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.022, 10), screwMat);
            screw.rotation.x = Math.PI / 2;
            screw.position.set(pos[0], pos[1], 0.489);
            g.add(screw);
        });

        var source = screenSources[p.id];
        if (source) {
            var tex = new THREE.CanvasTexture(source);
            if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
            screenTextures.push({ tex: tex });
            var screen = new THREE.Mesh(
                new THREE.PlaneGeometry(1.16, 0.74),
                new THREE.MeshBasicMaterial({ map: tex })
            );
            screen.position.set(0, 1.52, 0.492);
            g.add(screen);

            var glass = new THREE.Mesh(
                new THREE.PlaneGeometry(1.16, 0.74),
                new THREE.MeshBasicMaterial({
                    map: makeGlassTexture(),
                    transparent: true,
                    opacity: 0.5,
                    depthWrite: false
                })
            );
            glass.position.set(0, 1.52, 0.498);
            g.add(glass);
        }

        var deck = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 0.2, 0.62),
            new THREE.MeshStandardMaterial({ color: new THREE.Color(p.body).multiplyScalar(0.42), roughness: 0.5, metalness: 0.35 })
        );
        deck.position.set(0, 0.78, 0.68);
        g.add(deck);
        addEdges(deck, 0xffffff, 0.85);

        var stripMat = new THREE.MeshBasicMaterial({ color: p.neon });
        var stripL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.75, 0.05), stripMat);
        stripL.position.set(-0.795, 1.3, 0.41);
        g.add(stripL);
        var stripR = stripL.clone();
        stripR.position.x = 0.795;
        g.add(stripR);

        var joy = new THREE.Group();
        joy.position.set(-0.48, 0.9, 0.78);
        var joyBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.13, 0.05, 18),
            new THREE.MeshStandardMaterial({ color: 0x0b0620, roughness: 0.5 })
        );
        joyBase.position.y = 0.02;
        joy.add(joyBase);
        var stick = new THREE.Mesh(
            new THREE.CylinderGeometry(0.028, 0.032, 0.2, 12),
            new THREE.MeshStandardMaterial({ color: 0xd8d8e8, metalness: 0.85, roughness: 0.25 })
        );
        stick.position.y = 0.12;
        stick.rotation.z = 0.12;
        joy.add(stick);
        var ball = new THREE.Mesh(
            new THREE.SphereGeometry(0.078, 20, 16),
            new THREE.MeshBasicMaterial({ color: 0xd90f24 })
        );
        ball.position.set(-0.026, 0.24, 0);
        joy.add(ball);
        g.add(joy);

        [0xff3d5e, 0xffca3a, 0x5b8cff].forEach(function (col, i) {
            var btn = new THREE.Mesh(
                new THREE.CylinderGeometry(0.055, 0.055, 0.03, 18),
                new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(col), emissiveIntensity: 0.6, roughness: 0.35 })
            );
            btn.rotation.x = Math.PI / 2;
            btn.position.set(0.18 + i * 0.17, 0.9, 0.82);
            g.add(btn);
        });

        var startBtn = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.035, 16),
            new THREE.MeshStandardMaterial({ color: 0xf6f6ff, emissive: new THREE.Color(0xf6f6ff), emissiveIntensity: 0.45, roughness: 0.3 })
        );
        startBtn.rotation.x = Math.PI / 2;
        startBtn.position.set(0.66, 0.9, 0.78);
        g.add(startBtn);

        var panel = new THREE.Mesh(
            new THREE.PlaneGeometry(1.34, 0.5),
            new THREE.MeshBasicMaterial({ map: makePanelTexture(p) })
        );
        panel.rotation.x = -Math.PI / 2;
        panel.position.set(0, 0.884, 0.7);
        g.add(panel);

        var slot = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.1, 0.03),
            new THREE.MeshStandardMaterial({ color: 0x080410, emissive: new THREE.Color(0xffca3a), emissiveIntensity: 0.5, roughness: 0.4 })
        );
        slot.position.set(0, 0.58, 0.46);
        g.add(slot);
        addEdges(slot, 0xffffff, 0.8);

        var lowerPanel = new THREE.Mesh(
            new THREE.BoxGeometry(1.32, 0.72, 0.06),
            new THREE.MeshStandardMaterial({ color: 0x0b0f1a, roughness: 0.6, metalness: 0.15 })
        );
        lowerPanel.position.set(0, 0.44, 0.43);
        g.add(lowerPanel);
        addEdges(lowerPanel, 0xffffff, 0.35);

        var coinDoor = new THREE.Mesh(
            new THREE.BoxGeometry(0.66, 0.44, 0.04),
            new THREE.MeshStandardMaterial({ color: 0xd9d9e6, metalness: 0.75, roughness: 0.3 })
        );
        coinDoor.position.set(0, 0.4, 0.455);
        g.add(coinDoor);
        addEdges(coinDoor, 0xffffff, 0.65);

        var slotGlowMat = new THREE.MeshStandardMaterial({ color: 0x080410, emissive: new THREE.Color(0xffca3a), emissiveIntensity: 0.75, roughness: 0.4 });
        [-0.17, 0.17].forEach(function (sx) {
            var coinSlot = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.02), slotGlowMat);
            coinSlot.position.set(sx, 0.42, 0.478);
            g.add(coinSlot);
        });
        var keyhole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.02, 14),
            new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.7, roughness: 0.4 })
        );
        keyhole.rotation.x = Math.PI / 2;
        keyhole.position.set(0, 0.28, 0.478);
        g.add(keyhole);

        var underGlow = new THREE.Mesh(
            new THREE.BoxGeometry(1.44, 0.035, 0.025),
            new THREE.MeshBasicMaterial({ color: p.neon })
        );
        underGlow.position.set(0, 0.14, 0.55);
        g.add(underGlow);

        var backPanel = new THREE.Mesh(
            new THREE.PlaneGeometry(1.34, 1.72),
            new THREE.MeshStandardMaterial({ map: makeBackTexture(p), roughness: 0.6, metalness: 0.1 })
        );
        backPanel.position.set(0, 1.3, -0.458);
        backPanel.rotation.y = Math.PI;
        g.add(backPanel);
        addEdges(backPanel, 0xffffff, 0.6);

        var floorGlow = new THREE.Mesh(
            new THREE.CircleGeometry(0.95, 36),
            new THREE.MeshBasicMaterial({ color: p.neon, transparent: true, opacity: 0.18 })
        );
        floorGlow.rotation.x = -Math.PI / 2;
        floorGlow.position.y = 0.012;
        g.add(floorGlow);

        var stool = new THREE.Group();
        stool.position.set(0, 0, 1.58);
        var seat = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.24, 0.08, 20),
            new THREE.MeshStandardMaterial({ color: p.body, roughness: 0.45, metalness: 0.2 })
        );
        seat.position.y = 0.62;
        stool.add(seat);
        addEdges(seat, 0xffffff, 0.5);
        var leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, 0.56, 12),
            new THREE.MeshStandardMaterial({ color: 0xdfe3f0, metalness: 0.85, roughness: 0.25 })
        );
        leg.position.y = 0.32;
        stool.add(leg);
        var foot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.22, 0.05, 20),
            new THREE.MeshStandardMaterial({ color: 0x111726, metalness: 0.6, roughness: 0.4 })
        );
        foot.position.y = 0.03;
        stool.add(foot);
        addEdges(foot, 0xffffff, 0.35);
        g.add(stool);

        var glow = new THREE.PointLight(p.neon, 1.2, 3.8);
        glow.position.set(0, 1.6, 0.9);
        g.add(glow);
        g.userData.glow = glow;

        scene.add(g);
        groups.push(g);
    }

    PROJECTS.forEach(buildCabinet);

    /* ---------- 抓娃娃机 & 扭蛋机 ---------- */
    var machineGroups = [];
    var clawAnim = null;
    var gachaAnim = null;

    function makeMachineSign(text, accent) {
        var cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 128;
        var c = cv.getContext('2d');
        c.fillStyle = '#0a0814';
        c.fillRect(0, 0, 512, 128);
        c.strokeStyle = '#ffffff';
        c.lineWidth = 8;
        c.strokeRect(6, 6, 500, 116);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.shadowColor = accent;
        c.shadowBlur = 22;
        c.fillStyle = '#ffffff';
        c.font = 'bold 52px "Courier New",monospace';
        c.fillText(text, 256, 68);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    var machineWhite = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4, metalness: 0.25 });
    var glassMatM = new THREE.MeshPhongMaterial({
        color: 0xbfefff,
        transparent: true,
        opacity: 0.16,
        shininess: 90,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    /* 抓娃娃机 */
    var clawMachine = new THREE.Group();
    clawMachine.position.set(-10.15, 0, 0.8);
    clawMachine.rotation.y = Math.PI / 2;
    clawMachine.userData.machineType = 'claw';

    var clawBodyMat = new THREE.MeshStandardMaterial({
        color: 0xff2f8e,
        emissive: 0x7a0038,
        emissiveIntensity: 0.45,
        roughness: 0.42,
        metalness: 0.2
    });
    var clawBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.0), clawBodyMat);
    clawBase.position.y = 0.45;
    clawMachine.add(clawBase);
    addEdges(clawBase, 0xffffff, 0.95);

    var clawTop = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.18, 1.1), machineWhite);
    clawTop.position.y = 2.02;
    clawMachine.add(clawTop);
    addEdges(clawTop, 0xffffff, 0.9);

    var clawDeck = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.12, 1.02), machineWhite);
    clawDeck.position.y = 0.9;
    clawMachine.add(clawDeck);

    var clawGlass = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.02, 0.92), glassMatM);
    clawGlass.position.y = 1.47;
    clawMachine.add(clawGlass);
    var clawGlassEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.02, 0.92)),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    clawGlassEdges.position.copy(clawGlass.position);
    clawMachine.add(clawGlassEdges);

    var clawBack = new THREE.Mesh(
        new THREE.PlaneGeometry(1.16, 0.98),
        new THREE.MeshStandardMaterial({ color: 0x140a1e, roughness: 0.9 })
    );
    clawBack.position.set(0, 1.47, -0.45);
    clawMachine.add(clawBack);

    var clawSign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 0.28),
        new THREE.MeshBasicMaterial({ map: makeMachineSign('CLAW MACHINE', '#ff4fd8'), transparent: true })
    );
    clawSign.position.set(0, 2.02, 0.556);
    clawMachine.add(clawSign);

    var plushColors = [0xff4fd8, 0x22e6ff, 0xffca3a, 0x7dff8a, 0xff8a3d, 0xb28cff];
    for (var pl = 0; pl < 12; pl++) {
        var plush = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 10, 8),
            new THREE.MeshStandardMaterial({
                color: plushColors[pl % plushColors.length],
                roughness: 0.75,
                emissive: plushColors[pl % plushColors.length],
                emissiveIntensity: 0.18
            })
        );
        plush.position.set(
            (Math.random() - 0.5) * 0.8,
            1.0 + Math.random() * 0.05,
            (Math.random() - 0.5) * 0.5
        );
        plush.scale.y = 0.8;
        clawMachine.add(plush);
    }

    var clawChute = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.2),
        new THREE.MeshBasicMaterial({ color: 0x05030a })
    );
    clawChute.position.set(0.3, 0.52, 0.503);
    clawMachine.add(clawChute);
    var chuteRim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.02), machineWhite);
    chuteRim.position.set(0.3, 0.52, 0.49);
    clawMachine.add(chuteRim);

    var clawPanel = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.26), machineWhite);
    clawPanel.position.set(-0.28, 0.95, 0.58);
    clawPanel.rotation.x = -0.38;
    clawMachine.add(clawPanel);
    var clawStick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7, roughness: 0.3 })
    );
    clawStick.position.set(-0.4, 1.08, 0.6);
    clawStick.rotation.z = 0.25;
    clawMachine.add(clawStick);
    var clawBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0x8a0000, emissiveIntensity: 0.6, roughness: 0.3 })
    );
    clawBall.position.set(-0.43, 1.18, 0.6);
    clawMachine.add(clawBall);
    var clawButton = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14),
        new THREE.MeshStandardMaterial({ color: 0xffca3a, emissive: 0x6a4a00, emissiveIntensity: 0.5 })
    );
    clawButton.position.set(-0.1, 1.02, 0.62);
    clawMachine.add(clawButton);

    var clawRail = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.06, 0.08), machineWhite);
    clawRail.position.set(0, 1.92, 0);
    clawMachine.add(clawRail);
    var clawCarriage = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.16), clawBodyMat);
    clawCarriage.position.set(0, 1.86, 0);
    clawMachine.add(clawCarriage);
    var clawCable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6),
        new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.8, roughness: 0.3 })
    );
    clawCable.position.set(0, 1.55, 0);
    clawMachine.add(clawCable);

    var clawHead = new THREE.Group();
    clawHead.position.set(0, 1.3, 0);
    var clawHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.07, 0.1, 12),
        new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.85, roughness: 0.25 })
    );
    clawHead.add(clawHub);
    var clawProngs = new THREE.Group();
    for (var cp = 0; cp < 3; cp++) {
        var prong = new THREE.Mesh(
            new THREE.BoxGeometry(0.035, 0.24, 0.035),
            new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.85, roughness: 0.25 })
        );
        var pa = (cp / 3) * Math.PI * 2;
        prong.position.set(Math.cos(pa) * 0.09, -0.14, Math.sin(pa) * 0.09);
        prong.rotation.z = Math.cos(pa) * 0.4;
        prong.rotation.x = -Math.sin(pa) * 0.4;
        clawProngs.add(prong);
    }
    clawHead.add(clawProngs);
    var clawPrize = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xffca3a, emissive: 0x6a4a00, emissiveIntensity: 0.45, roughness: 0.6 })
    );
    clawPrize.position.set(0, -0.3, 0);
    clawPrize.visible = false;
    clawHead.add(clawPrize);
    clawMachine.add(clawHead);

    var clawLight = new THREE.PointLight(0xff4fd8, 1.5, 5);
    clawLight.position.set(0, 1.6, 1.1);
    clawMachine.add(clawLight);
    scene.add(clawMachine);
    machineGroups.push(clawMachine);

    /* 扭蛋机 */
    var gachaMachine = new THREE.Group();
    gachaMachine.position.set(10.15, 0, 0.8);
    gachaMachine.rotation.y = -Math.PI / 2;
    gachaMachine.userData.machineType = 'gacha';

    var gachaBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.05, 0.8),
        new THREE.MeshStandardMaterial({
            color: 0xffb703,
            emissive: 0x6a4200,
            emissiveIntensity: 0.35,
            roughness: 0.4,
            metalness: 0.25
        })
    );
    gachaBody.position.y = 0.53;
    gachaMachine.add(gachaBody);
    addEdges(gachaBody, 0xffffff, 0.95);

    var gachaTrim = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.12, 0.86), machineWhite);
    gachaTrim.position.y = 1.08;
    gachaMachine.add(gachaTrim);

    var gachaDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 22, 16),
        new THREE.MeshPhongMaterial({
            color: 0xbfefff,
            transparent: true,
            opacity: 0.22,
            shininess: 100,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    gachaDome.position.y = 1.43;
    gachaDome.scale.y = 1.1;
    gachaMachine.add(gachaDome);

    var capsuleColors = [0xff4fd8, 0x22e6ff, 0xffca3a, 0x7dff8a, 0xff8a3d, 0xb28cff, 0xffffff];
    var gachaCapsuleGroup = new THREE.Group();
    gachaCapsuleGroup.position.y = 1.43;
    gachaMachine.add(gachaCapsuleGroup);
    for (var gc = 0; gc < 14; gc++) {
        var capsule = new THREE.Mesh(
            new THREE.SphereGeometry(0.075, 10, 8),
            new THREE.MeshStandardMaterial({
                color: capsuleColors[gc % capsuleColors.length],
                roughness: 0.35,
                emissive: capsuleColors[gc % capsuleColors.length],
                emissiveIntensity: 0.16
            })
        );
        var ga = Math.random() * Math.PI * 2;
        var gr = Math.random() * 0.28;
        capsule.position.set(Math.cos(ga) * gr, -0.21 + Math.random() * 0.3, Math.sin(ga) * gr);
        gachaCapsuleGroup.add(capsule);
    }

    var gachaCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.24, 0.14, 18),
        machineWhite
    );
    gachaCap.position.y = 1.88;
    gachaMachine.add(gachaCap);

    var gachaSign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.72, 0.18),
        new THREE.MeshBasicMaterial({ map: makeMachineSign('CAPSULE', '#22e6ff'), transparent: true })
    );
    gachaSign.position.set(0, 0.88, 0.406);
    gachaMachine.add(gachaSign);

    var gachaTray = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.2, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x1a1018, roughness: 0.7 })
    );
    gachaTray.position.set(0, 0.36, 0.38);
    gachaMachine.add(gachaTray);
    var trayLip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.28), machineWhite);
    trayLip.position.set(0, 0.27, 0.39);
    gachaMachine.add(trayLip);

    var crankGroup = new THREE.Group();
    crankGroup.position.set(0.26, 0.76, 0.42);
    var crankDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.05, 18),
        new THREE.MeshStandardMaterial({ color: 0x222630, metalness: 0.7, roughness: 0.3 })
    );
    crankDisc.rotation.x = Math.PI / 2;
    crankGroup.add(crankDisc);
    var crankKnob = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.14, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xff2020, roughness: 0.4 })
    );
    crankKnob.position.set(0, 0.1, 0.05);
    crankGroup.add(crankKnob);
    gachaMachine.add(crankGroup);

    var gachaSlot = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.03, 0.03),
        new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    gachaSlot.position.set(-0.22, 0.82, 0.42);
    gachaMachine.add(gachaSlot);

    var gachaLight = new THREE.PointLight(0x22e6ff, 1.4, 5);
    gachaLight.position.set(0, 1.5, 1.0);
    gachaMachine.add(gachaLight);

    var gachaCapsule = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xffca3a, emissive: 0x6a4a00, emissiveIntensity: 0.4, roughness: 0.35 })
    );
    gachaCapsule.visible = false;
    gachaMachine.add(gachaCapsule);

    /* 机台循环展示屏 */
    var attractScreens = [];
    function createAttractScreen() {
        var cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 192;
        var c = cv.getContext('2d');
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        var mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.5, 0.19),
            new THREE.MeshBasicMaterial({ map: tex })
        );
        var s = { ctx: c, tex: tex, mesh: mesh, index: 0, last: -9999 };
        attractScreens.push(s);
        return s;
    }

    function paintAttractScreen(s, index) {
        var c = s.ctx;
        var accent = '#' + ('000000' + (PROJECTS[index].neon & 0xffffff).toString(16)).slice(-6);
        c.fillStyle = '#070510';
        c.fillRect(0, 0, 512, 192);
        c.strokeStyle = accent;
        c.lineWidth = 6;
        c.strokeRect(8, 8, 496, 176);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#ffffff';
        c.font = 'bold 30px "Courier New",monospace';
        c.fillText('1 PLAY · 1 PRIZE', 256, 52);
        c.fillStyle = accent;
        c.font = 'bold 33px "Courier New",monospace';
        var name = PROJECTS[index].marquee;
        if (name.length > 17) name = name.slice(0, 17);
        c.fillText(name, 256, 110);
        c.fillStyle = '#9c93c7';
        c.font = '20px "Courier New",monospace';
        c.fillText('INSERT COIN TO DRAW', 256, 158);
        s.tex.needsUpdate = true;
    }

    var clawScreen = createAttractScreen();
    clawScreen.mesh.position.set(-0.3, 0.62, 0.503);
    clawMachine.add(clawScreen.mesh);
    paintAttractScreen(clawScreen, 0);

    var gachaScreen = createAttractScreen();
    gachaScreen.mesh.position.set(0, 0.6, 0.406);
    gachaMachine.add(gachaScreen.mesh);
    paintAttractScreen(gachaScreen, 1);

    scene.add(gachaMachine);
    machineGroups.push(gachaMachine);

    function startClawDraw() {
        clawAnim = {
            start: performance.now(),
            duration: 2300,
            carriage: clawCarriage,
            head: clawHead,
            cable: clawCable,
            prongs: clawProngs,
            prize: clawPrize
        };
        clawPrize.visible = false;
        clawProngs.scale.set(1, 1, 1);
    }

    function updateClaw(now) {
        if (!clawAnim) return;
        var t = (now - clawAnim.start) / 1000;
        var move = Math.min(1, Math.max(0, t / 0.5));
        var x = 0.3 * move;
        clawAnim.carriage.position.x = x;
        clawAnim.head.position.x = x;

        var y = 1.3;
        if (t > 0.5 && t < 1.0) y = 1.3 - 0.32 * ((t - 0.5) / 0.5);
        else if (t >= 1.0 && t < 1.5) y = 0.98;
        else if (t >= 1.5) y = 0.98 + 0.32 * Math.min(1, (t - 1.5) / 0.5);
        clawAnim.head.position.y = y;

        var len = Math.max(0.08, 1.86 - y);
        clawAnim.cable.scale.y = len / 0.5;
        clawAnim.cable.position.y = y + len / 2;

        if (t >= 1.05 && t < 1.45) {
            clawAnim.prongs.scale.set(0.62, 1, 0.62);
        } else if (t >= 1.45) {
            clawAnim.prongs.scale.set(1, 1, 1);
        }
        clawAnim.prize.visible = t >= 1.15 && t < 2.05;
    }

    function startGachaDraw() {
        gachaAnim = {
            start: performance.now(),
            wheel: crankGroup,
            capsule: gachaCapsule
        };
        gachaCapsule.visible = true;
        gachaCapsule.position.set(0, 1.2, 0.05);
    }

    function updateGacha(now) {
        if (!gachaAnim) return;
        var t = (now - gachaAnim.start) / 1000;
        gachaAnim.wheel.rotation.z = Math.min(Math.PI * 2.2, t * 9);
        if (t > 0.55 && t < 1.35) {
            var k = (t - 0.55) / 0.8;
            gachaAnim.capsule.position.set(0.05 * k, 1.2 - 0.82 * k, 0.05 + 0.33 * k);
        }
        if (t >= 1.5) gachaAnim.capsule.visible = false;
    }

    function resetMachineAnim() {
        clawAnim = null;
        gachaAnim = null;
        clawPrize.visible = false;
        clawProngs.scale.set(1, 1, 1);
        clawCarriage.position.x = 0;
        clawHead.position.set(0, 1.3, 0);
        clawCable.scale.y = 1;
        clawCable.position.y = 1.55;
        crankGroup.rotation.z = 0;
        gachaCapsule.visible = false;
    }

    function startMachineDraw(type, ev) {
        if (busy || seated || clawAnim || gachaAnim) return;
        busy = true;
        if (window.Arcade && window.Arcade.coinSound) window.Arcade.coinSound();
        dropCoin(ev.clientX, ev.clientY);

        var pick = PROJECTS[Math.floor(Math.random() * PROJECTS.length)];
        if (type === 'claw') startClawDraw();
        else startGachaDraw();

        setTimeout(function () {
            resetMachineAnim();
            busy = false;
            document.dispatchEvent(new CustomEvent('arcade:prize', {
                detail: {
                    id: pick.id,
                    marquee: pick.marquee,
                    neon: pick.neon,
                    source: type
                }
            }));
        }, type === 'claw' ? 2350 : 1750);
    }

    function pickMachine(x, y) {
        pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        var hits = raycaster.intersectObjects(machineGroups, true);
        for (var i = 0; i < hits.length; i++) {
            var o = hits[i].object;
            while (o && !o.userData.machineType) o = o.parent;
            if (o) return o.userData.machineType;
        }
        return null;
    }

    var hoveredMachine = null;
    function setMachineHover(type) {
        if (hoveredMachine === type) return;
        hoveredMachine = type;
        machineGroups.forEach(function (g) {
            g.scale.setScalar(g.userData.machineType === type ? 1.035 : 1);
        });
    }

    function pickInteractive(x, y) {
        pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        var hits = raycaster.intersectObjects(groups.concat(machineGroups), true);
        for (var i = 0; i < hits.length; i++) {
            var o = hits[i].object;
            while (o && !o.userData.gameId && !o.userData.machineType) o = o.parent;
            if (o && o.userData.gameId) return { kind: 'game', id: o.userData.gameId };
            if (o && o.userData.machineType) return { kind: 'machine', id: o.userData.machineType };
        }
        return null;
    }


    /* 背景装饰机柜，增加纵深 */
    function makeDistantScreenTexture(neon) {
        var cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 160;
        var c = cv.getContext('2d');
        var g = c.createLinearGradient(0, 0, 256, 160);
        g.addColorStop(0, '#080a16');
        g.addColorStop(0.55, colorHex(neon));
        g.addColorStop(1, '#05060e');
        c.fillStyle = g;
        c.fillRect(0, 0, 256, 160);
        c.fillStyle = 'rgba(5,6,14,.7)';
        for (var i = 0; i < 6; i++) {
            c.fillRect(0, 100 + i * 9, 256, 4);
        }
        c.strokeStyle = 'rgba(255,255,255,.75)';
        c.lineWidth = 3;
        c.strokeRect(8, 8, 240, 144);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    [-8.4, 8.4].forEach(function (x, i) {
        var bg = new THREE.Group();
        bg.position.set(x, 0, -9.2);
        var body = new THREE.Mesh(
            new THREE.BoxGeometry(1.9, 2.35, 1.0),
            new THREE.MeshStandardMaterial({
                color: i ? 0x1a1208 : 0x081420,
                emissive: new THREE.Color(i ? 0xffca3a : 0x22e6ff),
                emissiveIntensity: 0.08,
                roughness: 0.55,
                metalness: 0.2
            })
        );
        body.position.y = 1.18;
        bg.add(body);
        addEdges(body, 0xffffff, 0.28);

        var deck = new THREE.Mesh(
            new THREE.BoxGeometry(1.9, 0.18, 0.52),
            new THREE.MeshStandardMaterial({ color: 0x0b0f1a, roughness: 0.55, metalness: 0.3 })
        );
        deck.position.set(0, 0.88, 0.62);
        bg.add(deck);
        addEdges(deck, 0xffffff, 0.32);

        [-0.92, 0.92].forEach(function (sx) {
            var neonStrip = new THREE.Mesh(
                new THREE.BoxGeometry(0.035, 1.5, 0.04),
                new THREE.MeshBasicMaterial({ color: i ? 0xff4fd8 : 0x22e6ff })
            );
            neonStrip.position.set(sx, 1.35, 0.32);
            bg.add(neonStrip);
        });

        var mq = new THREE.Mesh(
            new THREE.PlaneGeometry(1.58, 0.4),
            new THREE.MeshBasicMaterial({
                map: makeMarqueeTexture(i ? 'PRIZE' : 'RETRO', i ? 0xffca3a : 0x22e6ff, i ? 0xff4fd8 : 0x5b8cff)
            })
        );
        mq.position.set(0, 2.08, 0.51);
        bg.add(mq);

        var bezel = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.86, 0.06),
            new THREE.MeshStandardMaterial({ color: 0x05060e, roughness: 0.5 })
        );
        bezel.position.set(0, 1.42, 0.5);
        bg.add(bezel);

        var scr = new THREE.Mesh(
            new THREE.PlaneGeometry(1.3, 0.64),
            new THREE.MeshBasicMaterial({ map: makeDistantScreenTexture(i ? 0xffca3a : 0x22e6ff) })
        );
        scr.position.set(0, 1.42, 0.536);
        bg.add(scr);

        var glow = new THREE.PointLight(i ? 0xffca3a : 0x22e6ff, 0.7, 6);
        glow.position.set(0, 1.6, 0.9);
        bg.add(glow);

        scene.add(bg);
    });

    /* ---------- 相机与环绕控制 ---------- */
    var aspect0 = window.innerWidth / window.innerHeight;
    var orbit = {
        target: new THREE.Vector3(0, 1.15, 0),
        radius: aspect0 < 0.8 ? 11.2 : (aspect0 < 1.3 ? 9.8 : 8.6),
        azimuth: 0,
        polar: 1.17,
        minRadius: 5.4,
        maxRadius: 11.4,
        minPolar: 1.12,
        maxPolar: 1.34
    };
    var lookAt = orbit.target.clone();

    function orbitPosition() {
        var sinP = Math.sin(orbit.polar);
        return new THREE.Vector3(
            orbit.target.x + orbit.radius * sinP * Math.sin(orbit.azimuth),
            orbit.target.y + orbit.radius * Math.cos(orbit.polar),
            orbit.target.z + orbit.radius * sinP * Math.cos(orbit.azimuth)
        );
    }

    function applyOrbit() {
        camera.position.copy(orbitPosition());
        lookAt.copy(orbit.target);
        camera.lookAt(lookAt);
    }
    applyOrbit();

    var tweenState = null;
    function tweenTo(pos, look, dur, done) {
        tweenState = {
            fromPos: camera.position.clone(),
            fromLook: lookAt.clone(),
            toPos: pos.clone(),
            toLook: look.clone(),
            start: performance.now(),
            dur: reduceMotion ? 1 : Math.max(dur, 1),
            done: done
        };
    }

    /* ---------- 交互 ---------- */
    var seated = false;
    var busy = false;
    var credits = 0;

    function pickGame(x, y) {
        pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        var hits = raycaster.intersectObjects(groups, true);
        for (var i = 0; i < hits.length; i++) {
            var o = hits[i].object;
            while (o && !o.userData.gameId) o = o.parent;
            if (o) return o.userData.gameId;
        }
        return null;
    }

    var doorOpen = false;
    var doorBusy = false;
    function setDoor(open) {
        if (doorOpen === open || doorBusy) return;
        doorOpen = open;
        doorBusy = true;
        var start = performance.now();
        function step(now) {
            var t = Math.min(1, (now - start) / 650);
            var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            doorLeaves.forEach(function (l) {
                l.group.rotation.y = l.open * (open ? e : 1 - e);
            });
            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                doorBusy = false;
            }
        }
        requestAnimationFrame(step);
        if (open) {
            setTimeout(function () {
                document.dispatchEvent(new CustomEvent('arcade:map'));
            }, 580);
        }
    }

    function pickDoor(x, y) {
        if (doorOpen || doorBusy || seated || busy) return false;
        pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        var hit = raycaster.intersectObject(doorHit, false)[0];
        if (!hit) return false;
        var blockers = raycaster.intersectObjects(groups.concat(machineGroups), true);
        return !blockers.length || blockers[0].distance > hit.distance + 0.05;
    }

    document.addEventListener('arcade:mapclose', function () {
        setDoor(false);
    });

    function dropCoin(x, y) {
        if (reduceMotion) return;
        var coin = document.createElement('div');
        coin.className = 'coin-fly';
        document.body.appendChild(coin);
        var tx = window.innerWidth / 2;
        var ty = window.innerHeight * 0.52;
        coin.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        if (coin.animate) {
            var anim = coin.animate([
                { transform: 'translate(' + x + 'px,' + y + 'px) rotate(0deg) scale(1)' },
                { transform: 'translate(' + (x * 0.45 + tx * 0.55) + 'px,' + (y - 70) + 'px) rotate(220deg) scale(1.1)', offset: 0.42 },
                { transform: 'translate(' + tx + 'px,' + ty + 'px) rotate(540deg) scale(.8)' }
            ], { duration: 600, easing: 'cubic-bezier(.45,.05,.3,1)' });
            anim.onfinish = function () { coin.remove(); };
        } else {
            setTimeout(function () { coin.remove(); }, 600);
        }
    }

    function enterCabinet(id, ev) {
        if (busy || seated) return;
        var meta = null;
        for (var i = 0; i < PROJECTS.length; i++) {
            if (PROJECTS[i].id === id) { meta = PROJECTS[i]; break; }
        }
        if (!meta) return;

        busy = true;
        seated = true;
        credits++;
        var counter = document.getElementById('creditCount');
        if (counter) counter.textContent = ('0' + credits).slice(-2);

        if (window.Arcade && window.Arcade.coinSound) window.Arcade.coinSound();
        dropCoin(ev.clientX, ev.clientY);

        tweenTo(
            new THREE.Vector3(meta.x, 1.5, meta.z).add(
                new THREE.Vector3(Math.sin(meta.angle), 0, Math.cos(meta.angle)).multiplyScalar(1.95)
            ),
            new THREE.Vector3(meta.x, 1.35, meta.z),
            850,
            function () {
                setTimeout(function () {
                    if (window.Arcade && window.Arcade.startGame) window.Arcade.startGame(id);
                    busy = false;
                }, 420);
            }
        );
    }

    function leaveCabinet() {
        seated = false;
        busy = false;
        setHover(null);
        tweenTo(orbitPosition(), orbit.target, 700);
    }

    var hovered = null;
    function setHover(id) {
        if (hovered === id) return;
        hovered = id;
        groups.forEach(function (g) {
            var on = g.userData.gameId === id;
            g.scale.setScalar(on ? 1.025 : 1);
            if (g.userData.glow) g.userData.glow.intensity = on ? 2.0 : 1.2;
        });
    }

    var dragState = null;
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';

    renderer.domElement.addEventListener('pointerdown', function (e) {
        if (busy || seated) return;
        dragState = {
            x: e.clientX,
            y: e.clientY,
            azimuth: orbit.azimuth,
            polar: orbit.polar,
            moved: 0
        };
        if (renderer.domElement.setPointerCapture) {
            renderer.domElement.setPointerCapture(e.pointerId);
        }
        renderer.domElement.style.cursor = 'grabbing';
    });

    renderer.domElement.addEventListener('pointermove', function (e) {
        if (dragState) {
            var dx = e.clientX - dragState.x;
            var dy = e.clientY - dragState.y;
            dragState.moved += Math.abs(dx) + Math.abs(dy);
            orbit.azimuth = dragState.azimuth - dx * 0.006;
            orbit.polar = Math.max(orbit.minPolar, Math.min(orbit.maxPolar, dragState.polar - dy * 0.004));
            applyOrbit();
            return;
        }
        if (busy || seated) return;
        var hit = pickInteractive(e.clientX, e.clientY);
        var id = hit && hit.kind === 'game' ? hit.id : null;
        var mid = hit && hit.kind === 'machine' ? hit.id : null;
        var onDoor = !hit && pickDoor(e.clientX, e.clientY);
        renderer.domElement.style.cursor = (hit || onDoor) ? 'pointer' : 'grab';
        setHover(id);
        setMachineHover(mid);
    });

    renderer.domElement.addEventListener('pointerup', function (e) {
        if (!dragState) return;
        var wasClick = dragState.moved < 10;
        dragState = null;
        renderer.domElement.style.cursor = 'grab';
        if (renderer.domElement.releasePointerCapture) {
            try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        if (!wasClick || seated || busy) return;
        var hit = pickInteractive(e.clientX, e.clientY);
        if (hit && hit.kind === 'game') {
            setHover(null);
            setMachineHover(null);
            enterCabinet(hit.id, e);
        } else if (hit && hit.kind === 'machine') {
            setMachineHover(null);
            startMachineDraw(hit.id, e);
        } else if (pickDoor(e.clientX, e.clientY)) {
            setDoor(true);
        }
    });

    renderer.domElement.addEventListener('pointercancel', function () {
        dragState = null;
        renderer.domElement.style.cursor = 'grab';
    });

    renderer.domElement.addEventListener('wheel', function (e) {
        if (seated || busy) return;
        e.preventDefault();
        orbit.radius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.radius + e.deltaY * 0.0022));
        applyOrbit();
    }, { passive: false });

    document.addEventListener('arcade:close', leaveCabinet);

    /* ---------- 循环 ---------- */
    var modalEl = document.querySelector('.modal');

    function tick(now) {
        requestAnimationFrame(tick);
        if (modalEl && modalEl.classList.contains('open')) return;

        if (tweenState) {
            var k = Math.min(1, (now - tweenState.start) / tweenState.dur);
            var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
            camera.position.lerpVectors(tweenState.fromPos, tweenState.toPos, e);
            lookAt.lerpVectors(tweenState.fromLook, tweenState.toLook, e);
            camera.lookAt(lookAt);
            if (k >= 1) {
                var done = tweenState.done;
                tweenState = null;
                if (done) done();
            }
        } else {
            camera.lookAt(lookAt);
        }

        for (var i = 0; i < screenTextures.length; i++) {
            screenTextures[i].tex.needsUpdate = true;
        }

        if (!clawAnim && !busy && !seated) {
            var sway = Math.sin(now * 0.0011) * 0.24;
            clawCarriage.position.x = sway;
            clawHead.position.x = sway;
            clawCable.position.x = sway;
            clawHead.position.y = 1.3;
            clawPrize.visible = false;
            clawProngs.scale.set(1, 1, 1);
            clawCable.scale.y = 1;
            clawCable.position.y = 1.55;
        }
        if (!gachaAnim && !busy && !seated) {
            gachaCapsuleGroup.rotation.y = now * 0.00035;
        }
        clawLight.intensity = 1.35 + Math.sin(now * 0.0021) * 0.25;
        gachaLight.intensity = 1.25 + Math.cos(now * 0.0017) * 0.25;
        for (var as = 0; as < attractScreens.length; as++) {
            var sc = attractScreens[as];
            if (now - sc.last > 2200) {
                sc.last = now;
                sc.index = (sc.index + 1) % PROJECTS.length;
                paintAttractScreen(sc, sc.index);
            }
        }

        updateClaw(now);
        updateGacha(now);
        renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (!seated && !tweenState) applyOrbit();
    });

    /* 字体加载完成后重画灯箱，避免像素字体回退 */
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
            marqueeRecords.forEach(function (record) {
                paintMarquee(record);
                if (record.texture) record.texture.needsUpdate = true;
            });
        });
    }
})();
