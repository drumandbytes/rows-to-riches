// Generative composer: harmony, voice leading, melody, bass, arpeggio and drums as note
// events. Pure (no Web Audio), so tools/music-audit.js can check thousands of bars for
// clashes. audio.js turns the events into sound.
//
// Rules it follows:
// - Chords are stacked thirds from the mood's mode, in real progressions.
// - The pad moves to whichever inversion is closest to the previous chord.
// - Melody: strong beats (and any note longer than an 8th) are chord tones. Off-beat
//   non-chord tones are only passing or neighbour tones (a step from the previous note,
//   resolved by step), so nothing dissonant is ever held against the pad.
// - Leaps larger than a third are followed by a step back; no tritone leaps.
// - Phrases are 2-bar motifs, repeated with variation and transposed onto the next
//   chord, ending on a held chord tone and a rest.

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  // Lydian dominant: bright, a little strange, still consonant. Good for aliens.
  acoustic: [0, 2, 4, 6, 7, 9, 10],
};

// Drum patterns: 16 steps per bar, "x" = hit, "o" = soft hit.
export const MOODS = {
  room: {
    label: "localhost (lo-fi)", bpm: 76, root: 57, mode: "dorian", sevenths: true, swing: 0.18,
    progressions: [[0, 3, 0, 3], [0, 5, 3, 4], [1, 4, 0, 5], [3, 2, 1, 0]],
    lead: "rhodes", density: 0.42, bass: "root", arp: null, bells: 0,
    drums: { kick: "x.......x.x.....", snare: "....x.......x...", hat: "x.o.x.o.x.o.x.oo" },
  },
  office: {
    label: "dev / staging (office)", bpm: 100, root: 60, mode: "ionian", sevenths: false, swing: 0,
    progressions: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 0], [5, 3, 0, 4]],
    lead: "pluck", density: 0.5, bass: "pop", arp: "up8", bells: 0.05,
    drums: { kick: "x.......x.......", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
  },
  servers: {
    label: "prod (server room)", bpm: 116, root: 57, mode: "aeolian", sevenths: false, swing: 0,
    progressions: [[0, 5, 6, 4], [0, 6, 5, 6], [0, 3, 4, 0], [5, 6, 0, 0]],
    lead: "square", density: 0.36, bass: "pulse", arp: "updown16", bells: 0,
    drums: { kick: "x...x...x...x...", snare: "....x.......x...", hat: "..x...x...x...x." },
  },
  quantum: {
    label: "quantum (bells)", bpm: 84, root: 62, mode: "lydian", sevenths: true, swing: 0,
    progressions: [[0, 1, 0, 1], [0, 1, 4, 0], [5, 1, 0, 0]],
    lead: "bell", density: 0.3, bass: "drone", arp: "up16", bells: 0.25,
    drums: null,
  },
  planet: {
    label: "planetary (horizon)", bpm: 70, root: 55, mode: "mixolydian", sevenths: false, swing: 0,
    progressions: [[0, 6, 3, 0], [0, 3, 6, 0], [3, 6, 0, 0]],
    lead: "sine", density: 0.28, bass: "root", arp: null, bells: 0.12,
    drums: { kick: "x.........x.....", snare: "........x.......", hat: "" },
  },
  // The player's favourite: keep it sparse, slow and bass-free like the original.
  space: {
    label: "orbital / interstellar (space)", bpm: 56, root: 50, mode: "lydian", sevenths: true, swing: 0,
    progressions: [[0, 1, 0, 1], [0, 4, 1, 0], [0, 6, 1, 0]],
    lead: "sine", density: 0.14, bass: "none", arp: null, bells: 0.15,
    drums: null,
  },
  alien: {
    label: "first contact (alien)", bpm: 92, root: 53, mode: "acoustic", sevenths: false, swing: 0.08,
    progressions: [[0, 1, 0, 1], [0, 1, 4, 0], [3, 1, 0, 0]],
    lead: "pluck", density: 0.38, bass: "pulse", arp: "updown8", bells: 0.1,
    drums: { kick: "x.....x...x.....", snare: "....x.......x..o", hat: "x.xxx.x.x.xxx.x." },
  },
  everything: {
    label: "everything (music box)", bpm: 96, root: 65, mode: "ionian", sevenths: false, swing: 0,
    progressions: [[0, 3, 4, 0], [0, 5, 3, 4], [3, 4, 2, 5]],
    lead: "musicbox", density: 0.55, bass: "root", arp: "up8", bells: 0.15,
    drums: null,
  },
};

