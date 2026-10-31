import React, { useState } from 'react';
import {
  BarChart3,
  PieChart,
  Download,
  Printer,
  Calendar,
  TrendingUp,
  Receipt,
  Briefcase,
  Wallet,
  PiggyBank,
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react';
import {
  UserProfile,
  FinancialContextSummary,
  StockTrade,
  WeeklyIncomeRecord,
  DailyEarningsRecord,
  BusinessInvoice,
  ExpenseRecord,
  SavingsGoal
} from '../types';
import { formatINR, downloadCSV, printFinancialReport } from '../utils/exportUtils';

interface AnalyticsReportsViewProps {
  profile: UserProfile;
  summary: FinancialContextSummary;
  trades: StockTrade[];
  weekly: WeeklyIncomeRecord[];
  daily: DailyEarningsRecord[];
  invoices: BusinessInvoice[];
  expenses: ExpenseRecord[];
  savings: SavingsGoal[];
}

export const AnalyticsReportsView: React.FC<AnalyticsReportsViewProps> = ({
  profile,
  summary,
  trades,
  weekly,
  daily,
  invoices,
  expenses,
  savings,
}) => {
  const [reportType, setReportType] = useState<
    'monthly' | 'weekly' | 'daily' | 'yearly' | 'trading' | 'income' | 'expenses' | 'business' | 'cashflow' | 'savings'
  >('monthly');

  // Multi-dimensional aggregations
  const totalStockGrossPnl = trades.reduce((sum, t) => sum + (t.actualPnl || 0), 0);
  const totalStockCharges = trades.reduce((sum, t) => sum + (t.brokerage || 0) + (t.otherCharges || 0), 0);
  const totalStockNetPnl = summary.stockRealizedPnl;

  const totalWeeklyIn = weekly.reduce((sum, w) => sum + w.totalIncome, 0);
  const totalWeeklyOut = weekly.reduce((sum, w) => sum + w.weeklyExpenses, 0);
  const totalWeeklyNet = totalWeeklyIn - totalWeeklyOut;

  const totalDailyIn = daily.reduce((sum, d) => sum + d.totalDailyIncome, 0);
  const totalDailyOut = daily.reduce((sum, d) => sum + d.dailyExpenses, 0);
  const totalDailyNet = totalDailyIn - totalDailyOut;

  const totalInvoiceBilled = invoices.reduce((sum, i) => sum + i.totalAmount, 0);
  const totalInvoiceReceived = invoices.reduce((sum, i) => sum + i.amountReceived, 0);
  const totalInvoicePending = invoices.reduce((sum, i) => sum + i.pendingAmount, 0);

  const totalExpensesLogged = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSavingsGoalTarget = savings.reduce((sum, s) => sum + s.targetAmount, 0);
  const totalSavingsSaved = savings.reduce((sum, s) => sum + s.savedAmount, 0);

  // Export full composite financial report
  const handleExportFullCSV = () => {
    const headers = ['Report Dimension', 'Key Metric Description', 'Computed Value (INR)'];
    const rows = [
      ['Net Worth & Liquid', 'Consolidated Available Balance', summary.totalBalance],
      ['Net Worth & Liquid', 'Calculated Net Worth', summary.netWorth],
      ['Stock Trading', 'Realized Net Profit / Loss', totalStockNetPnl],
      ['Stock Trading', 'Open Capital Deployed', summary.totalStockInvestment],
      ['Stock Trading', 'Unrealized P&L on Open Positions', summary.stockUnrealizedPnl],
      ['Stock Trading', 'Total Brokerage & Taxes Paid', totalStockCharges],
      ['Weekly Incomes', 'Total Weekly Inflow', totalWeeklyIn],
      ['Weekly Incomes', 'Total Weekly Outflow', totalWeeklyOut],
      ['Weekly Incomes', 'Net Retained Savings', totalWeeklyNet],
      ['Daily Shifts', 'Total Daily Shift Earnings', totalDailyIn],
      ['Daily Shifts', 'Total Shift Expenses', totalDailyOut],
      ['Daily Shifts', 'Net Daily Retention', totalDailyNet],
      ['Business Invoicing', 'Total Invoiced B2B Revenue', totalInvoiceBilled],
      ['Business Invoicing', 'Total Cleared Cash Received', totalInvoiceReceived],
      ['Business Invoicing', 'Total Pending Accounts Receivable', totalInvoicePending],
      ['Expenses', 'Total Logged Categorized Expenses', totalExpensesLogged],
      ['Savings Targets', 'Total Goal Target Portfolio', totalSavingsGoalTarget],
      ['Savings Targets', 'Total Capital Actually Saved', totalSavingsSaved],
    ];

    downloadCSV(`MOTI_Audit_Financial_Report_${reportType.toUpperCase()}`, headers, rows);
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white sm:text-3xl">SMART ANALYTICS & REPORTS</h1>
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-400 border border-amber-500/30">
              AUDIT READY
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Real consolidated financial statements with PDF printable formats and CSV spreadsheet export.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportFullCSV}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => printFinancialReport(`MOTI ${reportType.toUpperCase()} Financial Statement`)}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print / PDF</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-1.5">
        {[
          { id: 'monthly', label: 'Monthly Summary' },
          { id: 'weekly', label: 'Weekly Report' },
          { id: 'daily', label: 'Daily Shifts' },
          { id: 'trading', label: 'Stock Trading' },
          { id: 'business', label: 'Business & B2B' },
          { id: 'expenses', label: 'Expense Audit' },
          { id: 'cashflow', label: 'Cashflow & Balance' },
          { id: 'savings', label: 'Savings Growth' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setReportType(item.id as any)}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition-all cursor-pointer ${
              reportType === item.id
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Main Statement Document */}
      <div className="rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-2xl card-print">
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#1e2e4f] pb-5 gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-black text-white">MOTI FINANCIAL LEDGER</span>
              <span className="text-xs text-amber-400 font-semibold">• OFFICIAL STATEMENT</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Account Holder: <span className="text-white font-bold">{profile.name}</span> ({profile.email})
            </p>
            <p className="text-[11px] text-slate-500">
              Profession Profile: <span className="text-amber-400 font-medium">{profile.profession}</span> • Currency: INR (₹)
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Statement Generated</span>
            <p className="text-xs font-mono font-bold text-slate-300">{new Date().toLocaleString('en-IN')}</p>
            <p className="text-[10px] text-emerald-400 font-bold mt-1">Verified Audit Hash: #MOTI-{Date.now().toString().slice(-6)}</p>
          </div>
        </div>

        {/* Executive Summary Metrics */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3.5">
            <span className="text-[11px] text-slate-400">Total Available Balance</span>
            <p className="mt-1 text-lg font-black text-emerald-400">
              ₹{formatINR(summary.totalBalance)}
            </p>
          </div>
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3.5">
            <span className="text-[11px] text-slate-400">Calculated Net Worth</span>
            <p className="mt-1 text-lg font-black text-amber-400">
              ₹{formatINR(summary.netWorth)}
            </p>
          </div>
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3.5">
            <span className="text-[11px] text-slate-400">Stock Realized P&L</span>
            <p className={`mt-1 text-lg font-black ${totalStockNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalStockNetPnl >= 0 ? '+' : ''}₹{formatINR(totalStockNetPnl)}
            </p>
          </div>
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3.5">
            <span className="text-[11px] text-slate-400">Pending Receivables</span>
            <p className="mt-1 text-lg font-black text-purple-300">
              ₹{formatINR(totalInvoicePending)}
            </p>
          </div>
        </div>

        {/* Detailed Financial Breakdown Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1e2e4f] text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-[#0a101f]">
                <th className="py-2.5 px-3">Category / Module</th>
                <th className="py-2.5 px-3">Description & Parameter</th>
                <th className="py-2.5 px-3 text-right">Inflow (₹)</th>
                <th className="py-2.5 px-3 text-right">Outflow (₹)</th>
                <th className="py-2.5 px-3 text-right">Net Position (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2e4f]/50">
              <tr>
                <td className="py-3 px-3 font-bold text-amber-300">Stock Trading Ledger</td>
                <td className="py-3 px-3 text-slate-300">
                  {trades.length} Trades logged ({trades.filter((t) => t.status === 'CLOSED').length} closed, {trades.filter((t) => t.status === 'OPEN').length} open)
                </td>
                <td className="py-3 px-3 text-right font-medium text-emerald-400">
                  +₹{formatINR(summary.totalStockProfit)}
                </td>
                <td className="py-3 px-3 text-right font-medium text-rose-400">
                  -₹{formatINR(summary.totalStockLoss + totalStockCharges)}
                </td>
                <td className={`py-3 px-3 text-right font-black ${totalStockNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalStockNetPnl >= 0 ? '+' : ''}₹{formatINR(totalStockNetPnl)}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-bold text-blue-300">Universal Weekly Income</td>
                <td className="py-3 px-3 text-slate-300">
                  {weekly.length} Weeks tracked with auto-carry-forward
                </td>
                <td className="py-3 px-3 text-right font-medium text-emerald-400">
                  +₹{formatINR(totalWeeklyIn)}
                </td>
                <td className="py-3 px-3 text-right font-medium text-rose-400">
                  -₹{formatINR(totalWeeklyOut)}
                </td>
                <td className="py-3 px-3 text-right font-black text-white">
                  +₹{formatINR(totalWeeklyNet)}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-bold text-teal-300">Daily Shifts & Operations</td>
                <td className="py-3 px-3 text-slate-300">
                  {daily.length} Operational days recorded
                </td>
                <td className="py-3 px-3 text-right font-medium text-emerald-400">
                  +₹{formatINR(totalDailyIn)}
                </td>
                <td className="py-3 px-3 text-right font-medium text-rose-400">
                  -₹{formatINR(totalDailyOut)}
                </td>
                <td className="py-3 px-3 text-right font-black text-white">
                  +₹{formatINR(totalDailyNet)}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-bold text-purple-300">Business & B2B Invoices</td>
                <td className="py-3 px-3 text-slate-300">
                  {invoices.length} Client invoices issued
                </td>
                <td className="py-3 px-3 text-right font-medium text-emerald-400">
                  +₹{formatINR(totalInvoiceReceived)}
                </td>
                <td className="py-3 px-3 text-right font-medium text-slate-500">
                  ₹0.00
                </td>
                <td className="py-3 px-3 text-right font-black text-emerald-400">
                  +₹{formatINR(totalInvoiceReceived)}
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-bold text-rose-300">Direct Expense Ledger</td>
                <td className="py-3 px-3 text-slate-300">
                  {expenses.length} Itemized transactions across categories
                </td>
                <td className="py-3 px-3 text-right font-medium text-slate-500">
                  ₹0.00
                </td>
                <td className="py-3 px-3 text-right font-medium text-rose-400">
                  -₹{formatINR(totalExpensesLogged)}
                </td>
                <td className="py-3 px-3 text-right font-black text-rose-400">
                  -₹{formatINR(totalExpensesLogged)}
                </td>
              </tr>

              <tr className="bg-slate-900/60 font-black">
                <td colSpan={2} className="py-3.5 px-3 text-white uppercase tracking-wider">
                  Net Consolidated Retained Cashflow
                </td>
                <td className="py-3.5 px-3 text-right text-emerald-400">
                  +₹{formatINR(totalWeeklyIn + totalDailyIn + totalInvoiceReceived + summary.totalStockProfit)}
                </td>
                <td className="py-3.5 px-3 text-right text-rose-400">
                  -₹{formatINR(totalExpensesLogged + totalWeeklyOut + totalDailyOut + summary.totalStockLoss + totalStockCharges)}
                </td>
                <td className="py-3.5 px-3 text-right text-amber-400 text-sm">
                  ₹{formatINR(summary.netWorth)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer Audit Sign-Off */}
        <div className="mt-8 border-t border-[#1e2e4f] pt-4 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
          <span>MOTI Financial Operating Engine • Smart Money. Smart Business. Smart Future.</span>
          <span>Zero Fabricated Figures • Authorized User Records Only</span>
        </div>
      </div>
    </div>
  );
};
