/**
 * Keyboard + Xbox-style gamepad input (SNES Mario Kart face-button positions).
 *
 * Keyboard: arrows / WASD, Q/E hop, Esc restart, 0 scale.
 * Gamepad (standard mapping): A=accel, X=brake, D-pad+stick steer,
 * LB/RB=hop, Start=restart, View=scale; RT/LT also accel/brake.
 */

export interface InputState {
  accel: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  /** True while KeyQ/KeyE or LB/RB held (SMK L/R shoulder hold). */
  hopHold: boolean;
}

export interface InputActions {
  toggleScale: boolean;
  restart: boolean;
  /** One-shot hop on Q/E or LB/RB press edge (like SMK L/R press). */
  hop: boolean;
}

const kb: InputState = {
  accel: false,
  brake: false,
  left: false,
  right: false,
  hopHold: false,
};

const gp: InputState = {
  accel: false,
  brake: false,
  left: false,
  right: false,
  hopHold: false,
};

const actions: InputActions = {
  toggleScale: false,
  restart: false,
  hop: false,
};

/** Track Q and E separately so releasing one while the other is held keeps hopHold. */
let qDown = false;
let eDown = false;

function syncKbHopHold(): void {
  kb.hopHold = qDown || eDown;
}

function setKey(code: string, down: boolean): void {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      kb.accel = down;
      break;
    case 'ArrowDown':
    case 'KeyS':
      kb.brake = down;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      kb.left = down;
      break;
    case 'ArrowRight':
    case 'KeyD':
      kb.right = down;
      break;
  }
}

const STICK_DEADZONE = 0.28;

/** Previous frame shoulder / menu buttons for rising-edge detection. */
let prevLb = false;
let prevRb = false;
let prevStart = false;
let prevView = false;

let loggedPadConnect = false;

function btnPressed(pad: Gamepad, index: number): boolean {
  const b = pad.buttons[index];
  if (!b) return false;
  return b.pressed || b.value > 0.5;
}

/**
 * Poll `navigator.getGamepads()` and merge into continuous gamepad state +
 * one-shot actions. Call once per frame before `getInput` / `consumeActions`.
 * Keyboard state is never cleared by the pad.
 */
export function pollGamepad(): void {
  gp.accel = false;
  gp.brake = false;
  gp.left = false;
  gp.right = false;
  gp.hopHold = false;

  const pads = typeof navigator !== 'undefined' && navigator.getGamepads
    ? navigator.getGamepads()
    : [];

  let pad: Gamepad | null = null;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p && p.connected) {
      pad = p;
      break;
    }
  }

  if (!pad) {
    prevLb = false;
    prevRb = false;
    prevStart = false;
    prevView = false;
    return;
  }

  // Face + triggers (OR): A/RT accel, X/LT brake
  const a = btnPressed(pad, 0);
  const x = btnPressed(pad, 2);
  const lt = btnPressed(pad, 6);
  const rt = btnPressed(pad, 7);
  gp.accel = a || rt;
  gp.brake = x || lt;

  // D-pad (12–15) + left stick X
  const dLeft = btnPressed(pad, 14);
  const dRight = btnPressed(pad, 15);
  const axis0 = pad.axes[0] ?? 0;
  const stickLeft = axis0 < -STICK_DEADZONE;
  const stickRight = axis0 > STICK_DEADZONE;
  gp.left = dLeft || stickLeft;
  gp.right = dRight || stickRight;

  // LB / RB — hop edge on press; hopHold while either held
  const lb = btnPressed(pad, 4);
  const rb = btnPressed(pad, 5);
  gp.hopHold = lb || rb;
  if ((lb && !prevLb) || (rb && !prevRb)) {
    actions.hop = true;
  }
  prevLb = lb;
  prevRb = rb;

  // Start (9) = restart; View/Back (8) = toggleScale
  const start = btnPressed(pad, 9);
  const view = btnPressed(pad, 8);
  if (start && !prevStart) actions.restart = true;
  if (view && !prevView) actions.toggleScale = true;
  prevStart = start;
  prevView = view;
}

export function initInput(): void {
  window.addEventListener('keydown', (e) => {
    if (
      e.code === 'Digit0' ||
      e.code === 'Numpad0' ||
      e.code === 'Escape' ||
      e.code === 'KeyQ' ||
      e.code === 'KeyE'
    ) {
      e.preventDefault();
      if (e.code === 'KeyQ' || e.code === 'KeyE') {
        if (e.code === 'KeyQ') qDown = true;
        else eDown = true;
        syncKbHopHold();
        if (e.repeat) return;
        actions.hop = true;
        return;
      }
      if (e.repeat) return;
      if (e.code === 'Digit0' || e.code === 'Numpad0') {
        actions.toggleScale = true;
      } else if (e.code === 'Escape') {
        actions.restart = true;
      }
      return;
    }

    setKey(e.code, true);
    if (
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'KeyW' ||
      e.code === 'KeyA' ||
      e.code === 'KeyS' ||
      e.code === 'KeyD'
    ) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyQ') {
      qDown = false;
      syncKbHopHold();
      return;
    }
    if (e.code === 'KeyE') {
      eDown = false;
      syncKbHopHold();
      return;
    }
    setKey(e.code, false);
  });

  window.addEventListener('gamepadconnected', (e) => {
    if (!loggedPadConnect) {
      loggedPadConnect = true;
      console.log(
        `[kart] Gamepad connected: ${e.gamepad.id} (index ${e.gamepad.index})`,
      );
    }
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    console.log(
      `[kart] Gamepad disconnected: ${e.gamepad.id} (index ${e.gamepad.index})`,
    );
  });
}

/** Merged keyboard OR gamepad continuous state (pad never clears keys). */
export function getInput(): Readonly<InputState> {
  return {
    accel: kb.accel || gp.accel,
    brake: kb.brake || gp.brake,
    left: kb.left || gp.left,
    right: kb.right || gp.right,
    hopHold: kb.hopHold || gp.hopHold,
  };
}

/** Return pending one-shot actions and clear them for the next frame. */
export function consumeActions(): InputActions {
  const result = {
    toggleScale: actions.toggleScale,
    restart: actions.restart,
    hop: actions.hop,
  };
  actions.toggleScale = false;
  actions.restart = false;
  actions.hop = false;
  return result;
}