const mod = (a, n) => ((a % n) + n) % n;

/** MIDI note for a scale index (0 = root, 7 = root an octave up, -1 = leading tone below). */
export function scaleMidi(mood, idx) {
  const mode = MODES[mood.mode];
  return mood.root + mode[mod(idx, mode.length)] + 12 * Math.floor(idx / mode.length);
}

/** Scale indices of the chord on `degree`: stacked thirds, a 7th if the mood uses them. */
export function chordIdx(mood, degree) {
  const tones = [degree, degree + 2, degree + 4];
  if (mood.sevenths) tones.push(degree + 6);
  return tones;
}

export const chordPCs = (mood, degree) => chordIdx(mood, degree).map((i) => mod(scaleMidi(mood, i), 12));

// Closest voicing of the chord to the previous one, within a fixed register.
function voice(mood, degree, prev) {
  const pcs = chordPCs(mood, degree);
  const lo = mood.root - 5;
  const hi = mood.root + 16;
  let best = null;
  const place = (k, acc) => {
    if (k === pcs.length) {
      const notes = [...acc].sort((a, b) => a - b);
      if (notes.at(-1) - notes[0] > 16) return;
      const cost = prev ? notes.reduce((sum, n, j) => sum + Math.abs(n - (prev[j] ?? prev.at(-1))), 0) : Math.abs(notes[0] - mood.root);
      if (!best || cost < best.cost) best = { notes, cost };
      return;
    }
    for (let n = lo; n <= hi; n++) if (mod(n, 12) === pcs[k]) place(k + 1, [...acc, n]);
  };
  place(0, []);
  return best.notes;
}

