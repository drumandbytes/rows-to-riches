// First-run walkthrough: a spotlight on one element plus a speech bubble, step by step.
// Steps with `until` wait for the player to do the thing and advance by themselves; every
// step can also be skipped with Next. The page stays clickable throughout.
//
// step: { title, text, target?: () => Element, enter?: () => void, until?: () => boolean, next?: string }

export function createTour(steps, { onEnd } = {}) {
  let i = -1;
  let timer = 0;
  let spot;
  let bubble;

  function end() {
    clearInterval(timer);
    spot?.remove();
    bubble?.remove();
    removeEventListener("keydown", onKey);
    i = -1;
    onEnd?.();
  }

  function onKey(e) {
    if (e.key === "Escape") end();
  }

  function place() {
    const step = steps[i];
    const el = step.target?.();
    const r = el?.getBoundingClientRect();
    const visible = r && r.width && r.height;
    spot.classList.toggle("none", !visible);
    bubble.classList.toggle("center", !visible);
    if (!visible) {
      bubble.style.left = bubble.style.top = "";
      return;
    }
    const pad = 6;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const b = bubble.getBoundingClientRect();
    const gap = 14;
    const below = r.bottom + pad + gap;
    const top = below + b.height < innerHeight - 8 ? below : Math.max(8, r.top - pad - gap - b.height);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - b.width / 2), innerWidth - b.width - 8);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  function show(n) {
    if (n >= steps.length) return end();
    i = n;
    const step = steps[i];
    step.enter?.();
    const last = i === steps.length - 1;
    bubble.innerHTML = `<div class="tour-count">${i + 1} / ${steps.length}</div><h3>${step.title}</h3><p>${step.text}</p>
      <div class="tour-actions"><button type="button" class="tour-skip">${last ? "" : "Skip tour"}</button><button type="button" class="tour-next primary">${step.next ?? (last ? "Let's go" : step.until ? "Skip step" : "Next")}</button></div>`;
    bubble.querySelector(".tour-skip").hidden = last;
    bubble.querySelector(".tour-skip").onclick = end;
    bubble.querySelector(".tour-next").onclick = () => show(i + 1);
    step.target?.()?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    place();
  }

  return {
    get active() {
      return i >= 0;
    },
    start() {
      if (i >= 0) return;
      spot = Object.assign(document.createElement("div"), { className: "tour-spot" });
      bubble = Object.assign(document.createElement("div"), { className: "tour-bubble" });
      bubble.setAttribute("role", "dialog");
      bubble.setAttribute("aria-label", "Walkthrough");
      document.body.append(spot, bubble);
      addEventListener("keydown", onKey);
      show(0);
      // Follows layout changes and scrolling, and notices when a waiting step is done.
      timer = setInterval(() => {
        if (steps[i]?.until?.()) show(i + 1);
        else place();
      }, 200);
    },
    end,
  };
}
