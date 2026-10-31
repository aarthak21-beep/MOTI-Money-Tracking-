import React, { useState } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  MoreHorizontal,
  Briefcase,
  Wallet,
  PiggyBank,
  Calculator,
  BarChart3,
  Sparkles,
  Settings,
  X,
  CalendarDays,
  Clock
} from 'lucide-react';

interface MobileBottomNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentTab, onSelectTab }) => {
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);

  const mainTabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'stockTrading', label: 'Trading', icon: TrendingUp },
    { id: 'weeklyIncome', label: 'Income', icon: CalendarDays },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
  ];

  const moreItems = [
    { id: 'dailyEarnings', label: 'Daily Shifts', icon: Clock, desc: 'Shift 1, 2, 3, bonus & daily net' },
    { id: 'business', label: 'Business & Invoices', icon: Briefcase, desc: 'Clients, projects & overdue payments' },
    { id: 'cashflow', label: 'Cashflow & Accounts', icon: Wallet, desc: 'Cash, Bank, UPI & Wallet transfers' },
    { id: 'savings', label: 'Savings & Goals', icon: PiggyBank, desc: 'Emergency fund & financial targets' },
    { id: 'calculators', label: '12 Calculators', icon: Calculator, desc: 'Stock P&L, SIP, GST, Brokerage & more' },
    { id: 'reports', label: 'Analytics & Reports', icon: BarChart3, desc: 'Charts, audit ledgers & PDF export' },
    { id: 'aiAssistant', label: 'MOTI AI Assistant', icon: Sparkles, desc: 'Personal financial advisor intelligence' },
    { id: 'settings', label: 'Settings & Cloud Backup', icon: Settings, desc: 'Profile, profession & data export' },
  ];

  const isMoreActive = moreItems.some((item) => item.id === currentTab);

  return (
    <>
      {/* Slide-up "More" Drawer for Mobile */}
      {showMoreDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-sm lg:hidden animate-in fade-in">
          <div
            className="flex-1"
            onClick={() => setShowMoreDrawer(false)}
          />
          <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-[#1e2e4f] bg-[#0d1527] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
              <div>
                <h3 className="text-base font-bold text-white">All Modules</h3>
                <p className="text-xs text-slate-400">Select any financial intelligence tool</p>
              </div>
              <button
                onClick={() => setShowMoreDrawer(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1e2e4f] text-slate-300 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectTab(item.id);
                      setShowMoreDrawer(false);
                    }}
                    className={`flex items-center space-x-3 rounded-xl p-3 text-left transition-all ${
                      isActive
                        ? 'border border-amber-500/40 bg-amber-500/10 text-white'
                        : 'border border-[#1e2e4f]/50 bg-[#070d18] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        isActive ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-[#131f38] text-amber-400'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">{item.label}</p>
                      <p className="text-xs text-slate-400 truncate">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Persistent Bottom Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-[#1e2e4f] bg-[#070d18]/95 px-2 backdrop-blur-md lg:hidden">
        {mainTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex flex-col items-center justify-center py-1 transition-colors ${
                isActive ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-transform ${
                  isActive ? 'bg-amber-500/10 scale-110' : ''
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className="mt-0.5 text-[10px] font-semibold">{tab.label}</span>
            </button>
          );
        })}

        {/* More Tab */}
        <button
          onClick={() => setShowMoreDrawer(true)}
          className={`flex flex-col items-center justify-center py-1 transition-colors ${
            isMoreActive ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-transform ${
              isMoreActive ? 'bg-amber-500/10 scale-110' : ''
            }`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </div>
          <span className="mt-0.5 text-[10px] font-semibold">More</span>
        </button>
      </nav>
    </>
  );
};
