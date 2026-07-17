# LittleJohn — ve(3,3) DEX on Robinhood Chain

_Name: **LittleJohn**, ticker **$JOHN** (settled 2026-07-11; $LJ rejected — $JOHN is memeable and reads as a person, fitting the chain's meme meta). Robin Hood's strongest lieutenant = the chain's native liquidity layer. A prior "Little John" (littlejohn.fi, Solana on-chain broker) is abandoned — expired SSL, no socials, no token, no DefiLlama listing; do a trademark-registry check before TGE. They squat littlejohn.fi. **Domain decision (2026-07-12): register littlejo.hn via name.com.**
- Why name.com: .hn registry runs NO privacy proxy, so public-whois anonymity depends on the registrar stamping "Redacted." Most .hn sellers (101domain, Marcaria, Gandi, Netim) do NOT redact — Netim is even worse, "partial" leaves name+email public. Namecheap redacts but doesn't sell .hn. name.com is Tucows-family; Tucows' EPAG arm was verified redacting .hn on the wire (shop.hn returns blank registrant). Reputable, ~US$70–90/yr, free whois privacy on supported TLDs.
- **At checkout**: enable privacy, then `whois littlejo.hn` to confirm "Redacted" before any public post. Even redacted, country/org may still show (registry limitation) — set those to neutral values.
- Backup: littlejohn.trading (available via RDAP 2026-07-11, ~US$25/yr) or littlejohn.xyz (free privacy anywhere).
- Considered & rejected: **john.ag** (registry auto-redacts by default — the reason jup.ag/meteora.ag show REDACTED — strictly better anonymity + cheaper; Yuxi chose the littlejo.hn domain-hack anyway). lj.fi taken (exp 2027-05).
- X handle still needed._

**Thesis:** Every winning new chain grew a native incentive DEX that out-competed the vanilla Uniswap deployment via emissions + bribes (Velodrome→Optimism, Aerodrome→Base, Shadow→Sonic). Robinhood Chain (mainnet 2026-07-03) has Uniswap V3, Rialto, Arcus — but **no native ve(3,3)**. Meanwhile the chain is in a memecoin frenzy (~$563M daily DEX volume, 141k new wallets/day, NOXA launchpad graduating tokens to Uniswap V3) and stock tokens (plain ERC-20s, ERC-8056 `uiMultiplier` for corporate actions) need deep stable pairs. That's exactly the fee/bribe flywheel ve(3,3) monetizes.

**Fork base (PIVOTED 2026-07-11 during implementation):** ~~Aerodrome~~ → **Velodrome V1** (`velodrome-finance/v1`, MIT/GPL-3.0). Reading the actual LICENSE file revealed Aerodrome/Velodrome-V2's ve(3,3) core (VotingEscrow, Voter, Minter, gauges — 31 files) is **BUSL-1.1 until 2027-01-01** (change date at v2-license-date.velodrome.eth); only its AMM core is GPL. Not legally usable for an Aug TGE, and open violation would hand the now-cross-chain Aero team a C&D. Velodrome V1 is the same ve(3,3) design, ran Optimism at nine-figure TVL for 18+ months, ships with audits, and is what Thena/Equalizer-era forks legally used. Accepted deltas vs V2: no permanent locks (4y re-lockable max), no managed veNFTs. Baseline forked, building green, 58/58 tests, brand diff applied — see `contracts/DEPLOY.md`. Option: ask Velodrome for a V2 use grant post-launch, or upgrade after 2027-01-01.

---

## 1. Core mechanics (inherited from Aerodrome)

- $JOHN emitted weekly to liquidity gauges, pro-rata to veJOHN votes.
- Lock JOHN 1 week – 4 years → veJOHN (veNFT). Voters receive **100% of trading fees + bribes** from pools they vote for.
- Weekly epochs (Thursday 00:00 UTC). Anti-dilution rebase to lockers.
- Bribe marketplace: token issuers (memecoins, stablecoin issuers, stock-token LP programs) pay to attract emissions to their pool.

Chain-specific work:
- Stock-token pools: `balanceOf()` is fixed (multiplier pattern, not rebasing) so standard AMM math holds — but routers/UI must read `uiMultiplier()` for display, and gauges must handle multiplier-change events (splits) gracefully.
- Day-one strategic pairs: ETH/USDG, JOHN/USDG, CASHCAT/ETH, NVDAx/USDG, TSLAx/USDG, **USDG/USDe** (the flagship stable pair).
- **Stable-pair finding (on-chain, 2026-07-14):** only USDG (~$220M) and USDe (~$102M) are real, deep stables on the chain; USDC/USDT have NO canonical liquid deployment (all fakes/dust). So the stable pair is USDG/USDe, and Paxos (USDG) + Ethena (USDe) are both the pair partners AND the stable-BD targets — one play. Source USDG via Kraken's free 1:1 USDC↔USDG. Canonical: USDG `0x5fc5…`(6dp), USDe `0x5d3a…`(18dp).

## 2. Tokenomics

**Genesis supply: 500M JOHN** (emissions minted on top, weekly, decaying ~1%/epoch after a 10-epoch ramp; tune vs. Aerodrome's schedule at fork time).

| Bucket | % | Notes |
|---|---|---|
| Season airdrops ("Heists") | 40% | Effort-mined by users + KOLs, 4 seasonal drops over ~12 months, paid as **locked veJOHN** |
| Ecosystem partner veNFT grants | 20% | 4y-locked veNFTs to protocols that commit bribes/POL (Aerodrome playbook: aligned voters, not dumpers) |
| Team | 15% | 2y vest, 6m cliff |
| Treasury / ops / audits | 10% | |
| Protocol-owned liquidity | 10% | Seeds JOHN/USDG + ETH/USDG |
| Public LBP | 5% | Price discovery + war chest |

> **Reconciled to the launchpad-first pivot (2026-07-15):** this original table is superseded by the **community-max cap table** in `launchpad-tokenomics.md` §7 (recommended 45 Heists / 15 curve / 15 partner / 15 team / 10 treasury, tunable + to counsel). Two buckets changed: **Public LBP (5%) → the fair-launch curve tranche** (JOHN fair-launches on our own curve, `launchpad-tokenomics.md` §5b), and **POL (10%) → seeded from curve graduation** rather than a pre-mint bucket. The evergreen Creator Pool below is now the **Bounties** engine, funded by *the take* (the 1% launchpad fee), not just a treasury slice.

### The ANSEM-style layer: evergreen, effort-based airdrops

What $ANSEM proved (July 2026): **continuous weekly airdrops funded by real fee flow, targeted at active promoters and holders, beats a one-shot drop** — it keeps the campaign permanently alive. Its weakness: random winner selection and no lockup, so mercenaries churn. We keep the evergreen cadence, fix the alignment:

**A. Seasonal "Heists" (the 40% genesis bucket)**
- Points across two tracks, published scoreboard:
  - **Onchain (70%)**: LP depth × time (majority weight), swap volume, veJOHN lock duration, referral-attributed volume (referral codes baked into router).
  - **Mindshare (30%)**: ⚠️ Kaito Yaps + open Yapper Leaderboards are DEAD (shut down 2026-01-15 after X revoked API access for pay-to-post apps) — automated X scoring is not buildable without the same API risk. Mechanism instead: (a) **submission-based content bounties** — creators submit links, scored by the KOL Council + team rubric (this is closer to how ANSEM actually works: manual weekly curation); (b) **Kaito Studio** structured campaign (their post-Yaps tier-based creator marketplace) as the paid amplification channel; (c) shift weight toward **onchain referral attribution** (codes in the router), which we fully control and can't be rugged by X policy.
- Paid as veJOHN locked 1 year → recipients become voters earning fees/bribes immediately. Hard work converts to cash flow, not just a dump.

**Season 0 mechanism (LOCKED 2026-07-14): non-custodial points campaign, NOT a pre-deposit vault.**
Rejected the Blast/Sonic pre-deposit model — it runs on trust an anon solo founder doesn't have, makes us hold user funds (most dangerous contract, needs the audit we're deferring), and is the worst fact pattern for the SG/DTSP concern (custody + pre-token deposits). We get launch TVL from the LBP + POL + emissions flywheel instead. Season 0 = points, nobody deposits with us. Scored **off-chain** (pre-TGE; the on-chain snapshot adapter is for Season 1+), feeding the built Merkle pipeline:
  - **Mindshare 40%** — curated X content, submission-based, council + team scored. Biggest weight: attention IS the pre-launch product.
  - **Testnet quests 30%** — real actions on the testnet deployment (swap/LP/lock/vote/claim-test-Heist); measurable on-chain (testnet), depth-weighted for sybil resistance; doubles as product testing.
  - **Referrals 20%** — codes; earn from referred wallets that actually complete quests, not sign-ups. Caps.
  - **Proof of interest 10%** — no-custody signals: bridged to the chain, or LPing on *existing* pools we don't control (Morpho/Uniswap), plus follow/RT.
  - Payout: locked veJOHN at TGE via the Heist claim. Min threshold to hit the leaderboard.
  - Build: Season 0 portal (leaderboard + quest tracker + referral links + content submission) on a Cloudflare-native backend (Workers + D1/KV), output → `score.js`.

**B. Weekly Creator Pool (evergreen, the direct ANSEM analog)**
- 10% of protocol treasury revenue each epoch funds a Creator Pool.
- Distributed weekly to the top of the mindshare leaderboard + a long-tail lottery tier (ANSEM-style tiered payouts: few big, many small — the $1M/$100k/$10k/$1k/$150 tier shape is what made it viral).
- 50% liquid / 50% 1y-locked veJOHN.
- **KOL Council**: 10–20 named KOLs get boosted multipliers + a public revenue-share dashboard ("I earn X/week shilling LittleJohn" is itself content).

**C. Milestone drops** (ANSEM tied drops to market-cap growth)
- Pre-announced bonus drops at TVL milestones ($25M / $50M / $100M) — turns every milestone into a coordinated marketing moment.

**Anti-sybil:** quality-weighted scoring, min veJOHN lock to enter leaderboard, council curation for the top tier, per-wallet caps on the lottery tier.

**Distribution mechanism (BUILT + AUDITED 2026-07-12):** `HeistsDistributor.sol` — season-based Merkle claims. The 200M Heists reserve is minted liquid to this contract at genesis; its ONLY JOHN outflow is `create_lock_for` into the escrow, min lock **1 year** (enforced), no liquid transfer or rescue path.

⚠️ **Precise claim (do NOT market as "un-ruggable"):** the reserve cannot be *dumped* — it can only ever leave as a ≥1-year veJOHN lock. But the OWNER writes the season roots and could allocate to itself. Code bounds this (any capture is locked ≥1yr, never instant liquid) but does not eliminate it. **Trust model REQUIRED: owner = multisig (ideally timelocked), roots published pre-season and `freezeSeason`'d.** The deploy script now hands ownership to the governance multisig automatically. Honest public line: *"reserve can only be released as ≥1y locked veJOHN, allocation governed by a multisig with frozen roots"* — not "can't be rugged".

Isolated per project rules (touches only JOHN + VotingEscrow, never pools). Genesis-lock reality: 30.5% in ve at TGE + 40% custodied lock-only + 29.5% liquid — honest, since earned-airdrop recipients are unknown at genesis (we don't fake Aerodrome's 90%, which came from airdropping to KNOWN veVELO holders).

## 3. Go-to-market — launchpad-first roadmap

**Gating is audit-driven, not calendar-driven.** The launchpad custodies user funds, so its **audit is mandatory** (first call on the take) and it — not a target date — gates each irreversible step. Clock context only: Robinhood's 90-day gas-incentive campaign ends ~Oct 1; competitors (The Furnace, Ouroboros, NOXA, UP) compound daily, so pace matters, but we do not ship custody code on a deadline.

The DEX fork is done (byte-identical Velodrome V1, 58/58 green). The new heavy lift is the **launchpad** (Virtuals `fun` fork, MIT) + its audit.

| Phase | Gate | What |
|---|---|---|
| **0. Build** | — | Launchpad fork (bonding curve → repointable graduation into the Velodrome-V1 fork; must support **launching a pre-deployed token** so JOHN can fair-launch on it — `launchpad-tokenomics.md` §5b). DEX fork already done. Public diff-transparency page. Testnet deploy of both. |
| **I. Launchpad live (tokenless)** | launchpad audit passed | Ship the launchpad. **The take → the band as Bounties** (creator/referral/trader rewards); real hard-asset fees from day one, no token needed (the pump.fun-*business* phase). Seed the first launches; recruit KOL Council. Flow-routing is now *contained* — launchpad-native coins trade on our curve then graduate to our pool (see §4). Router/aggregator BD (FOMO/1inch/Robinhood app) narrows to the non-native strategic pairs (stables, stock tokens). |
| **II. Heist Season 0 + JOHN fair-launch** | legal (DTSP) read back | Season 0 rewards Phase-I launchers/traders/creators with **locked veJOHN** → founding voter base. **JOHN fair-launches on our own curve** (community-max cap table, §7; no LBP, no presale). |
| **III. Graduate to the DEX** | Season 0 filled | JOHN graduates the curve → JOHN/USDG ve(3,3) pool (POL from the raise) → **start the Minter**: emissions, veJOHN voting, tolls, and the take's locker-yield/buyback slice switch on. |
| **IV. Flywheel** | ongoing | Evergreen **Bounties** + seasonal **Heists**, weekly epoch cadence (APRs, top creators, tolls live), public fee-vs-emissions dashboards, milestone drops. |

## 4. Risks

- **Incumbency**: Uniswap V3 is the default graduation venue. Counter: NOXA partnership + bribes make LittleJohn APRs strictly higher for LPs.
- **Aerodrome themselves**: ⚠️ updated 2026-07-11 — Aerodrome + Velodrome merged into unified **cross-chain** "Aero" (MetaDEX03, Q2 2026); the old Superchain-only stance is gone, so them deploying here is a live scenario. No *announced* ve(3,3) fork as of 2026-07-11 — but on-chain scan found a **stealth competitor**: token "UP" (0x57C0…4F1), 500M supply, 87.5% pre-locked in a veNFT escrow (0x5d32…7B6), Voter with 15 gauges (0x7F74…2a7), vAMM/sAMM pairs with dust liquidity, Thena-style veNFTAPIV3 helper, 32 holders, zero web/social presence. Deployed but not launched — likely days from announcing. Also two "Rugdrome" joke/test deployments. **Implication: we will not be first to deploy; we must be first to mindshare** — branding + Heists + BD is the differentiation, and announcement timing should compress.
- **Arcus zero-fee stock trading**: stock-token pairs are a fee desert (dYdX-built Arcus charges zero) — confirms memecoin/volatile-pair focus; don't burn emissions on stock-token gauges expecting fee flywheel there.
- **Legal**: paid KOL promotion requires disclosure (FTC/MiCA); stock tokens geofenced from US — airdrop program likely needs the same geofence + entity setup. Get counsel before Season 0 rewards are claimable.
- **Sybil/mercenary churn**: mitigated by locked-ve payouts, but expect farming; budget for scoring iteration.
- **Death-spiral optics**: ve(3,3) emissions without fee growth = Solidly 2022. Publish fee-vs-emissions dashboard from day 1.
- **Flow-routing dependency (CRITICAL, added 2026-07-12)**: LittleJohn is the pipes; the faucets already exist (FOMO — $75M-funded social trading app, integrated RH Chain; Robinhood's own app; NOXA). As of 2026-07-12 FOMO routes "the bulk" to **Uniswap V3/V4 + PancakeSwap V3, NOT any ve(3,3)**. Deep pools are worthless if the dominant faucets don't route to us. UNKNOWN TO RESOLVE: does FOMO route by best-execution (then emissions→depth wins flow automatically) or hardcoded venues (then we need an integration deal)? → **Router/aggregator listings (FOMO, 1inch, Uniswap router, Robinhood app) are now the #1 BD priority, above gauge deals.** Do NOT build a competing consumer faucet — unwinnable vs FOMO's war chest + Robinhood's app. Our own frontend = table-stakes swap/LP UI for our pools only.
  - **REFRAMED existential → contained by launchpad-first (2026-07-15):** this risk was framed for a *pure-DEX* play. With the launchpad, native memecoins trade ONLY on our curve pre-graduation (captive by construction), then graduate into OUR ve(3,3) pool + UI (the pump.fun→PumpSwap flow-capture move). Residual leaks, both manageable: (1) non-native strategic pairs (USDG/USDe, ETH/USDG, stock tokens) still depend on external routing → router-integration BD shrinks to the stable/bluechip side only; (2) post-graduation a rival Uniswap pool could get deeper and aggregators route there → defense is graduation-seeded POL + our-UI default-venue advantage ("keep our pool deepest", not "we're invisible"). Net: no longer the #1 existential risk for launchpad-native flow.

### Strategic precedent — MM Finance vs VVS on Cronos (the brand-first thesis)

The core bet (anon, brand-led, no chain blessing) has a direct precedent. On Cronos (Crypto.com's corporate/retail chain), the blessed house DEX was **VVS Finance** (backed by Particle B, Crypto.com's own accelerator). **MM Finance / Mad Meerkat** — a fully anon team, no backing, pure meme branding + aggressive APR — reached #2 protocol and repeatedly flipped VVS in daily *volume* despite VVS's TVL lead. Proof that on a meme/retail chain, brand + community + aggressive tokenomics beats the corporate-blessed incumbent on the metric a ve(3,3) flywheel actually needs (volume + mindshare), with zero chain support. Robinhood Chain is even more retail/meme-skewed than Cronos.

Two failure modes from how MMF actually ended, both directly relevant:
1. **Aggression fuels the fade too.** MMF's linear high-inflation farm spiked hard, then bled out when the meta cooled — it reached co-leader, never durably dethroned VVS. Our edge: ve(3,3) is a *better* aggression vehicle than a linear farm — emissions are vote-directed to where fees/bribes are highest, paid to *lockers* (removed from float), rebase-protected. So we can run MMF-crazy *headline APR* while the structure stays Aerodrome-sound. The trap isn't being aggressive; it's aggression via unstructured liquid inflation nobody locks. Fee-vs-emissions dashboard + stage gates are the discipline that lets us crank emissions to win the land-grab and know when to pull back.
2. **Anon meme empires attract attackers.** MMF lost user funds to a front-end/DNS hijack — the contracts weren't even the weak point. Non-negotiable opsec: DNS lock + registrar 2FA, frontend hosting hardening, multisig before mainnet. (Not a tokenomics issue; a survival issue.)

### Stage gates (escape hatch — published as policy, settled 2026-07-11)

1. **Gate 1, pre-TGE (~wk 5)**: Season 0 traction floor — e.g. < ~2,000 qualifying wallets AND weak mindshare/referral spread → no token launch, wind down. (Non-custodial campaign, so the metric is participation + attention, not deposited TVL.) Sunk cost: domains + minor infra + time; the $120k never deploys.
2. **Gate 2, LBP**: raise under floor (set before LBP opens) → scale down or refund.
3. **Gate 3, epoch 8**: external TVL + weekly fee thresholds (set at TGE) → miss = stop self-bribes, withdraw anchors, announced sunset (emissions off, LP exit window). Recoverable in fade case: POL + anchors minus IL (~$70–85k).

Publishing the gates is itself a trust signal: pre-committed honest-failure plan ≠ rug.

### Founder allocation policy (settled 2026-07-11)

- Team 15%: **70% max-locked veJOHN at TGE** (weekly fees/tolls/rebases = liquid income from epoch 1), 30% standard 2y vest w/ 6m cliff (liquid tranche).
- Deployer/team/treasury/POL wallets **hard-excluded from Heists + Creator Pool**, disclosed in docs.
- Founder early liquidity channels: disclosed treasury salary (funded by LBP raise) + weekly ve income. No token sales into thin liquidity; OTC veNFT sale is the emergency exit.

## 5. Open questions (Yuxi)

- [ ] Solo build or recruit? (Solidity + BD + a points/leaderboard web app — realistically 2–3 people minimum)
- [x] Capital (settled 2026-07-11): ~US$120k liquidity budget — ~$60k JOHN/USDG POL, ~$30k anchor deposits in day-1 pools (no pre-deposit vault — Season 0 is non-custodial), ~$30k epoch 1–8 self-bribes (~$4k/wk). No formal audit pre-TGE (AI diff review + transparency page instead); consequence: stable-issuer BD (Paxos/Ethena have audit checkboxes) moves AFTER a post-LBP contest audit — GTM wedge inverts to memecoins-first → LBP → contest audit → stables.
- [ ] Counsel budget still unscoped.
- [x] Name signed off: LittleJohn (2026-07-11). Still to do: pick $JOHN vs $LJ, register littlejo.hn (confirmed available 2026-07-11) + defensive littlejohn.xyz + X handle, trademark-registry check.
- [x] License: Aerodrome/V2 core is BUSL-1.1 until 2027-01-01 (NOT forkable now — earlier "dual GPL/MIT" read was wrong, from a README summary). Pivoted to Velodrome V1 (MIT/GPL) — verified in-repo 2026-07-11.
- [x] Kaito: Yaps/leaderboards dead since 2026-01-15; use Kaito Studio + in-house curation + referrals (see Mindshare track).
- [x] Chain infra (verified 2026-07-11): fully EVM-compatible, ETH gas, Foundry/Hardhat/viem supported, Alchemy = recommended RPC + gasless infra, Chainlink price feeds, LayerZero bridging, ERC-4337 native, Allium for data/analytics. Still open: testnet existence + explorer/subgraph specifics (check docs.robinhood.com/chain/connecting).
- [ ] Trademark registry check (counsel, before TGE).