export function createComposer(moodName, rng = Math.random) {
  const mood = MOODS[moodName];
  const mode = MODES[mood.mode];
  const n = mode.length;
  const pick = (a) => a[Math.floor(rng() * a.length)];
  let step = 0;
  let progression = mood.progressions[0];
  let voicing = null;
  let motif = null;
  let melodyIdx = n + 2; // a third above the upper root
  let breakdown = false;
  let lastMelody = null; // { idx, midi } of the previous melody note
  let holdUntil = -1;

  const melLo = n; // upper root
  const melHi = n * 2 + 4; // a sixth above the octave

  const isChordTone = (idx, degree) => chordIdx(mood, degree).some((c) => mod(c - idx, n) === 0);
  function nearestChordTone(idx, degree, dir) {
    for (let d = 0; d <= n; d++) {
      for (const cand of dir >= 0 ? [idx + d, idx - d] : [idx - d, idx + d]) {
        if (cand >= melLo && cand <= melHi && isChordTone(cand, degree)) return cand;
      }
    }
    return idx;
  }

  // A 2-bar motif: onsets on 8ths (16ths in busy moods), each with a scale-step move.
  function makeMotif() {
    const notes = [];
    const busy = mood.density > 0.45;
    for (let s = 0; s < 32; s += busy && rng() < 0.3 ? 1 : 2) {
      const strong = s % 8 === 0 ? 0.9 : s % 4 === 0 ? 0.6 : 0.35;
      if (rng() < strong * mood.density * 1.6) {
        const r = rng();
        const move = r < 0.55 ? pick([-1, 1]) : r < 0.8 ? pick([-2, 2]) : r < 0.9 ? 0 : pick([-3, 3, -4, 4]);
        notes.push({ s, move });
      }
    }
    // The motif always starts on the downbeat.
    if (!notes.length || notes[0].s !== 0) notes.unshift({ s: 0, move: 0 });
    return notes;
  }

  function vary(m) {
    return m.map((x) => (rng() < 0.25 ? { ...x, move: x.move === 0 ? pick([-1, 1]) : -x.move } : x));
  }

  function newSection() {
    const options = mood.progressions.filter((p) => p !== progression);
    progression = options.length ? pick(options) : progression;
    motif = makeMotif();
    breakdown = mood.drums !== null && rng() < 0.2;
  }

  function melodyEvents(bar, s16, degree, nextDegree) {
    const phraseBar = bar % 4;
    const pos = (phraseBar % 2) * 16 + s16;
    // Bars 1–2: motif; bars 3–4: varied answer. Last half-bar of the phrase rests.
    if (phraseBar === 3 && s16 >= 8) return [];
    if (pos === 0 && phraseBar === 2) motif = vary(motif);
    const note = motif.find((x) => x.s === pos);
    if (!note || step < holdUntil) return [];
    const nextOnset = motif.find((x) => x.s > pos)?.s ?? 32;
    let dur = Math.min(nextOnset - pos, 8);
    const cadence = phraseBar === 3 && s16 < 8 && !motif.some((x) => x.s > pos && x.s < 24);
    let idx = melodyIdx + note.move;
    if (idx > melHi || idx < melLo) idx = melodyIdx - note.move; // turn around at the edges
    // A leap bigger than a third is answered by a step the other way next time.
    const leapedLast = lastMelody && Math.abs(melodyIdx - lastMelody.idx) > 2;
    if (leapedLast) idx = melodyIdx - Math.sign(melodyIdx - lastMelody.idx);
    const strong = s16 % 4 === 0;
    const chordTone = isChordTone(idx, degree);
    // Non-chord tones only as short passing/neighbour tones, by step, and only off the beat.
    const okPassing = !strong && dur <= 2 && Math.abs(idx - melodyIdx) === 1;
    if (!chordTone && !okPassing) idx = nearestChordTone(idx, degree, note.move);
    if (cadence) {
      // End phrases on the root or third of the current chord, held.
      const target = [chordIdx(mood, degree)[0], chordIdx(mood, degree)[1]];
      idx = nearestChordTone(idx, degree, 0);
      if (!target.some((t) => mod(t - idx, n) === 0)) idx = nearestChordTone(idx + 1, degree, 1);
      dur = 8;
    }
    // Keep the line singable: no tritones and nothing wider than a fifth (octaves are fine).
    const prevMidi = scaleMidi(mood, melodyIdx);
    const awkward = (i) => {
      const jump = Math.abs(scaleMidi(mood, i) - prevMidi);
      return jump === 6 || (jump > 7 && jump !== 12);
    };
    if (awkward(idx)) {
      // Closest chord tone to the previous note that isn't awkward; else repeat the previous note.
      const options = [];
      for (let d = 0; d <= n; d++) options.push(melodyIdx + d, melodyIdx - d);
      idx = options.find((i) => i >= melLo && i <= melHi && isChordTone(i, degree) && !awkward(i)) ?? melodyIdx;
    }
    const midi = scaleMidi(mood, idx);
    lastMelody = { idx: melodyIdx, midi: scaleMidi(mood, melodyIdx) };
    melodyIdx = idx;
    holdUntil = step + dur;
    void nextDegree;
    return [{ voice: "lead", midi, steps: dur, vel: strong ? 0.9 : 0.7 }];
  }

  function bassEvents(s16, degree, nextDegree) {
    if (breakdown) return [];
    const root = scaleMidi(mood, chordIdx(mood, degree)[0]) - 24;
    const fifth = scaleMidi(mood, chordIdx(mood, degree)[2]) - 24;
    const nextRoot = scaleMidi(mood, chordIdx(mood, nextDegree)[0]) - 24;
    // Approach tone: the scale step just below/above the next root, on the last 8th.
    const approachIdx = chordIdx(mood, nextDegree)[0] + (nextRoot > root ? -1 : 1);
    const approach = scaleMidi(mood, approachIdx) - 24;
    switch (mood.bass) {
      case "root":
        if (s16 === 0) return [{ voice: "bass", midi: root, steps: 8, vel: 1 }];
        if (s16 === 8) return [{ voice: "bass", midi: fifth, steps: 6, vel: 0.8 }];
        if (s16 === 14 && nextDegree !== degree) return [{ voice: "bass", midi: approach, steps: 2, vel: 0.6 }];
        return [];
      case "pop":
        if (s16 === 0 || s16 === 6) return [{ voice: "bass", midi: root, steps: 2, vel: s16 ? 0.7 : 1 }];
        if (s16 === 8) return [{ voice: "bass", midi: fifth, steps: 4, vel: 0.8 }];
        if (s16 === 14) return [{ voice: "bass", midi: nextDegree !== degree ? approach : root + 12, steps: 2, vel: 0.6 }];
        return [];
      case "pulse":
        if (s16 % 2 === 0) return [{ voice: "bass", midi: s16 % 4 === 2 ? root + 12 : root, steps: 2, vel: s16 % 4 === 0 ? 1 : 0.6 }];
        return [];
      case "drone":
        return s16 === 0 ? [{ voice: "bass", midi: root, steps: 16, vel: 0.8 }] : [];
      default:
        return [];
    }
  }

  function arpEvents(s16) {
    if (!mood.arp || breakdown) return [];
    const rate = mood.arp.endsWith("16") ? 1 : 2;
    if (s16 % rate) return [];
    const tones = voicing.map((x) => x + 12);
    const k = s16 / rate;
    const seq = mood.arp.startsWith("updown") ? [...tones, ...tones.slice(1, -1).reverse()] : tones;
    return [{ voice: "arp", midi: seq[k % seq.length], steps: rate, vel: 0.5 }];
  }

  function drumEvents(s16) {
    if (!mood.drums || breakdown) return [];
    const out = [];
    for (const kind of ["kick", "snare", "hat"]) {
      const c = mood.drums[kind][s16];
      if (c === "x" || c === "o") out.push({ voice: kind, steps: 1, vel: c === "x" ? 1 : 0.5 });
    }
    return out;
  }

  return {
    mood,
    /** Events for the next 16th note; also advances the composer. */
    next() {
      const bar = Math.floor(step / 16);
      const s16 = step % 16;
      if (s16 === 0 && bar % 8 === 0) newSection();
      const degree = progression[bar % progression.length];
      const nextDegree = progression[(bar + 1) % progression.length];
      const events = [];
      // Two bars of pad only when a mood starts: an intro.
      const intro = bar < 2;
      if (s16 === 0) {
        voicing = voice(mood, degree, voicing);
        for (const midi of voicing) events.push({ voice: "pad", midi, steps: 16, vel: 0.8 });
        if (rng() < mood.bells) events.push({ voice: "bell", midi: voicing[1 + Math.floor(rng() * (voicing.length - 1))] + 24, steps: 8, vel: 0.6 });
      }
      if (!intro) {
        events.push(...melodyEvents(bar, s16, degree, nextDegree), ...bassEvents(s16, degree, nextDegree), ...arpEvents(s16), ...drumEvents(s16));
      }
      step++;
      return { events, degree, swing: s16 % 2 === 1 ? mood.swing : 0 };
    },
    /** Pitch classes of the chord sounding now, for in-key sound effects. */
    get chord() {
      const bar = Math.floor(Math.max(0, step - 1) / 16);
      return chordPCs(mood, progression[bar % progression.length]);
    },
  };
}
