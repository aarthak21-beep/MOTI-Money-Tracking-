import React from 'react';
import { LayoutDashboard, TrendingUp, CalendarDays } from 'lucide-react';

interface MobileBottomNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentTab, onSelectTab }) => {
  const tabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'stockTrading', label: 'Equity', icon: TrendingUp },
    { id: 'weeklyIncome', label: 'Weekly Target', icon: CalendarDays },
  ];
  return <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-white/[0.09] bg-[#050a12]/95 px-2 backdrop-blur-md lg:hidden">
    {tabs.map((tab) => {
      const Icon = tab.icon;
      const active = currentTab === tab.id;
      return <button key={tab.id} onClick={() => onSelectTab(tab.id)} className={`flex flex-col items-center justify-center py-1 transition-colors ${active ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? 'bg-emerald-300/10 scale-110 shadow-[0_0_18px_rgba(52,211,153,0.12)]' : ''}`}><Icon className="h-4 w-4" /></div>
        <span className="mt-0.5 text-[10px] font-semibold">{tab.label}</span>
      </button>;
    })}
  </nav>;
};
