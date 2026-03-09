// Minimal Three.js scene that only shows the Mandalorian helmet

let scene, camera, renderer;
let helmet = null;
let targetRotationY = 0;
let swipeStartX = null;
let canStepRotate = true; // allow one 90° step at a time

init();
animate();

function init() {
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;

    scene = new THREE.Scene();
    scene.background = null; // keep it transparent so body background image shows through

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 3.0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.physicallyCorrectLights = true;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);

    // Use the background image as a simple natural environment map
    const texLoader = new THREE.TextureLoader();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    texLoader.load(
        'Edge_Tower.jpg.jpeg',
        function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.encoding = THREE.sRGBEncoding;

            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            scene.environment = envMap;

            texture.dispose();
            pmremGenerator.dispose();
        }
    );

    // Softer ambient base light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    // Warm "sun" directional light
    const dirLight = new THREE.DirectionalLight(0xfff2e0, 1.4);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);

    // Sky / ground natural light
    const hemiLight = new THREE.HemisphereLight(0xbfd4ff, 0x403020, 0.9);
    hemiLight.position.set(0, 1, 0);
    scene.add(hemiLight);

    // Subtle cool rim light from behind
    const rimLight = new THREE.DirectionalLight(0xd0e4ff, 0.35);
    rimLight.position.set(-4, 3, -3);
    scene.add(rimLight);

    // Touch swipe to rotate helmet by 90deg per swipe
    const canvas = renderer.domElement;
    canvas.addEventListener('touchstart', function (e) {
        if (e.touches.length > 0) {
            swipeStartX = e.touches[0].clientX;
        }
    }, { passive: true });

    canvas.addEventListener('touchend', function (e) {
        if (swipeStartX === null || e.changedTouches.length === 0) return;
        const endX = e.changedTouches[0].clientX;
        const deltaX = endX - swipeStartX;
        const threshold = 40; // pixels

        if (Math.abs(deltaX) > threshold) {
            const step = Math.PI / 2; // 90 degrees
            if (deltaX > 0) {
                // swipe right -> rotate right
                targetRotationY += step;
            } else {
                // swipe left -> rotate left
                targetRotationY -= step;
            }
        }
        swipeStartX = null;
    }, { passive: true });

    // Mouse wheel: scroll up/down to rotate by 90deg
    canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        if (!canStepRotate) return;
        const step = Math.PI / 2;
        if (e.deltaY > 0) {
            // scroll down -> rotate right
            targetRotationY += step;
        } else if (e.deltaY < 0) {
            // scroll up -> rotate left
            targetRotationY -= step;
        }
        canStepRotate = false;
    }, { passive: false });

    // Keyboard: left / right arrow to rotate by 90deg
    window.addEventListener('keydown', function (e) {
        const step = Math.PI / 2;
        if (e.key === 'ArrowRight') {
            if (!canStepRotate) return;
            targetRotationY += step;
            canStepRotate = false;
        } else if (e.key === 'ArrowLeft') {
            if (!canStepRotate) return;
            targetRotationY -= step;
            canStepRotate = false;
        }
    });

    const loader = new THREE.GLTFLoader();
    loader.load(
        'box4.glb',
        function (gltf) {
            helmet = gltf.scene;

            const box = new THREE.Box3().setFromObject(helmet);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);

            helmet.position.sub(center);

            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                const distance = 2.4;
                const fov = camera.fov * (Math.PI / 180);
                const visibleHeight = 2 * Math.tan(fov / 2) * distance;
                const scale = (visibleHeight * 0.4) / maxDim;
                helmet.scale.setScalar(scale);
            }

            helmet.traverse(function (child) {
                if (child.isMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(function (mat) {
                        mat.side = THREE.FrontSide;
                        mat.transparent = false;
                        mat.opacity = 1.0;
                        if ('metalness' in mat) mat.metalness = 1.0;
                        if ('roughness' in mat) mat.roughness = 1.0;
                        // if ('envMapIntensity' in mat) mat.envMapIntensity = 1.0;
                        // if ('emissive' in mat) {
                        //     mat.emissive = new THREE.Color(0x222222);
                        //     mat.emissiveIntensity = 0.3;
                        // }
                    });
                }
            });

            scene.add(helmet);
            // start from current orientation
            targetRotationY = helmet.rotation.y;
        },
        undefined,
        function (error) {
            console.error('Error loading mandalorian_helmet.glb:', error);
        }
    );

    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function animate() {
    requestAnimationFrame(animate);

    if (helmet) {
        // Smoothly ease towards the target rotation
        const diff = targetRotationY - helmet.rotation.y;
        if (Math.abs(diff) < 0.001) {
            // snap to final angle and re‑enable next step
            helmet.rotation.y = targetRotationY;
            canStepRotate = true;
        } else {
            helmet.rotation.y += diff * 0.15;
        }
    }

    renderer.render(scene, camera);
}