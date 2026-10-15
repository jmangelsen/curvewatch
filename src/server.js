// HTTP API + Server-Sent Events + static dashboard.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { tapeMarks } from './drill.js';
import { runGradBacktest } from './engine/gradBacktest.js';
import { q } from './db.js';
import { datasetStats, calibration, alertStats } from './stats.js';
import * as paper from './engine/paper.js';
import { getSmartList } from './engine/intel.js';
import { logger } from './log.js';
import { notify, tgEnabled } from './engine/telegram.js';
import { buildReport } from './report.js';
import { tradeList, tradeDetail, strategyReport, timeline } from './terminal.js';

const log = logger('http');
const here = path.dirname(fileURLToPath(import.meta.url));

export function startServer({ engine, status, grads, strong, gateView, healthData, fillsView, benchmarks, drill, edgeView, edgeDetail, trackerView, rejectsView }) {
  const app = express();
  app.disable('x-powered-by');

  // Health is unauthenticated so uptime monitors can reach it
  app.get('/health', (req, res) => {
    const s = status();
    res.status(s.healthy ? 200 : 503).json({ ok: s.healthy, feeds: s.feeds.map((f) => ({ name: f.name, healthy: f.healthy })) });
  });

  if (config.dashboardPassword) {
    app.use((req, res, next) => {
      const h = req.headers.authorization || '';
      const [, b64] = h.split(' ');
      const [, pass] = Buffer.from(b64 || '', 'base64').toString().split(':');
      if (pass === config.dashboardPassword) return next();
      res.set('WWW-Authenticate', 'Basic realm="curvewatch"').status(401).send('auth required');
    });
  }

  const cached = (fn, ms) => { let v, t = 0; return (...a) => { if (Date.now() - t > ms) { v = fn(...a); t = Date.now(); } return v; }; };
  const cDataset = cached(datasetStats, 15000);
  const cCal = new Map();
  const cAlertStats = cached(alertStats, 15000);

  app.get('/api/status', (req, res) => res.json(status()));
  app.get('/api/radar', (req, res) => res.json(engine.radar(Number(req.query.limit) || 80)));
  app.get('/api/alerts', (req, res) => {
    const rows = q.recentAlerts.all(Math.min(500, Number(req.query.limit) || 60)).map((a) => {
      const t = engine.getToken(a.mint);
      return { ...a, reasons: JSON.parse(a.reasons || '[]'), flags: JSON.parse(a.flags || '[]'), features: undefined,
        liveMcap: t ? t.mcap : null, livePeak: t?.alertSnap ? t.alertSnap.maxAfter : null, graduatedLive: t?.graduated || false };
    });
    res.json({ rows, stats: cAlertStats() });
  });
  app.get('/api/token/:mint', (req, res) => {
    const d = engine.tokenDetail(req.params.mint);
    if (!d) return res.status(404).json({ error: 'unknown token' });
    res.json(d);
  });
  app.get('/api/paper', (req, res) => {
    res.json({ config: { stopPct: config.paper.stopPct, tp1Multiple: config.paper.tp1Multiple, exitDelaySec: config.paper.exitDelaySec }, open: paper.openPositions(engine.getToken), recent: q.allPapers.all(100).map((r) => ({ ...r, events: JSON.parse(r.events || '[]') })), kill: paper.killRule(), books: paper.books(), market: gateView(), band: config.band, config: config.paper });
  });
  app.get('/api/dataset', (req, res) => res.json(cDataset()));
  app.get('/api/calibration', (req, res) => {
    const cp = Number(req.query.checkpoint) || 120;
    const hit = cCal.get(cp);
    if (hit && Date.now() - hit.t < 30000) return res.json(hit.v);
    const v = calibration(cp); cCal.set(cp, { t: Date.now(), v }); res.json(v);
  });
  app.get('/api/intel', (req, res) => res.json({ ruggers: q.topRuggers.all(25), creators: q.topCreators.all(25), smartWallets: getSmartList(40) }));
  app.get('/api/config', (req, res) => res.json({ scoring: config.scoring, paper: config.paper, killRule: config.killRule, lifecycle: config.lifecycle, tradeSource: config.tradeSource, telegram: !!config.telegram.botToken }));

  // Post-graduation tracker
  app.get('/api/grads', (req, res) => res.json({ ...grads.board(Math.min(200, Number(req.query.limit) || 80)), stats: grads.stats() }));
  app.get('/api/grads/alerts', (req, res) => res.json({ rows: grads.alerts(Math.min(200, Number(req.query.limit) || 40)) }));
  app.get('/api/grads/paper', (req, res) => res.json(grads.paper()));
  app.get('/api/grads/calibration', (req, res) => res.json(grads.calibration()));
  app.get('/api/grads/backtest', (req, res) => { try { res.json(runGradBacktest({ solUsd: grads.solUsd || 100, force: req.query.force === '1' })); } catch (e) { log.warn('backtest', e.stack); res.status(500).json({ error: e.message }); } });
  app.get('/api/grads/token/:mint', (req, res) => { const d = grads.detail(req.params.mint); if (!d) return res.status(404).json({ error: 'not watched' }); res.json(d); });

  app.get('/api/market', (req, res) => res.json(gateView()));
  // Data health, fill realism, benchmarks
  app.get('/api/health', (req, res) => { try { res.json(healthData(req.query.scope === 'all' ? 'all' : 'test')); } catch (e) { log.warn('health view', e.stack); res.status(500).json({ error: e.message }); } });
  app.get('/api/fills', (req, res) => { try { res.json(fillsView({ scope: req.query.scope === 'all' ? 'all' : 'test' })); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get('/api/benchmarks', (req, res) => { try { res.json(benchmarks()); } catch (e) { log.warn('benchmarks', e.stack); res.status(500).json({ error: e.message }); } });

  app.get('/api/edge', (req, res) => { try { res.json(edgeView()); } catch (e) { log.warn('edge', e.stack); res.status(500).json({ error: e.message }); } });
  app.get('/api/edge/:key', (req, res) => { const d = edgeDetail(req.params.key); d ? res.json(d) : res.status(404).json({ error: 'not computed yet' }); });
  app.get('/api/rejects', (req, res) => { try { res.json(rejectsView({ windowH: Math.min(168, Math.max(1, Number(req.query.h) || 24)) })); } catch (e) { log.warn('rejects', e.stack); res.status(500).json({ error: e.message }); } });
  app.get('/api/tracker', (req, res) => { try { res.json(trackerView()); } catch (e) { log.warn('tracker', e.stack); res.status(500).json({ error: e.message }); } });
  app.get('/api/tape/marks', (req, res) => { const mins = Math.min(1440, Math.max(10, Number(req.query.mins) || 1440)); res.json({ since: Date.now() - mins * 60000, marks: tapeMarks(Date.now() - mins * 60000) }); });
  app.get('/api/drill/:key', (req, res) => { try { const d = drill(req.params.key); if (!d) return res.status(404).json({ error: 'unknown tile' }); res.json(d); } catch (e) { log.warn('drill', req.params.key, e.stack); res.status(500).json({ error: e.message }); } });

  // Trade terminal
  const safe = (fn) => (req, res) => { try { const r = fn(req); if (r == null) return res.status(404).json({ error: 'not found' }); res.json(r); } catch (e) { log.warn('terminal', e.message); res.status(500).json({ error: e.message }); } };
  app.get('/api/terminal/trades', safe((req) => tradeList({ book: String(req.query.book || ''), limit: Number(req.query.limit) || 50, before: Number(req.query.before) || 1e15 })));
  app.get('/api/terminal/trade/:id', safe((req) => tradeDetail(req.params.id)));
  app.get('/api/terminal/strategies', safe((req) => strategyReport({ days: Number(req.query.days) || 14 })));
  app.get('/api/terminal/timeline', safe((req) => timeline({ days: Number(req.query.days) || 14 })));

  app.get('/api/report', (req, res) => {
    try { res.json(buildReport({ days: Number(req.query.days) || 14, tzOffsetMin: Number(req.query.tz) || 0 })); }
    catch (e) { log.warn('report failed', e.message); res.status(500).json({ error: 'report failed' }); }
  });

  // Strong signals + Telegram test
  app.get('/api/strong', (req, res) => res.json(strong.view(Math.min(100, Number(req.query.limit) || 30))));
  app.post('/api/telegram/test', (req, res) => {
    if (!tgEnabled()) return res.status(400).json({ ok: false, error: 'Telegram is not configured: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (see scripts/telegram-setup.js).' });
    notify('<b>Curvewatch test</b> · strong signals will arrive in this chat.', 'strong');
    res.json({ ok: true });
  });

  // Live stream
  const clients = new Set();
  app.get('/api/stream', (req, res) => {
    res.set({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });
  const push = (event, data) => { const s = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(s); };
  engine.on('alert', (a) => push('alert', a));
  grads.on('alert', (a) => push('gradAlert', a));
  setInterval(() => { if (clients.size) { push('status', status()); push('radar', engine.radar(60)); } }, 2500);
  setInterval(() => { while (paper.paperEvents.length) push('paper', paper.paperEvents.shift()); while (grads.paperEvents.length) push('gradPaper', grads.paperEvents.shift()); }, 1000);
  setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 20000);

  app.use(express.static(path.join(here, '..', 'public'), { maxAge: '5m' }));
  app.listen(config.port, '0.0.0.0', () => log.info(`dashboard on http://0.0.0.0:${config.port}`));
  return app;
}
