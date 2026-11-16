// RUSTLINE TERMINAL — rounds and the bomb. One round: a 12 s buy phase, a
// 100 s live round, then the result. Rounds are won by elimination, by the
// bomb exploding, by a defuse, or by the clock (defenders win on time when
// nothing is planted). Money is paid per round and per kill and spent in the
// buy menu; first team to 5 rounds takes the match.
import * as THREE from 'three';
import { MAP, insideSite } from './map.js';
import { TEAM } from './palette.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 35;
export const WIN_ROUNDS = 5;

export function createRounds() {
  const state = {
    phase: 'buy', // buy | live | ended | match
    phaseTime: BUY_SECONDS,
    round: 1,
    score: { [TEAM.RUST]: 0, [TEAM.VOLT]: 0 },
    money: 800,
    kills: 0,
    winReason: '',
    winTeam: null,
    bomb: { planted: false, site: null, x: 0, z: 0, timer: 0, beepTimer: 0 },
    plant: { active: false, by: null, progress: 0, need: 4 },
    matchWinner: null,
  };
  let bombMesh = null;

  function setBombMesh(scene) {
    bombMesh = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.3, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.5, metalness: 0.4 }),
    );
    box.position.y = 0.15;
    bombMesh.add(box);
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    );
    light.position.set(0, 0.36, 0);
    light.name = 'bombLight';
    bombMesh.add(light);
    bombMesh.visible = false;
    scene.add(bombMesh);
  }

  function startBuy() {
    state.phase = 'buy';
    state.phaseTime = BUY_SECONDS;
    state.bomb = { planted: false, site: null, x: 0, z: 0, timer: 0, beepTimer: 0 };
    state.plant = { active: false, by: null, progress: 0, need: 4 };
    if (bombMesh) bombMesh.visible = false;
  }

  function startLive() {
    state.phase = 'live';
    state.phaseTime = ROUND_SECONDS;
  }

  function endRound(winner, reason, ctx) {
    if (state.phase === 'ended' || state.phase === 'match') return;
    state.phase = 'ended';
    state.phaseTime = 4;
    state.winTeam = winner;
    state.winReason = reason;
    state.score[winner] += 1;
    state.money += winner === TEAM.RUST ? 325 : 150;
    if (ctx) ctx.onRoundEnd(winner, reason);
    if (state.score[winner] >= WIN_ROUNDS) {
      state.matchWinner = winner;
    }
  }

  function plantBomb(site, x, z, ctx) {
    state.bomb = { planted: true, site, x, z, timer: BOMB_SECONDS, beepTimer: 0 };
    state.plant = { active: false, by: null, progress: 0, need: 4 };
    if (bombMesh) {
      bombMesh.position.set(x, 0, z);
      bombMesh.visible = true;
    }
    if (ctx) ctx.onPlantDone(site);
  }

  function defuseBomb(ctx) {
    state.bomb.planted = false;
    if (bombMesh) bombMesh.visible = false;
    endRound(TEAM.RUST, 'Bomb defused', ctx);
  }

  // The player plants with E: hold near a site for 4 s.
  function playerPlant(dt, playerPos, keys, ctx) {
    if (state.phase !== 'live' || state.bomb.planted) {
      state.plant = { active: false, by: null, progress: 0, need: 4 };
      return;
    }
    const site = insideSite(MAP.siteA, playerPos.x, playerPos.z) ? MAP.siteA
      : insideSite(MAP.siteB, playerPos.x, playerPos.z) ? MAP.siteB : null;
    if (!site || !keys.has('KeyE')) {
      state.plant = { active: false, by: null, progress: 0, need: 4 };
      return;
    }
    state.plant = { active: true, by: 'player', progress: state.plant.progress + dt, need: 4 };
    if (state.plant.progress >= 4) {
      plantBomb(site === MAP.siteA ? 'A' : 'B', playerPos.x, playerPos.z, ctx);
    }
  }

  function step(dt, ctx) {
    if (state.phase === 'buy') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) startLive();
      return;
    }
    if (state.phase === 'live') {
      state.phaseTime -= dt;
      playerPlant(dt, ctx.playerPos, ctx.keys, ctx);
      if (state.bomb.planted) {
        state.bomb.timer -= dt;
        state.bomb.beepTimer -= dt;
        if (state.bomb.beepTimer <= 0) {
          state.bomb.beepTimer = Math.max(0.25, state.bomb.timer / BOMB_SECONDS);
          if (ctx) ctx.onBombBeep();
        }
        if (bombMesh) {
          const light = bombMesh.getObjectByName('bombLight');
          if (light) light.material.color.setHex(state.bomb.beepTimer < 0.15 ? 0xff2a2a : 0x551111);
        }
        if (state.bomb.timer <= 0) {
          if (ctx) ctx.onExplode();
          endRound(TEAM.VOLT, 'Bomb detonated', ctx);
        }
      } else if (state.phaseTime <= 0) {
        endRound(TEAM.RUST, 'Time expired — site held', ctx);
      }
      return;
    }
    if (state.phase === 'ended') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) {
        if (state.matchWinner) {
          state.phase = 'match';
        } else {
          state.round += 1;
          if (ctx) ctx.onNextRound(state.round);
          startBuy();
        }
      }
    }
  }

  function awardKill() {
    state.kills += 1;
    state.money += 300;
  }

  return {
    state, setBombMesh, startBuy, startLive, endRound, plantBomb, defuseBomb,
    playerPlant, step, awardKill,
  };
}
