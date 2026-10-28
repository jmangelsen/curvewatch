// In-process gate so one authenticated client cannot pile heavy work onto the 1 vCPU collector.
const last = new Map();

/** True at most once per windowMs for this name. The first call is allowed. */
export function allowHeavy(name, windowMs, now = Date.now()) {
  const prev = last.get(name) || 0;
  if (now - prev < windowMs) return false;
  last.set(name, now);
  return true;
}

export function resetHeavy(name) {
  if (name) last.delete(name);
  else last.clear();
}
