import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  CalendarDays,
  Clock,
  Briefcase,
  Receipt,
  Wallet,
  PiggyBank,
  Calculator,
  BarChart3,
  Sparkles,
  Settings,
  ShieldCheck
} from 'lucide-react';
import { UserProfile } from '../types';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  profile: UserProfile;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, profile }) => {
  const navItems = [
    { id: 'dashboard', label: 'Main Overview', icon: LayoutDashboard, tag: 'CORE' },
    { id: 'stockTrading', label: 'Stock Trading', icon: TrendingUp, tag: 'P&L' },
    { id: 'weeklyIncome', label: 'Universal Weekly', icon: CalendarDays, tag: 'INCOME' },
    { id: 'dailyEarnings', label: 'Daily Shifts', icon: Clock, tag: 'SHIFTS' },
    { id: 'business', label: 'Business & Invoices', icon: Briefcase, tag: 'B2B' },
    { id: 'expenses', label: 'Expense Tracker', icon: Receipt, tag: 'BUDGET' },
    { id: 'cashflow', label: 'Cashflow & Banks', icon: Wallet, tag: 'ACCOUNTS' },
    { id: 'savings', label: 'Savings & Goals', icon: PiggyBank, tag: 'GOALS' },
    { id: 'calculators', label: '12 Calculators', icon: Calculator, tag: 'TOOLS' },
    { id: 'reports', label: 'Analytics & Reports', icon: BarChart3, tag: 'AUDIT' },
    { id: 'aiAssistant', label: 'MOTI AI Assistant', icon: Sparkles, tag: 'INTELLIGENCE' },
    { id: 'settings', label: 'Settings & Cloud', icon: Settings, tag: 'CONFIG' },
  ];

  // Highlight items particularly tailored to profession
  const getBadgeStyle = (itemId: string) => {
    const prof = profile.profession;
    if (prof === 'Stock Trader' && itemId === 'stockTrading') return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    if (prof === 'Delivery Partner' && (itemId === 'dailyEarnings' || itemId === 'weeklyIncome')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    if ((prof === 'Business Owner' || prof === 'Shop Owner') && (itemId === 'business' || itemId === 'cashflow')) return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    if (prof === 'Freelancer' && itemId === 'business') return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-[#1e2e4f] bg-[#070d18] p-4 select-none shrink-0 min-h-[calc(100vh-4rem)]">
      <div className="mb-4 rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-3 text-left">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Active Workspace
          </span>
          <span className="flex items-center text-[10px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse" />
            Live Encrypted
          </span>
        </div>
        <p className="mt-1 text-sm font-bold text-white truncate">{profile.name}</p>
        <p className="text-[11px] font-medium text-amber-400 truncate flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          {profile.profession}
        </p>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-300 border border-amber-500/30 shadow-sm'
                  : 'text-slate-300 hover:bg-[#0d1527] hover:text-white border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-3 truncate">
                <Icon
                  className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              <span
                className={`rounded border px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase transition-colors ${getBadgeStyle(
                  item.id
                )}`}
              >
                {item.tag}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Brand Footer Tagline */}
      <div className="mt-6 border-t border-[#1e2e4f] pt-4 text-center">
        <p className="text-[10px] font-extrabold tracking-widest text-slate-400 uppercase">
          MOTI PLATFORM
        </p>
        <p className="text-[9px] font-semibold text-amber-500/80 tracking-wide mt-0.5">
          SMART MONEY • SMART BUSINESS
        </p>
      </div>
    </aside>
  );
};
