import React, { useState, useMemo, useEffect } from 'react';
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
import { TradingAnalyticsView } from './TradingAnalyticsView';
import { EquityRiskCalculator } from './EquityRiskCalculator';
import { EquityTradeCalendar } from './EquityTradeCalendar';
import { MonthlyTradingReview } from './MonthlyTradingReview';
import { OpenPortfolioAllocation } from './OpenPortfolioAllocation';
import { ZerodhaOrdersPanel } from '../components/ZerodhaOrdersPanel';
import { buildZerodhaJournal, type KiteExecution } from '../utils/zerodhaTradeImport';

interface StockTradingViewProps {
  trades: StockTrade[];
  profile: UserProfile;
  onSaveTrades: (trades: StockTrade[]) => void;
}

// Consolidate duplicate OPEN entries for the same equity into one weighted-average position.
const consolidateOpenPositions = (items: StockTrade[]): StockTrade[] => {
  const result: StockTrade[] = [];
  const openIndexBySymbol = new Map<string, number>();

  for (const trade of items) {
    const symbol = trade.stockName.trim().toUpperCase();
    if (trade.source === 'ZERODHA' || trade.status !== 'OPEN') {
      result.push(trade);
      continue;
    }

    const existingIndex = openIndexBySymbol.get(symbol);
    if (existingIndex === undefined) {
      openIndexBySymbol.set(symbol, result.length);
      result.push({ ...trade, stockName: symbol });
      continue;
    }

    const existing = result[existingIndex];
    const quantity = existing.quantity + trade.quantity;
    const investment = existing.totalInvestment + trade.totalInvestment;
    const averageEntry = quantity > 0 ? investment / quantity : existing.entryPrice;
    result[existingIndex] = {
      ...existing,
      entryPrice: averageEntry,
      quantity,
      totalInvestment: investment,
      currentMarketPrice: trade.currentMarketPrice || existing.currentMarketPrice || averageEntry,
      targetEarnings: trade.targetEarnings ?? existing.targetEarnings,
      notes: [existing.notes, trade.notes].filter(Boolean).join(' | '),
    };
  }

  return result.map((trade, index) => {
    const legacy = trade as StockTrade & { brokerage?: number; otherCharges?: number; chargesKnown?: boolean };
    const { brokerage: _brokerage, otherCharges: _otherCharges, chargesKnown: _chargesKnown, ...cleanTrade } = legacy;
    return {
      ...cleanTrade,
      serialNumber: index + 1,
      ...(trade.status === 'CLOSED' && typeof trade.actualPnl === 'number'
        ? { netPnl: trade.actualPnl, pnlPercentage: trade.totalInvestment > 0 ? trade.actualPnl / trade.totalInvestment * 100 : 0 }
        : {}),
    };
  });
};

