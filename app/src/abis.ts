import { parseAbi } from 'viem'

export const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function metadataURI() view returns (string)',
])

// Velodrome V1 Router (unchanged in our fork). `route` is (from, to, stable).
export const routerAbi = parseAbi([
  'function pairFor(address tokenA, address tokenB, bool stable) view returns (address pair)',
  'function getAmountsOut(uint256 amountIn, (address from, address to, bool stable)[] routes) view returns (uint256[] amounts)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, (address from, address to, bool stable)[] routes, address to, uint256 deadline) payable returns (uint256[] amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable)[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
  'function quoteAddLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired) view returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
  'function addLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, bool stable, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)',
])

export const escrowAbi = parseAbi([
  'function create_lock(uint256 value, uint256 lockDuration) returns (uint256)',
  'function increase_amount(uint256 tokenId, uint256 value)',
  'function increase_unlock_time(uint256 tokenId, uint256 lockDuration)',
  'function withdraw(uint256 tokenId)',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function balanceOfNFT(uint256 tokenId) view returns (uint256)',
  'function locked(uint256 tokenId) view returns (int128 amount, uint256 end)',
])

export const voterAbi = parseAbi([
  'function vote(uint256 tokenId, address[] poolVote, uint256[] weights)',
  'function reset(uint256 tokenId)',
  'function length() view returns (uint256)',
  'function pools(uint256) view returns (address)',
  'function gauges(address pool) view returns (address)',
  'function isAlive(address gauge) view returns (bool)',
])

// Velodrome V1 Pair (LP token). metadata() returns reserves + token order in one call.
export const pairAbi = parseAbi([
  'function metadata() view returns (uint256 dec0, uint256 dec1, uint256 r0, uint256 r1, bool st, address t0, address t1)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'event Sync(uint256 reserve0, uint256 reserve1)',
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
])

export const gaugeAbi = parseAbi([
  'function deposit(uint256 amount, uint256 tokenId)',
  'function withdraw(uint256 amount)',
  'function getReward(address account, address[] tokens)',
  'function earned(address token, address account) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
])

// Launchpad: pump.fun-style bonding curve. Pre-graduation trades route here
// (ETH <-> token); after graduation the same UI routes through the Router.
export const launchpadAbi = parseAbi([
  'function buy(address token, uint256 minTokensOut) payable returns (uint256)',
  'function sell(address token, uint256 tokenAmount, uint256 minEthOut) returns (uint256)',
  'function quoteBuy(address token, uint256 ethAmount) view returns (uint256)',
  'function quoteSell(address token, uint256 tokenAmount) view returns (uint256)',
  'function getCurve(address token) view returns ((uint128 virtualEth, uint128 virtualToken, uint128 realEth, uint128 tokensSold, bool graduated, address creator, uint16 protocolFeeBps, uint16 creatorFeeBps) curve)',
  'function tokenCount() view returns (uint256)',
  'function allTokens(uint256) view returns (address)',
  'function CURVE_SUPPLY() view returns (uint256)',
  'function INITIAL_VIRTUAL_TOKEN() view returns (uint256)',
  'function initialVirtualEth() view returns (uint128)',
  'function creationFee() view returns (uint96)',
  'function createToken(string name, string symbol, string metadataURI) payable returns (address)',
  'event Trade(address indexed token, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 protocolFee, uint256 creatorFee, uint256 virtualEth, uint256 virtualToken, uint256 tokensSold)',
])

// Our new HeistsDistributor.
export const heistsAbi = parseAbi([
  'function seasonCount() view returns (uint256)',
  'function seasons(uint256) view returns (bytes32 merkleRoot, uint64 lockDuration, bool frozen)',
  'function isClaimed(uint256 seasonId, uint256 index) view returns (bool)',
  'function claim(uint256 seasonId, uint256 index, uint256 amount, bytes32[] proof) returns (uint256 tokenId)',
])
