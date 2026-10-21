#!/usr/bin/env python3
"""
curvewatch_scoring.py — per-coin trade-structure scoring for Curvewatch.

Reads Pump.fun trade events (Curvewatch SQLite `trades` table, CSV, JSON, or JSONL)
and emits a structured JSON scoring matrix with, per coin:

  1. Large-trade buy share      — share of buy SOL from large buys (absolute SOL
                                  thresholds AND curve-relative "curve-moving" buys).
  2. Price impact per SOL       — mechanically reconstructed from post-trade virtual
                                  reserves (constant product), plus realized
                                  price-efficiency and a bucketed Kyle-lambda.
  3. Wallet concentration       — top-N shares, HHI, effective buyers, Gini,
                                  Nakamoto-50 on buy volume and on tape-derived net
                                  positions; creator share when `tokens` is available.

Plus cohort percentiles, descriptive sub-scores, data-quality flags and a params
fingerprint so outputs from different settings are never silently mixed.

Pure standard library (Python >= 3.9). No network calls. Read-only on the database.

Schema expected (src/db.js):
  trades(mint TEXT, ts INTEGER /*epoch s*/, slot INTEGER, sig TEXT, wallet TEXT,
         is_buy INTEGER, sol REAL, tok REAL, vsol REAL, vtok REAL)
  vsol/vtok are POST-trade virtual reserves (PumpPortal vSolInBondingCurve /
  vTokensInBondingCurve).

IMPORTANT INTERPRETATION NOTE
  On a constant-product curve, mechanical impact per SOL is a deterministic function
  of curve depth (≈ 2 / vsol_pre for small buys). It measures *where on the curve*
  a coin traded, not trader skill or demand quality. Its main analytical uses are
  (a) normalizing trade size, and (b) data QA: a coin whose reported reserves do not
  obey the invariant has a broken or gap-affected tape. The descriptive sub-scores
  below are NOT validated entry signals.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import sqlite3
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence

SCHEMA_VERSION = "curvewatch.scoring.v1"


# --------------------------------------------------------------------------- params
@dataclass
class Params:
    large_sol: float = 1.0                         # primary absolute "large buy" threshold
    large_sol_ladder: List[float] = field(default_factory=lambda: [0.5, 1.0, 2.0, 5.0])
    curve_moving_pct: float = 2.0                  # buy >= X% of pre-trade vsol = curve-moving
    window_sec: Optional[int] = None               # only trades within N s of coin start (no look-ahead)
    anchor: str = "created_at"                     # created_at | first_trade
    min_trades: int = 20                           # below this, coin is not ranked
    min_buyers: int = 5
    bucket_sec: int = 60                           # Kyle-lambda bucket width
    min_lambda_buckets: int = 5
    early_sec: int = 30                            # early-buy share window
    cluster_min_wallets: int = 3                   # same-second distinct-buyer cluster (bundle proxy)
    fee_ratio_band: List[float] = field(default_factory=lambda: [0.90, 1.15])
    continuity_tol: float = 0.005                  # 0.5% pre/post price match tolerance
    weights: Dict[str, float] = field(default_factory=lambda: {
        "breadth": 0.4, "flow_quality": 0.3, "whale_independence": 0.3})

    def fingerprint(self) -> str:
        blob = json.dumps(asdict(self), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(blob.encode()).hexdigest()[:8]


# --------------------------------------------------------------------------- loading
FIELDS = ("mint", "ts", "slot", "sig", "wallet", "is_buy", "sol", "tok", "vsol", "vtok")


def _f(x: Any) -> Optional[float]:
    if x is None or x == "":
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _b(x: Any) -> Optional[bool]:
    if isinstance(x, bool):
        return x
    if x is None or x == "":
        return None
    s = str(x).strip().lower()
    if s in ("1", "true", "buy", "b", "t", "yes"):
        return True
    if s in ("0", "false", "sell", "s", "f", "no"):
        return False
    return None


def normalize(raw: Dict[str, Any], seq: int) -> Optional[Dict[str, Any]]:
    """Map a raw event (Curvewatch row or PumpPortal-style message) to the canonical shape."""
    g = raw.get
    is_buy = _b(g("is_buy", g("txType", g("side"))))
    mint = g("mint")
    ts = _f(g("ts", g("timestamp")))
    if ts is not None and ts > 1e11:   # milliseconds -> seconds
        ts = ts / 1000.0
    if not mint or ts is None or is_buy is None:
        return None
    return {
        "seq": seq,
        "mint": str(mint),
        "ts": ts,
        "sig": g("sig", g("signature")) or None,
        "wallet": g("wallet", g("traderPublicKey")) or None,
        "is_buy": is_buy,
        "sol": _f(g("sol", g("solAmount"))),
        "tok": _f(g("tok", g("tokenAmount"))),
        "vsol": _f(g("vsol", g("vSolInBondingCurve"))),
        "vtok": _f(g("vtok", g("vTokensInBondingCurve"))),
    }


def load_sqlite(path: str, mints: Optional[Sequence[str]] = None,
                since: Optional[int] = None, until: Optional[int] = None):
    """Read-only load of trades (+ tokens metadata if present). rowid preserves receive order."""
    uri = f"file:{os.path.abspath(path)}?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    con.row_factory = sqlite3.Row
    where, args = [], []
    if mints:
        where.append(f"mint IN ({','.join('?' * len(mints))})")
        args += list(mints)
    if since is not None:
        where.append("ts >= ?"); args.append(since)
    if until is not None:
        where.append("ts < ?"); args.append(until)
    sql = "SELECT rowid AS seq, " + ",".join(FIELDS) + " FROM trades"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY mint, ts, rowid"
    trades = []
    for r in con.execute(sql, args):
        t = normalize(dict(r), r["seq"])
        if t:
            trades.append(t)
    meta: Dict[str, Dict[str, Any]] = {}
    has_tokens = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='tokens'").fetchone()
    if has_tokens:
        cols = {c[1] for c in con.execute("PRAGMA table_info(tokens)")}
        want = [c for c in ("mint", "symbol", "name", "creator", "created_at", "pool",
                            "graduated", "graduated_at", "gap") if c in cols]
        mset = {t["mint"] for t in trades}
        for r in con.execute(f"SELECT {','.join(want)} FROM tokens"):
            d = dict(zip(want, r))
            if d["mint"] in mset:
                meta[d["mint"]] = d
    con.close()
    return trades, meta


def load_file(path: str):
    ext = os.path.splitext(path)[1].lower()
    rows: Iterable[Dict[str, Any]]
    with open(path, newline="") as fh:
        if ext == ".csv":
            rows = list(csv.DictReader(fh))
        elif ext in (".jsonl", ".ndjson"):
            rows = [json.loads(line) for line in fh if line.strip()]
        else:
            data = json.load(fh)
            rows = data.get("trades", data) if isinstance(data, dict) else data
    trades = [t for i, r in enumerate(rows) if (t := normalize(r, i))]
    return trades, {}


# --------------------------------------------------------------------------- math helpers
def _share_top(vals_desc: List[float], n: int, total: float) -> Optional[float]:
    return sum(vals_desc[:n]) / total if total > 0 else None


def hhi(vals: List[float]) -> Optional[float]:
    tot = sum(vals)
    return sum((v / tot) ** 2 for v in vals) if tot > 0 else None


def gini(vals: List[float]) -> Optional[float]:
    xs = sorted(v for v in vals if v >= 0)
    n, tot = len(xs), sum(xs)
    if n == 0 or tot <= 0:
        return None
    if n == 1:
        return 0.0
    cum = sum((i + 1) * x for i, x in enumerate(xs))
    return (2 * cum) / (n * tot) - (n + 1) / n


def nakamoto(vals_desc: List[float], frac: float = 0.5) -> Optional[int]:
    tot = sum(vals_desc)
    if tot <= 0:
        return None
    run = 0.0
    for i, v in enumerate(vals_desc, 1):
        run += v
        if run >= frac * tot - 1e-12:
            return i
    return len(vals_desc)


def median(xs: List[float]) -> Optional[float]:
    s = sorted(xs)
    n = len(s)
    if n == 0:
        return None
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def quantile(xs: List[float], q: float) -> Optional[float]:
    s = sorted(xs)
    if not s:
        return None
    pos = (len(s) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def ols_slope(x: List[float], y: List[float]):
    n = len(x)
    if n < 3:
        return None, None
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((a - mx) ** 2 for a in x)
    if sxx <= 0:
        return None, None
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    beta = sxy / sxx
    syy = sum((b - my) ** 2 for b in y)
    r2 = (sxy * sxy) / (sxx * syy) if syy > 0 else None
    return beta, r2


def _r(x: Optional[float], nd: int = 6):
    return None if x is None else round(x, nd)


# --------------------------------------------------------------------------- per-trade mechanics
def reconstruct(t: Dict[str, Any]) -> None:
    """Attach pre-trade reserves, prices and mechanical impact using x*y=k on post reserves.

    buy:  vtok_pre = vtok + tok ;  sell: vtok_pre = vtok - tok
    vsol_pre = vsol * vtok / vtok_pre   (invariant; avoids fee ambiguity in `sol`)
    """
    t["valid_mech"] = False
    vsol, vtok, tok, sol = t["vsol"], t["vtok"], t["tok"], t["sol"]
    if not all(v is not None and v > 0 for v in (vsol, vtok, tok, sol)):
        return
    vtok_pre = vtok + tok if t["is_buy"] else vtok - tok
    if vtok_pre <= 0:
        return
    vsol_pre = vsol * vtok / vtok_pre
    p_pre, p_post = vsol_pre / vtok_pre, vsol / vtok
    impact = p_post / p_pre - 1.0                    # signed: + for buys, - for sells
    d_curve_sol = abs(vsol - vsol_pre)               # SOL that actually moved the curve
    t.update(valid_mech=True, vsol_pre=vsol_pre, p_pre=p_pre, p_post=p_post,
             impact=impact, impact_per_sol=abs(impact) / sol,
             fee_ratio=(sol / d_curve_sol) if d_curve_sol > 0 else None,
             pct_of_curve=100.0 * sol / vsol_pre)


# --------------------------------------------------------------------------- per-coin scoring
def score_coin(mint: str, trades: List[Dict[str, Any]], meta: Dict[str, Any], p: Params) -> Dict[str, Any]:
    flags: List[str] = []

    # dedupe on signature (restored/backfilled trades can duplicate live rows)
    seen, uniq, dup = set(), [], 0
    for t in trades:
        key = (t["sig"], t["is_buy"], t["wallet"]) if t["sig"] else None
        if key and key in seen:
            dup += 1
            continue
        if key:
            seen.add(key)
        uniq.append(t)
    trades = sorted(uniq, key=lambda t: (t["ts"], t["seq"]))
    if dup:
        flags.append("duplicate_sigs_removed")

    # window anchoring — features frozen at anchor + window_sec (prevents look-ahead)
    created = _f(meta.get("created_at"))
    if created is not None and created > 1e11:
        created /= 1000.0
    first_ts = trades[0]["ts"] if trades else None
    anchor = created if (p.anchor == "created_at" and created is not None) else first_ts
    if p.window_sec is not None and anchor is not None:
        before = len(trades)
        trades = [t for t in trades if anchor <= t["ts"] < anchor + p.window_sec]
        if len(trades) < before:
            flags.append("window_truncated")

    for t in trades:
        reconstruct(t)

    buys = [t for t in trades if t["is_buy"] and (t["sol"] or 0) > 0]
    sells = [t for t in trades if not t["is_buy"] and (t["sol"] or 0) > 0]
    buy_sol = sum(t["sol"] for t in buys)
    sell_sol = sum(t["sol"] for t in sells)
    gross = buy_sol + sell_sol
    missing_wallet = sum(1 for t in trades if not t["wallet"])
    if trades and missing_wallet / len(trades) > 0.02:
        flags.append("missing_wallets")

    # ---------------------------------------------------------------- 1. large trades
    ladder = {}
    for thr in sorted(set(p.large_sol_ladder + [p.large_sol])):
        big = [t for t in buys if t["sol"] >= thr]
        ladder[f"ge_{thr:g}_sol"] = {
            "share_of_buy_sol": _r(sum(t["sol"] for t in big) / buy_sol) if buy_sol else None,
            "n_buys": len(big),
            "n_wallets": len({t["wallet"] for t in big if t["wallet"]}),
        }
    prim = ladder[f"ge_{p.large_sol:g}_sol"]
    mov = [t for t in buys if t["valid_mech"] and t["pct_of_curve"] >= p.curve_moving_pct]
    sizes_desc = sorted((t["sol"] for t in buys), reverse=True)
    k10 = max(1, math.ceil(0.10 * len(sizes_desc))) if sizes_desc else 0
    large = {
        "primary_threshold_sol": p.large_sol,
        "large_buy_share": prim["share_of_buy_sol"],
        "large_buy_count": prim["n_buys"],
        "large_buy_wallets": prim["n_wallets"],
        "ladder": ladder,
        "curve_moving_buy_share": _r(sum(t["sol"] for t in mov) / buy_sol) if buy_sol else None,
        "curve_moving_threshold_pct_of_vsol": p.curve_moving_pct,
        "top_decile_buy_share": _r(sum(sizes_desc[:k10]) / buy_sol) if buy_sol else None,
        "median_buy_sol": _r(median([t["sol"] for t in buys])),
        "max_buy_sol": _r(sizes_desc[0]) if sizes_desc else None,
    }

    # ---------------------------------------------------------------- 2. price impact per SOL
    mb = [t for t in buys if t["valid_mech"]]
    ms = [t for t in sells if t["valid_mech"]]
    mech_cov = (len(mb) + len(ms)) / len(trades) if trades else 0.0

    def vw(ts_):  # volume-weighted impact per SOL == sum|impact| / sum sol
        s = sum(t["sol"] for t in ts_)
        return sum(abs(t["impact"]) for t in ts_) / s if s > 0 else None

    # realized: first pre-price -> last post-price across all mechanically valid trades
    mech_all = [t for t in trades if t["valid_mech"]]
    net_log_move = (math.log(mech_all[-1]["p_post"] / mech_all[0]["p_pre"])
                    if mech_all else None)
    net_flow = buy_sol - sell_sol

    # bucketed Kyle lambda: Δlog p per bucket ~ net signed SOL per bucket
    lam, lam_r2, nb = None, None, 0
    if mech_all:
        buckets: Dict[int, Dict[str, float]] = {}
        for t in mech_all:
            b = int(t["ts"] // p.bucket_sec)
            d = buckets.setdefault(b, {"flow": 0.0, "p0": t["p_pre"], "p1": t["p_post"]})
            d["flow"] += t["sol"] if t["is_buy"] else -t["sol"]
            d["p1"] = t["p_post"]
        xs = [d["flow"] for d in buckets.values() if d["flow"] != 0]
        ys = [math.log(d["p1"] / d["p0"]) for d in buckets.values() if d["flow"] != 0]
        nb = len(xs)
        if nb >= p.min_lambda_buckets:
            lam, lam_r2 = ols_slope(xs, ys)

    # QA: invariant/fee conformity and tape continuity (missed trades break pre==prev post)
    fee_ratios = [t["fee_ratio"] for t in mech_all if t.get("fee_ratio")]
    lo, hi = p.fee_ratio_band
    off_band = sum(1 for r in fee_ratios if not (lo <= r <= hi))
    cont_ok = cont_n = 0
    for a, b in zip(mech_all, mech_all[1:]):
        cont_n += 1
        if abs(b["p_pre"] / a["p_post"] - 1) <= p.continuity_tol:
            cont_ok += 1
    continuity = cont_ok / cont_n if cont_n else None
    if fee_ratios and off_band / len(fee_ratios) > 0.10:
        flags.append("reserve_inconsistent")
    if continuity is not None and continuity < 0.90:
        flags.append("tape_discontinuous")
    if trades and mech_cov < 0.90:
        flags.append("low_mechanical_coverage")

    impact = {
        "buy_impact_per_sol_vw": _r(vw(mb), 8),
        "sell_impact_per_sol_vw": _r(vw(ms), 8),
        "buy_impact_per_sol_median": _r(median([t["impact_per_sol"] for t in mb]), 8),
        "depth_normalized_buy_impact": _r(median([t["impact_per_sol"] * t["vsol_pre"] for t in mb]), 4),
        "median_vsol_pre": _r(median([t["vsol_pre"] for t in mech_all]), 4),
        "net_log_price_move": _r(net_log_move),
        "price_efficiency": _r(net_log_move / gross, 8) if (net_log_move is not None and gross) else None,
        "kyle_lambda": _r(lam, 8),
        "kyle_lambda_r2": _r(lam_r2, 4),
        "kyle_lambda_buckets": nb,
        "note": "Mechanical impact per SOL is determined by curve depth (~2/vsol_pre for small buys); "
                "use for size normalization and QA, not as a demand signal.",
    }

    # ---------------------------------------------------------------- 3. wallet concentration
    wb: Dict[str, float] = defaultdict(float)      # buy SOL per wallet
    wnet: Dict[str, float] = defaultdict(float)    # net tokens per wallet (tape-derived)
    wsold: Dict[str, float] = defaultdict(float)
    for t in trades:
        w = t["wallet"]
        if not w:
            continue
        if t["is_buy"]:
            wb[w] += t["sol"] or 0.0
            wnet[w] += t["tok"] or 0.0
        else:
            wnet[w] -= t["tok"] or 0.0
            wsold[w] += t["sol"] or 0.0
    bvals = sorted((v for v in wb.values() if v > 0), reverse=True)
    btot = sum(bvals)
    pos = sorted((v for v in wnet.values() if v > 0), reverse=True)
    ptot = sum(pos)
    tok_bought = sum(t["tok"] or 0 for t in buys)
    tok_sold = sum(t["tok"] or 0 for t in sells)
    h = hhi(bvals)
    roundtrip = sum(wb[w] + wsold[w] for w in wb if w in wsold)

    creator = meta.get("creator")
    creator_block = None
    if creator:
        creator_block = {
            "wallet": creator,
            "buy_sol_share": _r(wb.get(creator, 0.0) / btot) if btot else None,
            "net_token_share": _r(max(wnet.get(creator, 0.0), 0.0) / ptot) if ptot else None,
            "sold_sol": _r(wsold.get(creator, 0.0)),
        }

    early = clustered = 0.0
    if buys and anchor is not None:
        early = sum(t["sol"] for t in buys if t["ts"] < anchor + p.early_sec)
        per_sec: Dict[int, set] = defaultdict(set)
        for t in buys:
            if t["wallet"]:
                per_sec[int(t["ts"])].add(t["wallet"])
        hot = {s for s, ws in per_sec.items() if len(ws) >= p.cluster_min_wallets}
        clustered = sum(t["sol"] for t in buys if int(t["ts"]) in hot)

    conc = {
        "unique_buyers": len(bvals),
        "unique_sellers": sum(1 for v in wsold.values() if v > 0),
        "top1_buy_share": _r(_share_top(bvals, 1, btot)),
        "top5_buy_share": _r(_share_top(bvals, 5, btot)),
        "top10_buy_share": _r(_share_top(bvals, 10, btot)),
        "hhi_buy": _r(h),
        "effective_buyers": _r(1 / h, 2) if h else None,
        "gini_buy": _r(gini(bvals)),
        "nakamoto_50_buy": nakamoto(bvals, 0.5),
        "tape_holders": len(pos),
        "top1_net_share": _r(_share_top(pos, 1, ptot)),
        "top10_net_share": _r(_share_top(pos, 10, ptot)),
        "hhi_net": _r(hhi(pos)),
        "retained_token_ratio": _r(1 - tok_sold / tok_bought) if tok_bought else None,
        "roundtrip_volume_share": _r(roundtrip / gross) if gross else None,
        "early_buy_share": _r(early / buy_sol) if buy_sol else None,
        "same_second_cluster_share": _r(clustered / buy_sol) if buy_sol else None,
        "creator": creator_block,
        "note": "Concentration is per wallet, not per entity; split (sybil/bundle) wallets understate it. "
                "Net positions come from the observed tape only (no transfers, no pre-window balances).",
    }

    flow = {
        "n_trades": len(trades), "n_buys": len(buys), "n_sells": len(sells),
        "buy_sol": _r(buy_sol, 4), "sell_sol": _r(sell_sol, 4), "gross_sol": _r(gross, 4),
        "net_flow_sol": _r(net_flow, 4),
        "net_flow_ratio": _r(net_flow / gross) if gross else None,
        "first_ts": trades[0]["ts"] if trades else None,
        "last_ts": trades[-1]["ts"] if trades else None,
    }

    rankable = len(trades) >= p.min_trades and len(bvals) >= p.min_buyers
    if not rankable:
        flags.append("low_sample")
    if meta.get("gap"):
        flags.append("feed_gap")
    if meta.get("pool") and str(meta["pool"]).lower() not in ("pump", "pump-amm", "pumpswap"):
        flags.append("nonstandard_pool")

    return {
        "mint": mint,
        "meta": {k: meta.get(k) for k in ("symbol", "name", "created_at", "pool", "graduated")
                 if k in meta},
        "anchor_ts": anchor,
        "flow": flow,
        "large_trades": large,
        "price_impact": impact,
        "concentration": conc,
        "quality": {
            "rankable": rankable,
            "flags": flags,
            "duplicates_removed": dup,
            "mechanical_coverage": _r(mech_cov, 4),
            "tape_continuity": _r(continuity, 4),
            "fee_ratio_median": _r(median(fee_ratios), 4),
            "fee_ratio_off_band_share": _r(off_band / len(fee_ratios), 4) if fee_ratios else None,
            "missing_wallet_trades": missing_wallet,
        },
    }


# --------------------------------------------------------------------------- cohort scoring
# (path into coin dict, higher_is_riskier/whale-ier). Percentiles are rank-based in [0,100].
RANKED = {
    "large_buy_share":          ("large_trades", "large_buy_share"),
    "curve_moving_buy_share":   ("large_trades", "curve_moving_buy_share"),
    "top_decile_buy_share":     ("large_trades", "top_decile_buy_share"),
    "buy_impact_per_sol_vw":    ("price_impact", "buy_impact_per_sol_vw"),
    "price_efficiency":         ("price_impact", "price_efficiency"),
    "top10_buy_share":          ("concentration", "top10_buy_share"),
    "hhi_buy":                  ("concentration", "hhi_buy"),
    "effective_buyers":         ("concentration", "effective_buyers"),
    "gini_buy":                 ("concentration", "gini_buy"),
    "top10_net_share":          ("concentration", "top10_net_share"),
    "roundtrip_volume_share":   ("concentration", "roundtrip_volume_share"),
    "net_flow_ratio":           ("flow", "net_flow_ratio"),
}


def _get(c, path):
    return c[path[0]].get(path[1])


def percentile_ranks(values: Dict[str, float]) -> Dict[str, float]:
    items = sorted(values.items(), key=lambda kv: kv[1])
    n = len(items)
    out: Dict[str, float] = {}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and items[j + 1][1] == items[i][1]:
            j += 1
        pct = 100.0 * ((i + j) / 2) / (n - 1) if n > 1 else 50.0
        for k in range(i, j + 1):
            out[items[k][0]] = round(pct, 2)
        i = j + 1
    return out


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 2) if xs else None


def build_matrix(trades: List[Dict[str, Any]], meta: Dict[str, Dict[str, Any]],
                 p: Params, source: str) -> Dict[str, Any]:
    by_mint: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for t in trades:
        by_mint[t["mint"]].append(t)
    coins = [score_coin(m, ts, meta.get(m, {}), p) for m, ts in sorted(by_mint.items())]
    ranked = [c for c in coins if c["quality"]["rankable"]]

    pct: Dict[str, Dict[str, float]] = {}
    dist: Dict[str, Dict[str, Any]] = {}
    for name, path in RANKED.items():
        vals = {c["mint"]: _get(c, path) for c in ranked if _get(c, path) is not None}
        pct[name] = percentile_ranks(vals)
        v = list(vals.values())
        dist[name] = {"n": len(v), "p10": _r(quantile(v, .1), 8),
                      "p50": _r(quantile(v, .5), 8), "p90": _r(quantile(v, .9), 8)}

    w = p.weights
    wsum = sum(w.values()) or 1.0
    for c in coins:
        m = c["mint"]
        P = {k: pct[k].get(m) for k in RANKED}
        c["percentiles"] = P
        if not c["quality"]["rankable"]:
            c["scores"] = None
            continue
        whale = _mean([P["large_buy_share"], P["curve_moving_buy_share"], P["top_decile_buy_share"]])
        conc = _mean([P["top10_buy_share"], P["hhi_buy"], P["gini_buy"], P["top10_net_share"]])
        flowq = _mean([P["net_flow_ratio"], P["effective_buyers"],
                       None if P["roundtrip_volume_share"] is None else 100 - P["roundtrip_volume_share"]])
        parts = {
            "breadth": None if conc is None else 100 - conc,
            "flow_quality": flowq,
            "whale_independence": None if whale is None else 100 - whale,
        }
        avail = {k: v for k, v in parts.items() if v is not None}
        aw = sum(w.get(k, 0) for k in avail) or 1.0
        c["scores"] = {
            "whale_dependence": whale,
            "concentration_risk": conc,
            "flow_quality": flowq,
            "structure_composite": round(sum(w.get(k, 0) * v for k, v in avail.items()) / aw, 2)
                                   if avail else None,
            "composite_label": "descriptive breadth/structure score — NOT a validated entry signal",
        }

    cols = ["mint", "rankable", "n_trades", "gross_sol", "large_buy_share", "curve_moving_buy_share",
            "top_decile_buy_share", "buy_impact_per_sol_vw", "depth_normalized_buy_impact",
            "price_efficiency", "kyle_lambda", "unique_buyers", "top1_buy_share", "top10_buy_share",
            "hhi_buy", "effective_buyers", "gini_buy", "nakamoto_50_buy", "top10_net_share",
            "retained_token_ratio", "roundtrip_volume_share", "creator_buy_sol_share",
            "whale_dependence", "concentration_risk", "flow_quality", "structure_composite", "flags"]
    rows = []
    for c in coins:
        L, I, C, F, S = c["large_trades"], c["price_impact"], c["concentration"], c["flow"], c["scores"] or {}
        rows.append([c["mint"], c["quality"]["rankable"], F["n_trades"], F["gross_sol"],
                     L["large_buy_share"], L["curve_moving_buy_share"], L["top_decile_buy_share"],
                     I["buy_impact_per_sol_vw"], I["depth_normalized_buy_impact"], I["price_efficiency"],
                     I["kyle_lambda"], C["unique_buyers"], C["top1_buy_share"], C["top10_buy_share"],
                     C["hhi_buy"], C["effective_buyers"], C["gini_buy"], C["nakamoto_50_buy"],
                     C["top10_net_share"], C["retained_token_ratio"], C["roundtrip_volume_share"],
                     (C["creator"] or {}).get("buy_sol_share"),
                     S.get("whale_dependence"), S.get("concentration_risk"), S.get("flow_quality"),
                     S.get("structure_composite"), ";".join(c["quality"]["flags"])])

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "params": asdict(p),
        "params_fingerprint": p.fingerprint(),
        "cohort": {"n_coins": len(coins), "n_ranked": len(ranked), "n_trades": len(trades),
                   "distributions": dist},
        "matrix": {"columns": cols, "rows": rows},
        "coins": coins,
    }


def filter_launched(trades, meta, since=None, until=None):
    """Keep coins launched in [since, until). Uses tokens.created_at when present, else first trade."""
    first: Dict[str, float] = {}
    for t in trades:
        if t["mint"] not in first or t["ts"] < first[t["mint"]]:
            first[t["mint"]] = t["ts"]
    keep = set()
    for m, ft in first.items():
        start = _f(meta.get(m, {}).get("created_at"))
        if start is not None and start > 1e11:
            start /= 1000.0
        start = ft if start is None else start
        if (since is None or start >= since) and (until is None or start < until):
            keep.add(m)
    return [t for t in trades if t["mint"] in keep]


# --------------------------------------------------------------------------- CLI
def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Curvewatch per-coin trade-structure scoring matrix")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--db", help="Curvewatch SQLite path (opened read-only)")
    src.add_argument("--input", help="CSV / JSON / JSONL trade events")
    ap.add_argument("--mint", action="append", help="restrict to mint (repeatable)")
    ap.add_argument("--since", type=int, help="epoch seconds, inclusive")
    ap.add_argument("--until", type=int, help="epoch seconds, exclusive")
    ap.add_argument("--window-sec", type=int, help="freeze features at anchor + N seconds")
    ap.add_argument("--launched-since", type=int, help="keep coins whose launch (tokens.created_at, else first trade) >= this")
    ap.add_argument("--launched-until", type=int, help="keep coins whose launch < this")
    ap.add_argument("--anchor", choices=["created_at", "first_trade"], default="created_at")
    ap.add_argument("--large-sol", type=float, default=1.0)
    ap.add_argument("--ladder", type=str, default="0.5,1,2,5")
    ap.add_argument("--curve-moving-pct", type=float, default=2.0)
    ap.add_argument("--min-trades", type=int, default=20)
    ap.add_argument("--min-buyers", type=int, default=5)
    ap.add_argument("--bucket-sec", type=int, default=60)
    ap.add_argument("--weights", type=str, help='JSON, e.g. \'{"breadth":0.5,"flow_quality":0.5}\'')
    ap.add_argument("--out", default="-", help="output path, '-' for stdout")
    ap.add_argument("--compact", action="store_true", help="omit per-coin detail; matrix only")
    a = ap.parse_args(argv)

    p = Params(large_sol=a.large_sol,
               large_sol_ladder=[float(x) for x in a.ladder.split(",") if x],
               curve_moving_pct=a.curve_moving_pct, window_sec=a.window_sec, anchor=a.anchor,
               min_trades=a.min_trades, min_buyers=a.min_buyers, bucket_sec=a.bucket_sec)
    if a.weights:
        p.weights = {k: float(v) for k, v in json.loads(a.weights).items()}

    if a.db:
        trades, meta = load_sqlite(a.db, a.mint, a.since, a.until)
        source = f"sqlite:{os.path.basename(a.db)}"
    else:
        trades, meta = load_file(a.input)
        if a.mint:
            trades = [t for t in trades if t["mint"] in set(a.mint)]
        if a.since is not None:
            trades = [t for t in trades if t["ts"] >= a.since]
        if a.until is not None:
            trades = [t for t in trades if t["ts"] < a.until]
        source = f"file:{os.path.basename(a.input)}"

    if a.launched_since is not None or a.launched_until is not None:
        trades = filter_launched(trades, meta, a.launched_since, a.launched_until)
    out = build_matrix(trades, meta, p, source)
    if a.compact:
        out.pop("coins")
    text = json.dumps(out, indent=None if a.compact else 2, default=str)
    if a.out == "-":
        sys.stdout.write(text + "\n")
    else:
        tmp = a.out + ".tmp"
        with open(tmp, "w") as fh:
            fh.write(text)
        os.replace(tmp, a.out)   # atomic: dashboard never reads a half-written file
        print(f"wrote {a.out}  coins={out['cohort']['n_coins']} ranked={out['cohort']['n_ranked']} "
              f"fingerprint={out['params_fingerprint']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
