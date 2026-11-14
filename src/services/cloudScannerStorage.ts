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
export const saveScannerData = async <T,>(scanner: string, data: T): Promise<void> => {
  await request('/api/data', { method: 'PUT', body: JSON.stringify({ scanner, data }) });
};
export const deleteScannerData = async (scanner: string): Promise<void> => saveScannerData(scanner, []);

export const loadNiftyOptionsHistory = async <T,>(): Promise<T[]> => {
  const result = await request<{ snapshots: T[] }>('/api/nifty-options/history');
  return result.snapshots || [];
};
export const saveNiftyOptionsSnapshot = async <T,>(snapshot: T): Promise<void> => {
  await request('/api/nifty-options/history', { method: 'PUT', body: JSON.stringify({ snapshot }) });
};
