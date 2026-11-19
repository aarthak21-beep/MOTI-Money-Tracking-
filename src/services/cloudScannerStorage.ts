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
  const result = await request<{ data: T | null; legacyMigrationBlocked?: boolean }>(`/api/data?scanner=${encodeURIComponent(scanner)}`);
  if (scanner === 'swing' && result.legacyMigrationBlocked) {
    // A clear is global: remove stale browser-only copies on every device
    // before the screen can attempt the one-time legacy migration.
    try { localStorage.removeItem('moti_nse_daily_reports_v1'); } catch { /* storage may be unavailable */ }
  }
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
  const shouldMerge = (scanner === 'swing' || scanner === 'smart-money') && mergeChunks && !(Array.isArray(data) && data.length === 0);
  const batches = shouldMerge ? splitScannerData(data) : [data];
  for (let index = 0; index < batches.length; index++) {
    await request('/api/data', {
      method: 'PUT',
      body: JSON.stringify({ scanner, data: batches[index], mode: shouldMerge ? 'merge' : 'replace' }),
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

export const loadPennyStockHistory = async <T,>(): Promise<T[]> => {
  const result = await request<{ rows: T[] }>('/api/penny-history');
  return result.rows || [];
};

export const savePennyStockHistory = async <T,>(rows: T[]): Promise<void> => {
  if (!rows.length) return;
  await request('/api/penny-history', {
    method: 'PUT',
    body: JSON.stringify({ rows }),
  });
};
