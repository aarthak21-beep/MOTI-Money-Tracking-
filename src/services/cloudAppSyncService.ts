import { StorageService } from './storageService';
import { getCloudApiKey } from './cloudScannerStorage';

const API_URL = 'https://moti-cloud-storage.motidiagnostics.workers.dev';
type CloudBackupResponse = { backup: string | null; revision: number; updatedAt: string | null };
let revision = 0;
let initialized = false;
let applyingRemote = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let lastLocalSnapshot = '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = getCloudApiKey();
  if (!key) throw new Error('Cloud API key is not configured on this device.');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...(init.headers || {}) },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Cloud sync failed (${response.status}).`);
  return body;
}

function createCloudSafeSnapshot(userId: string): string {
  const data = JSON.parse(StorageService.exportCompleteBackup(userId));
  // Device PIN credentials stay local and are never uploaded to Cloudflare.
  if (data.profile) {
    delete data.profile.pinCode;
    data.profile.pinEnabled = false;
  }
  return JSON.stringify(data);
}

function restoreCloudSnapshot(snapshot: string, userId: string): boolean {
  const localProfile = StorageService.getProfile(userId);
  const data = JSON.parse(snapshot);
  if (data.profile) {
    data.profile = {
      ...data.profile,
      pinEnabled: localProfile.pinEnabled,
      ...(localProfile.pinCode ? { pinCode: localProfile.pinCode } : {}),
    };
  }
  return StorageService.importCompleteBackup(JSON.stringify(data), userId);
}

async function readCloud(): Promise<CloudBackupResponse> {
  return request<CloudBackupResponse>('/api/app-backup');
}

async function writeCloud(backup: string, expectedRevision: number): Promise<number> {
  const result = await request<{ revision: number }>('/api/app-backup', {
    method: 'PUT',
    body: JSON.stringify({ backup, expectedRevision }),
  });
  return result.revision;
}

export const CloudAppSyncService = {
  async initialize(userId: string, onRemoteApplied: () => void): Promise<void> {
    if (!getCloudApiKey()) return;
    const cloud = await readCloud();
    if (cloud.backup) {
      applyingRemote = true;
      try {
        if (!restoreCloudSnapshot(cloud.backup, userId)) throw new Error('Cloud backup format is invalid; local data was left unchanged.');
        revision = cloud.revision;
        lastLocalSnapshot = createCloudSafeSnapshot(userId);
        onRemoteApplied();
      } finally {
        applyingRemote = false;
      }
    } else {
      const local = createCloudSafeSnapshot(userId);
      revision = await writeCloud(local, 0);
      lastLocalSnapshot = local;
    }
    initialized = true;
  },

  schedule(userId: string): void {
    if (!initialized || applyingRemote || !getCloudApiKey()) return;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(async () => {
      pendingTimer = null;
      const snapshot = createCloudSafeSnapshot(userId);
      if (snapshot === lastLocalSnapshot) return;
      try {
        revision = await writeCloud(snapshot, revision);
        lastLocalSnapshot = snapshot;
      } catch (error) {
        // Never overwrite a newer write from another device on a revision conflict.
        console.error('MOTI cloud sync conflict. The latest cloud copy was not overwritten.', error);
      }
    }, 500);
  },

  async poll(userId: string, onRemoteApplied: () => void): Promise<void> {
    if (!initialized || applyingRemote || pendingTimer || !getCloudApiKey()) return;
    const cloud = await readCloud();
    if (!cloud.backup || cloud.revision <= revision) return;
    applyingRemote = true;
    try {
      if (!restoreCloudSnapshot(cloud.backup, userId)) throw new Error('Cloud backup format is invalid; local data was left unchanged.');
      revision = cloud.revision;
      lastLocalSnapshot = createCloudSafeSnapshot(userId);
      onRemoteApplied();
    } finally {
      applyingRemote = false;
    }
  },

  stop(): void {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
    initialized = false;
  },
};
