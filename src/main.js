import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import hdriUrl from '@pmndrs/assets/hdri/lobby.exr.js';
import { drawMuralCanvas } from './mural.js';

/* -------------------------------------------------------------------------- */
/*  Tunables — kept together so lighting/mood can be dialled in quickly.        */
/* -------------------------------------------------------------------------- */
const CFG = {
  wallRadius: 18,
  wallHeight: 12,
  wallArc: Math.PI * 1.05,      // ~189° of curved panorama
  ceilingY: 7.7,
  exposure: 0.88,
  envIntensity: 0.7,
  fogColor: 0x6a5836,
  fogDensity: 0.009,
  bloom: { strength: 0.24, radius: 0.6, threshold: 0.95 },
  camera: { base: new THREE.Vector3(0, 3.15, 9.4) },
};

/* -------------------------------------------------------------------------- */
/*  Renderer / scene / camera                                                   */
/* -------------------------------------------------------------------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CFG.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(CFG.fogColor, CFG.fogDensity);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.copy(CFG.camera.base);

const lookTarget = new THREE.Vector3(0, 3.95, -CFG.wallRadius);
const LOOK_BASE_Y = 3.95;

/* -------------------------------------------------------------------------- */
/*  Loading manager -> loader bar                                               */
/* -------------------------------------------------------------------------- */
const manager = new THREE.LoadingManager();
const loaderFill = document.getElementById('loader-fill');
const loaderEl = document.getElementById('loader');
manager.onProgress = (_u, loaded, total) => {
  if (loaderFill) loaderFill.style.width = `${Math.round((loaded / total) * 100)}%`;
};

/* -------------------------------------------------------------------------- */
/*  Environment (HDRI) for IBL + reflections                                    */
/* -------------------------------------------------------------------------- */
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

new EXRLoader(manager).load(hdriUrl, (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const envMap = pmrem.fromEquirectangular(texture).texture;
  scene.environment = envMap;
  scene.environmentIntensity = CFG.envIntensity;
  scene.environmentRotation = new THREE.Euler(0, Math.PI, 0); // push the HDRI's bright window behind camera
  texture.dispose();
  pmrem.dispose();
});

// Warm graded background behind the architecture.
{
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 16; bgCanvas.height = 256;
  const bctx = bgCanvas.getContext('2d');
  const bg = bctx.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#1a130a');
  bg.addColorStop(0.5, '#2a2013');
  bg.addColorStop(1, '#0d0a06');
  bctx.fillStyle = bg; bctx.fillRect(0, 0, 16, 256);
  const bgTex = new THREE.CanvasTexture(bgCanvas);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex;
}

/* -------------------------------------------------------------------------- */
/*  Curved mural wall                                                           */
/* -------------------------------------------------------------------------- */
function makeMuralTexture() {
  return new Promise((resolve) => {
    // Prefer a real reference photo if the user has supplied one.
    const img = new Image();
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      resolve(t);
    };
    img.onerror = () => {
      const t = new THREE.CanvasTexture(drawMuralCanvas());
      t.colorSpace = THREE.SRGBColorSpace;
      resolve(t);
    };
    img.src = './textures/mural.jpg';
  });
}

let muralMat;
const muralTexture = await makeMuralTexture();
muralTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
muralTexture.wrapS = THREE.ClampToEdgeWrapping;
muralTexture.wrapT = THREE.ClampToEdgeWrapping;

const wallGeo = new THREE.CylinderGeometry(
  CFG.wallRadius, CFG.wallRadius, CFG.wallHeight, 160, 1, true,
  Math.PI - CFG.wallArc / 2, CFG.wallArc,   // arc centred on the front (-z)
);
muralMat = new THREE.MeshStandardMaterial({
  map: muralTexture,
  side: THREE.BackSide,
  roughness: 0.92,
  metalness: 0.04,
  emissive: 0xffffff,
  emissiveMap: muralTexture,
  emissiveIntensity: 0.3,   // painted panels read as evenly self-lit, like the reference
  envMapIntensity: 0.35,
});
const wall = new THREE.Mesh(wallGeo, muralMat);
wall.position.y = CFG.wallHeight / 2;
wall.receiveShadow = true;
scene.add(wall);

/* -------------------------------------------------------------------------- */
/*  Reflective marble floor  (real mirror of the mural + PBR marble overlay)    */
/* -------------------------------------------------------------------------- */
const floorGeo = new THREE.CircleGeometry(CFG.wallRadius, 128);

const reflector = new Reflector(floorGeo, {
  clipBias: 0.003,
  textureWidth: Math.min(2048, window.innerWidth * window.devicePixelRatio),
  textureHeight: Math.min(2048, window.innerHeight * window.devicePixelRatio),
  color: 0x38342a, // dims the mirror so it reads as polished stone, not glass
});
reflector.rotation.x = -Math.PI / 2;
reflector.position.y = 0.0;
scene.add(reflector);

