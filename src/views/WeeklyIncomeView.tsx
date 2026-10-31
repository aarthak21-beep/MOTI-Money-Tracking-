import React, { useState } from 'react';
import {
  CalendarDays,
  Plus,
  TrendingUp,
  Download,
  Printer,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  ArrowRight,
  Target
} from 'lucide-react';
import { WeeklyIncomeRecord, UserProfile } from '../types';
import { formatINR, downloadCSV, printFinancialReport } from '../utils/exportUtils';

interface WeeklyIncomeViewProps {
  records: WeeklyIncomeRecord[];
  profile: UserProfile;
  onSaveRecords: (records: WeeklyIncomeRecord[]) => void;
  onSelectTab: (tab: string) => void;
}

export const WeeklyIncomeView: React.FC<WeeklyIncomeViewProps> = ({
  records,
  profile,
  onSaveRecords,
  onSelectTab,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<WeeklyIncomeRecord | null>(null);

  // Form State
  const [weekStartDate, setWeekStartDate] = useState('');
  const [weekEndDate, setWeekEndDate] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [weeklyIncome, setWeeklyIncome] = useState('');
  const [salary, setSalary] = useState('');
  const [businessIncome, setBusinessIncome] = useState('');
  const [freelanceIncome, setFreelanceIncome] = useState('');
  const [commission, setCommission] = useState('');
  const [bonus, setBonus] = useState('');
  const [otherIncome, setOtherIncome] = useState('');
  const [weeklyExpenses, setWeeklyExpenses] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Partially Paid' | 'Pending'>('Paid');
  const [notes, setNotes] = useState('');
  const [targetIncome, setTargetIncome] = useState('50000');

  // Aggregated calculations
  const totalInflow = records.reduce((sum, r) => sum + r.totalIncome, 0);
  const totalOutflow = records.reduce((sum, r) => sum + r.weeklyExpenses, 0);
  const netSaved = totalInflow - totalOutflow;
  const avgWeekly = records.length > 0 ? totalInflow / records.length : 0;

  // Open modal
  const handleOpenModal = (record?: WeeklyIncomeRecord) => {
    if (record) {
      setEditingRecord(record);
      setWeekStartDate(record.weekStartDate);
      setWeekEndDate(record.weekEndDate);
      setOpeningBalance(String(record.openingBalance));
      setWeeklyIncome(String(record.weeklyIncome));
      setSalary(String(record.salary));
      setBusinessIncome(String(record.businessIncome));
      setFreelanceIncome(String(record.freelanceIncome));
      setCommission(String(record.commission));
      setBonus(String(record.bonus));
      setOtherIncome(String(record.otherIncome));
      setWeeklyExpenses(String(record.weeklyExpenses));
      setPaymentStatus(record.paymentStatus);
      setNotes(record.notes || '');
    } else {
      // Auto-calculate Opening Balance = Previous Week Final Amount per requirement!
      const lastRec = records[records.length - 1];
      const autoOpening = lastRec ? lastRec.finalAmount : 0;

      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      const fmt = (d: Date) =>
        `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

      setEditingRecord(null);
      setWeekStartDate(fmt(start));
      setWeekEndDate(fmt(now));
      setOpeningBalance(String(autoOpening));
      setWeeklyIncome('');
      setSalary('');
      setBusinessIncome('');
      setFreelanceIncome('');
      setCommission('');
      setBonus('');
      setOtherIncome('');
      setWeeklyExpenses('');
      setPaymentStatus('Paid');
      setNotes('');
    }
    setIsModalOpen(true);
  };

  const handleSaveRecord = (e: React.FormEvent) => {
    e.preventDefault();
    const op = Number(openingBalance) || 0;
    const wInc = Number(weeklyIncome) || 0;
    const sal = Number(salary) || 0;
    const bInc = Number(businessIncome) || 0;
    const fInc = Number(freelanceIncome) || 0;
    const comm = Number(commission) || 0;
    const bon = Number(bonus) || 0;
    const oth = Number(otherIncome) || 0;
    const wExp = Number(weeklyExpenses) || 0;

    // Formulas:
    // Total Income = Weekly Income + Salary + Business Income + Freelance Income + Commission + Bonus + Other Income
    // Final Amount = Opening Balance + Total Income - Weekly Expenses
    const totIncome = wInc + sal + bInc + fInc + comm + bon + oth;
    const finalAmt = op + totIncome - wExp;

    if (editingRecord) {
      const updated = records.map((r) =>
        r.id === editingRecord.id
          ? {
              ...r,
              weekStartDate,
              weekEndDate,
              openingBalance: op,
              weeklyIncome: wInc,
              salary: sal,
              businessIncome: bInc,
              freelanceIncome: fInc,
              commission: comm,
              bonus: bon,
              otherIncome: oth,
              totalIncome: totIncome,
              weeklyExpenses: wExp,
              finalAmount: finalAmt,
              paymentStatus,
              notes,
            }
          : r
      );
      onSaveRecords(updated);
    } else {
      const newRec: WeeklyIncomeRecord = {
        id: `week_${Date.now()}`,
        serialNumber: records.length + 1,
        weekStartDate,
        weekEndDate,
        openingBalance: op,
        weeklyIncome: wInc,
        salary: sal,
        businessIncome: bInc,
        freelanceIncome: fInc,
        commission: comm,
        bonus: bon,
        otherIncome: oth,
        totalIncome: totIncome,
        weeklyExpenses: wExp,
        finalAmount: finalAmt,
        paymentStatus,
        notes,
      };
      onSaveRecords([...records, newRec]);
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string, sNo: number) => {
    if (window.confirm(`Delete Week ${sNo} record?`)) {
      const updated = records
        .filter((r) => r.id !== id)
        .map((r, i) => ({ ...r, serialNumber: i + 1 }));
      onSaveRecords(updated);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'S.No',
      'Start Date',
      'End Date',
      'Opening Balance',
      'Weekly Income',
      'Salary',
      'Business Income',
      'Freelance Income',
      'Commission',
      'Bonus',
      'Other Income',
      'Total Income',
      'Weekly Expenses',
      'Final Amount',
      'Payment Status',
      'Notes',
    ];
    const rows = records.map((r) => [
      r.serialNumber,
      r.weekStartDate,
      r.weekEndDate,
      r.openingBalance,
      r.weeklyIncome,
      r.salary,
      r.businessIncome,
      r.freelanceIncome,
      r.commission,
      r.bonus,
      r.otherIncome,
      r.totalIncome,
      r.weeklyExpenses,
      r.finalAmount,
      r.paymentStatus,
      r.notes || '',
    ]);
    downloadCSV('MOTI_Universal_Weekly_Income', headers, rows);
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white sm:text-3xl">UNIVERSAL WEEKLY INCOME</h1>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/30">
              CARRY-FORWARD
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Automated balance roll-forward across weeks. Replaces rigid company models with dynamic income sources.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onSelectTab('dailyEarnings')}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Daily Shifts</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => printFinancialReport('Universal Weekly Income Ledger')}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print PDF</span>
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-emerald-500 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Add Week</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-[#0d1527] p-4">
          <span className="text-xs font-semibold text-slate-400">Total Income Generated</span>
          <div className="mt-1 text-xl font-black text-emerald-400 sm:text-2xl">
            {profile.currencySymbol}{formatINR(totalInflow)}
          </div>
          <p className="text-[10px] text-slate-500">{records.length} weeks tracked</p>
        </div>

        <div className="rounded-2xl border border-rose-500/30 bg-[#0d1527] p-4">
          <span className="text-xs font-semibold text-slate-400">Total Weekly Expenses</span>
          <div className="mt-1 text-xl font-black text-rose-400 sm:text-2xl">
            {profile.currencySymbol}{formatINR(totalOutflow)}
          </div>
          <p className="text-[10px] text-slate-500">Living & operational burn</p>
        </div>

        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4">
          <span className="text-xs font-semibold text-slate-400">Net Weekly Retention</span>
          <div className="mt-1 text-xl font-black text-white sm:text-2xl">
            {profile.currencySymbol}{formatINR(netSaved)}
          </div>
          <p className="text-[10px] text-slate-500">Accumulated savings retained</p>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-[#0d1527] p-4">
          <span className="text-xs font-semibold text-slate-400">Weekly Run Rate</span>
          <div className="mt-1 text-xl font-black text-amber-300 sm:text-2xl">
            {profile.currencySymbol}{formatINR(avgWeekly)}
          </div>
          <p className="text-[10px] text-slate-500">Average weekly gross</p>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#1e2e4f] bg-[#0d1527] shadow-xl">
        <table className="w-full text-left border-collapse min-w-[1050px]">
          <thead>
            <tr className="border-b border-[#1e2e4f] bg-[#0a101f] text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-3">Wk</th>
              <th className="py-3 px-3">Date Range</th>
              <th className="py-3 px-3 text-right">Opening Bal</th>
              <th className="py-3 px-3 text-right">Weekly Inc</th>
              <th className="py-3 px-3 text-right">Salary / B2B</th>
              <th className="py-3 px-3 text-right">Bonus/Oth</th>
              <th className="py-3 px-3 text-right">Total Income</th>
              <th className="py-3 px-3 text-right">Expenses</th>
              <th className="py-3 px-3 text-right">Final Amount</th>
              <th className="py-3 px-3 text-center">Status</th>
              <th className="py-3 px-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2e4f]/50 text-xs">
            {records.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-500">
                  No weekly records logged. Click "Add Week" to start tracking.
                </td>
              </tr>
            ) : (
              records.map((r, idx) => {
                const isCarriedForward = idx < records.length - 1;
                return (
                  <tr key={r.id} className="hover:bg-[#131f38]/50 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-amber-400">
                      W{r.serialNumber}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-300">
                      {r.weekStartDate} <span className="text-slate-500">to</span> {r.weekEndDate}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-300 font-medium">
                      ₹{formatINR(r.openingBalance)}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-400 font-semibold">
                      ₹{formatINR(r.weeklyIncome)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-300">
                      ₹{formatINR(r.salary + r.businessIncome + r.freelanceIncome)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400">
                      ₹{formatINR(r.bonus + r.commission + r.otherIncome)}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-emerald-400">
                      ₹{formatINR(r.totalIncome)}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-rose-400">
                      -₹{formatINR(r.weeklyExpenses)}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-white bg-slate-900/40">
                      ₹{formatINR(r.finalAmount)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                          r.paymentStatus === 'Paid'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {r.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          onClick={() => handleOpenModal(r)}
                          className="rounded p-1 text-slate-400 hover:text-white hover:bg-[#1e2e4f]"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id, r.serialNumber)}
                          className="rounded p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Weekly Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingRecord ? `Edit Week ${editingRecord.serialNumber}` : 'Record New Universal Week'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Week Start Date (DD-MM-YYYY)</label>
                  <input
                    type="text"
                    required
                    value={weekStartDate}
                    onChange={(e) => setWeekStartDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Week End Date (DD-MM-YYYY)</label>
                  <input
                    type="text"
                    required
                    value={weekEndDate}
                    onChange={(e) => setWeekEndDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">
                  Opening Balance (Auto Carried Forward) (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none focus:border-amber-400"
                />
              </div>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                  Multiple Income Streams
                </span>
                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400">Weekly Income (₹)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={weeklyIncome}
                      onChange={(e) => setWeeklyIncome(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">Salary (₹)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={salary}
                      onChange={(e) => setSalary(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">Business Income (₹)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={businessIncome}
                      onChange={(e) => setBusinessIncome(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">Freelance (₹)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={freelanceIncome}
                      onChange={(e) => setFreelanceIncome(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">Commission (₹)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={commission}
                      onChange={(e) => setCommission(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">Bonus / Incentives (₹)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={bonus}
                      onChange={(e) => setBonus(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="text-[11px] text-slate-400">Other Miscellaneous Income (₹)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={otherIncome}
                    onChange={(e) => setOtherIncome(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Weekly Expenses (₹)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={weeklyExpenses}
                    onChange={(e) => setWeeklyExpenses(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-rose-400 outline-none focus:border-rose-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Payment Status</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Partially Paid">Partially Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Notes / Highlights</label>
                <input
                  type="text"
                  placeholder="e.g. Strong consulting retainers & holiday bonus"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-xs font-bold text-slate-950 shadow-lg hover:from-emerald-400 hover:to-emerald-500 transition-all cursor-pointer"
              >
                {editingRecord ? 'Update Weekly Record' : 'Save & Calculate Final Amount'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
