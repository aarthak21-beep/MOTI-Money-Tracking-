import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
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

import { StorageService } from './services/storageService';
import { CloudSyncService } from './services/cloudSyncService';
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

export default function App() {
  const [userId] = useState('usr_default');
  const [demoReset] = useState(() => StorageService.clearDemoDataOnce(userId));
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

  // Navigation State
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // Security Lock State
  const [isLocked, setIsLocked] = useState<boolean>(() => Boolean(profile.pinEnabled && profile.pinCode));

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
  }, [userId]);

  // On first launch of the equity-only workspace, replace any old demo cloud snapshot with a clean backup.
  // On later launches, restore the user's own latest cloud snapshot as usual.
  useEffect(() => {
    if (!CloudSyncService.getUrl()) return;
    const cloudResetPending = localStorage.getItem('moti_equity_cloud_reset_pending') === '1';
    if (demoReset || cloudResetPending) {
      const cleanData = JSON.parse(StorageService.exportCompleteBackup(userId));
      void CloudSyncService.save({ exportedAt: new Date().toISOString(), data: cleanData })
        .then(() => localStorage.removeItem('moti_equity_cloud_reset_pending'))
        .catch((error) => console.warn('MOTI clean cloud snapshot:', error));
      return;
    }
    let active = true;
    CloudSyncService.load().then((snapshot) => {
      if (active && snapshot?.data) {
        StorageService.importCompleteBackup(JSON.stringify(snapshot.data), userId);
        reloadAllData();
      }
    }).catch((error) => console.warn('MOTI cloud restore:', error));
    return () => { active = false; };
  }, [userId, reloadAllData, demoReset]);

  const syncCloudSnapshot = () => {
    if (!CloudSyncService.getUrl()) return;
    const data = JSON.parse(StorageService.exportCompleteBackup(userId));
    void CloudSyncService.save({ exportedAt: new Date().toISOString(), data })
      .catch((error) => console.warn('MOTI cloud sync:', error));
  };

  // Compute live financial summary
  const summary = useMemo(() => {
    return StorageService.computeFinancialSummary(userId);
  }, [userId, accounts, trades, weekly, invoices, expenses, savings, profile]);

  // Save Handlers
  const handleSaveTrades = (updatedTrades: StockTrade[]) => {
    setTrades(updatedTrades);
    StorageService.saveStockTrades(updatedTrades, userId);
    syncCloudSnapshot();
  };

  const handleSaveWeekly = (updatedWeekly: WeeklyIncomeRecord[]) => {
    setWeekly(updatedWeekly);
    StorageService.saveWeeklyIncome(updatedWeekly, userId);
    syncCloudSnapshot();
  };

  const handleSaveDaily = (updatedDaily: DailyEarningsRecord[]) => {
    setDaily(updatedDaily);
    StorageService.saveDailyEarnings(updatedDaily, userId);
    syncCloudSnapshot();
  };

  const handleSaveInvoices = (updatedInvoices: BusinessInvoice[]) => {
    setInvoices(updatedInvoices);
    StorageService.saveInvoices(updatedInvoices, userId);
    syncCloudSnapshot();
  };

  const handleSaveExpenses = (updatedExpenses: ExpenseRecord[]) => {
    setExpenses(updatedExpenses);
    StorageService.saveExpenses(updatedExpenses, userId);
    syncCloudSnapshot();
  };

  const handleSaveBudgets = (updatedBudgets: BudgetLimit[]) => {
    setBudgets(updatedBudgets);
    StorageService.saveBudgets(updatedBudgets, userId);
    syncCloudSnapshot();
  };

  const handleSaveAccounts = (updatedAccounts: AccountRecord[]) => {
    setAccounts(updatedAccounts);
    StorageService.saveAccounts(updatedAccounts, userId);
    syncCloudSnapshot();
  };

  const handleSaveSavings = (updatedSavings: SavingsGoal[]) => {
    setSavings(updatedSavings);
    StorageService.saveSavingsGoals(updatedSavings, userId);
    syncCloudSnapshot();
  };

  const handleUpdateProfile = (updatedProfile: UserProfile) => {
    setProfile(updatedProfile);
    StorageService.saveProfile(updatedProfile);
    syncCloudSnapshot();
  };

  const handleMarkNotificationRead = (notifId: string) => {
    const updated = notifications.map((n) => (n.id === notifId ? { ...n, read: true } : n));
    setNotifications(updated);
    StorageService.saveNotifications(updated, userId);
    syncCloudSnapshot();
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
          onUnlock={() => setIsLocked(false)}
          userName={profile.name}
        />
      )}

      {/* Primary Header */}
      <Navbar
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
      <div className="flex flex-1 max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar Navigation */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          profile={profile}
        />

        {/* Dynamic Main Workspace Content */}
        <main className="flex-1 p-3 sm:p-6 overflow-x-hidden min-w-0">
          {currentTab === 'dashboard' && (
            <DashboardView
              profile={profile}
              summary={summary}
              trades={trades}
              weekly={weekly}
              onSelectTab={setCurrentTab}
            />
          )}

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
