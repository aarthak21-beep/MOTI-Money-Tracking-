# MOTI: GitHub Pages + Google Sheets setup

## 1. Enable GitHub Pages

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. The workflow in `.github/workflows/deploy-pages.yml` builds the `cleanup/personal-tracker` branch and publishes the site.
4. After the first successful workflow, the app URL will be:
   `https://aarthak21-beep.github.io/MOTI-Money-Tracking-/`

The workflow currently deploys the personal-tracker branch. Merge it to the default branch only when you are happy with the changes.

## 2. Create your private Google Sheet

1. Sign in to the Google account you will use with MOTI.
2. Create a new Google Sheet, for example **MOTI Private Backup**.
3. Open **Extensions → Apps Script**.
4. Replace the editor contents with the complete code from `google-apps-script/Code.gs`.
5. Save the Apps Script project.

The script creates a tab named **MOTI Cloud Backup** automatically on its first successful save. It stores one JSON backup row for the signed-in Google account.

## 3. Deploy the Apps Script

1. In Apps Script choose **Deploy → New deployment**.
2. Select **Web app**.
3. Set **Execute as** to **User accessing the web app**.
4. Set **Who has access** to **Anyone with Google account**.
5. Deploy, authorize the requested Google Sheets access, and copy the Web App URL ending in `/exec`.

Use the same Google account that owns or has edit access to the spreadsheet. Do not choose anonymous/public access.

## 4. Connect MOTI

1. Open the deployed MOTI site.
2. Open **Settings → Google Sheets Cloud Sync**.
3. Paste the Apps Script Web App URL and click **Save Apps Script URL**.
4. Click **Sync to Sheet** once to create the first backup.
5. On another device, open the same app, paste the same Web App URL in Settings, and choose **Restore from Sheet**.

After setup, changes saved in MOTI are automatically sent as cloud backup snapshots. The app also attempts to restore the latest snapshot when it starts on a device where the URL is configured.

## Important notes

- The first restore on a new device replaces that device's local MOTI backup. Keep a JSON export before restoring if that device already contains data.
- Google Apps Script's web-app authorization and Google sign-in must be allowed in the browser.
- The sheet should remain private. The app's local PIN is an app lock, not encryption for the Google Sheet.
- The app sends a full backup snapshot; avoid editing the same data on two devices at exactly the same time.
- GitHub Pages hosts only the frontend. The existing Express/Gemini server endpoint is not hosted by Pages, so MOTI AI's server-backed features will not be available there unless separately hosted.
