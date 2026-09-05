# Kart — SNES Mode-7 MVP

A Phase-1 playable 2D Mode-7 / pseudo-3D kart racer inspired by Super Mario Kart (SNES). Placeholder art only; modular so textures and sprites can be swapped later.

**Canvas:** internal **640×400** (pixelated); display defaults to **2×** (1280×800 CSS), toggle with `0`. Mode-7 renders at half-res for perf.

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

### Keyboard

| Action          | Keys    |
|-----------------|---------|
| Accelerate      | Up / W  |
| Brake (no reverse) | Down / S|
| Steer left      | Left / A|
| Steer right     | Right / D|
| Hop / powerslide hold | Q / E (press = hop; **hold** = SMK L/R shoulder) |
| Toggle scale 1×/2× | `0` (Digit0 / Numpad0) |
| Restart race    | Esc     |

### Xbox / USB gamepad (Browser Gamepad API)

Mapped like **SNES Mario Kart** by face-button *position* (standard mapping, Chrome/Safari Xbox). Keyboard and pad are OR’d — neither clears the other. Some browsers need a button press/focus first.

| SMK | SNES | Xbox | Action |
|-----|------|------|--------|
| Accel | B (bottom) | **A** (button 0) **or RT** (7) | accel |
| Brake | Y (west) | **X** (button 2) **or LT** (6) | brake (no reverse) |
| Steer | D-pad | D-pad (12–15) + left stick X (deadzone ~0.28) | left/right |
| Hop / powerslide hold | L / R | **LB / RB** (4 / 5) | hop on press; hopHold while held |
| Restart (Esc) | — | **Start/Menu** (9) | restart |
| Scale toggle (`0`) | — | **View/Back** (8) | toggleScale |

**RT = accel** and **LT = brake** are optional convenience aliases, OR’d with A/X (common on Xbox). Unused for now: B/Y face (items / rear view later).

Drive the oval. Crossing the checkered start/finish line increments the lap counter. Grass slows you down; dark curb stripes are visual only (no wall collision yet).

**SMK-style:** there is **no reverse**. Brake only slows toward a stop; hop and turn to face the other way.

### Hold-shoulder powerslide (SMK L/R)

In Super Mario Kart, **holding** L or R is what matters for handling — the hop on press does not change grip. Turning causes lateral slip; high speed exaggerates it; **holding L/R greatly exaggerates slip** (air or ground). Manual: L/R + steer = power slide / tight turn.

Here **Q/E** mirror that: press hops; **hold Q or E + turn** enters powerslide (much lower grip than auto high-speed drift alone). Hop-on-press still gives a short sharper yaw bite with steer.

Skidding does **not** add *extra* coast scrub versus going straight (same road/off-road/air friction while powersliding). Releasing gas still coasts down normally — there is no infinite no-gas turn exploit. Accel still works; brake still slows on purpose.

Sources: TASVideos SMK physics (tasvideos.org/GameResources/SNES/SuperMarioKart), official manual.

### Mini-turbo (SMK boost-counter)

Charge while **hold Q/E + steer + accelerate**. Releasing hold, steer, or accel **resets** the counter (swapping left/right is OK). After ~0.7 s / 64 frames of charge, releasing arms a pending boost; it fires when you **straighten** (release turn / low slip — not “release gas”). If that straighten is in mid-air, the boost fires on landing. HUD: SLIDE / READY / MT ARMED / TURBO!; hint **STRAIGHTEN FOR MINI-TURBO**.

Milder auto-drift still happens at high speed without holding Q/E.

### Lift off gas / spin-out

**Lift off gas is for skid recovery only** (not mini-turbo). Per the SMK manual: if you are losing it in a skid, **let up on the gas**. While powersliding with high slip, releasing accel sharply raises grip (≈2.75×, or ≈3.4× with brake) so velocity heading catches facing and the slide tightens. Holding accel through a hard skid keeps the loose grip.

Overcooking an aggressive **hold-Q/E powerslide** (sustained very high slip while flooring it at speed) fills a lose-control meter; over-charged mini-turbo near READY bumps it sooner. Gentle auto-drift does not spin you out. Lift off in time and the meter decays.

On spin-out: inputs ignored, kart whirls ~2 turns over ~1 s, speed bleeds, mini-turbo clears. HUD flashes **SPIN!**. Esc reset clears spin state.

## Architecture

| Module          | Role |
|-----------------|------|
| `src/main.ts`   | Boot, fixed-timestep loop, composition |
| `src/mode7.ts`  | Scanline affine Mode-7 road + sky |
| `src/track.ts`  | Procedural oval bitmap + surface codes |
| `src/kart.ts`   | Physics, hop, powerslide/mini-turbo, lap detection, placeholder sprite |
| `src/input.ts`  | Keyboard + Xbox gamepad (SNES-style mapping; OR merge) |
| `src/hud.ts`    | Speed, lap, slide/turbo, FPS overlay |
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
