import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const vertexShader = `
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  varying float vNoise;

  uniform float uTime;
  uniform float uBlob;
  uniform float uDetail;
  uniform float uRoundness;
  uniform float uSeed;
  uniform float uSpeed;

  float field(vec3 p) {
    return sin(p.x) * cos(p.y) * sin(p.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 5; i++) {
      value += amp * field(p);
      p = p * 2.03 + vec3(12.83, 7.31, 3.17);
      amp *= 0.5;
    }
    return value;
  }

  void main() {
    float angle = uTime * 6.28318530718 * max(uSpeed, 0.0001);
    vec3 loopVec = vec3(cos(angle), sin(angle), cos(angle * 0.5));
    vec3 p = normalize(position) * uRoundness * uDetail;
    float n = fbm(p + loopVec + vec3(uSeed * 10.0));
    float amp = uBlob * 0.48;
    vec3 displaced = normalize(position) * (1.0 + n * amp);

    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vNoise = n;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = `
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  varying float vNoise;

  uniform float uTime;
  uniform float uIridescence;
  uniform float uGlow;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  void main() {
    vec3 normal = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.8);
    float band = sin((vNoise + vWorldPos.y * 0.6 + uTime * 6.0) * 9.0) * 0.5 + 0.5;
    float flow = smoothstep(-0.4, 0.75, vNoise);

    vec3 base = mix(uColorA, uColorB, flow);
    base = mix(base, uColorC, band * 0.58);

    vec3 sheen = vec3(0.92, 0.97, 1.08) * fresnel * uIridescence;
    vec3 rim = vec3(0.7, 0.9, 1.2) * smoothstep(0.45, 1.0, fresnel) * uGlow;

    vec3 color = base + sheen + rim;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export class OrbEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.progress = 0;
    this.state = null;

    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0.1, 4.1);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.25;
    this.controls.maxDistance = 7;
    this.controls.target.set(0, 0, 0);

    const uniforms = {
      uTime: { value: 0 },
      uBlob: { value: 0.5 },
      uDetail: { value: 1.2 },
      uRoundness: { value: 1.0 },
      uSeed: { value: 0.25 },
      uSpeed: { value: 0.75 },
      uIridescence: { value: 1.0 },
      uGlow: { value: 0.35 },
      uColorA: { value: new THREE.Color("#9fe8ff") },
      uColorB: { value: new THREE.Color("#ffc8fa") },
      uColorC: { value: new THREE.Color("#fff5cc") },
    };

    const geometry = new THREE.IcosahedronGeometry(1, 6);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
    });

    this.orb = new THREE.Mesh(geometry, material);
    this.scene.add(this.orb);

    this.glowBack = new THREE.Mesh(
      new THREE.SphereGeometry(1.08, 48, 48),
      new THREE.MeshBasicMaterial({
        color: "#8adfff",
        transparent: true,
        opacity: 0.08,
      }),
    );
    this.scene.add(this.glowBack);

    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.tick();
  }

  setState(nextState) {
    this.state = nextState;
    const uniforms = this.orb.material.uniforms;

    uniforms.uBlob.value = nextState.blob;
    uniforms.uDetail.value = nextState.detail;
    uniforms.uRoundness.value = nextState.roundness;
    uniforms.uSeed.value = nextState.seed;
    uniforms.uSpeed.value = nextState.speed;
    uniforms.uIridescence.value = nextState.iridescence;
    uniforms.uGlow.value = nextState.glow;
    uniforms.uColorA.value.set(nextState.colorA);
    uniforms.uColorB.value.set(nextState.colorB);
    uniforms.uColorC.value.set(nextState.colorC);

    this.orb.scale.setScalar(nextState.size);
    this.glowBack.scale.setScalar(nextState.size * 1.03);
    this.glowBack.material.opacity = THREE.MathUtils.clamp(nextState.glow * 0.2, 0.04, 0.28);

    if (nextState.bgTransparent) {
      this.renderer.setClearColor(0x000000, 0);
    } else {
      this.renderer.setClearColor(0x060d18, 1);
    }
  }

  getCanvas() {
    return this.renderer.domElement;
  }

  getSize() {
    return this.renderer.getSize(new THREE.Vector2());
  }

  forceRender() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const { clientWidth, clientHeight } = this.canvas.parentElement;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.forceRender();
  }

  tick() {
    const delta = this.clock.getDelta();
    if (this.state) {
      if (this.state.animate) {
        const loop = Math.max(this.state.loopDuration, 0.001);
        this.progress = (this.progress + delta / loop) % 1;
      }
      this.orb.material.uniforms.uTime.value = this.state.animate ? this.progress : 0.0;
    }

    this.orb.rotation.y += delta * 0.15;
    this.glowBack.rotation.y += delta * 0.08;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.tick);
  }
}
