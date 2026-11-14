import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { PinLockModal } from './components/PinLockModal';
import { QuickAddModal } from './components/QuickAddModal';

import { DashboardView } from './views/DashboardView';
import { StockTradingView } from './views/StockTradingView';
import { WeeklyIncomeView } from './views/WeeklyIncomeView';
import { DailyEarningsView } from './views/DailyEarningsView';
import { BusinessInvoicesView } from './views/BusinessInvoicesView';
import { ExpenseManagementView } from './views/ExpenseManagementView';
import { CashflowManagementView } from './views/CashflowManagementView';
import { SavingsGoalsView } from './views/SavingsGoalsView';
import { CalculatorsView } from './views/CalculatorsView';
import { AnalyticsReportsView } from './views/AnalyticsReportsView';
import { AiAssistantView } from './views/AiAssistantView';
import { SettingsView } from './views/SettingsView';
import { SwingScannerView } from './views/SwingScannerView';
import { NiftyOptionsScannerView } from './views/NiftyOptionsScannerView';
import { SmartMoneyScreenerView } from './views/SmartMoneyScreenerView';

import { StorageService } from './services/storageService';
import { CloudAppSyncService } from './services/cloudAppSyncService';
import {
  UserProfile,
  StockTrade,
  WeeklyIncomeRecord,
  DailyEarningsRecord,
  BusinessInvoice,
  ExpenseRecord,
  BudgetLimit,
  AccountRecord,
  SavingsGoal,
  AppNotification
} from './types';
import { Sparkles } from 'lucide-react';
import { AppwriteLoginGate } from './components/AppwriteLoginGate';

