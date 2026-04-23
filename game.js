// 全局变量
let scene, camera, renderer, controls;
let cubeModel = null;
let isMoving = false;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let speed = 0.1;

// 初始化函数
function init() {
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    // 创建相机
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);
    
    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    
    // 添加轨道控制器
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controls.maxPolarAngle = Math.PI / 2;
    
    // 添加环境光
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
    
    // 添加方向光
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    
    // 移除网格辅助线
    // const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    // scene.add(gridHelper);
    
    // 加载GLTF模型
    loadGLTFModel();
    
    // 事件监听
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    
    // 动画循环
    animate();
}

// 加载GLTF模型
function loadGLTFModel() {
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        'mofang.gltf',
        function (gltf) {
            cubeModel = gltf.scene;
            cubeModel.scale.set(0.1, 0.1, 0.1);
            cubeModel.position.set(0, 0, 0);
            scene.add(cubeModel);
            console.log('GLTF model loaded successfully');
        },
        function (xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function (error) {
            console.error('Error loading GLTF model:', error);
            // 如果加载失败，创建一个简单的立方体作为替代
            createCube();
        }
    );
}

// 加载FBX模型（保留用于备份）
function loadFBXModel() {
    const loader = new THREE.FBXLoader();
    
    loader.load(
        'cube.fbx',
        function (object) {
            cubeModel = object;
            cubeModel.scale.set(0.1, 0.1, 0.1);
            cubeModel.position.set(0, 0, 0);
            scene.add(cubeModel);
            console.log('FBX model loaded successfully');
        },
        function (xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function (error) {
            console.error('Error loading FBX model:', error);
            // 如果加载失败，创建一个简单的立方体作为替代
            createCube();
        }
    );
}

// 创建一个简单的立方体作为替代
function createCube() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ff00, 
        emissive: 0x222222,
        emissiveIntensity: 0.5
    });
    cubeModel = new THREE.Mesh(geometry, material);
    scene.add(cubeModel);
    console.log('Created fallback cube');
}

// 键盘按下事件
function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW':
            moveForward = true;
            break;
        case 'KeyS':
            moveBackward = true;
            break;
        case 'KeyA':
            moveLeft = true;
            break;
        case 'KeyD':
            moveRight = true;
            break;
    }
}

// 键盘释放事件
function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW':
            moveForward = false;
            break;
        case 'KeyS':
            moveBackward = false;
            break;
        case 'KeyA':
            moveLeft = false;
            break;
        case 'KeyD':
            moveRight = false;
            break;
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
    
    // 更新控制器
    controls.update();
    
    // 处理移动
    if (moveForward) {
        camera.translateZ(-speed);
    }
    if (moveBackward) {
        camera.translateZ(speed);
    }
    if (moveLeft) {
        camera.translateX(-speed);
    }
    if (moveRight) {
        camera.translateX(speed);
    }
    
    // 旋转模型
    if (cubeModel) {
        cubeModel.rotation.y += 0.01;
    }
    
    renderer.render(scene, camera);
}

// 初始化
init();