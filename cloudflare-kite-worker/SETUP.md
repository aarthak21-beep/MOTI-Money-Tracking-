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
5. Return to MOTI and tap **Sync orders**.

The password is kept only in the current browser session. The Worker stores the Kite access token in KV with a 24-hour maximum TTL. Kite access tokens expire the following morning, so connect again for a new trading day.

## Data and limits

- Kite's order book and trade book endpoints return the current day's records. Sync each trading day so MOTI can keep a local copy before those daily records roll over.
- MOTI merges order history by `order_id` and fills by `trade_id` to avoid duplicates and stores the synced history in this browser's local storage.
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
