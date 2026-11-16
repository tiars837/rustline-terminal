// RUSTLINE TERMINAL — the player: acceleration movement, crouch, jump,
// AABB collision, health and recoil. One state object, stepped at 60 Hz.
import * as THREE from 'three';
import { collideCircle, MAP } from './map.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.05;
const RADIUS = 0.45;
const WALK_SPEED = 4.6;
const CROUCH_SPEED = 2.2;
const ACCEL = 42;
const FRICTION = 10;
const JUMP_SPEED = 5.4;
const GRAVITY = 14;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(MAP.spawnRust.x, 0, MAP.spawnRust.z),
    velocity: new THREE.Vector3(),
    yaw: -Math.PI / 2, // facing east, down mid lane toward the sites
    pitch: 0,
    eye: EYE_STAND,
    crouched: false,
    onGround: true,
    health: 100,
    alive: true,
    recoilPitch: 0,
    recoilYaw: 0,
    moveSpeed: 0, // horizontal speed, for spread and bot hearing
  };
  const tmp = { x: 0, z: 0 };

  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch -= dy * 0.0021;
    state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch));
  }

  function recoil(pitchKick, yawKick) {
    state.recoilPitch += pitchKick;
    state.recoilYaw += yawKick;
  }

  function step(dt, keys) {
    if (!state.alive) return;
    // Recoil recovers toward zero.
    state.recoilPitch *= Math.pow(0.0015, dt);
    state.recoilYaw *= Math.pow(0.0015, dt);

    state.crouched = keys.has('ControlLeft') || keys.has('KeyC');
    const targetEye = state.crouched ? EYE_CROUCH : EYE_STAND;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    // Forward is -Z rotated by yaw; strafe is perpendicular.
    let wx = -sin * forward + cos * strafe;
    let wz = -cos * forward - sin * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    const speed = state.crouched ? CROUCH_SPEED : WALK_SPEED;
    state.velocity.x += wx * ACCEL * dt;
    state.velocity.z += wz * ACCEL * dt;
    // Friction when no input, and a hard cap on horizontal speed.
    const damp = Math.exp(-FRICTION * dt);
    if (len === 0) {
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }
    const hs = Math.hypot(state.velocity.x, state.velocity.z);
    if (hs > speed) {
      state.velocity.x = (state.velocity.x / hs) * speed;
      state.velocity.z = (state.velocity.z / hs) * speed;
    }
    state.moveSpeed = Math.hypot(state.velocity.x, state.velocity.z);

    if ((keys.has('Space')) && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;
    state.position.y += state.velocity.y * dt;
    if (state.position.y <= 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    }

    collideCircle(colliders, state.position.x + state.velocity.x * dt, state.position.z + state.velocity.z * dt, RADIUS, tmp);
    state.position.x = tmp.x;
    state.position.z = tmp.z;
  }

  function reset() {
    state.position.set(MAP.spawnRust.x, 0, MAP.spawnRust.z);
    state.velocity.set(0, 0, 0);
    state.yaw = -Math.PI / 2;
    state.pitch = 0;
    state.health = 100;
    state.alive = true;
    state.eye = EYE_STAND;
  }

  function damage(amount) {
    if (!state.alive) return false;
    state.health -= amount;
    if (state.health <= 0) {
      state.health = 0;
      state.alive = false;
      return true;
    }
    return false;
  }

  return { state, look, recoil, step, reset, damage };
}
