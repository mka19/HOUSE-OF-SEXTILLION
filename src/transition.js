// Premium pointer-driven transition between Environment 1 (live 3D) and
// Environment 2 (flat showroom image). ONE progress value (0 = Env1, 1 = Env2)
// drives every transform, the mask boundary, the light seam and the motion blur,
// so the two flat spaces read as one continuous horizontal exhibition you pull
// through — weighted, inertial, no bounce, no slider feel. No external deps: the
// release is a custom critically-damped spring.

export function initTransition({ onSettled, onApproachEnv2, onLeaveEnv2 } = {}) {
  const showroom = document.getElementById('showroom');
  const env1 = document.getElementById('env1');
  const env2 = document.getElementById('env2');
  const seam = document.getElementById('lightseam');
  const voidEl = document.getElementById('voidoverlay');
  const mblurG = document.getElementById('mblur-g'); // SVG feGaussianBlur node
  const topChrome = document.querySelector('.chrome--top');
  if (!showroom || !env1 || !env2) return null;

  // Environment 2 is a real 3D scene built ON DEMAND (see main.js): created the
  // moment a drag toward it begins (so it's ready by the time you arrive) and
  // disposed once you've settled back on Env1 — only the active/approached
  // environment lives in memory.

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
    // Curved-room turn: each environment is a wall on a cylinder. As you pull
    // through, the current wall swings AWAY from camera (rotates on Y and recedes
    // in Z) while the next wall swings IN from around the bend — not a flat slide.
    // Full-width lateral travel so each env is cleanly OFF-screen at its rest
    // anchor (no leak-in at cl=0/1). The curved-room "turn" (rotateY + translateZ)
    // PEAKS mid-transition and returns to zero at both anchors — bend = sin(π·cl) —
    // so each wall is flat when parked and only angles as it swings around the bend.
    // (A constant rotation at rest, combined with perspective, pulled the parked
    //  env back on-screen; this keeps the rest states perfectly flat.)
    const TX = W;
    const bend = Math.sin(Math.PI * cl);
    const e1x = -cl * TX,        e2x = (1 - cl) * TX;
    const e1rot = bend * 34,     e2rot = -bend * 34;       // deg — angle off-axis mid-turn only
    const e1z = -bend * 240,     e2z = -bend * 240;        // px — recede mid-turn only
    env1.style.transform =
      `translate3d(${e1x}px,0,${e1z}px) rotateY(${e1rot}deg) scale(${1 - 0.02 * cl})`;
    env2.style.transform =
      `translate3d(${e2x}px,0,${e2z}px) rotateY(${e2rot}deg) scale(${1 - 0.02 * (1 - cl)})`;
    env1.style.opacity = String(1 - 0.10 * cl);    // Env1 gently loses dominance
    // Dark connecting "void": a genuine near-black passage you cross between the
    // two rooms. The exponent < 1 WIDENS the dark plateau (a held moment of
    // darkness), instead of a thin spike, and it reaches full black at the middle
    // so each room reveals out of darkness like a new act — not a slide.
    const voidAmt = Math.pow(Math.sin(Math.PI * cl), 0.55);
    if (voidEl) voidEl.style.opacity = String(voidAmt);
    // fade the persistent brand nav down through the dark moment so each room
    // reveals cleanly, then it returns — reinforces the "new act" beat
    if (topChrome) topChrome.style.opacity = cl > 0.001 && cl < 0.999 ? String(1 - voidAmt * 0.9) : '';
    // Velocity-based DIRECTIONAL (horizontal) motion blur via the SVG filter,
    // driven by the live drag/flick velocity. Spec range 0–1.5px.
    const b = Math.min(1.5, Math.abs(state.vel) * 3.2);
    if (mblurG) mblurG.setAttribute('stdDeviation', `${b.toFixed(2)} 0`);
    const f = b > 0.03 ? 'url(#mblur)' : 'none';
    env1.style.filter = f; env2.style.filter = f;
    // Soft feathering on BOTH facing edges while turning, so the seam blends and
    // never shows a hard vertical cut. env2's leading (left) edge and env1's
    // trailing (right) edge each dissolve over a ~64px gradient zone.
    const turning = cl > 0.02 && cl < 0.985;
    const e2mask = turning
      ? 'linear-gradient(to right, transparent 0, #000 64px, #000 100%)'
      : 'none';
    const e1mask = turning
      ? 'linear-gradient(to right, #000 0, #000 calc(100% - 64px), transparent 100%)'
      : 'none';
    env2.style.webkitMaskImage = e2mask; env2.style.maskImage = e2mask;
    env1.style.webkitMaskImage = e1mask; env1.style.maskImage = e1mask;
    // warm light-continuity overlay rides the moving boundary, read through the void
    if (seam) {
      seam.style.transform = `translate3d(${e2x}px,0,0)`;
      seam.style.opacity = String(0.22 * Math.sin(Math.PI * cl));
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
    // parked back on Env1 -> tear down Env2 so only the active env holds memory
    if (!atEnv2) onLeaveEnv2 && onLeaveEnv2();
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
      // starting a drag from Env1 -> begin building Env2 now, so its geometry,
      // textures and lights are ready by the time we arrive (Cartier-style
      // approach-preload). Idempotent on the main.js side.
      if (startProgress < 0.5) onApproachEnv2 && onApproachEnv2();
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

  return state;
}
