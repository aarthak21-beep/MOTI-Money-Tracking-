import React from 'react';
import { LayoutDashboard, TrendingUp, CalendarDays, ShieldCheck } from 'lucide-react';
import { UserProfile } from '../types';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  profile: UserProfile;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab, profile }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, tag: 'HOME' },
    { id: 'stockTrading', label: 'Equity Trading', icon: TrendingUp, tag: 'P&L' },
    { id: 'weeklyIncome', label: 'Weekly Capital Growth', icon: CalendarDays, tag: 'TARGET' },
  ];

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-[#1e2e4f] bg-[#070d18] p-4 select-none shrink-0 min-h-[calc(100vh-4rem)]">
      <div className="mb-4 rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-3 text-left">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Workspace</span>
          <span className="flex items-center text-[10px] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1" />Live</span>
        </div>
        <p className="mt-1 text-sm font-bold text-white truncate">{profile.name}</p>
        <p className="text-[11px] font-medium text-amber-400 truncate flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Equity Trader</p>
      </div>
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentTab === item.id;
          return <button key={item.id} onClick={() => onSelectTab(item.id)} className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer ${active ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-300 border border-amber-500/30' : 'text-slate-300 hover:bg-[#0d1527] border border-transparent'}`}>
            <span className="flex items-center gap-3"><Icon className="h-4 w-4" />{item.label}</span>
            <span className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[9px] font-mono">{item.tag}</span>
          </button>;
        })}
      </nav>
      <div className="mt-6 border-t border-[#1e2e4f] pt-4 text-center">
        <p className="text-[10px] font-extrabold tracking-widest text-slate-400">MOTIPRO • EQUITY JOURNAL</p>
        <p className="text-[9px] font-semibold text-amber-500/80 mt-0.5">SMART TRADING • SMART TRACKING</p>
      </div>
    </aside>
  );
};
