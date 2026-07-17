#!/usr/bin/env bash
# One-command local dev data.
#
# The app can point at a local anvil fork of the Robinhood testnet via
# VITE_RPC_URL=http://127.0.0.1:8545 (see app/src/lib/chains.ts). A long-running
# fork drifts: the remote prunes the state at the pinned fork block, so writes
# start failing with "missing trie node". This script gives you a CLEAN fork and
# reseeds a demo token with spread-out trades, so the chart/feed always have data.
#
# Usage (from anywhere):  launchpad/harness/dev-seed.sh
# Then reload the app (started with VITE_RPC_URL=http://127.0.0.1:8545).
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")"

FORK_URL="${FORK_URL:-https://rpc.testnet.chain.robinhood.com}"
RPC=http://127.0.0.1:8545

echo "→ restarting a fresh anvil fork (clears pruned/stale state)…"
pkill -f "anvil --fork-url" 2>/dev/null || true
sleep 2
anvil --fork-url "$FORK_URL" --port 8545 --silent > /tmp/anvil-lj.log 2>&1 &
echo "  anvil pid $!  (log: /tmp/anvil-lj.log)"

echo "→ waiting for anvil to accept requests…"
for _ in $(seq 1 40); do
  if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "${ready:-}" = 1 ] || { echo "anvil did not come up — see /tmp/anvil-lj.log"; exit 1; }

echo "→ seeding a demo token + trade stream (viem resolves via app/node_modules)…"
( cd ../../app && node ../launchpad/harness/gen-trades.mjs )

echo "✓ done. Reload the app (VITE_RPC_URL=$RPC) and open the CHART token."
