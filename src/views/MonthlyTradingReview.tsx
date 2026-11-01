import React, { useMemo } from 'react';
import { CalendarDays, Download, TrendingDown, TrendingUp, ShieldCheck } from 'lucide-react';
import { StockTrade } from '../types';
import { downloadCSV, formatINR } from '../utils/exportUtils';

interface MonthlyTradingReviewProps {
  trades: StockTrade[];
}

interface MonthRow {
  key: string;
  label: string;
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  net: number;
  reviewed: number;
  disciplineTotal: number;
  mistakeCounts: Map<string, number>;
}

const parseDate = (value?: string): Date | null => {
  if (!value) return null;
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [day, month, year] = parts;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const getNetPnl = (trade: StockTrade) => (
  typeof trade.netPnl === 'number'
    ? trade.netPnl
    : (Number(trade.actualPnl) || 0) - (Number(trade.brokerage) || 0) - (Number(trade.otherCharges) || 0)
);

const getDisciplineScore = (trade: StockTrade): number | null => {
  const checks: Array<'yes' | 'no' | 'na' | ''> = [
    trade.planFollowed === undefined ? '' : trade.planFollowed ? 'yes' : 'no',
    trade.stopLossFollowed || '',
    trade.targetFollowed || '',
  ];
  const applicable = checks.filter((value) => value === 'yes' || value === 'no');
  return applicable.length
    ? applicable.filter((value) => value === 'yes').length / applicable.length * 100
    : null;
};

const money = (value: number) => `${value < 0 ? '-₹' : '₹'}${formatINR(Math.abs(value))}`;

export const MonthlyTradingReview: React.FC<MonthlyTradingReviewProps> = ({ trades }) => {
  const rows = useMemo(() => {
    const groups = new Map<string, MonthRow>();
    trades.filter((trade) => trade.status === 'CLOSED').forEach((trade) => {
      const date = parseDate(trade.exitDate);
      if (!date) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const row = groups.get(key) || {
        key, label, count: 0, wins: 0, losses: 0, breakeven: 0, net: 0,
        reviewed: 0, disciplineTotal: 0, mistakeCounts: new Map<string, number>(),
      };
      const pnl = getNetPnl(trade);
      row.count += 1;
      row.net += pnl;
      if (pnl > 0) row.wins += 1;
      else if (pnl < 0) row.losses += 1;
      else row.breakeven += 1;

      const score = getDisciplineScore(trade);
      if (score !== null) {
        row.reviewed += 1;
        row.disciplineTotal += score;
      }
      (trade.disciplineMistakes || []).forEach((mistake) => {
        row.mistakeCounts.set(mistake, (row.mistakeCounts.get(mistake) || 0) + 1);
      });
      groups.set(key, row);
    });

    return Array.from(groups.values()).map((row) => ({
      ...row,
      winRate: row.wins + row.losses > 0 ? row.wins / (row.wins + row.losses) * 100 : 0,
      averageDiscipline: row.reviewed ? row.disciplineTotal / row.reviewed : null,
      topMistakes: Array.from(row.mistakeCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3),
    })).sort((a, b) => b.key.localeCompare(a.key));
  }, [trades]);

  const totals = rows.reduce((acc, row) => ({
    count: acc.count + row.count,
    wins: acc.wins + row.wins,
    losses: acc.losses + row.losses,
    net: acc.net + row.net,
    reviewed: acc.reviewed + row.reviewed,
  }), { count: 0, wins: 0, losses: 0, net: 0, reviewed: 0 });

  const exportReport = () => downloadCSV(
    'MOTI_Monthly_Trading_Review',
    ['Month', 'Closed Trades', 'Wins', 'Losses', 'Breakeven', 'Win Rate %', 'Net P&L INR', 'Average Discipline Score %', 'Reviewed Trades', 'Most Common Mistakes'],
    rows.map((row) => [
      row.label, row.count, row.wins, row.losses, row.breakeven, row.winRate.toFixed(2),
      row.net.toFixed(2), row.averageDiscipline === null ? 'N/A' : row.averageDiscipline.toFixed(2),
      row.reviewed, row.topMistakes.map(([name, count]) => `${name} (${count})`).join('; '),
    ])
  );

  return (
    <section className="space-y-4 rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-amber-400" /><h2 className="text-sm font-black text-white">MONTHLY TRADING REVIEW</h2></div>
          <p className="mt-1 text-[10px] text-slate-400">Monthly results, discipline score and recurring mistakes for closed equity trades</p>
        </div>
        <button type="button" onClick={exportReport} disabled={!rows.length} className="flex items-center gap-1.5 rounded-lg border border-[#263858] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-40"><Download className="h-3.5 w-3.5" />Export CSV</button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Closed trades</p><p className="mt-1 text-lg font-black text-white">{totals.count}</p></div>
        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Combined net P&amp;L</p><p className={`mt-1 text-lg font-black ${totals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(totals.net)}</p></div>
        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Wins / Losses</p><p className="mt-1 text-lg font-black text-white">{totals.wins} / {totals.losses}</p></div>
        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Discipline reviews</p><p className="mt-1 text-lg font-black text-white">{totals.reviewed}</p></div>
      </div>

      {rows.length ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.key} className="overflow-hidden rounded-xl border border-[#263858] bg-[#070d18]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#263858] px-3 py-3">
                <h3 className="text-xs font-black text-white">{row.label}</h3>
                <span className={`text-sm font-black ${row.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(row.net)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
                <div><p className="text-[10px] text-slate-500">Closed trades</p><p className="mt-1 text-xs font-bold text-white">{row.count}</p></div>
                <div><p className="text-[10px] text-slate-500">Win rate</p><p className="mt-1 text-xs font-bold text-white">{row.winRate.toFixed(1)}% <span className="text-slate-500">({row.wins}W / {row.losses}L)</span></p></div>
                <div><p className="text-[10px] text-slate-500">Average discipline</p><p className="mt-1 text-xs font-bold text-white">{row.averageDiscipline === null ? 'Not reviewed' : `${row.averageDiscipline.toFixed(1)}%`}</p></div>
                <div><p className="text-[10px] text-slate-500">Reviewed trades</p><p className="mt-1 text-xs font-bold text-white">{row.reviewed} / {row.count}</p></div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[#263858] px-3 py-2 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-emerald-400" />Wins {row.wins}</span>
                <span className="flex items-center gap-1"><TrendingDown className="h-3 w-3 text-rose-400" />Losses {row.losses}</span>
                <span>Breakeven {row.breakeven}</span>
                <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-amber-400" />{row.topMistakes.length ? `Common mistakes: ${row.topMistakes.map(([name, count]) => `${name} ×${count}`).join(', ')}` : 'No mistakes tagged'}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#263858] bg-[#070d18] p-6 text-center">
          <CalendarDays className="mx-auto h-6 w-6 text-slate-500" />
          <p className="mt-2 text-xs font-semibold text-slate-300">No monthly review data yet</p>
          <p className="mt-1 text-[10px] text-slate-500">Close an equity trade with an exit date to start your monthly report.</p>
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-slate-500">Trades are grouped by exit month. Win rate excludes breakeven trades. Discipline score averages only trades with at least one answered Yes/No check; unanswered and Not applicable checks are excluded. Closed trades without a valid exit date are not assigned to a month. This report is read-only and does not change saved trades.</p>
    </section>
  );
};
