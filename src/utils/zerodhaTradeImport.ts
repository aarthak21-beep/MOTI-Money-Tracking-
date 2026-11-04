import type { StockTrade } from '../types';

export type KiteFillCharges = {
  brokerage?: number;
  transaction_tax?: number;
  exchange_turnover_charge?: number;
  sebi_turnover_charge?: number;
  stamp_duty?: number;
  gst?: number;
  total?: number;
};

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
  charges?: KiteFillCharges;
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

const fillCharge = (fill: KiteExecution, field: keyof KiteFillCharges): number =>
  Number(fill.charges?.[field]) || 0;

/**
 * Rebuild broker-origin journal rows from the complete, de-duplicated fill history.
 * Charges are allocated from the order-level Kite virtual contract note to each fill,
 * then split between matched BUY/SELL lots. DP charges are not returned by this API.
 */
export const buildZerodhaJournal = (
  existingTrades: StockTrade[],
  executions: KiteExecution[],
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
  const lotsBySymbol = new Map<string, BuyLot[]>();
  const generated: StockTrade[] = [];
  let unmatchedSellFills = 0;
  let unmatchedSellQuantity = 0;

  const makeRecord = (id: string, buy: KiteExecution, quantity: number, sell?: KiteExecution): StockTrade => {
    const entryPrice = Number(buy.price);
    const exitPrice = sell ? Number(sell.price) : undefined;
    const totalInvestment = entryPrice * quantity;
    const actualPnl = sell && exitPrice !== undefined ? (exitPrice - entryPrice) * quantity : undefined;
    const buyRatio = Number(buy.quantity) > 0 ? quantity / Number(buy.quantity) : 0;
    const sellRatio = sell && Number(sell.quantity) > 0 ? quantity / Number(sell.quantity) : 0;
    const brokerage = fillCharge(buy, 'brokerage') * buyRatio +
      (sell ? fillCharge(sell, 'brokerage') * sellRatio : 0);
    const buyOther = Math.max(0, fillCharge(buy, 'total') - fillCharge(buy, 'brokerage')) * buyRatio;
    const sellOther = sell ? Math.max(0, fillCharge(sell, 'total') - fillCharge(sell, 'brokerage')) * sellRatio : 0;
    const chargesKnown = buy.charges?.total !== undefined && (!sell || sell.charges?.total !== undefined);
    const otherCharges = buyOther + sellOther;
    const totalCharges = brokerage + otherCharges;
    const netPnl = actualPnl === undefined ? undefined : chargesKnown ? actualPnl - totalCharges : actualPnl;
    return {
      id, serialNumber: 0, entryDate: toJournalDate(buy.fill_timestamp),
      stockName: String(buy.tradingsymbol).trim().toUpperCase(),
      entryPrice, quantity, totalInvestment,
      exitDate: sell ? toJournalDate(sell.fill_timestamp) : undefined, exitPrice,
      brokerage, otherCharges, chargesKnown,
      source: 'ZERODHA',
      brokerTradeIds: sell ? [String(buy.trade_id), String(sell.trade_id)] : [String(buy.trade_id)],
      actualPnl, netPnl,
      pnlPercentage: netPnl === undefined || totalInvestment <= 0 ? undefined : (netPnl / totalInvestment) * 100,
      status: sell ? 'CLOSED' : 'OPEN',
      notes: chargesKnown
        ? 'Imported from Zerodha. Charges include Kite order-wise brokerage, taxes and exchange fees; DP charges are not included in the Kite charges response.'
        : 'Imported from Zerodha fills. Actual charges are pending; P&L is before charges.',
    };
  };

  for (const fill of eligible) {
    const symbol = String(fill.tradingsymbol).trim().toUpperCase();
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
      unmatchedSellFills++;
      unmatchedSellQuantity += remainingToSell;
    }
  }

  lotsBySymbol.forEach((lots) => lots.forEach((lot) => {
    if (lot.remaining > 0) generated.push(makeRecord('kite:open:' + lot.fill.trade_id, lot.fill, lot.remaining));
  }));

  const manualTrades = existingTrades.filter((trade) =>
    trade.source !== 'ZERODHA' && !trade.id.startsWith('kite:')
  );
  const combined = [...manualTrades, ...generated].map((trade, index) => ({ ...trade, serialNumber: index + 1 }));
  return {
    trades: combined,
    summary: { eligibleFills: eligible.length, importedJournalRows: generated.length, unmatchedSellFills, unmatchedSellQuantity },
  };
};
