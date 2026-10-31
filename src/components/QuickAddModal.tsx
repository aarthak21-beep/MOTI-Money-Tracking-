import React, { useState } from 'react';
import {
  X,
  TrendingUp,
  Receipt,
  Clock,
  Briefcase,
  ArrowRightLeft,
  CalendarDays,
  PlusCircle
} from 'lucide-react';
import {
  StockTrade,
  ExpenseRecord,
  DailyEarningsRecord,
  WeeklyIncomeRecord,
  BusinessInvoice,
  AccountRecord
} from '../types';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountRecord[];
  onAddTrade: (trade: Omit<StockTrade, 'id' | 'serialNumber'>) => void;
  onAddExpense: (expense: Omit<ExpenseRecord, 'id'>) => void;
  onAddDaily: (daily: Omit<DailyEarningsRecord, 'id'>) => void;
  onAddInvoice: (invoice: Omit<BusinessInvoice, 'id' | 'pendingAmount'>) => void;
  onTransfer: (fromAcc: string, toAcc: string, amount: number, desc: string) => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  accounts,
  onAddTrade,
  onAddExpense,
  onAddDaily,
  onAddInvoice,
  onTransfer,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'expense' | 'trade' | 'daily' | 'transfer' | 'invoice'>('expense');

  // Today's DD-MM-YYYY
  const today = new Date();
  const todayFormatted = `${String(today.getDate()).padStart(2, '0')}-${String(
    today.getMonth() + 1
  ).padStart(2, '0')}-${today.getFullYear()}`;

  // Expense form state
  const [expCategory, setExpCategory] = useState('Food');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState<'CASH' | 'BANK' | 'UPI' | 'WALLET'>('UPI');

  // Trade form state
  const [stockName, setStockName] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [brokerage, setBrokerage] = useState('20');
  const [otherCharges, setOtherCharges] = useState('10');
  const [targetEarnings, setTargetEarnings] = useState('');

  // Daily Shift state
  const [incomeSource, setIncomeSource] = useState('Primary Work / Shifts');
  const [shift1, setShift1] = useState('');
  const [shift2, setShift2] = useState('');
  const [bonus, setBonus] = useState('');
  const [dailyExpenses, setDailyExpenses] = useState('');

  // Transfer state
  const [fromAccount, setFromAccount] = useState(accounts[0]?.id || '');
  const [toAccount, setToAccount] = useState(accounts[1]?.id || '');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDesc, setTransferDesc] = useState('Internal balance shift');

  // Invoice state
  const [clientName, setClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [amountReceived, setAmountReceived] = useState('0');

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expAmount || Number(expAmount) <= 0) return;
    onAddExpense({
      expenseDate: todayFormatted,
      category: expCategory,
      description: expDesc || expCategory,
      amount: Number(expAmount),
      paymentMethod: expMethod,
    });
    onClose();
  };

  const handleTradeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockName || !entryPrice || !quantity) return;
    const ep = Number(entryPrice);
    const qty = Number(quantity);
    const totalInv = ep * qty;
    onAddTrade({
      entryDate: todayFormatted,
      stockName: stockName.toUpperCase().trim(),
      entryPrice: ep,
      quantity: qty,
      totalInvestment: totalInv,
      brokerage: Number(brokerage) || 0,
      otherCharges: Number(otherCharges) || 0,
      targetEarnings: targetEarnings ? Number(targetEarnings) : undefined,
      status: 'OPEN',
      currentMarketPrice: ep,
    });
    onClose();
  };

  const handleDailySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const s1 = Number(shift1) || 0;
    const s2 = Number(shift2) || 0;
    const bon = Number(bonus) || 0;
    const exp = Number(dailyExpenses) || 0;
    const total = s1 + s2 + bon;
    onAddDaily({
      date: todayFormatted,
      incomeSource,
      shift1: s1,
      shift2: s2,
      shift3: 0,
      bonus: bon,
      offers: 0,
      otherEarnings: 0,
      totalDailyIncome: total,
      dailyExpenses: exp,
      netDailyIncome: total - exp,
    });
    onClose();
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(transferAmount);
    if (!amt || amt <= 0 || fromAccount === toAccount) return;
    onTransfer(fromAccount, toAccount, amt, transferDesc);
    onClose();
  };

  const handleInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tot = Number(invoiceAmount);
    if (!clientName || tot <= 0) return;
    const rec = Number(amountReceived) || 0;
    const status = rec >= tot ? 'Paid' : rec > 0 ? 'Partially Paid' : 'Pending';
    onAddInvoice({
      businessName: 'Primary Business',
      clientName,
      projectName: projectName || 'General Services',
      invoiceNumber: `INV-${Date.now().toString().slice(-4)}`,
      invoiceDate: todayFormatted,
      paymentDueDate: todayFormatted,
      totalAmount: tot,
      amountReceived: rec,
      paymentStatus: status,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
          <div className="flex items-center space-x-2">
            <PlusCircle className="h-5 w-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">Quick Record Entry</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selectors */}
        <div className="mt-4 flex flex-wrap gap-1.5 rounded-xl border border-[#1e2e4f] bg-[#070d18] p-1">
          <button
            onClick={() => setActiveTab('expense')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'expense'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Expense
          </button>
          <button
            onClick={() => setActiveTab('trade')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'trade'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Stock Trade
          </button>
          <button
            onClick={() => setActiveTab('daily')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'daily'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Daily Shift
          </button>
          <button
            onClick={() => setActiveTab('transfer')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'transfer'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Transfer
          </button>
          <button
            onClick={() => setActiveTab('invoice')}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'invoice'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Invoice
          </button>
        </div>

        {/* Expense Form */}
        {activeTab === 'expense' && (
          <form onSubmit={handleExpenseSubmit} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300">Category</label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white focus:border-amber-400 outline-none"
              >
                {['Food', 'Fuel', 'Rent', 'Electricity', 'Mobile Recharge', 'Travel', 'Vehicle Maintenance', 'Shopping', 'Business Expenses', 'Personal Expenses', 'Medical', 'Other'].map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300">Amount (₹)</label>
              <input
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-base font-bold text-white focus:border-rose-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300">Description</label>
              <input
                type="text"
                placeholder="e.g. Lunch with team / Petrol refill"
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white focus:border-amber-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300">Payment Account</label>
              <div className="mt-1 grid grid-cols-4 gap-2">
                {(['UPI', 'BANK', 'CASH', 'WALLET'] as const).map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setExpMethod(m)}
                    className={`rounded-lg py-1.5 text-xs font-semibold cursor-pointer border ${
                      expMethod === m
                        ? 'border-rose-400 bg-rose-500/20 text-rose-300'
                        : 'border-[#1e2e4f] bg-[#070d18] text-slate-400'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 py-2.5 text-xs font-bold text-white shadow-lg hover:from-rose-400 hover:to-rose-500 transition-all cursor-pointer"
            >
              Save Expense Entry
            </button>
          </form>
        )}

        {/* Stock Trade Form */}
        {activeTab === 'trade' && (
          <form onSubmit={handleTradeSubmit} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300">Stock Symbol / Name</label>
              <input
                type="text"
                required
                placeholder="e.g. RELIANCE, TATASTEEL"
                value={stockName}
                onChange={(e) => setStockName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs uppercase font-bold text-white focus:border-amber-400 outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">Entry Price (₹)</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white focus:border-amber-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">Quantity</label>
                <input
                  type="number"
                  required
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white focus:border-amber-400 outline-none"
                />
              </div>
            </div>
            {entryPrice && quantity && (
              <div className="rounded-lg bg-slate-900/60 p-2 text-center text-xs text-amber-300">
                Total Required Investment: ₹{(Number(entryPrice) * Number(quantity)).toLocaleString('en-IN')}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">Brokerage (₹)</label>
                <input
                  type="number"
                  value={brokerage}
                  onChange={(e) => setBrokerage(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">Target Profit (₹)</label>
                <input
                  type="number"
                  placeholder="Optional target"
                  value={targetEarnings}
                  onChange={(e) => setTargetEarnings(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:from-amber-400 hover:to-amber-500 transition-all cursor-pointer"
            >
              Open Stock Position
            </button>
          </form>
        )}

        {/* Daily Shifts Form */}
        {activeTab === 'daily' && (
          <form onSubmit={handleDailySubmit} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300">Income Source / Hub</label>
              <input
                type="text"
                value={incomeSource}
                onChange={(e) => setIncomeSource(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">Shift 1 Income (₹)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={shift1}
                  onChange={(e) => setShift1(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">Shift 2 Income (₹)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={shift2}
                  onChange={(e) => setShift2(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">Bonus & Tips (₹)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={bonus}
                  onChange={(e) => setBonus(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">Daily Fuel/Meals (₹)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={dailyExpenses}
                  onChange={(e) => setDailyExpenses(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:from-emerald-400 hover:to-emerald-500 transition-all cursor-pointer"
            >
              Record Daily Earnings
            </button>
          </form>
        )}

        {/* Transfer Form */}
        {activeTab === 'transfer' && (
          <form onSubmit={handleTransferSubmit} className="mt-4 space-y-3">
            <div className="rounded-lg bg-cyan-950/40 border border-cyan-800/40 p-2.5 text-[11px] text-cyan-300">
              Notice: Internal account transfers reallocate cash without affecting your revenue or expense totals.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">From Account</label>
                <select
                  value={fromAccount}
                  onChange={(e) => setFromAccount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (₹{a.balance.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">To Account</label>
                <select
                  value={toAccount}
                  onChange={(e) => setToAccount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (₹{a.balance.toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300">Transfer Amount (₹)</label>
              <input
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-base font-bold text-white focus:border-cyan-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300">Note / Purpose</label>
              <input
                type="text"
                value={transferDesc}
                onChange={(e) => setTransferDesc(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>
            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:from-cyan-400 hover:to-cyan-500 transition-all cursor-pointer"
            >
              Transfer Funds Now
            </button>
          </form>
        )}

        {/* Invoice Form */}
        {activeTab === 'invoice' && (
          <form onSubmit={handleInvoiceSubmit} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300">Client / Company Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Zenith Tech Corp"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white focus:border-purple-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300">Project / Milestone Name</label>
              <input
                type="text"
                placeholder="e.g. Website Overhaul / Trading Automation"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">Invoice Total (₹)</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white focus:border-purple-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">Amount Received (₹)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 py-2.5 text-xs font-bold text-white shadow-lg hover:from-purple-400 hover:to-purple-500 transition-all cursor-pointer"
            >
              Generate Business Invoice
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
