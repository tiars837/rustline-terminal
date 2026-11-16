// RUSTLINE TERMINAL — input: keyboard state, pointer-lock mouse look,
// firing, and the action keys the game reads once per step.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, firing: false, lookX: 0, lookY: 0 };
  let locked = false;

  function requestLock() {
    canvas.requestPointerLock();
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseDown(event) {
    if (event.button === 0) state.firing = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
  }
  function onMouseMove(event) {
    if (!locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  }
  function onLock() {
    locked = document.pointerLockElement === canvas;
    onLockChange(locked);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onLock);

  // One-shot action keys: consumed by the game loop each step.
  function takeLook() {
    const look = { x: state.lookX, y: state.lookY };
    state.lookX = 0;
    state.lookY = 0;
    return look;
  }

  return { state, requestLock, takeLook, isLocked: () => locked };
}
