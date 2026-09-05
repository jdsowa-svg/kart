/**
 * Kart physics: accelerate / brake / steer with speed-dependent turn rate,
 * friction, and soft off-road / wall response.
 */

import type { InputState } from './input';
import {
  type TrackData,
  sampleSurface,
  isOnRoad,
  SURFACE_WALL,
} from './track';

export interface Kart {
  x: number;
  y: number;
  angle: number; // radians, 0 = +X
  speed: number; // world units per second
  lap: number;
  /** Crossing state for finish line (need to leave then re-enter). */
  crossedFinish: boolean;
  /** Previous side of finish line for segment crossing. */
  prevSide: number;
}

const MAX_SPEED = 220;
const ACCEL = 140;
const BRAKE = 220;
const FRICTION_ROAD = 28;
const FRICTION_OFF = 90;
const TURN_BASE = 2.6; // rad/s at low speed
const TURN_HIGH_FACTOR = 0.35; // turn rate scale at max speed
const WALL_BOUNCE = 0.45;
const OFFROAD_MAX = 95;

export function createKart(track: TrackData): Kart {
  return {
    x: track.startX,
    y: track.startY,
    angle: track.startAngle,
    speed: 0,
    lap: 0,
    crossedFinish: true, // start already "past" line so first cross counts as lap 1
    prevSide: 1,
  };
}

function finishSide(track: TrackData, x: number, y: number): number {
  // Cross product of finish segment AB with AP → which side of the line
  const abx = track.finishBx - track.finishAx;
  const aby = track.finishBy - track.finishAy;
  const apx = x - track.finishAx;
  const apy = y - track.finishAy;
  return Math.sign(abx * apy - aby * apx) || 1;
}

function nearFinish(track: TrackData, x: number, y: number): boolean {
  const mx = (track.finishAx + track.finishBx) * 0.5;
  const my = (track.finishAy + track.finishBy) * 0.5;
  const dx = x - mx;
  const dy = y - my;
  return dx * dx + dy * dy < 120 * 120;
}

export function updateKart(
  kart: Kart,
  track: TrackData,
  input: Readonly<InputState>,
  dt: number,
): void {
  const surf = sampleSurface(track, kart.x, kart.y);
  const onRoad = isOnRoad(surf);
  const maxSpd = onRoad ? MAX_SPEED : OFFROAD_MAX;

  // Accelerate / brake
  if (input.accel) {
    kart.speed += ACCEL * dt;
  }
  if (input.brake) {
    kart.speed -= BRAKE * dt;
  }

  // Friction
  const friction = onRoad ? FRICTION_ROAD : FRICTION_OFF;
  if (!input.accel && !input.brake) {
    if (kart.speed > 0) {
      kart.speed = Math.max(0, kart.speed - friction * dt);
    } else if (kart.speed < 0) {
      kart.speed = Math.min(0, kart.speed + friction * dt);
    }
  }

  // Clamp
  if (kart.speed > maxSpd) kart.speed = maxSpd;
  if (kart.speed < -maxSpd * 0.4) kart.speed = -maxSpd * 0.4;

  // Steer: softer at high speed
  const speedRatio = Math.min(1, Math.abs(kart.speed) / MAX_SPEED);
  const turnRate =
    TURN_BASE * (1 - speedRatio * (1 - TURN_HIGH_FACTOR));
  // Need some speed to turn meaningfully (arcade feel)
  const steerScale = Math.min(1, Math.abs(kart.speed) / 25 + 0.15);
  if (input.left) kart.angle -= turnRate * steerScale * dt;
  if (input.right) kart.angle += turnRate * steerScale * dt;

  // Integrate position
  const nx = kart.x + Math.cos(kart.angle) * kart.speed * dt;
  const ny = kart.y + Math.sin(kart.angle) * kart.speed * dt;

  const nextSurf = sampleSurface(track, nx, ny);
  if (nextSurf === SURFACE_WALL) {
    // Soft collision: slide / bounce
    kart.speed *= -WALL_BOUNCE;
    // Nudge back slightly
    kart.x -= Math.cos(kart.angle) * 4;
    kart.y -= Math.sin(kart.angle) * 4;
  } else {
    kart.x = nx;
    kart.y = ny;
  }

  // Lap detection via finish-line side change while near the stripe
  const side = finishSide(track, kart.x, kart.y);
  if (
    nearFinish(track, kart.x, kart.y) &&
    kart.prevSide !== side &&
    kart.speed > 10
  ) {
    // Crossing in race direction: prevSide > 0 going to <= 0 for our CCW setup
    // Start is past finish with tangent CCW; crossing from "before" to "after"
    if (kart.prevSide > 0 && side <= 0) {
      kart.lap += 1;
    }
  }
  kart.prevSide = side;
}

/** Draw a simple placeholder kart sprite at bottom-center of the view. */
export function drawKartSprite(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  steer: number,
): void {
  const cx = canvasW * 0.5;
  const cy = canvasH * 0.82;
  const lean = steer * 6;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx + lean, cy);
  ctx.rotate(steer * 0.12);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 14, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#e03a3a';
  ctx.fillRect(-16, -10, 32, 22);

  // Cockpit
  ctx.fillStyle = '#2a5080';
  ctx.fillRect(-10, -6, 20, 10);

  // Nose
  ctx.fillStyle = '#f0c040';
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  ctx.lineTo(0, -20);
  ctx.lineTo(10, -10);
  ctx.closePath();
  ctx.fill();

  // Wheels
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-20, -4, 6, 14);
  ctx.fillRect(14, -4, 6, 14);
  ctx.fillRect(-18, 10, 8, 6);
  ctx.fillRect(10, 10, 8, 6);

  ctx.restore();
}
