(function () {
    'use strict';
    if (!window.THREE) return;

    var host = document.getElementById('cafe3d');
    if (!host) return;

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cursor = 'default';

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdcd0bb);
    scene.fog = new THREE.Fog(0xdcd0bb, 16, 34);

    var camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 100);
    var basePos = new THREE.Vector3(0.72, 1.62, 4.35);
    var lookAt = new THREE.Vector3(0.15, 1.15, -1.6);
    camera.position.copy(basePos);
    camera.lookAt(lookAt);

    function canvasTex(w, h, draw) {
        var cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        draw(cv.getContext('2d'), w, h);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    function makeWoodTexture() {
        return canvasTex(512, 512, function (c) {
            c.fillStyle = '#6b4630';
            c.fillRect(0, 0, 512, 512);
            for (var row = 0; row < 8; row++) {
                var y = row * 64;
                var shade = row % 2 ? 8 : 0;
                c.fillStyle = 'rgba(' + (104 + shade) + ',' + (72 + shade) + ',' + (48 + shade) + ',1)';
                c.fillRect(0, y + 2, 512, 60);
                c.strokeStyle = 'rgba(60,36,22,.55)';
                c.lineWidth = 3;
                c.strokeRect(0, y + 2, 512, 60);
                c.strokeStyle = 'rgba(82,52,32,.25)';
                c.lineWidth = 1;
                for (var i = 0; i < 7; i++) {
                    c.beginPath();
                    c.moveTo(0, y + 10 + i * 7);
                    c.bezierCurveTo(140, y + 6 + i * 7, 360, y + 16 + i * 7, 512, y + 9 + i * 7);
                    c.stroke();
                }
            }
        });
    }

    function makeBrickTexture() {
        return canvasTex(512, 512, function (c) {
            c.fillStyle = '#b9a894';
            c.fillRect(0, 0, 512, 512);
            var bw = 86, bh = 34;
            for (var row = 0; row < 16; row++) {
                var off = row % 2 ? -bw / 2 : 0;
                for (var col = -1; col < 7; col++) {
                    var x = col * bw + off;
                    var y = row * bh;
                    var r = 122 + Math.floor(Math.random() * 40);
                    c.fillStyle = 'rgb(' + r + ',' + Math.floor(r * 0.62) + ',' + Math.floor(r * 0.5) + ')';
                    c.fillRect(x + 3, y + 3, bw - 6, bh - 6);
                    c.fillStyle = 'rgba(255,255,255,.12)';
                    c.fillRect(x + 3, y + 3, bw - 6, 3);
                }
            }
        });
    }

    function makeRugTexture() {
        return canvasTex(512, 384, function (c) {
            c.fillStyle = '#d8c6a8';
            c.fillRect(0, 0, 512, 384);
            c.strokeStyle = '#7a5a3a';
            c.lineWidth = 7;
            c.strokeRect(18, 18, 476, 348);
            c.strokeStyle = 'rgba(122,90,58,.55)';
            c.lineWidth = 2;
            c.strokeRect(36, 36, 440, 312);
            c.fillStyle = '#c9743f';
            c.fillRect(0, 176, 512, 22);
            c.fillStyle = '#8a6a4a';
            for (var i = 0; i < 9; i++) {
                c.beginPath();
                c.moveTo(60 + i * 48, 80);
                c.lineTo(84 + i * 48, 120);
                c.lineTo(60 + i * 48, 160);
                c.strokeStyle = 'rgba(201,162,107,.4)';
                c.lineWidth = 3;
                c.stroke();
            }
        });
    }

    function makeDayTexture() {
        return canvasTex(512, 320, function (c) {
            var g = c.createLinearGradient(0, 0, 0, 320);
            g.addColorStop(0, '#8ecdf5');
            g.addColorStop(0.55, '#cfeaff');
            g.addColorStop(1, '#fff2d8');
            c.fillStyle = g;
            c.fillRect(0, 0, 512, 320);

            var sg = c.createRadialGradient(392, 66, 8, 392, 66, 115);
            sg.addColorStop(0, 'rgba(255,252,228,.98)');
            sg.addColorStop(0.35, 'rgba(255,240,190,.6)');
            sg.addColorStop(1, 'rgba(255,240,190,0)');
            c.fillStyle = sg;
            c.fillRect(260, 0, 252, 200);

            c.fillStyle = 'rgba(255,255,255,.9)';
            [[90, 70, 46, 16], [130, 76, 34, 14], [290, 110, 40, 14], [418, 132, 34, 12]].forEach(function (p) {
                c.beginPath();
                c.ellipse(p[0], p[1], p[2], p[3], 0, 0, Math.PI * 2);
                c.fill();
            });

            var x = 0;
            while (x < 512) {
                var w = 40 + Math.random() * 60;
                var h = 70 + Math.random() * 120;
                c.fillStyle = 'rgba(150,176,196,.85)';
                c.fillRect(x, 320 - h, w, h);
                for (var wy = 320 - h + 12; wy < 300; wy += 20) {
                    for (var wx = x + 8; wx < x + w - 8; wx += 16) {
                        c.fillStyle = Math.random() > 0.4 ? 'rgba(240,250,255,.8)' : 'rgba(200,225,240,.5)';
                        c.fillRect(wx, wy, 7, 8);
                    }
                }
                x += w + 6;
            }

            c.fillStyle = 'rgba(86,132,86,.9)';
            [30, 200, 470].forEach(function (tx) {
                c.beginPath();
                c.arc(tx, 276, 34, 0, Math.PI * 2);
                c.arc(tx + 24, 262, 26, 0, Math.PI * 2);
                c.fill();
            });
            c.fillStyle = 'rgba(90,72,56,.9)';
            c.fillRect(0, 300, 512, 20);
        });
    }

    function makeMenuTexture() {
        return canvasTex(512, 320, function (c) {
            c.fillStyle = '#14201c';
            c.fillRect(0, 0, 512, 320);
            c.strokeStyle = '#c9a26b';
            c.lineWidth = 6;
            c.strokeRect(14, 14, 484, 292);
            c.fillStyle = '#f1dfbf';
            c.textAlign = 'center';
            c.font = 'italic bold 54px Georgia,serif';
            c.fillText('CAFÉ', 256, 84);
            c.font = '20px "Courier New",monospace';
            c.fillStyle = '#c9a26b';
            c.fillText('ESPRESSO   ·   LATTE   ·   POUR OVER', 256, 126);
            c.strokeStyle = 'rgba(241,223,191,.25)';
            c.lineWidth = 2;
            for (var i = 0; i < 4; i++) {
                c.beginPath();
                c.moveTo(70, 170 + i * 34);
                c.lineTo(442, 170 + i * 34);
                c.stroke();
            }
            c.fillStyle = 'rgba(241,223,191,.65)';
            c.font = '16px "Courier New",monospace';
            c.fillText('OPEN 24H', 256, 292);
        });
    }

    function makeNeonTexture() {
        return canvasTex(512, 192, function (c) {
            c.clearRect(0, 0, 512, 192);
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.shadowColor = '#ff8a3d';
            c.shadowBlur = 34;
            c.fillStyle = '#ffe2b8';
            c.font = 'bold 96px Georgia,serif';
            c.fillText('CAFÉ', 256, 80);
            c.shadowBlur = 12;
            c.fillStyle = '#8fe6ff';
            c.font = 'bold 20px "Courier New",monospace';
            c.fillText('SOLAIRE', 256, 152);
        });
    }

    function makeLaptopTexture() {
        return canvasTex(512, 320, function (c) {
            var bg = c.createLinearGradient(0, 0, 512, 320);
            bg.addColorStop(0, '#fffaf0');
            bg.addColorStop(1, '#f1dfc4');
            c.fillStyle = bg;
            c.fillRect(0, 0, 512, 320);

            var sun = c.createRadialGradient(446, 58, 4, 446, 58, 120);
            sun.addColorStop(0, 'rgba(255,214,130,.85)');
            sun.addColorStop(1, 'rgba(255,214,130,0)');
            c.fillStyle = sun;
            c.fillRect(310, 0, 202, 190);

            c.strokeStyle = '#b4562f';
            c.lineWidth = 4;
            c.strokeRect(12, 12, 488, 296);
            c.fillStyle = '#8a6a4a';
            c.font = '18px "Courier New",monospace';
            c.fillText('CAFÉ SOLAIRE · DAYLIGHT', 36, 52);
            c.fillStyle = '#7a5a3a';
            c.font = 'bold 24px "Courier New",monospace';
            c.fillText('PSYCHOLOGY', 36, 116);
            c.fillStyle = '#b4562f';
            c.font = 'bold 62px "Courier New",monospace';
            c.fillText('TALKS', 36, 182);
            c.fillStyle = '#6a5a48';
            c.font = '18px "Courier New",monospace';
            c.fillText('> CLICK TO OPEN A TABLE', 36, 240);
            c.fillStyle = 'rgba(180,86,47,.45)';
            c.fillRect(36, 258, 190, 4);

            c.fillStyle = '#e0a33c';
            c.beginPath();
            c.arc(452, 252, 19, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = 'rgba(224,163,60,.75)';
            c.lineWidth = 3;
            for (var i = 0; i < 8; i++) {
                var a = (i / 8) * Math.PI * 2;
                c.beginPath();
                c.moveTo(452 + Math.cos(a) * 24, 252 + Math.sin(a) * 24);
                c.lineTo(452 + Math.cos(a) * 31, 252 + Math.sin(a) * 31);
                c.stroke();
            }
        });
    }

    function makeKeyboardTexture() {
        return canvasTex(512, 320, function (c) {
            c.fillStyle = '#e8e6e0';
            c.fillRect(0, 0, 512, 320);
            c.fillStyle = '#c6c3bb';
            for (var r = 0; r < 5; r++) {
                for (var k = 0; k < 14; k++) {
                    c.fillRect(18 + k * 35, 24 + r * 44, 27, 30);
                }
            }
            c.fillStyle = 'rgba(255,255,255,.55)';
            for (var r2 = 0; r2 < 5; r2++) {
                for (var k2 = 0; k2 < 14; k2++) {
                    c.fillRect(18 + k2 * 35, 24 + r2 * 44, 27, 3);
                }
            }
            c.fillStyle = '#d5d2cb';
            c.fillRect(140, 258, 232, 44);
        });
    }

    /* ---------------- 材质 ---------------- */
    var woodTex = makeWoodTexture();
    var brickTex = makeBrickTexture();
    var rugTex = makeRugTexture();
    var dayTex = makeDayTexture();

    /* ---------------- 房间 ---------------- */
    var floor = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 12),
        new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.6, metalness: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.001;
    scene.add(floor);

    var rug = new THREE.Mesh(
        new THREE.PlaneGeometry(5.2, 3.8),
        new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-0.2, 0.014, 0.9);
    scene.add(rug);

    var sunPatchTex = canvasTex(256, 256, function (c) {
        var g = c.createRadialGradient(128, 128, 8, 128, 128, 124);
        g.addColorStop(0, 'rgba(255,246,210,.95)');
        g.addColorStop(0.55, 'rgba(255,236,184,.5)');
        g.addColorStop(1, 'rgba(255,236,184,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 256, 256);
    });
    var sunPatch = new THREE.Mesh(
        new THREE.PlaneGeometry(4.4, 3.3),
        new THREE.MeshBasicMaterial({
            map: sunPatchTex,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })
    );
    sunPatch.rotation.x = -Math.PI / 2;
    sunPatch.position.set(-3.1, 0.022, 0.9);
    scene.add(sunPatch);

    var backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 4),
        new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.92 })
    );
    backWall.position.set(0, 2, -5);
    scene.add(backWall);

    var wallMat = new THREE.MeshStandardMaterial({ color: 0xc9b79d, roughness: 0.9 });
    var leftWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-6, 2, 0);
    scene.add(leftWall);
    var rightWall = leftWall.clone();
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.x = 6;
    scene.add(rightWall);

    var ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 12),
        new THREE.MeshStandardMaterial({ color: 0xf0e5d2, roughness: 1 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 3.9;
    scene.add(ceiling);

    /* 左侧窗户 */
    var windowGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(3.3, 2.1),
        new THREE.MeshBasicMaterial({ map: dayTex })
    );
    windowGlass.rotation.y = Math.PI / 2;
    windowGlass.position.set(-5.94, 1.86, -0.2);
    scene.add(windowGlass);

    var frameMat = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.55, metalness: 0.2 });
    var winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 3.45), frameMat);
    winFrame.position.set(-5.9, 1.86, -0.2);
    scene.add(winFrame);
    var winBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 3.3), frameMat);
    winBar.position.set(-5.88, 1.86, -0.2);
    scene.add(winBar);
    var winBar2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.1, 0.06), frameMat);
    winBar2.position.set(-5.88, 1.86, -0.2);
    scene.add(winBar2);

    var windowLight = new THREE.PointLight(0xfff0d0, 0.55, 9);
    windowLight.position.set(-4.6, 2, 0.2);
    scene.add(windowLight);

    /* 后墙白天窗 */
    var backWindow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 1.7),
        new THREE.MeshBasicMaterial({ map: dayTex })
    );
    backWindow.position.set(-4.75, 2.25, -4.94);
    scene.add(backWindow);
    var backWinFrame = new THREE.Mesh(new THREE.BoxGeometry(2.18, 1.88, 0.1), frameMat);
    backWinFrame.position.set(-4.75, 2.25, -5.0);
    scene.add(backWinFrame);
    var backWinBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.04), frameMat);
    backWinBar.position.set(-4.75, 2.25, -4.92);
    scene.add(backWinBar);
    var backWinLight = new THREE.PointLight(0xfff2d6, 0.5, 5);
    backWinLight.position.set(-4.4, 2.5, -4.0);
    scene.add(backWinLight);

    /* ---------------- 吧台 ---------------- */
    var barFront = new THREE.Mesh(
        new THREE.BoxGeometry(7, 1.0, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x6b4326, roughness: 0.65 })
    );
    barFront.position.set(0, 0.5, -2.8);
    scene.add(barFront);

    for (var slat = 0; slat < 14; slat++) {
        var strip = new THREE.Mesh(
            new THREE.BoxGeometry(0.34, 0.88, 0.05),
            new THREE.MeshStandardMaterial({
                color: slat % 2 ? 0x9a663c : 0x845632,
                roughness: 0.6
            })
        );
        strip.position.set(-3.25 + slat * 0.5, 0.5, -2.71);
        scene.add(strip);
    }

    var barTop = new THREE.Mesh(
        new THREE.BoxGeometry(7.2, 0.12, 1.05),
        new THREE.MeshStandardMaterial({ color: 0x3e342c, roughness: 0.32, metalness: 0.25 })
    );
    barTop.position.set(0, 1.06, -3.15);
    scene.add(barTop);

    var footRail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 6.8, 12),
        new THREE.MeshStandardMaterial({ color: 0xb08a58, metalness: 0.85, roughness: 0.3 })
    );
    footRail.rotation.z = Math.PI / 2;
    footRail.position.set(0, 0.26, -2.68);
    scene.add(footRail);

    var backBar = new THREE.Mesh(
        new THREE.BoxGeometry(7, 0.95, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.7 })
    );
    backBar.position.set(0, 0.48, -4.4);
    scene.add(backBar);

    /* 后吧台酒架 */
    [1.4, 1.95, 2.5].forEach(function (y) {
        var shelf = new THREE.Mesh(
            new THREE.BoxGeometry(6.8, 0.07, 0.32),
            new THREE.MeshStandardMaterial({ color: 0x9a663c, roughness: 0.55 })
        );
        shelf.position.set(0, y, -4.85);
        scene.add(shelf);
        var led = new THREE.Mesh(
            new THREE.BoxGeometry(6.6, 0.02, 0.02),
            new THREE.MeshBasicMaterial({ color: 0xffb56b })
        );
        led.position.set(0, y + 0.05, -4.68);
        scene.add(led);
        for (var b = 0; b < 13; b++) {
            var col = [0x9a5a1e, 0x4c7a3a, 0x7a2a2a, 0x8a7a4a][b % 4];
            var bottle = new THREE.Mesh(
                new THREE.CylinderGeometry(0.045, 0.05, 0.28, 10),
                new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.1 })
            );
            bottle.position.set(-3.1 + b * 0.5, y + 0.18, -4.83);
            scene.add(bottle);
            var neck = new THREE.Mesh(
                new THREE.CylinderGeometry(0.018, 0.018, 0.09, 8),
                new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 })
            );
            neck.position.set(-3.1 + b * 0.5, y + 0.36, -4.83);
            scene.add(neck);
        }
    });

    var menu = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 1.56),
        new THREE.MeshBasicMaterial({ map: makeMenuTexture() })
    );
    menu.position.set(-1.9, 3.0, -4.88);
    scene.add(menu);

    var neonSign = new THREE.Mesh(
        new THREE.PlaneGeometry(3.1, 1.16),
        new THREE.MeshBasicMaterial({ map: makeNeonTexture(), transparent: true })
    );
    neonSign.position.set(1.6, 3.12, -4.88);
    scene.add(neonSign);

    /* ---------------- 咖啡机 ---------------- */
    var machine = new THREE.Group();
    machine.position.set(-1.55, 1.12, -3.18);

    var chrome = new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 0.85, roughness: 0.22 });
    var darkMetal = new THREE.MeshStandardMaterial({ color: 0x1a1c22, metalness: 0.6, roughness: 0.35 });

    var machineBody = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 0.52), chrome);
    machineBody.position.y = 0.3;
    machine.add(machineBody);
    var machineTop = new THREE.Mesh(new THREE.BoxGeometry(0.99, 0.08, 0.56), darkMetal);
    machineTop.position.y = 0.64;
    machine.add(machineTop);
    var machineFace = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.34, 0.03), darkMetal);
    machineFace.position.set(0, 0.36, 0.27);
    machine.add(machineFace);

    [-0.2, 0.2].forEach(function (x) {
        var head = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.1, 16), darkMetal);
        head.position.set(x, 0.16, 0.24);
        machine.add(head);
        var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 10), new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.5 }));
        handle.rotation.x = Math.PI / 2;
        handle.position.set(x, 0.16, 0.38);
        machine.add(handle);
    });

    var gauge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.02, 18),
        new THREE.MeshStandardMaterial({ color: 0xf3efe2, roughness: 0.3 })
    );
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(0, 0.44, 0.285);
    machine.add(gauge);

    var dripTray = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.32), darkMetal);
    dripTray.position.set(0, 0.03, 0.26);
    machine.add(dripTray);

    var steamWand = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 8), chrome);
    steamWand.position.set(0.5, 0.24, 0.2);
    steamWand.rotation.z = -0.35;
    machine.add(steamWand);

    for (var cup = 0; cup < 3; cup++) {
        var topCup = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.038, 0.07, 12),
            new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.45 })
        );
        topCup.position.set(-0.28 + cup * 0.12, 0.715, 0.02);
        machine.add(topCup);
    }
    scene.add(machine);

    /* 磨豆机 */
    var grinder = new THREE.Group();
    grinder.position.set(0.15, 1.12, -3.2);
    var grinderBody = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.4, 16), darkMetal);
    grinderBody.position.y = 0.2;
    grinder.add(grinderBody);
    var hopper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.11, 0.3, 16, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x6b3a1e, transparent: true, opacity: 0.6, roughness: 0.25, side: THREE.DoubleSide })
    );
    hopper.position.y = 0.54;
    grinder.add(hopper);
    var chute = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.2), darkMetal);
    chute.position.set(0, 0.08, 0.18);
    grinder.add(chute);
    scene.add(grinder);

    /* 咖啡杯与甜点罩 */
    for (var c2 = 0; c2 < 2; c2++) {
        var cup2 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.055, 0.1, 14),
            new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.4 })
        );
        cup2.position.set(1.3 + c2 * 0.24, 1.17, -3.2);
        scene.add(cup2);
    }
    var dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xaad8e6, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1 })
    );
    dome.position.set(2.7, 1.12, -3.15);
    scene.add(dome);

    /* 吧凳 */
    [-1.1, 1.1].forEach(function (x) {
        var seat = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.24, 0.07, 18),
            new THREE.MeshStandardMaterial({ color: 0x6b3a22, roughness: 0.55 })
        );
        seat.position.set(x, 0.78, -2.15);
        scene.add(seat);
        var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 10), darkMetal);
        stem.position.set(x, 0.38, -2.15);
        scene.add(stem);
        var basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.04, 18), darkMetal);
        basePlate.position.set(x, 0.03, -2.15);
        scene.add(basePlate);
    });

    /* ---------------- 桌子与椅子 ---------------- */
    var tableWood = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.55 });
    function buildChair(x, z, rotY) {
        var g = new THREE.Group();
        g.position.set(x, 0, z);
        g.rotation.y = rotY;
        var seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), tableWood);
        seat.position.y = 0.46;
        g.add(seat);
        var back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.06), tableWood);
        back.position.set(0, 0.7, -0.2);
        g.add(back);
        [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(function (p) {
            var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.46, 8), tableWood);
            leg.position.set(p[0], 0.23, p[1]);
            g.add(leg);
        });
        scene.add(g);
    }

    function buildTable(x, z) {
        var top = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.06, 28), tableWood);
        top.position.set(x, 0.75, z);
        scene.add(top);
        var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.72, 12), tableWood);
        stem.position.set(x, 0.37, z);
        scene.add(stem);
        var basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.04, 20), tableWood);
        basePlate.position.set(x, 0.02, z);
        scene.add(basePlate);
    }

    buildTable(-2.2, 0.25);
    buildChair(-2.2, 1.1, Math.PI);
    buildChair(-3.2, 0.25, Math.PI / 2);
    buildChair(-1.2, 0.25, -Math.PI / 2);

    buildTable(1.7, 1.05);
    buildChair(1.7, 1.9, Math.PI);
    buildChair(2.65, 1.05, Math.PI / 2);

    /* 桌上杯子、书 */
    var cupMat = new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.4 });
    function addCup(x, y, z) {
        var saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.012, 18), cupMat);
        saucer.position.set(x, y - 0.042, z);
        scene.add(saucer);
        var cup = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.09, 14), cupMat);
        cup.position.set(x, y, z);
        scene.add(cup);
        var handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 8, 14), cupMat);
        handle.position.set(x + 0.075, y, z);
        handle.rotation.y = Math.PI / 2;
        scene.add(handle);
    }
    addCup(-2.45, 0.825, 0.05);
    addCup(-1.95, 0.825, 0.5);
    addCup(1.28, 0.825, 1.38);

    var book1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22), new THREE.MeshStandardMaterial({ color: 0x7a2a2a, roughness: 0.7 }));
    book1.position.set(-2.0, 0.8, -0.05);
    book1.rotation.y = 0.4;
    scene.add(book1);
    var book2 = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.035, 0.2), new THREE.MeshStandardMaterial({ color: 0x2a4a5a, roughness: 0.7 }));
    book2.position.set(-2.0, 0.837, -0.05);
    book2.rotation.y = 0.1;
    scene.add(book2);

    /* ---------------- 笔记本电脑 ---------------- */
    var laptop = new THREE.Group();
    laptop.position.set(1.7, 0.785, 1.05);
    laptop.rotation.y = -0.55;

    var laptopShell = new THREE.MeshStandardMaterial({ color: 0xe9e7e1, metalness: 0.42, roughness: 0.3 });
    var base = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.026, 0.44),
        laptopShell
    );
    base.position.y = 0.013;
    laptop.add(base);

    var keyboard = new THREE.Mesh(
        new THREE.PlaneGeometry(0.54, 0.34),
        new THREE.MeshBasicMaterial({ map: makeKeyboardTexture() })
    );
    keyboard.rotation.x = -Math.PI / 2;
    keyboard.position.set(0, 0.028, 0.02);
    laptop.add(keyboard);

    var hinge = new THREE.Group();
    hinge.position.set(0, 0.028, -0.21);
    hinge.rotation.x = -0.24;
    laptop.add(hinge);

    var lid = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.42, 0.018),
        laptopShell
    );
    lid.position.set(0, 0.21, 0);
    hinge.add(lid);

    var screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.57, 0.37),
        new THREE.MeshBasicMaterial({ map: makeLaptopTexture() })
    );
    screen.position.set(0, 0.21, 0.011);
    hinge.add(screen);

    var screenLight = new THREE.PointLight(0xffd9a0, 0.4, 2.2);
    screenLight.position.set(0, 0.24, 0.18);
    hinge.add(screenLight);

    var laptopHit = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.7, 0.8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    laptopHit.position.set(0, 0.28, 0.02);
    laptop.add(laptopHit);
    laptopHit.userData.laptop = true;
    scene.add(laptop);

    /* ---------------- 沙发与装饰 ---------------- */
    var sofaMat = new THREE.MeshStandardMaterial({ color: 0x9aab98, roughness: 0.85 });
    var sofa = new THREE.Group();
    sofa.position.set(4.35, 0, 0.7);
    var sofaBase = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.38, 2.8), sofaMat);
    sofaBase.position.y = 0.28;
    sofa.add(sofaBase);
    var sofaBack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 2.8), sofaMat);
    sofaBack.position.set(0.4, 0.6, 0);
    sofa.add(sofaBack);
    [-1.2, 0, 1.2].forEach(function (z, i) {
        var cushion = new THREE.Mesh(
            new THREE.BoxGeometry(0.72, 0.12, 0.86),
            new THREE.MeshStandardMaterial({ color: i === 1 ? 0xc9743f : 0x7f9a88, roughness: 0.9 })
        );
        cushion.position.set(-0.1, 0.5, z);
        sofa.add(cushion);
    });
    scene.add(sofa);

    /* 吊灯 */
    var bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd2a0 });
    [-2.2, 0, 2.2].forEach(function (x) {
        var cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        cable.position.set(x, 3.35, -3.0);
        scene.add(cable);
        var shade = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.28, 0.22, 18, 1, true),
            new THREE.MeshStandardMaterial({ color: 0x2a1a12, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 })
        );
        shade.position.set(x, 2.72, -3.0);
        scene.add(shade);
        var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), bulbMat);
        bulb.position.set(x, 2.63, -3.0);
        scene.add(bulb);
        var lamp = new THREE.PointLight(0xffb060, 0.5, 6.5);
        lamp.position.set(x, 2.55, -3.0);
        scene.add(lamp);
    });

    var tableLamp = new THREE.PointLight(0xffc080, 0.35, 5);
    tableLamp.position.set(1.7, 2.4, 1.2);
    scene.add(tableLamp);

    /* 绿植 */
    var plant = new THREE.Group();
    plant.position.set(-5.1, 0, 3.9);
    var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.45, 14), new THREE.MeshStandardMaterial({ color: 0x6b3a22, roughness: 0.8 }));
    pot.position.y = 0.22;
    plant.add(pot);
    var leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.8 });
    [[0, 0.75, 0], [0.18, 0.62, 0.1], [-0.2, 0.6, -0.08]].forEach(function (p) {
        var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), leafMat);
        leaf.position.set(p[0], p[1], p[2]);
        leaf.scale.set(1, 1.3, 1);
        plant.add(leaf);
    });
    scene.add(plant);

    /* ---------------- 灯光 ---------------- */
    scene.add(new THREE.AmbientLight(0xffe8c8, 0.35));
    var key = new THREE.DirectionalLight(0xfff3d6, 0.45);
    key.position.set(-5, 6, 6);
    scene.add(key);

    var barLight = new THREE.PointLight(0xffc080, 0.45, 8);
    barLight.position.set(0, 2.9, -2.4);
    scene.add(barLight);

    /* ---------------- 蒸汽 ---------------- */
    var steamTex = canvasTex(64, 64, function (c) {
        var g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
        g.addColorStop(0, 'rgba(255,255,255,.85)');
        g.addColorStop(0.5, 'rgba(255,255,255,.25)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
    });
    var steam = [];
    for (var s = 0; s < 12; s++) {
        var mat = new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0.16, depthWrite: false });
        var sp = new THREE.Sprite(mat);
        sp.position.set(-1.75 + Math.random() * 0.5, 1.8 + Math.random() * 0.35, -3.05 + Math.random() * 0.2);
        sp.scale.setScalar(0.18 + Math.random() * 0.12);
        scene.add(sp);
        steam.push({ sprite: sp, seed: Math.random() * 10 });
    }

    /* ---------------- 交互 ---------------- */
    var raycaster = new THREE.Raycaster();
    var pointer = new THREE.Vector2();
    var hovering = false;
    var elapsed = 0;

    function pickLaptop(x, y) {
        pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObject(laptopHit, false).length > 0;
    }

    var parallaxX = 0;
    var parallaxY = 0;
    var targetPX = 0;
    var targetPY = 0;

    renderer.domElement.addEventListener('pointermove', function (e) {
        var hit = pickLaptop(e.clientX, e.clientY);
        if (hit !== hovering) {
            hovering = hit;
            renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
            laptop.scale.setScalar(hit ? 1.03 : 1);
            screenLight.intensity = hit ? 0.7 : 0.4;
        }
        targetPX = (e.clientX / window.innerWidth - 0.5) * 0.22;
        targetPY = (e.clientY / window.innerHeight - 0.5) * 0.12;
    });

    renderer.domElement.addEventListener('pointerup', function (e) {
        if (pickLaptop(e.clientX, e.clientY)) {
            document.dispatchEvent(new CustomEvent('cafe:laptop'));
        }
    });

    var last = performance.now();
    function tick(now) {
        requestAnimationFrame(tick);
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        elapsed += dt;

        parallaxX += (targetPX - parallaxX) * 0.06;
        parallaxY += (targetPY - parallaxY) * 0.06;
        camera.position.x = basePos.x + parallaxX;
        camera.position.y = basePos.y - parallaxY;
        camera.lookAt(lookAt);

        screenLight.intensity = (hovering ? 0.7 : 0.4) + Math.sin(elapsed * 3.2) * 0.04;

        if (!reduceMotion) {
            steam.forEach(function (p, i) {
                p.sprite.position.y += dt * (0.1 + (i % 3) * 0.02);
                if (p.sprite.position.y > 2.35) {
                    p.sprite.position.y = 1.72;
                    p.sprite.position.x = -1.75 + Math.random() * 0.5;
                }
                p.sprite.material.opacity = 0.18 * Math.max(0, 1 - (p.sprite.position.y - 1.72) / 0.7);
            });
        }

        renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
})();
