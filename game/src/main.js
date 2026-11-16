// RUSTLINE TERMINAL — boot and the one loop. A fixed 60 Hz simulation
// feeds rendering at the display rate; rendering never feeds the sim.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for
// a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE, TEAM } from './palette.js';
import { mulberry32 } from './rng.js';
import { createMap, MAP } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GRENADE } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds, BUY_SECONDS } from './rounds.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

window.__shotReady = false;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 38, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

// Dusk light: a low warm sun with shadows, plus a cool hemisphere fill.
const hemi = new THREE.HemisphereLight(0x9fb4d8, 0x3a322a, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb37a, 3.0);
sun.position.set(-28, 26, -18);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -38;
sun.shadow.camera.right = 38;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.far = 90;
scene.add(sun);

const world = createMap(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders);
const weapon = createWeapon();
const bots = createBots(scene, world.colliders, random);
bots.make(); // spawn 3 RUSTLINE allies and 4 VOLTAGE attackers
const rounds = createRounds();
rounds.setBombMesh(scene);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const shootDirection = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

// First-person gun viewmodel: a dark carbine shape riding the camera.
const viewmodel = new THREE.Group();
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.45, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), metal);
  viewmodel.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.4);
  viewmodel.add(barrel);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.08), metal);
  sight.position.set(0, 0.1, -0.1);
  viewmodel.add(sight);
  viewmodel.position.set(0.28, -0.24, -0.5);
  camera.add(viewmodel);
}
let viewKick = 0;

const grenades = []; // { pos: Vector3, vel: Vector3, fuse: number }
let frozen = false;
let started = false;
let matchShown = false;
let accumulator = 0;
let lastTime = performance.now();
let elapsed = 0;
let prevKeys = new Set();
let buyOpen = false;

const body = player.state;
const roundsState = rounds.state;

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + body.recoilPitch, body.yaw + body.recoilYaw, 0, 'YXZ');
  viewmodel.position.z = -0.5 + viewKick;
  viewKick *= 0.86;
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function checkElimination() {
  if (roundsState.phase !== 'live') return;
  if (bots.aliveCount(TEAM.VOLT) === 0) {
    rounds.endRound(TEAM.RUST, 'Squad eliminated', roundCtx);
  } else if (!body.alive && bots.aliveCount(TEAM.RUST) === 0) {
    rounds.endRound(TEAM.VOLT, 'Squad eliminated', roundCtx);
  }
}

function shoot(spread) {
  const def = weapon.state.current;
  if (!weapon.takeRound(elapsed)) {
    if (weapon.state.mag === 0) audio.dryFire();
    return false;
  }
  audio.shot(def.kind);
  viewKick = 0.07;
  camera.getWorldDirection(shootDirection);
  muzzlePos.copy(camera.position).addScaledVector(shootDirection, 0.6);
  muzzlePos.y -= 0.12;
  effects.muzzle(muzzlePos, body.yaw, body.pitch);
  const pellets = def.pellets ?? 1;
  let anyHit = false;
  let anyKill = false;
  for (let p = 0; p < pellets; p += 1) {
    const dir = shootDirection.clone();
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, dir);
    // The player's fire never hits their own team.
    const targets = world.shootables.concat(
      bots.shootables().filter((mesh) => mesh.userData.bot.team === TEAM.VOLT),
    );
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) continue;
    const end = hit.point.clone();
    effects.tracer(muzzlePos, end, def.tracer);
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const head = hit.object.userData.part === 'head';
      const killed = bots.damage(bot, head ? def.headDamage : def.damage, null);
      hud.hitMarker(killed);
      audio.hit();
      if (killed) {
        audio.kill();
        rounds.awardKill();
        hud.feed(`You ▸ ${bot.name}${head ? ' (headshot)' : ''}  +$300`);
        hud.setMoney(roundsState.money);
        anyKill = true;
      }
      anyHit = true;
    } else {
      effects.sparks(hit.point, random);
    }
  }
  if (!anyHit) effects.tracer(muzzlePos, camera.position.clone().addScaledVector(shootDirection, 40), def.tracer);
  player.recoil(def.recoil * (0.9 + random() * 0.3), (random() * 2 - 1) * def.recoil * 0.4);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setWeapon(def.name, weapon.state.grenades);
  if (anyKill) checkElimination();
  return true;
}

function throwGrenade() {
  if (weapon.state.grenades <= 0 || roundsState.phase !== 'live') return;
  weapon.state.grenades -= 1;
  hud.setWeapon(weapon.state.current.name, weapon.state.grenades);
  camera.getWorldDirection(tmpVec);
  grenades.push({
    pos: camera.position.clone(),
    vel: tmpVec.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: 1.4,
  });
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.vel.y -= 9.8 * dt;
    g.pos.addScaledVector(g.vel, dt);
    g.fuse -= dt;
    if (g.pos.y <= 0.1 || g.fuse <= 0) {
      g.pos.y = Math.max(0.1, g.pos.y);
      effects.smoke(g.pos, 6);
      grenades.splice(i, 1);
    }
  }
}

