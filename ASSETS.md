# Assets

**Drop-in runtime art:** [`public/assets/`](public/assets/README.md) (served by Vite).

**Reminder: tilesheet tile 0 = upper-left pixel (0,0). Do not leave a blank tile 0.**

- Tiles: `public/assets/tiles/track/` (`tileset.png` + `tileset.json`)
- Backgrounds: `public/assets/backgrounds/` (`manifest.json` + `far/` + `near/`)
- Masters (not served): `source/`

Procedural Mode-7 / sky remain the fallback when PNGs are missing.
