import React, { useEffect, useMemo, useState } from 'react';
import { loadScannerData, saveScannerData, deleteScannerData } from '../services/cloudScannerStorage';
import { Activity, Upload, Download, AlertTriangle, CalendarClock } from 'lucide-react';

type OptionRow = {
  expiry: string; strike: number; type: 'CE' | 'PE'; ltp: number;
  oi: number; changeOi: number; volume: number; iv?: number; spot: number;
};
const STORAGE_KEY = 'moti_nifty_options_chain_v1';
const HISTORY_KEY = 'moti_nifty_options_history_v1';
type DailySnapshot = { date: string; spot: number; rows: Array<{ expiry: string; strike: number; type: 'CE' | 'PE'; ltp: number; oi: number }> };
const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const number = (v?: string) => {
  if (!v || v.trim() === '-' || v.trim() === '—') return 0;
  const n = Number(v.replace(/[,₹%\s]/g, '').replace(/[()]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const parseDate = (v: string) => {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const numeric = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (numeric) return `${numeric[3]}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
  const named = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{4})$/);
  if (named) {
    const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const month = months[named[2].toLowerCase()];
    if (month) return `${named[3]}-${month}-${named[1].padStart(2, '0')}`;
  }
  return '';
};
const expiryFromFilename = (filename: string) => {
  const match = filename.match(/(\d{1,2})[-_ ]([A-Za-z]{3})[-_ ](\d{4})/);
  if (!match) return '';
  const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const month = months[match[2].toLowerCase()];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, '0')}` : '';
};
const strikeFromFilename = (filename: string) => {
  const tagged = filename.match(/(?:strike|strk)[-_ ]?(\d{1,3}(?:,\d{3})+|\d{4,6})(?:\.\d+)?/i);
  const grouped = filename.match(/(\d{1,3},\d{3})(?:\.\d+)?/);
  const raw = tagged?.[1] || grouped?.[1];
  return raw ? number(raw) : 0;
};
const csvLines = (text: string) => text.replace(/^\uFEFF/, '').replace(/\0/g, '').split(/\r\n|\n|\r/).filter(x => x.trim());
const splitCsvLine = (line: string) => {
  const out: string[] = []; let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { out.push(value.trim()); value = ''; } else value += c;
  }
  out.push(value.trim()); return out;
};
const estimateSpot = (samples: Array<{ strike: number; ce: number; pe: number }>) => {
  const values = samples.filter(x => x.ce > 5 && x.pe > 5).map(x => x.strike + x.ce - x.pe).filter(x => x > 0).sort((a, b) => a - b);
  if (!values.length) return 0;
  return values[Math.floor(values.length / 2)];
};
const parseNseOptionChain = (text: string, filename: string): OptionRow[] => {
  const lines = csvLines(text);
  if (lines.length < 3) throw new Error('NSE Option Chain CSV मध्ये पुरेशा rows नाहीत.');
  const headers = splitCsvLine(lines[1]).map(normalize);
  const strikeIndex = headers.indexOf('strike');
  const expiryIndex = headers.findIndex(h => h === 'expirydate' || h === 'expiry');
  const selectedStrike = strikeFromFilename(filename);
  const fullChain = strikeIndex >= 0 && headers.length >= 22;
  const selectedStrikeFile = strikeIndex < 0 && expiryIndex >= 0 && headers.length >= 22 && selectedStrike > 0;
  if (!fullChain && !selectedStrikeFile) {
    throw new Error('NSE CSV format ओळखता आला नाही. Full Option Chain CSV upload करा; किंवा एका Strike चा CSV असल्यास फाइलचे नाव NIFTY-Strike-26000.csv अशा प्रकारे ठेवा.');
  }
  const defaultExpiry = expiryFromFilename(filename);
  const raw: Array<{ strike: number; expiry: string; ce: number; pe: number; rows: OptionRow[] }> = [];
  for (const line of lines.slice(2)) {
    const c = splitCsvLine(line);
    const strike = fullChain ? number(c[strikeIndex]) : selectedStrike;
    const expiry = fullChain ? defaultExpiry : parseDate(c[expiryIndex]);
    if (!(strike > 0) || !expiry) continue;
    const ceLtp = number(c[5]);
    const peLtp = number(c[17]);
    const rows: OptionRow[] = [];
    if (ceLtp > 0) rows.push({ expiry, strike, type: 'CE', ltp: ceLtp, oi: number(c[1]), changeOi: number(c[2]), volume: number(c[3]), iv: number(c[4]) || undefined, spot: 0 });
    if (peLtp > 0) rows.push({ expiry, strike, type: 'PE', ltp: peLtp, oi: number(c[21]), changeOi: number(c[20]), volume: number(c[19]), iv: number(c[18]) || undefined, spot: 0 });
    if (rows.length) raw.push({ strike, expiry, ce: ceLtp, pe: peLtp, rows });
  }
  if (!raw.length) throw new Error('या NSE CSV मध्ये वाचता येणारे CE/PE rows सापडले नाहीत.');
  const spot = estimateSpot(raw);
  if (!spot) throw new Error('CE आणि PE दोन्ही LTP वरून spot अंदाज काढता आला नाही.');
  return raw.flatMap(x => x.rows.map(r => ({ ...r, spot })));
};
const parseCsv = (text: string, filename = ''): OptionRow[] => {
  const lines = csvLines(text);
  if (lines.length < 2) throw new Error('CSV मध्ये option rows नाहीत.');
  const headers = splitCsvLine(lines[0]).map(normalize);
  const find = (...keys: string[]) => headers.findIndex(h => keys.includes(h));
  const expiry = find('expiry', 'expirydate', 'expdate');
  const strike = find('strike', 'strikeprice', 'strikepr');
  const type = find('optiontype', 'type', 'cepe', 'instrumenttype', 'right');
  const ltp = find('ltp', 'lastprice', 'lasttradedprice', 'close');
  const oi = find('oi', 'openinterest', 'openint');
  const coi = find('changeoi', 'changeinopeninterest', 'chginoi');
  const volume = find('volume', 'totaltradedvolume', 'tradedvolume', 'vol');
  const iv = find('iv', 'impliedvolatility');
  const spot = find('underlyingvalue', 'underlying', 'spot', 'underlyingprice', 'indexvalue');
  if ([expiry, strike, type, ltp, oi, coi, volume, spot].some(i => i < 0)) return parseNseOptionChain(text, filename);
  return lines.slice(1).flatMap(line => {
    const c = splitCsvLine(line);
    const exp = parseDate(c[expiry] || '');
    const rawType = (c[type] || '').trim().toUpperCase();
    const optType = rawType.includes('CE') || rawType === 'CALL' ? 'CE' : rawType.includes('PE') || rawType === 'PUT' ? 'PE' : '';
    const row: OptionRow = {
      expiry: exp, strike: number(c[strike]), type: optType as 'CE' | 'PE',
      ltp: number(c[ltp]), oi: number(c[oi]), changeOi: number(c[coi]),
      volume: number(c[volume]), iv: iv >= 0 ? number(c[iv]) : undefined, spot: number(c[spot])
    };
    return exp && optType && row.strike > 0 && row.ltp >= 0 && row.spot > 0 ? [row] : [];
  });
};
const csvTemplate = 'Expiry,Strike,OptionType,LTP,OI,ChangeOI,Volume,IV,UnderlyingValue\n2026-12-03,26000,CE,150,120000,15000,45000,14.2,25950\n2026-12-03,26000,PE,175,145000,22000,51000,14.8,25950';
const fmt = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

export const NiftyOptionsScannerView: React.FC = () => {
  const [rows, setRows] = useState<OptionRow[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as OptionRow[]; } catch { return []; }
  });
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<DailySnapshot[]>(() => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as DailySnapshot[]; } catch { return []; } });
  useEffect(() => { let active = true; loadScannerData<OptionRow[]>('nifty-options').then(data => { if (active && data) { setRows(data); localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Cloud data load failed.'); }); return () => { active = false; }; }, []);
  const [error, setError] = useState('');
  const [stopPct, setStopPct] = useState(20);
  const [targetPct, setTargetPct] = useState(35);
  const [lotSize, setLotSize] = useState(65);
  const [expiryChoice, setExpiryChoice] = useState('');
  const [expiryGroup, setExpiryGroup] = useState<'0-6' | '7-13' | '14+'>('14+');
  const [loading, setLoading] = useState(false);

  const expiries = useMemo(() => Array.from(new Set(rows.map(r => r.expiry))).sort(), [rows]);
  const groupExpiries = useMemo(() => expiries.filter(e => {
    const days = Math.floor((new Date(e + 'T00:00:00').getTime() - today().getTime()) / 86400000);
    return days >= 0 && (expiryGroup === '0-6' ? days <= 6 : expiryGroup === '7-13' ? days >= 7 && days <= 13 : days >= 14);
  }), [expiries, expiryGroup]);
  const selectedExpiry = groupExpiries.includes(expiryChoice) ? expiryChoice : groupExpiries[0] || '';
  const chain = useMemo(() => rows.filter(r => r.expiry === selectedExpiry), [rows, selectedExpiry]);
  const summary = useMemo(() => {
    const ce = chain.filter(r => r.type === 'CE');
    const pe = chain.filter(r => r.type === 'PE');
    const ceOi = ce.reduce((s, r) => s + r.oi, 0);
    const peOi = pe.reduce((s, r) => s + r.oi, 0);
    const ceChg = ce.reduce((s, r) => s + r.changeOi, 0);
    const peChg = pe.reduce((s, r) => s + r.changeOi, 0);
    const pcr = ceOi ? peOi / ceOi : 0;
    const bias = pcr >= 1.1 && peChg > ceChg ? 'BULLISH' : pcr <= 0.9 && ceChg > peChg ? 'BEARISH' : 'WAIT';
    const spot = chain.length ? chain[0].spot : 0;
    return { ceOi, peOi, ceChg, peChg, pcr, bias, spot };
  }, [chain]);
  const rangeRows = useMemo(() => chain.filter(r => r.strike >= summary.spot - 600 && r.strike <= summary.spot + 600), [chain, summary.spot]);
  const previousSnapshot = useMemo(() => [...history].filter(h => h.date < (history.length ? history[history.length - 1].date : '')).sort((a, b) => b.date.localeCompare(a.date))[0] || null, [history]);
  const latestSnapshot = history.length ? [...history].sort((a, b) => b.date.localeCompare(a.date))[0] : null;
  const previousRows = useMemo(() => previousSnapshot?.rows.filter(r => r.expiry === selectedExpiry) || [], [previousSnapshot, selectedExpiry]);
  const priorByContract = useMemo(() => new Map(previousRows.map(r => [`${r.strike}-${r.type}`, r])), [previousRows]);
  const priceOiSignals = useMemo(() => chain.filter(r => r.type === 'CE' || r.type === 'PE').map(r => {
    const old = priorByContract.get(`${r.strike}-${r.type}`);
    if (!old) return { ...r, signal: 'NEW / NO PRIOR DATA', signalType: 'neutral', oldLtp: undefined as number | undefined, oldOi: undefined as number | undefined };
    const priceUp = r.ltp > old.ltp; const priceDown = r.ltp < old.ltp;
    const oiUp = r.oi > old.oi; const oiDown = r.oi < old.oi;
    const signal = priceUp && oiUp ? 'LONG BUILDUP' : priceDown && oiUp ? 'SHORT BUILDUP' : priceUp && oiDown ? 'SHORT COVERING' : priceDown && oiDown ? 'LONG UNWINDING' : 'NO CLEAR CHANGE';
    const signalType = priceUp && oiUp || priceUp && oiDown ? 'bullish' : priceDown && oiUp || priceDown && oiDown ? 'bearish' : 'neutral';
    return { ...r, signal, signalType, oldLtp: old.ltp, oldOi: old.oi };
  }), [chain, priorByContract]);
  const pcrHistory = useMemo(() => [...history].sort((a, b) => a.date.localeCompare(b.date)).map(h => { const ce = h.rows.filter(r => r.expiry === selectedExpiry && r.type === 'CE').reduce((s, r) => s + r.oi, 0); const pe = h.rows.filter(r => r.expiry === selectedExpiry && r.type === 'PE').reduce((s, r) => s + r.oi, 0); return { date: h.date, pcr: ce ? pe / ce : 0 }; }).filter(x => x.pcr > 0).slice(-7), [history, selectedExpiry]);
  const strikeStats = useMemo(() => {
    const grouped = new Map<number, { strike: number; ceOi: number; peOi: number; ceChange: number; peChange: number; ceVol: number; peVol: number }>();
    for (const r of rangeRows) {
      const v = grouped.get(r.strike) || { strike: r.strike, ceOi: 0, peOi: 0, ceChange: 0, peChange: 0, ceVol: 0, peVol: 0 };
      if (r.type === 'CE') { v.ceOi += r.oi; v.ceChange += r.changeOi; v.ceVol += r.volume; }
      else { v.peOi += r.oi; v.peChange += r.changeOi; v.peVol += r.volume; }
      grouped.set(r.strike, v);
    }
    return Array.from(grouped.values()).sort((a, b) => a.strike - b.strike);
  }, [rangeRows]);
  const classifiedStrikes = strikeStats.map(s => ({ ...s, signal: s.peChange > 0 && s.ceChange < 0 ? 'BULLISH · PE OI वाढ / CE OI कमी' : s.ceChange > 0 && s.peChange < 0 ? 'BEARISH · CE OI वाढ / PE OI कमी' : s.ceChange > 0 && s.peChange > 0 ? 'MIXED · दोन्ही OI वाढ' : s.ceChange < 0 && s.peChange < 0 ? 'UNWINDING · दोन्ही OI कमी' : 'NEUTRAL · स्पष्ट संकेत नाही', signalType: s.peChange > 0 && s.ceChange < 0 ? 'bullish' : s.ceChange > 0 && s.peChange < 0 ? 'bearish' : 'neutral' }));
  const maxCe = [...strikeStats].sort((a, b) => b.ceOi - a.ceOi)[0];
  const maxPe = [...strikeStats].sort((a, b) => b.peOi - a.peOi)[0];
  const candidates = useMemo(() => {
    if (!chain.length || summary.bias === 'WAIT') return [];
    const type = summary.bias === 'BULLISH' ? 'CE' : 'PE';
    return rangeRows.filter(r => r.type === type).sort((a, b) => b.changeOi - a.changeOi).slice(0, 5);
  }, [chain, rangeRows, summary]);
  const handleUpload = async (file?: File) => {
    if (!file) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const parsed = parseCsv(await file.text(), file.name);
      if (!parsed.length) throw new Error('वाचता येणाऱ्या NIFTY option rows सापडल्या नाहीत.');
      await saveScannerData('nifty-options', parsed);
      setRows(parsed);
      const snapshotDate = new Date().toLocaleDateString('en-CA');
      const snapshot: DailySnapshot = { date: snapshotDate, spot: parsed[0]?.spot || 0, rows: parsed.map(r => ({ expiry: r.expiry, strike: r.strike, type: r.type, ltp: r.ltp, oi: r.oi })) };
      setHistory(prev => { const next = [...prev.filter(h => h.date !== snapshotDate), snapshot].sort((a, b) => a.date.localeCompare(b.date)).slice(-30); localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); return next; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      setExpiryChoice('');
      setMessage(`${parsed.length} option rows import झाले. NSE CSV मधील spot CE-PE premium parity वरून अंदाजे काढला आहे. Cloudflare D1 मध्ये Appwrite-authenticated session द्वारे save केला आहे.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'CSV वाचता आला नाही.'); }
    finally { setLoading(false); }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([csvTemplate], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'moti-nifty-option-chain-template.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const clearData = () => {
    if (window.confirm('Saved NIFTY option-chain data delete करायचा?')) {
      void (async () => { try { await deleteScannerData('nifty-options'); setRows([]); localStorage.removeItem(STORAGE_KEY); setMessage('Option-chain data clear केला.'); } catch (e) { setError(e instanceof Error ? e.message : 'Cloud delete failed.'); } })();
    }
  };

  return <div className="space-y-5">
    <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#10243b] via-[#0d1928] to-[#0d1527] p-5 sm:p-7">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300"><Activity className="h-4 w-4" /> MOTI · Separate Options Module</div>
      <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl">NIFTY Options Positional Scanner</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-300">Intraday नाही. किमान 14 दिवस बाकी असलेली expiry निवडून CE / PE positioning तपासा. OI हे positioning data आहे; ते एकटे buy signal नाही.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-slate-950 hover:bg-cyan-200">
          <Upload className="h-4 w-4" /> {loading ? 'Reading CSV...' : 'Upload NIFTY Option Chain CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={loading} onChange={e => { handleUpload(e.target.files?.[0]); e.currentTarget.value = ''; }} />
        </label>
        <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-xs font-bold text-slate-200 hover:bg-white/5"><Download className="h-4 w-4" /> CSV Template</button>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Full Option Chain CSV मध्ये सर्व strikes scan होतात. एका selected Strike चा NSE CSV असल्यास फाइलचे नाव NIFTY-Strike-26000.csv असे ठेवा; त्या फाइलमधून फक्त तोच strike वाचता येईल. डेटा local browser मध्ये save होतो.</p>
    </div>

    {message && <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-xs text-emerald-200">{message}</div>}
    {error && <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{error}</div>}

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">NIFTY Spot (estimated)</p><p className="mt-1 text-xl font-black text-white">{summary.spot ? fmt(summary.spot) : '—'}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Put / Call OI Ratio</p><p className="mt-1 text-xl font-black text-white">{summary.pcr ? summary.pcr.toFixed(2) : '—'}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Directional read (OI only)</p><p className={'mt-1 text-xl font-black ' + (summary.bias === 'BULLISH' ? 'text-emerald-300' : summary.bias === 'BEARISH' ? 'text-rose-300' : 'text-amber-300')}>{summary.bias}</p></div>
    </div>

    <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-white">Daily Snapshot History · Last 30 uploads</h2><p className="mt-1 text-[11px] text-slate-400">प्रत्येक दिवसाचा upload snapshot याच browser मध्ये जतन होतो. त्याच दिवशी पुन्हा upload केल्यास त्या दिवसाचा snapshot update होतो.</p></div><span className="rounded-lg bg-[#080f1b] px-3 py-2 text-xs text-slate-300">{history.length} days saved</span></div>
      {latestSnapshot ? <div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Latest upload date</p><p className="mt-1 text-sm font-bold text-white">{latestSnapshot.date}</p></div><div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Latest estimated spot</p><p className="mt-1 text-sm font-bold text-white">₹{fmt(latestSnapshot.spot)}</p></div><div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Previous snapshot</p><p className="mt-1 text-sm font-bold text-white">{previousSnapshot?.date || 'अजून उपलब्ध नाही'}</p></div></div> : <p className="mt-3 text-xs text-amber-200">पहिला CSV upload केल्यानंतर Daily History सुरू होईल.</p>}
      {previousSnapshot && <><p className="mt-3 text-[11px] text-slate-300">Previous snapshot पासून NIFTY Spot बदल: <b className={latestSnapshot!.spot >= previousSnapshot.spot ? 'text-emerald-300' : 'text-rose-300'}>{latestSnapshot!.spot >= previousSnapshot.spot ? '+' : ''}{fmt(latestSnapshot!.spot - previousSnapshot.spot)} points</b>. खालील contract classification मागील snapshot च्या LTP आणि OI वर आधारित आहे.</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{['Type','Strike','Old LTP','New LTP','OI Δ','Price + OI Read'].map(x => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]">{priceOiSignals.filter(r => r.oldLtp !== undefined).slice(0, 30).map(r => <tr key={r.expiry + r.strike + r.type}><td className="px-3 py-2 font-bold text-white">{r.type}</td><td className="px-3 py-2">{fmt(r.strike)}</td><td className="px-3 py-2">₹{fmt(r.oldLtp!)}</td><td className="px-3 py-2">₹{fmt(r.ltp)}</td><td className="px-3 py-2">{fmt(r.oi - r.oldOi!)}</td><td className={'px-3 py-2 font-bold ' + (r.signalType === 'bullish' ? 'text-emerald-300' : r.signalType === 'bearish' ? 'text-rose-300' : 'text-amber-200')}>{r.signal}</td></tr>)}</tbody></table></div></>}
      {pcrHistory.length > 0 && <div className="mt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Selected expiry PCR history</p><div className="flex flex-wrap gap-2">{pcrHistory.map(p => <span key={p.date} className="rounded-lg bg-[#080f1b] px-3 py-2 text-[11px] text-slate-300">{p.date}: <b className="text-white">{p.pcr.toFixed(2)}</b></span>)}</div></div>}
    </div>

    <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-bold text-white">Expiry Selection</h2><p className="mt-1 text-[11px] text-slate-400">गट निवडा; त्या गटातील उपलब्ध expiry खाली दिसतील.</p></div>
        <div className="flex flex-wrap gap-2">
          {([{ id: '0-6', label: '0–6 दिवस' }, { id: '7-13', label: '7–13 दिवस' }, { id: '14+', label: '14+ दिवस' }] as const).map(g => <button key={g.id} onClick={() => { setExpiryGroup(g.id); setExpiryChoice(''); }} className={'rounded-lg border px-3 py-2 text-xs font-bold ' + (expiryGroup === g.id ? 'border-cyan-300 bg-cyan-300 text-slate-950' : 'border-slate-600 text-slate-200 hover:bg-white/5')}>{g.label}</button>)}
          <select value={selectedExpiry} onChange={e => setExpiryChoice(e.target.value)} className="rounded-lg border border-slate-600 bg-[#0a1220] px-3 py-2 text-sm text-white">
            {groupExpiries.length ? groupExpiries.map(e => <option key={e} value={e}>{e}</option>) : <option value="">या गटात expiry उपलब्ध नाही</option>}
          </select>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">CE OI Change</p><p className="mt-1 text-sm font-bold text-white">{fmt(summary.ceChg)}</p></div>
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">PE OI Change</p><p className="mt-1 text-sm font-bold text-white">{fmt(summary.peChg)}</p></div>
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Eligible Expiries</p><p className="mt-1 text-sm font-bold text-white">{groupExpiries.length}</p></div>
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Contracts in selected expiry</p><p className="mt-1 text-sm font-bold text-white">{chain.length}</p></div>
      </div>
    </div>

    <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="mb-4 rounded-xl border border-[#263958] bg-[#080f1b] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-white">OI Positioning Signal</span><span className={'rounded-md px-2 py-1 text-[10px] font-black ' + (summary.bias === 'BULLISH' ? 'bg-emerald-300/15 text-emerald-200' : summary.bias === 'BEARISH' ? 'bg-rose-300/15 text-rose-200' : 'bg-amber-300/15 text-amber-200')}>{summary.bias}</span></div><p className="mt-2 text-[11px] leading-5 text-slate-300">{summary.bias === 'BULLISH' ? 'PCR 1.10 किंवा अधिक आणि PE OI Change हा CE पेक्षा जास्त: bullish positioning चा संकेत. CE खरेदीचा आदेश नाही.' : summary.bias === 'BEARISH' ? 'PCR 0.90 किंवा कमी आणि CE OI Change हा PE पेक्षा जास्त: bearish positioning चा संकेत. PE खरेदीचा आदेश नाही.' : 'PCR आणि OI Change मध्ये स्पष्ट एकतर्फी संकेत नाही. WAIT; चार्ट आणि किंमतीची पुष्टी पाहा.'}</p><p className="mt-1 text-[10px] text-slate-500">CE OI वाढ = संभाव्य resistance pressure · PE OI वाढ = संभाव्य support positioning. OI कमी होणे म्हणजे positions unwind होत असू शकतात.</p></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-white">Strike OI Scanner · Spot ± ₹600</h2><p className="mt-1 text-[11px] text-slate-400">Spot च्या 600 points वर आणि खालील strikes मध्ये OI व Change in OI दाखवले आहेत.</p></div><span className="rounded-lg bg-[#080f1b] px-3 py-2 text-xs text-slate-300">{summary.spot ? `₹${fmt(summary.spot - 600)} – ₹${fmt(summary.spot + 600)}` : 'Spot unavailable'}</span></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-rose-300/20 bg-rose-300/5 p-3"><p className="text-[10px] text-rose-200">Highest CE OI · potential resistance</p><p className="mt-1 text-lg font-black text-white">{maxCe ? fmt(maxCe.strike) : '—'}</p><p className="text-[11px] text-slate-400">{maxCe ? `OI ${fmt(maxCe.ceOi)} · Change ${fmt(maxCe.ceChange)}` : 'Range मध्ये data नाही'}</p></div>
        <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-3"><p className="text-[10px] text-emerald-200">Highest PE OI · potential support</p><p className="mt-1 text-lg font-black text-white">{maxPe ? fmt(maxPe.strike) : '—'}</p><p className="text-[11px] text-slate-400">{maxPe ? `OI ${fmt(maxPe.peOi)} · Change ${fmt(maxPe.peChange)}` : 'Range मध्ये data नाही'}</p></div>
      </div>
      {strikeStats.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{['Strike','CE OI','CE Chg OI','CE Volume','PE OI','PE Chg OI','PE Volume','OI Signal'].map(x => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]">{classifiedStrikes.map(s => <tr key={s.strike}><td className="px-3 py-2 font-bold text-white">{fmt(s.strike)}</td><td className="px-3 py-2">{fmt(s.ceOi)}</td><td className={'px-3 py-2 ' + (s.ceChange > 0 ? 'text-rose-300' : s.ceChange < 0 ? 'text-emerald-300' : 'text-slate-400')}>{fmt(s.ceChange)}</td><td className="px-3 py-2">{fmt(s.ceVol)}</td><td className="px-3 py-2">{fmt(s.peOi)}</td><td className={'px-3 py-2 ' + (s.peChange > 0 ? 'text-emerald-300' : s.peChange < 0 ? 'text-rose-300' : 'text-slate-400')}>{fmt(s.peChange)}</td><td className="px-3 py-2">{fmt(s.peVol)}</td><td className={'px-3 py-2 text-[10px] font-bold ' + (s.signalType === 'bullish' ? 'text-emerald-300' : s.signalType === 'bearish' ? 'text-rose-300' : 'text-amber-200')}>{s.signal}</td></tr>)}</tbody></table></div> : <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs text-amber-100">या expiry साठी Spot ±600 range मधील पुरेसे strike rows नाहीत. पूर्ण Option Chain CSV upload करा; single-strike CSV ने इतर strikes शोधता येत नाहीत.</div>}
    </div>

    <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <h2 className="text-sm font-bold text-white">Indicative Trade Planning · Risk cap ₹1,000</h2>
      <p className="mt-1 text-[11px] text-slate-400">Entry = uploaded option LTP. Stop-loss / Target हे editable premium risk levels आहेत; forecast नाहीत. Max lots = ₹1,000 ÷ (प्रति lot stop-loss risk). Brokerage, slippage व taxes यात समाविष्ट नाहीत.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-300">
        <label>Lot size <input type="number" min="1" max="10000" value={lotSize} onChange={e => setLotSize(Math.max(1, Number(e.target.value) || 1))} className="ml-2 w-20 rounded border border-slate-600 bg-[#080f1b] px-2 py-1.5 text-white" /></label>
        <label>Stop-loss % <input type="number" min="1" max="80" value={stopPct} onChange={e => setStopPct(Number(e.target.value))} className="ml-2 w-20 rounded border border-slate-600 bg-[#080f1b] px-2 py-1.5 text-white" /></label>
        <label>Target % <input type="number" min="1" max="200" value={targetPct} onChange={e => setTargetPct(Number(e.target.value))} className="ml-2 w-20 rounded border border-slate-600 bg-[#080f1b] px-2 py-1.5 text-white" /></label>
      </div>
      {candidates.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{['Type','Strike','Expiry','Entry','Stop-loss','Target','Risk / lot','Max lots'].map(x => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]">{candidates.map(r => { const stop = r.ltp * (1 - stopPct / 100); const riskPerLot = (r.ltp - stop) * lotSize; const lots = riskPerLot > 0 ? Math.floor(1000 / riskPerLot) : 0; return <tr key={r.expiry + r.strike + r.type}><td className="px-3 py-3 font-black text-emerald-300">{r.type}</td><td className="px-3 py-3 text-white">{fmt(r.strike)}</td><td className="px-3 py-3">{r.expiry}</td><td className="px-3 py-3 text-white">₹{fmt(r.ltp)}</td><td className="px-3 py-3 text-rose-300">₹{fmt(stop)}</td><td className="px-3 py-3 text-emerald-300">₹{fmt(r.ltp * (1 + targetPct / 100))}</td><td className="px-3 py-3">₹{fmt(riskPerLot)}</td><td className="px-3 py-3 font-bold">{lots > 0 ? `${lots} lot(s)` : 'SKIP'}</td></tr>; })}</tbody></table></div> : <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs text-amber-100">{rows.length ? 'सध्याच्या OI reading वर स्पष्ट directional bias नाही. Support/Resistance आणि OI table वरून निरीक्षण करा; WAIT.' : 'सुरुवात करण्यासाठी option-chain CSV upload कर.'}</div>}
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-[#080f1b] p-3 text-[11px] leading-5 text-slate-400"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> Highest CE/PE OI हे फक्त संभाव्य resistance/support आहेत; हमखास स्तर नाहीत. OI/PCR एकट्याने buy signal देत नाहीत. Chart trend, liquidity, bid-ask spread, volatility आणि event risk तपासा. Option buying मध्ये premium पूर्ण गमावण्याचा धोका असतो.</div>
    </div>
    <div className="flex items-center justify-between text-[10px] text-slate-500"><span><CalendarClock className="mr-1 inline h-3 w-3" /> Current data cloud + browser · History last 30 uploads saved in this browser</span><button onClick={clearData} className="underline hover:text-white">Clear option data</button></div>
  </div>;
};
