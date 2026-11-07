// Sons sintetizados na hora (sem arquivos), com áudio 3D (PannerNode HRTF) para o que acontece no
// formigueiro, e uma musiquinha de fliperama por mundo (pode desligar no menu). Quando sobra um bicho
// só, a música acelera.
// Só começa depois de um clique, tecla ou da entrada no VR (regra do navegador).
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// músicas: [baixo (16 passos, nota MIDI ou 0), melodia (16 passos), passos por segundo, timbre da melodia]
const SONGS = [
  // Quintal: xote saltitante de quintal
  [[48, 0, 55, 0, 48, 0, 55, 52, 45, 0, 52, 0, 43, 0, 50, 0], [72, 74, 76, 0, 79, 0, 76, 74, 72, 0, 69, 0, 67, 69, 72, 0], 7, 'square'],
  // Raízes da Mangueira: mais grave e misterioso
  [[41, 0, 41, 48, 0, 0, 44, 0, 39, 0, 39, 46, 0, 0, 43, 0], [65, 0, 68, 0, 72, 70, 68, 0, 63, 0, 67, 0, 70, 0, 67, 0], 6, 'triangle'],
  // Caverna de Cristal: plim-plim de cristal
  [[45, 0, 0, 45, 52, 0, 0, 0, 43, 0, 0, 43, 50, 0, 0, 0], [81, 88, 84, 88, 81, 88, 84, 91, 79, 86, 83, 86, 79, 86, 83, 88], 8, 'sine'],
  // o último bicho: corrida
  [[45, 52, 45, 52, 47, 54, 47, 54, 48, 55, 48, 55, 47, 54, 47, 54], [81, 0, 79, 0, 77, 0, 76, 0, 74, 0, 76, 0, 77, 0, 79, 0], 11, 'square'],
];

