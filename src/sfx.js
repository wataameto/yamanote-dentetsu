// Web Audio APIで生成する効果音・BGM。外部音声ファイル不要。
export class SFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  tone(freq, duration, type, startTime, gainValue) {
    if (this.muted) return;
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime + startTime;
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration);
  }

  slide(freqFrom, freqTo, duration, type, startTime, gainValue) {
    if (this.muted) return;
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime + startTime;
    osc.frequency.setValueAtTime(freqFrom, t);
    osc.frequency.exponentialRampToValueAtTime(freqTo, t + duration);
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration);
  }

  click(startTime = 0, gainValue = 0.1) {
    if (this.muted) return;
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1800;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime + startTime;
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.start(t);
    osc.stop(t + 0.03);
  }

  // ---------- ゲーム内SE ----------

  diceRoll() {
    // サイコロがカラカラ転がる感じ(短いクリックの連打+着地音)
    for (let i = 0; i < 6; i++) {
      this.tone(600 + Math.random() * 800, 0.04, 'square', i * 0.05, 0.05);
    }
    this.tone(220, 0.1, 'triangle', 0.32, 0.12);
  }

  step() {
    this.tone(880, 0.03, 'square', 0, 0.04);
  }

  arriveStation() {
    this.tone(523.25, 0.08, 'triangle', 0, 0.1);
    this.tone(659.25, 0.12, 'triangle', 0.07, 0.1);
  }

  buyProperty() {
    this.tone(784, 0.06, 'square', 0, 0.12);
    this.tone(1046.5, 0.14, 'square', 0.06, 0.12);
  }

  blueCell() {
    this.slide(440, 880, 0.18, 'triangle', 0, 0.14);
  }

  redCell() {
    this.slide(440, 220, 0.22, 'sawtooth', 0, 0.14);
  }

  drawCard() {
    this.slide(300, 900, 0.1, 'square', 0, 0.1);
    this.tone(1200, 0.05, 'square', 0.1, 0.08);
  }

  useCard() {
    this.slide(500, 1000, 0.12, 'square', 0, 0.12);
  }

  shortcutJingle() {
    const notes = [659.25, 784, 987.77];
    notes.forEach((f, i) => this.tone(f, 0.12, 'triangle', i * 0.09, 0.12));
  }

  gameStart() {
    // 電車の発車チャイム風
    this.slide(300, 900, 0.25, 'sawtooth', 0, 0.15);
    this.tone(900, 0.15, 'square', 0.22, 0.12);
  }

  goal() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => this.tone(f, 0.22, 'square', i * 0.12, 0.16));
  }

  noranekoAttach() {
    this.slide(500, 150, 0.35, 'sawtooth', 0, 0.15);
    this.tone(150, 0.15, 'square', 0.32, 0.12);
  }

  noranekoTransfer() {
    this.slide(400, 200, 0.25, 'sawtooth', 0, 0.12);
  }

  settlement() {
    for (let i = 0; i < 5; i++) {
      this.tone(1000 + i * 60, 0.05, 'square', i * 0.06, 0.06);
    }
  }

  turnStart(isHuman) {
    if (isHuman) {
      this.tone(659.25, 0.1, 'triangle', 0, 0.1);
    } else {
      this.tone(392, 0.1, 'triangle', 0, 0.08);
    }
  }

  gameOver() {
    const notes = [392, 370, 349, 330, 294];
    notes.forEach((f, i) => this.tone(f, 0.35, 'sawtooth', i * 0.3, 0.2));
  }

  victory() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone(f, 0.25, 'square', i * 0.15, 0.18));
  }

  // ---------- BGM ----------

  playTheme() {
    if (this.themePlaying) return;
    this.themePlaying = true;

    // 電車でお出かけする、軽快で明るいチップチューン(オリジナル曲)。
    // まる系(triangle)の短い音でポンポン跳ねる感じにして、耳に痛いキンキン感を抑える。
    const step = 0.19; // 約126BPMの8分音符
    const N = {
      C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0,
      C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25,
    };
    const melody = [
      N.C4, N.D4, N.E4, N.G4, N.E4, N.D4, N.C4, N.D4,
      N.E4, N.F4, N.G4, N.A4, N.G4, N.F4, N.E4, N.D4,
      N.G4, N.A4, N.B4, N.C5, N.B4, N.A4, N.G4, N.A4,
      N.E4, N.D4, N.C4, 0, N.C4, 0, 0, 0,
    ];
    const bass = [N.C3, N.G3, N.A3, N.E3, N.F3, N.C3, N.G3, N.G3];

    const scheduleLoop = () => {
      if (!this.themePlaying) return;
      melody.forEach((freq, i) => {
        const t = i * step;
        if (freq > 0) this.tone(freq, step * 0.5, 'triangle', t, 0.05);
        if (i % 4 === 0) this.tone(bass[i / 4], step * 3.6, 'triangle', t, 0.05);
      });
      const totalDuration = melody.length * step;
      this.themeTimeout = setTimeout(scheduleLoop, totalDuration * 1000);
    };
    scheduleLoop();
  }

  stopTheme() {
    this.themePlaying = false;
    if (this.themeTimeout) {
      clearTimeout(this.themeTimeout);
      this.themeTimeout = null;
    }
  }
}
