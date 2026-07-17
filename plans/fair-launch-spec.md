# LittleJohn fair-launch mechanics — LOCKED 2026-07-16

How a coin launches, trades, and graduates on LittleJohn. Locked with Yuxi on
2026-07-16. Params live in `launchpad/script/Deploy.s.sol` and are the deploy
defaults; the contract (`launchpad/src/Launchpad.sol`) is already parameterized
for all of them, so locking = setting these values (no logic changes needed).

## Model: pure fair launch (coins), JOHN deferred to Phase 2

Coins on the platform fair-launch pump.fun-style. $JOHN's own launch + the
fee-giveback flywheel (fees -> veJOHN lockers/bounties) is Phase 2 and lives in a
separate doc; the platform ships tokenless first.

## Invariants (the definition of "fair launch" — non-negotiable)

1. No presale, no team allocation, no pre-mine. 100% of the 1B supply is either
   sold on the curve (793.1M) or seeded into the burned LP (206.9M).
2. The creator gets zero special tokens. They may buy on the same curve as anyone
   (including atomically at creation), at the same price. No discount, no cap.
3. On graduation, all raised ETH + 206.9M tokens seed a LittleJohn ve(3,3)
   volatile pool, and the LP tokens are burned to `0x…dEaD`. Un-ruggable: nobody,
   including us, can pull that liquidity.
4. Curve math is pump.fun-exact: constant product on virtual reserves,
   TOTAL_SUPPLY 1B, CURVE_SUPPLY 793.1M, INITIAL_VIRTUAL_TOKEN 1.073B.

## Locked parameters

| Param | Value | Notes |
|---|---|---|
| `initialVirtualEth` | **1.35 ETH** | Sets the curve's starting price + graduation raise. |
| Graduation raise | **~3.83 ETH** | = initialVirtualEth × 2.8335 (curve geometry). |
| Graduation mcap | **~18.5 ETH (~$65k @ $3.5k ETH)** | = initialVirtualEth × 13.696. pump.fun parity. |
| Start mcap | **~1.26 ETH (~$4.4k)** | = initialVirtualEth × 0.932. |
| Trade fee (total) | **1.00%** | Charged on every curve buy/sell. |
| — protocol share | **0.60%** (60 bps) | To `feeRecipient` (the 2-of-3 Safe at mainnet). |
| — creator share | **0.40%** (40 bps) | To the coin creator. Growth wedge: creators earn more here. |
| `creationFee` | **0** | Free creation to maximize launch volume on a young platform. |
| `migrationFee` | **0** | We migrate to our own DEX; zero skim = deepest seed pool. |
| Dev first-buy cap | **none** | pump.fun-style. Revisit if self-snipe-and-dump hurts rep. |

Curve geometry (why the multipliers): virtualToken falls from 1.073B to
1.073B − 793.1M = 279.9M as the curve sells out. k = initialVirtualEth × 1.073B is
constant, so at graduation virtualEth = initialVirtualEth × (1.073B / 279.9M) =
× 3.8335. Raise = that minus the initial = × 2.8335. Grad price × 1B supply gives
mcap = × 13.696.

## Decisions considered and rejected (2026-07-16)

- **Lower graduation bar (~$30k):** rejected — thin post-grad pools dump harder;
  parity's deeper LP protects holders and reads as credible.
- **1.25% / 0.8% trade fee:** rejected — 1% is the number degens know; matching it
  while owning the DEX is the cleaner story than over/undercutting.
- **Dev first-buy cap:** rejected for launch — ships pump.fun-style. NOTE: this is
  the one lever that reopens if devs snipe-and-dump; adding a cap later is a
  contract change (new audit surface), so watch early coins for the pattern.
- **Non-zero migration fee:** rejected — undercuts the "deep pools" differentiator
  for ~$700/graduation; take revenue via trade fees instead.

## Revenue model (launch, tokenless)

Protocol income = 0.60% of all curve volume, to the fee Safe. No creation or
migration revenue by design. At mainnet, `feeRecipient` = the 2-of-3 Safe (task
#9). Phase 2 routes a share of this to veJOHN/bounties (separate doc).

## Follow-ups

- Redeploy testnet launchpad with locked params (or `setConfig` the live proxy)
  so the frontend/indexer reflect 1% fee + 1.35 ETH curve before UI polish.
- Mainnet deploy uses these defaults; `feeRecipient` must be the Safe, not an EOA.
- Watch early graduations for dev snipe-and-dump; the cap decision can reopen.
