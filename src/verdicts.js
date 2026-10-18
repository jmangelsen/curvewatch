// Research verdicts. A hypothesis is either open, rejected or supported; once closed it stays here with the evidence,
// so no surface (gate card, API, reports, bot) can present a closed question as pending. Paper books keep running
// after a rejection purely as data collection; nothing here changes what gets recorded.
export const VERDICTS = [
  {
    id: 'curve-stage-entry',
    title: 'Curve-stage entry (score ≥ alert threshold on the bonding curve)',
    status: 'rejected',
    closedAt: '2026-10-18',
    gate: 'rolling 24 h · 300 trades · mean > 0 · 95% low > −3 pts · random not positive · rule fixed ≥ 24 h first',
    evidence: 'Main book, rule 518d883a fixed since 2026-10-16 05:48 UTC: 116 closed trades, mean −14.6% per trade, 95% interval −21.6 to −7.6, win rate 41%, profit factor 0.45. Random control: 100 trades, −12.4% (−16.1 to −8.6). Main minus Random −2.2 pts (−10.2 to +5.7): the signal does not select better entries than chance. Every other book (band, confirm, hold120, timed) also negative with intervals below zero; edge lab 98 variants, 0 pass on 4,231 labeled entries.',
    conclusion: 'The upper bound of the interval is already below zero at 116 trades, so the 300-trade gate cannot pass. Losses are dominated by the round-trip cost (~10.9% audited) plus normal post-launch decay. Hypothesis rejected; no capital. Books continue as data collection only.',
    dataPreserved: 'Raw trades, snapshots, paper trades, labels and wallet history retained (retention raised, aged rows archived to DATA_DIR/archive as gzip CSV before pruning); frozen database snapshot of the test archived off the sandbox.',
  },
  {
    id: 'smart-follow',
    title: 'Hypothesis 2: follow wallets with a shrunken positive track record (Follow book)',
    status: 'open',
    openedAt: '2026-10-18',
    gate: 'anytime-valid 95% confidence sequence (hedged betting CS) on the mean after-cost return per trade of the Follow book, checked after every closed trade · KILL when the upper bound is below 0 after ≥ 20 trades · PASS when the lower bound is above +2% after ≥ 20 trades AND Follow minus Follow-control is positive with its own sequence excluding 0 · no rule change while open; a change restarts the sequence',
    evidence: 'Preserved data (Oct 13–18): launch features predict graduation with AUC 0.95–0.99 out of time, yet the top decile returns −9 to −18% at 1 h even with take-profit/stop exits (price already reflects it). Graduates after ramp/honeypot removal and censoring repair lose 5–37% over 6 h in every age and liquidity band. Positions of wallets ranked on prior days returned +11.4% (95% CI +2.5 to +20.1, 213 positions, 150 tokens) on the one clean walk-forward day versus +7.8% for all positions: the only positive conditional mean found, on thin data.',
    conclusion: 'Open. Expected value is uncertain and the prior is weak (one day of walk-forward evidence, before cost). The design exists to settle it fast: a losing book is killed by the sequence typically inside 100–150 trades.',
    dataPreserved: 'Same retention and archive policy as hypothesis 1.',
  },
];
export const verdictFor = (id) => VERDICTS.find((v) => v.id === id) || null;
export const openVerdicts = () => VERDICTS.filter((v) => v.status === 'open');
