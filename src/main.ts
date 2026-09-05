/**
 * Entry: wire modules, run fixed-timestep game loop.
 */

import { initInput, getInput, consumeActions, pollGamepad } from './input';
import { createTrack } from './track';
import {
  createKart,
  resetKart,
  updateKart,
  drawKartSprite,
  tryStartHop,
  isSpinning,
  spinVisualRot,
} from './kart';
import {
  VIEW_W,
  VIEW_H,
  createMode7Buffers,
  renderMode7,
} from './mode7';
import { drawHud } from './hud';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
ctx.imageSmoothingEnabled = false;

canvas.width = VIEW_W;
canvas.height = VIEW_H;

/** Display scale: 1 = 640×400 CSS, 2 = 1280×800 CSS. Default 2×. */
let displayScale = 2;

function applyDisplayScale(): void {
  canvas.style.width = `${VIEW_W * displayScale}px`;
  canvas.style.height = `${VIEW_H * displayScale}px`;
}

applyDisplayScale();

initInput();

const track = createTrack();
const kart = createKart(track);
const buffers = createMode7Buffers();

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
let fps = 60;
let fpsAccum = 0;
let fpsFrames = 0;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt;

  fpsAccum += dt;
  fpsFrames += 1;
  if (fpsAccum >= 0.5) {
    fps = fpsFrames / fpsAccum;
    fpsAccum = 0;
    fpsFrames = 0;
  }

  pollGamepad();
  const actions = consumeActions();
  if (actions.toggleScale) {
    displayScale = displayScale === 2 ? 1 : 2;
    applyDisplayScale();
  }
  if (actions.restart) {
    resetKart(kart, track);
  }
  if (actions.hop) {
    tryStartHop(kart);
  }

  const input = getInput();
  while (acc >= STEP) {
    updateKart(kart, track, input, STEP);
    acc -= STEP;
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  renderMode7(ctx, track, kart, buffers);

  const spinning = isSpinning(kart);
  const stickSteer =
    (input.left ? -1 : 0) + (input.right ? 1 : 0);
  // Lean from locked driftDir while sliding (incl. hopHold flicker / airborne re-hop)
  const leanSteer = spinning
    ? 0
    : kart.driftDir !== 0 &&
        (input.hopHold || kart.drift > 0.2 || kart.hopZ > 0)
      ? kart.driftDir
      : stickSteer;
  drawKartSprite(
    ctx,
    VIEW_W,
    VIEW_H,
    leanSteer,
    kart.hopZ,
    kart.drift,
    spinVisualRot(kart),
  );

  drawHud(ctx, kart, fps);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
