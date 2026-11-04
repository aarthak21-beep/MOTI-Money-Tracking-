# MOTI Google Sheets full backup setup

## One-time setup

1. Open the Google Sheet connected to MOTI and choose **Extensions → Apps Script**.
2. Replace the Apps Script editor contents with the latest `google-apps-script/Code.gs` from this repository.
3. Save, then choose **Deploy → Manage deployments → Edit**.
4. Select **New version** and deploy the Web App again. Keep the existing Web App URL if editing the current deployment.
5. In the deployed MOTI app, open **Settings → Google Sheets Cloud Sync**, paste the Web App URL and save it.
6. On the device that already has your correct MOTI history, press **Backup all MOTI data** once.

## What is backed up

The full JSON snapshot in **MOTI Cloud Backup** is the restore source of truth. It includes profile and app records, complete stock-trade journal, Weekly Capital records, and locally saved Zerodha orders, fills, Demat holdings, and net positions. Human-readable tabs are also refreshed for Stock Trading, Weekly Capital, Zerodha Orders, Zerodha Fills, Zerodha Holdings, Zerodha Positions, and Daily Earnings.

After the initial backup, MOTI automatically queues a cloud backup after saved app data changes and after Zerodha history is refreshed. The Google Apps Script URL must be configured on each device. The browser's local history is still used as a working cache; Google Sheets is the cross-device backup.

## Restore on another device

1. Open MOTI and configure the same Apps Script Web App URL in Settings.
2. Export a local JSON backup first if the device already contains data you need.
3. Choose **Restore full backup** and confirm. This replaces that device's MOTI records with the Google Sheets snapshot, including Zerodha history.

## Privacy and safety

- Keep the Google Sheet private and share it only with trusted Google accounts.
- The local MOTI PIN does not encrypt the Google Sheet.
- Avoid editing the same records on two devices at the same time; the latest full snapshot is authoritative.
- A restore is explicit and confirmation-protected. MOTI does not automatically overwrite a new device's local records on startup.
- Google Apps Script changes require a new Web App deployment version before the updated sync protocol is live.
