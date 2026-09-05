# Kart — SNES Mode-7 MVP

A Phase-1 playable 2D Mode-7 / pseudo-3D kart racer inspired by Super Mario Kart (SNES). Placeholder art only; modular so textures and sprites can be swapped later.

**Canvas:** fixed **640×400**, pixelated rendering.

## How to run

```bash
cd /workspace/kart
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview   # optional local preview of dist/
```

## Controls

| Action          | Keys    |
|-----------------|---------|
| Accelerate      | Up / W  |
| Brake / reverse | Down / S|
| Steer left      | Left / A|
| Steer right     | Right / D|

Drive the oval. Crossing the checkered start/finish line increments the lap counter. Grass slows you down; dark walls bounce you softly.

## Architecture

| Module          | Role |
|-----------------|------|
| `src/main.ts`   | Boot, fixed-timestep loop, composition |
| `src/mode7.ts`  | Scanline affine Mode-7 road + sky |
| `src/track.ts`  | Procedural oval bitmap + surface codes |
| `src/kart.ts`   | Physics, lap detection, placeholder sprite |
| `src/input.ts`  | Keyboard state (arrows + WASD) |
| `src/hud.ts`    | Speed, lap, FPS overlay |
| `src/style.css` | Dark page chrome, centered canvas |

### Mode-7 approach

For each screen row below the horizon, a perspective depth is derived from the row's distance from the horizon (`height / row`). That depth picks a ground strip in world space; each pixel on the strip samples the 2D track map with a camera-relative forward/lateral transform. Classic SNES-style feel; math is intentionally arcade-tuned, not perfect projective geometry.

### Track surfaces

- `0` grass (slow)
- `1` road
- `2` wall (soft bounce)
- `3` finish stripe (road + lap trigger)

## Stack

- TypeScript + Vite
- HTML5 Canvas 2D only (no game engines)

## Non-goals (Phase 1)

No multiplayer, items, AI racers, audio, or fancy art.
