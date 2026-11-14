const API_URL = 'https://moti-cloud-storage.motidiagnostics.workers.dev';
const API_KEY_STORAGE = 'moti_cloud_api_key_v1';

export const getCloudApiKey = (): string => localStorage.getItem(API_KEY_STORAGE) || '';
export const saveCloudApiKey = (key: string): void => {
  const value = key.trim();
  if (value) localStorage.setItem(API_KEY_STORAGE, value);
  else localStorage.removeItem(API_KEY_STORAGE);
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = getCloudApiKey();
  if (!key) throw new Error('Settings मध्ये Cloud API Key आधी save करा.');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...(init.headers || {}) },
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