function AuthenticatedApp() {
  const [userId] = useState('usr_default');
  const [profile, setProfile] = useState<UserProfile>(() => StorageService.getProfile(userId));
  const [accounts, setAccounts] = useState<AccountRecord[]>(() => StorageService.getAccounts(userId));
  // Start with the user's saved records only. Never insert sample/demo trades automatically.
  const [trades, setTrades] = useState<StockTrade[]>(() => StorageService.getStockTrades(userId));
  const [weekly, setWeekly] = useState<WeeklyIncomeRecord[]>(() => StorageService.getWeeklyIncome(userId));
  const [daily, setDaily] = useState<DailyEarningsRecord[]>(() => StorageService.getDailyEarnings(userId));
  const [invoices, setInvoices] = useState<BusinessInvoice[]>(() => StorageService.getInvoices(userId));
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() => StorageService.getExpenses(userId));
  const [budgets, setBudgets] = useState<BudgetLimit[]>(() => StorageService.getBudgets(userId));
  const [savings, setSavings] = useState<SavingsGoal[]>(() => StorageService.getSavingsGoals(userId));
  const [notifications, setNotifications] = useState<AppNotification[]>(() => StorageService.getNotifications(userId));

  // Remove any previously saved browser credentials for the retired Zerodha connector.
  useEffect(() => {
    localStorage.removeItem('moti_kite_worker_url_v1');
    sessionStorage.removeItem('moti_kite_worker_password_session');
  }, []);

  // Navigation State
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // Security Lock State
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const lastActivity = Number(localStorage.getItem(`moti_last_activity_v1_${userId}`));
    return Boolean(
      profile.pinEnabled &&
      profile.pinCode &&
      lastActivity &&
      Date.now() - lastActivity >= 2 * 60 * 1000
    );
  });

  // Auto-lock after 2 minutes without activity. Background time counts too.
  // The last-activity timestamp is checked again when the app becomes visible,
  // because mobile browsers may throttle timers while the app is in the background.
  const activityStorageKey = `moti_last_activity_v1_${userId}`;
  const lastActivityAt = useRef(Number(localStorage.getItem(activityStorageKey)) || Date.now());
  useEffect(() => {
    if (!profile.pinEnabled || !profile.pinCode || isLocked) return;

    const INACTIVITY_LIMIT_MS = 2 * 60 * 1000;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const clearInactivityTimer = () => {
      if (timeout) clearTimeout(timeout);
      timeout = undefined;
    };

    const lockIfExpiredOrSchedule = () => {
      clearInactivityTimer();
      const remaining = INACTIVITY_LIMIT_MS - (Date.now() - lastActivityAt.current);
      if (remaining <= 0) {
        setIsLocked(true);
        return;
      }
      timeout = setTimeout(() => setIsLocked(true), remaining);
    };

    const recordActivity = () => {
      if (document.visibilityState !== 'visible') return;
      lastActivityAt.current = Date.now();
      localStorage.setItem(activityStorageKey, String(lastActivityAt.current));
      lockIfExpiredOrSchedule();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lockIfExpiredOrSchedule();
      } else {
        // Keep the original activity time; time spent in the background counts.
        clearInactivityTimer();
      }
    };

    const activityEvents: (keyof WindowEventMap)[] = [
      'pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'
    ];
    activityEvents.forEach((event) =>
      window.addEventListener(event, recordActivity, { passive: true })
    );
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Restore the last activity time so a closed/reopened app also locks after 2 minutes.
    if (!localStorage.getItem(activityStorageKey)) {
      lastActivityAt.current = Date.now();
      localStorage.setItem(activityStorageKey, String(lastActivityAt.current));
    }
    lockIfExpiredOrSchedule();

    return () => {
      clearInactivityTimer();
      activityEvents.forEach((event) =>
        window.removeEventListener(event, recordActivity)
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [profile.pinEnabled, profile.pinCode, isLocked]);

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Register service worker and catch install prompt
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
        console.log('SW registration note:', err);
      });
    }

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
    }
    setDeferredPrompt(null);
  };

  // Re-read all records on state reload / demo seed
  const reloadAllData = useCallback(() => {
    setProfile(StorageService.getProfile(userId));
    setAccounts(StorageService.getAccounts(userId));
    setTrades(StorageService.getStockTrades(userId));
    setWeekly(StorageService.getWeeklyIncome(userId));
    setDaily(StorageService.getDailyEarnings(userId));
    setInvoices(StorageService.getInvoices(userId));
    setExpenses(StorageService.getExpenses(userId));
    setBudgets(StorageService.getBudgets(userId));
    setSavings(StorageService.getSavingsGoals(userId));
    setNotifications(StorageService.getNotifications(userId));
    CloudAppSyncService.schedule(userId);
  }, [userId]);

  // Full-app Cloudflare sync: restore the latest revision on startup and poll for
  // changes made on other devices. Existing local backup and Google Drive flows remain intact.
  useEffect(() => {
    let cancelled = false;
    let pollHandle: ReturnType<typeof setInterval> | undefined;
    let starting = false;
    const onRemoteApplied = () => {
      if (!cancelled) reloadAllData();
    };
    window.addEventListener('moti-cloud-sync-applied', onRemoteApplied);
    const start = async () => {
      if (starting || pollHandle) return;
      starting = true;
      try {
        await CloudAppSyncService.initialize(userId, onRemoteApplied);
        if (cancelled) return;
        pollHandle = setInterval(() => {
          CloudAppSyncService.poll(userId, onRemoteApplied).catch((error) => {
            console.warn('MOTI cloud sync poll failed:', error);
          });
        }, 10000);
      } catch (error) {
        console.warn('MOTI full-app cloud sync could not start:', error);
      } finally {
        starting = false;
      }
    };
    window.addEventListener('moti-cloud-key-updated', start);
    start();
    return () => {
      cancelled = true;
      window.removeEventListener('moti-cloud-sync-applied', onRemoteApplied);
      window.removeEventListener('moti-cloud-key-updated', start);
      if (pollHandle) clearInterval(pollHandle);
      CloudAppSyncService.stop();
    };
  }, [userId, reloadAllData]);

  // Cloud backup is user-triggered from Settings; the encrypted Google Drive workflow is unchanged.

  // Compute live financial summary
  const summary = useMemo(() => {
    return StorageService.computeFinancialSummary(userId);
  }, [userId, accounts, trades, weekly, invoices, expenses, savings, profile]);

  // Save Handlers
  const handleSaveTrades = (updatedTrades: StockTrade[]) => {
    setTrades(updatedTrades);
    StorageService.saveStockTrades(updatedTrades, userId);
    CloudAppSyncService.schedule(userId);
  };

  const handleSaveWeekly = (updatedWeekly: WeeklyIncomeRecord[]) => {
    setWeekly(updatedWeekly);
    StorageService.saveWeeklyIncome(updatedWeekly, userId);
    CloudAppSyncService.schedule(userId);
  };

  const handleSaveDaily = (updatedDaily: DailyEarningsRecord[]) => {
    setDaily(updatedDaily);
    StorageService.saveDailyEarnings(updatedDaily, userId);
    CloudAppSyncService.schedule(userId);
  };

  const handleSaveInvoices = (updatedInvoices: BusinessInvoice[]) => {
    setInvoices(updatedInvoices);
    StorageService.saveInvoices(updatedInvoices, userId);
    CloudAppSyncService.schedule(userId);
  };

  const handleSaveExpenses = (updatedExpenses: ExpenseRecord[]) => {
    setExpenses(updatedExpenses);
    StorageService.saveExpenses(updatedExpenses, userId);
    CloudAppSyncService.schedule(userId);
  };

  const handleSaveBudgets = (updatedBudgets: BudgetLimit[]) => {
    setBudgets(updatedBudgets);
    StorageService.saveBudgets(updatedBudgets, userId);
    CloudAppSyncService.schedule(userId);
  };

  const handleSaveAccounts = (updatedAccounts: AccountRecord[]) => {
    setAccounts(updatedAccounts);
    StorageService.saveAccounts(updatedAccounts, userId);
    CloudAppSyncService.schedule(userId);
  };

  const handleSaveSavings = (updatedSavings: SavingsGoal[]) => {
    setSavings(updatedSavings);
    StorageService.saveSavingsGoals(updatedSavings, userId);
    CloudAppSyncService.schedule(userId);
  };

  const handleUpdateProfile = (updatedProfile: UserProfile) => {
    setProfile(updatedProfile);
    StorageService.saveProfile(updatedProfile);
    CloudAppSyncService.schedule(userId);
  };

  const handleMarkNotificationRead = (notifId: string) => {
    const updated = notifications.map((n) => (n.id === notifId ? { ...n, read: true } : n));
    setNotifications(updated);
    StorageService.saveNotifications(updated, userId);
    CloudAppSyncService.schedule(userId);
  };

  // Quick Add Action Dispatchers
  const handleQuickAddTrade = (tradeData: Omit<StockTrade, 'id' | 'serialNumber'>) => {
    const newTrade: StockTrade = {
      ...tradeData,
      id: `trade_${Date.now()}`,
      serialNumber: trades.length + 1,
    };
    handleSaveTrades([...trades, newTrade]);
  };

  const handleQuickAddExpense = (expData: Omit<ExpenseRecord, 'id'>) => {
    const newExp: ExpenseRecord = {
      ...expData,
      id: `exp_${Date.now()}`,
    };
    handleSaveExpenses([newExp, ...expenses]);

    // Also deduct from payment account balance if matching account exists
    const updatedAccs = accounts.map((acc) => {
      if (acc.type === expData.paymentMethod || (expData.paymentMethod === 'UPI' && acc.type === 'UPI')) {
        return { ...acc, balance: Math.max(0, acc.balance - expData.amount) };
      }
      return acc;
    });
    handleSaveAccounts(updatedAccs);
  };

  const handleQuickAddDaily = (dailyData: Omit<DailyEarningsRecord, 'id'>) => {
    const newRec: DailyEarningsRecord = {
      ...dailyData,
      id: `daily_${Date.now()}`,
    };
    handleSaveDaily([newRec, ...daily]);
  };

  const handleQuickAddInvoice = (invData: Omit<BusinessInvoice, 'id' | 'pendingAmount'>) => {
    const newInv: BusinessInvoice = {
      ...invData,
      id: `inv_${Date.now()}`,
      pendingAmount: Math.max(0, invData.totalAmount - invData.amountReceived),
    };
    handleSaveInvoices([newInv, ...invoices]);
  };

  const handleQuickTransfer = (fromAccId: string, toAccId: string, amount: number, _note: string) => {
    const fromAcc = accounts.find((a) => a.id === fromAccId);
    if (!fromAcc || fromAcc.balance < amount) {
      alert('Insufficient funds in source account!');
      return;
    }
    const updated = accounts.map((a) => {
      if (a.id === fromAccId) return { ...a, balance: a.balance - amount };
      if (a.id === toAccId) return { ...a, balance: a.balance + amount };
      return a;
    });
    handleSaveAccounts(updated);
  };

  return (
    <div className="min-h-screen bg-[#070d18] text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* PIN Security Gate if locked */}
      {isLocked && profile.pinCode && (
        <PinLockModal
          correctPin={profile.pinCode}
          onUnlock={() => {
            lastActivityAt.current = Date.now();
            localStorage.setItem(activityStorageKey, String(lastActivityAt.current));
            setIsLocked(false);
          }}
          userName={profile.name}
        />
      )}

      {/* Primary Header */}
      <Navbar
        currentTab={currentTab}
        profile={profile}
        summary={summary}
        notifications={notifications}
        onOpenAi={() => setCurrentTab('aiAssistant')}
        onOpenQuickAdd={() => setIsQuickAddOpen(true)}
        onOpenSettings={() => setCurrentTab('settings')}
        onSelectTab={setCurrentTab}
        onMarkNotificationRead={handleMarkNotificationRead}
        onLockApp={() => setIsLocked(true)}
        installPrompt={deferredPrompt}
        onInstallApp={handleInstallApp}
      />

      {/* Main Body Layout */}
      <div className="flex flex-1 w-full mx-auto max-w-[1600px]">
        {/* Dynamic Main Workspace Content */}
        <main className="flex-1 p-3 sm:p-6 lg:px-8 overflow-x-hidden min-w-0">
          {currentTab === 'dashboard' && (
            <DashboardView
              profile={profile}
              summary={summary}
              trades={trades}
              weekly={weekly}
              onSelectTab={setCurrentTab}
            />
          )}

          {currentTab === 'swingScanner' && <SwingScannerView />}
          {currentTab === 'niftyOptions' && <NiftyOptionsScannerView />}
          {currentTab === 'smartMoney' && <SmartMoneyScreenerView />}

          {currentTab === 'stockTrading' && (
            <StockTradingView
              trades={trades}
              profile={profile}
              onSaveTrades={handleSaveTrades}
            />
          )}

          {currentTab === 'weeklyIncome' && (
            <WeeklyIncomeView
              records={weekly}
              trades={trades}
              profile={profile}
              onSaveRecords={handleSaveWeekly}
              onSelectTab={setCurrentTab}
            />
          )}

















          {currentTab === 'settings' && (
            <SettingsView
              profile={profile}
              onUpdateProfile={handleUpdateProfile}
              onRefreshData={reloadAllData}
            />
          )}
        </main>
      </div>

      {/* Mobile-First Bottom Navigation */}
      <MobileBottomNav currentTab={currentTab} onSelectTab={setCurrentTab} />

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        accounts={accounts}
        onAddTrade={handleQuickAddTrade}
        onAddExpense={handleQuickAddExpense}
        onAddDaily={handleQuickAddDaily}
        onAddInvoice={handleQuickAddInvoice}
        onTransfer={handleQuickTransfer}
      />
    </div>
  );
}


export default function App() {
  return (
    <AppwriteLoginGate>
      <AuthenticatedApp />
    </AppwriteLoginGate>
  );
}
