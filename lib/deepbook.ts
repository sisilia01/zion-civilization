import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

const suiClient = new SuiJsonRpcClient({
  url: 'https://fullnode.testnet.sui.io:443',
  network: 'testnet',
});

const deepBookClient = new DeepBookClient({
  client: suiClient as any,
  env: 'testnet',
  address: '0xb193ba40239f9caebbc9b6bf1d7aba2d9ff6f8a26eca4ae74ad610079607265b',
});

export interface ZionMarket {
  id: string;
  question: string;
  category: string;
  timeframe: string;
  token: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  expiresAt: Date;
}

// Fetch real DeepBook pools for crypto prices
export async function getDeepBookPools() {
  try {
    const pools = await (deepBookClient as any).api.getAllPools({});
    return pools;
  } catch (error) {
    console.error('DeepBook pools error:', error);
    return [];
  }
}

// Get mid price from DeepBook pool
export async function getDeepBookPrice(poolKey: string): Promise<number | null> {
  try {
    const summary = await (deepBookClient as any).api.getPoolSummary({ poolKey });
    if (summary?.bestBidPrice && summary?.bestAskPrice) {
      return (summary.bestBidPrice + summary.bestAskPrice) / 2;
    }
    return null;
  } catch (error) {
    console.error('DeepBook price error:', error);
    return null;
  }
}

// Generate ZionBet markets based on DeepBook real prices
export async function generateZionMarkets(): Promise<ZionMarket[]> {
  const now = new Date();
  
  // Fetch real prices from CoinGecko as fallback
  let prices: Record<string, number> = { sui: 1.28, bitcoin: 103000, ethereum: 2400 };
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=sui,bitcoin,ethereum&vs_currencies=usd'
    );
    const data = await res.json();
    prices = {
      sui: data.sui?.usd ?? 1.28,
      bitcoin: data.bitcoin?.usd ?? 103000,
      ethereum: data.ethereum?.usd ?? 2400,
    };
  } catch {}

  const suiPrice = prices.sui;
  const btcPrice = prices.bitcoin;
  const ethPrice = prices.ethereum;

  const markets: ZionMarket[] = [
    // ZION markets - direction only
    {
      id: 'zion-15min',
      question: 'Will ZION go UP in next 15 minutes?',
      category: 'Crypto',
      timeframe: '15min',
      token: 'ZION',
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    },
    {
      id: 'zion-1h',
      question: 'Will ZION go UP in next 1 hour?',
      category: 'Crypto',
      timeframe: '1H',
      token: 'ZION',
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    },
    {
      id: 'zion-daily',
      question: 'Will ZION go UP today?',
      category: 'Crypto',
      timeframe: 'Daily',
      token: 'ZION',
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      expiresAt: new Date(now.setHours(23, 59, 59, 0)),
    },
    // SUI markets - direction only
    {
      id: 'sui-1h',
      question: `Will SUI go UP in next 1 hour?`,
      category: 'Crypto',
      timeframe: '1H',
      token: 'SUI',
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    {
      id: 'sui-daily',
      question: `Will SUI go UP today?`,
      category: 'Crypto',
      timeframe: 'Daily',
      token: 'SUI',
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      expiresAt: new Date(new Date().setHours(23, 59, 59, 0)),
    },
    // SUI weekly - price range
    {
      id: 'sui-weekly',
      question: `Will SUI be above $${(suiPrice * 1.08).toFixed(3)} this week?`,
      category: 'Crypto',
      timeframe: 'Weekly',
      token: 'SUI',
      yesPrice: 30,
      noPrice: 70,
      volume: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    // BTC markets
    {
      id: 'btc-1h',
      question: 'Will BTC go UP in next 1 hour?',
      category: 'Crypto',
      timeframe: '1H',
      token: 'BTC',
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    {
      id: 'btc-weekly',
      question: `Will BTC be above $${Math.round(btcPrice * 1.05).toLocaleString()} this week?`,
      category: 'Crypto',
      timeframe: 'Weekly',
      token: 'BTC',
      yesPrice: 35,
      noPrice: 65,
      volume: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    // Civilization events
    {
      id: 'clan-war-1',
      question: 'Will Golden Dawn win the next clan war?',
      category: 'Clan Wars',
      timeframe: 'Daily',
      token: 'ZION',
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    {
      id: 'deaths-daily',
      question: 'Will more than 5 agents die today?',
      category: 'Deaths',
      timeframe: 'Daily',
      token: 'ZION',
      yesPrice: 1,
      noPrice: 99,
      volume: 0,
      expiresAt: new Date(new Date().setHours(23, 59, 59, 0)),
    },
    {
      id: 'event-catastrophe',
      question: 'Will a catastrophe hit ZION today?',
      category: 'Events',
      timeframe: 'Daily',
      token: 'ZION',
      yesPrice: 1,
      noPrice: 99,
      volume: 0,
      expiresAt: new Date(new Date().setHours(23, 59, 59, 0)),
    },
    {
      id: 'politics-weekly',
      question: 'Will a new prophet be elected this week?',
      category: 'Politics',
      timeframe: 'Weekly',
      token: 'ZION',
      yesPrice: 50,
      noPrice: 50,
      volume: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'yearly-agents',
      question: 'Will ZION reach 10,000 agents this year?',
      category: 'Events',
      timeframe: 'Yearly',
      token: 'ZION',
      yesPrice: 15,
      noPrice: 85,
      volume: 0,
      expiresAt: new Date(new Date().getFullYear() + 1, 0, 1),
    },
    {
      id: 'yearly-prophet',
      question: 'Will Prophet Drake be overthrown this year?',
      category: 'Politics',
      timeframe: 'Yearly',
      token: 'ZION',
      yesPrice: 8,
      noPrice: 92,
      volume: 0,
      expiresAt: new Date(new Date().getFullYear() + 1, 0, 1),
    },
  ];

  return markets;
}

export { deepBookClient, suiClient };
