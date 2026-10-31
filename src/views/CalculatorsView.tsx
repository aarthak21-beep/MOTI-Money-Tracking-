import React, { useState } from 'react';
import {
  Calculator,
  TrendingUp,
  Percent,
  DollarSign,
  PiggyBank,
  Briefcase,
  Layers,
  ArrowRight,
  Clock,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2
} from 'lucide-react';
import {
  calculateStockPnl,
  calculateAverageBuyPrice,
  calculateBrokerageCharges,
  calculateSIP,
  calculateCompoundInterest,
  calculateWeeklyIncomeSummary,
  calculateMonthlySalary,
  calculateDailyIncome,
  calculateSavingsTarget,
  calculateBusinessProfit,
  calculateGST,
  calculateTargetProfit,
  BuyLot
} from '../utils/calculators';
import { formatINR } from '../utils/exportUtils';
import { UserProfile } from '../types';

interface CalculatorsViewProps {
  profile: UserProfile;
}

export const CalculatorsView: React.FC<CalculatorsViewProps> = ({ profile }) => {
  const [activeCalc, setActiveCalc] = useState<number>(1);

  // 1. Stock P&L State
  const [spEntry, setSpEntry] = useState('2850');
  const [spExit, setSpExit] = useState('3020');
  const [spQty, setSpQty] = useState('50');
  const [spBrok, setSpBrok] = useState('40');
  const [spOth, setSpOth] = useState('60');

  // 2. Average Buy Price State
  const [lots, setLots] = useState<BuyLot[]>([
    { price: 1600, quantity: 50 },
    { price: 1520, quantity: 30 },
    { price: 1480, quantity: 20 },
  ]);

  // 3. Brokerage Calculator State
  const [brBuy, setBrBuy] = useState('1500');
  const [brSell, setBrSell] = useState('1550');
  const [brQty, setBrQty] = useState('100');
  const [brType, setBrType] = useState<'delivery' | 'intraday'>('intraday');

  // 4. SIP State
  const [sipMonthly, setSipMonthly] = useState('15000');
  const [sipRate, setSipRate] = useState('14');
  const [sipYears, setSipYears] = useState('10');

  // 5. Compound Interest
  const [ciPrincipal, setCiPrincipal] = useState('200000');
  const [ciRate, setCiRate] = useState('8.5');
  const [ciYears, setCiYears] = useState('5');
  const [ciFreq, setCiFreq] = useState('4'); // quarterly

  // 6. Weekly Income
  const [wiDays, setWiDays] = useState<number[]>([2500, 2200, 3100, 2800, 3500, 1800, 0]);
  const [wiBonus, setWiBonus] = useState('2000');
  const [wiDeduct, setWiDeduct] = useState('3500');

  // 7. Monthly Salary
  const [salBasic, setSalBasic] = useState('45000');
  const [salHra, setSalHra] = useState('22500');
  const [salSpecial, setSalSpecial] = useState('15000');
  const [salOther, setSalOther] = useState('7500');
  const [salPf, setSalPf] = useState('5400');
  const [salPt, setSalPt] = useState('200');
  const [salTds, setSalTds] = useState('6500');

  // 8. Daily Income
  const [diS1, setDiS1] = useState('1800');
  const [diS2, setDiS2] = useState('2200');
  const [diBonus, setDiBonus] = useState('500');
  const [diFuel, setDiFuel] = useState('450');
  const [diFood, setDiFood] = useState('250');
  const [diHours, setDiHours] = useState('9');

  // 9. Savings Calculator
  const [savTarget, setSavTarget] = useState('500000');
  const [savCurrent, setSavCurrent] = useState('185000');
  const [savMonths, setSavMonths] = useState('14');

  // 10. Business Profit
  const [bpRev, setBpRev] = useState('450000');
  const [bpCogs, setBpCogs] = useState('180000');
  const [bpOpex, setBpOpex] = useState('95000');
  const [bpTaxRate, setBpTaxRate] = useState('22');

  // 11. GST Calculator
  const [gstAmount, setGstAmount] = useState('50000');
  const [gstRate, setGstRate] = useState('18');
  const [gstMode, setGstMode] = useState<'forward' | 'reverse'>('forward');

  // 12. Target Profit
  const [tpCapital, setTpCapital] = useState('100000');
  const [tpTargetPct, setTpTargetPct] = useState('15');
  const [tpRiskPct, setTpRiskPct] = useState('5');

  const calculatorList = [
    { id: 1, name: 'Stock Profit/Loss', desc: 'Realized gross, net & ROI %' },
    { id: 2, name: 'Average Buy Price', desc: 'Multi-lot weighted average' },
    { id: 3, name: 'Brokerage & Taxes', desc: 'STT, SEBI, GST breakdown' },
    { id: 4, name: 'Investment / SIP', desc: 'Compound wealth accumulation' },
    { id: 5, name: 'Compound Interest', desc: 'Maturity & compound growth' },
    { id: 6, name: 'Weekly Income', desc: '7-day run rate & deductions' },
    { id: 7, name: 'Monthly Salary', desc: 'Gross to in-hand take home' },
    { id: 8, name: 'Daily Shift & Hourly', desc: 'Shifts, fuel burn & hourly rate' },
    { id: 9, name: 'Savings Goal Target', desc: 'Required monthly & daily deposit' },
    { id: 10, name: 'Business Profit & Margin', desc: 'Gross margin, OPEX & net margin' },
    { id: 11, name: 'GST (Forward / Reverse)', desc: 'CGST, SGST & tax extraction' },
    { id: 12, name: 'Target Risk/Reward', desc: 'Capital allocation & target return' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="border-b border-[#1e2e4f] pb-4">
        <div className="flex items-center space-x-2">
          <h1 className="text-2xl font-black text-white sm:text-3xl">12 ADVANCED CALCULATORS</h1>
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-400 border border-amber-500/30">
            FINANCIAL SUITE
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Professional calculators with instant reactive precision, zero division errors, and real-time outputs.
        </p>
      </div>

      {/* Calculator Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {calculatorList.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCalc(c.id)}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
              activeCalc === c.id
                ? 'border-amber-500/60 bg-gradient-to-br from-amber-500/20 to-amber-600/5 text-white shadow-lg shadow-amber-500/10'
                : 'border-[#1e2e4f] bg-[#0d1527] text-slate-400 hover:text-white hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-amber-400">#{c.id}</span>
              {activeCalc === c.id && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
            </div>
            <p className="mt-1 text-xs font-bold text-white truncate">{c.name}</p>
            <p className="text-[10px] text-slate-500 truncate mt-0.5">{c.desc}</p>
          </button>
        ))}
      </div>

      {/* Active Calculator Box */}
      <div className="rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-2xl">
        {/* 1. Stock Profit / Loss */}
        {activeCalc === 1 && (() => {
          const res = calculateStockPnl({
            entryPrice: Number(spEntry),
            exitPrice: Number(spExit),
            quantity: Number(spQty),
            brokerage: Number(spBrok),
            otherCharges: Number(spOth),
          });
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">Stock Profit & Loss Calculator</h2>
                <p className="text-xs text-slate-400">Computes capital required, turnover, gross P&L, brokerage deductions and net ROI %.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Buy Entry Price (₹)</label>
                      <input
                        type="number"
                        value={spEntry}
                        onChange={(e) => setSpEntry(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Sell Exit Price (₹)</label>
                      <input
                        type="number"
                        value={spExit}
                        onChange={(e) => setSpExit(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Quantity (Shares)</label>
                    <input
                      type="number"
                      value={spQty}
                      onChange={(e) => setSpQty(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Brokerage (₹)</label>
                      <input
                        type="number"
                        value={spBrok}
                        onChange={(e) => setSpBrok(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">STT / Other Charges (₹)</label>
                      <input
                        type="number"
                        value={spOth}
                        onChange={(e) => setSpOth(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs text-white outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-500/30 bg-[#070d18] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-amber-400">Net Trade Outcome</span>
                    <div className={`mt-2 text-3xl font-black ${res.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {res.netPnl >= 0 ? '+' : ''}₹{formatINR(res.netPnl)}
                    </div>
                    <p className={`text-sm font-bold mt-1 ${res.pnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {res.pnlPercent >= 0 ? '+' : ''}{res.pnlPercent.toFixed(2)}% Net Return
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-[#1e2e4f] pt-3 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Total Capital Required:</span>
                      <span className="font-bold text-white">₹{formatINR(res.investment)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Gross Profit/Loss:</span>
                      <span className="font-bold text-white">₹{formatINR(res.grossPnl)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Total Charges Deducted:</span>
                      <span className="font-bold text-rose-400">-₹{formatINR(res.totalCharges)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 2. Average Buy Price */}
        {activeCalc === 2 && (() => {
          const res = calculateAverageBuyPrice(lots);
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">Average Buy Price Calculator</h2>
                <p className="text-xs text-slate-400">Calculates weighted average price for pyramid buying and averaging down.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs text-slate-400 font-semibold">
                    <span>Lots of Purchase</span>
                    <button
                      onClick={() => setLots([...lots, { price: 1000, quantity: 10 }])}
                      className="text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" /> Add Lot
                    </button>
                  </div>

                  {lots.map((lot, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-mono">#{idx + 1}</span>
                      <input
                        type="number"
                        placeholder="Price"
                        value={lot.price}
                        onChange={(e) => {
                          const copy = [...lots];
                          copy[idx].price = Number(e.target.value) || 0;
                          setLots(copy);
                        }}
                        className="flex-1 rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                      <input
                        type="number"
                        placeholder="Quantity"
                        value={lot.quantity}
                        onChange={(e) => {
                          const copy = [...lots];
                          copy[idx].quantity = Number(e.target.value) || 0;
                          setLots(copy);
                        }}
                        className="w-24 rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                      {lots.length > 1 && (
                        <button
                          onClick={() => setLots(lots.filter((_, i) => i !== idx))}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-amber-500/30 bg-[#070d18] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-amber-400">Weighted Average Buy Price</span>
                    <div className="mt-2 text-3xl font-black text-amber-300">
                      ₹{formatINR(res.averagePrice)}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Per share across {res.totalQty} total shares
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-[#1e2e4f] pt-3 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Total Shares Acquired:</span>
                      <span className="font-bold text-white">{res.totalQty} Units</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Total Capital Committed:</span>
                      <span className="font-bold text-white">₹{formatINR(res.totalCost)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3. Brokerage Calculator */}
        {activeCalc === 3 && (() => {
          const res = calculateBrokerageCharges({
            buyPrice: Number(brBuy),
            sellPrice: Number(brSell),
            quantity: Number(brQty),
            tradeType: brType,
          });
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">Brokerage & Statutory Charges Calculator</h2>
                <p className="text-xs text-slate-400">Accurate Indian regulatory charges: STT, Exchange transaction fee, SEBI charges, Stamp duty, and 18% GST.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setBrType('intraday')}
                      className={`rounded-xl py-2 text-xs font-bold border cursor-pointer ${
                        brType === 'intraday'
                          ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                          : 'border-[#1e2e4f] bg-[#070d18] text-slate-400'
                      }`}
                    >
                      Intraday (MIS)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrType('delivery')}
                      className={`rounded-xl py-2 text-xs font-bold border cursor-pointer ${
                        brType === 'delivery'
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                          : 'border-[#1e2e4f] bg-[#070d18] text-slate-400'
                      }`}
                    >
                      Delivery (CNC)
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Buy Price (₹)</label>
                      <input
                        type="number"
                        value={brBuy}
                        onChange={(e) => setBrBuy(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Sell Price (₹)</label>
                      <input
                        type="number"
                        value={brSell}
                        onChange={(e) => setBrSell(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300">Quantity</label>
                    <input
                      type="number"
                      value={brQty}
                      onChange={(e) => setBrQty(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-500/30 bg-[#070d18] p-5">
                  <span className="text-xs font-bold uppercase text-amber-400">Total Statutory Deductions</span>
                  <div className="mt-1 text-2xl font-black text-rose-400">
                    -₹{formatINR(res.totalCharges)}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Breakeven Sell Price: <span className="font-bold text-white">₹{formatINR(res.breakevenPrice)}</span>
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] border-t border-[#1e2e4f] pt-3">
                    <span className="text-slate-400">Brokerage: ₹{formatINR(res.brokerage)}</span>
                    <span className="text-slate-400">STT / CTT: ₹{formatINR(res.stt)}</span>
                    <span className="text-slate-400">Exchange Fee: ₹{formatINR(res.exchangeCharges)}</span>
                    <span className="text-slate-400">GST (18%): ₹{formatINR(res.gst)}</span>
                    <span className="text-slate-400">Stamp Duty: ₹{formatINR(res.stampDuty)}</span>
                    <span className="text-slate-400">SEBI Charges: ₹{formatINR(res.sebiCharges)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 4. SIP Calculator */}
        {activeCalc === 4 && (() => {
          const res = calculateSIP({
            monthlyInvestment: Number(sipMonthly),
            annualReturnRate: Number(sipRate),
            timePeriodYears: Number(sipYears),
          });
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">Systematic Investment Plan (SIP) Calculator</h2>
                <p className="text-xs text-slate-400">Projects compound returns from regular monthly disciplined investments.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Monthly Deposit (₹)</label>
                    <input
                      type="number"
                      value={sipMonthly}
                      onChange={(e) => setSipMonthly(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Expected Annual Return Rate (%)</label>
                    <input
                      type="number"
                      value={sipRate}
                      onChange={(e) => setSipRate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Time Horizon (Years)</label>
                    <input
                      type="number"
                      value={sipYears}
                      onChange={(e) => setSipYears(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-500/30 bg-[#070d18] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-emerald-400">Total Maturity Wealth</span>
                    <div className="mt-2 text-3xl font-black text-emerald-400">
                      ₹{formatINR(res.maturityValue)}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-[#1e2e4f] pt-3 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Total Amount Invested:</span>
                      <span className="font-bold text-white">₹{formatINR(res.totalInvested)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Estimated Wealth Gain:</span>
                      <span className="font-bold text-emerald-400">+₹{formatINR(res.estimatedReturns)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 5. Compound Interest */}
        {activeCalc === 5 && (() => {
          const res = calculateCompoundInterest({
            principal: Number(ciPrincipal),
            rate: Number(ciRate),
            years: Number(ciYears),
            frequency: Number(ciFreq),
          });
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">Compound Interest Calculator</h2>
                <p className="text-xs text-slate-400">Models growth with annual, semi-annual, quarterly, or monthly compounding.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Principal Deposit (₹)</label>
                    <input
                      type="number"
                      value={ciPrincipal}
                      onChange={(e) => setCiPrincipal(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Annual Rate (%)</label>
                      <input
                        type="number"
                        value={ciRate}
                        onChange={(e) => setCiRate(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Years</label>
                      <input
                        type="number"
                        value={ciYears}
                        onChange={(e) => setCiYears(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Compounding Frequency</label>
                    <select
                      value={ciFreq}
                      onChange={(e) => setCiFreq(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                    >
                      <option value="1">Annually (1x / year)</option>
                      <option value="2">Semi-Annually (2x / year)</option>
                      <option value="4">Quarterly (4x / year)</option>
                      <option value="12">Monthly (12x / year)</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-2xl border border-teal-500/30 bg-[#070d18] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-teal-400">Final Maturity Value</span>
                    <div className="mt-2 text-3xl font-black text-white">
                      ₹{formatINR(res.finalAmount)}
                    </div>
                    <p className="text-xs text-emerald-400 font-bold mt-1">
                      +₹{formatINR(res.interestEarned)} Interest Accrued
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 6. Weekly Income Calculator */}
        {activeCalc === 6 && (() => {
          const res = calculateWeeklyIncomeSummary({
            dailyRates: wiDays,
            bonuses: Number(wiBonus) || 0,
            deductions: Number(wiDeduct) || 0,
          });
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">Weekly Income Calculator</h2>
                <p className="text-xs text-slate-400">Sum daily shift rates across 7 days, add weekend bonuses and compute net weekly pocket.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="grid grid-cols-7 gap-1">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                      <div key={day} className="text-center">
                        <span className="text-[10px] text-slate-400 font-bold">{day}</span>
                        <input
                          type="number"
                          value={wiDays[i]}
                          onChange={(e) => {
                            const copy = [...wiDays];
                            copy[i] = Number(e.target.value) || 0;
                            setWiDays(copy);
                          }}
                          className="mt-1 w-full rounded border border-[#1e2e4f] bg-[#070d18] p-1 text-[11px] text-center font-bold text-white outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Weekly Bonus (₹)</label>
                      <input
                        type="number"
                        value={wiBonus}
                        onChange={(e) => setWiBonus(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-emerald-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Weekly Deductions (₹)</label>
                      <input
                        type="number"
                        value={wiDeduct}
                        onChange={(e) => setWiDeduct(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-rose-400 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-500/30 bg-[#070d18] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-blue-400">Net Weekly Retained</span>
                    <div className="mt-2 text-3xl font-black text-blue-300">
                      ₹{formatINR(res.totalNet)}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Daily Average: ₹{formatINR(res.dailyAverage)} / day
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 7. Monthly Salary Calculator */}
        {activeCalc === 7 && (() => {
          const res = calculateMonthlySalary({
            basic: Number(salBasic),
            hra: Number(salHra),
            specialAllowance: Number(salSpecial),
            otherAllowances: Number(salOther),
            pfDeduction: Number(salPf),
            professionalTax: Number(salPt),
            tds: Number(salTds),
          });
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">Monthly Salary (In-Hand) Calculator</h2>
                <p className="text-xs text-slate-400">Breakdown of Basic, HRA, Allowances, PF, PT, and TDS to compute net monthly take-home salary.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-300">Basic (₹)</label>
                      <input
                        type="number"
                        value={salBasic}
                        onChange={(e) => setSalBasic(e.target.value)}
                        className="w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300">HRA (₹)</label>
                      <input
                        type="number"
                        value={salHra}
                        onChange={(e) => setSalHra(e.target.value)}
                        className="w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-300">Special Allowance (₹)</label>
                      <input
                        type="number"
                        value={salSpecial}
                        onChange={(e) => setSalSpecial(e.target.value)}
                        className="w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300">Other Allowances (₹)</label>
                      <input
                        type="number"
                        value={salOther}
                        onChange={(e) => setSalOther(e.target.value)}
                        className="w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1.5 text-xs font-bold text-white outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-300">PF (₹)</label>
                      <input
                        type="number"
                        value={salPf}
                        onChange={(e) => setSalPf(e.target.value)}
                        className="w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2 py-1.5 text-xs font-bold text-rose-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300">PT (₹)</label>
                      <input
                        type="number"
                        value={salPt}
                        onChange={(e) => setSalPt(e.target.value)}
                        className="w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2 py-1.5 text-xs font-bold text-rose-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300">TDS (₹)</label>
                      <input
                        type="number"
                        value={salTds}
                        onChange={(e) => setSalTds(e.target.value)}
                        className="w-full rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2 py-1.5 text-xs font-bold text-rose-400 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-500/30 bg-[#070d18] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-emerald-400">Monthly In-Hand Net</span>
                    <div className="mt-2 text-3xl font-black text-emerald-400">
                      ₹{formatINR(res.netInHand)}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Annualized In-Hand CTC: ₹{formatINR(res.yearlyInHand)}
                    </p>
                  </div>
                  <div className="mt-4 space-y-2 border-t border-[#1e2e4f] pt-3 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Gross Monthly Pay:</span>
                      <span className="font-bold text-white">₹{formatINR(res.grossSalary)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Total Statutory Deductions:</span>
                      <span className="font-bold text-rose-400">-₹{formatINR(res.totalDeductions)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 8. Daily Shift & Hourly */}
        {activeCalc === 8 && (() => {
          const res = calculateDailyIncome({
            shifts: [Number(diS1) || 0, Number(diS2) || 0],
            incentive: Number(diBonus) || 0,
            tips: 0,
            fuelExpense: Number(diFuel) || 0,
            foodExpense: Number(diFood) || 0,
            hoursWorked: Number(diHours) || 8,
          });
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">Daily Shift & Effective Hourly Rate</h2>
                <p className="text-xs text-slate-400">Ideal for delivery drivers, cab partners, and freelancers to know real hourly yield after fuel and food costs.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Shift 1 (₹)</label>
                      <input
                        type="number"
                        value={diS1}
                        onChange={(e) => setDiS1(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Shift 2 (₹)</label>
                      <input
                        type="number"
                        value={diS2}
                        onChange={(e) => setDiS2(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Incentive (₹)</label>
                      <input
                        type="number"
                        value={diBonus}
                        onChange={(e) => setDiBonus(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs font-bold text-emerald-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Fuel Burn (₹)</label>
                      <input
                        type="number"
                        value={diFuel}
                        onChange={(e) => setDiFuel(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs font-bold text-rose-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Hours Active</label>
                      <input
                        type="number"
                        value={diHours}
                        onChange={(e) => setDiHours(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-1.5 text-xs font-bold text-amber-300 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-500/30 bg-[#070d18] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-emerald-400">Net Take-Home Today</span>
                    <div className="mt-2 text-3xl font-black text-emerald-400">
                      ₹{formatINR(res.netDaily)}
                    </div>
                    <p className="text-xs text-amber-400 font-bold mt-1">
                      Effective Rate: ₹{res.effectiveHourlyRate.toFixed(1)} / hour
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 9. Savings Goal Target */}
        {activeCalc === 9 && (() => {
          const res = calculateSavingsTarget({
            targetAmount: Number(savTarget),
            currentSaved: Number(savCurrent),
            monthsToGoal: Number(savMonths),
          });
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">Savings Target & Cadence Calculator</h2>
                <p className="text-xs text-slate-400">Identifies exact monthly and daily savings required to hit a goal deadline.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Target Goal Amount (₹)</label>
                    <input
                      type="number"
                      value={savTarget}
                      onChange={(e) => setSavTarget(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Current Savings (₹)</label>
                      <input
                        type="number"
                        value={savCurrent}
                        onChange={(e) => setSavCurrent(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-emerald-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Months Left</label>
                      <input
                        type="number"
                        value={savMonths}
                        onChange={(e) => setSavMonths(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-teal-500/30 bg-[#070d18] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-teal-400">Required Monthly Savings</span>
                    <div className="mt-2 text-3xl font-black text-teal-300">
                      ₹{formatINR(res.requiredMonthly)}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Approx ₹{formatINR(res.requiredDaily)} / day needed
                    </p>
                  </div>
                  <div className="mt-4 border-t border-[#1e2e4f] pt-3 text-xs flex justify-between">
                    <span className="text-slate-400">Current Progress:</span>
                    <span className="font-bold text-emerald-400">{res.progressPercent.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 10. Business Profit & Margin */}
        {activeCalc === 10 && (() => {
          const res = calculateBusinessProfit({
            grossRevenue: Number(bpRev),
            costOfGoodsSold: Number(bpCogs),
            operatingExpenses: Number(bpOpex),
            taxRatePercent: Number(bpTaxRate),
          });
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">Business Profit & Operating Margin</h2>
                <p className="text-xs text-slate-400">Evaluates gross profit, operating profit, corporate tax, and bottom-line net profit margin %.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Total Gross Revenue (₹)</label>
                    <input
                      type="number"
                      value={bpRev}
                      onChange={(e) => setBpRev(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">COGS / Direct Costs (₹)</label>
                      <input
                        type="number"
                        value={bpCogs}
                        onChange={(e) => setBpCogs(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">OPEX / Overheads (₹)</label>
                      <input
                        type="number"
                        value={bpOpex}
                        onChange={(e) => setBpOpex(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-purple-500/30 bg-[#070d18] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-purple-400">Net Business Profit</span>
                    <div className="mt-2 text-3xl font-black text-purple-300">
                      ₹{formatINR(res.netProfit)}
                    </div>
                    <p className="text-xs text-emerald-400 font-bold mt-1">
                      Net Profit Margin: {res.netMargin.toFixed(2)}%
                    </p>
                  </div>
                  <div className="mt-4 border-t border-[#1e2e4f] pt-3 text-xs space-y-1 text-slate-400">
                    <div className="flex justify-between">
                      <span>Gross Profit:</span>
                      <span className="font-bold text-white">₹{formatINR(res.grossProfit)} ({res.grossMargin.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 11. GST Calculator */}
        {activeCalc === 11 && (() => {
          const res = calculateGST({
            amount: Number(gstAmount),
            ratePercent: Number(gstRate),
            mode: gstMode,
          });
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">GST Forward & Reverse Calculator</h2>
                <p className="text-xs text-slate-400">Computes base price, CGST, SGST, and total invoice value under 5%, 12%, 18%, or 28% slabs.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setGstMode('forward')}
                      className={`rounded-xl py-2 text-xs font-bold border cursor-pointer ${
                        gstMode === 'forward'
                          ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                          : 'border-[#1e2e4f] bg-[#070d18] text-slate-400'
                      }`}
                    >
                      Forward (+GST)
                    </button>
                    <button
                      type="button"
                      onClick={() => setGstMode('reverse')}
                      className={`rounded-xl py-2 text-xs font-bold border cursor-pointer ${
                        gstMode === 'reverse'
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                          : 'border-[#1e2e4f] bg-[#070d18] text-slate-400'
                      }`}
                    >
                      Reverse (Extract GST)
                    </button>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300">
                      {gstMode === 'forward' ? 'Base Amount (₹)' : 'Total Inclusive Amount (₹)'}
                    </label>
                    <input
                      type="number"
                      value={gstAmount}
                      onChange={(e) => setGstAmount(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300">GST Slab</label>
                    <div className="mt-1 grid grid-cols-4 gap-2">
                      {['5', '12', '18', '28'].map((rate) => (
                        <button
                          type="button"
                          key={rate}
                          onClick={() => setGstRate(rate)}
                          className={`rounded-lg py-1.5 text-xs font-bold border cursor-pointer ${
                            gstRate === rate
                              ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                              : 'border-[#1e2e4f] bg-[#070d18] text-slate-400'
                          }`}
                        >
                          {rate}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-500/30 bg-[#070d18] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-amber-400">Total Invoice Amount</span>
                    <div className="mt-2 text-3xl font-black text-white">
                      ₹{formatINR(res.totalAmount)}
                    </div>
                    <p className="text-xs text-amber-300 font-bold mt-1">
                      Total GST: ₹{formatINR(res.gstAmount)} ({gstRate}%)
                    </p>
                  </div>
                  <div className="mt-4 border-t border-[#1e2e4f] pt-3 text-xs space-y-1 text-slate-400">
                    <div className="flex justify-between">
                      <span>Base Net Amount:</span>
                      <span className="font-bold text-white">₹{formatINR(res.baseAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>CGST ({Number(gstRate) / 2}%):</span>
                      <span className="font-bold text-white">₹{formatINR(res.cgst)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST ({Number(gstRate) / 2}%):</span>
                      <span className="font-bold text-white">₹{formatINR(res.sgst)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 12. Target Profit */}
        {activeCalc === 12 && (() => {
          const res = calculateTargetProfit({
            capital: Number(tpCapital),
            targetProfitPercent: Number(tpTargetPct),
            maxRiskPercent: Number(tpRiskPct),
          });
          return (
            <div className="space-y-6">
              <div className="border-b border-[#1e2e4f] pb-3">
                <h2 className="text-lg font-bold text-white">Target Profit & Risk/Reward Ratio</h2>
                <p className="text-xs text-slate-400">Formulates trade sizing, profit targets, stop loss buffer, and R:R ratio.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300">Capital Allocated (₹)</label>
                    <input
                      type="number"
                      value={tpCapital}
                      onChange={(e) => setTpCapital(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-white outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Target Profit (%)</label>
                      <input
                        type="number"
                        value={tpTargetPct}
                        onChange={(e) => setTpTargetPct(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-emerald-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300">Max Risk (%)</label>
                      <input
                        type="number"
                        value={tpRiskPct}
                        onChange={(e) => setTpRiskPct(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs font-bold text-rose-400 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-500/30 bg-[#070d18] p-5 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase text-amber-400">Target Return Amount</span>
                    <div className="mt-2 text-3xl font-black text-emerald-400">
                      +₹{formatINR(res.targetProfitAmount)}
                    </div>
                    <p className="text-xs text-rose-400 font-bold mt-1">
                      Max Risk Allowed: -₹{formatINR(res.maxRiskAmount)}
                    </p>
                  </div>
                  <div className="mt-4 border-t border-[#1e2e4f] pt-3 text-xs flex justify-between">
                    <span className="text-slate-400">Risk-to-Reward Ratio:</span>
                    <span className="font-black text-white text-sm">1 : {res.riskRewardRatio.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
