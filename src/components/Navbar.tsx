import React, { useState } from 'react';
import {
  Bell,
  Sparkles,
  Lock,
  Plus,
  TrendingUp,
  Download,
  CheckCircle,
  AlertTriangle,
  X,
  ExternalLink
} from 'lucide-react';
import { UserProfile, AppNotification, FinancialContextSummary } from '../types';
import { formatINR } from '../utils/exportUtils';

interface NavbarProps {
  profile: UserProfile;
  summary: FinancialContextSummary;
  notifications: AppNotification[];
  onOpenAi: () => void;
  onOpenQuickAdd: () => void;
  onOpenSettings: () => void;
  onSelectTab: (tab: string) => void;
  onMarkNotificationRead: (id: string) => void;
  onLockApp: () => void;
  installPrompt: any;
  onInstallApp: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  profile,
  summary,
  notifications,
  onOpenAi,
  onOpenQuickAdd,
  onOpenSettings,
  onSelectTab,
  onMarkNotificationRead,
  onLockApp,
  installPrompt,
  onInstallApp,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#1e2e4f] bg-[#070d18]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 sm:px-6">
        {/* Brand & Logo */}
        <div
          onClick={() => onSelectTab('dashboard')}
          className="flex cursor-pointer items-center space-x-3 transition-opacity hover:opacity-90"
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0e172a] to-[#030712] p-1 border border-amber-500/30 shadow-lg shadow-amber-500/10">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="MOTI Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-black tracking-wider text-white">
                MOTI
              </span>
              <span className="hidden rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/20 sm:inline-block">
                PRO
              </span>
            </div>
            <p className="hidden text-[10px] font-medium tracking-tight text-slate-400 md:block">
              Money & Operations Tracking Intelligence
            </p>
          </div>
        </div>

        {/* Quick Financial Tickers (Desktop) */}
        <div className="hidden lg:flex items-center space-x-3">
          <div className="flex items-center space-x-2 rounded-lg border border-[#1e2e4f] bg-[#0d1527] px-3 py-1.5 shadow-inner">
            <span className="text-xs text-slate-400">Available:</span>
            <span className="font-semibold text-emerald-400">
              {profile.currencySymbol}
              {formatINR(summary.totalBalance)}
            </span>
          </div>
          <div className="flex items-center space-x-2 rounded-lg border border-[#1e2e4f] bg-[#0d1527] px-3 py-1.5 shadow-inner">
            <span className="text-xs text-slate-400">Net Worth:</span>
            <span className="font-semibold text-amber-400">
              {profile.currencySymbol}
              {formatINR(summary.netWorth)}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* PWA Install Button if available */}
          {installPrompt && (
            <button
              onClick={onInstallApp}
              className="hidden sm:flex items-center space-x-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
              title="Install MOTI App"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Install App</span>
            </button>
          )}

          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#1e2e4f] bg-[#0d1527] text-slate-300 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification Drawer Popover */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4 shadow-2xl shadow-black z-50 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-2.5">
                  <div className="flex items-center space-x-2">
                    <Bell className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-bold text-white">Notifications</span>
                  </div>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      No notifications right now. All ledgers are up to date!
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`rounded-lg border p-2.5 text-xs transition-colors ${
                          notif.read
                            ? 'border-slate-800 bg-[#070d18]/50 text-slate-400'
                            : 'border-amber-500/30 bg-amber-500/5 text-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <span className="font-semibold text-white flex items-center gap-1.5">
                            {notif.type === 'ALERT' && (
                              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                            )}
                            {notif.type === 'WARNING' && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                            )}
                            {notif.type === 'SUCCESS' && (
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                            )}
                            {notif.title}
                          </span>
                          <span className="text-[10px] text-slate-500">{notif.date}</span>
                        </div>
                        <p className="mt-1 text-slate-300 text-[11px] leading-relaxed">
                          {notif.message}
                        </p>
                        <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-800">
                          {notif.linkTab ? (
                            <button
                              onClick={() => {
                                onSelectTab(notif.linkTab!);
                                onMarkNotificationRead(notif.id);
                                setShowNotifications(false);
                              }}
                              className="text-[10px] font-semibold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              Open Module <ExternalLink className="h-2.5 w-2.5" />
                            </button>
                          ) : <span />}
                          {!notif.read && (
                            <button
                              onClick={() => onMarkNotificationRead(notif.id)}
                              className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                            >
                              Mark Read
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* PIN Lock Quick Button */}
          {profile.pinEnabled && (
            <button
              onClick={onLockApp}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1e2e4f] bg-[#0d1527] text-amber-400 hover:border-amber-500/50 transition-colors cursor-pointer"
              title="Lock Screen"
            >
              <Lock className="h-4 w-4" />
            </button>
          )}

          {/* User Profile Pill */}
          <div
            onClick={onOpenSettings}
            className="flex items-center space-x-2 rounded-lg border border-[#1e2e4f] bg-[#0d1527] p-1 pr-2.5 cursor-pointer hover:border-slate-600 transition-colors"
          >
            <img
              src={profile.avatar}
              alt={profile.name}
              className="h-7 w-7 rounded-md object-cover border border-amber-500/30"
              onError={(e) => {
                // fallback avatar
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-white leading-none">{profile.name}</p>
              <p className="text-[10px] text-amber-400/90 leading-tight mt-0.5">
                {profile.profession}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
