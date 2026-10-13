import { config } from './config.js';
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const min = LEVELS[config.logLevel] ?? 20;
function out(level, scope, msg, extra) {
  if (LEVELS[level] < min) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
  (level === 'error' || level === 'warn' ? console.error : console.log)(extra !== undefined ? `${line} ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : line);
}
export const logger = (scope) => ({
  debug: (m, e) => out('debug', scope, m, e),
  info: (m, e) => out('info', scope, m, e),
  warn: (m, e) => out('warn', scope, m, e),
  error: (m, e) => out('error', scope, m, e),
});
