// Plays every mood for a few thousand bars "on paper" and checks the composer's rules.
//   node tools/music-audit.js
import { MOODS, chordPCs, createComposer } from "../public/js/music.js";

const BARS = 2000;
let failures = 0;
const pc = (m) => ((m % 12) + 12) % 12;
const semis = (a, b) => Math.min(pc(a - b), pc(b - a)); // interval class 0..6

for (const name of Object.keys(MOODS)) {
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const c = createComposer(name, rng);
  const stats = { notes: 0, strongNonChord: 0, longNonChord: 0, semitoneHeld: 0, tritoneLeaps: 0, bassOffRoot: 0, leaps: 0 };
  let prevLead = null;
  for (let step = 0; step < BARS * 16; step++) {
    const { events, degree } = c.next();
    const chord = chordPCs(c.mood, degree);
    const s16 = step % 16;
    for (const e of events) {
      if (e.voice === "lead") {
        stats.notes++;
        const ct = chord.includes(pc(e.midi));
        if (!ct && s16 % 4 === 0) stats.strongNonChord++;
        if (!ct && e.steps > 2) stats.longNonChord++;
        // A held non-chord tone a semitone from a chord tone is the classic "sounds wrong".
        if (!ct && e.steps > 2 && chord.some((t) => semis(t, e.midi) === 1)) stats.semitoneHeld++;
        if (prevLead !== null && Math.abs(e.midi - prevLead) === 6) stats.tritoneLeaps++;
        if (prevLead !== null && Math.abs(e.midi - prevLead) > 7 && Math.abs(e.midi - prevLead) !== 12) stats.leaps++;
        prevLead = e.midi;
      }
      if (e.voice === "bass" && s16 === 0 && pc(e.midi) !== chord[0]) stats.bassOffRoot++;
      if (e.voice === "pad" && !chord.includes(pc(e.midi))) stats.padWrong = (stats.padWrong ?? 0) + 1;
    }
  }
  const bad = stats.strongNonChord + stats.longNonChord + stats.semitoneHeld + stats.tritoneLeaps + stats.leaps + stats.bassOffRoot + (stats.padWrong ?? 0);
  failures += bad;
  console.log(`${bad ? "✖" : "✔"} ${name.padEnd(10)} ${JSON.stringify(stats)}`);
}
process.exitCode = failures ? 1 : 0;
