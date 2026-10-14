// Curvewatch dashboard — vanilla JS, no build step.
const API = (window.CURVEWATCH_API ?? '').replace(/\/$/, '');
const $ = (s, el = document) => el.querySelector(s);
const floorScores = (r) => { for (const t of r?.rows || []) if (t.score != null) t.score = Math.floor(t.score); return r; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (x, d = 1) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (x, d = 1) => (x == null ? '–' : `${n(x, d)}%`);
const signed = (x, d = 1, suf = '') => (x == null ? '–' : `${x > 0 ? '+' : ''}${n(x, d)}${suf}`);
const short = (w) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : '–');
const age = (s) => { s = Math.max(0, s); return s < 60 ? `${Math.floor(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`; };
const ago = (t) => age((Date.now() - t) / 1000);
const cls = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : 'muted');
// Money is shown in USD. SOL amounts convert at the live SOL/USD reference price from the backend.
const solPx = () => S.status?.solUsd || null;
const usd = (v, opt = {}) => {
  if (v == null || !Number.isFinite(+v)) return '–';
  if (Math.abs(v) < 0.005) return '$0.00';
  const a = Math.abs(v), sg = v < 0 ? '−' : opt.sign && v > 0 ? '+' : '';
  const f = (x, d) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  if (a >= 1e9) return `${sg}$${f(a / 1e9, 2)}B`;
  if (a >= 1e6) return `${sg}$${f(a / 1e6, 2)}M`;
  if (a >= 1e4) return `${sg}$${f(a / 1e3, 1)}k`;
  if (a >= 1e3) return `${sg}$${f(a / 1e3, 2)}k`;
  if (a >= 100) return `${sg}$${f(a, 0)}`;
  if (a >= 1) return `${sg}$${f(a, 2)}`;
  return `${sg}$${f(a, a >= 0.01 ? 2 : 4)}`;
};
const sUsd = (sol, opt) => (sol == null ? '–' : solPx() ? usd(sol * solPx(), opt) : `${n(sol, 2)} SOL`);
const sUsdSigned = (sol) => sUsd(sol, { sign: true });
const get = (p) => fetch(API + p, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

const S = { status: null, radar: null, alerts: null, paper: null, dataset: null, cal: null, intel: null, tab: 'live', seenAlerts: new Set(), firstAlertLoad: true };

// ---------- theme ----------
const root = document.documentElement;
root.dataset.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
const metaTheme = document.querySelector('meta[name=theme-color]');
const syncTheme = () => metaTheme && (metaTheme.content = root.dataset.theme === 'dark' ? '#0b0d0f' : '#f3f2ee'); syncTheme();
$('#themeBtn').onclick = () => { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; syncTheme(); drawRadar(); drawGradRadar(); renderPerf(); renderIntel(); renderGrads(); };

// ---------- tabs ----------
document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
  S.tab = b.dataset.tab;
  document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', x === b));
  document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.id !== `tab-${S.tab}`));
  if (S.tab === 'perf') { loadPerf(); loadTerm(true); termWelcome(); } if (S.tab === 'intel') loadIntel(); if (S.tab === 'report') loadReport(); if (S.tab === 'grads') { loadGrads(); requestAnimationFrame(drawGradRadar); } if (S.tab === 'live') requestAnimationFrame(drawRadar);
  scrollTo({ top: 0, behavior: 'instant' });
});

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200); }

// ---------- header + KPIs ----------
function renderStatus() {
  const s = S.status; if (!s) return;
  $('#feeds').innerHTML = s.feeds.map((f) => `<span class="pill" title="${esc(f.lastError || 'ok')}"><i class="led ${f.healthy ? 'on' : ''}"></i>${f.name} ${f.name.startsWith('rpc') ? `${n(f.evPerSec, 0)} ev/s` : `${n(f.secSinceMessage, 0)}s`}</span>`).join('');
  $('#solPill').textContent = s.solUsd ? `SOL $${n(s.solUsd, 2)}` : 'SOL –';
  const k = s.kill;
  $('#legMid').textContent = `50–${s.alertScore - 1}`; $('#legHi').textContent = `≥ ${s.alertScore} (alert zone)`;
  const kb = $('#killBadge'); kb.className = `kill-badge ${k.status}`; kb.innerHTML = `<span class="kb-l">KILL RULE · </span>${k.status === 'COLLECTING' ? `${k.n}/${k.needed}` : k.status}`; kb.title = `Kill rule: ${k.status} (${k.n}/${k.needed} trades)`;
  const e = s.engine;
  const kp = [
    ['Launches / min', n(e.launchesPerMin, 1), (S.status?.uptimeSec ?? 3600) < 3600 ? `${n(e.launches1h, 0)} in ${Math.max(1, Math.floor(S.status.uptimeSec / 60))}m since restart` : `${n(e.launches1h, 0)} in last hour`],
    ['Tracking now', n(e.tracked, 0), `${S.radar ? S.radar.activeCount : '–'} on active curve`],
    ['Graduations 1h', n(e.grads1h, 0), e.launches1h ? `${pct((e.grads1h / e.launches1h) * 100, 2)} of launches` : '–'],
    ['Alerts', n(e.alerts, 0), `score ≥ ${s.alertScore}`],
    ['Paper P&L', `<span class="${cls(k.totalPnlSol)}">${sUsdSigned(k.totalPnlSol)}</span>`, `${k.n} closed trades`],
    ['Expectancy', `<span class="${cls(k.expectancyPct)}">${k.n ? signed(k.expectancyPct, 1, '%') : '–'}</span>`, k.n > 1 ? `95% CI ${signed(k.ciLowPct, 0)} … ${signed(k.ciHighPct, 0)}` : 'per trade, after costs'],
  ];
  $('#kpis').innerHTML = kp.map(([l, v, sub]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${sub}</div></div>`).join('');
}

// ---------- board ----------
function scoreBar(sc, reject, thr = S.status?.alertScore ?? 72) {
  if (reject) return `<span class="reject" title="${esc(reject)}">✕ ${esc(reject.length > 26 ? reject.slice(0, 25) + '…' : reject)}</span>`;
  const c = sc >= thr ? 'hi' : sc >= 50 ? 'mid' : '';
  return `<div class="scorecell"><div class="bar score ${c}"><i style="width:${Math.min(100, sc)}%"></i></div>${n(sc, 0)}</div>`;
}
function renderBoard() {
  const r = S.radar; if (!r) return;
  $('#boardHint').textContent = `${r.activeCount} tokens on active curve · top ${Math.min(30, r.rows.length)} by score`;
  const rows = r.rows.slice(0, 30);
  $('#board tbody').innerHTML = rows.length ? rows.map((t) => `
    <tr data-mint="${t.mint}">
      <td class="c-tok"><div class="tok"><span class="sym">${esc(t.symbol || '?')}</span><small>${esc(t.name)}</small></div></td>
      <td class="num" data-label="Age">${age(t.ageSec)}</td>
      <td class="num" data-label="Mcap">${sUsd(t.mcapSol)}</td>
      <td data-label="Curve ${n(t.progressPct, 0)}%"><div class="bar"><i style="width:${Math.min(100, t.progressPct)}%"></i></div></td>
      <td class="num" data-label="Buyers">${t.buyers}</td>
      <td class="num ${cls(t.f.netSolPerMin)}" data-label="Net in/min">${sUsdSigned(t.f.netSolPerMin)}</td>
      <td class="num ${cls(t.f.flow60Sol)}" data-label="60s flow">${sUsdSigned(t.f.flow60Sol)}</td>
      <td class="num" data-label="Top 10">${pct(t.f.top10Pct, 0)}</td>
      <td class="num ${t.f.bundlePct >= 25 ? 'down' : ''}" data-label="Bundle">${pct(t.f.bundlePct, 0)}</td>
      <td class="c-score">${scoreBar(t.score ?? 0, t.reject)}</td>
      <td class="faint c-sig" style="max-width:240px;overflow:hidden;text-overflow:ellipsis">${esc((t.reasons || []).slice(0, 2).join(' · ') || (t.flags || []).slice(0, 2).join(' · '))}</td>
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
      <div class="alert-meta"><span>alert ${sUsd(x.mcap)}</span><span>age ${age(x.age_sec)}</span><span>curve ${pct(x.progress, 0)}</span>
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
  [0.25, 0.5, 0.75, 1].forEach((f) => { ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2); ctx.stroke(); });
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
  const pill = (txt, x, y, color) => { const tw = ctx.measureText(txt).width; ctx.fillStyle = css('--surface'); ctx.globalAlpha = 0.85; ctx.fillRect(x - 3, y - 10, tw + 6, 14); ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.fillText(txt, x, y); };
  ctx.font = '11px Geist Mono, monospace';
  // Labels: highest scores first, skip any label that would collide with one already drawn
  const boxes = [];
  ctx.font = '11px Geist Mono, monospace'; ctx.fillStyle = css('--text-muted');
  for (const p of [...radarPts].filter((p) => p.sc >= 50).sort((a, b) => b.sc - a.sc).slice(0, 6)) {
    const label = (p.t.symbol || '').slice(0, 10); const lw = ctx.measureText(label).width;
    const bx = p.x + p.size + 4, by = p.y - 7, box = [bx - 2, by - 2, bx + lw + 2, by + 14];
    if (boxes.some((o) => !(box[2] < o[0] || box[0] > o[2] || box[3] < o[1] || box[1] > o[3]))) continue;
    if (radarPts.some((q) => q !== p && q.x + q.size > box[0] && q.x - q.size < box[2] && q.y + q.size > box[1] && q.y - q.size < box[3])) continue;
    boxes.push(box); pill(label, bx, p.y + 4, css('--text-muted'));
  }
  if (hover) {
    const t = hover.t, bw = 196, bh = 64;
    let bx = hover.x + 12, by = hover.y - bh - 8; if (bx + bw > w) bx = hover.x - bw - 12; if (by < 0) by = hover.y + 12;
    ctx.fillStyle = css('--surface-3'); ctx.strokeStyle = css('--border'); ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = css('--text'); ctx.font = '600 12px Geist, sans-serif'; ctx.fillText(`${t.symbol} · score ${t.reject ? '✕' : n(t.score, 0)}`, bx + 10, by + 18);
    ctx.font = '11px Geist Mono, monospace'; ctx.fillStyle = css('--text-muted');
    ctx.fillText(`${sUsd(t.mcapSol)} · curve ${n(t.progressPct, 0)}%`, bx + 10, by + 36);
    ctx.fillText(`${t.buyers} buyers · age ${age(t.ageSec)}`, bx + 10, by + 52);
  }
}
// ---------- graduates radar ----------
const gcv = $('#gRadar'); const gctx = gcv.getContext('2d');
let gPts = []; let gHover = null;
const G_MAX_MIN = 72 * 60, V_LO = 0.2, V_HI = 5;
const gAng = (ageMin) => -Math.PI / 2 + (Math.log1p(Math.max(0, ageMin)) / Math.log1p(G_MAX_MIN)) * Math.PI * 2 * 0.999;
const gRad = (v) => Math.max(0.03, Math.min(1, (Math.log(Math.max(V_LO, v)) - Math.log(V_LO)) / (Math.log(V_HI) - Math.log(V_LO))));
function drawGradRadar() {
  if (S.tab !== 'grads') return;
  const c = gctx, dpr = devicePixelRatio || 1; const w = gcv.clientWidth, h = gcv.clientHeight; if (!w) return;
  if (gcv.width !== w * dpr) { gcv.width = w * dpr; gcv.height = h * dpr; }
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) / 2 - 22;
  const grid = css('--grid'), faint = css('--text-faint'), acc = css('--accent'), info = css('--info');
  c.lineWidth = 1; c.font = '11px Geist Mono, monospace';
  const ringLabels = [];
  for (const v of [0.5, 2, 5]) { c.beginPath(); c.arc(cx, cy, R * gRad(v), 0, Math.PI * 2); c.strokeStyle = grid; c.stroke(); ringLabels.push([`${v}×`, R * gRad(v), faint]); }
  c.beginPath(); c.arc(cx, cy, R * gRad(1), 0, Math.PI * 2); c.strokeStyle = acc; c.globalAlpha = .45; c.stroke(); c.globalAlpha = 1; ringLabels.push(['1×', R * gRad(1), acc]);
  for (const [m, lab] of [[20, '20m'], [60, '1h'], [360, '6h'], [1440, '24h'], [G_MAX_MIN, '72h']]) {
    const a = gAng(m);
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.strokeStyle = grid; c.stroke();
    c.fillStyle = faint; c.fillText(lab, cx + Math.cos(a) * (R + 11) - 9, cy + Math.sin(a) * (R + 11) + 4);
  }
  const sa = -Math.PI / 2 + sweep;
  const g = c.createConicGradient ? c.createConicGradient(sa - 0.6, cx, cy) : null;
  if (g) { g.addColorStop(0, 'transparent'); g.addColorStop(0.095, acc + '22'); g.addColorStop(0.0955, 'transparent'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); }
  gPts = [];
  const b = S.gBoard; const alertScore = b?.stats?.alertScore ?? 70;
  const rows = b ? [...(b.warming || []), ...(b.rejected || []), ...(b.rows || [])] : [];
  for (const t of rows) {
    if (t.ageMin == null) continue;
    const a = gAng(t.ageMin), noMig = t.vsMig == null;
    const r = R * gRad(noMig ? 1 : t.vsMig);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    const size = 2.5 + Math.min(9, Math.sqrt((t.liqUsd || 0) / 1000) * 1.1);
    const sc = t.reject ? -1 : t.score ?? 0;
    const col = sc >= alertScore ? acc : sc >= 50 ? info : faint;
    c.globalAlpha = sc < 0 ? 0.28 : sc >= 50 ? 1 : 0.6;
    if (sc >= alertScore) { c.beginPath(); c.arc(x, y, size + 5, 0, Math.PI * 2); c.fillStyle = acc + '30'; c.fill(); }
    c.beginPath(); c.arc(x, y, size, 0, Math.PI * 2);
    if (noMig) { c.strokeStyle = col; c.lineWidth = 1.5; c.stroke(); c.lineWidth = 1; } else { c.fillStyle = col; c.fill(); }
    c.globalAlpha = 1;
    gPts.push({ x, y, s: size + 4, t, sc, size });
  }
  // ring labels sit on the 3 o'clock axis with a backing pill; their boxes block token labels
  const boxes = []; c.font = '11px Geist Mono, monospace';
  for (const [txt, rr, col] of ringLabels) {
    const tw = c.measureText(txt).width, x = cx + rr + 3, y = cy - 3;
    c.fillStyle = css('--surface'); c.globalAlpha = 0.85; c.fillRect(x - 2, y - 10, tw + 4, 13); c.globalAlpha = 1; c.fillStyle = col; c.fillText(txt, x, y);
    boxes.push([x - 2, y - 10, x + tw + 2, y + 3]);
  }
  const pill = (txt, x, y) => { const tw = c.measureText(txt).width; c.fillStyle = css('--surface'); c.globalAlpha = 0.85; c.fillRect(x - 3, y - 10, tw + 6, 14); c.globalAlpha = 1; c.fillStyle = css('--text-muted'); c.fillText(txt, x, y); };
  for (const p of [...gPts].filter((p) => p.sc >= 0).sort((a, b) => b.sc - a.sc).slice(0, 6)) {
    const label = (p.t.symbol || '').slice(0, 10); const lw = c.measureText(label).width;
    const bx = p.x + p.size + 4, by = p.y - 7, box = [bx - 2, by - 2, bx + lw + 2, by + 14];
    if (boxes.some((o) => !(box[2] < o[0] || box[0] > o[2] || box[3] < o[1] || box[1] > o[3]))) continue;
    if (gPts.some((q) => q !== p && q.x + q.size > box[0] && q.x - q.size < box[2] && q.y + q.size > box[1] && q.y - q.size < box[3])) continue;
    boxes.push(box); pill(label, bx, p.y + 4);
  }
  if (gHover) {
    const t = gHover.t, bw = 214, bh = 64;
    let bx = gHover.x + 12, by = gHover.y - bh - 8; if (bx + bw > w) bx = gHover.x - bw - 12; if (by < 0) by = gHover.y + 12;
    c.fillStyle = css('--surface-3'); c.strokeStyle = css('--border'); c.beginPath(); c.roundRect(bx, by, bw, bh, 6); c.fill(); c.stroke();
    c.fillStyle = css('--text'); c.font = '600 12px Geist, sans-serif'; c.fillText(`${t.symbol} · ${t.reject ? (t.reject.startsWith('warming') ? 'warming up' : 'filtered') : `score ${Math.floor(t.score)}`}`, bx + 10, by + 18);
    c.font = '11px Geist Mono, monospace'; c.fillStyle = css('--text-muted');
    c.fillText(`${usd(t.mcapUsd)} mcap · ${usd(t.liqUsd)} liq`, bx + 10, by + 36);
    c.fillText(`${t.vsMig == null ? 'vs grad –' : `${t.migEstimated ? '≈' : ''}${n(t.vsMig, 2)}× grad`} · ${age(t.ageMin * 60)}`, bx + 10, by + 52);
  }
}
const gHit = (e) => { const b = gcv.getBoundingClientRect(); const x = e.clientX - b.left, y = e.clientY - b.top; let best = null, bd = 1e9; for (const p of gPts) { const d = Math.hypot(p.x - x, p.y - y); if (d < p.s + 4 && d < bd) { bd = d; best = p; } } return best; };
gcv.addEventListener('mousemove', (e) => { gHover = gHit(e); gcv.style.cursor = gHover ? 'pointer' : 'crosshair'; drawGradRadar(); });
gcv.addEventListener('mouseleave', () => { gHover = null; drawGradRadar(); });
gcv.addEventListener('click', (e) => { const p = gHit(e); if (p) openGradDrawer(p.t.mint); });
addEventListener('resize', drawGradRadar);
function radarLoop() { sweep = (sweep + 0.012) % (Math.PI * 2); drawRadar(); drawGradRadar(); drawTerm(); requestAnimationFrame(radarLoop); }
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

