// Curvewatch dashboard — vanilla JS, no build step.
const API = (window.CURVEWATCH_API ?? '').replace(/\/$/, '');
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (x, d = 1) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (x, d = 1) => (x == null ? '–' : `${n(x, d)}%`);
const signed = (x, d = 1, suf = '') => (x == null ? '–' : `${x > 0 ? '+' : ''}${n(x, d)}${suf}`);
const short = (w) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : '–');
const age = (s) => { s = Math.max(0, s); return s < 60 ? `${Math.floor(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`; };
const ago = (t) => age((Date.now() - t) / 1000);
const cls = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : 'muted');
const get = (p) => fetch(API + p, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

const S = { status: null, radar: null, alerts: null, paper: null, dataset: null, cal: null, intel: null, tab: 'live', seenAlerts: new Set(), firstAlertLoad: true };

// ---------- theme ----------
const root = document.documentElement;
root.dataset.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
$('#themeBtn').onclick = () => { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; drawRadar(); renderPerf(); renderIntel(); };

// ---------- tabs ----------
document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
  S.tab = b.dataset.tab;
  document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', x === b));
  document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.id !== `tab-${S.tab}`));
  if (S.tab === 'perf') loadPerf(); if (S.tab === 'intel') loadIntel(); if (S.tab === 'live') requestAnimationFrame(drawRadar);
});

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200); }

