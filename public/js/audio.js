// Synthesizer for the generative music (composed in music.js) and the sound effects.
// Everything is Web Audio: no files, no licensing. Effects are tuned to the key and
// chord that are playing, so clicking along always sounds in tune.

import { prefs } from "./prefs.js";
import { MOODS as SCORES, MODES, createComposer } from "./music.js";

export const MOODS = Object.fromEntries(Object.entries(SCORES).map(([k, m]) => [k, { label: m.label }]));

let ctx = null;
let master, sfxBus, musicBus, musicIn, reverb, reverbSend, delay, delaySend, noise;
let composer = null;
let pendingMood = null;
let moodName = "";
let envMood = "room";
let nextStepAt = 0;
let timer = 0;

const midiHz = (n) => 440 * 2 ** ((n - 69) / 12);

/** Browsers only allow audio after a user gesture; call this from one. */
export function unlock() {
  if (ctx) {
    if (ctx.state === "suspended" && !document.hidden) ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);

  // Music chain: voices → musicIn → compressor → musicBus (volume) → master,
  // with reverb and delay sends returning into the compressor.
  musicBus = ctx.createGain();
  musicBus.connect(master);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  comp.attack.value = 0.02;
  comp.release.value = 0.3;
  comp.connect(musicBus);
  musicIn = ctx.createGain();
  musicIn.connect(comp);

  reverb = ctx.createConvolver();
  reverb.buffer = impulse(3.2, 2.6);
  reverbSend = ctx.createGain();
  reverbSend.connect(reverb);
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.55;
  reverb.connect(reverbOut).connect(comp);

  delay = ctx.createDelay(2);
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const dTone = ctx.createBiquadFilter();
  dTone.type = "lowpass";
  dTone.frequency.value = 2400;
  delaySend = ctx.createGain();
  delaySend.connect(delay);
  delay.connect(dTone).connect(feedback).connect(delay);
  dTone.connect(comp);

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  applyVolumes();
  if (pendingMood) switchMood(pendingMood);
  nextStepAt = ctx.currentTime + 0.15;
  timer = setInterval(schedule, 50);
  // No point playing to a hidden tab; also saves battery.
  document.addEventListener("visibilitychange", () => (document.hidden ? ctx.suspend() : ctx.resume()));
}

// Stereo noise with an exponential tail: a decent hall without shipping an impulse file.
function impulse(secs, decay) {
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

export function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(prefs.muted ? 0 : prefs.master, t, 0.05);
  sfxBus.gain.setTargetAtTime(prefs.sfx, t, 0.05);
  musicBus.gain.setTargetAtTime(prefs.music * 0.9, t, 0.3);
}

/** The environment's mood; a mood picked in Settings (prefs.mood) overrides it. */
export function setMood(name) {
  envMood = name;
  const want = prefs.mood && prefs.mood !== "auto" ? prefs.mood : name;
  if (want === moodName || !SCORES[want]) return;
  moodName = want;
  if (!ctx) {
    pendingMood = want;
    return;
  }
  // Fade out, then start the new piece from its intro.
  const t = ctx.currentTime;
  musicIn.gain.cancelScheduledValues(t);
  musicIn.gain.setTargetAtTime(0, t, 0.4);
  setTimeout(() => switchMood(want), 1500);
}

function switchMood(name) {
  composer = createComposer(name);
  pendingMood = null;
  nextStepAt = Math.max(nextStepAt, ctx.currentTime + 0.1);
  musicIn.gain.cancelScheduledValues(ctx.currentTime);
  musicIn.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
}

/** Re-applies the mood after the Settings picker changes. */
export const refreshMood = () => setMood(envMood);

// ---- voices -----------------------------------------------------------------------

function env(g, at, { attack = 0.01, peak = 0.2, decay, sustain = 0, release = 0.3, hold = 0 }) {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  if (decay) g.gain.setTargetAtTime(Math.max(peak * sustain, 0.0001), at + attack, decay / 3);
  const end = at + attack + hold;
  g.gain.setTargetAtTime(0.0001, end, release / 4);
  return end + release;
}

