// SEXTILLION scroll site — colour-journey engine, custom cursor, smooth scroll,
// heading reveals and the niche grid. The 3D hero lives in main.js; this file is
// everything around it.
import Lenis from 'lenis';
import SplitType from 'split-type';
// (The Three.js atelier scene in ./main.js is preserved in the repo but not
//  mounted — the hero is the restrained §6.1 maison per DESIGN.md.)

/* ---------------- smooth scroll (Lenis) ---------------- */
const lenis = new Lenis({ duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 3), smoothWheel: true });
function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
requestAnimationFrame(raf);
// anchor links
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length > 1) { e.preventDefault(); lenis.scrollTo(id, { offset: 0 }); }
  });
});

/* ---------------- colour journey ---------------- */
// Each section carries data-bg / data-fg. The section under the viewport centre
// drives <body>'s --bg/--fg, lerping toward the NEXT section's colours across the
// final 35% of the section — a glide, never a class-toggle snap.
const sections = [...document.querySelectorAll('[data-bg]')].filter((s) => s !== document.body);
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
const cols = sections.map((s) => ({ el: s, bg: hex(s.dataset.bg), fg: hex(s.dataset.fg) }));
const splitEls = [];   // populated by splitReveal(); revealed by journey()
function journey() {
  const mid = window.scrollY + window.innerHeight / 2;
  let cur = cols[0];
  for (const c of cols) { const r = c.el.getBoundingClientRect(); const top = r.top + window.scrollY; if (mid >= top) cur = c; }
  const i = cols.indexOf(cur);
  const r = cur.el.getBoundingClientRect(); const top = r.top + window.scrollY;
  const prog = Math.min(1, Math.max(0, (mid - top) / r.height));
  const next = cols[Math.min(cols.length - 1, i + 1)];
  const t = prog < 0.65 ? 0 : (prog - 0.65) / 0.35;
  const bg = mix(cur.bg, next.bg, t), fg = mix(cur.fg, next.fg, t);
  const b = document.body.style;
  b.setProperty('--bg', `rgb(${bg.join(',')})`);
  b.setProperty('--fg', `rgb(${fg.join(',')})`);
  b.setProperty('--line', `rgba(${fg.join(',')},0.16)`);
  // heading reveals ride this same (known-running) loop
  const vh = window.innerHeight;
  for (const el of splitEls) {
    if (el.classList.contains('is-in')) continue;
    const rr = el.getBoundingClientRect();
    if (rr.top < vh * 0.85 && rr.bottom > 0) el.classList.add('is-in');
  }
  requestAnimationFrame(journey);
}
requestAnimationFrame(journey);

/* ---------------- custom cursor ---------------- */
const cursor = document.getElementById('cursor');
const label = cursor.querySelector('.cursor__label');
let cx = window.innerWidth / 2, cy = window.innerHeight / 2, tx = cx, ty = cy;
window.addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
function cursorRaf() {
  cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
  cursor.style.transform = `translate(${cx}px, ${cy}px)`;
  requestAnimationFrame(cursorRaf);
}
requestAnimationFrame(cursorRaf);
document.querySelectorAll('a, button, [data-cursor], .niche').forEach((el) => {
  el.addEventListener('pointerenter', () => {
    cursor.classList.add('is-active');
    label.textContent = el.classList.contains('niche') ? 'Soon' : (el.dataset.cursorLabel || '');
  });
  el.addEventListener('pointerleave', () => { cursor.classList.remove('is-active'); label.textContent = ''; });
});

/* ---------------- heading reveal (line mask) ----------------
   Split headings into lines; the actual is-in reveal is driven by the journey()
   rAF loop above (known to run under Lenis). */
let splitDone = false;
function splitReveal() {
  if (splitDone) return; splitDone = true;
  document.querySelectorAll('[data-split]').forEach((el) => {
    const s = new SplitType(el, { types: 'lines' });
    (s.lines || []).forEach((ln) => {
      const span = document.createElement('span');
      while (ln.firstChild) span.appendChild(ln.firstChild);
      ln.appendChild(span);
    });
    el.classList.add('split');                 // gate the hidden state on JS having run
    splitEls.push(el);
  });
}