// ---------- kill rule card (shared by both paper books) ----------
function renderBooks() {
  const P = S.paper; if (!P?.books) return;
  const { books: B, legacyV1: L } = P.books, band = P.band;
  $('#booksHint').textContent = `strategy lab · same costs · kill rule needs ${B.main.kill.needed} trades each`;
  const statusCls = (st) => ({ PASS: 'up', FAIL: 'down' }[st] || 'acc');
  const row = (name, sub, k, open, extra = '') => `<tr class="${extra}"><td><span class="book-name">${name}</span><span class="book-sub">${sub}</span></td>
    <td><span class="${extra ? '' : statusCls(k.status)}">${k.status === 'COLLECTING' ? `${k.n}/${k.needed}` : k.status}</span></td>
    <td class="num">${k.n ? pct(k.winRatePct, 0) : '–'}</td>
    <td class="num ${extra ? '' : cls(k.expectancyPct)}">${k.n ? signed(k.expectancyPct, 1, '%') : '–'}</td>
    <td class="num">${k.n > 1 ? `${signed(k.ciLowPct, 0, '%')} to ${signed(k.ciHighPct, 0, '%')}` : '–'}</td>
    <td class="num ${extra ? '' : cls(k.totalPnlSol)}">${k.n ? sUsdSigned(k.totalPnlSol) : '–'}</td>
    <td class="num">${open ?? '–'}</td></tr>`;
  $('#books').innerHTML = `<div class="btable-wrap"><table class="btable wide">
    <thead><tr><th>Book</th><th>Kill rule</th><th class="num">Win</th><th class="num">Avg / trade</th><th class="num">95% range</th><th class="num">P&amp;L</th><th class="num">Open</th></tr></thead>
    <tbody>${(P.books.order || Object.keys(B)).map((b) => row(B[b].label || b, B[b].entry || '', B[b].kill, B[b].open)).join('')}${L.n ? row('Old exits (v1)', 'main book before the change', L, null, 'legacy') : ''}</tbody></table></div>
    <p class="small-note">Breakeven for Main, Band and Flow (+25% / −20% net) is a 44% win rate. Confirm uses a closer target (+20% gross, ≈ +13.5% net), so its breakeven win rate is about 60%. Calibration on October 14: no book cleared breakeven in replay; the best (Confirm) lost about 8% per trade. These run to find out, not because they are known to work.</p>`;
}
function renderMarket() {
  const m = S.paper?.market; if (!m) return;
  const c = m.config, wr = m.winRatePct;
  const col = m.state === 'COLD' ? 'down' : m.state === 'WARM' ? 'up' : 'faint';
  $('#marketHint').textContent = `last ${c.window} closed paper trades, ${c.lookbackHours}h window`;
  const B = S.paper.books?.books || {};
  const cmp = (b) => { const w = B[b]?.byMarket; if (!w) return ''; return `<tr><td>${B[b]?.label || b}</td>${['WARM', 'COLD'].map((st) => `<td class="num">${w[st].n ? `${pct(w[st].winRatePct, 0)} · ${signed(w[st].expectancyPct, 1, '%')}` : '–'}</td><td class="num faint">${w[st].n}</td>`).join('')}</tr>`; };
  const ctx = m.context || {};
  $('#market').innerHTML = `
    <div class="mstate"><span class="big ${col}">${m.state}</span><span class="tag">${m.mode === 'enforce' ? 'enforcing' : 'shadow: measuring only'}</span>
      <span class="faint">${m.n < c.minTrades ? `${m.n} of ${c.minTrades} trades needed${wr != null ? ` (${pct(wr, 0)} win so far)` : ''}` : `${pct(wr, 0)} win over ${m.n} trades`} · since ${ago(m.since)} ago</span></div>
    <div class="gauge"><i style="width:${Math.max(0, Math.min(100, wr ?? 0))}%;background:${css(m.state === 'COLD' ? '--down' : '--accent')}"></i>
      <b style="left:${c.pauseBelowPct}%"></b><b style="left:${c.resumeAtPct}%;opacity:.5"></b><b style="left:44%;background:${css('--up')}"></b></div>
    <div class="small-note gauge-key">ticks: pause below ${c.pauseBelowPct}% · resume at ${c.resumeAtPct}% · <span class="up">breakeven 44%</span></div>
    <div class="mctx">
      <div><div class="label">Launches / min</div><div class="value">${n(ctx.launchesPerMin, 1)}</div></div>
      <div><div class="label">Graduations 1h</div><div class="value">${n(ctx.grads1h, 0)}</div></div>
      <div><div class="label">SOL 1h</div><div class="value ${cls(ctx.sol1hPct)}">${ctx.sol1hPct == null ? '–' : signed(ctx.sol1hPct, 2, '%')}</div></div>
    </div>
    <div class="btable-wrap"><table class="btable"><thead><tr><th>Entered while</th><th class="num">WARM win · avg</th><th class="num">n</th><th class="num">COLD win · avg</th><th class="num">n</th></tr></thead><tbody>${(S.paper.books?.order || ['main', 'band']).map(cmp).join('')}</tbody></table></div>
    <p class="small-note">${m.mode === 'enforce'
      ? 'Enforcing: while COLD, new paper entries are tagged paused and left out of the kill rule, and Telegram strong signals are held back.'
      : 'Shadow mode: every entry is tagged with the market state, nothing is blocked. In the replay of 60 alerts, a pause would have skipped trades that did better (45% win) than the ones kept (35%). Switch to enforce (MARKET_GATE_MODE=enforce) only if COLD entries here keep doing clearly worse than WARM ones.'}</p>`;
}
function killHtml(k, model) {
  const color = { PASS: 'up', FAIL: 'down', MARGINAL: 'acc', COLLECTING: 'acc' }[k.status];
  const verdict = {
    COLLECTING: `Collecting evidence: ${k.n} of ${k.needed} closed trades. No verdict until the sample is large enough.`,
    PASS: 'The 95% confidence interval for average return per trade is entirely above zero after all costs. The edge is measurable; keep sizing small and keep checking.',
    MARGINAL: 'Average return per trade is positive, but the confidence interval still crosses zero. Not proven. Keep paper trading and tighten the filters.',
    FAIL: 'Average return per trade is at or below zero after costs. Stop, or change the strategy before risking money.',
  }[k.status];
  const lo = Math.min(-50, k.ciLowPct ?? 0), hi = Math.max(50, k.ciHighPct ?? 0);
  const sx = (v) => 10 + ((v - lo) / (hi - lo)) * 280;
  return `
    <div class="kill-status ${color}">${k.status}</div>
    ${k.status === 'COLLECTING' ? `<div class="progress"><i style="width:${Math.min(100, (k.n / k.needed) * 100)}%"></i></div>` : ''}
    <div class="kill-grid">
      <div><div class="label">Expectancy / trade</div><div class="value ${cls(k.expectancyPct)}">${k.n ? signed(k.expectancyPct, 1, '%') : '–'}</div></div>
      <div><div class="label">Win rate</div><div class="value">${k.n ? pct(k.winRatePct, 0) : '–'}</div></div>
      <div><div class="label">Profit factor</div><div class="value">${k.profitFactor != null && k.n ? n(k.profitFactor, 2) : '–'}</div></div>
      <div><div class="label">Total P&amp;L</div><div class="value ${cls(k.totalPnlSol)}">${sUsdSigned(k.totalPnlSol)}</div></div>
      <div><div class="label">Best / worst</div><div class="value">${k.n ? `${signed(k.bestPct, 0, '%')} / ${signed(k.worstPct, 0, '%')}` : '–'}</div></div>
      <div><div class="label">Trades in window</div><div class="value">${k.n}</div></div>
    </div>
    <div class="ci"><svg viewBox="0 0 300 56"><line x1="10" x2="290" y1="28" y2="28" stroke="${css('--border')}"/>
      <line x1="${sx(0)}" x2="${sx(0)}" y1="12" y2="44" stroke="${css('--text-faint')}" stroke-dasharray="3 3"/>
      ${k.n > 1 ? `<line x1="${sx(k.ciLowPct)}" x2="${sx(k.ciHighPct)}" y1="28" y2="28" stroke="${css(color === 'up' ? '--up' : color === 'down' ? '--down' : '--accent')}" stroke-width="6" stroke-linecap="round" opacity=".55"/>
      <circle cx="${sx(k.expectancyPct)}" cy="28" r="5" fill="${css('--text')}"/>` : ''}
      <text x="${sx(0)}" y="54" text-anchor="middle" font-size="10" fill="${css('--text-faint')}" font-family="Geist Mono">0%</text></svg></div>
    <p class="kill-note">${verdict}<br/>${model}</p>`;
}

