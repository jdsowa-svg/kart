/**
 * Mode-7 style scanline renderer.
 * For each screen row below the horizon, project a camera ray onto the 2D
 * track map using a classic SNES-like affine perspective approximation.
 *
 * Renders the road at half resolution and nearest-neighbor upscales for
 * SNES-chunky look and ~4× fewer pixels per frame.
 */

import type { TrackData } from './track';
import type { Kart } from './kart';
import {
  SURFACE_GRASS,
  SURFACE_FINISH,
} from './track';

export const VIEW_W = 640;
export const VIEW_H = 400;
export const HORIZON = 120;

/** Camera knobs — arcade-tuned for SNES-like feel. */
const CAM_HEIGHT = 56;
const CAM_DISTANCE = 56;
/** Controls how wide the near field is (lower = more FOV stretch). */
const FOV = 0.92;
const FOG_START = 0.5;

/** Half-res scale: road buffer is VIEW_W/SCALE × roadH/SCALE. */
const SCALE = 2;

const FULL_ROAD_H = VIEW_H - HORIZON;
const ROAD_W = VIEW_W / SCALE;
const ROAD_H = FULL_ROAD_H / SCALE;

/** Flat RGB triples indexed by surface code (0–3). */
const PAL_R = new Uint8Array([34, 96, 48, 240]);
const PAL_G = new Uint8Array([139, 96, 40, 240]);
const PAL_B = new Uint8Array([34, 104, 32, 245]);
const PAL_DARK_R = new Uint8Array([28, 96, 48, 28]);
const PAL_DARK_G = new Uint8Array([110, 96, 40, 28]);
const PAL_DARK_B = new Uint8Array([28, 104, 32, 32]);

const OOB_R = 16;
const OOB_G = 42;
const OOB_B = 16;

const FOG_R = 95;
const FOG_G = 165;
const FOG_B = 220;

export interface Mode7Buffers {
  road: ImageData;
  roadCanvas: HTMLCanvasElement;
  roadCtx: CanvasRenderingContext2D;
  skyCanvas: HTMLCanvasElement;
}

function buildSkyCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = HORIZON;
  const sctx = c.getContext('2d', { alpha: false })!;
  const grad = sctx.createLinearGradient(0, 0, 0, HORIZON);
  grad.addColorStop(0, '#142848');
  grad.addColorStop(0.5, '#3a7ab8');
  grad.addColorStop(1, '#7eb0e0');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, VIEW_W, HORIZON);

  sctx.fillStyle = 'rgba(255, 236, 170, 0.9)';
  sctx.beginPath();
  sctx.arc(VIEW_W * 0.74, HORIZON * 0.38, 16, 0, Math.PI * 2);
  sctx.fill();

  sctx.fillStyle = 'rgba(255,255,255,0.2)';
  sctx.fillRect(0, HORIZON - 1, VIEW_W, 1);
  return c;
}

export function createMode7Buffers(): Mode7Buffers {
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = ROAD_W;
  roadCanvas.height = ROAD_H;
  const roadCtx = roadCanvas.getContext('2d', { alpha: false })!;
  roadCtx.imageSmoothingEnabled = false;

  return {
    road: new ImageData(ROAD_W, ROAD_H),
    roadCanvas,
    roadCtx,
    skyCanvas: buildSkyCanvas(),
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
  const surface = track.surface;
  const mapSize = track.size;
  const out = buffers.road.data;

  const camX = kart.x - Math.cos(kart.angle) * CAM_DISTANCE;
  const camY = kart.y - Math.sin(kart.angle) * CAM_DISTANCE;
  const cosA = Math.cos(kart.angle);
  const sinA = Math.sin(kart.angle);
  const latX = -sinA;
  const latY = cosA;

  for (let sy = 0; sy < ROAD_H; sy++) {
    // Map half-res row to full-res distance so perspective matches pre-opt
    const rowFull = (sy + 0.5) * SCALE;
    const worldDist = (CAM_HEIGHT * FULL_ROAD_H) / (rowFull * 2.2);
    const halfWidth = worldDist * FOV;

    const depthNorm = sy / ROAD_H;
    const fog =
      depthNorm < FOG_START
        ? 0
        : (depthNorm - FOG_START) / (1 - FOG_START);
    const fogT = fog * fog;
    const fogOm = 1 - fogT;
    const doFog = fogT > 0;

    const forwardX = camX + cosA * worldDist;
    const forwardY = camY + sinA * worldDist;

    // Scanline DDA: world x/y at left edge (u = -1), step across row
    let wx = forwardX - latX * halfWidth;
    let wy = forwardY - latY * halfWidth;
    const dx = (latX * halfWidth * 2) / ROAD_W;
    const dy = (latY * halfWidth * 2) / ROAD_W;

    let dest = (sy * ROAD_W) << 2;

    for (let sx = 0; sx < ROAD_W; sx++) {
      const ix = wx | 0;
      const iy = wy | 0;

      let r: number;
      let g: number;
      let b: number;

      if (ix < 0 || iy < 0 || ix >= mapSize || iy >= mapSize) {
        r = OOB_R;
        g = OOB_G;
        b = OOB_B;
      } else {
        const surf = surface[(iy << 10) + ix]; // mapSize === 1024
        // Checker for grass / finish; solid for road / wall
        const dark =
          surf === SURFACE_GRASS
            ? ((ix >> 4) ^ (iy >> 4)) & 1
            : surf === SURFACE_FINISH
              ? ((ix >> 3) ^ (iy >> 2)) & 1
              : 0;
        if (dark) {
          r = PAL_DARK_R[surf];
          g = PAL_DARK_G[surf];
          b = PAL_DARK_B[surf];
        } else {
          r = PAL_R[surf];
          g = PAL_G[surf];
          b = PAL_B[surf];
        }
      }

      if (doFog) {
        r = (r * fogOm + FOG_R * fogT) | 0;
        g = (g * fogOm + FOG_G * fogT) | 0;
        b = (b * fogOm + FOG_B * fogT) | 0;
      }

      out[dest] = r;
      out[dest + 1] = g;
      out[dest + 2] = b;
      out[dest + 3] = 255;
      dest += 4;

      wx += dx;
      wy += dy;
    }
  }

  // Cached sky (gradient + sun + horizon line)
  ctx.drawImage(buffers.skyCanvas, 0, 0);

  // Half-res road → nearest-neighbor stretch to full road rect
  const rctx = buffers.roadCtx;
  rctx.putImageData(buffers.road, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    buffers.roadCanvas,
    0,
    0,
    ROAD_W,
    ROAD_H,
    0,
    HORIZON,
    VIEW_W,
    FULL_ROAD_H,
  );
}
