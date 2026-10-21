# Source release security review

## Scope and results

The release was reviewed with Gitleaks 8.30.1 across all reachable Git history and the complete staged source tree. The staged-tree scan returned no findings. History contained one reviewed false positive: commit `54acc352d75af001cef986027893c48d63c23f24`, `.env.example`, line 185, has an empty `HELIUS_API_KEY=` assignment followed by `HOLDERS_TICK_MS=120000`; the multiline generic-key rule treated the next configuration line as the key. The precise finding is recorded in `.gitleaksignore`, not a blanket file/rule exception.

No actual API key, credential-bearing RPC URL, wallet private key, or database credential was identified in the scanned source/history. This is a scanner-plus-review result, not a guarantee that any scanner can detect every possible secret.

The example environment file deliberately contains names only, with blank values. `npm run env:check` checks its inventory. Live `.env` files, database/WAL files, dependencies, backups, SSH files and private-key files are not part of the release. Public chain addresses, mint identifiers, provider hostnames and example endpoint URLs are not authentication credentials.

## Repeat the checks

```bash
npm run env:check
gitleaks git . --log-opts="--all" --redact=100 --gitleaks-ignore-path .gitleaksignore
# To inspect the tracked current tree without local runtime data:
mkdir -p /tmp/curvewatch-source-scan
git archive HEAD | tar -xf - -C /tmp/curvewatch-source-scan
gitleaks dir /tmp/curvewatch-source-scan --redact=100
```

Keep scan reports redacted and outside the repository. A Git push must not deploy or restart the live collector. Secure credentials must be installed locally on the intended host, never committed.
