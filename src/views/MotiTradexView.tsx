import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wallet, TrendingUp, BriefcaseBusiness, IndianRupee, Link2, RefreshCw } from 'lucide-react';
import { CLOUD_WORKER_URL, getAppwriteJwt } from '../services/appwriteAuth';

type Holding = { id: string; symbol: string; buyPrice: number; quantity: number; currentPrice: number };
type OptionTrade = { id: string; index: 'NIFTY' | 'BANKNIFTY' | 'SENSEX'; side: 'CE' | 'PE'; strike: number; expiry: string; premium: number; currentPremium: number; lots: number; lotSize: number };
const OPTIONS_KEY = 'moti_tradex_options_v1';
const STORAGE_KEY = 'moti_tradex_holdings_v1';
const STARTING_CAPITAL = 100000;
// NSE index-option market lots currently applicable (NIFTY/BANKNIFTY).
const INDEX_LOT_SIZES: Record<'NIFTY' | 'BANKNIFTY', number> = { NIFTY: 65, BANKNIFTY: 30 };
const money = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);

export const MotiTradexView: React.FC = () => {
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Holding[]; } catch { return []; }
  });
  const [options, setOptions] = useState<OptionTrade[]>(() => { try { return JSON.parse(localStorage.getItem(OPTIONS_KEY) || '[]') as OptionTrade[]; } catch { return []; } });
  const [index, setIndex] = useState<OptionTrade['index']>('NIFTY');
  const [side, setSide] = useState<OptionTrade['side']>('CE');
  const [strike, setStrike] = useState('');
  const [expiry, setExpiry] = useState('');
  const [premium, setPremium] = useState('');
  const [currentPremium, setCurrentPremium] = useState('');
  const [lots, setLots] = useState('1');
  const [lotSize, setLotSize] = useState('');
  const [symbol, setSymbol] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [fyersConnected, setFyersConnected] = useState<boolean | null>(null);
  const [fyersConnectedAt, setFyersConnectedAt] = useState<string | null>(null);
  const [fyersBusy, setFyersBusy] = useState(false);
  const [fyersError, setFyersError] = useState('');

  type IndexQuote = { symbol: string; ltp: number | null; change: number | null; changePercent: number | null; open: number | null; high: number | null; low: number | null; previousClose: number | null; error?: string };
  const [indexQuotes, setIndexQuotes] = useState<Record<string, IndexQuote>>({});
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<string | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  type OptionChainData = { callOi?: number; putOi?: number; expiryData?: Array<{ date: string; expiry: string }>; indiavixData?: { ltp?: number; ltpchp?: number }; optionsChain?: Array<{ strike_price: number; option_type: string; ltp?: number; ltpch?: number; ltpchp?: number; oi?: number; oich?: number; oichp?: number; volume?: number; bid?: number; ask?: number; greeks?: { iv?: number; delta?: number; gamma?: number; theta?: number; vega?: number } }> };
  const [optionIndex, setOptionIndex] = useState<'NIFTY' | 'BANKNIFTY'>('NIFTY');
  const [optionExpiry, setOptionExpiry] = useState('');
  const [optionChain, setOptionChain] = useState<OptionChainData | null>(null);
  const [optionChainUpdatedAt, setOptionChainUpdatedAt] = useState<string | null>(null);
  const [optionChainBusy, setOptionChainBusy] = useState(false);
  const [optionChainError, setOptionChainError] = useState('');
  const [paperPrefillNote, setPaperPrefillNote] = useState('');


  const refreshFyersStatus = async () => {
    setFyersBusy(true); setFyersError('');
    try {
      const jwt = await getAppwriteJwt();
      const res = await fetch(`${CLOUD_WORKER_URL}/api/fyers/status`, { headers: { authorization: `Bearer ${jwt}` }, cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'FYERS status check failed.');
      setFyersConnected(Boolean(body.connected)); setFyersConnectedAt(body.connectedAt || null);
    } catch (error) { setFyersError(error instanceof Error ? error.message : 'FYERS status check failed.'); }
    finally { setFyersBusy(false); }
  };


  const fetchIndexQuotes = async () => {
    if (quoteBusy || !fyersConnected) return;
    setQuoteBusy(true); setQuoteError('');
    try {
      const jwt = await getAppwriteJwt();
      const res = await fetch(`${CLOUD_WORKER_URL}/api/fyers/quote`, { headers: { authorization: `Bearer ${jwt}` }, cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Index quotes fetch failed.');
      setIndexQuotes(body.quotes || {});
      setQuoteUpdatedAt(body.updatedAt || new Date().toISOString());
      const failed = Object.values(body.quotes || {}).filter((q: any) => q.error);
      if (failed.length) setQuoteError(failed.map((q: any) => q.error).join(' '));
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : 'Index quotes fetch failed.');
    } finally { setQuoteBusy(false); }
  };

  const fetchOptionChain = async () => {
    if (!fyersConnected) return;
    setOptionChainBusy(true); setOptionChainError('');
    try {
      const jwt = await getAppwriteJwt();
      const params = new URLSearchParams({ index: optionIndex, strikecount: '10' });
      if (optionExpiry) params.set('timestamp', optionExpiry);
      const res = await fetch(`${CLOUD_WORKER_URL}/api/fyers/option-chain?${params.toString()}`, {
        headers: { authorization: `Bearer ${jwt}` }, cache: 'no-store'
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Option chain fetch failed.');
      setOptionChain(body.data || null);
      setOptionChainUpdatedAt(body.updatedAt || new Date().toISOString());
      const expiries = body.data?.expiryData || [];
      const activeExpiry = expiries.find((item: { date: string; expiry: string }) => String(item.expiry) === optionExpiry) || expiries[0];
      if (!optionExpiry && expiries.length) setOptionExpiry(String(expiries[0].expiry));
      // Refresh matching paper positions from the same FYERS option-chain snapshot.
      if (activeExpiry?.date) {
        const parts = activeExpiry.date.split('-');
        const expiryISO = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '';
        const rows = body.data?.optionsChain || [];
        if (expiryISO && rows.length) setOptions(old => old.map(trade => {
          if (trade.index !== optionIndex || trade.expiry !== expiryISO) return trade;
          const quote = rows.find((row: { strike_price: number; option_type: string; ltp?: number }) => row.strike_price === trade.strike && row.option_type === trade.side);
          return typeof quote?.ltp === 'number' ? { ...trade, currentPremium: quote.ltp } : trade;
        }));
      }
    } catch (error) {
      setOptionChainError(error instanceof Error ? error.message : 'Option chain fetch failed.');
    } finally { setOptionChainBusy(false); }
  };

  const prefillPaperTrade = (contractSide: 'CE' | 'PE', strikePrice: number, ltp: number) => {
    const selectedExpiry = optionChain?.expiryData?.find(item => item.expiry === optionExpiry);
    const dateParts = selectedExpiry?.date?.split('-') || [];
    const isoExpiry = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : '';
    setIndex(optionIndex);
    setSide(contractSide);
    setStrike(String(strikePrice));
    setExpiry(isoExpiry);
    setPremium(String(ltp));
    setCurrentPremium(String(ltp));
    setLots('1');
    setLotSize(String(INDEX_LOT_SIZES[optionIndex]));
    setPaperPrefillNote(`${optionIndex} ${strikePrice} ${contractSide} निवडले. Premium आणि lot size (${INDEX_LOT_SIZES[optionIndex]}) auto-fill झाले.`);
    document.getElementById('moti-paper-trade-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const connectFyers = async () => {
    setFyersBusy(true); setFyersError('');
    try {
      const jwt = await getAppwriteJwt();
      const res = await fetch(`${CLOUD_WORKER_URL}/api/fyers/login`, { headers: { authorization: `Bearer ${jwt}` }, cache: 'no-store' });
      const body = await res.json();
      if (!res.ok || !body.loginUrl) throw new Error(body.error || 'Could not start FYERS login.');
      window.location.assign(body.loginUrl);
    } catch (error) { setFyersError(error instanceof Error ? error.message : 'Could not start FYERS login.'); setFyersBusy(false); }
  };

  useEffect(() => { void refreshFyersStatus(); }, []);

  useEffect(() => {
    if (!fyersConnected) return;
    void fetchIndexQuotes();
    const timer = window.setInterval(() => { void fetchIndexQuotes(); }, 60000);
    return () => window.clearInterval(timer);
  }, [fyersConnected]);

  useEffect(() => {
    if (!fyersConnected) return;
    void fetchOptionChain();
    const timer = window.setInterval(() => { void fetchOptionChain(); }, 60000);
    return () => window.clearInterval(timer);
  }, [fyersConnected, optionIndex, optionExpiry]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings)); }, [holdings]);
  useEffect(() => { localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)); }, [options]);

  const totals = useMemo(() => {
    const investment = holdings.reduce((sum, h) => sum + h.buyPrice * h.quantity, 0);
    const marketValue = holdings.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0);
    const optionInvestment = options.reduce((sum, o) => sum + o.premium * o.lots * o.lotSize, 0);
    const optionValue = options.reduce((sum, o) => sum + o.currentPremium * o.lots * o.lotSize, 0);
    const available = STARTING_CAPITAL - investment - optionInvestment;
    return { investment: investment + optionInvestment, marketValue: marketValue + optionValue, available, pnl: marketValue - investment + optionValue - optionInvestment, portfolio: available + marketValue + optionValue };
  }, [holdings, options]);

  const addHolding = (e: React.FormEvent) => {
    e.preventDefault();
    const b = Number(buyPrice), q = Number(quantity), c = Number(currentPrice);
    if (!symbol.trim() || !Number.isFinite(b) || !Number.isFinite(q) || !Number.isFinite(c) || b <= 0 || q <= 0 || c < 0) return;
    if (b * q > totals.available) { alert('Available balance पुरेसा नाही.'); return; }
    setHoldings(old => [...old, { id: crypto.randomUUID(), symbol: symbol.trim().toUpperCase(), buyPrice: b, quantity: q, currentPrice: c }]);
    setSymbol(''); setBuyPrice(''); setQuantity(''); setCurrentPrice('');
  };

  const updatePrice = (id: string, value: string) => {
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return;
    setHoldings(old => old.map(h => h.id === id ? { ...h, currentPrice: price } : h));
  };

  const addOption = (e: React.FormEvent) => {
    e.preventDefault();
    const s = Number(strike), p = Number(premium), cp = Number(currentPremium), l = Number(lots), ls = Number(lotSize);
    if (!expiry || !Number.isFinite(s) || !Number.isFinite(p) || !Number.isFinite(cp) || !Number.isFinite(l) || !Number.isFinite(ls) || s <= 0 || p <= 0 || cp < 0 || l <= 0 || ls <= 0) return;
    if (p * l * ls > totals.available) { alert('Available balance पुरेसा नाही.'); return; }
    setOptions(old => [...old, { id: crypto.randomUUID(), index, side, strike: s, expiry, premium: p, currentPremium: cp, lots: l, lotSize: ls }]);
    setStrike(''); setExpiry(''); setPremium(''); setCurrentPremium(''); setLots('1'); setLotSize('');
  };
  const cards = [
    { label: 'Portfolio Value', value: totals.portfolio, icon: BriefcaseBusiness, color: 'text-cyan-300' },
    { label: 'Available Balance', value: totals.available, icon: Wallet, color: 'text-emerald-300' },
    { label: 'Total Investment', value: totals.investment, icon: IndianRupee, color: 'text-amber-300' },
    { label: 'Total P&L', value: totals.pnl, icon: TrendingUp, color: totals.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300' },
  ];

  return <div className="space-y-5">
    <section className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#10243b] via-[#0d1928] to-[#0d1527] p-5 sm:p-7">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">MOTI · TRADEX</div>
      <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">MOTI TRADEX Portfolio</h1>
      <p className="mt-2 text-sm text-slate-300">Starting capital ₹1,00,000 · तुमचे holdings आणि P&L इथे track करा. Prices manually update करा.</p>
    </section>
    <section className="rounded-2xl border border-cyan-300/20 bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-bold text-white">FYERS Market Data Connection</h2>
          <p className="mt-1 text-xs text-slate-400">फक्त market data access. MOTI मधून कोणतेही broker orders place केले जाणार नाहीत.</p>
          <p className={`mt-2 text-xs ${fyersConnected ? "text-emerald-300" : "text-amber-300"}`}>{fyersConnected === null ? "Status तपासत आहे…" : fyersConnected ? "FYERS connected" : "FYERS not connected"}</p>
          {fyersConnectedAt && <p className="mt-1 text-[11px] text-slate-500">Connected: {new Date(fyersConnectedAt).toLocaleString("en-IN")}</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void refreshFyersStatus()} disabled={fyersBusy} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50"><RefreshCw className="h-4 w-4"/>Refresh</button>
          <button type="button" onClick={() => void connectFyers()} disabled={fyersBusy} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"><Link2 className="h-4 w-4"/>Connect FYERS</button>
        </div>
      </div>
      {fyersError && <p role="alert" className="mt-3 text-xs text-rose-300">{fyersError}</p>}
      <p className="mt-3 text-[11px] text-slate-500">FYERS login पूर्ण झाल्यावर MOTI मध्ये परत येऊन Refresh दाबा. Daily token expiry मुळे पुन्हा login लागू शकतो.</p>
    </section>

    <section className="rounded-2xl border border-cyan-300/20 bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-bold text-white">NIFTY 50 + BANKNIFTY · FYERS Quotes</h2>
          <p className="mt-1 text-xs text-slate-400">दोन्ही index चे market-data quote snapshots. दर 60 सेकंदांनी automatic refresh; order placement नाही.</p>
        </div>
        <button type="button" onClick={() => void fetchIndexQuotes()} disabled={quoteBusy || !fyersConnected} className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{quoteBusy ? 'Fetching…' : 'Refresh Quotes'}</button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {([{ key: 'NSE:NIFTY50-INDEX', label: 'NIFTY 50' }, { key: 'NSE:NIFTYBANK-INDEX', label: 'BANKNIFTY' }] as const).map(item => {
          const q = indexQuotes[item.key];
          return <div key={item.key} className="rounded-xl border border-white/10 bg-[#080f1b] p-3">
            <p className="text-xs font-bold text-cyan-300">{item.label}</p>
            {q ? <>
              <p className="mt-2 text-2xl font-black text-white">{q.ltp == null ? '—' : money(q.ltp)}</p>
              <p className={`mt-1 text-xs font-bold ${(q.change ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{q.error || (q.change == null ? '—' : `${q.change} (${q.changePercent ?? 0}%)`)}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><p className="text-slate-500">Day High / Low</p><p className="mt-1 text-slate-200">{q.high == null ? '—' : money(q.high)} / {q.low == null ? '—' : money(q.low)}</p></div><div><p className="text-slate-500">Previous Close</p><p className="mt-1 text-slate-200">{q.previousClose == null ? '—' : money(q.previousClose)}</p></div></div>
            </> : <p className="mt-3 text-xs text-slate-500">{fyersConnected ? 'Quote मिळवत आहे…' : 'FYERS connect करा.'}</p>}
          </div>;
        })}
      </div>
      {quoteError && <p role="alert" className="mt-3 text-xs text-rose-300">{quoteError}</p>}
      {quoteUpdatedAt && <p className="mt-3 text-[11px] text-slate-500">Last checked: {new Date(quoteUpdatedAt).toLocaleString('en-IN')} · Auto refresh: 60 sec</p>}
    </section>

    <section className="rounded-2xl border border-cyan-300/20 bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white">Live Option Chain · FYERS</h2>
          <p className="mt-1 text-xs text-slate-400">NIFTY / BANKNIFTY · ATM च्या दोन्ही बाजूला 10 strikes · दर 60 सेकंदांनी auto-refresh.</p>
        </div>
        <button type="button" onClick={() => void fetchOptionChain()} disabled={optionChainBusy || !fyersConnected} className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{optionChainBusy ? 'Fetching…' : 'Refresh Chain'}</button>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Index निवडा</p>
          <div className="flex gap-2" role="group" aria-label="Option chain index">
            {(['NIFTY', 'BANKNIFTY'] as const).map(item => <button key={item} type="button" aria-pressed={optionIndex === item} onClick={() => { if (optionIndex !== item) { setOptionChain(null); setOptionExpiry(''); setOptionIndex(item); } }} className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${optionIndex === item ? 'border-cyan-300 bg-cyan-300 text-slate-950' : 'border-slate-700 bg-[#080f1b] text-slate-300 hover:border-cyan-300/60'}`}>{item}</button>)}
          </div>
        </div>
        <div>
          <label htmlFor="moti-option-expiry" className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Expiry Date</label>
          <select id="moti-option-expiry" aria-label="Option expiry" value={optionExpiry} onChange={e => setOptionExpiry(e.target.value)} disabled={!optionChain?.expiryData?.length} className="min-w-44 rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-2.5 text-xs text-white disabled:opacity-50">
            {(optionChain?.expiryData || []).map(item => <option key={item.expiry} value={item.expiry}>{item.date}</option>)}
          </select>
        </div>
      </div>
      {optionChain && <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-300">
        <span>Call OI: <b className="text-emerald-300">{money(optionChain.callOi || 0)}</b></span>
        <span>Put OI: <b className="text-rose-300">{money(optionChain.putOi || 0)}</b></span>
        {optionChain.indiavixData?.ltp != null && <span>India VIX: <b className="text-white">{money(optionChain.indiavixData.ltp)}</b></span>}
      </div>}
      {optionChainError && <p role="alert" className="mt-3 text-xs text-rose-300">{optionChainError}</p>}
      {!fyersConnected ? <p className="mt-4 text-xs text-slate-500">Option chain पाहण्यासाठी FYERS connect करा.</p> : !optionChain && !optionChainError ? <p className="mt-4 text-xs text-slate-500">Option chain मिळवत आहे…</p> : null}
      {optionChain?.optionsChain && <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1050px] text-right text-[11px]">
          <thead className="text-slate-400"><tr>
            <th className="p-2 text-left">CE LTP</th><th className="p-2">CE Chg%</th><th className="p-2">CE OI</th><th className="p-2">CE OI Chg</th><th className="p-2">CE Vol</th><th className="p-2">CE IV</th>
            <th className="bg-slate-800 p-2 text-center text-white">STRIKE</th>
            <th className="p-2">PE IV</th><th className="p-2">PE Vol</th><th className="p-2">PE OI Chg</th><th className="p-2">PE OI</th><th className="p-2">PE Chg%</th><th className="p-2 text-right">PE LTP</th>
          </tr></thead>
          <tbody>{Array.from(new Set(optionChain.optionsChain.filter(x => x.strike_price >= 0).map(x => x.strike_price))).sort((a,b) => a-b).map(price => {
            const ce = optionChain.optionsChain?.find(x => x.strike_price === price && x.option_type === 'CE');
            const pe = optionChain.optionsChain?.find(x => x.strike_price === price && x.option_type === 'PE');
            return <tr key={price} className="border-t border-slate-700/70 text-slate-200">
              <td className="p-2 text-left">{ce?.ltp == null ? '—' : <button type="button" title="Paper trade this CE" onClick={() => prefillPaperTrade('CE', price, ce.ltp!)} className="rounded-lg px-2 py-1 font-bold text-emerald-300 hover:bg-emerald-300/10 hover:underline">{money(ce.ltp)}</button>}</td><td className="p-2">{ce?.ltpchp == null ? '—' : ce.ltpchp.toFixed(2)+'%'}</td><td className="p-2">{ce?.oi == null ? '—' : money(ce.oi)}</td><td className="p-2">{ce?.oich == null ? '—' : money(ce.oich)}</td><td className="p-2">{ce?.volume == null ? '—' : money(ce.volume)}</td><td className="p-2">{ce?.greeks?.iv == null ? '—' : ce.greeks.iv.toFixed(2)}</td>
              <td className="bg-slate-800/70 p-2 text-center font-black text-white">{money(price)}</td>
              <td className="p-2">{pe?.greeks?.iv == null ? '—' : pe.greeks.iv.toFixed(2)}</td><td className="p-2">{pe?.volume == null ? '—' : money(pe.volume)}</td><td className="p-2">{pe?.oich == null ? '—' : money(pe.oich)}</td><td className="p-2">{pe?.oi == null ? '—' : money(pe.oi)}</td><td className="p-2">{pe?.ltpchp == null ? '—' : pe.ltpchp.toFixed(2)+'%'}</td><td className="p-2 text-right">{pe?.ltp == null ? '—' : <button type="button" title="Paper trade this PE" onClick={() => prefillPaperTrade('PE', price, pe.ltp!)} className="rounded-lg px-2 py-1 font-bold text-rose-300 hover:bg-rose-300/10 hover:underline">{money(pe.ltp)}</button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      {optionChainUpdatedAt && <p className="mt-3 text-[11px] text-slate-500">Last updated: {new Date(optionChainUpdatedAt).toLocaleString('en-IN')} · Auto refresh: 60 sec</p>}
    </section>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => { const Icon = card.icon; return <div key={card.label} className="rounded-2xl border border-white/10 bg-[#0d1527] p-4">
        <div className="flex items-center justify-between"><p className="text-xs text-slate-400">{card.label}</p><Icon className={`h-4 w-4 ${card.color}`} /></div>
        <p className={`mt-3 text-xl font-black ${card.color}`}>₹{money(card.value)}</p>
      </div>; })}
    </div>
    <section className="rounded-2xl border border-white/10 bg-[#0d1527] p-4 sm:p-5">
      <h2 className="text-sm font-bold text-white">Add Investment</h2>
      <form onSubmit={addHolding} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="Stock / Symbol" required className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white" />
        <input type="number" min="0.01" step="0.01" value={buyPrice} onChange={e=>setBuyPrice(e.target.value)} placeholder="Buy Price ₹" required className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white" />
        <input type="number" min="1" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="Quantity" required className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white" />
        <input type="number" min="0" step="0.01" value={currentPrice} onChange={e=>setCurrentPrice(e.target.value)} placeholder="Current Price ₹" required className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white" />
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-sm font-bold text-slate-950"><Plus className="h-4 w-4"/>Add Holding</button>
      </form>
      <p className="mt-2 text-[11px] text-slate-500">हे manual portfolio tracker आहे; broker शी जोडलेले नाही.</p>
    </section>
    <section id="moti-paper-trade-form" className="rounded-2xl border border-cyan-300/20 bg-[#0d1527] p-4 sm:p-5">
      <h2 className="text-sm font-bold text-white">Paper Trading · Buy Index Options</h2>
      {paperPrefillNote && <p className="mt-2 rounded-lg border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-xs text-cyan-200">{paperPrefillNote}</p>}
      <form onSubmit={addOption} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <select value={index} onChange={e=>setIndex(e.target.value as OptionTrade['index'])} className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white"><option>NIFTY</option><option>BANKNIFTY</option><option>SENSEX</option></select>
        <select value={side} onChange={e=>setSide(e.target.value as OptionTrade['side'])} className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white"><option value="CE">CE</option><option value="PE">PE</option></select>
        <input type="number" min="1" step="0.05" value={strike} onChange={e=>setStrike(e.target.value)} placeholder="Strike Price" required className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white" />
        <input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)} required className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white" />
        <input type="number" min="0.01" step="0.05" value={premium} onChange={e=>setPremium(e.target.value)} placeholder="Buy Premium ₹" required className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white" />
        <input type="number" min="0" step="0.05" value={currentPremium} onChange={e=>setCurrentPremium(e.target.value)} placeholder="Current Premium ₹" required className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white" />
        <input type="number" min="1" step="1" value={lots} onChange={e=>setLots(e.target.value)} placeholder="Lots" required className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white" />
        <input type="number" min="1" step="1" value={lotSize} onChange={e=>setLotSize(e.target.value)} placeholder="Lot Size" required className="rounded-xl border border-slate-700 bg-[#080f1b] px-3 py-3 text-sm text-white" />
        <button type="submit" className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 sm:col-span-4"><Plus className="h-4 w-4"/>Paper Buy</button>
      </form>
      <p className="mt-2 text-[11px] text-slate-500">Option Chain मधील निवडलेल्या index आणि expiry शी जुळणाऱ्या paper trades चे Current Premium chain refresh वर आपोआप update होईल. इतर expiry/index साठी price manually update करा. ही फक्त simulated paper trade आहे; कोणताही broker order जात नाही.</p>
      {options.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="text-slate-400"><tr>{['Contract','Strike','Expiry','Buy Premium','Current Premium','Lots × Lot Size','Investment','P&L',''].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>{options.map(o=>{const qty=o.lots*o.lotSize;const pnl=(o.currentPremium-o.premium)*qty;return <tr key={o.id} className="border-t border-slate-700 text-slate-200"><td className="p-2 font-bold text-white">{o.index} {o.side}</td><td className="p-2">{money(o.strike)}</td><td className="p-2">{o.expiry}</td><td className="p-2">₹{money(o.premium)}</td><td className="p-2"><input aria-label="Current option premium" type="number" min="0" step="0.05" value={o.currentPremium} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=0)setOptions(old=>old.map(x=>x.id===o.id?{...x,currentPremium:v}:x));}} className="w-24 rounded bg-[#080f1b] px-2 py-1 text-white" /></td><td className="p-2">{o.lots} × {o.lotSize}</td><td className="p-2">₹{money(o.premium*qty)}</td><td className={`p-2 font-bold ${pnl>=0?'text-emerald-300':'text-rose-300'}`}>{pnl<0?'-':''}₹{money(Math.abs(pnl))}</td><td className="p-2"><button type="button" onClick={()=>setOptions(old=>old.filter(x=>x.id!==o.id))} aria-label="Remove option" className="rounded p-1 text-rose-300"><Trash2 className="h-4 w-4"/></button></td></tr>;})}</tbody></table></div>}
    </section>
    <section className="rounded-2xl border border-white/10 bg-[#0d1527] p-4 sm:p-5">
      <h2 className="text-sm font-bold text-white">My Portfolio</h2>
      {holdings.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">अजून investment add केलेली नाही. वरून पहिली holding add करा.</p> :
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs">
        <thead className="text-slate-400"><tr>{['Stock','Buy Price','Qty','Current Price','Investment','P&L',''].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead>
        <tbody>{holdings.map(h=>{const pnl=(h.currentPrice-h.buyPrice)*h.quantity;return <tr key={h.id} className="border-t border-slate-700 text-slate-200">
          <td className="p-2 font-bold text-white">{h.symbol}</td><td className="p-2">₹{money(h.buyPrice)}</td><td className="p-2">{h.quantity}</td>
          <td className="p-2"><input aria-label={h.symbol+' current price'} type="number" min="0" step="0.01" value={h.currentPrice} onChange={e=>updatePrice(h.id,e.target.value)} className="w-28 rounded bg-[#080f1b] px-2 py-1 text-white"/></td>
          <td className="p-2">₹{money(h.buyPrice*h.quantity)}</td><td className={`p-2 font-bold ${pnl>=0?'text-emerald-300':'text-rose-300'}`}>{pnl<0?'-':''}₹{money(Math.abs(pnl))}</td>
          <td className="p-2"><button type="button" onClick={()=>setHoldings(old=>old.filter(x=>x.id!==h.id))} aria-label={'Remove '+h.symbol} className="rounded p-1 text-rose-300 hover:bg-rose-400/10"><Trash2 className="h-4 w-4"/></button></td>
        </tr>;})}</tbody>
      </table></div>}
    </section>
  </div>;
};
