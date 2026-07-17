# LittleJohn anti-snipe design (2026-07-17)

How LittleJohn defends against the failure modes that killed the first wave of
Robinhood Chain launchpads (Noxa, vlad.fun, pons). Two separate tracks:

- **Track 1 — general coins:** a time-decaying **buy** fee at the curve level,
  routed to the take. Extends (does not replace) `fair-launch-spec.md`.
- **Track 2 — JOHN:** a deliberate ve(3,3) genesis (uniform-price auction +
  veJOHN airdrop + seeded base pair), **not** the memecoin curve. **Revises
  `launchpad-tokenomics.md §5b`** (see reconciliation at the end).

Companion research: the 2026-07 landscape sweep (Virtuals, Meteora DBC, Heaven,
Uniswap CCA, Fjord LBP, Gnosis) — sources at the end.

## 1. The reframe: FCFS inverts every classic defense

Robinhood Chain orders transactions **first-come-first-served by arrival time at
the sequencer, not by gas/priority fee**, at ~100ms blocks. Glassnode measured
the latency spread: Ohio 3ms → Sydney 200ms ≈ a **~2-block ordering edge** to
co-located bots. Consequences:

1. The entire Ethereum/Solana anti-snipe toolkit — outbid via priority fees, PGA
   auctions — is **useless** here. You cannot out-gas a sniper because gas does
   not buy ordering.
2. You cannot out-*latency* a professional co-located bundler either, and neither
   can retail.

So the only robust principle is: **stop trying to prevent snipers from being
first (an unwinnable latency race) and make being-first unprofitable instead.**
Every mechanism below follows from this.

Empirical proof the weak defenses fail: Noxa ran a 2% per-wallet cap + first-
blocks caps; the $ARROW launch defeated them with **200 fresh wallets taking 80%
of supply inside 3 minutes**. Per-wallet caps are theater against bundlers — we
will not build them.

## 2. What we already beat vs. what we're adding

