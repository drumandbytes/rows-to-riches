// One animation loop for everything that redraws every frame. requestAnimationFrame follows the
// display, so a 120 Hz phone would run the scene at 120 fps while a 60 Hz monitor runs it at 60.
// This caps it (Settings → Display → Frame rate), eases to 30 fps when the window isn't focused
// (still visible, e.g. on a second monitor) and to 1 fps when the page is hidden.

const subs = new Set();
let cap = 60; // fps; 0 = follow the display
let raf = 0;
let timer = 0;

function tick(t) {
  raf = timer = 0;
  // Frames land a little early or late, so allow ~2 ms of slack against the target gap.
  const fps = document.hidden ? 1 : document.hasFocus() ? cap : Math.min(cap || 30, 30);
  const gap = fps ? 1000 / fps - 2 : 0;
  for (const s of subs) {
    if (s.when && !s.when()) continue;
    if (t - s.last < gap) continue;
    s.last = t;
    s.fn(t);
  }
  schedule();
}

function schedule() {
  if (raf || timer || !subs.size) return;
  if (!document.hidden) raf = requestAnimationFrame(tick);
  else timer = setTimeout(() => tick(performance.now()), 1000);
}

/** Calls fn(t) each frame while when() (if given) is true. Returns a function that stops it. */
export function onFrame(fn, { when } = {}) {
  const sub = { fn, when, last: 0 };
  subs.add(sub);
  schedule();
  return () => subs.delete(sub);
}

export function setFrameCap(fps) {
  cap = fps;
}

// Hiding the page swaps rAF for a timer (and back), so restart the loop.
function restart() {
  cancelAnimationFrame(raf);
  clearTimeout(timer);
  raf = timer = 0;
  schedule();
}
document.addEventListener("visibilitychange", restart);
