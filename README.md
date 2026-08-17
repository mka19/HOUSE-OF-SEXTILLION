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

## Using your own reference photo on the wall

The wall automatically prefers a real photo if present:

```
public/textures/mural.jpg
```

Drop your reference image there (any wide, ~3:1 panorama works best) and reload — it will be
mapped directly onto the curved wall. If the file is absent, a **faithful procedural
recreation** of the reference mural is generated at runtime (`src/mural.js`): cream sky,
layered misty mountains, a winding luminous river, gold pagodas/trees, animal accents, and
vertical gold panel seams.

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
