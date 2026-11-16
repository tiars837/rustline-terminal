// RUSTLINE TERMINAL — effects. Everything is pooled and reused: a ring of
// tracer lines, a muzzle-flash quad, impact spark bursts and smoke clouds.
// Nothing is allocated in the hot loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 10;
const SPARKS = 6;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: PALETTE.tracer, transparent: true, opacity: 0,
    }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  // Muzzle flash: a small additive quad at the gun, fading in 60 ms.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd27a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), flashMat);
  flash.visible = false;
  scene.add(flash);
  let flashLife = 0;

  // Impact sparks: one Points cloud per burst slot, positions rewritten.
  const sparkSlots = [];
  for (let i = 0; i < SPARKS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc46b, size: 0.09, transparent: true, opacity: 0, sizeAttenuation: true,
    }));
    points.frustumCulled = false;
    scene.add(points);
    sparkSlots.push({ points, life: 0, vel: new Float32Array(8 * 3) });
  }
  let sparkIndex = 0;

  // Smoke clouds: transparent spheres that grow, drift and fade.
  const smokes = [];
  for (let i = 0; i < 3; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshStandardMaterial({
        color: PALETTE.smoke, transparent: true, opacity: 0, roughness: 1,
      }),
    );
    mesh.visible = false;
    scene.add(mesh);
    smokes.push({ mesh, life: 0, maxLife: 1 });
  }

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function tracer(from, to, color = PALETTE.tracer) {
    const slot = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACERS;
    const pos = slot.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    slot.line.material.color.setHex(color);
    slot.line.material.opacity = 0.9;
    slot.life = 0.09;
  }

  function muzzle(at, yaw, pitch) {
    flash.position.copy(at);
    flash.rotation.set(0, yaw, 0);
    flash.rotateX(pitch);
    flash.visible = true;
    flashMat.opacity = 0.95;
    flashLife = 0.06;
  }

  function sparks(at, random) {
    const slot = sparkSlots[sparkIndex];
    sparkIndex = (sparkIndex + 1) % SPARKS;
    const pos = slot.points.geometry.attributes.position;
    for (let i = 0; i < 8; i += 1) {
      pos.setXYZ(i, at.x, at.y, at.z);
      slot.vel[i * 3] = (random() - 0.5) * 4;
      slot.vel[i * 3 + 1] = random() * 3;
      slot.vel[i * 3 + 2] = (random() - 0.5) * 4;
    }
    pos.needsUpdate = true;
    slot.points.material.opacity = 1;
    slot.life = 0.35;
  }

  function smoke(at, seconds = 6) {
    const slot = smokes.find((s) => s.life <= 0) ?? smokes[0];
    slot.mesh.position.set(at.x, 1.1, at.z);
    slot.mesh.visible = true;
    slot.life = seconds;
    slot.maxLife = seconds;
    slot.mesh.scale.setScalar(0.4);
  }

  function isSmoked(x, z) {
    for (const s of smokes) {
      if (s.life <= 0) continue;
      const dx = x - s.mesh.position.x;
      const dz = z - s.mesh.position.z;
      const r = 2.6 * s.mesh.scale.x;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life > 0) {
        slot.life -= dt;
        slot.line.material.opacity = Math.max(0, slot.life / 0.09) * 0.9;
      }
    }
    if (flashLife > 0) {
      flashLife -= dt;
      flashMat.opacity = Math.max(0, flashLife / 0.06) * 0.95;
      if (flashLife <= 0) flash.visible = false;
    }
    for (const slot of sparkSlots) {
      if (slot.life > 0) {
        slot.life -= dt;
        const pos = slot.points.geometry.attributes.position;
        for (let i = 0; i < 8; i += 1) {
          pos.setXYZ(i,
            pos.getX(i) + slot.vel[i * 3] * dt,
            Math.max(0.02, pos.getY(i) + slot.vel[i * 3 + 1] * dt),
            pos.getZ(i) + slot.vel[i * 3 + 2] * dt);
          slot.vel[i * 3 + 1] -= 9 * dt;
        }
        pos.needsUpdate = true;
        slot.points.material.opacity = Math.max(0, slot.life / 0.35);
      }
    }
    for (const s of smokes) {
      if (s.life > 0) {
        s.life -= dt;
        const grown = 1 + (1 - s.life / s.maxLife) * 2.2;
        s.mesh.scale.setScalar(Math.min(3.2, grown));
        s.mesh.material.opacity = Math.min(0.75, (s.life / s.maxLife) * 0.9);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
  }

  return { tracer, muzzle, sparks, smoke, isSmoked, step, tmpA, tmpB };
}
