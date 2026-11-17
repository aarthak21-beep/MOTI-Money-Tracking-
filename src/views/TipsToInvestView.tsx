import React, { useMemo, useState } from 'react';
import { Wallet, Upload, Plus, Trash2, ShieldAlert, Search, TrendingUp } from 'lucide-react';

type Row = { symbol: string; series: string; date: string; close: number; volume: number; deliveryPct?: number; turnover?: number };
type TipEntry = { id: string; date: string; amount: number; note: string };
type BuyEntry = { id: string; date: string; symbol: string; quantity: number; price: number; total: number };
const WALLET_KEY = 'moti_tips_invest_wallet_v1';
const DATA_KEY = 'moti_penny_bhavcopy_v1';
const BUY_KEY = 'moti_tips_invest_buys_v1';
const today = () => new Date().toISOString().slice(0,10);
const displayDate = (value: string) => { const [y,m,d] = value.split('-'); return y && m && d ? d+'-'+m+'-'+y : value; };

const num = (v: string | undefined) => {
  if (!v || !v.trim() || v.trim() === '-') return undefined;
  const n = Number(v.replace(/[,₹%\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const csvLine = (line: string) => {
  const out: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { out.push(cell.trim()); cell = ''; }
    else cell += c;
  }
  out.push(cell.trim()); return out;
};
const parseBhavcopy = (raw: string): Row[] => {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV मध्ये Header आणि data rows असणे आवश्यक आहे.');
  const headers = csvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const ix = (names: string[]) => headers.findIndex(h => names.includes(h));
  const symbol = ix(['symbol']); const series = ix(['series']); const date = ix(['date1','date']);
  const close = ix(['closeprice','close','lastprice']); const volume = ix(['ttltrdqty','volume','totaltradedquantity']);
  const delivery = ix(['delivper','deliverypercentage','deliverypct']); const turnover = ix(['turnoverlacs','turnover']);
  if ([symbol, close, volume].some(i => i < 0)) throw new Error('NSE Bhavcopy format ओळखता आला नाही. SYMBOL, CLOSE_PRICE आणि TTL_TRD_QNTY columns आवश्यक आहेत.');
  return lines.slice(1).map(line => {
    const c = csvLine(line);
    return { symbol: c[symbol]?.trim().toUpperCase(), series: series >= 0 ? c[series] : 'EQ', date: date >= 0 ? c[date] : '', close: num(c[close]) || 0, volume: num(c[volume]) || 0, deliveryPct: delivery >= 0 ? num(c[delivery]) : undefined, turnover: turnover >= 0 ? num(c[turnover]) : undefined };
  }).filter(r => r.symbol && r.series === 'EQ' && r.close >= 1 && r.close <= 50 && r.volume > 0);
};

export const TipsToInvestView: React.FC = () => {
  const [tips, setTips] = useState<TipEntry[]>(() => { try { return JSON.parse(localStorage.getItem(WALLET_KEY) || '[]'); } catch { return []; } });
  const [rows, setRows] = useState<Row[]>(() => { try { return JSON.parse(localStorage.getItem(DATA_KEY) || '[]'); } catch { return []; } });
  const [buys, setBuys] = useState<BuyEntry[]>(() => { try { return JSON.parse(localStorage.getItem(BUY_KEY) || '[]'); } catch { return []; } });
  const [buySymbol, setBuySymbol] = useState(''); const [buyQuantity, setBuyQuantity] = useState(''); const [buyPrice, setBuyPrice] = useState(''); const [buyDate, setBuyDate] = useState(today());
  const [amount, setAmount] = useState(''); const [note, setNote] = useState('Zomato Customer Tips');
  const [query, setQuery] = useState(''); const [message, setMessage] = useState('');
  const totalTips = tips.reduce((s, x) => s + x.amount, 0);
  const totalBuys = buys.reduce((s, x) => s + x.total, 0);
  const availableBalance = totalTips - totalBuys;
  const ranked = useMemo(() => rows.map(r => {
    const deliveryScore = r.deliveryPct == null ? 0 : Math.min(25, r.deliveryPct / 4);
    const volumeScore = Math.min(35, Math.log10(Math.max(1, r.volume)) * 7);
    const turnoverScore = Math.min(20, Math.log10(Math.max(1, (r.turnover || 0) * 100000)) * 3);
    const score = Math.round(Math.min(80, deliveryScore + volumeScore + turnoverScore));
    const rating = score >= 55 ? 'WATCH' : score >= 35 ? 'RESEARCH' : 'AVOID';
    return { ...r, score, rating };
  }).filter(r => !query || r.symbol.includes(query.toUpperCase())).sort((a,b) => b.score-a.score), [rows, query]);
  const persistTips = (next: TipEntry[]) => { setTips(next); localStorage.setItem(WALLET_KEY, JSON.stringify(next)); };
  const addTips = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setMessage('योग्य Tips रक्कम टाक.'); return; }
    persistTips([{ id: String(Date.now()), date: new Date().toISOString().slice(0,10), amount: value, note }, ...tips]);
    setAmount(''); setMessage('Tips Wallet मध्ये जमा झाले.');
  };
  const upload = async (file?: File) => {
    if (!file) return;
    try { const parsed = parseBhavcopy(await file.text()); setRows(parsed); localStorage.setItem(DATA_KEY, JSON.stringify(parsed)); setMessage(parsed.length + ' ₹1–₹50 EQ शेअर्स import झाले.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'CSV वाचता आले नाही.'); }
  };
  const removeTips = (id: string) => persistTips(tips.filter(x => x.id !== id));
  const addBuy = () => {
    const quantity = Number(buyQuantity); const price = Number(buyPrice); const total = quantity * price;
    if (!buySymbol.trim() || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0 || !buyDate) { setMessage('Buy साठी Symbol, योग्य Quantity, Price आणि Date भरा.'); return; }
    if (total > availableBalance) { setMessage('Wallet balance अपुरा आहे. उपलब्ध: ₹' + availableBalance.toLocaleString('en-IN')); return; }
    const next = [{ id: String(Date.now()), date: buyDate, symbol: buySymbol.trim().toUpperCase(), quantity, price, total }, ...buys];
    setBuys(next); localStorage.setItem(BUY_KEY, JSON.stringify(next));
    setBuySymbol(''); setBuyQuantity(''); setBuyPrice(''); setBuyDate(today()); setMessage('Buy entry date सहित save झाली आणि Wallet balance कमी झाला.');
  };
  const removeBuy = (id: string) => { const next = buys.filter(x => x.id !== id); setBuys(next); localStorage.setItem(BUY_KEY, JSON.stringify(next)); };
  return <div className="mx-auto max-w-6xl space-y-5 text-slate-100">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">MOTI · INVESTING</p><h1 className="mt-1 text-2xl font-black">Tips-to-Invest Penny Scanner</h1><p className="mt-1 text-sm text-slate-400">Zomato Tips मधून जमा झालेली रक्कम आणि कमी किमतीच्या शेअर्सची प्राथमिक छाननी</p></div><div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">Research only · Buy बंधनकारक नाही</div></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-[#0b1421] p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><Wallet className="h-4 w-4"/> Tips Wallet</div><p className="mt-2 text-3xl font-black text-emerald-300">₹{totalTips.toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-slate-500">{tips.length} जमा नोंदी</p></div>
      <div className="rounded-2xl border border-white/10 bg-[#0b1421] p-4"><p className="text-xs text-slate-400">Available to invest</p><p className="mt-2 text-3xl font-black">₹{availableBalance.toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-slate-500">एकूण जमा ₹{totalTips.toLocaleString('en-IN')} · Buy ₹{totalBuys.toLocaleString('en-IN')}</p></div>
      <div className="rounded-2xl border border-white/10 bg-[#0b1421] p-4"><p className="text-xs text-slate-400">Scanner universe</p><p className="mt-2 text-3xl font-black">{rows.length}</p><p className="mt-1 text-xs text-slate-500">Uploaded Bhavcopy मधील ₹1–₹50 EQ शेअर्स</p></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-2xl border border-white/10 bg-[#0b1421] p-4 space-y-3"><h2 className="font-bold">Add weekly Tips</h2><label className="block text-xs text-slate-400">रक्कम (₹)</label><input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="1" placeholder="उदा. 250" className="w-full rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-sm outline-none focus:border-emerald-400"/><label className="block text-xs text-slate-400">Note</label><input value={note} onChange={e=>setNote(e.target.value)} className="w-full rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-sm outline-none focus:border-emerald-400"/><button onClick={addTips} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-bold text-slate-950"><Plus className="h-4 w-4"/> Add to Wallet</button><div className="max-h-48 space-y-2 overflow-auto">{tips.map(t=><div key={t.id} className="flex items-center justify-between rounded-lg bg-white/[0.04] p-2 text-xs"><span><b>₹{t.amount}</b><span className="ml-2 text-slate-400">{displayDate(t.date)} · {t.note}</span></span><button onClick={()=>removeTips(t.id)} title="Delete entry" className="text-slate-500 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5"/></button></div>)}</div><div className="border-t border-white/10 pt-3 space-y-2"><h3 className="text-sm font-bold">Buy Entry</h3><div className="grid grid-cols-2 gap-2"><input value={buySymbol} onChange={e=>setBuySymbol(e.target.value)} placeholder="Symbol (उदा. ABC)" className="rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-xs"/><input value={buyDate} onChange={e=>setBuyDate(e.target.value)} type="date" className="rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-xs"/><input value={buyQuantity} onChange={e=>setBuyQuantity(e.target.value)} type="number" min="1" step="1" placeholder="Quantity" className="rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-xs"/><input value={buyPrice} onChange={e=>setBuyPrice(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Buy price / share" className="rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-xs"/></div><p className="text-[11px] text-slate-400">Total: ₹{((Number(buyQuantity)||0)*(Number(buyPrice)||0)).toLocaleString('en-IN')} · Available: ₹{availableBalance.toLocaleString('en-IN')}</p><button onClick={addBuy} className="w-full rounded-lg bg-sky-400 px-3 py-2 text-sm font-bold text-slate-950">Save Buy & Deduct Wallet</button>{buys.length>0 && <div className="max-h-36 space-y-2 overflow-auto">{buys.map(b=><div key={b.id} className="flex items-center justify-between rounded-lg bg-white/[0.04] p-2 text-xs"><span><b>{b.symbol}</b> · {b.quantity} × ₹{b.price.toFixed(2)} = ₹{b.total.toLocaleString('en-IN')}<span className="ml-2 text-slate-400">{displayDate(b.date)}</span></span><button onClick={()=>removeBuy(b.id)} title="Delete buy (refund wallet)" className="text-slate-500 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5"/></button></div>)}</div>}</div></section>
      <section className="rounded-2xl border border-white/10 bg-[#0b1421] p-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">Penny Stock Scanner</h2><p className="text-xs text-slate-400">NSE Equity Bhavcopy CSV upload कर</p></div><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-200"><Upload className="h-4 w-4"/> Upload CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={e=>upload(e.target.files?.[0])}/></label></div><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search symbol..." className="w-full rounded-lg border border-white/10 bg-[#050a12] py-2 pl-9 pr-3 text-sm"/></div>
      {message && <p className="text-xs text-emerald-300">{message}</p>}
      {ranked.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2">Symbol</th><th>Close</th><th>Volume</th><th>Delivery</th><th>Score</th><th>View</th></tr></thead><tbody>{ranked.slice(0,100).map(r=><tr key={r.symbol} className="border-t border-white/[0.06]"><td className="py-2 font-bold">{r.symbol}<div className="text-[10px] font-normal text-slate-500">{r.date}</div></td><td>₹{r.close.toFixed(2)}</td><td>{r.volume.toLocaleString('en-IN')}</td><td>{r.deliveryPct == null ? '—' : r.deliveryPct.toFixed(1)+'%'}</td><td className="font-bold">{r.score}/80</td><td><span className={r.rating==='WATCH'?'text-emerald-300':r.rating==='RESEARCH'?'text-amber-300':'text-rose-300'}>{r.rating}</span></td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-white/10 p-8 text-center"><TrendingUp className="mx-auto h-7 w-7 text-slate-500"/><p className="mt-2 text-sm font-semibold">अजून Bhavcopy upload केलेली नाही</p><p className="mt-1 text-xs text-slate-500">NSE ची latest Equity Bhavcopy CSV upload केल्यावर ₹1–₹50 शेअर्स दिसतील.</p></div>}
      <div className="flex gap-2 rounded-lg bg-amber-400/5 p-3 text-[11px] leading-relaxed text-amber-200"><ShieldAlert className="h-4 w-4 shrink-0"/><span>हा प्राथमिक volume/delivery screen आहे; Fundamentals, promoter pledge, liquidity spread किंवा live price तपासत नाही. Score म्हणजे Buy recommendation नाही. CSV ची तारीख तपासूनच निर्णय घे.</span></div></section>
    </div>
  </div>;
};
