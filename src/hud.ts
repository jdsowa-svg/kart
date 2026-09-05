/**
 * On-screen HUD: speed, laps, powerslide / turbo hints, simple controls hint.
 */

import type { Kart } from "./kart";
import { miniTurboChargeNorm, miniTurboReady, isSpinning } from "./kart";
import { VIEW_W, VIEW_H } from "./mode7";

export function drawHud(
  ctx: CanvasRenderingContext2D,
  kart: Kart,
  fps: number,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(8, 8, 200, 72);
  ctx.fillRect(VIEW_W - 168, 8, 160, 72);

  ctx.font = "14px ui-monospace, monospace";
  ctx.fillStyle = "#f0f0f5";
  ctx.textBaseline = "top";

  const speedKmh = Math.abs(kart.speed) * 0.55;
  ctx.fillText(`SPEED  ${speedKmh.toFixed(0).padStart(3, " ")}`, 16, 14);
  ctx.fillText(`LAP    ${kart.lap}`, 16, 34);

  if (isSpinning(kart)) {
    ctx.fillStyle = "#ff4060";
    ctx.fillText("SPIN!", 16, 52);
  } else if (kart.turboTimer > 0) {
    ctx.fillStyle = "#ffd040";
    ctx.fillText("TURBO!", 16, 52);
  } else if (kart.pendingTurbo || kart.pendingTurboOnLand) {
    ctx.fillStyle = "#ffd040";
    ctx.fillText("MT ARMED", 16, 52);
  } else if (kart.drift > 0.25 || kart.driftCharge > 0) {
    ctx.fillStyle = "#70d0ff";
    const charge = miniTurboReady(kart)
      ? " READY"
      : kart.driftCharge > 20
        ? " ..."
        : "";
    ctx.fillText(`SLIDE${charge}`, 16, 52);
  }

  ctx.fillStyle = "#a0a8b8";
  ctx.fillText(`FPS ${fps.toFixed(0)}`, VIEW_W - 156, 14);
  ctx.fillText("WASD / ARROWS", VIEW_W - 156, 32);
  ctx.fillText("HOLD Q/E+TURN", VIEW_W - 156, 48);
  ctx.fillText("RELEASE=MT", VIEW_W - 156, 64);

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

  const chargeNorm = miniTurboChargeNorm(kart);
  if (
    (chargeNorm > 0.02 || kart.pendingTurbo) &&
    kart.turboTimer <= 0 &&
    !isSpinning(kart)
  ) {
    const show = kart.pendingTurbo ? 1 : chargeNorm;
    ctx.fillStyle = "#1a2830";
    ctx.fillRect(barX, barY - 4, barW, 3);
    ctx.fillStyle =
      show >= 1 || miniTurboReady(kart) ? "#70d0ff" : "#4080a0";
    ctx.fillRect(barX, barY - 4, barW * Math.min(1, show), 3);
  }

  // Hint: lift off gas to recover while skidding hard (not during spin)
  if (
    !isSpinning(kart) &&
    kart.drift > 0.4 &&
    kart.loseControl > 0.15
  ) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(VIEW_W / 2 - 110, VIEW_H - 36, 220, 22);
    ctx.fillStyle = "#ffe080";
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("LIFT OFF GAS TO RECOVER", VIEW_W / 2, VIEW_H - 30);
    ctx.textAlign = "left";
  }

  // Big SPIN! flash centered
  if (isSpinning(kart)) {
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.02);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#ff3050";
    ctx.font = "bold 28px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("SPIN!", VIEW_W / 2, VIEW_H * 0.28);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  ctx.restore();
}
