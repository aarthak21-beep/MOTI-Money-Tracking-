import {
  UserProfile,
  StockTrade,
  WeeklyIncomeRecord,
  DailyEarningsRecord,
  BusinessInvoice,
  ExpenseRecord,
  BudgetLimit,
  AccountRecord,
  AccountTransaction,
  SavingsGoal,
  AppNotification,
  FinancialContextSummary
} from '../types';

const STORAGE_KEY_PREFIX = 'moti_finance_v1_';

export const DEFAULT_PROFILE: UserProfile = {
  id: 'usr_default',
  name: 'Arjun Mehta',
  email: 'arjun.mehta@moti.finance',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  profession: 'Stock Trader',
  currency: 'INR',
  currencySymbol: '₹',
  dateFormat: 'DD-MM-YYYY',
  pinEnabled: false,
  theme: 'dark',
  enabledModules: {
    dashboard: true,
    stockTrading: true,
    weeklyIncome: true,
    dailyEarnings: true,
    business: true,
    expenses: true,
    cashflow: true,
    savings: true,
    calculators: true,
    reports: true,
    aiAssistant: true,
  },
  createdAt: new Date().toISOString()
};

export const DEFAULT_ACCOUNTS: AccountRecord[] = [];

export const DEFAULT_BUDGETS: BudgetLimit[] = [];

export class StorageService {
  // One-time clean slate for the demo workspace. Keep the user's profile and sync URL.
  static clearDemoDataOnce(userId = 'usr_default'): boolean {
    const resetKey = `moti_equity_workspace_reset_v1_${userId}`;
    if (localStorage.getItem(resetKey) === 'done') return false;
    ['accounts', 'stock_trades', 'weekly_income', 'daily_earnings', 'invoices',
      'expenses', 'budgets', 'savings_goals', 'notifications', 'account_transactions']
      .forEach((key) => localStorage.removeItem(this.getKey(key, userId)));
    localStorage.setItem(resetKey, 'done');
    // If cloud sync is configured now or later, replace the old demo snapshot before restoring it.
    localStorage.setItem('moti_equity_cloud_reset_pending', '1');
    return true;
  }

  private static getKey(key: string, userId = 'usr_default'): string {
    return `${STORAGE_KEY_PREFIX}${userId}_${key}`;
  }

  // Profile & User
  static getProfile(userId = 'usr_default'): UserProfile {
    try {
      const data = localStorage.getItem(this.getKey('profile', userId));
      return data ? JSON.parse(data) : DEFAULT_PROFILE;
    } catch {
      return DEFAULT_PROFILE;
    }
  }

  static saveProfile(profile: UserProfile): void {
    localStorage.setItem(this.getKey('profile', profile.id), JSON.stringify(profile));
  }

  // Accounts
  static getAccounts(userId = 'usr_default'): AccountRecord[] {
    try {
      const data = localStorage.getItem(this.getKey('accounts', userId));
      return data ? JSON.parse(data) : DEFAULT_ACCOUNTS;
    } catch {
      return DEFAULT_ACCOUNTS;
    }
  }

  static saveAccounts(accounts: AccountRecord[], userId = 'usr_default'): void {
    localStorage.setItem(this.getKey('accounts', userId), JSON.stringify(accounts));
  }

