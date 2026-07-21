// Friendly short labels for the RH-Chain venues GeckoTerminal + the firehose surface.
// Used for the launchpad pill on terminal rows and in the trade drawer.
export const DEX_LABEL: Record<string, string> = {
  'uniswap-v2-robinhood': 'Uni V2',
  'uniswap-v3-robinhood': 'Uni V3',
  'uniswap-v4-robinhood': 'Uni V4',
  'pancakeswap-v2-robinhood': 'Pancake V2',
  'pancakeswap-v3-robinhood': 'Pancake V3',
  'sushiswap-v2-robinhood': 'Sushi V2',
  'sushiswap-v3-robinhood': 'Sushi V3',
  'curve-robinhood': 'Curve',
  'bankr-robinhood': 'Bankr',
  'virtuals-robinhood': 'Virtuals',
  robinswap: 'RobinSwap',
  'dyorswap-robinhood': 'DYOR',
  hoodit: 'Hoodit',
  'pons-dot-family': 'Pons',
  'clanker-robinhood': 'Clanker',
  'easya-kickstart-robinhood': 'EasyA',
  'swaphood-finance-v2': 'SwapHood V2',
  'swaphood-finance-v3': 'SwapHood V3',
  'up-v2': 'Up V2',
  'up-v3': 'Up V3',
}

export const dexLabel = (dex: string): string =>
  DEX_LABEL[dex] ?? dex.replace('-robinhood', '').replace(/-/g, ' ')
