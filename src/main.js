import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import hdriUrl from '@pmndrs/assets/hdri/lobby.exr.js';
import { drawMuralCanvas } from './mural.js';

/* -------------------------------------------------------------------------- */
/*  Tunables — kept together so lighting/mood can be dialled in quickly.        */
/* -------------------------------------------------------------------------- */
const CFG = {
  wallRadius: 18,
  wallHeight: 12,
  wallArc: Math.PI * 0.82,      // ~148° — fits more of the mural's cast in frame
  ceilingY: 7.7,
  exposure: 0.85,
  envIntensity: 0.7,
  fogColor: 0x6a5836,
  fogDensity: 0.009,
  bloom: { strength: 0.16, radius: 0.6, threshold: 0.96 },
  camera: { base: new THREE.Vector3(0, 3.4, 10.8) },
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

const lookTarget = new THREE.Vector3(0, 3.7, -CFG.wallRadius);
const LOOK_BASE_Y = 3.7;

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

// Procedural interior environment — used if the HDRI can't load (e.g. a strict
// sandbox CSP blocking the data-URI loader). No assets, so it always works.
function useProceduralEnv() {
  const env = new RoomEnvironment();
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  scene.environmentIntensity = CFG.envIntensity;
  env.dispose?.();
}
try {
  new EXRLoader(manager).load(
    hdriUrl,
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const envMap = pmrem.fromEquirectangular(texture).texture;
      scene.environment = envMap;
      scene.environmentIntensity = CFG.envIntensity;
      scene.environmentRotation = new THREE.Euler(0, Math.PI, 0); // push the HDRI's bright window behind camera
      texture.dispose();
    },
    undefined,
    () => useProceduralEnv(),
  );
} catch (e) {
  useProceduralEnv();
}

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
// The uploaded reference (public/MURAL.jpeg) is the whole room. Crop just the
// painted wall band so our own 3D ceiling + floor frame it, instead of mapping
// a room-inside-a-room. Fractions are of the source image (1536x1024).
const MURAL_CROP = { top: 0.185, bottom: 0.795, left: 0.0, right: 1.0 };

function textureFromImage(img) {
  const sx = img.width * MURAL_CROP.left;
  const sy = img.height * MURAL_CROP.top;
  const sw = img.width * (MURAL_CROP.right - MURAL_CROP.left);
  const sh = img.height * (MURAL_CROP.bottom - MURAL_CROP.top);
  const c = document.createElement('canvas');
  c.width = Math.round(sw);
  c.height = Math.round(sh);
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeMuralTexture() {
  return new Promise((resolve) => {
    // Prefer an inlined data URI (single-file/artifact build), then the real
    // reference photo, then the procedural recreation.
    const candidates = [window.__MURAL_DATA_URI, './MURAL.jpeg', './textures/mural.jpg'].filter(Boolean);
    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) {
        const t = new THREE.CanvasTexture(drawMuralCanvas());
        t.colorSpace = THREE.SRGBColorSpace;
        resolve({ tex: t, real: false });
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ tex: textureFromImage(img), real: true });
      img.onerror = () => { i++; tryNext(); };
      img.src = candidates[i];
    };
    tryNext();
  });
}

let muralMat;
const { tex: muralTexture, real: muralIsReal } = await makeMuralTexture();
muralTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
muralTexture.wrapS = THREE.ClampToEdgeWrapping;
muralTexture.wrapT = THREE.ClampToEdgeWrapping;
// the cylinder's inner (BackSide) faces mirror U — flip it so the panorama
// reads in its true left-to-right order (panther left, snake/tree right).
muralTexture.repeat.x = -1;
muralTexture.offset.x = 1;

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
  // the real photo already carries its own light, so it needs little self-glow
  emissiveIntensity: muralIsReal ? 0.07 : 0.3,
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

