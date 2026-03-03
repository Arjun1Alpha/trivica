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
            reveal += edgeGrain;

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
    object.position.set(0, 0, 0);
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