// Marble/veining overlay: gold-flecked polished stone with clearcoat sheen.
function makeMarbleMaps() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#b9a877';
  x.fillRect(0, 0, 1024, 1024);
  // radial geometric gold inlay lines, echoing the reference floor
  x.strokeStyle = 'rgba(210,176,96,0.5)';
  x.lineWidth = 1.4;
  const cx = 512, cy = 512;
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    x.beginPath();
    x.moveTo(cx, cy);
    x.lineTo(cx + Math.cos(ang) * 760, cy + Math.sin(ang) * 760);
    x.stroke();
  }
  for (let r = 60; r < 760; r += 74) {
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.stroke();
  }
  // faint marble veins
  x.strokeStyle = 'rgba(120,96,50,0.18)';
  for (let i = 0; i < 60; i++) {
    x.beginPath();
    let px = Math.random() * 1024, py = Math.random() * 1024;
    x.moveTo(px, py);
    for (let s = 0; s < 6; s++) {
      px += (Math.random() - 0.5) * 180;
      py += (Math.random() - 0.5) * 180;
      x.lineTo(px, py);
    }
    x.lineWidth = Math.random() * 1.5;
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const rough = new THREE.CanvasTexture(c);
  return { color: tex, rough };
}
const marbleMaps = makeMarbleMaps();
const marbleMat = new THREE.MeshPhysicalMaterial({
  map: marbleMaps.color,
  color: 0xcbb98a,
  roughness: 0.36,
  metalness: 0.0,
  clearcoat: 1.0,
  clearcoatRoughness: 0.3,
  envMapIntensity: 0.3,
  transparent: true,
  opacity: 0.8,            // lets the mirror beneath show through
  depthWrite: false,
});
const marble = new THREE.Mesh(floorGeo, marbleMat);
marble.rotation.x = -Math.PI / 2;
marble.position.y = 0.012;
marble.receiveShadow = true;
scene.add(marble);

/* -------------------------------------------------------------------------- */
/*  Recessed ceiling + pulsing ring light                                       */
/* -------------------------------------------------------------------------- */
const ceilingGroup = new THREE.Group();
ceilingGroup.position.y = CFG.ceilingY;
scene.add(ceilingGroup);

// solid gilded ceiling plane
const ceilMat = new THREE.MeshStandardMaterial({ color: 0x6f5a30, roughness: 0.5, metalness: 0.8, side: THREE.DoubleSide });
const ceiling = new THREE.Mesh(new THREE.CircleGeometry(CFG.wallRadius, 96), ceilMat);
ceiling.rotation.x = Math.PI / 2;
ceilingGroup.add(ceiling);

// concentric recessed cove
const coveMat = new THREE.MeshStandardMaterial({ color: 0x4a3c20, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide });
const cove = new THREE.Mesh(new THREE.RingGeometry(4.2, 6.4, 96), coveMat);
cove.rotation.x = Math.PI / 2;
cove.position.y = -0.02;
ceilingGroup.add(cove);

// the glowing ring
const ringMat = new THREE.MeshStandardMaterial({
  color: 0xfff0d2, emissive: 0xffdfa0, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.2,
});
const ring = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.16, 24, 160), ringMat);
ring.rotation.x = Math.PI / 2;
ring.position.y = -0.05;
ceilingGroup.add(ring);

// inner soft disc glow
const ringGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe6b8, transparent: true, opacity: 0.14, side: THREE.DoubleSide });
const ringGlow = new THREE.Mesh(new THREE.CircleGeometry(5.2, 64), ringGlowMat);
ringGlow.rotation.x = Math.PI / 2;
ringGlow.position.y = -0.06;
ceilingGroup.add(ringGlow);

// small recessed downlights around the ring (emissive dots, like the reference)
const spotDots = [];
const dotGeo = new THREE.SphereGeometry(0.09, 12, 12);
const dotMat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe9c2, emissiveIntensity: 3.0 });
for (let i = 0; i < 14; i++) {
  const a = (i / 14) * Math.PI * 2;
  const d = new THREE.Mesh(dotGeo, dotMat());
  d.position.set(Math.cos(a) * 6.9, -0.08, Math.sin(a) * 6.9);
  ceilingGroup.add(d);
  spotDots.push(d);
}

// physical light from the ring so it actually illuminates the room (soft, not a hotspot)
const ringLight = new THREE.PointLight(0xffe1ab, 5, 70, 1.4);
ringLight.position.set(0, CFG.ceilingY - 0.4, 0);
scene.add(ringLight);

const fillLight = new THREE.HemisphereLight(0xfff2d8, 0x3a2f18, 0.4);
scene.add(fillLight);
const ambient = new THREE.AmbientLight(0xfff0d6, 0.35);
scene.add(ambient);