function onBotShot(bot, from, to, hit, target, dmg) {
  effects.tracer(from, to, 0xff9a7a);
  const dist = Math.hypot(from.x - camera.position.x, from.z - camera.position.z);
  audio.enemyShot(dist);
  if (!hit) return;
  if (target.ref === 'player') {
    const died = player.damage(dmg);
    hud.setHealth(body.health);
    hud.damageFlash();
    audio.hurt();
    if (died) {
      hud.feed(`${bot.name} ▸ You`);
      checkElimination();
    }
  } else if (target.ref && target.ref.alive) {
    const died = bots.damage(target.ref, dmg, null);
    if (died) {
      hud.feed(`${bot.name} ▸ ${target.ref.name}`);
      checkElimination();
    }
  }
}

const roundCtx = {
  get playerPos() { return body.position; },
  get keys() { return input.state.keys; },
  onRoundEnd(winner, reason) {
    const won = winner === TEAM.RUST;
    hud.showOverlay('round', {
      won, reason,
      scoreRust: roundsState.score[TEAM.RUST],
      scoreVolt: roundsState.score[TEAM.VOLT],
    });
    hud.setScore(roundsState.score[TEAM.RUST], roundsState.score[TEAM.VOLT]);
    hud.setMoney(roundsState.money);
    if (document.pointerLockElement) document.exitPointerLock();
    if (won) audio.roundWon();
    else audio.roundLost();
  },
  onNextRound(round) {
    matchShown = false;
    bots.reset(round);
    player.reset();
    weapon.refill();
    hud.setHealth(100);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve);
    hud.setWeapon(weapon.state.current.name, weapon.state.grenades);
    hud.setScore(roundsState.score[TEAM.RUST], roundsState.score[TEAM.VOLT]);
    hud.setMoney(roundsState.money);
    hud.setBomb(false, 0, '');
    hud.hideOverlay();
    buyOpen = false;
    hud.showBuy(false);
  },
  onPlantDone(site) {
    hud.feed(`Bomb planted at Site ${site}`);
    hud.setBomb(true, roundsState.bomb.timer, site);
    audio.plant();
  },
  onExplode() {
    audio.explosion();
    hud.damageFlash();
  },
  onBombBeep() {
    audio.beep();
  },
};

const botCtx = {
  colliders: world.colliders,
  get player() {
    return { ...body, team: TEAM.RUST, position: body.position, moveSpeed: body.moveSpeed, crouched: body.crouched, alive: body.alive };
  },
  get bomb() { return roundsState.bomb; },
  isSmoked: (x, z) => effects.isSmoked(x, z),
  onBotShot,
  onPlant(bot) {
    const site = bot.route[bot.route.length - 1];
    const name = Math.abs(site.x - MAP.siteA.x) < 1 && Math.abs(site.z - MAP.siteA.z) < 1 ? 'A' : 'B';
    rounds.plantBomb(name, site.x, site.z, roundCtx);
  },
  onDefuse(bot) {
    hud.feed(`${bot.name} defused the bomb`);
    rounds.defuseBomb(roundCtx);
  },
};

function handleEdges() {
  const keys = input.state.keys;
  const pressed = (code) => keys.has(code) && !prevKeys.has(code);
  if (pressed('KeyR')) {
    if (weapon.reload()) audio.reload();
  }
  if (roundsState.phase === 'buy') {
    if (pressed('Digit1') || pressed('Digit2') || pressed('Digit3')) {
      const id = pressed('Digit1') ? 'carbine' : pressed('Digit2') ? 'breacher' : 'sidearm';
      if (weapon.state.owned[id]) {
        weapon.equip(id);
      } else {
        const before = roundsState.money;
        roundsState.money = weapon.buy(id, roundsState.money);
        if (roundsState.money < before) {
          weapon.equip(id);
          hud.feed(`Bought ${WEAPONS[id].name}  −$${before - roundsState.money}`);
          hud.setMoney(roundsState.money);
        }
      }
      hud.setAmmo(weapon.state.mag, weapon.state.reserve);
      hud.setWeapon(weapon.state.current.name, weapon.state.grenades);
    }
    if (pressed('KeyG')) {
      const before = roundsState.money;
      roundsState.money = weapon.buyGrenade(roundsState.money);
      if (roundsState.money < before) {
        hud.feed(`Bought ${GRENADE.name}  −$${before - roundsState.money}`);
        hud.setMoney(roundsState.money);
        hud.setWeapon(weapon.state.current.name, weapon.state.grenades);
      }
    }
  } else if (pressed('KeyG')) {
    throwGrenade();
  }
  if (pressed('KeyB') && roundsState.phase === 'buy') {
    buyOpen = !buyOpen;
    hud.showBuy(buyOpen);
  }
  if (pressed('Digit1') || pressed('Digit2') || pressed('Digit3')) {
    const id = pressed('Digit1') ? 'carbine' : pressed('Digit2') ? 'breacher' : 'sidearm';
    if (weapon.state.owned[id]) {
      weapon.equip(id);
      hud.setAmmo(weapon.state.mag, weapon.state.reserve);
      hud.setWeapon(weapon.state.current.name, weapon.state.grenades);
    }
  }
  prevKeys = new Set(keys);
}

