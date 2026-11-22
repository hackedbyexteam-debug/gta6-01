// Keyboard and pointer input. Held keys give a movement direction; one-shot
// presses (enter a car, reload, pause) are consumed once per keydown.
export const ACTION = {
  UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, SPRINT: 16, SHOOT: 32, ENTER: 64,
  RELOAD: 128, PAUSE: 256, PHONE: 512, CONFIRM: 1024, MUSIC: 2048,
};

const KEYMAP = {
  KeyW: ACTION.UP, ArrowUp: ACTION.UP,
  KeyS: ACTION.DOWN, ArrowDown: ACTION.DOWN,
  KeyA: ACTION.LEFT, ArrowLeft: ACTION.LEFT,
  KeyD: ACTION.RIGHT, ArrowRight: ACTION.RIGHT,
  ShiftLeft: ACTION.SPRINT, ShiftRight: ACTION.SPRINT,
  KeyE: ACTION.ENTER,
  KeyR: ACTION.RELOAD,
  Escape: ACTION.PAUSE, KeyP: ACTION.PAUSE,
  Tab: ACTION.PHONE,
  Enter: ACTION.CONFIRM, Space: ACTION.CONFIRM,
  KeyM: ACTION.MUSIC,
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  let anyKey = false;

  function onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (action !== undefined) {
      if (!held.has(action)) pressed.add(action);
      held.add(action);
      anyKey = true;
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action !== undefined) held.delete(action);
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  }
  function onMouseDown(e) {
    onMouseMove(e);
    mouse.down = true;
    mouse.clicked = true;
    anyKey = true;
  }
  function onMouseUp() {
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    mouse,
    held(action) {
      return held.has(action);
    },
    pressed(action) {
      return pressed.has(action);
    },
    anyKey() {
      const v = anyKey;
      anyKey = false;
      return v;
    },
    // One-shot presses are consumed at the end of each frame.
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}
