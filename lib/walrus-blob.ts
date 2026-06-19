const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
const WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const WALRUS_EPOCHS = 53;

type WalrusPutResponse = {
  newlyCreated?: { blobObject?: { blobId?: string } };
  alreadyCertified?: { blobId?: string; blobObject?: { blobId?: string } };
  blobId?: string;
};

function parseWalrusBlobId(data: WalrusPutResponse): string | null {
  return (
    data.newlyCreated?.blobObject?.blobId ||
    data.alreadyCertified?.blobObject?.blobId ||
    data.alreadyCertified?.blobId ||
    data.blobId ||
    null
  );
}

/** Upload raw bytes to Walrus testnet publisher (same endpoint as zion_backend/walrus.py store_bytes). */
export async function uploadWalrusBytes(
  payload: Uint8Array,
  contentType = "application/octet-stream"
): Promise<string> {
  const body = new Uint8Array(payload);
  const response = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=${WALRUS_EPOCHS}`, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Walrus upload failed HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  let data: WalrusPutResponse;
  try {
    data = JSON.parse(text) as WalrusPutResponse;
  } catch {
    throw new Error(`Walrus upload returned non-JSON: ${text.slice(0, 300)}`);
  }

  const blobId = parseWalrusBlobId(data);
  if (!blobId) {
    throw new Error(`Walrus upload missing blobId: ${text.slice(0, 300)}`);
  }
  return blobId;
}

/** Download raw blob bytes from Walrus aggregator. */
export async function downloadWalrusBytes(blobId: string): Promise<Uint8Array> {
  const response = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`);
  if (!response.ok) {
    throw new Error(`Walrus download failed HTTP ${response.status} for blob ${blobId}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export { WALRUS_AGGREGATOR, WALRUS_PUBLISHER };
