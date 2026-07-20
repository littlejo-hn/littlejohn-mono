# Smart-money engine → copy-trade product (RH Chain) — 2026-07-20

## The reframe (from competitive research)
Analytics-only is **commoditized and half-taken** — Nansen just collapsed its price
$999 → $49/mo, and thin RH-native trackers already exist. The un-taken, high-value
slot is **smart-money discovery welded to one-click copy-trade + execution**,
monetized on **trading fees** (GMGN's model: ~$94M/yr rev, ~$60M profit).

So the product is **not** "a smart-money dashboard." It's **"find the winning
wallets → copy them one-click,"** with the money in the *execution fee* → the band.
The analytics is the free top-of-funnel; the copy-trade is the product + the money.

## Competitive landscape (who has smart-money + RH coverage)

| Platform | Smart-money features | RH Chain | Money model |
|---|---|---|---|
| **GMGN** | wallet PnL/win-rate, **copy-trade**, live smart-money feed, alerts | **PARTIAL** — RH wallet-address pages + AI reports live, but RH **not** in its Trenches tab, copy-trade on RH unconfirmed | **1%/trade** (~$94M/yr). The template + the threat |
| **HoodScan** (fromthetrenches) | RH-native: PnL leaderboard, smart-wallet net-flow, live feed. **No copy-trade, no per-wallet alerts** | **YES, exclusive** | opaque "Premium" via TG bot |
| **Cognitive OS** | RH-native: ~400 wallets, signal engines. Signal-only | YES, exclusive | undisclosed |
| **Cielo** | wallet feed + alerts, 30+ chains, TG bot | **YES** (generic, not RH-tuned) | $59 / $199 mo |
| **Nansen** | Smart Money labels, God Mode | **NO** (not announced) | $49–69/mo (slashed) |
| **Arkham / DeBank / Zapper** | labels / portfolio | **NO** | data/API |
| **BullX / Photon / Axiom / Trojan** | copy-trade terminals | **NO** (SOL/EVM, not RH) | trading fees |
| **Zerion / Dune** | wallet data / DIY dashboards | **YES (data/API)** | API / seats |

**Verdict: contested-but-open.** The RH-native slot is *squatted but thin* (HoodScan
has a leaderboard, no copy-trade/alerts). **Nobody native has shipped the full stack:
PnL ranking + real-time alerts + one-click copy-trade + execution.** That slot is open.

**The clock = GMGN.** It has the winning template and has *started* on RH (wallet
pages, AI reports) but hasn't promoted RH to a full Trenches tab with copy-trade. **If
it flips that on, it takes the lane by default.** Window = weeks/months. Speed matters.

## The wedge / moat
1. **RH-native depth** — generalists treat RH as a tab; GMGN hasn't landed; natives are thin.
2. **You own execution** — your DEX/swap *is* the copy-trade execution + fee engine. Discovery brings users; copy-trade routes through your swap; you take the fee. **This is where the frozen pad/DEX finally earns its keep.**
3. **Fee → the band** (giveback thesis): *"GMGN keeps the 1%; we give it to the band."* On-brand differentiation on the exact axis GMGN is extractive.
4. **Speed** — a fast solo builder can ship the full stack before GMGN promotes RH.

## Architecture (4 layers)
1. **Discovery data (the moat).** Index chain-wide DEX swaps → per-wallet trade graph → PnL. Can *bootstrap* on Zerion/Cielo API for a fast leaderboard v0, but the moat is your own indexing (latency + depth + the labels others can't wrap).
2. **PnL + smart-money scoring.** Realized+unrealized PnL, win-rate, ROI, **early-entry**, consistency. Filter out wash/insider/lucky. Tiers: Smart Money / Top Trader / Early / Whale. Scoring quality = the differentiator vs a raw leaderboard.
3. **Signal + alerts (push, free top-of-funnel).** Reuse the firehose: labeled wallet buys → *"🟢 Smart money aped $X — up $240k, 71% win."* → TG bot + auto-X (self-distribution). This is HoodScan's gap (no alerts).
4. **Copy-trade + execution (the product + the money).** Non-custodial one-click copy (session keys / the gasless AA stack we researched) → route the trade through your swap → take the fee → the band. This is HoodScan's *and* the RH-native field's gap, and the only proven money model.

## Monetization
- **Copy-trade execution fee** (GMGN ~1%, the *only* model shown to make real money) → split house cut / the band. This is the whole revenue model.
- **Analytics + alerts = FREE** top-of-funnel. Do not try to sell analytics subscriptions — Nansen's $999→$49 collapse proves that business is commoditized.

## Honest risks
1. **The clock** — GMGN could promote RH to a full tab and take the lane. You're racing.
2. **Copy-trade execution is hard** — matching the smart wallet's entry with low latency, slippage, non-custodial signing, and the pads' own anti-snipe fees all fight you. This is the real engineering risk.
3. **PnL accuracy** — cost-basis edge cases (transfers/airdrops = no basis → flag `basisIncomplete`, partial sells, wash). "Right enough to rank," not accounting-grade.
4. **Still bets on RH Chain** surviving the September gas-subsidy cliff. If the chain craters, there's no smart money to follow.

## Effort + build order (weeks, not days)
1. **Discovery** — index chain-wide swaps → wallet PnL → ranking (the moat). Optional v0: bootstrap Zerion/Cielo API for a leaderboard while your own index catches up.
2. **Alerts (push)** — free top-of-funnel + self-distribution; leapfrogs HoodScan's gap.
3. **Copy-trade + execution** — route through your swap, fee → band. The hard, defensible, *monetizing* layer, and it gives your frozen DEX a job.

## Reuses your stack (~55%)
Ponder indexer (discovery) · **your DEX/swap (execution — the frozen engine's purpose)** · firehose (alerts) · edge infra + board UI · gasless/AA research (session-key copy-trade) · brand + giveback thesis. **New:** chain-wide swap indexing, PnL/scoring engine, copy-trade execution + matching.
