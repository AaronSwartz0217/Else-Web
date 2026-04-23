// 全局变量
let scene, camera, renderer, cards = [];
let isScrolling = false;
let targetZ = 0;
let currentZ = 0;
let scrollSpeed = 0.1;
let welcomeText = null;
let introText = null;
// 触摸事件变量
let touchStartY = 0;
let touchEndY = 0;

// 人物卡片数据
const cardData = [
    { name: "Person 1", image: "" },
    { name: "Person 2", image: "" },
    { name: "Person 3", image: "" },
    { name: "Person 4", image: "" },
    { name: "Person 5", image: "" },
    { name: "Person 6", image: "" },
    { name: "Person 7", image: "" },
    { name: "Person 8", image: "" },
    { name: "Person 9", image: "" },
    { name: "Person 10", image: "" }
];

// 纹理加载器
const textureLoader = new THREE.TextureLoader();

// 生成默认纹理（当没有图片时使用）
function createDefaultTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // 绘制渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, '#333333');
    gradient.addColorStop(1, '#111111');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    
    // 绘制文字
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Person', 256, 256);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

const defaultTexture = createDefaultTexture();

// 创建欢迎文字
function createWelcomeText() {
    // 创建一个简单的平面作为文字载体
    const geometry = new THREE.PlaneGeometry(10, 2);
    
    // 创建一个canvas作为纹理
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // 绘制文字
    ctx.fillStyle = '#ffffff';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('欢迎来到else的空间', 512, 128);
    
    // 创建纹理
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // 创建材质
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        opacity: 1, // 保持文字始终可见
        side: THREE.DoubleSide,
        emissive: 0x444444,
        emissiveIntensity: 0.8
    });
    
    // 创建网格
    welcomeText = new THREE.Mesh(geometry, material);
    welcomeText.position.z = -60; // 初始位置在相机前方更远的地方（反向尽头）
    welcomeText.position.y = 1;
    scene.add(welcomeText);
    
    console.log('Welcome text created and added to scene at position z:', welcomeText.position.z);
    
    // 创建自我介绍文本
    createIntroText();
}

// 创建自我介绍文本
function createIntroText() {
    // 创建一个简单的平面作为文字载体
    const geometry = new THREE.PlaneGeometry(12, 3);
    
    // 创建一个canvas作为纹理
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // 绘制文字
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('熟悉UE5蓝图材质特效，Unity Shader，', 512, 40);
    ctx.fillText('以及计算机图形学和Agent Skills的', 512, 80);
    ctx.fillText('计算机科学与技术专业的开发者', 512, 120);
    ctx.fillText('邮箱：2971762643@qq.com', 512, 160);
    
    // 创建纹理
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // 创建材质
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        opacity: 0, // 初始隐藏
        side: THREE.DoubleSide,
        emissive: 0x444444,
        emissiveIntensity: 0.8
    });
    
    // 创建网格
    introText = new THREE.Mesh(geometry, material);
    introText.position.z = -80; // 初始位置在欢迎文字之后
    introText.position.y = 1;
    scene.add(introText);
    
    console.log('Intro text created and added to scene at position z:', introText.position.z);
}

// 初始化函数
function init() {
    // 创建场景
    scene = new THREE.Scene();
    
    // 创建相机
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    
    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1);
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    
    // 创建星空背景
    createStarField();
    
    // 创建欢迎文字
    createWelcomeText();
    
    // 创建人物卡片
    createCards();
    
    // 事件监听
    document.addEventListener('wheel', onWheel);
    // 添加触摸事件监听
    document.addEventListener('touchstart', onTouchStart, false);
    document.addEventListener('touchend', onTouchEnd, false);
    window.addEventListener('resize', onResize);    
    // 动画循环
    animate();
}

// 创建星空背景
function createStarField() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 1000;
    const posArray = new Float32Array(starsCount * 3);
    
    for (let i = 0; i < starsCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 100;
    }
    
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    
    const starsMaterial = new THREE.PointsMaterial({
        size: 0.1,
        color: 0xffffff,
        transparent: true,
        opacity: 0.6
    });
    
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);
}

// 创建人物卡片
function createCards() {
    const cardGeometry = new THREE.PlaneGeometry(2, 3);
    
    cardData.forEach((data, index) => {
        // 加载纹理
        let texture;
        if (data.image) {
            texture = textureLoader.load(data.image, () => {
                console.log(`Texture loaded for ${data.name}`);
            }, undefined, (error) => {
                console.error(`Error loading texture for ${data.name}:`, error);
                texture = defaultTexture;
            });
        } else {
            texture = defaultTexture;
        }
        
        // 创建卡片材质（使用MeshStandardMaterial以支持阴影、光照、纹理和自发光）
        const cardMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: texture,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            roughness: 0.3,
            metalness: 0.2,
            emissive: 0x222222, // 自发光颜色
            emissiveIntensity: 0.5 // 自发光强度
        });
        
        const card = new THREE.Mesh(cardGeometry, cardMaterial);
        // 将卡片分布在左右两侧
        const side = index % 2 === 0 ? -3 : 3; // 左侧为-3，右侧为3
        card.position.x = side;
        card.position.z = -Math.floor(index / 2) * 5;
        card.position.y = Math.sin(index * 0.1) * 0.5; // 添加轻微的Y轴偏移，增加层次感
        cards.push(card);
        scene.add(card);
    });
    
    // 添加中间引导直线
    createGuideLine();
    
    // 添加环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // 添加方向光以支持阴影
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // 启用渲染器的阴影
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

