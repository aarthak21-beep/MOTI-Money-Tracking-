import React, { useEffect, useMemo, useState } from 'react';
import { loadScannerData } from '../services/cloudScannerStorage';

type Row = { expiry: string; strike: number; type: 'CE' | 'PE'; ltp: number; oi: number; changeOi: number; volume: number; iv?: number; spot: number };
type Snapshot = { date: string; expiry?: string; kind?: 'DAILY' | 'EOD'; spot: number; rows: Row[] };
const CHAIN_KEY = 'banknifty-options';
const HISTORY_KEY = 'banknifty-history';
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

  useEffect(() => {
    let active = true;
    const reload = async () => {
      try {
        const [chainData, historyData] = await Promise.all([
          loadScannerData<Row[]>(CHAIN_KEY),
          loadScannerData<Snapshot[]>(HISTORY_KEY),
        ]);
        if (!active) return;
        setRows(chainData || []);
        setHistory(historyData || []);
      } catch { if (active) { setRows([]); setHistory([]); } }
    };
    void reload();
    const timer = window.setInterval(() => { void reload(); }, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const expiries = useMemo(() => Array.from(new Set(rows.map(r => r.expiry))).sort(), [rows]);
  const [expiry, setExpiry] = useState('');
  const selectedExpiry = expiries.includes(expiry) ? expiry : expiries[0] || '';
  const chain = useMemo(() => rows.filter(r => r.expiry === selectedExpiry && r.ltp > 0 && r.ltp <= 300), [rows, selectedExpiry]);
  const spot = chain[0]?.spot || 0;
  const ceOi = chain.filter(r => r.type === 'CE').reduce((s, r) => s + r.oi, 0);
  const peOi = chain.filter(r => r.type === 'PE').reduce((s, r) => s + r.oi, 0);
  const pcr = ceOi > 0 ? peOi / ceOi : 0;
  const snapshots = useMemo(() => {
    const relevant = history.filter(h => h.expiry === selectedExpiry || (!h.expiry && h.rows?.some(r => r.expiry === selectedExpiry)));
    const byDay = new Map<string, Snapshot>();
    relevant.forEach(snapshot => { const day = snapshot.date.slice(0, 10); const existing = byDay.get(day); if (!existing || snapshot.kind === 'EOD') byDay.set(day, snapshot); });
    return Array.from(byDay.values()).sort((a,b) => a.date.localeCompare(b.date));
  }, [history, selectedExpiry]);
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

  const buildupSignals = useMemo(() => {
    if (!latest || !previous) return [];
    const oldMap = new Map(previous.rows.filter(r => r.expiry === selectedExpiry && r.ltp > 0 && r.ltp <= 300).map(r => [r.strike + '|' + r.type, r]));
    return latest.rows.filter(r => r.expiry === selectedExpiry && r.ltp > 0 && r.ltp <= 300).flatMap(r => {
      const old = oldMap.get(r.strike + '|' + r.type);
      if (!old || !(old.ltp > 0)) return [];
      const priceUp = r.ltp > old.ltp, priceDown = r.ltp < old.ltp;
      const oiUp = r.oi > old.oi, oiDown = r.oi < old.oi;
      const signal = priceUp && oiUp ? 'LONG BUILDUP' : priceDown && oiUp ? 'SHORT BUILDUP' : priceUp && oiDown ? 'SHORT COVERING' : priceDown && oiDown ? 'LONG UNWINDING' : 'NO CLEAR CHANGE';
      const pricePct = (r.ltp-old.ltp)/old.ltp*100;
      const oiPct = old.oi > 0 ? (r.oi-old.oi)/old.oi*100 : 0;
      return signal === 'NO CLEAR CHANGE' ? [] : [{...r, signal, pricePct, oiPct}];
    }).sort((a,b) => Math.abs(b.oiPct)+Math.abs(b.pricePct)-Math.abs(a.oiPct)-Math.abs(a.pricePct)).slice(0,20);
  }, [latest, previous, selectedExpiry]);

  const pcrTrend = useMemo(() => snapshots.map(s => {
    const ce = s.rows.filter(r => r.expiry === selectedExpiry && r.type === 'CE').reduce((n,r) => n+r.oi, 0);
    const pe = s.rows.filter(r => r.expiry === selectedExpiry && r.type === 'PE').reduce((n,r) => n+r.oi, 0);
    return { date: s.date, kind: s.kind || 'DAILY', pcr: ce > 0 ? pe / ce : 0, ce, pe };
  }), [snapshots, selectedExpiry]);

  const liquidity = useMemo(() => chain.map(r => ({...r, volumeOi: r.oi > 0 ? r.volume/r.oi : 0}))
    .sort((a,b) => b.volumeOi-a.volumeOi).slice(0,10), [chain]);

  const sentiment = useMemo(() => {
    let score = 0;
    const reasons: string[] = [];
    if (pcr >= 1.2) { score += 25; reasons.push('PCR 1.20 पेक्षा जास्त: PE OI तुलनेने जास्त'); }
    else if (pcr > 0 && pcr <= 0.8) { score -= 25; reasons.push('PCR 0.80 किंवा कमी: CE OI तुलनेने जास्त'); }
    const ceChange = chain.filter(r => r.type === 'CE').reduce((s,r) => s+r.changeOi,0);
    const peChange = chain.filter(r => r.type === 'PE').reduce((s,r) => s+r.changeOi,0);
    if (peChange > ceChange && peChange > 0) { score += 20; reasons.push('PE side Change OI जास्त'); }
    else if (ceChange > peChange && ceChange > 0) { score -= 20; reasons.push('CE side Change OI जास्त'); }
    const longs = buildupSignals.filter(r => r.signal === 'LONG BUILDUP' || r.signal === 'SHORT COVERING').length;
    const shorts = buildupSignals.filter(r => r.signal === 'SHORT BUILDUP' || r.signal === 'LONG UNWINDING').length;
    if (longs > shorts) { score += 20; reasons.push('मागील snapshot मध्ये bullish price/OI patterns जास्त'); }
    else if (shorts > longs) { score -= 20; reasons.push('मागील snapshot मध्ये bearish price/OI patterns जास्त'); }
    score = Math.max(-100, Math.min(100, score));
    return { score, label: score >= 30 ? 'BULLISH' : score <= -30 ? 'BEARISH' : 'NEUTRAL', reasons };
  }, [pcr, chain, buildupSignals]);
  const smartAlerts = useMemo(() => {
    const alerts: Array<{level:'HIGH'|'INFO'; title:string; detail:string}> = [];
    if (pcr >= 1.3) alerts.push({level:'INFO',title:'PCR bullish zone',detail:'PCR '+pcr.toFixed(2)+' आहे; PE OI तुलनेने जास्त.'});
    if (pcr > 0 && pcr <= 0.7) alerts.push({level:'INFO',title:'PCR bearish zone',detail:'PCR '+pcr.toFixed(2)+' आहे; CE OI तुलनेने जास्त.'});
    const strongest = buildupSignals.find(r => Math.abs(r.oiPct) >= 10 && Math.abs(r.pricePct) >= 3);
    if (strongest) alerts.push({level:'HIGH',title:strongest.signal+' · '+fmt(strongest.strike)+' '+strongest.type,detail:'Price '+(strongest.pricePct>0?'+':'')+strongest.pricePct.toFixed(1)+'% · OI '+(strongest.oiPct>0?'+':'')+strongest.oiPct.toFixed(1)+'% vs previous saved snapshot.'});
    const active = liquidity.filter(r => r.volumeOi >= 0.5 && r.volume >= 1000).slice(0,3);
    if (active.length) alerts.push({level:'INFO',title:'High activity contracts',detail:active.map(r=>fmt(r.strike)+' '+r.type).join(', ')+' · Volume/OI 50%+.'});
    if (!previous) alerts.push({level:'INFO',title:'Historical comparison unavailable',detail:'OI buildup alerts साठी किमान दोन वेगवेगळ्या दिवसांचे saved snapshots आवश्यक.'});
    return alerts;
  }, [pcr, buildupSignals, liquidity, previous]);
  // Score a saved directional signal against the next available day's BANKNIFTY spot move.
  const historicalBacktest = useMemo(() => {
    const ordered = snapshots.filter(s => s.spot > 0).sort((a,b) => a.date.localeCompare(b.date));
    const tests: Array<{date:string; signal:string; direction:1|-1; movePct:number; correct:boolean; bullish:number; bearish:number}> = [];
    for (let i=1;i<ordered.length-1;i++) {
      const before=ordered[i-1], signalDay=ordered[i], outcome=ordered[i+1];
      const oldMap=new Map(before.rows.filter(r=>r.expiry===selectedExpiry&&r.ltp>0&&r.ltp<=300).map(r=>[r.strike+'|'+r.type,r]));
      let bullish=0,bearish=0;
      for (const r of signalDay.rows.filter(r=>r.expiry===selectedExpiry&&r.ltp>0&&r.ltp<=300)) {
        const old=oldMap.get(r.strike+'|'+r.type); if(!old||!(old.ltp>0)) continue;
        const up=r.ltp>old.ltp,down=r.ltp<old.ltp,oiUp=r.oi>old.oi,oiDown=r.oi<old.oi;
        const pattern=up&&oiUp?'LONG':down&&oiUp?'SHORT':up&&oiDown?'COVER':down&&oiDown?'UNWIND':'';
        if(!pattern) continue;
        const bull=r.type==='CE'?(pattern==='LONG'||pattern==='COVER'):(pattern==='SHORT'||pattern==='UNWIND');
        if(bull) bullish++; else bearish++;
      }
      if(bullish===bearish) continue;
      const direction:1|-1=bullish>bearish?1:-1;
      const movePct=(outcome.spot-signalDay.spot)/signalDay.spot*100;
      if(!Number.isFinite(movePct)||movePct===0) continue;
      tests.push({date:signalDay.date,signal:direction===1?'BULLISH':'BEARISH',direction,movePct,correct:direction===1?movePct>0:movePct<0,bullish,bearish});
    }
    const wins=tests.filter(t=>t.correct).length;
    return {tests:tests.slice(-15).reverse(),total:tests.length,accuracy:tests.length?wins/tests.length*100:0,avgMove:tests.length?tests.reduce((s,t)=>s+t.direction*t.movePct,0)/tests.length:0};
  },[snapshots,selectedExpiry]);
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
          <p className="mt-1 text-xs text-slate-400">प्रत्येक trading day चा EOD snapshot उपलब्ध असल्यास तो; अन्यथा त्या दिवसाचा पहिला saved snapshot वापरून strike-wise OI बदल.</p>
          {!previous ? <p className="mt-4 rounded-lg bg-[#080f1b] p-3 text-xs text-amber-200">किमान दोन वेगवेगळ्या दिवसांचे snapshots आवश्यक. सध्या पुरेसा prior data नाही.</p> : <div className="mt-3 space-y-2">{oiShift.slice(0,8).map(r => <div key={r.strike+r.type} className="flex items-center justify-between gap-2 rounded-lg bg-[#080f1b] px-3 py-2 text-xs"><span className="font-bold text-white">{r.strike} {r.type}</span><span className={r.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{r.delta >= 0 ? '+' : ''}{fmt(r.delta)} OI</span></div>)}</div>}
        </section>
        <section className={panel}>
          <h3 className="text-sm font-bold text-white">1 · OI Build-up Signals</h3>
          <p className="mt-1 text-xs text-slate-400">₹300 पर्यंतचे contracts; latest आणि previous saved snapshot मधील LTP + OI बदलावरून classification.</p>
          {!previous ? <p className="mt-3 rounded-lg bg-[#080f1b] p-3 text-xs text-amber-200">दोन वेगवेगळ्या दिवसांचे snapshots नसल्याने buildup classification उपलब्ध नाही.</p> : !buildupSignals.length ? <p className="mt-3 text-xs text-slate-400">या snapshot pair मध्ये स्पष्ट price/OI buildup pattern नाही.</p> : <div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#0d1527] text-[10px] text-slate-500"><tr><th className="py-2">Contract</th><th>Pattern</th><th>LTP Δ</th><th>OI Δ</th></tr></thead><tbody>{buildupSignals.slice(0,12).map(r=><tr key={r.strike+r.type} className="border-t border-slate-800"><td className="py-2 font-bold text-white">{fmt(r.strike)} {r.type}</td><td className={r.signal.includes('LONG')||r.signal==='SHORT COVERING'?'text-emerald-300':'text-rose-300'}>{r.signal}</td><td>{r.pricePct>0?'+':''}{r.pricePct.toFixed(1)}%</td><td>{r.oiPct>0?'+':''}{r.oiPct.toFixed(1)}%</td></tr>)}</tbody></table></div>}
          <p className="mt-2 text-[10px] text-slate-500">हे फक्त दोन saved snapshots मधील pattern आहे; intraday/live tick signal नाही.</p>
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
          <p className="mt-1 text-xs text-slate-400">प्रत्येक trading day चा PCR; EOD snapshot उपलब्ध असल्यास तो वापरला जातो.</p>
          {!pcrTrend.length ? <p className="mt-3 text-xs text-amber-200">PCR history उपलब्ध नाही.</p> : <div className="mt-3 space-y-2">{pcrTrend.map(p => <div key={p.date} className="grid grid-cols-[1fr_auto_auto] gap-3 rounded-lg bg-[#080f1b] px-3 py-2 text-xs"><span className="text-slate-300">{p.date} {p.kind === 'EOD' ? <b className="ml-1 text-cyan-200">EOD</b> : null}</span><span className="text-white">PCR <b>{p.pcr.toFixed(2)}</b></span><span className="text-slate-400">CE {fmt(p.ce)} · PE {fmt(p.pe)}</span></div>)}</div>}
          <p className="mt-2 text-[10px] text-slate-500">आताचा PCR: {pcr ? pcr.toFixed(2) : '—'} · इतिहास वाढवण्यासाठी वेगवेगळ्या दिवशी CSV snapshot save करा.</p>
        </section>
      </div>
        <section className={panel}>
          <h3 className="text-sm font-bold text-white">4 · Smart Alerts</h3>
          <p className="mt-1 text-xs text-slate-400">CSV मधील PCR, OI/price changes आणि Volume/OI वर आधारित rule alerts.</p>
          {!smartAlerts.length ? <p className="mt-3 text-xs text-slate-400">सध्याच्या data वर alert trigger झालेला नाही.</p> : <div className="mt-3 space-y-2">{smartAlerts.map((a,i)=><div key={i} className="rounded-lg bg-[#080f1b] p-3"><div className="flex items-center gap-2"><span className={a.level==='HIGH'?'text-rose-300':'text-cyan-200'}>{a.level}</span><b className="text-xs text-white">{a.title}</b></div><p className="mt-1 text-xs text-slate-400">{a.detail}</p></div>)}</div>}
          <p className="mt-2 text-[10px] text-slate-500">Alerts या page वरच दिसतात; browser push notification किंवा broker action नाही.</p>
        </section>
        <section className={panel}>
          <h3 className="text-sm font-bold text-white">8 · Market Sentiment Score</h3>
          <p className="mt-1 text-xs text-slate-400">PCR + Change OI + previous snapshot price/OI pattern यांचे transparent rule-based score.</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-slate-400">Sentiment</p><p className={'text-2xl font-black '+(sentiment.score>=30?'text-emerald-300':sentiment.score<=-30?'text-rose-300':'text-amber-200')}>{sentiment.label}</p></div><div className="text-right"><p className="text-xs text-slate-400">Score</p><p className="text-3xl font-black text-white">{sentiment.score>0?'+':''}{sentiment.score}/100</p></div></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-cyan-400" style={{width:((sentiment.score+100)/2)+'%'}} /></div>
          <div className="mt-3 space-y-1">{sentiment.reasons.length ? sentiment.reasons.map((reason,i)=><p key={i} className="text-xs text-slate-300">• {reason}</p>) : <p className="text-xs text-slate-400">Directional factors स्पष्ट नाहीत.</p>}</div>
          <p className="mt-2 text-[10px] text-slate-500">हा custom heuristic score आहे; probability, guaranteed accuracy किंवा trade recommendation नाही.</p>
        </section>
      <section className={panel}>
        <h3 className="text-sm font-bold text-white">9 · Historical Signal Backtest</h3>
        <p className="mt-1 text-xs text-slate-400">प्रत्येक दिवसासाठी EOD snapshot उपलब्ध असल्यास त्यावर तयार झालेला directional bias पुढील trading day च्या BANKNIFTY Spot move विरुद्ध तपासला जातो. ₹300 पर्यंतचे contracts वापरले आहेत.</p>
        {historicalBacktest.total < 1 ? <p className="mt-3 rounded-lg bg-[#080f1b] p-3 text-xs text-amber-200">किमान 3 वेगवेगळ्या तारखांचे saved snapshots आवश्यक (signal साठी 2 आणि पुढील दिवसाचा outcome तपासण्यासाठी 1). सध्या {snapshots.length} snapshots उपलब्ध.</p> : <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-[#080f1b] p-3"><p className="text-xs text-slate-400">Signals Tested</p><p className="mt-1 text-2xl font-black text-white">{historicalBacktest.total}</p></div>
            <div className="rounded-xl bg-[#080f1b] p-3"><p className="text-xs text-slate-400">Historical Hit Rate</p><p className="mt-1 text-2xl font-black text-cyan-200">{historicalBacktest.accuracy.toFixed(1)}%</p></div>
            <div className="rounded-xl bg-[#080f1b] p-3"><p className="text-xs text-slate-400">Avg. Directional Spot Move</p><p className={'mt-1 text-2xl font-black '+(historicalBacktest.avgMove>=0?'text-emerald-300':'text-rose-300')}>{historicalBacktest.avgMove>0?'+':''}{historicalBacktest.avgMove.toFixed(2)}%</p></div>
          </div>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[10px] text-slate-500"><tr><th className="py-2">Signal Date</th><th>Bias</th><th>Next Spot Move</th><th>Result</th><th>Bull/Bear votes</th></tr></thead><tbody>{historicalBacktest.tests.map(t=><tr key={t.date} className="border-t border-slate-800"><td className="py-2 text-slate-300">{t.date}</td><td className={t.direction===1?'text-emerald-300':'text-rose-300'}>{t.signal}</td><td>{t.movePct>0?'+':''}{t.movePct.toFixed(2)}%</td><td className={t.correct?'text-emerald-300':'text-rose-300'}>{t.correct?'HIT':'MISS'}</td><td className="text-slate-400">{t.bullish} / {t.bearish}</td></tr>)}</tbody></table></div>
        </>}
        <p className="mt-2 text-[10px] text-slate-500">हा historical heuristic आहे; future prediction किंवा guaranteed accuracy नाही. एकाच दिवसाचे पुन्हा upload केलेले CSV वेगळा trading day मानले जात नाही. निकाल उपलब्ध snapshots आणि Spot quality वर अवलंबून आहे.</p>
      </section>
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