export class Sfx {
  constructor() { this.ctx = null; this.on = true; this.musicOn = true; this.last = {}; this.song = 0; this.playing = false; this.lastOne = false; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.9 : 0;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.09 : 0;
      this.musicBus.connect(this.master);
      this.step = 0; this.nextT = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 50);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }
  setMusic(v) {
    this.musicOn = v;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(v ? 0.09 : 0, this.ctx.currentTime, 0.1);
  }
  setSong(i, playing) { this.song = i; this.playing = playing; }

  schedule() {
    const c = this.ctx;
    if (!c) return;
    const [bass, mel, rate, wave] = SONGS[this.lastOne ? 3 : this.song];
    const dt = 1 / rate;
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.02;
    while (this.nextT < c.currentTime + 0.2) {
      const k = this.step % 16, t = this.nextT - c.currentTime;
      if (this.playing) {
        if (bass[k]) this.tone(NOTE(bass[k]), dt * 0.85, { type: 'triangle', vol: 0.9, at: t, bus: this.musicBus, attack: 0.01 });
        if (mel[k]) this.tone(NOTE(mel[k]), dt * 0.6, { type: wave, vol: wave === 'sine' ? 0.26 : 0.18, at: t, bus: this.musicBus });
        // percussão de terra: chocalho de sementes e um tum abafado
        if (k % 2 === 0) this.noise(0.04, { vol: 0.25, freq: 6000, q: 1, type: 'highpass', at: t, bus: this.musicBus });
        if (k % 8 === 0) this.tone(90, 0.12, { type: 'sine', vol: 0.7, at: t, bus: this.musicBus, slide: 0.5 });
      }
      this.step++;
      this.nextT += dt;
    }
  }

  setListener(p, f, u) {
    const L = this.ctx?.listener;
    if (!L) return;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
      L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
      L.upX.setValueAtTime(u.x, t); L.upY.setValueAtTime(u.y, t); L.upZ.setValueAtTime(u.z, t);
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  out(pos, ref = 0.6, bus = null) {
    const c = this.ctx;
    if (bus) return bus;
    if (!pos) return this.master;
    const p = c.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = ref; p.maxDistance = 30; p.rolloffFactor = 0.7;
    if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; }
    else p.setPosition(pos[0], pos[1], pos[2]);
    p.connect(this.master);
    return p;
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.005, pos = null, ref, bus = null } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out(pos, ref, bus));
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0, type = 'bandpass', pos = null, ref, slide = 0, bus = null } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    if (!this.nbuf) {
      this.nbuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.nbuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.nbuf; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out(pos, ref, bus));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  gate(key, gap) {
    const t = this.ctx?.currentTime ?? 0;
    if (t - (this.last[key] || -9) < gap) return false;
    this.last[key] = t;
    return true;
  }

  // ---------- formiga ----------
  dig(pos) { if (this.gate('dig', 0.11)) this.noise(0.07, { vol: 0.12, freq: 500 + Math.random() * 300, q: 0.9, pos, ref: 0.3 }); }
  step1(pos) { if (this.gate('step', 0.12)) this.tone(1800 + Math.random() * 400, 0.015, { type: 'square', vol: 0.025, pos, ref: 0.3 }); }
  pump(pos, k) { this.noise(0.12, { vol: 0.25, freq: 1400 + k * 300, q: 2, slide: 1.6, pos, ref: 0.35 }); this.tone(300 + k * 90, 0.1, { type: 'triangle', vol: 0.1, slide: 1.5, pos, ref: 0.35 }); }
  pumpMiss(pos) { this.noise(0.1, { vol: 0.12, freq: 2500, q: 1.5, slide: 0.6, pos, ref: 0.35 }); }
  block(pos) { this.tone(900, 0.08, { type: 'square', vol: 0.1, slide: 0.6, pos, ref: 0.35 }); this.tone(600, 0.1, { type: 'square', vol: 0.08, at: 0.05, pos, ref: 0.35 }); }
  deflate(pos) { if (this.gate('defl', 0.2)) this.noise(0.25, { vol: 0.08, freq: 900, q: 1.5, slide: 0.5, pos, ref: 0.35 }); }
  pop(pos) {
    this.noise(0.25, { vol: 0.6, freq: 1800, q: 0.7, pos, ref: 0.4 });
    this.tone(160, 0.15, { type: 'square', vol: 0.2, slide: 0.4, pos, ref: 0.4 });
    [84, 88, 91].forEach((n, i) => this.tone(NOTE(n), 0.08, { type: 'square', vol: 0.08, at: 0.1 + i * 0.05 }));
  }
  die(pos) { this.noise(0.3, { vol: 0.4, freq: 800, q: 0.8, pos, ref: 0.4 }); [76, 72, 69, 65, 60, 57].forEach((n, i) => this.tone(NOTE(n), 0.12, { type: 'triangle', vol: 0.14, at: 0.1 + i * 0.1 })); }
  // ---------- bichos ----------
  ghost(pos) { if (this.gate('ghost', 0.3)) this.tone(500, 0.6, { type: 'sine', vol: 0.08, slide: 0.6, attack: 0.15, pos, ref: 0.4 }); }
  unghost(pos) { if (this.gate('unghost', 0.3)) this.tone(300, 0.2, { type: 'triangle', vol: 0.07, slide: 1.6, pos, ref: 0.4 }); }
  fireWarn(pos) { this.tone(200, 0.6, { type: 'sawtooth', vol: 0.06, slide: 2.5, pos, ref: 0.4 }); }
  fire(pos) { this.noise(0.6, { vol: 0.35, freq: 700, q: 0.6, type: 'lowpass', slide: 2, pos, ref: 0.4 }); }
  bugWalk(pos) { if (this.gate('bug', 0.25)) this.tone(2400 + Math.random() * 600, 0.02, { type: 'square', vol: 0.02, pos, ref: 0.3 }); }
  egg(pos) { this.tone(600, 0.15, { type: 'sine', vol: 0.12, slide: 1.5, pos, ref: 0.4 }); }
  web(pos) { this.tone(1400, 0.4, { type: 'sine', vol: 0.06, slide: 0.8, pos, ref: 0.4 }); this.tone(2100, 0.3, { type: 'sine', vol: 0.04, at: 0.1, pos, ref: 0.4 }); }
  angry(pos) { this.tone(110, 0.4, { type: 'sawtooth', vol: 0.2, slide: 0.7, pos, ref: 0.4 }); this.noise(0.3, { vol: 0.2, freq: 300, q: 0.8, pos, ref: 0.4 }); }
  flee() { [72, 74, 76, 77, 79].forEach((n, i) => this.tone(NOTE(n), 0.07, { type: 'square', vol: 0.07, at: i * 0.05 })); }
  escape() { [79, 76, 72].forEach((n, i) => this.tone(NOTE(n), 0.12, { type: 'triangle', vol: 0.08, at: i * 0.1 })); }
  // ---------- pedras e frutinha ----------
  wobble(pos) { this.noise(0.5, { vol: 0.12, freq: 250, q: 1.5, pos, ref: 0.4 }); }
  rockFall(pos) { this.noise(0.3, { vol: 0.2, freq: 400, q: 0.8, slide: 0.5, pos, ref: 0.4 }); }
  rockLand(pos, n) {
    this.noise(0.5, { vol: 0.55, freq: 220, q: 0.5, type: 'lowpass', pos, ref: 0.4 });
    this.tone(60, 0.4, { type: 'sine', vol: 0.45, slide: 0.6, pos, ref: 0.4 });
    if (n) [72, 76, 79, 84, 88, 91].slice(0, n + 1).forEach((m, i) => this.tone(NOTE(m), 0.12, { type: 'square', vol: 0.1, at: 0.2 + i * 0.08 }));
  }
  crush(pos) { this.noise(0.2, { vol: 0.4, freq: 1200, q: 0.8, pos, ref: 0.4 }); }
  rockNew(pos) { this.tone(180, 0.3, { type: 'triangle', vol: 0.1, slide: 1.3, pos, ref: 0.4 }); }
  fruit(pos) { [76, 81, 88].forEach((n, i) => this.tone(NOTE(n), 0.12, { type: 'sine', vol: 0.12, at: i * 0.08, pos, ref: 0.4 })); }
  fruitGet(pos) { [72, 76, 79, 84, 88].forEach((n, i) => this.tone(NOTE(n), 0.1, { type: 'square', vol: 0.1, at: i * 0.05, pos, ref: 0.4 })); }
  // ---------- terrário ----------
  grab(pos) { this.tone(500, 0.06, { type: 'triangle', vol: 0.08, pos, ref: 0.4 }); this.noise(0.08, { vol: 0.1, freq: 3500, q: 2, pos, ref: 0.4 }); }
  glass(pos) { this.tone(2600, 0.3, { type: 'sine', vol: 0.06, pos, ref: 0.4 }); this.tone(3900, 0.2, { type: 'sine', vol: 0.03, pos, ref: 0.4 }); }
  // ---------- chefes e fim ----------
  bossHit(pos) { this.tone(120, 0.4, { type: 'sawtooth', vol: 0.25, slide: 0.5, pos, ref: 0.4 }); [67, 72, 79].forEach((n, i) => this.tone(NOTE(n), 0.14, { type: 'square', vol: 0.12, at: 0.15 + i * 0.08 })); }
  bossDown(pos) {
    for (let k = 0; k < 4; k++) this.noise(0.5, { vol: 0.45, freq: 900, q: 0.7, at: k * 0.18, pos, ref: 0.4 });
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), 0.3, { type: 'square', vol: 0.12, at: 0.8 + i * 0.09 }));
  }
  respawn() { this.tone(400, 0.3, { type: 'sine', vol: 0.1, slide: 2, attack: 0.05 }); }
  coin() { [83, 88].forEach((n, i) => this.tone(NOTE(n), i ? 0.4 : 0.08, { type: 'square', vol: 0.12, at: i * 0.08 })); }
  won() { [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this.tone(NOTE(n), 0.22, { type: 'square', vol: 0.12, at: i * 0.12 })); }
  lost() { [67, 66, 65, 64, 52].forEach((n, i) => this.tone(NOTE(n), i === 4 ? 0.8 : 0.25, { type: 'square', vol: 0.12, at: i * 0.22 })); }
  click() { this.tone(880, 0.05, { vol: 0.07, type: 'square' }); }
  star(n) { this.tone(NOTE(84 + n * 4), 0.3, { vol: 0.12, type: 'triangle' }); }
}
