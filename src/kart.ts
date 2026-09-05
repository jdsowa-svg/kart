/**
 * Kart physics: accelerate / brake / steer with speed-dependent turn rate,
 * friction, soft off-road / wall response, and SNES-style hop.
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
  /** Vertical hop height (world units); 0 = on ground. */
  hopZ: number;
  /** Vertical hop velocity (world units / second). */
  hopVz: number;
}

const MAX_SPEED = 220;
const ACCEL = 140;
const BRAKE = 220;
const FRICTION_ROAD = 28;
const FRICTION_OFF = 90;
const FRICTION_AIR = 20;
const TURN_BASE = 2.6; // rad/s at low speed
const TURN_HIGH_FACTOR = 0.35; // turn rate scale at max speed
const TURN_AIR_FACTOR = 0.7; // reduced turn while airborne
const WALL_BOUNCE = 0.45;
const OFFROAD_MAX = 95;

/** Initial upward velocity for a hop (world units / s). */
export const JUMP_VZ = 250;
/** Gravity pulling hopZ down (world units / s²). */
export const HOP_GRAVITY = 1050;
/** World units of hopZ → screen pixels of sprite lift. */
const HOP_PX_PER_UNIT = 0.55;

export function createKart(track: TrackData): Kart {
  return {
    x: track.startX,
    y: track.startY,
    angle: track.startAngle,
    speed: 0,
    lap: 0,
    crossedFinish: true, // start already "past" line so first cross counts as lap 1
    prevSide: 1,
    hopZ: 0,
    hopVz: 0,
  };
}

/** Reset kart to track start (same fields as createKart). */
export function resetKart(kart: Kart, track: TrackData): void {
  kart.x = track.startX;
  kart.y = track.startY;
  kart.angle = track.startAngle;
  kart.speed = 0;
  kart.lap = 0;
  kart.crossedFinish = true;
  kart.prevSide = 1;
  kart.hopZ = 0;
  kart.hopVz = 0;
}

/** True while the kart is in the air. */
export function isAirborne(kart: Kart): boolean {
  return kart.hopZ > 0 || kart.hopVz > 0;
}

/**
 * Start a short SMK-style hop if currently on the ground.
 * Edge-triggered from input; ignored while already airborne.
 */
export function tryStartHop(kart: Kart): void {
  if (kart.hopZ > 0 || kart.hopVz !== 0) return;
  kart.hopVz = JUMP_VZ;
  // Tiny lift so airborne checks trip immediately this frame
  kart.hopZ = 0.01;
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
  const airborne = isAirborne(kart);
  const surf = sampleSurface(track, kart.x, kart.y);
  const onRoad = isOnRoad(surf);
  const maxSpd = onRoad || airborne ? MAX_SPEED : OFFROAD_MAX;

  // Accelerate / brake (allowed in air)
  if (input.accel) {
    kart.speed += ACCEL * dt;
  }
  if (input.brake) {
    kart.speed -= BRAKE * dt;
  }

  // Friction (milder while airborne)
  const friction = airborne
    ? FRICTION_AIR
    : onRoad
      ? FRICTION_ROAD
      : FRICTION_OFF;
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

  // Steer: softer at high speed; reduced turn rate in air
  const speedRatio = Math.min(1, Math.abs(kart.speed) / MAX_SPEED);
  let turnRate =
    TURN_BASE * (1 - speedRatio * (1 - TURN_HIGH_FACTOR));
  if (airborne) turnRate *= TURN_AIR_FACTOR;
  // Need some speed to turn meaningfully (arcade feel)
  const steerScale = Math.min(1, Math.abs(kart.speed) / 25 + 0.15);
  if (input.left) kart.angle -= turnRate * steerScale * dt;
  if (input.right) kart.angle += turnRate * steerScale * dt;

  // Integrate position
  const nx = kart.x + Math.cos(kart.angle) * kart.speed * dt;
  const ny = kart.y + Math.sin(kart.angle) * kart.speed * dt;

  if (airborne) {
    // Skip wall collision while hopping — can clear thin wall contact
    kart.x = nx;
    kart.y = ny;
  } else {
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
  }

  // Hop vertical integration
  if (airborne) {
    kart.hopVz -= HOP_GRAVITY * dt;
    kart.hopZ += kart.hopVz * dt;
    if (kart.hopZ <= 0) {
      kart.hopZ = 0;
      kart.hopVz = 0;
    }
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

/**
 * Draw a simple placeholder kart sprite at bottom-center of the view.
 * @param hopHeight world-space hopZ; lifts body and fades/shrinks shadow.
 */
export function drawKartSprite(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  steer: number,
  hopHeight = 0,
): void {
  const cx = canvasW * 0.5;
  const cy = canvasH * 0.82;
  const lean = steer * 6;
  const liftPx = Math.min(28, hopHeight * HOP_PX_PER_UNIT);
  // Shadow shrink/fade with height (max hop ~40 → strong effect)
  const hopNorm = Math.min(1, hopHeight / 40);
  const shadowAlpha = 0.35 * (1 - hopNorm * 0.55);
  const shadowRx = 22 * (1 - hopNorm * 0.35);
  const shadowRy = 6 * (1 - hopNorm * 0.35);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx + lean, cy);
  ctx.rotate(steer * 0.12);

  // Shadow stays near ground (no lift)
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(0, 14, shadowRx, shadowRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body lifts with hop
  ctx.translate(0, -liftPx);

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
