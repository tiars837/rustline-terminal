// RUSTLINE TERMINAL — bots. Seven of them: three RUSTLINE allies who hold
// the sites with the player, and four VOLTAGE attackers who route down the
// lanes, one carrying the bomb. A bot perceives with a 2D line of sight,
// reacts after a delay, fires in bursts with a hit chance that falls with
// distance and target movement, holds ground, and plants or defuses.
import * as THREE from 'three';
import { PALETTE, TEAM } from './palette.js';
import { WAYPOINTS, LANES, collideCircle, hasLineOfSight, insideSite, MAP } from './map.js';
import { pick } from './rng.js';

const BOT_SPEED = 3.4;
const BOT_RADIUS = 0.45;
const EYE = 1.45;
const SEE_RANGE = 42;
const FOV = 1.9; // radians of total forward cone

function buildMesh(team) {
  const color = team === TEAM.RUST ? PALETTE.rustTeam : PALETTE.voltTeam;
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.8 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.72, 4, 10), suit);
  body.position.y = 0.95;
  body.castShadow = true;
  body.userData.part = 'body';
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
  head.position.y = 1.52;
  head.castShadow = true;
  head.userData.part = 'head';
  group.add(head);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.12), accent);
  visor.position.set(0, 1.54, 0.2);
  group.add(visor);

  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.3), accent);
  padL.position.set(-0.38, 1.32, 0);
  group.add(padL);
  const padR = padL.clone();
  padR.position.x = 0.38;
  group.add(padR);

  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.72), new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.5, metalness: 0.5 }));
  gun.position.set(0.22, 1.15, 0.35);
  group.add(gun);

  return { group, body, head, gun };
}