// 创建中间引导直线
function createGuideLine() {
    const lineGeometry = new THREE.BufferGeometry();
    const linePoints = [];
    
    // 创建一条沿Z轴延伸的直线
    for (let i = 0; i < 100; i++) {
        linePoints.push(new THREE.Vector3(0, 0, -i * 5));
    }
    
    lineGeometry.setFromPoints(linePoints);
    
    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        opacity: 0.5,
        transparent: true
    });
    
    const guideLine = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(guideLine);
}

// 滚轮事件处理
function onWheel(event) {
    isScrolling = true;
    // 调整滚轮方向：向上滚动（deltaY负）相机向前移动，向下滚动（deltaY正）相机向后移动
    // 根据用户反馈，再次调整滚轮方向
    targetZ += event.deltaY * 0.01;
    // 限制相机移动范围，确保能到达欢迎文字和自我介绍文本的位置
    targetZ = Math.max(targetZ, -100); // 增加额外的移动范围，确保能触发导航
    targetZ = Math.min(targetZ, 0);
    console.log('Wheel event - targetZ:', targetZ);
}

// 触摸开始事件处理
function onTouchStart(event) {
    touchStartY = event.touches[0].clientY;
}

// 触摸结束事件处理
function onTouchEnd(event) {
    touchEndY = event.changedTouches[0].clientY;
    handleSwipe();
}

// 处理滑动操作
function handleSwipe() {
    // 计算滑动距离
    const swipeDistance = touchStartY - touchEndY;
    
    // 只有当滑动距离超过一定阈值时才触发操作
    if (Math.abs(swipeDistance) > 50) {
        isScrolling = true;
        // 上滑（swipeDistance为正）相当于鼠标向下滚动，相机向后移动
        // 下滑（swipeDistance为负）相当于鼠标向上滚动，相机向前移动
        targetZ += swipeDistance * 0.05;
        // 限制相机移动范围
        targetZ = Math.max(targetZ, -100);
        targetZ = Math.min(targetZ, 0);
        console.log('Swipe event - targetZ:', targetZ);
    }
}

// 窗口大小调整
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}



// 动画循环
function animate() {
    requestAnimationFrame(animate);
    
    // 平滑相机移动
    if (isScrolling) {
        currentZ += (targetZ - currentZ) * 0.05;
        camera.position.z = 5 + currentZ;
        
        // 检查是否接近目标位置
        if (Math.abs(targetZ - currentZ) < 0.01) {
            currentZ = targetZ;
            isScrolling = false;
        }
    }
    
    // 更新卡片视觉效果
    cards.forEach((card, index) => {
        const distance = Math.abs(card.position.z - camera.position.z + 5);
        
        // 调整卡片透明度
        card.material.opacity = Math.max(0, 1 - distance * 0.1);
        
        // 卡片大小随距离变化
        const scale = Math.max(0.1, 1 - distance * 0.05);
        card.scale.set(scale, scale, 1);
        
        // 添加卡片旋转效果，增强空间感
        const rotationFactor = distance * 0.01;
        card.rotation.y = Math.sin(rotationFactor + Date.now() * 0.0005) * 0.1;
        card.rotation.x = Math.cos(rotationFactor + Date.now() * 0.0005) * 0.05;
        
        // 调整卡片亮度，近亮远暗
        const brightness = Math.max(0.1, 1 - distance * 0.1);
        card.material.color.setScalar(brightness);
    });
    
    // 控制自我介绍的显示和隐藏
    if (introText) {
        console.log('Intro text exists, updating visibility');
        console.log('Camera position z:', camera.position.z);
        console.log('Intro text position z:', introText.position.z);
        
        // 计算相机与文字的距离
        const distance = Math.abs(introText.position.z - camera.position.z);
        console.log('Distance between camera and intro text:', distance);
        
        // 当相机向前移动，接近文字时显示
        if (distance < 15 && distance > 5) {
            introText.material.opacity = 1;
            console.log('Intro text visible');
        } else {
            introText.material.opacity = 0;
            console.log('Intro text hidden');
        }
        
        // 添加轻微的旋转动画，与欢迎文字效果一致
        introText.rotation.y = Math.sin(Date.now() * 0.0005) * 0.1;
        introText.rotation.x = Math.cos(Date.now() * 0.0005) * 0.05;
    }
    
    // 导航到game页面
    console.log('Camera position z:', camera.position.z);
    if (camera.position.z <= -85) {
        console.log('Navigating to game.html');
        window.location.href = 'game.html';
    }
    
    renderer.render(scene, camera);
}

// 初始化
init();