// ---------- performance ----------
async function loadPerf() {
  try { [S.paper, S.cal, S.strong] = await Promise.all([get('/api/paper'), get(`/api/calibration?checkpoint=${$('#cpSel').value}`), get('/api/strong').catch(() => null)]); renderPerf(); renderStrong(); } catch (e) { console.warn(e); }
}
function renderStrong() {
  const st = S.strong; if (!st) return;
  const tg = S.status?.telegramStats || {}, c = st.config, sm = st.summary;
  const tgState = !tg.enabled ? '<span class="down">not configured</span>' : tg.lastError && (!tg.lastOkAt) ? '<span class="down">failing</span>' : '<span class="up">connected</span>';
  $('#strongHint').textContent = `+${c.targetPct}% target before −${c.stopPct}% stop, after fees and slippage`;
  const rd = (label, r, fb) => {
    const ok = r.n >= c.minSamples;
    return `<div><strong>${label}</strong> · ${ok ? '<span class="up">calibrated</span>' : '<span class="acc">uncalibrated</span>'}
      <div class="progress"><i style="width:${Math.min(100, (r.n / c.minSamples) * 100)}%"></i></div>
      <span class="faint">${r.n} of ${c.minSamples} similar setups labeled${r.n ? ` · ${pct(r.rate, 0)} reached the target first` : ''}. ${ok ? `Fires when that rate is ≥ ${c.minHitPct}%.` : `Until then it fires only at score ≥ ${fb}, and the message says UNCALIBRATED.`}</span></div>`;
  };
  const rows = st.rows.length ? st.rows.map((r) => `<div class="srow" data-mint="${r.mint}" data-kind="${r.kind}">
      <span><span class="sym">${esc(r.symbol || '?')}</span> <span class="faint">${r.kind === 'curve' ? 'curve' : 'graduate'}</span></span>
      <span class="s-why faint">${esc((r.reasons || []).slice(0, 3).join(' · ') || '–')}</span>
      <span class="num">${usd(r.ref_mcap_usd)}</span>
      <span class="${r.mode === 'calibrated' ? 'up' : 'acc'}">${r.mode === 'calibrated' ? `${Math.round(r.hit_rate)}% / n${r.n}` : 'uncal.'}</span>
      <span class="${r.outcome === 'hit' ? 'up' : r.outcome === 'stopped' ? 'down' : 'faint'}">${r.labeled ? r.outcome : `${ago(r.ts)} ago`}</span></div>`).join('')
    : `<div class="empty"><strong>No strong signals yet</strong>Regular alerts are frequent; strong signals are rare by design. Most hours will have none.</div>`;
  $('#strong').innerHTML = `
    <div class="strong-top">
      <div><div class="label">Telegram</div><div class="value">${tgState}</div><div class="sub">mode ${esc(tg.mode || '–')} · ${tg.sent || 0} sent · ${tg.failed || 0} failed</div></div>
      <div><div class="label">Strong signals 24h</div><div class="value">${sm.last24h || 0}</div><div class="sub">cap ${c.maxPerHour}/hour</div></div>
      <div><div class="label">Labeled hit rate</div><div class="value">${sm.labeled ? pct(sm.hitRatePct, 0) : '–'}</div><div class="sub">${sm.hits || 0} hit · ${sm.stopped || 0} stopped · ${sm.labeled || 0} labeled</div></div>
      <div><div class="label">Calibrated share</div><div class="value">${sm.total ? pct(((sm.calibrated || 0) / sm.total) * 100, 0) : '–'}</div><div class="sub">${sm.total || 0} total</div></div>
    </div>
    <div class="ready">${rd('Bonding curve', st.readiness.curve, c.fallbackCurveScore)}${rd('Graduates', st.readiness.grad, c.fallbackGradScore)}</div>
    ${tg.lastError ? `<p class="kill-note down">Last Telegram error: ${esc(tg.lastError)}</p>` : ''}
    <div class="mini-list">${rows}</div>`;
}
$('#tgTest').onclick = async () => {
  const b = $('#tgTest'); b.disabled = true; const t = b.textContent;
  try { const r = await fetch(API + '/api/telegram/test', { method: 'POST' }); const j = await r.json(); b.textContent = j.ok ? 'Sent, check Telegram' : 'Not configured'; if (!j.ok) console.warn(j.error); }
  catch { b.textContent = 'Failed'; }
  setTimeout(() => { b.textContent = t; b.disabled = false; }, 3000);
};
$('#strong').addEventListener('click', (e) => { const r = e.target.closest('.srow'); if (!r) return; r.dataset.kind === 'curve' ? openDrawer(r.dataset.mint) : (typeof openGradDrawer === 'function' && openGradDrawer(r.dataset.mint)); });
$('#cpSel').onchange = loadPerf;
function renderPerf() {
  if (!S.paper) return;
  const k = S.paper.kill, cfg = S.paper.config;
  const exitTxt = cfg.tp1Fraction >= 1 ? `sell everything at +${Math.round((cfg.tp1Multiple - 1) * 100)}% net, −${cfg.stopPct}% net stop` : `sell ${cfg.tp1Fraction * 100}% at ${cfg.tp1Multiple}×, ${cfg.trailPct}% trailing stop, −${cfg.stopPct}% hard stop`;
  $('#kill').innerHTML = killHtml(k, `Model (${cfg.rules} exits): ${sUsd(cfg.sizeSol)} (${cfg.sizeSol} SOL) per signal, entry ${cfg.entryDelaySec}s later at the live curve price, ${cfg.feePct}% fee each side, +${cfg.extraSlippagePct}% slippage; ${exitTxt}, ${cfg.maxHoldMin} min max hold. Trades under the old v1 exits are excluded.`);
  renderBooks(); renderMarket();
  $('#eqHint').textContent = `${k.allTrades} closed · cumulative, USD`;
  const px = solPx() || 1;
  lineChart($('#equity'), k.equity.map((e) => [e.t, e.eq * px]), { yFmt: (v) => (solPx() ? usd(v) : n(v, 2)), color: css(k.totalPnlSol >= 0 ? '--up' : '--down') });

  const all = [...S.paper.open.map((p) => ({ ...p, status: 'open' })), ...S.paper.recent.filter((r) => r.status !== 'open')];
  $('#posHint').textContent = `${S.paper.open.length} open`;
  $('#positions tbody').innerHTML = all.length ? all.slice(0, 60).map((p) => {
    const pnl = p.status === 'open' ? p.markPct : p.pnl_pct;
    const bk = p.book || 'main', rl = p.rules || (p.status === 'open' ? S.paper.config.rules : 'v1');
    return `<tr data-mint="${p.mint}"><td class="c-tok"><span class="sym">${esc(p.symbol)}</span></td><td data-label="Book">${bk === 'band' ? `<span class="acc">${S.paper.band.lo}–${S.paper.band.hi}</span>` : 'main'}${rl === 'v1' ? ' <span class="faint">v1</span>' : ''}${p.gated ? ' <span class="down">paused</span>' : ''}</td><td data-label="Status">${p.status === 'open' ? '<span class="acc">open</span>' : p.status === 'void' ? '<span class="faint">void</span>' : 'closed'}</td>
      <td class="num" data-label="Entry mcap">${sUsd(p.entryMcap ?? p.entry_mcap)}</td><td class="num" data-label="Mark / exit">${p.status === 'open' ? sUsd(p.mcap) : sUsd((p.events || []).slice(-1)[0]?.mcap)}</td>
      <td class="num ${cls(pnl)}" data-label="P&amp;L">${signed(pnl, 1, '%')}</td><td class="faint" data-label="Exit">${esc(p.exit_reason || (p.tp1Done ? 'TP1 taken' : '–'))}</td><td class="num faint" data-label="Opened">${ago(p.entryTs ?? p.entry_ts)} ago</td></tr>`;
  }).join('') : `<tr><td colspan="8"><div class="empty"><strong>No paper trades yet</strong>Each alert opens a simulated ${sUsd(cfg.sizeSol)} position ${cfg.entryDelaySec}s later.</div></td></tr>`;

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
  $('#creators tbody').innerHTML = I.creators.length ? I.creators.map((c) => `<tr><td>${link(c.wallet)}</td><td class="num">${c.launches}</td><td class="num">${c.graduations}</td><td class="num">${sUsd(c.best_peak_mcap)}</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty">No graduated creators recorded yet.</div></td></tr>`;
  const s = S.status, cfg = S.cfg;
  if (s && cfg) {
    const rows = [
      ['Uptime', age(s.uptimeSec)], ['Memory', `${s.memMb} MB`], ['Trade source', s.tradeSource], ['Telegram', s.telegram ? 'connected' : 'not configured'], ['SOL / USD', s.solUsd ? `$${n(s.solUsd, 2)}` : '–'], ['Graduates watched', n(s.grads?.watching, 0)],
      ...s.feeds.map((f) => [`${f.name} feed`, `${f.healthy ? 'healthy' : 'DOWN'} · ${f.reconnects} reconnects · ${n(f.kbPerSec, 0)} KB/s`]),
      ['Trades processed', n(s.engine.trades, 0)], ['Snapshots', n(s.engine.snapshots, 0)], ['Metadata ok / fail', `${s.metadata.ok} / ${s.metadata.fail}`],
      ['Alert score', cfg.scoring.alertScore], ['Alert window', `${cfg.scoring.minAgeSec}s – ${cfg.scoring.maxAgeSec}s`], ['Max top-10', `${cfg.scoring.maxTop10Pct}%`], ['Max bundle', `${cfg.scoring.maxBundlePct}%`],
    ];
    $('#sys').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><span>${esc(b)}</span></div>`).join('');
  }
}

// ---------- graduates ----------
S.gFilter = 'rejected';
async function loadGrads() {
  try {
    const needCal = !S.gCal || Date.now() - (S.gCalAt || 0) > 60000;
    const [b, a, p, c] = await Promise.all([get('/api/grads?limit=60'), get('/api/grads/alerts?limit=40'), get('/api/grads/paper'), needCal ? get('/api/grads/calibration') : Promise.resolve(null)]);
    S.gBoard = b; S.gAlerts = a; S.gPaper = p; if (c) { S.gCal = c; S.gCalAt = Date.now(); }
    renderGrads();
  } catch (e) { console.warn(e); }
}
function spark(vals, w = 92, h = 26) {
  if (!vals || vals.length < 2) return '<span class="faint mono">–</span>';
  const lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || hi || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((v - lo) / r) * (h - 4)).toFixed(1)}`).join(' ');
  const c = css(vals[vals.length - 1] >= vals[0] ? '--up' : '--down');
  return `<svg class="spk" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}
const mult = (x, est) => (x == null ? '–' : `${est ? '≈' : ''}${n(x, 2)}×`);
function renderGrads() {
  const b = S.gBoard; if (!b) return;
  $('#gLegMid').textContent = `50–${(b.stats?.alertScore ?? 70) - 1}`; drawGradRadar();
  const st = b.stats, k = S.gPaper?.kill;
  $('#gMinAge').textContent = st.minAgeMin;
  const kp = [
    ['Watching', n(b.watching, 0), `${b.survivors} scored · ${b.warmingCount} warming`],
    ['Re-ignition alerts', n(st.alerts24h, 0), `24h · score ≥ ${st.alertScore}`],
    ['Labeled snapshots', n(st.labeled, 0), `${n(st.snaps, 0)} recorded`],
    ['Min liquidity', usd(st.minLiqUsd), `poll every ${st.pollSec}s`],
    ['Paper P&L', k ? `<span class="${cls(k.totalPnlSol)}">${sUsdSigned(k.totalPnlSol)}</span>` : '–', k ? `${k.n} closed trades` : ''],
    ['Expectancy', k?.n ? `<span class="${cls(k.expectancyPct)}">${signed(k.expectancyPct, 1, '%')}</span>` : '–', k?.n > 1 ? `95% CI ${signed(k.ciLowPct, 0)} … ${signed(k.ciHighPct, 0)}` : 'per trade, after costs'],
  ];
  $('#gKpis').innerHTML = kp.map(([l, v, sub]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${sub}</div></div>`).join('');
  $('#gBoardHint').textContent = `${b.survivors} survivors scored · sorted by score`;
  const thr = st.alertScore;
  $('#gBoard tbody').innerHTML = b.rows.length ? b.rows.slice(0, 40).map((t) => `
    <tr data-gmint="${t.mint}">
      <td class="c-tok"><div class="tok"><span class="sym">${esc(t.symbol || '?')}${t.open ? ' <span class="chip neutral">paper</span>' : ''}</span><small>${esc(t.name || '')}</small></div></td>
      <td class="num" data-label="Since grad">${age((t.ageMin || 0) * 60)}</td>
      <td class="num" data-label="Mcap">${usd(t.mcapUsd)}</td>
      <td class="num" data-label="Liquidity">${usd(t.liqUsd)}</td>
      <td class="num ${t.vsMig >= 1 ? 'up' : t.vsMig != null && t.vsMig < 0.5 ? 'down' : ''}" data-label="vs grad">${mult(t.vsMig, t.migEstimated)}</td>
      <td class="c-spark" data-label="6h">${spark(t.spark)}</td>
      <td class="num ${t.volAccel >= 2 ? 'up' : ''}" data-label="Vol pace">${t.volAccel != null ? n(t.volAccel, 1) + '×' : '–'}</td>
      <td class="num ${t.buyRatio5 >= 0.6 ? 'up' : t.buyRatio5 < 0.42 ? 'down' : ''}" data-label="Buys 5m">${t.tx5 ? pct(t.buyRatio5 * 100, 0) : '–'}</td>
      <td class="num ${cls(t.c1h)}" data-label="1h">${t.c1h != null ? signed(t.c1h, 0, '%') : '–'}</td>
      <td class="c-score">${scoreBar(Math.floor(t.score ?? 0), null, thr)}</td>
      <td class="faint c-sig" style="max-width:260px;overflow:hidden;text-overflow:ellipsis">${esc((t.reasons || []).slice(0, 2).join(' · ') || (t.flags || []).slice(0, 2).join(' · '))}</td>
    </tr>`).join('') : `<tr><td colspan="11"><div class="empty"><strong>No survivors scored yet</strong>Graduates appear here ${st.minAgeMin} minutes after migration if their pool still holds ${usd(st.minLiqUsd)}+ of liquidity.</div></td></tr>`;

  const A = S.gAlerts?.rows || [];
  const fin = A.filter((x) => x.finalized);
  const hit = fin.filter((x) => x.max_6h >= 1.5).length;
  $('#gAlertHint').textContent = fin.length ? `${fin.length} labeled · ${pct((hit / fin.length) * 100, 0)} reached +50% within 6h` : 'outcomes are labeled 6h after each alert';
  $('#gAlerts').innerHTML = A.length ? A.map((x) => `
    <div class="alert" data-gmint="${x.mint}">
      <div class="alert-top"><span class="score-badge">${Math.floor(x.score)}</span><span class="sym">${esc(x.symbol || '?')}</span><span class="name">${esc(x.name || '')}</span><span class="when">${ago(x.ts)} ago</span></div>
      <div class="alert-meta"><span>alert ${usd(x.mcap)}</span><span>liq ${usd(x.liq)}</span><span>${age((x.age_min || 0) * 60)} after grad</span>
        <span>peak <b class="mult ${x.peakMult >= 1.5 ? 'up' : ''}">${x.peakMult ? n(x.peakMult, 2) + '×' : '–'}</b></span>
        <span>${x.finalized ? '6h' : 'now'} <b class="mult ${cls((x.nowMult ?? 1) - 1)}">${x.nowMult != null ? n(x.nowMult, 2) + '×' : '–'}</b></span></div>
      <div class="chips">${(x.reasons || []).slice(0, 3).map((r) => `<span class="chip">${esc(r)}</span>`).join('')}${(x.flags || []).slice(0, 2).map((r) => `<span class="chip warn">${esc(r)}</span>`).join('')}</div>
    </div>`).join('') : `<div class="empty"><strong>No re-ignition alerts yet</strong>An alert fires when a survivor scores ≥ ${thr}: volume running hotter than its hourly pace, buyers in control, and a higher low or breakout.</div>`;

  const P = S.gPaper;
  if (P) {
    const c = P.config;
    $('#gKill').innerHTML = killHtml(P.kill, `Model: ${sUsd(c.sizeSol)} (${c.sizeSol} SOL) per alert, filled at the next poll's price plus constant-product price impact from pool depth, ${c.feePct}% fee each side, +${c.extraSlippagePct}% slippage; sell ${c.tp1Fraction * 100}% at ${c.tp1Multiple}×, ${c.trailPct}% trailing stop, −${c.stopPct}% hard stop, ${c.maxHoldMin / 60}h max hold.`);
    const all = [...P.open.map((p) => ({ ...p, status: 'open' })), ...P.recent.filter((r) => r.status !== 'open')];
    $('#gPosHint').textContent = `${P.open.length} open`;
    $('#gPositions tbody').innerHTML = all.length ? all.slice(0, 50).map((p) => {
      const pnl = p.status === 'open' ? p.markPct : p.pnl_pct;
      return `<tr data-gmint="${p.mint}"><td class="c-tok"><span class="sym">${esc(p.symbol)}</span></td><td data-label="Status">${p.status === 'open' ? '<span class="acc">open</span>' : 'closed'}</td>
        <td class="num" data-label="Entry mcap">${usd(p.entryMcap ?? p.entry_mcap)}</td><td class="num" data-label="Mark / exit">${usd(p.status === 'open' ? p.mcap : (p.events || []).slice(-1)[0]?.mcap)}</td>
        <td class="num ${cls(pnl)}" data-label="P&amp;L">${signed(pnl, 1, '%')}</td><td class="faint" data-label="Exit">${esc(p.exit_reason || (p.tp1Done ? 'TP1 taken' : '–'))}</td><td class="num faint" data-label="Opened">${ago(p.entryTs ?? p.entry_ts)} ago</td></tr>`;
    }).join('') : `<tr><td colspan="8"><div class="empty"><strong>No paper trades yet</strong>Each re-ignition alert opens a simulated ${sUsd(c.sizeSol)} position at the next price reading.</div></td></tr>`;
  }

  const C = S.gCal;
  if (C) {
    if (!C.n) $('#gCal').innerHTML = `<div class="empty"><strong>No labeled snapshots yet</strong>Snapshots are labeled 6 hours after they are taken. Calibration fills in after the first 6 hours of uptime.</div>`;
    else {
      const bk = [...C.buckets.filter((x) => x.n > 0), C.rejected.n ? C.rejected : null].filter(Boolean);
      barsChart($('#gCal'), bk.map((x) => x.label), [
        { name: 'reached +50%', color: css('--accent'), values: bk.map((x) => x.up50Pct) },
        { name: 'reached +100%', color: css('--up'), values: bk.map((x) => x.up100Pct) },
        { name: 'fell 50%+', color: css('--down'), values: bk.map((x) => x.down50Pct) },
      ], { labels: bk.map((x) => `n=${x.n}`) });
      $('#gCal').insertAdjacentHTML('beforeend', `<div class="legend"><span><i style="background:${css('--accent')}"></i>+50% within 6h</span><span><i style="background:${css('--up')}"></i>+100%</span><span><i style="background:${css('--down')}"></i>fell 50%+</span></div>`);
    }
  }
  renderGFilter();
}
function renderGFilter() {
  const b = S.gBoard; if (!b) return;
  const list = S.gFilter === 'warming' ? b.warming : b.rejected;
  $('#gFilterHint').textContent = `${b.rejectedCount} filtered · ${b.warmingCount} warming`;
  document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-selected', x.dataset.f === S.gFilter));
  $('#gFilter').innerHTML = list.length ? list.map((t) => `<div class="mini-row" data-gmint="${t.mint}"><span class="sym">${esc(t.symbol || '?')}</span><span class="mono faint">${usd(t.liqUsd)} liq</span><span class="reason">${esc((t.reject || '').startsWith('liquidity') ? `below ${usd(b.stats.minLiqUsd)} minimum` : t.reject || '')}</span></div>`).join('')
    : `<div class="empty">${S.gFilter === 'warming' ? 'No fresh graduates in their first minutes right now.' : 'Nothing filtered out right now.'}</div>`;
}
document.querySelectorAll('.seg button').forEach((x) => (x.onclick = () => { S.gFilter = x.dataset.f; renderGFilter(); }));
$('#tab-grads').addEventListener('click', (e) => { const el = e.target.closest('[data-gmint]'); if (el) openGradDrawer(el.dataset.gmint); });

