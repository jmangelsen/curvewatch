import { CURVE } from './config.js';
export const now = () => Date.now();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** Map x linearly from [a,b] to [0,1], clamped. */
export const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
/** Price in SOL per whole token from virtual reserves (both in whole units). */
export const priceOf = (vsol, vtok) => (vtok > 0 ? vsol / vtok : 0);
/** Market cap in SOL (fixed 1B supply). */
export const mcapOf = (vsol, vtok) => priceOf(vsol, vtok) * CURVE.TOTAL_SUPPLY;
/** Bonding curve progress 0..1 from real token reserves remaining (whole tokens). */
export const progressOf = (rtok) => clamp(1 - rtok / CURVE.INITIAL_REAL_TOKENS, 0, 1);
/** Constant-product buy: SOL in (after fee) -> tokens out. */
export function curveBuy(vsol, vtok, solIn, feePct) {
  const s = solIn * (1 - feePct / 100);
  const k = vsol * vtok;
  return vtok - k / (vsol + s);
}
/** Constant-product sell: tokens in -> SOL out (after fee). */
export function curveSell(vsol, vtok, tokIn, feePct) {
  const k = vsol * vtok;
  const out = vsol - k / (vtok + tokIn);
  return out * (1 - feePct / 100);
}
export function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
export const round = (x, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
