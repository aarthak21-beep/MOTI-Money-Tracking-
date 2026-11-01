import React from 'react';
import { UserProfile, FinancialContextSummary, StockTrade, WeeklyIncomeRecord } from '../types';
import { formatINR } from '../utils/exportUtils';
import {
  TrendingUp, CalendarDays, ArrowRight, Wallet, Activity,
  Sparkles, ShieldCheck, CircleDollarSign
} from 'lucide-react';

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
    {
      label: 'Stock Investment',
      value: summary.totalStockInvestment,
      note: `${openTrades} open positions`,
      icon: Wallet,
      accent: 'cyan',
      iconBg: 'bg-cyan-400/10 text-cyan-300',
    },
    {
      label: 'Realized Trading P&L',
      value: realized,
      note: `${closedTrades} closed trades`,
      icon: TrendingUp,
      accent: realized >= 0 ? 'green' : 'red',
      iconBg: realized >= 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300',
    },
    {
      label: 'Weekly Capital Target',
      value: latestTarget,
      note: `${weekly.length} weeks tracked`,
      icon: CalendarDays,
      accent: 'violet',
      iconBg: 'bg-violet-400/10 text-violet-300',
    },
  ];

  return <div className="moti-dashboard space-y-6 pb-24">
    <section className="relative overflow-hidden rounded-[28px] border border-emerald-400/15 bg-gradient-to-br from-[#101d2b] via-[#0b1422] to-[#071019] p-5 shadow-[0_18px_60px_-28px_rgba(16,185,129,0.28)] sm:p-7">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" />
            MOTI PRO <span className="text-emerald-100/40">/</span> Equity workspace
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Personal finance overview
          </span>
        </div>
        <div className="mt-7 max-w-2xl">
          <p className="text-xs font-semibold tracking-wide text-slate-400">Welcome back, {profile.name}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Your money, <span className="text-emerald-300">in control.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Your trading activity and weekly capital journey, brought together in one clear view.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={() => onSelectTab('stockTrading')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-xs font-extrabold text-[#04110d] shadow-[0_8px_25px_-10px_rgba(52,211,153,0.8)] transition hover:-translate-y-0.5 hover:bg-emerald-200">
            <TrendingUp className="h-4 w-4" /> Open trading journal <ArrowRight className="h-4 w-4" />
          </button>
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-semibold text-slate-300">
            <Activity className="h-4 w-4 text-cyan-300" /> {trades.length} total trades tracked
          </div>
        </div>
      </div>
    </section>

    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">At a glance</p>
          <h2 className="mt-1 text-lg font-extrabold text-white">Your key numbers</h2>
        </div>
        <span className="text-[10px] text-slate-500">Values in {profile.currencySymbol}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map(card => {
          const Icon = card.icon;
          const valueColor = card.label === 'Realized Trading P&L'
            ? (card.value >= 0 ? 'text-emerald-300' : 'text-rose-300')
            : 'text-white';
          return <div key={card.label} className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#111d2d] to-[#0b1421] p-4 shadow-[0_12px_35px_-25px_rgba(0,0,0,0.9)] transition duration-200 hover:-translate-y-1 hover:border-emerald-300/25 sm:p-5">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/[0.025] blur-2xl transition group-hover:bg-emerald-300/[0.08]" />
            <div className="relative flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-400">{card.label}</span>
              <span className={`rounded-xl p-2 ${card.iconBg}`}><Icon className="h-4 w-4" /></span>
            </div>
            <p className={`relative mt-4 break-words text-2xl font-black tracking-tight ${valueColor}`}>
              {profile.currencySymbol}{formatINR(card.value)}
            </p>
            <p className="relative mt-2 text-[10px] font-medium text-slate-500">{card.note}</p>
          </div>;
        })}
      </div>
    </section>

    <section>
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Your workspace</p>
        <h2 className="mt-1 text-lg font-extrabold text-white">Quick access</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => onSelectTab('stockTrading')} className="group rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-[#102333] to-[#0b1421] p-5 text-left transition duration-200 hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-[0_15px_40px_-25px_rgba(34,211,238,0.5)]">
          <span className="inline-flex rounded-xl bg-cyan-300/10 p-3 text-cyan-300"><TrendingUp className="h-5 w-5" /></span>
          <div className="mt-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-extrabold text-white">Equity Trading Journal</h3>
            <ArrowRight className="h-4 w-4 text-cyan-300 transition group-hover:translate-x-1" />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">Record entry price, quantity, investment, exit, charges and realized P&L.</p>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-cyan-300">Manage trades</div>
        </button>
        <button onClick={() => onSelectTab('weeklyIncome')} className="group rounded-2xl border border-emerald-300/15 bg-gradient-to-br from-[#102820] to-[#0b1421] p-5 text-left transition duration-200 hover:-translate-y-1 hover:border-emerald-300/40 hover:shadow-[0_15px_40px_-25px_rgba(52,211,153,0.5)]">
          <span className="inline-flex rounded-xl bg-emerald-300/10 p-3 text-emerald-300"><CircleDollarSign className="h-5 w-5" /></span>
          <div className="mt-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-extrabold text-white">Weekly Capital Growth</h3>
            <ArrowRight className="h-4 w-4 text-emerald-300 transition group-hover:translate-x-1" />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">Add earnings, set a hypothetical weekly target rate and compare actual capital.</p>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Open tracker</div>
        </button>
      </div>
    </section>

    <div className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-xs leading-5 text-slate-400">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
      <p><span className="font-bold text-slate-300">Your records stay yours.</span> No demo transactions are shown. Your journal starts empty and only displays records you enter.</p>
    </div>
  </div>;
};
