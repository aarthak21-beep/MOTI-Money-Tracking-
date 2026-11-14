interface MotiD1Result { success: boolean; meta?: Record<string, unknown>; }
interface MotiD1Statement {
  bind(...values: unknown[]): MotiD1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<MotiD1Result>;
}
interface MotiD1Database {
  prepare(query: string): MotiD1Statement;
}

export interface Env {
  MOTI_DB: MotiD1Database;
  MOTI_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}

const SCANNERS = new Set(['swing', 'nifty-options', 'smart-money']);
const ALLOWED_ORIGINS = new Set(['https://moti-money-tracking.pages.dev', 'https://aarthak21-beep.github.io']);

function response(body: unknown, status: number, origin: string): Response {
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

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

    const auth = request.headers.get('Authorization') || '';
    const suppliedKey = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!env.MOTI_API_KEY || !safeEqual(suppliedKey, env.MOTI_API_KEY)) {
      return response({ error: 'Unauthorized' }, 401, origin);
    }

    if (url.pathname !== '/api/data') {
      return response({ error: 'Not found' }, 404, origin);
    }

    if (request.method === 'GET') {
      const scanner = url.searchParams.get('scanner') || '';
      if (!SCANNERS.has(scanner)) return response({ error: 'Unknown scanner' }, 400, origin);
      const row = await env.MOTI_DB.prepare(
        'SELECT data_json, updated_at FROM moti_scanner_data WHERE scanner = ?1'
      ).bind(scanner).first<{ data_json: string; updated_at: string }>();
      if (!row) return response({ scanner, data: null, updatedAt: null }, 200, origin);
      try {
        return response({ scanner, data: JSON.parse(row.data_json), updatedAt: row.updated_at }, 200, origin);
      } catch {
        return response({ error: 'Stored data is invalid JSON' }, 500, origin);
      }
    }

    if (request.method === 'PUT') {
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > 5 * 1024 * 1024) return response({ error: 'Payload exceeds 5 MB' }, 413, origin);
      let payload: { scanner?: string; data?: unknown };
      try {
        payload = await request.json() as { scanner?: string; data?: unknown };
      } catch {
        return response({ error: 'Invalid JSON body' }, 400, origin);
      }
      const scanner = payload.scanner || '';
      if (!SCANNERS.has(scanner)) return response({ error: 'Unknown scanner' }, 400, origin);
      if (payload.data === undefined) return response({ error: 'Missing data' }, 400, origin);
      const json = JSON.stringify(payload.data);
      if (new TextEncoder().encode(json).byteLength > 5 * 1024 * 1024) {
        return response({ error: 'Payload exceeds 5 MB' }, 413, origin);
      }
      const updatedAt = new Date().toISOString();
      await env.MOTI_DB.prepare(
        'INSERT INTO moti_scanner_data (scanner, data_json, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(scanner) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at'
      ).bind(scanner, json, updatedAt).run();
      return response({ ok: true, scanner, updatedAt }, 200, origin);
    }

    return response({ error: 'Method not allowed' }, 405, origin);
  },
};