/* -------------------------------------------------------------------------- */
/*  Mouse-follow spotlight sweeping the wall/floor                              */
/* -------------------------------------------------------------------------- */
const followSpot = new THREE.SpotLight(0xffe8c4, 90, 55, Math.PI / 7, 0.9, 1.1);
followSpot.position.set(0, 7.5, 3);
followSpot.castShadow = true;
followSpot.shadow.mapSize.set(1024, 1024);
followSpot.shadow.bias = -0.0005;
const followTarget = new THREE.Object3D();
followTarget.position.set(0, 3.5, -CFG.wallRadius + 1);
scene.add(followTarget);
followSpot.target = followTarget;
scene.add(followSpot);

/* -------------------------------------------------------------------------- */
/*  Interactive display pedestals (hover/click micro-interactions)              */
/* -------------------------------------------------------------------------- */
const parallaxGroup = new THREE.Group();
scene.add(parallaxGroup);

const interactive = [];
const pedestalDefs = [
  { x: -7.2, z: 4.3, label: 'Bags', color: 0x9c7b3a },
  { x: 0.0, z: 5.6, label: 'Belts', color: 0xb08a42 },
  { x: 7.2, z: 4.3, label: 'Shoes', color: 0x8a6c34 },
];

for (const def of pedestalDefs) {
  const group = new THREE.Group();
  group.position.set(def.x, 0, def.z);

  const colMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1712, roughness: 0.35, metalness: 0.4, clearcoat: 0.6 });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 1.5, 48), colMat);
  column.position.y = 0.75;
  column.castShadow = true;
  column.receiveShadow = true;
  group.add(column);

  // glowing top plate — the interactive target
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xf3dfa8, emissive: 0xc79a45, emissiveIntensity: 0.35, roughness: 0.25, metalness: 1.0,
  });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 48), plateMat);
  plate.position.y = 1.55;
  plate.castShadow = true;
  group.add(plate);

  // a simple gilded product form on top (abstract luxe object)
  const objMat = new THREE.MeshPhysicalMaterial({ color: def.color, roughness: 0.22, metalness: 1.0, clearcoat: 0.8, envMapIntensity: 1.6 });
  const obj = new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.07, 120, 16), objMat);
  obj.position.y = 1.95;
  obj.castShadow = true;
  group.add(obj);

  group.userData = {
    label: def.label,
    plate, obj, plateMat, objMat,
    baseEmissive: 0.35,
    hover: 0,          // eased 0..1 hover amount
    click: 0,          // decaying click pulse
    spin: Math.random() * Math.PI,
  };
  interactive.push(group);
  parallaxGroup.add(group);
}

/* -------------------------------------------------------------------------- */
/*  Post-processing (bloom + gamma)                                             */
/* -------------------------------------------------------------------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  CFG.bloom.strength, CFG.bloom.radius, CFG.bloom.threshold,
);
composer.addPass(bloom);
composer.addPass(new ShaderPass(GammaCorrectionShader));

/* -------------------------------------------------------------------------- */
/*  Pointer / interaction state                                                 */
/* -------------------------------------------------------------------------- */
const pointer = new THREE.Vector2(0, 0);      // -1..1
const pointerEased = new THREE.Vector2(0, 0);
const raycaster = new THREE.Raycaster();
let lastInteract = performance.now();
let hovered = null;

const tooltip = document.getElementById('tooltip');

// invisible planes to intersect for the follow-spot target
const wallPlane = new THREE.Mesh(
  new THREE.CylinderGeometry(CFG.wallRadius - 0.1, CFG.wallRadius - 0.1, CFG.wallHeight, 32, 1, true, Math.PI - CFG.wallArc / 2, CFG.wallArc),
  new THREE.MeshBasicMaterial({ visible: false, side: THREE.BackSide }),
);
wallPlane.position.y = CFG.wallHeight / 2;
scene.add(wallPlane);

function onPointerMove(e) {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  lastInteract = performance.now();

  // hover test against interactive plates/objects
  raycaster.setFromCamera(pointer, camera);
  const targets = [];
  for (const g of interactive) { targets.push(g.userData.plate, g.userData.obj); }
  const hits = raycaster.intersectObjects(targets, false);
  const g = hits.length ? findGroup(hits[0].object) : null;
  if (g !== hovered) {
    hovered = g;
    document.body.classList.toggle('is-hovering', !!g);
  }
  if (g && tooltip) {
    tooltip.textContent = g.userData.label;
    tooltip.style.left = `${e.clientX}px`;
    tooltip.style.top = `${e.clientY}px`;
    tooltip.classList.add('is-visible');
  } else if (tooltip) {
    tooltip.classList.remove('is-visible');
  }
}
function findGroup(obj) {
  return interactive.find((g) => g.userData.plate === obj || g.userData.obj === obj) || null;
}
function onClick() {
  if (hovered) hovered.userData.click = 1.0;
}
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerdown', () => (lastInteract = performance.now()));
window.addEventListener('click', onClick);

