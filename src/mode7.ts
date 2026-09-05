/**
 * Mode-7 style scanline renderer.
 * For each screen row below the horizon, project a camera ray onto the 2D
 * track map using a classic SNES-like affine perspective approximation.
 */

import type { TrackData } from './track';
import type { Kart } from './kart';

export const VIEW_W = 640;
export const VIEW_H = 400;
export const HORIZON = 120;

/** Camera knobs — arcade-tuned for SNES-like feel. */
const CAM_HEIGHT = 56;
const CAM_DISTANCE = 56;
/** Controls how wide the near field is (lower = more FOV stretch). */
const FOV = 0.92;
const FOG_START = 0.5;

export interface Mode7Buffers {
  road: ImageData;
}

export function createMode7Buffers(): Mode7Buffers {
  return {
    road: new ImageData(VIEW_W, VIEW_H - HORIZON),
  };
}

/**
 * Render sky + Mode-7 road into the destination canvas context.
 * Camera sits behind the kart looking along kart.angle.
 */
export function renderMode7(
  ctx: CanvasRenderingContext2D,
  track: TrackData,
  kart: Kart,
  buffers: Mode7Buffers,
): void {
  const map = track.image.data;
  const mapSize = track.size;
  const road = buffers.road;
  const out = road.data;
  const roadH = VIEW_H - HORIZON;

  const camX = kart.x - Math.cos(kart.angle) * CAM_DISTANCE;
  const camY = kart.y - Math.sin(kart.angle) * CAM_DISTANCE;
  const cosA = Math.cos(kart.angle);
  const sinA = Math.sin(kart.angle);
  const halfW = VIEW_W * 0.5;

  for (let sy = 0; sy < roadH; sy++) {
    // Distance from camera to ground strip for this scanline
    const row = sy + 0.5;
    const worldDist = (CAM_HEIGHT * roadH) / (row * 2.2);
    const halfWidth = worldDist * FOV;

    const depthNorm = sy / roadH;
    const fog =
      depthNorm < FOG_START
        ? 0
        : (depthNorm - FOG_START) / (1 - FOG_START);
    const fogT = fog * fog;
    const fogOm = 1 - fogT;

    // Forward point of the strip center
    const forwardX = camX + cosA * worldDist;
    const forwardY = camY + sinA * worldDist;
    // Lateral unit (perpendicular)
    const latX = -sinA;
    const latY = cosA;

    const rowOff = sy * VIEW_W;

    for (let sx = 0; sx < VIEW_W; sx++) {
      const u = (sx - halfW) / halfW; // -1 .. 1
      const wx = forwardX + latX * u * halfWidth;
      const wy = forwardY + latY * u * halfWidth;

      const ix = wx | 0;
      const iy = wy | 0;

      const dest = (rowOff + sx) << 2;
      let r: number;
      let g: number;
      let b: number;

      if (ix < 0 || iy < 0 || ix >= mapSize || iy >= mapSize) {
        r = 16;
        g = 42;
        b = 16;
      } else {
        const src = ((iy << 10) + ix) << 2; // mapSize === 1024
        r = map[src];
        g = map[src + 1];
        b = map[src + 2];
      }

      if (fogT > 0) {
        r = (r * fogOm + 95 * fogT) | 0;
        g = (g * fogOm + 165 * fogT) | 0;
        b = (b * fogOm + 220 * fogT) | 0;
      }

      out[dest] = r;
      out[dest + 1] = g;
      out[dest + 2] = b;
      out[dest + 3] = 255;
    }
  }


  // Sky
  const grad = ctx.createLinearGradient(0, 0, 0, HORIZON);
  grad.addColorStop(0, '#142848');
  grad.addColorStop(0.5, '#3a7ab8');
  grad.addColorStop(1, '#7eb0e0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, HORIZON);

  ctx.fillStyle = 'rgba(255, 236, 170, 0.9)';
  ctx.beginPath();
  ctx.arc(VIEW_W * 0.74, HORIZON * 0.38, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(0, HORIZON - 1, VIEW_W, 1);

  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(road, 0, HORIZON);
}
