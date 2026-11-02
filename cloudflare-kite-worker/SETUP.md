# MOTI read-only Zerodha Kite connector

This Worker is a **read-only** bridge for the MOTI website. It calls only Kite's `GET /orders` and `GET /trades` endpoints. It has no order placement, modification, cancellation, holdings, positions, funds, quotes, or WebSocket routes.

## 1. Create a free Cloudflare Worker

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Create a Worker named `moti-kite-connector` (or another available name).
3. Open **Edit code** and replace the starter code with the complete contents of `cloudflare-kite-worker/src/index.js` from this repository.
4. Deploy it once. Note its URL, usually `https://moti-kite-connector.<your-workers-subdomain>.workers.dev`.

Cloudflare's Workers Free plan has a daily request allowance suitable for personal, occasional order syncing. Check Cloudflare's current plan limits before relying on it.

## 2. Create a KV namespace and bind it

1. In Cloudflare, open **Workers & Pages → KV** and create a namespace, e.g. `MOTI_KITE_SESSIONS`.
2. Open your Worker → **Settings → Bindings → Add → KV namespace**.
3. Set the variable/binding name to exactly `MOTI_KITE_KV` and select the namespace you created.
4. Save and deploy.

KV stores the short-lived OAuth state and the daily access token. It does not store your API secret in the browser.

## 3. Add Worker secrets

Open Worker → **Settings → Variables and Secrets**. Add these as **Secrets** (not plain text variables):

- `KITE_API_KEY`: the API Key from your Zerodha Personal app.
- `KITE_API_SECRET`: the API Secret from your Zerodha Personal app.
- `MOTI_APP_PASSWORD`: create a unique, long random password (at least 32 characters) for the MOTI connector. Keep it in your password manager.

Never commit these values to GitHub, paste them into MOTI's source code, or send them in chat. Save and deploy after adding them.

## 4. Set the Zerodha Redirect URL

Your redirect URL is your deployed Worker URL plus `/kite/callback`.

Example only (replace the hostname with your actual Worker URL):

```
https://moti-kite-connector.<your-workers-subdomain>.workers.dev/kite/callback
```

Open your Zerodha Developer Console → your Personal app → Edit, paste that exact Redirect URL, and save. Do not add a trailing slash.

The Worker uses the redirect URL only to finish Kite's login handshake. OAuth state is one-time and expires after five minutes.

## 5. Connect MOTI

1. Open the live MOTI website and go to **Stock Trading → Zerodha Orders**.
2. Enter the Worker URL (without a path) and the `MOTI_APP_PASSWORD`.
3. Tap **Save settings**, then **Connect Zerodha**.
4. Complete the normal Zerodha login and 2FA in the official Kite page.
5. Return to MOTI. The Worker will perform the daily sync automatically once the Cron Trigger below is enabled. Manual **Sync orders** remains available as a fallback.

The password is kept only in the current browser session. The Worker stores the Kite access token in KV with a 24-hour maximum TTL. Kite access tokens expire at 6:00 AM IST, so you must complete **Connect Zerodha once after 6:00 AM on each trading day**. The scheduled sync cannot renew Kite authentication or bypass Zerodha's login/2FA.


## 6. Enable once-daily automatic sync

1. Open your Worker in Cloudflare → **Settings → Triggers** (or **Triggers → Cron Triggers**, depending on the dashboard layout).
2. Add this Cron Trigger:

```
15 10 * * 1-5
```

Cloudflare Cron uses UTC. This runs at **3:45 PM India time, Monday to Friday**, after the normal NSE cash-market session. It fetches the current day's orders and executions once and saves deduplicated history in the existing KV namespace.
3. Deploy/save the Worker after adding the trigger.
4. On each trading day, complete **Connect Zerodha** once after 6:00 AM IST. The scheduled Worker then syncs at 3:45 PM; you do not need to press **Sync orders**. If you did not log in that day, the scheduled job records that login is required and cannot fetch orders.
5. When you open the MOTI Zerodha Orders panel, it loads the saved scheduled history from the Worker. Manual **Sync orders** remains available if you want an immediate update.

The automatic sync runs on weekdays including exchange holidays; on a holiday it may simply save zero rows. It only fetches the order book and trade book, and never places or changes orders.

## Data and limits

- Kite's order book and trade book endpoints return the current day's records. The 3:45 PM IST scheduled sync captures them before the day rolls over, provided you authenticated that day after 6:00 AM.
- The Worker keeps a deduplicated copy of scheduled/manual history in the bound KV namespace. MOTI also merges history by `order_id` and fills by `trade_id` when loading it into this browser's local storage.
- Local Kite history is device/browser-specific and is not currently included in MOTI's regular JSON backup or Google Sheets snapshot. Do not clear browser storage; use the order tables as a view of synced records and retain any required CSV exports separately.
- The connector does not automatically convert order fills into the manual P&L ledger. It provides the order book and execution history only, avoiding incorrect matching of partial fills or multi-day positions.
- The connector makes no order-changing API calls. It cannot place, modify, or cancel a trade.
- The Kite access token is short-lived. The connector password protects Worker endpoints, while the API Key and API Secret remain Worker secrets.

## Troubleshooting

- **Unauthorized**: confirm the MOTI connector password matches the Worker secret.
- **Worker secrets or KV binding are not configured**: check the exact secret names and the `MOTI_KITE_KV` binding name, then deploy again.
- **Login link expired**: start Connect Zerodha again; OAuth state is valid for five minutes.
- **Session expired**: tap Connect Zerodha and complete Kite login again.
- **CORS/network error**: use the live MOTI website origin `https://aarthak21-beep.github.io` and the HTTPS Worker URL.
