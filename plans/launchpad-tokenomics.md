# LittleJohn — Launchpad + DEX tokenomics

_How the tokenless launchpad and the ve(3,3) DEX combine into one economy, and where $JOHN accrues value. Companion to `initial-spec.md` (genesis allocation, emissions, Heists) — this doc adds the launchpad revenue layer and the fee flows. Numbers marked "proposed" are tunable design defaults, not settled._

## 0. The one-sentence model

The **launchpad** is a real-revenue business (fees in hard assets, no token needed). The **DEX** is a ve(3,3) incentive layer governed by **$JOHN**. The launchpad's real cashflow is what backs $JOHN, so JOHN is a claim on actual economic activity, not just circular emissions/bribes. That is the differentiator versus every other ve(3,3) fork and versus UP.

## Lexicon (one set of words everywhere — site, app, docs)

| Term | Means |
|---|---|
| **the take** | the 1% launchpad trade fee on every curve buy/sell — the highwayman's cut of every trade |
| **the band** | the community: lockers, launchers, traders, creators |
| **house cut** | the slice of the take LittleJohn keeps (~20–25%); the rest of the take goes to the band |
| **Bounties** | effort rewards paid out of the take (ANSEM-style: content, referrals, volume, LP, locking) — the evergreen reward board. NOT to be confused with "the board" = the launchpad token board |
| **toll** | ve(3,3) bribes: what a project pays veJOHN voters to attract emissions (unchanged) |
| **Heist** | a seasonal reward campaign — Season 0, 1, … (unchanged) |

Tagline: **"Every trade pays the take. The band splits it — the house keeps a cut. Do the work, claim a Bounty."**

## 1. Two revenue engines, two different "we"

Critical distinction people get wrong:

| Engine | Who pays | What's earned | Who receives it |
|---|---|---|---|
| **Launchpad** | Anyone launching/trading on a bonding curve | Creation fee + curve trade fee + graduation fee, in **gas/stable (hard assets)** | **The protocol treasury** (exogenous, real money) |
| **DEX (ve(3,3))** | Swappers on graduated/AMM pools | 100% of trading fees + bribes | **veJOHN lockers / voters** (NOT the treasury) |

So "we earn LP fees" is misleading: in ve(3,3), LP fees go entirely to lockers by design (the community already gets 100%). The **new** money the launchpad introduces is the hard-asset fee stream that flows to the **treasury** — that is the lever we control and can be generous with.

## 2. Launchpad fee sources (proposed)

| Fee | Proposed default | Notes |
|---|---|---|
| **Creation fee** | small flat (~1–2 USDG equiv, or a little gas) | anti-spam + revenue; keep it low, launching should feel free |
| **Curve trade fee** | **1%** on every curve buy/sell (pump.fun standard) | the big one; scales with memecoin volume |
| **Graduation fee** | flat + a slice of migrated liquidity | one-time when a coin migrates to the DEX; partly seeds the JOHN-side pool |

The auto-toggling swap means users never see which venue they hit: pre-graduation the trade routes to the bonding curve (fee → treasury), post-graduation to the AMM pool (fee → veJOHN lockers). One box, two fee destinations.

## 3. The take — the give-back engine

The take (the 1% curve fee) is the real-money generosity lever, and it's better than the token itself: token generosity dilutes (death-spiral risk), the take is real money that only exists *because* of real activity. It's recycled back to the band as a **pre-committed, on-chain, published split** — most to the band, a small house cut. The legibility IS the weapon: *"the house keeps ~20%, the band gets the rest, every epoch, verifiable"* turns a fee schedule into a movement (and inverts the resentment pump.fun created by keeping 100%).

Who's "the rich" being robbed — honest, not a slogan: the take is **volume-weighted going in** (whales, bots, snipers doing millions in volume pay the overwhelming majority of it) and **community-weighted coming out** (redistributed to the aligned band). Everyone who trades pays the take; what's Robin Hood is the *redistribution* and the *transparency of the keep*, not a claim that users are exempt.

