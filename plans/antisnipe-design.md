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

## 3b. Anti-spam — flat creation fee (reopens `creationFee = 0`)

Gasless creation (see §5, the consumer-UX direction) needs a spam floor, because
RH Chain gas (~1.5¢/create) is far too cheap to be one — spam is cheap here gasless
or not. Charge a **flat ~$1 USDG to create**, routed to the take (the band).

- **Negligible to humans** (1–5 coins = $1–5); **a wall at bot volume** — a
  Noxa-scale flood (10k/day) ≈ $10k/day, paid in USDG up front.
- **Routed to the band**, so it reads as a contribution, not extraction ("$1 to
  launch, and it goes to the community pot").
- **Reopens `fair-launch-spec.md`'s locked `creationFee = 0`** — justified because
  that decision assumed gas was the anti-spam floor; on RH Chain there effectively
  is none (~1.5¢).
- **With identity:** layer per-creator escalation (1st free, rapid repeats pricier).
  A refundable deposit (~$2–3, returned on a liveness bar) is the more-robust,
  heavier alternative — held in reserve if spam actually appears.

**Scope — what the fee does and doesn't protect.** It protects the **on-chain
creation surface** (board / indexer / state bloat — the "bots creating tokens
hourly" that overwhelmed Noxa). The read-side **frontend/RPC DDoS** that took
Noxa's *site* down is a separate layer — Cloudflare edge + relayer rate-limits
(§5). Two vectors, two defenses, both needed.

## 4. Track 2 — JOHN: no public sale, distribute + seed (LOCKED 2026-07-18)

JOHN does **not** have a public sale — no curve, no auction. It's **distributed**
(mostly as locked veJOHN) and its liquidity is **protocol-seeded**, then it trades
on the open market. Locked with Yuxi 2026-07-18.

**Why no sale is the strongest option:**
- **Truest ve(3,3) precedent.** Velodrome (VELO) and Aerodrome (AERO) were
  distributed + seeded, never publicly sold. This is what the lineage we forked
  actually did.
- **Softest securities profile.** The thing regulators care about is a *sale*. No
  sale ≈ the §8.3 tension evaporates — directly answers the heaviest legal flag.
- **No snipe surface, for free.** A curve starts at a cheap floor and rises; that
  cheap tranche is exactly what snipers grab. Seeding the pool directly means
  **we set the opening price** — there is no underpriced tranche to snipe. The
  whole JOHN anti-snipe problem disappears without any special mechanism, and
  governance capture was already off the table (the cap table is ~85% locked
  veJOHN; a bought float can't out-vote it).
- **Almost no new contracts.** Distribute via the existing veNFT/vesting
  contracts → seed a standard ve(3,3) pool via the existing Router → gauge
  (existing Voter) → Minter. Respects the "zero logic changes to core contracts"
  hard rule. A sale (curve or auction) would have meant a new, audited sale
  contract; this needs a distribution script + one seeding tx.

**Sequence:**
1. Phase 1 runs tokenless; the take accumulates a **USDG POL war-chest** (§3).
2. Genesis: mint JOHN → distribute to band/partner/team/treasury (locked) +
   **retro-airdrop to Phase-1 users/LPs/traders** as locked veJOHN.
3. Treasury **seeds the JOHN/USDG ve(3,3) pool at a chosen fair price** with the
   war-chest USDG + JOHN → that's the POL.
4. Open trading → create the JOHN gauge → start the Minter → emissions + voting.

The community gets JOHN two honest ways: **earn it** (airdrop, locked veJOHN) or
**buy it at market** (no privileged cheap entry for anyone, snipers included).

**Considered and rejected (2026-07-17/18):**
- *Public sale via bonding curve* (the old §5b) — keeps dogfooding + a launch
  chart, but reintroduces the cheap-floor snipe surface and sharpens the
  securities profile for no real need (POL is funded by the take, not a raise).
  Its supporting premise — "pump.fun curve-launched its own token" — was false;
  PUMP was a public sale.
- *Public sale via uniform-price auction* — latency-proof, but auctions lost the
  launchpad race (Gnosis dormant): no momentum/chart, can under-clear, and it's
  launchpad-incoherent (an auction isn't our product either). Its one edge
  (capture-resistance) is redundant with the locked cap table.

**What stays from `launchpad-tokenomics.md §5b/§7`:** the sequential model
(JOHN=`Velo.sol` keeps its minter; genesis is a distribution event; emissions
begin after the pool is live) and the community-max, ~zero-insider-float cap
table. **What changes:** the 15% public-float bucket is repurposed (no sale) →
retro airdrop + POL (see §6); POL is seeded from the take war-chest, not a raise.

## 5. Supporting pillars (own tasks)

- **Wash-resistant trending (task #22).** Stop ranking on raw `volEth` (trivially
  washed, net-zero). Rank on **net ETH inflow + unique-buyer/holder growth +
  curve-progress velocity** — data already in Ponder. Kills fake-volume
  manipulation of the board.
- **Infra as moat.** Noxa's frontend fell over under bot spam (they blamed
  "Cloudflare issues"); that was half the death. Guarantee trading never hard-
  depends on our frontend/indexer (chain-read fallback, graceful WS degradation),
  and *market* the edge un-killability. This is task #18 territory.
- **Consumer-UX / gasless — researched 2026-07-18: GREEN on tech, no free sybil
  gate.** ERC-4337 is first-class on RH Chain (EntryPoint v0.6/0.7/0.8; **Alchemy
  Gas Manager** + **ZeroDev** paymasters; **Turnkey/Openfort** embedded wallets
  confirmed live, **Privy** via custom-chain config; **EIP-7702** for existing
  EOAs). So email-login self-custody wallets + dApp-sponsored gas are off-the-shelf
  — **no relayer to build.** Gas token is ETH (we sponsor it; USDG-as-gas is
  unconfirmed). **But RH exposes NO on-chain KYC/identity attestation** — the chain
  is permissionless; KYC lives off-chain (withdrawals / stock tokens) + a sequencer
  sanctions filter; there is no readable "verified human" signal and no dApp uses
  one. So the hoped-for free sybil gate does not exist — abuse control stays
  economic:
  - **Spam creation is net-positive to defend:** the $1 fee (§3b) nets ~$0.985 vs
    ~1.5¢ gas, so sponsoring creation gas *pays us* — not a griefing hole.
  - **Real griefing vector = dust-trade gas-drain** (gas > the 1% fee on tiny
    trades) → paymaster policy: sponsor only above a **min trade size** + **per-
    account rate limits** (Alchemy Gas Manager supports this).
  - **Proof-of-humanity** (World ID / Human Passport) is a *future* lever if spam
    gets bad, not v1 — it adds friction and isn't free.
  - **Corollary:** with no identity gate, all reward/airdrop distribution (incl. the
    JOHN retro-airdrop, §4) must be **activity-weighted / costly-to-fake, never
    per-wallet** — already the Heists model.
  Net: the full magic UX (email login, no gas, no seed phrase) is shippable safely;
  the defense is the $1 fee + paymaster policy + on-chain buy fee, not KYC.
  (Chain-id note: mainnet = 4663, testnet = 46630.)

## 6. Reconciliation with existing docs

| Doc | Change |
|---|---|
| `fair-launch-spec.md` | **Extended.** Decaying buy fee (§3) + a ~$1 creation fee reopening `creationFee = 0` (§3b). Base 1% trade fee + curve params unchanged. |
| `launchpad-tokenomics.md §3` | **Reinforced.** The buy-fee premium is extra take → band; exactly the "volume-weighted in, community-weighted out" model. |
| `launchpad-tokenomics.md §5b` | **Revised (2026-07-18).** No public sale: JOHN is distributed + protocol-seeded, not curve-sold or auctioned. Sequence stands; the 15% float bucket is repurposed. |
| `launchpad-tokenomics.md §7` | **Revised.** The 15% "curve fair launch (public float)" bucket → retro airdrop (~10%, locked veJOHN) + POL (~5%). |
| North-star thesis (memory) | **Revised.** "JOHN fair-launches on its own curve" → "JOHN launches by distribution + protocol-seeded liquidity (no public sale)." |

## 7. Open items / to lock

1. **JOHN launch method — LOCKED (2026-07-18): no public sale, distribute + seed
   (§4).** Remaining sub-decisions: the 15%-float repurpose split (proposed ~10%
   retro airdrop / ~5% POL) and the initial seed price + POL depth (a Phase-2
   execution param — set fair + deep).
2. **Buy-fee params** (start %, window, decay shape) — model + lock in task #20.
3. **Audit scope.** The Track-1 buy fee is new audit surface, first call on the
   take (`tokenomics §8`). JOHN's launch adds ~none (no new sale contract).
4. **Securities profile.** JOHN having no sale *softens* §8.3; the take-to-band
   share is the remaining item to counsel.
5. **Anti-spam creation fee — proposed ~$1 USDG → the band (§3b).** Reopens
   `creationFee = 0`; number tunable. Lock alongside the buy fee (task #20).
6. **Consumer-UX / gasless (§5) — research done (2026-07-18): tech GREEN
   (4337 + Alchemy/ZeroDev + Turnkey/Openfort/Privy), no RH KYC gate.** Open:
   prototype the embedded-wallet + sponsored-gas flow; set the paymaster policy
   (min trade size + per-account rate limits); PoH deferred.

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
