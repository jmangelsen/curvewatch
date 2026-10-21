"""Tests for curvewatch_scoring. Run: python3 -m unittest -v test_curvewatch_scoring"""
import json
import math
import os
import random
import sqlite3
import subprocess
import sys
import tempfile
import unittest

import curvewatch_scoring as cs

FEE = 0.01


class Curve:
    """Pump.fun-style virtual constant-product curve emitting Curvewatch trade rows."""

    def __init__(self, mint, vsol=30.0, vtok=1_073_000_000.0):
        self.mint, self.vsol, self.vtok, self.k = mint, vsol, vtok, vsol * vtok
        self.rows, self.n = [], 0

    def buy(self, wallet, sol, ts):
        d = sol / (1 + FEE)
        new_vsol = self.vsol + d
        new_vtok = self.k / new_vsol
        tok = self.vtok - new_vtok
        self.vsol, self.vtok = new_vsol, new_vtok
        return self._emit(wallet, 1, sol, tok, ts)

    def sell(self, wallet, tok, ts):
        new_vtok = self.vtok + tok
        new_vsol = self.k / new_vtok
        sol = (self.vsol - new_vsol) * (1 - FEE)
        self.vsol, self.vtok = new_vsol, new_vtok
        return self._emit(wallet, 0, sol, tok, ts)

    def _emit(self, wallet, is_buy, sol, tok, ts):
        self.n += 1
        r = dict(mint=self.mint, ts=ts, slot=None, sig=f"{self.mint}-{self.n}", wallet=wallet,
                 is_buy=is_buy, sol=sol, tok=tok, vsol=self.vsol, vtok=self.vtok)
        self.rows.append(r)
        return r


def write_db(path, rows, tokens=()):
    con = sqlite3.connect(path)
    con.executescript("""
      CREATE TABLE trades (mint TEXT NOT NULL, ts INTEGER NOT NULL, slot INTEGER, sig TEXT, wallet TEXT,
        is_buy INTEGER, sol REAL, tok REAL, vsol REAL, vtok REAL);
      CREATE TABLE tokens (mint TEXT PRIMARY KEY, name TEXT, symbol TEXT, uri TEXT, creator TEXT,
        created_at INTEGER NOT NULL, create_slot INTEGER, initial_buy_sol REAL, initial_mcap REAL,
        has_twitter INTEGER, has_telegram INTEGER, has_website INTEGER, mayhem INTEGER, pool TEXT,
        peak_mcap_1h REAL, mcap_1h REAL, graduated INTEGER DEFAULT 0, graduated_at INTEGER,
        rugged INTEGER, unique_buyers_1h INTEGER, max_score REAL, alerted INTEGER DEFAULT 0,
        finalized INTEGER DEFAULT 0);""")
    con.executemany("INSERT INTO trades VALUES (?,?,?,?,?,?,?,?,?,?)",
                    [tuple(r[f] for f in cs.FIELDS) for r in rows])
    con.executemany("INSERT INTO tokens (mint,symbol,creator,created_at,pool) VALUES (?,?,?,?,?)", tokens)
    con.commit(); con.close()


def broad_coin(mint, seed, t0=1_760_000_000):
    rnd = random.Random(seed)
    c = Curve(mint)
    held = {}
    for i in range(120):
        w = f"w{rnd.randint(0, 79)}"
        ts = t0 + i * 5
        if held.get(w) and rnd.random() < 0.25:
            tok = held[w] * rnd.uniform(0.3, 1.0)
            c.sell(w, tok, ts); held[w] -= tok
        else:
            r = c.buy(w, rnd.uniform(0.05, 0.6), ts); held[w] = held.get(w, 0) + r["tok"]
    return c


def whale_coin(mint, t0=1_760_000_000):
    c = Curve(mint)
    c.buy("creator", 1.5, t0)
    for i in range(3):
        c.buy("whaleA", 4.0, t0 + 1)
        c.buy(f"bundle{i}", 3.0, t0 + 1)
    for i in range(30):
        c.buy(f"small{i}", 0.1, t0 + 10 + i * 3)
    return c


