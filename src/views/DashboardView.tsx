import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Receipt,
  Briefcase,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Clock,
  ChevronRight,
  ShieldCheck,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  UserProfile,
  FinancialContextSummary,
  StockTrade,
  ExpenseRecord,
  AccountRecord,
  WeeklyIncomeRecord
} from '../types';
import { formatINR } from '../utils/exportUtils';

interface DashboardViewProps {
  profile: UserProfile;
  summary: FinancialContextSummary;
  trades: StockTrade[];
  expenses: ExpenseRecord[];
  accounts: AccountRecord[];
  weekly: WeeklyIncomeRecord[];
  onSelectTab: (tab: string) => void;
  onOpenQuickAdd: () => void;
  onOpenAi: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  profile,
  summary,
  trades,
  expenses,
  accounts,
  weekly,
  onSelectTab,
  onOpenQuickAdd,
  onOpenAi,
}) => {
  const [timeFilter, setTimeFilter] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [showValues, setShowValues] = useState(true);

  // Profit vs Loss metric
  const netStockPnl = summary.stockRealizedPnl;
  const isNetProfit = netStockPnl >= 0;

  // Recent 4 trades
  const recentTrades = [...trades].reverse().slice(0, 4);
  // Recent 4 expenses
  const recentExpenses = [...expenses].reverse().slice(0, 4);

  // Simple clean SVG Chart helpers
  // Income vs Expense chart data from last 4 weekly records or synthetic based on actual totals
  const chartWeeks = weekly.slice(-5).map((w, i) => ({
    label: `Wk ${w.serialNumber || i + 1}`,
    income: w.totalIncome,
    expense: w.weeklyExpenses,
  }));

  const maxChartVal = Math.max(
    ...chartWeeks.map((w) => Math.max(w.income, w.expense)),
    50000
  );

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      {/* Top Welcome & Mode Bar */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              FINANCIAL INTELLIGENCE
            </h1>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/30">
              LIVE
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Welcome back, <span className="text-white font-semibold">{profile.name}</span> • Tailored for{' '}
            <span className="text-amber-400 font-semibold">{profile.profession}</span>
          </p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {/* Privacy Toggle */}
          <button
            onClick={() => setShowValues(!showValues)}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
            title="Toggle Privacy Mode"
          >
            {showValues ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden md:inline">{showValues ? 'Mask' : 'Reveal'}</span>
          </button>

          {/* Time Filter Tabs */}
          <div className="flex rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-1">
            {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setTimeFilter(mode)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize transition-all cursor-pointer ${
                  timeFilter === mode
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* MOTI AI Instant Audit */}
          <button
            onClick={onOpenAi}
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500 transition-all cursor-pointer"
          >
            <Sparkles className="h-4 w-4 animate-spin-slow" />
            <span className="hidden sm:inline">AI Analysis</span>
          </button>
        </div>
      </div>

      {/* Primary Financial Overview: 11 Core Pillars */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {/* Net Worth */}
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-[#0e172a] via-[#101b33] to-[#0a101f] p-4 shadow-xl shadow-amber-500/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 h-24 w-24 bg-amber-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between text-xs text-amber-400 font-semibold uppercase tracking-wider">
            <span>Total Net Worth</span>
            <ShieldCheck className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white sm:text-3xl">
            {profile.currencySymbol}
            {showValues ? formatINR(summary.netWorth) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Accounts + Open Stocks + Savings
          </p>
        </div>

        {/* Available Balance */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 shadow-lg hover:border-slate-600 transition-colors">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Available Balance</span>
            <Wallet className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-400 sm:text-2xl">
            {profile.currencySymbol}
            {showValues ? formatINR(summary.totalBalance) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Liquid bank & cash holdings</p>
        </div>

        {/* Stock Realized P&L */}
        <div className={`rounded-2xl border p-4 shadow-lg transition-colors ${
          isNetProfit ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-rose-500/30 bg-rose-950/20'
        }`}>
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Stock Realized P&L</span>
            {isNetProfit ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-400" />
            )}
          </div>
          <div className={`mt-2 text-xl font-bold sm:text-2xl ${
            isNetProfit ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {isNetProfit ? '+' : ''}{profile.currencySymbol}
            {showValues ? formatINR(netStockPnl) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {summary.closedTradeCount} closed trades
          </p>
        </div>

        {/* Stock Active Investment */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 shadow-lg hover:border-slate-600 transition-colors">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Open Stock Capital</span>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-amber-300 sm:text-2xl">
            {profile.currencySymbol}
            {showValues ? formatINR(summary.totalStockInvestment) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {summary.activeTradeCount} open positions (Unrealized: {summary.stockUnrealizedPnl >= 0 ? '+' : ''}₹{formatINR(summary.stockUnrealizedPnl)})
          </p>
        </div>

        {/* Weekly Income */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Weekly Income Run</span>
            <Calendar className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-blue-300 sm:text-2xl">
            {profile.currencySymbol}
            {showValues ? formatINR(summary.totalWeeklyIncome) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Aggregated weekly records</p>
        </div>

        {/* Monthly Income */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Monthly Income</span>
            <ArrowUpRight className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-300 sm:text-2xl">
            {profile.currencySymbol}
            {showValues ? formatINR(summary.totalMonthlyIncome) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Last 30-day inflow</p>
        </div>

        {/* Business & Freelance Invoiced Revenue */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Business Inflow</span>
            <Briefcase className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-purple-300 sm:text-2xl">
            {profile.currencySymbol}
            {showValues ? formatINR(summary.totalBusinessRevenue) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Cleared client payments</p>
        </div>

        {/* Pending Client Payments */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Pending Receivables</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-amber-400 sm:text-2xl">
            {profile.currencySymbol}
            {showValues ? formatINR(summary.pendingPayments) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Awaiting customer clearance</p>
        </div>

        {/* Total Expenses */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Total Expenses</span>
            <Receipt className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-rose-400 sm:text-2xl">
            {profile.currencySymbol}
            {showValues ? formatINR(summary.totalExpenses) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Logged outflow across accounts</p>
        </div>

        {/* Total Savings & Reserves */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Total Savings</span>
            <PiggyBank className="h-4 w-4 text-teal-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-teal-300 sm:text-2xl">
            {profile.currencySymbol}
            {showValues ? formatINR(summary.totalSavings) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Emergency & goal vaults</p>
        </div>

        {/* Stock Profit Breakdown */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Realized Win Trades</span>
            <ArrowUpRight className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-400 sm:text-2xl">
            +{profile.currencySymbol}
            {showValues ? formatINR(summary.totalStockProfit) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Total winning exits</p>
        </div>

        {/* Stock Loss Breakdown */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Realized Loss Trades</span>
            <ArrowDownRight className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-rose-400 sm:text-2xl">
            -{profile.currencySymbol}
            {showValues ? formatINR(summary.totalStockLoss) : '••••••'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Total defensive stop exits</p>
        </div>
      </div>

      {/* Visual Analytics & Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Weekly Income vs Expense Bar Chart */}
        <div className="col-span-1 lg:col-span-2 rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
            <div>
              <h3 className="text-base font-bold text-white">Cashflow Velocity: Income vs Expenses</h3>
              <p className="text-xs text-slate-400">Weekly performance reconciliation</p>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              <span className="flex items-center text-emerald-400">
                <span className="mr-1.5 h-3 w-3 rounded-sm bg-emerald-500" /> Total Inflow
              </span>
              <span className="flex items-center text-rose-400">
                <span className="mr-1.5 h-3 w-3 rounded-sm bg-rose-500" /> Total Outflow
              </span>
            </div>
          </div>

          {/* Clean Vector SVG Chart */}
          <div className="mt-6 flex h-52 items-end justify-between gap-4 px-2">
            {chartWeeks.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                No weekly records logged yet. Click Quick Add to create your first week!
              </div>
            ) : (
              chartWeeks.map((week, idx) => {
                const incomeHeight = Math.max(12, Math.min(180, (week.income / maxChartVal) * 180));
                const expenseHeight = Math.max(8, Math.min(180, (week.expense / maxChartVal) * 180));
                return (
                  <div key={idx} className="flex flex-1 flex-col items-center gap-2 group">
                    <div className="flex w-full items-end justify-center gap-1.5 h-44">
                      {/* Income Bar */}
                      <div
                        style={{ height: `${incomeHeight}px` }}
                        className="w-1/3 rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400 transition-all group-hover:brightness-125 relative"
                        title={`Income: ₹${week.income.toLocaleString('en-IN')}`}
                      >
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          ₹{Math.round(week.income / 1000)}k
                        </span>
                      </div>
                      {/* Expense Bar */}
                      <div
                        style={{ height: `${expenseHeight}px` }}
                        className="w-1/3 rounded-t-md bg-gradient-to-t from-rose-600 to-rose-400 transition-all group-hover:brightness-125 relative"
                        title={`Expense: ₹${week.expense.toLocaleString('en-IN')}`}
                      >
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          ₹{Math.round(week.expense / 1000)}k
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400">{week.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Account Vault Balances */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Accounts & Wallets</h3>
                <p className="text-xs text-slate-400">Distribution of liquid capital</p>
              </div>
              <button
                onClick={() => onSelectTab('cashflow')}
                className="text-xs font-semibold text-amber-400 hover:underline"
              >
                Manage
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between rounded-xl border border-[#1e2e4f]/60 bg-[#070d18] p-3 transition-colors hover:border-slate-600"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#131f38] text-amber-400 font-bold text-xs">
                      {acc.type.slice(0, 3)}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{acc.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {acc.accountNumber || `${acc.type} Balance`}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-emerald-400">
                    {profile.currencySymbol}
                    {showValues ? formatINR(acc.balance) : '••••'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1e2e4f] flex justify-between items-center text-xs">
            <span className="text-slate-400">Total Liquid Vault:</span>
            <span className="font-bold text-white">
              {profile.currencySymbol}
              {showValues ? formatINR(summary.totalBalance) : '••••••'}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Activity Dual Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Stock Trades */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-amber-400" />
              <h3 className="text-base font-bold text-white">Recent Stock Trades</h3>
            </div>
            <button
              onClick={() => onSelectTab('stockTrading')}
              className="flex items-center text-xs font-semibold text-amber-400 hover:underline"
            >
              Full Ledger <ChevronRight className="h-3 w-3 ml-0.5" />
            </button>
          </div>

          <div className="mt-4 divide-y divide-[#1e2e4f]/60">
            {recentTrades.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No stock trades entered yet.</p>
            ) : (
              recentTrades.map((t) => (
                <div key={t.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-white text-xs">{t.stockName}</span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                          t.status === 'OPEN'
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                            : 'border-slate-700 bg-slate-800 text-slate-300'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {t.entryDate} • Qty {t.quantity} @ ₹{t.entryPrice}
                    </p>
                  </div>
                  <div className="text-right">
                    {t.status === 'CLOSED' ? (
                      <span
                        className={`text-xs font-bold ${
                          (t.netPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {(t.netPnl || 0) >= 0 ? '+' : ''}₹{formatINR(t.netPnl || 0)}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-amber-300">
                        ₹{formatINR(t.totalInvestment)}
                      </span>
                    )}
                    <p className="text-[10px] text-slate-500">
                      {t.status === 'CLOSED' ? `${t.pnlPercentage?.toFixed(2)}% net` : 'Invested'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Expenses */}
        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
            <div className="flex items-center space-x-2">
              <Receipt className="h-4 w-4 text-rose-400" />
              <h3 className="text-base font-bold text-white">Recent Expenses</h3>
            </div>
            <button
              onClick={() => onSelectTab('expenses')}
              className="flex items-center text-xs font-semibold text-amber-400 hover:underline"
            >
              All Expenses <ChevronRight className="h-3 w-3 ml-0.5" />
            </button>
          </div>

          <div className="mt-4 divide-y divide-[#1e2e4f]/60">
            {recentExpenses.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No expenses recorded yet.</p>
            ) : (
              recentExpenses.map((exp) => (
                <div key={exp.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-white text-xs">{exp.description}</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {exp.expenseDate} • {exp.category} ({exp.paymentMethod})
                    </p>
                  </div>
                  <span className="text-xs font-bold text-rose-400">
                    -{profile.currencySymbol}{formatINR(exp.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
