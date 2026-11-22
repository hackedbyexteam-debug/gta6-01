// WebAudio sound, all synthesised: no audio files are shipped. Engine hum,
// two-tone police siren, gunshots, pickups and a small bassline loop are built
// from oscillators and filtered noise, so the game stays silent until the
// player presses a key (browsers block audio before a gesture).
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let musicTimer = null;
  let musicOn = true;
  let step = 0;
  const bassline = [55, 0, 55, 65.4, 49, 0, 58.3, 65.4, 55, 0, 55, 73.4, 82.4, 73.4, 65.4, 58.3];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 500;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq || 3000;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  function startMusic() {
    if (musicTimer || !ctx) return;
    musicTimer = setInterval(() => {
      if (!musicOn || !ctx) return;
      const f = bassline[step % bassline.length];
      step++;
      if (f > 0) {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(t);
        osc.stop(t + 0.24);
      }
      if (step % 4 === 2) blip(220, 0.05, 'sine', 0.12);
    }, 190);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    toggleMusic() {
      musicOn = !musicOn;
      return musicOn;
    },
    setEngine(speedRatio) {
      if (!ctx) return;
      engineOsc.frequency.value = 55 + speedRatio * 140;
      engineGain.gain.value = speedRatio > 0.02 ? 0.05 + speedRatio * 0.05 : 0;
    },
    setSiren(on) {
      if (!ctx) return;
      if (on && !sirenTimer) {
        let high = true;
        sirenTimer = setInterval(() => {
          high = !high;
          sirenOsc.frequency.value = high ? 950 : 700;
        }, 380);
        sirenGain.gain.value = 0.045;
      } else if (!on && sirenTimer) {
        clearInterval(sirenTimer);
        sirenTimer = null;
        sirenGain.gain.value = 0;
      }
    },
    shot(weaponId) {
      if (!ctx) return;
      if (weaponId === 'shotgun') noise(0.16, 0.5, 1800);
      else if (weaponId === 'rifle') noise(0.2, 0.45, 2400);
      else if (weaponId === 'smg') noise(0.06, 0.3, 3200);
      else if (weaponId === 'pistol') noise(0.09, 0.4, 2600);
      else blip(180, 0.08, 'sine', 0.25, 90);
    },
    hit() {
      blip(140, 0.1, 'square', 0.2, 70);
    },
    hurt() {
      blip(110, 0.18, 'sawtooth', 0.3, 60);
    },
    pickup() {
      blip(660, 0.08, 'sine', 0.25);
      setTimeout(() => blip(990, 0.12, 'sine', 0.25), 70);
    },
    cash() {
      blip(880, 0.07, 'sine', 0.25);
      setTimeout(() => blip(1174, 0.1, 'sine', 0.25), 60);
      setTimeout(() => blip(1568, 0.14, 'sine', 0.25), 120);
    },
    ui() {
      blip(520, 0.05, 'sine', 0.2);
    },
    mission() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.14, 'sine', 0.25), i * 90));
    },
    fail() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'sawtooth', 0.2), i * 110));
    },
    crash() {
      noise(0.3, 0.5, 900);
    },
  };
}
