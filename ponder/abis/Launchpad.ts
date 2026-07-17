// LittleJohn launchpad events (see launchpad/src/Launchpad.sol).
export const launchpadAbi = [
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "metadataURI", type: "string", indexed: false },
      { name: "virtualEth", type: "uint256", indexed: false },
      { name: "virtualToken", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Trade",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "trader", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: false },
      { name: "ethAmount", type: "uint256", indexed: false },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "protocolFee", type: "uint256", indexed: false },
      { name: "creatorFee", type: "uint256", indexed: false },
      { name: "virtualEth", type: "uint256", indexed: false },
      { name: "virtualToken", type: "uint256", indexed: false },
      { name: "tokensSold", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Graduated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "ethLiquidity", type: "uint256", indexed: false },
      { name: "tokenLiquidity", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Migrated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "pair", type: "address", indexed: true },
      { name: "ethAdded", type: "uint256", indexed: false },
      { name: "tokensAdded", type: "uint256", indexed: false },
      { name: "migrationFee", type: "uint256", indexed: false },
    ],
  },
] as const;
