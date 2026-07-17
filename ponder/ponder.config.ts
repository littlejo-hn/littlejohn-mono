import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";
import { launchpadAbi } from "./abis/Launchpad";
import { pairAbi } from "./abis/Pair";

// Fail fast in a deployed environment rather than silently polling localhost.
const deployed = process.env.NODE_ENV === "production" || !!process.env.RENDER;
if (deployed && !process.env.PONDER_RPC_URL) {
  throw new Error(
    "PONDER_RPC_URL is not set. Configure the indexer service with one or more " +
      "RPC endpoints (comma-separated for failover).",
  );
}

// RPC failover: PONDER_RPC_URL may be a comma-separated list. Ponder load-balances
// across them and fails over on error, so one provider outage degrades throughput
// instead of stalling the sync. Recommended: Alchemy, then a second provider, then
// the public RH RPC as a free tertiary.
const rpcUrls = (process.env.PONDER_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const LAUNCHPAD = (process.env.LAUNCHPAD_ADDRESS ??
  "0xbABeA7f2e54dF349De3D743B9d55C33E6484cBD3") as `0x${string}`;
const START_BLOCK = Number(process.env.LAUNCHPAD_START_BLOCK ?? 90397141);

export default createConfig({
  chains: {
    robinhood: {
      id: Number(process.env.PONDER_CHAIN_ID ?? 46630),
      rpc: rpcUrls.length > 1 ? rpcUrls : rpcUrls[0],
      pollingInterval: Number(process.env.PONDER_POLLING_INTERVAL_MS ?? 1_000),
    },
  },
  contracts: {
    // Curve activity: creations, trades, graduation, migration.
    Launchpad: {
      chain: "robinhood",
      abi: launchpadAbi,
      address: LAUNCHPAD,
      startBlock: START_BLOCK,
    },
    // Holder balances: every LaunchToken the launchpad creates emits standard
    // ERC20 Transfers. The factory pattern subscribes to all of them at once.
    LaunchToken: {
      chain: "robinhood",
      abi: [
        {
          type: "event",
          name: "Transfer",
          inputs: [
            { name: "from", type: "address", indexed: true },
            { name: "to", type: "address", indexed: true },
            { name: "value", type: "uint256", indexed: false },
          ],
        },
      ] as const,
      address: factory({
        address: LAUNCHPAD,
        event: parseAbiItem(
          "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, string metadataURI, uint256 virtualEth, uint256 virtualToken)",
        ),
        parameter: "token",
      }),
      startBlock: START_BLOCK,
    },
    // Post-graduation trading: each Velodrome pair the launchpad migrates into is
    // watched via the Migrated event, so only launchpad-token pairs are indexed
    // (no need to filter the whole DEX factory).
    DexPair: {
      chain: "robinhood",
      abi: pairAbi,
      address: factory({
        address: LAUNCHPAD,
        event: parseAbiItem(
          "event Migrated(address indexed token, address indexed pair, uint256 ethAdded, uint256 tokensAdded, uint256 migrationFee)",
        ),
        parameter: "pair",
      }),
      startBlock: START_BLOCK,
    },
  },
});
