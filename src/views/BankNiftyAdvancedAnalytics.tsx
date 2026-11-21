import React, { useEffect, useMemo, useState } from 'react';

type Row = { expiry: string; strike: number; type: 'CE' | 'PE'; ltp: number; oi: number; changeOi: number; volume: number; iv?: number; spot: number };
type Snapshot = { date: string; expiry?: string; spot: number; rows: Row[] };
const CHAIN_KEY = 'moti_banknifty_options_chain_v1';
const HISTORY_KEY = 'moti_banknifty_options_history_v1';
const LOT_SIZE = 30;
const fmt = (v: number) => Number.isFinite(v) ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
const panel = 'rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5';
const input = 'rounded-lg border border-slate-600 bg-[#080f1b] px-3 py-2 text-sm text-white';

export const BankNiftyAdvancedAnalytics: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [scenarioSpot, setScenarioSpot] = useState('');
  const [scenarioStrike, setScenarioStrike] = useState('');
  const [scenarioPremium, setScenarioPremium] = useState('');
  const [scenarioType, setScenarioType] = useState<'CE' | 'PE'>('CE');
  const [scenarioLots, setScenarioLots] = useState('1');

  const reload = () => {
    try { setRows(JSON.parse(localStorage.getItem(CHAIN_KEY) || '[]')); } catch { setRows([]); }
    try { setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')); } catch { setHistory([]); }
  };
  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, 4000);
    window.addEventListener('storage', reload);
    return () => { window.clearInterval(timer); window.removeEventListener('storage', reload); };
  }, []);

  const expiries = useMemo(() => Array.from(new Set(rows.map(r => r.expiry))).sort(), [rows]);
  const [expiry, setExpiry] = useState('');
  const selectedExpiry = expiries.includes(expiry) ? expiry : expiries[0] || '';
  const chain = useMemo(() => rows.filter(r => r.expiry === selectedExpiry && r.ltp > 0 && r.ltp <= 300), [rows, selectedExpiry]);
  const spot = chain[0]?.spot || 0;
  const ceOi = chain.filter(r => r.type === 'CE').reduce((s, r) => s + r.oi, 0);
  const peOi = chain.filter(r => r.type === 'PE').reduce((s, r) => s + r.oi, 0);
  const pcr = ceOi > 0 ? peOi / ceOi : 0;
  const snapshots = useMemo(() => history.filter(h => h.expiry === selectedExpiry || (!h.expiry && h.rows?.some(r => r.expiry === selectedExpiry))).sort((a,b) => a.date.localeCompare(b.date)), [history, selectedExpiry]);
  const latest = snapshots[snapshots.length - 1];
  const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : undefined;

  const maxPain = useMemo(() => {
    const strikes = Array.from(new Set(chain.map(r => r.strike))).sort((a,b) => a-b);
    if (!strikes.length) return null;
    const points = strikes.map(candidate => {
      const payout = chain.reduce((sum, r) => sum + (r.type === 'CE'
        ? Math.max(0, candidate - r.strike) * r.oi
        : Math.max(0, r.strike - candidate) * r.oi), 0);
      return { strike: candidate, payout };
    }).sort((a,b) => a.payout - b.payout);
    return points[0];
  }, [chain]);

  const oiShift = useMemo(() => {
    if (!latest || !previous) return [];
    const oldMap = new Map(previous.rows.filter(r => r.expiry === selectedExpiry).map(r => [r.strike + '|' + r.type, r]));
    return latest.rows.filter(r => r.expiry === selectedExpiry && r.ltp > 0 && r.ltp <= 300).map(r => {
      const old = oldMap.get(r.strike + '|' + r.type);
      return old ? { ...r, delta: r.oi - old.oi } : null;
    }).filter((r): r is Row & {delta:number} => Boolean(r)).sort((a,b) => Math.abs(b.delta)-Math.abs(a.delta)).slice(0,12);
  }, [latest, previous, selectedExpiry]);

  const pcrTrend = useMemo(() => snapshots.map(s => {
    const ce = s.rows.filter(r => r.expiry === selectedExpiry && r.type === 'CE').reduce((n,r) => n+r.oi, 0);
    const pe = s.rows.filter(r => r.expiry === selectedExpiry && r.type === 'PE').reduce((n,r) => n+r.oi, 0);
    return { date: s.date, pcr: ce > 0 ? pe / ce : 0, ce, pe };
  }), [snapshots, selectedExpiry]);

  const liquidity = useMemo(() => chain.map(r => ({...r, volumeOi: r.oi > 0 ? r.volume/r.oi : 0}))
    .sort((a,b) => b.volumeOi-a.volumeOi).slice(0,10), [chain]);

  const ivRows = useMemo(() => chain.filter(r => Number.isFinite(r.iv) && (r.iv || 0) > 0).sort((a,b) => Math.abs(a.strike-spot)-Math.abs(b.strike-spot)), [chain, spot]);
  const atmIv = useMemo(() => ({ ce: ivRows.find(r => r.type === 'CE'), pe: ivRows.find(r => r.type === 'PE') }), [ivRows]);
  const ivSkew = atmIv.ce && atmIv.pe ? (atmIv.pe.iv || 0) - (atmIv.ce.iv || 0) : null;

  const chosenStrike = Number(scenarioStrike);
  const chosenPremium = Number(scenarioPremium);
  const chosenSpot = Number(scenarioSpot);
  const lots = Math.max(0, Math.floor(Number(scenarioLots) || 0));
  const intrinsic = scenarioType === 'CE' ? Math.max(0, chosenSpot-chosenStrike) : Math.max(0, chosenStrike-chosenSpot);
  const pnl = (intrinsic-chosenPremium)*LOT_SIZE*lots;
  const scenarioValid = chosenSpot > 0 && chosenStrike > 0 && chosenPremium >= 0 && lots > 0;

  useEffect(() => {
    if (!chain.length) return;
    const atm = chain.reduce((best, r) => Math.abs(r.strike-spot) < Math.abs(best.strike-spot) ? r : best, chain[0]);
    setScenarioStrike(String(atm.strike));
    setScenarioPremium(String(atm.ltp));
    setScenarioType(atm.type);
    setScenarioSpot(String(spot));
  }, [selectedExpiry, chain.length]);

  return <div className="mt-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-black text-white">BANKNIFTY · Advanced Analytics</h2><p className="mt-1 text-xs text-slate-400">CSV आणि जतन केलेल्या daily snapshots वर आधारित स्वतंत्र analytics.</p></div>
      <select className={input} value={selectedExpiry} onChange={e => setExpiry(e.target.value)} disabled={!expiries.length}>
        {expiries.map(e => <option key={e} value={e}>{e}</option>)}
      </select>
    </div>
    {!chain.length ? <div className={panel}><p className="text-sm text-amber-200">Advanced analytics साठी BANKNIFTY Option Chain CSV upload करा.</p></div> : <>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={panel}>
          <h3 className="text-sm font-bold text-white">1 · Max Pain Calculator</h3>
          <p className="mt-1 text-xs text-slate-400">सध्याच्या uploaded OI वरून प्रत्येक उपलब्ध strike वरील एकूण intrinsic payout मोजून किमान payout असलेला strike.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#080f1b] p-3"><p className="text-xs text-slate-400">Max Pain Strike</p><p className="mt-1 text-2xl font-black text-cyan-200">{maxPain ? fmt(maxPain.strike) : '—'}</p></div>
            <div className="rounded-xl bg-[#080f1b] p-3"><p className="text-xs text-slate-400">Spot Difference</p><p className="mt-1 text-2xl font-black text-white">{maxPain ? fmt(maxPain.strike-spot) : '—'}</p></div>
          </div>
          <p className="mt-3 text-[10px] text-slate-500">हा OI-आधारित theoretical estimate आहे; expiry settlement किंवा spot prediction नाही. उपलब्ध CSV मधील strikes/OI पुरतेच गणित.</p>
        </section>
        <section className={panel}>
          <h3 className="text-sm font-bold text-white">2 · OI Shift Tracker</h3>
          <p className="mt-1 text-xs text-slate-400">मागील saved snapshot पासून strike-wise OI मधील बदल.</p>
          {!previous ? <p className="mt-4 rounded-lg bg-[#080f1b] p-3 text-xs text-amber-200">किमान दोन वेगवेगळ्या दिवसांचे snapshots आवश्यक. सध्या पुरेसा prior data नाही.</p> : <div className="mt-3 space-y-2">{oiShift.slice(0,8).map(r => <div key={r.strike+r.type} className="flex items-center justify-between gap-2 rounded-lg bg-[#080f1b] px-3 py-2 text-xs"><span className="font-bold text-white">{r.strike} {r.type}</span><span className={r.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{r.delta >= 0 ? '+' : ''}{fmt(r.delta)} OI</span></div>)}</div>}
        </section>
        <section className={panel}>
          <h3 className="text-sm font-bold text-white">3 · Liquidity Checker</h3>
          <p className="mt-1 text-xs text-slate-400">Volume/OI ratio आणि traded volume वरून activity proxy.</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[10px] uppercase text-slate-500"><tr><th className="py-2">Contract</th><th>Volume</th><th>Vol/OI</th><th>Activity</th></tr></thead><tbody>{liquidity.map(r => <tr key={r.strike+r.type} className="border-t border-slate-800"><td className="py-2 font-bold text-white">{r.strike} {r.type}</td><td>{fmt(r.volume)}</td><td>{(r.volumeOi*100).toFixed(1)}%</td><td className={r.volumeOi >= 1 ? 'text-emerald-300' : r.volumeOi >= .25 ? 'text-amber-200' : 'text-slate-400'}>{r.volumeOi >= 1 ? 'HIGH' : r.volumeOi >= .25 ? 'MEDIUM' : 'LOW'}</td></tr>)}</tbody></table></div>
          <p className="mt-2 text-[10px] text-slate-500">CSV parser मध्ये Bid/Ask spread उपलब्ध नाही; म्हणून हा activity proxy आहे, spread/liquidity guarantee नाही.</p>
        </section>
        <section className={panel}>
          <h3 className="text-sm font-bold text-white">6 · IV Analysis</h3>
          <p className="mt-1 text-xs text-slate-400">CSV मधील उपलब्ध implied volatility वरून ATM जवळचे CE/PE IV आणि skew.</p>
          {!ivRows.length ? <p className="mt-3 rounded-lg bg-[#080f1b] p-3 text-xs text-amber-200">या CSV मध्ये valid IV values उपलब्ध नाहीत. IV analysis दाखवता येणार नाही.</p> : <>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Nearest CE IV</p><p className="mt-1 text-lg font-bold text-white">{atmIv.ce ? fmt(atmIv.ce.iv || 0)+'%' : '—'}</p></div>
              <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Nearest PE IV</p><p className="mt-1 text-lg font-bold text-white">{atmIv.pe ? fmt(atmIv.pe.iv || 0)+'%' : '—'}</p></div>
              <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">PE − CE Skew</p><p className="mt-1 text-lg font-bold text-cyan-200">{ivSkew === null ? '—' : (ivSkew > 0 ? '+' : '')+fmt(ivSkew)+' pp'}</p></div>
            </div>
            <div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#0d1527] text-[10px] text-slate-500"><tr><th className="py-2">Strike</th><th>CE IV</th><th>PE IV</th></tr></thead><tbody>{Array.from(new Set(ivRows.map(r=>r.strike))).sort((a,b)=>Math.abs(a-spot)-Math.abs(b-spot)).slice(0,15).map(k=>{const ce=ivRows.find(r=>r.strike===k&&r.type==='CE');const pe=ivRows.find(r=>r.strike===k&&r.type==='PE');return <tr key={k} className="border-t border-slate-800"><td className="py-2 font-bold text-white">{fmt(k)}</td><td>{ce ? fmt(ce.iv||0)+'%' : '—'}</td><td>{pe ? fmt(pe.iv||0)+'%' : '—'}</td></tr>})}</tbody></table></div>
          </>}
          <p className="mt-2 text-[10px] text-slate-500">Skew हा nearest available CE आणि PE IV मधील फरक आहे; IV Rank/Percentile नाही. CSV मधील IV values वर अवलंबून.</p>
        </section>
        <section className={panel}>
          <h3 className="text-sm font-bold text-white">4 · PCR Trend & OI History</h3>
          <p className="mt-1 text-xs text-slate-400">प्रत्येक saved date चा selected expiry PCR.</p>
          {!pcrTrend.length ? <p className="mt-3 text-xs text-amber-200">PCR history उपलब्ध नाही.</p> : <div className="mt-3 space-y-2">{pcrTrend.map(p => <div key={p.date} className="grid grid-cols-[1fr_auto_auto] gap-3 rounded-lg bg-[#080f1b] px-3 py-2 text-xs"><span className="text-slate-300">{p.date}</span><span className="text-white">PCR <b>{p.pcr.toFixed(2)}</b></span><span className="text-slate-400">CE {fmt(p.ce)} · PE {fmt(p.pe)}</span></div>)}</div>}
          <p className="mt-2 text-[10px] text-slate-500">आताचा PCR: {pcr ? pcr.toFixed(2) : '—'} · इतिहास वाढवण्यासाठी वेगवेगळ्या दिवशी CSV snapshot save करा.</p>
        </section>
      </div>
      <section className={panel}>
        <h3 className="text-sm font-bold text-white">5 · Spot Scenario Analyzer · Expiry Payoff</h3>
        <p className="mt-1 text-xs text-slate-400">निवडलेल्या long CE/PE चा expiry intrinsic payoff. हा what-if calculator आहे, forecast नाही.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs text-slate-400">Scenario Spot<input className={input} type="number" value={scenarioSpot} onChange={e=>setScenarioSpot(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">Strike<input className={input} type="number" value={scenarioStrike} onChange={e=>setScenarioStrike(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">Option Type<select className={input} value={scenarioType} onChange={e=>setScenarioType(e.target.value as 'CE'|'PE')}><option value="CE">CE</option><option value="PE">PE</option></select></label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">Entry Premium<input className={input} type="number" value={scenarioPremium} onChange={e=>setScenarioPremium(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">Lots<input className={input} type="number" min="1" value={scenarioLots} onChange={e=>setScenarioLots(e.target.value)} /></label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[#080f1b] p-3"><p className="text-xs text-slate-400">Expiry Intrinsic</p><p className="mt-1 text-xl font-black text-white">₹{fmt(intrinsic)}</p></div>
          <div className="rounded-xl bg-[#080f1b] p-3"><p className="text-xs text-slate-400">Estimated P&amp;L</p><p className={'mt-1 text-xl font-black '+(scenarioValid && pnl >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{scenarioValid ? (pnl>=0?'+':'')+'₹'+fmt(pnl) : '—'}</p></div>
          <div className="rounded-xl bg-[#080f1b] p-3"><p className="text-xs text-slate-400">Max Premium Risk</p><p className="mt-1 text-xl font-black text-amber-200">{scenarioValid ? '₹'+fmt(chosenPremium*LOT_SIZE*lots) : '—'}</p></div>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Lot size {LOT_SIZE}; charges, taxes, slippage आणि expiry पूर्वीचा time value बदल समाविष्ट नाही. Long option मध्ये premium पूर्ण गमावण्याचा धोका.</p>
      </section>
    </>}
  </div>;
};
