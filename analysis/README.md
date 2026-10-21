# Curvewatch trade-structure scoring module

`curvewatch_scoring.py` calculates per-coin trade-structure metrics from the Curvewatch `trades` table (or CSV/JSON/JSONL events) and writes a JSON scoring matrix. It uses only the Python standard library, opens the database read-only, makes no network calls, and doesn't touch the collector, the paper books or settings fingerprint `96f45eab`.

## Pre-flight

| Item | Value |
|---|---|
| Upfront time | About 1 hour to install on the VPS and validate against real tape |
| Monthly operating cost | $0 extra (runs on the existing `curvewatch-1` droplet) |
| Revenue / CAC / LTV | Not applicable. This is research infrastructure, not a product |
| Runtime | 300k trades: 3.5 s, about 375 MB RSS (measured on synthetic data) |
| Strategic rationale | Gives the Edge Lab, Runners and late-accumulation tests features with no look-ahead, plus a tape-quality audit that runs on every coin |
| Main failure points | Reserve semantics not confirmed on live data; wallets are not the same as entities (sybils); memory use on full-table runs |
| EV judgment | Worth building only as an input to registered tests. As a stand-alone signal it has no demonstrated value |

## Metrics

| Block | Key fields | How it is calculated |
|---|---|---|
| Large trades | `large_buy_share`, `ladder.ge_{0.5,1,2,5}_sol`, `curve_moving_buy_share`, `top_decile_buy_share` | Share of buy SOL from buys at or above the threshold. "Curve-moving" means the buy was at least 2% of pre-trade `vsol`, which adjusts for curve depth |
| Price impact | `buy_impact_per_sol_vw`, `sell_impact_per_sol_vw`, `depth_normalized_buy_impact`, `price_efficiency`, `kyle_lambda` | Pre-trade reserves are rebuilt from post-trade `vsol`/`vtok` and `tok` through x·y=k. Impact = p_post/p_pre − 1. VW = Σ\|impact\| / ΣSOL. Efficiency = net log price move / gross SOL. Lambda = OLS of Δlog p on net SOL flow per 60 s bucket |
| Concentration | `top1/5/10_buy_share`, `hhi_buy`, `effective_buyers`, `gini_buy`, `nakamoto_50_buy`, `top10_net_share`, `retained_token_ratio`, `roundtrip_volume_share`, `same_second_cluster_share`, `creator.*` | Calculated on buy SOL per wallet and on net token position per wallet from the tape |
| Quality | `tape_continuity`, `fee_ratio_median`, `mechanical_coverage`, `flags` | Continuity = share of consecutive trades where pre-price equals the previous post-price (within 0.5%). Missed trades break this |
| Scores | `whale_dependence`, `concentration_risk`, `flow_quality`, `structure_composite` | Means of rank percentiles within the cohort, among rankable coins only (≥20 trades, ≥5 buyers) |

Output layout: `schema_version`, `params`, `params_fingerprint`, `cohort.distributions` (p10/p50/p90), `matrix.columns` + `matrix.rows` (flat, ready for the Scores UI), and `coins[]` (full detail).

## Interpretation rules

1. Impact per SOL on the bonding curve is fully determined by curve depth (≈ 2 / vsol_pre). It tells you where on the curve a coin traded, not how strong demand was. Use it to normalize trade size and for QA. Don't add weight to it as a signal.
2. `structure_composite` describes breadth and structure. It is not an entry rule. Register it before any forward test, like the Edge Lab rules.
3. Concentration is measured per wallet. Bundled or split wallets make it look lower than it really is. `same_second_cluster_share` is only a weak proxy, because PumpPortal `ts` is receive time rounded down to the second.
4. Coins flagged `tape_discontinuous`, `reserve_inconsistent`, `feed_gap` or `low_sample` should be excluded from cohort statistics.

## Deployment blueprint (VPS `curvewatch-1`)

```bash
# 1. Copy to the server (no restart of the collector needed)
scp curvewatch_scoring.py test_curvewatch_scoring.py root@<VPS_IP>:/opt/curvewatch/analysis/

# 2. Verify Python (Ubuntu 24.04 ships 3.12) and run tests
ssh root@<VPS_IP>
cd /opt/curvewatch/analysis && python3 -m unittest -v test_curvewatch_scoring

# 3. FIRST real-data check: confirm reserves are post-trade
python3 curvewatch_scoring.py --db /opt/curvewatch/data/curvewatch.db \
  --since $(date -d '-6 hours' +%s) --compact --out /tmp/check.json
python3 -c "import json;m=json.load(open('/tmp/check.json'));print(m['cohort']['distributions'])"
python3 curvewatch_scoring.py --db /opt/curvewatch/data/curvewatch.db --since $(date -d '-6 hours' +%s) \
  | python3 -c "import json,sys,statistics as s;c=json.load(sys.stdin)['coins'];\
print('continuity',s.median([x['quality']['tape_continuity'] or 0 for x in c]),\
'fee_ratio',s.median([x['quality']['fee_ratio_median'] or 0 for x in c]))"
# Expect median continuity > 0.95 and fee ratio about 1.0–1.03.
# If continuity is near 0, PumpPortal reserves are pre-trade: stop and fix reconstruct().

# 4. Daily frozen-window job (first 60 minutes per coin, previous UTC day)
mkdir -p /opt/curvewatch/data/scores
cat >/etc/cron.d/curvewatch-scores <<'CRON'
15 0 * * * root cd /opt/curvewatch/analysis && nice -n 10 python3 curvewatch_scoring.py --db /opt/curvewatch/data/curvewatch.db --since $(date -u -d 'yesterday 00:00' +\%s) --until $(date -u -d 'today 00:00' +\%s) --window-sec 3600 --out /opt/curvewatch/data/scores/scores-$(date -u -d yesterday +\%F).json 2>>/var/log/curvewatch-scores.log
CRON
```

Environment variables: none. Dependencies: none beyond Python 3.9 or later.

Monitoring and recovery:
- Each run writes a log line to `/var/log/curvewatch-scores.log` with the coin count and fingerprint.
- Output is written atomically (`.tmp` file, then rename), so a failed run never leaves a partial file.
- Re-running for a given day is safe and produces the same result for the same params.
- Always slice runs with `--since/--until`. A single run over the full 60-day table could push the 2 GB droplet into swap and starve the collector.
- SQLite WAL readers don't block the collector's writes.

## CLI

```
--db PATH | --input PATH     source (SQLite read-only, or CSV/JSON/JSONL incl. PumpPortal field names)
--mint M (repeatable)        restrict coins
--since/--until EPOCH_S      time slice
--window-sec N               freeze features at anchor + N seconds (no look-ahead)
--anchor created_at|first_trade
--large-sol 1.0  --ladder 0.5,1,2,5  --curve-moving-pct 2.0
--min-trades 20  --min-buyers 5  --bucket-sec 60
--weights '{"breadth":0.4,"flow_quality":0.3,"whale_independence":0.3}'
--compact                    matrix only
--out PATH|-
```
