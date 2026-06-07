// Relay API integration for ZION Bank cross-chain bridge
const RELAY_API = 'https://api.relay.link';

// Sui chain ID on Relay
export const RELAY_CHAINS = {
  'Sui':      784,
  'Ethereum': 1,
  'Arbitrum': 42161,
  'Polygon':  137,
  'BNB':      56,
  'Base':     8453,
  'Optimism': 10,
  'Solana':   1399811149,
};

export const RELAY_TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
  'Sui': {
    'SUI':  '0x2::sui::SUI',
    'USDC': '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    'USDT': '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
  },
  'Ethereum': {
    'ETH':  '0x0000000000000000000000000000000000000000',
    'USDC': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    'USDT': '0xdac17f958d2ee523a2206206994597c13d831ec7',
  },
  'Arbitrum': {
    'ETH':  '0x0000000000000000000000000000000000000000',
    'USDC': '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    'USDT': '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
  },
  'Polygon': {
    'MATIC': '0x0000000000000000000000000000000000000000',
    'USDC':  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    'USDT':  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
  },
  'BNB': {
    'BNB':  '0x0000000000000000000000000000000000000000',
    'USDC': '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    'USDT': '0x55d398326f99059ff775485246999027b3197955',
  },
  'Base': {
    'ETH':  '0x0000000000000000000000000000000000000000',
    'USDC': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  },
  'Optimism': {
    'ETH':  '0x0000000000000000000000000000000000000000',
    'USDC': '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
  },
  'Solana': {
    'SOL':  'So11111111111111111111111111111111111111112',
    'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
};

export const getRelayQuote = async (params: {
  fromChainId: number,
  toChainId: number,
  fromNetwork: string,
  toNetwork: string,
  fromToken: string,
  toToken: string,
  amount: string,
  userAddress: string,
  toAddress: string,
}) => {
  const res = await fetch(`${RELAY_API}/quote/v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: params.userAddress.toLowerCase(),
      recipient: params.toAddress.toLowerCase(),
      originChainId: params.fromChainId,
      destinationChainId: params.toChainId,
      originCurrency: RELAY_TOKEN_ADDRESSES[params.fromNetwork]?.[params.fromToken] || params.fromToken,
      destinationCurrency: RELAY_TOKEN_ADDRESSES[params.toNetwork]?.[params.toToken] || params.toToken,
      amount: params.amount,
      tradeType: 'EXACT_INPUT',
    }),
  });
  const data = await res.json();
  if (!res.ok || data.errorCode) {
    throw new Error(data.message || data.errorCode || 'Quote failed');
  }
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    throw new Error('No executable bridge steps');
  }
  return data;
};

export const getRelayChainsFromAPI = async () => {
  const res = await fetch(`${RELAY_API}/chains`);
  return res.json();
};
