/**
 * MOTI Advanced Financial Calculators
 * All calculations use safe formulas avoiding #DIV/0! or NaN
 */

// 1. Stock Profit / Loss
export interface StockPnlInput {
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  brokerage: number;
  otherCharges: number;
}
export function calculateStockPnl(input: StockPnlInput) {
  const investment = (input.entryPrice || 0) * (input.quantity || 0);
  const turnover = ((input.entryPrice || 0) + (input.exitPrice || 0)) * (input.quantity || 0);
  const grossPnl = ((input.exitPrice || 0) - (input.entryPrice || 0)) * (input.quantity || 0);
  const totalCharges = (input.brokerage || 0) + (input.otherCharges || 0);
  const netPnl = grossPnl - totalCharges;
  const pnlPercent = investment > 0 ? (netPnl / investment) * 100 : 0;
  return { investment, turnover, grossPnl, totalCharges, netPnl, pnlPercent };
}

// 2. Average Buy Price
export interface BuyLot {
  price: number;
  quantity: number;
}
export function calculateAverageBuyPrice(lots: BuyLot[]) {
  let totalQty = 0;
  let totalCost = 0;
  for (const lot of lots) {
    if (lot.price > 0 && lot.quantity > 0) {
      totalQty += lot.quantity;
      totalCost += lot.price * lot.quantity;
    }
  }
  const averagePrice = totalQty > 0 ? totalCost / totalQty : 0;
  return { totalQty, totalCost, averagePrice };
}

// 3. Brokerage Calculator
export interface BrokerageInput {
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  tradeType: 'delivery' | 'intraday';
}
export function calculateBrokerageCharges(input: BrokerageInput) {
  const buyTurnover = (input.buyPrice || 0) * (input.quantity || 0);
  const sellTurnover = (input.sellPrice || 0) * (input.quantity || 0);
  const totalTurnover = buyTurnover + sellTurnover;

  let brokerage = 0;
  let stt = 0;
  if (input.tradeType === 'delivery') {
    brokerage = Math.min(20, totalTurnover * 0.001); // max 20 or 0.1%
    stt = totalTurnover * 0.001; // 0.1% on buy & sell
  } else {
    brokerage = Math.min(40, totalTurnover * 0.0003); // max 20 per leg
    stt = sellTurnover * 0.00025; // 0.025% on sell side only
  }

  const exchangeCharges = totalTurnover * 0.0000345;
  const sebiCharges = totalTurnover * 0.000001;
  const stampDuty = buyTurnover * (input.tradeType === 'delivery' ? 0.00015 : 0.00003);
  const gst = (brokerage + exchangeCharges) * 0.18;
  const totalCharges = brokerage + stt + exchangeCharges + sebiCharges + stampDuty + gst;
  const netTurnoverBreakeven = input.quantity > 0 ? (buyTurnover + totalCharges) / input.quantity : 0;

  return {
    buyTurnover,
    sellTurnover,
    totalTurnover,
    brokerage,
    stt,
    exchangeCharges,
    sebiCharges,
    stampDuty,
    gst,
    totalCharges,
    breakevenPrice: netTurnoverBreakeven
  };
}

// 4. Investment / SIP Calculator
export interface SipInput {
  monthlyInvestment: number;
  annualReturnRate: number; // in percent, e.g. 12
  timePeriodYears: number;
}
export function calculateSIP(input: SipInput) {
  const P = input.monthlyInvestment || 0;
  const i = (input.annualReturnRate || 0) / 12 / 100;
  const n = (input.timePeriodYears || 0) * 12;

  const totalInvested = P * n;
  let maturityValue = 0;

  if (i > 0 && n > 0) {
    maturityValue = P * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
  } else {
    maturityValue = totalInvested;
  }

  const estimatedReturns = maturityValue - totalInvested;
  return { totalInvested, maturityValue, estimatedReturns };
}

// 5. Compound Interest
export interface CompoundInput {
  principal: number;
  rate: number; // annual %
  years: number;
  frequency: number; // 1 = yearly, 4 = quarterly, 12 = monthly
}
export function calculateCompoundInterest(input: CompoundInput) {
  const P = input.principal || 0;
  const r = (input.rate || 0) / 100;
  const n = input.frequency || 1;
  const t = input.years || 0;

  const amount = P * Math.pow(1 + r / n, n * t);
  const interestEarned = amount - P;
  return { finalAmount: amount, interestEarned, principal: P };
}

// 6. Weekly Income Calculator
export interface WeeklyCalcInput {
  dailyRates: number[]; // 7 days
  bonuses: number;
  deductions: number;
}
export function calculateWeeklyIncomeSummary(input: WeeklyCalcInput) {
  const grossDaily = input.dailyRates.reduce((sum, val) => sum + (val || 0), 0);
  const totalGross = grossDaily + (input.bonuses || 0);
  const totalNet = Math.max(0, totalGross - (input.deductions || 0));
  const dailyAverage = grossDaily / 7;
  return { grossDaily, totalGross, totalNet, dailyAverage };
}

