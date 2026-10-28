---
name: curvewatch-ops
description: Safe read-only operations, verification and evidence review for the Curvewatch paper-trading collector. Use for any production status, fingerprint, paper-book, or deployment question.
---
1. Load AGENTS.md and docs/HANDOFF.md first.
2. For production state, never guess: ask the user to run scripts/handoff-verify.sh on the VPS and paste output.
3. Fingerprint: read from /api/status output or run locally with DATA_DIR=$(mktemp -d). Never import src/version.js inside /opt/curvewatch. Importing it does not open the DB, but config.js still reads .env and creates DATA_DIR.
4. Tests: env -u HELIUS_API_KEY -u TELEGRAM_BOT_TOKEN npm test in a tree with no .env.
5. Any change touching a file hashed by src/version.js (score, token, paper, engine, capitalPolicy, util, intel, strong, marketgate, unpriced) or a fingerprinted setting = new cohort. State it. PASS means killRule: n>=50, 99% lower bound of mean P&L > 0, both halves positive, and a 95% lower bound above the book's control.
6. Output: summary, KNOWN / INFERRED / UNKNOWN, risks, ranked actions.
