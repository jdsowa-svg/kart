# Kart art drop folder (`public/assets`)

Vite serves everything under `public/` at the site root. Drop PNGs here — no import-path changes required.

**Reminder: tile index 0 is the upper-left tile at pixel (0,0). Do NOT leave a blank tile 0.**

## Tiles (`tiles/track/`)

| File | Role |
|------|------|
| `tileset.png` | Packed tilesheet (placeholder included for loader tests) |
| `tileset.json` | Layout + surface → tile index map |

### Artist convention

- **First tile at pixel (0,0) = index 0.** Start packing there; do not reserve a blank tile 0.
- Default tile size **16×16**.
- Packed **left → right**, then **top → bottom**.
- **padding: 0**, **spacing: 0** (no gutters). If you add padding/spacing later, update `tileset.json` to match.
- Example: 8 columns × 4 rows → image **128×64** for 32 tiles.

### Surface names → engine codes

| JSON name | Surface code | Meaning |
|-----------|--------------|---------|
| `grass`   | 0            | Off-road |
| `road`    | 1            | Drivable asphalt |
| `wall`    | 2            | Curb / dark edge |
| `finish`  | 3            | Start/finish stripe |

`surfaces` lists tile indices for each name. The loader picks from that list (stable variety from world position). If `tileset.png` is missing, Mode-7 keeps the procedural palette.

## Backgrounds (`backgrounds/`)

| Slot | Suggested size | Folder |
|------|----------------|--------|
| Far parallax strip | **1536×64** | `far/` |
| Near parallax strip | **2560×64** | `near/` |

Edit `manifest.json` for filenames, heights, and `scrollFactor` (0 = locked to camera heading fraction; higher = scrolls faster with yaw).

If PNGs are absent, the procedural sky gradient still draws.

## Other stubs

- `characters/` — kart / racer sprites later
- `props/` — roadside props later

## Source masters

Repo-root `source/` is for raw masters (not served). Digitize / export notes will land there later.
