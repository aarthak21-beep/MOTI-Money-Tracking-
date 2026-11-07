import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { downloadCSV, formatINR } from '../utils/exportUtils';

const API = 'https://moti-money-tracking-api.onrender.com/api/fyers';

type FyersFill = {
  symbol?: string;
  description?: string;
  orderDateTime?: string | number;
  orderNumber?: string;
  tradeNumber?: string;
  side?: number | string;
  traded_qty?: number;
  tradedQty?: number;
  trade_price?: number;
  tradePrice?: number;
  trade_value?: number;
  tradeValue?: number;
  product_type?: string;
  productType?: string;
  segment?: number;
};

type FyersOrder = {
  id?: string;
  symbol?: string;
  description?: string;
  orderDateTime?: string;
  side?: number;
  qty?: number;
  filledQty?: number;
  remainingQuantity?: number;
  limitPrice?: number;
  tradedPrice?: number;
  productType?: string;
  status?: number;
  message?: string;
  segment?: number;
};

type FyersPosition = {
  symbol?: string;
  netQty?: number;
  qty?: number;
  netAvg?: number;
  pl?: number;
  realized_profit?: number;
  pl_realized?: number;
  pl_unrealized?: number;
  productType?: string;
};

type ApiStatus = { configured?: boolean; connected?: boolean; tokenCreatedAt?: number | null };

const money = (value: unknown) => formatINR(Number(value) || 0);
const dateLabel = (value?: string | number) => {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toLocaleString('en-IN');
  return value;
};

