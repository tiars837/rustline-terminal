// RUSTLINE TERMINAL — HUD. One module owns every DOM write: health, ammo,
// timer, score, money, weapon, kill feed, bomb status, buy menu, crosshair
// spread and the start / round / match overlays. The game never touches
// the DOM anywhere else.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    health: $('health-value'),
    healthBar: $('health-bar'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammoBox: $('ammo'),
    weapon: $('weapon-name'),
    timer: $('timer'),
    scoreRust: $('score-rust'),
    scoreVolt: $('score-volt'),
    money: $('money'),
    feed: $('feed'),
    bomb: $('bomb'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    damage: $('damage'),
    buy: $('buy'),
    buyMoney: $('buy-money'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    plant: $('plant'),
    plantBar: $('plant-bar'),
  };
  let hitTimer = null;
  let damageTimer = null;

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function setHealth(hp) {
    els.health.textContent = String(Math.round(hp));
    els.healthBar.style.width = `${Math.max(0, hp)}%`;
    els.healthBar.classList.toggle('low', hp <= 30);
  }

  function setAmmo(mag, reserve) {
    els.ammoMag.textContent = String(mag);
    els.ammoReserve.textContent = `/ ${reserve}`;
    els.ammoBox.classList.toggle('empty', mag === 0);
  }

  function setWeapon(name, grenades) {
    els.weapon.textContent = `${name}  ·  smoke x${grenades}`;
  }

  function setTimer(seconds, phase) {
    els.timer.textContent = phase === 'buy' ? `BUY ${fmtTime(seconds)}` : fmtTime(seconds);
    els.timer.classList.toggle('urgent', seconds <= 10 && phase === 'live');
  }

  function setScore(rust, volt) {
    els.scoreRust.textContent = String(rust);
    els.scoreVolt.textContent = String(volt);
  }

  function setMoney(value) {
    els.money.textContent = `$${value}`;
    els.buyMoney.textContent = `$${value}`;
  }

  function feed(text) {
    const line = document.createElement('div');
    line.textContent = text;
    els.feed.prepend(line);
    while (els.feed.children.length > 4) els.feed.removeChild(els.feed.lastChild);
  }

  function hitMarker(kill) {
    els.hitmarker.classList.add('on');
    els.hitmarker.classList.toggle('kill', kill);
    if (hitTimer) clearTimeout(hitTimer);
    hitTimer = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), kill ? 260 : 120);
  }

  function damageFlash() {
    els.damage.classList.add('on');
    if (damageTimer) clearTimeout(damageTimer);
    damageTimer = setTimeout(() => els.damage.classList.remove('on'), 220);
  }

  function setBomb(planted, timer, site) {
    if (planted) {
      els.bomb.hidden = false;
      els.bomb.textContent = `BOMB PLANTED · SITE ${site} · ${fmtTime(timer)}`;
    } else {
      els.bomb.hidden = true;
    }
  }

  function setPlant(active, progress) {
    els.plant.hidden = !active;
    if (active) els.plantBar.style.width = `${Math.min(100, progress * 25)}%`;
  }

  function setSpread(spread) {
    // Crosshair gap in px grows with spread, so the player reads accuracy.
    const gap = Math.round(4 + spread * 900);
    els.crosshair.style.setProperty('--gap', `${gap}px`);
  }

  function showBuy(show) {
    els.buy.hidden = !show;
  }

  function showOverlay(kind, data = {}) {
    els.overlay.hidden = false;
    if (kind === 'start') {
      els.overlayTitle.textContent = 'RUSTLINE TERMINAL';
      els.overlayCopy.textContent = 'Round-based tactical FPS. Plant the bomb at Site A or B, or eliminate VOLTAGE. Buy between rounds — money is earned, not given.';
      els.play.textContent = 'Click to play';
    } else if (kind === 'paused') {
      els.overlayTitle.textContent = 'Paused';
      els.overlayCopy.textContent = 'Click to resume the round.';
      els.play.textContent = 'Resume';
    } else if (kind === 'round') {
      els.overlayTitle.textContent = data.won ? 'ROUND WON' : 'ROUND LOST';
      els.overlayCopy.textContent = `${data.reason}. RUSTLINE ${data.scoreRust} — ${data.scoreVolt} VOLTAGE.`;
      els.play.textContent = 'Next round';
    } else if (kind === 'match') {
      els.overlayTitle.textContent = data.won ? 'MATCH WON' : 'MATCH LOST';
      els.overlayCopy.textContent = `Final: RUSTLINE ${data.scoreRust} — ${data.scoreVolt} VOLTAGE. ${data.won ? 'The terminal is yours.' : 'VOLTAGE holds the yard.'}`;
      els.play.textContent = 'Play again';
    }
  }

  function hideOverlay() {
    els.overlay.hidden = true;
  }

  function onPlay(handler) {
    els.play.addEventListener('click', handler);
  }

  return {
    setHealth, setAmmo, setWeapon, setTimer, setScore, setMoney, feed,
    hitMarker, damageFlash, setBomb, setPlant, setSpread, showBuy,
    showOverlay, hideOverlay, onPlay,
  };
}