| Failure mode | Status |
|---|---|
| No curve, direct-to-V3 (Noxa's original sin) | ✅ solved — we have a curve + graduation |
| 80%-supply grab (the $ARROW bundle) | ✅ mostly — constant-product makes cornering the curve cost ~the whole raise; self-defeating |
| Snipe cheap first tranche, dump on retail | ❌ **exposed today** — Track 1 fixes this |
| Wash-traded fake volume in trending | ❌ exposed — see §5 (task #22) |
| Frontend DDoS → dump while retail locked out | ✅ structural — Cloudflare edge + chain-read fallback (this is half of what actually killed Noxa) |
| Unaudited / vibecoded contracts | 🟡 audit is mandatory (already in tokenomics §8); buy-fee is new audit surface |

## 3. Track 1 — general coins: decaying buy fee → the take

**Mechanism.** On `Launchpad.buy()`, apply a launch-window fee that starts high
and decays to the base fee, scheduled **per token from its own creation block**.
Charged on ETH-in, before the curve math.

**Buy-side, not sell-side.** This is the single most important design choice and
it corrects the earlier sell-tax sketch. The proven, reputable implementations
(Virtuals: 99%→1% linear; Meteora DBC Fee Scheduler; Heaven's ~6s sniper tax) all
tax the **buy** — the sniper's *entry* — and leave sells at the base fee. Reasons:

- It directly prices out the block-0 corner without needing to identify sybils.
- It does **not** trap genuine early buyers on exit (a decaying *sell* tax does).
- **Honeypot optics:** simulation scanners (honeypot.is, GoPlus) flag "honeypot"
  only when a sell reverts/nets ~0; a clean sell never trips it. Static/bytecode
  scanners only read the ERC-20's own `transfer` — our fee lives in the
  launchpad, not the token, so the token reads as a standard, no-tax ERC-20. And
  because we tax **buys**, a sell-simulation stays clean *even during the curve
  phase*. After graduation: 0% everything, plain composable ERC-20.

**Routing — this IS extra take.** The base 1% keeps its 0.6/0.4 protocol/creator
split (`fair-launch-spec.md`). The **decaying premium above the base goes 100% to
the take** (treasury → Bounties/band), never to the creator — otherwise creators
could self-snipe to farm it. This is a perfect fit for the take thesis
(`launchpad-tokenomics.md §3`): the take is *"volume-weighted going in (snipers
pay the majority), community-weighted coming out."* **Snipers fund the band.** We
don't ban them; we tax their entry and give it to the community.

**Proposed params (tunable, to be locked in task #20):**

| Param | Proposed | Notes |
|---|---|---|
| Starting buy fee | **~80%** | brutal at block 0; below Virtuals' 99% to keep near-instant buys usable |
| Ending buy fee | **base 1%** | rejoins the standard `fair-launch-spec.md` fee |
| Decay window | **~2–3 min** (~1,200–1,800 blocks @100ms) | short: kills the block-0 corner, preserves the instant-buy feel; not Virtuals' 98-min fair-distribution window |
| Decay shape | **linear** (v1) | simplest to audit; exponential (Meteora-style, harder early) is a later option |
| Fee basis | ETH-in, pre-curve | premium skimmed to treasury; curve math runs on the remainder |
| Cap interaction | **outside `MAX_FEE_BPS` (5%)** | that cap governs the *standing* fee; the launch premium is a separate, bounded, decaying mechanism |

**Relationship to the locked spec.** `fair-launch-spec.md` deliberately shipped
*no* anti-snipe and flagged the dev-cap as *"the one lever that reopens if devs
snipe-and-dump — a contract change / new audit surface."* This **is** that lever,
implemented as a decaying buy fee rather than a per-wallet cap (caps are proven
useless; §1). Everything else in the locked spec stands.

## 4. Track 2 — JOHN: deliberate genesis, not the memecoin curve

**Why JOHN is different.** A snipe on a random memecoin is a bad chart. A snipe on
JOHN is **governance capture** — whoever corners JOHN at t=0 corners veJOHN →
emissions → the entire DEX. That makes JOHN's launch protection existential, and
the memecoin curve (a first-come speed game, even with a buy fee) is the wrong
tool for a governance asset where you want deliberate control of float,
distribution, and initial liquidity depth.

**Precedent backs deliberate, not curve.** The best in *both* categories avoided
curve-launching their own token: our own ve(3,3) lineage (Velodrome VELO,
Aerodrome AERO) launched via **genesis distribution + airdrops to lockers**, and
the launchpad category leader **pump.fun launched PUMP via a public sale, not its
own curve**. (This corrects `launchpad-tokenomics.md §5b`, whose stated rationale
— "it's pump.fun's own move" — is factually wrong.)

**Recommended: Option B — uniform-price genesis auction.**

1. **veJOHN airdrop** of the community bucket to *earned* participants (Heisters,
   Phase-1 LPs/traders) as **locked veJOHN** — the community-max lever and the
   founding voter base (`§7`: the 45% band bucket).
2. **Uniform-price / commit-reveal auction** for the 15% public-float tranche:
   one clearing price, pro-rata fill, so latency and sybils gain **nothing**
   (the CCA idea — Uniswap shipped exactly this on RH Chain on 2026-07-13 — built
   on our own contract so liquidity and narrative stay home).
3. Proceeds + JOHN **seed the JOHN/USDG ve(3,3) pool** (our venue), which becomes
   POL and gets the **first gauge** → start the Minter.

**Fallback: Option A — JOHN on the curve with maximal anti-snipe** (the Track-1
buy fee tuned aggressive: higher start, longer window). Cheaper (reuses Track-1,
no new auction contract) and preserves the "JOHN went through the same curve you
did" solidarity narrative from §5b. Weaker because it's still a speed game at the
margin for the one token where capture is fatal.

**Recommendation:** Option B. The fairness/anti-capture gain outweighs the new
audit surface for the one launch where it matters most, and the narrative is
*stronger*, not weaker: **"JOHN wasn't sold to insiders and wasn't sniped on a
curve — it was auctioned fairly and airdropped to the people who actually used the
protocol."** Final lock is Yuxi's call (see open items).

**What stays from `launchpad-tokenomics.md §5b/§7` under Option B:** the whole
sequential model (JOHN=`Velo.sol` keeps its minter; genesis is a distribution
event, emissions switch on after migration), the 45/15/15/15/10 allocation table,
POL-from-graduation, Minter-dormant-until-Phase-2. **Only the mechanism for the
15% public float changes: bonding curve → uniform-price auction.**

## 5. Supporting pillars (own tasks)

- **Wash-resistant trending (task #22).** Stop ranking on raw `volEth` (trivially
  washed, net-zero). Rank on **net ETH inflow + unique-buyer/holder growth +
  curve-progress velocity** — data already in Ponder. Kills fake-volume
  manipulation of the board.
- **Infra as moat.** Noxa's frontend fell over under bot spam (they blamed
  "Cloudflare issues"); that was half the death. Guarantee trading never hard-
  depends on our frontend/indexer (chain-read fallback, graceful WS degradation),
  and *market* the edge un-killability. This is task #18 territory.

## 6. Reconciliation with existing docs

| Doc | Change |
|---|---|
| `fair-launch-spec.md` | **Extended.** Activates the deferred anti-snipe lever as a decaying buy fee (§3). Base 1% fee + curve params unchanged. |
| `launchpad-tokenomics.md §3` | **Reinforced.** The buy-fee premium is extra take → band; exactly the "volume-weighted in, community-weighted out" model. |
| `launchpad-tokenomics.md §5b` | **Revised.** JOHN public float distributed via uniform-price auction, not the bonding curve. Corrects the "pump.fun curve-launched PUMP" premise. §7 allocation + sequence stand. |
| North-star thesis (memory) | **Revised.** "JOHN fair-launches on its own curve → DEX" becomes "JOHN fair-launches via genesis auction → DEX." Update the memory once locked. |

## 7. Open items / to lock

1. **JOHN: Option B (auction) vs Option A (curve + max anti-snipe).** Recommend B;
   needs Yuxi's final lock before task #21 builds.
2. **Buy-fee params** (start %, window, decay shape) — model + lock in task #20.
3. **Audit scope.** The buy fee and (if Option B) the genesis-auction contract are
   both new audit surface, first call on the take (`tokenomics §8`).
4. **Securities profile.** Routing sniper fees to the band sharpens the same
   "share of protocol revenue" tension flagged in `tokenomics §8.3` — to counsel.

## 8. Sources (2026-07 landscape sweep)

- Virtuals anti-sniper (buy 99%→1%, sells flat, fees→buyback): whitepaper.virtuals.io/about-virtuals/capital-formation-layer/anti-sniper-protection
- Meteora DBC Fee Scheduler (start ≤9900bps, linear/exp decay): docs.meteora.ag/anti-sniper-suite/fee-scheduler
- Heaven DEX ~6s decaying sniper tax at the launchpad level: blockworks.com/news/solana-cutting-mev-snipers
- Uniswap Continuous Clearing Auctions live on RH Chain 2026-07-13: docs.uniswap.org/contracts/liquidity-launchpad/CCA
- Fjord Foundry LBP (descending price, still active 2025): fjordfoundry.com
- Gnosis Auction (uniform-price batch, largely dormant for launches): github.com/Gnosis-Auction/auction-contracts
- Noxa shutdown + $ARROW 200-wallet bundle + Glassnode FCFS latency: coindesk.com (2026-07-15), cryptotimes.io (2026-07-13)
- Honeypot detection (simulation vs static; external-contract fees): docs.gopluslabs.io/reference/response-details
- SafeMoon (why in-token sell taxes carry scam baggage): sec.gov/newsroom/press-releases/2023-229
