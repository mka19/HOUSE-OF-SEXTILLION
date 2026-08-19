# House of Sextillion — The Golden Panorama

A real-time 3D luxury environment for the House of Sextillion maison (bags, belts, shoes),
built with **Three.js** and styled after Cartier's *Watches & Wonders* site — cinematic,
physically-lit, and interactive.

This is the first environment: a **gold curved panoramic room** with a painted mural wall,
a reflective marble floor, and a recessed circular ring light in the ceiling.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Production build:

```bash
npm run build && npm run preview
```

## What's in the scene

**Environment & lighting**
- **Real HDRI image-based lighting** (`@pmndrs/assets` interior EXR) drives reflections and
  fill light — not flat ambient. The HDRI is rotated so its bright window sits behind the
  camera instead of blowing out the floor.
- **Curved mural wall** — a 189° cylinder whose inner face carries the panorama texture,
  mapped as a real texture and rendered as evenly self-lit painted panels (like the reference).
- **Reflective marble floor** — a true planar mirror (`Reflector`) of the mural + ceiling,
  layered under a **physically-based** `MeshPhysicalMaterial` (roughness / clearcoat /
  env reflections, gold geometric inlay) so it reads as polished stone, not glass.
- **Recessed ceiling ring** with a **soft pulsing glow**, a concentric cove, and 14 recessed
  spot dots, plus a matching point light.
- **Warm exponential fog** for atmospheric depth and **ACES filmic tone mapping** + a gentle
  **bloom** pass for the cinematic grade.

**Camera**
- **Idle drift/sway** when the cursor is still (eased, multi-frequency).
- **Smooth eased movement** everywhere — critically-damped interpolation (`1 - e^(-λt)`),
  never linear/robotic.

**Micro-interactions (Cartier-style)**
- A **soft spotlight follows the mouse** across the wall/floor (raycast onto the wall,
  eased target).
- **Parallax depth** — the foreground pedestals move *more* than the background wall on
  cursor movement.
- **Eased hover states** (~200–400 ms, ease-out) via time-based damping.
- **Scale + glow feedback** on hover, and a **click pulse** on the placed objects (the three
  gilded pedestals map to *Bags*, *Belts*, *Shoes*).

## The mural on the wall

The wall texture is resolved in this order (`src/main.js` → `makeMuralTexture`):

1. **`public/MURAL.jpeg`** — the real reference photo (currently in use). Because that image
   is the *whole room*, the loader crops just the painted wall band (`MURAL_CROP`) and maps
   that onto the curved wall, so our own 3D ceiling and reflective floor frame it instead of
   a room-inside-a-room. The cylinder's inner faces mirror U, so the texture is flipped back
   to its true left-to-right order.
2. `public/textures/mural.jpg` — an alternate drop-in slot.
3. A **faithful procedural recreation** (`src/mural.js`) — cream sky, layered misty mountains,
   a winding luminous river, gold pagodas/trees, a suited rabbit, panther, toucan, snake, and
   soft gold panel mouldings — used only if no photo is found.

To swap the art, replace `public/MURAL.jpeg` (or adjust `MURAL_CROP` if your image is already
just the panorama band rather than the full room).

## Structure

| File | Role |
|------|------|
| `index.html` | Canvas, brand chrome, loader, cinematic overlay |
| `src/main.js` | Scene, HDRI, materials, lights, camera, interactions, post-processing |
| `src/mural.js` | Procedural panoramic mural (fallback when no photo is supplied) |
| `src/style.css` | Brand chrome, loader, tooltip, vignette |
| `scripts/shoot.mjs` | Playwright screenshot harness used to compare against the reference |

## Tuning

All lighting/mood knobs live in the `CFG` object at the top of `src/main.js`
(exposure, env intensity, fog, bloom, camera). Adjust and reload.

## Environment transition (drag)

The site is a continuous two-environment exhibition. **Environment 1** is the live 3D
golden scene; **Environment 2** is a flat showroom image (`public/SHOWROOM2.jpg`). Click-drag
left to pull Env 2 in from the right, drag right to return. All movement derives from one
`progress` value in `src/transition.js`, and the two rooms read as walls of one **circular
room**: as you pull through, the current wall rotates and recedes away (`rotateY` + `translateZ`
under the `#showroom` `perspective`) while the next wall swings in from around the bend — not a
flat slide. Midway you cross a dim **connecting void** (`#voidoverlay`, opacity peaks at the
half-way point), so it feels like turning a corner through a darker passage between the two
sections. The release is a critically-damped settle — weighted and inertial, no bounce, no
slider feel.

Drop your showroom photo at **`public/SHOWROOM2.jpg`** (or `.jpeg` / `.png`) and it loads as
Environment 2; until then a warm placeholder gradient stands in. The photo URL is applied
**inline** by `src/transition.js` (a CSS `url()` custom property would resolve relative to the
bundled stylesheet and 404 in the production build). The single-file artifact inlines the photo
as `window.__SHOWROOM2_DATA_URI`. Product hotspot positions for the illuminated-recess hover
live in `HOTSPOTS` in `src/transition.js` — tuned to the supplied photo at ~3:2; re-tune if you
swap it or target a very different aspect ratio.
