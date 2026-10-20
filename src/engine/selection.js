// Selection decisions that are allowed to affect runner eligibility text without touching the settings fingerprint.
// Curve books, paper exits, scoring and the strategy hash are intentionally not imported here.
import { db } from '../db.js';

/** Study result, not a hunch. Both candidate entries stay off. */
export const SELECTION = {
  hordeDipHold: { enter: false, id: 'H3d', reason: 'H3d falsified: holder growth through the dip did not leave price above the dip at 6 h' },
  nonSolFade: { enter: false, id: 'non-SOL', reason: 'non-SOL deep fades are not selected: median price 24 h later is about 0.10× the first print' },
};

export function selectionBlock(mint) {
  const row = db.prepare("SELECT reason FROM rejects WHERE kind = 'curve' AND mint = ?").get(mint);
  if (row && String(row.reason).toLowerCase().includes('non-sol')) return SELECTION.nonSolFade.reason;
  return null;
}
