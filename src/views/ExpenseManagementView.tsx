import React, { useState, useMemo } from 'react';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Download,
  Trash2,
  Edit2,
  AlertTriangle,
  PieChart,
  BarChart3,
  CreditCard,
  ShieldAlert
} from 'lucide-react';
import { ExpenseRecord, BudgetLimit, PaymentMethod, UserProfile } from '../types';
import { formatINR, downloadCSV } from '../utils/exportUtils';

interface ExpenseManagementViewProps {
  expenses: ExpenseRecord[];
  budgets: BudgetLimit[];
  profile: UserProfile;
  onSaveExpenses: (expenses: ExpenseRecord[]) => void;
  onSaveBudgets: (budgets: BudgetLimit[]) => void;
}

export const ExpenseManagementView: React.FC<ExpenseManagementViewProps> = ({
  expenses,
  budgets,
  profile,
  onSaveExpenses,
  onSaveBudgets,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);

  // Form State
  const [expenseDate, setExpenseDate] = useState('');
  const [category, setCategory] = useState('Food');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [notes, setNotes] = useState('');

  // Total expense sum
  const totalExpenseSum = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses]);

  // Category-wise totals & budget checks
  const categoryStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const exp of expenses) {
      const cur = map.get(exp.category) || 0;
      map.set(exp.category, cur + (Number(exp.amount) || 0));
    }

    const result = budgets.map((b) => {
      const spent = map.get(b.category) || 0;
      const pct = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
      return {
        category: b.category,
        limit: b.monthlyLimit,
        spent,
        percent: pct,
        isWarning: pct >= 80 && pct <= 100,
        isOver: pct > 100,
      };
    });

    return result.sort((a, b) => b.spent - a.spent);
  }, [expenses, budgets]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchCat = selectedCategory === 'all' || e.category === selectedCategory;
      const matchSearch =
        e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.expenseDate.includes(searchTerm) ||
        (e.notes && e.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [expenses, selectedCategory, searchTerm]);

  const handleOpenExpenseModal = (exp?: ExpenseRecord) => {
    if (exp) {
      setEditingExpense(exp);
      setExpenseDate(exp.expenseDate);
      setCategory(exp.category);
      setDescription(exp.description);
      setAmount(String(exp.amount));
      setPaymentMethod(exp.paymentMethod);
      setNotes(exp.notes || '');
    } else {
      const today = new Date();
      const fmt = `${String(today.getDate()).padStart(2, '0')}-${String(
        today.getMonth() + 1
      ).padStart(2, '0')}-${today.getFullYear()}`;
      setEditingExpense(null);
      setExpenseDate(fmt);
      setCategory('Food');
      setDescription('');
      setAmount('');
      setPaymentMethod('UPI');
      setNotes('');
    }
    setIsExpenseModalOpen(true);
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return;

    if (editingExpense) {
      const updated = expenses.map((item) =>
        item.id === editingExpense.id
          ? {
              ...item,
              expenseDate,
              category,
              description: description || category,
              amount: amt,
              paymentMethod,
              notes,
            }
          : item
      );
      onSaveExpenses(updated);
    } else {
      const newExp: ExpenseRecord = {
        id: `exp_${Date.now()}`,
        expenseDate,
        category,
        description: description || category,
        amount: amt,
        paymentMethod,
        notes,
      };
      onSaveExpenses([newExp, ...expenses]);
    }
    setIsExpenseModalOpen(false);
  };

  const handleDeleteExpense = (id: string, desc: string) => {
    if (window.confirm(`Delete expense "${desc}"?`)) {
      onSaveExpenses(expenses.filter((e) => e.id !== id));
    }
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Category', 'Description', 'Amount', 'Payment Method', 'Notes'];
    const rows = filteredExpenses.map((e) => [
      e.expenseDate,
      e.category,
      e.description,
      e.amount,
      e.paymentMethod,
      e.notes || '',
    ]);
    downloadCSV('MOTI_Expenses_Ledger', headers, rows);
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white sm:text-3xl">EXPENSE & BUDGET MANAGEMENT</h1>
            <span className="rounded bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-400 border border-rose-500/30">
              AUDIT & LIMITS
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Track categorized spending with real-time budget thresholds and warnings to preserve cashflow.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsBudgetModalOpen(true)}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            <span>Budget Limits</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => handleOpenExpenseModal()}
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-500/20 hover:from-rose-400 hover:to-rose-500 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Budget Limit Progress Bars */}
      <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
          <div>
            <h3 className="text-base font-bold text-white">Monthly Category Budgets & Alerts</h3>
            <p className="text-xs text-slate-400">Active spending compared to planned caps</p>
          </div>
          <span className="text-xs font-bold text-slate-300">
            Total Outflow: <span className="text-rose-400">₹{formatINR(totalExpenseSum)}</span>
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categoryStats.slice(0, 6).map((c) => (
            <div key={c.category} className="rounded-xl border border-[#1e2e4f]/60 bg-[#070d18] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white truncate">{c.category}</span>
                <span
                  className={`font-semibold ${
                    c.isOver ? 'text-rose-400' : c.isWarning ? 'text-amber-400' : 'text-slate-400'
                  }`}
                >
                  ₹{formatINR(c.spent)} / ₹{formatINR(c.limit)}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  style={{ width: `${Math.min(100, c.percent)}%` }}
                  className={`h-full rounded-full transition-all duration-300 ${
                    c.isOver ? 'bg-rose-500' : c.isWarning ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                <span>{c.percent.toFixed(0)}% used</span>
                {c.isOver && <span className="text-rose-400 font-bold">Limit Exceeded!</span>}
                {c.isWarning && <span className="text-amber-400 font-bold">Near Limit (80%+)</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-1 overflow-x-auto">
          {['all', 'Food', 'Fuel', 'Rent', 'Electricity', 'Travel', 'Shopping', 'Business Expenses', 'Personal Expenses'].map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-rose-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat === 'all' ? 'All Categories' : cat}
              </button>
            )
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search description, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-[#1e2e4f] bg-[#0d1527] pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-rose-400"
          />
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#1e2e4f] bg-[#0d1527] shadow-xl">
        <table className="w-full text-left border-collapse min-w-[850px]">
          <thead>
            <tr className="border-b border-[#1e2e4f] bg-[#0a101f] text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-3">Date</th>
              <th className="py-3 px-3">Category</th>
              <th className="py-3 px-3">Description</th>
              <th className="py-3 px-3">Payment Method</th>
              <th className="py-3 px-3 text-right">Amount</th>
              <th className="py-3 px-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2e4f]/50 text-xs">
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  No expense records found.
                </td>
              </tr>
            ) : (
              filteredExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-[#131f38]/50 transition-colors">
                  <td className="py-3 px-3 text-slate-300 whitespace-nowrap">{exp.expenseDate}</td>
                  <td className="py-3 px-3 font-semibold text-white">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 border border-slate-700">
                      {exp.category}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-200">
                    {exp.description}
                    {exp.notes && <p className="text-[10px] text-slate-500">{exp.notes}</p>}
                  </td>
                  <td className="py-3 px-3">
                    <span className="rounded bg-cyan-950/60 px-2 py-0.5 text-[10px] font-mono text-cyan-400 border border-cyan-800/40">
                      {exp.paymentMethod}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-black text-rose-400 text-sm">
                    -₹{formatINR(exp.amount)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center space-x-1.5">
                      <button
                        onClick={() => handleOpenExpenseModal(exp)}
                        className="rounded p-1 text-slate-400 hover:text-white"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteExpense(exp.id, exp.description)}
                        className="rounded p-1 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Expense Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingExpense ? 'Edit Expense Record' : 'Record New Expense'}
              </h3>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Date (DD-MM-YYYY)</label>
                  <input
                    type="text"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none focus:border-rose-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                  >
                    {[
                      'Food',
                      'Fuel',
                      'Rent',
                      'Electricity',
                      'Mobile Recharge',
                      'Travel',
                      'Vehicle Maintenance',
                      'Shopping',
                      'Business Expenses',
                      'Personal Expenses',
                      'Medical',
                      'Other',
                    ].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Amount (₹)</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-base font-black text-rose-400 outline-none focus:border-rose-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fuel refill for vehicle commute"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Payment Method</label>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {(['UPI', 'BANK', 'CASH', 'WALLET'] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`rounded-lg py-2 text-xs font-bold border cursor-pointer ${
                        paymentMethod === m
                          ? 'border-rose-400 bg-rose-500/20 text-rose-300'
                          : 'border-[#1e2e4f] bg-[#070d18] text-slate-400'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Notes</label>
                <input
                  type="text"
                  placeholder="Optional notes or receipt ID"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 py-3 text-xs font-bold text-white shadow-lg hover:from-rose-400 hover:to-rose-500 transition-all cursor-pointer"
              >
                Save Expense Entry
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Budget Configuration Modal */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Monthly Category Limits</h3>
                <p className="text-xs text-slate-400">Set maximum target ceiling per category</p>
              </div>
              <button onClick={() => setIsBudgetModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {budgets.map((b, index) => (
                <div key={b.category} className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-white w-1/3 truncate">{b.category}</span>
                  <div className="flex-1 flex items-center space-x-1.5">
                    <span className="text-xs text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      value={b.monthlyLimit}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        const copy = [...budgets];
                        copy[index].monthlyLimit = val;
                        onSaveBudgets(copy);
                      }}
                      className="w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs text-white font-bold outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setIsBudgetModalOpen(false)}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-xs font-bold text-slate-950 shadow-lg cursor-pointer"
            >
              Done Updating Limits
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
