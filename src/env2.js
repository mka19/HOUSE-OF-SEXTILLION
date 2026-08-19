// Environment 2 — "The Collection" — a REAL Three.js showroom (not a flat image).
// A warm ivory-gold gallery: a reflective floor, a back wall of lit arch niches,
// gold-disc pedestals on dark rocky mounds, and polished-gold product forms, all
// under real IBL + shadow-casting key light with a bloom + grade pass to match
// Environment 1's finish.
//
// SELF-CONTAINED + DISPOSABLE: everything it allocates (geometries, materials,
// textures, render targets, the WebGL context) is tracked and freed by dispose(),
// so this environment only occupies memory while it is the active/approached one —
// the controller in main.js builds it on approach and disposes it on leave.

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export function createEnv2(canvas) {
  const W = () => window.innerWidth, H = () => window.innerHeight;

  // ---- resource tracking so dispose() can free everything -------------------
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const track = (o) => {
    if (!o) return o;
    if (o.isBufferGeometry) geometries.add(o);
    else if (o.isMaterial) materials.add(o);
    else if (o.isTexture) textures.add(o);
    return o;
  };
  const G = (g) => track(g);
  const M = (m) => track(m);
  const T = (t) => track(t);

  // ---- renderer / scene / camera -------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x241c10, 0.0065);

  const camera = new THREE.PerspectiveCamera(40, W() / H(), 0.1, 200);
  const CAM_BASE = new THREE.Vector3(0, 2.7, 13.0);
  camera.position.copy(CAM_BASE);
  const lookTarget = new THREE.Vector3(0, 2.15, -6);

  // ---- IBL: RoomEnvironment (instant, asset-free -> fast to build/dispose) ---
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRT = pmrem.fromScene(roomEnv, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 1.05;
  roomEnv.dispose?.();
  pmrem.dispose();

  // warm graded background
  {
    const bc = document.createElement('canvas'); bc.width = 16; bc.height = 256;
    const bx = bc.getContext('2d');
    const bg = bx.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, '#3a2c18'); bg.addColorStop(0.5, '#5a4526'); bg.addColorStop(1, '#140f08');
    bx.fillStyle = bg; bx.fillRect(0, 0, 16, 256);
    const bt = T(new THREE.CanvasTexture(bc)); bt.colorSpace = THREE.SRGBColorSpace;
    scene.background = bt;
  }

  // ---- shared procedural textures ------------------------------------------
  function noiseTex(size = 512, base = 150, spread = 90) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'); const img = x.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = base + Math.random() * spread;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = T(new THREE.CanvasTexture(c)); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function radialTex(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const t = T(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  const root = new THREE.Group();
  scene.add(root);

  // ---- reflective gold floor (Reflector + physical marble overlay) ----------
  const floorGeo = G(new THREE.CircleGeometry(26, 96));
  const reflector = new Reflector(floorGeo, {
    clipBias: 0.003,
    textureWidth: Math.min(1024, W() * window.devicePixelRatio),
    textureHeight: Math.min(1024, H() * window.devicePixelRatio),
    color: 0x27200f,
  });
  reflector.rotation.x = -Math.PI / 2;
  scene.add(reflector);

  const floorRough = noiseTex(512, 140, 100); floorRough.repeat.set(8, 8);
  const floorMat = M(new THREE.MeshPhysicalMaterial({
    color: 0xb99a5e, roughness: 0.5, roughnessMap: floorRough, metalness: 0.35,
    clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.8,
    transparent: true, opacity: 0.82, depthWrite: false,
  }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.012; floor.receiveShadow = true;
  scene.add(floor);

  // ---- ivory back + side walls + ceiling ------------------------------------
  const wallMat = M(new THREE.MeshStandardMaterial({ color: 0x9c8256, roughness: 0.95, metalness: 0.0 }));
  const backWall = new THREE.Mesh(G(new THREE.PlaneGeometry(60, 22)), wallMat);
  backWall.position.set(0, 8, -16); scene.add(backWall);
  const ceiling = new THREE.Mesh(G(new THREE.PlaneGeometry(60, 44)), M(new THREE.MeshStandardMaterial({ color: 0xe4d8bf, roughness: 0.92 })));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 13; scene.add(ceiling);
  // soft recessed ceiling light strips (emissive) for the reference's even glow
  const stripMat = M(new THREE.MeshStandardMaterial({ color: 0xfff4df, emissive: 0xffe9c4, emissiveIntensity: 0.8 }));
  for (let i = -1; i <= 1; i++) {
    const strip = new THREE.Mesh(G(new THREE.PlaneGeometry(24, 0.5)), stripMat);
    strip.rotation.x = Math.PI / 2; strip.position.set(0, 12.96, -4 + i * 7); scene.add(strip);
  }

  // ---- lit arch niches along the back wall ----------------------------------
  // Each niche: a bright emissive oval (the glowing recess) framed by a dark
  // rocky arch ring, with a small gold disc + product proxy standing inside.
  // pure warm glow — unlit, so it reads as a controlled illuminated recess and
  // never blows out to white when the room lights hit it
  const nicheGlowMat = M(new THREE.MeshBasicMaterial({ color: 0xf3d29a }));
  const rockMat = M(new THREE.MeshStandardMaterial({
    color: 0x2c2415, roughness: 0.85, metalness: 0.35, flatShading: true,
    emissive: 0x0a0803, emissiveIntensity: 0.2,
  }));
  const nicheGeo = G(new THREE.CircleGeometry(1.5, 40)); // oval via scale
  const nichePositions = [-9.5, -4.7, 0, 4.7, 9.5];
  const niches = [];
  for (let i = 0; i < nichePositions.length; i++) {
    const nx = nichePositions[i];
    const tall = i === 2 ? 4.6 : 3.6;
    const grp = new THREE.Group();
    grp.position.set(nx, tall * 0.55 + 0.2, -15.4);
    // glowing recess
    const glow = new THREE.Mesh(nicheGeo, nicheGlowMat);
    glow.scale.set(1.0, tall / 1.5 * 0.62, 1); grp.add(glow);
    // rocky arch ring around it (torus, squashed, low-poly for chiselled rock)
    const ring = new THREE.Mesh(G(new THREE.TorusGeometry(1.62, 0.42, 6, 20)), rockMat);
    ring.scale.set(1.06, tall / 1.5 * 0.66, 1); ring.position.z = 0.12; grp.add(ring);
    // fill light from the recess so it actually casts warmth into the room
    const nl = new THREE.PointLight(0xffe6bc, 6, 12, 2); nl.position.set(nx, tall * 0.55, -14.4);
    scene.add(nl); niches.push(nl);
    root.add(grp);
  }

  // ---- gold disc pedestals on rocky mounds, with product proxies ------------
  const goldDiscMat = M(new THREE.MeshPhysicalMaterial({
    color: 0xd8b25e, metalness: 1.0, roughness: 0.18, envMapIntensity: 1.6, clearcoat: 0.5,
  }));
  const productMat = () => M(new THREE.MeshPhysicalMaterial({
    color: 0xe6c06a, metalness: 1.0, roughness: 0.09, envMapIntensity: 2.2, clearcoat: 0.0,
  }));
  const contactTex = radialTex([[0, 'rgba(0,0,0,0.5)'], [0.5, 'rgba(0,0,0,0.24)'], [1, 'rgba(0,0,0,0)']]);
  const contactGeo = G(new THREE.PlaneGeometry(1, 1));
  const discGeo = G(new THREE.CylinderGeometry(1, 1, 0.34, 48));
  const moundGeo = G(new THREE.IcosahedronGeometry(1, 1));

  // product proxy silhouettes (stand-ins for real GLTF product models, which can
  // be dropped in later): each a distinct polished-gold form on its own pedestal.
  function makeProxy(kind) {
    let geo;
    if (kind === 'bag') geo = G(new THREE.CapsuleGeometry(0.5, 0.5, 8, 20));
    else if (kind === 'belt') geo = G(new THREE.TorusGeometry(0.5, 0.17, 24, 48));
    else if (kind === 'shoe') geo = G(new THREE.TorusKnotGeometry(0.36, 0.13, 140, 20));
    else if (kind === 'clutch') geo = G(new THREE.BoxGeometry(1.0, 0.5, 0.4));
    else geo = G(new THREE.SphereGeometry(0.5, 32, 24));
    return new THREE.Mesh(geo, productMat());
  }

  const products = [];           // interactive gold forms (hover-brighten)
  const pedestalDefs = [
    { x: -6.5, z: -3, s: 1.05, kind: 'bag', label: 'Bags' },
    { x: -2.6, z: 2.2, s: 1.15, kind: 'belt', label: 'Belts' },
    { x: 2.6, z: 2.2, s: 1.15, kind: 'shoe', label: 'Shoes' },
    { x: 6.5, z: -3, s: 1.05, kind: 'clutch', label: 'Bags' },
    { x: 0, z: -6.5, s: 1.3, kind: 'sphere', label: 'Maison' },
  ];
  for (const d of pedestalDefs) {
    const grp = new THREE.Group(); grp.position.set(d.x, 0, d.z); grp.scale.setScalar(d.s);
    // rocky mound base
    const mound = new THREE.Mesh(moundGeo, rockMat);
    mound.scale.set(1.7, 0.5, 1.7); mound.position.y = 0.28; mound.castShadow = true; mound.receiveShadow = true;
    grp.add(mound);
    // gold disc
    const disc = new THREE.Mesh(discGeo, goldDiscMat);
    disc.position.y = 0.7; disc.castShadow = true; disc.receiveShadow = true; grp.add(disc);
    // product
    const prod = makeProxy(d.kind);
    prod.position.y = 1.35; prod.castShadow = true;
    grp.add(prod);
    // contact shadow
    const cs = new THREE.Mesh(contactGeo, M(new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, opacity: 0.5 })));
    cs.rotation.x = -Math.PI / 2; cs.position.y = 0.02; cs.scale.setScalar(3.4); grp.add(cs);
    prod.userData = { base: prod.position.y, hover: 0, spin: Math.random() * Math.PI, mat: prod.material, label: d.label };
    products.push(prod);
    root.add(grp);
  }

  // ---- lights ---------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xffe9c4, 0x241a0d, 0.32));
  const key = new THREE.SpotLight(0xfff0d4, 600, 40, Math.PI / 6, 0.75, 2);
  key.position.set(3, 12, 9); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 2; key.shadow.camera.far = 40;
  key.shadow.bias = -0.0006; key.shadow.radius = 8;
  const keyT = new THREE.Object3D(); keyT.position.set(0, 1, -1); scene.add(keyT); key.target = keyT;
  scene.add(key);
  const warmFill = new THREE.PointLight(0xffdca6, 30, 60, 2); warmFill.position.set(0, 9, 6); scene.add(warmFill);
  const rim = new THREE.SpotLight(0xcfe0f0, 120, 40, Math.PI / 5, 0.9, 2); rim.position.set(-8, 7, -10); scene.add(rim);

  // ---- post: bloom + a warm grade ------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.18, 0.6, 0.9);
  composer.addPass(bloom);
  const gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D tDiffuse;
      void main(){
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        col = clamp((col - 0.5) * 1.18 + 0.5, 0.0, 1.0);   // contrast
        float l = dot(col, vec3(0.2126,0.7152,0.0722));
        // warm split-tone: honeyed highlights, deep warm shadows
        col *= mix(vec3(1.03,0.98,0.88), vec3(1.04,1.0,0.94), smoothstep(0.05,0.6,l));
        col = mix(vec3(l), col, 0.95);                      // rich saturation
        // strong, warm vignette so the upper/outer room falls into shadow
        vec2 c = vUv - 0.5; c *= vec2(1.5, 1.28);
        float vig = smoothstep(0.72, 0.12, length(c));
        col *= mix(0.14, 1.0, vig);
        col = pow(clamp(col,0.0,1.0), vec3(1.0/2.2));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  composer.addPass(gradePass);

  // ---- interaction: pointer parallax + hover-brighten -----------------------
  const pointer = new THREE.Vector2(0, 0);
  const pointerSmooth = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  let hovered = null;
  function onMove(e) {
    if (window.__activeEnv !== 2 || window.__envDragging) return; // only when parked on Env2
    pointer.x = (e.clientX / W()) * 2 - 1;
    pointer.y = -((e.clientY / H()) * 2 - 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(products, false)[0];
    hovered = hit ? hit.object : null;
    document.body.classList.toggle('is-hovering', !!hovered);
  }
  window.addEventListener('pointermove', onMove);

  // ---- animation ------------------------------------------------------------
  const clock = new THREE.Clock();
  let raf = 0, disposed = false;
  function damp(a, b, l, dt) { return a + (b - a) * (1 - Math.exp(-l * dt)); }
  function frame() {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    // only render while Env2 is on-screen (approaching, transitioning, or active)
    const t = window.__trans;
    const visible = window.__activeEnv === 2 || (t && t.progress > 0.001);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05), et = clock.elapsedTime;
    pointerSmooth.x = damp(pointerSmooth.x, pointer.x, 1.2, dt);
    pointerSmooth.y = damp(pointerSmooth.y, pointer.y, 1.2, dt);
    // idle-aware camera parallax/sway
    camera.position.x = damp(camera.position.x, CAM_BASE.x + pointerSmooth.x * 1.6 + Math.sin(et * 0.08) * 0.3, 1.2, dt);
    camera.position.y = damp(camera.position.y, CAM_BASE.y + pointerSmooth.y * 0.6, 1.2, dt);
    lookTarget.x = damp(lookTarget.x, pointerSmooth.x * 1.6, 1.0, dt);
    camera.lookAt(lookTarget);
    // niche + product life
    for (const p of products) {
      const u = p.userData;
      u.hover = damp(u.hover, hovered === p ? 1 : 0, 8, dt);
      u.spin += dt * (0.25 + u.hover * 0.9);
      p.rotation.y = u.spin;
      p.position.y = u.base + Math.sin(et * 1.1 + u.spin) * 0.03 + u.hover * 0.12;
      u.mat.emissive.setHex(0xffcf7a);
      u.mat.emissiveIntensity = u.hover * 0.7;
      const s = 1 + u.hover * 0.08;
      p.scale.setScalar(damp(p.scale.x, s, 10, dt));
    }
    composer.render();
  }
  frame();

  // ---- resize ---------------------------------------------------------------
  function resize() {
    camera.aspect = W() / H(); camera.updateProjectionMatrix();
    renderer.setSize(W(), H()); composer.setSize(W(), H());
  }
  window.addEventListener('resize', resize);

  // ---- dispose: free every GPU allocation + the context ---------------------
  function dispose() {
    if (disposed) return; disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('resize', resize);
    scene.traverse((o) => {
      if (o.isMesh || o.isPoints) { o.geometry && geometries.add(o.geometry); }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    envRT.dispose?.();
    reflector.getRenderTarget?.().dispose?.();
    reflector.dispose?.();
    bloom.dispose?.();
    composer.renderTarget1?.dispose(); composer.renderTarget2?.dispose();
    if (scene.background && scene.background.isTexture) scene.background.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    geometries.clear(); materials.clear(); textures.clear();
  }

  return { dispose, resize, get disposed() { return disposed; } };
}