// ---------- header + KPIs ----------
function renderStatus() {
  const s = S.status; if (!s) return;
  $('#feeds').innerHTML = s.feeds.map((f) => `<span class="pill" title="${esc(f.lastError || 'ok')}"><i class="led ${f.healthy ? 'on' : ''}"></i>${f.name} ${f.name.startsWith('rpc') ? `${n(f.evPerSec, 0)} ev/s` : `${n(f.secSinceMessage, 0)}s`}</span>`).join('');
  const k = s.kill;
  $('#legMid').textContent = `50–${s.alertScore - 1}`; $('#legHi').textContent = `≥ ${s.alertScore} (alert zone)`;
  const kb = $('#killBadge'); kb.className = `kill-badge ${k.status}`; kb.textContent = k.status === 'COLLECTING' ? `KILL RULE · ${k.n}/${k.needed}` : `KILL RULE · ${k.status}`;
  const e = s.engine;
  const kp = [
    ['Launches / min', n(e.launchesPerMin, 1), `${n(e.launches1h, 0)} in last hour`],
    ['Tracking now', n(e.tracked, 0), `${S.radar ? S.radar.activeCount : '–'} on active curve`],
    ['Graduations 1h', n(e.grads1h, 0), e.launches1h ? `${pct((e.grads1h / e.launches1h) * 100, 2)} of launches` : '–'],
    ['Alerts', n(e.alerts, 0), `score ≥ ${s.alertScore}`],
    ['Paper P&L', `<span class="${cls(k.totalPnlSol)}">${signed(k.totalPnlSol, 3)}</span>`, 'SOL, closed trades'],
    ['Expectancy', `<span class="${cls(k.expectancyPct)}">${k.n ? signed(k.expectancyPct, 1, '%') : '–'}</span>`, k.n > 1 ? `95% CI ${signed(k.ciLowPct, 0)} … ${signed(k.ciHighPct, 0)}` : 'per trade, after costs'],
  ];
  $('#kpis').innerHTML = kp.map(([l, v, sub]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${sub}</div></div>`).join('');
}

// ---------- board ----------
function scoreBar(sc, reject) {
  if (reject) return `<span class="reject" title="${esc(reject)}">✕ ${esc(reject.length > 26 ? reject.slice(0, 25) + '…' : reject)}</span>`;
  const c = sc >= (S.status?.alertScore ?? 72) ? 'hi' : sc >= 50 ? 'mid' : '';
  return `<div class="scorecell"><div class="bar score ${c}"><i style="width:${Math.min(100, sc)}%"></i></div>${n(sc, 0)}</div>`;
}
function renderBoard() {
  const r = S.radar; if (!r) return;
  $('#boardHint').textContent = `${r.activeCount} tokens on active curve · top ${Math.min(30, r.rows.length)} by score`;
  const rows = r.rows.slice(0, 30);
  $('#board tbody').innerHTML = rows.length ? rows.map((t) => `
    <tr data-mint="${t.mint}">
      <td><div class="tok"><span class="sym">${esc(t.symbol || '?')}</span><small>${esc(t.name)}</small></div></td>
      <td class="num">${age(t.ageSec)}</td>
      <td class="num">${n(t.mcapSol, 1)}</td>
      <td><div class="bar"><i style="width:${Math.min(100, t.progressPct)}%"></i></div></td>
      <td class="num">${t.buyers}</td>
      <td class="num ${cls(t.f.netSolPerMin)}">${signed(t.f.netSolPerMin, 2)}</td>
      <td class="num ${cls(t.f.flow60Sol)}">${signed(t.f.flow60Sol, 2)}</td>
      <td class="num">${pct(t.f.top10Pct, 0)}</td>
      <td class="num ${t.f.bundlePct >= 25 ? 'down' : ''}">${pct(t.f.bundlePct, 0)}</td>
      <td>${scoreBar(t.score ?? 0, t.reject)}</td>
      <td class="faint" style="max-width:240px;overflow:hidden;text-overflow:ellipsis">${esc((t.reasons || []).slice(0, 2).join(' · ') || (t.flags || []).slice(0, 2).join(' · '))}</td>
    </tr>`).join('') : `<tr><td colspan="11"><div class="empty"><strong>Waiting for launches</strong>New tokens appear here within seconds of creation.</div></td></tr>`;
}
$('#board').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-mint]'); if (tr) openDrawer(tr.dataset.mint); });

// ---------- alerts ----------
function renderAlerts() {
  const a = S.alerts; if (!a) return;
  const st = a.stats;
  $('#alertHint').textContent = st.finalized ? `${st.finalized} labeled · ${pct(st.hit2xPct, 0)} hit 2x · ${pct(st.gradPct, 0)} graduated` : 'outcomes are labeled 1h after each alert';
  if (!a.rows.length) { $('#alerts').innerHTML = `<div class="empty"><strong>No alerts yet</strong>Alerts fire when a token clears every hard filter and scores ≥ ${S.status?.alertScore ?? 72}. Expect a few per hour.</div>`; return; }
  $('#alerts').innerHTML = a.rows.map((x) => {
    const peak = x.max_multiple ?? (x.livePeak ? x.livePeak / x.mcap : null);
    const nowM = x.liveMcap ? x.liveMcap / x.mcap : x.mcap_1h ? x.mcap_1h / x.mcap : null;
    const fresh = !S.firstAlertLoad && !S.seenAlerts.has(x.id);
    S.seenAlerts.add(x.id);
    return `<div class="alert ${fresh ? 'fresh' : ''}" data-mint="${x.mint}">
      <div class="alert-top"><span class="score-badge">${n(x.score, 0)}</span><span class="sym">${esc(x.symbol || '?')}</span><span class="name">${esc(x.name || '')}</span><span class="when">${ago(x.ts)} ago</span></div>
      <div class="alert-meta"><span>alert ${n(x.mcap, 1)} SOL</span><span>age ${age(x.age_sec)}</span><span>curve ${pct(x.progress, 0)}</span>
        <span>peak <b class="mult ${peak >= 2 ? 'up' : ''}">${peak ? n(peak, 2) + '×' : '–'}</b></span>
        <span>${x.finalized ? '1h' : 'now'} <b class="mult ${cls((nowM ?? 1) - 1)}">${nowM ? n(nowM, 2) + '×' : '–'}</b></span>
        ${x.graduated || x.graduatedLive ? '<span class="up">graduated</span>' : ''}</div>
      <div class="chips">${(x.reasons || []).slice(0, 3).map((r) => `<span class="chip">${esc(r)}</span>`).join('')}${(x.flags || []).slice(0, 2).map((r) => `<span class="chip warn">${esc(r)}</span>`).join('')}</div>
    </div>`;
  }).join('');
  S.firstAlertLoad = false;
}
$('#alerts').addEventListener('click', (e) => { const d = e.target.closest('[data-mint]'); if (d) openDrawer(d.dataset.mint); });

// ---------- radar ----------
const cv = $('#radar'); const ctx = cv.getContext('2d');
let radarPts = []; let sweep = 0; let hover = null;
function css(v) { return getComputedStyle(root).getPropertyValue(v).trim(); }
function drawRadar() {
  if (S.tab !== 'live') return;
  const dpr = devicePixelRatio || 1; const w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) / 2 - 22;
  const grid = css('--grid'), faint = css('--text-faint'), acc = css('--accent'), info = css('--info');
  ctx.lineWidth = 1; ctx.strokeStyle = grid; ctx.fillStyle = faint; ctx.font = '11px Geist Mono, monospace';
  [0.25, 0.5, 0.75, 1].forEach((f) => { ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2); ctx.stroke(); ctx.fillText(`${f * 100}%`, cx + 4, cy - R * f + 12); });
  for (let m = 0; m < 15; m += 1) {
    const a = -Math.PI / 2 + (m / 15) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.strokeStyle = m % 5 === 0 ? grid : 'transparent'; ctx.stroke();
    if (m % 5 === 0) ctx.fillText(`${m}m`, cx + Math.cos(a) * (R + 10) - 8, cy + Math.sin(a) * (R + 10) + 4);
  }
  // graduation ring
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = acc; ctx.globalAlpha = .35; ctx.stroke(); ctx.globalAlpha = 1;
  // sweep
  const sa = -Math.PI / 2 + sweep;
  const g = ctx.createConicGradient ? ctx.createConicGradient(sa - 0.6, cx, cy) : null;
  if (g) { g.addColorStop(0, 'transparent'); g.addColorStop(0.095, acc + '22'); g.addColorStop(0.0955, 'transparent'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); }
  // points
  radarPts = [];
  const rows = S.radar?.rows || [];
  const alertScore = S.status?.alertScore ?? 72;
  for (const t of rows) {
    const a = -Math.PI / 2 + Math.min(1, t.ageSec / 900) * Math.PI * 2;
    const r = R * Math.max(0.03, Math.min(1, t.progressPct / 100));
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    const size = 2.5 + Math.min(9, Math.sqrt(t.buyers || 0) * 0.9);
    const sc = t.reject ? -1 : t.score ?? 0;
    const col = sc >= alertScore ? acc : sc >= 50 ? info : faint;
    ctx.globalAlpha = sc < 0 ? 0.28 : sc >= 50 ? 1 : 0.6;
    if (sc >= alertScore) { ctx.beginPath(); ctx.arc(x, y, size + 5, 0, Math.PI * 2); ctx.fillStyle = acc + '30'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 1;
    radarPts.push({ x, y, s: size + 4, t, sc, size });
  }
  // Labels: highest scores first, skip any label that would collide with one already drawn
  const boxes = [];
  ctx.font = '11px Geist Mono, monospace'; ctx.fillStyle = css('--text-muted');
  for (const p of [...radarPts].filter((p) => p.sc >= 50).sort((a, b) => b.sc - a.sc).slice(0, 12)) {
    const label = (p.t.symbol || '').slice(0, 10); const lw = ctx.measureText(label).width;
    const bx = p.x + p.size + 4, by = p.y - 7, box = [bx - 2, by - 2, bx + lw + 2, by + 14];
    if (boxes.some((o) => !(box[2] < o[0] || box[0] > o[2] || box[3] < o[1] || box[1] > o[3]))) continue;
    boxes.push(box); ctx.fillText(label, bx, p.y + 4);
  }
  if (hover) {
    const t = hover.t, bw = 196, bh = 64;
    let bx = hover.x + 12, by = hover.y - bh - 8; if (bx + bw > w) bx = hover.x - bw - 12; if (by < 0) by = hover.y + 12;
    ctx.fillStyle = css('--surface-3'); ctx.strokeStyle = css('--border'); ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = css('--text'); ctx.font = '600 12px Geist, sans-serif'; ctx.fillText(`${t.symbol} · score ${t.reject ? '✕' : n(t.score, 0)}`, bx + 10, by + 18);
    ctx.font = '11px Geist Mono, monospace'; ctx.fillStyle = css('--text-muted');
    ctx.fillText(`${n(t.mcapSol, 1)} SOL · curve ${n(t.progressPct, 0)}%`, bx + 10, by + 36);
    ctx.fillText(`${t.buyers} buyers · age ${age(t.ageSec)}`, bx + 10, by + 52);
  }
}
function radarLoop() { sweep = (sweep + 0.012) % (Math.PI * 2); drawRadar(); requestAnimationFrame(radarLoop); }
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(radarLoop);
const hit = (e) => { const b = cv.getBoundingClientRect(); const x = e.clientX - b.left, y = e.clientY - b.top; let best = null, bd = 1e9; for (const p of radarPts) { const d = Math.hypot(p.x - x, p.y - y); if (d < p.s + 4 && d < bd) { bd = d; best = p; } } return best; };
cv.addEventListener('mousemove', (e) => { hover = hit(e); cv.style.cursor = hover ? 'pointer' : 'crosshair'; drawRadar(); });
cv.addEventListener('mouseleave', () => { hover = null; drawRadar(); });
cv.addEventListener('click', (e) => { const p = hit(e); if (p) openDrawer(p.t.mint); });
addEventListener('resize', drawRadar);

// ---------- charts (SVG) ----------
function lineChart(el, pts, { yFmt = (v) => n(v, 2), color = css('--accent'), zero = true, h = 220 } = {}) {
  const w = el.clientWidth || 600;
  if (pts.length < 2) { el.innerHTML = `<div class="empty"><strong>Not enough closed trades yet</strong>The equity curve appears after the first two paper trades close.</div>`; return; }
  const P = { l: 52, r: 12, t: 10, b: 24 };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let y0 = Math.min(...ys, zero ? 0 : Infinity), y1 = Math.max(...ys, zero ? 0 : -Infinity); if (y0 === y1) { y0 -= 1; y1 += 1; }
  const X = (x) => P.l + ((x - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (w - P.l - P.r);
  const Y = (y) => P.t + (1 - (y - y0) / (y1 - y0)) * (h - P.t - P.b);
  const ticks = [y0, (y0 + y1) / 2, y1];
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" height="${h}">
    <g class="axis">${ticks.map((t) => `<line class="gridline" x1="${P.l}" x2="${w - P.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end">${yFmt(t)}</text>`).join('')}
    ${zero ? `<line x1="${P.l}" x2="${w - P.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="${css('--text-faint')}" stroke-dasharray="3 3"/>` : ''}
    <text x="${P.l}" y="${h - 6}">${new Date(xs[0]).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</text>
    <text x="${w - P.r}" y="${h - 6}" text-anchor="end">${new Date(xs[xs.length - 1]).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</text></g>
    <path d="${d}L${X(xs[xs.length - 1])},${Y(Math.max(y0, 0))}L${X(xs[0])},${Y(Math.max(y0, 0))}Z" fill="${color}" opacity=".08"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.8"/></svg>`;
}
function barsChart(el, cats, series, { h = 240, yMax = null, yFmt = (v) => `${n(v, 0)}%`, labels = null } = {}) {
  const w = el.clientWidth || 600, P = { l: 44, r: 8, t: 14, b: 40 };
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  const top = yMax ?? Math.max(1, ...all) * 1.15;
  const bw = (w - P.l - P.r) / cats.length, inner = bw * 0.72, sw = inner / series.length;
  const Y = (v) => P.t + (1 - v / top) * (h - P.t - P.b);
  let out = `<svg viewBox="0 0 ${w} ${h}" height="${h}"><g class="axis">`;
  [0, top / 2, top].forEach((t) => (out += `<line class="gridline" x1="${P.l}" x2="${w - P.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${P.l - 6}" y="${Y(t) + 4}" text-anchor="end">${yFmt(t)}</text>`));
  cats.forEach((c, i) => {
    const x0 = P.l + i * bw + (bw - inner) / 2;
    series.forEach((s, j) => { const v = s.values[i]; if (v == null) return; out += `<rect x="${x0 + j * sw}" y="${Y(v)}" width="${Math.max(1, sw - 2)}" height="${Math.max(0, Y(0) - Y(v))}" rx="2" fill="${s.color}"><title>${s.name}: ${yFmt(v)}</title></rect>`; });
    out += `<text x="${P.l + i * bw + bw / 2}" y="${h - 22}" text-anchor="middle">${c}</text>`;
    if (labels) out += `<text x="${P.l + i * bw + bw / 2}" y="${h - 8}" text-anchor="middle" opacity=".7">${labels[i]}</text>`;
  });
  return (el.innerHTML = out + '</g></svg>');
}

// ---------- performance ----------
async function loadPerf() {
  try { [S.paper, S.cal] = await Promise.all([get('/api/paper'), get(`/api/calibration?checkpoint=${$('#cpSel').value}`)]); renderPerf(); } catch (e) { console.warn(e); }
}
$('#cpSel').onchange = loadPerf;
function renderPerf() {
  if (!S.paper) return;
  const k = S.paper.kill, cfg = S.paper.config;
  const color = { PASS: 'up', FAIL: 'down', MARGINAL: 'acc', COLLECTING: 'acc' }[k.status];
  const verdict = {
    COLLECTING: `Collecting evidence: ${k.n} of ${k.needed} closed trades. No verdict until the sample is large enough.`,
    PASS: 'The 95% confidence interval for average return per trade is entirely above zero after all costs. The edge is measurable; keep sizing small and keep checking.',
    MARGINAL: 'Average return per trade is positive, but the confidence interval still crosses zero. Not proven. Keep paper trading and tighten the filters.',
    FAIL: 'Average return per trade is at or below zero after costs. Stop, or change the strategy before risking money.',
  }[k.status];
  const lo = Math.min(-50, k.ciLowPct ?? 0), hi = Math.max(50, k.ciHighPct ?? 0);
  const sx = (v) => 10 + ((v - lo) / (hi - lo)) * 280;
  $('#kill').innerHTML = `
    <div class="kill-status ${color}">${k.status}</div>
    ${k.status === 'COLLECTING' ? `<div class="progress"><i style="width:${Math.min(100, (k.n / k.needed) * 100)}%"></i></div>` : ''}
    <div class="kill-grid">
      <div><div class="label">Expectancy / trade</div><div class="value ${cls(k.expectancyPct)}">${k.n ? signed(k.expectancyPct, 1, '%') : '–'}</div></div>
      <div><div class="label">Win rate</div><div class="value">${k.n ? pct(k.winRatePct, 0) : '–'}</div></div>
      <div><div class="label">Profit factor</div><div class="value">${k.profitFactor != null ? n(k.profitFactor, 2) : '–'}</div></div>
      <div><div class="label">Total P&amp;L</div><div class="value ${cls(k.totalPnlSol)}">${signed(k.totalPnlSol, 3)} SOL</div></div>
      <div><div class="label">Best / worst</div><div class="value">${k.n ? `${signed(k.bestPct, 0, '%')} / ${signed(k.worstPct, 0, '%')}` : '–'}</div></div>
      <div><div class="label">Trades in window</div><div class="value">${k.n}</div></div>
    </div>
    <div class="ci"><svg viewBox="0 0 300 56"><line x1="10" x2="290" y1="28" y2="28" stroke="${css('--border')}"/>
      <line x1="${sx(0)}" x2="${sx(0)}" y1="12" y2="44" stroke="${css('--text-faint')}" stroke-dasharray="3 3"/>
      ${k.n > 1 ? `<line x1="${sx(k.ciLowPct)}" x2="${sx(k.ciHighPct)}" y1="28" y2="28" stroke="${css(color === 'up' ? '--up' : color === 'down' ? '--down' : '--accent')}" stroke-width="6" stroke-linecap="round" opacity=".55"/>
      <circle cx="${sx(k.expectancyPct)}" cy="28" r="5" fill="${css('--text')}"/>` : ''}
      <text x="${sx(0)}" y="54" text-anchor="middle" font-size="10" fill="${css('--text-faint')}" font-family="Geist Mono">0%</text></svg></div>
    <p class="kill-note">${verdict}<br/>Model: ${cfg.sizeSol} SOL per alert, entry ${cfg.entryDelaySec}s after the alert at the live curve price, ${cfg.feePct}% fee each side, +${cfg.extraSlippagePct}% slippage; sell ${cfg.tp1Fraction * 100}% at ${cfg.tp1Multiple}×, ${cfg.trailPct}% trailing stop, −${cfg.stopPct}% hard stop, ${cfg.maxHoldMin} min max hold.</p>`;
  $('#eqHint').textContent = `${k.allTrades} closed · cumulative SOL`;
  lineChart($('#equity'), k.equity.map((e) => [e.t, e.eq]), { yFmt: (v) => n(v, 2), color: css(k.totalPnlSol >= 0 ? '--up' : '--down') });

  const all = [...S.paper.open.map((p) => ({ ...p, status: 'open' })), ...S.paper.recent.filter((r) => r.status !== 'open')];
  $('#posHint').textContent = `${S.paper.open.length} open`;
  $('#positions tbody').innerHTML = all.length ? all.slice(0, 60).map((p) => {
    const pnl = p.status === 'open' ? p.markPct : p.pnl_pct;
    return `<tr data-mint="${p.mint}"><td><span class="sym">${esc(p.symbol)}</span></td><td>${p.status === 'open' ? '<span class="acc">open</span>' : p.status === 'void' ? '<span class="faint">void</span>' : 'closed'}</td>
      <td class="num">${n(p.entryMcap ?? p.entry_mcap, 1)}</td><td class="num">${p.status === 'open' ? n(p.mcap, 1) : n((p.events || []).slice(-1)[0]?.mcap, 1)}</td>
      <td class="num ${cls(pnl)}">${signed(pnl, 1, '%')}</td><td class="faint">${esc(p.exit_reason || (p.tp1Done ? 'TP1 taken' : ''))}</td><td class="num faint">${ago(p.entryTs ?? p.entry_ts)} ago</td></tr>`;
  }).join('') : `<tr><td colspan="7"><div class="empty"><strong>No paper trades yet</strong>Each alert opens a simulated ${cfg.sizeSol} SOL position ${cfg.entryDelaySec}s later.</div></td></tr>`;

  const c = S.cal;
  if (c) {
    const bk = [...c.buckets.filter((b) => b.n > 0), { ...c.rejected, label: 'rej.' }];
    if (!c.n) $('#cal').innerHTML = `<div class="empty"><strong>No labeled snapshots yet</strong>Snapshots are labeled one hour after launch. Calibration fills in after the first hour.</div>`;
    else {
      barsChart($('#cal'), bk.map((b) => b.label), [
        { name: 'hit 2× after checkpoint', color: css('--accent'), values: bk.map((b) => b.hit2xPct) },
        { name: 'hit 5×', color: css('--up'), values: bk.map((b) => b.hit5xPct) },
        { name: 'graduated', color: css('--info'), values: bk.map((b) => b.gradPct) },
      ], { labels: bk.map((b) => `n=${b.n}`) });
      $('#cal').insertAdjacentHTML('beforeend', `<div class="legend"><span><i style="background:${css('--accent')}"></i>hit 2× after checkpoint</span><span><i style="background:${css('--up')}"></i>hit 5×</span><span><i style="background:${css('--info')}"></i>graduated</span><span>${c.n} labeled tokens at ${c.checkpoint}s</span></div>`);
    }
  }
}
$('#positions').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-mint]'); if (tr) openDrawer(tr.dataset.mint); });

// ---------- intel ----------
async function loadIntel() {
  try { [S.dataset, S.intel, S.cfg] = await Promise.all([get('/api/dataset'), get('/api/intel'), S.cfg ? Promise.resolve(S.cfg) : get('/api/config')]); renderIntel(); } catch (e) { console.warn(e); }
}
function renderIntel() {
  const d = S.dataset; if (!d) return;
  $('#serialN').textContent = S.cfg?.scoring?.serialRuggerLaunches ?? 8;
  const mk = [['Launches recorded', n(d.totalLaunches, 0)], ['Graduations', n(d.totalGrads, 0)], ['Launches 24h', n(d.launches24h, 0)], ['Grad rate 24h', d.gradRate24hPct != null ? pct(d.gradRate24hPct, 2) : '–'], ['Rugs 24h', n(d.rugs24h, 0)], ['Labeled snapshots', n(d.labeledSnapshots, 0)]];
  $('#dsKpis').innerHTML = mk.map(([l, v]) => `<div><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');
  if (d.hourly.length) {
    barsChart($('#hourly'), d.hourly.map((x) => new Date(x.t).getHours().toString().padStart(2, '0') + 'h'), [
      { name: 'launches', color: css('--text-faint'), values: d.hourly.map((x) => x.launches) },
    ], { yFmt: (v) => n(v, 0), labels: d.hourly.map((x) => `${x.grads} grad${x.grads === 1 ? '' : 's'}`) });
    $('#hourly').insertAdjacentHTML('beforeend', `<div class="legend"><span><i style="background:${css('--text-faint')}"></i>launches per hour (local time) · graduations listed under each bar</span></div>`);
  } else $('#hourly').innerHTML = `<div class="empty"><strong>Collecting</strong>Hourly launch volume appears here.</div>`;
  const I = S.intel; if (!I) return;
  const link = (w) => `<a href="https://solscan.io/account/${w}" target="_blank" rel="noopener" class="mono">${short(w)}</a>`;
  $('#ruggers tbody').innerHTML = I.ruggers.length ? I.ruggers.map((c) => `<tr><td>${link(c.wallet)}</td><td class="num">${c.launches}</td><td class="num">${c.graduations}</td><td class="num">${c.rugs}</td><td class="num faint">${ago(c.last_seen)} ago</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty">Builds up as creators launch repeatedly.</div></td></tr>`;
  $('#smart tbody').innerHTML = I.smartWallets.length ? I.smartWallets.map((c) => `<tr><td>${link(c.wallet)}</td><td class="num">${c.early_buys}</td><td class="num">${c.wins}</td><td class="num">${pct(c.win_rate * 100, 0)}</td><td class="num">${c.graduations}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty"><strong>None qualified yet</strong>A wallet needs ≥ 5 early buys and ≥ 3 wins (3× or graduation) in your own data. Usually takes a few days.</div></td></tr>`;
  $('#creators tbody').innerHTML = I.creators.length ? I.creators.map((c) => `<tr><td>${link(c.wallet)}</td><td class="num">${c.launches}</td><td class="num">${c.graduations}</td><td class="num">${n(c.best_peak_mcap, 0)}</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty">No graduated creators recorded yet.</div></td></tr>`;
  const s = S.status, cfg = S.cfg;
  if (s && cfg) {
    const rows = [
      ['Uptime', age(s.uptimeSec)], ['Memory', `${s.memMb} MB`], ['Trade source', s.tradeSource], ['Telegram', s.telegram ? 'connected' : 'not configured'],
      ...s.feeds.map((f) => [`${f.name} feed`, `${f.healthy ? 'healthy' : 'DOWN'} · ${f.reconnects} reconnects · ${n(f.kbPerSec, 0)} KB/s`]),
      ['Trades processed', n(s.engine.trades, 0)], ['Snapshots', n(s.engine.snapshots, 0)], ['Metadata ok / fail', `${s.metadata.ok} / ${s.metadata.fail}`],
      ['Alert score', cfg.scoring.alertScore], ['Alert window', `${cfg.scoring.minAgeSec}s – ${cfg.scoring.maxAgeSec}s`], ['Max top-10', `${cfg.scoring.maxTop10Pct}%`], ['Max bundle', `${cfg.scoring.maxBundlePct}%`],
    ];
    $('#sys').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><span>${esc(b)}</span></div>`).join('');
  }
}

// ---------- drawer ----------
async function openDrawer(mint) {
  $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false');
  $('#drawerBody').innerHTML = '<div class="skel" style="width:40%;height:28px"></div><div class="skel" style="margin-top:12px;width:70%"></div><div class="skel" style="margin-top:24px;height:140px"></div>';
  let d; try { d = await get(`/api/token/${mint}`); } catch { $('#drawerBody').innerHTML = '<div class="empty"><strong>Token not found</strong>It may have aged out of memory and the database.</div>'; return; }
  const L = d.live, st = d.stored || {};
  const f = L?.features || d.snapshots.slice(-1)[0]?.features || {};
  const parts = L?.scoreParts || {};
  const sym = L?.symbol || st.symbol, name = L?.name || st.name;
  const featRows = [['Mcap', `${n(f.mcapSol, 1)} SOL`], ['Curve', pct(f.progressPct, 1)], ['Net SOL in', signed(f.netSol, 2)], ['Net / min', signed(f.netSolPerMin, 2)], ['Flow 60s', signed(f.flow60Sol, 2)], ['Unique buyers', f.uniqueBuyers], ['Buyers / min', n(f.buyersPerMin, 1)], ['Buy/sell ratio', n(f.buySellRatio, 2)],
    ['Top-10 hold', pct(f.top10Pct, 1)], ['Creator holds', pct(f.creatorHoldPct, 1)], ['Creator sold', pct(f.creatorSoldPct, 0)], ['Dev initial buy', `${n(f.initialBuySol, 2)} SOL`], ['Bundle share', pct(f.bundlePct, 0)], ['Repeat-trade share', pct((f.repeatTradeShare || 0) * 100, 0)], ['Drawdown from peak', pct(f.drawdownPct, 0)], ['Smart wallets', f.smartBuyers ?? 0],
    ['Creator launches', f.creatorLaunches ?? '–'], ['Creator grads', f.creatorGraduations ?? '–'], ['Telegram / X / web', `${f.hasTelegram ? 'Y' : '–'} / ${f.hasTwitter ? 'Y' : '–'} / ${f.hasWebsite ? 'Y' : '–'}`]];
  const pmax = { flow: 22, momentum: 10, breadth: 16, pressure: 8, distribution: 10, stage: 8, social: 10, smart: 15, creator: 6, skin: 4 };
  $('#drawerBody').innerHTML = `
    <h2 class="d-title">${esc(sym)}</h2><div class="d-sub">${esc(name)} · ${L ? `age ${age(L.ageSec)}` : 'archived'} ${L?.graduated || st.graduated ? '· <span class="up">graduated</span>' : ''}</div>
    <div class="d-mint" title="Click to copy" data-copy="${mint}">${mint}</div>
    <div class="d-links"><a href="https://pump.fun/coin/${mint}" target="_blank" rel="noopener">pump.fun</a><a href="https://solscan.io/token/${mint}" target="_blank" rel="noopener">Solscan</a><a href="https://dexscreener.com/solana/${mint}" target="_blank" rel="noopener">DexScreener</a>${L?.social?.links?.telegram ? `<a href="${esc(L.social.links.telegram)}" target="_blank" rel="noopener">Telegram</a>` : ''}${L?.social?.links?.twitter ? `<a href="${esc(L.social.links.twitter)}" target="_blank" rel="noopener">X</a>` : ''}</div>
    ${L?.series?.length > 1 ? `<div class="d-sec"><h3>Market cap (SOL)</h3><div id="dSpark" class="chart spark"></div></div>` : ''}
    <div class="d-sec"><h3>Score ${L?.reject ? `<span class="reject">· rejected: ${esc(L.reject)}</span>` : L?.score != null ? `· ${n(L.score, 1)}` : ''}</h3>
      <div class="parts">${Object.entries(parts).map(([k, v]) => `<div class="part ${v < 0 ? 'neg' : ''}"><span>${k}</span><div class="bar"><i style="width:${Math.min(100, (Math.abs(v) / (pmax[k] || 10)) * 100)}%"></i></div><span>${n(v, 1)}</span></div>`).join('') || '<div class="faint">No live score (token archived).</div>'}</div>
      ${L?.flags?.length ? `<div class="chips" style="margin-top:10px">${L.flags.map((x) => `<span class="chip warn">${esc(x)}</span>`).join('')}</div>` : ''}</div>
    <div class="d-sec"><h3>Features</h3><div class="feat">${featRows.map(([a, b]) => `<div><span class="muted">${a}</span><span>${esc(b ?? '–')}</span></div>`).join('')}</div></div>
    ${L?.topHolders?.length ? `<div class="d-sec"><h3>Top holders (wallets, excl. curve)</h3><div class="feat">${L.topHolders.map((h) => `<div><span class="mono">${short(h.w)}${h.creator ? ' <span class="acc">dev</span>' : ''}</span><span>${pct(h.pct, 2)}</span></div>`).join('')}</div></div>` : ''}
    ${L?.lastTrades?.length ? `<div class="d-sec"><h3>Recent trades</h3><div class="trades">${L.lastTrades.map((t) => `<div><span class="faint">${ago(t.at)}</span><span class="${t.b ? 'up' : 'down'}">${t.b ? 'BUY' : 'SELL'}</span><span>${short(t.w)}</span><span style="text-align:right">${n(t.sol, 3)}</span><span style="text-align:right" class="faint">${n(t.mcap, 1)}</span></div>`).join('')}</div></div>` : ''}
    ${d.snapshots.length ? `<div class="d-sec"><h3>Snapshots</h3><div class="feat">${d.snapshots.map((s) => `<div><span class="muted">${s.checkpoint}s · score ${s.reject ? '✕' : n(s.score, 0)}</span><span>${n(s.mcap, 1)}${s.max_mcap_after ? ` → max ${n(s.max_mcap_after / s.mcap, 2)}×` : ''}</span></div>`).join('')}</div></div>` : ''}`;
  if (L?.series?.length > 1) lineChart($('#dSpark'), L.series, { zero: false, h: 140, yFmt: (v) => n(v, 0), color: css('--accent') });
}
function closeDrawer() { $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); }
$('#drawerClose').onclick = closeDrawer; $('#scrim').onclick = closeDrawer; addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());
$('#drawerBody').addEventListener('click', (e) => { const c = e.target.closest('[data-copy]'); if (c) navigator.clipboard?.writeText(c.dataset.copy).then(() => toast('Mint address copied')); });

// ---------- data flow: SSE with polling fallback ----------
let lastSse = 0;
function connectSse() {
  try {
    const es = new EventSource(`${API}/api/stream`);
    es.addEventListener('status', (e) => { lastSse = Date.now(); S.status = JSON.parse(e.data); renderStatus(); });
    es.addEventListener('radar', (e) => { lastSse = Date.now(); S.radar = JSON.parse(e.data); renderBoard(); renderStatus(); });
    es.addEventListener('alert', (e) => { const a = JSON.parse(e.data); toast(`Alert · ${a.symbol} · score ${Math.round(a.score)}`); refreshAlerts(); });
    es.addEventListener('paper', () => { if (S.tab === 'perf') loadPerf(); });
  } catch { /* fallback below */ }
}
async function refreshAlerts() { try { S.alerts = await get('/api/alerts?limit=60'); renderAlerts(); } catch {} }
async function poll() {
  if (Date.now() - lastSse > 7000) {
    try { const [st, r] = await Promise.all([get('/api/status'), get('/api/radar?limit=60')]); S.status = st; S.radar = r; renderStatus(); renderBoard(); } catch {}
  }
}
async function boot() {
  await poll(); await refreshAlerts();
  connectSse();
  setInterval(poll, 3000);
  setInterval(refreshAlerts, 15000);
  setInterval(() => { if (S.tab === 'perf') loadPerf(); if (S.tab === 'intel') loadIntel(); }, 20000);
}
boot();
