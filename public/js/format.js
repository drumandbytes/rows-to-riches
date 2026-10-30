const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc", "Vg"];
const WORDS = ["", "thousand", "million", "billion", "trillion", "quadrillion", "quintillion", "sextillion", "septillion", "octillion", "nonillion", "decillion", "undecillion", "duodecillion", "tredecillion", "quattuordecillion", "quindecillion", "sexdecillion", "septendecillion", "octodecillion", "novemdecillion", "vigintillion"];

// Menu labels: who writes numbers this way, plus an example.
export const NOTATIONS = {
  suffix: "Finance deck (1.23 M)",
  words: "Board memo (1.23 million … 4.56 novenonagintillion)",
  data: "Storage invoice (1.23 G … 4.56 bronto)",
  scientific: "Data scientist (1.23e6)",
  engineering: "Senior engineer (12.3e6)",
  binary: "Disk vendor (1.16 Gi)",
  hex: "Core dump (0x1.65ap+30)",
  roman: "Legacy mainframe (CXXIII × 10^XLII)",
  letters: "Idle-game veteran (1.23 aa)",
  log: "Back of the envelope (e9.09)",
};

// IEC binary prefixes (powers of 1024), then plain powers of two.
const IEC = ["", "Ki", "Mi", "Gi", "Ti", "Pi", "Ei", "Zi", "Yi", "Ri", "Qi"];

function roman(k) {
  const table = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, sym] of table) for (; k >= v; k -= v) out += sym;
  return out;
}

// Fancy formats for n ≥ 1e6; null means "not this one".
const FANCY = {
  binary(n) {
    const e = Math.floor(Math.log2(n));
    const k = Math.floor(e / 10);
    return k < IEC.length ? `${(n / 1024 ** k).toFixed(2)} ${IEC[k]}` : `${(n / 2 ** e).toFixed(2)} × 2^${e}`;
  },
  hex(n) {
    let e = Math.floor(Math.log2(n));
    let frac = Math.round((n / 2 ** e - 1) * 4096);
    if (frac === 4096) [frac, e] = [0, e + 1];
    return `0x1.${frac.toString(16).padStart(3, "0")}p+${e}`;
  },
  roman(n, exp) {
    // Three significant digits as a numeral, times a power of ten that is also a numeral.
    const digits = Math.round(n / 10 ** (exp - 2));
    return `${roman(digits)} × 10^${roman(exp - 2)}`;
  },
  letters(n, exp) {
    const tier = Math.floor(exp / 3);
    const mantissa = (n / 1000 ** tier).toFixed(2);
    if (tier <= 4) return `${mantissa} ${["", "K", "M", "B", "T"][tier]}`;
    const i = tier - 5;
    return `${mantissa} ${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`;
  },
  log: (n) => `e${Math.log10(n).toFixed(2)}`,
};

// Conway–Wechsler names past vigintillion: 10^(3n+3) is units + tens + "illion", with the
// units prefix changing its ending to suit the tens word that follows ("tres", "sex",
// "septem", "noven"...). Covers everything up to 10^303 (centillion).
const CW_UNITS = ["", "un", "duo", "tre", "quattuor", "quin", "se", "septe", "octo", "nove"];
const CW_TENS = [
  ["", ""], ["deci", "n"], ["viginti", "ms"], ["triginta", "ns"], ["quadraginta", "ns"],
  ["quinquaginta", "ns"], ["sexaginta", "n"], ["septuaginta", "n"], ["octoginta", "mx"], ["nonaginta", ""],
];
export function conwayWechsler(n) {
  if (n === 100) return "centillion";
  const [tens, marks] = CW_TENS[Math.floor(n / 10)];
  let unit = CW_UNITS[n % 10];
  if (unit === "tre" && /[sx]/.test(marks)) unit = "tres";
  else if (unit === "se") unit = marks.includes("x") ? "sex" : marks.includes("s") ? "ses" : "se";
  else if (unit === "septe" || unit === "nove") unit += marks.includes("m") ? "m" : marks.includes("n") ? "n" : "";
  return `${unit}${tens}`.replace(/[aeiou]$/, "") + "illion";
}

// SI prefixes for data, then the unofficial joke ones, then scientific.
const DATA = ["", "k", "M", "G", "T", "P", "E", "Z", "Y", "R", "Q", "bronto", "geop"];

let notation = "suffix";
export const setNotation = (mode) => (notation = NOTATIONS[mode] ? mode : "suffix");

export function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) return "∞";
  if (n < 0) return "-" + fmt(-n, digits);
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toLocaleString("en-US");
  if (n < 1e6) return Math.floor(n).toLocaleString("en-US");
  const exp = Math.floor(Math.log10(n));
  const tier = Math.floor(exp / 3);
  if (FANCY[notation]) return FANCY[notation](n, exp);
  const mantissa = (n / 1000 ** tier).toFixed(digits);
  if (notation === "engineering") return `${mantissa}e${tier * 3}`;
  if (notation === "words" && tier <= 101) return `${mantissa} ${tier < WORDS.length ? WORDS[tier] : conwayWechsler(tier - 1)}`;
  if (notation === "data" && tier < DATA.length) return `${mantissa} ${DATA[tier]}`;
  // Suffixes run out at vigintillion; past that (and for "scientific") it's scientific.
  if (notation === "suffix" && tier < SUFFIXES.length) return `${mantissa} ${SUFFIXES[tier]}`;
  return `${(n / 10 ** exp).toFixed(digits)}e${exp}`;
}

export function fmtDuration(secs) {
  secs = Math.max(0, Math.floor(secs));
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
