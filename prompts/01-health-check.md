Task: read-only production health check of Curvewatch.

I will run `scripts/handoff-verify.sh` on the VPS and paste the output below. Do not ask me for secrets.
From the output, report:
- Service state (curvewatch, caddy), /health result, feed health, restarts or OOM kills in the last 24 h.
- Fingerprint reported by /api/status. Source default after the handoff fixes is 52746d10. Production stays 4033fed1 until the approved restart. Flag a third value. Do not pool cohorts.
- Capital book: closed trades, open positions, paired comparison count and current paired mean + interval.
  State plainly whether the interval includes zero.
- Holder collection: enabled, error count, mints counted.
- Any stop setting above 47% anywhere = critical finding.
- Coverage/gap flags that would censor evidence.
Format: a 5-line status summary first, then KNOWN / INFERRED / UNKNOWN, then recommended actions ranked by
downside protection. Do not recommend restarts unless the service is actually unhealthy.

<paste output here>
