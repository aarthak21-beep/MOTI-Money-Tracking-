import { StorageService } from './storageService';
import { getAppwriteJwt } from './appwriteAuth';

const API_URL = 'https://moti-cloud-storage.motidiagnostics.workers.dev';
type CloudBackupResponse = { backup: string | null; revision: number; updatedAt: string | null };
let revision = 0;
let initialized = false;
let applyingRemote = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let lastLocalSnapshot = '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const jwt = await getAppwriteJwt();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}`, ...(init.headers || {}) },
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

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function mergeRecordArrays(base: unknown[], local: unknown[], remote: unknown[]): unknown[] {
  const idOf = (value: unknown) => value && typeof value === 'object' ? (value as { id?: unknown }).id : undefined;
  const allHaveIds = [...base, ...local, ...remote].every((item) => idOf(item) !== undefined);
  if (!allHaveIds) {
    // For legacy arrays without stable IDs, prefer the newer remote snapshot on conflict.
    return remote;
  }
  const baseMap = new Map(base.map((item) => [String(idOf(item)), item]));
  const localMap = new Map(local.map((item) => [String(idOf(item)), item]));
  const remoteMap = new Map(remote.map((item) => [String(idOf(item)), item]));
  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const merged: unknown[] = [];
  for (const id of ids) {
    const before = baseMap.get(id);
    const localValue = localMap.get(id);
    const remoteValue = remoteMap.get(id);
    const localChanged = !same(localValue, before);
    const remoteChanged = !same(remoteValue, before);
    const chosen = localChanged && !remoteChanged ? localValue : remoteValue;
    if (chosen !== undefined) merged.push(chosen);
  }
  return merged;
}

function mergeSnapshots(base: Record<string, unknown>, local: Record<string, unknown>, remote: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...remote };
  const arrayKeys = ['accounts', 'budgets', 'stockTrades', 'weeklyIncome', 'dailyEarnings', 'invoices', 'expenses', 'savingsGoals', 'notifications'];
  for (const key of arrayKeys) {
    if (Array.isArray(base[key]) && Array.isArray(local[key]) && Array.isArray(remote[key])) {
      merged[key] = mergeRecordArrays(base[key] as unknown[], local[key] as unknown[], remote[key] as unknown[]);
    }
  }
  const baseProfile = (base.profile || {}) as Record<string, unknown>;
  const localProfile = (local.profile || {}) as Record<string, unknown>;
  const remoteProfile = (remote.profile || {}) as Record<string, unknown>;
  const profile: Record<string, unknown> = { ...remoteProfile };
  for (const key of new Set([...Object.keys(baseProfile), ...Object.keys(localProfile), ...Object.keys(remoteProfile)])) {
    if (!same(localProfile[key], baseProfile[key]) && same(remoteProfile[key], baseProfile[key])) {
      if (localProfile[key] === undefined) delete profile[key];
      else profile[key] = localProfile[key];
    }
  }
  merged.profile = profile;
  return merged;
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
    if (!initialized || applyingRemote) return;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(async () => {
      pendingTimer = null;
      const snapshot = createCloudSafeSnapshot(userId);
      if (snapshot === lastLocalSnapshot) return;
      try {
        revision = await writeCloud(snapshot, revision);
        lastLocalSnapshot = snapshot;
      } catch (error) {
        // Compare the local edits against the last common snapshot, merge record-level
        // changes, then retry against the newest server revision (compare-and-swap).
        if (String(error).includes('changed on another device') && lastLocalSnapshot) {
          try {
            const cloud = await readCloud();
            if (cloud.backup) {
              const merged = mergeSnapshots(
                JSON.parse(lastLocalSnapshot) as Record<string, unknown>,
                JSON.parse(snapshot) as Record<string, unknown>,
                JSON.parse(cloud.backup) as Record<string, unknown>,
              );
              const mergedSnapshot = JSON.stringify(merged);
              revision = await writeCloud(mergedSnapshot, cloud.revision);
              lastLocalSnapshot = mergedSnapshot;
              restoreCloudSnapshot(mergedSnapshot, userId);
              window.dispatchEvent(new Event('moti-cloud-sync-applied'));
              return;
            }
          } catch (mergeError) {
            console.error('MOTI cloud sync conflict could not be merged safely.', mergeError);
          }
        }
        console.error('MOTI cloud sync failed; the newer cloud copy was not blindly overwritten.', error);
      }
    }, 500);
  },

  async poll(userId: string, onRemoteApplied: () => void): Promise<void> {
    if (!initialized || applyingRemote || pendingTimer) return;
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
