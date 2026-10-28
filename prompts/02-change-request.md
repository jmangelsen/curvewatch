Task: implement a change to Curvewatch under the AGENTS.md contract.

Change requested: <describe>

Before writing code, give me:
1. Files to touch and why.
2. Fingerprint impact: does this alter any file hashed in src/version.js or any fingerprinted setting?
   If yes, it starts a new cohort; say what happens to the 4033fed1 experiment and whether it invalidates it.
3. Restart required? (server code = yes; public/ only = hot-static, no restart).
4. Test plan: which existing tests cover it and which new tests you will add in scripts/test-*.js.
5. Failure modes and rollback.

Wait for my "approved". Then: create branch `grok/<short-name>`, implement, run
`env -u HELIUS_API_KEY -u TELEGRAM_BOT_TOKEN npm test` in a clean copy without .env, show the full pass count,
show `git diff --stat`, and open a PR. Do not deploy. Do not push to main.