// Smoothly turned gilded ceiling with a rounded recessed cove (no hard CAD edges).
// Profile is (radius, y) revolved; short arcs keep every transition beveled.
function arc(pts, cx, cy, r, a0, a1, steps) {
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
}
const ceilProfile = [];
ceilProfile.push(new THREE.Vector2(0.0, 0.34));           // recessed centre panel
ceilProfile.push(new THREE.Vector2(3.7, 0.34));
arc(ceilProfile, 3.7, 0.12, 0.22, Math.PI / 2, 0, 8);     // rounded lip down into cove
ceilProfile.push(new THREE.Vector2(3.92, -0.16));
arc(ceilProfile, 4.4, -0.16, 0.48, Math.PI, Math.PI * 1.5, 10); // cove floor curve
ceilProfile.push(new THREE.Vector2(6.1, -0.16));
arc(ceilProfile, 6.1, 0.1, 0.26, -Math.PI / 2, 0, 8);     // rounded lip back up
ceilProfile.push(new THREE.Vector2(6.36, 0.34));
ceilProfile.push(new THREE.Vector2(CFG.wallRadius, 0.36));  // flat outer ceiling
const ceilMat = new THREE.MeshStandardMaterial({ color: 0x6a5530, roughness: 0.55, metalness: 0.75, side: THREE.DoubleSide });
const ceiling = new THREE.Mesh(new THREE.LatheGeometry(ceilProfile, 160), ceilMat);
ceilingGroup.add(ceiling);

// the glowing ring — high radial/tubular segments so it reads perfectly round
const ringMat = new THREE.MeshStandardMaterial({
  color: 0xfff0d2, emissive: 0xffdfa0, emissiveIntensity: 2.2, roughness: 0.35, metalness: 0.2,
});
const ring = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.17, 40, 220), ringMat);
ring.rotation.x = Math.PI / 2;
ring.position.y = -0.12;
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
const followSpot = new THREE.SpotLight(0xffe8c4, 60, 55, Math.PI / 7, 0.95, 1.1);
followSpot.position.set(0, 7.5, 3);
followSpot.castShadow = false; // soft accent light only — no hard shadow frustum artifacts
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
// Hero product dead-centre as the focal point; two quieter accents set back.
const pedestalDefs = [
  { x: 0.0, z: 2.4, label: 'Belts', color: 0xd8b45e, hero: true, scale: 1.18 },
  { x: -9.2, z: -0.6, label: 'Bags', color: 0xc9a24c, hero: false, scale: 0.82 },
  { x: 9.2, z: -0.6, label: 'Shoes', color: 0xbf9846, hero: false, scale: 0.82 },
];

