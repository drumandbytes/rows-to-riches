// The "Share card": a 1200×630 picture of the current run, drawn on a canvas on demand.
// Loaded only when the button is pressed.

const W = 1200;
const H = 630;
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** card: { company, rows, rate, env, hue, tiles: [[label, value]], prestiges: [[icon, count]], url }. Resolves to a PNG Blob. */
export async function makeShareCard(card) {
  await Promise.all([document.fonts.load('700 80px "Space Grotesk"'), document.fonts.load('600 28px "JetBrains Mono"'), document.fonts.load('400 28px "JetBrains Mono"')]);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const accent = `hsl(${card.hue} 50% 52%)`;

  ctx.fillStyle = "#16181c";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(180, 60, 0, 180, 60, 700);
  glow.addColorStop(0, `hsl(${card.hue} 50% 52% / 0.28)`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Brand
  ctx.fillStyle = "#202328";
  roundRect(ctx, 64, 56, 56, 56, 13);
  ctx.fill();
  ctx.fillStyle = accent;
  for (const [x, y, w] of [[71, 66, 27], [71, 76, 12], [71, 84, 12], [71, 92, 12]]) ctx.fillRect(x, y, w, 5);
  ctx.beginPath();
  ctx.arc(104, 98, 11, 0, Math.PI * 2);
  ctx.fillStyle = "#e3b341";
  ctx.fill();
  ctx.fillStyle = "#e3e5e8";
  ctx.font = '700 38px "Space Grotesk", system-ui, sans-serif';
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Rows to Riches", 140, 98);

  // Company and environment
  ctx.fillStyle = "#b9bec6";
  ctx.font = '500 30px "JetBrains Mono", ui-monospace, monospace';
  const sub = [card.company || "an unnamed data team", card.env].join("  ·  ");
  ctx.fillText(sub.length > 52 ? `${sub.slice(0, 51)}…` : sub, 64, 176);

  // The big number
  ctx.fillStyle = "#f4f5f7";
  let size = 150;
  ctx.font = `800 ${size}px "JetBrains Mono", ui-monospace, monospace`;
  while (ctx.measureText(card.rows).width > W - 128 && size > 60) {
    size -= 6;
    ctx.font = `800 ${size}px "JetBrains Mono", ui-monospace, monospace`;
  }
  ctx.fillText(card.rows, 60, 320);
  ctx.fillStyle = accent;
  ctx.font = '600 34px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(`rows ingested  ·  ${card.rate}/s`, 64, 376);

  // Tiles
  const tiles = card.tiles.slice(0, 4);
  const gap = 20;
  const tw = (W - 128 - gap * (tiles.length - 1)) / Math.max(1, tiles.length);
  tiles.forEach(([label, value], i) => {
    const x = 64 + i * (tw + gap);
    ctx.fillStyle = "#202328";
    roundRect(ctx, x, 424, tw, 112, 16);
    ctx.fill();
    ctx.strokeStyle = "#353a42";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#8d949e";
    ctx.font = '500 22px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(label, x + 22, 464);
    ctx.fillStyle = "#e3e5e8";
    ctx.font = `700 38px "Space Grotesk", system-ui, sans-serif`;
    ctx.fillText(value, x + 22, 512);
  });

  // Footer: prestige counts and the address
  ctx.font = `34px ${EMOJI}`;
  let px = 64;
  for (const [icon, n] of card.prestiges) {
    ctx.fillStyle = "#e3e5e8";
    ctx.fillText(`${icon} ${n}`, px, 596);
    px += ctx.measureText(`${icon} ${n}`).width + 28;
  }
  ctx.fillStyle = "#e3b341";
  ctx.font = '500 26px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = "right";
  ctx.fillText(card.url, W - 64, 594);
  ctx.textAlign = "left";

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
