// One place for every disclosure Curvewatch shows. The dashboard footer, the drill-down, Telegram footers, the report
// and the API notice all read from here, so the wording cannot drift between surfaces.
//
// Why this exists (Model Council, Oct 15 2026): Curvewatch's own data shows every paper book losing money after costs.
// Any surface that could be read as "here is what to buy" has to say, in the same breath, that the numbers are simulated,
// that no trade is executed or recommended, and what the simulation leaves out. The hypothetical-performance wording
// follows the substance of CFTC Rule 4.41(b) because it is the clearest standard for simulated results; Curvewatch is not
// registered with and does not claim any status under the CFTC or SEC.

export const SHORT = 'Research tool. All P&L is simulated. Not investment advice. Nothing here is a recommendation to buy or sell any token.';

export const TELEGRAM_FOOTER = 'Research signal from a simulated screener, not advice. Paper results after modeled costs; real fills differ. Memecoins can go to zero.';

export const API_NOTICE = 'Simulated (paper) results from a research screener. No trades are executed, recommended or solicited. Hypothetical results have inherent limitations and do not represent actual trading. Not investment advice.';

export const SECTIONS = [
  { h: 'What Curvewatch is', p: 'A research tool that records every Pump.fun launch and graduation, scores them against public on-chain data, and simulates what fixed rules would have earned. It is published for study of the market, not for trading on. It does not execute trades, hold funds or keys, or take orders.' },
  { h: 'Hypothetical performance', p: 'Every P&L figure, win rate, expectancy, kill-rule status and Edge Lab result is simulated. No actual trades were placed. Simulated results have inherent limitations: they are prepared with the benefit of hindsight, they do not involve financial risk, and no simulated record can account for the effect of real risk on a trader\'s decisions. Fills are modeled from pool depth, a fixed fee and a slippage allowance; real fills, latency, failed transactions and MEV will differ, usually for the worse. No representation is made that any account will or is likely to achieve results similar to those shown.' },
  { h: 'What the record shows', p: 'As of October 2026 every paper book on this machine has a negative average return per trade after modeled costs, and no strategy has passed the Edge Lab\'s pre-registered bar. Curvewatch publishes that result deliberately. If a figure here ever turns positive, the selection-bias note on the Edge Lab tab applies: many rules are scored on the same history, and the best of them is flattered by chance.' },
  { h: 'Not advice', p: 'Nothing on this dashboard, in its exports, API, Telegram messages or reports is investment, financial, legal or tax advice, or a recommendation, offer or solicitation to buy, sell or hold any token. The content is impersonal and is not tailored to anyone\'s situation. Curvewatch and its operator have no fiduciary or advisory relationship with any reader.' },
  { h: 'Risk', p: 'Pump.fun tokens are extremely speculative. Most lose nearly all of their value; many are abandoned or manipulated by their creators within minutes of launch. Anyone who trades them can lose the entire amount. Published trader data shows the median Pump.fun trader\'s realized profit is zero.' },
  { h: 'Data and errors', p: 'Data comes from public Solana program logs, PumpPortal and DEX Screener, and from this machine\'s own labels. Feeds drop, decoders lag protocol upgrades, and labels are revised; the Health tab shows known gaps. Everything is provided as is, with no warranty of accuracy or completeness. Market caps for tokens quoted in assets other than SOL are not computed.' },
  { h: 'Compensation and conflicts', p: 'Curvewatch receives no compensation from any trading venue, token, wallet or project shown here, carries no referral links, and its operator does not trade the tokens it flags ahead of publication. If any of that changes it will be disclosed on this page first.' },
];

/** Simulation parameters in force, for the disclosures drill, the report API and the Markdown export. */
export function simulationParams(config) {
  const GP = config.gradPaper, PP = config.paper;
  return [
    { k: 'Curve paper books', v: `${PP.sizeSol} SOL per signal · entry ${PP.entryDelaySec}s after the signal at the curve price · +${PP.extraSlippagePct}% slippage · exits filled ${PP.exitDelaySec}s after they trigger · stop −${PP.stopPct}%` },
    { k: 'Graduates paper books', v: `${GP.sizeSol} SOL per alert · entry at the next poll price plus pool price impact · ${GP.feePct}% fee each side · +${GP.extraSlippagePct}% slippage · stop −${GP.stopPct}%` },
    { k: 'Not modeled', v: 'Failed or dropped transactions, priority fees, MEV and sandwiching, the effect of your own order on other traders, exchange or wallet outages' },
    { k: 'Edge Lab pass bar', v: 'Pre-registered rule, judged only on tokens that arrive after registration, 300 tokens minimum, lower confidence bound above zero, both halves positive, beats the random control' },
    { k: 'Backtests and replays', v: 'Marked as context, never as a pass. Selection lift from testing many variants on one history is printed next to them' },
    { k: 'Data sources', v: "Solana program logs (RPC websocket), PumpPortal, DEX Screener pairs API; labels are this machine's own" },
  ];
}

/** Markdown block appended to exported reports. */
export function markdownBlock(config) {
  return ['## Disclosures', '', `**${API_NOTICE}**`, '', ...SECTIONS.map((s) => `**${s.h}.** ${s.p}`), '', '### Simulation parameters in force', '', '| Setting | Value |', '|---|---|',
    ...simulationParams(config).map((r) => `| ${r.k} | ${r.v} |`)].join('\n');
}

/** Telegram: short block for the daily summary, full text for the weekly message (HTML, under the 4096-char limit). */
export const TELEGRAM_DAILY_BLOCK = `<i>${SHORT} Simulated results have inherent limitations and do not represent actual trading; real fills, latency and failed transactions make them worse. Pump.fun tokens can lose their entire value.</i>`;
export function telegramFullText(esc) {
  return [`<b>Curvewatch disclosures</b> (sent weekly; also at /api/disclosures and in the dashboard footer)`, '', ...SECTIONS.map((s) => `<b>${esc(s.h)}.</b> ${esc(s.p)}`)].join('\n');
}

export function reportText() {
  return [SHORT, '', ...SECTIONS.map((s) => `${s.h}. ${s.p}`)].join('\n');
}
