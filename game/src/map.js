// RUSTLINE TERMINAL — the map. An original dusk container terminal:
// a 64 x 44 yard with three lanes (top, mid, bottom), two cross lanes,
// two bomb sites on the defenders' east side, and cover made of shipping
// containers, crates and barrels. Nothing here copies a real map.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';

export const MAP = {
  halfX: 32,
  halfZ: 22,
  wallH: 5,
  siteA: { x: 21, z: -14, r: 4.5 },
  siteB: { x: 21, z: 14, r: 4.5 },
  spawnRust: { x: -28, z: 0 },
  spawnVolt: { x: 28, z: 0 },
};

// Waypoint graph bots route through: lanes and cross lanes.
export const WAYPOINTS = {
  rustSpawn: { x: -28, z: 0 },
  topWest: { x: -24, z: -16 },
  topMid: { x: 0, z: -16 },
  topEast: { x: 24, z: -16 },
  midWest: { x: -16, z: 0 },
  mid: { x: 0, z: 0 },
  midEast: { x: 16, z: 0 },
  botWest: { x: -24, z: 16 },
  botMid: { x: 0, z: 16 },
  botEast: { x: 24, z: 16 },
  crossTop: { x: -8, z: -8 },
  crossBot: { x: 8, z: 8 },
  siteA: { x: 21, z: -14 },
  siteB: { x: 21, z: 14 },
  siteAApproach: { x: 10, z: -14 },
  siteBApproach: { x: 10, z: 14 },
  voltSpawn: { x: 28, z: 0 },
};

export const LANES = {
  top: ['rustSpawn', 'topWest', 'topMid', 'topEast', 'siteAApproach', 'siteA'],
  mid: ['rustSpawn', 'midWest', 'mid', 'midEast', 'siteAApproach', 'siteA'],
  bottom: ['rustSpawn', 'botWest', 'botMid', 'botEast', 'siteBApproach', 'siteB'],
  midB: ['rustSpawn', 'midWest', 'crossBot', 'botEast', 'siteBApproach', 'siteB'],
};

