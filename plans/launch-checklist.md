# LittleJohn launch checklist

Status legend: ✅ done · ⏳ in progress · ⛔ blocked on Yuxi (human-only) · 🔨 buildable by Claude

The build side is essentially complete. Almost every open item is a human action only
Yuxi can do (accounts, keys, funds, legal). Ordered by what unblocks what.

---

## Phase 0 — Infra & anon identity
- ✅ Domain `littlejo.hn` live on Cloudflare, HTTPS, teaser deployed (strict CSP/HSTS)
- ⏳ DNSSEC: enabled Cloudflare-side; DS record submitted at Njalla, propagating to .hn registry (harmless if incomplete; verify with `dig DS littlejo.hn`)
- ⛔ Hardware-key 2FA on **Cloudflare + Njalla + project email** (the #1 anti-DNS-hijack move; see `infra/opsec-checklist.md`)
- ⛔ Clean funding pipeline: self-custody → **Monero** (never KYC-exchange → anon infra; the Binance-domain payment already leaked once — keep everything downstream clean)
- ⛔ **Anon eSIM number** — Silent.link, inbound-SMS plan, paid in XMR from a clean wallet
- ⛔ **Anon X account** — project email + eSIM number + separate browser profile/VPN. Standard or Premium (blue); NEVER verified-org (doxxing). Bio/handle/posts ready in `plans/launch-copy.md`
- ✅ Version control (contracts repo + private root repo), anon commit identity `littlejohn`

## Phase 1 — Testnet proof (Yuxi funds, Claude executes)
- ⛔ Fund a throwaway **testnet key** from the faucet (chain 46630) → drop in `contracts/.env`
- 🔨 Broadcast `DeployCore` to testnet, fill addresses in `app/src/config/contracts.ts`
- 🔨 Post-deploy sequence: create seed pools + gauges, cast first vote (else emissions revert)
- 🔨 Verify contracts on Blockscout; drive the full app flow (swap/lock/stake/vote/claim) end-to-end against real contracts
- 🔨 Run the snapshot adapter against real testnet activity (validates lp/lock computation)

## Phase 2 — Governance & security
- ⛔ Create **2-of-3 Safe** (Yuxi's 3 device-separated wallets) against the on-chain singleton `0x29fc…c762`
- 🔨 Rehearse governance handoff + `minter.acceptTeam()` on testnet against that Safe
- ⛔ **SG legal consult** (MAS DTSP applicability) — do this BEFORE the token exists, while walking away is still free
- ⛔ Decide audit path: contest audit (Cantina/Sherlock) post-LBP, or ship on the AI review

## Phase 3 — Marketing ramp (~4–6 weeks, tease → Season 0 → TGE)
- ⛔ Tease goes public (poster + one-line post) once X account exists
- ⛔ Day-2 explainer thread; begin CT engagement (NOXA graduations, CASHCAT threads)
- 🔨 **Season 0 pre-deposit + points portal** (decision: real pre-deposit vault contract, or off-chain signup + testnet/mindshare only?) — Season 0 is scored OFF-CHAIN (pre-TGE), so the snapshot adapter is for Season 1+
- ⛔ Recruit KOL council; scope Kaito Studio campaign
- ⛔ BD (parallel): router/faucet integrations (FOMO, 1inch) = #1; then 2–3 mid-tier NOXA memecoins (gauge + veNFT); stables (Paxos/Ethena) after a contest audit; Arbitrum grant (Questbook Orbit domain)

## Phase 4 — TGE (the launch)
- ⛔ Set real multisig recipients + governance in `contracts/script/config/mainnet.json`
- 🔨 Broadcast `DeployCore` to mainnet (chain 4663); roles auto-hand-off to Safe → Safe calls `acceptTeam()`
- ⛔ Seed pools with the ~$60k POL; create gauges; first vote
- ⛔ LBP for price discovery + war chest (5% supply)
- 🔨 Compute Season 0 allocations (off-chain) → `generate.js` → `openSeason` + `freezeSeason` → open claim
- Emissions begin first Thursday; milestone drops at $25/50/100M TVL

---

## Critical path right now
Two parallel unblocks, both Yuxi:
1. **eSIM (Silent.link) → X account** — starts the mindshare clock (UP competitor is deployed but unlaunched; every day is free real estate)
2. **Fund a testnet key** — lights up the entire technical validation (Phase 1), which de-risks everything downstream

Everything Claude can build without Yuxi is built. Next Claude-buildable item that isn't
blocked: the Season 0 pre-deposit/points portal (pending the vault-vs-offchain decision).
