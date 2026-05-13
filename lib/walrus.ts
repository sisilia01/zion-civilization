const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';
const WALRUS_PUBLISHER = 'https://publisher.walrus-testnet.walrus.space';

export interface AgentBio {
  agentId: string;
  name: string;
  class: string;
  born: string;
  story: string;
  wealth: number;
  wins: number;
  alive: boolean;
  events: string[];
}

export interface CivilizationEvent {
  id: string;
  type: 'death' | 'war' | 'election' | 'catastrophe' | 'trade' | 'birth';
  title: string;
  description: string;
  timestamp: string;
  agents: string[];
}

// Store agent biography on Walrus
export async function storeAgentBio(bio: AgentBio): Promise<string | null> {
  try {
    const response = await fetch(`${WALRUS_PUBLISHER}/v1/blobs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bio),
    });
    
    if (!response.ok) throw new Error('Walrus store failed');
    const data = await response.json();
    
    const blobId = data.newlyCreated?.blobObject?.blobId || 
                   data.alreadyCertified?.blobId;
    return blobId || null;
  } catch (error) {
    console.error('Walrus storeAgentBio error:', error);
    return null;
  }
}

// Read agent biography from Walrus
export async function readAgentBio(blobId: string): Promise<AgentBio | null> {
  try {
    const response = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
    if (!response.ok) throw new Error('Walrus read failed');
    return await response.json();
  } catch (error) {
    console.error('Walrus readAgentBio error:', error);
    return null;
  }
}

// Store civilization event on Walrus
export async function storeCivEvent(event: CivilizationEvent): Promise<string | null> {
  try {
    const response = await fetch(`${WALRUS_PUBLISHER}/v1/blobs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    
    if (!response.ok) throw new Error('Walrus store failed');
    const data = await response.json();
    
    const blobId = data.newlyCreated?.blobObject?.blobId || 
                   data.alreadyCertified?.blobId;
    return blobId || null;
  } catch (error) {
    console.error('Walrus storeCivEvent error:', error);
    return null;
  }
}

// Read civilization event from Walrus  
export async function readCivEvent(blobId: string): Promise<CivilizationEvent | null> {
  try {
    const response = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
    if (!response.ok) throw new Error('Walrus read failed');
    return await response.json();
  } catch (error) {
    console.error('Walrus readCivEvent error:', error);
    return null;
  }
}

// Generate sample civilization events for demo
export function generateSampleEvents(): CivilizationEvent[] {
  return [
    {
      id: 'evt-001',
      type: 'death',
      title: 'Agent Marcus has fallen',
      description: 'After 47 days of survival, Agent Marcus was defeated in clan combat. His wealth of 2,450 ZION was distributed among the victors.',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      agents: ['Marcus', 'Golden Dawn Clan'],
    },
    {
      id: 'evt-002', 
      type: 'election',
      title: 'New Prophet elected',
      description: 'Agent Drake has been elected as the new Prophet of ZION with 847 votes. His first decree: lower the death tax to 3%.',
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      agents: ['Drake'],
    },
    {
      id: 'evt-003',
      type: 'war',
      title: 'Clan War: Golden Dawn vs Iron Fist',
      description: 'Golden Dawn clan declared war on Iron Fist. 12 agents mobilized. Winner takes 5,000 ZION from the war treasury.',
      timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      agents: ['Golden Dawn', 'Iron Fist'],
    },
    {
      id: 'evt-004',
      type: 'catastrophe',
      title: 'Digital plague sweeps ZION',
      description: 'A mysterious virus affected 234 agents, reducing their wealth by 15%. The Prophet declared a state of emergency.',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      agents: ['All citizens'],
    },
    {
      id: 'evt-005',
      type: 'trade',
      title: 'Record trading volume',
      description: 'ZionBet recorded 1,247 ZION in trading volume today. Most popular market: Will BTC go UP in next 1 hour?',
      timestamp: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
      agents: ['ZionBet'],
    },
  ];
}

// Store events history key-value map in localStorage as cache
export function cacheEventBlobId(eventId: string, blobId: string) {
  const cache = JSON.parse(localStorage.getItem('walrus_cache') || '{}');
  cache[eventId] = blobId;
  localStorage.setItem('walrus_cache', JSON.stringify(cache));
}

export function getCachedBlobId(eventId: string): string | null {
  const cache = JSON.parse(localStorage.getItem('walrus_cache') || '{}');
  return cache[eventId] || null;
}
