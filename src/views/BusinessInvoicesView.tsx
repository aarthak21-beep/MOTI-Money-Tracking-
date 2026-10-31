import React, { useState, useMemo } from 'react';
import {
  Briefcase,
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  DollarSign
} from 'lucide-react';
import { BusinessInvoice, InvoiceStatus, UserProfile } from '../types';
import { formatINR, downloadCSV, printFinancialReport } from '../utils/exportUtils';

interface BusinessInvoicesViewProps {
  invoices: BusinessInvoice[];
  profile: UserProfile;
  onSaveInvoices: (invoices: BusinessInvoice[]) => void;
}

export const BusinessInvoicesView: React.FC<BusinessInvoicesViewProps> = ({
  invoices,
  profile,
  onSaveInvoices,
}) => {
  const [activeStatus, setActiveStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<BusinessInvoice | null>(null);

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [amountReceived, setAmountReceived] = useState('0');
  const [paymentStatus, setPaymentStatus] = useState<InvoiceStatus>('Pending');
  const [notes, setNotes] = useState('');

  // Performance calculations
  const metrics = useMemo(() => {
    let billed = 0;
    let received = 0;
    let pending = 0;
    let overdue = 0;

    for (const inv of invoices) {
      billed += inv.totalAmount;
      received += inv.amountReceived;
      pending += inv.pendingAmount;
      if (inv.paymentStatus === 'Overdue') {
        overdue += inv.pendingAmount;
      }
    }

    return { billed, received, pending, overdue };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchStatus = activeStatus === 'all' || inv.paymentStatus === activeStatus;
      const matchSearch =
        inv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [invoices, activeStatus, searchTerm]);

  const handleOpenModal = (inv?: BusinessInvoice) => {
    if (inv) {
      setEditingInvoice(inv);
      setBusinessName(inv.businessName);
      setClientName(inv.clientName);
      setProjectName(inv.projectName);
      setInvoiceNumber(inv.invoiceNumber);
      setInvoiceDate(inv.invoiceDate);
      setPaymentDueDate(inv.paymentDueDate);
      setTotalAmount(String(inv.totalAmount));
      setAmountReceived(String(inv.amountReceived));
      setPaymentStatus(inv.paymentStatus);
      setNotes(inv.notes || '');
    } else {
      const today = new Date();
      const due = new Date(today);
      due.setDate(today.getDate() + 15);
      const fmt = (d: Date) =>
        `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

      setEditingInvoice(null);
      setBusinessName('Apex Commercial & Services');
      setClientName('');
      setProjectName('');
      setInvoiceNumber(`INV-${Date.now().toString().slice(-5)}`);
      setInvoiceDate(fmt(today));
      setPaymentDueDate(fmt(due));
      setTotalAmount('');
      setAmountReceived('0');
      setPaymentStatus('Pending');
      setNotes('');
    }
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const tot = Number(totalAmount) || 0;
    const rec = Number(amountReceived) || 0;
    const pend = Math.max(0, tot - rec);

    let status = paymentStatus;
    if (rec >= tot && tot > 0) status = 'Paid';
    else if (rec > 0 && rec < tot) status = 'Partially Paid';

    if (editingInvoice) {
      const updated = invoices.map((inv) =>
        inv.id === editingInvoice.id
          ? {
              ...inv,
              businessName,
              clientName,
              projectName,
              invoiceNumber,
              invoiceDate,
              paymentDueDate,
              totalAmount: tot,
              amountReceived: rec,
              pendingAmount: pend,
              paymentStatus: status,
              notes,
            }
          : inv
      );
      onSaveInvoices(updated);
    } else {
      const newInv: BusinessInvoice = {
        id: `inv_${Date.now()}`,
        businessName,
        clientName,
        projectName,
        invoiceNumber,
        invoiceDate,
        paymentDueDate,
        totalAmount: tot,
        amountReceived: rec,
        pendingAmount: pend,
        paymentStatus: status,
        notes,
      };
      onSaveInvoices([newInv, ...invoices]);
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string, num: string) => {
    if (window.confirm(`Delete invoice ${num}?`)) {
      onSaveInvoices(invoices.filter((inv) => inv.id !== id));
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Invoice No',
      'Business Name',
      'Client Name',
      'Project Name',
      'Invoice Date',
      'Due Date',
      'Total Amount',
      'Amount Received',
      'Pending Amount',
      'Status',
      'Notes',
    ];
    const rows = filteredInvoices.map((inv) => [
      inv.invoiceNumber,
      inv.businessName,
      inv.clientName,
      inv.projectName,
      inv.invoiceDate,
      inv.paymentDueDate,
      inv.totalAmount,
      inv.amountReceived,
      inv.pendingAmount,
      inv.paymentStatus,
      inv.notes || '',
    ]);
    downloadCSV('MOTI_Business_Invoices_Ledger', headers, rows);
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white sm:text-3xl">BUSINESS & FREELANCE</h1>
            <span className="rounded bg-purple-500/10 px-2 py-0.5 text-xs font-bold text-purple-400 border border-purple-500/30">
              B2B & CLIENTS
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Professional invoice tracking, receivables management, project milestones, and overdue payment alerts.
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
            onClick={() => printFinancialReport('Business & Invoices Ledger')}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print PDF</span>
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-purple-500/20 hover:from-purple-400 hover:to-purple-500 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Create Invoice</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-purple-500/30 bg-[#0d1527] p-4">
          <span className="text-xs font-semibold text-slate-400">Total Billed Revenue</span>
          <div className="mt-1 text-xl font-black text-purple-300 sm:text-2xl">
            {profile.currencySymbol}{formatINR(metrics.billed)}
          </div>
          <p className="text-[10px] text-slate-500">{invoices.length} invoices generated</p>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-[#0d1527] p-4">
          <span className="text-xs font-semibold text-slate-400">Revenue Cleared</span>
          <div className="mt-1 text-xl font-black text-emerald-400 sm:text-2xl">
            {profile.currencySymbol}{formatINR(metrics.received)}
          </div>
          <p className="text-[10px] text-slate-500">Collected in accounts</p>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-[#0d1527] p-4">
          <span className="text-xs font-semibold text-slate-400">Pending Receivables</span>
          <div className="mt-1 text-xl font-black text-amber-400 sm:text-2xl">
            {profile.currencySymbol}{formatINR(metrics.pending)}
          </div>
          <p className="text-[10px] text-slate-500">Awaiting client payment</p>
        </div>

        <div className="rounded-2xl border border-rose-500/30 bg-[#0d1527] p-4">
          <span className="text-xs font-semibold text-slate-400">Overdue Risk</span>
          <div className="mt-1 text-xl font-black text-rose-400 sm:text-2xl">
            {profile.currencySymbol}{formatINR(metrics.overdue)}
          </div>
          <p className="text-[10px] text-slate-500">Requires follow-up</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-1 overflow-x-auto">
          {['all', 'Pending', 'Partially Paid', 'Paid', 'Overdue'].map((s) => (
            <button
              key={s}
              onClick={() => setActiveStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                activeStatus === s
                  ? 'bg-purple-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {s === 'all' ? 'All Invoices' : s}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search client, project, inv..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-[#1e2e4f] bg-[#0d1527] pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-purple-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#1e2e4f] bg-[#0d1527] shadow-xl">
        <table className="w-full text-left border-collapse min-w-[950px]">
          <thead>
            <tr className="border-b border-[#1e2e4f] bg-[#0a101f] text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-3">Invoice No</th>
              <th className="py-3 px-3">Client & Business</th>
              <th className="py-3 px-3">Project</th>
              <th className="py-3 px-3">Date</th>
              <th className="py-3 px-3">Due Date</th>
              <th className="py-3 px-3 text-right">Invoice Total</th>
              <th className="py-3 px-3 text-right">Received</th>
              <th className="py-3 px-3 text-right">Pending</th>
              <th className="py-3 px-3 text-center">Status</th>
              <th className="py-3 px-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2e4f]/50 text-xs">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-500">
                  No invoices found. Click "Create Invoice" to issue one.
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#131f38]/50 transition-colors">
                  <td className="py-3 px-3 font-mono font-bold text-purple-300">
                    {inv.invoiceNumber}
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-extrabold text-white">{inv.clientName}</span>
                    <p className="text-[10px] text-slate-500">{inv.businessName}</p>
                  </td>
                  <td className="py-3 px-3 text-slate-300 font-medium">{inv.projectName}</td>
                  <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{inv.invoiceDate}</td>
                  <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{inv.paymentDueDate}</td>
                  <td className="py-3 px-3 text-right font-black text-white">
                    ₹{formatINR(inv.totalAmount)}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-400">
                    ₹{formatINR(inv.amountReceived)}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-amber-400">
                    ₹{formatINR(inv.pendingAmount)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                        inv.paymentStatus === 'Paid'
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : inv.paymentStatus === 'Partially Paid'
                          ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                          : inv.paymentStatus === 'Overdue'
                          ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {inv.paymentStatus}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center space-x-1.5">
                      <button
                        onClick={() => handleOpenModal(inv)}
                        className="rounded p-1 text-slate-400 hover:text-white"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(inv.id, inv.invoiceNumber)}
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
          <div className="w-full max-w-lg rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingInvoice ? 'Edit Business Invoice' : 'Issue New Business Invoice'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Your Business / Agency</label>
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Client / Company Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme Corp"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none focus:border-purple-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Project / Scope</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Monthly Retainer"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Invoice Number</label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-mono text-purple-300 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Invoice Date (DD-MM-YYYY)</label>
                  <input
                    type="text"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Payment Due Date (DD-MM-YYYY)</label>
                  <input
                    type="text"
                    required
                    value={paymentDueDate}
                    onChange={(e) => setPaymentDueDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Total Invoice Amount (₹)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Amount Received (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-emerald-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="Pending">Pending</option>
                  <option value="Partially Paid">Partially Paid</option>
                  <option value="Paid">Paid</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Notes / Wire Instructions</label>
                <input
                  type="text"
                  placeholder="e.g. Due within 15 days via IMPS/NEFT"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 py-3 text-xs font-bold text-white shadow-lg hover:from-purple-400 hover:to-purple-500 transition-all cursor-pointer"
              >
                Save Invoice Record
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
