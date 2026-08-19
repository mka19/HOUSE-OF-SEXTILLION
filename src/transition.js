// Premium pointer-driven transition between Environment 1 (live 3D) and
// Environment 2 (flat showroom image). ONE progress value (0 = Env1, 1 = Env2)
// drives every transform, the mask boundary, the light seam and the motion blur,
// so the two flat spaces read as one continuous horizontal exhibition you pull
// through — weighted, inertial, no bounce, no slider feel. No external deps: the
// release is a custom critically-damped spring.

export function initTransition({ onSettled } = {}) {
  const showroom = document.getElementById('showroom');
  const env1 = document.getElementById('env1');
  const env2 = document.getElementById('env2');
  const env2img = document.getElementById('env2img');
  const seam = document.getElementById('lightseam');
  if (!showroom || !env1 || !env2) return null;

  // ---- Environment 2 image (real photo if present, else keep placeholder) ----
  ['./SHOWROOM2.jpg', './SHOWROOM2.jpeg', './SHOWROOM2.png'].forEach((src) => {
    const img = new Image();
    img.onload = () => {
      env2img.style.setProperty('--env2-src', `url("${src}")`);
      env2img.classList.add('has-photo');
      buildHotspots();
    };
    img.src = src;
  });

  const state = { progress: 0, target: 0, vel: 0, dragging: false, animating: false };
  window.__trans = state;
  let W = window.innerWidth;
  window.addEventListener('resize', () => { W = window.innerWidth; });

  // interaction bookkeeping
  let downX = null, downY = 0, lastX = 0, pointerVel = 0, captured = false, startProgress = 0;

  const DRAG_DIST = () => Math.min(W * 0.6, 900); // user needn't cross the full screen
  const THRESH = 8;                               // px of intent before we take over
  const SMOOTH = 0.14;                            // pointer smoothing (attached but fluid)
  const SMOOTHTIME = 0.5;                          // release settle time (critically damped)
  const FLICK = 9;                                // px/frame flick threshold

  // Unconditionally-stable critically-damped smoothing (Game Gems "SmoothDamp").
  // No overshoot / bounce at any frame rate; carries velocity so a flick continues.
  function smoothDamp(cur, target, dt) {
    const omega = 2 / SMOOTHTIME;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = cur - target;
    const temp = (state.vel + omega * change) * dt;
    state.vel = (state.vel - omega * temp) * exp;
    return target + (change + temp) * exp;
  }

  function setDragging(d) {
    state.dragging = d;
    window.__envDragging = d;                     // 3D scene suspends its own pointer work
    showroom.classList.toggle('is-grabbing', d);
  }

  // subtle non-linear resistance as you approach the far anchor
  function resist(x) { return x < 0.86 ? x : 0.86 + (x - 0.86) * 0.55; }

  function apply(p) {
    const cl = p < 0 ? 0 : p > 1 ? 1 : p;
    const e1x = -cl * W;                           // Env1 pans fully to the left
    const e2x = (1 - cl) * W;                      // Env2 enters from the right
    env1.style.transform = `translate3d(${e1x}px,0,0) scale(${1 - 0.015 * cl})`;
    env2.style.transform = `translate3d(${e2x}px,0,0) scale(${1.015 - 0.015 * cl})`;
    env1.style.opacity = String(1 - 0.12 * cl);    // Env1 gently loses dominance
    // velocity-based directional motion blur, capped very low; never blurs product
    const b = Math.min(1.5, Math.abs(state.vel) * 0.9);
    const f = b > 0.03 ? `blur(${b.toFixed(2)}px)` : 'none';
    env1.style.filter = f; env2.style.filter = f;
    // warm light-continuity overlay rides the moving boundary
    if (seam) {
      seam.style.transform = `translate3d(${e2x}px,0,0)`;
      seam.style.opacity = String(0.16 * Math.sin(Math.PI * cl));
    }
    env2.style.pointerEvents = cl > 0.995 ? 'auto' : 'none';
  }

  // ---- main animation loop (all visual interpolation happens here) ----
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (state.dragging) {
      const np = state.progress + (state.target - state.progress) * SMOOTH;
      state.vel = (np - state.progress) / Math.max(dt, 0.001);
      state.progress = np;
    } else if (state.animating) {
      state.progress = smoothDamp(state.progress, state.target, dt);
      if (Math.abs(state.target - state.progress) < 0.004 && Math.abs(state.vel) < 0.05) {
        state.progress = state.target; state.vel = 0; state.animating = false;
        settle();
      }
    }
    apply(state.progress);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function settle() {
    const atEnv2 = state.progress > 0.5;
    document.body.classList.toggle('at-env2', atEnv2);
    window.__activeEnv = atEnv2 ? 2 : 1;
    env2.style.pointerEvents = atEnv2 ? 'auto' : 'none';
    onSettled && onSettled(atEnv2 ? 2 : 1);
  }

  // ---- pointer handling ----
  function onDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    downX = lastX = e.clientX; downY = e.clientY;
    startProgress = state.progress;
    captured = false; pointerVel = 0;
    state.animating = false; state.vel = 0;
  }
  function onMove(e) {
    if (downX === null) return;
    const dx = e.clientX - downX, dy = e.clientY - downY;
    pointerVel = e.clientX - lastX; lastX = e.clientX;
    if (!captured) {
      if (Math.abs(dx) < THRESH) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;    // vertical intent -> let it be
      captured = true; setDragging(true);
    }
    // drag left (downX - x > 0) advances toward Env2; drag right retreats
    const raw = startProgress + (downX - e.clientX) / DRAG_DIST();
    let t = raw < 0 ? 0 : resist(raw);
    state.target = t > 1 ? 1 : t;
  }
  function onUp() {
    if (downX === null) return;
    const wasDrag = captured;
    downX = null;
    if (!wasDrag) { setDragging(false); return; } // a click, not a drag — 3D scene keeps it
    const startAtEnv2 = startProgress > 0.5;
    let target;
    if (!startAtEnv2) {
      const flickLeft = -pointerVel;
      target = (state.progress > 0.28 || flickLeft > FLICK) ? 1 : 0;
    } else {
      const flickRight = pointerVel;
      target = (state.progress < 0.72 || flickRight > FLICK) ? 0 : 1;
    }
    state.target = target;
    state.animating = true;                        // spring carries the drag velocity -> flick
    setDragging(false);
  }

  showroom.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  // ---- Env2 product hotspots (item 18): localized illuminated-recess brighten ----
  // Approximate positions over the reference showroom; tune to the real photo.
  const HOTSPOTS = [
    { x: 12, y: 45, s: 20 }, { x: 24, y: 40, s: 16 }, { x: 37, y: 45, s: 15 },
    { x: 50, y: 33, s: 24 }, { x: 63, y: 40, s: 15 }, { x: 74, y: 40, s: 16 },
    { x: 88, y: 42, s: 18 },
  ];
  function buildHotspots() {
    const host = document.getElementById('env2hotspots');
    if (!host || host.childElementCount) return;
    for (const h of HOTSPOTS) {
      const el = document.createElement('div');
      el.className = 'hotspot';
      el.style.left = h.x + '%'; el.style.top = h.y + '%';
      el.style.width = h.s + 'vw'; el.style.height = h.s + 'vw';
      host.appendChild(el);
    }
  }

  return state;
}
