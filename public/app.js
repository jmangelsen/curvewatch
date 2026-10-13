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
  if (S.tab === 'perf') loadPerf(); if (S.tab === 'intel') loadIntel(); if (S.tab === 'grads') { loadGrads(); requestAnimationFrame(drawGradRadar); } if (S.tab === 'live') requestAnimationFrame(drawRadar);
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
function radarLoop() { sweep = (sweep + 0.012) % (Math.PI * 2); drawRadar(); drawGradRadar(); requestAnimationFrame(radarLoop); }
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
  $('#kill').innerHTML = killHtml(k, `Model: ${sUsd(cfg.sizeSol)} (${cfg.sizeSol} SOL) per alert, entry ${cfg.entryDelaySec}s after the alert at the live curve price, ${cfg.feePct}% fee each side, +${cfg.extraSlippagePct}% slippage; sell ${cfg.tp1Fraction * 100}% at ${cfg.tp1Multiple}×, ${cfg.trailPct}% trailing stop, −${cfg.stopPct}% hard stop, ${cfg.maxHoldMin} min max hold.`);
  $('#eqHint').textContent = `${k.allTrades} closed · cumulative, USD`;
  const px = solPx() || 1;
  lineChart($('#equity'), k.equity.map((e) => [e.t, e.eq * px]), { yFmt: (v) => (solPx() ? usd(v) : n(v, 2)), color: css(k.totalPnlSol >= 0 ? '--up' : '--down') });

  const all = [...S.paper.open.map((p) => ({ ...p, status: 'open' })), ...S.paper.recent.filter((r) => r.status !== 'open')];
  $('#posHint').textContent = `${S.paper.open.length} open`;
  $('#positions tbody').innerHTML = all.length ? all.slice(0, 60).map((p) => {
    const pnl = p.status === 'open' ? p.markPct : p.pnl_pct;
    return `<tr data-mint="${p.mint}"><td class="c-tok"><span class="sym">${esc(p.symbol)}</span></td><td data-label="Status">${p.status === 'open' ? '<span class="acc">open</span>' : p.status === 'void' ? '<span class="faint">void</span>' : 'closed'}</td>
      <td class="num" data-label="Entry mcap">${sUsd(p.entryMcap ?? p.entry_mcap)}</td><td class="num" data-label="Mark / exit">${p.status === 'open' ? sUsd(p.mcap) : sUsd((p.events || []).slice(-1)[0]?.mcap)}</td>
      <td class="num ${cls(pnl)}" data-label="P&amp;L">${signed(pnl, 1, '%')}</td><td class="faint" data-label="Exit">${esc(p.exit_reason || (p.tp1Done ? 'TP1 taken' : '–'))}</td><td class="num faint" data-label="Opened">${ago(p.entryTs ?? p.entry_ts)} ago</td></tr>`;
  }).join('') : `<tr><td colspan="7"><div class="empty"><strong>No paper trades yet</strong>Each alert opens a simulated ${sUsd(cfg.sizeSol)} position ${cfg.entryDelaySec}s later.</div></td></tr>`;

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
    }).join('') : `<tr><td colspan="7"><div class="empty"><strong>No paper trades yet</strong>Each re-ignition alert opens a simulated ${sUsd(c.sizeSol)} position at the next price reading.</div></td></tr>`;
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
    es.addEventListener('paper', () => { if (S.tab === 'perf') loadPerf(); });
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
  setInterval(() => { if (S.tab === 'perf') loadPerf(); if (S.tab === 'intel') loadIntel(); }, 20000);
  setInterval(() => { if (S.tab === 'grads' && !document.hidden) loadGrads(); }, 15000);
  if (location.hash === '#grads') document.querySelector('.tabs [data-tab=grads]')?.click();
}
boot();
