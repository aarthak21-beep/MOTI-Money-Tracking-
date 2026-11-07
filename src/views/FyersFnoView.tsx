import React, { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { downloadCSV, formatINR } from '../utils/exportUtils';

type FyersTrade = {
  id: string; date: string; underlying: string; optionType: 'CE' | 'PE';
  strike: number; expiry: string; side: 'BUY' | 'SELL'; quantity: number;
  entryPremium: number; exitPremium?: number; charges: number; notes: string;
};
const KEY = 'moti_fyers_fno_trades_v1';
const readTrades = (): FyersTrade[] => {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
};
const today = () => new Date().toLocaleDateString('en-GB').replaceAll('/', '-');

export const FyersFnoView: React.FC = () => {
  const [trades, setTrades] = useState<FyersTrade[]>(readTrades);
  const [date, setDate] = useState(today());
  const [underlying, setUnderlying] = useState('NIFTY');
  const [optionType, setOptionType] = useState<'CE' | 'PE'>('CE');
  const [strike, setStrike] = useState('');
  const [expiry, setExpiry] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('');
  const [entryPremium, setEntryPremium] = useState('');
  const [exitPremium, setExitPremium] = useState('');
  const [charges, setCharges] = useState('0');
  const [notes, setNotes] = useState('');

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(trades)); }, [trades]);
  const totals = useMemo(() => trades.reduce((a, t) => {
    if (t.exitPremium === undefined) { a.open += 1; return a; }
    a.closed += 1;
    a.pnl += (t.side === 'BUY' ? t.exitPremium - t.entryPremium : t.entryPremium - t.exitPremium) * t.quantity - t.charges;
    return a;
  }, { open: 0, closed: 0, pnl: 0 }), [trades]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity), entry = Number(entryPremium), exit = exitPremium === '' ? undefined : Number(exitPremium);
    if (!underlying.trim() || !expiry || Number(strike) <= 0 || qty <= 0 || entry <= 0 ||
      (exit !== undefined && exit < 0) || Number(charges) < 0) return;
    setTrades([{ id: `fyers-${Date.now()}`, date, underlying: underlying.trim().toUpperCase(),
      optionType, strike: Number(strike), expiry, side, quantity: qty, entryPremium: entry,
      ...(exit !== undefined ? { exitPremium: exit } : {}), charges: Number(charges), notes }, ...trades]);
    setStrike(''); setQuantity(''); setEntryPremium(''); setExitPremium(''); setCharges('0'); setNotes('');
  };
  const importCSV = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    const parse = (line: string) => {
      const cells: string[] = []; let cell = ''; let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && line[i + 1] === '"' && quoted) { cell += '"'; i++; }
        else if (ch === '"') quoted = !quoted;
        else if (ch === ',' && !quoted) { cells.push(cell); cell = ''; }
        else cell += ch;
      }
      cells.push(cell); return cells;
    };
    const rows = lines.slice(1).map(parse);
    const imported = rows.map((c, i) => ({
      id: `fyers-import-${Date.now()}-${i}`, date: c[0] || today(), underlying: (c[1] || 'NIFTY').toUpperCase(),
      optionType: (c[2] === 'PE' ? 'PE' : 'CE') as 'CE' | 'PE', strike: Number(c[3]), expiry: c[4] || '',
      side: (c[5] === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL', quantity: Number(c[6]),
      entryPremium: Number(c[7]), ...(c[8] !== '' && c[8] !== undefined ? { exitPremium: Number(c[8]) } : {}),
      charges: Number(c[9]) || 0, notes: c[12] || ''
    })).filter(t => t.underlying && t.expiry && t.strike > 0 && t.quantity > 0 && t.entryPremium > 0);
    if (imported.length) setTrades(current => [...imported, ...current]);
    else window.alert('Valid FYERS journal CSV rows were not found. Use the exported MOTI FYERS CSV template.');
  };
  const exportTrades = () => downloadCSV('MOTI_FYERS_FNO_Journal',
    ['Date','Underlying','Option','Strike','Expiry','Side','Qty','Entry Premium','Exit Premium','Charges','Net P&L','Status','Notes'],
    trades.map(t => [t.date,t.underlying,t.optionType,t.strike,t.expiry,t.side,t.quantity,t.entryPremium,t.exitPremium ?? '',t.charges,
      t.exitPremium === undefined ? '' : ((t.side === 'BUY' ? t.exitPremium-t.entryPremium : t.entryPremium-t.exitPremium)*t.quantity-t.charges),
      t.exitPremium === undefined ? 'OPEN' : 'CLOSED',t.notes]));
  const remove = (id: string) => { if (window.confirm('Delete this FYERS F&O record?')) setTrades(rows => rows.filter(t => t.id !== id)); };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-black text-white">FYERS · NIFTY F&O JOURNAL</h2>
        <p className="mt-1 text-xs text-slate-400">स्वतंत्र F&O नोंदी. Zerodha Cash Equity ledger पासून पूर्णपणे वेगळ्या.</p></div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#1e2e4f] px-3 py-2 text-xs text-slate-200"><Upload className="h-4 w-4"/> Import CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { void importCSV(e.target.files?.[0]); e.currentTarget.value = ''; }}/></label>
      <button onClick={exportTrades} className="inline-flex items-center gap-2 rounded-xl border border-[#1e2e4f] px-3 py-2 text-xs text-slate-200"><Download className="h-4 w-4"/> Export CSV</button>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Closed Trades</p><p className="mt-1 text-xl font-black text-white">{totals.closed}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Open Trades</p><p className="mt-1 text-xl font-black text-cyan-300">{totals.open}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Realized Net P&L</p><p className={`mt-1 text-xl font-black ${totals.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{totals.pnl >= 0 ? '+' : '-'}₹{formatINR(Math.abs(totals.pnl))}</p></div>
    </div>
    <form onSubmit={save} className="grid grid-cols-2 gap-3 rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:grid-cols-4">
      <label className="text-xs text-slate-300">Trade Date<input required value={date} onChange={e=>setDate(e.target.value)} placeholder="DD-MM-YYYY" className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] p-2 text-white"/></label>
      <label className="text-xs text-slate-300">Index / Symbol<input required value={underlying} onChange={e=>setUnderlying(e.target.value)} className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] p-2 text-white"/></label>
      <label className="text-xs text-slate-300">Option Type<select value={optionType} onChange={e=>setOptionType(e.target.value as 'CE'|'PE')} className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] p-2 text-white"><option>CE</option><option>PE</option></select></label>
      <label className="text-xs text-slate-300">Strike Price<input required type="number" min="0" step="any" value={strike} onChange={e=>setStrike(e.target.value)} className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] p-2 text-white"/></label>
      <label className="text-xs text-slate-300">Expiry<input required type="date" value={expiry} onChange={e=>setExpiry(e.target.value)} className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] p-2 text-white [color-scheme:dark]"/></label>
      <label className="text-xs text-slate-300">Position<select value={side} onChange={e=>setSide(e.target.value as 'BUY'|'SELL')} className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] p-2 text-white"><option>BUY</option><option>SELL</option></select></label>
      <label className="text-xs text-slate-300">Quantity (units)<input required type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] p-2 text-white"/></label>
      <label className="text-xs text-slate-300">Entry Premium<input required type="number" min="0" step="any" value={entryPremium} onChange={e=>setEntryPremium(e.target.value)} className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] p-2 text-white"/></label>
      <label className="text-xs text-slate-300">Exit Premium (blank = open)<input type="number" min="0" step="any" value={exitPremium} onChange={e=>setExitPremium(e.target.value)} className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] p-2 text-white"/></label>
      <label className="text-xs text-slate-300">Charges<input type="number" min="0" step="any" value={charges} onChange={e=>setCharges(e.target.value)} className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] p-2 text-white"/></label>
      <label className="col-span-2 text-xs text-slate-300 sm:col-span-3">Notes<input value={notes} onChange={e=>setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] p-2 text-white"/></label>
      <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950"><Plus className="h-4 w-4"/> Save FYERS Trade</button>
    </form>
    <div className="overflow-x-auto rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
      <table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-[#0a101f] text-slate-400"><tr>{['Date','Contract','Expiry','Side','Qty','Entry','Exit','Charges','Net P&L','Status',''].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-[#1e2e4f]/60">{trades.length===0 ? <tr><td colSpan={11} className="p-8 text-center text-slate-500">FYERS F&O trades अजून नोंदवलेले नाहीत.</td></tr> : trades.map(t=>{const pnl=t.exitPremium===undefined?undefined:(t.side==='BUY'?t.exitPremium-t.entryPremium:t.entryPremium-t.exitPremium)*t.quantity-t.charges;return <tr key={t.id} className="text-slate-200"><td className="p-3">{t.date}</td><td className="p-3 font-bold">{t.underlying} {t.strike} {t.optionType}</td><td className="p-3">{t.expiry}</td><td className="p-3">{t.side}</td><td className="p-3">{t.quantity}</td><td className="p-3">₹{formatINR(t.entryPremium)}</td><td className="p-3">{t.exitPremium===undefined?'—':'₹'+formatINR(t.exitPremium)}</td><td className="p-3">₹{formatINR(t.charges)}</td><td className={`p-3 font-bold ${(pnl??0)>=0?'text-emerald-400':'text-rose-400'}`}>{pnl===undefined?'—':(pnl>=0?'+':'-')+'₹'+formatINR(Math.abs(pnl))}</td><td className="p-3">{pnl===undefined?'OPEN':'CLOSED'}</td><td className="p-3"><button onClick={()=>remove(t.id)} title="Delete" className="text-rose-400"><Trash2 className="h-4 w-4"/></button></td></tr>})}</tbody>
      </table>
    </div>
    <p className="text-[11px] text-slate-500">टीप: हा स्वतंत्र मॅन्युअल जर्नल आहे. FYERS खाते/API शी थेट जोडलेले नाही. Net P&L मध्ये तुम्ही भरलेले charges वजा होतात.</p>
  </div>;
};
