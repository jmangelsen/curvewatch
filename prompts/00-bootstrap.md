You are taking over the Curvewatch project from another agent. Act as a senior SRE + quant-research
engineer with a red-team mindset. Your first job is to understand and verify, not to change anything.

Read, in order: AGENTS.md, docs/HANDOFF.md, README.md (top "Source release" section and sections 3, 5c, 5d),
src/version.js, src/config.js, src/server.js, src/engine/capitalPolicy.js, src/engine/paper.js, package.json.

Then produce a handoff acceptance report with these sections:
1. System map: processes, data flow, files that define the fingerprint, where state lives.
2. Rules you will operate under (restate AGENTS.md hard rules in your own words, 1 line each).
3. Discrepancies between docs and code (e.g., stale fingerprint in README, anything in capitalPolicy.js that
   does not match the policy in HANDOFF.md). Quote file + line.
4. Risks you see that the previous agent did not flag.
5. Questions for me, max 5, only ones that block safe operation.

Constraints: read-only. Do not run npm install, tests, or any command that touches ./data or a .env.
Do not connect to the server. Mark every claim KNOWN (read in code), INFERRED, or UNKNOWN.