// A painted ground texture, drawn once on a canvas: asphalt noise, yard
// lane lines, hazard chevrons at the sites and big A / B letters.
function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 704;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4b4f56';
  ctx.fillRect(0, 0, 1024, 704);
  // Asphalt speckle, from a fixed seed so captures are reproducible.
  const speckle = mulberry32(7);
  for (let i = 0; i < 9000; i += 1) {
    const v = 66 + Math.floor(speckle() * 26);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    ctx.fillRect(speckle() * 1024, speckle() * 704, 2, 2);
  }
  const toPx = (x, z) => [((x + 32) / 64) * 1024, ((z + 22) / 44) * 704];
  // Lane dashes down the three lanes.
  ctx.strokeStyle = '#8a8f96';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  for (const z of [-16, 0, 16]) {
    const [, y] = toPx(0, z);
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(992, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Site decals: a ring, chevrons and a big letter.
  for (const [site, color, letter] of [
    [MAP.siteA, '#f0a830', 'A'],
    [MAP.siteB, '#35c4b5', 'B'],
  ]) {
    const [cx, cy] = toPx(site.x, site.z);
    const r = (site.r / 64) * 1024;
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, cx, cy);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function containerTexture(label, base) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < 256; x += 16) ctx.fillRect(x, 0, 3, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 128, 74);
  ctx.fillStyle = '#f0a830';
  ctx.fillRect(0, 108, 256, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMap(scene) {
  const colliders = [];
  const shootables = [];
  const group = new THREE.Group();
  scene.add(group);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 44),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0.05 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  shootables.push(ground);

  // Perimeter walls.
  const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.9 });
  const wallTopMat = new THREE.MeshStandardMaterial({ color: PALETTE.wallTop, roughness: 0.8 });
  const addWall = (x, z, w, d) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, MAP.wallH, d), wallMat);
    wall.position.set(x, MAP.wallH / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
    shootables.push(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.25, d + 0.2), wallTopMat);
    cap.position.set(x, MAP.wallH + 0.12, z);
    group.add(cap);
    colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, top: MAP.wallH });
  };
  addWall(0, -22.5, 66, 1);
  addWall(0, 22.5, 66, 1);
  addWall(-32.5, 0, 1, 46);
  addWall(32.5, 0, 1, 46);

  // Distant skyline silhouettes outside the walls, for the dusk read.
  const skyMat = new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 1 });
  for (const [x, z, w, h, d] of [
    [-40, -34, 14, 16, 8], [8, -36, 10, 11, 8], [40, -34, 12, 19, 8],
    [-38, 34, 12, 12, 8], [14, 36, 16, 17, 8], [42, 34, 10, 9, 8],
  ]) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skyMat);
    block.position.set(x, h / 2, z);
    group.add(block);
  }
  // A crane silhouette over the east end.
  const craneMat = new THREE.MeshStandardMaterial({ color: 0x232936, roughness: 1 });
  const craneLeg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 1.2), craneMat);
  craneLeg.position.set(30, 7, -18);
  group.add(craneLeg);
  const craneArm = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 1), craneMat);
  craneArm.position.set(22, 13.5, -18);
  group.add(craneArm);

  // Containers, crates and barrels: [x, z, w, d, h, kind, label/color].
  const props = [
    [-24, -16, 8, 2.6, 2.6, 'box', 'RUSTLINE'],
    [-8, -16, 6, 2.6, 2.6, 'box', 'VOLTAGE'],
    [8, -16, 8, 2.6, 2.6, 'box', 'RUSTLINE'],
    [22, -16, 6, 2.6, 2.6, 'box', '07'],
    [-22, 16, 8, 2.6, 2.6, 'box', 'VOLTAGE'],
    [-4, 16, 6, 2.6, 2.6, 'box', 'RUSTLINE'],
    [14, 16, 8, 2.6, 2.6, 'box', '09'],
    [-16, 0, 2.2, 2.2, 2.2, 'crate', null],
    [-16, -2.4, 2.2, 2.2, 1.1, 'crate', null],
    [0, -4, 3, 2, 2.2, 'crate', null],
    [12, 2, 2.2, 2.2, 2.2, 'crate', null],
    [-2, 6, 2.2, 2.2, 1.1, 'crate', null],
    [24, -8, 2.2, 2.2, 2.2, 'crate', null],
    [24, 8, 2.2, 2.2, 1.1, 'crate', null],
    [-8, -8, 2, 4, 2.6, 'box', '03'],
    [8, 8, 2, 4, 2.6, 'box', '05'],
    [16, -10, 1.2, 1.2, 1.4, 'barrel', null],
    [-12, 10, 1.2, 1.2, 1.4, 'barrel', null],
    [4, -12, 1.2, 1.2, 1.4, 'barrel', null],
    [18, 0, 1.2, 1.2, 1.4, 'barrel', null],
  ];
  const boxColors = [PALETTE.containerAmber, PALETTE.containerTeal, PALETTE.containerRust, PALETTE.containerGrey];
  const labels = ['RUSTLINE', 'VOLTAGE', '07', '09', '03', '05'];
  let boxIndex = 0;
  for (const [x, z, w, d, h, kind, label] of props) {
    let mesh;
    if (kind === 'barrel') {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, h, 12),
        new THREE.MeshStandardMaterial({ color: PALETTE.barrel, roughness: 0.7, metalness: 0.3 }),
      );
      mesh.position.set(x, h / 2, z);
    } else if (kind === 'crate') {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: PALETTE.crate, roughness: 0.95 }),
      );
      mesh.position.set(x, h / 2, z);
    } else {
      const color = boxColors[boxIndex % boxColors.length];
      boxIndex += 1;
      const text = label ?? labels[boxIndex % labels.length];
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({
          map: containerTexture(text, `#${color.toString(16).padStart(6, '0')}`),
          roughness: 0.75, metalness: 0.25,
        }),
      );
      mesh.position.set(x, h / 2, z);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    shootables.push(mesh);
    colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, top: h });
  }

  // Site marker rings, flat on the ground.
  for (const [site, color] of [[MAP.siteA, PALETTE.siteA], [MAP.siteB, PALETTE.siteB]]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 40),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
  }

  // Lamps: poles with a warm point light at each site and one mid-yard.
  const lampLights = [];
  for (const [x, z, color] of [
    [MAP.siteA.x, MAP.siteA.z, PALETTE.lamp],
    [MAP.siteB.x, MAP.siteB.z, PALETTE.lamp],
    [0, 0, 0xffd9a0],
  ]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.6, metalness: 0.6 }),
    );
    pole.position.set(x + 3.4, 2.7, z + 3.4);
    group.add(pole);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color }),
    );
    head.position.set(x + 3.4, 5.45, z + 3.4);
    group.add(head);
    const light = new THREE.PointLight(color, 18, 16, 1.8);
    light.position.set(x + 3.4, 5.2, z + 3.4);
    group.add(light);
    lampLights.push(light);
  }

  return { group, colliders, shootables, lampLights };
}

// Circle (x, z, radius) vs AABB colliders: slide the circle out. Returns
// the corrected position in the scratch object `out`.
export function collideCircle(colliders, x, z, radius, out) {
  out.x = x;
  out.z = z;
  for (const c of colliders) {
    const cx = Math.max(c.x0, Math.min(out.x, c.x1));
    const cz = Math.max(c.z0, Math.min(out.z, c.z1));
    const dx = out.x - cx;
    const dz = out.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        out.x = cx + (dx / d) * radius;
        out.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = out.x - c.x0;
        const pr = c.x1 - out.x;
        const pt = out.z - c.z0;
        const pb = c.z1 - out.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) out.x = c.x0 - radius;
        else if (m === pr) out.x = c.x1 + radius;
        else if (m === pt) out.z = c.z0 - radius;
        else out.z = c.z1 + radius;
      }
    }
  }
  out.x = Math.max(-MAP.halfX + 0.6, Math.min(MAP.halfX - 0.6, out.x));
  out.z = Math.max(-MAP.halfZ + 0.6, Math.min(MAP.halfZ - 0.6, out.z));
  return out;
}

// 2D line-of-sight between two ground points: blocked when the segment
// crosses a collider taller than eye height (1.4 m).
export function hasLineOfSight(colliders, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  for (const c of colliders) {
    if (c.top <= 1.4) continue;
    // Slab test on the segment.
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (const [o, d, lo, hi] of [[ax, dx, c.x0, c.x1], [az, dz, c.z0, c.z1]]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { ok = false; break; }
      } else {
        let ta = (lo - o) / d;
        let tb = (hi - o) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
    }
    if (ok && t0 <= t1) return false;
  }
  return true;
}

export function insideSite(site, x, z) {
  const dx = x - site.x;
  const dz = z - site.z;
  return dx * dx + dz * dz <= site.r * site.r;
}
