// Structure tab — renders the daily trade-structure scoring matrix written by
// analysis/curvewatch_scoring.py into public/structure/data/. Read-only, static JSON.
// Token names/symbols are untrusted input: everything goes through esc().
const BASE = new URL('data/', import.meta.url);
const root = document.getElementById('structureRoot');
const S = { idx: null, m: null, file: null, sel: null, sort: { k: 'structure_composite', d: 'desc' }, hideFlag: false, q: '' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x, d = 0) => (x == null ? '–' : (100 * x).toFixed(d) + '%');
const num = (x, d = 1) => (x == null ? '–' : Number(x).toFixed(d));
const sol = (x) => (x == null ? '–' : x >= 100 ? x.toFixed(0) : x.toFixed(1));
const short = (m) => (m.length > 10 ? m.slice(0, 4) + '…' + m.slice(-4) : m);
const BAD = new Set(['tape_discontinuous', 'reserve_inconsistent', 'feed_gap', 'low_sample', 'low_mechanical_coverage', 'nonstandard_pool']);
const flagged = (c) => c.quality.flags.some((f) => BAD.has(f));
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); if (!s.length) return null; const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
// score 0..100 -> down / accent / up ramp
const ramp = (v) => { if (v == null) return 'var(--text-faint)'; const t = Math.max(0, Math.min(1, v / 100)); return t < .5 ? `color-mix(in oklab, var(--down) ${100 - t * 200}%, var(--accent))` : `color-mix(in oklab, var(--accent) ${200 - t * 200}%, var(--up))`; };

async function getJSON(name) {
  const r = await fetch(new URL(name, BASE), { cache: 'no-store', credentials: 'same-origin' });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}

async function load(file) {
  root.innerHTML = '<div class="card"><div class="hint">Loading structure scores…</div></div>';
  try {
    if (!S.idx) S.idx = await getJSON('index.json').catch(() => ({ files: [] }));
    S.file = file || S.idx.latest || 'latest.json';
    S.m = await getJSON(S.file);
    if (S.m.schema_version !== 'curvewatch.scoring.v1') throw new Error(`unsupported schema ${S.m.schema_version}`);
    S.sel = null;
    render();
  } catch (e) {
    root.innerHTML = `<div class="sx"><div class="sx-err"><b>No structure scores yet.</b><br>The daily job writes <code>public/structure/data/latest.json</code>. Run it once on the server:<br><code>bash deploy/structure-scores.sh</code><br><span class="faint">${esc(e.message)}</span></div></div>`;
  }
}

