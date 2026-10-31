import React, { useMemo, useState } from 'react';
import { BarChart3, Download, TrendingDown, TrendingUp, Target, Award } from 'lucide-react';
import { StockTrade } from '../types';
import { downloadCSV, formatINR } from '../utils/exportUtils';

interface TradingAnalyticsViewProps {
  trades: StockTrade[];
}

const parseTradeDate = (value?: string): Date | null => {
  if (!value) return null;
  const parts = value.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};

const netResult = (trade: StockTrade) => (
  typeof trade.netPnl === 'number'
    ? trade.netPnl
    : (Number(trade.actualPnl) || 0) - (Number(trade.brokerage) || 0) - (Number(trade.otherCharges) || 0)
);

const money = (value: number) => `${value < 0 ? '-₹' : '₹'}${formatINR(Math.abs(value))}`;

export const TradingAnalyticsView: React.FC<TradingAnalyticsViewProps> = ({ trades }) => {
  const [period, setPeriod] = useState<'all' | '12m' | 'year'>('all');

  const analytics = useMemo(() => {
    const closed = trades
      .filter((trade) => trade.status === 'CLOSED')
      .map((trade) => ({ trade, pnl: netResult(trade), date: parseTradeDate(trade.exitDate || trade.entryDate) }))
      .filter((item) => item.date !== null)
      .sort((a, b) => a.date!.getTime() - b.date!.getTime());

    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === '12m') cutoff.setMonth(cutoff.getMonth() - 11);
    const filtered = closed.filter(({ date }) => {
      if (!date) return false;
      if (period === 'year') return date.getFullYear() === now.getFullYear();
      if (period === '12m') return date >= cutoff;
      return true;
    });

    const wins = filtered.filter((item) => item.pnl > 0);
    const losses = filtered.filter((item) => item.pnl < 0);
    const breakeven = filtered.filter((item) => item.pnl === 0);
    const totalNet = filtered.reduce((sum, item) => sum + item.pnl, 0);
    const grossWins = wins.reduce((sum, item) => sum + item.pnl, 0);
    const grossLosses = Math.abs(losses.reduce((sum, item) => sum + item.pnl, 0));
    const invested = filtered.reduce((sum, item) => sum + (Number(item.trade.totalInvestment) || 0), 0);
    const monthlyMap = new Map<string, { label: string; pnl: number; count: number }>();
    filtered.forEach(({ date, pnl }) => {
      if (!date) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { label: date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }), pnl: 0, count: 0 });
      }
      const bucket = monthlyMap.get(key)!;
      bucket.pnl += pnl;
      bucket.count += 1;
    });
    const monthly = Array.from(monthlyMap.entries()).map(([key, value]) => ({ key, ...value }));
    const best = wins.length ? wins.reduce((a, b) => a.pnl >= b.pnl ? a : b) : null;
    const worst = losses.length ? losses.reduce((a, b) => a.pnl <= b.pnl ? a : b) : null;
    const maxAbsMonthly = Math.max(1, ...monthly.map((item) => Math.abs(item.pnl)));

    return {
      closedCount: filtered.length,
      wins: wins.length,
      losses: losses.length,
      breakeven: breakeven.length,
      winRate: wins.length + losses.length > 0 ? wins.length / (wins.length + losses.length) * 100 : 0,
      totalNet,
      grossWins,
      grossLosses,
      profitFactor: grossLosses > 0 ? grossWins / grossLosses : null,
      averageWin: wins.length ? grossWins / wins.length : 0,
      averageLoss: losses.length ? -grossLosses / losses.length : 0,
      returnPct: invested > 0 ? totalNet / invested * 100 : 0,
      monthly,
      maxAbsMonthly,
      best,
      worst,
    };
  }, [trades, period]);

  const exportReport = () => {
    const headers = ['Month', 'Closed Trades', 'Net P&L (INR)'];
    const rows = analytics.monthly.map((item) => [item.label, item.count, item.pnl.toFixed(2)]);
    rows.push(['TOTAL', analytics.closedCount, analytics.totalNet.toFixed(2)]);
    downloadCSV('MOTI_Trading_Performance_Analytics', headers, rows);
  };

  const kpis = [
    { label: 'Net Realized P&L', value: money(analytics.totalNet), note: `${analytics.returnPct.toFixed(2)}% return on closed investment`, positive: analytics.totalNet >= 0, icon: TrendingUp },
    { label: 'Win Rate', value: `${analytics.winRate.toFixed(1)}%`, note: `${analytics.wins} wins · ${analytics.losses} losses`, positive: analytics.winRate >= 50, icon: Target },
    { label: 'Average Win', value: money(analytics.averageWin), note: 'Net profit per winning trade', positive: true, icon: Award },
    { label: 'Average Loss', value: money(analytics.averageLoss), note: 'Net loss per losing trade', positive: false, icon: TrendingDown },
    { label: 'Profit Factor', value: analytics.profitFactor === null ? '—' : analytics.profitFactor.toFixed(2), note: 'Gross wins ÷ gross losses', positive: analytics.profitFactor !== null && analytics.profitFactor >= 1, icon: BarChart3 },
    { label: 'Closed Trades', value: String(analytics.closedCount), note: `${analytics.breakeven} breakeven trades excluded from win rate`, positive: true, icon: BarChart3 },
  ];

  return (
    <section className="space-y-4 rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-amber-400" /><h2 className="text-sm font-black text-white">TRADING PERFORMANCE ANALYTICS</h2></div>
          <p className="mt-1 text-[10px] text-slate-400">Closed Equity Delivery trades · net P&L after saved charges</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value as 'all' | '12m' | 'year')} className="rounded-lg border border-[#263858] bg-[#070d18] px-3 py-2 text-xs text-slate-200 outline-none">
            <option value="all">All time</option><option value="12m">Last 12 months</option><option value="year">This year</option>
          </select>
          <button onClick={exportReport} className="flex items-center gap-1.5 rounded-lg border border-[#263858] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white"><Download className="h-3.5 w-3.5" />Export CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((item) => { const Icon = item.icon; return <div key={item.label} className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3">
          <div className="flex items-center justify-between gap-1"><span className="text-[10px] font-semibold text-slate-400">{item.label}</span><Icon className="h-3.5 w-3.5 shrink-0 text-amber-400" /></div>
          <p className={`mt-2 break-words text-lg font-black ${item.positive ? 'text-emerald-400' : 'text-rose-400'}`}>{item.value}</p>
          <p className="mt-1 text-[9px] leading-relaxed text-slate-500">{item.note}</p>
        </div>; })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3">
          <h3 className="mb-3 text-xs font-bold text-white">MONTHLY NET P&L</h3>
          {analytics.monthly.length ? <div className="space-y-3">
            {analytics.monthly.slice(-12).map((item) => {
              const width = Math.max(2, Math.abs(item.pnl) / analytics.maxAbsMonthly * 100);
              return <div key={item.key} className="grid grid-cols-[76px_1fr_100px] items-center gap-2 text-[10px]">
                <span className="truncate text-slate-400">{item.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${item.pnl >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${width}%` }} /></div>
                <span className={`text-right font-bold ${item.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(item.pnl)}</span>
              </div>;
            })}
          </div> : <p className="py-8 text-center text-xs text-slate-500">No closed trades in this period.</p>}
        </div>

        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3">
          <h3 className="mb-3 text-xs font-bold text-white">TRADE HIGHLIGHTS</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3"><span className="text-xs text-slate-400">Best trade</span><span className="text-right text-xs font-bold text-emerald-400">{analytics.best ? `${analytics.best.trade.stockName} · ${money(analytics.best.pnl)}` : '—'}</span></div>
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3"><span className="text-xs text-slate-400">Worst trade</span><span className="text-right text-xs font-bold text-rose-400">{analytics.worst ? `${analytics.worst.trade.stockName} · ${money(analytics.worst.pnl)}` : 'No losing trades'}</span></div>
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3"><span className="text-xs text-slate-400">Gross profit</span><span className="text-xs font-bold text-emerald-400">{money(analytics.grossWins)}</span></div>
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3"><span className="text-xs text-slate-400">Gross loss</span><span className="text-xs font-bold text-rose-400">{money(-analytics.grossLosses)}</span></div>
            <div className="flex items-center justify-between"><span className="text-xs text-slate-400">Break-even trades</span><span className="text-xs font-bold text-slate-200">{analytics.breakeven}</span></div>
          </div>
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">Only closed trades are included. Win rate excludes break-even trades. Net P&L uses each saved trade's netPnl; when unavailable, it is calculated as gross P&L less saved brokerage and other charges. This is a journal report, not a live broker statement.</p>
    </section>
  );
};