/* ---------------- niche grid ----------------
   Products are all "Reveal soon", so the niche is intentionally empty — a single
   museum-lit alcove with a gold seal on the plinth. Real cutouts drop into
   public/products/ later (see the img slot). Same staging for every card so the
   collection reads as one set (DESIGN.md 1c / 1b). */
const products = [
  { n: 'BTC Hodl', s: 'Reveal soon', cat: 'Bag' },
  { n: 'BTC Mini', s: 'Reveal soon', cat: 'Bag' },
  { n: 'Crypto Chic Trunk', s: 'New', cat: 'Trunk' },
  { n: 'BTC Haaland', s: 'Reveal soon', cat: 'Shoe' },
  { n: 'BTC Bitcream', s: 'Reveal soon', cat: 'Belt' },
  { n: 'BTC Gliders', s: 'New', cat: 'Shoe' },
];
const seal = `<svg class="niche__seal" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.5"/><text x="24" y="31" text-anchor="middle" font-family="Duru Sans, sans-serif" font-size="20" fill="currentColor">S</text></svg>`;
const grid = document.getElementById('niche-grid');
if (grid) {
  grid.innerHTML = products.map((p) => `
    <article class="niche" data-cursor>
      <div class="niche__frame">
        <div class="niche__glow"></div>
        ${seal}
        <div class="niche__plinth"></div>
      </div>
      <div class="niche__meta">
        <span class="niche__name">${p.n}</span>
        <span class="niche__status">${p.cat} · ${p.s}</span>
      </div>
    </article>`).join('');
}

/* ---------------- subscribe pills ---------------- */
document.querySelectorAll('.pill').forEach((p) => p.addEventListener('click', () => p.classList.toggle('is-on')));

/* ---------------- loader reveal ---------------- */
function reveal() {
  const fill = document.getElementById('loader-fill');
  if (fill) fill.style.width = '100%';
  setTimeout(() => {
    document.getElementById('loader')?.classList.add('is-hidden');
    document.body.classList.add('is-ready');
  }, 260);
}
if (document.readyState === 'complete') reveal();
else window.addEventListener('load', reveal);
setTimeout(reveal, 1400);   // safety

/* ---------------- hero wordmark: character shuffle (pattern B) ---------------- */
function heroShuffle() {
  const el = document.querySelector('[data-shuffle]');
  if (!el || el.dataset.done) return; el.dataset.done = '1';
  const s = new SplitType(el, { types: 'chars' });
  (s.chars || []).forEach((c, i) => {
    c.style.display = 'inline-block';
    c.style.opacity = '0';
    c.style.transform = 'translateY(40%)';
    c.style.filter = 'blur(6px)';
    c.style.transition = 'opacity 0.9s var(--ease), transform 0.9s var(--ease), filter 0.9s var(--ease)';
    c.style.transitionDelay = (0.25 + i * 0.045) + 's';
    requestAnimationFrame(() => {
      c.style.opacity = '1'; c.style.transform = 'none'; c.style.filter = 'none';
    });
  });
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(heroShuffle);
window.addEventListener('load', heroShuffle);
setTimeout(heroShuffle, 900);

/* ---------------- hero parallax (wordmark up 0.4x, fade) ---------------- */
const heroCopy = document.querySelector('.hero__copy');
const heroBloom = document.querySelector('.hero__bloom');
function heroParallax() {
  const y = window.scrollY;
  if (heroCopy && y < window.innerHeight * 2.2) {
    heroCopy.style.transform = `translateY(${y * 0.4}px)`;
    heroCopy.style.opacity = String(Math.max(0, 1 - y / (window.innerHeight * 0.75)));
  }
  if (heroBloom) heroBloom.style.transform = `translateY(${y * 0.15}px) scale(${1 + y / 4000})`;
  requestAnimationFrame(heroParallax);
}
requestAnimationFrame(heroParallax);

/* Split after fonts settle so line breaks measure correctly — but never hang on
   it: a 1.2s fallback (and window load) guarantee the reveal always runs even if
   the webfont is blocked. */
if (document.fonts && document.fonts.ready) document.fonts.ready.then(splitReveal);
window.addEventListener('load', splitReveal);
setTimeout(splitReveal, 1200);
window.addEventListener('resize', () => lenis.resize());
