const API_URL = 'https://moti-cloud-storage.motidiagnostics.workers.dev';
import { getAppwriteJwt } from './appwriteAuth';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const jwt = await getAppwriteJwt();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}`, ...(init.headers || {}) },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Cloud storage request failed (${response.status}).`);
  return body;
}

export const loadScannerData = async <T,>(scanner: string): Promise<T | null> => {
  const result = await request<{ data: T | null }>(`/api/data?scanner=${encodeURIComponent(scanner)}`);
  return result.data;
};

// The API stores one complete JSON snapshot per scanner. Serialize writes so an
// older, slower request cannot finish after a newer snapshot and roll data back.
const scannerSaveQueues = new Map<string, Promise<void>>();

const SCANNER_CHUNK_BYTES = 700 * 1024;

const splitScannerData = (data: unknown): unknown[] => {
  if (!Array.isArray(data) || data.length === 0) return [data];
  const batches: unknown[][] = [];
  let batch: unknown[] = [];
  let bytes = 2;
  for (const row of data) {
    const rowBytes = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1;
    if (rowBytes > SCANNER_CHUNK_BYTES) throw new Error('A single scanner record exceeds the safe upload size.');
    if (batch.length && bytes + rowBytes > SCANNER_CHUNK_BYTES) {
      batches.push(batch);
      batch = [];
      bytes = 2;
    }
    batch.push(row);
    bytes += rowBytes;
  }
  if (batch.length) batches.push(batch);
  return batches;
};

const saveScannerDataInternal = async <T,>(scanner: string, data: T, mergeChunks = true): Promise<void> => {
  const batches = scanner === 'swing' && mergeChunks ? splitScannerData(data) : [data];
  for (let index = 0; index < batches.length; index++) {
    await request('/api/data', {
      method: 'PUT',
      body: JSON.stringify({ scanner, data: batches[index], mode: scanner === 'swing' && mergeChunks ? 'merge' : 'replace' }),
    });
  }
};

export const saveScannerData = async <T,>(scanner: string, data: T): Promise<void> => {
  const previous = scannerSaveQueues.get(scanner) || Promise.resolve();
  const next = previous.catch(() => undefined).then(() => saveScannerDataInternal(scanner, data));
  scannerSaveQueues.set(scanner, next);
  try {
    await next;
  } finally {
    if (scannerSaveQueues.get(scanner) === next) scannerSaveQueues.delete(scanner);
  }
};
export const deleteScannerData = async (scanner: string): Promise<void> => {
  const previous = scannerSaveQueues.get(scanner) || Promise.resolve();
  const next = previous.catch(() => undefined).then(() => saveScannerDataInternal(scanner, [], false));
  scannerSaveQueues.set(scanner, next);
  try { await next; } finally {
    if (scannerSaveQueues.get(scanner) === next) scannerSaveQueues.delete(scanner);
  }
};

export const loadNiftyOptionsHistory = async <T,>(): Promise<T[]> => {
  const result = await request<{ snapshots: T[] }>('/api/nifty-options/history');
  return result.snapshots || [];
};
export const saveNiftyOptionsSnapshot = async <T,>(snapshot: T): Promise<void> => {
  await request('/api/nifty-options/history', { method: 'PUT', body: JSON.stringify({ snapshot }) });
};
