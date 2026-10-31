const CONFIG_KEY = 'moti_google_apps_script_url';

export interface CloudSnapshot {
  exportedAt: string;
  data: Record<string, unknown>;
}

export const CloudSyncService = {
  getUrl(): string {
    return localStorage.getItem(CONFIG_KEY) || '';
  },

  setUrl(url: string): void {
    if (url.trim()) localStorage.setItem(CONFIG_KEY, url.trim());
    else localStorage.removeItem(CONFIG_KEY);
  },

  async save(snapshot: CloudSnapshot): Promise<void> {
    const url = this.getUrl();
    if (!url) return;
    // Apps Script accepts a simple text/plain POST without a CORS preflight.
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'save', snapshot }),
    });
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