function osc(type, freq, at, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  o.detune.value = detune;
  return o;
}

function out(node, { dry = 1, rev = 0, del = 0 }) {
  const g = ctx.createGain();
  g.gain.value = dry;
  node.connect(g).connect(musicIn);
  if (rev) {
    const r = ctx.createGain();
    r.gain.value = rev;
    node.connect(r).connect(reverbSend);
  }
  if (del) {
    const d = ctx.createGain();
    d.gain.value = del;
    node.connect(d).connect(delaySend);
  }
}

const VOICES = {
  // Two detuned saws through a soft lowpass with a slow swell.
  pad(midi, at, len, vel) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 700;
    f.Q.value = 0.3;
    const g = ctx.createGain();
    const end = env(g, at, { attack: Math.min(1.2, len * 0.4), peak: 0.035 * vel, hold: len * 0.7, release: len * 0.6 + 0.4 });
    for (const det of [-7, 7]) {
      const o = osc("sawtooth", midiHz(midi), at, det);
      o.connect(f);
      startStop(o, at, end);
    }
    f.connect(g);
    out(g, { rev: 0.6 });
  },
  // Rhodes-ish: sine body, a quieter octave, and a fast "tine" bell on the attack.
  rhodes(midi, at, len, vel) {
    const g = ctx.createGain();
    const end = env(g, at, { attack: 0.005, peak: 0.11 * vel, decay: 1.4, sustain: 0.25, hold: len, release: 0.6 });
    const body = osc("sine", midiHz(midi), at);
    const oct = osc("sine", midiHz(midi + 12), at);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.25, at);
    og.gain.setTargetAtTime(0.02, at, 0.15);
    body.connect(g);
    oct.connect(og).connect(g);
    for (const o of [body, oct]) startStop(o, at, end);
    out(g, { rev: 0.3, del: 0.12 });
  },
  pluck(midi, at, len, vel) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3200, at);
    f.frequency.setTargetAtTime(700, at, 0.12);
    const g = ctx.createGain();
    const end = env(g, at, { attack: 0.004, peak: 0.1 * vel, decay: 0.5, sustain: 0.15, hold: len * 0.6, release: 0.25 });
    const o = osc("triangle", midiHz(midi), at);
    o.connect(f).connect(g);
    startStop(o, at, end);
    out(g, { rev: 0.25, del: 0.2 });
  },
  square(midi, at, len, vel) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1100;
    const g = ctx.createGain();
    const end = env(g, at, { attack: 0.01, peak: 0.045 * vel, decay: 0.4, sustain: 0.5, hold: len * 0.8, release: 0.2 });
    const o = osc("square", midiHz(midi), at);
    o.connect(f).connect(g);
    startStop(o, at, end);
    out(g, { rev: 0.3, del: 0.25 });
  },
  sine(midi, at, len, vel) {
    const g = ctx.createGain();
    const end = env(g, at, { attack: 0.05, peak: 0.09 * vel, hold: len * 0.8, release: 0.8 });
    const o = osc("sine", midiHz(midi), at);
    const vib = osc("sine", 5, at);
    const vg = ctx.createGain();
    vg.gain.value = 3; // cents-ish wobble via detune
    vib.connect(vg).connect(o.detune);
    o.connect(g);
    startStop(o, at, end);
    startStop(vib, at, end);
    out(g, { rev: 0.5, del: 0.2 });
  },
  // Harmonic partials only (1, 2, 3), so bells stay in tune with the chord.
  bell(midi, at, len, vel) {
    const g = ctx.createGain();
    const end = env(g, at, { attack: 0.003, peak: 0.05 * vel, decay: 2.2, sustain: 0, hold: 0.1, release: 2 });
    [1, 2, 3].forEach((h, k) => {
      const o = osc("sine", midiHz(midi) * h, at);
      const pg = ctx.createGain();
      pg.gain.value = [1, 0.35, 0.12][k];
      o.connect(pg).connect(g);
      startStop(o, at, end);
    });
    out(g, { rev: 0.7 });
  },
  musicbox(midi, at, len, vel) {
    const g = ctx.createGain();
    const end = env(g, at, { attack: 0.002, peak: 0.08 * vel, decay: 1.1, sustain: 0, release: 0.8 });
    const o = osc("sine", midiHz(midi), at);
    const o2 = osc("sine", midiHz(midi + 24), at);
    const g2 = ctx.createGain();
    g2.gain.value = 0.15;
    o.connect(g);
    o2.connect(g2).connect(g);
    startStop(o, at, end);
    startStop(o2, at, end);
    out(g, { rev: 0.5, del: 0.15 });
  },
  bass(midi, at, len, vel) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 420;
    const g = ctx.createGain();
    const end = env(g, at, { attack: 0.008, peak: 0.16 * vel, decay: 0.6, sustain: 0.6, hold: len * 0.85, release: 0.12 });
    const o = osc("triangle", midiHz(midi), at);
    const sub = osc("sine", midiHz(midi), at);
    o.connect(f);
    sub.connect(f);
    f.connect(g);
    startStop(o, at, end);
    startStop(sub, at, end);
    out(g, {});
  },
  arp(midi, at, len, vel) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1800;
    const g = ctx.createGain();
    const end = env(g, at, { attack: 0.004, peak: 0.035 * vel, decay: 0.25, sustain: 0, release: 0.15 });
    const o = osc("triangle", midiHz(midi), at);
    o.connect(f).connect(g);
    startStop(o, at, end);
    out(g, { rev: 0.35, del: 0.3 });
  },
  kick(_, at, _len, vel) {
    const g = ctx.createGain();
    const end = env(g, at, { attack: 0.002, peak: 0.35 * vel, decay: 0.25, release: 0.1 });
    const o = osc("sine", 110, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.18);
    o.connect(g);
    startStop(o, at, end);
    out(g, {});
  },
  snare(_, at, _len, vel) {
    noiseHit(at, { type: "bandpass", freq: 1800, q: 0.8, peak: 0.12 * vel, decay: 0.18, rev: 0.25 });
  },
  hat(_, at, _len, vel) {
    noiseHit(at, { type: "highpass", freq: 7500, q: 0.5, peak: 0.04 * vel, decay: 0.05 });
  },
};

