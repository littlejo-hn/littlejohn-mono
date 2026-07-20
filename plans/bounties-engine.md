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

## Honest risks
1. **Bootstrap leans on the token-promise** (farmers) before fees exist → locked
   airdrop + real-growth weighting mitigate, don't eliminate.
2. **Sybil never fully solved without identity** (RH has none) → economic + curation.
3. **Circular** (need volume for fees, fees for bounties) → the points bootstrap +
   movement break the circle, but it's still a bet that growth compounds before
   patience/runway runs out.
4. **Securities** — paying fee-share/rewards sharpens the §8.3 profile → to counsel.
