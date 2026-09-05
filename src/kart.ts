/**
 * Kart physics: accelerate / brake / steer with speed-dependent turn rate,
 * friction, soft off-road, SNES-style hop, hold-shoulder powerslide, and mini-turbo.
 *
 * Hold Q/E (SMK L/R) exaggerates slip; mini-turbo charges like SMK boost-counter
 * (tasvideos.org/GameResources/SNES/SuperMarioKart).
 */

import type { InputState } from './input';
import {
  type TrackData,
  sampleSurface,
  isOnRoad,
} from './track';

export interface Kart {
  x: number;
  y: number;
  angle: number; // radians, 0 = +X — facing / steer direction
  /** Movement heading; lags behind angle when drifting. */
  velAngle: number;
  speed: number; // world units per second (along velAngle)
  lap: number;
  /** Crossing state for finish line (need to leave then re-enter). */
  crossedFinish: boolean;
  /** Previous side of finish line for segment crossing. */
  prevSide: number;
  /** Vertical hop height (world units); 0 = on ground. */
  hopZ: number;
  /** Vertical hop velocity (world units / second). */
  hopVz: number;
  /** 0–1 visual / HUD drift intensity. */
  drift: number;
  /**
   * Mini-turbo charge (0…1+). Builds while hopHold && steer && accel.
   * Maps to SMK boost-counter (~64 = fully charged / READY).
   */
  driftCharge: number;
  /** Remaining mini-turbo boost time (seconds). */
  turboTimer: number;
  /**
   * Remaining hop+steer / landing powerslide yaw boost (seconds).
   * Refreshed while airborne with steer; decays on ground for LAND_SLIDE_TIME.
   */
  hopSteerBoost: number;
  /**
   * Armed mini-turbo waiting for straighten (SMK: fire when not slipping,
   * no steer). Set when charge resets at/above threshold.
   */
  pendingTurbo: boolean;
  /** If straighten armed the boost in mid-air, fire on next landing. */
  pendingTurboOnLand: boolean;
  /** Was airborne last frame (to detect landing edge). */
  wasAirborne: boolean;
}

const MAX_SPEED = 220;
const ACCEL = 140;
const BRAKE = 220;
const FRICTION_ROAD = 28;
const FRICTION_OFF = 90;
const FRICTION_AIR = 20;
const TURN_BASE = 2.6; // rad/s at low speed
const TURN_HIGH_FACTOR = 0.35; // turn rate scale at max speed
/** Mild turn reduce while airborne *without* hop-steer bite. */
const TURN_AIR_FACTOR = 0.85;
/** Sharper yaw while hopping (or landing powerslide) with steer held — SMK hop-turn bite. */
const TURN_HOP_STEER = 1.8;
/** Seconds of elevated turn after hop lands while still steering. */
const LAND_SLIDE_TIME = 0.35;
const OFFROAD_MAX = 95;

/** Speed above which holding steer alone engages milder auto-drift. */
export const DRIFT_SPEED = 125;
/** Base grip: how fast velAngle catches facing (1/s). High = snappy. */
const GRIP_HIGH = 14;
/** Milder grip for high-speed auto-drift (no shoulder hold). */
const GRIP_AUTO_DRIFT = 3.6;
const GRIP_AUTO_DRIFT_OFF = 2.4;
/**
 * Hold L/R (hopHold) + steer: much lower grip — the SMK “greatly exaggerates slip”
 * effect. Applies even below DRIFT_SPEED and in air.
 */
const GRIP_POWERSLIDE = 1.35;
const GRIP_POWERSLIDE_OFF = 0.9;
/** How quickly `kart.drift` visual factor rises/falls. */
const DRIFT_BLEND = 6;
/** Extra slip while hop+steer landing yaw boost is active. */
const HOP_DRIFT_GRIP_MUL = 0.85;

/**
 * SMK mini-boost: charge while (L|R) && (left|right) && accel.
 * Threshold ≈ 64 boost-counter units ≈ 42 frames ≈ 0.7 s at 60 Hz
 * (1/frame to 20, then 2/frame). We accumulate in “frame-equivalent” units.
 * (Was 128 / ~1.2 s; halved for snappier powerslide MT.)
 */