async function openGradDrawer(mint) {
  $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false');
  $('#drawerBody').innerHTML = '<div class="skel" style="width:40%;height:28px"></div><div class="skel" style="margin-top:12px;width:70%"></div><div class="skel" style="margin-top:24px;height:140px"></div>';
  let d; try { d = await get(`/api/grads/token/${mint}`); } catch { $('#drawerBody').innerHTML = '<div class="empty"><strong>No longer watched</strong>The token dropped off the watchlist (liquidity gone, aged out, or evicted).</div>'; return; }
  const f = d.features || {}, parts = d.parts || {};
  const pmax = { volume: 20, activity: 10, pressure: 15, structure: 20, liquidity: 15, survival: 10, social: 10, chasing: 15, distribution: 10, paidNoDemand: 5, thin: 6 };
  const label = { volume: 'volume pace', activity: 'tx pace', pressure: 'buy pressure', structure: 'structure', liquidity: 'liquidity', survival: 'survival', social: 'social', chasing: 'chasing', distribution: 'distribution', paidNoDemand: 'paid, no demand', thin: 'thin pool' };
  const socials = (d.info?.socials || []).map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.type === 'twitter' ? 'X' : x.type)}</a>`).join('');
  const sites = (d.info?.websites || []).slice(0, 1).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">Website</a>`).join('');
  const yn = (v) => (v == null ? '–' : v ? 'yes' : 'no');
  const feat = [['Mcap', usd(f.mcapUsd)], ['Liquidity', usd(f.liqUsd)], ['FDV / liquidity', f.fdvLiq != null ? `${n(f.fdvLiq, 1)}×` : '–'], ['vs migration', mult(f.vsMig, f.migEstimated)],
    ['From tracked peak', f.fromPeak != null ? pct((f.fromPeak - 1) * 100, 0) : '–'], ['Volume 5m', usd(f.vol5)], ['Volume 1h', usd(f.vol1h)], ['Volume 24h', usd(f.vol24)],
    ['Volume pace', f.volAccel != null ? `${n(f.volAccel, 2)}×` : '–'], ['Tx pace', f.txAccel != null ? `${n(f.txAccel, 2)}×` : '–'], ['Buys 5m', f.tx5 ? `${pct(f.buyRatio5 * 100, 0)} of ${f.tx5}` : '–'], ['Buys 1h', f.tx1h ? `${pct(f.buyRatio1h * 100, 0)} of ${f.tx1h}` : '–'],
    ['Change 5m / 1h', `${f.c5 != null ? signed(f.c5, 0, '%') : '–'} / ${f.c1h != null ? signed(f.c1h, 0, '%') : '–'}`], ['Change 6h / 24h', `${f.c6h != null ? signed(f.c6h, 0, '%') : '–'} / ${f.c24 != null ? signed(f.c24, 0, '%') : '–'}`],
    ['Higher low', yn(f.higherLow)], ['Breakout', yn(f.breakout)], ['1h base range', f.baseRangePct != null ? pct(f.baseRangePct, 0) : '–'], ['Liquidity 30m', f.liqTrend != null ? signed((f.liqTrend - 1) * 100, 0, '%') : '–'],
    ['Paid boosts', f.boosts || 0], ['Socials / site', `${f.socials || 0} / ${f.hasSite ? 'yes' : 'no'}`], ['Pool', `${esc(d.dex || '–')} · ${esc(d.quote || '–')}`], ['Polls recorded', f.seriesPts ?? '–']];
  $('#drawerBody').innerHTML = `
    <h2 class="d-title">${esc(d.symbol || '?')}</h2><div class="d-sub">${esc(d.name || '')} · ${age((d.ageMin || 0) * 60)} since migration · via ${esc(d.source)}</div>
    <div class="d-mint" title="Tap to copy" data-copy="${mint}">${mint}</div>
    <div class="d-links"><a href="${esc(d.url || `https://dexscreener.com/solana/${mint}`)}" target="_blank" rel="noopener">DexScreener</a><a href="https://pump.fun/coin/${mint}" target="_blank" rel="noopener">pump.fun</a><a href="https://solscan.io/token/${mint}" target="_blank" rel="noopener">Solscan</a>${socials}${sites}</div>
    ${d.series?.length > 1 ? `<div class="d-sec"><h3>Market cap (USD), since tracking</h3><div id="gSpark" class="chart spark"></div></div>` : ''}
    <div class="d-sec"><h3>Re-ignition score ${d.reject ? `<span class="reject">· not scored: ${esc(d.reject)}</span>` : `· ${n(d.score, 1)}`}</h3>
      <div class="parts">${Object.entries(parts).map(([k, v]) => `<div class="part ${v < 0 ? 'neg' : ''}"><span>${label[k] || k}</span><div class="bar"><i style="width:${Math.min(100, (Math.abs(v) / (pmax[k] || 10)) * 100)}%"></i></div><span>${n(v, 1)}</span></div>`).join('')}</div>
      ${(d.reasons || []).length || (d.flags || []).length ? `<div class="chips" style="margin-top:10px">${(d.reasons || []).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}${(d.flags || []).map((x) => `<span class="chip warn">${esc(x)}</span>`).join('')}</div>` : ''}</div>
    <div class="d-sec"><h3>Features</h3><div class="feat">${feat.map(([a, b]) => `<div><span class="muted">${a}</span><span>${b ?? '–'}</span></div>`).join('')}</div></div>
    ${d.alerts?.length ? `<div class="d-sec"><h3>Alert history</h3><div class="feat">${d.alerts.map((a) => `<div><span class="muted">${ago(a.ts)} ago · score ${Math.floor(a.score)}</span><span>${usd(a.mcap)}${a.max_6h ? ` → peak ${n(a.max_6h, 2)}×` : ''}</span></div>`).join('')}</div></div>` : ''}`;
  if (d.series?.length > 1) lineChart($('#gSpark'), d.series, { zero: false, h: 140, yFmt: (v) => usd(v), color: css('--accent') });
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
  const featRows = [['Mcap', sUsd(f.mcapSol)], ['Curve', pct(f.progressPct, 1)], ['Net inflow', sUsdSigned(f.netSol)], ['Net in / min', sUsdSigned(f.netSolPerMin)], ['Flow 60s', sUsdSigned(f.flow60Sol)], ['Unique buyers', f.uniqueBuyers], ['Buyers / min', n(f.buyersPerMin, 1)], ['Buy/sell ratio', n(f.buySellRatio, 2)],
    ['Top-10 hold', pct(f.top10Pct, 1)], ['Creator holds', pct(f.creatorHoldPct, 1)], ['Creator sold', pct(f.creatorSoldPct, 0)], ['Dev initial buy', sUsd(f.initialBuySol)], ['Bundle share', pct(f.bundlePct, 0)], ['Repeat-trade share', pct((f.repeatTradeShare || 0) * 100, 0)], ['Drawdown from peak', pct(f.drawdownPct, 0)], ['Smart wallets', f.smartBuyers ?? 0],
    ['Creator launches', f.creatorLaunches ?? '–'], ['Creator grads', f.creatorGraduations ?? '–'], ['Telegram / X / web', `${f.hasTelegram ? 'Y' : '–'} / ${f.hasTwitter ? 'Y' : '–'} / ${f.hasWebsite ? 'Y' : '–'}`]];
  const pmax = { flow: 22, momentum: 10, breadth: 16, pressure: 8, distribution: 10, stage: 8, social: 10, smart: 15, creator: 6, skin: 4 };
  $('#drawerBody').innerHTML = `
    <h2 class="d-title">${esc(sym)}</h2><div class="d-sub">${esc(name)} · ${L ? `age ${age(L.ageSec)}` : 'archived'} ${L?.graduated || st.graduated ? '· <span class="up">graduated</span>' : ''}</div>
    <div class="d-mint" title="Click to copy" data-copy="${mint}">${mint}</div>
    <div class="d-links"><a href="https://pump.fun/coin/${mint}" target="_blank" rel="noopener">pump.fun</a><a href="https://solscan.io/token/${mint}" target="_blank" rel="noopener">Solscan</a><a href="https://dexscreener.com/solana/${mint}" target="_blank" rel="noopener">DexScreener</a>${L?.social?.links?.telegram ? `<a href="${esc(L.social.links.telegram)}" target="_blank" rel="noopener">Telegram</a>` : ''}${L?.social?.links?.twitter ? `<a href="${esc(L.social.links.twitter)}" target="_blank" rel="noopener">X</a>` : ''}</div>
    ${L?.series?.length > 1 ? `<div class="d-sec"><h3>Market cap (USD)</h3><div id="dSpark" class="chart spark"></div></div>` : ''}
    <div class="d-sec"><h3>Score ${L?.reject ? `<span class="reject">· rejected: ${esc(L.reject)}</span>` : L?.score != null ? `· ${n(L.score, 1)}` : ''}</h3>
      <div class="parts">${Object.entries(parts).map(([k, v]) => `<div class="part ${v < 0 ? 'neg' : ''}"><span>${k}</span><div class="bar"><i style="width:${Math.min(100, (Math.abs(v) / (pmax[k] || 10)) * 100)}%"></i></div><span>${n(v, 1)}</span></div>`).join('') || '<div class="faint">No live score (token archived).</div>'}</div>
      ${L?.flags?.length ? `<div class="chips" style="margin-top:10px">${L.flags.map((x) => `<span class="chip warn">${esc(x)}</span>`).join('')}</div>` : ''}</div>
    <div class="d-sec"><h3>Features</h3><div class="feat">${featRows.map(([a, b]) => `<div><span class="muted">${a}</span><span>${esc(b ?? '–')}</span></div>`).join('')}</div></div>
    ${L?.topHolders?.length ? `<div class="d-sec"><h3>Top holders (wallets, excl. curve)</h3><div class="feat">${L.topHolders.map((h) => `<div><span class="mono">${short(h.w)}${h.creator ? ' <span class="acc">dev</span>' : ''}</span><span>${pct(h.pct, 2)}</span></div>`).join('')}</div></div>` : ''}
    ${L?.lastTrades?.length ? `<div class="d-sec"><h3>Recent trades</h3><div class="trades">${L.lastTrades.map((t) => `<div><span class="faint">${ago(t.at)}</span><span class="${t.b ? 'up' : 'down'}">${t.b ? 'BUY' : 'SELL'}</span><span>${short(t.w)}</span><span style="text-align:right">${sUsd(t.sol)}</span><span style="text-align:right" class="faint">${sUsd(t.mcap)}</span></div>`).join('')}</div></div>` : ''}
    ${d.snapshots.length ? `<div class="d-sec"><h3>Snapshots</h3><div class="feat">${d.snapshots.map((s) => `<div><span class="muted">${s.checkpoint}s · score ${s.reject ? '✕' : n(s.score, 0)}</span><span>${sUsd(s.mcap)}${s.max_mcap_after ? ` → max ${n(s.max_mcap_after / s.mcap, 2)}×` : ''}</span></div>`).join('')}</div></div>` : ''}`;
  if (L?.series?.length > 1) lineChart($('#dSpark'), L.series.map(([t, m]) => [t, m * (solPx() || 1)]), { zero: false, h: 140, yFmt: (v) => (solPx() ? usd(v) : n(v, 0)), color: css('--accent') });
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
    es.addEventListener('radar', (e) => { lastSse = Date.now(); S.radar = floorScores(JSON.parse(e.data)); renderBoard(); renderStatus(); });
    es.addEventListener('alert', (e) => { const a = JSON.parse(e.data); toast(`Alert · ${a.symbol} · score ${Math.round(a.score)}`); refreshAlerts(); });
    es.addEventListener('paper', (e) => { try { termTail(JSON.parse(e.data)); } catch {} if (S.tab === 'perf') { clearTimeout(S._perfT); S._perfT = setTimeout(() => { loadPerf(); loadTerm(); }, 1500); } });
    es.addEventListener('gradAlert', (e) => { const a = JSON.parse(e.data); toast(`Re-ignition · ${a.symbol} · score ${Math.floor(a.score)}`); if (S.tab === 'grads') loadGrads(); });
    es.addEventListener('gradPaper', () => { if (S.tab === 'grads') loadGrads(); });
  } catch { /* fallback below */ }
}
async function refreshAlerts() { try { S.alerts = await get('/api/alerts?limit=60'); renderAlerts(); } catch {} }
async function poll() {
  if (Date.now() - lastSse > 7000) {
    try { const [st, r] = await Promise.all([get('/api/status'), get('/api/radar?limit=60')]); S.status = st; S.radar = floorScores(r); renderStatus(); renderBoard(); } catch {}
  }
}
async function boot() {
  await poll(); await refreshAlerts();
  connectSse();
  setInterval(poll, 3000);
  setInterval(refreshAlerts, 15000);
  setInterval(() => { if (S.tab === 'perf') { loadPerf(); loadTerm(true); } if (S.tab === 'intel') loadIntel(); if (S.tab === 'report') loadReport(); }, 20000);
  setInterval(() => { if (S.tab === 'grads' && !document.hidden) loadGrads(); }, 15000);
  if (location.hash === '#grads') document.querySelector('.tabs [data-tab=grads]')?.click();
}
// =====================================================================
// Trade terminal: timeline (radar-styled canvas), strategy scoreboard, interactive console
// =====================================================================
const T = { book: '', days: 14, tl: null, sr: null, hover: null, pts: [], hist: [], hi: -1, tail: true, scan: 0, lastLoad: 0, live: false };
const BOOK_COL = (b) => css(`--b-${b}`) || css('--accent');
const BOOK_LABEL = (b) => ({ main: 'Main', band: 'Band', flow: 'Flow', confirm: 'Confirm' }[b] || b);
const tcv = $('#termCanvas'), tctx = tcv.getContext('2d');
const tout = $('#termOut');
const out = (html, c = '') => { const d = document.createElement('div'); d.className = `ln ${c}`; d.innerHTML = html; tout.appendChild(d); while (tout.childElementCount > 600) tout.firstChild.remove(); tout.scrollTop = tout.scrollHeight; return d; };
const pc = (x, d = 1) => (x == null || !Number.isFinite(x) ? '<span class="dim">–</span>' : `<span class="${x > 0 ? 'up' : x < 0 ? 'down' : 'dim'}">${x > 0 ? '+' : ''}${x.toFixed(d)}%</span>`);
const tm = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const lk = (cmd, label) => `<span class="lk" data-cmd="${esc(cmd)}">${esc(label)}</span>`;
const bookTag = (b) => `<span class="tag" style="color:${BOOK_COL(b)};border-color:${BOOK_COL(b)}55">${BOOK_LABEL(b)}</span>`;

async function loadTerm(force = false) {
  if (!force && Date.now() - T.lastLoad < 4000) return;
  T.lastLoad = Date.now();
  try {
    [T.tl, T.sr] = await Promise.all([get(`/api/terminal/timeline?days=${T.days}`), get(`/api/terminal/strategies?days=${T.days}`)]);
    renderTermControls(); renderBoardSb(); layoutTimeline();
  } catch (e) { console.warn('terminal', e); }
}
function renderTermControls() {
  const bs = T.tl?.books || [];
  const el = $('#termBook');
  const want = ['', ...bs.map((b) => b.id)].join(',');
  if (el.dataset.k !== want) {
    el.dataset.k = want;
    el.innerHTML = [`<button type="button" data-b="" aria-pressed="${T.book === ''}">All</button>`, ...bs.map((b) => `<button type="button" data-b="${b.id}" aria-pressed="${T.book === b.id}">${b.label}</button>`)].join('');
  }
  $('#termLegend').innerHTML = bs.filter((b) => !T.book || b.id === T.book).map((b) => `<span><i style="background:${BOOK_COL(b.id)}"></i>${b.label}</span>`).join('');
}
$('#termBook').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; T.book = b.dataset.b; $('#termBook').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderTermControls(); layoutTimeline(); renderBoardSb(); });
$('#termDays').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; T.days = Number(b.dataset.d); $('#termDays').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); loadTerm(true); });

// ---- scoreboard ----
function renderBoardSb() {
  const R = T.sr?.strategies; if (!R) return;
  const rows = R.filter((r) => !T.book || r.book === T.book);
  $('#termBoard').innerHTML = rows.map((r) => {
    const v = r.verdict === 'NOT WORKING' ? 'NOT' : r.verdict;
    const lo = r.ciLowPct, hi = r.ciHighPct, X = (x) => 55 + Math.max(-50, Math.min(50, x)) * 1.0; // -50..+50% -> 5..105
    const range = `<svg class="sb-range" viewBox="0 0 110 14"><line x1="5" x2="105" y1="7" y2="7" stroke="${css('--grid')}" stroke-width="6" stroke-linecap="round"/>
      <line x1="55" x2="55" y1="1" y2="13" stroke="${css('--text-faint')}" stroke-width="1"/>
      ${lo != null ? `<line x1="${X(lo)}" x2="${X(hi)}" y1="7" y2="7" stroke="${BOOK_COL(r.book)}" stroke-width="4" stroke-linecap="round" opacity=".85"/>` : ''}
      ${r.avgPct != null ? `<circle cx="${X(r.avgPct)}" cy="7" r="3" fill="${css('--text')}"/>` : ''}</svg>`;
    const top = r.causes.find((c) => !['TARGET', 'GRADUATED', 'SMALL WIN'].includes(c.cause));
    return `<button class="sb-row" type="button" data-cmd="strategy ${r.book}">
      <span class="bar" style="background:${BOOK_COL(r.book)}"></span>
      <span style="min-width:0"><span class="sb-name">${r.label} <span class="vchip-s ${v}">${r.verdict}</span></span>
        <span class="sb-entry" title="${esc(r.entry)}">${esc(r.entry)}</span>
        <span class="sb-stats">${r.n} trades · ${r.winRatePct == null ? '–' : Math.round(r.winRatePct) + '%'} win (needs ${Math.round(r.breakevenWinPct)}%)${top ? ` · top loss: ${top.cause.toLowerCase()}` : ''}</span></span>
      <span><span class="sb-avg ${cls(r.avgPct)}">${r.avgPct == null ? '–' : signed(r.avgPct, 1, '%')}</span>${range}</span></button>`;
  }).join('') + `<div class="small-note">Bar = 95% range of average P&amp;L per trade (−50% to +50%), dot = average, tick = zero. Click a strategy for its full report.</div>`;
}
$('#termBoard').addEventListener('click', (e) => { const b = e.target.closest('[data-cmd]'); if (b) run(b.dataset.cmd); });

// ---- timeline (canvas) ----
function layoutTimeline() {
  const tl = T.tl; T.pts = []; T.series = [];
  if (!tl) return;
  const px = tl.solUsd || solPx() || 0;
  const now = Date.now(), t0 = now - T.days * 86400000;
  const trades = tl.trades.filter((x) => (!T.book || x.book === T.book) && x.t >= t0);
  // fit the time axis to the data when it covers only part of the window (fresh installs, restarts)
  const first = trades.length ? Math.min(...trades.map((x) => x.entry || x.t)) : t0;
  const tStart = Math.max(t0, first - Math.max(10 * 60000, (now - first) * 0.04));
  T.fitted = tStart > t0;
  const books = (tl.books || []).map((b) => b.id).filter((b) => !T.book || b === T.book);
  const series = books.map((b) => { let c = 0; const pts = [[tStart, 0]]; for (const x of trades.filter((y) => y.book === b)) { c += (x.pnlSol || 0) * (px || 1); pts.push([x.t, c, x]); } return { b, pts }; });
  T.series = series; T.t0 = tStart; T.t1 = now; T.trades = trades;
  const all = series.flatMap((s) => s.pts.map((p) => p[1]));
  T.y0 = Math.min(0, ...all); T.y1 = Math.max(0, ...all); if (T.y1 - T.y0 < 1) { T.y0 -= 1; T.y1 += 1; }
}
function drawTerm() {
  if (S.tab !== 'perf') return;
  const c = tctx, dpr = devicePixelRatio || 1, w = tcv.clientWidth, h = tcv.clientHeight; if (!w) return;
  if (tcv.width !== Math.round(w * dpr)) { tcv.width = Math.round(w * dpr); tcv.height = Math.round(h * dpr); }
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  const P = { l: 58, r: 14, t: 34, b: 26 };
  const grid = css('--grid'), faint = css('--text-faint');
  c.font = '11px Geist Mono, monospace'; c.lineWidth = 1;
  if (!T.series?.length || !T.trades?.length) {
    c.fillStyle = faint; c.textAlign = 'center'; c.fillText(T.tl ? 'No closed trades in this window yet' : 'Loading…', w / 2, h / 2); c.textAlign = 'left';
    drawScan(c, P, w, h); return;
  }
  const X = (t) => P.l + ((t - T.t0) / (T.t1 - T.t0)) * (w - P.l - P.r);
  const Y = (v) => P.t + (1 - (v - T.y0) / (T.y1 - T.y0)) * (h - P.t - P.b);
  // grid
  for (let i = 0; i <= 4; i++) { const v = T.y0 + ((T.y1 - T.y0) * i) / 4, y = Y(v); c.strokeStyle = grid; c.beginPath(); c.moveTo(P.l, y); c.lineTo(w - P.r, y); c.stroke(); c.fillStyle = faint; c.textAlign = 'right'; c.fillText(usd(v), P.l - 8, y + 4); }
  c.textAlign = 'left';
  const nT = w < 500 ? 3 : 6;
  for (let i = 0; i <= nT; i++) { const t = T.t0 + ((T.t1 - T.t0) * i) / nT, x = X(t); c.strokeStyle = grid; c.beginPath(); c.moveTo(x, P.t); c.lineTo(x, h - P.b); c.stroke();
    c.fillStyle = faint; c.textAlign = i === 0 ? 'left' : i === nT ? 'right' : 'center'; c.fillText(new Date(t).toLocaleString([], T.t1 - T.t0 <= 2 * 86400000 ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' }), x, h - 8); }
  if (T.fitted && w >= 560) { c.fillStyle = faint; c.textAlign = 'right'; c.fillText('axis fitted to recorded data', w - P.r, P.t - 8); c.textAlign = 'left'; }
  c.textAlign = 'left';
  c.setLineDash([3, 3]); c.strokeStyle = faint; c.beginPath(); c.moveTo(P.l, Y(0)); c.lineTo(w - P.r, Y(0)); c.stroke(); c.setLineDash([]);
  drawScan(c, P, w, h);
  // series with glow
  T.pts = [];
  for (const s of T.series) {
    if (s.pts.length < 2) continue;
    const col = BOOK_COL(s.b);
    c.save(); c.shadowColor = col; c.shadowBlur = 8; c.strokeStyle = col; c.lineWidth = 1.8; c.beginPath();
    s.pts.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); if (i) { c.lineTo(x, Y(s.pts[i - 1][1])); c.lineTo(x, y); } else c.moveTo(x, y); });
    c.lineTo(X(T.t1), Y(s.pts[s.pts.length - 1][1])); c.stroke(); c.restore();
    for (const p of s.pts.slice(1)) {
      const tr = p[2], x = X(p[0]), y = Y(p[1]), r = 2.2 + Math.min(5, Math.abs(tr.pnlPct) / 12);
      const win = tr.pnlPct > 0;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = win ? css('--up') : css('--down'); c.globalAlpha = win ? 1 : 0.75; c.fill(); c.globalAlpha = 1;
      if (win) { c.beginPath(); c.arc(x, y, r + 3, 0, Math.PI * 2); c.strokeStyle = css('--up'); c.globalAlpha = 0.35; c.stroke(); c.globalAlpha = 1; }
      T.pts.push({ x, y, r: r + 3, tr, b: s.b });
    }
  }
  if (T.hover) {
    const { x, y, tr, b } = T.hover;
    c.strokeStyle = css('--border'); c.beginPath(); c.moveTo(x, P.t); c.lineTo(x, h - P.b); c.stroke();
    const lines = [`${tr.symbol} · ${BOOK_LABEL(b)} · #${tr.id}`, `${tr.pnlPct > 0 ? '+' : ''}${tr.pnlPct.toFixed(1)}% · ${sUsdSigned(tr.pnlSol)}`, `${(tr.cause || tr.reason || '').toLowerCase()}`, tm(tr.t)];
    c.font = '11px Geist Mono, monospace'; const bw = Math.max(...lines.map((l) => c.measureText(l).width)) + 20, bh = 70;
    let bx = x + 12, by = y - bh - 8; if (bx + bw > w) bx = x - bw - 12; if (by < 4) by = y + 12;
    c.fillStyle = css('--surface-3'); c.strokeStyle = css('--border'); c.beginPath(); c.roundRect(bx, by, bw, bh, 6); c.fill(); c.stroke();
    lines.forEach((l, i) => { c.fillStyle = i === 0 ? css('--text') : i === 1 ? css(tr.pnlPct > 0 ? '--up' : '--down') : css('--text-muted'); c.font = i === 0 ? '600 12px Geist, sans-serif' : '11px Geist Mono, monospace'; c.fillText(l, bx + 10, by + 17 + i * 15); });
  }
}
function drawScan(c, P, w, h) {
  // radar-style scan line sweeping the time axis
  T.scan = (T.scan + 0.0022) % 1;
  const x = P.l + T.scan * (w - P.l - P.r), acc = css('--accent');
  const g = c.createLinearGradient(x - 90, 0, x, 0); g.addColorStop(0, 'transparent'); g.addColorStop(1, acc + '1f');
  c.fillStyle = g; c.fillRect(Math.max(P.l, x - 90), P.t, Math.min(90, x - P.l), h - P.t - P.b);
  c.strokeStyle = acc + '66'; c.beginPath(); c.moveTo(x, P.t); c.lineTo(x, h - P.b); c.stroke();
}
const termHit = (e) => { const b = tcv.getBoundingClientRect(); const x = e.clientX - b.left, y = e.clientY - b.top; let best = null, bd = 1e9; for (const p of T.pts) { const d = Math.hypot(p.x - x, p.y - y); if (d < p.r + 6 && d < bd) { bd = d; best = p; } } return best; };
tcv.addEventListener('mousemove', (e) => { T.hover = termHit(e); tcv.style.cursor = T.hover ? 'pointer' : 'crosshair'; });
tcv.addEventListener('mouseleave', () => { T.hover = null; });
tcv.addEventListener('click', (e) => { const p = termHit(e); if (p) { run(`why ${p.tr.id}`); $('#term').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } });
addEventListener('resize', () => { if (S.tab === 'perf') drawTerm(); });