  // Stock Trades
  static getStockTrades(userId = 'usr_default'): StockTrade[] {
    try {
      const data = localStorage.getItem(this.getKey('stock_trades', userId));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static saveStockTrades(trades: StockTrade[], userId = 'usr_default'): void {
    localStorage.setItem(this.getKey('stock_trades', userId), JSON.stringify(trades));
  }

  // Weekly Income
  static getWeeklyIncome(userId = 'usr_default'): WeeklyIncomeRecord[] {
    try {
      const data = localStorage.getItem(this.getKey('weekly_income', userId));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static saveWeeklyIncome(records: WeeklyIncomeRecord[], userId = 'usr_default'): void {
    localStorage.setItem(this.getKey('weekly_income', userId), JSON.stringify(records));
  }

  // Daily Earnings
  static getDailyEarnings(userId = 'usr_default'): DailyEarningsRecord[] {
    try {
      const data = localStorage.getItem(this.getKey('daily_earnings', userId));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static saveDailyEarnings(records: DailyEarningsRecord[], userId = 'usr_default'): void {
    localStorage.setItem(this.getKey('daily_earnings', userId), JSON.stringify(records));
  }

  // Business Invoices
  static getInvoices(userId = 'usr_default'): BusinessInvoice[] {
    try {
      const data = localStorage.getItem(this.getKey('invoices', userId));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static saveInvoices(invoices: BusinessInvoice[], userId = 'usr_default'): void {
    localStorage.setItem(this.getKey('invoices', userId), JSON.stringify(invoices));
  }

  // Expenses
  static getExpenses(userId = 'usr_default'): ExpenseRecord[] {
    try {
      const data = localStorage.getItem(this.getKey('expenses', userId));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static saveExpenses(expenses: ExpenseRecord[], userId = 'usr_default'): void {
    localStorage.setItem(this.getKey('expenses', userId), JSON.stringify(expenses));
  }

  // Budget Limits
  static getBudgets(userId = 'usr_default'): BudgetLimit[] {
    try {
      const data = localStorage.getItem(this.getKey('budgets', userId));
      return data ? JSON.parse(data) : DEFAULT_BUDGETS;
    } catch {
      return DEFAULT_BUDGETS;
    }
  }

  static saveBudgets(budgets: BudgetLimit[], userId = 'usr_default'): void {
    localStorage.setItem(this.getKey('budgets', userId), JSON.stringify(budgets));
  }

  // Savings Goals
  static getSavingsGoals(userId = 'usr_default'): SavingsGoal[] {
    try {
      const data = localStorage.getItem(this.getKey('savings_goals', userId));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static saveSavingsGoals(goals: SavingsGoal[], userId = 'usr_default'): void {
    localStorage.setItem(this.getKey('savings_goals', userId), JSON.stringify(goals));
  }

  // Notifications
  static getNotifications(userId = 'usr_default'): AppNotification[] {
    try {
      const data = localStorage.getItem(this.getKey('notifications', userId));
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static saveNotifications(notifications: AppNotification[], userId = 'usr_default'): void {
    localStorage.setItem(this.getKey('notifications', userId), JSON.stringify(notifications));
  }

  // Seed Realistic Sample Data
  static seedDemoData(userId = 'usr_default'): void {
    const today = new Date();
    const formatDate = (d: Date) => {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const pastDate = (daysAgo: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      return formatDate(d);
    };

    // Realistic Stock Trades
    const sampleTrades: StockTrade[] = [
      {
        id: 'st_1',
        serialNumber: 1,
        entryDate: pastDate(25),
        stockName: 'RELIANCE',
        entryPrice: 2850,
        quantity: 50,
        totalInvestment: 142500,
        exitDate: pastDate(18),
        exitPrice: 3020,
        brokerage: 40,
        otherCharges: 110,
        targetEarnings: 10000,
        actualPnl: 8500,
        netPnl: 8350,
        pnlPercentage: 5.86,
        status: 'CLOSED',
        notes: 'Breakout above 2850 resistance level'
      },
      {
        id: 'st_2',
        serialNumber: 2,
        entryDate: pastDate(15),
        stockName: 'TCS',
        entryPrice: 3950,
        quantity: 30,
        totalInvestment: 118500,
        exitDate: pastDate(9),
        exitPrice: 3880,
        brokerage: 40,
        otherCharges: 95,
        targetEarnings: 6000,
        actualPnl: -2100,
        netPnl: -2235,
        pnlPercentage: -1.89,
        status: 'CLOSED',
        notes: 'Stop loss triggered below support'
      },
      {
        id: 'st_3',
        serialNumber: 3,
        entryDate: pastDate(8),
        stockName: 'HDFCBANK',
        entryPrice: 1620,
        quantity: 100,
        totalInvestment: 162000,
        brokerage: 40,
        otherCharges: 120,
        targetEarnings: 12000,
        status: 'OPEN',
        currentMarketPrice: 1685,
        notes: 'Swing trade target ₹1740'
      },
      {
        id: 'st_4',
        serialNumber: 4,
        entryDate: pastDate(3),
        stockName: 'INFY',
        entryPrice: 1780,
        quantity: 40,
        totalInvestment: 71200,
        brokerage: 30,
        otherCharges: 60,
        targetEarnings: 5000,
        status: 'OPEN',
        currentMarketPrice: 1815,
        notes: 'Pre-earnings position'
      }
    ];

    // Weekly Income
    const sampleWeekly: WeeklyIncomeRecord[] = [
      {
        id: 'wi_1',
        serialNumber: 1,
        weekStartDate: pastDate(21),
        weekEndDate: pastDate(15),
        openingBalance: 75000,
        weeklyIncome: 18500,
        salary: 0,
        businessIncome: 12000,
        freelanceIncome: 15000,
        commission: 2500,
        bonus: 0,
        otherIncome: 1000,
        totalIncome: 49000,
        weeklyExpenses: 16500,
        finalAmount: 107500,
        paymentStatus: 'Paid',
        notes: 'Strong freelance week'
      },
      {
        id: 'wi_2',
        serialNumber: 2,
        weekStartDate: pastDate(14),
        weekEndDate: pastDate(8),
        openingBalance: 107500,
        weeklyIncome: 22000,
        salary: 45000,
        businessIncome: 18000,
        freelanceIncome: 8000,
        commission: 3000,
        bonus: 5000,
        otherIncome: 1500,
        totalIncome: 102500,
        weeklyExpenses: 28000,
        finalAmount: 182000,
        paymentStatus: 'Paid',
        notes: 'Monthly salary credited'
      },
      {
        id: 'wi_3',
        serialNumber: 3,
        weekStartDate: pastDate(7),
        weekEndDate: pastDate(1),
        openingBalance: 182000,
        weeklyIncome: 24000,
        salary: 0,
        businessIncome: 21000,
        freelanceIncome: 14000,
        commission: 1500,
        bonus: 2000,
        otherIncome: 500,
        totalIncome: 63000,
        weeklyExpenses: 19500,
        finalAmount: 225500,
        paymentStatus: 'Paid',
        notes: 'Consistent business client retainers'
      }
    ];

    // Daily Earnings
    const sampleDaily: DailyEarningsRecord[] = [
      {
        id: 'de_1',
        date: pastDate(4),
        incomeSource: 'Operations / Trading Hub',
        shift1: 1800,
        shift2: 2400,
        shift3: 0,
        bonus: 500,
        offers: 200,
        otherEarnings: 300,
        totalDailyIncome: 5200,
        dailyExpenses: 850,
        netDailyIncome: 4350,
        notes: 'Peak day performance'
      },
      {
        id: 'de_2',
        date: pastDate(3),
        incomeSource: 'Logistics & Consulting',
        shift1: 1500,
        shift2: 1900,
        shift3: 0,
        bonus: 300,
        offers: 150,
        otherEarnings: 0,
        totalDailyIncome: 3850,
        dailyExpenses: 620,
        netDailyIncome: 3230,
        notes: 'Steady double shift'
      },
      {
        id: 'de_3',
        date: pastDate(2),
        incomeSource: 'Operations / Trading Hub',
        shift1: 2200,
        shift2: 2600,
        shift3: 800,
        bonus: 1000,
        offers: 400,
        otherEarnings: 500,
        totalDailyIncome: 7500,
        dailyExpenses: 1100,
        netDailyIncome: 6400,
        notes: 'Highest earning day with incentive bonus'
      },
      {
        id: 'de_4',
        date: pastDate(1),
        incomeSource: 'Consulting Retainer',
        shift1: 1600,
        shift2: 2000,
        shift3: 0,
        bonus: 0,
        offers: 100,
        otherEarnings: 200,
        totalDailyIncome: 3900,
        dailyExpenses: 540,
        netDailyIncome: 3360,
        notes: 'Standard weekend shift'
      }
    ];

    // Invoices
    const sampleInvoices: BusinessInvoice[] = [
      {
        id: 'inv_101',
        businessName: 'Apex Capital & Tech',
        clientName: 'Nova FinTech Pvt Ltd',
        projectName: 'Trading Algorithmic Flow',
        invoiceNumber: 'INV-2026-001',
        invoiceDate: pastDate(20),
        paymentDueDate: pastDate(5),
        totalAmount: 65000,
        amountReceived: 65000,
        pendingAmount: 0,
        paymentStatus: 'Paid',
        notes: 'Payment settled via NEFT'
      },
      {
        id: 'inv_102',
        businessName: 'Apex Capital & Tech',
        clientName: 'Vanguard Retail Chain',
        projectName: 'Inventory Operations Automation',
        invoiceNumber: 'INV-2026-002',
        invoiceDate: pastDate(10),
        paymentDueDate: pastDate(-10), // due in 10 days
        totalAmount: 48000,
        amountReceived: 20000,
        pendingAmount: 28000,
        paymentStatus: 'Partially Paid',
        notes: 'Milestone 1 cleared, balance pending delivery'
      },
      {
        id: 'inv_103',
        businessName: 'Apex Capital & Tech',
        clientName: 'Zenith Logistics',
        projectName: 'Weekly Route Optimizer',
        invoiceNumber: 'INV-2026-003',
        invoiceDate: pastDate(4),
        paymentDueDate: pastDate(-15),
        totalAmount: 35000,
        amountReceived: 0,
        pendingAmount: 35000,
        paymentStatus: 'Pending',
        notes: 'Awaiting client accounts approval'
      }
    ];

    // Expenses
    const sampleExpenses: ExpenseRecord[] = [
      { id: 'exp_1', expenseDate: pastDate(14), category: 'Rent', description: 'Office workspace rent', amount: 22000, paymentMethod: 'BANK', notes: 'Monthly rent' },
      { id: 'exp_2', expenseDate: pastDate(10), category: 'Fuel', description: 'Petrol fill up', amount: 3200, paymentMethod: 'UPI', notes: 'Vehicle commute' },
      { id: 'exp_3', expenseDate: pastDate(8), category: 'Food', description: 'Grocery and supplies', amount: 4800, paymentMethod: 'UPI', notes: 'Supermarket' },
      { id: 'exp_4', expenseDate: pastDate(6), category: 'Electricity', description: 'Office & home power bill', amount: 2850, paymentMethod: 'BANK', notes: 'State electricity' },
      { id: 'exp_5', expenseDate: pastDate(4), category: 'Business Expenses', description: 'Trading terminal & market data', amount: 4500, paymentMethod: 'BANK', notes: 'Software subscription' },
      { id: 'exp_6', expenseDate: pastDate(2), category: 'Shopping', description: 'Ergonomic desk accessories', amount: 3100, paymentMethod: 'WALLET', notes: 'Home office improvement' },
      { id: 'exp_7', expenseDate: pastDate(1), category: 'Food', description: 'Business lunch meeting', amount: 1450, paymentMethod: 'CASH', notes: 'Client discussion' }
    ];

    // Savings Goals
    const sampleSavings: SavingsGoal[] = [
      {
        id: 'sg_1',
        name: 'Emergency Reserve Fund (6 Months)',
        targetAmount: 300000,
        targetDate: '31-12-2026',
        savedAmount: 185000,
        category: 'Safety',
        monthlyTarget: 25000,
        notes: 'High-yield liquid bank reserve'
      },
      {
        id: 'sg_2',
        name: 'Algorithmic Trading Capital Buffer',
        targetAmount: 500000,
        targetDate: '30-06-2027',
        savedAmount: 220000,
        category: 'Business Growth',
        monthlyTarget: 35000,
        notes: 'Dedicated margin for equity swing trading'
      },
      {
        id: 'sg_3',
        name: 'Annual Tax & Advance Advance Payment',
        targetAmount: 120000,
        targetDate: '15-03-2027',
        savedAmount: 75000,
        category: 'Taxes',
        monthlyTarget: 10000,
        notes: 'Advance tax provision'
      }
    ];

    // Notifications
    const sampleNotifications: AppNotification[] = [
      {
        id: 'notif_1',
        title: 'Weekly Ledger Updated',
        message: 'Week 3 final amount ₹2,25,500 successfully reconciled and carried forward.',
        type: 'SUCCESS',
        date: pastDate(1),
        read: false,
        linkTab: 'weeklyIncome'
      },
      {
        id: 'notif_2',
        title: 'Pending Invoice Due',
        message: 'Invoice INV-2026-002 for Vanguard Retail (₹28,000) due soon.',
        type: 'WARNING',
        date: pastDate(2),
        read: false,
        linkTab: 'business'
      },
      {
        id: 'notif_3',
        title: 'Stock Trading Profit Target',
        message: 'HDFCBANK is approaching target level (+₹6,500 unrealized gain).',
        type: 'INFO',
        date: pastDate(0),
        read: false,
        linkTab: 'stockTrading'
      }
    ];

    this.saveStockTrades(sampleTrades, userId);
    this.saveWeeklyIncome(sampleWeekly, userId);
    this.saveDailyEarnings(sampleDaily, userId);
    this.saveInvoices(sampleInvoices, userId);
    this.saveExpenses(sampleExpenses, userId);
    this.saveSavingsGoals(sampleSavings, userId);
    this.saveNotifications(sampleNotifications, userId);
    this.saveAccounts(DEFAULT_ACCOUNTS, userId);
    this.saveBudgets(DEFAULT_BUDGETS, userId);
  }

  // Clear all data (for fresh production use)
  static clearAllData(userId = 'usr_default'): void {
    const emptyAccounts: AccountRecord[] = [
      { id: 'acc_cash', name: 'Cash', type: 'CASH', balance: 0, isDefault: true },
      { id: 'acc_bank', name: 'Bank Account', type: 'BANK', balance: 0 },
      { id: 'acc_upi', name: 'UPI', type: 'UPI', balance: 0 },
      { id: 'acc_wallet', name: 'Digital Wallet', type: 'WALLET', balance: 0 }
    ];

    this.saveStockTrades([], userId);
    this.saveWeeklyIncome([], userId);
    this.saveDailyEarnings([], userId);
    this.saveInvoices([], userId);
    this.saveExpenses([], userId);
    this.saveSavingsGoals([], userId);
    this.saveNotifications([], userId);
    this.saveAccounts(emptyAccounts, userId);
  }

  // Backup & Restore
  static exportCompleteBackup(userId = 'usr_default'): string {
    const backupData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      profile: this.getProfile(userId),
      accounts: this.getAccounts(userId),
      budgets: this.getBudgets(userId),
      stockTrades: this.getStockTrades(userId),
      weeklyIncome: this.getWeeklyIncome(userId),
      dailyEarnings: this.getDailyEarnings(userId),
      invoices: this.getInvoices(userId),
      expenses: this.getExpenses(userId),
      savingsGoals: this.getSavingsGoals(userId),
      notifications: this.getNotifications(userId),
    };
    return JSON.stringify(backupData, null, 2);
  }

  static importCompleteBackup(jsonString: string, userId = 'usr_default'): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return false;

      // Validate the complete payload before writing anything, so malformed files
      // cannot partially overwrite the user's existing records.
      const arrayFields = [
        'accounts', 'budgets', 'stockTrades', 'weeklyIncome',
        'dailyEarnings', 'invoices', 'expenses', 'savingsGoals', 'notifications',
      ] as const;
      const hasKnownData = Boolean(data.profile && typeof data.profile === 'object')
        || arrayFields.some((field) => Object.prototype.hasOwnProperty.call(data, field));
      if (!hasKnownData) return false;
      if (data.profile !== undefined && (!data.profile || typeof data.profile !== 'object' || Array.isArray(data.profile))) return false;
      if (arrayFields.some((field) => data[field] !== undefined && !Array.isArray(data[field]))) return false;

      if (data.profile) this.saveProfile({ ...data.profile, id: userId });
      if (Array.isArray(data.accounts)) this.saveAccounts(data.accounts, userId);
      if (Array.isArray(data.budgets)) this.saveBudgets(data.budgets, userId);
      if (Array.isArray(data.stockTrades)) this.saveStockTrades(data.stockTrades, userId);
      if (Array.isArray(data.weeklyIncome)) this.saveWeeklyIncome(data.weeklyIncome, userId);
      if (Array.isArray(data.dailyEarnings)) this.saveDailyEarnings(data.dailyEarnings, userId);
      if (Array.isArray(data.invoices)) this.saveInvoices(data.invoices, userId);
      if (Array.isArray(data.expenses)) this.saveExpenses(data.expenses, userId);
      if (Array.isArray(data.savingsGoals)) this.saveSavingsGoals(data.savingsGoals, userId);
      if (Array.isArray(data.notifications)) this.saveNotifications(data.notifications, userId);

      return true;
    } catch (e) {
      console.error('Import failed', e);
      return false;
    }
  }

  // Financial summary computation
  static computeFinancialSummary(userId = 'usr_default'): FinancialContextSummary {
    const profile = this.getProfile(userId);
    const accounts = this.getAccounts(userId);
    const trades = this.getStockTrades(userId);
    const weekly = this.getWeeklyIncome(userId);
    const invoices = this.getInvoices(userId);
    const expenses = this.getExpenses(userId);
    const savings = this.getSavingsGoals(userId);

    const accountBalance = accounts.reduce((acc, a) => acc + (Number(a.balance) || 0), 0);

    // Weekly Capital Growth is the user's rolling trading-capital plan.
    // Carry forward each week's addition and target growth so it contributes
    // to Available even when there are no open stock positions.
    let weeklyCapital = 0;
    for (const record of weekly) {
      const base = weeklyCapital === 0
        ? (Number(record.openingBalance) || 0)
        : weeklyCapital;
      const extra = Number(record.weeklyIncome) || 0;
      const rate = Math.max(0, Number(record.customFields?.targetRate ?? 3) || 0);
      weeklyCapital = base + extra + ((base + extra) * rate / 100);
    }

    // Stock metrics
    let totalStockInvestment = 0; // open trades investment
    let totalStockProfit = 0;
    let totalStockLoss = 0;
    let stockRealizedPnl = 0;
    let stockUnrealizedPnl = 0;
    let activeTradeCount = 0;
    let closedTradeCount = 0;

    for (const trade of trades) {
      if (trade.status === 'OPEN') {
        activeTradeCount++;
        totalStockInvestment += (Number(trade.totalInvestment) || 0);
        if (trade.currentMarketPrice && trade.currentMarketPrice > 0) {
          const unrealizedGross = (trade.currentMarketPrice - trade.entryPrice) * trade.quantity;
          const unrealizedNet = unrealizedGross - (trade.brokerage || 0) - (trade.otherCharges || 0);
          stockUnrealizedPnl += unrealizedNet;
        }
      } else if (trade.status === 'CLOSED') {
        closedTradeCount++;
        const net = Number(trade.netPnl) || 0;
        stockRealizedPnl += net;
        if (net > 0) {
          totalStockProfit += net;
        } else {
          totalStockLoss += Math.abs(net);
        }
      }
    }

    const totalWeeklyIncome = weekly.reduce((acc, w) => acc + (Number(w.totalIncome) || 0), 0);
    // Rough monthly approximation or sum of last 4 weeks
    const totalMonthlyIncome = weekly.slice(-4).reduce((acc, w) => acc + (Number(w.totalIncome) || 0), 0);

    const totalBusinessRevenue = invoices.reduce((acc, inv) => acc + (Number(inv.amountReceived) || 0), 0);
    const pendingPayments = invoices.reduce((acc, inv) => acc + (Number(inv.pendingAmount) || 0), 0);

    const totalExpenses = expenses.reduce((acc, exp) => acc + (Number(exp.amount) || 0), 0);
    const totalSavings = savings.reduce((acc, s) => acc + (Number(s.savedAmount) || 0), 0);

    // Available cash = account cash + carried-forward weekly capital + realized
    // trading P&L, less capital currently committed to open delivery positions.
    const totalBalance = accountBalance + weeklyCapital + stockRealizedPnl - totalStockInvestment;

    // Net worth includes the capital deployed in open positions and unrealized P&L.
    const netWorth = totalBalance + totalStockInvestment + stockUnrealizedPnl + totalSavings;

    return {
      totalBalance,
      netWorth,
      totalStockInvestment,
      totalStockProfit,
      totalStockLoss,
      stockRealizedPnl,
      stockUnrealizedPnl,
      totalWeeklyIncome,
      totalMonthlyIncome,
      totalBusinessRevenue,
      totalExpenses,
      totalSavings,
      pendingPayments,
      activeTradeCount,
      closedTradeCount,
      userProfession: profile.profession,
      currencySymbol: profile.currencySymbol || '₹',
    };
  }
}
