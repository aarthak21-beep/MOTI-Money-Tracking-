import React from 'react';
import { UserProfile, FinancialContextSummary, StockTrade, WeeklyIncomeRecord } from '../types';
import { formatINR } from '../utils/exportUtils';
import { TrendingUp, CalendarDays, ArrowRight, Wallet } from 'lucide-react';

interface DashboardViewProps {
  profile: UserProfile;
  summary: FinancialContextSummary;
  trades: StockTrade[];
  weekly: WeeklyIncomeRecord[];
  onSelectTab: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ profile, summary, trades, weekly, onSelectTab }) => {
  const realized = summary.stockRealizedPnl || 0;
  const latest = weekly[weekly.length - 1];
  const latestTarget = latest?.finalAmount || 0;
  const openTrades = trades.filter(t => t.status === 'OPEN').length;
  const closedTrades = trades.filter(t => t.status === 'CLOSED').length;
  const cards = [
    { label: 'Stock Investment', value: summary.totalStockInvestment, note: `${openTrades} open positions`, icon: Wallet },
    { label: 'Realized Trading P&L', value: realized, note: `${closedTrades} closed trades`, icon: TrendingUp },
    { label: 'Weekly Capital Target', value: latestTarget, note: `${weekly.length} weeks tracked`, icon: CalendarDays },
  ];
  return <div className="space-y-6 animate-in fade-in pb-24">
    <div className="border-b border-[#1e2e4f] pb-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">MOTIPRO • Equity workspace</p>
      <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">TRADING DASHBOARD</h1>
      <p className="mt-1 text-xs text-slate-400">Welcome, {profile.name}. Track your equity trades and weekly capital target in one place.</p>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map(card => { const Icon = card.icon; return <div key={card.label} className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4">
        <div className="flex items-center justify-between text-xs text-slate-400"><span>{card.label}</span><Icon className="h-4 w-4 text-amber-400"/></div>
        <p className={`mt-2 text-2xl font-black ${card.label === 'Realized Trading P&L' ? (card.value >= 0 ? 'text-emerald-300' : 'text-rose-300') : 'text-white'}`}>{profile.currencySymbol}{formatINR(card.value)}</p>
        <p className="mt-1 text-[10px] text-slate-500">{card.note}</p>
      </div>; })}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <button onClick={()=>onSelectTab('stockTrading')} className="rounded-2xl border border-amber-500/30 bg-[#0d1527] p-5 text-left hover:border-amber-400/60">
        <TrendingUp className="h-6 w-6 text-amber-400"/><h2 className="mt-3 text-lg font-black text-white">Equity Trading Journal</h2><p className="mt-1 text-xs text-slate-400">Record entry, quantity, investment, exit, charges and realized P&L.</p><span className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-amber-300">Open journal <ArrowRight className="h-4 w-4"/></span>
      </button>
      <button onClick={()=>onSelectTab('weeklyIncome')} className="rounded-2xl border border-emerald-500/30 bg-[#0d1527] p-5 text-left hover:border-emerald-400/60">
        <CalendarDays className="h-6 w-6 text-emerald-400"/><h2 className="mt-3 text-lg font-black text-white">Weekly Capital Growth</h2><p className="mt-1 text-xs text-slate-400">Add outside earnings, set your weekly target rate and compare actual capital.</p><span className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-emerald-300">Open tracker <ArrowRight className="h-4 w-4"/></span>
      </button>
    </div>
    <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4 text-xs text-slate-400">No demo transactions are shown. Your journal starts empty and only displays records you enter.</div>
  </div>;
};
