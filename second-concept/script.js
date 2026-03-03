const displacementSlider = function(opts) {

    let vertex = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `;

    // 10 different transition patterns, selected by uniform effectIndex (0–9)
    let fragment = `
        
        varying vec2 vUv;

        uniform sampler2D currentImage;
        uniform sampler2D nextImage;

        uniform float dispFactor;
        uniform float effectIndex;

        float rand(vec2 co) {
            return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
        }

        void main() {

            vec2 uv = vUv;
            vec4 fromTex = texture2D(currentImage, uv);
            vec4 toTex   = texture2D(nextImage, uv);

            float t = smoothstep(0.0, 1.0, dispFactor);
            float mask = 0.0;

            // 0: vertical wipe (left -> right)
            if (effectIndex < 0.5) {
                mask = step(uv.x, t);
            }
            // 1: horizontal wipe (top -> bottom)
            else if (effectIndex < 1.5) {
                mask = step(uv.y, t);
            }
            // 2: diagonal wipe (top-left -> bottom-right)
            else if (effectIndex < 2.5) {
                float d = (uv.x + uv.y) * 0.5;
                mask = step(d, t);
            }
            // 3: radial circle from center
            else if (effectIndex < 3.5) {
                vec2 center = vec2(0.5);
                float dist = distance(uv, center);
                mask = step(dist, t * 1.5);
            }
            // 4: checkerboard squares
            else if (effectIndex < 4.5) {
                float tiles = 20.0;
                vec2 cell = floor(uv * tiles);
                float cb = mod(cell.x + cell.y, 2.0);
                float threshold = t * 2.0;
                mask = step(cb, threshold);
            }
            // 5: noise dissolve
            else if (effectIndex < 5.5) {
                float n = rand(uv * 100.0);
                mask = step(n, t);
            }
            // 6: vertical blinds
            else if (effectIndex < 6.5) {
                float bands = 20.0;
                float band = floor(uv.x * bands);
                float phase = band / bands;
                mask = step(uv.y, t * (1.0 + phase));
            }
            // 7: horizontal blinds
            else if (effectIndex < 7.5) {
                float bands = 20.0;
                float band = floor(uv.y * bands);
                float phase = band / bands;
                mask = step(uv.x, t * (1.0 + phase));
            }
            // 8: small triangles
            else if (effectIndex < 8.5) {
                float tiles = 40.0;
                vec2 scaled = uv * tiles;
                vec2 cell   = floor(scaled);
                vec2 local  = fract(scaled);

                float checker = mod(cell.x + cell.y, 2.0);
                float edge;
                if (checker < 0.5) {
                    edge = local.x + local.y;
                } else {
                    edge = local.x + (1.0 - local.y);
                }

                mask = step(edge, t * 2.0);
            }
            // 9: original water-like displacement
            else {
                float intensity = 0.3;
                vec4 orig1 = texture2D(currentImage, uv);
                vec4 orig2 = texture2D(nextImage, uv);
                vec4 displacedFrom = texture2D(currentImage, vec2(uv.x, uv.y + dispFactor * (orig2.r * intensity)));
                vec4 displacedTo   = texture2D(nextImage, vec2(uv.x, uv.y + (1.0 - dispFactor) * (orig1.r * intensity)));
                vec4 finalTexture = mix(displacedFrom, displacedTo, dispFactor);
                gl_FragColor = finalTexture;
                return;
            }

            vec4 finalTexture = mix(fromTex, toTex, clamp(mask, 0.0, 1.0));
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
        1,
        1000
    );

    camera.position.z = 1;

    let mat = new THREE.ShaderMaterial({
        uniforms: {
            dispFactor:   { type: "f", value: 0.0 },
            effectIndex:  { type: "f", value: 8.0 }, // default: small triangles
            currentImage: { type: "t", value: sliderImages[0] },
            nextImage:    { type: "t", value: sliderImages[1] },
        },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        opacity: 1.0
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

            TweenLite.to( mat.uniforms.dispFactor, 1, {
                value: 1,
                ease: 'Expo.easeInOut',
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

            TweenLite.fromTo( slideTitleEl, 0.5,
                { autoAlpha: 1, y: 0 },
                {
                    autoAlpha: 0,
                    y: 20,
                    ease: 'Expo.easeIn',
                    onComplete: function () {
                        slideTitleEl.innerHTML = nextSlideTitle;
                        TweenLite.to( slideTitleEl, 0.5, { autoAlpha: 1, y: 0 });
                    }
                });

            TweenLite.fromTo( slideStatusEl, 0.5,
                { autoAlpha: 1, y: 0 },
                {
                    autoAlpha: 0,
                    y: 20,
                    ease: 'Expo.easeIn',
                    onComplete: function () {
                        slideStatusEl.innerHTML = nextSlideStatus;
                        TweenLite.to( slideStatusEl, 0.5, { autoAlpha: 1, y: 0, delay: 0.1 });
                    }
                });
        }

        pagButtons.forEach( (el) => {

            el.addEventListener('click', function() {
                let slideId = parseInt( this.dataset.slide, 10 );
                goToSlide(slideId);
            });

        });

        // Keyboard: Arrow Left = previous, Arrow Right = next
        window.addEventListener('keydown', function(e) {
            let n = parseInt(e.key, 10);
            if (!isNaN(n) && n >= 0 && n <= 9 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                mat.uniforms.effectIndex.value = n;
                return;
            }
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