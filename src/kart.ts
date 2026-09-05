/**
 * Kart physics: accelerate / brake / steer with speed-dependent turn rate,
 * friction, soft off-road, SNES-style hop, hold-shoulder powerslide, and mini-turbo.
 *
 * SMK-style: no reverse (brake → 0 only); skidding does not add *extra*
 * scrub vs going straight (TASVideos) — releasing gas still coasts down.
 * Hold Q/E (SMK L/R) exaggerates slip; counter-steer reins it in; mini-turbo
 * charges like SMK boost-counter (tasvideos.org/GameResources/SNES/SuperMarioKart).
 * Lift off gas (or light brake) to recover grip in a skid; overcooking a
 * powerslide can spin-out.
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
  /**
   * Lose-control meter (0…LOSE_CONTROL_NEED). Builds on aggressive
   * powerslide+accel+high slip; decays when gas lifted or slip drops.
   */
  loseControl: number;
  /** Remaining spin-out time (seconds). >0 = ignore player control. */
  spinTimer: number;
  /** Sign of spin yaw (+1 / −1), set on spin entry from slip direction. */
  spinDir: number;
  /**
   * Locked powerslide direction while hopHold (−1 left / +1 right / 0 none).
   * Set on first steer into the turn; kept for the whole shoulder hold so
   * counter-steer does not end or flip the drift.
   */
  driftDir: number;
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
/** Turn-rate scale when on grass/off-road (ground) — halves tight off-road steer. */
const OFFROAD_TURN_MUL = 0.5;

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
 * Lift off gas while skidding → grip × this (toward GRIP_HIGH).
 * Brake recovers slightly harder. Flooring it keeps loose GRIP_POWERSLIDE.
 */
const RECOVER_GRIP_MUL = 2.75;
const RECOVER_BRAKE_GRIP_MUL = 3.4;
/** Min slip (rad) before lift-off recovery kicks in. */
const RECOVER_SLIP_MIN = 0.2;

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

// --- Spin-out (overcooked powerslide) ---
/** Meter threshold to enter spin-out. */
const LOSE_CONTROL_NEED = 1.0;
/**
 * Build rate at full severity (powerslide + accel + max slip + speed).
 * ~0.7–0.9 s of hard hold to spin if never lifting gas.
 */
const LOSE_CONTROL_BUILD = 1.25;
/** Decay / s when slip drops or gas is lifted (recovery window). */
const LOSE_CONTROL_DECAY = 2.8;
/** Very high slip (rad) required to build lose-control. */
const SPIN_SLIP_THRESHOLD = 0.72;
/** Soft start of slip contribution (below threshold = no build). */
const SPIN_SLIP_SOFT = 0.45;
/** Min speed to accumulate spin risk. */
const SPIN_SPEED_MIN = 110;
/** Charge ≥ this fraction of need + extreme slip bumps the meter (overcharge). */
const OVERCHARGE_FRAC = 0.92;
/** One-shot bump when overcharged at extreme slip (TAS: sooner skid-out). */
const OVERCHARGE_BUMP = 0.22;
/** Spin duration (seconds). */
const SPIN_DURATION = 1.0;
/** Full rotations during spin. */
const SPIN_TURNS = 2.0;
/** Speed bleed during spin (units / s). */
const SPIN_SPEED_BLEED = 95;

/** HUD: charge fraction 0–1 for the READY bar (need = MINI_CHARGE_NEED). */
export function miniTurboChargeNorm(kart: Kart): number {
  return Math.min(1, kart.driftCharge / MINI_CHARGE_NEED);
}

export function miniTurboReady(kart: Kart): boolean {
  return kart.driftCharge >= MINI_CHARGE_NEED || kart.pendingTurbo;
}

export function isSpinning(kart: Kart): boolean {
  return kart.spinTimer > 0;
}

/** Body rotation (rad) for sprite during spin-out; 0 when not spinning. */
export function spinVisualRot(kart: Kart): number {
  if (kart.spinTimer <= 0) return 0;
  const progress = 1 - kart.spinTimer / SPIN_DURATION;
  return kart.spinDir * progress * SPIN_TURNS * Math.PI * 2;
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
    loseControl: 0,
    spinTimer: 0,
    spinDir: 1,
    driftDir: 0,
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
  kart.loseControl = 0;
  kart.spinTimer = 0;
  kart.spinDir = 1;
  kart.driftDir = 0;
}

