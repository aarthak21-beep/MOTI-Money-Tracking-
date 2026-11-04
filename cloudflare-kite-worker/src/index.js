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
async function fetchOrderCharges(orders, trades, env, accessToken) {
  // Re-check the full saved order history, not only today's order book.
  // This backfills virtual contract-note charges for older trades imported before
  // charge fetching was enabled or when the Kite charges endpoint was temporarily unavailable.
  const previous = await env.MOTI_KITE_KV.get(AUTO_HISTORY_KEY, "json") || {};
  const allOrders = mergeById(previous.orders, orders, "order_id");
  const filled = allOrders.filter((o) =>
    o.status === "COMPLETE" && Number(o.filled_quantity) > 0 && Number(o.average_price) > 0
  );
  if (!filled.length) return {};
  const requestRows = filled.map((o) => ({
    order_id: String(o.order_id),
    exchange: o.exchange,
    tradingsymbol: o.tradingsymbol,
    transaction_type: o.transaction_type,
    variety: o.variety || "regular",
    product: o.product || "CNC",
    order_type: o.order_type || "MARKET",
    quantity: Number(o.filled_quantity),
    average_price: Number(o.average_price),
  }));
  let response;
  let payload;
  try {
    response = await fetch("https://api.kite.trade/charges/orders", {
      method: "POST",
      headers: {
        "X-Kite-Version": "3",
        "Authorization": "token " + env.KITE_API_KEY + ":" + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestRows),
    });
    payload = await response.json();
  } catch {
    return {};
  }
  // A charges API outage must not prevent the actual order/trade book from syncing.
  if (!response.ok || payload.status !== "success" || !Array.isArray(payload.data)) return {};
  const result = {};
  payload.data.forEach((row, index) => {
    const order = filled[index];
    const c = row?.charges;
    if (!order?.order_id || !c || !Number.isFinite(Number(c.total))) return;
    result[String(order.order_id)] = {
      brokerage: Number(c.brokerage) || 0,
      transaction_tax: Number(c.transaction_tax) || 0,
      exchange_turnover_charge: Number(c.exchange_turnover_charge) || 0,
      sebi_turnover_charge: Number(c.sebi_turnover_charge) || 0,
      stamp_duty: Number(c.stamp_duty) || 0,
      gst: Number(c.gst?.total) || 0,
      total: Number(c.total) || 0,
    };
  });
  return result;
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
  const orderCharges = { ...(previous.orderCharges || {}), ...(snapshot.orderCharges || {}) };
  const mergedTrades = mergeById(previous.trades, snapshot.trades, "trade_id");
  const quantitiesByOrder = new Map();
  mergedTrades.forEach((trade) => {
    const id = String(trade.order_id || "");
    if (id) quantitiesByOrder.set(id, (quantitiesByOrder.get(id) || 0) + (Number(trade.quantity) || 0));
  });
  const tradesWithCharges = mergedTrades.map((trade) => {
    const id = String(trade.order_id || "");
    const orderCharge = orderCharges[id];
    const totalQty = quantitiesByOrder.get(id) || 0;
    const ratio = totalQty > 0 ? (Number(trade.quantity) || 0) / totalQty : 0;
    return orderCharge ? { ...trade, charges: Object.fromEntries(
      Object.entries(orderCharge).map(([key, value]) => [key, Number(value) * ratio])
    ) } : trade;
  });
  const next = {
    orders: mergeById(previous.orders, snapshot.orders, "order_id"),
    trades: tradesWithCharges,
    orderCharges,
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
    const orders = ordersPayload.data || [];
    const trades = tradesPayload.data || [];
    const orderCharges = await fetchOrderCharges(orders, trades, env, token);
    await saveAutoSnapshot(env, {
      orders, trades, orderCharges,
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
      const currentOrders = ordersPayload.data || [];
      const currentTrades = tradesPayload.data || [];
      const orderCharges = await fetchOrderCharges(currentOrders, currentTrades, env, token);
      const snapshot = {
        orders: currentOrders, trades: currentTrades, orderCharges,
        fetchedAt: new Date().toISOString(),
        date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
        status: "success",
        message: "Manually synced from MOTI.",
      };
      const history = await saveAutoSnapshot(env, snapshot);
      return json({
        ok: true, fetchedAt: snapshot.fetchedAt,
        orders: snapshot.orders, trades: snapshot.trades,
        historyOrders: history.orders, historyTrades: history.trades, orderCharges: history.orderCharges || {},
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