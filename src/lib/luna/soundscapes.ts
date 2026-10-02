export type SoundscapeType = "off" | "rain" | "cosmic" | "lofi";

const SOUNDSCAPE_KEY = "luna.soundscape_type";
const VOLUME_KEY = "luna.soundscape_volume";

export function getSavedSoundscape(): SoundscapeType {
  if (typeof window === "undefined") return "off";
  const stored = localStorage.getItem(SOUNDSCAPE_KEY);
  if (stored === "rain" || stored === "cosmic" || stored === "lofi") {
    return stored;
  }
  return "off";
}

function saveSoundscape(type: SoundscapeType): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUNDSCAPE_KEY, type);
}

export function getSavedVolume(): number {
  if (typeof window === "undefined") return 0.35;
  const stored = localStorage.getItem(VOLUME_KEY);
  if (!stored) return 0.35;
  const val = parseFloat(stored);
  return isNaN(val) ? 0.35 : Math.max(0, Math.min(1, val));
}

export function saveVolume(vol: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VOLUME_KEY, vol.toString());
}

class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentType: SoundscapeType = "off";
  private currentVolume = 0.35;
  private activeNodes: { stop?: () => void; disconnect: () => void }[] = [];
  private rainInterval: number | null = null;
  private thunderTimeout: number | null = null;
  private vinylInterval: number | null = null;
  private lofiChordTimer: number | null = null;
  private lofiPulseTimer: number | null = null;

  private initContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const win = window as Window &
        typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const AudioCtxClass = win.AudioContext || win.webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    if (this.ctx && !this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.currentVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  public setVolume(vol: number) {
    this.currentVolume = Math.max(0, Math.min(1, vol));
    saveVolume(this.currentVolume);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.currentVolume, this.ctx.currentTime, 0.05);
    }
  }

  public getVolume(): number {
    return this.currentVolume;
  }

  public getType(): SoundscapeType {
    return this.currentType;
  }

  public play(type: SoundscapeType) {
    if (this.currentType === type && this.activeNodes.length > 0) return;
    this.stopCurrent();
    this.currentType = type;
    saveSoundscape(type);

    if (type === "off") return;

    const ctx = this.initContext();
    if (!ctx || !this.masterGain) return;

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    if (type === "rain") {
      this.startRain(ctx, this.masterGain);
    } else if (type === "cosmic") {
      this.startCosmic(ctx, this.masterGain);
    } else if (type === "lofi") {
      this.startLofi(ctx, this.masterGain);
    }
  }

  public stop() {
    this.play("off");
  }

  private stopCurrent() {
    if (this.rainInterval !== null) {
      window.clearInterval(this.rainInterval);
      this.rainInterval = null;
    }
    if (this.thunderTimeout !== null) {
      window.clearTimeout(this.thunderTimeout);
      this.thunderTimeout = null;
    }
    if (this.vinylInterval !== null) {
      window.clearInterval(this.vinylInterval);
      this.vinylInterval = null;
    }
    if (this.lofiChordTimer !== null) {
      window.clearInterval(this.lofiChordTimer);
      this.lofiChordTimer = null;
    }
    if (this.lofiPulseTimer !== null) {
      window.clearInterval(this.lofiPulseTimer);
      this.lofiPulseTimer = null;
    }

    for (const node of this.activeNodes) {
      try {
        if (node.stop) node.stop();
        node.disconnect();
      } catch {}
    }
    this.activeNodes = [];
  }

  private startRain(ctx: AudioContext, destination: GainNode) {
    const bufferSize = ctx.sampleRate * 4;

    const brownBuffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    const brownLeft = brownBuffer.getChannelData(0);
    const brownRight = brownBuffer.getChannelData(1);
    let lastL = 0.0,
      lastR = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const whiteL = Math.random() * 2 - 1;
      const whiteR = Math.random() * 2 - 1;
      lastL = (lastL + 0.022 * whiteL) / 1.022;
      lastR = (lastR + 0.022 * whiteR) / 1.022;
      brownLeft[i] = lastL * 3.6;
      brownRight[i] = lastR * 3.6;
    }

    const brownSource = ctx.createBufferSource();
    brownSource.buffer = brownBuffer;
    brownSource.loop = true;

    const brownFilter = ctx.createBiquadFilter();
    brownFilter.type = "lowpass";
    brownFilter.frequency.setValueAtTime(450, ctx.currentTime);

    const brownGain = ctx.createGain();
    brownGain.gain.setValueAtTime(0.5, ctx.currentTime);

    brownSource.connect(brownFilter);
    brownFilter.connect(brownGain);
    brownGain.connect(destination);
    brownSource.start();

    const pinkBuffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    const pinkL = pinkBuffer.getChannelData(0);
    const pinkR = pinkBuffer.getChannelData(1);
    let b0L = 0,
      b1L = 0,
      b2L = 0,
      b3L = 0,
      b4L = 0,
      b5L = 0,
      b6L = 0;
    let b0R = 0,
      b1R = 0,
      b2R = 0,
      b3R = 0,
      b4R = 0,
      b5R = 0,
      b6R = 0;
    for (let i = 0; i < bufferSize; i++) {
      const wL = Math.random() * 2 - 1;
      b0L = 0.99886 * b0L + wL * 0.0555179;
      b1L = 0.99332 * b1L + wL * 0.0750759;
      b2L = 0.969 * b2L + wL * 0.153852;
      b3L = 0.8665 * b3L + wL * 0.3104856;
      b4L = 0.55 * b4L + wL * 0.5329522;
      b5L = -0.7616 * b5L - wL * 0.016898;
      pinkL[i] = (b0L + b1L + b2L + b3L + b4L + b5L + b6L + wL * 0.5362) * 0.09;
      b6L = wL * 0.115926;

      const wR = Math.random() * 2 - 1;
      b0R = 0.99886 * b0R + wR * 0.0555179;
      b1R = 0.99332 * b1R + wR * 0.0750759;
      b2R = 0.969 * b2R + wR * 0.153852;
      b3R = 0.8665 * b3R + wR * 0.3104856;
      b4R = 0.55 * b4R + wR * 0.5329522;
      b5R = -0.7616 * b5R - wR * 0.016898;
      pinkR[i] = (b0R + b1R + b2R + b3R + b4R + b5R + b6R + wR * 0.5362) * 0.09;
      b6R = wR * 0.115926;
    }

    const pinkSource = ctx.createBufferSource();
    pinkSource.buffer = pinkBuffer;
    pinkSource.loop = true;

    const pinkFilter = ctx.createBiquadFilter();
    pinkFilter.type = "bandpass";
    pinkFilter.frequency.setValueAtTime(1800, ctx.currentTime);
    pinkFilter.Q.setValueAtTime(0.5, ctx.currentTime);

    const highShelf = ctx.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.setValueAtTime(3200, ctx.currentTime);
    highShelf.gain.setValueAtTime(3.0, ctx.currentTime);

    const rainLfo = ctx.createOscillator();
    const rainLfoGain = ctx.createGain();
    rainLfo.type = "sine";
    rainLfo.frequency.setValueAtTime(0.08, ctx.currentTime);
    rainLfoGain.gain.setValueAtTime(280, ctx.currentTime);
    rainLfo.connect(rainLfoGain);
    rainLfoGain.connect(pinkFilter.frequency);
    rainLfo.start();

    const pinkGain = ctx.createGain();
    pinkGain.gain.setValueAtTime(0.42, ctx.currentTime);

    pinkSource.connect(pinkFilter);
    pinkFilter.connect(highShelf);
    highShelf.connect(pinkGain);
    pinkGain.connect(destination);
    pinkSource.start();

    this.activeNodes.push({
      stop: () => {
        brownSource.stop();
        pinkSource.stop();
        rainLfo.stop();
      },
      disconnect: () => {
        brownSource.disconnect();
        brownFilter.disconnect();
        brownGain.disconnect();
        pinkSource.disconnect();
        pinkFilter.disconnect();
        highShelf.disconnect();
        rainLfo.disconnect();
        rainLfoGain.disconnect();
        pinkGain.disconnect();
      },
    });

    this.rainInterval = window.setInterval(() => {
      if (!this.ctx || !this.masterGain) return;
      try {
        const now = this.ctx.currentTime;
        const dropOsc = this.ctx.createOscillator();
        const dropFilter = this.ctx.createBiquadFilter();
        const dropGain = this.ctx.createGain();

        const startFreq = 1400 + Math.random() * 1200;
        dropOsc.type = "sine";
        dropOsc.frequency.setValueAtTime(startFreq, now);
        dropOsc.frequency.exponentialRampToValueAtTime(280, now + 0.04);

        dropFilter.type = "bandpass";
        dropFilter.frequency.setValueAtTime(startFreq * 0.85, now);
        dropFilter.Q.setValueAtTime(2.5, now);

        const dropVol = 0.015 + Math.random() * 0.035;
        dropGain.gain.setValueAtTime(dropVol, now);
        dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

        dropOsc.connect(dropFilter);
        dropFilter.connect(dropGain);
        dropGain.connect(this.masterGain);

        dropOsc.start(now);
        dropOsc.stop(now + 0.05);
      } catch {}
    }, 110);

    const scheduleThunder = (delayMs: number) => {
      this.thunderTimeout = window.setTimeout(() => {
        if (!this.ctx || !this.masterGain || this.currentType !== "rain") return;
        this.playRollingThunder(this.ctx, this.masterGain);
        scheduleThunder(22000 + Math.random() * 16000);
      }, delayMs);
    };

    scheduleThunder(2200);
  }

  private playRollingThunder(ctx: AudioContext, destination: GainNode) {
    try {
      const now = ctx.currentTime;
      const duration = 8.0;

      const thunderBuf = ctx.createBuffer(2, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
      const dataL = thunderBuf.getChannelData(0);
      const dataR = thunderBuf.getChannelData(1);
      let lastValL = 0,
        lastValR = 0;
      for (let i = 0; i < dataL.length; i++) {
        const whiteL = Math.random() * 2 - 1;
        const whiteR = Math.random() * 2 - 1;
        lastValL = (lastValL + 0.03 * whiteL) / 1.03;
        lastValR = (lastValR + 0.03 * whiteR) / 1.03;
        dataL[i] = lastValL * 4.5;
        dataR[i] = lastValR * 4.5;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = thunderBuf;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(75, now);
      lowpass.frequency.linearRampToValueAtTime(130, now + 1.2);
      lowpass.frequency.linearRampToValueAtTime(60, now + 5.5);

      const thunderGain = ctx.createGain();
      thunderGain.gain.setValueAtTime(0.0001, now);
      thunderGain.gain.linearRampToValueAtTime(0.55, now + 0.7);
      thunderGain.gain.linearRampToValueAtTime(0.32, now + 1.8);
      thunderGain.gain.linearRampToValueAtTime(0.42, now + 2.8);
      thunderGain.gain.linearRampToValueAtTime(0.24, now + 4.2);
      thunderGain.gain.linearRampToValueAtTime(0.18, now + 5.6);
      thunderGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      const subOsc1 = ctx.createOscillator();
      const subOsc2 = ctx.createOscillator();
      const subGain = ctx.createGain();

      subOsc1.type = "sine";
      subOsc1.frequency.setValueAtTime(38, now);
      subOsc1.frequency.linearRampToValueAtTime(28, now + duration);

      subOsc2.type = "sine";
      subOsc2.frequency.setValueAtTime(54, now);
      subOsc2.frequency.linearRampToValueAtTime(42, now + duration);

      subGain.gain.setValueAtTime(0.0001, now);
      subGain.gain.linearRampToValueAtTime(0.35, now + 0.8);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.85);

      noiseSource.connect(lowpass);
      lowpass.connect(thunderGain);
      thunderGain.connect(destination);

      subOsc1.connect(subGain);
      subOsc2.connect(subGain);
      subGain.connect(destination);

      noiseSource.start(now);
      noiseSource.stop(now + duration);
      subOsc1.start(now);
      subOsc1.stop(now + duration);
      subOsc2.start(now);
      subOsc2.stop(now + duration);
    } catch {}
  }

  private startCosmic(ctx: AudioContext, destination: GainNode) {
    const voices = [
      { freq: 55.0, type: "sine" as OscillatorType, gain: 0.28 },
      { freq: 110.0, type: "sine" as OscillatorType, gain: 0.22 },
      { freq: 164.81, type: "sine" as OscillatorType, gain: 0.18 },
      { freq: 220.0, type: "triangle" as OscillatorType, gain: 0.12 },
      { freq: 246.94, type: "sine" as OscillatorType, gain: 0.15 },
      { freq: 329.63, type: "sine" as OscillatorType, gain: 0.12 },
    ];

    const masterCosmicGain = ctx.createGain();
    masterCosmicGain.gain.setValueAtTime(0.3, ctx.currentTime);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(280, ctx.currentTime);
    filter.Q.setValueAtTime(0.7, ctx.currentTime);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(0.045, ctx.currentTime);
    lfoGain.gain.setValueAtTime(140, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const oscs: OscillatorNode[] = [];
    const oscGains: GainNode[] = [];

    voices.forEach((v) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq, ctx.currentTime);
      g.gain.setValueAtTime(v.gain, ctx.currentTime);
      osc.connect(g);
      g.connect(filter);
      osc.start();
      oscs.push(osc);
      oscGains.push(g);

      const chorusOsc = ctx.createOscillator();
      const chorusGain = ctx.createGain();
      chorusOsc.type = "sine";
      chorusOsc.frequency.setValueAtTime(v.freq + (Math.random() - 0.5) * 0.8, ctx.currentTime);
      chorusGain.gain.setValueAtTime(v.gain * 0.7, ctx.currentTime);
      chorusOsc.connect(chorusGain);
      chorusGain.connect(filter);
      chorusOsc.start();
      oscs.push(chorusOsc);
      oscGains.push(chorusGain);
    });

    filter.connect(masterCosmicGain);
    masterCosmicGain.connect(destination);

    this.activeNodes.push({
      stop: () => {
        lfo.stop();
        oscs.forEach((o) => o.stop());
      },
      disconnect: () => {
        lfo.disconnect();
        lfoGain.disconnect();
        oscs.forEach((o) => o.disconnect());
        oscGains.forEach((g) => g.disconnect());
        filter.disconnect();
        masterCosmicGain.disconnect();
      },
    });

    this.vinylInterval = window.setInterval(() => {
      if (Math.random() > 0.5 || !this.ctx || !this.masterGain) return;
      try {
        const now = this.ctx.currentTime;
        const bell = this.ctx.createOscillator();
        const bellGain = this.ctx.createGain();

        const harmonics = [880, 1100, 1320, 1760];
        const pickFreq = harmonics[Math.floor(Math.random() * harmonics.length)];

        bell.type = "sine";
        bell.frequency.setValueAtTime(pickFreq, now);

        bellGain.gain.setValueAtTime(0.0001, now);
        bellGain.gain.linearRampToValueAtTime(0.03, now + 0.12);
        bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);

        bell.connect(bellGain);
        bellGain.connect(this.masterGain);

        bell.start(now);
        bell.stop(now + 3.3);
      } catch {}
    }, 2800);
  }

  private startLofi(ctx: AudioContext, destination: GainNode) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.18;
    }

    const hiss = ctx.createBufferSource();
    hiss.buffer = noiseBuffer;
    hiss.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(1400, ctx.currentTime);
    bandpass.Q.setValueAtTime(1.0, ctx.currentTime);

    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.12, ctx.currentTime);

    hiss.connect(bandpass);
    bandpass.connect(hissGain);
    hissGain.connect(destination);
    hiss.start();

    const wowLfo = ctx.createOscillator();
    const wowGain = ctx.createGain();
    wowLfo.type = "sine";
    wowLfo.frequency.setValueAtTime(0.35, ctx.currentTime);
    wowGain.gain.setValueAtTime(3.5, ctx.currentTime);
    wowLfo.start();

    this.activeNodes.push({
      stop: () => {
        hiss.stop();
        wowLfo.stop();
      },
      disconnect: () => {
        hiss.disconnect();
        bandpass.disconnect();
        hissGain.disconnect();
        wowLfo.disconnect();
        wowGain.disconnect();
      },
    });

    this.vinylInterval = window.setInterval(() => {
      if (Math.random() > 0.4 || !this.ctx || !this.masterGain) return;
      try {
        const popBuffer = this.ctx.createBuffer(1, 80, this.ctx.sampleRate);
        const data = popBuffer.getChannelData(0);
        for (let i = 0; i < 80; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 12);
        }
        const popSource = this.ctx.createBufferSource();
        popSource.buffer = popBuffer;

        const popGain = this.ctx.createGain();
        popGain.gain.setValueAtTime(0.045, this.ctx.currentTime);

        popSource.connect(popGain);
        popGain.connect(this.masterGain);
        popSource.start();
      } catch {}
    }, 380);

    const chords = [
      [130.81, 196.0, 246.94, 293.66, 329.63],
      [110.0, 164.81, 196.0, 246.94, 261.63],
      [146.83, 220.0, 261.63, 329.63, 349.23],
      [98.0, 174.61, 246.94, 329.63, 392.0],
    ];

    let chordIndex = 0;

    const playChord = () => {
      if (!this.ctx || !this.masterGain || this.currentType !== "lofi") return;
      const now = this.ctx.currentTime;
      const currentNotes = chords[chordIndex % chords.length];
      chordIndex++;

      currentNotes.forEach((freq, noteIdx) => {
        if (!this.ctx || !this.masterGain) return;
        const noteOsc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();

        const harmOsc = this.ctx.createOscillator();
        const harmGain = this.ctx.createGain();

        const noteFilter = this.ctx.createBiquadFilter();
        noteFilter.type = "lowpass";
        noteFilter.frequency.setValueAtTime(1200, now);

        const noteStart = now + noteIdx * 0.04;
        const duration = 3.6;

        noteOsc.type = "sine";
        noteOsc.frequency.setValueAtTime(freq, noteStart);
        wowGain.connect(noteOsc.frequency);

        harmOsc.type = "sine";
        harmOsc.frequency.setValueAtTime(freq * 2, noteStart);
        wowGain.connect(harmOsc.frequency);

        noteGain.gain.setValueAtTime(0.0001, noteStart);
        noteGain.gain.linearRampToValueAtTime(0.08, noteStart + 0.04);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);

        harmGain.gain.setValueAtTime(0.0001, noteStart);
        harmGain.gain.linearRampToValueAtTime(0.025, noteStart + 0.03);
        harmGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 1.2);

        noteOsc.connect(noteGain);
        harmOsc.connect(harmGain);
        noteGain.connect(noteFilter);
        harmGain.connect(noteFilter);
        noteFilter.connect(this.masterGain);

        noteOsc.start(noteStart);
        noteOsc.stop(noteStart + duration + 0.1);
        harmOsc.start(noteStart);
        harmOsc.stop(noteStart + 1.3);
      });
    };

    playChord();
    this.lofiChordTimer = window.setInterval(playChord, 3800);

    let beatStep = 0;
    this.lofiPulseTimer = window.setInterval(() => {
      if (!this.ctx || !this.masterGain || this.currentType !== "lofi") return;
      beatStep = (beatStep + 1) % 4;
      if (beatStep === 0 || beatStep === 2) {
        try {
          const now = this.ctx.currentTime;
          const kickOsc = this.ctx.createOscillator();
          const kickFilter = this.ctx.createBiquadFilter();
          const kickGain = this.ctx.createGain();

          kickOsc.type = "sine";
          kickOsc.frequency.setValueAtTime(85, now);
          kickOsc.frequency.exponentialRampToValueAtTime(42, now + 0.12);

          kickFilter.type = "lowpass";
          kickFilter.frequency.setValueAtTime(110, now);

          kickGain.gain.setValueAtTime(0.14, now);
          kickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

          kickOsc.connect(kickFilter);
          kickFilter.connect(kickGain);
          kickGain.connect(this.masterGain);

          kickOsc.start(now);
          kickOsc.stop(now + 0.2);
        } catch {}
      }
    }, 950);
  }
}

let globalEngine: SoundscapeEngine | null = null;

export function getSoundscapeEngine(): SoundscapeEngine {
  if (!globalEngine) {
    globalEngine = new SoundscapeEngine();
    const vol = getSavedVolume();
    globalEngine.setVolume(vol);
  }
  return globalEngine;
}
