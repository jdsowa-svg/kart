/** Keyboard input state for kart controls (Arrow keys + WASD + Q/E hop/hold). */

export interface InputState {
  accel: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  /** True while KeyQ or KeyE is held (SMK L/R shoulder hold). */
  hopHold: boolean;
}

export interface InputActions {
  toggleScale: boolean;
  restart: boolean;
  /** One-shot hop on Q/E keydown edge (like SMK L/R press). */
  hop: boolean;
}

const state: InputState = {
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

function syncHopHold(): void {
  state.hopHold = qDown || eDown;
}

function setKey(code: string, down: boolean): void {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      state.accel = down;
      break;
    case 'ArrowDown':
    case 'KeyS':
      state.brake = down;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      state.left = down;
      break;
    case 'ArrowRight':
    case 'KeyD':
      state.right = down;
      break;
  }
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
        syncHopHold();
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
      syncHopHold();
      return;
    }
    if (e.code === 'KeyE') {
      eDown = false;
      syncHopHold();
      return;
    }
    setKey(e.code, false);
  });
}

export function getInput(): Readonly<InputState> {
  return state;
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
