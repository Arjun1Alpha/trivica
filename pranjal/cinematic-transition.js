/**
 * Cinematic WebGL Environment Transition
 * --------------------------------------
 * Blends two environments (HDRI or procedural) while keeping a center product fixed.
 * Transition is triggered by scroll/section change and animated with GSAP.
 *
 * TRANSITION LOGIC: See triggerTransition() and the uBlend uniform used in:
 * - backgroundShader (fullscreen quad)
 * - productEnvBlend material (optional, for consistent reflections)
 *
 * To use real HDRI environments: pass envMapAUrl and envMapBUrl (e.g. .hdr).
 * Include Three.js PMREMGenerator (from examples) and RGBELoader if using HDRIs.
 */

(function (global) {
    'use strict';

    var THREE = global.THREE;
    if (!THREE) {
        console.error('CinematicTransition: Three.js required');
        return;
    }

    /**
     * Create a simple procedural cubemap from 6 face colors (for demo when no HDRI).
     * @param {Object} faceColors - { px, nx, py, ny, pz, nz } each a hex number or CSS color
     * @returns {THREE.CubeTexture}
     */
    function createProceduralCubemap(faceColors) {
        var order = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
        var canvases = [];
        var size = 256;
        for (var i = 0; i < 6; i++) {
            var canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            var ctx = canvas.getContext('2d');
            var col = faceColors[order[i]] != null ? faceColors[order[i]] : 0x444444;
            if (typeof col === 'number') {
                var r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
                col = 'rgb(' + r + ',' + g + ',' + b + ')';
            }
            var gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
            gradient.addColorStop(0, col);
            gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, size, size);
            canvases.push(canvas);
        }
        var cubeTexture = new THREE.CubeTexture(canvases);
        cubeTexture.needsUpdate = true;
        return cubeTexture;
    }

    /**
     * CinematicTransition constructor.
     * @param {Object} opts
     * @param {HTMLElement} opts.container - Mount point for canvas
     * @param {string} [opts.envMapAUrl] - HDRI URL for environment A (optional)
     * @param {string} [opts.envMapBUrl] - HDRI URL for environment B (optional)
     * @param {number} [opts.transitionDuration=1.5] - Blend duration in seconds
     * @param {string} [opts.productType='torus'] - 'torus' | 'sphere' | 'box'
     * @param {Function} [opts.onReady] - Called when both env maps are loaded
     */
    function CinematicTransition(opts) {
        opts = opts || {};
        this.container = opts.container;
        this.transitionDuration = opts.transitionDuration != null ? opts.transitionDuration : 1.5;
        this.onReady = opts.onReady || function () {};
        this.productType = opts.productType || 'torus';

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.envMapA = null;
        this.envMapB = null;
        this.uniforms = null;
        this.productMesh = null;
        this.backgroundQuad = null;
        this.clock = new THREE.Clock();
        this.blendValue = 0;
        this.isTransitioning = false;
        this.useHDRI = !!(opts.envMapAUrl && opts.envMapBUrl);
        this.envMapAUrl = opts.envMapAUrl;
        this.envMapBUrl = opts.envMapBUrl;

        if (!this.container) {
            console.error('CinematicTransition: container required');
            return;
        }

        this._init();
    }

    CinematicTransition.prototype._init = function () {
        var self = this;
        var w = this.container.clientWidth || window.innerWidth;
        var h = this.container.clientHeight || window.innerHeight;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h);
        this.renderer.setClearColor(0x0a0a0a, 1);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
        this.camera.position.set(0, 0, 4.5);
        this.camera.lookAt(0, 0, 0);

        this.uniforms = {
            uBlend: { type: 'f', value: 0 },
            uEnvMapA: { type: 't', value: null },
            uEnvMapB: { type: 't', value: null }
        };

        if (this.useHDRI && typeof THREE.RGBELoader !== 'undefined') {
            this._loadHDRIs();
        } else {
            this._createProceduralEnvs();
        }
    };

    CinematicTransition.prototype._createProceduralEnvs = function () {
        var self = this;
        // Scene A: warm interior
        this.envMapA = createProceduralCubemap({
            px: 0xc4a574, nx: 0x8b7355, py: 0xe8dcc8, ny: 0x2a2520,
            pz: 0xa89070, nz: 0x6b5d4f
        });
        // Scene B: cool exterior
        this.envMapB = createProceduralCubemap({
            px: 0x87ceeb, nx: 0x4a6fa5, py: 0xb0d4e8, ny: 0x1a2a3a,
            pz: 0x6ba3c4, nz: 0x3d5a6c
        });
        this.uniforms.uEnvMapA.value = this.envMapA;
        this.uniforms.uEnvMapB.value = this.envMapB;
        this._buildScene();
        this.onReady();
    };

    CinematicTransition.prototype._loadHDRIs = function () {
        var self = this;
        var loader = new THREE.RGBELoader();
        var PMREMGenerator = new THREE.PMREMGenerator(self.renderer);
        PMREMGenerator.compileEquirectangularShader();

        var loaded = 0;
        function onBothLoaded() {
            loaded++;
            if (loaded === 2) {
                self.uniforms.uEnvMapA.value = self.envMapA;
                self.uniforms.uEnvMapB.value = self.envMapB;
                self._buildScene();
                self.onReady();
            }
        }

        loader.load(self.envMapAUrl, function (hdr) {
            self.envMapA = PMREMGenerator.fromEquirectangular(hdr).texture;
            hdr.dispose();
            onBothLoaded();
        });
        loader.load(self.envMapBUrl, function (hdr) {
            self.envMapB = PMREMGenerator.fromEquirectangular(hdr).texture;
            hdr.dispose();
            onBothLoaded();
        });
    };

    CinematicTransition.prototype._buildScene = function () {
        var self = this;

        // ---- Background: fullscreen quad blending two env maps ----
        var bgVertex = [
            'varying vec3 vDirection;',
            'void main() {',
            '  vDirection = position;',
            '  gl_Position = vec4(position.xy, 1.0, 1.0);',
            '}'
        ].join('\n');
        var bgFragment = [
            '#extension GL_OES_standard_derivatives : enable',
            'precision highp float;',
            'varying vec3 vDirection;',
            'uniform samplerCube uEnvMapA;',
            'uniform samplerCube uEnvMapB;',
            'uniform float uBlend;',
            'void main() {',
            '  vec3 dir = normalize(vDirection);',
            '  vec4 a = textureCube(uEnvMapA, dir);',
            '  vec4 b = textureCube(uEnvMapB, dir);',
            '  float t = clamp(uBlend, 0.0, 1.0);',
            '  gl_FragColor = mix(a, b, t);',
            '}'
        ].join('\n');

        var bgMat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: bgVertex,
            fragmentShader: bgFragment,
            depthWrite: false,
            depthTest: false,
            side: THREE.BackSide
        });
        var bgGeo = new THREE.BoxBufferGeometry(1, 1, 1);
        this.backgroundQuad = new THREE.Mesh(bgGeo, bgMat);
        this.backgroundQuad.scale.setScalar(100);
        this.scene.add(this.backgroundQuad);

        // ---- Center product: fixed in middle, reflections blend with env ----
        var productGeo;
        if (this.productType === 'sphere') {
            productGeo = new THREE.SphereBufferGeometry(0.6, 64, 64);
        } else if (this.productType === 'box') {
            productGeo = new THREE.BoxBufferGeometry(0.9, 0.9, 0.9);
        } else {
            productGeo = new THREE.TorusBufferGeometry(0.5, 0.2, 32, 64);
        }

        var productVertex = [
            'varying vec3 vNormal;',
            'varying vec3 vPosition;',
            'void main() {',
            '  vNormal = normalize(normalMatrix * normal);',
            '  vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;',
            '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
            '}'
        ].join('\n');
        var productFragment = [
            'precision highp float;',
            'varying vec3 vNormal;',
            'varying vec3 vPosition;',
            'uniform samplerCube uEnvMapA;',
            'uniform samplerCube uEnvMapB;',
            'uniform float uBlend;',
            'void main() {',
            '  vec3 N = normalize(vNormal);',
            '  vec3 V = normalize(-vPosition);',
            '  vec3 R = reflect(V, N);',
            '  vec4 a = textureCube(uEnvMapA, R);',
            '  vec4 b = textureCube(uEnvMapB, R);',
            '  float t = clamp(uBlend, 0.0, 1.0);',
            '  vec3 env = mix(a.rgb, b.rgb, t);',
            '  float fresnel = pow(1.0 - max(dot(V, N), 0.0), 2.0);',
            '  env = mix(vec3(0.15), env, 0.7 + 0.3 * fresnel);',
            '  gl_FragColor = vec4(env, 1.0);',
            '}'
        ].join('\n');

        var productMat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: productVertex,
            fragmentShader: productFragment,
            side: THREE.FrontSide
        });
        this.productMesh = new THREE.Mesh(productGeo, productMat);
        this.productMesh.position.set(0, 0, 0);
        this.scene.add(this.productMesh);

        // Subtle fill light so product stays visible in both envs
        var ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);
        var key = new THREE.DirectionalLight(0xffffff, 0.5);
        key.position.set(2, 2, 2);
        this.scene.add(key);

        this._animate();
    };

    CinematicTransition.prototype._animate = function () {
        var self = this;
        requestAnimationFrame(function () { self._animate(); });
        var dt = this.clock.getDelta();
        if (this.productMesh) {
            this.productMesh.rotation.y += dt * 0.15;
        }
        this.renderer.render(this.scene, this.camera);
    };

    /**
     * TRANSITION LOGIC: Trigger environment morph from current to next.
     * Animates uBlend 0 -> 1 over transitionDuration using GSAP.
     */
    CinematicTransition.prototype.triggerTransition = function (callback) {
        if (this.isTransitioning) return;
        var self = this;
        this.isTransitioning = true;
        var u = this.uniforms.uBlend;
        var fromVal = u.value;
        var toVal = 1;

        if (typeof global.TweenLite !== 'undefined') {
            global.TweenLite.to(u, this.transitionDuration, {
                value: toVal,
                ease: 'Power2.easeInOut',
                onComplete: function () {
                    self.isTransitioning = false;
                    self.blendValue = toVal;
                    if (callback) callback();
                }
            });
        } else {
            var start = performance.now();
            function tick(now) {
                var elapsed = (now - start) / 1000;
                var t = Math.min(elapsed / self.transitionDuration, 1);
                t = t * t * (3 - 2 * t);
                u.value = fromVal + (toVal - fromVal) * t;
                if (t < 1) requestAnimationFrame(tick);
                else {
                    self.isTransitioning = false;
                    self.blendValue = toVal;
                    if (callback) callback();
                }
            }
            requestAnimationFrame(tick);
        }
    };

    /**
     * Trigger transition back (blend 1 -> 0).
     */
    CinematicTransition.prototype.triggerTransitionBack = function (callback) {
        if (this.isTransitioning) return;
        var self = this;
        this.isTransitioning = true;
        var u = this.uniforms.uBlend;
        var fromVal = u.value;
        var toVal = 0;

        if (typeof global.TweenLite !== 'undefined') {
            global.TweenLite.to(u, this.transitionDuration, {
                value: toVal,
                ease: 'Power2.easeInOut',
                onComplete: function () {
                    self.isTransitioning = false;
                    self.blendValue = toVal;
                    if (callback) callback();
                }
            });
        } else {
            var start = performance.now();
            function tick(now) {
                var elapsed = (now - start) / 1000;
                var t = Math.min(elapsed / self.transitionDuration, 1);
                t = t * t * (3 - 2 * t);
                u.value = fromVal + (toVal - fromVal) * t;
                if (t < 1) requestAnimationFrame(tick);
                else {
                    self.isTransitioning = false;
                    self.blendValue = toVal;
                    if (callback) callback();
                }
            }
            requestAnimationFrame(tick);
        }
    };

    /**
     * Set blend directly (0 = env A, 1 = env B). Useful for scroll-linked progress.
     */
    CinematicTransition.prototype.setBlend = function (value) {
        this.uniforms.uBlend.value = Math.max(0, Math.min(1, value));
        this.blendValue = this.uniforms.uBlend.value;
    };

    CinematicTransition.prototype.resize = function () {
        var w = this.container.clientWidth || window.innerWidth;
        var h = this.container.clientHeight || window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    };

    CinematicTransition.prototype.destroy = function () {
        if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        if (this.envMapA && this.envMapA.dispose) this.envMapA.dispose();
        if (this.envMapB && this.envMapB.dispose) this.envMapB.dispose();
    };

    global.CinematicTransition = CinematicTransition;
})(typeof window !== 'undefined' ? window : this);
