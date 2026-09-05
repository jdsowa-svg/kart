/**
 * On-screen HUD: speed, laps, simple controls hint.
 */

import type { Kart } from './kart';
import { VIEW_W } from './mode7';

export function drawHud(
  ctx: CanvasRenderingContext2D,
  kart: Kart,
  fps: number,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(8, 8, 200, 56);
  ctx.fillRect(VIEW_W - 160, 8, 152, 40);

  ctx.font = '14px ui-monospace, monospace';
  ctx.fillStyle = '#f0f0f5';
  ctx.textBaseline = 'top';

  const speedKmh = Math.abs(kart.speed) * 0.55;
  ctx.fillText(`SPEED  ${speedKmh.toFixed(0).padStart(3, ' ')}`, 16, 14);
  ctx.fillText(`LAP    ${kart.lap}`, 16, 34);

  ctx.fillStyle = '#a0a8b8';
  ctx.fillText(`FPS ${fps.toFixed(0)}`, VIEW_W - 148, 14);
  ctx.fillText('WASD / ARROWS', VIEW_W - 148, 32);

  const barX = 16;
  const barY = 52;
  const barW = 176;
  const fill = Math.min(1, Math.abs(kart.speed) / 220);
  ctx.fillStyle = '#222830';
  ctx.fillRect(barX, barY, barW, 6);
  ctx.fillStyle = fill > 0.85 ? '#e04040' : '#40c070';
  ctx.fillRect(barX, barY, barW * fill, 6);

  ctx.restore();
}
