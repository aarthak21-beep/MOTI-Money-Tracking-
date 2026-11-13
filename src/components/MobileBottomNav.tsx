import React from 'react';
import { LayoutDashboard, TrendingUp, CalendarDays, Activity } from 'lucide-react';

interface MobileBottomNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentTab, onSelectTab }) => {
  const tabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'stockTrading', label: 'Equity', icon: TrendingUp },
    { id: 'swingScanner', label: 'Scanner', icon: Activity },
    { id: 'weeklyIncome', label: 'Weekly', icon: CalendarDays },
  ];
  return <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-[60px] items-center justify-around border-t border-white/[0.09] bg-[#050a12]/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
    {tabs.map((tab) => {
      const Icon = tab.icon;
      const active = currentTab === tab.id;
      return <button key={tab.id} onClick={() => onSelectTab(tab.id)} aria-current={active ? 'page' : undefined} className={`flex min-w-[72px] flex-col items-center justify-center gap-0.5 py-1 transition-colors ${active ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}>
        <div className={`flex h-7 w-8 items-center justify-center rounded-lg ${active ? 'bg-emerald-300/10 shadow-[0_0_18px_rgba(52,211,153,0.12)]' : ''}`}><Icon className="h-4 w-4" /></div>
        <span className="text-[10px] font-semibold">{tab.label}</span>
      </button>;
    })}
  </nav>;
};
