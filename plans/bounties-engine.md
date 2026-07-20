# Bounties growth-engine — spec (2026-07-20)

## One line
Convert the take (fees) into an incentivized, sybil-resistant **growth army**: the
band gets paid to bring users, spread the word, and defend the trenches — funded by
the volume they create. Points → locked veJOHN bootstraps it before fees exist.

This operationalizes `launchpad-tokenomics.md` §3 (the take), §4 (Bounties), §7 (cap
table) into an actual growth engine, and adds the referral mechanic + the points
bootstrap that were missing.

## The flywheel
fees (the take) → Bounties pool → band does growth → users + volume → more fees →
bigger Bounties. Self-funding once volume flows; **you never pay marketing out of
pocket — the growth pays for the growth.**

## What earns (hybrid: ~70% objective on-chain / ~30% curated)

### Objective / on-chain (70%) — auto-paid, sybil-resistant
1. **Referrals — the acquisition core.** A code/link → referred wallet trades →
   referrer accrues X% of that wallet's take, ongoing. On-chain attributed. The
   single most important bucket: it *directly pays for users.*
2. **Volume** — real trading, weighted wash-aware (net-flow / unique counterparties,
   not raw).
3. **LP depth×time** — liquidity provision (the Heists integral, already built).
4. **Locking** — veJOHN lock amount×duration.
All measured off the indexer / the existing Heists scorer.

### Curated / discretionary (30%) — human-judged, high-value
5. **Amplification** — memes, threads, videos, explainers, rug call-outs that spread.
   Curator scores reach × quality.
6. **Defense (on-brand edge)** — verified rug reports, serial-rugger intel, honeypot
   flags. Ties growth to the mission, not vanity.
7. **Recruiting** — bringing verified new band members (community-building beyond
   raw referral volume).

## Referral attribution (the core mechanic, concrete)
- First buy carries a referral code (URL param → stored/on-chain). Record
  `referrer[referee]` once, immutably, at first touch.
- Every later trade by the referee: the take splits base + a **referral slice → the
  referrer** (accrued, pull-pattern claim).
