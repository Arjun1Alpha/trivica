const displacementSlider = function(opts) {

    let vertex = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `;

    // Random places reveal: smooth noise per pixel, no center convergence
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

            // Smooth multi-octave noise: each pixel has random-ish reveal time (0..1)
            // No center, no corners - just random smooth patches
            float n  = noise(uv * 4.0)  * 0.5;
            n += noise(uv * 8.0)  * 0.25;
            n += noise(uv * 16.0) * 0.125;
            n += noise(uv * 32.0) * 0.0625;
            float reveal = n;

            // Texture on the effect: fine grain on the reveal edge so transition isn't too clean/light
            float edgeGrain = (rand(uv * 220.0) - 0.5) * 0.12 + (rand(uv * 470.0 + 0.5) - 0.5) * 0.06;

            // Small triangle shapes, only influencing the transition edge (not the images)
            float triScale = 30.0;
            vec2 gridUV = uv * triScale;
            vec2 cellId = floor(gridUV);
            vec2 local = fract(gridUV);

            // Two triangle orientations inside each cell
            float tri1 = step(local.x + local.y, 1.0);
            float tri2 = step((1.0 - local.x) + local.y, 1.0);

            // Randomly pick orientation per cell, then remap 0..1 -> -1..1
            float triMix = step(0.5, rand(cellId));
            float triShape = mix(tri1, tri2, triMix) * 2.0 - 1.5;

            // Combine edge grain and small triangles into the reveal threshold
            float triAmp = 0.02;
            reveal += edgeGrain * 0.8 + triShape * triAmp;

            // Wider soft edge for a smoother, slower-feeling blend
            float mask = smoothstep(reveal - 0.14, reveal + 0.14, t);

            vec4 fromTex = texture2D(currentImage, uv);
            vec4 toTex   = texture2D(nextImage, uv);
            vec4 finalTexture = mix(fromTex, toTex, mask);
            gl_FragColor = finalTexture;

        }
    `;

    let images = opts.images, image, sliderImages = [];;
    let parent = opts.parent;

    // Make canvas exactly the screen size
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
    scene.background = new THREE.Color( 0x23272A );
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

    // Center cube model (cube.glb) in front of slider
    let cubeModel = null;

    // Basic lighting so the model is visible
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
        transparent: false,   // treat as opaque so depth works normally
        depthWrite: true,
        depthTest: true
    });

    let geometry = new THREE.PlaneBufferGeometry(
        parent.offsetWidth,
        parent.offsetHeight,
        1
    );
    let object = new THREE.Mesh(geometry, mat);
    object.position.set(0, 0, -10);  // slider plane behind so cube can show on top
    scene.add(object);

    // Load and center cube.glb model
    let gltfLoader = new THREE.GLTFLoader();
    gltfLoader.load('cube.glb', function(gltf) {
        cubeModel = gltf.scene;

        // Compute bounding box to scale model to ~25% of the shortest screen dimension
        let box = new THREE.Box3().setFromObject(cubeModel);
        let size = new THREE.Vector3();
        box.getSize(size);
        let maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0.0) {
            let target = Math.min(parent.offsetWidth, parent.offsetHeight) * 0.25;
            let scale = target / maxDim;
            cubeModel.scale.set(scale, scale, scale);
        }

        // Recenter model so its bounding box center is at the origin
        let center = new THREE.Vector3();
        box.getCenter(center);
        cubeModel.position.sub(center);

        // Move to screen center, slightly in front of slider
        cubeModel.position.z = 0;
        cubeModel.renderOrder = 1;  // draw after slider so cube appears on top

        scene.add(cubeModel);
    });

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

            const duration = 3.2;

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

            // Fade out text at start; swap content off-screen; fade in new text only when effect is showing (second half)
            TweenLite.to( slideTitleEl, duration * 0.15, { autoAlpha: 0, y: 15, ease: 'Power2.easeIn' });
            TweenLite.to( slideStatusEl, duration * 0.15, { autoAlpha: 0, y: 15, ease: 'Power2.easeIn' });

            TweenLite.delayedCall( duration * 0.2, function() {
                slideTitleEl.innerHTML = nextSlideTitle;
                slideStatusEl.innerHTML = nextSlideStatus;
            });

            // Start fading in new text at 45% of effect, finish near end — same time as new image is revealing
            TweenLite.to( slideTitleEl, duration * 0.5, { autoAlpha: 1, y: 0, delay: duration * 0.45, ease: 'Power2.easeOut' });
            TweenLite.to( slideStatusEl, duration * 0.5, { autoAlpha: 1, y: 0, delay: duration * 0.5, ease: 'Power2.easeOut' });
        }

        pagButtons.forEach( (el) => {

            el.addEventListener('click', function() {
                let slideId = parseInt( this.dataset.slide, 10 );
                goToSlide(slideId);
            });

        });

        // Keyboard: Arrow Left = previous, Arrow Right = next
        window.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goToSlide(currentSlide - 1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                goToSlide(currentSlide + 1);
            }
        });

        // Mouse wheel / scroll: down = next, up = previous (with cooldown)
        parent.addEventListener('wheel', function(e) {
            e.preventDefault();
            if (isAnimating) return;
            if (wheelCooldown > 0) return;
            wheelCooldown = 1;
            setTimeout(function() { wheelCooldown = 0; }, 800);
            if (e.deltaY > 0) goToSlide(currentSlide + 1);
            else if (e.deltaY < 0) goToSlide(currentSlide - 1);
        }, { passive: false });

        // Touch swipe: left/right to change slide
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

        // Rotate cube slowly so it feels alive
        if (cubeModel) {
            cubeModel.rotation.y += 0.01;
        }

        renderer.render(scene, camera);
    };
    animate();
};

imagesLoaded( document.querySelectorAll('img'), () => {

    document.body.classList.remove('loading');

    const el = document.getElementById('slider');
    const imgs = Array.from(el.querySelectorAll('img'));
    new displacementSlider({
        parent: el,
        images: imgs
    });

});

// Fallback: if loader overlay never clears (e.g. images slow/fail), remove it only.
// Do not re-init slider to avoid double canvas and updateMatrixWorld errors.
setTimeout(function () {
    if (document.body.classList.contains('loading')) {
        document.body.classList.remove('loading');
    }
}, 5000);