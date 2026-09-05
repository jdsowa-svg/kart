/** Keyboard input state for kart controls (Arrow keys + WASD). */

export interface InputState {
  accel: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
}

const state: InputState = {
  accel: false,
  brake: false,
  left: false,
  right: false,
};

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
    setKey(e.code, false);
  });
}

export function getInput(): Readonly<InputState> {
  return state;
}