- **The slice comes out of the house cut, not as extra fee** — the user still pays
  1%; the house shares its keep with whoever brought that user. (GMGN's model.)
- Anti-wash: `referrer != referee` enforced; self-referral nets a loss (you pay the
  fee to earn a slice of it). Optional decay (lifetime vs first-N-days) — TBD.

## Fee split (where the take goes) — per §3
take (1%) → **house cut ~20–25%** (you/ops: audit → security → runway → salary) +
**band share ~75–80%**, deployed as:
- referral payouts (auto, from the split)
- Bounties pool (curated + objective: content/defense/recruiting/LP/lock)
- veJOHN locker yield (real hard-asset yield — the ve(3,3) draw)
- a buyback slice (value accrual + narrative)
Guardrail: always a **% of actual take** (variable), never a fixed promised yield;
audit + runway floor comes first.

## The bootstrap — points → locked veJOHN (the honest cold-start fix)
Before there are fees, there's nothing to pay Bounties with. So run on **points**:
- The *same actions* (referrals, content, defense, recruiting) earn **points** pre-fee.
- Points convert to a **locked-veJOHN airdrop at TGE** — the token *promise* funds
  pre-fee growth (standard crypto bootstrap), and the lock aligns them past the drop
  (reduces mercenary dump).
- Sequence: **movement (rug crusade, points-funded) → build the band → TGE (points→
  veJOHN) → pad live → fees turn the Bounties into real money.**

## Anti-farm / sybil (the honest hard part — RH has no identity layer)
- On-chain actions attributed + weighted by **costly-to-fake signals** (net-flow,
  unique counterparties, lock duration) — **never per-wallet** (no identity gate on
  RH, confirmed in `antisnipe-design.md §5`).
- Referral wash is self-limiting (costs the fee).
- Content/recruiting is **human-curated** (the 30%) — judgment catches spam.
- Airdrop weighted to *real growth* (referred volume), and *locked* — dampens farmers.
- Quality floor: bounties require verifiable impact, not raw activity.
Not un-gameable without identity; the economic + curation defenses make it not-worth-it.

## What to build
1. **Referral tracking** — indexer: `referrer→referee`, accrued referral fees, claim.
2. **Points ledger** — D1: points per wallet per action, pre-fee (reuse the Season-0
   points portal, task #11, already built).
3. **Bounties board** — UI: open bounties, submissions, curation queue, payouts.
4. **Fee-split routing** — contract/treasury: take → house / band / referral / locker
   / buyback.
5. **Anti-farm scoring** — reuse the Heists scorer for on-chain (LP/lock/volume); a
   curation flow for content/defense.

## Reuses (already built)
Heists scorer (on-chain bounty measurement) · Season-0 points portal (the points
ledger) · the indexer · the take/fee-split from the launchpad · the movement (rug
crusade) as the pre-fee top-of-funnel.

## Mechanic scan (2026-07-20) — what to pay, validated against 2025-26 proof

**The one design principle, confirmed by the scan:** *pay rewards in **locked veJOHN
(ownership)**, never cash.* Every 2025-26 mechanic that BUILT a durable tribe pays
ownership; every one that FAILED pays cash to people with no reason to stay. That
single filter separates the whole landscape.

### Reward-types to build (ranked, all paid in / boosted by locked veJOHN)
1. **ve(3,3) vote-incentives / bribes — the SPINE, not an add-on.** Graduated tokens
   must court veJOHN voters for liquidity, so **launching projects pay the band
   (bribes) to steer emissions to their pool** — a *second* value source on top of
   the take, funded by projects, not by you. Proof: Aerodrome ~$1.3B TVL, ~60% of all
   Base DEX volume; Curve bribes ran 20–50%+ APY and became the main reason to hold.
   Guard the known failure mode: if bribe income dwarfs real fees, voters optimize for
   bribes over health — weight real fees generously, vet which pools get gauges.
2. **Give-back as buyback → distribute to lockers (real yield), NOT burn.** Route the
   band's share of the take to buy JOHN and *distribute to veJOHN lockers.* Proof:
   Hyperliquid bought $2B+ HYPE with ~97% of fees (the backbone of its cult). Burn is
   a price crutch that rewards passive holders — pump.fun burned $370M/36% of supply,
   price didn't hold, and they *abandoned* 100%-burn (Apr 2026). Distribute-to-owners
   beats burn for our model.
3. **Points → locked-veJOHN airdrop, usage/holding-weighted, sybil-gated.** Proof of
   good: Hyperliquid $1.6B to ~94K real wallets, no VC → deepest cult in perps. Proof
   of bad: LayerZero purged ~800K sybils; friend.tech's token drop didn't save it.
   **Never pay points for raw volume** (that's what farmers game) — weight to
   locking + real fees generated.
4. **Creator/KOL rev-share + a veJOHN boost.** Table-stakes to compete (pump.fun
   creators earned $350M; PumpSwap/Believe share ~50%). Ship default cash share **+ a
   materially higher rate if the creator vests it into veJOHN** → converts mercenary
   launchers into owners.
5. **Lock multipliers / vote-escrow boosts** — longer lock = bigger reward (Curve up
   to 2.5×). Native to ve(3,3); use everywhere to make veJOHN sticky.
6. **Referrals — ship ONLY paid in locked veJOHN.** Cheap + viral (Axiom 30%, GMGN),
   but mercenary by default (referrers dump users and leave). Paid in *locked veJOHN*
   it recruits owners who recruit owners. Cash referrals = churn; ship the veJOHN form.

### Do NOT build (mercenary cash gimmicks — the FAIL list)
- **Cash loss-rebates / cashback** — adverse selection (you'd mint rewards for the
  churn-prone ~63% who lose). See below for the one salvageable variant.
- **Streaks / daily quests as a primary driver** — friend.tech corpse: −95% txns in
  weeks once novelty wore off.
- **Copy-trade fee splits *as a growth mechanic*** — fine as a product feature,
  mercenary as growth (copiers chase the next wallet).
- **Lottery / jackpot memecoins** — gambling loops, off-brand for "protect the little
  guy" (that's SLVR — froth that dies at the cliff).
- **Buyback-and-BURN** — see #2; distribute-to-lockers beats it.
- **Reply-to-launch virality as retention** — Believe spiked then −94%; it's an
  acquisition tactic, not a moat.

### The loss-refund (Variational), honestly
Variational's loss-refund only works because **Omni is the counterparty** — it hands
back ~3% of *its own spread winnings* as a capped lottery. A launchpad isn't the
counterparty, so a cash version would **tax winners + the band to pay the losing
cohort** — it FAILS the filter. The *only* defensible port is a **hard-capped,
veJOHN-denominated "loss shield" lottery** ("get rekt? the band has your back — some
comes back, as ownership"). It's on-brand and turns bad luck into an ownership
on-ramp, but it's **second-tier** (still rewards losing) — cap it hard, never lead
with it.

## Honest risks
1. **Bootstrap leans on the token-promise** (farmers) before fees exist → locked
   airdrop + real-growth weighting mitigate, don't eliminate.
2. **Sybil never fully solved without identity** (RH has none) → economic + curation.
3. **Circular** (need volume for fees, fees for bounties) → the points bootstrap +
   movement break the circle, but it's still a bet that growth compounds before
   patience/runway runs out.
4. **Securities** — paying fee-share/rewards sharpens the §8.3 profile → to counsel.
5. **ve(3,3) bribe-capture** — if project bribes dwarf real fees, governance rots
   (voters chase bribes over protocol health). Weight real fees; gate gauges.
