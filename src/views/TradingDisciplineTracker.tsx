import React, { useMemo, useState } from 'react';
import { ShieldCheck, Save, AlertTriangle, TrendingUp } from 'lucide-react';
import { StockTrade } from '../types';

interface TradingDisciplineTrackerProps {
  trades: StockTrade[];
  onSaveTrades: (trades: StockTrade[]) => void;
}

type ReviewChoice = '' | 'yes' | 'no' | 'na';
const mistakes = ['FOMO entry', 'Overtrading', 'Revenge trading', 'Early exit', 'Late entry', 'Ignored stop-loss', 'Increased quantity impulsively', 'Exited without a clear reason'];

const Choice = ({ label, value, onChange }: { label: string; value: ReviewChoice; onChange: (value: ReviewChoice) => void }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold text-slate-300">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value as ReviewChoice)} className="w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none focus:border-amber-400">
      <option value="">Not reviewed</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
      <option value="na">Not applicable</option>
    </select>
  </label>
);

export const TradingDisciplineTracker: React.FC<TradingDisciplineTrackerProps> = ({ trades, onSaveTrades }) => {
  const [selectedId, setSelectedId] = useState(trades[0]?.id || '');
  const selectedTrade = useMemo(() => trades.find((trade) => trade.id === selectedId), [trades, selectedId]);
  const [planFollowed, setPlanFollowed] = useState<ReviewChoice>('');
  const [stopLossFollowed, setStopLossFollowed] = useState<ReviewChoice>('');
  const [targetFollowed, setTargetFollowed] = useState<ReviewChoice>('');
  const [selectedMistakes, setSelectedMistakes] = useState<string[]>([]);
  const [improvement, setImprovement] = useState('');
  const [message, setMessage] = useState('');

  React.useEffect(() => {
    setPlanFollowed(selectedTrade?.planFollowed === undefined ? '' : selectedTrade.planFollowed ? 'yes' : 'no');
    setStopLossFollowed(selectedTrade?.stopLossFollowed || '');
    setTargetFollowed(selectedTrade?.targetFollowed || '');
    setSelectedMistakes(selectedTrade?.disciplineMistakes || []);
    setImprovement(selectedTrade?.disciplineImprovement || '');
    setMessage('');
  }, [selectedId, selectedTrade?.planFollowed, selectedTrade?.stopLossFollowed, selectedTrade?.targetFollowed, selectedTrade?.disciplineMistakes, selectedTrade?.disciplineImprovement]);

  const answered = [planFollowed, stopLossFollowed, targetFollowed].filter((value) => value === 'yes' || value === 'no');
  const score = answered.length ? Math.round((answered.filter((value) => value === 'yes').length / answered.length) * 100) : null;

  const save = () => {
    if (!selectedTrade) return;
    const updated = trades.map((trade) => trade.id === selectedTrade.id ? {
      ...trade,
      planFollowed: planFollowed === '' ? undefined : planFollowed === 'yes',
      stopLossFollowed: stopLossFollowed || undefined,
      targetFollowed: targetFollowed || undefined,
      disciplineMistakes: selectedMistakes,
      disciplineImprovement: improvement,
    } : trade);
    onSaveTrades(updated);
    setMessage('Discipline review saved.');
  };

  return (
    <section className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-emerald-400" />
        <div>
          <h2 className="text-sm font-black text-white">TRADING DISCIPLINE & MISTAKE TRACKER</h2>
          <p className="text-[11px] text-slate-400">Review your decisions and build consistency, one trade at a time.</p>
        </div>
      </div>

      {trades.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#30415f] p-5 text-center text-xs text-slate-400">Your saved equity trades will appear here for review.</p>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">Select Trade</label>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2.5 text-xs text-white outline-none focus:border-amber-400">
              {trades.map((trade) => <option key={trade.id} value={trade.id}>{trade.stockName} · {trade.entryDate} · {trade.status}</option>)}
            </select>
          </div>

          {selectedTrade && (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#070d18] p-3 text-xs">
                <div><span className="text-slate-500">Stock</span><p className="font-bold text-white">{selectedTrade.stockName}</p></div>
                <div><span className="text-slate-500">Trade status</span><p className="font-bold text-white">{selectedTrade.status}</p></div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Choice label="Did you follow your trade plan?" value={planFollowed} onChange={setPlanFollowed} />
                <Choice label="Did you respect your stop-loss?" value={stopLossFollowed} onChange={setStopLossFollowed} />
                <Choice label="Did you follow your target / exit plan?" value={targetFollowed} onChange={setTargetFollowed} />
              </div>

              <div className="rounded-xl border border-[#263858] bg-[#070d18] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200">Discipline Score</span>
                </div>
                {score === null ? <p className="text-xs text-slate-500">Complete the review questions to calculate this trade's score.</p> : (
                  <>
                    <div className="flex items-end justify-between"><span className="text-2xl font-black text-white">{score}%</span><span className="text-[10px] text-slate-500">{answered.length} applicable checks</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: score + '%' }} /></div>
                    <p className="mt-2 text-[10px] text-slate-500">Based only on answered Yes/No checks. Not applicable and unanswered items are excluded; this is a self-review, not a measure of profitability.</p>
                  </>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /><span className="text-xs font-semibold text-slate-300">Mistakes made (select all that apply)</span></div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {mistakes.map((mistake) => (
                    <label key={mistake} className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#263858] bg-[#070d18] p-2 text-[11px] text-slate-300">
                      <input type="checkbox" checked={selectedMistakes.includes(mistake)} onChange={(event) => setSelectedMistakes((current) => event.target.checked ? [...current, mistake] : current.filter((item) => item !== mistake))} className="mt-0.5 accent-amber-400" />
                      {mistake}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">What will you improve next time?</label>
                <textarea rows={3} value={improvement} onChange={(event) => setImprovement(event.target.value)} placeholder="Example: Wait for candle close confirmation; never move my stop-loss farther away..." className="w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none focus:border-amber-400" />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={message.includes('saved') ? 'text-xs text-emerald-400' : 'text-xs text-rose-300'}>{message}</span>
                <button type="button" onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-emerald-400"><Save className="h-4 w-4" /> Save Review</button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
};
