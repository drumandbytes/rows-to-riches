// Big numbers. Rows, rates, costs, multipliers and prestige currencies grow without limit,
// far past what a double holds (about 1.8e308); break_infinity's Decimal goes to 1e9e15.
// Counts and levels (sources owned, Big Bangs, Axioms) stay plain numbers.
import Decimal from "./vendor/break_infinity.js";

export { Decimal };
/** A Decimal from a number, numeric string (as saves store them) or Decimal. */
export const big = (x) => (x instanceof Decimal ? x : new Decimal(x ?? 0));
export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);
/** For saves: a finite, non-negative Decimal, or 0 for anything else. */
export function bigSafe(x) {
  if (typeof x === "number" && !Number.isFinite(x)) return ZERO;
  try {
    const d = big(typeof x === "number" || typeof x === "string" || x instanceof Decimal ? x : 0);
    return Number.isFinite(d.mantissa) && Number.isFinite(d.exponent) && d.gte(0) ? d : ZERO;
  } catch {
    return ZERO;
  }
}
export const bigMax = (a, b) => Decimal.max(big(a), big(b));
export const bigMin = (a, b) => Decimal.min(big(a), big(b));
/** Full value up to `cap`, then cap × (x / cap) ** power. */
export const bigSoftcap = (x, cap, power) => (big(x).lte(cap) ? big(x) : big(cap).mul(big(x).div(cap).pow(power)));
