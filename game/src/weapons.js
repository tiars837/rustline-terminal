// RUSTLINE TERMINAL — weapons. Three guns plus a smoke grenade, each with
// its own damage, spread, recoil and price, so the buy menu matters.
// Spread grows with movement and with sustained fire, so stopping to aim
// pays; headshots deal double.
export const WEAPONS = {
  carbine: {
    id: 'carbine', name: 'VK-9 Carbine', kind: 'rifle', price: 2700,
    damage: 34, headDamage: 68, mag: 25, reserve: 75, auto: true,
    interval: 0.1, reloadTime: 2.1, spread: 0.006, moveSpread: 0.02,
    recoil: 0.011, range: 90, tracer: 0xffd27a,
  },
  breacher: {
    id: 'breacher', name: 'M12 Breacher', kind: 'shotgun', price: 1500,
    damage: 11, headDamage: 22, mag: 6, reserve: 24, auto: false,
    interval: 0.85, reloadTime: 2.6, spread: 0.032, moveSpread: 0.02,
    recoil: 0.03, range: 26, pellets: 8, tracer: 0xffb347,
  },
  sidearm: {
    id: 'sidearm', name: 'P9 Sidearm', kind: 'pistol', price: 500,
    damage: 26, headDamage: 52, mag: 12, reserve: 36, auto: false,
    interval: 0.16, reloadTime: 1.4, spread: 0.009, moveSpread: 0.016,
    recoil: 0.008, range: 55, tracer: 0xffe9a8,
  },
};

export const GRENADE = { id: 'smoke', name: 'Smoke grenade', price: 300 };

export function createWeapon() {
  const state = {
    current: WEAPONS.sidearm,
    mag: WEAPONS.sidearm.mag,
    reserve: WEAPONS.sidearm.reserve,
    owned: { sidearm: true },
    grenades: 0,
    cooldown: 0,
    reloading: 0,
    heat: 0, // sustained-fire bloom, decays
    lastShotAt: -10,
  };

  function equip(id) {
    const def = WEAPONS[id];
    if (!def || !state.owned[id]) return false;
    state.current = def;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.reloading = 0;
    state.heat = 0;
    return true;
  }

  function buy(id, money) {
    const def = WEAPONS[id];
    if (!def || state.owned[id] || money < def.price) return money;
    state.owned[id] = true;
    return money - def.price;
  }

  function buyGrenade(money) {
    if (money < GRENADE.price || state.grenades >= 2) return money;
    state.grenades += 1;
    return money - GRENADE.price;
  }

  // Returns true when a round left the barrel this step.
  function takeRound(now) {
    if (state.reloading > 0 || state.cooldown > 0 || state.mag <= 0) return false;
    state.mag -= 1;
    state.cooldown = state.current.interval;
    state.lastShotAt = now;
    state.heat = Math.min(1, state.heat + (state.current.kind === 'shotgun' ? 0.5 : 0.14));
    return true;
  }

  function reload() {
    if (state.reloading > 0 || state.mag >= state.current.mag || state.reserve <= 0) return false;
    state.reloading = state.current.reloadTime;
    return true;
  }

  function refill() {
    for (const def of Object.values(WEAPONS)) {
      if (state.owned[def.id]) {
        state.current = def;
        state.mag = def.mag;
        state.reserve = def.reserve;
      }
    }
    state.current = state.owned.carbine ? WEAPONS.carbine : WEAPONS.sidearm;
    state.mag = state.current.mag;
    state.reserve = state.current.reserve;
    state.grenades = 0;
    state.reloading = 0;
    state.cooldown = 0;
    state.heat = 0;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.heat = Math.max(0, state.heat - dt * 0.55);
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) {
        const need = state.current.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
        state.reloading = 0;
      }
    }
  }

  // Current spread in radians: base + movement + sustained-fire bloom.
  function spread(moveSpeed) {
    const def = state.current;
    return def.spread + def.moveSpread * Math.min(1, moveSpeed / 4.6) + state.heat * 0.012;
  }

  function ready() {
    return state.reloading <= 0 && state.cooldown <= 0 && state.mag > 0;
  }

  return { state, equip, buy, buyGrenade, takeRound, reload, refill, step, spread, ready };
}