function startStop(o, at, end) {
  o.start(at);
  o.stop(end + 0.05);
}

function noiseHit(at, { type, freq, q, peak, decay, rev = 0 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  const end = env(g, at, { attack: 0.001, peak, decay, release: decay });
  src.connect(f).connect(g);
  src.start(at, Math.random() * 0.5);
  src.stop(end + 0.05);
  out(g, { rev });
}

// Look-ahead scheduler: queue every 16th due in the next 250 ms.
function schedule() {
  if (!composer || prefs.muted || prefs.music === 0 || ctx.state !== "running") {
    nextStepAt = ctx.currentTime + 0.1;
    return;
  }
  const sixteenth = 60 / composer.mood.bpm / 4;
  delay.delayTime.setTargetAtTime(sixteenth * 3, ctx.currentTime, 0.1); // dotted 8th
  while (nextStepAt < ctx.currentTime + 0.25) {
    const { events, swing } = composer.next();
    const at = nextStepAt + swing * sixteenth;
    for (const e of events) {
      const name = e.voice === "lead" ? composer.mood.lead : e.voice;
      VOICES[name](e.midi, at, e.steps * sixteenth, e.vel);
    }
    nextStepAt += sixteenth;
  }
}

// ---- sound effects ------------------------------------------------------------------

// The key and chord the music is in right now (a C-major default before any music).
function key() {
  const m = composer?.mood ?? { root: 60, mode: "ionian" };
  const mode = MODES[m.mode];
  const major = mode[2] === 4;
  const pent = major ? [0, 2, 4, 7, 9] : [0, 3, 5, 7, 10];
  const chord = composer?.chord ?? [0, 4, 7].map((x) => (m.root + x) % 12);
  // Chord tones as MIDI notes in a bright register above the root.
  const tones = chord.map((pc) => m.root + 12 + ((pc - m.root + 120) % 12)).sort((a, b) => a - b);
  return { root: m.root, pent, tones };
}

/** A short tone `offset` seconds from now, on the effects bus. */
function blip(midi, offset, { type = "triangle", peak = 0.08, decay = 0.2, cutoff = 4000 } = {}) {
  const at = ctx.currentTime + offset;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  const end = env(g, at, { attack: 0.003, peak, decay, release: decay });
  const o = osc(type, midiHz(midi), at);
  o.connect(f).connect(g).connect(sfxBus);
  startStop(o, at, end);
}

const SFX = {
  // Climbs the key's pentatonic scale with your combo, so fast clicking plays a run.
  click(k, combo = 0) {
    const c = Math.min(combo, 14);
    blip(k.root + 12 + k.pent[c % 5] + 12 * Math.floor(c / 5), 0, { type: "triangle", peak: 0.05, decay: 0.08, cutoff: 3000 });
  },
  buy(k) {
    blip(k.tones[0] + 12, 0, { peak: 0.07, decay: 0.12 });
    blip(k.tones[2] + 12, 0.06, { peak: 0.06, decay: 0.18 });
  },
  upgrade(k) {
    [...k.tones, k.tones[0] + 12].forEach((m, i) => blip(m + 12, i * 0.05, { type: "sine", peak: 0.06, decay: 0.2 }));
  },
  // Buy played downwards.
  sell(k) {
    blip(k.tones[2] + 12, 0, { peak: 0.06, decay: 0.12 });
    blip(k.tones[0] + 12, 0.06, { peak: 0.05, decay: 0.18 });
  },
  deny(k) {
    blip(k.root - 12, 0, { type: "square", peak: 0.04, decay: 0.08, cutoff: 700 });
  },
  incident(k) {
    blip(k.tones[2] + 12, 0, { type: "square", peak: 0.04, decay: 0.1, cutoff: 2400 });
    blip(k.tones[0] + 12, 0.14, { type: "square", peak: 0.04, decay: 0.1, cutoff: 2400 });
  },
  resolve(k) {
    [0, 1, 2].forEach((i) => blip(k.tones[i] + 12, i * 0.04, { peak: 0.05, decay: 0.25 }));
  },
  achievement(k) {
    [...k.tones, k.tones[0] + 12, k.tones[1] + 12].forEach((m, i) => blip(m + 12, i * 0.07, { type: "sine", peak: 0.055, decay: 0.35 }));
  },
  mail(k) {
    blip(k.tones[2] + 24, 0, { type: "sine", peak: 0.05, decay: 0.3 });
    blip(k.tones[0] + 36, 0.1, { type: "sine", peak: 0.045, decay: 0.4 });
  },
  prestige(k) {
    [0, 1, 2, 3].forEach((i) => blip((k.tones[i] ?? k.tones[0] + 12) + 12 * Math.floor(i / 3), i * 0.09, { type: "sine", peak: 0.07, decay: 0.8 }));
  },
  promote(k) {
    [0, 1, 2, 3, 4, 5].forEach((i) => blip(k.root + 12 + k.pent[i % 5] + 12 * Math.floor(i / 5), i * 0.06, { peak: 0.06, decay: 0.3 }));
  },
};

/** Fire-and-forget sound effect; silent until audio is unlocked. */
export function sfx(name, arg) {
  if (!ctx || prefs.muted || prefs.sfx === 0 || ctx.state !== "running") return;
  SFX[name](key(), arg);
}