// A smoothly turned pedestal profile — every corner is a short arc, no sharp edges.
function makePedestalGeometry() {
  const p = [
    [0.00, 0.00], [0.50, 0.00],
    [0.525, 0.018], [0.528, 0.036], [0.515, 0.052], [0.49, 0.064],
    [0.45, 0.10], [0.41, 0.17], [0.385, 0.26], [0.378, 0.42],
    [0.378, 1.14],
    [0.40, 1.27], [0.44, 1.37], [0.47, 1.435],
    [0.487, 1.475], [0.483, 1.505], [0.46, 1.52],
    [0.30, 1.53], [0.00, 1.532],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(p, 96);
}
const pedestalGeo = makePedestalGeometry();

// A thin rounded display plate (its own lathe so the edge is beveled, not a disc lip).
function makePlateGeometry() {
  const p = [
    [0.00, 0.00], [0.36, 0.00],
    [0.395, 0.012], [0.40, 0.035], [0.385, 0.058], [0.35, 0.07],
    [0.00, 0.072],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(p, 72);
}
const plateGeo = makePlateGeometry();

// Soft radial contact-shadow decal — reliable AO-style grounding on the mirror
// floor without any screen-space AO artifacts.
const contactShadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d').createRadialGradient(128, 128, 6, 128, 128, 126);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  const x = c.getContext('2d');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const contactShadowGeo = new THREE.PlaneGeometry(1, 1);

for (const def of pedestalDefs) {
  const group = new THREE.Group();
  group.position.set(def.x, 0, def.z);
  group.scale.setScalar(def.scale);

  // grounding contact shadow, laid flat just above the floor
  const shadow = new THREE.Mesh(
    contactShadowGeo,
    new THREE.MeshBasicMaterial({ map: contactShadowTex, transparent: true, depthWrite: false, opacity: 0.9 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.scale.setScalar(2.1);
  group.add(shadow);

  // softer, more dimensional stone-bronze (less clearcoat -> not plastic)
  const colMat = new THREE.MeshPhysicalMaterial({
    color: 0x241d15, roughness: 0.52, metalness: 0.35, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.8,
  });
  const column = new THREE.Mesh(pedestalGeo, colMat);
  column.castShadow = true;
  column.receiveShadow = true;
  group.add(column);

  // glowing top plate — the interactive target
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xf3dfa8, emissive: 0xc79a45, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.9,
  });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.y = 1.5;
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);

  // gilded product form, centred on the plate; softer metal (not mirror-plastic)
  const objMat = new THREE.MeshPhysicalMaterial({
    color: def.color, roughness: 0.3, metalness: 0.85, clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: 1.3,
  });
  const r = def.hero ? 0.27 : 0.2;
  const obj = new THREE.Mesh(new THREE.TorusKnotGeometry(r, r * 0.34, 220, 32), objMat);
  const restY = 1.5 + r + 0.18;
  obj.position.y = restY;
  obj.castShadow = true;
  group.add(obj);

  group.userData = {
    label: def.label,
    plate, obj, plateMat, objMat, restY,
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
const pointerEased = new THREE.Vector2(0, 0);  // first smoothing stage
const pointerSmooth = new THREE.Vector2(0, 0); // second stage -> silky, no snap
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

  // two-stage easing -> deep, fluid inertia with no snap
  pointerEased.x = damp(pointerEased.x, pointer.x, 1.7, dt);
  pointerEased.y = damp(pointerEased.y, pointer.y, 1.7, dt);
  pointerSmooth.x = damp(pointerSmooth.x, pointerEased.x, 1.3, dt);
  pointerSmooth.y = damp(pointerSmooth.y, pointerEased.y, 1.3, dt);

  // idle drift: when the user is still, gently sway the camera
  const idle = Math.min(1, (performance.now() - lastInteract) / 3600);
  const driftX = Math.sin(t * 0.13) * 0.6 + Math.sin(t * 0.31) * 0.2;
  const driftY = Math.cos(t * 0.17) * 0.24;

  const targetX = CFG.camera.base.x + pointerSmooth.x * 1.7 * (1 - idle * 0.35) + driftX * idle;
  const targetY = CFG.camera.base.y + pointerSmooth.y * 0.9 * (1 - idle * 0.35) + driftY * idle + Math.sin(t * 0.42) * 0.05;
  const targetZ = CFG.camera.base.z - Math.abs(pointerSmooth.y) * 0.4;

  camera.position.x = damp(camera.position.x, targetX, 1.3, dt);
  camera.position.y = damp(camera.position.y, targetY, 1.3, dt);
  camera.position.z = damp(camera.position.z, targetZ, 1.3, dt);

  // eased look target with a touch of parallax (background moves slower)
  lookTarget.x = damp(lookTarget.x, pointerSmooth.x * 2.4, 1.2, dt);
  lookTarget.y = damp(lookTarget.y, LOOK_BASE_Y + pointerSmooth.y * 1.2, 1.2, dt);
  camera.lookAt(lookTarget);

  // parallax on the foreground pedestals — they move MORE than the wall
  parallaxGroup.position.x = damp(parallaxGroup.position.x, -pointerSmooth.x * 0.9, 1.8, dt);
  parallaxGroup.position.z = damp(parallaxGroup.position.z, pointerSmooth.y * 0.5, 1.8, dt);

  // mouse-follow spotlight: project pointer onto the wall, then glide (frame-rate independent)
  raycaster.setFromCamera(pointerSmooth, camera);
  const hit = raycaster.intersectObject(wallPlane, false)[0];
  if (hit) {
    followTarget.position.x = damp(followTarget.position.x, hit.point.x, 1.6, dt);
    followTarget.position.y = damp(followTarget.position.y, hit.point.y, 1.6, dt);
    followTarget.position.z = damp(followTarget.position.z, hit.point.z, 1.6, dt);
    followSpot.position.x = damp(followSpot.position.x, hit.point.x * 0.4, 1.6, dt);
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
    d.obj.position.y = d.restY + Math.sin(t * 1.2 + d.spin) * 0.025 + d.hover * 0.06;
  }

  composer.render();

  if (!started) { started = true; reveal(); }
}
animate();

// Expose a couple of handles for the screenshot/tuning harness.
window.__scene = { scene, camera, renderer, CFG, muralMat, marbleMat, bloom };
