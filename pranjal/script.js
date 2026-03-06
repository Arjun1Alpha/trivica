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

    float hash11(float n) {
        return fract(sin(n) * 43758.5453123);
    }
    float hash21(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    vec2 hash22(vec2 p) {
        return fract(sin(vec2(
            dot(p, vec2(127.1, 311.7)),
            dot(p, vec2(269.5, 183.3))
        )) * 43758.5453);
    }

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
    float lineDist(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
    }
    float triangleGrid(vec2 uv, float scale, float lineWidth) {
        vec2 g = uv * scale;
        float pw = lineWidth;
        vec2 cell  = floor(g);
        vec2 local = fract(g);
        float d = 1.0;
        d = min(d, lineDist(local, vec2(0.0,0.0), vec2(1.0,0.0)));
        d = min(d, lineDist(local, vec2(0.0,0.0), vec2(0.0,1.0)));
        d = min(d, lineDist(local, vec2(1.0,0.0), vec2(0.0,1.0)));
        d = min(d, lineDist(local, vec2(1.0,0.0), vec2(1.0,1.0)));
        d = min(d, lineDist(local, vec2(0.0,1.0), vec2(1.0,1.0)));
        return 1.0 - smoothstep(pw * 0.5, pw * 1.5, d);
    }

    void main() {
        vec2 uv = vUv;
        float zoom = 0.8;
        uv = (uv - 0.5) * zoom + 0.5;

        float t = smoothstep(0.0, 1.0, dispFactor);
        float biasBL = (1.0 - uv.x) * (1.0 - uv.y);
        float biasBR = uv.x * (1.0 - uv.y);
        float biasTL = (1.0 - uv.x) * uv.y;
        float biasTR = uv.x * uv.y;
        float cornerBias = max(max(biasBL, biasBR), max(biasTL, biasTR));
        float tEff = min(1.0, t * (0.93 + 0.27 * cornerBias));

        // Multi-scale block grid
        float cols1 = 20.0; float rows1 = 12.0;
        float cols2 = 40.0; float rows2 = 22.0;
        float cols3 = 80.0; float rows3 = 45.0;
        vec2 cell1 = floor(uv * vec2(cols1, rows1));
        vec2 cell2 = floor(uv * vec2(cols2, rows2));
        vec2 cell3 = floor(uv * vec2(cols3, rows3));
        float yBias1 = cell1.y / (rows1 - 1.0);
        float yBias2 = cell2.y / (rows2 - 1.0);
        float yBias3 = cell3.y / (rows3 - 1.0);
        float bias = 0.55;
        float thresh1 = mix(hash21(cell1), yBias1, bias);
        float thresh2 = mix(hash21(cell2), yBias2, bias);
        float thresh3 = mix(hash21(cell3), yBias3, bias);
        float r = hash21(uv * 999.0 + 0.5);
        float thresh;
        if (r < 0.25) thresh = thresh1;
        else if (r < 0.65) thresh = thresh2;
        else thresh = thresh3;
        float edge = 0.04;
        float maskBlocks = smoothstep(thresh - edge, thresh + edge, tEff);

        // Noise + triangle grid (boxes)
        float n  = noise(uv * 4.0)  * 0.5;
        n += noise(uv * 8.0)  * 0.25;
        n += noise(uv * 16.0) * 0.125;
        n += noise(uv * 32.0) * 0.0625;
        float reveal = n;
        float edgeGrain = (rand(uv * 220.0) - 0.5) * 0.12 + (rand(uv * 470.0 + 0.5) - 0.5) * 0.06;
        float grid = triangleGrid(uv, 30.0, 0.03);
        reveal += edgeGrain * 0.8 + grid * 0.06;
        float maskBoxes = smoothstep(reveal - 0.14, reveal + 0.14, tEff);

        float mask = clamp((maskBlocks + maskBoxes) * 0.5, 0.0, 1.0);

        vec4 fromColor = texture2D(currentImage, uv);
        vec4 toColor   = texture2D(nextImage, uv);

        gl_FragColor = mix(fromColor, toColor, mask);
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
            let prevSlide = currentSlide;
            currentSlide = slideId;

            const duration = 10.0 + Math.random() * 5.0;

            document.getElementById('pagination').querySelectorAll('.active')[0].className = '';

            const startDelay = Math.random() * 0.4;

            function startTransition() {
                pagButtons[slideId].className = 'active';

                mat.uniforms.nextImage.value = sliderImages[slideId];
                mat.uniforms.nextImage.needsUpdate = true;

                if (window.updateChromeCubeTransition) {
                    window.updateChromeCubeTransition(sliderImages[slideId], duration);
                }
                if (window.rotateChromeCubeOnScroll) {
                    window.rotateChromeCubeOnScroll(prevSlide, slideId, duration);
                }

                TweenLite.to( mat.uniforms.dispFactor, duration, {
                    value: 1,
                    ease: 'Power1.easeInOut',
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

            if (startDelay <= 0.02) {
                startTransition();
            } else {
                TweenLite.delayedCall(startDelay, startTransition);
            }
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
// Same WebGL transition shader as slider (noise + triangle grid reveal) + fake reflection
const CUBE_TRANSITION_VERTEX = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;
const CUBE_TRANSITION_FRAGMENT = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    uniform sampler2D currentImage;
    uniform sampler2D nextImage;
    uniform sampler2D pattern;
    uniform float dispFactor;
    uniform float patternMix;
    uniform float reflectStrength;
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
    float lineDist(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
    }
    
    void main() {
        vec2 uv = vUv;

        // Same triangle/noise transition as the slider
        float t = smoothstep(0.0, 1.0, dispFactor);
        float n  = noise(uv * 4.0)  * 0.5;
        n += noise(uv * 8.0)  * 0.25;
        n += noise(uv * 16.0) * 0.125;
        n += noise(uv * 32.0) * 0.0625;
        float reveal = n;
        float edgeGrain = (rand(uv * 220.0) - 0.5) * 0.12 + (rand(uv * 470.0 + 0.5) - 0.5) * 0.06;

        reveal += edgeGrain * 0.8 ;
        float mask = smoothstep(reveal - 0.14, reveal + 0.14, t);

        vec4 fromTex = texture2D(currentImage, uv);
        vec4 toTex  = texture2D(nextImage, uv);
        vec4 finalColor = mix(fromTex, toTex, mask);

        // Subtle dark pattern overlay only (no reflection)
        vec4 patternTex = texture2D(pattern, uv);
        float patternAlpha = patternTex.a > 0.01 ? patternTex.a : 0.0;
        float darkFactor = patternMix * patternAlpha * 0.18;
        finalColor.rgb = mix(finalColor.rgb, vec3(0.0), darkFactor);

        gl_FragColor = finalColor;
    }
`;

let chromeScene, chromeCamera, chromeRenderer, chromeCube, chromePmremGenerator;
// Base Y rotation (tweened on scroll); cursor follow adds on top
let chromeCubeBase = { y: 0 };
let chromeCubeMouseX = 0;
let chromeCubeMouseY = 0;
// Smoothed values for fluid cursor follow (eased toward mouse targets)
let chromeCubeEasedX = 0;
let chromeCubeEasedY = 0;

// ✅ Accepts sliderImages as a parameter — no more scope error
function initChromeCube(sliderImages) {
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;

    chromeScene = new THREE.Scene();

    chromeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    chromeCamera.position.set(0, 0, 6);

    const ambient = new THREE.AmbientLight(0xffffff, 1);
    chromeScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1, 1);
    chromeScene.add(dirLight);

    chromeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    chromeRenderer.setPixelRatio(window.devicePixelRatio);
    chromeRenderer.setSize(width, height);
    chromeRenderer.domElement.style.position = "fixed";
    chromeRenderer.domElement.style.top = "0";
    chromeRenderer.domElement.style.left = "0";
    chromeRenderer.domElement.style.zIndex = "6";
    chromeRenderer.domElement.style.pointerEvents = "none";
    document.body.appendChild(chromeRenderer.domElement);

    // Cube uses same WebGL transition as slider (noise + triangle reveal) + pattern.png overlay
    const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const firstTex = (sliderImages && sliderImages[0]) ? sliderImages[0] : null;
    const patternLoader = new THREE.TextureLoader();
    const patternTex = patternLoader.load('./pattern.png', function(tex) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2);
        if (chromeCube && chromeCube.material && chromeCube.material.uniforms) {
            var u = chromeCube.material.uniforms;
            u.pattern.value = tex;
            u.patternMix.value = 1.0;
            chromeCube.material.needsUpdate = true;
        }
    });
    const material = new THREE.ShaderMaterial({
        uniforms: {
            dispFactor:   { type: 'f', value: 0.0 },
            currentImage: { type: 't', value: firstTex },
            nextImage:    { type: 't', value: firstTex },
            pattern:      { type: 't', value: patternTex },
            patternMix:   { type: 'f', value: 0.0 },
            reflectStrength: { type: 'f', value: 0.0 }
        },
        vertexShader: CUBE_TRANSITION_VERTEX,
        fragmentShader: CUBE_TRANSITION_FRAGMENT,
        transparent: false,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: true
    });

    chromeCube = new THREE.Mesh(geometry, material);
    chromeScene.add(chromeCube);

    window.addEventListener("resize", onChromeResize, false);
    window.addEventListener("mousemove", onChromeCubeMouseMove, false);
    animateChromeCube();

    // Apply first slide on cube (with transition shader, same image = no transition)
    if (sliderImages && sliderImages[0]) {
        const firstTexture = sliderImages[0];
        if (firstTexture.image) {
            window.updateChromeCubeTransition(firstTexture, 0);
        } else {
            const waitForTexture = setInterval(function () {
                if (firstTexture.image) {
                    clearInterval(waitForTexture);
                    window.updateChromeCubeTransition(firstTexture, 0);
                }
            }, 50);
        }
    }
}

// Rotate cube 360° on Y when slide changes (scroll/click); same duration as transition
window.rotateChromeCubeOnScroll = function (prevSlide, slideId, durationSeconds) {
    if (!chromeCube || durationSeconds <= 0) return;
    var direction = slideId > prevSlide ? 1 : -1;
    var targetY = chromeCubeBase.y + direction * (Math.PI * 2);
    // Enable strong reflection while the cube is rotating
    if (chromeCube.material && chromeCube.material.uniforms && chromeCube.material.uniforms.reflectStrength) {
        chromeCube.material.uniforms.reflectStrength.value = 1.0;
    }
    TweenLite.to(chromeCubeBase, durationSeconds, {
        y: targetY,
        ease: 'Power2.easeInOut',
        onComplete: function () {
            // When rotation stops, go back to pure image (no reflection)
            if (chromeCube.material && chromeCube.material.uniforms && chromeCube.material.uniforms.reflectStrength) {
                chromeCube.material.uniforms.reflectStrength.value = 0.0;
            }
        }
    });
};

// Cursor follow: update target tilt from mouse position (subtle range for smooth look)
function onChromeCubeMouseMove(e) {
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    var nx = (e.clientX / w) - 0.5;  // -0.5 .. 0.5
    var ny = (e.clientY / h) - 0.5;
    chromeCubeMouseX = -ny * 0.35;   // pitch (up/down)
    chromeCubeMouseY = nx * 0.5;    // yaw offset (left/right)
}

// Same WebGL transition on cube: noise + triangle reveal; duration in seconds (0 = instant set)
window.updateChromeCubeTransition = function (tex, durationSeconds) {
    if (!chromeCube || !chromeCube.material || !chromeCube.material.uniforms) return;
    if (!tex) return;

    function applyTransition() {
        var u = chromeCube.material.uniforms;
        u.nextImage.value = tex;
        u.nextImage.needsUpdate = true;

        if (durationSeconds > 0) {
            TweenLite.to(u.dispFactor, durationSeconds, {
                value: 1,
                ease: 'Power2.easeInOut',
                onComplete: function () {
                    u.currentImage.value = tex;
                    u.currentImage.needsUpdate = true;
                    u.dispFactor.value = 0;
                }
            });
        } else {
            u.currentImage.value = tex;
            u.currentImage.needsUpdate = true;
            u.dispFactor.value = 0;
        }
    }

    if (tex.image) {
        applyTransition();
    } else {
        var wait = setInterval(function () {
            if (tex.image) {
                clearInterval(wait);
                applyTransition();
            }
        }, 50);
    }
};

// Set the cube's map to the slide texture (instant, no transition)
window.updateChromeMapFromTexture = function (tex) {
    if (!chromeCube || !chromeCube.material || !tex) return;

    function applyMap() {
        chromeCube.material.map = tex;
        chromeCube.material.needsUpdate = true;
    }

    if (tex.image) {
        applyMap();
    } else {
        const wait = setInterval(function () {
            if (tex.image) {
                clearInterval(wait);
                applyMap();
            }
        }, 50);
    }
};

// Legacy: keep for any external refs; now a no-op (cube uses map, not env)
window.updateChromeEnvFromTexture = function (tex, envResolution) {
    if (!chromeCube) return;
    // Cube now uses map for clear image; env reflection disabled
};

function onChromeResize() {
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;
    if (!chromeCamera || !chromeRenderer) return;
    chromeCamera.aspect = width / height;
    chromeCamera.updateProjectionMatrix();
    chromeRenderer.setSize(width, height);
}

function animateChromeCube() {
    requestAnimationFrame(animateChromeCube);

    if (chromeCube) {
        // Smooth cursor follow: ease both axes toward mouse targets (fluid motion)
        var ease = 0.06;
        chromeCubeEasedX += (chromeCubeMouseX - chromeCubeEasedX) * ease;
        chromeCubeEasedY += (chromeCubeMouseY - chromeCubeEasedY) * ease;
        chromeCube.rotation.x = chromeCubeEasedX;
        chromeCube.rotation.y = chromeCubeBase.y + chromeCubeEasedY;
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
