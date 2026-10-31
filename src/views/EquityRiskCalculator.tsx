import React, { useMemo, useState } from 'react';
import { Calculator, ShieldCheck, AlertTriangle } from 'lucide-react';
import { formatINR } from '../utils/exportUtils';

const money = (value: number) => `₹${formatINR(value)}`;

export const EquityRiskCalculator: React.FC = () => {
  const [capital, setCapital] = useState('100000');
  const [riskPercent, setRiskPercent] = useState('1');
  const [entry, setEntry] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');

  const result = useMemo(() => {
    const c = Number(capital);
    const r = Number(riskPercent);
    const e = Number(entry);
    const s = Number(stopLoss);
    const t = Number(target);
    const validBase = Number.isFinite(c) && c > 0 && Number.isFinite(r) && r > 0 && r <= 100;
    const validPrices = Number.isFinite(e) && e > 0 && Number.isFinite(s) && s > 0 && s < e;
    const validTarget = Number.isFinite(t) && t > e;
    if (!validBase || !validPrices) return null;
    const riskBudget = c * r / 100;
    const riskPerShare = e - s;
    const sharesFromRisk = Math.floor(riskBudget / riskPerShare);
    const sharesFromCapital = Math.floor(c / e);
    const quantity = Math.max(0, Math.min(sharesFromRisk, sharesFromCapital));
    const investment = quantity * e;
    const plannedRisk = quantity * riskPerShare;
    const rewardPerShare = validTarget ? t - e : 0;
    const potentialReward = quantity * rewardPerShare;
    return {
      riskBudget, riskPerShare, sharesFromRisk, sharesFromCapital, quantity,
      investment, plannedRisk, potentialReward,
      riskReward: validTarget && riskPerShare > 0 ? rewardPerShare / riskPerShare : null,
      capitalLimited: sharesFromCapital < sharesFromRisk,
      validTarget,
    };
  }, [capital, riskPercent, entry, stopLoss, target]);

  return (
    <section className="space-y-4 rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Calculator className="h-5 w-5 text-amber-400" />
        <div><h2 className="text-sm font-black text-white">EQUITY RISK CALCULATOR</h2><p className="mt-1 text-[10px] text-slate-400">Plan quantity using your capital, entry and stop-loss · long delivery trades</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'TRADING CAPITAL (₹)', value: capital, set: setCapital, placeholder: '100000' },
          { label: 'RISK PER TRADE (%)', value: riskPercent, set: setRiskPercent, placeholder: '1' },
          { label: 'ENTRY PRICE (₹)', value: entry, set: setEntry, placeholder: 'e.g. 500' },
          { label: 'STOP-LOSS (₹)', value: stopLoss, set: setStopLoss, placeholder: 'e.g. 480' },
          { label: 'TARGET PRICE (₹)', value: target, set: setTarget, placeholder: 'e.g. 560' },
        ].map((field) => <label key={field.label} className="block"><span className="mb-1.5 block text-[9px] font-bold tracking-wide text-slate-400">{field.label}</span><input type="number" min="0" step="any" value={field.value} onChange={(e) => field.set(e.target.value)} placeholder={field.placeholder} className="w-full rounded-lg border border-[#263858] bg-[#070d18] px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-amber-400" /></label>)}
      </div>

      {result ? <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[9px] text-slate-400">RISK BUDGET</p><p className="mt-1 text-lg font-black text-rose-400">{money(result.riskBudget)}</p></div>
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[9px] text-slate-400">SUGGESTED QTY</p><p className="mt-1 text-lg font-black text-white">{result.quantity.toLocaleString('en-IN')} shares</p></div>
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[9px] text-slate-400">CAPITAL REQUIRED</p><p className="mt-1 text-lg font-black text-white">{money(result.investment)}</p></div>
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3"><p className="text-[9px] text-slate-400">PLANNED STOP LOSS</p><p className="mt-1 text-lg font-black text-rose-400">{money(result.plannedRisk)}</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3">
            <p className="text-[10px] font-bold text-slate-300">TARGET REWARD</p>
            <p className="mt-1 text-xl font-black text-emerald-400">{result.validTarget ? money(result.potentialReward) : 'Enter target above entry'}</p>
            <p className="mt-1 text-[10px] text-slate-500">Risk : Reward {result.riskReward ? `1 : ${result.riskReward.toFixed(2)}` : '—'}</p>
          </div>
          <div className="rounded-xl border border-[#1e2e4f] bg-[#070d18] p-3">
            {result.capitalLimited ? <><AlertTriangle className="mb-1 h-4 w-4 text-amber-400" /><p className="text-xs font-bold text-amber-300">Capital limit applied</p><p className="mt-1 text-[10px] text-slate-400">Risk-based quantity is {result.sharesFromRisk.toLocaleString('en-IN')}, but available capital can buy only {result.sharesFromCapital.toLocaleString('en-IN')} shares.</p></> : <><ShieldCheck className="mb-1 h-4 w-4 text-emerald-400" /><p className="text-xs font-bold text-emerald-300">Within capital limit</p><p className="mt-1 text-[10px] text-slate-400">Quantity is limited by your selected risk budget and available capital.</p></>}
          </div>
        </div>
        {result.quantity === 0 && <p className="text-xs text-amber-300">Risk budget is too small for even one share at this stop-loss distance.</p>}
      </div> : <p className="rounded-xl border border-dashed border-[#263858] p-4 text-center text-xs text-slate-500">Enter valid capital, risk %, entry price and a stop-loss below entry to calculate quantity.</p>}
      <p className="text-[10px] leading-relaxed text-slate-500">Planning estimate only. Quantity is the lower of risk-budget quantity and capital-affordable quantity. Assumes a long equity delivery trade; excludes brokerage, taxes, slippage and gap-down risk. A stop-loss does not guarantee execution at that price. This calculator does not place trades or change your journal.</p>
    </section>
  );
};
