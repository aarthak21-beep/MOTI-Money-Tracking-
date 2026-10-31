import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { StockTrade } from '../types';
import { formatINR } from '../utils/exportUtils';

interface EquityTradeCalendarProps {
  trades: StockTrade[];
}

const parseDate = (value?: string): Date | null => {
  if (!value) return null;
  const parts = value.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};

const dateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const netResult = (trade: StockTrade) => (
  typeof trade.netPnl === 'number'
    ? trade.netPnl
    : (Number(trade.actualPnl) || 0) - (Number(trade.brokerage) || 0) - (Number(trade.otherCharges) || 0)
);

const money = (value: number) => `${value < 0 ? '-₹' : '₹'}${formatINR(Math.abs(value))}`;

export const EquityTradeCalendar: React.FC<EquityTradeCalendarProps> = ({ trades }) => {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const calendar = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const monthTrades = trades
      .filter((trade) => trade.status === 'CLOSED')
      .map((trade) => ({ trade, date: parseDate(trade.exitDate || trade.entryDate) }))
      .filter((item) => item.date && item.date.getFullYear() === year && item.date.getMonth() === month)
      .map((item) => ({ ...item, pnl: netResult(item.trade) }));

    const byDay = new Map<string, { pnl: number; count: number; trades: typeof monthTrades }>();
    monthTrades.forEach((item) => {
      const key = dateKey(item.date!);
      const bucket = byDay.get(key) || { pnl: 0, count: 0, trades: [] };
      bucket.pnl += item.pnl;
      bucket.count += 1;
      bucket.trades.push(item);
      byDay.set(key, bucket);
    });

    const firstDay = new Date(year, month, 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number | null; key: string | null }> = [];
    for (let i = 0; i < mondayOffset; i++) cells.push({ day: null, key: null });
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      cells.push({ day, key: dateKey(date) });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, key: null });

    return {
      cells,
      byDay,
      totalPnl: monthTrades.reduce((sum, item) => sum + item.pnl, 0),
      tradeCount: monthTrades.length,
      winCount: monthTrades.filter((item) => item.pnl > 0).length,
      lossCount: monthTrades.filter((item) => item.pnl < 0).length,
      monthTrades,
    };
  }, [trades, visibleMonth]);

  const selectedTrades = selectedDay ? calendar.byDay.get(selectedDay)?.trades || [] : [];

  const changeMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    setSelectedDay(null);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-amber-400" />
          <div>
            <h2 className="text-sm font-black text-white">EQUITY TRADE CALENDAR</h2>
            <p className="text-[10px] text-slate-400">Daily realized P&L from closed delivery trades</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="rounded-lg border border-[#263858] p-2 text-slate-300 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-32 text-center text-xs font-bold text-white">{visibleMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="rounded-lg border border-[#263858] p-2 text-slate-300 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Monthly net P&L</p><p className={`mt-1 text-base font-black ${calendar.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(calendar.totalPnl)}</p></div>
        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Closed trades</p><p className="mt-1 text-base font-black text-white">{calendar.tradeCount}</p></div>
        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Winning trades</p><p className="mt-1 text-base font-black text-emerald-400">{calendar.winCount}</p></div>
        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Losing trades</p><p className="mt-1 text-base font-black text-rose-400">{calendar.lossCount}</p></div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#1e2e4f] bg-[#070d18]">
        <div className="grid grid-cols-7 border-b border-[#1e2e4f]">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="py-2 text-center text-[10px] font-bold text-slate-500">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {calendar.cells.map((cell, index) => {
            const bucket = cell.key ? calendar.byDay.get(cell.key) : undefined;
            const active = cell.key === selectedDay;
            return <button key={cell.key || `blank-${index}`} type="button" disabled={!cell.day} onClick={() => setSelectedDay(cell.key)} className={`min-h-16 border-b border-r border-[#1e2e4f] p-1 text-left transition-colors sm:min-h-20 ${!cell.day ? 'bg-[#090f1d]' : active ? 'bg-amber-500/15 ring-1 ring-inset ring-amber-400' : 'hover:bg-slate-800/60'}`}>
              {cell.day && <><span className="text-[10px] font-semibold text-slate-300">{cell.day}</span>{bucket && <div className="mt-1"><p className={`truncate text-[9px] font-black sm:text-[10px] ${bucket.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{bucket.pnl >= 0 ? '+' : ''}{money(bucket.pnl)}</p><p className="text-[8px] text-slate-500">{bucket.count} trade{bucket.count === 1 ? '' : 's'}</p></div>}</>}
            </button>;
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3">
        <h3 className="mb-2 text-xs font-bold text-white">{selectedDay ? `Trades on ${selectedDay.split('-').reverse().join('-')}` : 'Select a date to view trades'}</h3>
        {selectedDay && selectedTrades.length ? <div className="space-y-2">
          {selectedTrades.map(({ trade, pnl }) => <div key={trade.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2e4f] pb-2 last:border-0 last:pb-0">
            <div><p className="text-xs font-bold text-white">{trade.stockName}</p><p className="text-[10px] text-slate-500">Qty {trade.quantity} · Entry ₹{formatINR(trade.entryPrice)} · Exit ₹{formatINR(trade.exitPrice || 0)}</p></div>
            <span className={`text-xs font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(pnl)}</span>
          </div>)}
        </div> : <p className="text-[11px] text-slate-500">{selectedDay ? 'No closed trades recorded on this date.' : 'Tap any calendar date. Dates with closed trades show their combined net P&L.'}</p>}
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">Calendar uses each trade's exit date and saved net P&L after charges. Open positions are excluded; this is a journal summary, not a broker statement.</p>
    </section>
  );
};
