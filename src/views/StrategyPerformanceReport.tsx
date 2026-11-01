import React, { useMemo } from 'react';
import { Layers3, Download, TrendingUp, TrendingDown } from 'lucide-react';
import { StockTrade } from '../types';
import { downloadCSV, formatINR } from '../utils/exportUtils';

interface StrategyPerformanceReportProps {
  trades: StockTrade[];
}

const netPnl = (trade: StockTrade) => (
  typeof trade.netPnl === 'number'
    ? trade.netPnl
    : (Number(trade.actualPnl) || 0) - (Number(trade.brokerage) || 0) - (Number(trade.otherCharges) || 0)
);

const money = (value: number) => `${value < 0 ? '-₹' : '₹'}${formatINR(Math.abs(value))}`;

export const StrategyPerformanceReport: React.FC<StrategyPerformanceReportProps> = ({ trades }) => {
  const rows = useMemo(() => {
    const groups = new Map<string, { count: number; wins: number; losses: number; breakeven: number; net: number; grossWins: number; grossLosses: number }>();
    trades.filter((trade) => trade.status === 'CLOSED').forEach((trade) => {
      const name = trade.strategy?.trim() || 'Unclassified';
      const pnl = netPnl(trade);
      const row = groups.get(name) || { count: 0, wins: 0, losses: 0, breakeven: 0, net: 0, grossWins: 0, grossLosses: 0 };
      row.count += 1;
      row.net += pnl;
      if (pnl > 0) { row.wins += 1; row.grossWins += pnl; }
      else if (pnl < 0) { row.losses += 1; row.grossLosses += Math.abs(pnl); }
      else row.breakeven += 1;
      groups.set(name, row);
    });
    return Array.from(groups.entries()).map(([strategy, row]) => ({
      strategy,
      ...row,
      winRate: row.wins + row.losses > 0 ? row.wins / (row.wins + row.losses) * 100 : 0,
      averagePnl: row.count ? row.net / row.count : 0,
      profitFactor: row.grossLosses > 0 ? row.grossWins / row.grossLosses : null,
    })).sort((a, b) => b.net - a.net);
  }, [trades]);

  const totalTrades = rows.reduce((sum, row) => sum + row.count, 0);
  const totalNet = rows.reduce((sum, row) => sum + row.net, 0);
  const exportReport = () => {
    downloadCSV('MOTI_Strategy_Performance', ['Strategy', 'Closed Trades', 'Wins', 'Losses', 'Breakeven', 'Win Rate %', 'Net P&L INR', 'Average P&L INR', 'Profit Factor'],
      rows.map((row) => [row.strategy, row.count, row.wins, row.losses, row.breakeven, row.winRate.toFixed(2), row.net.toFixed(2), row.averagePnl.toFixed(2), row.profitFactor === null ? 'N/A' : row.profitFactor.toFixed(2)]));
  };

  return (
    <section className="space-y-4 rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-amber-400" /><h2 className="text-sm font-black text-white">STRATEGY-WISE PERFORMANCE</h2></div>
          <p className="mt-1 text-[10px] text-slate-400">Compare closed Equity Delivery trades by the strategy tag you selected</p>
        </div>
        <button type="button" onClick={exportReport} disabled={!rows.length} className="flex items-center gap-1.5 rounded-lg border border-[#263858] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-40"><Download className="h-3.5 w-3.5" />Export CSV</button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Tagged strategy groups</p><p className="mt-1 text-lg font-black text-white">{rows.filter((row) => row.strategy !== 'Unclassified').length}</p></div>
        <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Closed trades</p><p className="mt-1 text-lg font-black text-white">{totalTrades}</p></div>
        <div className="col-span-2 rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3 sm:col-span-1"><p className="text-[10px] text-slate-400">Combined net P&L</p><p className={`mt-1 text-lg font-black ${totalNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(totalNet)}</p></div>
      </div>

      {rows.length ? <div className="overflow-x-auto rounded-xl border border-[#1e2e4f]">
        <table className="w-full min-w-[760px] text-left text-[10px]">
          <thead className="bg-[#070d18] text-slate-400"><tr>
            <th className="px-3 py-3 font-semibold">Strategy</th><th className="px-3 py-3 text-right font-semibold">Trades</th><th className="px-3 py-3 text-right font-semibold">Win Rate</th><th className="px-3 py-3 text-right font-semibold">Net P&L</th><th className="px-3 py-3 text-right font-semibold">Avg / Trade</th><th className="px-3 py-3 text-right font-semibold">Profit Factor</th>
          </tr></thead>
          <tbody>{rows.map((row) => <tr key={row.strategy} className="border-t border-[#1e2e4f]">
            <td className="px-3 py-3 font-bold text-white">{row.strategy}</td>
            <td className="px-3 py-3 text-right text-slate-300">{row.count}<span className="ml-1 text-slate-500">({row.wins}W/{row.losses}L)</span></td>
            <td className="px-3 py-3 text-right font-semibold text-slate-200">{row.winRate.toFixed(1)}%</td>
            <td className={`px-3 py-3 text-right font-black ${row.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(row.net)}</td>
            <td className={`px-3 py-3 text-right font-semibold ${row.averagePnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(row.averagePnl)}</td>
            <td className="px-3 py-3 text-right text-slate-200">{row.profitFactor === null ? (row.grossWins > 0 ? '∞' : '—') : row.profitFactor.toFixed(2)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="rounded-xl border border-dashed border-[#263858] bg-[#070d18] p-6 text-center"><Layers3 className="mx-auto h-6 w-6 text-slate-500" /><p className="mt-2 text-xs font-semibold text-slate-300">No closed trades to compare yet</p><p className="mt-1 text-[10px] text-slate-500">Close a trade and select a strategy in its trade form to start building this report.</p></div>}

      {rows.length > 0 && <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400"><span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" />Wins: {rows.reduce((sum, row) => sum + row.wins, 0)}</span><span className="flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5 text-rose-400" />Losses: {rows.reduce((sum, row) => sum + row.losses, 0)}</span><span>Breakeven: {rows.reduce((sum, row) => sum + row.breakeven, 0)}</span></div>}
      <p className="text-[10px] leading-relaxed text-slate-500">Only closed trades are counted. Existing trades without a strategy tag appear under Unclassified; edit an existing trade to assign its strategy. Win rate excludes breakeven trades. Profit factor is gross net wins divided by absolute net losses. Results are historical journal data, not a guarantee of future performance.</p>
    </section>
  );
};