export const FyersFnoView: React.FC = () => {
  const [status, setStatus] = useState<ApiStatus>({});
  const [fills, setFills] = useState<FyersFill[]>([]);
  const [positions, setPositions] = useState<FyersPosition[]>([]);
  const [orders, setOrders] = useState<FyersOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const statusResponse = await fetch(`${API}/status`);
      if (!statusResponse.ok) throw new Error('MOTI server status मिळू शकला नाही.');
      const nextStatus: ApiStatus = await statusResponse.json();
      setStatus(nextStatus);
      if (!nextStatus.connected) {
        setFills([]);
        setPositions([]);
        setOrders([]);
        return;
      }

      const allFills: FyersFill[] = [];
      for (let page = 1; page <= 10; page++) {
        const response = await fetch(`${API}/trade-history?page_no=${page}&page_size=100`);
        const payload = await response.json();
        if (!response.ok || payload.s !== 'ok') throw new Error(payload.error || payload.message || 'FYERS Trade History मिळाली नाही.');
        const rows = Array.isArray(payload.data) ? payload.data : [];
        allFills.push(...rows);
        if (rows.length < 100) break;
      }

      const positionsResponse = await fetch(`${API}/positions`);
      const positionsPayload = await positionsResponse.json();
      if (!positionsResponse.ok || positionsPayload.s !== 'ok') {
        throw new Error(positionsPayload.error || positionsPayload.message || 'FYERS Positions मिळाली नाही.');
      }
      const positionRows = Array.isArray(positionsPayload.netPositions) ? positionsPayload.netPositions.filter((position: FyersPosition) => /(?:CE|PE|FUT)$/i.test(position.symbol || '')) : [];
      const ordersResponse = await fetch(`${API}/orders`);
      const ordersPayload = await ordersResponse.json();
      if (!ordersResponse.ok || ordersPayload.s !== 'ok') {
        throw new Error(ordersPayload.error || ordersPayload.message || 'FYERS Order Book मिळाली नाही.');
      }
      const orderRows = Array.isArray(ordersPayload.orderBook)
        ? ordersPayload.orderBook.filter((order: FyersOrder) => Number(order.segment) === 11)
        : [];
      setFills(allFills);
      setPositions(positionRows);
      setOrders(orderRows);
      setLastSynced(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync करताना अडचण आली.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const totals = useMemo(() => positions.reduce((acc, position) => {
    acc.realized += Number(position.realized_profit ?? position.pl_realized ?? 0);
    acc.total += Number(position.pl ?? 0);
    if (Number(position.netQty ?? position.qty ?? 0) !== 0) acc.open += 1;
    return acc;
  }, { realized: 0, total: 0, open: 0 }), [positions]);

  const exportTrades = () => downloadCSV('MOTI_FYERS_FNO_Trade_History',
    ['Date & Time', 'Symbol', 'Side', 'Quantity', 'Trade Price', 'Trade Value', 'Product', 'Order Number', 'Trade Number'],
    fills.map(fill => [
      dateLabel(fill.orderDateTime), fill.symbol || fill.description || '',
      Number(fill.side) === 1 ? 'BUY' : Number(fill.side) === -1 ? 'SELL' : String(fill.side ?? ''),
      fill.traded_qty ?? fill.tradedQty ?? '', fill.trade_price ?? fill.tradePrice ?? '',
      fill.trade_value ?? fill.tradeValue ?? '', fill.product_type ?? fill.productType ?? '',
      fill.orderNumber || '', fill.tradeNumber || ''
    ]));

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-black text-white">FYERS · F&O AUTO SYNC</h2>
        <p className="mt-1 text-xs text-slate-400">FYERS Equity Derivatives व्यवहार आपोआप. Zerodha Cash Equity पासून स्वतंत्र.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[#1e2e4f] px-3 py-2 text-xs text-slate-200 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/> {loading ? 'Syncing…' : 'Sync Now'}
        </button>
        <button onClick={exportTrades} disabled={!fills.length} className="inline-flex items-center gap-2 rounded-xl border border-[#1e2e4f] px-3 py-2 text-xs text-slate-200 disabled:opacity-40">
          <Download className="h-4 w-4"/> Export CSV
        </button>
      </div>
    </div>

    <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-slate-400">FYERS Connection</p>
          <p className={`mt-1 text-sm font-bold ${status.connected ? 'text-emerald-400' : 'text-amber-300'}`}>{status.connected ? 'Connected · Read Only' : status.configured ? 'Login required' : 'Configuration required'}</p>
        </div>
        {!status.connected && <a href={`${API}/connect`} className="inline-flex items-center gap-2 rounded-lg bg-emerald-300 px-3 py-2 text-xs font-bold text-slate-950">Connect FYERS <ExternalLink className="h-3 w-3"/></a>}
        <p className="text-[11px] text-slate-500">{lastSynced ? `Last sync: ${lastSynced.toLocaleString('en-IN')}` : 'अद्याप Sync झालेले नाही'}</p>
      </div>
      {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
      <p className="mt-3 text-[11px] text-slate-500">ही स्क्रीन FYERS Trade History मधील चालू आर्थिक वर्षातील Equity Derivatives fills आणते. स्क्रीन उघडी असताना दर 5 मिनिटांनी आणि परत स्क्रीनवर आल्यावर Sync होते.</p>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Executed F&O Fills</p><p className="mt-1 text-xl font-black text-white">{fills.length}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Open Positions</p><p className="mt-1 text-xl font-black text-cyan-300">{totals.open}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Position P&L · FYERS</p><p className={`mt-1 text-xl font-black ${totals.total >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{totals.total >= 0 ? '+' : '-'}₹{money(Math.abs(totals.total))}</p><p className="mt-1 text-[10px] text-slate-500">Realized: ₹{money(totals.realized)}</p></div>
    </div>

    <section className="space-y-2">
      <h3 className="text-sm font-bold text-white">Open / Current Positions</h3>
      <div className="overflow-x-auto rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="bg-[#0a101f] text-slate-400"><tr>{['Symbol','Net Qty','Net Avg','Realized P&L','Total P&L'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#1e2e4f]/60">
            {positions.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-slate-500">सध्या Positions उपलब्ध नाहीत.</td></tr> : positions.map((p, i) => {
              const pnl = Number(p.pl ?? 0);
              return <tr key={p.symbol || i} className="text-slate-200"><td className="p-3 font-bold">{p.symbol || '—'}</td><td className="p-3">{p.netQty ?? p.qty ?? 0}</td><td className="p-3">₹{money(p.netAvg)}</td><td className="p-3">₹{money(p.realized_profit ?? p.pl_realized)}</td><td className={`p-3 font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{pnl < 0 ? '-' : '+'}₹{money(Math.abs(pnl))}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>

    <section className="space-y-2">
      <div><h3 className="text-sm font-bold text-white">FYERS F&O Orders · आजच्या ऑर्डर्स</h3><p className="text-[11px] text-slate-500">Rejected, Pending, Cancelled, Filled आणि इतर ऑर्डर स्थिती · फक्त Equity Derivatives.</p></div>
      <div className="overflow-x-auto rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
        <table className="w-full min-w-[1050px] text-left text-xs">
          <thead className="bg-[#0a101f] text-slate-400"><tr>{['Date & Time','Contract','Side','Qty','Filled','Price','Status','Reason / Message','Order ID'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#1e2e4f]/60">
            {orders.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-slate-500">आज FYERS F&O Order Book मध्ये ऑर्डर्स उपलब्ध नाहीत.</td></tr> : orders.map((order, i) => {
              const statusLabels: Record<number, string> = { 1: 'Cancelled', 2: 'Executed', 4: 'Transit', 5: 'Rejected', 6: 'Pending', 7: 'Expired' };
              const status = Number(order.status);
              const statusTone = status === 5 ? 'text-rose-400' : status === 2 ? 'text-emerald-400' : status === 6 || status === 4 ? 'text-amber-300' : 'text-slate-300';
              return <tr key={order.id || i} className="text-slate-200">
                <td className="p-3 whitespace-nowrap">{order.orderDateTime || '—'}</td>
                <td className="p-3 font-bold">{order.symbol || order.description || '—'}</td>
                <td className="p-3">{Number(order.side) === 1 ? 'BUY' : Number(order.side) === -1 ? 'SELL' : '—'}</td>
                <td className="p-3">{order.qty ?? '—'}</td><td className="p-3">{order.filledQty ?? 0}</td>
                <td className="p-3">₹{money(order.tradedPrice || order.limitPrice)}</td>
                <td className={`p-3 font-bold ${statusTone}`}>{statusLabels[status] || `Status ${status || '—'}`}</td>
                <td className="p-3 max-w-[280px] whitespace-normal">{order.message || '—'}</td>
                <td className="p-3">{order.id || '—'}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>

    <section className="space-y-2">
      <div><h3 className="text-sm font-bold text-white">FYERS F&O Executed Trades</h3><p className="text-[11px] text-slate-500">चालू आर्थिक वर्षातील Equity Derivatives व्यवहार · प्रत्येक row म्हणजे एक executed fill.</p></div>
      <div className="overflow-x-auto rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
        <table className="w-full min-w-[950px] text-left text-xs">
          <thead className="bg-[#0a101f] text-slate-400"><tr>{['Date & Time','Contract','Side','Qty','Trade Price','Trade Value','Product','Order ID'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#1e2e4f]/60">
            {fills.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-slate-500">{status.connected ? 'या आर्थिक वर्षात FYERS कडून F&O executed trades मिळाले नाहीत.' : 'FYERS जोडल्यावर व्यवहार इथे आपोआप दिसतील.'}</td></tr> : fills.map((fill, i) => {
              const side = Number(fill.side);
              return <tr key={fill.tradeNumber || `${fill.orderNumber}-${i}`} className="text-slate-200"><td className="p-3 whitespace-nowrap">{dateLabel(fill.orderDateTime)}</td><td className="p-3 font-bold">{fill.symbol || fill.description || '—'}</td><td className={`p-3 font-bold ${side === 1 ? 'text-emerald-400' : 'text-rose-400'}`}>{side === 1 ? 'BUY' : side === -1 ? 'SELL' : '—'}</td><td className="p-3">{fill.traded_qty ?? fill.tradedQty ?? '—'}</td><td className="p-3">₹{money(fill.trade_price ?? fill.tradePrice)}</td><td className="p-3">₹{money(fill.trade_value ?? fill.tradeValue)}</td><td className="p-3">{fill.product_type ?? fill.productType ?? '—'}</td><td className="p-3">{fill.orderNumber || '—'}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
    <p className="text-[11px] text-slate-500">टीप: Trade History हे executed fills दाखवते. Position P&L FYERS च्या Positions API मधून घेतले जाते; ते स्वतंत्रपणे दर्शवले आहे. API Token ब्राउजरमध्ये साठवला जात नाही.</p>
  </div>;
};