// 7. Monthly Salary Calculator
export interface SalaryInput {
  basic: number;
  hra: number;
  specialAllowance: number;
  otherAllowances: number;
  pfDeduction: number;
  professionalTax: number;
  tds: number;
}
export function calculateMonthlySalary(input: SalaryInput) {
  const grossSalary =
    (input.basic || 0) +
    (input.hra || 0) +
    (input.specialAllowance || 0) +
    (input.otherAllowances || 0);
  const totalDeductions =
    (input.pfDeduction || 0) +
    (input.professionalTax || 0) +
    (input.tds || 0);
  const netInHand = grossSalary - totalDeductions;
  const yearlyGross = grossSalary * 12;
  const yearlyInHand = netInHand * 12;

  return { grossSalary, totalDeductions, netInHand, yearlyGross, yearlyInHand };
}

// 8. Daily Income Calculator
export interface DailyCalcInput {
  shifts: number[];
  incentive: number;
  tips: number;
  fuelExpense: number;
  foodExpense: number;
  hoursWorked: number;
}
export function calculateDailyIncome(input: DailyCalcInput) {
  const shiftSum = input.shifts.reduce((sum, s) => sum + (s || 0), 0);
  const grossIncome = shiftSum + (input.incentive || 0) + (input.tips || 0);
  const totalExpenses = (input.fuelExpense || 0) + (input.foodExpense || 0);
  const netDaily = grossIncome - totalExpenses;
  const effectiveHourlyRate = (input.hoursWorked || 0) > 0 ? netDaily / input.hoursWorked : 0;

  return { grossIncome, totalExpenses, netDaily, effectiveHourlyRate };
}

// 9. Savings Calculator
export interface SavingsCalcInput {
  targetAmount: number;
  currentSaved: number;
  monthsToGoal: number;
}
export function calculateSavingsTarget(input: SavingsCalcInput) {
  const remaining = Math.max(0, (input.targetAmount || 0) - (input.currentSaved || 0));
  const months = input.monthsToGoal > 0 ? input.monthsToGoal : 1;
  const requiredMonthly = remaining / months;
  const requiredDaily = requiredMonthly / 30;
  const progressPercent = (input.targetAmount || 0) > 0 ? ((input.currentSaved || 0) / input.targetAmount) * 100 : 0;

  return { remaining, requiredMonthly, requiredDaily, progressPercent };
}

// 10. Business Profit Calculator
export interface BusinessProfitInput {
  grossRevenue: number;
  costOfGoodsSold: number;
  operatingExpenses: number;
  taxRatePercent: number;
}
export function calculateBusinessProfit(input: BusinessProfitInput) {
  const grossProfit = (input.grossRevenue || 0) - (input.costOfGoodsSold || 0);
  const operatingProfit = grossProfit - (input.operatingExpenses || 0);
  const tax = operatingProfit > 0 ? operatingProfit * ((input.taxRatePercent || 0) / 100) : 0;
  const netProfit = operatingProfit - tax;

  const grossMargin = (input.grossRevenue || 0) > 0 ? (grossProfit / input.grossRevenue) * 100 : 0;
  const netMargin = (input.grossRevenue || 0) > 0 ? (netProfit / input.grossRevenue) * 100 : 0;

  return { grossProfit, operatingProfit, tax, netProfit, grossMargin, netMargin };
}

// 11. GST Calculator (Forward & Reverse)
export interface GstInput {
  amount: number;
  ratePercent: number; // 5, 12, 18, 28
  mode: 'forward' | 'reverse'; // forward = add GST, reverse = extract GST
}
export function calculateGST(input: GstInput) {
  const rate = input.ratePercent || 18;
  const amt = input.amount || 0;

  if (input.mode === 'forward') {
    const gstAmount = (amt * rate) / 100;
    const cgst = gstAmount / 2;
    const sgst = gstAmount / 2;
    const totalAmount = amt + gstAmount;
    return { baseAmount: amt, gstAmount, cgst, sgst, totalAmount };
  } else {
    const baseAmount = (amt * 100) / (100 + rate);
    const gstAmount = amt - baseAmount;
    const cgst = gstAmount / 2;
    const sgst = gstAmount / 2;
    const totalAmount = amt;
    return { baseAmount, gstAmount, cgst, sgst, totalAmount };
  }
}

// 12. Target Profit Calculator
export interface TargetProfitInput {
  capital: number;
  targetProfitPercent: number;
  maxRiskPercent: number;
}
export function calculateTargetProfit(input: TargetProfitInput) {
  const cap = input.capital || 0;
  const targetProfitAmount = cap * ((input.targetProfitPercent || 0) / 100);
  const maxRiskAmount = cap * ((input.maxRiskPercent || 0) / 100);
  const riskRewardRatio = maxRiskAmount > 0 ? targetProfitAmount / maxRiskAmount : 0;

  return { targetProfitAmount, maxRiskAmount, riskRewardRatio };
}
