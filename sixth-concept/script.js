const displacementSlider = function(opts) {

    let vertex = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `;

    let fragment = `
        
        varying vec2 vUv;

        uniform sampler2D currentImage;
        uniform sampler2D nextImage;

        uniform float dispFactor;

        float rand(vec2 co) {
            return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = rand(i);
            float b = rand(i + vec2(1.0, 0.0));
            float c = rand(i + vec2(0.0, 1.0));
            float d = rand(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {

            vec2 uv = vUv;
            float t = smoothstep(0.0, 1.0, dispFactor);

            float n  = noise(uv * 4.0)  * 0.5;
            n += noise(uv * 8.0)  * 0.25;
            n += noise(uv * 16.0) * 0.125;
            n += noise(uv * 32.0) * 0.0625;
            float reveal = n;

            float edgeGrain = (rand(uv * 220.0) - 0.5) * 0.12 + (rand(uv * 470.0 + 0.5) - 0.5) * 0.06;

            float triScale = 30.0;
            vec2 gridUV = uv * triScale;
            vec2 cellId = floor(gridUV);
            vec2 local = fract(gridUV);

            float tri1 = step(local.x + local.y, 1.0);
            float tri2 = step((1.0 - local.x) + local.y, 1.0);

            float triMix = step(0.5, rand(cellId));
            float triShape = mix(tri1, tri2, triMix) * 2.0 - 1.5;

            float triAmp = 0.02;
            reveal += edgeGrain * 0.8 + triShape * triAmp;

            float mask = smoothstep(reveal - 0.14, reveal + 0.14, t);

            vec4 fromTex = texture2D(currentImage, uv);
            vec4 toTex   = texture2D(nextImage, uv);
            vec4 finalTexture = mix(fromTex, toTex, mask);
            gl_FragColor = finalTexture;

        }
    `;

    let images = opts.images, image, sliderImages = [];
    let parent = opts.parent;

    let renderW = window.innerWidth || document.documentElement.clientWidth;
    let renderH = window.innerHeight || document.documentElement.clientHeight;

    let renderer = new THREE.WebGLRenderer({
        antialias: false,
    });

    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setClearColor( 0x23272A, 1.0 );
    renderer.setSize( renderW, renderH );
    parent.appendChild( renderer.domElement );

    let loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    images.forEach( ( img ) => {
        image = loader.load( img.getAttribute( 'src' ) + '?v=' + Date.now() );
        image.magFilter = image.minFilter = THREE.LinearFilter;
        image.anisotropy = renderer.capabilities.getMaxAnisotropy();
        sliderImages.push( image );
    });

    let scene = new THREE.Scene();
    let camera = new THREE.OrthographicCamera(
        renderW / -2,
        renderW / 2,
        renderH / 2,
        renderH / -2,
        0.1,
        1000
    );

    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, -100);

    let ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    let dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);

    let mat = new THREE.ShaderMaterial({
        uniforms: {
            dispFactor:   { type: "f", value: 0.0 },
            currentImage: { type: "t", value: sliderImages[0] },
            nextImage:    { type: "t", value: sliderImages[1] },
        },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: false,
        depthWrite: true,
        depthTest: true
    });

    let geometry = new THREE.PlaneBufferGeometry(
        parent.offsetWidth,
        parent.offsetHeight,
        1
    );
    let object = new THREE.Mesh(geometry, mat);
    object.position.set(0, 0, -10);
    scene.add(object);

    let addEvents = function(){

        let pagButtons = Array.from(document.getElementById('pagination').querySelectorAll('button'));
        let isAnimating = false;
        let currentSlide = 0;
        let totalSlides = pagButtons.length;
        let wheelCooldown = 0;
        let touchStartX = 0;

        function goToSlide(slideId) {
            if (isAnimating) return;
            slideId = Math.max(0, Math.min(slideId, totalSlides - 1));
            if (slideId === currentSlide) return;

            isAnimating = true;
            currentSlide = slideId;

            document.getElementById('pagination').querySelectorAll('.active')[0].className = '';
            pagButtons[slideId].className = 'active';

            mat.uniforms.nextImage.value = sliderImages[slideId];
            mat.uniforms.nextImage.needsUpdate = true;

            if (window.updateChromeEnvFromTexture) {
                window.updateChromeEnvFromTexture(sliderImages[slideId]);
            }

            const duration = 5.5;
            if (window.startChromeCubeSpin) {
                window.startChromeCubeSpin(duration * 1000);
            }

            TweenLite.to( mat.uniforms.dispFactor, duration, {
                value: 1,
                ease: 'Power2.easeInOut',
                onComplete: function () {
                    mat.uniforms.currentImage.value = sliderImages[slideId];
                    mat.uniforms.currentImage.needsUpdate = true;
                    mat.uniforms.dispFactor.value = 0.0;
                    isAnimating = false;
                }
            });

            let slideTitleEl = document.getElementById('slide-title');
            let slideStatusEl = document.getElementById('slide-status');
            let nextSlideTitle = document.querySelectorAll(`[data-slide-title="${slideId}"]`)[0].innerHTML;
            let nextSlideStatus = document.querySelectorAll(`[data-slide-status="${slideId}"]`)[0].innerHTML;

            TweenLite.to( slideTitleEl, duration * 0.15, { autoAlpha: 0, y: 15, ease: 'Power2.easeIn' });
            TweenLite.to( slideStatusEl, duration * 0.15, { autoAlpha: 0, y: 15, ease: 'Power2.easeIn' });

            TweenLite.delayedCall( duration * 0.2, function() {
                slideTitleEl.innerHTML = nextSlideTitle;
                slideStatusEl.innerHTML = nextSlideStatus;
            });

            TweenLite.to( slideTitleEl, duration * 0.5, { autoAlpha: 1, y: 0, delay: duration * 0.45, ease: 'Power2.easeOut' });
            TweenLite.to( slideStatusEl, duration * 0.5, { autoAlpha: 1, y: 0, delay: duration * 0.5, ease: 'Power2.easeOut' });
        }

        pagButtons.forEach( (el) => {
            el.addEventListener('click', function() {
                let slideId = parseInt( this.dataset.slide, 10 );
                goToSlide(slideId);
            });
        });

        window.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goToSlide(currentSlide - 1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                goToSlide(currentSlide + 1);
            }
        });

        parent.addEventListener('wheel', function(e) {
            e.preventDefault();
            if (isAnimating) return;
            if (wheelCooldown > 0) return;
            wheelCooldown = 1;
            setTimeout(function() { wheelCooldown = 0; }, 800);
            if (e.deltaY > 0) goToSlide(currentSlide + 1);
            else if (e.deltaY < 0) goToSlide(currentSlide - 1);
        }, { passive: false });

        parent.addEventListener('touchstart', function(e) {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        parent.addEventListener('touchend', function(e) {
            if (e.changedTouches.length === 0) return;
            let touchEndX = e.changedTouches[0].clientX;
            let deltaX = touchStartX - touchEndX;
            const minSwipe = 60;
            if (deltaX > minSwipe) goToSlide(currentSlide + 1);
            else if (deltaX < -minSwipe) goToSlide(currentSlide - 1);
        }, { passive: true });

    };

    addEvents();

    window.addEventListener( 'resize' , function(e) {
        renderW = window.innerWidth || document.documentElement.clientWidth;
        renderH = window.innerHeight || document.documentElement.clientHeight;
        renderer.setSize(renderW, renderH);
        camera.left = renderW / -2;
        camera.right = renderW / 2;
        camera.top = renderH / 2;
        camera.bottom = renderH / -2;
        camera.updateProjectionMatrix();
    });

    let animate = function() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    };
    animate();

    // ✅ Return sliderImages so initChromeCube can use the first texture
    return { sliderImages: sliderImages };
};

// ---- Chrome cube in its own canvas (second renderer) ----

let chromeScene, chromeCamera, chromeRenderer, chromeCube, chromePmremGenerator;
let cubeSpinStartY   = 0;
let cubeSpinTargetY  = 0;
let cubeSpinStartTime = 0;
let cubeSpinDuration  = 0;
let cubeSpinning      = false;
// Mouse‑driven target tilt for the cube
let cubeMouseTargetX = 0;
let cubeMouseTargetY = 0;

// ✅ Accepts sliderImages as a parameter — no more scope error
function initChromeCube(sliderImages) {
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;

    chromeScene = new THREE.Scene();

    chromeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    chromeCamera.position.set(0, 0, 6);

    chromeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    chromeRenderer.setPixelRatio(window.devicePixelRatio);
    chromeRenderer.setSize(width, height);
    chromeRenderer.domElement.style.position = "fixed";
    chromeRenderer.domElement.style.top = "0";
    chromeRenderer.domElement.style.left = "0";
    chromeRenderer.domElement.style.zIndex = "2";
    chromeRenderer.domElement.style.pointerEvents = "none";
    document.body.appendChild(chromeRenderer.domElement);

    // PMREM generator to convert 2D slide textures into env maps
    chromePmremGenerator = new THREE.PMREMGenerator(chromeRenderer);
    chromePmremGenerator.compileEquirectangularShader();

    // Slightly larger cube so it reads better over the background
    const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const material = new THREE.MeshPhysicalMaterial({
        metalness: 1,
        roughness: 0,
        envMapIntensity: 1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.5
    });

    chromeCube = new THREE.Mesh(geometry, material);
    chromeScene.add(chromeCube);

    window.addEventListener("resize", onChromeResize, false);
    window.addEventListener("mousemove", onChromeMouseMove, false);
    animateChromeCube();

    // ✅ Apply initial reflection from first slide texture on load
    if (sliderImages && sliderImages[0]) {
        const firstTexture = sliderImages[0];
        if (firstTexture.image) {
            // Already loaded — apply immediately
            window.updateChromeEnvFromTexture(firstTexture);
        } else {
            // Still loading — poll until the image data is ready
            const waitForTexture = setInterval(function () {
                if (firstTexture.image) {
                    clearInterval(waitForTexture);
                    window.updateChromeEnvFromTexture(firstTexture);
                }
            }, 50);
        }
    }
}

// Expose a helper so the slider can trigger a 360° spin on Y (slow–fast–slow)
window.startChromeCubeSpin = function (durationMs) {
    if (!chromeCube) return;
    cubeSpinStartY = chromeCube.rotation.y;
    cubeSpinTargetY = cubeSpinStartY + Math.PI * 2;
    cubeSpinStartTime = performance.now();
    cubeSpinDuration = durationMs || 2200;
    cubeSpinning = true;
};

// Expose a helper so the slider can update the cube's reflections
window.updateChromeEnvFromTexture = function (tex) {
    if (!chromeScene || !chromePmremGenerator || !tex) return;

    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.encoding = THREE.sRGBEncoding;

    const envRT = chromePmremGenerator.fromEquirectangular(tex);
    const envMap = envRT.texture;

    chromeScene.environment = envMap;

    if (chromeCube && chromeCube.material) {
        chromeCube.material.envMap = envMap;
        chromeCube.material.needsUpdate = true;
    }
};

function onChromeResize() {
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;
    if (!chromeCamera || !chromeRenderer) return;
    chromeCamera.aspect = width / height;
    chromeCamera.updateProjectionMatrix();
    chromeRenderer.setSize(width, height);
}

// Update mouse target angles so the cube smoothly follows pointer movement
function onChromeMouseMove(e) {
    const width  = window.innerWidth  || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;
    const nx = (e.clientX / width)  - 0.5; // -0.5 .. 0.5
    const ny = (e.clientY / height) - 0.5; // -0.5 .. 0.5

    // Map mouse to a gentle tilt range
    cubeMouseTargetY = nx * 0.6;   // yaw left/right
    cubeMouseTargetX = -ny * 0.4;  // pitch up/down
}

function animateChromeCube() {
    requestAnimationFrame(animateChromeCube);

    if (chromeCube) {
        // Smoothly ease cube towards mouse‑driven tilt
        chromeCube.rotation.x += (cubeMouseTargetX - chromeCube.rotation.x) * 0.06;

        // Slow auto‑rotation around Y when not in a 360° spin
        if (!cubeSpinning) {
            chromeCube.rotation.y += 0.003;
        }
    }

    if (cubeSpinning && chromeCube) {
        const now = performance.now();
        const t = Math.min(1, (now - cubeSpinStartTime) / cubeSpinDuration);
        // easeInOutSine
        const eased = 0.5 * (1 - Math.cos(Math.PI * t));
        chromeCube.rotation.y = cubeSpinStartY + (cubeSpinTargetY - cubeSpinStartY) * eased;
        if (t >= 1) {
            cubeSpinning = false;
            chromeCube.rotation.y = cubeSpinTargetY;
        }
    }

    if (chromeRenderer && chromeScene && chromeCamera) {
        chromeRenderer.render(chromeScene, chromeCamera);
    }
}

imagesLoaded( document.querySelectorAll('img'), () => {

    document.body.classList.remove('loading');

    const el = document.getElementById('slider');
    const imgs = Array.from(el.querySelectorAll('img'));

    // ✅ Capture returned sliderImages and pass directly into initChromeCube
    const slider = new displacementSlider({ parent: el, images: imgs });
    initChromeCube(slider.sliderImages);

});

// Fallback: if loader overlay never clears, remove it only.
setTimeout(function () {
    if (document.body.classList.contains('loading')) {
        document.body.classList.remove('loading');
    }
}, 5000);
