// Updates an element to match new HTML while keeping every node that already matches. Replacing a
// button with an identical new one on each tick is invisible, but if it happens between a finger
// going down and coming up, iOS drops the tap (the touched element is gone), so buttons need several
// taps. Text, attributes and structure that changed are patched in place; the rest is left alone.

export function morph(el, html) {
  const next = document.createElement(el.tagName.toLowerCase());
  next.innerHTML = html;
  patch(el, next);
}

function patch(a, b) {
  const have = a.childNodes;
  const want = b.childNodes;
  for (let i = 0; i < want.length; i++) {
    const x = have[i];
    const y = want[i];
    if (!x) {
      a.append(y.cloneNode(true));
      continue;
    }
    if (x.nodeName !== y.nodeName) {
      x.replaceWith(y.cloneNode(true));
      continue;
    }
    if (y.nodeType === 3) {
      if (x.data !== y.data) x.data = y.data;
      continue;
    }
    if (y.nodeType !== 1) continue;
    for (const { name, value } of [...y.attributes]) if (x.getAttribute(name) !== value) x.setAttribute(name, value);
    for (const { name } of [...x.attributes]) if (!y.hasAttribute(name)) x.removeAttribute(name);
    // A field the player is typing in keeps its value; everything else follows the new markup.
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(x.tagName)) patch(x, y);
  }
  while (have.length > want.length) a.lastChild.remove();
}