/* -------------------------------------------------------------------------- */
/*  Resize                                                                      */
/* -------------------------------------------------------------------------- */
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

/* -------------------------------------------------------------------------- */
/*  Reveal                                                                      */
/* -------------------------------------------------------------------------- */
function reveal() {
  if (loaderFill) loaderFill.style.width = '100%';
  setTimeout(() => {
    loaderEl && loaderEl.classList.add('is-hidden');
    document.body.classList.add('is-ready');
  }, 350);
}

/* -------------------------------------------------------------------------- */
/*  Animation loop                                                              */
/* -------------------------------------------------------------------------- */
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
let started = false;

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // ease pointer for silky parallax
  pointerEased.x = damp(pointerEased.x, pointer.x, 3.0, dt);
  pointerEased.y = damp(pointerEased.y, pointer.y, 3.0, dt);

  // idle drift: when the user is still, gently sway the camera
  const idle = Math.min(1, (performance.now() - lastInteract) / 2600);
  const driftX = Math.sin(t * 0.16) * 0.55 + Math.sin(t * 0.37) * 0.18;
  const driftY = Math.cos(t * 0.21) * 0.22;

  const targetX = CFG.camera.base.x + pointerEased.x * 1.7 * (1 - idle * 0.35) + driftX * idle;
  const targetY = CFG.camera.base.y + pointerEased.y * 0.9 * (1 - idle * 0.35) + driftY * idle + Math.sin(t * 0.5) * 0.05;
  const targetZ = CFG.camera.base.z - Math.abs(pointerEased.y) * 0.4;

  camera.position.x = damp(camera.position.x, targetX, 2.2, dt);
  camera.position.y = damp(camera.position.y, targetY, 2.2, dt);
  camera.position.z = damp(camera.position.z, targetZ, 2.2, dt);

  // eased look target with a touch of parallax (background moves slower)
  lookTarget.x = damp(lookTarget.x, pointerEased.x * 2.4, 2.0, dt);
  lookTarget.y = damp(lookTarget.y, LOOK_BASE_Y + pointerEased.y * 1.2, 2.0, dt);
  camera.lookAt(lookTarget);

  // parallax on the foreground pedestals — they move MORE than the wall
  parallaxGroup.position.x = damp(parallaxGroup.position.x, -pointerEased.x * 0.9, 3.0, dt);
  parallaxGroup.position.z = damp(parallaxGroup.position.z, pointerEased.y * 0.5, 3.0, dt);

  // mouse-follow spotlight: project pointer onto the wall
  raycaster.setFromCamera(pointerEased, camera);
  const hit = raycaster.intersectObject(wallPlane, false)[0];
  if (hit) {
    followTarget.position.lerp(hit.point, 0.12);
    followSpot.position.x = damp(followSpot.position.x, hit.point.x * 0.4, 3.0, dt);
  }

  // pulsing ceiling ring + dots
  const pulse = 1.9 + Math.sin(t * 1.1) * 0.55;
  ringMat.emissiveIntensity = pulse;
  ringGlowMat.opacity = 0.10 + Math.sin(t * 1.1) * 0.05;
  ringLight.intensity = 4.5 + Math.sin(t * 1.1) * 1.5;
  for (let i = 0; i < spotDots.length; i++) {
    spotDots[i].material.emissiveIntensity = 2.6 + Math.sin(t * 1.1 + i) * 0.5;
  }

  // interactive hover/click easing (200-400ms ease-out feel via damping)
  for (const g of interactive) {
    const d = g.userData;
    const targetHover = hovered === g ? 1 : 0;
    d.hover = damp(d.hover, targetHover, 8.0, dt);        // ~250ms
    d.click = Math.max(0, d.click - dt * 3.0);            // ~330ms decay
    const glow = d.baseEmissive + d.hover * 1.6 + d.click * 2.5;
    d.plateMat.emissiveIntensity = glow;
    d.objMat.emissiveIntensity = d.hover * 0.6 + d.click * 1.2;
    d.objMat.emissive = new THREE.Color(0xffcf7a);
    const s = 1 + d.hover * 0.06 + d.click * 0.12;
    g.scale.setScalar(damp(g.scale.x, s, 10, dt));
    d.spin += dt * (0.3 + d.hover * 0.8);
    d.obj.rotation.y = d.spin;
    d.obj.position.y = 1.95 + Math.sin(t * 1.5 + d.spin) * 0.03 + d.hover * 0.05;
  }

  composer.render();

  if (!started) { started = true; reveal(); }
}
animate();

// Expose a couple of handles for the screenshot/tuning harness.
window.__scene = { scene, camera, renderer, CFG, muralMat, marbleMat, bloom };