Phase it:

**Phase 1 (launchpad live, tokenless):** the take → treasury, but the treasury spends it *on the band*. House-cut waterfall, in order: **audit** (first call — the curve custodies user funds) → security/opsec → POL war-chest (for JOHN's fair-launch graduation) → disclosed team salary. Everything above that floor → the band, as **Bounties** (creator/referral/trader rewards). Even pre-token, the take funds community growth.

**Phase 2 (JOHN + ve(3,3) live):** the take splits (proposed, tunable) — **~20–25% house cut**, the rest to the band, deployed as:
- **Bounties (the majority)** — evergreen ANSEM-style effort rewards. The differentiator (see §4).
- **veJOHN locker yield** — real *hard-asset* yield, on top of the DEX fees/tolls lockers already get. Makes locking JOHN genuinely cashflow-bearing from exogenous activity — no other ve(3,3) fork can match this.
- **a slice → JOHN buyback** — value accrual + the LetsBonk-style "value returns vs extraction" narrative that demonstrably pumps the token.

Guardrails: the split is a **% of actual take** (variable), never a fixed promised yield — revenue is cyclical (frenzy → drought), so the audit + runway floor comes first and no fixed obligations get built on peak-frenzy revenue.

The principle: **generous with the take (real money), disciplined with emissions.**

## 4. What "very generous" should and shouldn't mean

| Lever | Stance | Rationale |
|---|---|---|
| The take → the band (Bounties + locker yield) | **Crank it** | Real money, sustainable, no dilution. Makes locking JOHN yield-bearing from exogenous activity; no other ve(3,3) fork can match this. |
| Community allocation / fair distribution | **Max it** | Robin Hood thesis; solo anon, no VCs to feed (the superpower). Community-max cap table, near-zero insider float (§7, Hyperliquid template). |
| JOHN emissions / inflation | **Disciplined** | Inflation generosity = MMF's fade + UP's mercenary problem. Real revenue does NOT make inflation affordable; it prints faster. Keep the spec's ~1%/epoch decay + fee-vs-emissions dashboard + stage gates. |
| Flat fee cut / cheaper launchpad | **Don't bother** | Users aren't fee-sensitive (below). A discount is a wasted lever. |

### Deploy the take as Bounties — not a discount, not a passive buyback

The competitive read (verified 2026-07-15) forces this:

1. **Users are not fee-sensitive.** pump.fun kept a **full 1%**, was openly extractive, and still won; cheaper/give-back rivals (LetsBonk) only *briefly* flipped it, and pump.fun clawed share back with **buybacks + a creator program + brand**, not by cutting fees. Memecoin degens chase 100x-or-zero; 1% is rounding error. Volume follows attention, liquidity, and winners — not fee optimization. So a **flat fee cut is wasted**.
2. **Passive give-back is already commoditized on Robinhood Chain.** The Furnace does buyback-and-burn ($FURNACE, 0.5%/trade); Ouroboros does hold-to-earn reflections; creator-fee-for-life is table stakes across NOXA/ArrowPad/etc. Copying passive redistribution = undifferentiated, and it rewards passive whales with zero eyeballs.
3. **ANSEM-style effort Bounties are the differentiated move.** They reward *work* (content, referrals, volume, LP, locking), the rewards **are** the content (eyeballs), they shape the behavior that grows the platform, and they make winning legible (the stated moat). ANSEM proved the virality; a silent fee discount can never go viral.
   - **Recommended structure — hybrid:** majority on objective on-chain effort metrics (referral volume, LP depth×time, lock duration — sybil-resistant, trustless, legible) + a curated discretionary tier for content/quality. This is exactly the Heists scoring model (on-chain 70% / curated 30%), now *evergreen-funded by the take* instead of only a fixed genesis bucket.
   - Keep a **slice for JOHN buyback / locker yield** anyway — that captures the LetsBonk "value returns" narrative that demonstrably pumps the token.

**The full-stack point:** because fee-giveback is now table stakes on RH Chain, it cannot be the wedge on its own. The moat is the **full stack** — launchpad + ve(3,3) graduation venue + brand/community + Bounties + JOHN governing the whole economy. The giveback is table stakes; the stack is the wedge.

## 4b. Founder economics — generous is *how* you get paid

Max generosity to the band is not charity; it's the mechanism that makes the founder's stake worth something. A big % of a resented, dumped token (the pump.fun-ICO outcome) is worth nothing; a modest % of a beloved, revenue-backed token (the Hyperliquid outcome) is generational. Three streams:

1. **Token slice — the lottery ticket.** Team **15%** (solo anon doing every role, no VC — *leaner per head* than Hyperliquid's ~23% team), locked-heavy: 70% max-locked veJOHN at TGE, 30% 2y vest / 6m cliff. Every generous choice raises this number, not lowers it.
2. **House cut — the recurring floor / salary.** ~20–25% of the take, in hard assets, forever, scaling with volume. Pays **regardless of whether the moonshot hits**. Funds the audit → ops → POL → a disclosed salary (with no LBP raise anymore, the house cut is how the founder and ops get paid — honest and fine to state openly).
3. **ve income.** The locked team tokens earn fees + tolls + rebase every epoch from week one.

Structure = a **floor** (house cut) + a **lottery ticket** (token slice): not gambling rent on the moonshot. All numbers tunable + to counsel (fee-share sharpens the securities profile — see §8).

## 5. The combined flywheel

1. Launchpad is easy + branded → people launch coins (tokenless, low friction).
2. Curve trading → **real fee revenue** in hard assets → treasury.
3. Coins graduate → become DEX/AMM pools.
4. veJOHN lockers vote emissions to the graduated pools worth deepening → those pools get liquidity → better prices → more volume.
5. Lockers earn: DEX fees + bribes **+ a share of launchpad revenue** → locking JOHN is attractive → JOHN leaves float → price support.
6. Deeper graduated liquidity + attractive launchpad → more launches → back to step 1.

JOHN's job in this loop: **decide which graduated memecoins deserve deep liquidity, and capture a cut of the whole economy's cashflow for doing so.** It is not needed to *use* the launchpad — it governs and monetizes the graduation economy.

## 5b. How JOHN launches — fair launch on our own curve (2026-07-15)

JOHN does **not** launch via an LBP. It fair-launches on LittleJohn's own launchpad — the same curve every memecoin uses — then migrates to the DEX. On-brand ("no VC, no presale, JOHN went through the same curve you did") and it's pump.fun's own move (their token → PumpSwap as the graduation venue).

**The reconciliation people trip on — "curve = fixed supply, but JOHN needs emissions":** these do not conflict, they're sequential.
- pump.fun tokens are fixed-supply because *their token contract has no minter*. That's a property of the token, not of bonding curves.
- JOHN's token is `Velo.sol` — a mintable ERC20 whose `minter` role is the Minter contract. Selling a batch of it on a curve doesn't remove the minter; the curve doesn't know or care.
- So **the curve is a distribution event (it replaces the LBP), not a supply cap.** Emissions are a separate, later, additive stream from the Minter that switches on *after* migration. Fixed-on-the-curve and inflationary-after-migration are the same token at two points in time.

**The one launchpad requirement:** the standard Virtuals `fun` / pump.fun flow *mints a fresh fixed token* per launch. To launch JOHN this way the launchpad must support the other mode — **sell a pre-deployed token you hand it** (JOHN=`Velo.sol`, keeps its minter). A "launch your own token on a curve" feature; a modification to the mint-fresh path, not a large one.

**Sequence:**
1. Deploy the ve(3,3) system (JOHN=`Velo.sol`, VotingEscrow, Voter, Minter, gauges). **Minter dormant.**
2. Mint genesis. The **public-float** tranche → a bonding-curve sale on our launchpad (the fair launch). Other buckets (Heists→locked veJOHN, partner veNFTs, team vest) mint to their existing locked/vesting contracts.
3. Public buys JOHN on the curve → price discovery. No LBP, no presale.
4. Curve fills → **graduates into the JOHN/USDG ve(3,3) pool** (our venue, not Uniswap); raised quote asset becomes POL.
5. Create the JOHN gauge → **start the Minter** → emissions + veJOHN voting live.

**Hybrid vs pure fair launch — leaning hybrid (see §7 table):** how much of the 500M genesis flows through the curve vs stays pre-allocated.
- *Pure:* ~all supply curve-sold, buckets funded from emissions only. Maximal fairness/legal cleanliness, but launches with no bootstrapped voting base and no POL.
- *Hybrid (recommended, §7):* the curve carries a **15% public-float tranche** (up from the old 5% LBP); Heists/partner/team keep their locked buckets; POL comes from graduation. Keeps the ve(3,3) day-one bootstrap while the public float is genuinely curve-discovered. Exact %s still tunable + to counsel.

Note: JOHN launching on the launchpad depends on the launchpad (Virtuals `fun` fork) being built + **audited** first — consistent with launchpad-first phasing below.

## 6. Phasing (JOHN is not a launch blocker)

- **Phase 1:** launchpad + DEX pools live, **tokenless**, fees → treasury. Legally cleanest, fastest, revenue from day one. Ships first.
- **Phase 2:** JOHN TGE + emissions on. Heists reward the Phase-1 launchers/traders with locked veJOHN → they become the founding voters. Launchpad fee-share to lockers switches on.

DEX pools work as plain AMM the entire time; JOHN emissions are a switch flipped in Phase 2. So JOHN never gates the launch.

## 7. Genesis allocation — the community-max cap table (Hyperliquid template)

The pivot changes two buckets from the original `initial-spec.md` §2 table:
- **LBP (5%) → replaced by the fair-launch curve tranche** (§5b): the public float is now curve-discovered, not sold in an LBP.
- **POL (10%) → seeded from curve graduation**, not a pre-mint bucket: the public's curve buys *become* the JOHN/USDG pool.

Recommended 500M split (**proposed — tunable + to counsel**):

| Bucket | % | Form |
|---|---|---|
| Heists / community (the band) | **45%** | locked veJOHN (1yr min) — rewards + voting base + eyeball engine |
| Curve fair launch (public float) | **15%** | liquid — open price discovery; graduation → POL |
| Partner veNFTs | **15%** | 4y-locked — aligned voters, tolls, cross-protocol depth |
| Team | **15%** | 70% max-locked veJOHN / 30% 2y vest, 6m cliff |
| Treasury / ops / audit | **10%** | liquid — audit (mandatory), self-bribes, runway |

Principle: **near-zero insider float, no VC (the superpower), earned/locked community as large as possible.** Emissions schedule unchanged; the take is a revenue layer on top, not a genesis bucket.

## 8. Risks / open items

1. **Audit is now mandatory, not optional.** The bonding curve custodies user funds — the "ship on AI review" stance that was fine for the byte-identical Velodrome fork does NOT extend to the launchpad. First call on treasury.
2. **Revenue is cyclical.** Curve fees track the memecoin cycle. Don't build fixed obligations (buybacks, guaranteed yields) on peak-frenzy revenue.
3. **Securities tension sharpens.** The more JOHN reads as "a share of protocol revenue," the more it looks like a security → sharpens the MAS/DTSP concern flagged in the spec. The fee-share % must go to counsel before it's finalized. There is a real trade-off: stronger value accrual = hotter legal profile.
4. **The take split + genesis %s are proposed, not settled.** §3's ~20–25% house cut, §7's 45/15/15/15/10, and the Bounties/locker/buyback deployment are starting points to model, not commitments.
5. **Fee-giveback is table stakes, not a moat.** Competitors on RH Chain (The Furnace, Ouroboros) already recycle fees. Do not pitch "we give fees back" as the wedge — the wedge is the full stack (§4). The Bounties *mechanism* (effort-rewards, legible, evergreen) is the differentiated execution of a now-common idea.
