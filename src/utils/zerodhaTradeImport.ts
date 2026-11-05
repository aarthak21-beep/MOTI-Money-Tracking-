import type { StockTrade } from '../types';

export type KiteExecution = {
  trade_id: string;
  order_id?: string;
  exchange?: string;
  tradingsymbol?: string;
  transaction_type?: string;
  quantity?: number;
  price?: number;
  fill_timestamp?: string;
  product?: string;
};

export type KiteImportSummary = {
  eligibleFills: number;
  importedJournalRows: number;
  unmatchedSellFills: number;
  unmatchedSellQuantity: number;
};

const toJournalDate = (value?: string): string => {
  if (!value) return new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  return [String(parsed.getDate()).padStart(2, '0'), String(parsed.getMonth() + 1).padStart(2, '0'), parsed.getFullYear()].join('-');
};

const timestamp = (value?: string): number => {
  if (!value) return 0;
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T')).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Rebuild broker-origin journal rows from the complete, de-duplicated fill history.
 */
export const buildZerodhaJournal = (
  existingTrades: StockTrade[],
  executions: KiteExecution[],
  ignoredJournalRowIds: readonly string[] = [],
): { trades: StockTrade[]; summary: KiteImportSummary } => {
  const unique = new Map<string, KiteExecution>();
  executions.forEach((fill) => {
    const id = String(fill.trade_id || '').trim();
    if (id) unique.set(id, fill);
  });

  const eligible = Array.from(unique.values()).filter((fill) =>
    ['NSE', 'BSE'].includes(String(fill.exchange || '').toUpperCase()) &&
    Boolean(fill.tradingsymbol?.trim()) &&
    ['BUY', 'SELL'].includes(String(fill.transaction_type || '').toUpperCase()) &&
    Number(fill.quantity) > 0 &&
    Number(fill.price) > 0
  ).sort((a, b) => timestamp(a.fill_timestamp) - timestamp(b.fill_timestamp) ||
    String(a.trade_id).localeCompare(String(b.trade_id)));

  type BuyLot = { fill: KiteExecution; remaining: number };
  // Match the same equity symbol across NSE/BSE. The exchange is retained on
  // each journal row for reference, but it must not create a false open lot.
  const lotsBySymbol = new Map<string, BuyLot[]>();
  const generated: StockTrade[] = [];
  let unmatchedSellFills = 0;
  let unmatchedSellQuantity = 0;

  const makeRecord = (id: string, buy: KiteExecution, quantity: number, sell?: KiteExecution): StockTrade => {
    const entryPrice = Number(buy.price);
    const exitPrice = sell ? Number(sell.price) : undefined;
    const totalInvestment = entryPrice * quantity;
    const actualPnl = sell && exitPrice !== undefined ? (exitPrice - entryPrice) * quantity : undefined;
    const netPnl = actualPnl;
    return {
      id, serialNumber: 0, entryDate: toJournalDate(buy.fill_timestamp),
      stockName: String(buy.tradingsymbol).trim().toUpperCase(),
      exchange: String(buy.exchange || '').trim().toUpperCase(),
      entryPrice, quantity, totalInvestment,
      exitDate: sell ? toJournalDate(sell.fill_timestamp) : undefined, exitPrice,
      source: 'ZERODHA',
      brokerTradeIds: sell ? [String(buy.trade_id), String(sell.trade_id)] : [String(buy.trade_id)],
      actualPnl, netPnl,
      pnlPercentage: netPnl === undefined || totalInvestment <= 0 ? undefined : (netPnl / totalInvestment) * 100,
      status: sell ? 'CLOSED' : 'OPEN',
      notes: 'Imported from Zerodha trade executions.',
    };
  };

  for (const fill of eligible) {
    const symbol = String(fill.tradingsymbol).trim().toUpperCase();
    const exchange = String(fill.exchange || '').trim().toUpperCase();
    const side = String(fill.transaction_type).toUpperCase();
    const quantity = Number(fill.quantity);
    if (side === 'BUY') {
      const lots = lotsBySymbol.get(symbol) || [];
      lots.push({ fill, remaining: quantity });
      lotsBySymbol.set(symbol, lots);
      continue;
    }
    let remainingToSell = quantity;
    const lots = lotsBySymbol.get(symbol) || [];
    for (const lot of lots) {
      if (remainingToSell <= 0) break;
      if (lot.remaining <= 0) continue;
      const matched = Math.min(lot.remaining, remainingToSell);
      generated.push(makeRecord('kite:closed:' + fill.trade_id + ':' + lot.fill.trade_id, lot.fill, matched, fill));
      lot.remaining -= matched;
      remainingToSell -= matched;
    }
    if (remainingToSell > 0) {
      // Keep the real SELL execution visible in the journal even when its
      // opening BUY is outside the available Kite trade history. Do not invent
      // an entry price or realized P&L; those remain unknown until basis exists.
      unmatchedSellFills++;
      unmatchedSellQuantity += remainingToSell;
      generated.push({
        id: 'kite:unmatched-sell:' + fill.trade_id,
        serialNumber: 0,
        entryDate: toJournalDate(fill.fill_timestamp),
        stockName: symbol,
        exchange,
        entryPrice: 0,
        quantity: remainingToSell,
        totalInvestment: 0,
        exitDate: toJournalDate(fill.fill_timestamp),
        exitPrice: Number(fill.price),
        source: 'ZERODHA',
        brokerTradeIds: [String(fill.trade_id)],
        status: 'CLOSED',
        notes: 'Zerodha SELL execution imported. Earlier BUY is not present in available history; entry cost and realized P&L are unknown.',
      });
    }
  }

  lotsBySymbol.forEach((lots) => lots.forEach((lot) => {
    if (lot.remaining > 0) generated.push(makeRecord('kite:open:' + lot.fill.trade_id, lot.fill, lot.remaining));
  }));

  const manualTrades = existingTrades.filter((trade) => {
    const notes = String(trade.notes || '').toLowerCase();
    return !(trade.source === 'ZERODHA' || trade.id.startsWith('kite:') ||
      Boolean(trade.brokerTradeIds?.length) ||
      notes.includes('imported from zerodha') ||
      notes.includes('zerodha sell execution'));
  });
  const ignoredIds = new Set(ignoredJournalRowIds);
  const visibleGenerated = generated.filter((trade) => !ignoredIds.has(trade.id));
  const combined = [...manualTrades, ...visibleGenerated].map((trade, index) => ({ ...trade, serialNumber: index + 1 }));
  return {
    trades: combined,
    summary: { eligibleFills: eligible.length, importedJournalRows: visibleGenerated.length, unmatchedSellFills, unmatchedSellQuantity },
  };
};
