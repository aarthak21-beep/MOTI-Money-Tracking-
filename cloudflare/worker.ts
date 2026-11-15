const SCANNERS = new Set(['swing', 'nifty-options', 'smart-money']);
const ALLOWED_ORIGINS = new Set(['https://moti-money-tracking.pages.dev', 'https://finova.themotigroup.co.in', 'https://aarthak21-beep.github.io']);

function response(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, PUT, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'vary': 'Origin',
    },
  });
}

const APPWRITE_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '6aedba7500289424a374';
const APPWRITE_DATABASE_ID = '6aedbc350031fd28e31a';
const FINOVA_ACCESS_TABLE_ID = '6af861370019508c91e1';

async function authorizeFinovaUser(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!jwt || !env.APPWRITE_API_KEY) return false;

  try {
    const accountResponse = await fetch(`${APPWRITE_ENDPOINT}/account`, {
      headers: {
        'X-Appwrite-Project': APPWRITE_PROJECT_ID,
        'X-Appwrite-JWT': jwt,
      },
    });
    if (!accountResponse.ok) return false;
    const account = await accountResponse.json();
    if (!account.$id) return false;

    const query = JSON.stringify({ method: 'equal', attribute: 'user_id', values: [account.$id] });
    const rowsUrl = new URL(`${APPWRITE_ENDPOINT}/tablesdb/${APPWRITE_DATABASE_ID}/tables/${FINOVA_ACCESS_TABLE_ID}/rows`);
    rowsUrl.searchParams.append('queries[]', query);
    rowsUrl.searchParams.set('total', 'false');
    const rowsResponse = await fetch(rowsUrl, {
      headers: {
        'X-Appwrite-Project': APPWRITE_PROJECT_ID,
        'X-Appwrite-Key': env.APPWRITE_API_KEY,
      },
    });
    if (!rowsResponse.ok) return false;
    const result = await rowsResponse.json();
    return (result.rows || []).some(row => row.user_id === account.$id && row.is_active === true);
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get('Origin') || '';
    const allowedOrigins = new Set([...(ALLOWED_ORIGINS), ...(env.ALLOWED_ORIGIN ? [env.ALLOWED_ORIGIN] : [])]);
    const origin = requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : 'https://moti-money-tracking.pages.dev';

    if (request.method === 'OPTIONS') {
      if (requestOrigin && !allowedOrigins.has(requestOrigin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, PUT, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization',
          'access-control-max-age': '86400',
          'vary': 'Origin',
        },
      });
    }

    if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
      return response({ error: 'Origin not allowed' }, 403, origin);
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return response({ status: 'ok', service: 'MOTI Cloud Storage' }, 200, origin);
    }

    if (!(await authorizeFinovaUser(request, env))) {
      return response({ error: 'Sign in with an approved MOTI Finova account to continue.' }, 401, origin);
    }

    if (url.pathname === '/api/auth/check' && request.method === 'GET') {
      return response({ authorized: true }, 200, origin);
    }

    if (url.pathname === '/api/app-backup') {
      await env.MOTI_DB.prepare(`
        CREATE TABLE IF NOT EXISTS moti_app_backup (
          id TEXT PRIMARY KEY,
          backup_json TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      if (request.method === 'GET') {
        const row = await env.MOTI_DB.prepare(
          'SELECT backup_json, revision, updated_at FROM moti_app_backup WHERE id = ?1'
        ).bind('default').first();
        if (!row) return response({ backup: null, revision: 0, updatedAt: null }, 200, origin);
        try {
          return response({ backup: row.backup_json, revision: row.revision, updatedAt: row.updated_at }, 200, origin);
        } catch {
          return response({ error: 'Stored app backup is invalid' }, 500, origin);
        }
      }

      if (request.method === 'PUT') {
        const contentLength = Number(request.headers.get('content-length') || 0);
        if (contentLength > 5 * 1024 * 1024) return response({ error: 'Payload exceeds 5 MB' }, 413, origin);
        let payload;
        try {
          payload = await request.json();
        } catch {
          return response({ error: 'Invalid JSON body' }, 400, origin);
        }
        if (typeof payload.backup !== 'string' || !Number.isInteger(payload.expectedRevision) || Number(payload.expectedRevision) < 0) {
          return response({ error: 'Invalid backup or expected revision' }, 400, origin);
        }
        if (new TextEncoder().encode(payload.backup).byteLength > 5 * 1024 * 1024) {
          return response({ error: 'Payload exceeds 5 MB' }, 413, origin);
        }
        try {
          const parsed = JSON.parse(payload.backup);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return response({ error: 'Backup must be a JSON object' }, 400, origin);
          }
        } catch {
          return response({ error: 'Backup is not valid JSON' }, 400, origin);
        }
        const expectedRevision = Number(payload.expectedRevision);
        const updatedAt = new Date().toISOString();
        const result = expectedRevision === 0
          ? await env.MOTI_DB.prepare(
              'INSERT INTO moti_app_backup (id, backup_json, revision, updated_at) VALUES (?1, ?2, 1, ?3) ON CONFLICT(id) DO NOTHING'
            ).bind('default', payload.backup, updatedAt).run()
          : await env.MOTI_DB.prepare(
              'UPDATE moti_app_backup SET backup_json = ?1, revision = revision + 1, updated_at = ?2 WHERE id = ?3 AND revision = ?4'
            ).bind(payload.backup, updatedAt, 'default', expectedRevision).run();
        if (Number(result.meta?.changes || 0) === 0) {
          return response({ error: 'Cloud backup changed on another device. Latest copy was not overwritten.' }, 409, origin);
        }
        return response({ ok: true, revision: expectedRevision + 1, updatedAt }, 200, origin);
      }
      return response({ error: 'Method not allowed' }, 405, origin);
    }


    if (url.pathname === '/api/nifty-options/history') {
      await env.MOTI_DB.prepare(`
        CREATE TABLE IF NOT EXISTS nifty_options_history (
          snapshot_date TEXT PRIMARY KEY NOT NULL,
          spot REAL NOT NULL,
          data_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();

      if (request.method === 'GET') {
        const result = await env.MOTI_DB.prepare(
          'SELECT snapshot_date, spot, data_json FROM nifty_options_history ORDER BY snapshot_date DESC LIMIT 30'
        ).all();
        const snapshots = (result.results || []).flatMap(row => {
          try { return [{ date: row.snapshot_date, spot: row.spot, rows: JSON.parse(row.data_json) }]; }
          catch { return []; }
        });
        return response({ snapshots }, 200, origin);
      }

      if (request.method === 'PUT') {
        const contentLength = Number(request.headers.get('content-length') || 0);
        if (contentLength > 4 * 1024 * 1024) return response({ error: 'Snapshot exceeds 4 MB' }, 413, origin);
        let payload;
        try { payload = await request.json(); }
        catch { return response({ error: 'Invalid JSON body' }, 400, origin); }
        const snapshot = payload.snapshot;
        if (!snapshot || typeof snapshot.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date)
          || typeof snapshot.spot !== 'number' || !Number.isFinite(snapshot.spot)
          || !Array.isArray(snapshot.rows)) {
          return response({ error: 'Invalid NIFTY option snapshot' }, 400, origin);
        }
        const json = JSON.stringify(snapshot.rows);
        if (new TextEncoder().encode(json).byteLength > 4 * 1024 * 1024) {
          return response({ error: 'Snapshot exceeds 4 MB' }, 413, origin);
        }
        const updatedAt = new Date().toISOString();
        await env.MOTI_DB.prepare(
          'INSERT INTO nifty_options_history (snapshot_date, spot, data_json, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(snapshot_date) DO UPDATE SET spot = excluded.spot, data_json = excluded.data_json, updated_at = excluded.updated_at'
        ).bind(snapshot.date, snapshot.spot, json, updatedAt).run();
        await env.MOTI_DB.prepare(
          'DELETE FROM nifty_options_history WHERE snapshot_date NOT IN (SELECT snapshot_date FROM nifty_options_history ORDER BY snapshot_date DESC LIMIT 30)'
        ).run();
        return response({ ok: true, date: snapshot.date, updatedAt }, 200, origin);
      }
      return response({ error: 'Method not allowed' }, 405, origin);
    }

    if (url.pathname !== '/api/data') {
      return response({ error: 'Not found' }, 404, origin);
    }

    if (request.method === 'GET') {
      const scanner = url.searchParams.get('scanner') || '';
      if (!SCANNERS.has(scanner)) return response({ error: 'Unknown scanner' }, 400, origin);
      await env.MOTI_DB.prepare(`
        CREATE TABLE IF NOT EXISTS moti_scanner_data_chunks (
          scanner TEXT NOT NULL,
          chunk_key TEXT NOT NULL,
          data_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (scanner, chunk_key)
        )
      `).run();
      const row = await env.MOTI_DB.prepare(
        'SELECT data_json, updated_at FROM moti_scanner_data WHERE scanner = ?1'
      ).bind(scanner).first();
      const chunks = await env.MOTI_DB.prepare(
        'SELECT data_json, updated_at FROM moti_scanner_data_chunks WHERE scanner = ?1 ORDER BY chunk_key'
      ).bind(scanner).all();
      try {
        const legacy = row?.data_json ? JSON.parse(row.data_json) : [];
        const chunkRows = (chunks.results || []).flatMap(item => {
          const parsed = JSON.parse(item.data_json);
          return Array.isArray(parsed) ? parsed : [];
        });
        if (scanner === 'swing') {
          const merged = new Map();
          for (const item of [...(Array.isArray(legacy) ? legacy : []), ...chunkRows]) {
            const key = String(item?.date || '') + '|' + String(item?.symbol || '');
            if (item?.date && item?.symbol) merged.set(key, { ...merged.get(key), ...item });
          }
          const data = Array.from(merged.values()).sort((a, b) =>
            String(a.date || '').localeCompare(String(b.date || '')) ||
            String(a.symbol || '').localeCompare(String(b.symbol || ''))
          );
          return response({ scanner, data: data.length ? data : null, updatedAt: chunks.results?.[0]?.updated_at || row?.updated_at || null }, 200, origin);
        }
        return response({ scanner, data: row ? JSON.parse(row.data_json) : null, updatedAt: row?.updated_at || null }, 200, origin);
      } catch {
        return response({ error: 'Stored data is invalid JSON' }, 500, origin);
      }
    }

    if (request.method === 'PUT') {
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > 5 * 1024 * 1024) return response({ error: 'Payload exceeds 5 MB' }, 413, origin);
      let payload;
      try {
        payload = await request.json();
      } catch {
        return response({ error: 'Invalid JSON body' }, 400, origin);
      }
      const scanner = payload.scanner || '';
      if (!SCANNERS.has(scanner)) return response({ error: 'Unknown scanner' }, 400, origin);
      if (payload.data === undefined) return response({ error: 'Missing data' }, 400, origin);
      const incomingJson = JSON.stringify(payload.data);
      if (new TextEncoder().encode(incomingJson).byteLength > 5 * 1024 * 1024) {
        return response({ error: 'Payload exceeds 5 MB' }, 413, origin);
      }
      const updatedAt = new Date().toISOString();

      if (scanner === 'swing' && (payload.mode === 'replace' || payload.mode === 'merge')) {
        await env.MOTI_DB.prepare(`
          CREATE TABLE IF NOT EXISTS moti_scanner_data_chunks (
            scanner TEXT NOT NULL,
            chunk_key TEXT NOT NULL,
            data_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (scanner, chunk_key)
          )
        `).run();
      }

      // An empty Swing replace is the explicit Clear History action.
      // Clear only Swing rows from both storage layers so GET cannot resurrect
      // the legacy snapshot after the date chunks have been removed.
      if (scanner === 'swing' && payload.mode === 'replace' && Array.isArray(payload.data) && payload.data.length === 0) {
        await env.MOTI_DB.prepare(
          'DELETE FROM moti_scanner_data_chunks WHERE scanner = ?1'
        ).bind('swing').run();
        await env.MOTI_DB.prepare(
          'DELETE FROM moti_scanner_data WHERE scanner = ?1'
        ).bind('swing').run();
        return response({ ok: true, scanner, cleared: true, updatedAt }, 200, origin);
      }

      if (scanner === 'swing' && payload.mode === 'replace') {
        await env.MOTI_DB.prepare(
          'DELETE FROM moti_scanner_data_chunks WHERE scanner = ?1'
        ).bind(scanner).run();
      }

      if (scanner === 'swing' && payload.mode === 'merge') {
        if (!Array.isArray(payload.data) || payload.data.length === 0) {
          return response({
            error: 'No Swing rows supplied for D1 merge.'
          }, 400, origin);
        }

        const byDate = new Map();
        for (const rawItem of payload.data) {
          if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
            return response({
              error: 'Invalid Swing row: each row must be an object. No rows were saved.'
            }, 400, origin);
          }

          const item = rawItem;
          const date = String(item.date || '');
          const symbol = String(item.symbol || '').trim();

          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !symbol) {
            return response({
              error: 'Invalid Swing row: valid date and symbol are required. No rows were saved.'
            }, 400, origin);
          }

          const rows = byDate.get(date) || [];
          rows.push({ ...item, symbol });
          byDate.set(date, rows);
        }

        await env.MOTI_DB.prepare(`
          CREATE TABLE IF NOT EXISTS moti_scanner_data_chunks (
            scanner TEXT NOT NULL,
            chunk_key TEXT NOT NULL,
            data_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (scanner, chunk_key)
          )
        `).run();
        for (const [date, incomingRows] of byDate) {
          const existing = await env.MOTI_DB.prepare(
            'SELECT data_json FROM moti_scanner_data_chunks WHERE scanner = ?1 AND chunk_key = ?2'
          ).bind(scanner, date).first();
          let oldRows = [];
          if (existing?.data_json) {
            try {
              const parsed = JSON.parse(existing.data_json);
              if (Array.isArray(parsed)) oldRows = parsed;
            } catch {
              return response({ error: 'Existing date history is invalid; refusing to overwrite it.' }, 500, origin);
            }
          }
          const merged = new Map();
          for (const item of [...oldRows, ...incomingRows]) {
            const key = String(item.symbol || '');
            const previous = merged.get(key);
            merged.set(key, previous ? {
              ...previous,
              ...Object.fromEntries(Object.entries(item).filter(([field, value]) => value !== undefined && field !== 'sources')),
              sources: Array.from(new Set([
                ...(Array.isArray(previous.sources) ? previous.sources : []),
                ...(Array.isArray(item.sources) ? item.sources : []),
              ])),
            } : item);
          }
          const json = JSON.stringify(Array.from(merged.values()).sort((a, b) => String(a.symbol).localeCompare(String(b.symbol))));
          if (new TextEncoder().encode(json).byteLength > 5 * 1024 * 1024) {
            return response({ error: 'A single trading-day chunk exceeds 5 MB; no data for that day was written.' }, 413, origin);
          }
          await env.MOTI_DB.prepare(
            'INSERT INTO moti_scanner_data_chunks (scanner, chunk_key, data_json, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(scanner, chunk_key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at'
          ).bind(scanner, date, json, updatedAt).run();
        }
        return response({ ok: true, scanner, updatedAt, chunksSaved: byDate.size }, 200, origin);
      }

      await env.MOTI_DB.prepare(
        'INSERT INTO moti_scanner_data (scanner, data_json, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(scanner) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at'
      ).bind(scanner, incomingJson, updatedAt).run();
      return response({ ok: true, scanner, updatedAt }, 200, origin);
    }

    return response({ error: 'Method not allowed' }, 405, origin);
  },
};
