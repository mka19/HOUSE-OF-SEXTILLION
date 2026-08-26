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
  wallRadius: 18,               // floor radius
  wallHeight: 12,
  ceilingY: 7.7,
  exposure: 0.98,               // bright gallery, but hold the highlights
  envIntensity: 1.1,
  fogColor: 0x000000,           // pure black void surrounds everything
  fogDensity: 0.03,
  bloom: { strength: 0.16, radius: 0.65, threshold: 0.9 },
  // three suspended flat panels forming a shallow bay (replaces the curved wall)
  panel: { w: 5.0, h: 8.6, z: -11.5, spread: 5.35, angle: 0.34, y: 4.9, gap: 0.35 },
  fov: 38,
  camera: { base: new THREE.Vector3(0, 3.4, 14.6) },
  heroFocusY: 2.15,
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

const camera = new THREE.PerspectiveCamera(CFG.fov, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.copy(CFG.camera.base);

const lookTarget = new THREE.Vector3(0, CFG.heroFocusY, -CFG.wallRadius);
const LOOK_BASE_Y = CFG.heroFocusY;

/* -------------------------------------------------------------------------- */
/*  Shared procedural textures — micro-imperfection so nothing reads perfectly  */
/*  flat/clean, plus soft sprites for atmosphere.                               */
/* -------------------------------------------------------------------------- */
function makeNoiseTexture(size = 512, base = 190, spread = 60) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = base + Math.random() * spread;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // low-frequency blotches for macro variation (smudges, wear)
  for (let k = 0; k < 42; k++) {
    x.globalAlpha = 0.04 + Math.random() * 0.07;
    x.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    x.beginPath();
    x.arc(Math.random() * size, Math.random() * size, size * (0.04 + Math.random() * 0.22), 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function makeSoftSprite(rgb = '255,238,200') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.35, `rgba(${rgb},0.45)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function makeRadialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Tangent-space normal map from procedural height — surface micro-detail so PBR
// materials aren't perfectly smooth CG.
function makeNoiseNormal(size = 512, strength = 1.6, freq = 3) {
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = Math.random();
  // smooth a couple of times
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let pass = 0; pass < 2; pass++) {
    const c2 = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
      c2[y * size + x] = (at(x, y) * 4 + at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 8;
    h.set(c2);
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const cx = cv.getContext('2d'); const img = cx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    let nX = -dx, nY = -dy, nZ = 1; const len = Math.hypot(nX, nY, nZ) || 1;
    const o = (y * size + x) * 4;
    img.data[o] = (nX / len * 0.5 + 0.5) * 255;
    img.data[o + 1] = (nY / len * 0.5 + 0.5) * 255;
    img.data[o + 2] = (nZ / len * 0.5 + 0.5) * 255;
    img.data[o + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const microNoise = makeNoiseTexture(512);      // roughness micro-variation
const microNormal = makeNoiseNormal(512, 1.4); // surface micro-normal detail
const softSprite = makeSoftSprite();           // dust / glow particles

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

// Pure black void — the panels, pedestal and floor float in infinite darkness.
scene.background = new THREE.Color(0x000000);

/* -------------------------------------------------------------------------- */
/*  Curved mural wall                                                           */
/* -------------------------------------------------------------------------- */
// The uploaded reference (public/MURAL.jpeg) is the whole room. Crop just the
// painted wall band so our own 3D ceiling + floor frame it, instead of mapping
// a room-inside-a-room. Fractions are of the source image (1536x1024).
// left/right cropped in from the full width to drop the outer mural panels, so
// only the central panels show — a tighter, more focused composition.
const MURAL_CROP = { top: 0.185, bottom: 0.795, left: 0.19, right: 0.81 };

// Crop the central mural band and tone it to a soft cream/sepia parchment —
// lighter and far less saturated than the amber source — so it reads as a pale
// gilded screen. Returns one wide canvas spanning all three panels.
function buildMuralCanvas(img) {
  const sx = img.width * MURAL_CROP.left, sy = img.height * MURAL_CROP.top;
  const sw = img.width * (MURAL_CROP.right - MURAL_CROP.left);
  const sh = img.height * (MURAL_CROP.bottom - MURAL_CROP.top);
  const Hc = 720, Wc = Math.round(Hc * (sw / sh));
  const c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
  const x = c.getContext('2d');
  x.drawImage(img, sx, sy, sw, sh, 0, 0, Wc, Hc);
  // pull the saturation right down toward parchment
  x.globalCompositeOperation = 'saturation'; x.globalAlpha = 0.62;
  x.fillStyle = '#808080'; x.fillRect(0, 0, Wc, Hc);
  // warm cream lift (soft-light keeps the drawing, warms + lifts the midtones)
  x.globalCompositeOperation = 'soft-light'; x.globalAlpha = 0.55;
  x.fillStyle = '#f5ead2'; x.fillRect(0, 0, Wc, Hc);
  // gentle overall brighten to sepia/ivory
  x.globalCompositeOperation = 'lighten'; x.globalAlpha = 0.2;
  x.fillStyle = '#efe3c6'; x.fillRect(0, 0, Wc, Hc);
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  return c;
}

function makeMuralTexture() {
  return new Promise((resolve) => {
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
      img.onload = () => {
        const t = new THREE.CanvasTexture(buildMuralCanvas(img));
        t.colorSpace = THREE.SRGBColorSpace;
        resolve({ tex: t, real: true });
      };
      img.onerror = () => { i++; tryNext(); };
      img.src = candidates[i];
    };
    tryNext();
  });
}

// NO top-level await: a top-level await breaks execution of the rest of the
// bundle when it's inlined into a single-file artifact. The mural loads async and
// the panels are built in the .then() below.
let muralMat;

/* -------------------------------------------------------------------------- */
/*  Three suspended flat panels (replaces the curved wall)                      */
/* -------------------------------------------------------------------------- */
// Three separate flat panels, gaps between them, hung from thin cables — each
// carries one horizontal third of the parchment mural. They self-illuminate so
// they glow softly out of the black void, framed by a thin gilt edge.
const P = CFG.panel;
const panelGroup = new THREE.Group();
scene.add(panelGroup);
const panelGeo = new THREE.PlaneGeometry(P.w, P.h);
const frameGeo = new THREE.PlaneGeometry(P.w + 0.14, P.h + 0.14);
const frameMat = new THREE.MeshStandardMaterial({
  color: 0x8a6a34, emissive: 0x6a4f22, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.9,
});
const cableMat = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.5, metalness: 0.8 });
const cableLen = 16;
const panelLayout = [
  { i: 0, x: -(P.spread), ry: P.angle },   // left panel, angled inward
  { i: 1, x: 0, ry: 0 },                    // centre panel, faces camera
  { i: 2, x: P.spread, ry: -P.angle },      // right panel, angled inward
];
function buildPanels(muralTexture) {
  muralTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  muralTexture.colorSpace = THREE.SRGBColorSpace;
  for (const L of panelLayout) {
    const tex = muralTexture.clone(); tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.x = 1 / 3; tex.offset.x = L.i / 3;     // this panel's third of the mural
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissive: 0xffefd6, emissiveMap: tex, emissiveIntensity: 0.34,
      roughness: 0.9, metalness: 0.0, envMapIntensity: 0.35,
    });
    if (L.i === 1) muralMat = mat;                     // handle for the tuning harness
    const g = new THREE.Group();
    g.position.set(L.x, P.y, P.z); g.rotation.y = L.ry;
    const frame = new THREE.Mesh(frameGeo, frameMat); frame.position.z = -0.04; g.add(frame);
    const panel = new THREE.Mesh(panelGeo, mat); panel.receiveShadow = false; g.add(panel);
    // two thin cables from the top corners up into the black
    for (const cx of [-P.w * 0.36, P.w * 0.36]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, cableLen, 6), cableMat);
      cable.position.set(cx, P.h / 2 + cableLen / 2 - 0.1, 0.02);
      g.add(cable);
    }
    panelGroup.add(g);
  }
}
makeMuralTexture().then(({ tex }) => buildPanels(tex));
const muralOffsetBaseX = 0;

/* -------------------------------------------------------------------------- */
/*  Implied boutique beyond — dim warm depth + blurred people silhouettes        */
/* -------------------------------------------------------------------------- */
// Far left and right: a faint warm glow (a lit display cabinet implied in the
// dark) backlighting soft, heavily-blurred dark human silhouettes — so the space
// reads as a larger boutique continuing past the panels, without any visible walls.
function makeSilhouetteTexture(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.filter = 'blur(5px)';                 // heavily out of focus, but readable
  x.fillStyle = '#050403';
  // simple standing figure: head + tapering body
  x.beginPath(); x.arc(64, 50, 19, 0, Math.PI * 2); x.fill();          // head
  x.beginPath();
  x.moveTo(38, 74); x.quadraticCurveTo(28, 150, 36, 250);
  x.lineTo(92, 250); x.quadraticCurveTo(100, 150, 90, 74);
  x.closePath(); x.fill();                                             // shoulders/body
  if (kind === 1) { x.fillRect(26, 116, 15, 96); }                    // an arm/bag hint
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowCaseTex = makeRadialTexture([[0, 'rgba(255,228,176,0.75)'], [0.5, 'rgba(240,205,150,0.24)'], [1, 'rgba(240,205,150,0)']]);
const silhouetteTexes = [makeSilhouetteTexture(0), makeSilhouetteTexture(1)];
function buildBoutiqueSide(dir) {   // dir = -1 (left) / +1 (right)
  // warm glow behind (the implied lit display cabinet) — backlights the figures
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 11),
    new THREE.MeshBasicMaterial({ map: glowCaseTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.position.set(dir * 8.2, 3.0, -3.8);
  scene.add(glow);
  // 3 dark figures clustered at the frame edge, backlit by the glow
  const offs = [[0, 0.4, 3.7], [1.5, -0.6, 4.1], [3.0, -1.6, 3.4]];
  for (let i = 0; i < offs.length; i++) {
    const [dx, dz, h] = offs[i];
    const fig = new THREE.Mesh(
      new THREE.PlaneGeometry(h * 0.52, h),
      new THREE.MeshBasicMaterial({
        map: silhouetteTexes[i % 2], transparent: true, opacity: 1.0,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    fig.position.set(dir * (6.6 + dx), h / 2 - 0.1, -1.4 + dz);
    scene.add(fig);
    silhouettes.push(fig);
  }
}
const silhouettes = [];
buildBoutiqueSide(-1);
buildBoutiqueSide(1);

/* -------------------------------------------------------------------------- */
/*  Reflective marble floor  (real mirror of the mural + PBR marble overlay)    */
/* -------------------------------------------------------------------------- */
const floorGeo = new THREE.CircleGeometry(CFG.wallRadius, 128);

const reflector = new Reflector(floorGeo, {
  clipBias: 0.003,
  textureWidth: Math.min(1024, window.innerWidth * window.devicePixelRatio),
  textureHeight: Math.min(1024, window.innerHeight * window.devicePixelRatio),
  color: 0x5a5344, // brighter bounce -> the bright cream floor mirrors the warm panels
});
reflector.rotation.x = -Math.PI / 2;
reflector.position.y = 0.0;
scene.add(reflector);

// Marble/veining overlay: gold-flecked polished stone with clearcoat sheen.
function makeMarbleMaps() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#ece3cf';                 // bright cream marble
  x.fillRect(0, 0, 1024, 1024);
  // radial geometric gold inlay lines, echoing the reference floor
  x.strokeStyle = 'rgba(198,164,92,0.32)';
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
  x.strokeStyle = 'rgba(150,130,92,0.14)';
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
const floorRough = makeNoiseTexture(512, 150, 90);
floorRough.repeat.set(6, 6);
const floorNormal = microNormal.clone(); floorNormal.needsUpdate = true; floorNormal.repeat.set(8, 8);
const marbleMat = new THREE.MeshPhysicalMaterial({
  map: marbleMaps.color,
  color: 0xf1ead9,                 // bright, luminous cream marble
  roughness: 0.34,                 // polished -> clearer, brighter reflections
  roughnessMap: floorRough,
  metalness: 0.0,
  clearcoat: 0.5, clearcoatRoughness: 0.35,
  normalMap: floorNormal,
  normalScale: new THREE.Vector2(0.08, 0.08),
  envMapIntensity: 0.55,
  transparent: true,
  opacity: 0.72,                   // lets the planar mirror read through -> reflective sheen
  depthWrite: false,
});
const marble = new THREE.Mesh(floorGeo, marbleMat);
marble.rotation.x = -Math.PI / 2;
marble.position.y = 0.012;
marble.receiveShadow = true;
scene.add(marble);

// Idle ambient glow pooling on the floor under the ring — alive without the mouse.
const floorPool = new THREE.Mesh(
  new THREE.CircleGeometry(10, 96),
  new THREE.MeshBasicMaterial({
    map: makeRadialTexture([[0, 'rgba(255,231,178,0.5)'], [0.4, 'rgba(240,205,140,0.18)'], [1, 'rgba(240,205,140,0)']]),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }),
);
floorPool.rotation.x = -Math.PI / 2;
floorPool.position.y = 0.02;
scene.add(floorPool);

// Fade the floor's outer edge into pure black, so the bright cream floor reads as
// a luminous island dissolving into infinite void (no visible floor edge/room).
const floorFade = new THREE.Mesh(
  new THREE.CircleGeometry(CFG.wallRadius, 128),
  new THREE.MeshBasicMaterial({
    map: makeRadialTexture([[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [0.78, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,1)']]),
    transparent: true, depthWrite: false,
  }),
);
floorFade.rotation.x = -Math.PI / 2;
floorFade.position.y = 0.018;
scene.add(floorFade);

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

// Lighting is HDRI(IBL)-dominant. These few lights are physically grounded
// (inverse-square decay=2) and purposeful: a ring fixture, a hero key with soft
// shadows, grazing wall lights to reveal the relief, and a cool rim.
const ringLight = new THREE.PointLight(0xffe6bc, 60, 80, 2);
ringLight.position.set(0, CFG.ceilingY - 0.4, 0);
scene.add(ringLight);

// warm gallery fill — brighter & airier than the old cinematic near-dark
const fillLight = new THREE.HemisphereLight(0xfff3e0, 0x2a2418, 0.42);
scene.add(fillLight);

// soft warm washers grazing the panels + the bright floor around them
const wallWashL = new THREE.SpotLight(0xfff0d6, 22, 40, Math.PI / 4.5, 0.9, 2);
wallWashL.position.set(-6, CFG.ceilingY - 0.4, 2);
wallWashL.target.position.set(-CFG.panel.spread, CFG.panel.y, CFG.panel.z);
scene.add(wallWashL); scene.add(wallWashL.target);
const wallWashR = new THREE.SpotLight(0xfff0d6, 22, 40, Math.PI / 4.5, 0.9, 2);
wallWashR.position.set(6, CFG.ceilingY - 0.4, 2);
wallWashR.target.position.set(CFG.panel.spread, CFG.panel.y, CFG.panel.z);
scene.add(wallWashR); scene.add(wallWashR.target);

// Real key light over the hero — soft-shadow casting + physical falloff (decay=2).
const keyLight = new THREE.SpotLight(0xfff3de, 900, 34, Math.PI / 7, 0.72, 2);
keyLight.position.set(1.2, 9.0, 5.0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 2;
keyLight.shadow.camera.far = 34;
keyLight.shadow.bias = -0.0006;
keyLight.shadow.radius = 9;            // soft penumbra
keyLight.shadow.blurSamples = 24;
scene.add(keyLight);
const keyTarget = new THREE.Object3D();
keyTarget.position.set(0, 4.55, -6.2); // the floating product
scene.add(keyTarget);
keyLight.target = keyTarget;

// A soft warm rim/back light for shape separation (no shadow, cheap).
const rimLight = new THREE.SpotLight(0xffe9cc, 160, 34, Math.PI / 6, 0.9, 2);
rimLight.position.set(-6, 6, -3);
scene.add(rimLight);

/* -------------------------------------------------------------------------- */
/*  Mouse-follow spotlight sweeping the wall/floor                              */
/* -------------------------------------------------------------------------- */
const followSpot = new THREE.SpotLight(0xffe8c4, 140, 55, Math.PI / 7, 0.95, 2);
followSpot.position.set(0, 7.5, 3);
followSpot.castShadow = false; // soft accent light only — no hard shadow frustum artifacts
const followTarget = new THREE.Object3D();
followTarget.position.set(0, CFG.panel.y, CFG.panel.z);
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
// Single-focus view: only the hero product is shown (nav/swipe cycles its
// identity between Bags / Belts / Shoes on this one pedestal).
const pedestalDefs = [
  { x: 0.0, z: 4.2, label: 'Belts', color: 0xd8b45e, hero: true, scale: 2.1 },
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

// White/cream marble with faint cool-grey veining — a bright ceramic plinth.
const onyxMap = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#f0ece2'; x.fillRect(0, 0, 512, 512);
  // cloudy tonal variation
  for (let i = 0; i < 30; i++) {
    x.globalAlpha = 0.05;
    x.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#d8d2c4';
    x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 120, 0, Math.PI * 2); x.fill();
  }
  // faint grey marble veins
  x.globalAlpha = 0.28; x.strokeStyle = '#b7b0a0'; x.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    x.beginPath();
    let px = Math.random() * 512, py = Math.random() * 512;
    x.moveTo(px, py);
    for (let s = 0; s < 8; s++) { px += (Math.random() - 0.5) * 120; py += (Math.random() - 0.5) * 120; x.lineTo(px, py); }
    x.stroke();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

for (const def of pedestalDefs) {
  const group = new THREE.Group();
  group.position.set(def.x, 0, def.z);
  group.scale.setScalar(def.scale);

  // grounding contact shadow — a tight dark core + a wider soft penumbra
  const shadowCore = new THREE.Mesh(
    contactShadowGeo,
    new THREE.MeshBasicMaterial({ map: contactShadowTex, transparent: true, depthWrite: false, opacity: 0.5 }),
  );
  shadowCore.rotation.x = -Math.PI / 2;
  shadowCore.position.y = 0.02;
  shadowCore.scale.setScalar(1.5);
  group.add(shadowCore);
  const shadowSoft = shadowCore.clone();
  shadowSoft.material = shadowCore.material.clone();
  shadowSoft.material.opacity = 0.24;
  shadowSoft.position.y = 0.018;
  shadowSoft.scale.setScalar(2.7);
  group.add(shadowSoft);

  // white marble / ceramic hourglass plinth — bright, softly reflective, clean
  const stoneNoise = microNoise.clone(); stoneNoise.needsUpdate = true; stoneNoise.repeat.set(2, 3);
  const stoneNormal = microNormal.clone(); stoneNormal.needsUpdate = true; stoneNormal.repeat.set(2, 3);
  const colMat = new THREE.MeshPhysicalMaterial({
    color: 0xf3efe6, map: onyxMap,             // bright white/cream marble
    roughness: 0.32, roughnessMap: stoneNoise,  // honed ceramic sheen
    metalness: 0.0,
    clearcoat: 0.55, clearcoatRoughness: 0.28,
    normalMap: stoneNormal, normalScale: new THREE.Vector2(0.08, 0.08),
    envMapIntensity: 0.7,
  });
  const PED_W = 0.62, PED_H = 0.52;
  const column = new THREE.Mesh(pedestalGeo, colMat);
  column.scale.set(PED_W, PED_H, PED_W);
  column.castShadow = true;
  column.receiveShadow = true;
  group.add(column);
  const colTopY = 1.532 * PED_H;                 // top of the shrunk column

  // thin gold rim trim around the top edge of the plinth
  const goldRimMat = new THREE.MeshStandardMaterial({
    color: 0xd9b664, metalness: 1.0, roughness: 0.22, envMapIntensity: 1.6,
  });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.022, 16, 64), goldRimMat);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(PED_W / 0.62, PED_W / 0.62, PED_W / 0.62);
  rim.position.y = colTopY - 0.01;
  rim.castShadow = true;
  group.add(rim);

  // slim cream top plate flush inside the gold rim
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xf0ebe0, emissive: 0x2a2620, emissiveIntensity: 0.06, roughness: 0.4, metalness: 0.0,
    roughnessMap: microNoise,
  });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.scale.set(PED_W, 1, PED_W);
  plate.position.y = colTopY;
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);
  const plateTopY = colTopY + 0.072;             // plate is ~0.072 tall

  // The plinth stays EMPTY (reference-accurate): the featured product floats
  // separately in front of the centre panel, not resting on this pedestal.
  void plateTopY;
  group.userData = { plate, plateMat };
  parallaxGroup.add(group);
}

/* -------------------------------------------------------------------------- */
/*  Floating hero product — in front of the centre panel                        */
/* -------------------------------------------------------------------------- */
// Loads the maison's own bag photo (public/BAG.png, white background keyed to
// transparent) and presents it as a lit, shadow-casting, floor-reflected product
// floating in front of the centre panel. Falls back to a polished-gold sculptural
// form until the photo is supplied.
const heroProductGroup = new THREE.Group();
heroProductGroup.position.set(0, 4.55, -6.2);
parallaxGroup.add(heroProductGroup);

const goldHeroMat = new THREE.MeshPhysicalMaterial({
  color: 0xd8b45e, metalness: 1.0, roughness: 0.08, envMapIntensity: 2.4, clearcoat: 0.0,
});
let heroObj = new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.2, 260, 40), goldHeroMat);
heroObj.castShadow = true;
heroProductGroup.add(heroObj);

const heroData = {
  label: 'Bags', obj: heroObj, objMat: goldHeroMat, restY: 0,
  baseScale: 1, hover: 0, click: 0, spin: 0, isBag: false,
};
heroProductGroup.userData = heroData;
interactive.push(heroProductGroup);

// key a near-white background to transparent so the product cuts out cleanly
function keyWhiteToAlpha(img) {
  const s = Math.min(1024, img.naturalWidth || 1024);
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = Math.round(s * (img.naturalHeight || s) / (img.naturalWidth || s));
  const x = cv.getContext('2d'); x.drawImage(img, 0, 0, cv.width, cv.height);
  const d = x.getImageData(0, 0, cv.width, cv.height); const a = d.data;
  for (let p = 0; p < a.length; p += 4) {
    const r = a[p], g = a[p + 1], b = a[p + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    if (mn > 236 && (mx - mn) < 14) a[p + 3] = 0;               // near-white bg -> clear
    else if (mn > 216 && (mx - mn) < 22) a[p + 3] = Math.round(((mn - 216) / 20) * -255 + 255); // soft rim
  }
  x.putImageData(d, 0, 0);
  return cv;
}

(function loadBag() {
  const cands = [window.__BAG_DATA_URI, './BAG.png', './BAG.jpg', './BAG.jpeg', './BAG.webp'].filter(Boolean);
  let i = 0;
  const tryNext = () => {
    if (i >= cands.length) return;                              // keep the gold fallback
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cv = keyWhiteToAlpha(img);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const aspect = cv.width / cv.height;
      const hgt = 3.1, wid = hgt * aspect;
      const bag = new THREE.Mesh(
        new THREE.PlaneGeometry(wid, hgt),
        new THREE.MeshStandardMaterial({
          map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide,
          roughness: 0.62, metalness: 0.0, emissive: 0xffcf7a, emissiveIntensity: 0,
        }),
      );
      bag.castShadow = true;
      heroProductGroup.remove(heroObj);
      if (heroObj.geometry) heroObj.geometry.dispose();
      heroProductGroup.add(bag);
      heroData.obj = bag; heroData.objMat = bag.material; heroData.isBag = true;
      heroObj = bag;
    };
    img.onerror = () => { i++; tryNext(); };
    img.src = cands[i];
  };
  tryNext();
})();

/* -------------------------------------------------------------------------- */
/*  Atmosphere — volumetric shafts, drifting dust, ambient life                 */
/* -------------------------------------------------------------------------- */

// (9) Soft volumetric light shafts falling from the ring through hazy air.
const shaftTex = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,232,186,0.9)');
  g.addColorStop(0.5, 'rgba(255,226,170,0.28)');
  g.addColorStop(1, 'rgba(255,226,170,0)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  // faint vertical striations so it reads as shafts, not a solid cone
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 60; i++) {
    x.globalAlpha = 0.15 + Math.random() * 0.5;
    const w = 2 + Math.random() * 10;
    x.fillRect(Math.random() * 512, 0, w, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.repeat.x = 3;
  return t;
})();
const shafts = new THREE.Mesh(
  new THREE.CylinderGeometry(5.4, 9.2, CFG.ceilingY - 0.2, 96, 1, true),
  new THREE.MeshBasicMaterial({
    map: shaftTex, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false,
  }),
);
shafts.position.y = (CFG.ceilingY - 0.2) / 2;
scene.add(shafts);

// (8) Slow-drifting gold dust motes floating through the air.
const DUST = 520;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST * 3);
const dustPhase = new Float32Array(DUST);
for (let i = 0; i < DUST; i++) {
  const rad = 2 + Math.random() * (CFG.wallRadius - 3);
  const a = Math.random() * Math.PI * 2;
  dustPos[i * 3] = Math.cos(a) * rad;
  dustPos[i * 3 + 1] = 0.4 + Math.random() * (CFG.ceilingY - 0.8);
  dustPos[i * 3 + 2] = Math.sin(a) * rad;
  dustPhase[i] = Math.random() * Math.PI * 2;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  size: 0.042, map: softSprite, color: 0xffe6b0, transparent: true, opacity: 0.32,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
}));
scene.add(dust);

// (10) Occasional soft light-shift drifting across the mural — a hint of life.
const passSprite = new THREE.Mesh(
  new THREE.PlaneGeometry(7, 9),
  new THREE.MeshBasicMaterial({
    map: makeRadialTexture([[0, 'rgba(255,238,200,0.5)'], [0.5, 'rgba(255,232,185,0.15)'], [1, 'rgba(255,232,185,0)']]),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }),
);
passSprite.position.set(0, 4.4, -CFG.wallRadius + 0.5);
scene.add(passSprite);
const passState = { next: 8, active: false, t0: 0, dur: 7 };

// (7) Circuit / network floor — a full-floor lattice of thin glowing gold lines
// connecting small circular nodes, that lights up in a pool around the cursor and
// fades as the cursor moves away. A static plane covers the floor; the cursor is a
// world-space uniform, so the glow tracks the cursor over a fixed lattice (the
// network stays put; only the illumination moves), which reads as "alive" not gimmicky.
const CIRCUIT_HALF = CFG.wallRadius;            // plane spans the whole floor
const circuitMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: {
    uTime: { value: 0 },
    uStrength: { value: 0 },                    // global energy (cursor movement)
    uCursor: { value: new THREE.Vector2(0, 0) },// cursor position on the floor (world x,z)
    uHalf: { value: CIRCUIT_HALF },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    varying vec2 vUv;
    uniform float uTime, uStrength, uHalf; uniform vec2 uCursor;
    float lineMask(float x, float w){ return smoothstep(w, 0.0, abs(x)); }
    void main(){
      // map the plane's uv to world floor coordinates (x,z)
      vec2 world = (vUv - 0.5) * (uHalf * 2.0);
      float dCur = distance(world, uCursor);
      float prox = smoothstep(6.5, 0.0, dCur);        // bright pool radius ~6.5 units
      float energy = prox * uStrength;
      // lattice: nodes at cell centres, thin lines through them (a connected grid)
      const float N = 8.0;
      vec2 cell = fract(vUv * N) - 0.5;
      vec2 id   = floor(vUv * N);
      float lines = max(lineMask(cell.x, 0.026), lineMask(cell.y, 0.026)) * 0.95;
      float node  = smoothstep(0.10, 0.03, length(cell));
      // a soft pulse travelling out from the cursor along the lattice
      float pulse = 0.5 + 0.5 * sin(uTime * 2.2 - dCur * 1.1 - (id.x + id.y) * 0.35);
      float net = lines + node * (1.1 + 0.5 * pulse);
      // fade the lattice out toward the very edge of the floor
      float edge = smoothstep(1.0, 0.82, length(vUv - 0.5) * 2.0);
      float a = net * energy * edge;
      // warm gold, brightening to near-white on the nodes / pulse crests
      vec3 gold = mix(vec3(0.92,0.70,0.30), vec3(1.0,0.94,0.66), clamp(node + pulse*0.25, 0.0, 1.0));
      gl_FragColor = vec4(gold, clamp(a, 0.0, 1.0) * 1.15);
    }
  `,
});
const circuit = new THREE.Mesh(new THREE.PlaneGeometry(CIRCUIT_HALF * 2, CIRCUIT_HALF * 2), circuitMat);
circuit.rotation.x = -Math.PI / 2;
circuit.position.y = 0.03;
circuit.visible = false;
scene.add(circuit);
const circuitState = { pos: new THREE.Vector3(0, 0.03, 0), strength: 0 };
const floorPlaneMath = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/* -------------------------------------------------------------------------- */
/*  Post-processing (bloom + gamma)                                             */
/* -------------------------------------------------------------------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// (No depth-of-field. Peripheral edge blur is done in the grade pass below so the
//  centre — product, pedestal, central mural — stays sharp regardless of depth.)

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  CFG.bloom.strength, CFG.bloom.radius, CFG.bloom.threshold,
);
composer.addPass(bloom);

// Final cinematic grade: sRGB, warm color grade, vignette, animated film grain,
// radial edge streak (item 11) + a directional swipe-blur burst (item 12).
const GradePass = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSwipe: { value: 0 },   // -1..1 directional motion-blur burst
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uSwipe;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      // Peripheral (screen-position) blur — NOT depth based. The centre third
      // stays perfectly sharp; the far left/right (and, less, top/bottom) edges
      // smear outward like a lens edge/vignette blur, regardless of depth.
      float blur = smoothstep(0.20, 0.52, abs(c.x));          // horizontal edges
      blur = max(blur, smoothstep(0.34, 0.62, length(c)) * 0.6); // soften corners a touch
      vec3 col = vec3(0.0); float wsum = 0.0;
      const int N = 8;
      for(int i=0;i<N;i++){
        float f = float(i)/float(N-1);                        // 0..1
        // sample toward centre (c points outward) -> content smears outward onto edges
        vec2 off = c * f * blur * 0.11 + vec2(uSwipe * f * 0.03, 0.0);
        float w = 1.0 - f * 0.35;
        col += texture2D(tDiffuse, uv - off).rgb * w; wsum += w;
      }
      col /= wsum;
      // --- bright, warm gallery grade — cream/sepia parchment, airy, gilded ---
      col = clamp((col - 0.5) * 1.05 + 0.5, 0.0, 1.0);   // gentle contrast
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      // warm sepia split-tone: parchment shadows, soft-cream highlights
      vec3 shadowTint = vec3(1.05, 1.0, 0.90);
      vec3 highTint   = vec3(1.04, 1.01, 0.95);
      col *= mix(shadowTint, highTint, smoothstep(0.05, 0.6, l));
      // slightly reduced saturation -> the expensive, soft parchment feel
      col = mix(vec3(l), col, 0.84);
      // keep true blacks black (the void) but lift deep shadow a hair for air
      col = col + 0.006 * smoothstep(0.0, 0.3, l);
      // very gentle vignette only — bright to the edges, not a spotlit room
      vec2 vv = c * vec2(1.2, 1.05);
      float vig = smoothstep(0.92, 0.28, length(vv));
      col *= mix(0.74, 1.0, vig);
      // linear -> sRGB
      col = pow(clamp(col,0.0,1.0), vec3(1.0/2.2));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
const gradePass = new ShaderPass(GradePass);
gradePass.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
composer.addPass(gradePass);

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

// invisible flat plane across the panel bay to intersect for the follow-spot target
const wallPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(30, CFG.wallHeight * 1.6),
  new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
);
wallPlane.position.set(0, CFG.panel.y, CFG.panel.z - 0.2);
scene.add(wallPlane);

function onPointerMove(e) {
  if (window.__heroVisible === false) return;  // 3D hero off-screen — skip raycasts
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  lastInteract = performance.now();
  circuitState.energy = Math.min(1, (circuitState.energy || 0) + 0.22); // feed the cursor circuit glow

  // hover test against interactive plates/objects
  raycaster.setFromCamera(pointer, camera);
  const targets = [];
  for (const g of interactive) { targets.push(g.userData.obj); }   // product only, not the plinth
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
  return interactive.find((g) => g.userData.obj === obj) || null;
}
function onClick() {
  if (window.__heroVisible === false) return;
  if (hovered) hovered.userData.click = 1.0;
}
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerdown', () => (lastInteract = performance.now()));
window.addEventListener('click', onClick);

/* -------------------------------------------------------------------------- */
/*  Swipe between products (item 12): horizontal zoom/motion-blur pull          */
/* -------------------------------------------------------------------------- */
const swipe = { value: 0 };
const PRODUCTS = [
  { label: 'Bags', color: 0xcaa24a },
  { label: 'Belts', color: 0xd8b45e },
  { label: 'Shoes', color: 0xbf9846 },
];
let activeProduct = 1;
const heroGroup = interactive[0];
function selectProduct(idx, dir) {
  idx = (idx + PRODUCTS.length) % PRODUCTS.length;
  activeProduct = idx;
  const p = PRODUCTS[idx];
  heroGroup.userData.label = p.label;
  // only tint the gold sculptural fallback; never colour-shift the bag photo
  if (!heroGroup.userData.isBag && heroGroup.userData.objMat.color) {
    heroGroup.userData.objMat.color.setHex(p.color);
  }
  heroGroup.userData.click = 1.0;                 // glow pop
  heroGroup.userData.spin += dir * 1.6;           // kick the spin in swipe direction
  swipe.value = THREE.MathUtils.clamp(dir * 0.7, -1, 1); // motion-blur burst
  lastInteract = performance.now();
  document.querySelectorAll('.nav-link[data-product]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.product === p.label);
  });
}
function cycleProduct(dir) { selectProduct(activeProduct + dir, dir); }

