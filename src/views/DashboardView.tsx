import React from 'react';
import { UserProfile, FinancialContextSummary, StockTrade, WeeklyIncomeRecord } from '../types';
import { formatINR } from '../utils/exportUtils';
import { TrendingUp, CalendarDays, ArrowRight, Wallet, Activity, ShieldCheck, CircleDollarSign } from 'lucide-react';

interface DashboardViewProps {
  profile: UserProfile;
  summary: FinancialContextSummary;
  trades: StockTrade[];
  weekly: WeeklyIncomeRecord[];
  onSelectTab: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ profile, summary, trades, weekly, onSelectTab }) => {
  const realized = summary.stockRealizedPnl || 0;
  const latestTarget = weekly[weekly.length - 1]?.finalAmount || 0;
  const openTrades = trades.filter(t => t.status === 'OPEN').length;
  const closedTrades = trades.filter(t => t.status === 'CLOSED').length;
  const cards = [
    { label: 'Stock Investment', value: summary.totalStockInvestment, note: `${openTrades} open positions`, icon: Wallet, color: 'cyan' },
    { label: 'Realized Trading P&L', value: realized, note: `${closedTrades} closed trades`, icon: TrendingUp, color: realized >= 0 ? 'green' : 'red' },
    { label: 'Weekly Capital Target', value: latestTarget, note: `${weekly.length} weeks tracked`, icon: CalendarDays, color: 'violet' },
  ];

  return <div className="moti-dashboard space-y-4 pb-24 sm:space-y-6">
    <section className="moti-home-hero relative overflow-hidden rounded-2xl border p-4 sm:rounded-[26px] sm:p-7">
      <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-pink-500/15 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-pink-300" /> PERSONAL FINANCE OVERVIEW
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-400">Welcome back, {profile.name}</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-4xl">Your money, <span className="text-pink-300">in control.</span></h1>
          <p className="mt-2 max-w-xl text-xs leading-5 text-slate-400 sm:text-sm">A clear snapshot of your investments, trading and weekly capital.</p>
        </div>
        <button onClick={() => onSelectTab('stockTrading')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-pink-400 px-4 py-3 text-xs font-extrabold text-[#190812] shadow-[0_8px_25px_-10px_rgba(236,72,153,0.75)] transition hover:-translate-y-0.5 hover:bg-pink-300 sm:w-auto">
          <TrendingUp className="h-4 w-4" /> Open trading journal <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="relative mt-4 flex items-center gap-2 border-t border-pink-200/10 pt-3 text-[11px] text-slate-400 sm:mt-5">
        <Activity className="h-4 w-4 text-cyan-300" /> {trades.length} total trades tracked
      </div>
    </section>

    <section>
      <div className="mb-3 flex items-end justify-between gap-2">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">At a glance</p><h2 className="mt-1 text-base font-extrabold text-white sm:text-lg">Key numbers</h2></div>
        <span className="text-[10px] text-slate-500">In {profile.currencySymbol}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {cards.map(card => {
          const Icon = card.icon;
          const tone = card.color === 'green' ? 'text-emerald-300' : card.color === 'red' ? 'text-rose-300' : card.color === 'cyan' ? 'text-cyan-300' : card.color === 'violet' ? 'text-violet-300' : 'text-white';
          const iconTone = card.color === 'green' ? 'bg-emerald-400/10 text-emerald-300' : card.color === 'red' ? 'bg-rose-400/10 text-rose-300' : card.color === 'cyan' ? 'bg-cyan-400/10 text-cyan-300' : 'bg-violet-400/10 text-violet-300';
          return <div key={card.label} className="moti-home-metric relative min-w-0 overflow-hidden rounded-xl border p-3 sm:rounded-2xl sm:p-5">
            <div className="flex items-start justify-between gap-1"><span className="text-[10px] font-semibold leading-4 text-slate-400 sm:text-xs">{card.label}</span><span className={`shrink-0 rounded-lg p-1.5 ${iconTone}`}><Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></span></div>
            <p className={`mt-3 break-all text-base font-black tracking-tight sm:mt-4 sm:text-2xl ${tone}`}>{profile.currencySymbol}{formatINR(card.value)}</p>
            <p className="mt-1.5 text-[9px] font-medium text-slate-500 sm:text-[10px]">{card.note}</p>
          </div>;
        })}
      </div>
    </section>

    <section>
      <div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Shortcuts</p><h2 className="mt-1 text-base font-extrabold text-white sm:text-lg">Quick access</h2></div>
      <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
        <button onClick={() => onSelectTab('stockTrading')} className="moti-home-shortcut group flex items-center gap-3 rounded-xl border p-3 text-left transition sm:rounded-2xl sm:p-4">
          <span className="shrink-0 rounded-xl bg-cyan-300/10 p-2.5 text-cyan-300"><TrendingUp className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-xs font-extrabold text-white sm:text-sm">Equity Trading Journal</span><span className="mt-1 block text-[10px] leading-4 text-slate-400">Manage entries, exits and realized P&L.</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-cyan-300 transition group-hover:translate-x-1" />
        </button>
        <button onClick={() => onSelectTab('weeklyIncome')} className="moti-home-shortcut moti-home-shortcut-secondary group flex items-center gap-3 rounded-xl border p-3 text-left transition sm:rounded-2xl sm:p-4">
          <span className="shrink-0 rounded-xl bg-emerald-300/10 p-2.5 text-emerald-300"><CircleDollarSign className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-xs font-extrabold text-white sm:text-sm">Weekly Capital Growth</span><span className="mt-1 block text-[10px] leading-4 text-slate-400">Track additions and target growth.</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-emerald-300 transition group-hover:translate-x-1" />
        </button>
      </div>
    </section>
    <p className="px-1 text-center text-[10px] text-slate-500">Your records stay private. No demo transactions are added.</p>
  </div>;
};
