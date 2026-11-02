const APP_ORIGIN = "https://aarthak21-beep.github.io";
const APP_RETURN_URL = "https://aarthak21-beep.github.io/MOTI-Money-Tracking-/";
const AUTO_HISTORY_KEY = "kite-auto-history";

function cors(origin) {
  const allowed = origin === APP_ORIGIN ? origin : APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function authorized(request, env) {
  const value = request.headers.get("Authorization") || "";
  const supplied = value.startsWith("Bearer ") ? value.slice(7) : "";
  return safeEqual(supplied, env.MOTI_APP_PASSWORD || "");
}
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function kiteFetch(path, env, accessToken) {
  return fetch("https://api.kite.trade" + path, {
    headers: {
      "X-Kite-Version": "3",
      "Authorization": "token " + env.KITE_API_KEY + ":" + accessToken,
    },
  });
}
function mergeById(oldRows, newRows, idField) {
  const rows = new Map();
  [...(oldRows || []), ...(newRows || [])].forEach((row) => {
    const id = String(row?.[idField] ?? "");
    if (id) rows.set(id, row);
  });
  return Array.from(rows.values()).slice(-10000);
}
async function saveAutoSnapshot(env, snapshot) {
  const previous = await env.MOTI_KITE_KV.get(AUTO_HISTORY_KEY, "json") || {};
  const next = {
    orders: mergeById(previous.orders, snapshot.orders, "order_id"),
    trades: mergeById(previous.trades, snapshot.trades, "trade_id"),
    lastAutoSync: snapshot.fetchedAt,
    lastAutoSyncDate: snapshot.date,
    lastAutoSyncStatus: snapshot.status,
    lastAutoSyncMessage: snapshot.message || "",
  };
  await env.MOTI_KITE_KV.put(AUTO_HISTORY_KEY, JSON.stringify(next));
  return next;
}
async function fetchAndSaveDaily(env, scheduledTime) {
  const fetchedAt = new Date(scheduledTime || Date.now()).toISOString();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(scheduledTime || Date.now()));
  const token = await env.MOTI_KITE_KV.get("kite-access-token");
  if (!token) {
    await saveAutoSnapshot(env, { orders: [], trades: [], fetchedAt, date, status: "needs_login", message: "Daily Kite login is required before the scheduled sync." });
    return;
  }
  try {
    const [ordersResponse, tradesResponse] = await Promise.all([
      kiteFetch("/orders", env, token),
      kiteFetch("/trades", env, token),
    ]);
    const [ordersPayload, tradesPayload] = await Promise.all([ordersResponse.json(), tradesResponse.json()]);
    if (!ordersResponse.ok || !tradesResponse.ok) {
      const expired = ordersResponse.status === 403 || tradesResponse.status === 403;
      if (expired) {
        await env.MOTI_KITE_KV.delete("kite-access-token");
        await env.MOTI_KITE_KV.delete("kite-user");
      }
      await saveAutoSnapshot(env, {
        orders: [], trades: [], fetchedAt, date,
        status: expired ? "needs_login" : "error",
        message: ordersPayload.message || tradesPayload.message || "Kite API request failed.",
      });
      return;
    }
    await saveAutoSnapshot(env, {
      orders: ordersPayload.data || [],
      trades: tradesPayload.data || [],
      fetchedAt, date, status: "success",
      message: `Automatically synced ${(ordersPayload.data || []).length} orders and ${(tradesPayload.data || []).length} executions.`,
    });
  } catch {
    await saveAutoSnapshot(env, { orders: [], trades: [], fetchedAt, date, status: "error", message: "Automatic Kite sync failed. Please check the Worker logs." });
  }
}
export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(fetchAndSaveDaily(env, controller.scheduledTime));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    if (url.pathname === "/kite/callback" && request.method === "GET") {
      const state = url.searchParams.get("state") || "";
      const requestToken = url.searchParams.get("request_token") || "";
      const status = url.searchParams.get("status") || "";
      const fail = (message) => Response.redirect(APP_RETURN_URL + "?kite_error=" + encodeURIComponent(message), 302);
      if (status !== "success" || !requestToken || !state) return fail("Zerodha login was not completed.");
      const stateKey = "oauth-state:" + state;
      const savedState = await env.MOTI_KITE_KV.get(stateKey);
      await env.MOTI_KITE_KV.delete(stateKey);
      if (!savedState) return fail("Login link expired. Please connect again.");
      try {
        const checksum = await sha256(env.KITE_API_KEY + requestToken + env.KITE_API_SECRET);
        const body = new URLSearchParams({ api_key: env.KITE_API_KEY, request_token: requestToken, checksum });
        const response = await fetch("https://api.kite.trade/session/token", {
          method: "POST",
          headers: { "X-Kite-Version": "3", "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        const payload = await response.json();
        if (!response.ok || payload.status !== "success" || !payload.data?.access_token) {
          return fail(payload.message || "Could not complete Zerodha authentication.");
        }
        await env.MOTI_KITE_KV.put("kite-access-token", payload.data.access_token, { expirationTtl: 86400 });
        await env.MOTI_KITE_KV.put("kite-user", JSON.stringify({
          user_id: payload.data.user_id,
          user_name: payload.data.user_name,
          login_time: payload.data.login_time,
        }), { expirationTtl: 86400 });
        return Response.redirect(APP_RETURN_URL + "?kite=connected", 302);
      } catch {
        return fail("Zerodha connection failed. Please try again.");
      }
    }

    if (url.pathname === "/kite/health" && request.method === "GET") {
      return json({ ok: true, service: "MOTI read-only Kite connector" }, 200, origin);
    }

    if (!authorized(request, env)) return json({ ok: false, error: "Unauthorized. Check your MOTI connector password." }, 401, origin);

    if (url.pathname === "/kite/login" && request.method === "POST") {
      if (!env.KITE_API_KEY || !env.KITE_API_SECRET || !env.MOTI_KITE_KV) {
        return json({ ok: false, error: "Worker secrets or KV binding are not configured." }, 500, origin);
      }
      const state = crypto.randomUUID();
      await env.MOTI_KITE_KV.put("oauth-state:" + state, "1", { expirationTtl: 300 });
      const redirectParams = encodeURIComponent("state=" + state);
      const loginUrl = "https://kite.zerodha.com/connect/login?v=3&api_key=" +
        encodeURIComponent(env.KITE_API_KEY) + "&redirect_params=" + redirectParams;
      return json({ ok: true, loginUrl }, 200, origin);
    }

    if (url.pathname === "/kite/status" && request.method === "GET") {
      const token = await env.MOTI_KITE_KV.get("kite-access-token");
      const user = await env.MOTI_KITE_KV.get("kite-user");
      const history = await env.MOTI_KITE_KV.get(AUTO_HISTORY_KEY, "json") || {};
      return json({
        ok: true, connected: Boolean(token), user: user ? JSON.parse(user) : null,
        lastAutoSync: history.lastAutoSync || null,
        lastAutoSyncDate: history.lastAutoSyncDate || null,
        lastAutoSyncStatus: history.lastAutoSyncStatus || null,
        lastAutoSyncMessage: history.lastAutoSyncMessage || "",
      }, 200, origin);
    }

    if (url.pathname === "/kite/auto-history" && request.method === "GET") {
      const history = await env.MOTI_KITE_KV.get(AUTO_HISTORY_KEY, "json") || { orders: [], trades: [] };
      return json({ ok: true, ...history }, 200, origin);
    }

    if (url.pathname === "/kite/orders" && request.method === "GET") {
      const token = await env.MOTI_KITE_KV.get("kite-access-token");
      if (!token) return json({ ok: false, error: "Zerodha session expired. Connect Kite again." }, 401, origin);
      const [ordersResponse, tradesResponse] = await Promise.all([
        kiteFetch("/orders", env, token),
        kiteFetch("/trades", env, token),
      ]);
      const [ordersPayload, tradesPayload] = await Promise.all([ordersResponse.json(), tradesResponse.json()]);
      if (!ordersResponse.ok || !tradesResponse.ok) {
        const message = ordersPayload.message || tradesPayload.message || "Kite API request failed.";
        if (ordersResponse.status === 403 || tradesResponse.status === 403) {
          await env.MOTI_KITE_KV.delete("kite-access-token");
          await env.MOTI_KITE_KV.delete("kite-user");
        }
        return json({ ok: false, error: message, reconnect: ordersResponse.status === 403 || tradesResponse.status === 403 }, 502, origin);
      }
      const snapshot = {
        orders: ordersPayload.data || [], trades: tradesPayload.data || [],
        fetchedAt: new Date().toISOString(),
        date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
        status: "success",
        message: "Manually synced from MOTI.",
      };
      const history = await saveAutoSnapshot(env, snapshot);
      return json({
        ok: true, fetchedAt: snapshot.fetchedAt,
        orders: snapshot.orders, trades: snapshot.trades,
        historyOrders: history.orders, historyTrades: history.trades,
      }, 200, origin);
    }

    if (url.pathname === "/kite/logout" && request.method === "POST") {
      await env.MOTI_KITE_KV.delete("kite-access-token");
      await env.MOTI_KITE_KV.delete("kite-user");
      return json({ ok: true }, 200, origin);
    }

    return json({ ok: false, error: "Not found." }, 404, origin);
  },
};