// ---- console ----
const CMDS = {
  help: { args: '', desc: 'list commands', fn: cmdHelp },
  strategies: { args: '', desc: 'scoreboard: every strategy, ranked by average P&L per trade', fn: cmdStrategies },
  strategy: { args: '<book>', desc: 'full report: what worked, what did not, why, what to change', fn: cmdStrategy },
  trades: { args: '[book] [win|loss|skipped] [n]', desc: 'recent trades with entry time, P&L and cause', fn: cmdTrades },
  why: { args: '<id|SYMBOL>', desc: 'forensics for one trade: price path, entry features vs winners/losers, cause', fn: cmdWhy },
  causes: { args: '[book]', desc: 'why trades won or lost, counted and averaged', fn: cmdCauses },
  compare: { args: '', desc: 'every strategy against Main, with the gap per trade', fn: cmdCompare },
  pnl: { args: '[24h|7d|14d]', desc: 'P&L per strategy over a window', fn: cmdPnl },
  report: { args: '', desc: 'the two-week decision checklist', fn: cmdReport },
  tail: { args: '[on|off]', desc: 'stream entries, exits and skips live (default on)', fn: (a) => { T.tail = a[0] !== 'off'; out(`live tail ${T.tail ? '<span class="up">on</span>' : '<span class="dim">off</span>'}`); $('#termLive').classList.toggle('off', !T.tail); } },
  clear: { args: '', desc: 'clear the screen', fn: () => { tout.innerHTML = ''; } },
};
function cmdHelp() {
  out('<span class="hd">Commands</span>');
  out(`<table>${Object.entries(CMDS).map(([k, v]) => `<tr><td>${lk(k, k)} <span class="dim">${esc(v.args)}</span></td><td class="dim">${esc(v.desc)}</td></tr>`).join('')}</table>`);
  out('<span class="dim">Tab completes, ↑/↓ recalls history, click any underlined item. Books: </span>' + (T.tl?.books || []).map((b) => lk(`strategy ${b.id}`, b.id)).join(' '));
}
async function ensureSr() { if (!T.sr) await loadTerm(true); return T.sr; }
async function cmdStrategies() {
  const sr = await ensureSr();
  out(`<span class="hd">Strategies · last ${sr.days}d · costs ≈ ${sr.costPct.toFixed(1)}% round trip</span>`);
  out(`<table><tr><th>book</th><th class="r">trades</th><th class="r">win</th><th class="r">needs</th><th class="r">avg/trade</th><th class="r">95% range</th><th class="r">P&amp;L</th><th>verdict</th></tr>${sr.strategies.map((r) => `<tr>
    <td>${lk(`strategy ${r.book}`, r.label)}</td><td class="r">${r.n}</td><td class="r">${r.winRatePct == null ? '–' : Math.round(r.winRatePct) + '%'}</td><td class="r dim">${Math.round(r.breakevenWinPct)}%</td>
    <td class="r">${pc(r.avgPct)}</td><td class="r dim">${r.ciLowPct == null ? '–' : `${r.ciLowPct.toFixed(0)}..${r.ciHighPct.toFixed(0)}%`}</td><td class="r ${cls(r.pnlSol)}">${sUsdSigned(r.pnlSol)}</td>
    <td class="${r.verdict === 'WORKING' ? 'up' : r.verdict === 'NOT WORKING' ? 'down' : 'acc'}">${r.verdict}</td></tr>`).join('')}</table>`);
}
async function cmdStrategy(a) {
  const sr = await ensureSr(); const b = (a[0] || T.book || 'main').toLowerCase();
  const r = sr.strategies.find((x) => x.book === b || x.label.toLowerCase() === b);
  if (!r) return out(`<span class="down">unknown book "${esc(b)}"</span>. Try: ${sr.strategies.map((x) => lk(`strategy ${x.book}`, x.book)).join(' ')}`);
  out(`<span class="hd" style="color:${BOOK_COL(r.book)}">■ ${r.label}</span> <span class="${r.verdict === 'WORKING' ? 'up' : r.verdict === 'NOT WORKING' ? 'down' : 'acc'}">${r.verdict}</span> <span class="dim">· last ${sr.days}d</span>`);
  out(`<span class="dim">entry</span>   ${esc(r.entry)}`);
  out(`<span class="dim">exits</span>   +${r.exits.tpNetPct.toFixed(1)}% net target · −${r.exits.stopNetPct}% net stop · ${r.exits.maxHoldMin} min max · enters ${r.exits.delaySec}s after the signal`);
  out(`<span class="dim">thesis</span>  ${esc(r.thesis)}`);
  out(`<span class="dim">result</span>  ${r.n} trades · ${r.winRatePct == null ? '–' : Math.round(r.winRatePct) + '%'} win (breakeven ${Math.round(r.breakevenWinPct)}%) · avg ${pc(r.avgPct)} · 95% range ${r.ciLowPct == null ? '–' : `${pc(r.ciLowPct, 0)} to ${pc(r.ciHighPct, 0)}`} · ${sUsdSigned(r.pnlSol)}`);
  if (r.worked.length) { out('<span class="up">What worked</span>'); r.worked.forEach((l) => out(`  ${esc(l)}`)); }
  if (r.didnt.length) { out('<span class="down">What did not</span>'); r.didnt.forEach((l) => out(`  ${esc(l)}`)); }
  if (r.causes.length) out(`<table><tr><th>cause</th><th class="r">trades</th><th class="r">share</th><th class="r">avg</th></tr>${r.causes.map((c) => `<tr><td>${esc(c.cause)}</td><td class="r">${c.n}</td><td class="r dim">${c.sharePct.toFixed(0)}%</td><td class="r">${pc(c.avgPct)}</td></tr>`).join('')}</table>`);
  if (r.features.length) {
    out('<span class="info">Winners vs losers at entry</span> <span class="dim">(median; separation: how often a winner beat a loser on it, 50% = no signal)</span>');
    out(`<table><tr><th>feature</th><th class="r">winners</th><th class="r">losers</th><th class="r">separation</th></tr>${r.features.map((f) => `<tr><td>${esc(f.label)}</td><td class="r up">${fmtv(f.winners, f.unit)}</td><td class="r down">${fmtv(f.losers, f.unit)}</td><td class="r ${Math.abs(f.gap) >= 0.3 ? 'acc' : 'dim'}">${Math.round(f.auc * 100)}% ${f.gap > 0 ? '↑' : '↓'}</td></tr>`).join('')}</table>`);
  }
  if (r.skipped.n) out(`<span class="dim">skipped ${r.skipped.n} signals:</span> ${r.skipped.reasons.map((x) => `${esc(x.reason)} (${x.n})`).join(' · ')}`);
  if (r.next.length) { out('<span class="acc">What to change</span>'); r.next.forEach((l) => out(`  ${esc(l)}`)); }
  out(`${lk(`trades ${r.book} loss 15`, 'see losers')}  ${lk(`trades ${r.book} win 15`, 'see winners')}  ${lk(`causes ${r.book}`, 'causes')}`);
}
const fmtv = (v, u) => (v == null ? '–' : `${Number.isInteger(v) ? v : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)}${u && u !== '×' ? ' ' + u : u}`);
async function cmdTrades(a) {
  let book = '', filt = '', lim = 20;
  for (const x of a) { if (/^\d+$/.test(x)) lim = Math.min(100, +x); else if (['win', 'wins', 'loss', 'losses', 'skipped', 'skip', 'open'].includes(x)) filt = x.replace(/s$/, '').replace('losse', 'loss'); else book = x; }
  const rows = (await get(`/api/terminal/trades?limit=${Math.max(60, lim * 4)}${book ? `&book=${encodeURIComponent(book)}` : ''}`)).filter((r) =>
    !filt ? r.status !== 'skipped' : filt === 'win' ? r.status === 'closed' && r.pnl_pct > 0 : filt === 'loss' ? r.status === 'closed' && r.pnl_pct <= 0 : filt === 'skip' || filt === 'skipped' ? r.status === 'skipped' : r.status === filt).slice(0, lim);
  out(`<span class="hd">Trades</span> <span class="dim">${book || 'all books'}${filt ? ' · ' + filt : ''} · newest first</span>`);
  if (!rows.length) return out('<span class="dim">none yet</span>');
  out(`<table><tr><th>#</th><th>book</th><th>token</th><th>entered</th><th class="r">signal→entry</th><th class="r">best</th><th class="r">P&amp;L</th><th>why</th></tr>${rows.map((r) => `<tr>
    <td>${lk(`why ${r.id}`, r.id)}</td><td style="color:${BOOK_COL(r.book)}">${BOOK_LABEL(r.book)}</td><td>${esc(r.symbol)}</td><td class="dim">${tm(r.entry_ts)}</td>
    <td class="r">${pc(r.entry_slip_pct)}</td><td class="r">${r.status === 'skipped' ? '' : pc(r.peakPct)}</td>
    <td class="r">${r.status === 'closed' ? pc(r.pnl_pct) : r.status === 'open' ? '<span class="acc">open</span>' : '<span class="dim">skipped</span>'}</td>
    <td class="dim">${esc(r.status === 'skipped' ? r.skip_reason : (r.cause || r.exit_reason || '').toLowerCase())}</td></tr>`).join('')}</table>`);
}
async function cmdWhy(a) {
  if (!a[0]) return out('usage: why &lt;id|SYMBOL&gt;');
  let d; try { d = await get(`/api/terminal/trade/${encodeURIComponent(a[0])}`); } catch { return out(`<span class="down">no trade "${esc(a[0])}"</span>`); }
  const t = d.trade;
  out(`<span class="hd">#${t.id} ${esc(t.symbol)}</span> ${bookTag(t.book)}<span class="${t.status === 'closed' ? (t.pnl_pct > 0 ? 'up' : 'down') : 'acc'}">${t.status === 'closed' ? `${t.pnl_pct > 0 ? '+' : ''}${t.pnl_pct.toFixed(1)}% · ${sUsdSigned(t.pnl_sol)}` : t.status}</span> <span class="dim">${t.cause || ''}</span>`);
  out(`<span class="dim">${esc(t.name || '')} · ${t.mint}</span>`);
  if (d.path?.length > 3) out(pathSvg(d));
  d.narrative.forEach((l, i) => out(`${i === 0 ? '<span class="dim">' : ''}${esc(l)}${i === 0 ? '</span>' : ''}`));
  if (d.compare?.length) out(`<table><tr><th>at entry</th><th class="r">this trade</th><th class="r">book winners</th><th class="r">book losers</th></tr>${d.compare.slice(0, 9).map((c) => {
    const nearW = c.winnersMedian != null && c.losersMedian != null && Math.abs(c.value - c.winnersMedian) < Math.abs(c.value - c.losersMedian);
    return `<tr><td>${esc(c.label)}</td><td class="r ${c.winnersMedian == null ? '' : nearW ? 'up' : 'down'}">${fmtv(c.value, c.unit)}</td><td class="r dim">${fmtv(c.winnersMedian, c.unit)}</td><td class="r dim">${fmtv(c.losersMedian, c.unit)}</td></tr>`; }).join('')}</table>`);
  const ev = (t.events || []).map((e) => `${new Date(e.t).toLocaleTimeString()} ${e.type}${e.reason ? ' (' + e.reason + ')' : ''}${e.mcap ? ' @ ' + sUsd(e.mcap) : ''}`).join(' → ');
  if (ev) out(`<span class="dim">${esc(ev)}</span>`);
  out(`${lk(`strategy ${t.book}`, `${BOOK_LABEL(t.book)} report`)}  <a href="https://pump.fun/coin/${t.mint}" target="_blank" rel="noopener">pump.fun</a>  <a href="https://dexscreener.com/solana/${t.mint}" target="_blank" rel="noopener">DexScreener</a>`);
}
function pathSvg(d) {
  const t = d.trade, p = d.path, w = 640, h = 120, P = { l: 6, r: 6, t: 8, b: 14 };
  const ref = t.entry_mcap || p[0].mc, xs = p.map((x) => x.ts), ys = p.map((x) => (x.mc / ref - 1) * 100);
  const tp = ((t.tp_mult || 1.25) / ((1 - 0.0125) ** 2 * 0.97) - 1) * 100, sl = ((1 - (t.stop_pct || 20) / 100) / ((1 - 0.0125) ** 2 * 0.97) - 1) * 100;
  const y0 = Math.min(...ys, sl) - 3, y1 = Math.max(...ys, tp) + 3, X = (v) => P.l + ((v - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (w - P.l - P.r), Y = (v) => P.t + (1 - (v - y0) / (y1 - y0)) * (h - P.t - P.b);
  const line = p.map((x, i) => `${i ? 'L' : 'M'}${X(x.ts).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join('');
  const mk = (ts, label, col) => (ts ? `<line x1="${X(ts)}" x2="${X(ts)}" y1="${P.t}" y2="${h - P.b}" stroke="${col}" stroke-dasharray="2 3"/><text x="${X(ts) + 3}" y="${h - 3}" fill="${col}" font-size="9">${label}</text>` : '');
  const col = t.pnl_pct > 0 ? '#45c98f' : '#f0676c';
  return `<svg class="tpath" viewBox="0 0 ${w} ${h}">
    <line x1="0" x2="${w}" y1="${Y(tp)}" y2="${Y(tp)}" stroke="#45c98f" stroke-opacity=".5" stroke-dasharray="4 4"/><text x="${w - 4}" y="${Y(tp) - 3}" fill="#45c98f" font-size="9" text-anchor="end">target</text>
    <line x1="0" x2="${w}" y1="${Y(sl)}" y2="${Y(sl)}" stroke="#f0676c" stroke-opacity=".5" stroke-dasharray="4 4"/><text x="${w - 4}" y="${Y(sl) + 10}" fill="#f0676c" font-size="9" text-anchor="end">stop</text>
    <line x1="0" x2="${w}" y1="${Y(0)}" y2="${Y(0)}" stroke="#3a434c"/>
    ${mk(t.signal_ts, 'signal', '#79b2ea')}${mk(t.entry_ts, 'entry', '#f2b23e')}${mk(t.exit_ts, 'exit', col)}
    <path d="${line}" fill="none" stroke="#cfd6dd" stroke-width="1.3"/></svg>`;
}
async function cmdCauses(a) {
  const sr = await ensureSr(); const b = a[0];
  const rows = sr.strategies.filter((r) => !b || r.book === b);
  const agg = {};
  for (const r of rows) for (const c of r.causes) { (agg[c.cause] ||= { n: 0, s: 0, by: {} }); agg[c.cause].n += c.n; agg[c.cause].s += c.avgPct * c.n; agg[c.cause].by[r.book] = c.n; }
  const tot = Object.values(agg).reduce((s, x) => s + x.n, 0);
  out(`<span class="hd">Causes</span> <span class="dim">${b || 'all books'} · ${tot} closed trades</span>`);
  const meaning = { TARGET: 'reached the profit target', GRADUATED: 'curve filled, sold at graduation', 'SMALL WIN': 'closed green another way', 'NO FOLLOW-THROUGH': 'never green after costs → entry selection', 'GAVE BACK': 'was green, reversed → exit/target', 'LATE ENTRY': 'price ran before the fill → speed', DUMP: 'one large sell → holder risk', STALLED: 'activity died → hold time' };
  out(`<table><tr><th>cause</th><th class="r">trades</th><th class="r">share</th><th class="r">avg</th><th>meaning</th></tr>${Object.entries(agg).sort((x, y) => y[1].n - x[1].n).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${v.n}</td><td class="r dim">${((v.n / tot) * 100).toFixed(0)}%</td><td class="r">${pc(v.s / v.n)}</td><td class="dim">${esc(meaning[k] || '')}</td></tr>`).join('')}</table>`);
}
async function cmdCompare() {
  const sr = await ensureSr(); const m = sr.strategies.find((r) => r.book === 'main');
  if (!m || m.avgPct == null) return out('<span class="dim">Main has no closed trades yet.</span>');
  out(`<span class="hd">vs Main</span> <span class="dim">(${m.n} trades, avg ${m.avgPct.toFixed(1)}%)</span>`);
  out(`<table><tr><th>book</th><th class="r">trades</th><th class="r">avg</th><th class="r">gap vs main</th><th>read</th></tr>${sr.strategies.filter((r) => r.book !== 'main').map((r) => {
    const gap = r.avgPct == null ? null : r.avgPct - m.avgPct; const enough = r.n >= 30 && m.n >= 30;
    return `<tr><td>${lk(`strategy ${r.book}`, r.label)}</td><td class="r">${r.n}</td><td class="r">${pc(r.avgPct)}</td><td class="r">${gap == null ? '–' : `<span class="${gap > 0 ? 'up' : 'down'}">${gap > 0 ? '+' : ''}${gap.toFixed(1)} pts</span>`}</td><td class="dim">${!enough ? 'needs 30+ trades each' : gap > 0 ? 'better so far' : 'worse so far'}</td></tr>`; }).join('')}</table>`);
  out('<span class="dim">Significance (95% ranges) is in the Report tab’s decision checklist.</span>');
}
async function cmdPnl(a) {
  const d = { '24h': 1, '1d': 1, '7d': 7, '14d': 14, '30d': 30 }[a[0]] || T.days;
  const sr = await get(`/api/terminal/strategies?days=${d}`);
  out(`<span class="hd">P&amp;L · last ${d}d</span>`);
  out(`<table>${sr.strategies.map((r) => `<tr><td style="color:${BOOK_COL(r.book)}">${r.label}</td><td class="r">${r.n} trades</td><td class="r ${cls(r.pnlSol)}">${sUsdSigned(r.pnlSol)}</td><td class="r">${pc(r.avgPct)}/trade</td></tr>`).join('')}</table>`);
}
async function cmdReport() {
  const r = await get(`/api/report?days=14&tz=${new Date().getTimezoneOffset()}`);
  out(`<span class="hd">Two-week checklist</span> <span class="dim">coverage ${Math.round(r.coverage.pct)}% of hours</span>`);
  for (const v of r.verdicts) out(`<span class="${v.tone === 'good' ? 'up' : v.tone === 'bad' ? 'down' : 'acc'}">${esc(v.verdict.padEnd(16))}</span> ${esc(v.q)}<br><span class="dim">                 ${esc(v.detail)}</span>`);
  out(`<span class="lk" data-tab="report">open the Report tab</span>`);
}
async function run(line) {
  line = line.trim(); if (!line) return;
  out(esc(line), 'cmd');
  T.hist.push(line); T.hi = T.hist.length;
  const [c, ...a] = line.split(/\s+/);
  const k = Object.keys(CMDS).find((x) => x === c.toLowerCase()) || Object.keys(CMDS).find((x) => x.startsWith(c.toLowerCase()));
  if (!k) return out(`<span class="down">unknown command "${esc(c)}"</span> · type ${lk('help', 'help')}`);
  try { await CMDS[k].fn(a.map((x) => x.toLowerCase() === x ? x : x)); } catch (e) { out(`<span class="down">error: ${esc(e.message)}</span>`); }
}
$('#termForm').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#termInput'); const v = i.value; i.value = ''; run(v); });
$('#termInput').addEventListener('keydown', (e) => {
  const i = e.target;
  if (e.key === 'ArrowUp') { e.preventDefault(); if (T.hi > 0) { T.hi--; i.value = T.hist[T.hi] || ''; } }
  else if (e.key === 'ArrowDown') { e.preventDefault(); if (T.hi < T.hist.length) { T.hi++; i.value = T.hist[T.hi] || ''; } }
  else if (e.key === 'Tab') {
    e.preventDefault(); const parts = i.value.split(' ');
    const pool = parts.length === 1 ? Object.keys(CMDS) : ['main', 'band', 'flow', 'confirm', 'win', 'loss', 'skipped', '24h', '7d', '14d', 'on', 'off'];
    const m = pool.filter((x) => x.startsWith(parts[parts.length - 1].toLowerCase()));
    if (m.length === 1) { parts[parts.length - 1] = m[0]; i.value = parts.join(' ') + ' '; } else if (m.length > 1) out(`<span class="dim">${m.join('  ')}</span>`);
  }
});
tout.addEventListener('click', (e) => { const l = e.target.closest('[data-cmd]'); if (l) run(l.dataset.cmd); const tb = e.target.closest('[data-tab]'); if (tb) document.querySelector(`.tabs [data-tab=${tb.dataset.tab}]`)?.click(); });
$('#termChips').innerHTML = ['strategies', 'compare', 'causes', 'trades loss 15', 'trades win 15', 'pnl 24h', 'report', 'help'].map((c) => `<button type="button" data-cmd="${c}">${c}</button>`).join('');
$('#termChips').addEventListener('click', (e) => { const b = e.target.closest('[data-cmd]'); if (b) run(b.dataset.cmd); });
function termTail(ev) {
  if (!T.tail || !ev?.pos) return;
  const p = ev.pos, t = new Date().toLocaleTimeString();
  if (ev.type === 'entry') out(`<span class="dim">${t}</span> ${bookTag(p.book)}<span class="info">ENTRY</span> ${lk(`why ${p.id}`, `#${p.id}`)} ${esc(p.symbol)} @ ${sUsd(p.entryMcap)}${p.signalMcap ? ` <span class="dim">(${signed((p.entryMcap / p.signalMcap - 1) * 100, 1, '%')} vs signal)</span>` : ''}`);
  else if (ev.type === 'exit') out(`<span class="dim">${t}</span> ${bookTag(p.book)}<span class="${p.pnlPct > 0 ? 'up' : 'down'}">EXIT ${p.pnlPct > 0 ? '+' : ''}${p.pnlPct.toFixed(1)}%</span> ${lk(`why ${p.id}`, `#${p.id}`)} ${esc(p.symbol)} <span class="dim">${esc((p.cause || p.reason || '').toLowerCase())}</span>`);
  else if (ev.type === 'skip') out(`<span class="dim">${t}</span> ${bookTag(p.book)}<span class="dim">SKIP ${esc(p.symbol)} · ${esc(p.reason)}</span>`);
}
function termWelcome() {
  if (T.welcomed) return; T.welcomed = true;
  out('<span class="acc">CURVEWATCH TRADE TERMINAL</span> <span class="dim">· paper trades only · type</span> ' + lk('help', 'help') + ' <span class="dim">or click a dot on the timeline</span>');
  out('<span class="dim">Every trade is labeled with why it ended the way it did. Live entries, exits and skips stream below.</span>');
  cmdStrategies();
}

// =====================================================================
// Report tab: two-week performance comparison
// =====================================================================
const R = { days: 14, data: null };
const repBookCol = (b) => (b === 'grad' ? css('--up') : BOOK_COL(b));
async function loadReport() {
  try { R.data = await get(`/api/report?days=${R.days}&tz=${new Date().getTimezoneOffset()}`); renderReport(); }
  catch (e) { $('#repRange').textContent = `Report unavailable (${e.message})`; }
}
$('#repDays').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; R.days = Number(b.dataset.d); $('#repDays').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); loadReport(); });
const dfmt = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
const rs = (x, d = 1) => (x == null ? '–' : `${x > 0 ? '+' : ''}${n(x, d)}%`);
function renderReport() {
  const d = R.data; if (!d) return;
  const px = d.solUsd || solPx();
  const toUsd = (sol) => (px ? usd(sol * px, { sign: true }) : `${n(sol, 2)} SOL`);
  $('#repRange').textContent = `${dfmt(d.since)} – ${dfmt(d.until)} · ${d.days} days · split into halves at ${new Date(d.splitAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · generated ${new Date(d.generatedAt).toLocaleTimeString()}`;
  const totN = d.bookOrder.reduce((s, b) => s + (d.books[b]?.n || 0), 0);
  const maxH = 24;
  $('#repCoverage').innerHTML = `<div class="cov">
    <div><div class="label">Hours recorded</div><div class="value ${d.coverage.pct >= 80 ? 'up' : 'acc'}">${pct(d.coverage.pct, 0)}</div><div class="sub">${d.coverage.hours} of ${d.coverage.possibleHours} h · needs 80%+</div></div>
    <div><div class="label">Closed paper trades</div><div class="value">${totN}</div><div class="sub">across ${d.bookOrder.length} books</div></div>
    <div><div class="label">Strong signals graded</div><div class="value">${d.strong.labeled}</div><div class="sub">${d.strong.hitRatePct == null ? 'none graded yet' : `${pct(d.strong.hitRatePct, 0)} hit · breakeven ${d.breakevenPct}%`}</div></div>
    <div><div class="label">Market pause</div><div class="value">${esc(String(d.gateMode).toUpperCase())}</div><div class="sub">${d.gateMode === 'shadow' ? 'tags entries, blocks nothing' : 'blocking entries when COLD'}</div></div></div>
    <div class="covbar" title="hours recorded per day">${d.daily.map((x) => `<i class="${x.hours ? '' : 'zero'}" style="height:${Math.max(8, (x.hours / maxH) * 100)}%" title="${x.date}: ${x.hours} h"></i>`).join('')}</div>`;
  $('#repVerdicts').innerHTML = d.verdicts.map((v) => `<div class="verdict ${v.tone}"><div class="vq">${esc(v.q)}</div><span class="vchip">${esc(v.verdict)}</span><div class="vd">${esc(v.detail)}</div></div>`).join('');
  $('#repBooksHint').textContent = `current exit rules (${d.rules}) · gated entries excluded · first half vs second half by exit time`;
  $('#repBooks').innerHTML = `<div class="btable-wrap"><table class="btable wide"><thead><tr><th>Book</th><th class="num">Trades</th><th class="num">Win</th><th class="num">Avg / trade</th><th class="num">95% range</th><th class="num">P&amp;L</th><th class="num">1st half</th><th class="num">2nd half</th><th>Kill rule</th></tr></thead><tbody>${d.bookOrder.map((b) => {
    const x = d.books[b]; if (!x) return '';
    return `<tr><td><span style="color:${repBookCol(b)}">■</span> <b>${esc(d.bookLabels[b] || b)}</b><div class="small-note">${esc(d.bookEntry[b] || '')}</div></td><td class="num">${x.n}</td><td class="num">${x.n ? pct(x.winRatePct, 0) : '–'}</td>
      <td class="num ${cls(x.avgPct)}">${rs(x.avgPct)}</td><td class="num">${x.ciLowPct == null ? '–' : `${rs(x.ciLowPct, 0)} to ${rs(x.ciHighPct, 0)}`}</td><td class="num ${cls(x.pnlSol)}">${toUsd(x.pnlSol)}</td>
      <td class="num ${cls(x.week1.avgPct)}">${x.week1.n ? `${rs(x.week1.avgPct)} <span class="muted">(${x.week1.n})</span>` : '–'}</td><td class="num ${cls(x.week2.avgPct)}">${x.week2.n ? `${rs(x.week2.avgPct)} <span class="muted">(${x.week2.n})</span>` : '–'}</td>
      <td><span class="pill ${x.kill.status === 'PASS' ? 'up' : x.kill.status === 'FAIL' ? 'down' : 'acc'}">${x.kill.status}</span> <span class="muted">${x.kill.n}/${x.kill.needed}</span></td></tr>`;
  }).join('')}</tbody></table></div>`;
  renderRepEquity(d, px);
  const M = d.marketCmp, mc = (s) => `${s.n} trades · ${s.n ? pct(s.winRatePct, 0) + ' win · ' : ''}<span class="${cls(s.avgPct)}">${rs(s.avgPct)}</span>`;
  $('#repMarket').innerHTML = `<div class="btable-wrap"><table class="btable"><thead><tr><th>Book</th><th>WARM</th><th>COLD</th></tr></thead><tbody>
    ${Object.entries(M.perBook).map(([b, v]) => `<tr><td><span style="color:${repBookCol(b)}">■</span> ${esc(d.bookLabels[b] || b)}</td><td>${mc(v.WARM)}</td><td>${mc(v.COLD)}</td></tr>`).join('')}
    <tr><td><b>All curve books</b></td><td>${mc(M.WARM)}</td><td>${mc(M.COLD)}</td></tr></tbody></table></div>
    <p class="small-note">WARM − COLD: ${M.warmMinusCold.diff == null ? 'not enough data' : `${signed(M.warmMinusCold.diff, 1, ' pts')} per trade, 95% range ${signed(M.warmMinusCold.lo, 1)} to ${signed(M.warmMinusCold.hi, 1)}`}. ${M.UNKNOWN.n} entries had no market state yet. The pause is only worth enforcing if that range is clearly above zero.</p>`;
  const bk = d.bookOrder;
  $('#repDaily').innerHTML = `<div class="btable-wrap"><table class="btable wide wide-d"><thead><tr><th>Date</th><th class="num">Hours</th><th class="num">Launches</th><th class="num">Alerts</th><th class="num">Grad alerts</th><th class="num">Strong</th>${bk.map((b) => `<th class="num">${esc(d.bookLabels[b] || b)}</th>`).join('')}<th class="num">COLD share</th></tr></thead><tbody>
    ${[...d.daily].reverse().map((x) => `<tr><td>${x.date}</td><td class="num">${x.hours}</td><td class="num">${n(x.launches, 0)}</td><td class="num">${x.alerts}</td><td class="num">${x.gradAlerts}</td><td class="num">${x.strong}</td>
      ${bk.map((b) => { const s = x.books[b]; return `<td class="num">${s?.n ? `<span class="${cls(s.avgPct)}">${rs(s.avgPct)}</span> <span class="muted">${s.n}·${pct(s.winRatePct, 0)}</span>` : '<span class="muted">–</span>'}</td>`; }).join('')}
      <td class="num">${x.coldSharePct == null ? '–' : pct(x.coldSharePct, 0)}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderRepEquity(d, px) {
  const el = $('#repEquity'), w = Math.max(300, el.clientWidth || 600), h = 230, P = { l: 56, r: 10, t: 10, b: 24 };
  const series = d.bookOrder.map((b) => ({ b, pts: (d.equity[b] || []).map(([t, v]) => [t, v * (px || 1)]) })).filter((s) => s.pts.length);
  $('#repEqLegend').innerHTML = d.bookOrder.map((b) => `<span><i style="background:${repBookCol(b)}"></i>${esc(d.bookLabels[b] || b)}</span>`).join('');
  if (!series.length) { el.innerHTML = `<div class="empty">No closed trades in this window yet.</div>`; return; }
  const firstT = Math.min(...series.map((s) => s.pts[0][0])), t1 = d.until;
  const t0 = Math.max(d.since, firstT - Math.max(10 * 60000, (t1 - firstT) * 0.04)), vals = series.flatMap((s) => s.pts.map((p) => p[1]));
  const short = t1 - t0 <= 2 * 86400000;
  let y0 = Math.min(0, ...vals), y1 = Math.max(0, ...vals); if (y1 - y0 < 1) { y0 -= 1; y1 += 1; }
  const X = (t) => P.l + ((t - t0) / (t1 - t0)) * (w - P.l - P.r), Y = (v) => P.t + (1 - (v - y0) / (y1 - y0)) * (h - P.t - P.b);
  const grid = [0, 1, 2, 3, 4].map((i) => { const v = y0 + ((y1 - y0) * i) / 4; return `<line x1="${P.l}" x2="${w - P.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end" fill="var(--text-faint)" font-size="10" font-family="var(--font-mono)">${px ? usd(v) : n(v, 2)}</text>`; }).join('');
  const ticks = [0, 0.5, 1].map((f) => { const t = t0 + (t1 - t0) * f; return `<text x="${X(t)}" y="${h - 6}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}" fill="var(--text-faint)" font-size="10">${short ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : dfmt(t)}</text>`; }).join('');
  const lines = series.map((s) => { const p = [[t0, 0], ...s.pts, [t1, s.pts[s.pts.length - 1][1]]]; return `<path d="${p.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join('')}" fill="none" stroke="${repBookCol(s.b)}" stroke-width="1.8"/>`; }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" style="height:${h}px">${grid}<line x1="${P.l}" x2="${w - P.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--text-faint)" stroke-dasharray="3 3"/><line x1="${X(Math.max(d.splitAt, t0))}" x2="${X(Math.max(d.splitAt, t0))}" y1="${P.t}" y2="${h - P.b}" stroke="var(--border)" stroke-dasharray="2 4"/>${lines}${ticks}</svg>`;
}
const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
$('#repMd').onclick = () => {
  const d = R.data; if (!d) return; const px = d.solUsd || solPx();
  const L = [`# Curvewatch performance report`, ``, `${new Date(d.since).toISOString().slice(0, 10)} to ${new Date(d.until).toISOString().slice(0, 10)} (${d.days} days). Paper trading only. Coverage ${Math.round(d.coverage.pct)}% of hours (${d.coverage.hours}/${d.coverage.possibleHours}).`, ``, `## Decision checklist`, ``];
  for (const v of d.verdicts) L.push(`- **${v.q}** ${v.verdict}. ${v.detail}`);
  L.push('', '## Books', '', '| Book | Entry | Trades | Win | Avg/trade | 95% range | P&L (USD) | 1st half | 2nd half | Kill rule |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const b of d.bookOrder) { const x = d.books[b]; L.push(`| ${d.bookLabels[b]} | ${d.bookEntry[b]} | ${x.n} | ${x.n ? Math.round(x.winRatePct) + '%' : '–'} | ${rs(x.avgPct)} | ${x.ciLowPct == null ? '–' : `${rs(x.ciLowPct, 0)} to ${rs(x.ciHighPct, 0)}`} | ${px ? usd(x.pnlSol * px, { sign: true }) : x.pnlSol.toFixed(3) + ' SOL'} | ${rs(x.week1.avgPct)} (${x.week1.n}) | ${rs(x.week2.avgPct)} (${x.week2.n}) | ${x.kill.status} ${x.kill.n}/${x.kill.needed} |`); }
  L.push('', '## Daily', '', `| Date | Hours | Launches | Alerts | ${d.bookOrder.map((b) => d.bookLabels[b]).join(' | ')} |`, `|---|---|---|---|${d.bookOrder.map(() => '---').join('|')}|`);
  for (const x of d.daily) L.push(`| ${x.date} | ${x.hours} | ${x.launches} | ${x.alerts} | ${d.bookOrder.map((b) => (x.books[b]?.n ? `${rs(x.books[b].avgPct)} (${x.books[b].n})` : '–')).join(' | ')} |`);
  L.push('', 'Avg/trade is after fees, entry delay and slippage. A 95% range that includes zero means the result is not distinguishable from break-even.');
  dl(`curvewatch-report-${new Date().toISOString().slice(0, 10)}.md`, L.join('\n'), 'text/markdown');
};
$('#repCsv').onclick = () => {
  const d = R.data; if (!d) return;
  const head = ['date', 'hours', 'launches', 'alerts', 'grad_alerts', 'strong', ...d.bookOrder.flatMap((b) => [`${b}_n`, `${b}_win_pct`, `${b}_avg_pct`]), 'cold_share_pct'];
  const rows = d.daily.map((x) => [x.date, x.hours, x.launches, x.alerts, x.gradAlerts, x.strong, ...d.bookOrder.flatMap((b) => { const s = x.books[b] || {}; return [s.n || 0, s.winRatePct?.toFixed(1) ?? '', s.avgPct?.toFixed(2) ?? '']; }), x.coldSharePct?.toFixed(1) ?? '']);
  dl(`curvewatch-daily-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...rows].map((r) => r.join(',')).join('\n'), 'text/csv');
};
addEventListener('resize', () => { if (S.tab === 'report' && R.data) renderRepEquity(R.data, R.data.solUsd || solPx()); });

boot();