/** True while the kart is in the air. */
export function isAirborne(kart: Kart): boolean {
  return kart.hopZ > 0 || kart.hopVz > 0;
}

/**
 * Start a short SMK-style hop if currently on the ground.
 * Edge-triggered from input; ignored while already airborne or spinning.
 */
export function tryStartHop(kart: Kart): void {
  if (kart.spinTimer > 0) return;
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

function clearMiniTurboState(kart: Kart): void {
  kart.driftCharge = 0;
  kart.pendingTurbo = false;
  kart.pendingTurboOnLand = false;
  kart.turboTimer = 0;
}

function beginSpinOut(kart: Kart, slipSigned: number): void {
  kart.spinTimer = SPIN_DURATION;
  kart.spinDir = slipSigned >= 0 ? 1 : -1;
  kart.loseControl = 0;
  clearMiniTurboState(kart);
  kart.hopSteerBoost = 0;
  kart.drift = 1;
  kart.driftDir = 0;
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

function updateLaps(kart: Kart, track: TrackData): void {
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

function updateHopVertical(kart: Kart, dt: number): void {
  if (isAirborne(kart)) {
    kart.hopVz -= HOP_GRAVITY * dt;
    kart.hopZ += kart.hopVz * dt;
    if (kart.hopZ <= 0) {
      kart.hopZ = 0;
      kart.hopVz = 0;
    }
  }
  kart.wasAirborne = isAirborne(kart);
}

/** Spin-out: no player control; whirl facing; bleed speed. */
function updateSpinOut(
  kart: Kart,
  track: TrackData,
  dt: number,
): void {
  kart.spinTimer = Math.max(0, kart.spinTimer - dt);
  clearMiniTurboState(kart);

  const spinRate = (SPIN_TURNS * Math.PI * 2) / SPIN_DURATION;
  kart.angle += kart.spinDir * spinRate * dt;
  kart.velAngle = kart.angle;

  kart.speed = Math.max(0, kart.speed - SPIN_SPEED_BLEED * dt);
  kart.drift = 1;
  kart.loseControl = 0;
  kart.hopSteerBoost = 0;

  kart.x += Math.cos(kart.velAngle) * kart.speed * dt;
  kart.y += Math.sin(kart.velAngle) * kart.speed * dt;

  updateHopVertical(kart, dt);

  // Exit: face along velocity (already synced), low speed restored control
  if (kart.spinTimer <= 0) {
    kart.velAngle = kart.angle;
    kart.drift = 0;
  }

  updateLaps(kart, track);
}

export function updateKart(
  kart: Kart,
  track: TrackData,
  input: Readonly<InputState>,
  dt: number,
): void {
  if (kart.spinTimer > 0) {
    updateSpinOut(kart, track, dt);
    return;
  }

  const airborne = isAirborne(kart);
  const landed = kart.wasAirborne && !airborne;
  const surf = sampleSurface(track, kart.x, kart.y);
  const onRoad = isOnRoad(surf);
  const maxSpd = onRoad || airborne ? MAX_SPEED : OFFROAD_MAX;

  // Steer / skid flags early (powerslide / autoDrift / hopSteer). Hop+steer
  // boost updated here too.
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

  // Drift lock: while hopHold, lock driftDir on first into-turn steer.
  // Counter-steer / brief neutral keep the powerslide until shoulder release.
  if (!input.hopHold) {
    kart.driftDir = 0;
  } else if (kart.driftDir === 0 && steering) {
    kart.driftDir = steer;
  }

  // Powerslide: hopHold + locked driftDir (not continuous same-way steer)
  const powerslide = input.hopHold && kart.driftDir !== 0;

  // Accelerate / brake (allowed in air). Brake only toward 0 — SMK has no reverse.
  if (input.accel) {
    kart.speed += ACCEL * dt;
  }
  if (input.brake) {
    kart.speed = Math.max(0, kart.speed - BRAKE * dt);
  }

  // Mild auto-drift only at high speed without hold (ground)
  const absSpeed = Math.abs(kart.speed);
  const autoDrift =
    !powerslide && absSpeed > DRIFT_SPEED && steering && !airborne;
  const wantDrift = powerslide || autoDrift || hopSteerActive;

  // Friction (milder while airborne). Always apply normal coast friction when
  // not accel/braking — skidding does not add *extra* scrub vs straight, but
  // releasing gas still bleeds speed. Same road/off-road/air rates while
  // powersliding; brake still slows intentionally above.
  const friction = airborne
    ? FRICTION_AIR
    : onRoad
      ? FRICTION_ROAD
      : FRICTION_OFF;
  if (!input.accel && !input.brake) {
    if (kart.speed > 0) {
      kart.speed = Math.max(0, kart.speed - friction * dt);
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

  // Clamp — no reverse (SMK: hop to turn around)
  const hardMax =
    kart.turboTimer > 0
      ? maxSpd + TURBO_BOOST * (onRoad ? 1 : TURBO_OFFROAD_MUL)
      : maxSpd;
  if (kart.speed > hardMax) kart.speed = hardMax;
  if (kart.speed < 0) kart.speed = 0;

  // Refresh after clamp for steer/grip
  const absSpeedClamped = Math.abs(kart.speed);

  // Pre-grip slip (for recovery + spin meter)
  const slipSigned = angleDelta(kart.velAngle, kart.angle);
  const slip = Math.abs(slipSigned);

  // Steer rate: hop+steer sharpens yaw; else mild air reduce
  const speedRatio = Math.min(1, absSpeedClamped / MAX_SPEED);
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
  // Soften absurdly tight off-road turn (low OFFROAD_MAX → high speed-curve turn + grip)
  if (!onRoad && !airborne) {
    turnRate *= OFFROAD_TURN_MUL;
  }
  const steerScale = Math.min(1, Math.abs(kart.speed) / 25 + 0.15);
  if (powerslide) {
    // SMK counter-steer: stay in slide; opposite stick reins slip in, doesn't flip
    if (steer === kart.driftDir) {
      // Same-way: normal into-turn powerslide yaw
      kart.angle += steer * turnRate * steerScale * dt;
    } else if (steer === -kart.driftDir) {
      // Counter-steer: weak opposite yaw + pull facing toward vel (tighten slide)
      const COUNTER_YAW = 0.22;
      kart.angle += steer * turnRate * steerScale * COUNTER_YAW * dt;
      const stabilize = 1 - Math.exp(-5.2 * dt);
      kart.angle = lerpAngle(kart.angle, kart.velAngle, stabilize);
    } else {
      // Neutral while holding shoulder: gentle slip decay, still in slide
      const maintain = 1 - Math.exp(-1.4 * dt);
      kart.angle = lerpAngle(kart.angle, kart.velAngle, maintain);
    }
  } else {
    if (input.left) kart.angle -= turnRate * steerScale * dt;
    if (input.right) kart.angle += turnRate * steerScale * dt;
  }

  // --- Drift / powerslide grip ---

  let grip = GRIP_HIGH;
  if (powerslide) {
    grip = onRoad ? GRIP_POWERSLIDE : GRIP_POWERSLIDE_OFF;
    if (hopSteerActive) grip *= HOP_DRIFT_GRIP_MUL;
  } else if (hopSteerActive) {
    grip = (onRoad ? GRIP_AUTO_DRIFT : GRIP_AUTO_DRIFT_OFF) * HOP_DRIFT_GRIP_MUL;
  } else if (autoDrift) {
    grip = onRoad ? GRIP_AUTO_DRIFT : GRIP_AUTO_DRIFT_OFF;
  } else if (absSpeedClamped <= DRIFT_SPEED) {
    grip = GRIP_HIGH;
  } else {
    grip = GRIP_HIGH * 0.85;
  }

  // Lift off gas to recover (SMK manual): while skidding, no accel → grip ↑
  // Flooring through a hard skid keeps the loose grip. Light brake helps more.
  if (
    wantDrift &&
    slip >= RECOVER_SLIP_MIN &&
    !input.accel
  ) {
    const mul = input.brake ? RECOVER_BRAKE_GRIP_MUL : RECOVER_GRIP_MUL;
    grip = Math.min(GRIP_HIGH, grip * mul);
  }

  const snapSpeed = powerslide || hopSteerActive ? 10 : 20;
  if (absSpeedClamped < snapSpeed) {
    kart.velAngle = kart.angle;
  } else {
    const t = 1 - Math.exp(-grip * dt);
    kart.velAngle = lerpAngle(kart.velAngle, kart.angle, t);
  }

  // Visual drift factor from post-grip slip
  const slipAfter = Math.abs(angleDelta(kart.velAngle, kart.angle));
  const slipNorm = Math.min(1, slipAfter / 0.55);
  const targetDrift = wantDrift
    ? Math.max(powerslide ? 0.45 : 0.3, slipNorm)
    : slipNorm * 0.5;
  kart.drift += (targetDrift - kart.drift) * Math.min(1, DRIFT_BLEND * dt);
  if (kart.drift < 0.02 && targetDrift < 0.02) kart.drift = 0;

  // --- Lose-control / spin-out meter (aggressive powerslides only) ---
  // Gentle auto-drift does not build; need powerslide + accel + speed + high slip.
  const aggressiveSlide =
    powerslide &&
    input.accel &&
    absSpeedClamped >= SPIN_SPEED_MIN &&
    slip >= SPIN_SLIP_SOFT;

  if (aggressiveSlide) {
    const slipFactor = Math.min(
      1,
      Math.max(0, (slip - SPIN_SLIP_SOFT) / (SPIN_SLIP_THRESHOLD - SPIN_SLIP_SOFT)),
    );
    const speedFactor = Math.min(
      1,
      (absSpeedClamped - SPIN_SPEED_MIN) / (MAX_SPEED - SPIN_SPEED_MIN),
    );
    kart.loseControl +=
      LOSE_CONTROL_BUILD * slipFactor * (0.45 + 0.55 * speedFactor) * dt;

    // Over-charged MT while slip extreme → sooner skid-out (TAS notes)
    const overcharged =
      kart.driftCharge >= MINI_CHARGE_NEED * OVERCHARGE_FRAC ||
      kart.pendingTurbo;
    if (overcharged && slip >= SPIN_SLIP_THRESHOLD) {
      kart.loseControl += OVERCHARGE_BUMP * dt;
    }
  } else {
    // Lift gas / drop slip → meter decays (recovery window)
    kart.loseControl = Math.max(0, kart.loseControl - LOSE_CONTROL_DECAY * dt);
  }

  if (kart.loseControl >= LOSE_CONTROL_NEED) {
    beginSpinOut(kart, slipSigned);
    // Finish this frame as a spin so control cuts immediately
    updateSpinOut(kart, track, dt);
    return;
  }

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
  const straightened = !steering && slipAfter < STRAIGHTEN_SLIP;
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
  updateHopVertical(kart, dt);

  updateLaps(kart, track);
}

/**
 * Draw a simple placeholder kart sprite at bottom-center of the view.
 * @param hopHeight world-space hopZ; lifts body and fades/shrinks shadow.
 * @param drift 0–1 slip amount for lean / skid marks / dust.
 * @param spinRot extra radians of body spin (spin-out visual).
 */
export function drawKartSprite(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  steer: number,
  hopHeight = 0,
  drift = 0,
  spinRot = 0,
): void {
  const cx = canvasW * 0.5;
  const cy = canvasH * 0.82;
  const lean = steer * 6 + drift * steer * 10;
  const liftPx = Math.min(28, hopHeight * HOP_PX_PER_UNIT);
  const hopNorm = Math.min(1, hopHeight / 40);
  const shadowAlpha = 0.35 * (1 - hopNorm * 0.55);
  const shadowRx = 22 * (1 - hopNorm * 0.35);
  const shadowRy = 6 * (1 - hopNorm * 0.35);
  const spinning = Math.abs(spinRot) > 0.001;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx + (spinning ? 0 : lean), cy);
  ctx.rotate(
    spinning
      ? spinRot
      : steer * 0.12 + drift * steer * 0.18,
  );

  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(0, 14, shadowRx, shadowRy, 0, 0, Math.PI * 2);
  ctx.fill();

  if ((drift > 0.2 || spinning) && hopHeight < 2) {
    const n = spinning ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      const side = steer !== 0 ? -steer : i % 2 === 0 ? -1 : 1;
      const px = side * (10 + t * 14) + Math.sin(i * 2.1 + spinRot) * 3;
      const py = 12 + t * 10;
      const r = 2 + (spinning ? 1 : drift) * 4 * (1 - t);
      const a = 0.15 + (spinning ? 0.5 : drift) * 0.35 * (1 - t);
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
