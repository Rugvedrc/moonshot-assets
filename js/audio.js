// All sound is synthesized with WebAudio — no audio files to load.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('dd_muted') === '1'; } catch (e) {}
    this.musicLevel = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());

    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp).connect(c.destination);

    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);

    const len = c.sampleRate;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // engine: two detuned oscillators through a lowpass
    this.eng1 = c.createOscillator(); this.eng1.type = 'sawtooth';
    this.eng2 = c.createOscillator(); this.eng2.type = 'square';
    this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 500;
    this.engG = c.createGain(); this.engG.gain.value = 0;
    this.eng1.connect(this.engF); this.eng2.connect(this.engF);
    this.engF.connect(this.engG).connect(this.sfx);
    this.eng1.start(); this.eng2.start();

    // tyre skid: looping band-passed noise
    this.skid = c.createBufferSource(); this.skid.buffer = buf; this.skid.loop = true;
    this.skidF = c.createBiquadFilter(); this.skidF.type = 'bandpass'; this.skidF.frequency.value = 1600; this.skidF.Q.value = 0.9;
    this.skidG = c.createGain(); this.skidG.gain.value = 0;
    this.skid.connect(this.skidF).connect(this.skidG).connect(this.sfx);
    this.skid.start();

    this._startMusic();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('dd_muted', m ? '1' : '0'); } catch (e) {}
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMusic(level) {
    this.musicLevel = level;
    if (this.ctx) this.music.gain.setTargetAtTime(level, this.ctx.currentTime, 0.4);
  }

  engine(speed01, boost, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 48 + speed01 * 110 + (boost ? 45 : 0);
    this.eng1.frequency.setTargetAtTime(f, t, 0.06);
    this.eng2.frequency.setTargetAtTime(f * 0.501, t, 0.06);
    this.engF.frequency.setTargetAtTime(300 + speed01 * 1300 + (boost ? 600 : 0), t, 0.06);
    this.engG.gain.setTargetAtTime(on ? 0.035 + speed01 * 0.05 : 0, t, 0.1);
  }

  skidLevel(v) {
    if (!this.ctx) return;
    this.skidG.gain.setTargetAtTime(clamp(v, 0, 1) * 0.09, this.ctx.currentTime, 0.05);
  }

  tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0, dest = null) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, freq, vol, type = 'lowpass', delay = 0, q = 1, freqTo = null, dest = null) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  star(combo) {
    const base = 784 * Math.pow(2, Math.min(combo - 1, 10) / 12);
    this.tone(base, 0.12, 'triangle', 0.22);
    this.tone(base * 1.5, 0.22, 'triangle', 0.18, null, 0.06);
  }

  superStar() {
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(midi(72 + s), 0.3, 'square', 0.08, null, i * 0.06));
  }

  bump(power) {
    const p = clamp(power, 0.15, 1);
    this.noise(0.16, 380, 0.45 * p);
    this.tone(110, 0.16, 'sine', 0.35 * p, 45);
  }

  quack() {
    const c = this.ctx; if (!c) return;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2.5;
    const g = c.createGain(); g.gain.value = 1.6;
    f.connect(g).connect(this.sfx);
    this.tone(560, 0.16, 'sawtooth', 0.5, 330, 0, f);
    this.tone(540, 0.2, 'sawtooth', 0.5, 300, 0.18, f);
  }

  thud(vol) {
    const v = clamp(vol, 0.1, 1);
    this.tone(75, 0.45, 'sine', 0.7 * v, 32);
    this.noise(0.35, 260, 0.45 * v);
  }

  charge(level) {
    this.tone(500 + level * 220, 0.09, 'square', 0.07);
    this.tone(750 + level * 330, 0.12, 'square', 0.05, null, 0.05);
  }

  boost(level) {
    this.noise(0.6, 600, 0.35, 'bandpass', 0, 1.2, 3000);
    this.tone(180 + level * 40, 0.45, 'sawtooth', 0.08, 520 + level * 80);
  }

  land(v) { this.noise(0.12, 500, 0.3 * clamp(v, 0.2, 1)); this.tone(140, 0.1, 'sine', 0.2, 70); }
  whoosh() { this.noise(0.4, 400, 0.18, 'bandpass', 0, 1, 1800); }
  fall() { this.tone(1000, 1.0, 'sine', 0.12, 160); }
  beep(hi) { this.tone(hi ? 988 : 494, hi ? 0.45 : 0.16, 'square', 0.12); }
  click() { this.tone(660, 0.05, 'square', 0.06); }
  bonus() { [0, 7, 12].forEach((s, i) => this.tone(midi(67 + s), 0.18, 'triangle', 0.15, null, i * 0.05)); }

  fanfare() {
    const seq = [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [79, 0.52], [84, 0.64]];
    seq.forEach(([m, d]) => this.tone(midi(m), 0.3, 'square', 0.08, null, d));
  }

  // ---- tiny step sequencer for background music ----
  _startMusic() {
    const c = this.ctx;
    this.step = 0;
    this.nextT = c.currentTime + 0.1;
    this.stepDur = 60 / 126 / 4;
    // C  Am  F  G
    this.chords = [[48, 52, 55, 60], [45, 48, 52, 57], [41, 45, 48, 53], [43, 47, 50, 55]];
    const tick = () => {
      if (c.state === 'running' && this.musicLevel > 0.001) {
        while (this.nextT < c.currentTime + 0.15) {
          this._playStep(this.step, this.nextT);
          this.nextT += this.stepDur;
          this.step = (this.step + 1) % 64;
        }
      } else {
        this.nextT = c.currentTime + 0.05;
      }
    };
    setInterval(tick, 25);
  }

  _note(freq, t, dur, type, vol) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.music);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _playStep(s, t) {
    const c = this.ctx;
    const bar = Math.floor(s / 16);
    const i = s % 16;
    const ch = this.chords[bar];
    // kick
    if (i % 4 === 0) {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(this.music); o.start(t); o.stop(t + 0.2);
    }
    // hats
    if (i % 2 === 1) this.noise(0.04, 7000, i % 4 === 3 ? 0.12 : 0.06, 'highpass', t - c.currentTime, 1, null, this.music);
    // snare
    if (i === 4 || i === 12) this.noise(0.12, 1800, 0.18, 'bandpass', t - c.currentTime, 0.8, null, this.music);
    // bass
    if ([0, 3, 6, 8, 10, 14].includes(i)) this._note(midi(ch[0] - 12 + (i === 10 ? 12 : 0)), t, 0.16, 'triangle', 0.32);
    // arpeggio
    if (i % 2 === 0) {
      const order = [0, 1, 2, 3, 2, 1, 2, 3];
      const n = ch[order[(i / 2) % 8]] + 12;
      this._note(midi(n), t, 0.12, 'square', 0.035);
    }
  }
}