export const StockTradingView: React.FC<StockTradingViewProps> = ({
  trades,
  profile,
  onSaveTrades,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'OPEN' | 'CLOSED' | 'tools' | 'zerodha'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<StockTrade | null>(null);

  // Form State
  const [entryDate, setEntryDate] = useState('');
  const [stockName, setStockName] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [targetEarnings, setTargetEarnings] = useState('');
  const [tradeStatus, setTradeStatus] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [currentMarketPrice, setCurrentMarketPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [strategy, setStrategy] = useState('');

  const handleZerodhaExecutions = (executions: KiteExecution[]) => {
    const result = buildZerodhaJournal(trades, executions);
    onSaveTrades(result.trades);
    return result.summary;
  };

  useEffect(() => {
    const clearZerodhaJournal = () => {
      const manualTrades = trades.filter((trade) => {
        const notes = String(trade.notes || '').toLowerCase();
        return !(trade.source === 'ZERODHA' || trade.id.startsWith('kite:') ||
          Boolean(trade.brokerTradeIds?.length) ||
          notes.includes('imported from zerodha') ||
          notes.includes('zerodha sell execution'));
      });
      onSaveTrades(manualTrades.map((trade, index) => ({ ...trade, serialNumber: index + 1 })));
    };
    window.addEventListener('moti-clear-zerodha-journal', clearZerodhaJournal);
    return () => window.removeEventListener('moti-clear-zerodha-journal', clearZerodhaJournal);
  }, [trades, onSaveTrades]);

  // One-time cleanup on load: legacy duplicate OPEN entries become one weighted-average position.
  useEffect(() => {
    const consolidated = consolidateOpenPositions(trades);
    const changed = consolidated.length !== trades.length ||
      consolidated.some((trade, index) =>
        trade.id !== trades[index]?.id ||
        trade.quantity !== trades[index]?.quantity ||
        trade.entryPrice !== trades[index]?.entryPrice ||
        trade.totalInvestment !== trades[index]?.totalInvestment ||
        (trade.status === 'CLOSED' && trade.actualPnl !== undefined && trade.netPnl !== trade.actualPnl) ||
        ['brokerage', 'otherCharges', 'chargesKnown'].some((field) => Object.prototype.hasOwnProperty.call(trade, field))
      );
    if (changed) onSaveTrades(consolidated);
  }, [trades, onSaveTrades]);

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
          unrealizedGrossPnl += gross;
          unrealizedNetPnl += gross;
        }
      } else {
        closedInvestment += t.totalInvestment;
        const net = Number(t.actualPnl ?? t.netPnl) || 0;
        const gross = t.actualPnl || 0;
        realizedGrossPnl += gross;
        realizedNetPnl += net;
        if (net > 0) winCount++;
        else if (net < 0) lossCount++;

        if (!bestTrade || net > (Number(bestTrade.actualPnl ?? bestTrade.netPnl) || 0)) {
          bestTrade = t;
        }
        // Worst Trade should only represent an actual losing trade.
        if (net < 0 && (!worstTrade || net < (Number(worstTrade.actualPnl ?? worstTrade.netPnl) || 0))) {
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

  // Open tab shows one weighted-average position per Zerodha exchange + symbol.
  // Overview and Closed Trades retain the original individual execution-lot records.
  const filteredTrades = useMemo(() => {
    const matchesSearch = (t: StockTrade) =>
      t.stockName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.entryDate.includes(searchTerm) ||
      (t.notes && t.notes.toLowerCase().includes(searchTerm.toLowerCase()));

    if (activeTab === 'OPEN') {
      const openRows = trades.filter((t) => t.status === 'OPEN');
      const manualRows = openRows.filter((t) => t.source !== 'ZERODHA');
      const zerodhaGroups = new Map<string, StockTrade[]>();
      openRows.filter((t) => t.source === 'ZERODHA').forEach((trade) => {
        const key = (trade.exchange || '') + ':' + trade.stockName.trim().toUpperCase();
        zerodhaGroups.set(key, [...(zerodhaGroups.get(key) || []), trade]);
      });
      const aggregatedZerodha = Array.from(zerodhaGroups.entries()).map(([key, rows]) => {
        const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
        const investment = rows.reduce((sum, row) => sum + row.totalInvestment, 0);
        const weightedAverage = quantity > 0 ? investment / quantity : 0;
        const latest = [...rows].sort((a, b) => {
          const [ad, am, ay] = a.entryDate.split('-').map(Number);
          const [bd, bm, by] = b.entryDate.split('-').map(Number);
          return new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime();
        })[0];
        return {
          ...latest,
          id: 'kite:open-position:' + key,
          entryDate: rows.length === 1 ? rows[0].entryDate : 'Multiple dates',
          entryPrice: weightedAverage,
          quantity,
          totalInvestment: investment,
          notes: rows.length + ' Zerodha BUY lots combined for this open position.',
        };
      });
      return [...manualRows, ...aggregatedZerodha].filter(matchesSearch);
    }

    return trades.filter((t) => {
      const matchesTab = activeTab === 'overview' || activeTab === 'tools' || t.status === activeTab;
      return matchesTab && matchesSearch(t);
    });
  }, [trades, activeTab, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / pageSize));
  const pageTrades = filteredTrades.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

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
      setTargetEarnings(trade.targetEarnings ? String(trade.targetEarnings) : '');
      setTradeStatus(trade.status);
      setCurrentMarketPrice(trade.currentMarketPrice ? String(trade.currentMarketPrice) : '');
      setNotes(trade.notes || '');
      setStrategy(trade.strategy || '');
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
      setTargetEarnings('');
      setTradeStatus('OPEN');
      setCurrentMarketPrice('');
      setNotes('');
      setStrategy('');
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
    const target = targetEarnings ? Number(targetEarnings) : undefined;
    const cmp = currentMarketPrice ? Number(currentMarketPrice) : ep;

    let actualPnl: number | undefined;
    let netPnl: number | undefined;
    let pnlPercentage: number | undefined;
    const isClosed = tradeStatus === 'CLOSED' && Number(exitPrice) > 0;

    if (isClosed) {
      const xp = Number(exitPrice);
      // Automatic Formulas:
      // P&L = (Exit Price - Entry Price) * Quantity
      actualPnl = (xp - ep) * qty;
      netPnl = actualPnl;
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
              targetEarnings: target,
              actualPnl,
              netPnl,
              pnlPercentage,
              status: isClosed ? ('CLOSED' as const) : ('OPEN' as const),
              currentMarketPrice: cmp,
              notes,
              strategy: strategy || undefined,
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
        targetEarnings: target,
        actualPnl,
        netPnl,
        pnlPercentage,
        status: isClosed ? ('CLOSED' as const) : ('OPEN' as const),
        currentMarketPrice: cmp,
        notes,
        strategy: strategy || undefined,
      };
      if (newTrade.status === 'OPEN') {
        const normalizedSymbol = newTrade.stockName.trim().toUpperCase();
        const existingIndex = trades.findIndex(
          (trade) => trade.status === 'OPEN' && trade.stockName.trim().toUpperCase() === normalizedSymbol
        );

        if (existingIndex >= 0) {
          const existing = trades[existingIndex];
          const combinedQuantity = existing.quantity + newTrade.quantity;
          const combinedInvestment = existing.totalInvestment + newTrade.totalInvestment;
          const weightedAverageEntry = combinedQuantity > 0 ? combinedInvestment / combinedQuantity : ep;
          const updated = trades.map((trade, index) => index === existingIndex
            ? {
                ...trade,
                entryPrice: weightedAverageEntry,
                quantity: combinedQuantity,
                totalInvestment: combinedInvestment,
                currentMarketPrice: currentMarketPrice ? cmp : (trade.currentMarketPrice || weightedAverageEntry),
                targetEarnings: target ?? trade.targetEarnings,
                notes: [trade.notes, notes].filter(Boolean).join(' | '),
              }
            : trade
          );
          onSaveTrades(updated.map((trade, index) => ({ ...trade, serialNumber: index + 1 })));
        } else {
          onSaveTrades([...trades, newTrade]);
        }
      } else {
        onSaveTrades([...trades, newTrade]);
      }
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
    const net = gross;
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
    <div className="moti-dashboard space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white sm:text-3xl">EQUITY TRADING JOURNAL</h1>
            <span className="rounded bg-emerald-300/10 px-2 py-0.5 text-xs font-bold text-cyan-300 border border-cyan-300/20">
              EQUITY ONLY
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            NSE/BSE equity cash executions · F&O excluded.
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
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-400/15 hover:from-emerald-200 hover:to-cyan-200 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>New Trade</span>
          </button>
        </div>
      </div>

      {activeTab === 'OPEN' && (
        <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-4 py-3">
          <p className="text-sm font-bold text-white">Open Positions</p>
          <p className="mt-1 text-xs text-slate-400">Only currently held Equity Delivery positions. Close or edit a position from its row.</p>
        </div>
      )}
      {activeTab === 'CLOSED' && (
        <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-4 py-3">
          <p className="text-sm font-bold text-white">Closed Trades</p>
          <p className="mt-1 text-xs text-slate-400">Your completed trades and realized performance history.</p>
        </div>
      )}
      {activeTab !== 'tools' && activeTab !== 'zerodha' && (
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search stock, date, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-[#1e2e4f] bg-[#0d1527] pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-300"
          />
        </div>
      )}

      {activeTab === 'overview' && (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-2xl border border-emerald-500/30 bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Realized P&L</span>
          <div
            className={`mt-1 text-lg font-black ${
              metrics.realizedNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {metrics.realizedNetPnl >= 0 ? '+' : ''}₹{formatINR(metrics.realizedNetPnl)}
          </div>
          <p className="text-[10px] text-slate-500">Gross P&L: ₹{formatINR(metrics.realizedGrossPnl)}</p>
        </div>

        <div className="rounded-2xl border border-cyan-300/20 bg-[#0d1527] p-3.5">
          <span className="text-[11px] font-semibold text-slate-400">Open Capital</span>
          <div className="mt-1 text-lg font-black text-cyan-300">
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
      )}

      {/* Equity Trading workspace navigation - placed directly above the trade ledger */}
      <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-2.5 shadow-lg shadow-black/10">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {([
            { id: 'overview', label: 'Overview', count: trades.length },
            { id: 'OPEN', label: 'Open Positions', count: new Set(trades.filter((t) => t.status === 'OPEN' && t.source === 'ZERODHA').map((t) => (t.exchange || '') + ':' + t.stockName.trim().toUpperCase())).size + trades.filter((t) => t.status === 'OPEN' && t.source !== 'ZERODHA').length },
            { id: 'CLOSED', label: 'Closed Trades', count: trades.filter((t) => t.status === 'CLOSED').length },
            { id: 'tools', label: 'Reports & Tools' },
            { id: 'zerodha', label: 'Zerodha Orders' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[58px] rounded-xl border px-3 py-2.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-emerald-300/60 ${activeTab === tab.id ? 'border-emerald-300 bg-emerald-300 text-[#04110d] shadow-md shadow-emerald-400/10' : 'border-[#1e2e4f] bg-[#070d18] text-slate-300 hover:border-slate-500 hover:bg-[#131f38] hover:text-white'}`}
            >
              <span className="block text-xs font-bold leading-tight">{tab.label}</span>
              {'count' in tab && <span className={`mt-1 block text-[10px] ${activeTab === tab.id ? 'text-slate-700' : 'text-slate-500'}`}>{tab.count} records</span>}
            </button>
          ))}
        </div>
      </div>

      {activeTab !== 'tools' && activeTab !== 'zerodha' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wide text-white">
              {activeTab === 'OPEN' ? 'Current Holdings' : activeTab === 'CLOSED' ? 'Trade History' : 'All Trades'}
            </h2>
            <span className="text-[10px] text-slate-500">{filteredTrades.length} shown</span>
          </div>
      {/* Trade ledger */}
      <div className="max-h-[72vh] overflow-auto rounded-2xl border border-[#1e2e4f] bg-[#0d1527] shadow-xl">
        <table className="w-full text-left border-collapse min-w-[1250px]">
          <thead className="sticky top-0 z-20">
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
              <th className="py-3 px-3 text-right">Net P&amp;L</th>
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
                const grossPnl = closed ? (exit - t.entryPrice) * t.quantity : 0;
                const pnl = closed ? grossPnl : 0;
                const pct = t.entryPrice > 0 && closed ? (pnl / (t.entryPrice * t.quantity)) * 100 : 0;
                const totalPnl = trades.slice(0, trades.indexOf(t) + 1)
                  .reduce((sum, trade) => sum + (trade.status === 'CLOSED' ? (Number(trade.actualPnl ?? trade.netPnl) || 0) : 0), 0);
                return (
                  <tr key={t.id} className="hover:bg-[#131f38]/50 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-500 font-bold">{t.serialNumber}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-300">{t.entryDate}</td>
                    <td className="py-3 px-3 font-extrabold text-white">{t.stockName}</td>
                    <td className="py-3 px-3 text-right text-slate-200">₹{formatINR(t.entryPrice)}</td>
                    <td className="py-3 px-3 text-right font-bold text-white">{t.quantity}</td>
                    <td className="py-3 px-3 text-right font-bold text-cyan-300">₹{formatINR(t.totalInvestment)}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-300">{closed ? (t.exitDate || '-') : '-'}</td>
                    <td className="py-3 px-3 text-right font-bold text-white">{closed ? '₹' + formatINR(exit) : '-'}</td>
                    <td className="py-3 px-3 text-right text-slate-400">-</td>
                    <td className="py-3 px-3 text-right text-slate-200">{closed ? '₹' + formatINR(targetEarn) : '-'}</td>
                    <td className={`py-3 px-3 text-right font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{closed ? (pnl >= 0 ? '+' : '-') + '₹' + formatINR(Math.abs(pnl)) : '-'}</td>
                    <td className="py-3 px-3 text-right font-black text-white">{closed ? '₹' + formatINR(totalPnl) : '-'}</td>
                    <td className={`py-3 px-3 text-right font-bold ${pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{closed ? pct.toFixed(2) + '%' : '-'}</td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        {!closed && !t.id.startsWith('kite:open-position:') && <button onClick={() => handleQuickClose(t)} title="Exit Trade" className="rounded-lg p-1.5 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"><CheckCircle className="h-4 w-4" /></button>}
                        {!t.id.startsWith('kite:open-position:') && <button onClick={() => handleOpenModal(t)} title="Edit Trade" className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1e2e4f] hover:text-white cursor-pointer"><Edit2 className="h-3.5 w-3.5" /></button>}
                        {!t.id.startsWith('kite:open-position:') && <button onClick={() => handleDeleteTrade(t.id, t.stockName)} title="Delete Trade" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
          {filteredTrades.length > pageSize && (
            <div className="flex flex-col gap-2 rounded-xl border border-[#1e2e4f] bg-[#0d1527] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-slate-400">
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredTrades.length)} of {filteredTrades.length} trades
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-[#1e2e4f] px-3 py-1.5 text-xs font-semibold text-slate-300 disabled:opacity-40"
                >Previous</button>
                <span className="text-xs text-slate-400">Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-[#1e2e4f] px-3 py-1.5 text-xs font-semibold text-slate-300 disabled:opacity-40"
                >Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={activeTab === 'zerodha' ? '' : 'hidden'}>
        <ZerodhaOrdersPanel onExecutionsChange={handleZerodhaExecutions} />
      </div>

      {activeTab === 'tools' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-black text-white">Reports & Tools</h2>
            <p className="mt-1 text-xs text-slate-400">Detailed analysis and review tools are grouped here to keep the trading workspace clean.</p>
          </div>
      {/* Detailed trading performance analytics; read-only and never mutates saved trades */}
      <TradingAnalyticsView trades={trades} />
      <EquityTradeCalendar trades={trades} />
      <MonthlyTradingReview trades={trades} />
      <OpenPortfolioAllocation trades={trades} />
      <EquityRiskCalculator />
        </div>
      )}

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
                    type="date"
                    required
                    value={entryDate ? entryDate.split("-").reverse().join("-") : ""}
                    onChange={(e) => setEntryDate(e.target.value ? e.target.value.split("-").reverse().join("-") : "")}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white [color-scheme:dark] focus:border-emerald-300 outline-none"
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
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs uppercase font-bold text-white focus:border-emerald-300 outline-none"
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
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white focus:border-emerald-300 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300">Quantity (Shares)</label>
                  <input
                    type="number"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white focus:border-emerald-300 outline-none"
                  />
                </div>
              </div>

              {/* Automatic Total Investment preview */}
              {entryPrice && quantity && (
                <div className="rounded-xl border border-cyan-300/20 bg-emerald-300/10 p-2.5 text-xs text-cyan-300 font-semibold flex justify-between">
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
                        ? 'border-amber-400 bg-amber-500/20 text-cyan-300'
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
                      type="date"
                      value={exitDate ? exitDate.split("-").reverse().join("-") : ""}
                      onChange={(e) => setExitDate(e.target.value ? e.target.value.split("-").reverse().join("-") : "")}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white [color-scheme:dark] outline-none"
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

              <div>
                <label className="block text-xs font-semibold text-slate-300">Trade Strategy</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="">Select strategy (optional)</option>
                  <option value="Breakout">Breakout</option>
                  <option value="Breakout Pullback">Breakout Pullback</option>
                  <option value="Support Bounce">Support Bounce</option>
                  <option value="Resistance Reversal">Resistance Reversal</option>
                  <option value="Moving Average Bounce">Moving Average Bounce</option>
                  <option value="Trend Following">Trend Following</option>
                  <option value="Volume Breakout">Volume Breakout</option>
                  <option value="News / Event Based">News / Event Based</option>
                  <option value="Other">Other</option>
                </select>
                <p className="mt-1 text-[10px] text-slate-500">Tag each trade to compare which setups perform best. Existing trades stay Unclassified until you edit and tag them.</p>
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
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 py-3 text-xs font-bold text-slate-950 shadow-lg hover:from-emerald-200 hover:to-cyan-200 transition-all cursor-pointer"
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
