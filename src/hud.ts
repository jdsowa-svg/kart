/**
 * On-screen HUD: speed, laps, drift / turbo hints, simple controls hint.
 */

import type { Kart } from "./kart";
import { VIEW_W } from "./mode7";

export function drawHud(
  ctx: CanvasRenderingContext2D,
  kart: Kart,
  fps: number,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(8, 8, 200, 72);
  ctx.fillRect(VIEW_W - 160, 8, 152, 56);

  ctx.font = "14px ui-monospace, monospace";
  ctx.fillStyle = "#f0f0f5";
  ctx.textBaseline = "top";

  const speedKmh = Math.abs(kart.speed) * 0.55;
  ctx.fillText(`SPEED  ${speedKmh.toFixed(0).padStart(3, " ")}`, 16, 14);
  ctx.fillText(`LAP    ${kart.lap}`, 16, 34);

  if (kart.turboTimer > 0) {
    ctx.fillStyle = "#ffd040";
    ctx.fillText("TURBO!", 16, 52);
  } else if (kart.drift > 0.25) {
    ctx.fillStyle = "#70d0ff";
    const charge =
      kart.driftCharge >= 0.55
        ? " READY"
        : kart.driftCharge > 0.15
          ? " ..."
          : "";
    ctx.fillText(`DRIFT${charge}`, 16, 52);
  }

  ctx.fillStyle = "#a0a8b8";
  ctx.fillText(`FPS ${fps.toFixed(0)}`, VIEW_W - 148, 14);
  ctx.fillText("WASD / ARROWS", VIEW_W - 148, 32);
  ctx.fillText("Q/E HOP", VIEW_W - 148, 48);

  const barX = 16;
  const barY = 68;
  const barW = 176;
  const fill = Math.min(1, Math.abs(kart.speed) / 220);
  ctx.fillStyle = "#222830";
  ctx.fillRect(barX, barY, barW, 6);
  ctx.fillStyle =
    kart.turboTimer > 0
      ? "#ffd040"
      : fill > 0.85
        ? "#e04040"
        : "#40c070";
  ctx.fillRect(barX, barY, barW * fill, 6);

  if (kart.driftCharge > 0.05 && kart.turboTimer <= 0) {
    ctx.fillStyle = "#1a2830";
    ctx.fillRect(barX, barY - 4, barW, 3);
    ctx.fillStyle =
      kart.driftCharge >= 0.55 ? "#70d0ff" : "#4080a0";
    ctx.fillRect(
      barX,
      barY - 4,
      barW * Math.min(1, kart.driftCharge),
      3,
    );
  }

  ctx.restore();
}
