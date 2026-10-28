# Curvewatch public site

Static landing page for [Curvewatch](https://github.com/jmangelsen/curvewatch). It describes the research collector and offers a mint lookup for launch-bundle risk.

Curvewatch is a paper-only Pump.fun launch monitor, trade collector, and paper-strategy dashboard (Node.js 20, Express, SQLite). It holds no wallet keys and places no trades. This folder does not connect to a collector. It does not add `GET /api/risk/:mint` to the Express app. With no API configured, the lookup stays in **demo mode** and renders a fictional example.

Do not put a private dashboard URL, a server address, a password, or any other secret in `config.js`. That file is public.

## Preview locally

From the repository root:

```bash
cd site
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/`. Use a local server so the fonts load. Opening `index.html` as a file still shows the page and the fictional panel, because the example payload is in `demo-data.js` and no network call is required for demo mode.

What you should see:

- A banner that says demo mode, and the mint `EXAMPLE-NOT-A-MINT`.
- Wallet addresses that contain `EXAMPLE-` and `NOT-REAL`.
- Supply still credited `22.8%`, buy-volume share `71.2%`.
- A shared-funder block marked **Not a detection**.
- A rug-zone band of $125,000–$190,000 with confidence **unvalidated**.

Pasting a real-looking mint in demo mode does not send a request. The status line says so, and the panel stays fictional.

## Demo mode and live mode

`config.js` sets `window.CURVEWATCH_RISK_API`.

| Value | Behavior |
|---|---|
| `""` (default) | Demo mode. The panel is `demo-data.js`. |
| `https://risk.example.com` | Live mode. **Check mint** fetches `GET {prefix}/api/risk/{mint}` with `credentials: "omit"`. |
| A URL with a user, password, query, or hash | Ignored. Demo mode stays on, and the page says the setting was ignored. |

The prefix may include a path (`https://example.com/risk-api` → `GET https://example.com/risk-api/api/risk/{mint}`). The mint is either a base58 string of 32–44 characters or a `pump.fun`, DexScreener, or Solscan token link. The browser extracts the mint and does not navigate away.

The **Show the fictional example** button always returns to the demo payload and does not call the API.

A live service must send `Access-Control-Allow-Origin` for the site's origin (or `*` for this unauthenticated GET) and `Content-Type: application/json`. Send `Cache-Control: no-store`. Do not require cookies.

## `GET /api/risk/:mint`

Contract name: `risk.v1`. This route is a specification for a later change. It is not implemented under `src/`.

### What the collector already computes

From `Token.features()` in `src/engine/token.js`:

- **Same-slot buys.** Non-creator buys in the create slot and the next slot. If `createSlot` is missing, buys within 1500 ms of the recorded create time. The code sums SOL and counts wallets. It does not currently return the wallet list, though the set exists while the method runs.
- **`bundlePct`.** That SOL divided by all buy volume on the in-memory tape, in percent. This is the figure the scorer uses. It is not a share of supply.
- **`bundleWallets`.** The count of those wallets.
- **Hard reject** (`src/engine/score.js`). `bundlePct >= maxBundlePct` (default 55) and `bundleWallets >= 3`.
- **Partial bundle.** `bundlePct >= 25`, a score penalty, not a hard reject by itself.
- Defaults live in `src/config.js` (`MAX_BUNDLE_PCT`, and the partial threshold is the literal `25` in `score.js`). A live response must echo the thresholds it actually applied in `rules`.

Supply on the tape is available in memory as `holders` (wallet → tokens from curve trades) and `CURVE.TOTAL_SUPPLY` (`1_000_000_000`). `features()` does not emit the bundle wallets' share. After `toLite()` (default active window 900 seconds) the trade list and holder map are cleared, so a later read cannot reconstruct them.

The collector does **not** store a funding parent. It does **not** estimate a market cap at which bundle wallets sell. Wallet-to-wallet SPL transfers are invisible, so a balance reconstructed from curve trades can understate concentration after a fan-out (see the known limitations in the repository README).

### What `risk.v1` adds

The response gives the panel three clusters of information:

1. **Same-slot (or 1.5 s) wallets**, split by slot offset when slots exist, with SOL bought and supply still credited. `measured: true`. These totals are the only ones included in `bundle`.
2. **Shared funders.** Until a funding-parent read exists, return `measured: false`, empty wallets, null totals, and a note. Do not invent funders.
3. **Coordinated timing.** Report it in `signals.coordinatedTiming` as `measured-as-slot-window`. There is no second timing model. The 1500 ms path uses `coverage.method = "time-fallback-1500ms"` and cluster `kind: "time-window"`.
4. **Rug zone.** For a real collector today, `status` is `unavailable` and every number is null. `illustrative` is reserved for this static demo. `unvalidated` is for a later estimator that has a number and does not yet have a prospective pass. `confidence` stays null until a pre-registered test defines the scale. Null is unknown, and unknown is not a clearance.

`mode` on a real response is `"live"`. `"demo"` and `illustrative: true` are for the static example only.

### Success body

`200` `application/json`. A full live-shaped example is `risk-v1.example.json` in this folder. The fictional demo object is `CURVEWATCH_DEMO` in `demo-data.js`. Field reference:

| Field | Meaning |
|---|---|
| `contract` | Always `"risk.v1"`. |
| `mode` | `"live"` or `"demo"`. |
| `illustrative` | `true` only for the fictional example. |
| `mint` | The mint that was read. |
| `observedAt` | ISO-8601 time of the reading. |
| `token.name`, `token.symbol`, `token.creator` | From the create event, when known. |
| `token.createdAt` | ISO-8601 create time. |
| `token.ageSec` | Age at `observedAt`. |
| `token.quoteOk` | `false` for a non-SOL quote. SOL market cap is then not meaningful. |
| `token.mcapSol`, `token.peakMcapSol` | Bonding-curve market cap in SOL (`price × 1e9`). |
| `token.mcapUsd`, `token.solUsd` | Optional. Null when no SOL/USD print is available. |
| `token.progressPct` | Curve progress, 0–100. |
| `token.graduated` | Migrated off the curve. |
| `token.lite` | Trade detail has been released. |
| `coverage.tradeCount` | Trades still held in memory. |
| `coverage.truncated` | Hit the per-mint trade cap (default 4000). |
| `coverage.slotData` | Create slot was known. |
| `coverage.method` | `"create-slot-plus-one"`, `"time-fallback-1500ms"`, or `"unavailable"`. |
| `coverage.detail` | `"full"` or `"released"`. |
| `coverage.limits` | Short strings the panel prints. Include the transfer blind spot and the missing funder read. |
| `rules.bundleBuyVolumePct` | Hard-reject share. Default 55. |
| `rules.minBundleWallets` | Hard-reject wallet count. Default 3. |
| `rules.partialBundleBuyVolumePct` | Partial-bundle penalty. Default 25. |
| `bundle.definition` | One sentence naming the window that was applied. |
| `bundle.walletCount` | Measured bundle wallets. |
| `bundle.solBought` | SOL those wallets bought inside the window. |
| `bundle.buyVolSol` | All buy SOL on the tape, the denominator of the share. |
| `bundle.buyVolumeSharePct` | `bundlePct`. |
| `bundle.supplyHeldPct` | Sum of `holders` for those wallets, divided by `1_000_000_000`, times 100. Null when detail is released. |
| `bundle.hardReject`, `bundle.partialFlag` | Booleans from the rules above. A false reject is not a clearance. |
| `clusters[]` | See below. |
| `signals.sameSlot` | `{ status: "measured", summary }`. |
| `signals.sharedFunders` | `{ status: "not-collected", summary }` until a real read exists. |
| `signals.coordinatedTiming` | `{ status: "measured-as-slot-window", summary }`. |
| `rugZone.status` | `"unavailable"`, `"unvalidated"`, or `"illustrative"`. |
| `rugZone.method` | Null until a named, pre-registered estimator exists. |
| `rugZone.mcapSol`, `rugZone.mcapUsd` | `{ low, high }` or nulls. |
| `rugZone.confidence` | Null, or a number whose scale a published test has defined. |
| `rugZone.confidenceNote` | Shown under the score. Say what the number is not. |
| `rugZone.assumptions` | Strings. Empty when there is no estimator. |
| `disclaimer` | Risk signal, not a guarantee, not financial advice. |

Cluster object:

| Field | Meaning |
|---|---|
| `id` | Stable within the response. |
| `kind` | `"same-slot"`, `"time-window"`, `"shared-funder"`, or `"coordinated-timing"`. |
| `measured` | `false` means the rows are not detections and must not be included in `bundle` totals. |
| `label` | Short heading. |
| `slotOffset` | `0` create slot, `1` next slot, or null. |
| `walletCount`, `solBought`, `supplyHeldPct` | Cluster subtotals. Null when not measured. |
| `note` | One limitation sentence. |
| `wallets[]` | See below. Cap what you need; the page shows at most 40 wallets and 12 clusters. |

Wallet object: `address`, `solBought`, `tokensBought`, `stillHeldTokens`, `supplyHeldPct`, `firstBuyOffsetMs` (from the recorded create time), `slotOffset`, `funder` (null today).

Supply math for a future implementation, using only state `features()` already walks:

```text
supplyHeldPct = 100 * sum(holders.get(wallet) for wallet in bundleWallets) / 1_000_000_000
```

Wallets the creator sold from are not part of `bundleWallets` (the detector skips `t.w === creator`). Do not add shared-funder rows into this sum.

### Errors

JSON, with `contract: "risk.v1"`.

| Status | `error` | When |
|---|---|---|
| 400 | `invalid_mint` | The path is not a 32–44 character base58 mint. |
| 404 | `not_seen` | This collector has no tape for that mint. |
| 503 | `unavailable` | The process cannot read its database. |

Include `message` as a single plain sentence. The page prints `message` and does not treat a failure as a reading about the mint. A mint whose detail has been released is still `200`, with `coverage.detail = "released"`, `token.lite = true`, and null bundle totals.

### Example

Live-shaped (empty rug zone, empty funders): `site/risk-v1.example.json`.

Fictional demo (round rug-zone dollars, example funder rows flagged unmeasured): `site/demo-data.js`.

```json
{
  "contract": "risk.v1",
  "mode": "live",
  "illustrative": false,
  "mint": "<base58 mint>",
  "rugZone": {
    "status": "unavailable",
    "method": null,
    "mcapSol": { "low": null, "high": null },
    "mcapUsd": { "low": null, "high": null },
    "confidence": null,
    "confidenceNote": "No estimator is implemented. Empty means unknown, and unknown is not a clearance.",
    "assumptions": []
  }
}
```

The rest of the fields are in the table above and in the example file.

## Deploy to Vercel

This site has no build. The repository root is a Node collector. Point Vercel at `site/` only, so it does not try to install or run the collector.

1. Import `https://github.com/jmangelsen/curvewatch`.
2. Set **Root Directory** to `site`.
3. Framework preset: **Other**.
4. Build command: empty. Output directory: empty (the root of `site/`).
5. Deploy.

`site/vercel.json` sets `X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options`. Leave `config.js` empty unless you are deliberately calling a public `risk.v1` host. Do not set the production collector's private URL.

## Deploy to GitHub Pages

GitHub Pages serves a branch root or `/docs`, not an arbitrary folder, unless an Actions workflow uploads the folder.

One workflow you can add later (it is not committed here):

```yaml
name: pages
on:
  push:
    branches: [main]
    paths: [site/**]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@v4
```

In the repository settings, set Pages to **GitHub Actions**. The published site is static files from `site/`. It still does not expose the collector.

## Fonts

Latin subsets of Inter and JetBrains Mono are in `fonts/`. Licenses: `fonts/OFL-Inter.txt` and `fonts/OFL-JetBrainsMono.txt` (SIL Open Font License 1.1).
