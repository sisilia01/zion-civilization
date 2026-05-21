import { startRailgunEngine } from '@railgun-community/wallet';
import { NetworkName } from '@railgun-community/shared-models';

export const initRailgun = async () => {
  try {
    // @ts-ignore - SDK version compatibility
    await (startRailgunEngine as any)(
      'zion-bank',           // walletSource
      undefined,             // db (browser uses IndexedDB automatically)
      false,                 // shouldDebug
      undefined,             // artifactStore
      false,                 // useNativeArtifacts
      true,                  // skipMerkletreeScans
    );
    console.log('[ZION Bank] Railgun engine initialized');
  } catch (err) {
    console.error('[ZION Bank] Railgun init error:', err);
  }
};

export const RAILGUN_NETWORKS = [
  NetworkName.Ethereum,
  NetworkName.Arbitrum,
  NetworkName.Polygon,
  NetworkName.BNBChain,
];
