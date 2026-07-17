# DEX (ve(3,3)) scoping — 2026-07-16

Grounded in two passes: the contract data model (events + reads across Pair,
Gauge, Voter, VotingEscrow, Bribes, Minter, RewardsDistributor) and the current
frontend surface. Same launchpad-first discipline applied.

## The reframe that cuts most of the scope: the flywheel is gated on JOHN

The ve(3,3) value loop, gauge emissions, veJOHN locks, epoch votes, bribe markets,
rebase, is **denominated in JOHN**. Emissions ARE JOHN; veJOHN requires locking
JOHN; votes direct JOHN; bribes incentivize JOHN voters. Per the thesis, **JOHN is
Phase 2 (fair-launches later on its own curve); the launchpad ships tokenless
first.** Therefore the entire ve(3,3) flywheel is inherently Phase 2, dormant
until JOHN exists.

So the DEX splits cleanly:

- **Phase 1 (launch, tokenless): the DEX is just an AMM.** Graduated launchpad
  tokens need somewhere to trade. Swap + liquidity + pool analytics. That's it.
  No gauges, no votes, no bribes, no veJOHN, no emissions, they have nothing to
  emit without JOHN.
- **Phase 2 (with the JOHN launch): the full flywheel.** Built alongside JOHN.

This means the launch-critical DEX work is small; the intimidating ve(3,3)
complexity is Phase 2, shipped with JOHN, not now.

## Current state (from the two passes)

- **Contracts: done.** Velodrome V1 fork, all deployed on testnet (pool + gauge +
  vote verified). Full event surface exists.
- **Frontend: an AMM skeleton; the flywheel is missing end-to-end.** Functional:
  basic swap (single-hop volatile only), add/remove liquidity, create-lock, stake
  LP. Missing: veJOHN fee/bribe claiming (no ABI, no page), vote page can't read
  weights (voterAbi is write-only-ish), no bribe deposit, no pool list / TVL / APR,
  no epoch countdown, no analytics. Every DEX read is a live per-render RPC loop.
- **Indexer: none for the DEX.** Ponder currently indexes only graduated Pair
  Swap/Sync (via the launchpad Migrated factory). Everything else is un-indexed.

---

## Phase 1 — launch AMM (build now, alongside the launchpad)

### Indexing (extend the existing Ponder)
- Add **`PairFactory.PairCreated`** as a second factory source so ALL pools are
  indexed, not just launchpad-graduated ones (current config only sees pairs born
  from `Migrated`).
- Add Pair **`Mint`, `Burn`, `Fees`, `Transfer`** to the pair handler (we already
  do Swap/Sync). Powers TVL, volume, fee accrual, and per-user LP positions.
- Schema: extend `pool` (reserves already there) with 24h/total volume, fee
  accrual, LP supply; add `lpPosition` (per-user LP balance from Pair Transfer).
- Derived (cheap): **TVL** (Sync reserves × price), **volume** (Swap sums),
  **fee-APR** (volume × `PairFactory.getFee(stable)` ÷ TVL). Pre-JOHN, with no
  gauges, trading fees are claimable directly by LPs via `Pair.claimFees` /
  `claimable0/1`, so fee-APR is real and LP-facing at Phase 1.

### Frontend (Phase 1)
- **Pool list / table** (the single biggest missing surface): pools with TVL,
  volume, fee-APR, from the indexer. Today there's no list at all, just a pair
  selector.
- **Swap improvements**: it's hardcoded single-hop volatile with fixed 0.5%
  slippage, no price impact, no best-route selection. Add stable+volatile route
  selection, price-impact from reserves, editable slippage. (Multi-hop can wait.)
- **Liquidity polish**: live pool-ratio quoting on add (`quoteAddLiquidity` exists
  but is unused, users type both amounts blind); a "your LP positions" view from
  the indexer.

That's the launch bar: a clean AMM where graduated tokens trade, with a real pool
list and a swap that shows price impact.

---

## Phase 2 — the ve(3,3) flywheel (build with the JOHN launch)

### Indexing (net-new, big expansion)
- **Voter**: `GaugeCreated` (the pool↔gauge↔internal/external-bribe join table),
  `Voted`/`Abstained` (per-epoch vote weights), `DistributeReward` (per-gauge
  emissions), `GaugeKilled/Revived`, `NotifyReward`.
- **Gauge** (factory source = Voter `GaugeCreated`): `Deposit`/`Withdraw` (staked
  LP), `NotifyReward` (emissions in), `ClaimRewards`, `ClaimFees`.
- **VotingEscrow**: `Deposit`/`Withdraw`/`Supply` (locks + total locked), ERC721
  `Transfer` (veNFT ownership). Decaying voting power reconstructable from lock
  end + slope.
- **InternalBribe / ExternalBribe** (factory source = `GaugeCreated`):
  `NotifyReward` (fees to voters / bribe markets, external bucketed by epoch),
  `ClaimRewards`.
- **Minter**: `Mint` (weekly emission, marks each epoch flip). **RewardsDistributor**:
  `CheckpointToken`/`Claimed` (rebase).
- Schema: `gauge`, `veLock` (veNFT), `vote` (per epoch/pool), `bribe` (per
  epoch/token), `epoch`/emissions. Epoch = 1 week, Thursday 00:00 UTC.

### Frontend (Phase 2)
- **Vote page** that can actually read state (needs `voter.weights/votes/
  usedWeights/totalWeight`, absent from the current ABI): show current + global
  vote weights, projected reward per vote, reset, voting-window status.
- **Rewards / claim**: LP emissions, voter fees + bribes, rebase, in one place.
- **Bribe / incentivize** a gauge (no page, no ABI, no config address today).
- **veJOHN dashboard**: locks, voting power, votes cast, all claimables.
- **DEX analytics + epoch countdown**: protocol TVL/volume/emissions, top pools,
  time-to-flip.

### ABI gaps to fill (Phase 2, but cheap)
`voterAbi` lacks `weights/votes/usedWeights/totalWeight`; `gaugeAbi` lacks
`rewardRate/rewardPerToken`; no bribe/minter/rewards-distributor ABI or bribe
contract address in config. These block the read-side of vote/rewards/analytics.

---

## Quick wins available now (Phase 1, independent of JOHN)
- Lock management: `increase_amount` / `increase_unlock_time` are in the ABI but
  have no UI, users can't top up or extend a lock. Small add. (Locking pre-JOHN is
  only testable once JOHN's liquid, so lower urgency, but trivial.)
- Add the missing voter/gauge read methods to the ABIs so Phase 2 UI isn't blocked
  later.

## Open decisions
- [ ] Phase 1 pool scope: index ALL pools (via PairFactory) for a general DEX, or
  only graduated launchpad pools to start? (General DEX is more work; graduated-only
  matches the launchpad-first story.)
- [ ] Does the DEX need to feel alive at launch (pool list + swap + LP), or is
  "graduated tokens are tradable, flywheel comes with JOHN" an acceptable launch
  narrative? Recommend the latter, keeps Phase 1 tight.
- [ ] Confirm JOHN is Phase 2 for mainnet (testnet has JOHN deployed for testing).
