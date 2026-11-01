import React, { useMemo } from 'react';
import { PieChart, Download, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { StockTrade } from '../types';
import { downloadCSV, formatINR } from '../utils/exportUtils';

interface OpenPortfolioAllocationProps {
  trades: StockTrade[];
}

const money = (value: number) => `${value < 0 ? '-₹' : '₹'}${formatINR(Math.abs(value))}`;

export const OpenPortfolioAllocation: React.FC<OpenPortfolioAllocationProps> = ({ trades }) => {
  const portfolio = useMemo(() => {
    const holdings = new Map<string, { symbol: string; quantity: number; invested: number; marketValue: number; cmpMissing: boolean }>();
    trades.filter((trade) => trade.status === 'OPEN').forEach((trade) => {
      const symbol = trade.stockName.trim().toUpperCase();
      if (!symbol || trade.quantity <= 0) return;
      const cmp = Number(trade.currentMarketPrice);
      const hasCmp = Number.isFinite(cmp) && cmp > 0;
      const marketPrice = hasCmp ? cmp : Number(trade.entryPrice) || 0;
      const item = holdings.get(symbol) || { symbol, quantity: 0, invested: 0, marketValue: 0, cmpMissing: false };
      item.quantity += Number(trade.quantity) || 0;
      item.invested += Number(trade.totalInvestment) || (Number(trade.entryPrice) || 0) * (Number(trade.quantity) || 0);
      item.marketValue += marketPrice * (Number(trade.quantity) || 0);
      item.cmpMissing = item.cmpMissing || !hasCmp;
      holdings.set(symbol, item);
    });
    const rows = Array.from(holdings.values()).map((item) => ({
      ...item,
      pnl: item.marketValue - item.invested,
      allocation: 0,
    })).sort((a, b) => b.marketValue - a.marketValue);
    const totalInvested = rows.reduce((sum, row) => sum + row.invested, 0);
    const totalMarketValue = rows.reduce((sum, row) => sum + row.marketValue, 0);
    const totalPnl = totalMarketValue - totalInvested;
    rows.forEach((row) => { row.allocation = totalMarketValue > 0 ? row.marketValue / totalMarketValue * 100 : 0; });
    return { rows, totalInvested, totalMarketValue, totalPnl, count: rows.length, topWeight: rows[0]?.allocation || 0 };
  }, [trades]);

  const exportReport = () => downloadCSV(
    'MOTI_Open_Portfolio_Allocation',
    ['Stock', 'Quantity', 'Invested INR', 'Estimated Market Value INR', 'Unrealized Gross P&L INR', 'Portfolio Allocation %', 'CMP Used'],
    portfolio.rows.map((row) => [
      row.symbol, row.quantity, row.invested.toFixed(2), row.marketValue.toFixed(2),
      row.pnl.toFixed(2), row.allocation.toFixed(2), row.cmpMissing ? 'Entry price fallback' : 'Saved CMP',
    ])
  );

  const PnlIcon = portfolio.totalPnl >= 0 ? TrendingUp : TrendingDown;
  return (
    <section className="space-y-4 rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><PieChart className="h-5 w-5 text-amber-400" /><h2 className="text-sm font-black text-white">OPEN PORTFOLIO ALLOCATION</h2></div>
          <p className="mt-1 text-[10px] text-slate-400">Capital exposure by stock · open Equity Delivery positions only</p>
        </div>
        <button type="button" onClick={exportReport} disabled={!portfolio.rows.length} className="flex items-center gap-1.5 rounded-lg border border-[#263858] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-40"><Download className="h-3.5 w-3.5" />Export CSV</button>
      </div>

      {portfolio.rows.length ? <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Open stocks</p><p className="mt-1 text-lg font-black text-white">{portfolio.count}</p></div>
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Invested capital</p><p className="mt-1 text-lg font-black text-white">{money(portfolio.totalInvested)}</p></div>
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[10px] text-slate-400">Estimated market value</p><p className="mt-1 text-lg font-black text-white">{money(portfolio.totalMarketValue)}</p></div>
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="flex items-center gap-1 text-[10px] text-slate-400"><PnlIcon className="h-3 w-3" />Unrealized gross P&amp;L</p><p className={`mt-1 text-lg font-black ${portfolio.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{money(portfolio.totalPnl)}</p></div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-bold text-white">STOCK-WISE CAPITAL ALLOCATION</h3><span className="text-[10px] text-slate-500">Largest holding: {portfolio.topWeight.toFixed(1)}%</span></div>
          {portfolio.rows.map((row) => (
            <div key={row.symbol} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                <span className="font-bold text-slate-200">{row.symbol} <span className="font-normal text-slate-500">· Qty {row.quantity}</span></span>
                <span className="text-slate-300">{money(row.marketValue)} · {row.allocation.toFixed(1)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, row.allocation)}%` }} /></div>
              <div className="flex flex-wrap justify-between gap-2 text-[9px] text-slate-500">
                <span>Invested {money(row.invested)}{row.cmpMissing ? ' · CMP unavailable; entry used' : ''}</span>
                <span className={row.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>Gross P&amp;L {money(row.pnl)}</span>
              </div>
            </div>
          ))}
        </div>
      </> : <div className="rounded-xl border border-dashed border-[#263858] bg-[#070d18] p-6 text-center"><Wallet className="mx-auto h-6 w-6 text-slate-500" /><p className="mt-2 text-xs font-semibold text-slate-300">No open positions</p><p className="mt-1 text-[10px] text-slate-500">Add an open Equity Delivery trade to see your portfolio allocation.</p></div>}
      <p className="text-[10px] leading-relaxed text-slate-500">Read-only report. Market value uses the saved current market price (CMP); when CMP is missing, entry price is used and marked. Unrealized P&amp;L is gross and excludes estimated exit charges, taxes and slippage. This is not a live market feed or broker valuation.</p>
    </section>
  );
};