class TestMechanics(unittest.TestCase):
    def test_reconstruction_matches_curve(self):
        c = Curve("M")
        pre_vsol, pre_vtok = c.vsol, c.vtok
        r = c.buy("a", 1.0, 0)
        t = cs.normalize(r, 0); cs.reconstruct(t)
        self.assertTrue(t["valid_mech"])
        self.assertAlmostEqual(t["vsol_pre"], pre_vsol, places=6)
        self.assertAlmostEqual(t["p_pre"], pre_vsol / pre_vtok, places=15)
        d = 1.0 / (1 + FEE)
        theo = (1 + d / pre_vsol) ** 2 - 1          # constant-product price impact
        self.assertAlmostEqual(t["impact"], theo, places=9)
        self.assertAlmostEqual(t["fee_ratio"], 1 + FEE, places=6)

    def test_sell_impact_negative(self):
        c = Curve("M"); r = c.buy("a", 2.0, 0); s = c.sell("a", r["tok"] / 2, 1)
        t = cs.normalize(s, 1); cs.reconstruct(t)
        self.assertLess(t["impact"], 0)
        self.assertAlmostEqual(t["fee_ratio"], 1 - FEE, places=6)

    def test_depth_normalized_impact_near_two(self):
        c = Curve("M")
        ts = [cs.normalize(c.buy("a", 0.01, i), i) for i in range(5)]
        for t in ts:
            cs.reconstruct(t)
            self.assertAlmostEqual(t["impact_per_sol"] * t["vsol_pre"], 2 / (1 + FEE), delta=0.01)

    def test_invalid_rows_skipped(self):
        t = cs.normalize(dict(mint="M", ts=1, is_buy=1, sol=1, tok=None, vsol=30, vtok=1e9), 0)
        cs.reconstruct(t); self.assertFalse(t["valid_mech"])


class TestConcentration(unittest.TestCase):
    def test_equal_wallets(self):
        v = [1.0] * 10
        self.assertAlmostEqual(cs.hhi(v), 0.1)
        self.assertAlmostEqual(cs.gini(v), 0.0)
        self.assertEqual(cs.nakamoto(v, 0.5), 5)

    def test_single_whale(self):
        v = [97.0, 1.0, 1.0, 1.0]
        self.assertGreater(cs.hhi(v), 0.9)
        self.assertEqual(cs.nakamoto(sorted(v, reverse=True)), 1)
        self.assertGreater(cs.gini(v), 0.7)

    def test_percentile_ties(self):
        r = cs.percentile_ranks({"a": 1, "b": 1, "c": 3})
        self.assertEqual(r["a"], r["b"]); self.assertEqual(r["c"], 100.0)


class TestCoinScoring(unittest.TestCase):
    def setUp(self):
        self.p = cs.Params()

    def test_whale_vs_broad(self):
        w = whale_coin("W"); b = broad_coin("B", 1)
        trades = [cs.normalize(r, i) for i, r in enumerate(w.rows + b.rows)]
        out = cs.build_matrix(trades, {"W": {"creator": "creator", "created_at": 1_760_000_000}}, self.p, "t")
        coins = {c["mint"]: c for c in out["coins"]}
        W, B = coins["W"], coins["B"]
        self.assertGreater(W["large_trades"]["large_buy_share"], 0.8)
        self.assertEqual(B["large_trades"]["large_buy_share"], 0.0)
        self.assertGreater(W["concentration"]["top1_buy_share"], B["concentration"]["top1_buy_share"])
        self.assertLess(W["concentration"]["effective_buyers"], B["concentration"]["effective_buyers"])
        self.assertGreater(W["concentration"]["same_second_cluster_share"], 0.5)
        self.assertAlmostEqual(W["concentration"]["creator"]["buy_sol_share"],
                               1.5 / sum(r["sol"] for r in w.rows if r["is_buy"]), places=5)
        # clean simulated tape -> no QA flags besides none
        self.assertNotIn("tape_discontinuous", B["quality"]["flags"])
        self.assertNotIn("reserve_inconsistent", B["quality"]["flags"])
        self.assertEqual(B["quality"]["tape_continuity"], 1.0)

    def test_missing_trades_flag_discontinuity(self):
        b = broad_coin("B", 2)
        rows = [r for i, r in enumerate(b.rows) if i % 3]   # drop every third trade
        trades = [cs.normalize(r, i) for i, r in enumerate(rows)]
        c = cs.score_coin("B", trades, {}, self.p)
        self.assertIn("tape_discontinuous", c["quality"]["flags"])

    def test_corrupt_reserves_flag(self):
        b = broad_coin("B", 3)
        trades = [cs.normalize(r, i) for i, r in enumerate(b.rows)]
        for t in trades:
            t["vsol"] *= 1.3     # reserves inconsistent with tok/sol
        c = cs.score_coin("B", trades, {}, self.p)
        self.assertIn("reserve_inconsistent", c["quality"]["flags"])

    def test_duplicates_removed(self):
        b = broad_coin("B", 4)
        rows = b.rows + b.rows[:10]
        trades = [cs.normalize(r, i) for i, r in enumerate(rows)]
        c = cs.score_coin("B", trades, {}, self.p)
        self.assertEqual(c["quality"]["duplicates_removed"], 10)
        self.assertEqual(c["flow"]["n_trades"], len(b.rows))

    def test_window_prevents_lookahead(self):
        b = broad_coin("B", 5)
        p = cs.Params(window_sec=100, anchor="first_trade", min_trades=1, min_buyers=1)
        trades = [cs.normalize(r, i) for i, r in enumerate(b.rows)]
        c = cs.score_coin("B", trades, {}, p)
        self.assertEqual(c["flow"]["n_trades"], 20)          # 5-second spacing
        self.assertIn("window_truncated", c["quality"]["flags"])

    def test_low_sample_unranked(self):
        c = Curve("S"); c.buy("a", 1, 0); c.buy("b", 1, 1)
        out = cs.build_matrix([cs.normalize(r, i) for i, r in enumerate(c.rows)], {}, self.p, "t")
        self.assertIsNone(out["coins"][0]["scores"])
        self.assertIn("low_sample", out["coins"][0]["quality"]["flags"])

    def test_pumpportal_shape_and_ms(self):
        raw = dict(mint="P", timestamp=1_760_000_000_123, txType="buy", traderPublicKey="x",
                   solAmount=1, tokenAmount=1000, vSolInBondingCurve=31, vTokensInBondingCurve=1e9,
                   signature="s")
        t = cs.normalize(raw, 0)
        self.assertTrue(t["is_buy"]); self.assertAlmostEqual(t["ts"], 1_760_000_000.123)


