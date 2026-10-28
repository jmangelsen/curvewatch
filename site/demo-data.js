// Fictional payload for demo mode. Addresses are deliberately not Solana
// base58. Totals: slot wallets A–F still hold 228,000,000 of 1,000,000,000
// (22.8%). Bundle SOL 18.4 / buy SOL 25.84 = 71.2%. Shared-funder rows are
// excluded from those totals.
window.CURVEWATCH_DEMO = {
  contract: "risk.v1",
  mode: "demo",
  illustrative: true,
  mint: "EXAMPLE-NOT-A-MINT",
  observedAt: "2026-10-28T00:00:00.000Z",
  token: {
    name: "Example Only",
    symbol: "DEMO",
    creator: "EXAMPLE-CREATOR-NOT-A-WALLET",
    createdAt: "2026-10-28T00:00:00.000Z",
    ageSec: 186,
    quoteOk: true,
    mcapSol: 42.5,
    mcapUsd: 6200,
    solUsd: 146,
    progressPct: 18.4,
    peakMcapSol: 44.1,
    graduated: false,
    lite: false
  },
  coverage: {
    tradeCount: 86,
    truncated: false,
    slotData: true,
    method: "create-slot-plus-one",
    detail: "full",
    limits: [
      "Holder balances in this schema are reconstructed from bonding-curve trades. Wallet-to-wallet token transfers are invisible, so supply credited to a buyer can be understated after a fan-out.",
      "The collector does not read who funded a wallet. The shared-funder block below is reserved.",
      "Trade-level detail is released after the active window (default 900 seconds). A released mint should return detail \"released\" and null bundle totals.",
      "Every figure in this particular payload is invented for the layout."
    ]
  },
  rules: {
    bundleBuyVolumePct: 55,
    minBundleWallets: 3,
    partialBundleBuyVolumePct: 25
  },
  bundle: {
    definition: "Non-creator buys in the create slot and the next slot. Invented trades, for the example only.",
    walletCount: 6,
    solBought: 18.4,
    buyVolSol: 25.84,
    buyVolumeSharePct: 71.2,
    supplyHeldPct: 22.8,
    hardReject: true,
    partialFlag: true
  },
  clusters: [
    {
      id: "slot-0",
      kind: "same-slot",
      measured: true,
      label: "Create slot",
      slotOffset: 0,
      walletCount: 4,
      solBought: 14.2,
      supplyHeldPct: 17.1,
      note: "Fictional wallets. Same-slot is the grouping the collector actually implements.",
      wallets: [
        { address: "EXAMPLE-WALLET-A-NOT-REAL", solBought: 6.2, tokensBought: 64000000, stillHeldTokens: 64000000, supplyHeldPct: 6.4, firstBuyOffsetMs: 120, slotOffset: 0, funder: null },
        { address: "EXAMPLE-WALLET-B-NOT-REAL", solBought: 4.1, tokensBought: 48000000, stillHeldTokens: 48000000, supplyHeldPct: 4.8, firstBuyOffsetMs: 180, slotOffset: 0, funder: null },
        { address: "EXAMPLE-WALLET-C-NOT-REAL", solBought: 2.4, tokensBought: 35000000, stillHeldTokens: 35000000, supplyHeldPct: 3.5, firstBuyOffsetMs: 240, slotOffset: 0, funder: null },
        { address: "EXAMPLE-WALLET-D-NOT-REAL", solBought: 1.5, tokensBought: 30000000, stillHeldTokens: 24000000, supplyHeldPct: 2.4, firstBuyOffsetMs: 310, slotOffset: 0, funder: null }
      ]
    },
    {
      id: "slot-1",
      kind: "same-slot",
      measured: true,
      label: "Next slot",
      slotOffset: 1,
      walletCount: 2,
      solBought: 4.2,
      supplyHeldPct: 5.7,
      note: "The detector's window is the create slot plus one. This second slot is part of that window.",
      wallets: [
        { address: "EXAMPLE-WALLET-E-NOT-REAL", solBought: 2.6, tokensBought: 34000000, stillHeldTokens: 34000000, supplyHeldPct: 3.4, firstBuyOffsetMs: 480, slotOffset: 1, funder: null },
        { address: "EXAMPLE-WALLET-F-NOT-REAL", solBought: 1.6, tokensBought: 23000000, stillHeldTokens: 23000000, supplyHeldPct: 2.3, firstBuyOffsetMs: 510, slotOffset: 1, funder: null }
      ]
    },
    {
      id: "shared-funders",
      kind: "shared-funder",
      measured: false,
      label: "Shared funders",
      slotOffset: null,
      walletCount: 2,
      solBought: null,
      supplyHeldPct: null,
      note: "Not a detection. The engine has no funding-parent field. These two rows exist so the column has a shape. They are excluded from the totals above.",
      wallets: [
        { address: "EXAMPLE-WALLET-G-NOT-REAL", solBought: null, tokensBought: null, stillHeldTokens: null, supplyHeldPct: null, firstBuyOffsetMs: null, slotOffset: null, funder: "EXAMPLE-FUNDER-NOT-REAL" },
        { address: "EXAMPLE-WALLET-H-NOT-REAL", solBought: null, tokensBought: null, stillHeldTokens: null, supplyHeldPct: null, firstBuyOffsetMs: null, slotOffset: null, funder: "EXAMPLE-FUNDER-NOT-REAL" }
      ]
    }
  ],
  signals: {
    sameSlot: {
      status: "measured",
      summary: "Non-creator buys in the create slot and the next slot. This is the detector in Token.features()."
    },
    sharedFunders: {
      status: "not-collected",
      summary: "No funding-parent read exists. A shared funder cannot be reported as found."
    },
    coordinatedTiming: {
      status: "measured-as-slot-window",
      summary: "Timing is that same slot window. If the create slot is missing, the fallback is buys within 1500 ms of the recorded create time. There is no second timing model."
    }
  },
  rugZone: {
    status: "illustrative",
    method: null,
    mcapSol: { low: null, high: null },
    mcapUsd: { low: 125000, high: 190000 },
    confidence: null,
    confidenceNote: "Unvalidated. This example does not invent a confidence score. No dump-zone model has been backtested or tracked prospectively.",
    assumptions: [
      "The dollar band is a pair of round placeholders.",
      "It was not walked off a bonding curve.",
      "It is not a probability that the example wallets sell."
    ]
  },
  disclaimer: "Risk signal only. A bundle reading is not a guarantee that anyone will sell, and the absence of a reading is not a clearance. Not financial advice."
};
