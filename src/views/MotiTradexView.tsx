import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wallet, TrendingUp, BriefcaseBusiness, IndianRupee } from 'lucide-react';

type Holding = { id: string; symbol: string; buyPrice: number; quantity: number; currentPrice: number };
const STORAGE_KEY = 'moti_tradex_holdings_v1';
const STARTING_CAPITAL = 100000;
const money = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);

export const MotiTradexView: React.FC = () => {
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Holding[]; } catch { return []; }
  });
  const [symbol, setSymbol] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings)); }, [holdings]);

  const totals = useMemo(() => {
    const investment = holdings.reduce((sum, h) => sum + h.buyPrice * h.quantity, 0);
    const marketValue = holdings.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0);
    return { investment, marketValue, available: STARTING_CAPITAL - investment, pnl: marketValue - investment, portfolio: STARTING_CAPITAL - investment + marketValue };
  }, [holdings]);

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
      <p className="mt-2 text-[11px] text-slate-500">Total P&L = (Current Price − Buy Price) × Quantity. हे manual portfolio tracker आहे; broker शी जोडलेले नाही.</p>
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
