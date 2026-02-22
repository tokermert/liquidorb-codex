import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const VERTEX_PATCH = `
uniform float uTime;
uniform float uBlob;
uniform float uDetail;
uniform float uRoundness;
uniform float uSeed;
uniform float uSpeed;
varying float vNoise;

float field(vec3 p) {
  return sin(p.x) * cos(p.y) * sin(p.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 5; i++) {
    value += amp * field(p);
    p = p * 2.02 + vec3(12.7, 8.3, 4.2);
    amp *= 0.5;
  }
  return value;
}
`;

const FRAGMENT_PATCH = `
uniform float uTime;
uniform float uIridescenceBoost;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
varying float vNoise;
`;

export class OrbEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.progress = 0;
    this.state = null;
    this.shader = null;

    this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
    this.camera.position.set(0, 0.08, 3.65);

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
    this.renderer.toneMappingExposure = 1.22;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.5, 0.22);
    this.composer.addPass(this.bloomPass);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.08).texture;
    room.dispose();
    pmrem.dispose();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.66;
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 6.8;
    this.controls.target.set(0, 0, 0);

    this.deformUniforms = {
      uTime: { value: 0 },
      uBlob: { value: 0.5 },
      uDetail: { value: 1.2 },
      uRoundness: { value: 1.0 },
      uSeed: { value: 0.25 },
      uSpeed: { value: 0.7 },
      uIridescenceBoost: { value: 1.2 },
      uColorA: { value: new THREE.Color("#b2f5ff") },
      uColorB: { value: new THREE.Color("#f3cdff") },
      uColorC: { value: new THREE.Color("#fff4d2") },
    };

    this.material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.02,
      roughness: 0.1,
      transmission: 0.98,
      thickness: 1.75,
      ior: 1.34,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 1,
      iridescenceIOR: 1.3,
      reflectivity: 1,
      attenuationDistance: 0.56,
      attenuationColor: new THREE.Color("#d7f2ff"),
    });

    this.material.onBeforeCompile = (shader) => {
      this.shader = shader;
      Object.assign(shader.uniforms, this.deformUniforms);

      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${VERTEX_PATCH}`)
        .replace(
          "#include <begin_vertex>",
          `
          vec3 transformed = vec3(position);
          float angle = uTime * 6.28318530718 * max(uSpeed, 0.0001);
          vec3 loopVec = vec3(cos(angle), sin(angle), cos(angle * 0.67));
          vec3 dir = normalize(position);
          float n = fbm(dir * uDetail + loopVec + vec3(uSeed * 25.0));
          float wave = sin((position.y + uTime * 6.28318530718) * 6.0 + n * 4.0) * 0.15;
          float amp = uBlob * 0.3;
          transformed = dir * (1.0 + n * amp + wave * amp * 0.45) * uRoundness;
          vNoise = n;
          `,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${FRAGMENT_PATCH}`)
        .replace(
          "vec4 diffuseColor = vec4( diffuse, opacity );",
          `
          float waveBand = sin((vNoise + uTime * 1.7) * 10.0) * 0.5 + 0.5;
          vec3 grad = mix(uColorA, uColorB, smoothstep(-0.42, 0.68, vNoise));
          grad = mix(grad, uColorC, waveBand * 0.58);
          vec4 diffuseColor = vec4(grad, opacity);
          `,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `
          #include <emissivemap_fragment>
          totalEmissiveRadiance += (uColorA + uColorB + uColorC) * 0.045 * uIridescenceBoost;
          `,
        );
    };
    this.material.customProgramCacheKey = () => "liquid-orb-v2";

    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 8), this.material);
    this.scene.add(this.orb);

    this.innerCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.86, 56, 56),
      new THREE.MeshBasicMaterial({
        color: "#d7eeff",
        transparent: true,
        opacity: 0.08,
      }),
    );
    this.scene.add(this.innerCore);

    this.rimLight = new THREE.DirectionalLight(0xaed5ff, 1.85);
    this.rimLight.position.set(2.8, 1.1, 3.1);
    this.scene.add(this.rimLight);

    this.fillLight = new THREE.DirectionalLight(0xffe6ff, 0.72);
    this.fillLight.position.set(-2.1, -1.0, -2.7);
    this.scene.add(this.fillLight);

    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    window.addEventListener("resize", this.resize);

    this.resize();
    this.tick();
  }

  setState(nextState) {
    this.state = nextState;

    this.material.roughness = nextState.roughness;
    this.material.transmission = nextState.transmission;
    this.material.thickness = nextState.thickness;
    this.material.iridescence = THREE.MathUtils.clamp(nextState.iridescence * 0.52, 0, 1);
    this.material.iridescenceIOR = 1.15 + nextState.iridescence * 0.2;
    this.material.attenuationColor.set(nextState.colorB);
    this.material.attenuationDistance = THREE.MathUtils.lerp(0.35, 1.25, 1 - nextState.roughness);

    this.deformUniforms.uBlob.value = nextState.blob;
    this.deformUniforms.uDetail.value = nextState.detail;
    this.deformUniforms.uRoundness.value = nextState.roundness;
    this.deformUniforms.uSeed.value = nextState.seed;
    this.deformUniforms.uSpeed.value = nextState.speed;
    this.deformUniforms.uIridescenceBoost.value = nextState.iridescence;
    this.deformUniforms.uColorA.value.set(nextState.colorA);
    this.deformUniforms.uColorB.value.set(nextState.colorB);
    this.deformUniforms.uColorC.value.set(nextState.colorC);

    this.bloomPass.strength = 0.18 + nextState.glow * 1.8;
    this.bloomPass.radius = 0.32 + nextState.blob * 0.46;
    this.bloomPass.threshold = 0.22;

    this.innerCore.material.color.set(nextState.colorA);
    this.innerCore.material.opacity = THREE.MathUtils.clamp(0.04 + nextState.glow * 0.11, 0.04, 0.17);

    this.orb.scale.setScalar(nextState.size);
    this.innerCore.scale.setScalar(nextState.size * 0.9);

    if (nextState.bgTransparent) {
      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 0);
    } else {
      this.scene.background = new THREE.Color(0x050b16);
      this.renderer.setClearColor(0x050b16, 1);
    }
  }

  getCanvas() {
    return this.renderer.domElement;
  }

  forceRender() {
    this.controls.update();
    this.composer.render();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = parent.clientWidth;
    const height = parent.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width * dpr, height * dpr);

    this.forceRender();
  }

  tick() {
    const delta = this.clock.getDelta();
    if (this.state) {
      if (this.state.animate) {
        const loop = Math.max(this.state.loopDuration, 0.001);
        this.progress = (this.progress + delta / loop) % 1;
      }
      this.deformUniforms.uTime.value = this.state.animate ? this.progress : 0;
    }

    this.orb.rotation.y += delta * 0.13;
    this.innerCore.rotation.y -= delta * 0.06;
    this.controls.update();
    this.composer.render();
    requestAnimationFrame(this.tick);
  }
}