// nav links drive product selection
document.querySelectorAll('.nav-link[data-product]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const idx = PRODUCTS.findIndex((p) => p.label === el.dataset.product);
    selectProduct(idx, idx >= activeProduct ? 1 : -1);
  });
});
// keyboard arrows
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') cycleProduct(1);
  else if (e.key === 'ArrowLeft') cycleProduct(-1);
});
// (horizontal drag is reserved for the environment transition — see transition.js;
//  products cycle via the nav links and arrow keys.)

/* -------------------------------------------------------------------------- */
/*  Resize                                                                      */
/* -------------------------------------------------------------------------- */
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  gradePass.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
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
const heroPos = new THREE.Vector3();
let started = false;
const HERO_Z = -6.2;            // floating product sits in front of the centre panel
const HERO_Y = 4.55;

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function animate() {
  requestAnimationFrame(animate);
  // the 3D room is the pinned HERO; once the hero scrolls off-screen we stop
  // rendering it entirely (site.js sets __heroVisible via an IntersectionObserver).
  if (window.__heroVisible === false) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // deep multi-stage easing -> a slow, deliberate camera-operator feel (no snap)
  pointerEased.x = damp(pointerEased.x, pointer.x, 1.1, dt);
  pointerEased.y = damp(pointerEased.y, pointer.y, 1.1, dt);
  pointerSmooth.x = damp(pointerSmooth.x, pointerEased.x, 0.7, dt);
  pointerSmooth.y = damp(pointerSmooth.y, pointerEased.y, 0.7, dt);

  // idle drift: when the user is still, very slowly breathe the camera
  const idle = Math.min(1, (performance.now() - lastInteract) / 5200);
  const driftX = Math.sin(t * 0.07) * 0.4 + Math.sin(t * 0.17) * 0.12;
  const driftY = Math.cos(t * 0.09) * 0.15;

  const targetX = CFG.camera.base.x + pointerSmooth.x * 1.35 * (1 - idle * 0.3) + driftX * idle;
  const targetY = CFG.camera.base.y + pointerSmooth.y * 0.7 * (1 - idle * 0.3) + driftY * idle + Math.sin(t * 0.28) * 0.04;
  const targetZ = CFG.camera.base.z - Math.abs(pointerSmooth.y) * 0.35;

  camera.position.x = damp(camera.position.x, targetX, 0.8, dt);
  camera.position.y = damp(camera.position.y, targetY, 0.8, dt);
  camera.position.z = damp(camera.position.z, targetZ, 0.8, dt);

  // eased look target with a touch of parallax (background moves slower)
  lookTarget.x = damp(lookTarget.x, pointerSmooth.x * 2.0, 0.65, dt);
  lookTarget.y = damp(lookTarget.y, LOOK_BASE_Y + pointerSmooth.y * 1.0, 0.65, dt);
  camera.lookAt(lookTarget);

  // keep the blurred boutique figures facing the camera (y-locked billboards)
  for (const s of silhouettes) s.lookAt(camera.position.x, s.position.y, camera.position.z);

  // parallax on the foreground pedestals — they move MORE than the wall (depth)
  parallaxGroup.position.x = damp(parallaxGroup.position.x, -pointerSmooth.x * 1.1, 0.95, dt);
  parallaxGroup.position.z = damp(parallaxGroup.position.z, pointerSmooth.y * 0.5, 0.95, dt);

  // keep the key light locked on the floating product as it parallaxes
  heroPos.set(parallaxGroup.position.x, HERO_Y, parallaxGroup.position.z + HERO_Z);
  keyTarget.position.set(parallaxGroup.position.x, HERO_Y, parallaxGroup.position.z + HERO_Z);
  keyLight.position.x = damp(keyLight.position.x, 1.2 + parallaxGroup.position.x, 1.0, dt);

  // (panels are static; the old wall's "breathing" UV parallax is retired)

  // mouse-follow spotlight: project pointer onto the wall, then glide (frame-rate independent)
  raycaster.setFromCamera(pointerSmooth, camera);
  const hit = raycaster.intersectObject(wallPlane, false)[0];
  if (hit) {
    followTarget.position.x = damp(followTarget.position.x, hit.point.x, 0.7, dt);
    followTarget.position.y = damp(followTarget.position.y, hit.point.y, 0.7, dt);
    followTarget.position.z = damp(followTarget.position.z, hit.point.z, 0.7, dt);
    followSpot.position.x = damp(followSpot.position.x, hit.point.x * 0.4, 0.7, dt);
  }

  // (7) cursor circuit decal — projected onto the floor, glowing while the mouse moves
  const floorPt = raycaster.ray.intersectPlane(floorPlaneMath, tmpV);
  if (floorPt && Math.hypot(floorPt.x, floorPt.z) < CFG.wallRadius - 1) {
    circuitState.pos.x = damp(circuitState.pos.x, floorPt.x, 6, dt);
    circuitState.pos.z = damp(circuitState.pos.z, floorPt.z, 6, dt);
  }
  circuitState.energy = Math.max(0, (circuitState.energy || 0) - dt * 0.7);
  circuitState.strength = damp(circuitState.strength, circuitState.energy, 4, dt);
  circuit.visible = circuitState.strength > 0.01;
  if (circuit.visible) {
    // the lattice plane is static; only the illuminated cursor pool moves over it
    circuitMat.uniforms.uTime.value = t;
    circuitMat.uniforms.uStrength.value = circuitState.strength;
    circuitMat.uniforms.uCursor.value.set(circuitState.pos.x, circuitState.pos.z);
  }

  // (6) idle ambient floor pool — breathes on its own, independent of the mouse
  floorPool.material.opacity = 0.22 + Math.sin(t * 0.5) * 0.06;
  floorPool.scale.setScalar(1 + Math.sin(t * 0.35) * 0.04);

  // (8/9) drifting dust + slowly rotating light shafts
  const dp = dust.geometry.attributes.position.array;
  for (let i = 0; i < DUST; i++) {
    const ph = dustPhase[i];
    dp[i * 3 + 1] += dt * (0.04 + 0.03 * Math.sin(ph)); // gentle rise
    dp[i * 3] += Math.sin(t * 0.1 + ph) * dt * 0.06;
    dp[i * 3 + 2] += Math.cos(t * 0.09 + ph) * dt * 0.06;
    if (dp[i * 3 + 1] > CFG.ceilingY - 0.3) dp[i * 3 + 1] = 0.4; // recycle
  }
  dust.geometry.attributes.position.needsUpdate = true;
  shafts.rotation.y = t * 0.015;
  shafts.material.opacity = 0.03 + Math.sin(t * 0.7) * 0.008;

  // (10) occasional soft light-shift drifting across the mural
  if (!passState.active && t > passState.next) {
    passState.active = true; passState.t0 = t;
    passState.dur = 6 + Math.random() * 3;
    passState.dir = Math.random() > 0.5 ? 1 : -1;
  }
  if (passState.active) {
    const k = (t - passState.t0) / passState.dur;        // 0..1
    if (k >= 1) { passState.active = false; passState.next = t + 30 + Math.random() * 30; }
    else {
      const fade = Math.sin(k * Math.PI);                // in/out
      passSprite.position.x = passState.dir * (k - 0.5) * 22;
      passSprite.position.y = 4.4 + Math.sin(k * Math.PI) * 0.6;
      passSprite.material.opacity = fade * 0.16;
    }
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
    d.objMat.emissiveIntensity = d.hover * 0.55 + d.click * 1.0;
    if (d.objMat.emissive) d.objMat.emissive.setHex(0xffcf7a);
    const os = 1 + d.hover * 0.07 + d.click * 0.12;
    d.obj.scale.setScalar(damp(d.obj.scale.x, os, 10, dt));
    if (d.isBag) {
      // a photo product: gentle float + a subtle sway, never a full spin
      d.obj.rotation.y = Math.sin(t * 0.4) * 0.05 + d.hover * 0.05;
      d.obj.position.y = d.restY + Math.sin(t * 1.1) * 0.06 + d.hover * 0.08;
    } else {
      d.spin += dt * (0.3 + d.hover * 0.8);
      d.obj.rotation.y = d.spin;
      d.obj.position.y = d.restY + Math.sin(t * 1.2 + d.spin) * 0.05 + d.hover * 0.08;
    }
  }

  // post grade: advance grain + decay any swipe-blur burst (item 12)
  gradePass.uniforms.uTime.value = t;
  swipe.value = damp(swipe.value, 0, 3.0, dt);
  gradePass.uniforms.uSwipe.value = swipe.value;

  composer.render();

  // hold the reveal until the HDRI has lit the scene (with a safety timeout),
  // so it never flashes dark before image-based lighting is applied
  if (!started && (scene.environment || t > 4)) { started = true; reveal(); }
}
animate();

// Expose a couple of handles for the screenshot/tuning harness.
window.__scene = { scene, camera, renderer, CFG, muralMat, marbleMat, bloom };

// The 3D room is the site's pinned hero (see index.html / site.js). The old
// horizontal Env1<->Env2 drag transition is retired in the scroll-site build;
// the showroom concept is now expressed by the CSS niche grid (§1c / §6.3).
window.__activeEnv = 1;
if (window.__heroVisible === undefined) window.__heroVisible = true;
