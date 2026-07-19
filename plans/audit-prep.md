# LittleJohn — external audit package (2026-07-19)

Hand-off doc for an external auditor. Contracts are frozen for audit right before
mainnet deploy; this is the scope, trust model, invariants, threat model, and
known issues to review against.

## 1. Scope & priorities

| Priority | Contracts | Why | LOC |
|---|---|---|---|
| **P0** | `launchpad/src/Launchpad.sol` | Bonding curve; **custodies user ETH**. New code, not a fork. | 331 |
| **P0** | `launchpad/src/LaunchToken.sol` | Per-launch ERC20 (beacon proxy); transfer-lock is a security control. | 36 |
| **P1** | `contracts/contracts/RewardsDistributor.sol` (Heists) | Lock-only Merkle distributor; owner writes roots. | ~ |
| **P2** | ve(3,3) core (Pool/Pair, Router, Voter, VotingEscrow, Minter, gauges) | **Velodrome V1 fork**, byte-identical except brand strings + deploy params. | fork |
| out | frontend, Ponder indexer, `tools/heists-*` (off-chain scorers) | no user funds; off-chain | — |

**Diff-vs-upstream transparency (P2):** `git diff master --stat` in `contracts/` =
**+1683 / -11 across 31 files, almost entirely additive** (new tests + off-chain
tooling + the isolated Heists distributor). Core ve(3,3) logic is unchanged from
Velodrome V1 `de6b2a19`; the only edits to existing files are brand strings and
2 test files. Auditors should confirm the core diff is brand/params only.

## 2. Architecture (P0 flow)

1. `createToken` deploys a `LaunchToken` (BeaconProxy), mints TOTAL_SUPPLY (1B) to
   the launchpad, snapshots fee + anti-snipe params into a per-token `Curve`.
2. `buy`/`sell` trade against a constant-product curve on **virtual reserves**
   (`virtualEth * virtualToken = k`). 793.1M sold on the curve; fees split
   protocol/creator; a launch-window anti-snipe premium decays into the buy fee.
3. When `tokensSold == CURVE_SUPPLY`, `_graduate` fires **atomically inside the
   final buy**: marks the token graduated (unlocks transfers), then `_migrate`
   adds the remaining 206.9M + raised ETH to a LittleJohn ve(3,3) volatile pool
   via the Router and **burns the LP to `0x…dEaD`** (un-ruggable).

## 3. Trust model / admin powers (state honestly in public docs)

- Launchpad is **UUPS-upgradeable + Ownable2Step**. **The owner can upgrade to an
  arbitrary implementation → the upgrade path is an admin path to curve ETH.** At
  mainnet the owner MUST be the 2-of-3 Safe (task #9); do NOT market as
  un-ruggable while upgradeable — disclose owner powers.
- `setConfig` (onlyOwner) changes go-forward defaults only; **per-launch economics
  (fees, anti-snipe, initial reserves) are snapshotted at creation**, so a config
  change can't alter a live curve.
- Heists distributor: owner writes Merkle roots and can self-allocate → trust =
  multisig + frozen roots + min-lock (see contracts/CLAUDE.md lesson).

## 4. Invariants to verify

1. **Curve solvency:** contract ETH held ≥ total sell-back obligation, always.
   (Fuzz/invariant tested: `SolvencyInvariant`, 128k calls, 0 reverts.)
2. **Transfer lock:** pre-graduation, every `LaunchToken` transfer has the
   launchpad on one side — no third party can hold/move curve tokens (blocks rogue
   side-pools). Enforced in `LaunchToken._update`.
3. **LP burned:** graduation LP always goes to `DEAD`; nobody (incl. us) can pull
   migrated liquidity.
4. **Fee bounds:** base `protocolFeeBps + creatorFeeBps ≤ MAX_FEE_BPS (500)`. The
   anti-snipe premium is **deliberately outside** this cap (launch-window
   mechanism, `snipeStartBps ≤ BPS`), routed 100% to the band, never the creator.
5. **Anti-snipe decay:** premium = `snipeStartBps` at t0, linear to 0 over
   `snipeWindow`, then 0 forever; snapshotted per launch. `quoteBuy` mirrors it.
6. **Rounding is protocol-favouring** (fees ceil'd, ETH-out floors).

## 5. Threat model — please attack these

- **Graduation / flash-loan extraction (the based-hood class).** On 2026-07-19 a
  peer launchpad (Based Alpha) was drained via **concentrated bid-side "price
  support" liquidity** ([0.5P, P] ETH wall): buy curve → graduate → dump into the
  concentrated ETH pot. **Confirm LittleJohn is immune:** we seed a single
  constant-product pool at the graduation price and burn the LP — no concentrated
  bid, no slot0/spot read, symmetric slippage makes buy-graduate-dump
  unprofitable. Verify this holds.
- **Migration liquidity add uses `amountMin = 0`.** Safe *because* the transfer
  lock (invariant 2) means the target pair can't be pre-seeded/skewed; only an
  unrecoverable WETH donation is possible (LP burns to DEAD). Verify.
- **Sniping / sybil:** anti-snipe buy premium makes block-0 entry unprofitable;
  confirm no bypass (e.g. via the graduating-buy clamp, quote/execute mismatch).
- **Reentrancy:** storage-based `nonReentrant` on buy/sell/graduate/claim; the
  graduation frame makes external Router/NPM calls. Verify no reentrancy or
  cross-function reentry into buy/sell during migration.
- **Rounding/precision:** exact-boundary graduating buy (`charged > ethSent`
  absorb path), ceil/floor dust — confirm the curve can't be made insolvent.
- **Admin key abuse:** enumerate everything a malicious owner can do.

## 6. Known issues / accepted risks (disclosed)

1. **Storage layout changed** (anti-snipe params + Curve struct fields) → mainnet
   is a **fresh deploy**, not an in-place upgrade of the current testnet proxy.
2. **UUPS owner = admin path to funds** — accepted, mitigated by the Safe + honest
   disclosure. Not marketed as un-ruggable.
3. **Anti-snipe premium is outside MAX_FEE_BPS** by design (bounded by `BPS`).
4. **RH Chain is a single centralized sequencer** — external, out of scope.

## 7. Test coverage

- Launchpad: **13/13** green incl. the 128k-call solvency invariant + 4 anti-snipe
  tests (t0 taxed ~80%, decays to 1%, sells clean, quote matches).
- ve(3,3) core: **58/58** (upstream Velodrome suite, unchanged).
- Heists distributor: **71/71**. Snapshot integral: 8. Season scorer: 7.

## 8. Deployment params (frozen for audit)

TOTAL_SUPPLY 1B · CURVE_SUPPLY 793.1M · LP_SUPPLY 206.9M · INITIAL_VIRTUAL_TOKEN
1.073B · initialVirtualEth 1.35 ETH · trade fee 1% (60 protocol / 40 creator) ·
creationFee ~$1-equiv wei (owner-settable) · migrationFee 0 · anti-snipe
snipeStartBps 7900 (+79%, ~80% total at t0) decaying over snipeWindow 120s.
Testnet launchpad proxy: `0xbABeA7f2e54dF349De3D743B9d55C33E6484cBD3` (chain 46630).

## 9. References
- `plans/fair-launch-spec.md` (curve params, locked) · `plans/antisnipe-design.md`
  (buy fee + creation fee rationale) · `plans/launchpad-tokenomics.md` (JOHN, take)
- `contracts/CLAUDE.md` (fork rules, diff-transparency) · `CLAUDE.md` Lessons
  (concentrated-bid-liquidity, Merkle-owner-trust)
