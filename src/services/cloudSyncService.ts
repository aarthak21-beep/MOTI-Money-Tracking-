import { WeeklyIncomeRecord } from '../types';

const CONFIG_KEY = 'moti_google_apps_script_url';

export interface CloudSnapshot {
  exportedAt: string;
  data: Record<string, unknown>;
}

export interface WeeklyCloudResult {
  records: WeeklyIncomeRecord[];
  found: boolean;
}

let writeQueue: Promise<void> = Promise.resolve();

export const CloudSyncService = {
  getUrl(): string {
    return localStorage.getItem(CONFIG_KEY) || '';
  },

  setUrl(url: string): void {
    if (url.trim()) localStorage.setItem(CONFIG_KEY, url.trim());
    else localStorage.removeItem(CONFIG_KEY);
  },

  async saveSnapshot(snapshot: Record<string, unknown>): Promise<void> {
    const url = this.getUrl();
    if (!url) throw new Error('Save your Apps Script URL first.');
    const body = JSON.stringify({ action: 'save', snapshot });
    writeQueue = writeQueue.catch(() => undefined).then(async () => {
      await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    });
    await writeQueue;
  },

  loadSnapshot(): Promise<Record<string, unknown> | null> {
    const url = this.getUrl();
    if (!url) return Promise.reject(new Error('Apps Script URL is not configured.'));
    return new Promise((resolve, reject) => {
      const callbackName = `motiBackupCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const cleanup = () => { delete (window as any)[callbackName]; script.remove(); };
      const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Google Sheets backup restore timed out.')); }, 20000);
      (window as any)[callbackName] = (response: { ok: boolean; snapshot?: Record<string, unknown> | null; error?: string }) => {
        window.clearTimeout(timeout); cleanup();
        if (!response.ok) reject(new Error(response.error || 'Could not load MOTI backup.'));
        else resolve(response.snapshot || null);
      };
      script.onerror = () => { window.clearTimeout(timeout); cleanup(); reject(new Error('Could not connect to Google Apps Script. Check deployment URL and Google sign-in.')); };
      script.src = `${url}${url.includes('?') ? '&' : '?'}action=load&callback=${callbackName}&_=${Date.now()}`;
      document.body.appendChild(script);
    });
  },

  async saveWeekly(records: WeeklyIncomeRecord[]): Promise<void> {
    const url = this.getUrl();
    if (!url) throw new Error('Save your Apps Script URL first.');
    const body = JSON.stringify({ action: 'weekly-save', records });
    writeQueue = writeQueue.catch(() => undefined).then(async () => {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
      });
    });
    await writeQueue;
  },

  loadWeekly(): Promise<WeeklyCloudResult> {
    const url = this.getUrl();
    if (!url) return Promise.reject(new Error('Apps Script URL is not configured.'));
    return new Promise((resolve, reject) => {
      const callbackName = `motiWeeklyCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const cleanup = () => {
        delete (window as any)[callbackName];
        script.remove();
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Google Sheets weekly sync timed out. Check the Apps Script deployment.'));
      }, 20000);
      (window as any)[callbackName] = (response: { ok: boolean; records?: WeeklyIncomeRecord[]; found?: boolean; error?: string }) => {
        window.clearTimeout(timeout);
        cleanup();
        if (!response.ok) reject(new Error(response.error || 'Could not load Weekly Capital.'));
        else resolve({
          records: Array.isArray(response.records) ? response.records : [],
          found: response.found === true,
        });
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        cleanup();
        reject(new Error('Could not connect to Google Apps Script. Check its deployment URL and Google sign-in.'));
      };
      script.src = `${url}${url.includes('?') ? '&' : '?'}action=weekly-load&callback=${callbackName}&_=${Date.now()}`;
      document.body.appendChild(script);
    });
  },

  // Retained only for compatibility with manual legacy full-backup controls.
  async save(snapshot: CloudSnapshot): Promise<void> {
    const url = this.getUrl();
    if (!url) return;
    const body = JSON.stringify({ action: 'save', snapshot });
    writeQueue = writeQueue.catch(() => undefined).then(async () => {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
      });
    });
    await writeQueue;
  },

  load(): Promise<CloudSnapshot | null> {
    const url = this.getUrl();
    if (!url) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const callbackName = `motiCloudCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const cleanup = () => {
        delete (window as any)[callbackName];
        script.remove();
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Google Sheets sync timed out. Check the Apps Script URL and deployment access.'));
      }, 20000);
      (window as any)[callbackName] = (response: { ok: boolean; snapshot?: CloudSnapshot; error?: string }) => {
        window.clearTimeout(timeout);
        cleanup();
        if (!response.ok) reject(new Error(response.error || 'Could not load cloud data.'));
        else resolve(response.snapshot || null);
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        cleanup();
        reject(new Error('Could not connect to Google Apps Script. Check its deployment URL and Google sign-in.'));
      };
      script.src = `${url}${url.includes('?') ? '&' : '?'}action=load&callback=${callbackName}&_=${Date.now()}`;
      document.body.appendChild(script);
    });
  },
};
