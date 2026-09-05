/**
 * Procedural oval track map.
 * Surface codes: 0 = grass, 1 = road, 2 = wall/dark edge, 3 = start/finish stripe.
 */

export const TRACK_SIZE = 1024;

export const SURFACE_GRASS = 0;
export const SURFACE_ROAD = 1;
export const SURFACE_WALL = 2;
export const SURFACE_FINISH = 3;

export interface TrackData {
  size: number;
  surface: Uint8Array;
  image: ImageData;
  startX: number;
  startY: number;
  startAngle: number;
  finishAx: number;
  finishAy: number;
  finishBx: number;
  finishBy: number;
}

function distToOval(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Build a closed oval: road ring between inner and outer radii. */
export function createTrack(): TrackData {
  const size = TRACK_SIZE;
  const surface = new Uint8Array(size * size);
  const pixels = new Uint8ClampedArray(size * size * 4);

  const cx = size / 2;
  const cy = size / 2;
  const outerRx = 420;
  const outerRy = 320;
  const innerRx = 260;
  const innerRy = 180;

  const grass = [34, 139, 34];
  const grassDark = [28, 110, 28];
  const road = [96, 96, 104];
  const roadLine = [210, 210, 220];
  const wall = [48, 40, 32];
  const finishA = [240, 240, 245];
  const finishB = [28, 28, 32];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dOuter = distToOval(x, y, cx, cy, outerRx, outerRy);
      const dInner = distToOval(x, y, cx, cy, innerRx, innerRy);

      let surf = SURFACE_GRASS;
      let r: number;
      let g: number;
      let b: number;

      const checker = ((x >> 4) ^ (y >> 4)) & 1;
      if (checker) {
        r = grass[0];
        g = grass[1];
        b = grass[2];
      } else {
        r = grassDark[0];
        g = grassDark[1];
        b = grassDark[2];
      }

      // Road between ellipses
      if (dOuter < 1.0 && dInner > 1.0) {
        surf = SURFACE_ROAD;
        r = road[0];
        g = road[1];
        b = road[2];

        const midRx = (innerRx + outerRx) / 2;
        const midRy = (innerRy + outerRy) / 2;
        const dMid = distToOval(x, y, cx, cy, midRx, midRy);
        if (Math.abs(dMid - 1.0) < 0.012) {
          const ang = Math.atan2(y - cy, x - cx);
          if (Math.sin(ang * 18) > 0.2) {
            r = roadLine[0];
            g = roadLine[1];
            b = roadLine[2];
          }
        }

        if (dOuter > 0.965 || dInner < 1.04) {
          r = Math.min(255, r + 40);
          g = Math.min(255, g + 40);
          b = Math.min(255, b + 45);
        }
      }

      // Outer curb / wall
      if (dOuter >= 0.98 && dOuter <= 1.045) {
        surf = SURFACE_WALL;
        r = wall[0];
        g = wall[1];
        b = wall[2];
      }
      // Inner curb / wall
      if (dInner >= 0.955 && dInner <= 1.02 && dOuter < 0.99) {
        surf = SURFACE_WALL;
        r = wall[0];
        g = wall[1];
        b = wall[2];
      }

      surface[i] = surf;
      const p = i * 4;
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
      pixels[p + 3] = 255;
    }
  }

  // Finish line at south of oval (angle = PI/2), spanning road width
  const finishAngle = Math.PI / 2;
  const midRx = (innerRx + outerRx) / 2;
  const midRy = (innerRy + outerRy) / 2;
  const finishCx = cx + Math.cos(finishAngle) * midRx;
  const finishCy = cy + Math.sin(finishAngle) * midRy;

  const tangentX = -Math.sin(finishAngle);
  const tangentY = Math.cos(finishAngle);
  const radialX = Math.cos(finishAngle);
  const radialY = Math.sin(finishAngle);

  const halfLen = (outerRx - innerRx) * 0.55;
  const finishAx = finishCx - radialX * halfLen;
  const finishAy = finishCy - radialY * halfLen;
  const finishBx = finishCx + radialX * halfLen;
  const finishBy = finishCy + radialY * halfLen;

  for (let t = -halfLen; t <= halfLen; t++) {
    for (let s = -6; s <= 6; s++) {
      const fx = Math.round(finishCx + radialX * t + tangentX * s);
      const fy = Math.round(finishCy + radialY * t + tangentY * s);
      if (fx < 0 || fy < 0 || fx >= size || fy >= size) continue;
      const i = fy * size + fx;
      if (surface[i] !== SURFACE_ROAD && surface[i] !== SURFACE_FINISH) continue;
      surface[i] = SURFACE_FINISH;
      const check = ((Math.floor(t / 8) + Math.floor(s / 4)) & 1) === 0;
      const col = check ? finishA : finishB;
      const p = i * 4;
      pixels[p] = col[0];
      pixels[p + 1] = col[1];
      pixels[p + 2] = col[2];
      pixels[p + 3] = 255;
    }
  }

  // Start just past finish, facing counterclockwise
  const startX = finishCx + tangentX * 48;
  const startY = finishCy + tangentY * 48;
  const startAngle = Math.atan2(tangentY, tangentX);

  return {
    size,
    surface,
    image: new ImageData(pixels, size, size),
    startX,
    startY,
    startAngle,
    finishAx,
    finishAy,
    finishBx,
    finishBy,
  };
}

export function sampleSurface(track: TrackData, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= track.size || iy >= track.size) {
    return SURFACE_WALL;
  }
  return track.surface[iy * track.size + ix];
}

export function isOnRoad(surf: number): boolean {
  return surf === SURFACE_ROAD || surf === SURFACE_FINISH;
}
