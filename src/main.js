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
  envIntensity: 1.05,
  fogColor: 0x6a5836,
  fogDensity: 0.009,
  bloom: { strength: 0.16, radius: 0.6, threshold: 0.96 },
  // telephoto + close = the hero feels substantial; background compresses behind it
  fov: 38,
  camera: { base: new THREE.Vector3(0, 3.5, 14.6) },
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

// A cooler "next environment" glimpsed through haze — painterly & low-contrast,
// so it reads as another room beyond, not a flat vector shape.
function drawNextScene(ctx, x0, w, h, flip) {
  ctx.save();
  ctx.translate(x0, 0);
  if (flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.0, '#5b6660');   // muted grey-jade, desaturated
  sky.addColorStop(0.45, '#8b968b');
  sky.addColorStop(0.72, '#b9bfae');
  sky.addColorStop(1.0, '#aab0a0');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  // hazy receding ridges — each drawn as a few offset low-alpha passes (soft blur)
  const ridge = (baseY, amp, col, alpha) => {
    for (let pass = 0; pass < 3; pass++) {
      ctx.globalAlpha = alpha * (pass === 1 ? 1 : 0.5);
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, baseY + pass * 3);
      for (let i = 0; i <= 14; i++) {
        const x = (i / 14) * w;
        const y = baseY + pass * 3 - (Math.sin(i * 1.1 + baseY) * 0.4 + 0.5) * amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  ridge(h * 0.50, h * 0.09, '#9ba597', 0.55);
  ridge(h * 0.60, h * 0.12, '#818d80', 0.6);
  ridge(h * 0.73, h * 0.13, '#69756a', 0.65);
  ridge(h * 0.86, h * 0.11, '#57625a', 0.7);
  // soft misty pagoda hint (no hard rectangle)
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#5a655d';
  ctx.beginPath();
  ctx.moveTo(w * 0.6, h * 0.56); ctx.lineTo(w * 0.63, h * 0.4);
  ctx.lineTo(w * 0.66, h * 0.56); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // heavy atmospheric haze so it melts into distance
  const haze = ctx.createLinearGradient(0, 0, 0, h);
  haze.addColorStop(0, 'rgba(190,196,184,0.5)');
  haze.addColorStop(0.55, 'rgba(190,196,184,0.12)');
  haze.addColorStop(1, 'rgba(180,186,172,0.3)');
  ctx.fillStyle = haze; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// Build the wall texture: real mural in the centre at TRUE aspect (no stretch),
// with the next-environment scenes filling the side arcs, softly blended.
function buildWallCanvas(img) {
  const sx = img.width * MURAL_CROP.left;
  const sy = img.height * MURAL_CROP.top;
  const sw = img.width * (MURAL_CROP.right - MURAL_CROP.left);
  const sh = img.height * (MURAL_CROP.bottom - MURAL_CROP.top);

  const Hc = 900;
  const compAspect = (CFG.wallRadius * CFG.wallArc) / CFG.wallHeight; // arc length : height
  const Wc = Math.round(Hc * compAspect);
  const muralW = Math.round(Hc * (sw / sh));                          // mural at its native aspect
  const mx = Math.round((Wc - muralW) / 2);

  const c = document.createElement('canvas');
  c.width = Wc; c.height = Hc;
  const x = c.getContext('2d');

  // side scenes first
  drawNextScene(x, 0, mx + 4, Hc, false);
  drawNextScene(x, mx + muralW - 4, Wc - (mx + muralW) + 4, Hc, true);
  // real mural, centred at correct aspect
  x.drawImage(img, sx, sy, sw, sh, mx, 0, muralW, Hc);

  // wide soft crossfade at each seam + a whisper of gilded moulding, so the
  // next-scene melts into the mural on the curve rather than hard-cutting
  for (const seam of [mx, mx + muralW]) {
    const bw = 150;
    const blend = x.createLinearGradient(seam - bw, 0, seam + bw, 0);
    blend.addColorStop(0, 'rgba(150,156,144,0.0)');
    blend.addColorStop(0.5, 'rgba(140,146,132,0.34)');
    blend.addColorStop(1, 'rgba(150,156,144,0.0)');
    x.fillStyle = blend; x.fillRect(seam - bw, 0, bw * 2, Hc);
    const g = x.createLinearGradient(seam - 6, 0, seam + 6, 0);
    g.addColorStop(0, 'rgba(60,44,18,0)');
    g.addColorStop(0.5, 'rgba(228,208,150,0.5)');
    g.addColorStop(1, 'rgba(60,44,18,0)');
    x.fillStyle = g; x.fillRect(seam - 6, 0, 12, Hc);
  }
  // atmospheric haze fading the far edges into the curve
  const edge = x.createLinearGradient(0, 0, Wc, 0);
  edge.addColorStop(0, 'rgba(175,180,168,0.5)');
  edge.addColorStop(0.12, 'rgba(175,180,168,0)');
  edge.addColorStop(0.88, 'rgba(175,180,168,0)');
  edge.addColorStop(1, 'rgba(175,180,168,0.5)');
  x.fillStyle = edge; x.fillRect(0, 0, Wc, Hc);
  return c;
}

// Bas-relief maps from the painting: a contrast-curved HEIGHT map (dark subjects
// — panther, toucan, rabbit, snake, foliage — raise; bright sky stays flat) used
// for real vertex displacement, plus a Sobel NORMAL map so the relief shades and
// reflects like carved form, not a pasted photo.
function buildReliefMaps(src) {
  const scale = 0.5;
  const w = Math.round(src.width * scale), h = Math.round(src.height * scale);
  const hc = document.createElement('canvas'); hc.width = w; hc.height = h;
  const hx = hc.getContext('2d'); hx.drawImage(src, 0, 0, w, h);
  const sd = hx.getImageData(0, 0, w, h).data;

  const height = new Float32Array(w * h);
  for (let p = 0, i = 0; p < height.length; p++, i += 4) {
    const lum = (0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2]) / 255;
    let hgt = 1 - lum;                                   // dark = raised
    hgt = Math.pow(Math.max(0, hgt - 0.18) / 0.82, 1.7); // only the darker subjects lift
    height[p] = hgt;
  }
  // blur the height a touch so displacement is smooth, not jagged
  const blurred = new Float32Array(w * h);
  const at = (xx, yy) => height[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    blurred[y * w + x] = (at(x, y) * 4 + at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 8;
  }

  const himg = hx.createImageData(w, h);
  for (let p = 0; p < blurred.length; p++) {
    const v = blurred[p] * 255;
    himg.data[p * 4] = himg.data[p * 4 + 1] = himg.data[p * 4 + 2] = v; himg.data[p * 4 + 3] = 255;
  }
  hx.putImageData(himg, 0, 0);
  const heightTex = new THREE.CanvasTexture(hc);

  // Sobel -> tangent-space normal map
  const nc = document.createElement('canvas'); nc.width = w; nc.height = h;
  const nx = nc.getContext('2d'); const nimg = nx.createImageData(w, h);
  const bat = (xx, yy) => blurred[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
  const S = 3.0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (bat(x + 1, y) - bat(x - 1, y)) * S;
    const dy = (bat(x, y + 1) - bat(x, y - 1)) * S;
    let nX = -dx, nY = -dy, nZ = 1; const len = Math.hypot(nX, nY, nZ) || 1;
    const o = (y * w + x) * 4;
    nimg.data[o] = (nX / len * 0.5 + 0.5) * 255;
    nimg.data[o + 1] = (nY / len * 0.5 + 0.5) * 255;
    nimg.data[o + 2] = (nZ / len * 0.5 + 0.5) * 255;
    nimg.data[o + 3] = 255;
  }
  nx.putImageData(nimg, 0, 0);
  const normalTex = new THREE.CanvasTexture(nc);  // keep linear (not sRGB)
  return { heightTex, normalTex };
}

function makeMuralTexture() {
  return new Promise((resolve) => {
    const candidates = [window.__MURAL_DATA_URI, './MURAL.jpeg', './textures/mural.jpg'].filter(Boolean);
    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) {
        const cv = drawMuralCanvas();
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        resolve({ tex: t, relief: buildReliefMaps(cv), real: false });
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const cv = buildWallCanvas(img);
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        resolve({ tex: t, relief: buildReliefMaps(cv), real: true });
      };
      img.onerror = () => { i++; tryNext(); };
      img.src = candidates[i];
    };
    tryNext();
  });
}

let muralMat;
const { tex: muralTexture, real: muralIsReal } = await makeMuralTexture();
for (const tex of [muralTexture]) {
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  // the cylinder's inner (BackSide) faces mirror U — flip so the panorama reads
  // in true left-to-right order (panther left, snake/tree right).
  tex.repeat.x = -1;
  tex.offset.x = 1;
}

// Smooth curved wall — no displacement/normal relief (that cracked at the panel
// seams). The painting itself carries the detail; keep the surface clean.
const wallGeo = new THREE.CylinderGeometry(
  CFG.wallRadius, CFG.wallRadius, CFG.wallHeight, 220, 1, true,
  Math.PI - CFG.wallArc / 2, CFG.wallArc,   // arc centred on the front (-z)
);
muralMat = new THREE.MeshStandardMaterial({
  map: muralTexture,
  side: THREE.BackSide,
  roughness: 0.9,
  metalness: 0.0,
  emissive: 0xffffff,
  emissiveMap: muralTexture,
  emissiveIntensity: muralIsReal ? 0.08 : 0.28,
  envMapIntensity: 0.7,
});
const wall = new THREE.Mesh(wallGeo, muralMat);
wall.position.y = CFG.wallHeight / 2;
wall.receiveShadow = true;
scene.add(wall);
// base UV offset (animated very slowly for a quiet "breathing" parallax)
const muralOffsetBaseX = muralTexture.offset.x;

/* -------------------------------------------------------------------------- */
/*  Reflective marble floor  (real mirror of the mural + PBR marble overlay)    */
/* -------------------------------------------------------------------------- */
const floorGeo = new THREE.CircleGeometry(CFG.wallRadius, 128);

const reflector = new Reflector(floorGeo, {
  clipBias: 0.003,
  textureWidth: Math.min(1024, window.innerWidth * window.devicePixelRatio),
  textureHeight: Math.min(1024, window.innerHeight * window.devicePixelRatio),
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
const floorRough = makeNoiseTexture(512, 150, 90);
floorRough.repeat.set(6, 6);
const floorNormal = microNormal.clone(); floorNormal.needsUpdate = true; floorNormal.repeat.set(8, 8);
const marbleMat = new THREE.MeshPhysicalMaterial({
  map: marbleMaps.color,
  color: 0xcbb98a,
  roughness: 0.34,
  roughnessMap: floorRough,       // micro-variation so reflections aren't a perfect mirror
  metalness: 0.0,
  clearcoat: 1.0,
  clearcoatRoughness: 0.28,
  normalMap: floorNormal,
  normalScale: new THREE.Vector2(0.12, 0.12),
  envMapIntensity: 0.32,
  transparent: true,
  opacity: 0.8,            // lets the mirror beneath show through
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

// Soft ambient-occlusion darkening where the wall meets the floor (fake AO contact).
const wallAO = new THREE.Mesh(
  new THREE.CircleGeometry(CFG.wallRadius, 128),
  new THREE.MeshBasicMaterial({
    map: makeRadialTexture([[0, 'rgba(0,0,0,0)'], [0.72, 'rgba(0,0,0,0)'], [0.9, 'rgba(18,12,5,0.3)'], [1, 'rgba(12,8,3,0.5)']]),
    transparent: true, depthWrite: false,
  }),
);
wallAO.rotation.x = -Math.PI / 2;
wallAO.position.y = 0.016;
scene.add(wallAO);

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
const ringLight = new THREE.PointLight(0xffe1ab, 55, 70, 2);
ringLight.position.set(0, CFG.ceilingY - 0.4, 0);
scene.add(ringLight);

// minimal flat fill — HDRI carries the ambient, so keep these low
const fillLight = new THREE.HemisphereLight(0xfff2d8, 0x342a16, 0.06);
scene.add(fillLight);

// grazing wall washers — raking light down the mural so the bas-relief casts
// tiny self-shadows and reads as carved form, not a flat print
const wallWashL = new THREE.SpotLight(0xffe9c6, 14, 34, Math.PI / 5, 0.92, 2);
wallWashL.position.set(-7, CFG.ceilingY - 0.6, -2);
wallWashL.target.position.set(-11, 2.5, -CFG.wallRadius + 2);
scene.add(wallWashL); scene.add(wallWashL.target);
const wallWashR = new THREE.SpotLight(0xffe9c6, 14, 34, Math.PI / 5, 0.92, 2);
wallWashR.position.set(7, CFG.ceilingY - 0.6, -2);
wallWashR.target.position.set(11, 2.5, -CFG.wallRadius + 2);
scene.add(wallWashR); scene.add(wallWashR.target);

// Real key light over the hero — soft-shadow casting + physical falloff (decay=2).
const keyLight = new THREE.SpotLight(0xfff1d2, 950, 26, Math.PI / 7, 0.7, 2);
keyLight.position.set(1.6, 8.4, 6.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 2;
keyLight.shadow.camera.far = 22;
keyLight.shadow.bias = -0.0006;
keyLight.shadow.radius = 9;            // soft penumbra
keyLight.shadow.blurSamples = 24;
scene.add(keyLight);
const keyTarget = new THREE.Object3D();
keyTarget.position.set(0, 2.0, 4.2);   // the hero
scene.add(keyTarget);
keyLight.target = keyTarget;

// A cooler rim/back light for shape separation (no shadow, cheap).
const rimLight = new THREE.SpotLight(0xbfd0e6, 210, 30, Math.PI / 6, 0.9, 2);
rimLight.position.set(-6, 6, -6);
scene.add(rimLight);

/* -------------------------------------------------------------------------- */
/*  Mouse-follow spotlight sweeping the wall/floor                              */
/* -------------------------------------------------------------------------- */
const followSpot = new THREE.SpotLight(0xffe8c4, 140, 55, Math.PI / 7, 0.95, 2);
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

// Black onyx with faint warm-gold veining, so the pedestal isn't a flat CG black.
const onyxMap = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#17120b'; x.fillRect(0, 0, 512, 512);
  // cloudy tonal variation
  for (let i = 0; i < 30; i++) {
    x.globalAlpha = 0.06;
    x.fillStyle = Math.random() > 0.5 ? '#2a2013' : '#0a0806';
    x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 120, 0, Math.PI * 2); x.fill();
  }
  // thin gold veins
  x.globalAlpha = 0.5; x.strokeStyle = '#8a6a2e'; x.lineWidth = 1;
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

  // premium polished onyx pedestal — veined, micro-imperfect, softly reflective
  const stoneNoise = microNoise.clone(); stoneNoise.needsUpdate = true; stoneNoise.repeat.set(2, 3);
  const stoneNormal = microNormal.clone(); stoneNormal.needsUpdate = true; stoneNormal.repeat.set(2, 3);
  const colMat = new THREE.MeshPhysicalMaterial({
    color: 0x120f0a, map: onyxMap,           // deep near-black stone with faint veining
    roughness: 0.16, roughnessMap: stoneNoise, // polished -> sharp reflections
    metalness: 0.0,
    clearcoat: 1.0, clearcoatRoughness: 0.06,  // wet-lacquer specular coat
    normalMap: stoneNormal, normalScale: new THREE.Vector2(0.12, 0.12),
    envMapIntensity: 1.8,                       // reflects the HDRI + the glowing product
    reflectivity: 0.6,
  });
  // pedestal deliberately smaller (shorter + slimmer) so it never competes with
  // the product for focus — fine if the base is slightly cropped by the frame.
  const PED_W = 0.62, PED_H = 0.52;
  const column = new THREE.Mesh(pedestalGeo, colMat);
  column.scale.set(PED_W, PED_H, PED_W);
  column.castShadow = true;
  column.receiveShadow = true;
  group.add(column);
  const colTopY = 1.532 * PED_H;                 // new top of the shrunk column

  // glowing top plate — the interactive target, resting on the shrunk column
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xf3dfa8, emissive: 0xc79a45, emissiveIntensity: 0.35, roughness: 0.28, metalness: 0.95,
    roughnessMap: microNoise,
  });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.scale.set(PED_W, 1, PED_W);
  plate.position.y = colTopY;
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);
  const plateTopY = colTopY + 0.072;             // plate is ~0.072 tall

  // real gold product — HERO — polished metal with HDRI reflections + micro
  // roughness variation, HOVERING above the plate with a visible gap.
  const goldNoise = microNoise.clone(); goldNoise.needsUpdate = true; goldNoise.repeat.set(3, 3);
  const goldNormal = microNormal.clone(); goldNormal.needsUpdate = true; goldNormal.repeat.set(4, 4);
  const objMat = new THREE.MeshPhysicalMaterial({
    color: def.color, metalness: 1.0,
    roughness: 0.25, roughnessMap: goldNoise,   // subtle surface imperfection
    envMapIntensity: 2.4,                        // real HDRI environment reflections
    normalMap: goldNormal, normalScale: new THREE.Vector2(0.06, 0.06),
    clearcoat: 0.0,
  });
  const r = def.hero ? 0.27 : 0.2;
  const obj = new THREE.Mesh(new THREE.TorusKnotGeometry(r, r * 0.34, 260, 40), objMat);
  const gap = def.hero ? 0.55 : 0.38;
  const restY = plateTopY + gap + r;             // clear floating gap above the plate
  obj.position.y = restY;
  obj.castShadow = true;
  group.add(obj);

  group.userData = {
    label: def.label,
    plate, obj, plateMat, objMat, restY,
    baseScale: def.scale,   // hover/click must scale RELATIVE to this, not reset it
    baseEmissive: 0.26,
    hover: 0,          // eased 0..1 hover amount
    click: 0,          // decaying click pulse
    spin: Math.random() * Math.PI,
  };
  interactive.push(group);
  parallaxGroup.add(group);
}

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

// (7) Cursor "circuit" decal — thin glowing lines in a small radius, fading out.
const circuitMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uStrength: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
    varying vec2 vUv; uniform float uTime; uniform float uStrength;
    void main(){
      vec2 p = vUv*2.0-1.0;
      float r = length(p);
      float a = atan(p.y,p.x);
      float fade = smoothstep(1.0,0.15,r) * uStrength;   // fade to edge + overall strength
      // concentric rings drifting outward
      float rings = smoothstep(0.06,0.0,abs(fract(r*4.0 - uTime*0.25)-0.5)-0.44);
      // radial spokes
      float spokes = smoothstep(0.06,0.0,abs(fract(a/6.2831*12.0)-0.5)-0.46);
      // little travelling node
      float node = smoothstep(0.09,0.0,abs(r-0.55-0.18*sin(uTime*1.3)));
      float lines = clamp(rings*0.7 + spokes*0.45 + node*0.6, 0.0, 1.0);
      vec3 col = mix(vec3(0.86,0.72,0.36), vec3(1.0,0.92,0.6), lines);
      gl_FragColor = vec4(col, lines*fade*0.5);
    }
  `,
});
const circuit = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), circuitMat);
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
      // warm filmic-ish color grade
      col = pow(col, vec3(0.96));
      col *= vec3(1.045, 1.005, 0.955);
      float l = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(l), col, 1.04);                 // gentle saturation
      // strong, wide, horizontally-weighted vignette — keep only the centre third
      // bright, drop the outer ~35% (all edges) into shadow like a spotlit room
      vec2 vv = c * vec2(1.6, 1.18);
      float vig = smoothstep(0.66, 0.15, length(vv));
      col *= mix(0.12, 1.0, vig);
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
  heroGroup.userData.objMat.color.setHex(p.color);
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
// horizontal drag / touch swipe
let dragX = null;
window.addEventListener('pointerdown', (e) => { dragX = e.clientX; });
window.addEventListener('pointerup', (e) => {
  if (dragX === null) return;
  const dx = e.clientX - dragX; dragX = null;
  if (Math.abs(dx) > 90) cycleProduct(dx < 0 ? 1 : -1);
});

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
const HERO_Z = 4.2;

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function animate() {
  requestAnimationFrame(animate);
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

  // parallax on the foreground pedestals — they move MORE than the wall (depth)
  parallaxGroup.position.x = damp(parallaxGroup.position.x, -pointerSmooth.x * 1.1, 0.95, dt);
  parallaxGroup.position.z = damp(parallaxGroup.position.z, pointerSmooth.y * 0.5, 0.95, dt);

  // keep the key light + depth-of-field locked on the hero as it parallaxes
  heroPos.set(parallaxGroup.position.x, 3.4, parallaxGroup.position.z + HERO_Z);
  keyTarget.position.set(parallaxGroup.position.x, 2.6, parallaxGroup.position.z + HERO_Z);
  keyLight.position.x = damp(keyLight.position.x, 1.6 + parallaxGroup.position.x, 1.0, dt);

  // (4) very slow "breathing" parallax on the painting itself
  muralTexture.offset.x = muralOffsetBaseX + Math.sin(t * 0.05) * 0.0016;

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
    circuit.position.set(circuitState.pos.x, 0.03, circuitState.pos.z);
    circuitMat.uniforms.uTime.value = t;
    circuitMat.uniforms.uStrength.value = circuitState.strength;
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
    // hover glow + scale affect ONLY the product; the pedestal stays static
    d.objMat.emissiveIntensity = d.hover * 0.6 + d.click * 1.2;
    d.objMat.emissive.setHex(0xffcf7a);
    const os = 1 + d.hover * 0.08 + d.click * 0.14;
    d.obj.scale.setScalar(damp(d.obj.scale.x, os, 10, dt));
    d.spin += dt * (0.3 + d.hover * 0.8);
    d.obj.rotation.y = d.spin;
    d.obj.position.y = d.restY + Math.sin(t * 1.2 + d.spin) * 0.025 + d.hover * 0.06;
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