const MINI_CHARGE_NEED = 64;
/** Peak extra speed from mini-turbo. */
const TURBO_BOOST = 55;
/** Mini-turbo duration (seconds). */
const TURBO_DURATION = 0.55;
/** Off-road turbo strength multiplier. */
const TURBO_OFFROAD_MUL = 0.55;
/** Slip angle (rad) below which we consider the kart “straightened”. */
const STRAIGHTEN_SLIP = 0.12;

/** Initial upward velocity for a hop (world units / s). */
export const JUMP_VZ = 342;
/** Gravity pulling hopZ down (world units / s²). */
export const HOP_GRAVITY = 2363;
/** World units of hopZ → screen pixels of sprite lift. */
const HOP_PX_PER_UNIT = 0.55;

/** HUD: charge fraction 0–1 for the READY bar (need = MINI_CHARGE_NEED). */
export function miniTurboChargeNorm(kart: Kart): number {
  return Math.min(1, kart.driftCharge / MINI_CHARGE_NEED);
}

export function miniTurboReady(kart: Kart): boolean {
  return kart.driftCharge >= MINI_CHARGE_NEED || kart.pendingTurbo;
}

function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}


function lerpAngle(from: number, to: number, t: number): number {
  return from + angleDelta(from, to) * Math.min(1, Math.max(0, t));
}

export function createKart(track: TrackData): Kart {
  return {
    x: track.startX,
    y: track.startY,
    angle: track.startAngle,
    velAngle: track.startAngle,
    speed: 0,
    lap: 0,
    crossedFinish: true, // start already "past" line so first cross counts as lap 1
    prevSide: 1,
    hopZ: 0,
    hopVz: 0,
    drift: 0,
    driftCharge: 0,
    turboTimer: 0,
    hopSteerBoost: 0,
    pendingTurbo: false,
    pendingTurboOnLand: false,
    wasAirborne: false,
  };
}

