import { SealClient, SessionKey } from '@mysten/seal';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { toHex } from '@mysten/bcs';

// Seal key servers on testnet
const SEAL_SERVER_CONFIGS = [
  {
    objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
    aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
    weight: 1,
  },
  {
    objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
    weight: 1,
  },
];

// Stealth package ID
const STEALTH_PACKAGE = '0x6d31b619bf7bd687a87b276d571109fead5774f3defd32be512b0f081571c084';

export const createSealClient = (suiClient: SuiJsonRpcClient) => {
  return new SealClient({
    suiClient,
    serverConfigs: SEAL_SERVER_CONFIGS,
    verifyKeyServers: false,
  });
};

// Encrypt stealth memo with amount and token
// Only recipient (with viewing key) can decrypt
export const encryptStealthMemo = async (
  suiClient: SuiJsonRpcClient,
  memo: { amount: string; token: string; timestamp: string },
  stealthAddress: string,
): Promise<Uint8Array> => {
  const sealClient = createSealClient(suiClient);
  
  const memoBytes = new TextEncoder().encode(JSON.stringify(memo));
  const id = toHex(new TextEncoder().encode(stealthAddress.slice(0, 32)));
  
  const { encryptedObject } = await sealClient.encrypt({
    threshold: 1,
    packageId: STEALTH_PACKAGE,
    id,
    data: memoBytes,
  });
  
  return encryptedObject;
};

// Decrypt stealth memo (called by receiver)
export const decryptStealthMemo = async (
  suiClient: SuiJsonRpcClient,
  encryptedData: Uint8Array,
  senderAddress: string,
  keypair: any,
): Promise<{ amount: string; token: string; timestamp: string } | null> => {
  try {
    const sealClient = createSealClient(suiClient);
    
    const sessionKey = await SessionKey.create({
      address: senderAddress,
      packageId: STEALTH_PACKAGE,
      ttlMin: 10,
      signer: keypair,
      suiClient,
    });
    
    const tx = new Transaction();
    tx.moveCall({
      target: `${STEALTH_PACKAGE}::stealth::seal_approve`,
      arguments: [tx.pure.vector('u8', Array.from(encryptedData.slice(0, 32)))],
    });
    const txBytes = await tx.build({ client: suiClient });
    
    const decrypted = await sealClient.decrypt({
      data: encryptedData,
      sessionKey,
      txBytes,
    });
    
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    console.error('[Seal decrypt error]', e);
    return null;
  }
};
