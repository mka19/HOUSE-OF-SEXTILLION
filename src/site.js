// SEXTILLION scroll site — colour-journey engine, custom cursor, smooth scroll,
// heading reveals and the niche grid. The 3D hero lives in main.js; this file is
// everything around it.
import Lenis from 'lenis';
import SplitType from 'split-type';

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
  window.__revN = splitEls.length;
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

/* ---------------- niche grid ---------------- */
// Placeholder product silhouettes (real cutouts drop into public/products/ later).
const BAG = `<svg viewBox="0 0 100 120" fill="none"><path d="M24 44c0-14 11-24 26-24s26 10 26 24" stroke="currentColor" stroke-width="3"/><rect x="16" y="42" width="68" height="62" rx="8" fill="currentColor"/><rect x="40" y="42" width="20" height="10" fill="currentColor"/></svg>`;
const BELT = `<svg viewBox="0 0 100 120" fill="none"><rect x="10" y="52" width="80" height="16" rx="3" fill="currentColor"/><rect x="42" y="46" width="26" height="28" rx="4" stroke="currentColor" stroke-width="4"/></svg>`;
const SHOE = `<svg viewBox="0 0 100 120" fill="none"><path d="M14 78c6-22 20-30 30-30 4 8 14 12 30 14 12 2 14 10 12 18H14z" fill="currentColor"/></svg>`;
const products = [
  { n: 'BTC Hodl', s: 'Reveal soon', g: BAG },
  { n: 'BTC Mini', s: 'Reveal soon', g: BAG },
  { n: 'Crypto Chic Trunk', s: 'New', g: BAG },
  { n: 'BTC Haaland', s: 'Reveal soon', g: SHOE },
  { n: 'BTC Bitcream', s: 'Reveal soon', g: BELT },
  { n: 'BTC Gliders', s: 'New', g: SHOE },
];
const grid = document.getElementById('niche-grid');
if (grid) {
  grid.innerHTML = products.map((p) => `
    <article class="niche" data-cursor>
      <div class="niche__frame">
        <div class="niche__prod">${p.g}</div>
        <div class="niche__plinth"></div>
      </div>
      <div class="niche__meta">
        <span class="niche__name">${p.n}</span>
        <span class="niche__status">${p.s}</span>
      </div>
    </article>`).join('');
}

/* ---------------- subscribe pills ---------------- */
document.querySelectorAll('.pill').forEach((p) => p.addEventListener('click', () => p.classList.toggle('is-on')));

/* ---------------- hero visibility gate for the 3D scene ---------------- */
const stage = document.querySelector('.hero__stage');
window.__heroVisible = true;
if (stage) {
  new IntersectionObserver((e) => { window.__heroVisible = e[0].isIntersecting; }, { threshold: 0.01 })
    .observe(stage);
}

/* Split after fonts settle so line breaks measure correctly — but never hang on
   it: a 1.2s fallback (and window load) guarantee the reveal always runs even if
   the webfont is blocked. */
if (document.fonts && document.fonts.ready) document.fonts.ready.then(splitReveal);
window.addEventListener('load', splitReveal);
setTimeout(splitReveal, 1200);
window.addEventListener('resize', () => lenis.resize());
