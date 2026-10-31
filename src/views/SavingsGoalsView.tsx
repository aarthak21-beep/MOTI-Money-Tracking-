import React, { useState } from 'react';
import {
  PiggyBank,
  Plus,
  Target,
  Calendar,
  CheckCircle2,
  Trash2,
  Edit2,
  ShieldCheck,
  TrendingUp,
  Sparkles
} from 'lucide-react';
import { SavingsGoal, UserProfile } from '../types';
import { formatINR } from '../utils/exportUtils';

interface SavingsGoalsViewProps {
  goals: SavingsGoal[];
  profile: UserProfile;
  onSaveGoals: (goals: SavingsGoal[]) => void;
}

export const SavingsGoalsView: React.FC<SavingsGoalsViewProps> = ({
  goals,
  profile,
  onSaveGoals,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [savedAmount, setSavedAmount] = useState('');
  const [category, setCategory] = useState('Safety & Emergency');
  const [monthlyTarget, setMonthlyTarget] = useState('');
  const [notes, setNotes] = useState('');

  const totalSaved = goals.reduce((sum, g) => sum + (Number(g.savedAmount) || 0), 0);
  const totalTarget = goals.reduce((sum, g) => sum + (Number(g.targetAmount) || 0), 0);
  const overallProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  const handleOpenModal = (goal?: SavingsGoal) => {
    if (goal) {
      setEditingGoal(goal);
      setName(goal.name);
      setTargetAmount(String(goal.targetAmount));
      setTargetDate(goal.targetDate);
      setSavedAmount(String(goal.savedAmount));
      setCategory(goal.category);
      setMonthlyTarget(goal.monthlyTarget ? String(goal.monthlyTarget) : '');
      setNotes(goal.notes || '');
    } else {
      const future = new Date();
      future.setMonth(future.getMonth() + 12);
      const fmt = `${String(future.getDate()).padStart(2, '0')}-${String(
        future.getMonth() + 1
      ).padStart(2, '0')}-${future.getFullYear()}`;

      setEditingGoal(null);
      setName('');
      setTargetAmount('');
      setTargetDate(fmt);
      setSavedAmount('');
      setCategory('Safety & Emergency');
      setMonthlyTarget('');
      setNotes('');
    }
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const tot = Number(targetAmount);
    if (!name || tot <= 0) return;
    const sav = Number(savedAmount) || 0;
    const mon = monthlyTarget ? Number(monthlyTarget) : undefined;

    if (editingGoal) {
      const updated = goals.map((g) =>
        g.id === editingGoal.id
          ? {
              ...g,
              name,
              targetAmount: tot,
              targetDate,
              savedAmount: sav,
              category,
              monthlyTarget: mon,
              notes,
            }
          : g
      );
      onSaveGoals(updated);
    } else {
      const newGoal: SavingsGoal = {
        id: `goal_${Date.now()}`,
        name,
        targetAmount: tot,
        targetDate,
        savedAmount: sav,
        category,
        monthlyTarget: mon,
        notes,
      };
      onSaveGoals([...goals, newGoal]);
    }

    setIsModalOpen(false);
  };

  const handleDepositQuick = (goal: SavingsGoal) => {
    const input = prompt(`Add savings to ${goal.name}:`, '5000');
    if (!input || isNaN(Number(input))) return;
    const deposit = Number(input);
    const updated = goals.map((g) =>
      g.id === goal.id ? { ...g, savedAmount: g.savedAmount + deposit } : g
    );
    onSaveGoals(updated);
  };

  const handleDelete = (id: string, n: string) => {
    if (window.confirm(`Delete savings goal "${n}"?`)) {
      onSaveGoals(goals.filter((g) => g.id !== id));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white sm:text-3xl">SAVINGS & FINANCIAL GOALS</h1>
            <span className="rounded bg-teal-500/10 px-2 py-0.5 text-xs font-bold text-teal-400 border border-teal-500/30">
              RESERVES & TARGETS
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Dedicated capital accumulation for emergency funds, trading buffers, and future wealth creation.
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-teal-500/20 hover:from-teal-400 hover:to-teal-500 transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
          <span>New Savings Target</span>
        </button>
      </div>

      {/* Overview Progress Banner */}
      <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-r from-[#0d1527] via-[#09232c] to-[#070d18] p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-400">
              Overall Goal Completion
            </span>
            <div className="mt-1 text-3xl font-black text-white sm:text-4xl">
              {profile.currencySymbol}{formatINR(totalSaved)}{' '}
              <span className="text-base font-normal text-slate-400">
                / {profile.currencySymbol}{formatINR(totalTarget)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {goals.length} target vaults tracked across emergency reserves and growth capital.
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-teal-400 sm:text-3xl">
              {overallProgress.toFixed(1)}%
            </span>
            <p className="text-[10px] text-slate-400">Target Reached</p>
          </div>
        </div>

        <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-slate-900 border border-teal-900/50">
          <div
            style={{ width: `${Math.min(100, overallProgress)}%` }}
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500"
          />
        </div>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {goals.map((g) => {
          const remaining = Math.max(0, g.targetAmount - g.savedAmount);
          const progress = g.targetAmount > 0 ? (g.savedAmount / g.targetAmount) * 100 : 0;
          const isComplete = progress >= 100;

          return (
            <div
              key={g.id}
              className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-5 shadow-xl flex flex-col justify-between hover:border-teal-500/40 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="rounded bg-teal-950/60 px-2 py-0.5 text-[10px] font-semibold text-teal-300 border border-teal-800/40">
                    {g.category}
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenModal(g)}
                      className="rounded p-1 text-slate-400 hover:text-white"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(g.id, g.name)}
                      className="rounded p-1 text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="mt-3 text-base font-bold text-white">{g.name}</h3>
                {g.notes && <p className="text-xs text-slate-400 mt-1">{g.notes}</p>}

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500">Accumulated</span>
                    <p className="text-xl font-black text-emerald-400">
                      ₹{formatINR(g.savedAmount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500">Target ({g.targetDate})</span>
                    <p className="text-sm font-bold text-white">₹{formatINR(g.targetAmount)}</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-900">
                  <div
                    style={{ width: `${Math.min(100, progress)}%` }}
                    className={`h-full rounded-full transition-all duration-300 ${
                      isComplete ? 'bg-emerald-400' : 'bg-gradient-to-r from-teal-500 to-teal-400'
                    }`}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{progress.toFixed(1)}% complete</span>
                  <span>₹{formatINR(remaining)} remaining</span>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-[#1e2e4f] flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {g.monthlyTarget ? `Monthly: ₹${formatINR(g.monthlyTarget)}` : 'Flexible Target'}
                </span>
                <button
                  onClick={() => handleDepositQuick(g)}
                  className="rounded-lg bg-teal-500/10 border border-teal-500/30 px-2.5 py-1 text-xs font-semibold text-teal-300 hover:bg-teal-500/20 cursor-pointer"
                >
                  + Add Savings
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingGoal ? 'Edit Savings Target' : 'Create Savings Target'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Goal / Fund Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 6-Month Emergency Fund / Trading Cushion"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none focus:border-teal-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Target Amount (₹)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-black text-white outline-none focus:border-teal-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Target Date (DD-MM-YYYY)</label>
                  <input
                    type="text"
                    required
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Already Saved (₹)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={savedAmount}
                    onChange={(e) => setSavedAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-emerald-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Monthly Target (₹)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 15000"
                    value={monthlyTarget}
                    onChange={(e) => setMonthlyTarget(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="Safety & Emergency">Safety & Emergency</option>
                  <option value="Trading Capital Buffer">Trading Capital Buffer</option>
                  <option value="Business Growth">Business Growth</option>
                  <option value="Taxes & Provisions">Taxes & Provisions</option>
                  <option value="Vehicle & Assets">Vehicle & Assets</option>
                  <option value="Retirement & Long-Term">Retirement & Long-Term</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Notes / Strategy</label>
                <input
                  type="text"
                  placeholder="e.g. Allocate 20% of weekly net surplus"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 py-3 text-xs font-bold text-slate-950 shadow-lg cursor-pointer"
              >
                Save Savings Target
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