function coins() {
  const q = S.q.trim().toLowerCase();
  let cs = S.m.coins.filter((c) => (!S.hideFlag || !flagged(c)) && (!q || c.mint.toLowerCase().includes(q) || String(c.meta.symbol || '').toLowerCase().includes(q) || String(c.meta.name || '').toLowerCase().includes(q)));
  const { k, d } = S.sort;
  const get = COLS.find((x) => x.k === k).get;
  cs.sort((a, b) => { const x = get(a), y = get(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; const o = typeof x === 'string' ? x.localeCompare(y) : x - y; return d === 'desc' ? -o : o; });
  return cs;
}

const COLS = [
  { k: 'sym', h: 'Coin', get: (c) => c.meta.symbol || c.mint, fmt: (c) => `<span class="tok"><b>${esc(c.meta.symbol || short(c.mint))}</b><small class="mono">${esc(short(c.mint))}</small></span>`, cls: 'sym' },
  { k: 'structure_composite', h: 'Structure', num: 1, get: (c) => c.scores?.structure_composite, fmt: (c) => c.scores ? `<b style="color:${ramp(c.scores.structure_composite)}">${num(c.scores.structure_composite, 0)}</b>` : '<span class="faint">n/r</span>' },
  { k: 'large', h: 'Large-buy share', num: 1, get: (c) => c.large_trades.large_buy_share, fmt: (c) => `${pct(c.large_trades.large_buy_share)}<span class="cell-bar"><i style="width:${100 * (c.large_trades.large_buy_share || 0)}%"></i></span>` },
  { k: 'moving', h: 'Curve-moving', num: 1, get: (c) => c.large_trades.curve_moving_buy_share, fmt: (c) => pct(c.large_trades.curve_moving_buy_share) },
  { k: 'eff', h: 'Eff. buyers', num: 1, get: (c) => c.concentration.effective_buyers, fmt: (c) => num(c.concentration.effective_buyers, 1) },
  { k: 'top10', h: 'Top-10 buy', num: 1, get: (c) => c.concentration.top10_buy_share, fmt: (c) => pct(c.concentration.top10_buy_share) },
  { k: 'gini', h: 'Gini', num: 1, get: (c) => c.concentration.gini_buy, fmt: (c) => num(c.concentration.gini_buy, 2) },
  { k: 'eff_px', h: 'Px efficiency', num: 1, get: (c) => c.price_impact.price_efficiency, fmt: (c) => c.price_impact.price_efficiency == null ? '–' : (c.price_impact.price_efficiency * 100).toFixed(2) },
  { k: 'gross', h: 'Gross SOL', num: 1, get: (c) => c.flow.gross_sol, fmt: (c) => sol(c.flow.gross_sol) },
  { k: 'trades', h: 'Trades', num: 1, get: (c) => c.flow.n_trades, fmt: (c) => c.flow.n_trades },
  { k: 'flags', h: 'Flags', get: (c) => c.quality.flags.length, fmt: (c) => c.quality.flags.length ? `<span class="sx-flags">${c.quality.flags.map((f) => `<span class="chip ${BAD.has(f) ? 'warn' : 'neutral'}">${esc(f.replace(/_/g, ' '))}</span>`).join('')}</span>` : '<span class="chip">clean</span>' },
];

function render() {
  const m = S.m, all = m.coins, ranked = all.filter((c) => c.scores);
  const files = (S.idx?.files || []).slice().reverse();
  const k = (label, value, sub) => `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
  const nFlag = all.filter(flagged).length;
  root.innerHTML = `<div class="sx">
    <div class="sx-head">
      <div><h1>Trade structure</h1>
        <p>Who is buying, how concentrated it is, and how much size moves the curve, per coin, frozen at a fixed window after launch. Research view: a descriptive score, not an entry rule. Nothing here changes live scores, rejects or paper books.</p></div>
      <div class="sx-ctl">
        <select id="sxFile" aria-label="Scoring run">${files.length ? files.map((f) => `<option value="${esc(f.file)}" ${f.file === S.file ? 'selected' : ''}>${esc(f.date)} · ${f.n_coins} coins</option>`).join('') : `<option>${esc(S.file)}</option>`}</select>
        <input type="search" id="sxQ" placeholder="mint or symbol" value="${esc(S.q)}" aria-label="Filter coins">
        <label><input type="checkbox" id="sxHide" ${S.hideFlag ? 'checked' : ''}> hide data-quality flags</label>
      </div>
    </div>
    <div class="sx-meta">
      <span class="pill">run ${esc(m.generated_at.replace('T', ' ').replace('+00:00', ' UTC'))}</span>
      <span class="pill">params ${esc(m.params_fingerprint)}</span>
      <span class="pill">window ${m.params.window_sec ? m.params.window_sec / 60 + ' min after ' + esc(m.params.anchor.replace('_', ' ')) : 'full tape'}</span>
      <span class="pill">large ≥ ${m.params.large_sol} SOL · curve-moving ≥ ${m.params.curve_moving_pct}% vSOL</span>
      <span class="pill">${esc(m.source)}</span>
    </div>
    <div class="sx-kpis">
      ${k('Coins scored', `${ranked.length}<span class="faint">/${all.length}</span>`, `${m.cohort.n_trades.toLocaleString()} trades`)}
      ${k('Median large-buy share', pct(med(ranked.map((c) => c.large_trades.large_buy_share))), `≥ ${m.params.large_sol} SOL buys`)}
      ${k('Median effective buyers', num(med(ranked.map((c) => c.concentration.effective_buyers)), 1), '1 / HHI of buy SOL')}
      ${k('Median top-10 buy share', pct(med(ranked.map((c) => c.concentration.top10_buy_share))), 'of buy SOL')}
      ${k('Median tape continuity', pct(med(all.map((c) => c.quality.tape_continuity)), 1), 'pre-price = prior post-price')}
      ${k('Data-quality flagged', `<span class="${nFlag ? 'acc' : 'up'}">${nFlag}</span>`, 'excluded from conclusions')}
    </div>
    <div class="sx-grid">
      <article class="card"><div class="card-head"><h2>Breadth vs whale share</h2><span class="hint">each dot is a coin · size = gross SOL · dashed = flagged</span></div>
        <div class="sx-plot" id="sxPlot"></div>
        <div class="sx-legend"><span>Structure score</span><span class="faint">0</span><span class="sx-ramp"></span><span class="faint">100</span><span class="faint">· click a dot for detail</span></div>
      </article>
      <article class="card sx-detail" id="sxDetail"></article>
    </div>
    <article class="card sx-tablecard"><div class="card-head"><h2>Scoring matrix</h2><span class="hint" id="sxCount"></span></div>
      <div class="table-wrap"><table class="board" id="sxTable"><thead><tr>${COLS.map((c) => `<th data-k="${c.k}" class="${c.num ? 'num' : ''}" ${S.sort.k === c.k ? `aria-sort="${S.sort.d === 'desc' ? 'descending' : 'ascending'}"` : ''}>${c.h}${S.sort.k === c.k ? (S.sort.d === 'desc' ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
      <p class="sx-note">n/r = not ranked (fewer than ${m.params.min_trades} trades or ${m.params.min_buyers} buyers). Price efficiency = net log price move per 100 SOL of gross volume; low values mean volume churned without moving price.</p>
    </article>
  </div>`;
  root.querySelector('#sxFile').onchange = (e) => load(e.target.value);
  root.querySelector('#sxQ').oninput = (e) => { S.q = e.target.value; body(); plot(); };
  root.querySelector('#sxHide').onchange = (e) => { S.hideFlag = e.target.checked; body(); plot(); };
  root.querySelector('#sxTable thead').onclick = (e) => { const th = e.target.closest('th[data-k]'); if (!th) return; const k = th.dataset.k; S.sort = { k, d: S.sort.k === k && S.sort.d === 'desc' ? 'asc' : 'desc' }; render(); };
  root.querySelector('#sxTable tbody').onclick = (e) => { const tr = e.target.closest('tr[data-m]'); if (tr) select(tr.dataset.m); };
  body(); plot(); detail();
}

function body() {
  const cs = coins();
  root.querySelector('#sxCount').textContent = `${cs.length} coins`;
  root.querySelector('#sxTable tbody').innerHTML = cs.map((c) => `<tr data-m="${esc(c.mint)}" class="${c.scores ? '' : 'unranked'} ${c.mint === S.sel ? 'is-sel' : ''}">${COLS.map((col) => `<td class="${col.num ? 'num' : ''} ${col.cls || ''}">${col.fmt(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${COLS.length}" class="faint">No coins match.</td></tr>`;
}

function plot() {
  const el = root.querySelector('#sxPlot');
  const cs = coins().filter((c) => c.concentration.effective_buyers && c.large_trades.large_buy_share != null);
  const W = Math.max(320, Math.round(el.clientWidth || 640)), H = W < 520 ? Math.round(W * 0.9) : Math.round(Math.min(420, W * 0.56)), L = 44, R = 12, T = 12, B = 36;
  const ex = cs.map((c) => c.concentration.effective_buyers);
  const xmin = 1, xmax = Math.max(10, ...ex) * 1.15;
  const lx = (v) => L + (Math.log(v) - Math.log(xmin)) / (Math.log(xmax) - Math.log(xmin)) * (W - L - R);
  const ly = (v) => T + (1 - v) * (H - T - B);
  const gmax = Math.max(1, ...cs.map((c) => c.flow.gross_sol || 0));
  const rad = (g) => 3 + 9 * Math.sqrt((g || 0) / gmax);
  const xt = [1, 2, 5, 10, 20, 50, 100, 200, 500].filter((v) => v <= xmax);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter of effective buyers versus large-buy share">`;
  for (const v of [0, .25, .5, .75, 1]) s += `<line class="gl" x1="${L}" x2="${W - R}" y1="${ly(v)}" y2="${ly(v)}"/><text class="tk" x="${L - 6}" y="${ly(v) + 3}" text-anchor="end">${v * 100}%</text>`;
  for (const v of xt) s += `<line class="gl" y1="${T}" y2="${H - B}" x1="${lx(v)}" x2="${lx(v)}"/><text class="tk" x="${lx(v)}" y="${H - B + 14}" text-anchor="middle">${v}</text>`;
  s += `<line class="ax" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><line class="ax" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/>`;
  s += `<text class="al" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">Effective buyers (1 / HHI, log scale) →</text>`;
  s += `<text class="al" transform="translate(11 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Large-buy share of buy SOL</text>`;
  s += `<text class="q" x="${L + 8}" y="${T + 14}">few wallets · whale-driven</text><text class="q" x="${W - R - 8}" y="${H - B - 8}" text-anchor="end">broad · retail-sized</text>`;
  const order = cs.slice().sort((a, b) => (b.flow.gross_sol || 0) - (a.flow.gross_sol || 0));
  for (const c of order) {
    const col = ramp(c.scores?.structure_composite);
    s += `<circle class="pt ${flagged(c) ? 'flag' : ''} ${c.mint === S.sel ? 'is-sel' : ''}" data-m="${esc(c.mint)}" cx="${lx(c.concentration.effective_buyers).toFixed(1)}" cy="${ly(c.large_trades.large_buy_share).toFixed(1)}" r="${rad(c.flow.gross_sol).toFixed(1)}" style="fill:${col};fill-opacity:.78;${flagged(c) ? `stroke:${col}` : ''}"><title>${esc(c.meta.symbol || c.mint)}</title></circle>`;
  }
  s += '</svg><div class="sx-tip" hidden></div>';
  el.innerHTML = s;
  const tip = el.querySelector('.sx-tip');
  const byM = new Map(cs.map((c) => [c.mint, c]));
  el.querySelector('svg').addEventListener('pointermove', (e) => {
    const p = e.target.closest('circle.pt'); if (!p) { tip.hidden = true; return; }
    const c = byM.get(p.dataset.m), r = el.getBoundingClientRect();
    tip.innerHTML = `<b>${esc(c.meta.symbol || short(c.mint))}</b> · score ${c.scores ? num(c.scores.structure_composite, 0) : 'n/r'}<br>eff ${num(c.concentration.effective_buyers)} · large ${pct(c.large_trades.large_buy_share)} · ${sol(c.flow.gross_sol)} SOL`;
    tip.hidden = false;
    const x = e.clientX - r.left, y = e.clientY - r.top;
    tip.style.left = Math.min(x + 12, r.width - tip.offsetWidth - 4) + 'px'; tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + 'px';
  });
  el.querySelector('svg').addEventListener('pointerleave', () => { tip.hidden = true; });
  el.querySelector('svg').addEventListener('click', (e) => { const p = e.target.closest('circle.pt'); if (p) select(p.dataset.m); });
}

function select(mint) {
  S.sel = mint;
  root.querySelectorAll('#sxTable tr.is-sel, #sxPlot circle.is-sel').forEach((n) => n.classList.remove('is-sel'));
  root.querySelectorAll(`[data-m="${CSS.escape(mint)}"]`).forEach((n) => n.classList.add('is-sel'));
  detail();
  if (window.matchMedia('(max-width: 1100px)').matches) root.querySelector('#sxDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bar(label, v, { max = 1, fmt = pct, p = null, color = 'var(--info)' } = {}) {
  const w = v == null ? 0 : Math.max(0, Math.min(100, (100 * v) / max));
  return `<div class="sx-bar"><span class="lb">${label}</span><span class="sx-track"><i style="width:${w}%;background:${color}"></i>${p != null ? `<em style="left:calc(${p}% - 1px)" title="cohort percentile ${p}"></em>` : ''}</span><span class="v">${fmt(v)}</span></div>`;
}

function detail() {
  const el = root.querySelector('#sxDetail');
  const c = S.m.coins.find((x) => x.mint === S.sel);
  if (!c) { el.innerHTML = `<div class="card-head"><h2>Coin detail</h2></div><div class="empty">Select a coin in the chart or table.</div>`; return; }
  const L = c.large_trades, I = c.price_impact, C = c.concentration, Q = c.quality, P = c.percentiles || {}, sc = c.scores;
  const ladder = Object.entries(L.ladder).map(([k, v]) => bar(k.replace('ge_', '≥ ').replace('_sol', ' SOL'), v.share_of_buy_sol, { color: 'var(--b-main)' })).join('');
  const box = (label, v, invert) => `<div class="sx-score"><b style="color:${ramp(v == null ? null : invert ? 100 - v : v)}">${v == null ? '–' : num(v, 0)}</b><span>${label}</span></div>`;
  el.innerHTML = `<div class="sx-dt"><h3>${esc(c.meta.symbol || short(c.mint))}</h3><span class="faint mono">${esc(short(c.mint))}</span>
      <span class="links"><a href="https://pump.fun/coin/${encodeURIComponent(c.mint)}" target="_blank" rel="noopener">Pump.fun</a><a href="https://solscan.io/token/${encodeURIComponent(c.mint)}" target="_blank" rel="noopener">Solscan</a></span></div>
    ${sc ? `<div class="sx-scores">${box('Structure', sc.structure_composite)}${box('Flow quality', sc.flow_quality)}${box('Whale dependence', sc.whale_dependence, true)}${box('Concentration risk', sc.concentration_risk, true)}</div>` : '<p class="sx-note">Not ranked: sample too small for cohort percentiles.</p>'}
    <div class="sx-sec"><h4>Large trades</h4>${ladder}
      ${bar('Curve-moving', L.curve_moving_buy_share, { p: P.curve_moving_buy_share, color: 'var(--b-hold120)' })}
      ${bar('Top-decile buys', L.top_decile_buy_share, { p: P.top_decile_buy_share, color: 'var(--b-hold120)' })}
      <p class="sx-note">Median buy ${sol(L.median_buy_sol)} SOL · max ${sol(L.max_buy_sol)} SOL · ${L.large_buy_count} large buys from ${L.large_buy_wallets} wallets. Tick = cohort percentile.</p></div>
    <div class="sx-sec"><h4>Wallet concentration</h4>
      ${bar('Top-1 buy', C.top1_buy_share, { color: 'var(--b-flow)' })}
      ${bar('Top-5 buy', C.top5_buy_share, { color: 'var(--b-flow)' })}
      ${bar('Top-10 buy', C.top10_buy_share, { p: P.top10_buy_share, color: 'var(--b-flow)' })}
      ${bar('Top-10 net held', C.top10_net_share, { p: P.top10_net_share, color: 'var(--b-flow)' })}
      ${bar('Gini', C.gini_buy, { p: P.gini_buy, fmt: (x) => num(x, 2), color: 'var(--b-flow)' })}
      ${bar('Round-trip vol', C.roundtrip_volume_share, { p: P.roundtrip_volume_share, color: 'var(--b-random)' })}
      ${bar('Same-second', C.same_second_cluster_share, { color: 'var(--b-random)' })}
      ${C.creator ? bar('Creator buy', C.creator.buy_sol_share, { color: 'var(--down)' }) : ''}
      <p class="sx-note">${C.unique_buyers} buyers · ${num(C.effective_buyers)} effective · ${C.nakamoto_50_buy ?? '–'} wallets make half the buy SOL · ${pct(C.retained_token_ratio)} of bought tokens still held on tape. Per wallet, not per entity.</p></div>
    <div class="sx-sec"><h4>Price impact</h4>
      <div class="sx-bar"><span class="lb">Buy / SOL (vw)</span><span class="mono">${I.buy_impact_per_sol_vw == null ? '–' : (I.buy_impact_per_sol_vw * 100).toFixed(2) + '%'}</span><span class="v faint">depth</span></div>
      <div class="sx-bar"><span class="lb">Sell / SOL (vw)</span><span class="mono">${I.sell_impact_per_sol_vw == null ? '–' : (I.sell_impact_per_sol_vw * 100).toFixed(2) + '%'}</span><span class="v faint">depth</span></div>
      <div class="sx-bar"><span class="lb">Median vSOL</span><span class="mono">${num(I.median_vsol_pre, 1)}</span><span class="v faint">SOL</span></div>
      <div class="sx-bar"><span class="lb">Net move</span><span class="mono ${I.net_log_price_move > 0 ? 'up' : 'down'}">${I.net_log_price_move == null ? '–' : ((Math.exp(I.net_log_price_move) - 1) * 100).toFixed(0) + '%'}</span><span class="v faint">window</span></div>
      <div class="sx-bar"><span class="lb">Kyle λ</span><span class="mono">${I.kyle_lambda == null ? '–' : I.kyle_lambda.toFixed(4)}</span><span class="v faint">${I.kyle_lambda_r2 == null ? '' : 'R² ' + I.kyle_lambda_r2.toFixed(2)}</span></div>
      <p class="sx-note">On the bonding curve, impact per SOL is set by depth (≈ 2 / vSOL). It locates the coin on the curve; it is not a demand signal.</p></div>
    <div class="sx-sec"><h4>Data quality</h4>
      <div class="sx-flags">${Q.flags.length ? Q.flags.map((f) => `<span class="chip ${BAD.has(f) ? 'warn' : 'neutral'}">${esc(f.replace(/_/g, ' '))}</span>`).join('') : '<span class="chip">clean</span>'}</div>
      <p class="sx-note">Tape continuity ${pct(Q.tape_continuity, 1)} · fee ratio ${num(Q.fee_ratio_median, 3)} · mechanical coverage ${pct(Q.mechanical_coverage)} · ${Q.duplicates_removed} duplicates removed.</p></div>`;
}

let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (S.m && root.querySelector('#sxPlot')?.offsetParent) plot(); }, 150); });
// Lazy load: only fetch when the tab is opened (or if the page lands on it).
const tab = document.querySelector('.tabs [data-tab=structure]');
let started = false;
const start = () => { if (!started) { started = true; load(); } };
tab?.addEventListener('click', start);
if (!tab || location.hash === '#structure' || !document.getElementById('tab-structure')?.hidden) start();
