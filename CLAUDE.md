# LittleJohn ($JOHN) — ve(3,3) DEX on Robinhood Chain

Solidly-style ve(3,3) DEX. Fork of **Velodrome V1** (`velodrome-finance/v1` @ `de6b2a19`, MIT/GPL — deliberately NOT Aerodrome/Velodrome V2, which is BUSL-1.1 until 2027-01-01). Strategy/tokenomics/GTM: `plans/initial-spec.md`. Deployment: `contracts/DEPLOY.md`.

## Layout

- `contracts/` — the fork (git repo, branch `littlejohn`; `master` = pristine upstream for diffing)
- `aerodrome-reference/` — Aerodrome V2 clone, REFERENCE ONLY: BUSL until 2027-01-01, never copy BUSL files into contracts/
- `plans/` — specs

## Verification (run before claiming any change done)

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts && forge build && forge test   # must be 58/58 (or more) green
git diff master --stat                       # diff vs upstream must stay minimal + explainable
```

## Hard rules

1. **Zero logic changes to core contracts** (Pool/Pair, Router, VotingEscrow, Voter, Minter, gauges, bribes). Allowed diffs: brand strings, deploy params, tests, tooling. Anything new (Heists points, claims) = separate isolated contracts that cannot touch pool funds.
2. **The diff vs `master` is a public artifact** (transparency page) — keep every commit explainable to a hostile reader.
3. lib/ deps are plain clones, not submodules (upstream's gitlinks were never committed) — `.gitignore`d; re-clone per DEPLOY.md if missing: ds-test, forge-std, solmate, openzeppelin-contracts@v4.7.3, LayerZero.

## Lessons

- Don't trust WebFetch summaries of licenses — the README said "MIT/GPL" but the LICENSE file was BUSL-1.1 with an ENS-recorded change date (2027-01-01). Always read LICENSE files from the actual repo before declaring something forkable.
- zsh eats words starting with `=` (e.g. `echo ====X====` fails) — quote them.
- A Merkle distributor is only as trustworthy as its owner key: "no liquid withdraw" ≠ "un-ruggable", because the owner writes the roots and can self-allocate. Never market lock-only contracts as un-ruggable; the honest claim is multisig-governed + frozen roots + min-lock. (audit 2026-07-12)
- Never `git add -A` in contracts/ — it stages the untracked `lib/` deps as embedded gitlinks. Add explicit paths. `.gitignore` now has `lib/` (was silently merged into a prior line).
