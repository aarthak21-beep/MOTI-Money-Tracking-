import React, { useState, useMemo } from 'react';
import {
  Clock,
  Plus,
  Calendar,
  Download,
  Trash2,
  Edit2,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter
} from 'lucide-react';
import { DailyEarningsRecord, UserProfile } from '../types';
import { formatINR, downloadCSV } from '../utils/exportUtils';

interface DailyEarningsViewProps {
  records: DailyEarningsRecord[];
  profile: UserProfile;
  onSaveRecords: (records: DailyEarningsRecord[]) => void;
}

export const DailyEarningsView: React.FC<DailyEarningsViewProps> = ({
  records,
  profile,
  onSaveRecords,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DailyEarningsRecord | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [date, setDate] = useState('');
  const [incomeSource, setIncomeSource] = useState('Operations / Delivery / Freelance');
  const [shift1, setShift1] = useState('');
  const [shift2, setShift2] = useState('');
  const [shift3, setShift3] = useState('');
  const [bonus, setBonus] = useState('');
  const [offers, setOffers] = useState('');
  const [otherEarnings, setOtherEarnings] = useState('');
  const [dailyExpenses, setDailyExpenses] = useState('');
  const [notes, setNotes] = useState('');

  // Statistics
  const stats = useMemo(() => {
    if (records.length === 0) {
      return {
        totalGross: 0,
        totalExpenses: 0,
        totalNet: 0,
        avgDaily: 0,
        highestDay: null,
        lowestDay: null,
      };
    }

    let totalGross = 0;
    let totalExpenses = 0;
    let totalNet = 0;
    let highestDay: DailyEarningsRecord = records[0];
    let lowestDay: DailyEarningsRecord = records[0];

    for (const r of records) {
      totalGross += r.totalDailyIncome;
      totalExpenses += r.dailyExpenses;
      totalNet += r.netDailyIncome;

      if (r.netDailyIncome > highestDay.netDailyIncome) {
        highestDay = r;
      }
      if (r.netDailyIncome < lowestDay.netDailyIncome) {
        lowestDay = r;
      }
    }

    const avgDaily = totalNet / records.length;

    return {
      totalGross,
      totalExpenses,
      totalNet,
      avgDaily,
      highestDay,
      lowestDay,
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter(
      (r) =>
        r.incomeSource.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.date.includes(searchTerm) ||
        (r.notes && r.notes.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [records, searchTerm]);

  const handleOpenModal = (record?: DailyEarningsRecord) => {
    if (record) {
      setEditingRecord(record);
      setDate(record.date);
      setIncomeSource(record.incomeSource);
      setShift1(String(record.shift1));
      setShift2(String(record.shift2));
      setShift3(String(record.shift3));
      setBonus(String(record.bonus));
      setOffers(String(record.offers));
      setOtherEarnings(String(record.otherEarnings));
      setDailyExpenses(String(record.dailyExpenses));
      setNotes(record.notes || '');
    } else {
      const today = new Date();
      const formatted = `${String(today.getDate()).padStart(2, '0')}-${String(
        today.getMonth() + 1
      ).padStart(2, '0')}-${today.getFullYear()}`;
      setEditingRecord(null);
      setDate(formatted);
      setIncomeSource('Operations / Delivery / Freelance');
      setShift1('');
      setShift2('');
      setShift3('');
      setBonus('');
      setOffers('');
      setOtherEarnings('');
      setDailyExpenses('');
      setNotes('');
    }
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const s1 = Number(shift1) || 0;
    const s2 = Number(shift2) || 0;
    const s3 = Number(shift3) || 0;
    const b = Number(bonus) || 0;
    const o = Number(offers) || 0;
    const oth = Number(otherEarnings) || 0;
    const exp = Number(dailyExpenses) || 0;

    // Formulas:
    // Total Daily Income = Shift 1 + Shift 2 + Shift 3 + Bonus + Offers + Other Earnings
    // Net Daily Income = Total Daily Income - Daily Expenses
    const tot = s1 + s2 + s3 + b + o + oth;
    const net = tot - exp;

    if (editingRecord) {
      const updated = records.map((r) =>
        r.id === editingRecord.id
          ? {
              ...r,
              date,
              incomeSource,
              shift1: s1,
              shift2: s2,
              shift3: s3,
              bonus: b,
              offers: o,
              otherEarnings: oth,
              totalDailyIncome: tot,
              dailyExpenses: exp,
              netDailyIncome: net,
              notes,
            }
          : r
      );
      onSaveRecords(updated);
    } else {
      const newRec: DailyEarningsRecord = {
        id: `daily_${Date.now()}`,
        date,
        incomeSource,
        shift1: s1,
        shift2: s2,
        shift3: s3,
        bonus: b,
        offers: o,
        otherEarnings: oth,
        totalDailyIncome: tot,
        dailyExpenses: exp,
        netDailyIncome: net,
        notes,
      };
      onSaveRecords([newRec, ...records]);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string, d: string) => {
    if (window.confirm(`Delete daily record for ${d}?`)) {
      onSaveRecords(records.filter((r) => r.id !== id));
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Date',
      'Income Source',
      'Shift 1',
      'Shift 2',
      'Shift 3',
      'Bonus',
      'Offers',
      'Other',
      'Total Daily Income',
      'Daily Expenses',
      'Net Daily Income',
      'Notes',
    ];
    const rows = records.map((r) => [
      r.date,
      r.incomeSource,
      r.shift1,
      r.shift2,
      r.shift3,
      r.bonus,
      r.offers,
      r.otherEarnings,
      r.totalDailyIncome,
      r.dailyExpenses,
      r.netDailyIncome,
      r.notes || '',
    ]);
    downloadCSV('MOTI_Daily_Earnings_Ledger', headers, rows);
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white sm:text-3xl">DAILY EARNINGS & SHIFTS</h1>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/30">
              MULTIPLE SHIFTS
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Track daily work across Shift 1, 2, 3, bonuses, fuel expenses, and effective net daily pocket.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-emerald-500 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Log Day</span>
          </button>
        </div>
      </div>

      {/* Daily Performance Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-2xl border border-emerald-500/30 bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Total Net Earned</span>
          <div className="mt-1 text-lg font-black text-emerald-400">
            ₹{formatINR(stats.totalNet)}
          </div>
          <p className="text-[10px] text-slate-500">{records.length} days logged</p>
        </div>

        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Gross Daily Total</span>
          <div className="mt-1 text-lg font-black text-white">
            ₹{formatINR(stats.totalGross)}
          </div>
          <p className="text-[10px] text-slate-500">Before daily expenses</p>
        </div>

        <div className="rounded-2xl border border-rose-500/30 bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Fuel & Food Exp</span>
          <div className="mt-1 text-lg font-black text-rose-400">
            -₹{formatINR(stats.totalExpenses)}
          </div>
          <p className="text-[10px] text-slate-500">Total day burn</p>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Daily Average Net</span>
          <div className="mt-1 text-lg font-black text-amber-300">
            ₹{formatINR(stats.avgDaily)}
          </div>
          <p className="text-[10px] text-slate-500">Per logged shift day</p>
        </div>

        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Highest Day</span>
          <div className="mt-1 text-xs font-bold text-emerald-400 truncate">
            {stats.highestDay ? `${stats.highestDay.date} (₹${formatINR(stats.highestDay.netDailyIncome)})` : '-'}
          </div>
          <p className="text-[10px] text-slate-500">Peak performance</p>
        </div>

        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Lowest Day</span>
          <div className="mt-1 text-xs font-bold text-slate-300 truncate">
            {stats.lowestDay ? `${stats.lowestDay.date} (₹${formatINR(stats.lowestDay.netDailyIncome)})` : '-'}
          </div>
          <p className="text-[10px] text-slate-500">Lowest net run</p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex justify-between items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search date or source..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-[#1e2e4f] bg-[#0d1527] pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-amber-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#1e2e4f] bg-[#0d1527] shadow-xl">
        <table className="w-full text-left border-collapse min-w-[950px]">
          <thead>
            <tr className="border-b border-[#1e2e4f] bg-[#0a101f] text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-3">Date</th>
              <th className="py-3 px-3">Income Source</th>
              <th className="py-3 px-3 text-right">Shift 1</th>
              <th className="py-3 px-3 text-right">Shift 2</th>
              <th className="py-3 px-3 text-right">Shift 3</th>
              <th className="py-3 px-3 text-right">Bonus/Offers</th>
              <th className="py-3 px-3 text-right">Total Daily</th>
              <th className="py-3 px-3 text-right">Expenses</th>
              <th className="py-3 px-3 text-right">Net Daily</th>
              <th className="py-3 px-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2e4f]/50 text-xs">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-500">
                  No daily records found.
                </td>
              </tr>
            ) : (
              filteredRecords.map((r) => (
                <tr key={r.id} className="hover:bg-[#131f38]/50 transition-colors">
                  <td className="py-3 px-3 font-semibold text-white whitespace-nowrap">{r.date}</td>
                  <td className="py-3 px-3">
                    <span className="font-bold text-slate-200">{r.incomeSource}</span>
                    {r.notes && <p className="text-[10px] text-slate-500 truncate max-w-[140px]">{r.notes}</p>}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">₹{formatINR(r.shift1)}</td>
                  <td className="py-3 px-3 text-right text-slate-300">₹{formatINR(r.shift2)}</td>
                  <td className="py-3 px-3 text-right text-slate-300">₹{formatINR(r.shift3)}</td>
                  <td className="py-3 px-3 text-right text-amber-300">
                    ₹{formatINR(r.bonus + r.offers + r.otherEarnings)}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-400">
                    ₹{formatINR(r.totalDailyIncome)}
                  </td>
                  <td className="py-3 px-3 text-right text-rose-400 font-medium">
                    -₹{formatINR(r.dailyExpenses)}
                  </td>
                  <td className="py-3 px-3 text-right font-black text-white bg-slate-900/40">
                    ₹{formatINR(r.netDailyIncome)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center space-x-1.5">
                      <button
                        onClick={() => handleOpenModal(r)}
                        className="rounded p-1 text-slate-400 hover:text-white"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id, r.date)}
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingRecord ? 'Edit Daily Shift' : 'Log Daily Shift Earnings'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Date (DD-MM-YYYY)</label>
                  <input
                    type="text"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Income Source</label>
                  <input
                    type="text"
                    required
                    value={incomeSource}
                    onChange={(e) => setIncomeSource(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Shift 1 (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={shift1}
                    onChange={(e) => setShift1(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Shift 2 (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={shift2}
                    onChange={(e) => setShift2(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Shift 3 (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={shift3}
                    onChange={(e) => setShift3(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Bonus (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={bonus}
                    onChange={(e) => setBonus(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Offers / Tips (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={offers}
                    onChange={(e) => setOffers(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Other (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={otherEarnings}
                    onChange={(e) => setOtherEarnings(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Daily Fuel, Toll & Meals (₹)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={dailyExpenses}
                  onChange={(e) => setDailyExpenses(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-rose-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Heavy rain surge bonus included"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-xs font-bold text-slate-950 shadow-lg hover:from-emerald-400 hover:to-emerald-500 transition-all cursor-pointer"
              >
                Save Daily Earnings
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
