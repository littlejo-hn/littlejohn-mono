#!/usr/bin/env node
'use strict';
/*
 * Season 0 testnet-quest sync — STUB until the testnet deploy exists.
 *
 * Once contracts are live on testnet (chain 46630), this reads each participant's
 * testnet actions (swap / add-LP / lock / vote / claim-test-Heist) and depth-weights
 * them into a `testnet` point score, then POSTs to /api/admin/quest-points.
 *
 * It reuses the on-chain snapshot adapter's primitives (contracts/tools/heists-snapshot):
 * lp depth×time -> testnet LP points, veNFT power -> lock points, plus one-off quest
 * completions (did-swap, did-vote, did-claim) as flat bonuses. Proof-of-interest (poi)
 * comes from bridged/existing-pool signals.
 *
 * Env: SEASON0_API (portal base URL), ADMIN_KEY, TESTNET_RPC, contract addresses.
 * Usage (once live): node sync-testnet.js
 */

const DEPLOYED = false; // flip to true once testnet addresses are filled in

async function main() {
  if (!DEPLOYED) {
    console.error('sync-testnet: stub — testnet not deployed yet. Fill addresses + set DEPLOYED=true after broadcast.');
    console.error('until then, testnet points are 0 and Season 0 runs on mindshare + referrals + proof-of-interest.');
    process.exit(0);
  }
  // TODO after broadcast:
  //  1. read testnet activity via ../../contracts/tools/heists-snapshot (lp/lock) + quest logs
  //  2. build rows = [{ wallet, testnet, poi }]
  //  3. POST rows to `${process.env.SEASON0_API}/api/admin/quest-points` with x-admin-key
  throw new Error('not implemented until testnet is live');
}

main();
