interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
}

interface PhantomSolanaProvider {
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: { toString(): string } }>;
}

interface Window {
  ethereum?: EthereumProvider;
  solana?: PhantomSolanaProvider;
}
