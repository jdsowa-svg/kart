# Kart — SNES Mode-7 MVP

A Phase-1 playable 2D Mode-7 / pseudo-3D kart racer inspired by Super Mario Kart (SNES). Placeholder art only; modular so textures and sprites can be swapped later.

**Canvas:** internal **640×400** (pixelated); display defaults to **2×** (1280×800 CSS), toggle with `0`.

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
| Hop             | Q / E (same hop; edge-triggered like SMK L/R) |
| Toggle scale 1×/2× | `0` (Digit0 / Numpad0) |
| Restart race    | Esc     |

Drive the oval. Crossing the checkered start/finish line increments the lap counter. Grass slows you down; dark curb stripes are visual only (no wall collision yet). Hop lifts the sprite; hopping while steering (Q/E + left/right) sharpens turn radius / powerslide bite (SMK-style), with a short landing slide window.

### Auto-drift & mini-turbo

At high speed (above ~`DRIFT_SPEED` ≈ 125 world units/s), holding left/right engages **drift**: movement heading lags behind facing so the kart slides wide through turns (SMK-style plow). The sprite leans harder and shows light dust puffs. HUD shows `DRIFT` while slipping.

Keep the turn held to charge a **mini-turbo**. Release steer (or counter-steer) once charged (`DRIFT READY`) for a short speed burst. Off-road: more slip and a weaker turbo. Hop+steer engages a sharper yaw and forced drift (even slightly under drift speed), then a brief landing powerslide window while you keep the turn.

## Architecture

| Module          | Role |
|-----------------|------|
| `src/main.ts`   | Boot, fixed-timestep loop, composition |
| `src/mode7.ts`  | Scanline affine Mode-7 road + sky |
| `src/track.ts`  | Procedural oval bitmap + surface codes |
| `src/kart.ts`   | Physics, hop, drift/mini-turbo, lap detection, placeholder sprite |
| `src/input.ts`  | Keyboard state (arrows + WASD + Q/E hop) |
| `src/hud.ts`    | Speed, lap, drift/turbo, FPS overlay |
| `src/style.css` | Dark page chrome, centered canvas |

### Mode-7 approach

For each screen row below the horizon, a perspective depth is derived from the row's distance from the horizon (`height / row`). That depth picks a ground strip in world space; each pixel on the strip samples the 2D track map with a camera-relative forward/lateral transform. Classic SNES-style feel; math is intentionally arcade-tuned, not perfect projective geometry.

### Track surfaces

- `0` grass (slow)
- `1` road
- `2` wall / curb (visual only; not blocking)
- `3` finish stripe (road + lap trigger)

## Stack

- TypeScript + Vite
- HTML5 Canvas 2D only (no game engines)

## Non-goals (Phase 1)

No multiplayer, items, AI racers, audio, or fancy art.
