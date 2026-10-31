import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  AlertCircle,
  DollarSign,
  ArrowUpDown,
  RefreshCw
} from 'lucide-react';
import { StockTrade, UserProfile } from '../types';
import { formatINR, downloadCSV, printFinancialReport } from '../utils/exportUtils';

interface StockTradingViewProps {
  trades: StockTrade[];
  profile: UserProfile;
  onSaveTrades: (trades: StockTrade[]) => void;
}

export const StockTradingView: React.FC<StockTradingViewProps> = ({
  trades,
  profile,
  onSaveTrades,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'OPEN' | 'CLOSED'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<StockTrade | null>(null);

  // Form State
  const [entryDate, setEntryDate] = useState('');
  const [stockName, setStockName] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [brokerage, setBrokerage] = useState('20');
  const [otherCharges, setOtherCharges] = useState('15');
  const [targetEarnings, setTargetEarnings] = useState('');
  const [tradeStatus, setTradeStatus] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [currentMarketPrice, setCurrentMarketPrice] = useState('');
  const [notes, setNotes] = useState('');

  // Performance analytics
  const metrics = useMemo(() => {
    let openInvestment = 0;
    let closedInvestment = 0;
    let realizedGrossPnl = 0;
    let realizedNetPnl = 0;
    let unrealizedGrossPnl = 0;
    let unrealizedNetPnl = 0;
    let winCount = 0;
    let lossCount = 0;
    let bestTrade: StockTrade | null = null;
    let worstTrade: StockTrade | null = null;

    for (const t of trades) {
      if (t.status === 'OPEN') {
        openInvestment += t.totalInvestment;
        if (t.currentMarketPrice && t.currentMarketPrice > 0) {
          const gross = (t.currentMarketPrice - t.entryPrice) * t.quantity;
          const net = gross - (t.brokerage || 0) - (t.otherCharges || 0);
          unrealizedGrossPnl += gross;
          unrealizedNetPnl += net;
        }
      } else {
        closedInvestment += t.totalInvestment;
        const net = t.netPnl || 0;
        const gross = t.actualPnl || 0;
        realizedGrossPnl += gross;
        realizedNetPnl += net;
        if (net > 0) winCount++;
        else if (net < 0) lossCount++;

        if (!bestTrade || net > (bestTrade.netPnl || 0)) {
          bestTrade = t;
        }
        if (!worstTrade || net < (worstTrade.netPnl || 0)) {
          worstTrade = t;
        }
      }
    }

    const totalClosed = winCount + lossCount;
    const winRate = totalClosed > 0 ? (winCount / totalClosed) * 100 : 0;

    return {
      openInvestment,
      closedInvestment,
      realizedGrossPnl,
      realizedNetPnl,
      unrealizedGrossPnl,
      unrealizedNetPnl,
      winCount,
      lossCount,
      winRate,
      bestTrade,
      worstTrade,
    };
  }, [trades]);

  // Filtered trades
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      const matchesTab = activeTab === 'all' || t.status === activeTab;
      const matchesSearch =
        t.stockName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.entryDate.includes(searchTerm) ||
        (t.notes && t.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesTab && matchesSearch;
    });
  }, [trades, activeTab, searchTerm]);

  // Open Add/Edit Modal
  const handleOpenModal = (trade?: StockTrade) => {
    if (trade) {
      setEditingTrade(trade);
      setEntryDate(trade.entryDate);
      setStockName(trade.stockName);
      setEntryPrice(String(trade.entryPrice));
      setQuantity(String(trade.quantity));
      setExitDate(trade.exitDate || '');
      setExitPrice(trade.exitPrice ? String(trade.exitPrice) : '');
      setBrokerage(String(trade.brokerage));
      setOtherCharges(String(trade.otherCharges));
      setTargetEarnings(trade.targetEarnings ? String(trade.targetEarnings) : '');
      setTradeStatus(trade.status);
      setCurrentMarketPrice(trade.currentMarketPrice ? String(trade.currentMarketPrice) : '');
      setNotes(trade.notes || '');
    } else {
      const today = new Date();
      const formatted = `${String(today.getDate()).padStart(2, '0')}-${String(
        today.getMonth() + 1
      ).padStart(2, '0')}-${today.getFullYear()}`;
      setEditingTrade(null);
      setEntryDate(formatted);
      setStockName('');
      setEntryPrice('');
      setQuantity('');
      setExitDate('');
      setExitPrice('');
      setBrokerage('20');
      setOtherCharges('15');
      setTargetEarnings('');
      setTradeStatus('OPEN');
      setCurrentMarketPrice('');
      setNotes('');
    }
    setIsModalOpen(true);
  };

  // Form Submission with Strict Mathematical Formulas
  const handleSaveTrade = (e: React.FormEvent) => {
    e.preventDefault();
    const ep = Number(entryPrice);
    const qty = Number(quantity);
    if (!stockName || ep <= 0 || qty <= 0) return;

    const totalInvestment = ep * qty;
    const brok = Number(brokerage) || 0;
    const other = Number(otherCharges) || 0;
    const target = targetEarnings ? Number(targetEarnings) : undefined;
    const cmp = currentMarketPrice ? Number(currentMarketPrice) : ep;

    let actualPnl: number | undefined;
    let netPnl: number | undefined;
    let pnlPercentage: number | undefined;
    const isClosed = tradeStatus === 'CLOSED' && Number(exitPrice) > 0;

    if (isClosed) {
      const xp = Number(exitPrice);
      // Automatic Formulas:
      // Gross P&L = (Exit Price - Entry Price) * Quantity
      // Net P&L = Gross P&L - Brokerage - Other Charges
      // P&L % = (Net P&L / Investment) * 100
      actualPnl = (xp - ep) * qty;
      netPnl = actualPnl - brok - other;
      pnlPercentage = totalInvestment > 0 ? (netPnl / totalInvestment) * 100 : 0;
    }

    if (editingTrade) {
      const updated = trades.map((t) =>
        t.id === editingTrade.id
          ? {
              ...t,
              entryDate,
              stockName: stockName.toUpperCase().trim(),
              entryPrice: ep,
              quantity: qty,
              totalInvestment,
              exitDate: isClosed ? exitDate || entryDate : undefined,
              exitPrice: isClosed ? Number(exitPrice) : undefined,
              brokerage: brok,
              otherCharges: other,
              targetEarnings: target,
              actualPnl,
              netPnl,
              pnlPercentage,
              status: isClosed ? ('CLOSED' as const) : ('OPEN' as const),
              currentMarketPrice: cmp,
              notes,
            }
          : t
      );
      onSaveTrades(updated);
    } else {
      const newTrade: StockTrade = {
        id: `trade_${Date.now()}`,
        serialNumber: trades.length + 1,
        entryDate,
        stockName: stockName.toUpperCase().trim(),
        entryPrice: ep,
        quantity: qty,
        totalInvestment,
        exitDate: isClosed ? exitDate || entryDate : undefined,
        exitPrice: isClosed ? Number(exitPrice) : undefined,
        brokerage: brok,
        otherCharges: other,
        targetEarnings: target,
        actualPnl,
        netPnl,
        pnlPercentage,
        status: isClosed ? ('CLOSED' as const) : ('OPEN' as const),
        currentMarketPrice: cmp,
        notes,
      };
      onSaveTrades([...trades, newTrade]);
    }

    setIsModalOpen(false);
  };

  // Delete trade with confirmation
  const handleDeleteTrade = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the trade for ${name}?`)) {
      const updated = trades
        .filter((t) => t.id !== id)
        .map((t, idx) => ({ ...t, serialNumber: idx + 1 }));
      onSaveTrades(updated);
    }
  };

  // Quick Close Trade from Table
  const handleQuickClose = (trade: StockTrade) => {
    const exitVal = prompt(
      `Enter Exit Price for ${trade.stockName} (Entry: ₹${trade.entryPrice}):`,
      String(trade.currentMarketPrice || trade.entryPrice)
    );
    if (!exitVal || isNaN(Number(exitVal))) return;

    const xp = Number(exitVal);
    const today = new Date();
    const formatted = `${String(today.getDate()).padStart(2, '0')}-${String(
      today.getMonth() + 1
    ).padStart(2, '0')}-${today.getFullYear()}`;

    const gross = (xp - trade.entryPrice) * trade.quantity;
    const net = gross - trade.brokerage - trade.otherCharges;
    const pct = trade.totalInvestment > 0 ? (net / trade.totalInvestment) * 100 : 0;

    const updated = trades.map((t) =>
      t.id === trade.id
        ? {
            ...t,
            status: 'CLOSED' as const,
            exitDate: formatted,
            exitPrice: xp,
            actualPnl: gross,
            netPnl: net,
            pnlPercentage: pct,
          }
        : t
    );
    onSaveTrades(updated);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'S.No',
      'Entry Date',
      'Stock Name',
      'Entry Price',
      'Quantity',
      'Total Investment',
      'Exit Date',
      'Exit Price',
      'Brokerage',
      'Other Charges',
      'Target Earnings',
      'Gross P&L',
      'Net P&L',
      'P&L %',
      'Status',
      'Notes',
    ];

    const rows = filteredTrades.map((t) => [
      t.serialNumber,
      t.entryDate,
      t.stockName,
      t.entryPrice,
      t.quantity,
      t.totalInvestment,
      t.exitDate || '-',
      t.exitPrice || '-',
      t.brokerage,
      t.otherCharges,
      t.targetEarnings || '-',
      t.actualPnl !== undefined ? t.actualPnl : '-',
      t.netPnl !== undefined ? t.netPnl : '-',
      t.pnlPercentage !== undefined ? `${t.pnlPercentage.toFixed(2)}%` : '-',
      t.status,
      t.notes || '',
    ]);

    downloadCSV('MOTI_Stock_Trades_Ledger', headers, rows);
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white sm:text-3xl">STOCK TRADING LEDGER</h1>
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-400 border border-amber-500/30">
              EQUITY & F&O
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Real-time trade journaling with automatic gross & net P&L, brokerage, and unrealized tracking.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => printFinancialReport('Stock Trading Ledger')}
            className="flex items-center space-x-1.5 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print PDF</span>
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>New Trade</span>
          </button>
        </div>
      </div>

      {/* Stock Trading KPI Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-2xl border border-emerald-500/30 bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Realized Net P&L</span>
          <div
            className={`mt-1 text-lg font-black ${
              metrics.realizedNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {metrics.realizedNetPnl >= 0 ? '+' : ''}₹{formatINR(metrics.realizedNetPnl)}
          </div>
          <p className="text-[10px] text-slate-500">Gross: ₹{formatINR(metrics.realizedGrossPnl)}</p>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Open Capital</span>
          <div className="mt-1 text-lg font-black text-amber-300">
            ₹{formatINR(metrics.openInvestment)}
          </div>
          <p className="text-[10px] text-slate-500">Across open holdings</p>
        </div>

        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Unrealized P&L</span>
          <div
            className={`mt-1 text-lg font-black ${
              metrics.unrealizedNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {metrics.unrealizedNetPnl >= 0 ? '+' : ''}₹{formatINR(metrics.unrealizedNetPnl)}
          </div>
          <p className="text-[10px] text-slate-500">Based on CMP</p>
        </div>

        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Win Rate %</span>
          <div className="mt-1 text-lg font-black text-white">
            {metrics.winRate.toFixed(1)}%
          </div>
          <p className="text-[10px] text-slate-500">
            {metrics.winCount} W / {metrics.lossCount} L
          </p>
        </div>

        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Best Trade</span>
          <div className="mt-1 text-xs font-bold text-emerald-400 truncate">
            {metrics.bestTrade ? `${metrics.bestTrade.stockName} (+₹${formatINR(metrics.bestTrade.netPnl || 0)})` : 'None'}
          </div>
          <p className="text-[10px] text-slate-500">
            {metrics.bestTrade?.pnlPercentage ? `+${metrics.bestTrade.pnlPercentage.toFixed(1)}%` : '-'}
          </p>
        </div>

        <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Worst Trade</span>
          <div className="mt-1 text-xs font-bold text-rose-400 truncate">
            {metrics.worstTrade ? `${metrics.worstTrade.stockName} (₹${formatINR(metrics.worstTrade.netPnl || 0)})` : 'None'}
          </div>
          <p className="text-[10px] text-slate-500">
            {metrics.worstTrade?.pnlPercentage ? `${metrics.worstTrade.pnlPercentage.toFixed(1)}%` : '-'}
          </p>
        </div>
      </div>

      {/* Filter and Tab Controls */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        {/* Status Tab Switches */}
        <div className="flex rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-1">
          <button
            onClick={() => setActiveTab('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
              activeTab === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Trades ({trades.length})
          </button>
          <button
            onClick={() => setActiveTab('OPEN')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
              activeTab === 'OPEN'
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Open Positions ({trades.filter((t) => t.status === 'OPEN').length})
          </button>
          <button
            onClick={() => setActiveTab('CLOSED')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
              activeTab === 'CLOSED'
                ? 'bg-amber-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Closed Trades ({trades.filter((t) => t.status === 'CLOSED').length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search stock, date, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-[#1e2e4f] bg-[#0d1527] pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
          />
        </div>
      </div>

      {/* Spreadsheet-style Stock Trading Ledger */}
      <div className="overflow-x-auto rounded-2xl border border-[#1e2e4f] bg-[#0d1527] shadow-xl">
        <table className="w-full text-left border-collapse min-w-[1250px]">
          <thead>
            <tr className="border-b border-[#1e2e4f] bg-[#0a101f] text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-3">Sr No.</th>
              <th className="py-3 px-3">Date</th>
              <th className="py-3 px-3">Stock</th>
              <th className="py-3 px-3 text-right">Entry</th>
              <th className="py-3 px-3 text-right">Qty</th>
              <th className="py-3 px-3 text-right">Investment</th>
              <th className="py-3 px-3">Exit Date</th>
              <th className="py-3 px-3 text-right">Exit</th>
              <th className="py-3 px-3 text-right">CMI</th>
              <th className="py-3 px-3 text-right">Target Earn</th>
              <th className="py-3 px-3 text-right">P&amp;L</th>
              <th className="py-3 px-3 text-right">Total P&amp;L</th>
              <th className="py-3 px-3 text-right">%</th>
              <th className="py-3 px-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2e4f]/50 text-xs">
            {filteredTrades.length === 0 ? (
              <tr><td colSpan={14} className="py-8 text-center text-slate-500">No stock trades yet. Add your first trade.</td></tr>
            ) : (
              filteredTrades.map((t) => {
                const closed = t.status === 'CLOSED' && Number(t.exitPrice) > 0;
                const exit = closed ? Number(t.exitPrice) : 0;
                const targetEarn = closed ? exit - t.entryPrice : 0;
                const pnl = closed ? (exit - t.entryPrice) * t.quantity : 0;
                const pct = t.entryPrice > 0 && closed ? (targetEarn / t.entryPrice) * 100 : 0;
                const totalPnl = filteredTrades.slice(0, filteredTrades.indexOf(t) + 1)
                  .reduce((sum, trade) => sum + (trade.status === 'CLOSED' ? (Number(trade.actualPnl) || 0) : 0), 0);
                return (
                  <tr key={t.id} className="hover:bg-[#131f38]/50 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-500 font-bold">{t.serialNumber}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-300">{t.entryDate}</td>
                    <td className="py-3 px-3 font-extrabold text-white">{t.stockName}</td>
                    <td className="py-3 px-3 text-right text-slate-200">₹{formatINR(t.entryPrice)}</td>
                    <td className="py-3 px-3 text-right font-bold text-white">{t.quantity}</td>
                    <td className="py-3 px-3 text-right font-bold text-amber-300">₹{formatINR(t.totalInvestment)}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-300">{closed ? (t.exitDate || '-') : '-'}</td>
                    <td className="py-3 px-3 text-right font-bold text-white">{closed ? '₹' + formatINR(exit) : '-'}</td>
                    <td className="py-3 px-3 text-right text-slate-400">{closed ? '₹' + formatINR((t.brokerage || 0) + (t.otherCharges || 0)) : '-'}</td>
                    <td className="py-3 px-3 text-right text-slate-200">{closed ? '₹' + formatINR(targetEarn) : '-'}</td>
                    <td className={`py-3 px-3 text-right font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{closed ? (pnl >= 0 ? '+' : '-') + '₹' + formatINR(Math.abs(pnl)) : '-'}</td>
                    <td className="py-3 px-3 text-right font-black text-white">{closed ? '₹' + formatINR(totalPnl) : '-'}</td>
                    <td className={`py-3 px-3 text-right font-bold ${pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{closed ? pct.toFixed(2) + '%' : '-'}</td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        {!closed && <button onClick={() => handleQuickClose(t)} title="Exit Trade" className="rounded-lg p-1.5 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"><CheckCircle className="h-4 w-4" /></button>}
                        <button onClick={() => handleOpenModal(t)} title="Edit Trade" className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1e2e4f] hover:text-white cursor-pointer"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handleDeleteTrade(t.id, t.stockName)} title="Delete Trade" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Trade Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1e2e4f] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingTrade ? 'Edit Stock Trade' : 'Record New Stock Trade'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTrade} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Entry Date (DD-MM-YYYY)</label>
                  <input
                    type="text"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white focus:border-amber-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Stock Symbol / Name</label>
                  <input
                    type="text"
                    required
                    placeholder="RELIANCE, INFY"
                    value={stockName}
                    onChange={(e) => setStockName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs uppercase font-bold text-white focus:border-amber-400 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Entry Buy Price (₹)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white focus:border-amber-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Quantity (Shares)</label>
                  <input
                    type="number"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white focus:border-amber-400 outline-none"
                  />
                </div>
              </div>

              {/* Automatic Total Investment preview */}
              {entryPrice && quantity && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300 font-semibold flex justify-between">
                  <span>Calculated Investment:</span>
                  <span>₹{(Number(entryPrice) * Number(quantity)).toLocaleString('en-IN')}</span>
                </div>
              )}

              {/* Status Switch */}
              <div>
                <label className="block text-xs font-semibold text-slate-300">Position Status</label>
                <div className="mt-1 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTradeStatus('OPEN')}
                    className={`rounded-xl py-2 text-xs font-bold cursor-pointer border ${
                      tradeStatus === 'OPEN'
                        ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                        : 'border-[#1e2e4f] bg-[#070d18] text-slate-400'
                    }`}
                  >
                    Open Position
                  </button>
                  <button
                    type="button"
                    onClick={() => setTradeStatus('CLOSED')}
                    className={`rounded-xl py-2 text-xs font-bold cursor-pointer border ${
                      tradeStatus === 'CLOSED'
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                        : 'border-[#1e2e4f] bg-[#070d18] text-slate-400'
                    }`}
                  >
                    Closed (Realized)
                  </button>
                </div>
              </div>

              {/* Open vs Closed conditional fields */}
              {tradeStatus === 'OPEN' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-300">
                    Current Market Price (CMP) - for Unrealized P&L
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Enter current price"
                    value={currentMarketPrice}
                    onChange={(e) => setCurrentMarketPrice(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-cyan-300 font-bold outline-none"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Exit Date (DD-MM-YYYY)</label>
                    <input
                      type="text"
                      value={exitDate}
                      onChange={(e) => setExitDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Exit Sell Price (₹)</label>
                    <input
                      type="number"
                      step="any"
                      required={tradeStatus === 'CLOSED'}
                      value={exitPrice}
                      onChange={(e) => setExitPrice(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-emerald-400 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Charges */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Brokerage (₹)</label>
                  <input
                    type="number"
                    value={brokerage}
                    onChange={(e) => setBrokerage(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Other Charges (₹)</label>
                  <input
                    type="number"
                    value={otherCharges}
                    onChange={(e) => setOtherCharges(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Target Profit (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={targetEarnings}
                    onChange={(e) => setTargetEarnings(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Trade Setup / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. 200 EMA bounce, Breakout pullback"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <button
                type="submit"
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-xs font-bold text-slate-950 shadow-lg hover:from-amber-400 hover:to-amber-500 transition-all cursor-pointer"
              >
                {editingTrade ? 'Update Trade Record' : 'Save & Open Position'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
