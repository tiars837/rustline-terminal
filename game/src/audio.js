// RUSTLINE TERMINAL — sound. Every sound is synthesised with WebAudio:
// filtered noise bursts for gunfire, clicks for reloads, a tick for hits,
// a two-note sting for round results and an accelerating beep for the bomb.
// No audio files, no network.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration = 0.12, freq = 1800, gain = 0.9, type = 'lowpass', when = 0 }) {
    if (!ensure() || ctx.state === 'suspended') return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start(t);
    src.stop(t + duration);
  }

  function tone({ freq = 440, duration = 0.12, gain = 0.5, type = 'sine', when = 0, slideTo = null }) {
    if (!ensure() || ctx.state === 'suspended') return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'shotgun') burst({ duration: 0.22, freq: 900, gain: 1 });
      else if (kind === 'pistol') burst({ duration: 0.09, freq: 2400, gain: 0.7 });
      else burst({ duration: 0.13, freq: 1600, gain: 0.9 });
      tone({ freq: 140, duration: 0.08, gain: 0.5, type: 'triangle', slideTo: 60 });
    },
    enemyShot(distance) {
      const g = Math.max(0.15, 0.8 - distance * 0.012);
      burst({ duration: 0.12, freq: 1400, gain: g });
    },
    dryFire() { tone({ freq: 1200, duration: 0.04, gain: 0.3, type: 'square' }); },
    reload() {
      tone({ freq: 700, duration: 0.05, gain: 0.35, type: 'square' });
      tone({ freq: 500, duration: 0.05, gain: 0.35, type: 'square', when: 0.18 });
    },
    hit() { tone({ freq: 1900, duration: 0.05, gain: 0.45, type: 'square' }); },
    kill() {
      tone({ freq: 660, duration: 0.09, gain: 0.5 });
      tone({ freq: 990, duration: 0.14, gain: 0.5, when: 0.09 });
    },
    hurt() { tone({ freq: 180, duration: 0.12, gain: 0.5, type: 'sawtooth', slideTo: 90 }); },
    beep() { tone({ freq: 1150, duration: 0.07, gain: 0.5, type: 'square' }); },
    plant() { tone({ freq: 880, duration: 0.1, gain: 0.5 }); },
    roundWon() {
      tone({ freq: 523, duration: 0.14, gain: 0.5 });
      tone({ freq: 784, duration: 0.22, gain: 0.5, when: 0.14 });
    },
    roundLost() {
      tone({ freq: 392, duration: 0.16, gain: 0.5, type: 'triangle' });
      tone({ freq: 262, duration: 0.26, gain: 0.5, type: 'triangle', when: 0.16 });
    },
    explosion() {
      burst({ duration: 0.9, freq: 320, gain: 1 });
      tone({ freq: 70, duration: 0.7, gain: 0.8, type: 'sine', slideTo: 30 });
    },
  };
}
