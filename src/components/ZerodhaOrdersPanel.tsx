import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { KiteExecution, KiteImportSummary } from '../utils/zerodhaTradeImport';
import { Activity, Link2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';

type KiteOrder = {
  order_id: string; exchange?: string; tradingsymbol?: string; transaction_type?: string;
  quantity?: number; filled_quantity?: number; pending_quantity?: number; average_price?: number;
  price?: number; status?: string; order_timestamp?: string; exchange_timestamp?: string;
  product?: string; order_type?: string; status_message?: string;
};
type KiteHolding = { tradingsymbol: string; exchange?: string; quantity?: number; average_price?: number; last_price?: number; pnl?: number; product?: string };
type KitePosition = { tradingsymbol: string; exchange?: string; product?: string; quantity?: number; average_price?: number; last_price?: number; pnl?: number; realised?: number; unrealised?: number };
type KiteTrade = {
  trade_id: string; order_id?: string; exchange?: string; tradingsymbol?: string;
  transaction_type?: string; quantity?: number; price?: number; fill_timestamp?: string; product?: string;
};

const URL_KEY = 'moti_kite_worker_url_v1';
const PASSWORD_KEY = 'moti_kite_worker_password_session';
const ORDERS_KEY = 'moti_kite_orders_history_v1';
const TRADES_KEY = 'moti_kite_trades_history_v1';
const HOLDINGS_KEY = 'moti_kite_holdings_v1';
const POSITIONS_KEY = 'moti_kite_positions_v1';
const SKIP_AUTO_HISTORY_KEY = 'moti_kite_skip_auto_history_after_clear_v1';

const readList = <T,>(key: string): T[] => {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
};
const mergeUnique = <T,>(oldRows: T[], newRows: T[], key: keyof T): T[] => {
  const map = new Map<string, T>();
  [...oldRows, ...newRows].forEach((row) => {
    const id = String(row[key] ?? '');
    if (id) map.set(id, row);
  });
  return Array.from(map.values()).slice(-10000);
};
const enrichTradePrices = (trades: KiteTrade[], orders: KiteOrder[]): KiteTrade[] => {
  const orderPrices = new Map<string, number>();
  orders.forEach((order) => {
    const price = Number(order.average_price);
    if (order.order_id && Number.isFinite(price) && price > 0) orderPrices.set(String(order.order_id), price);
  });
  return trades.map((trade) => {
    const tradePrice = Number(trade.price);
    if (Number.isFinite(tradePrice) && tradePrice > 0) return trade;
    const fallbackPrice = trade.order_id ? orderPrices.get(String(trade.order_id)) : undefined;
    return fallbackPrice ? { ...trade, price: fallbackPrice } : trade;
  });
};
const money = (value?: number) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateText = (value?: string) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const exportCsv = (filename: string, rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return;
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const csv = [headers.map(quote).join(','), ...rows.map((row) => headers.map((header) => quote(row[header])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
};

interface ZerodhaOrdersPanelProps { onExecutionsChange?: (executions: KiteExecution[]) => KiteImportSummary | void; }

export const ZerodhaOrdersPanel: React.FC<ZerodhaOrdersPanelProps> = ({ onExecutionsChange }) => {
  const [workerUrl, setWorkerUrl] = useState(() => localStorage.getItem(URL_KEY) || '');
  const [password, setPassword] = useState(() => sessionStorage.getItem(PASSWORD_KEY) || '');
  const [orders, setOrders] = useState<KiteOrder[]>(() => readList<KiteOrder>(ORDERS_KEY));
  const [executions, setExecutions] = useState<KiteTrade[]>(() => readList<KiteTrade>(TRADES_KEY));
  const [holdings, setHoldings] = useState<KiteHolding[]>(() => readList<KiteHolding>(HOLDINGS_KEY));
  const [positions, setPositions] = useState<KitePosition[]>(() => readList<KitePosition>(POSITIONS_KEY));
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const [message, setMessage] = useState('');
  const [journalSummary, setJournalSummary] = useState<KiteImportSummary | null>(null);
  const onExecutionsChangeRef = useRef(onExecutionsChange);

  useEffect(() => { onExecutionsChangeRef.current = onExecutionsChange; }, [onExecutionsChange]);
  useEffect(() => {
    if (!executions.length) return;
    const summary = onExecutionsChangeRef.current?.(executions);
    if (summary) setJournalSummary(summary);
  }, [executions]);

  const baseUrl = workerUrl.trim().replace(/\/+$/, '');
  const api = async (path: string, method = 'GET') => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { Authorization: 'Bearer ' + password, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Connector request failed.');
    return payload;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('kite') === 'connected') {
      setMessage('Zerodha login completed. The Worker will collect today’s order book automatically at 3:45 PM IST on weekdays.');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('kite_error')) {
      setMessage(params.get('kite_error') || 'Zerodha connection failed.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!baseUrl || !password) return;
    let active = true;
    api('/kite/status').then(async (result) => {
      if (!active) return;
      setConnected(Boolean(result.connected));
      if (result.lastAutoSync) setLastSync(result.lastAutoSync);
      // A user clear must remain effective across reloads. Do not silently
      // repopulate the deleted local history from the Worker on app startup.
      if (localStorage.getItem(SKIP_AUTO_HISTORY_KEY) === '1') return;
      const history = await api('/kite/auto-history');
      if (!active) return;
      const nextOrders = mergeUnique(orders, history.orders || [], 'order_id');
      const nextTrades = enrichTradePrices(mergeUnique(executions, history.trades || [], 'trade_id'), nextOrders);
      const nextHoldings = history.holdings || [];
      const nextPositions = history.positions || [];
      setOrders(nextOrders); setExecutions(nextTrades); setHoldings(nextHoldings); setPositions(nextPositions);
      localStorage.setItem(ORDERS_KEY, JSON.stringify(nextOrders));
      localStorage.setItem(TRADES_KEY, JSON.stringify(nextTrades));
      localStorage.setItem(HOLDINGS_KEY, JSON.stringify(nextHoldings));
      localStorage.setItem(POSITIONS_KEY, JSON.stringify(nextPositions));
      window.dispatchEvent(new Event('moti-cloud-backup-request'));
      if (history.lastAutoSyncStatus === 'success') {
        setMessage(history.lastAutoSyncMessage || 'Latest scheduled Zerodha sync loaded.');
      } else if (history.lastAutoSyncStatus === 'needs_login') {
        setMessage('Daily Zerodha login is required after 6:00 AM for the automatic 3:45 PM sync.');
      } else if (history.lastAutoSyncStatus === 'error') {
        setMessage(history.lastAutoSyncMessage || 'The last automatic sync had an error.');
      }
    }).catch(() => { if (active) setConnected(false); });
    return () => { active = false; };
  }, [baseUrl, password]);

  const saveSettings = () => {
    if (!baseUrl.startsWith('https://')) { setMessage('Worker URL must start with https://'); return; }
    localStorage.setItem(URL_KEY, baseUrl);
    sessionStorage.setItem(PASSWORD_KEY, password);
    setMessage('Connector settings saved on this device.');
  };

  const connect = async () => {
    setBusy(true); setMessage('');
    try {
      if (!baseUrl.startsWith('https://') || !password) throw new Error('Enter your Worker URL and connector password first.');
      localStorage.setItem(URL_KEY, baseUrl);
      sessionStorage.setItem(PASSWORD_KEY, password);
      const result = await api('/kite/login', 'POST');
      window.location.assign(result.loginUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not start Zerodha login.'); setBusy(false); }
  };

  const syncOrders = async () => {
    setBusy(true); setMessage('');
    // An explicit manual sync is the user's consent to fetch Zerodha history again.
    localStorage.removeItem(SKIP_AUTO_HISTORY_KEY);
    try {
      const result = await api('/kite/orders');
      const nextOrders = mergeUnique(orders, result.historyOrders || result.orders || [], 'order_id');
      const nextTrades = enrichTradePrices(mergeUnique(executions, result.historyTrades || result.trades || [], 'trade_id'), nextOrders);
      const nextHoldings = result.historyHoldings || result.holdings || [];
      const nextPositions = result.historyPositions || result.positions || [];
      setOrders(nextOrders); setExecutions(nextTrades); setHoldings(nextHoldings); setPositions(nextPositions);
      localStorage.setItem(ORDERS_KEY, JSON.stringify(nextOrders));
      localStorage.setItem(TRADES_KEY, JSON.stringify(nextTrades));
      localStorage.setItem(HOLDINGS_KEY, JSON.stringify(nextHoldings));
      localStorage.setItem(POSITIONS_KEY, JSON.stringify(nextPositions));
      setLastSync(result.fetchedAt || new Date().toISOString());
      setConnected(true);
      setMessage('Synced ' + (result.orders || []).length + ' orders, ' + (result.trades || []).length + ' fills, ' + nextHoldings.length + ' holdings and ' + nextPositions.length + ' positions.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not sync orders.';
      setMessage(text);
      if (/expired|session|unauthorized/i.test(text)) setConnected(false);
    } finally { setBusy(false); }
  };

  const clearSyncedData = () => {
    if (!window.confirm('Clear only imported Zerodha orders, fills, holdings, positions and Zerodha-generated journal rows from this device? Other MOTI data will remain unchanged.')) return;
    localStorage.setItem(SKIP_AUTO_HISTORY_KEY, '1');
    setOrders([]); setExecutions([]); setHoldings([]); setPositions([]);
    setJournalSummary(null);
    [ORDERS_KEY, TRADES_KEY, HOLDINGS_KEY, POSITIONS_KEY].forEach((key) => localStorage.removeItem(key));
    onExecutionsChangeRef.current?.([]);
    window.dispatchEvent(new Event('moti-clear-zerodha-journal'));
    window.dispatchEvent(new Event('moti-cloud-backup-request'));
    setMessage('Old Zerodha sync data cleared from this device. Connect Zerodha and run Sync all Zerodha to fetch fresh data.');
  };

  const disconnect = async () => {
    setBusy(true);
    try { await api('/kite/logout', 'POST'); } catch { /* local disconnect still clears this device's connector password */ }
    sessionStorage.removeItem(PASSWORD_KEY);
    setPassword(''); setConnected(false); setMessage('MOTI disconnected from the saved Kite session. Your imported order history remains on this device.');
    setBusy(false);
  };

  const completed = useMemo(() => orders.filter((o) => o.status === 'COMPLETE').length, [orders]);
  const pending = useMemo(() => orders.filter((o) => ['OPEN', 'TRIGGER PENDING', 'VALIDATION PENDING', 'PUT ORDER REQ RECEIVED'].includes(o.status || '')).length, [orders]);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#101d33] to-[#0b1424] p-4 shadow-xl shadow-cyan-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-cyan-300/10 p-2 text-cyan-300"><Activity className="h-5 w-5" /></div>
            <div><h2 className="text-base font-black text-white">Zerodha Kite · Full Portfolio Sync</h2><p className="text-[11px] text-slate-400">Orders · Executions · Demat Holdings · Trading Positions</p></div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${connected ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-slate-500/30 bg-slate-500/10 text-slate-400'}`}>
            {connected ? 'CONNECTED' : 'NOT CONNECTED'}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
          <label className="text-[11px] font-semibold text-slate-300">Cloudflare Worker URL
            <input value={workerUrl} onChange={(e) => setWorkerUrl(e.target.value)} placeholder="https://moti-kite-connector.YOUR-SUBDOMAIN.workers.dev" className="mt-1 w-full rounded-xl border border-[#29405e] bg-[#070d18] px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-300" />
          </label>
          <label className="text-[11px] font-semibold text-slate-300">MOTI connector password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Worker secret password" className="mt-1 w-full rounded-xl border border-[#29405e] bg-[#070d18] px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-300" />
          </label>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">API Secret and access token never belong in this website. They stay inside your Cloudflare Worker. The connector password is kept only in this browser session.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={saveSettings} className="rounded-xl border border-[#29405e] bg-[#101d33] px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-300">Save settings</button>
          <button onClick={() => exportCsv('MOTI_Zerodha_Orders.csv', orders as unknown as Array<Record<string, unknown>>)} disabled={!orders.length} className="rounded-xl border border-[#29405e] px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40">Export Orders CSV</button>
          <button onClick={() => exportCsv('MOTI_Zerodha_Executions.csv', executions as unknown as Array<Record<string, unknown>>)} disabled={!executions.length} className="rounded-xl border border-[#29405e] px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40">Export Fills CSV</button>
          <button disabled={busy} onClick={connect} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50"><Link2 className="h-4 w-4" /> Connect Zerodha</button>
          <button disabled={busy || !connected} onClick={syncOrders} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-200 disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Sync all Zerodha</button>
          <button disabled={busy || !password} onClick={disconnect} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 px-3 py-2 text-xs font-bold text-rose-300 disabled:opacity-40"><Unplug className="h-4 w-4" /> Disconnect</button>
          <button disabled={busy} onClick={clearSyncedData} className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-40">Clear old Zerodha data</button>
        </div>
        {message && <p className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3 text-xs text-cyan-100">{message}</p>}
        {journalSummary && <div className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-xs text-emerald-100"><p className="font-bold">Equity Journal reconciliation</p><p className="mt-1">{journalSummary.eligibleFills} eligible NSE/BSE fills · {journalSummary.importedJournalRows} journal rows generated.</p>{journalSummary.unmatchedSellFills > 0 && <p className="mt-1 text-amber-200">Attention: {journalSummary.unmatchedSellFills} SELL fills ({journalSummary.unmatchedSellQuantity} shares) have no earlier BUY fill in the available history and were not matched.</p>}</div>}
        <p className="mt-2 text-[10px] leading-relaxed text-cyan-100/70">Automatic sync: every weekday at 3:45 PM IST. For it to work, complete Zerodha Connect once after 6:00 AM on each trading day; Kite access tokens expire daily. You do not need to press Sync orders.</p>
        {lastSync && <p className="mt-2 text-[10px] text-slate-500">Last synced: {dateText(lastSync)}</p>}
      </div>


      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[{ label: 'Demat Holdings', value: holdings.length }, { label: 'Net Positions', value: positions.length }].map((item) => (
          <div key={item.label} className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-3"><p className="text-[10px] font-bold uppercase text-slate-500">{item.label}</p><p className="mt-1 text-xl font-black text-white">{item.value}</p></div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
        <div className="border-b border-[#1e2e4f] p-4"><h3 className="text-sm font-black text-white">Demat Holdings</h3><p className="text-[10px] text-slate-500">Zerodha current delivery holdings with average buy price and market value</p></div>
        <div className="max-h-[320px] overflow-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="sticky top-0 bg-[#101d33] text-[10px] uppercase text-slate-400"><tr>{['Stock','Qty','Avg. Buy','LTP','P&L'].map((x) => <th key={x} className="px-3 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]/60">{holdings.length ? holdings.map((h) => <tr key={(h.exchange || '') + h.tradingsymbol}><td className="px-3 py-3 font-bold text-white">{h.tradingsymbol}<span className="block text-[10px] text-slate-500">{h.exchange}</span></td><td className="px-3 py-3 text-slate-300">{h.quantity ?? 0}</td><td className="px-3 py-3 text-slate-300">₹{money(h.average_price)}</td><td className="px-3 py-3 text-slate-300">₹{money(h.last_price)}</td><td className={`px-3 py-3 font-bold ${(h.pnl || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>₹{money(h.pnl)}</td></tr>) : <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No Demat holdings returned by Zerodha.</td></tr>}</tbody></table></div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
        <div className="border-b border-[#1e2e4f] p-4"><h3 className="text-sm font-black text-white">Net Trading Positions</h3><p className="text-[10px] text-slate-500">Current net positions including intraday and carried positions</p></div>
        <div className="max-h-[320px] overflow-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="sticky top-0 bg-[#101d33] text-[10px] uppercase text-slate-400"><tr>{['Stock','Product','Qty','Avg. Price','LTP','P&L'].map((x) => <th key={x} className="px-3 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]/60">{positions.length ? positions.map((p) => <tr key={(p.exchange || '') + p.tradingsymbol + (p.product || '')}><td className="px-3 py-3 font-bold text-white">{p.tradingsymbol}<span className="block text-[10px] text-slate-500">{p.exchange}</span></td><td className="px-3 py-3 text-slate-400">{p.product || '—'}</td><td className="px-3 py-3 text-slate-300">{p.quantity ?? 0}</td><td className="px-3 py-3 text-slate-300">₹{money(p.average_price)}</td><td className="px-3 py-3 text-slate-300">₹{money(p.last_price)}</td><td className={`px-3 py-3 font-bold ${(p.pnl || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>₹{money(p.pnl)}</td></tr>) : <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No net positions returned by Zerodha.</td></tr>}</tbody></table></div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[{ label: 'Total Orders', value: orders.length }, { label: 'Completed', value: completed }, { label: 'Pending', value: pending }, { label: 'Executed Fills', value: executions.length }].map((item) => (
          <div key={item.label} className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-3"><p className="text-[10px] font-bold uppercase text-slate-500">{item.label}</p><p className="mt-1 text-xl font-black text-white">{item.value}</p></div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
        <div className="flex items-center justify-between border-b border-[#1e2e4f] p-4"><div><h3 className="text-sm font-black text-white">Order Book</h3><p className="text-[10px] text-slate-500">Includes complete, pending, cancelled and rejected orders</p></div><span className="text-xs text-slate-400">{orders.length} records</span></div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-xs"><thead className="sticky top-0 bg-[#101d33] text-[10px] uppercase text-slate-400"><tr>{['Time','Stock','Side','Qty / Filled','Avg. Price','Order Type','Status'].map((x) => <th key={x} className="px-3 py-3">{x}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#1e2e4f]/60">{orders.length ? [...orders].reverse().map((o) => <tr key={o.order_id}><td className="whitespace-nowrap px-3 py-3 text-slate-400">{dateText(o.exchange_timestamp || o.order_timestamp)}</td><td className="px-3 py-3 font-bold text-white">{o.tradingsymbol || '—'}<span className="block text-[10px] text-slate-500">{o.exchange || ''}</span></td><td className={`px-3 py-3 font-black ${o.transaction_type === 'BUY' ? 'text-emerald-300' : 'text-rose-300'}`}>{o.transaction_type || '—'}</td><td className="px-3 py-3 text-slate-300">{o.quantity ?? 0} / {o.filled_quantity ?? 0}</td><td className="px-3 py-3 text-right text-slate-200">₹{money(o.average_price)}</td><td className="px-3 py-3 text-slate-400">{o.order_type || '—'}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${o.status === 'COMPLETE' ? 'bg-emerald-400/10 text-emerald-300' : o.status === 'REJECTED' || o.status === 'CANCELLED' ? 'bg-rose-400/10 text-rose-300' : 'bg-amber-400/10 text-amber-200'}`}>{o.status || 'UNKNOWN'}</span></td></tr>) : <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">No orders synced yet. Complete today's Zerodha login and wait for the scheduled sync.</td></tr>}</tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
        <div className="flex items-center justify-between border-b border-[#1e2e4f] p-4"><div><h3 className="text-sm font-black text-white">Executed Trades</h3><p className="text-[10px] text-slate-500">Actual exchange fills; partial fills appear as separate executions</p></div><span className="text-xs text-slate-400">{executions.length} fills</span></div>
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full min-w-[620px] text-left text-xs"><thead className="sticky top-0 bg-[#101d33] text-[10px] uppercase text-slate-400"><tr>{['Fill Time','Stock','Side','Quantity','Fill Price','Trade ID'].map((x) => <th key={x} className="px-3 py-3">{x}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#1e2e4f]/60">{executions.length ? [...executions].reverse().map((t) => <tr key={t.trade_id}><td className="whitespace-nowrap px-3 py-3 text-slate-400">{dateText(t.fill_timestamp)}</td><td className="px-3 py-3 font-bold text-white">{t.tradingsymbol || '—'}<span className="block text-[10px] text-slate-500">{t.exchange || ''}</span></td><td className={`px-3 py-3 font-black ${t.transaction_type === 'BUY' ? 'text-emerald-300' : 'text-rose-300'}`}>{t.transaction_type || '—'}</td><td className="px-3 py-3 text-slate-300">{t.quantity ?? 0}</td><td className="px-3 py-3 text-slate-200">₹{money(t.price)}</td><td className="px-3 py-3 font-mono text-[10px] text-slate-500">{t.trade_id}</td></tr>) : <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">No executed trades synced yet.</td></tr>}</tbody>
          </table>
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-[10px] leading-relaxed text-amber-100/80"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Read-only connector: MOTI fetches orders, executions, Demat holdings and net positions. It cannot place, modify or cancel orders. Orders and executions are the current trading day's book; holdings and positions are current portfolio snapshots. Kite exposes the current trading day’s order/trade book; MOTI keeps synced history in this browser’s local storage. The Worker can automatically sync once per weekday at 3:45 PM IST after you complete Zerodha login that day. Kite tokens expire at 6:00 AM, so daily login is still required; manual Sync remains available as a fallback. Keep your normal MOTI JSON backup.</p></div>
    </section>
  );
};