export function createBots(scene, colliders, random) {
  const bots = [];
  const tmp = { x: 0, z: 0 };

  function spawn(team, name, x, z, yaw) {
    const mesh = buildMesh(team);
    mesh.group.position.set(x, 0, z);
    mesh.group.rotation.y = yaw;
    scene.add(mesh.group);
    const bot = {
      team, name, mesh, yaw,
      hp: 100, alive: true,
      state: 'advance', // advance | hold | engage | plant | defuse | dead
      route: [], wp: 0,
      holdTime: 0, senseTimer: random() * 0.2,
      reaction: 0, burstLeft: 0, burstTimer: 0,
      target: null, channel: 0, channelNeed: 0,
      strafeDir: 1, strafeTimer: 0,
      scanYaw: yaw,
    };
    mesh.body.userData.bot = bot;
    mesh.head.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  function reset(round) {
    for (const bot of bots) {
      bot.hp = 100;
      bot.alive = true;
      bot.channel = 0;
      bot.target = null;
      bot.burstLeft = 0;
      bot.mesh.group.rotation.set(0, bot.yaw, 0);
      bot.mesh.group.visible = true;
    }
    // Attackers take the lanes; one carries the bomb.
    const lanes = ['top', 'mid', 'bottom', 'midB'];
    const attackers = bots.filter((b) => b.team === TEAM.VOLT);
    attackers.forEach((bot, i) => {
      const lane = LANES[lanes[i % lanes.length]];
      bot.route = lane.map((key) => WAYPOINTS[key]);
      bot.wp = 0;
      bot.state = 'advance';
      bot.mesh.group.position.set(MAP.spawnVolt.x, 0, MAP.spawnVolt.z + (i - 1.5) * 2.4);
      bot.yaw = Math.PI / 2;
      bot.carrier = i === 0;
    });
    // Defenders hold the sites and the top cross lane (never mid, so the
    // attack lane stays open for the player).
    const defenders = bots.filter((b) => b.team === TEAM.RUST);
    const holds = [WAYPOINTS.siteA, WAYPOINTS.siteB, WAYPOINTS.crossTop];
    defenders.forEach((bot, i) => {
      bot.route = [holds[i % holds.length]];
      bot.wp = 0;
      bot.state = 'hold';
      const p = holds[i % holds.length];
      bot.mesh.group.position.set(p.x + (random() - 0.5) * 3, 0, p.z + (random() - 0.5) * 3);
      bot.yaw = -Math.PI / 2;
      bot.holdTime = 0;
    });
  }

  function make() {
    // Three allies, four enemies. Names are original callsigns.
    spawn(TEAM.RUST, 'ASH', 0, 0, 0);
    spawn(TEAM.RUST, 'FLINT', 0, 0, 0);
    spawn(TEAM.RUST, 'EMBER', 0, 0, 0);
    spawn(TEAM.VOLT, 'VOLT-1', 0, 0, 0);
    spawn(TEAM.VOLT, 'VOLT-2', 0, 0, 0);
    spawn(TEAM.VOLT, 'VOLT-3', 0, 0, 0);
    spawn(TEAM.VOLT, 'VOLT-4', 0, 0, 0);
    reset(1);
    return bots;
  }

  function visibleEnemy(bot, ctx) {
    // Candidates: the player (if on the other team and alive) and bots.
    const list = [];
    if (ctx.player.alive && ctx.player.team !== bot.team) {
      list.push({ x: ctx.player.position.x, z: ctx.player.position.z, y: 1.5, speed: ctx.player.moveSpeed, crouched: ctx.player.crouched, ref: 'player' });
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      list.push({ x: other.mesh.group.position.x, z: other.mesh.group.position.z, y: 1.4, speed: 2.5, crouched: false, ref: other });
    }
    let best = null;
    let bestDist = Infinity;
    for (const cand of list) {
      const dx = cand.x - bot.mesh.group.position.x;
      const dz = cand.z - bot.mesh.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SEE_RANGE || dist >= bestDist) continue;
      const angle = Math.atan2(-dx, -dz) - bot.yaw;
      const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
      if (Math.abs(wrapped) > FOV / 2 && dist > 6) continue;
      if (ctx.isSmoked(bot.mesh.group.position.x, bot.mesh.group.position.z)) continue;
      if (ctx.isSmoked(cand.x, cand.z)) continue;
      if (!hasLineOfSight(colliders, bot.mesh.group.position.x, bot.mesh.group.position.z, cand.x, cand.z)) continue;
      best = cand;
      bestDist = dist;
    }
    return best ? { cand: best, dist: bestDist } : null;
  }

  function faceToward(bot, x, z, dt, rate = 6) {
    const want = Math.atan2(-(x - bot.mesh.group.position.x), -(z - bot.mesh.group.position.z));
    let diff = want - bot.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
    bot.mesh.group.rotation.y = bot.yaw;
  }

  function moveToward(bot, x, z, dt, speed) {
    const px = bot.mesh.group.position.x;
    const pz = bot.mesh.group.position.z;
    const dx = x - px;
    const dz = z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const stepLen = Math.min(dist, speed * dt);
    const nx = px + (dx / dist) * stepLen;
    const nz = pz + (dz / dist) * stepLen;
    collideCircle(colliders, nx, nz, BOT_RADIUS, tmp);
    // Separation from other bots.
    for (const other of bots) {
      if (other === bot || !other.alive) continue;
      const ox = tmp.x - other.mesh.group.position.x;
      const oz = tmp.z - other.mesh.group.position.z;
      const od = Math.hypot(ox, oz);
      if (od > 0.01 && od < 1.1) {
        tmp.x += (ox / od) * (1.1 - od) * 0.5;
        tmp.z += (oz / od) * (1.1 - od) * 0.5;
      }
    }
    bot.mesh.group.position.x = tmp.x;
    bot.mesh.group.position.z = tmp.z;
    faceToward(bot, x, z, dt, 8);
    return dist - stepLen < 1.2;
  }

  function damage(bot, amount, ctx) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    bot.channel = 0; // damage interrupts a plant/defuse channel
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.state = 'dead';
      bot.mesh.group.rotation.z = Math.PI / 2;
      bot.mesh.group.position.y = 0.25;
      return true;
    }
    return false;
  }

  function step(dt, ctx) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const pos = bot.mesh.group.position;
      bot.senseTimer -= dt;
      if (bot.senseTimer <= 0) {
        bot.senseTimer = 0.15 + random() * 0.1;
        const seen = visibleEnemy(bot, ctx);
        bot.target = seen;
        if (seen && bot.state !== 'plant' && bot.state !== 'defuse') {
          if (bot.state !== 'engage') bot.reaction = 0.35 + random() * 0.4;
          bot.state = 'engage';
        } else if (!seen && bot.state === 'engage') {
          bot.state = bot.route.length > 1 ? 'advance' : 'hold';
        }
      }

      // Bomb carrier plants when it reaches its site unopposed.
      if (bot.carrier && bot.team === TEAM.VOLT && !ctx.bomb.planted && bot.state !== 'engage') {
        const site = bot.route[bot.route.length - 1];
        if (site && Math.hypot(pos.x - site.x, pos.z - site.z) < 2.5) {
          bot.state = 'plant';
          bot.channelNeed = 4;
        }
      }
      // Defenders defuse a planted bomb.
      if (bot.team === TEAM.RUST && ctx.bomb.planted && bot.state !== 'engage') {
        const d = Math.hypot(pos.x - ctx.bomb.x, pos.z - ctx.bomb.z);
        if (d < 2.2) {
          bot.state = 'defuse';
          bot.channelNeed = 5;
        } else if (bot.state !== 'defuse') {
          bot.route = [{ x: ctx.bomb.x, z: ctx.bomb.z }];
          bot.wp = 0;
          bot.state = 'advance';
        }
      }

      if (bot.state === 'plant' || bot.state === 'defuse') {
        bot.channel += dt;
        if (bot.channel >= bot.channelNeed) {
          const wasPlant = bot.state === 'plant';
          if (wasPlant) ctx.onPlant(bot);
          else ctx.onDefuse(bot);
          bot.channel = 0;
          bot.state = 'hold';
          if (wasPlant) bot.carrier = false;
        }
        continue;
      }

      if (bot.state === 'engage' && bot.target) {
        const t = bot.target.cand;
        faceToward(bot, t.x, t.z, dt, 7);
        // Strafe while engaging.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 0.7 + random() * 0.8;
          bot.strafeDir = random() < 0.5 ? -1 : 1;
        }
        const sideX = Math.cos(bot.yaw) * bot.strafeDir;
        const sideZ = -Math.sin(bot.yaw) * bot.strafeDir;
        collideCircle(colliders, pos.x + sideX * 1.1 * dt, pos.z + sideZ * 1.1 * dt, BOT_RADIUS, tmp);
        pos.x = tmp.x;
        pos.z = tmp.z;
        bot.reaction -= dt;
        if (bot.reaction <= 0) {
          if (bot.burstLeft <= 0) {
            bot.burstLeft = 3;
            bot.burstTimer = 0;
          }
          bot.burstTimer -= dt;
          if (bot.burstLeft > 0 && bot.burstTimer <= 0) {
            bot.burstTimer = 0.13;
            bot.burstLeft -= 1;
            const dist = bot.target.dist;
            let p = 0.55 - dist * 0.008 - t.speed * 0.05 - (t.crouched ? 0.08 : 0);
            p = Math.max(0.08, Math.min(0.6, p));
            const hit = random() < p;
            const from = { x: pos.x, y: 1.35, z: pos.z };
            const to = hit
              ? { x: t.x, y: t.y, z: t.z }
              : { x: t.x + (random() - 0.5) * 2.4, y: t.y + (random() - 0.5) * 1.6, z: t.z + (random() - 0.5) * 2.4 };
            ctx.onBotShot(bot, from, to, hit, t, 26);
          }
        }
        continue;
      }

      if (bot.state === 'advance') {
        const dest = bot.route[bot.wp];
        if (!dest) { bot.state = 'hold'; continue; }
        if (moveToward(bot, dest.x, dest.z, dt, BOT_SPEED)) {
          bot.wp += 1;
          if (bot.wp >= bot.route.length) {
            bot.state = 'hold';
            bot.holdTime = 0;
            bot.scanYaw = bot.yaw;
          }
        }
        continue;
      }

      // Hold: scan the lane slowly.
      bot.holdTime += dt;
      bot.yaw = bot.scanYaw + Math.sin(bot.holdTime * 0.5) * 0.7;
      bot.mesh.group.rotation.y = bot.yaw;
    }
  }

  function aliveCount(team) {
    return bots.filter((b) => b.alive && b.team === team).length;
  }

  function shootables() {
    const list = [];
    for (const bot of bots) {
      if (!bot.alive) continue;
      list.push(bot.mesh.body, bot.mesh.head);
    }
    return list;
  }

  return { bots, make, reset, step, damage, aliveCount, shootables, visibleEnemy };
}