class TestEndToEnd(unittest.TestCase):
    def test_sqlite_cli(self):
        coins = [broad_coin(f"B{i}", i) for i in range(6)] + [whale_coin("W")]
        rows = [r for c in coins for r in c.rows]
        with tempfile.TemporaryDirectory() as d:
            db = os.path.join(d, "curvewatch.db"); out = os.path.join(d, "scores.json")
            write_db(db, rows, [("W", "WHL", "creator", 1_760_000_000, "pump")])
            here = os.path.dirname(os.path.abspath(__file__))
            subprocess.run([sys.executable, os.path.join(here, "curvewatch_scoring.py"),
                            "--db", db, "--out", out, "--window-sec", "3600"], check=True,
                           capture_output=True)
            with open(out) as fh: m = json.load(fh)
            self.assertEqual(m["schema_version"], cs.SCHEMA_VERSION)
            self.assertEqual(m["cohort"]["n_coins"], 7)
            self.assertEqual(len(m["matrix"]["rows"]), 7)
            self.assertEqual(len(m["matrix"]["columns"]), len(m["matrix"]["rows"][0]))
            by = {c["mint"]: c for c in m["coins"]}
            self.assertEqual(by["W"]["meta"]["symbol"], "WHL")
            # whale coin should be the most whale-dependent and least broad in the cohort
            ranked = [c for c in m["coins"] if c["scores"]]
            self.assertEqual(max(ranked, key=lambda c: c["scores"]["whale_dependence"])["mint"], "W")
            self.assertEqual(min(ranked, key=lambda c: c["scores"]["structure_composite"])["mint"], "W")
            # DB untouched (read-only open)
            self.assertEqual(sqlite3.connect(db).execute("SELECT COUNT(*) FROM trades").fetchone()[0], len(rows))

    def test_launched_filter(self):
        a = broad_coin("A", 1, t0=1000); b = broad_coin("B", 2, t0=90_000)
        trades = [cs.normalize(r, i) for i, r in enumerate(a.rows + b.rows)]
        kept = cs.filter_launched(trades, {"A": {"created_at": 999}}, 0, 86_400)
        self.assertEqual({t["mint"] for t in kept}, {"A"})
        kept = cs.filter_launched(trades, {}, 86_400, 172_800)
        self.assertEqual({t["mint"] for t in kept}, {"B"})

    def test_fingerprint_changes_with_params(self):
        self.assertNotEqual(cs.Params().fingerprint(), cs.Params(large_sol=2).fingerprint())


if __name__ == "__main__":
    unittest.main()