/** Reset kart to track start (same fields as createKart). */
export function resetKart(kart: Kart, track: TrackData): void {
  kart.x = track.startX;
  kart.y = track.startY;
  kart.angle = track.startAngle;
  kart.velAngle = track.startAngle;
  kart.speed = 0;
  kart.lap = 0;
  kart.crossedFinish = true;
  kart.prevSide = 1;
  kart.hopZ = 0;
  kart.hopVz = 0;
  kart.drift = 0;
  kart.driftCharge = 0;
  kart.turboTimer = 0;
  kart.hopSteerBoost = 0;
  kart.pendingTurbo = false;
  kart.pendingTurboOnLand = false;
  kart.wasAirborne = false;
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

function fireMiniTurbo(kart: Kart, onRoad: boolean, maxSpd: number): void {
  kart.turboTimer = TURBO_DURATION;
  kart.pendingTurbo = false;
  kart.pendingTurboOnLand = false;
  const kick = TURBO_BOOST * 0.35 * (onRoad ? 1 : TURBO_OFFROAD_MUL);
  kart.speed = Math.min(maxSpd + TURBO_BOOST, kart.speed + kick);
}

/**
 * SMK boost-counter step for `dt` seconds at 60 Hz feel:
 * +1/frame while charge < 20, +2/frame thereafter.
 */
function accumulateMiniCharge(charge: number, dt: number): number {
  const frames = dt * 60;
  let c = charge;
  let left = frames;
  if (c < 20) {
    const to20 = 20 - c;
    const step = Math.min(left, to20);
    c += step;
    left -= step;
  }
  if (left > 0) {
    c += left * 2;
  }
  return c;
}

export function updateKart(
  kart: Kart,
  track: TrackData,
  input: Readonly<InputState>,
  dt: number,
): void {
  const airborne = isAirborne(kart);
  const landed = kart.wasAirborne && !airborne;
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


  // Mini-turbo: temporary speed ceiling bump + decay
  if (kart.turboTimer > 0) {
    kart.turboTimer = Math.max(0, kart.turboTimer - dt);
    const turboMul = onRoad ? 1 : TURBO_OFFROAD_MUL;
    const boost =
      TURBO_BOOST * turboMul * (kart.turboTimer / TURBO_DURATION);
    const turboCap = maxSpd + boost;
    if (kart.speed > 0 && kart.speed < turboCap && input.accel) {
      kart.speed = Math.min(turboCap, kart.speed + boost * 2.5 * dt);
    }
  }

  // Clamp
  const hardMax =
    kart.turboTimer > 0
      ? maxSpd + TURBO_BOOST * (onRoad ? 1 : TURBO_OFFROAD_MUL)
      : maxSpd;
  if (kart.speed > hardMax) kart.speed = hardMax;
  if (kart.speed < -maxSpd * 0.4) kart.speed = -maxSpd * 0.4;

  // Steer input
  const steer =
    (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const steering = steer !== 0;

  // Hop+steer yaw boost: refresh while airborne with steer; land window on ground
  if (airborne && steering) {
    kart.hopSteerBoost = LAND_SLIDE_TIME;
  } else if (kart.hopSteerBoost > 0) {
    if (!steering) {
      kart.hopSteerBoost = 0;
    } else {
      kart.hopSteerBoost = Math.max(0, kart.hopSteerBoost - dt);
    }
  }
  const hopSteerActive = kart.hopSteerBoost > 0 && steering;

  // Powerslide: hold shoulder + steer (SMK L/R hold) — main slip exaggerator
  const powerslide = input.hopHold && steering;

  // Steer rate: hop+steer sharpens yaw; else mild air reduce
  const speedRatio = Math.min(1, Math.abs(kart.speed) / MAX_SPEED);
  let turnRate =
    TURN_BASE * (1 - speedRatio * (1 - TURN_HIGH_FACTOR));
  if (hopSteerActive) {
    turnRate *= TURN_HOP_STEER;
  } else if (airborne) {
    turnRate *= TURN_AIR_FACTOR;
  }
  // Slightly snappier yaw while powersliding (tight turn / power slide feel)
  if (powerslide && !hopSteerActive) {
    turnRate *= 1.25;
  }
  const steerScale = Math.min(1, Math.abs(kart.speed) / 25 + 0.15);
  if (input.left) kart.angle -= turnRate * steerScale * dt;
  if (input.right) kart.angle += turnRate * steerScale * dt;

  // --- Drift / powerslide grip ---
  const absSpeed = Math.abs(kart.speed);
  // Mild auto-drift only at high speed without hold (ground)
  const autoDrift =
    !powerslide && absSpeed > DRIFT_SPEED && steering && !airborne;
  const wantDrift = powerslide || autoDrift || hopSteerActive;

  let grip = GRIP_HIGH;
  if (powerslide) {
    grip = onRoad ? GRIP_POWERSLIDE : GRIP_POWERSLIDE_OFF;
    if (hopSteerActive) grip *= HOP_DRIFT_GRIP_MUL;
  } else if (hopSteerActive) {
    grip = (onRoad ? GRIP_AUTO_DRIFT : GRIP_AUTO_DRIFT_OFF) * HOP_DRIFT_GRIP_MUL;
  } else if (autoDrift) {
    grip = onRoad ? GRIP_AUTO_DRIFT : GRIP_AUTO_DRIFT_OFF;
  } else if (absSpeed <= DRIFT_SPEED) {
    grip = GRIP_HIGH;
  } else {
    grip = GRIP_HIGH * 0.85;
  }

  const snapSpeed = powerslide || hopSteerActive ? 10 : 20;
  if (absSpeed < snapSpeed) {
    kart.velAngle = kart.angle;
  } else {
    const t = 1 - Math.exp(-grip * dt);
    kart.velAngle = lerpAngle(kart.velAngle, kart.angle, t);
  }

  // Visual drift factor from slip angle
  const slip = Math.abs(angleDelta(kart.velAngle, kart.angle));
  const slipNorm = Math.min(1, slip / 0.55);
  const targetDrift = wantDrift
    ? Math.max(powerslide ? 0.45 : 0.3, slipNorm)
    : slipNorm * 0.5;
  kart.drift += (targetDrift - kart.drift) * Math.min(1, DRIFT_BLEND * dt);
  if (kart.drift < 0.02 && targetDrift < 0.02) kart.drift = 0;

  // --- SMK mini-turbo charge ---
  // Charge only while hopHold && (left|right) && accel.
  // Left↔right swap OK; releasing any of the three resets.
  const charging = input.hopHold && steering && input.accel;
  if (charging) {
    kart.driftCharge = accumulateMiniCharge(kart.driftCharge, dt);
  } else if (kart.driftCharge > 0) {
    // Charge window ended — arm pending boost if charged enough
    if (kart.driftCharge >= MINI_CHARGE_NEED) {
      kart.pendingTurbo = true;
    }
    kart.driftCharge = 0;
  }

  // Fire pending boost when straightened (steer==0, low slip), or on land
  const straightened = !steering && slip < STRAIGHTEN_SLIP;
  if (kart.pendingTurbo) {
    if (straightened) {
      if (airborne) {
        // Armed in air → fire on landing (SMK)
        kart.pendingTurboOnLand = true;
      } else if (!input.hopHold) {
        fireMiniTurbo(kart, onRoad, maxSpd);
      } else {
        kart.pendingTurbo = false;
        kart.pendingTurboOnLand = false;
      }
    }
  }
  if (landed && kart.pendingTurboOnLand) {
    // If still holding L/R on land after air-straighten, SMK cancels — skip
    if (!input.hopHold) {
      fireMiniTurbo(kart, onRoad, maxSpd);
    } else {
      kart.pendingTurbo = false;
      kart.pendingTurboOnLand = false;
    }
  }

  // Integrate position along velocity heading (not facing)
  kart.x += Math.cos(kart.velAngle) * kart.speed * dt;
  kart.y += Math.sin(kart.velAngle) * kart.speed * dt;

  // Hop vertical integration (visual + air control)
  if (airborne) {
    kart.hopVz -= HOP_GRAVITY * dt;
    kart.hopZ += kart.hopVz * dt;
    if (kart.hopZ <= 0) {
      kart.hopZ = 0;
      kart.hopVz = 0;
    }
  }

  kart.wasAirborne = isAirborne(kart);

  // Lap detection via finish-line side change while near the stripe
  const side = finishSide(track, kart.x, kart.y);
  if (
    nearFinish(track, kart.x, kart.y) &&
    kart.prevSide !== side &&
    kart.speed > 10
  ) {
    if (kart.prevSide > 0 && side <= 0) {
      kart.lap += 1;
    }
  }
  kart.prevSide = side;
}

/**
 * Draw a simple placeholder kart sprite at bottom-center of the view.
 * @param hopHeight world-space hopZ; lifts body and fades/shrinks shadow.
 * @param drift 0–1 slip amount for lean / skid marks / dust.
 */
export function drawKartSprite(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  steer: number,
  hopHeight = 0,
  drift = 0,
): void {
  const cx = canvasW * 0.5;
  const cy = canvasH * 0.82;
  const lean = steer * 6 + drift * steer * 10;
  const liftPx = Math.min(28, hopHeight * HOP_PX_PER_UNIT);
  const hopNorm = Math.min(1, hopHeight / 40);
  const shadowAlpha = 0.35 * (1 - hopNorm * 0.55);
  const shadowRx = 22 * (1 - hopNorm * 0.35);
  const shadowRy = 6 * (1 - hopNorm * 0.35);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx + lean, cy);
  ctx.rotate(steer * 0.12 + drift * steer * 0.18);

  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(0, 14, shadowRx, shadowRy, 0, 0, Math.PI * 2);
  ctx.fill();

  if (drift > 0.2 && hopHeight < 2) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      const side = steer !== 0 ? -steer : i % 2 === 0 ? -1 : 1;
      const px = side * (10 + t * 14) + Math.sin(i * 2.1) * 3;
      const py = 12 + t * 10;
      const r = 2 + drift * 4 * (1 - t);
      const a = 0.15 + drift * 0.35 * (1 - t);
      ctx.fillStyle = `rgba(200,190,160,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.translate(0, -liftPx);

  ctx.fillStyle = '#e03a3a';
  ctx.fillRect(-16, -10, 32, 22);

  ctx.fillStyle = '#2a5080';
  ctx.fillRect(-10, -6, 20, 10);

  ctx.fillStyle = '#f0c040';
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  ctx.lineTo(0, -20);
  ctx.lineTo(10, -10);
  ctx.closePath();
  ctx.fill();

  const skid = drift * 3;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-20 - skid * Math.sign(steer || 1), -4, 6, 14);
  ctx.fillRect(14 + skid * Math.sign(steer || 1), -4, 6, 14);
  ctx.fillRect(-18, 10, 8, 6);
  ctx.fillRect(10, 10, 8, 6);

  ctx.restore();
}
