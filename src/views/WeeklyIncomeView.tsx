import React, { useMemo, useState } from 'react';
import { CalendarDays, Plus, Download, Pencil, Trash2, X, Save, TrendingUp } from 'lucide-react';
import { WeeklyIncomeRecord, UserProfile, StockTrade } from '../types';
import { formatINR, downloadCSV } from '../utils/exportUtils';

interface Props {
  records: WeeklyIncomeRecord[];
  profile: UserProfile;
  trades: StockTrade[];
  onSaveRecords: (records: WeeklyIncomeRecord[]) => void;
  onSelectTab: (tab: string) => void;
}

const toISODate = (value: string) => {
  const parts = value.split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
};
const toDisplayDate = (value: string) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}-${month}-${year}`;
};
const money = (value: number, symbol: string) => `${symbol}${formatINR(Number.isFinite(value) ? value : 0)}`;

export const WeeklyIncomeView: React.FC<Props> = ({ records, profile, trades, onSaveRecords }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<WeeklyIncomeRecord | null>(null);
  const [date, setDate] = useState('');
  const [firstBase, setFirstBase] = useState('0');
  const [addition, setAddition] = useState('0');
  const [rate, setRate] = useState('3');

  const latest = records[records.length - 1];
  const latestTarget = latest?.finalAmount || 0;
  const latestActual = Number(latest?.customFields?.actualCapital) || 0;
  const totalAdded = records.reduce((sum, item) => sum + (Number(item.weeklyIncome) || 0), 0);

  const calculated = useMemo(() => {
    const dateKey = (value: string) => {
      const parts = (value || '').split('-');
      return parts.length === 3 ? Number(parts[2] + parts[1].padStart(2, '0') + parts[0].padStart(2, '0')) : 0;
    };
    const ordered = [...records].sort((a, b) => dateKey(a.weekStartDate) - dateKey(b.weekStartDate));
    let runningTarget = 0;
    let runningActual = 0;
    return ordered.map((record, index) => {
      const base = index === 0 ? (Number(record.openingBalance) || 0) : runningTarget;
      const actualBase = index === 0 ? (Number(record.openingBalance) || 0) : runningActual;
      const extra = Number(record.weeklyIncome) || 0;
      const targetRate = Math.max(0, Number(record.customFields?.targetRate ?? 3) || 0);
      const targetProfit = (base + extra) * targetRate / 100;
      const finalAmount = base + extra + targetProfit;
      const weekStart = dateKey(record.weekStartDate);
      const nextWeekStart = ordered[index + 1] ? dateKey(ordered[index + 1].weekStartDate) : Infinity;
      const closedTradePnl = trades.reduce((sum, trade) => {
        if (trade.status !== 'CLOSED' || !trade.exitDate) return sum;
        const exitKey = dateKey(trade.exitDate);
        return exitKey >= weekStart && exitKey < nextWeekStart ? sum + (Number(trade.netPnl) || 0) : sum;
      }, 0);
      const actualCapital = actualBase + extra + closedTradePnl;
      const aheadShort = actualCapital - finalAmount;
      runningTarget = finalAmount;
      runningActual = actualCapital;
      return { ...record, serialNumber: index + 1, openingBalance: base, totalIncome: extra, finalAmount,
        customFields: { ...(record.customFields || {}), targetRate, actualCapital, closedTradePnl, aheadShort } };
    });
  }, [records, trades]);
  const latestActual = Number(calculated[calculated.length - 1]?.customFields?.actualCapital) || 0;

  const openNew = () => {
    setEditing(null);
    const today = new Date();
    setDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
    setFirstBase(String(latestTarget || 0));
    setAddition('0');
    setRate('3');
    setIsOpen(true);
  };
  const openEdit = (record: WeeklyIncomeRecord) => {
    setEditing(record);
    setDate(toISODate(record.weekStartDate));
    setFirstBase(String(record.openingBalance || 0));
    setAddition(String(record.weeklyIncome || 0));
    setRate(String(record.customFields?.targetRate ?? 3));
    setIsOpen(true);
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const dateText = toDisplayDate(date);
    if (!dateText) return;
    const next = editing
      ? records.map((record) => record.id === editing.id ? {
          ...record, weekStartDate: dateText, weekEndDate: dateText,
          openingBalance: Number(firstBase) || 0, weeklyIncome: Number(addition) || 0,
          totalIncome: Number(addition) || 0, customFields: {
            ...(record.customFields || {}), targetRate: Math.max(0, Number(rate) || 0),
          },
        } : record)
      : [...records, {
          id: `capital_${Date.now()}`, serialNumber: records.length + 1,
          weekStartDate: dateText, weekEndDate: dateText,
          openingBalance: Number(firstBase) || 0, weeklyIncome: Number(addition) || 0,
          salary: 0, businessIncome: 0, freelanceIncome: 0, commission: 0, bonus: 0,
          otherIncome: 0, totalIncome: Number(addition) || 0, weeklyExpenses: 0,
          finalAmount: 0, paymentStatus: 'Paid' as const,
          customFields: { targetRate: Math.max(0, Number(rate) || 0) },
        }];
    let runningBase = 0;
    const recalculated = next.map((record, index) => {
      const base = index === 0 ? (Number(record.openingBalance) || 0) : runningBase;
      const extra = Number(record.weeklyIncome) || 0;
      const targetRate = Math.max(0, Number(record.customFields?.targetRate ?? 3) || 0);
      const targetProfit = (base + extra) * targetRate / 100;
      const finalAmount = base + extra + targetProfit;
      runningBase = finalAmount;
      return { ...record, serialNumber: index + 1, openingBalance: base, totalIncome: extra, weeklyExpenses: 0, finalAmount };
    });
    onSaveRecords(recalculated);
    setIsOpen(false);
  };

  const remove = (id: string, serial: number) => {
    if (window.confirm(`Week ${serial} delete karaycha?`)) {
      const remaining = records.filter((record) => record.id !== id);
      let runningBase = 0;
      const recalculated = remaining.map((record, index) => {
        const base = index === 0 ? (Number(record.openingBalance) || 0) : runningBase;
        const extra = Number(record.weeklyIncome) || 0;
        const targetRate = Number(record.customFields?.targetRate ?? 3);
        const finalAmount = base + extra + (base + extra) * targetRate / 100;
        runningBase = finalAmount;
        return { ...record, serialNumber: index + 1, openingBalance: base, totalIncome: extra, finalAmount };
      });
      onSaveRecords(recalculated);
    }
  };

  const exportRows = calculated.map((r) => [
    r.serialNumber, r.weekStartDate, r.openingBalance, r.weeklyIncome,
    Number(r.customFields?.targetRate ?? 3), (r.openingBalance + r.weeklyIncome) * Number(r.customFields?.targetRate ?? 3) / 100,
    r.finalAmount, Number(r.customFields?.actualCapital) || 0, Number(r.customFields?.closedTradePnl) || 0, Number(r.customFields?.aheadShort) || 0,
  ]);

  return <div className="space-y-6 animate-in fade-in pb-24">
    <div className="flex flex-col justify-between gap-4 border-b border-[#1e2e4f] pb-4 sm:flex-row sm:items-center">
      <div>
        <div className="flex items-center gap-2"><h1 className="text-2xl font-black text-white sm:text-3xl">WEEKLY CAPITAL GROWTH</h1><span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-300">3% TARGET</span></div>
        <p className="mt-1 text-xs text-slate-400">Add outside earnings to trading capital and track the weekly growth target.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => downloadCSV('MOTI_Weekly_Capital_Growth', ['Sr. No.','Date','Previous Capital','Extra Addition','Target %','Target Growth','Final Target','Actual Capital','Closed Trade Net P&L','Ahead / Short'], exportRows)} className="flex items-center gap-2 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300"><Download className="h-4 w-4"/>Export CSV</button>
        <button onClick={openNew} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950"><Plus className="h-4 w-4"/>Add Week</button>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-2xl border border-amber-500/30 bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Latest Target Capital</p><p className="mt-1 text-xl font-black text-amber-300">{money(latestTarget, profile.currencySymbol)}</p><p className="text-[10px] text-slate-500">Planned final amount</p></div>
      <div className="rounded-2xl border border-emerald-500/30 bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Actual Capital</p><p className="mt-1 text-xl font-black text-emerald-300">{money(latestActual, profile.currencySymbol)}</p><p className="text-[10px] text-slate-500">Extra additions + closed trade net P&L</p></div>
      <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Extra Added</p><p className="mt-1 text-xl font-black text-white">{money(totalAdded, profile.currencySymbol)}</p><p className="text-[10px] text-slate-500">Outside earnings added</p></div>
      <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Ahead / Short</p><p className={`mt-1 text-xl font-black ${latestActual >= latestTarget && latestActual > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{calculated.length ? money(latestActual - latestTarget, profile.currencySymbol) : '—'}</p><p className="text-[10px] text-slate-500">Actual minus target</p></div>
    </div>

    <div className="overflow-x-auto rounded-2xl border border-[#1e2e4f] bg-[#0d1527] shadow-xl">
      <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
        <thead><tr className="border-b border-[#1e2e4f] bg-[#0a101f] text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {['Sr. No.','Date','Previous Capital','Extra Addition','3% / Rate','Target Growth','Final Target','Closed Trade P&L','Actual Capital','Ahead / Short','Actions'].map((label)=><th key={label} className="px-3 py-3 text-right first:text-left">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-[#1e2e4f]/50">
          {calculated.length === 0 ? <tr><td colSpan={11} className="py-10 text-center text-slate-500">No capital records yet. Add your first week to begin.</td></tr> :
          calculated.map((r)=>
            <tr key={r.id} className="hover:bg-[#131f38]/50">
              <td className="px-3 py-3 font-bold text-amber-400">{r.serialNumber}</td>
              <td className="px-3 py-3 whitespace-nowrap text-slate-300">{r.weekStartDate}</td>
              <td className="px-3 py-3 text-right">{money(r.openingBalance, profile.currencySymbol)}</td>
              <td className="px-3 py-3 text-right text-cyan-300">{money(r.weeklyIncome, profile.currencySymbol)}</td>
              <td className="px-3 py-3 text-right">{Number(r.customFields?.targetRate ?? 3).toFixed(2)}%</td>
              <td className="px-3 py-3 text-right text-emerald-300">{money((r.openingBalance+r.weeklyIncome)*Number(r.customFields?.targetRate ?? 3)/100, profile.currencySymbol)}</td>
              <td className="px-3 py-3 text-right font-bold text-amber-300">{money(r.finalAmount, profile.currencySymbol)}</td>
              <td className={`px-3 py-3 text-right font-semibold ${Number(r.customFields?.closedTradePnl) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(Number(r.customFields?.closedTradePnl) || 0, profile.currencySymbol)}</td>
              <td className="px-3 py-3 text-right font-bold text-white">{money(Number(r.customFields?.actualCapital) || 0, profile.currencySymbol)}</td>
              <td className={`px-3 py-3 text-right font-semibold ${Number(r.customFields?.aheadShort) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(Number(r.customFields?.aheadShort) || 0, profile.currencySymbol)} {Number(r.customFields?.aheadShort) >= 0 ? 'Ahead' : 'Short'}</td>
              <td className="px-3 py-3 text-center"><div className="flex justify-center gap-2"><button onClick={()=>openEdit(r)} title="Edit" className="rounded-lg p-2 text-amber-300 hover:bg-amber-500/10"><Pencil className="h-4 w-4"/></button><button onClick={()=>remove(r.id,r.serialNumber)} title="Delete" className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-4 w-4"/></button></div></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>

    {isOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={save} className="w-full max-w-lg space-y-4 rounded-2xl border border-[#263858] bg-[#0d1527] p-5 shadow-2xl">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-white">{editing ? 'Edit Week' : 'Add Weekly Capital'}</h2><p className="text-xs text-slate-400">Change values anytime; later weeks recalculate automatically.</p></div><button type="button" onClick={()=>setIsOpen(false)} className="rounded-lg p-2 text-slate-400"><X className="h-4 w-4"/></button></div>
        <label className="block text-xs text-slate-300">Week Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required className="mt-1 w-full rounded-lg border border-[#263858] bg-[#070d18] p-2.5 text-white"/></label>
        <label className="block text-xs text-slate-300">Previous Capital (first week / starting capital)<input type="number" min="0" step="0.01" value={firstBase} onChange={e=>setFirstBase(e.target.value)} disabled={Boolean(editing && records.findIndex(r=>r.id===editing.id)>0)} className="mt-1 w-full rounded-lg border border-[#263858] bg-[#070d18] p-2.5 text-white disabled:opacity-50"/></label>
        <label className="block text-xs text-slate-300">Extra Addition (outside earnings)<input type="number" min="0" step="0.01" value={addition} onChange={e=>setAddition(e.target.value)} className="mt-1 w-full rounded-lg border border-[#263858] bg-[#070d18] p-2.5 text-white"/></label>
        <label className="block text-xs text-slate-300">Weekly Target Rate (%)<input type="number" min="0" step="0.01" value={rate} onChange={e=>setRate(e.target.value)} className="mt-1 w-full rounded-lg border border-[#263858] bg-[#070d18] p-2.5 text-white"/></label>
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-slate-300">Actual Capital is calculated automatically from Extra Addition and closed equity trades net P&amp;L for this week. No manual entry needed.</p>
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={()=>setIsOpen(false)} className="rounded-lg border border-[#263858] px-4 py-2 text-xs text-slate-300">Cancel</button><button type="submit" className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950"><Save className="h-4 w-4"/>Save Week</button></div>
      </form>
    </div>}
  </div>;
};
