# MOTI Cloud Storage (Cloudflare D1)

This Worker is the private cloud-storage API for the MOTI scanner datasets. It is intentionally separate from the GitHub Pages frontend.

## What it stores

- `swing`: uploaded NSE reports / bhavcopy history
- `nifty-options`: uploaded option-chain rows
- `smart-money`: uploaded EQ stock rows

The Worker accepts requests only from the MOTI GitHub Pages origin and requires a private Bearer API key. Do not put the API key in source code or commit it to GitHub.

## One-time Cloudflare setup

1. Create/sign in to a Cloudflare account: https://dash.cloudflare.com/
2. Install Wrangler on a computer with Node.js, then authenticate:
   `npx wrangler login`
3. From this folder, create the D1 database:
   `npx wrangler d1 create moti-data`
4. Copy the returned database ID into `cloudflare/wrangler.toml` in place of `REPLACE_WITH_DATABASE_ID`.
5. Create the table:
   `npx wrangler d1 execute moti-data --remote --file=cloudflare/schema.sql`
6. Set a long, random private API key (do not share it):
   `npx wrangler secret put MOTI_API_KEY`
7. Deploy:
   `npx wrangler deploy --config cloudflare/wrangler.toml`
8. Copy the deployed Worker URL. The app integration will use that URL and the API key entered in MOTI settings.

## API

- `GET /api/health` — public health check
- `GET /api/data?scanner=swing|nifty-options|smart-money` — read a dataset (Bearer key required)
- `PUT /api/data` — save JSON: `{ "scanner": "swing", "data": [...] }` (Bearer key required)

Payloads are limited to 5 MB per request. The current Worker stores one private dataset per scanner for this single-user MOTI setup.

## Safety notes

- Keep the API key private. Anyone with the key can read or overwrite the scanner datasets.
- Cloudflare's free plan has usage and storage limits; it is not unlimited.
- Do not delete browser copies until cloud upload and restore have both been verified.
