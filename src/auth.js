// Dashboard auth. Fail closed: a missing password denies every route registered after /health
// unless the process was started with the explicit local-dev opt-out.
import { createHash, timingSafeEqual } from 'node:crypto';

/** Constant-time compare. Both sides are hashed so a length mismatch cannot return early. */
export function passwordsMatch(given, expected) {
  const a = createHash('sha256').update(String(given ?? ''), 'utf8').digest();
  const b = createHash('sha256').update(String(expected ?? ''), 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** Password half of an HTTP Basic header. The username is ignored. Empty when the header is absent or malformed. */
export function basicPassword(header) {
  const h = String(header || '');
  const space = h.indexOf(' ');
  if (space < 0 || h.slice(0, space).toLowerCase() !== 'basic') return '';
  let decoded = '';
  try { decoded = Buffer.from(h.slice(space + 1).trim(), 'base64').toString('utf8'); } catch { return ''; }
  const i = decoded.indexOf(':');
  return i >= 0 ? decoded.slice(i + 1) : '';
}

/**
 * Install the auth middleware. Routes registered before this (only /health) stay open.
 * A set password always wins. The dev opt-out is ignored when a password is set.
 * Returns 'password' | 'open' | 'locked'.
 */
export function installDashboardAuth(app, { password, allowUnauthenticated, log } = {}) {
  if (password) {
    app.use((req, res, next) => {
      if (passwordsMatch(basicPassword(req.headers.authorization), password)) return next();
      res.set('WWW-Authenticate', 'Basic realm="curvewatch"').status(401).send('auth required');
    });
    return 'password';
  }
  if (allowUnauthenticated) {
    log?.warn('CURVEWATCH_ALLOW_UNAUTHENTICATED=1 and DASHBOARD_PASSWORD is unset: dashboard is open. Local development only.');
    return 'open';
  }
  log?.error('DASHBOARD_PASSWORD is unset. Denying every request except /health. Set DASHBOARD_PASSWORD, or CURVEWATCH_ALLOW_UNAUTHENTICATED=1 for local development only.');
  app.use((req, res) => {
    res.set('WWW-Authenticate', 'Basic realm="curvewatch"').status(401).send('auth required');
  });
  return 'locked';
}