function step(dt) {
  elapsed += dt;
  if (roundsState.phase === 'match') {
    if (!matchShown) {
      matchShown = true;
      hud.showOverlay('match', {
        won: roundsState.matchWinner === TEAM.RUST,
        scoreRust: roundsState.score[TEAM.RUST],
        scoreVolt: roundsState.score[TEAM.VOLT],
      });
    }
    return;
  }
  handleEdges();
  const look = input.takeLook();
  player.look(look.x, look.y);
  if (roundsState.phase !== 'buy') {
    player.step(dt, input.state.keys);
  }
  weapon.step(dt);
  if (input.state.firing && weapon.ready() && roundsState.phase === 'live') {
    shoot(shot ? 0 : weapon.spread(body.moveSpeed));
  }
  // Everyone freezes during the buy phase and after a round ends.
  if (roundsState.phase === 'live') {
    bots.step(dt, botCtx);
    stepGrenades(dt);
  }
  rounds.step(dt, roundCtx);
  effects.step(dt);
  // HUD, every step: cheap DOM writes only when values change are ideal;
  // these are small and the loop is 60 Hz, so update the live readouts.
  hud.setTimer(roundsState.phaseTime, roundsState.phase);
  hud.setBomb(roundsState.bomb.planted, roundsState.bomb.timer, roundsState.bomb.site);
  hud.setPlant(roundsState.plant.active, roundsState.plant.progress);
  hud.setSpread(weapon.spread(body.moveSpeed));
  hud.setHealth(body.health);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
    hud.showBuy(false);
    buyOpen = false;
  } else if (roundsState.phase === 'match') {
    hud.showOverlay('match', {
      won: roundsState.matchWinner === TEAM.RUST,
      scoreRust: roundsState.score[TEAM.RUST],
      scoreVolt: roundsState.score[TEAM.VOLT],
    });
  } else if (roundsState.phase === 'ended') {
    // Round overlay stays up.
  } else {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (roundsState.phase === 'match') {
    // Restart the match from scratch.
    roundsState.score[TEAM.RUST] = 0;
    roundsState.score[TEAM.VOLT] = 0;
    roundsState.round = 1;
    roundsState.money = 800;
    roundsState.matchWinner = null;
    roundCtx.onNextRound(1);
    rounds.startBuy();
  }
  input.requestLock();
});

hud.setAmmo(weapon.state.mag, weapon.state.reserve);
hud.setWeapon(weapon.state.current.name, weapon.state.grenades);
hud.setHealth(100);
hud.setScore(0, 0);
hud.setMoney(roundsState.money);
hud.setTimer(BUY_SECONDS, 'buy');
hud.showBuy(false);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  if (name === 'start') {
    body.position.set(-26, 0, 6);
    body.yaw = -Math.PI / 2 + 0.35;
    body.pitch = 0.02;
    settle(30);
    hud.showOverlay('start');
    hud.setTimer(BUY_SECONDS, 'buy');
  } else if (name === 'buy') {
    roundsState.money = 800;
    hud.setMoney(800);
    buyOpen = true;
    hud.showBuy(true);
    body.position.set(-26, 0, 2);
    body.yaw = -Math.PI / 2;
    settle(30);
  } else if (name === 'play') {
    // Skip the buy phase, grant the rifle, and stage a mid-lane duel:
    // the player at (-10, 0) and the first VOLTAGE bot held at (10, -2),
    // a clear sightline down mid. Fire three aimed headshots.
    rounds.startLive();
    roundsState.money = 2700;
    weapon.buy('carbine', 5000);
    weapon.equip('carbine');
    body.position.set(-10, 0, 0);
    settle(20);
    const enemies = bots.bots.filter((b) => b.team === TEAM.VOLT && b.alive);
    const target = enemies[0];
    if (target) {
      target.mesh.group.position.set(10, 0, -2);
      target.state = 'hold';
      target.scanYaw = Math.PI / 2;
      for (let i = 0; i < 3; i += 1) {
        const head = { x: target.mesh.group.position.x, y: 1.52, z: target.mesh.group.position.z };
        aimAt(head);
        shoot(0);
        settle(8);
      }
    }
    settle(12);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve);
    hud.setWeapon(weapon.state.current.name, weapon.state.grenades);
    hud.setMoney(roundsState.money);
  } else if (name === 'end') {
    rounds.endRound(TEAM.RUST, 'Squad eliminated', roundCtx);
    settle(10);
    hud.setScore(1, 0);
  }
  hud.setScore(roundsState.score[TEAM.RUST], roundsState.score[TEAM.VOLT]);
  paintTwiceThenReady();
}

if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
