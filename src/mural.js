// Procedural recreation of the House of Sextillion reference mural.
// Golden panoramic chinoiserie: cream sky, layered misty mountains, a winding
// luminous river, scattered gold trees + pagodas, dark animal accents, and
// vertical gold panel seams. Rendered to a high-res canvas so it can be used
// as a real texture on the curved wall. If a real photo exists at
// /textures/mural.jpg it is used instead (see loadMuralTexture()).

const W = 4096;
const H = 1400;

function lerp(a, b, t) { return a + (b - a) * t; }

// deterministic pseudo-random so the mural is stable across reloads/screenshots
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sky(ctx) {
  // Warm ivory sky, brightest toward the central distant valley.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.0, '#c0ac7c');   // gilded ceiling shadow up top
  g.addColorStop(0.16, '#dacda4');
  g.addColorStop(0.38, '#e6dcbf');
  g.addColorStop(0.64, '#eadfc6');  // luminous horizon band
  g.addColorStop(1.0, '#e3d7bb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // gentle central lift — the vanishing valley (kept subtle so it never blooms)
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.56, 40, W * 0.5, H * 0.56, W * 0.4);
  glow.addColorStop(0, 'rgba(244,236,218,0.11)');
  glow.addColorStop(1, 'rgba(246,238,220,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

// One layered mountain ridge. Higher `depth` (0..1) => nearer, darker, taller.
function ridge(ctx, rng, baseY, amp, depth, color) {
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, baseY);
  const seg = 26;
  let prev = baseY;
  for (let i = 0; i <= seg; i++) {
    const x = (i / seg) * W;
    // rounded overlapping hills via summed sines + noise
    const n = Math.sin(i * 0.7 + depth * 9) * 0.5 + Math.sin(i * 1.9 + depth * 3) * 0.3 + (rng() - 0.5) * 0.5;
    const target = baseY - n * amp;
    const y = lerp(prev, target, 0.6);
    const xc = x - (W / seg) * 0.5;
    ctx.quadraticCurveTo(xc, prev, x, y);
    prev = y;
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // soft atmospheric haze on top edge of the ridge to fake distance
  const haze = ctx.createLinearGradient(0, baseY - amp, 0, baseY + amp * 0.6);
  haze.addColorStop(0, `rgba(246,236,210,${0.32 * (1 - depth)})`);
  haze.addColorStop(1, 'rgba(246,236,210,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Winding luminous river — a graceful Catmull-Rom S-curve from far to near.
function river(ctx) {
  ctx.save();
  // sparse control points (x, y in 0..1, half-width in px)
  const ctrl = [
    [0.50, 0.55, 5],
    [0.535, 0.62, 13],
    [0.475, 0.70, 24],
    [0.535, 0.79, 42],
    [0.47, 0.88, 68],
    [0.50, 1.02, 110],
  ];
  // densify with a Catmull-Rom spline for smooth banks
  const spline = [];
  const seg = 16;
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) =>
        0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      spline.push([
        cr(p0[0], p1[0], p2[0], p3[0]) * W,
        cr(p0[1], p1[1], p2[1], p3[1]) * H,
        cr(p0[2], p1[2], p2[2], p3[2]),
      ]);
    }
  }
  // offset perpendicular to build a smooth ribbon
  const left = [], right = [];
  for (let i = 0; i < spline.length; i++) {
    const [x, y, w] = spline[i];
    const [nx, ny] = spline[Math.min(spline.length - 1, i + 1)];
    let dx = nx - x, dy = ny - y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    left.push([x - dy * w, y + dx * w]);
    right.push([x + dy * w, y - dx * w]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const [x, y] of left) ctx.lineTo(x, y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  const rg = ctx.createLinearGradient(0, H * 0.5, 0, H);
  rg.addColorStop(0, '#e7dcbe');
  rg.addColorStop(1, '#ddcca2');
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(196,158,72,0.3)';
  ctx.stroke();
  ctx.restore();
}

// Stylised gold "pom / umbrella" tree.
function goldTree(ctx, x, y, s, rng) {
  ctx.save();
  ctx.translate(x, y);
  // trunk
  ctx.strokeStyle = '#a9863f';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -s * 0.7);
  ctx.stroke();
  // canopy — cluster of gold blobs
  const blobs = 7 + Math.floor(rng() * 5);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2;
    const r = s * (0.32 + rng() * 0.14);
    const bx = Math.cos(a) * s * 0.34 * rng();
    const by = -s * 0.85 + Math.sin(a) * s * 0.30 * rng();
    const grd = ctx.createRadialGradient(bx, by, 1, bx, by, r);
    grd.addColorStop(0, '#e2cd96');
    grd.addColorStop(1, '#b7934c');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Little gold pagoda silhouette.
function pagoda(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#c6a24d';
  ctx.strokeStyle = 'rgba(120,92,36,0.5)';
  ctx.lineWidth = 1;
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const w = s * (1 - t * 0.22);
    const ty = -t * s * 0.5;
    // swooping roof
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, ty);
    ctx.quadraticCurveTo(-w * 0.62, ty - s * 0.12, -w * 0.4, ty - s * 0.22);
    ctx.lineTo(0, ty - s * 0.34);
    ctx.lineTo(w * 0.4, ty - s * 0.22);
    ctx.quadraticCurveTo(w * 0.62, ty - s * 0.12, w * 0.5, ty);
    ctx.closePath();
    ctx.fill();
    // body
    ctx.fillRect(-w * 0.22, ty - s * 0.02, w * 0.44, -s * 0.28 + s * 0.02);
  }
  // finial
  ctx.beginPath();
  ctx.arc(0, -tiers * s * 0.5 - s * 0.02, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Gold banana / palm fronds anchoring the foreground edges.
function palm(ctx, x, y, s, dir, rng) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  const fronds = 6;
  for (let i = 0; i < fronds; i++) {
    const a = -1.15 + (i / (fronds - 1)) * 1.9;
    const len = s * (0.85 + rng() * 0.3);
    ctx.save();
    ctx.rotate(a);
    const grd = ctx.createLinearGradient(0, 0, len, 0);
    grd.addColorStop(0, '#a4813a');
    grd.addColorStop(1, '#e4cd8e');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -s * 0.16, len, 0);
    ctx.quadraticCurveTo(len * 0.5, s * 0.16, 0, 0);
    ctx.fill();
    // midrib serrations
    ctx.strokeStyle = 'rgba(120,92,36,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, 0, len, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Dark accent: panther prowling on a plinth (left focal point of reference).
function panther(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  // gold plinth
  const pg = ctx.createLinearGradient(0, 0, 0, s * 0.55);
  pg.addColorStop(0, '#e2c880');
  pg.addColorStop(1, '#a5823c');
  ctx.fillStyle = pg;
  ctx.fillRect(-s * 0.62, 0, s * 1.24, s * 0.55);
  // body
  ctx.fillStyle = '#141210';
  ctx.beginPath();
  ctx.moveTo(-s * 0.6, -s * 0.02);
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.42, -s * 0.18, -s * 0.4);
  ctx.quadraticCurveTo(s * 0.1, -s * 0.4, s * 0.34, -s * 0.5); // shoulders/neck
  ctx.quadraticCurveTo(s * 0.55, -s * 0.58, s * 0.62, -s * 0.44); // head
  ctx.quadraticCurveTo(s * 0.66, -s * 0.3, s * 0.5, -s * 0.28);
  ctx.quadraticCurveTo(s * 0.3, -s * 0.24, s * 0.2, -s * 0.02); // front leg
  ctx.lineTo(s * 0.12, -s * 0.02);
  ctx.quadraticCurveTo(s * 0.0, -s * 0.2, -s * 0.2, -s * 0.02); // belly
  ctx.lineTo(-s * 0.6, -s * 0.02);
  ctx.closePath();
  ctx.fill();
  // tail
  ctx.strokeStyle = '#141210';
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.58, -s * 0.1);
  ctx.quadraticCurveTo(-s * 0.9, -s * 0.2, -s * 0.78, -s * 0.42);
  ctx.stroke();
  // amber eye
  ctx.fillStyle = '#e9b64c';
  ctx.beginPath();
  ctx.arc(s * 0.55, -s * 0.46, s * 0.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Dark accent: snake coiling up grass at the far right of the reference.
function snake(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#171310';
  ctx.lineWidth = s * 0.13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(s * 0.5, -s * 0.1, -s * 0.4, -s * 0.5, s * 0.2, -s * 0.7);
  ctx.bezierCurveTo(s * 0.6, -s * 0.85, s * 0.1, -s * 1.05, -s * 0.15, -s * 1.15);
  ctx.stroke();
  // gold belly dashes
  ctx.strokeStyle = 'rgba(214,176,86,0.85)';
  ctx.lineWidth = s * 0.05;
  ctx.setLineDash([s * 0.06, s * 0.09]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(s * 0.5, -s * 0.1, -s * 0.4, -s * 0.5, s * 0.2, -s * 0.7);
  ctx.bezierCurveTo(s * 0.6, -s * 0.85, s * 0.1, -s * 1.05, -s * 0.15, -s * 1.15);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// Toucan perched on a branch (upper left of reference).
function toucan(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  // branch
  ctx.strokeStyle = '#9c7c39';
  ctx.lineWidth = s * 0.08;
  ctx.beginPath();
  ctx.moveTo(-s, s * 0.1);
  ctx.quadraticCurveTo(0, 0, s, s * 0.05);
  ctx.stroke();
  // body
  ctx.fillStyle = '#151210';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.25, s * 0.28, s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // beak
  ctx.fillStyle = '#d8a63f';
  ctx.beginPath();
  ctx.moveTo(s * 0.18, -s * 0.5);
  ctx.quadraticCurveTo(s * 0.95, -s * 0.55, s * 0.2, -s * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Vertical gold panel seams that divide the panorama, as in the reference.
function panels(ctx, count) {
  for (let i = 1; i < count; i++) {
    const x = (i / count) * W;
    // frame shadow + gilded highlight
    const g = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
    g.addColorStop(0, 'rgba(60,44,18,0)');
    g.addColorStop(0.4, 'rgba(60,44,18,0.28)');
    g.addColorStop(0.5, 'rgba(233,210,149,0.85)');
    g.addColorStop(0.6, 'rgba(60,44,18,0.28)');
    g.addColorStop(1, 'rgba(60,44,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 10, 0, 20, H);
  }
  // outer frame edges
  ctx.fillStyle = 'rgba(233,210,149,0.7)';
  ctx.fillRect(0, 0, 5, H);
  ctx.fillRect(W - 5, 0, 5, H);
}

export function drawMuralCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rng = makeRng(20260817);

  sky(ctx);

  // Receding mountain ridges — cool & pale in the misty distance, warm gold near.
  ridge(ctx, rng, H * 0.47, H * 0.07, 0.10, '#d9d0b8');
  ridge(ctx, rng, H * 0.52, H * 0.10, 0.18, '#cdc3a6');
  ridge(ctx, rng, H * 0.575, H * 0.13, 0.30, '#c3b590');
  ridge(ctx, rng, H * 0.64, H * 0.16, 0.48, '#b8a578');
  ridge(ctx, rng, H * 0.72, H * 0.17, 0.68, '#a68f5c');
  ridge(ctx, rng, H * 0.83, H * 0.15, 0.9, '#8f7743');

  river(ctx);

  // Distant pagodas nestled on the mid ridges.
  pagoda(ctx, W * 0.30, H * 0.52, 46);
  pagoda(ctx, W * 0.815, H * 0.44, 60);

  // Scatter gold trees across the hills, denser & larger toward the front.
  for (let i = 0; i < 46; i++) {
    const t = rng();
    const x = rng() * W;
    const y = lerp(H * 0.52, H * 0.86, t);
    const s = lerp(26, 96, t) * (0.7 + rng() * 0.5);
    goldTree(ctx, x, y, s, rng);
  }

  // Foreground focal foliage + fauna, echoing the reference composition.
  palm(ctx, W * 0.04, H * 0.76, 240, 1, rng);
  toucan(ctx, W * 0.15, H * 0.44, 92);
  panther(ctx, W * 0.19, H * 0.82, 165);        // black panther on a gold plinth, left of centre

  goldTree(ctx, W * 0.86, H * 0.66, 220, rng);   // big umbrella tree, right of centre
  palm(ctx, W * 0.97, H * 0.82, 220, -1, rng);
  snake(ctx, W * 0.80, H * 0.9, 155);            // coiling snake, right of centre

  panels(ctx, 7);

  // Final unifying warm glaze + gentle top/bottom falloff.
  const glaze = ctx.createLinearGradient(0, 0, 0, H);
  glaze.addColorStop(0, 'rgba(110,86,38,0.22)');
  glaze.addColorStop(0.5, 'rgba(248,242,224,0.03)');
  glaze.addColorStop(1, 'rgba(84,64,30,0.18)');
  ctx.fillStyle = glaze;
  ctx.fillRect(0, 0, W, H);

  return canvas;
}
