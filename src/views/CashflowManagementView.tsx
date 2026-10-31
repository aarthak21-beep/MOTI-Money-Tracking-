import React, { useState } from 'react';
import {
  Wallet,
  ArrowRightLeft,
  Plus,
  TrendingUp,
  TrendingDown,
  Building,
  CreditCard,
  QrCode,
  ShieldCheck,
  History,
  Check
} from 'lucide-react';
import { AccountRecord, AccountTransaction, UserProfile } from '../types';
import { formatINR } from '../utils/exportUtils';

interface CashflowManagementViewProps {
  accounts: AccountRecord[];
  profile: UserProfile;
  onSaveAccounts: (accounts: AccountRecord[]) => void;
}

export const CashflowManagementView: React.FC<CashflowManagementViewProps> = ({
  accounts,
  profile,
  onSaveAccounts,
}) => {
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  // Transfer State
  const [fromAccount, setFromAccount] = useState(accounts[0]?.id || '');
  const [toAccount, setToAccount] = useState(accounts[1]?.id || '');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('ATM Withdrawal / Bank-to-UPI top up');

  // Account Edit State
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<'CASH' | 'BANK' | 'UPI' | 'WALLET'>('BANK');
  const [newAccBalance, setNewAccBalance] = useState('');
  const [newAccNumber, setNewAccNumber] = useState('');

  // Local simulated ledger history of transfers
  const [transactions, setTransactions] = useState<Array<{
    id: string;
    date: string;
    from: string;
    to: string;
    amount: number;
    note: string;
  }>>([
    {
      id: 'tx_1',
      date: '28-10-2026',
      from: 'HDFC Savings Bank',
      to: 'GPay UPI',
      amount: 10000,
      note: 'UPI balance replenish',
    },
    {
      id: 'tx_2',
      date: '24-10-2026',
      from: 'HDFC Savings Bank',
      to: 'Primary Cash',
      amount: 5000,
      note: 'ATM cash withdrawal for daily operations',
    },
  ]);

  const totalVaultBalance = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(transferAmount);
    if (!amt || amt <= 0 || fromAccount === toAccount) return;

    const source = accounts.find((a) => a.id === fromAccount);
    const target = accounts.find((a) => a.id === toAccount);
    if (!source || !target) return;

    if (source.balance < amt) {
      alert(`Insufficient funds in ${source.name}! Current balance is ₹${formatINR(source.balance)}.`);
      return;
    }

    // Atomic update
    const updatedAccounts = accounts.map((acc) => {
      if (acc.id === fromAccount) {
        return { ...acc, balance: acc.balance - amt };
      }
      if (acc.id === toAccount) {
        return { ...acc, balance: acc.balance + amt };
      }
      return acc;
    });

    onSaveAccounts(updatedAccounts);

    const now = new Date();
    const fmt = `${String(now.getDate()).padStart(2, '0')}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}-${now.getFullYear()}`;

    setTransactions([
      {
        id: `tx_${Date.now()}`,
        date: fmt,
        from: source.name,
        to: target.name,
        amount: amt,
        note: transferNote,
      },
      ...transactions,
    ]);

    setIsTransferModalOpen(false);
    setTransferAmount('');
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName) return;

    const newAcc: AccountRecord = {
      id: `acc_${Date.now()}`,
      name: newAccName,
      type: newAccType,
      balance: Number(newAccBalance) || 0,
      accountNumber: newAccNumber ? `•••${newAccNumber.slice(-4)}` : undefined,
    };

    onSaveAccounts([...accounts, newAcc]);
    setIsAccountModalOpen(false);
    setNewAccName('');
    setNewAccBalance('');
    setNewAccNumber('');
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'BANK':
        return <Building className="h-5 w-5 text-blue-400" />;
      case 'UPI':
        return <QrCode className="h-5 w-5 text-emerald-400" />;
      case 'WALLET':
        return <CreditCard className="h-5 w-5 text-purple-400" />;
      default:
        return <Wallet className="h-5 w-5 text-amber-400" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white sm:text-3xl">CASHFLOW & BANK VAULTS</h1>
            <span className="rounded bg-cyan-500/10 px-2 py-0.5 text-xs font-bold text-cyan-400 border border-cyan-500/30">
              INTERNAL ZERO-CONTAMINATION
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Real-time multi-account balances across Cash, Bank, UPI, and Wallets with strict internal transfer isolation.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsAccountModalOpen(true)}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add Account</span>
          </button>
          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-cyan-500 transition-all cursor-pointer"
          >
            <ArrowRightLeft className="h-4 w-4 stroke-[3]" />
            <span>Transfer Funds</span>
          </button>
        </div>
      </div>

      {/* Total Liquid Vault Banner */}
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-[#0d1527] via-[#0b1c33] to-[#070d18] p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
            Consolidated Liquid Holdings
          </span>
          <div className="mt-1 text-3xl font-black text-white sm:text-4xl">
            {profile.currencySymbol}{formatINR(totalVaultBalance)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Internal transfers shift money between these accounts without generating taxable income or expenses.
          </p>
        </div>
        <div className="flex items-center space-x-2 rounded-xl border border-cyan-800/40 bg-cyan-950/40 px-3.5 py-2 text-xs text-cyan-300 font-medium">
          <ShieldCheck className="h-4 w-4 text-cyan-400 shrink-0" />
          <span>Strict Internal Reconciliation Active</span>
        </div>
      </div>

      {/* Account Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-5 shadow-xl hover:border-cyan-500/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#070d18] border border-[#1e2e4f]">
                {getAccountIcon(acc.type)}
              </div>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-400 border border-slate-700">
                {acc.type}
              </span>
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-bold text-white truncate">{acc.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {acc.accountNumber || 'Primary Account'}
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-[#1e2e4f] flex justify-between items-end">
              <div>
                <span className="text-[10px] text-slate-500">Live Balance</span>
                <p className="text-xl font-black text-emerald-400">
                  {profile.currencySymbol}{formatINR(acc.balance)}
                </p>
              </div>
              <button
                onClick={() => {
                  setFromAccount(acc.id);
                  setIsTransferModalOpen(true);
                }}
                className="text-[11px] font-semibold text-cyan-400 hover:underline cursor-pointer"
              >
                Transfer
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Internal Transfer History Ledger */}
      <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
          <div className="flex items-center space-x-2">
            <History className="h-4 w-4 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Recent Internal Fund Transfers</h3>
          </div>
          <span className="text-xs text-slate-400">Non-income movements</span>
        </div>

        <div className="mt-4 divide-y divide-[#1e2e4f]/60">
          {transactions.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No transfers executed yet.</p>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white text-xs">{tx.from}</span>
                    <ArrowRightLeft className="h-3 w-3 text-cyan-400" />
                    <span className="font-bold text-white text-xs">{tx.to}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {tx.date} • {tx.note}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-black text-cyan-400 text-sm">
                    ₹{formatINR(tx.amount)}
                  </span>
                  <p className="text-[10px] text-emerald-400 font-semibold flex items-center justify-end gap-1">
                    <Check className="h-2.5 w-2.5" /> Settled
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
              <h3 className="text-base font-bold text-white">Transfer Between Accounts</h3>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleTransfer} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300">From Account (Source)</label>
                <select
                  value={fromAccount}
                  onChange={(e) => setFromAccount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (Balance: ₹{formatINR(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">To Account (Destination)</label>
                <select
                  value={toAccount}
                  onChange={(e) => setToAccount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (Balance: ₹{formatINR(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Transfer Amount (₹)</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-base font-black text-cyan-400 outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Purpose / Note</label>
                <input
                  type="text"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 py-3 text-xs font-bold text-slate-950 shadow-lg hover:from-cyan-400 hover:to-cyan-500 transition-all cursor-pointer"
              >
                Execute Safe Transfer
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
              <h3 className="text-base font-bold text-white">Add New Account Vault</h3>
              <button onClick={() => setIsAccountModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Account Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ICICI Corporate Bank / Cash Vault"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Account Type</label>
                <select
                  value={newAccType}
                  onChange={(e) => setNewAccType(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="BANK">Bank Account</option>
                  <option value="UPI">UPI Handle</option>
                  <option value="CASH">Physical Cash</option>
                  <option value="WALLET">Digital Wallet</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Initial Balance (₹)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={newAccBalance}
                  onChange={(e) => setNewAccBalance(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-emerald-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Account Number / Digits (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 5421"
                  value={newAccNumber}
                  onChange={(e) => setNewAccNumber(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 py-3 text-xs font-bold text-slate-950 shadow-lg cursor-pointer"
              >
                Create Account Vault
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
