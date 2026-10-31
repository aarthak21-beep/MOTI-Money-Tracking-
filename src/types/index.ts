export type Profession =
  | 'Stock Trader'
  | 'Delivery Partner'
  | 'Employee'
  | 'Freelancer'
  | 'Business Owner'
  | 'Shop Owner'
  | 'Self Employed'
  | 'Investor'
  | 'Other';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  profession: Profession;
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  pinCode?: string;
  pinEnabled: boolean;
  theme: 'dark' | 'light';
  enabledModules: {
    dashboard: boolean;
    stockTrading: boolean;
    weeklyIncome: boolean;
    dailyEarnings: boolean;
    business: boolean;
    expenses: boolean;
    cashflow: boolean;
    savings: boolean;
    calculators: boolean;
    reports: boolean;
    aiAssistant: boolean;
  };
  createdAt: string;
}

export interface StockTrade {
  id: string;
  serialNumber: number;
  entryDate: string; // DD-MM-YYYY
  stockName: string;
  entryPrice: number;
  quantity: number;
  totalInvestment: number; // entryPrice * quantity
  exitDate?: string;
  exitPrice?: number;
  brokerage: number;
  otherCharges: number;
  targetEarnings?: number;
  actualPnl?: number; // Gross P&L: (exitPrice - entryPrice) * quantity
  netPnl?: number; // actualPnl - brokerage - otherCharges
  pnlPercentage?: number; // (netPnl / totalInvestment) * 100
  status: 'OPEN' | 'CLOSED';
  currentMarketPrice?: number; // for open position unrealized P&L
  notes?: string;
  entryReason?: string;
  exitNotes?: string;
  screenshots?: Array<{ name: string; dataUrl: string }>;
}

export interface WeeklyIncomeRecord {
  id: string;
  serialNumber: number;
  weekStartDate: string; // DD-MM-YYYY
  weekEndDate: string; // DD-MM-YYYY
  openingBalance: number;
  weeklyIncome: number;
  salary: number;
  businessIncome: number;
  freelanceIncome: number;
  commission: number;
  bonus: number;
  otherIncome: number;
  customFields?: Record<string, number>;
  totalIncome: number; // sum of all incomes
  weeklyExpenses: number;
  finalAmount: number; // openingBalance + totalIncome - weeklyExpenses
  paymentStatus: 'Paid' | 'Partially Paid' | 'Pending';
  notes?: string;
}

export interface DailyEarningsRecord {
  id: string;
  date: string; // DD-MM-YYYY
  incomeSource: string; // e.g. Zomato, Uber, Store, Freelance
  shift1: number;
  shift2: number;
  shift3: number;
  bonus: number;
  offers: number;
  otherEarnings: number;
  totalDailyIncome: number; // shift1 + shift2 + shift3 + bonus + offers + other
  dailyExpenses: number;
  netDailyIncome: number; // totalDailyIncome - dailyExpenses
  notes?: string;
}

export type InvoiceStatus = 'Paid' | 'Partially Paid' | 'Pending' | 'Overdue';

export interface BusinessInvoice {
  id: string;
  businessName: string;
  clientName: string;
  projectName: string;
  invoiceNumber: string;
  invoiceDate: string; // DD-MM-YYYY
  paymentDueDate: string; // DD-MM-YYYY
  totalAmount: number;
  amountReceived: number;
  pendingAmount: number; // totalAmount - amountReceived
  paymentStatus: InvoiceStatus;
  items?: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
  notes?: string;
}

export type ExpenseCategory =
  | 'Food'
  | 'Fuel'
  | 'Rent'
  | 'Electricity'
  | 'Mobile Recharge'
  | 'Travel'
  | 'Vehicle Maintenance'
  | 'Shopping'
  | 'Business Expenses'
  | 'Personal Expenses'
  | 'Medical'
  | 'Other'
  | string;

export type PaymentMethod = 'CASH' | 'BANK' | 'UPI' | 'WALLET';

export interface ExpenseRecord {
  id: string;
  expenseDate: string; // DD-MM-YYYY
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  accountId?: string;
  notes?: string;
}

export interface BudgetLimit {
  category: ExpenseCategory;
  monthlyLimit: number;
}

export type AccountType = 'CASH' | 'BANK' | 'UPI' | 'WALLET';

export interface AccountRecord {
  id: string;
  name: string;
  type: AccountType;
  accountNumber?: string;
  balance: number;
  isDefault?: boolean;
}

export interface AccountTransaction {
  id: string;
  date: string; // DD-MM-YYYY
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
  accountId: string;
  targetAccountId?: string; // for transfer
  amount: number;
  description: string;
  category?: string;
  referenceId?: string; // linked trade, invoice or expense ID
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string; // DD-MM-YYYY
  savedAmount: number;
  category: string;
  notes?: string;
  monthlyTarget?: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
  date: string;
  read: boolean;
  linkTab?: string;
}

export interface FinancialContextSummary {
  totalBalance: number;
  netWorth: number;
  totalStockInvestment: number;
  totalStockProfit: number;
  totalStockLoss: number;
  stockRealizedPnl: number;
  stockUnrealizedPnl: number;
  totalWeeklyIncome: number;
  totalMonthlyIncome: number;
  totalBusinessRevenue: number;
  totalExpenses: number;
  totalSavings: number;
  pendingPayments: number;
  activeTradeCount: number;
  closedTradeCount: number;
  userProfession: string;
  currencySymbol: string;
}
