import React, { useMemo, useState } from 'react';
import { Activity, Upload, Download, AlertTriangle, CalendarClock } from 'lucide-react';

type OptionRow = {
  expiry: string; strike: number; type: 'CE' | 'PE'; ltp: number;
  oi: number; changeOi: number; volume: number; iv?: number; spot: number;
};
const STORAGE_KEY = 'moti_nifty_options_chain_v1';
const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const number = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[,₹%\s]/g, '').replace(/[()]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const parseDate = (v: string) => {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
};
const expiryFromFilename = (filename: string) => {
  const match = filename.match(/(\\d{1,2})[-_ ]([A-Za-z]{3})[-_ ](\\d{4})/);
  if (!match) return '';
  const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const month = months[match[2].toLowerCase()];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, '0')}` : '';
};
const parseNseOptionChain = (text: string, filename: string): OptionRow[] => {
  const lines = text.replace(/^\\uFEFF/, '').split(/\\r?\\n/).filter(x => x.trim());
  if (lines.length < 3) throw new Error('NSE Option Chain CSV मध्ये पुरेशा rows नाहीत.');
  const split = (line: string) => {
    const out: string[] = []; let value = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
      else if (c === ',' && !quoted) { out.push(value.trim()); value = ''; } else value += c;
    }
    out.push(value.trim()); return out;
  };
  const headers = split(lines[1]).map(normalize);
  const strikeIndex = headers.indexOf('strike');
  if (strikeIndex < 0 || headers.length < 22) throw new Error('हा NSE Option Chain CSV format ओळखता आला नाही.');
  const expiry = expiryFromFilename(filename);
  if (!expiry) throw new Error('Expiry date filename मध्ये नाही. उदा. option-chain-ED-NIFTY-17-Nov-2026.csv अशा नावाने CSV ठेवा.');
  const raw: Array<{ strike: number; ce: number; pe: number; rows: OptionRow[] }> = [];
  for (const line of lines.slice(2)) {
    const c = split(line);
    const strike = number(c[11]);
    if (!(strike > 0)) continue;
    const ceLtp = number(c[5]);
    const peLtp = number(c[17]);
    const rows: OptionRow[] = [];
    if (ceLtp > 0) rows.push({ expiry, strike, type: 'CE', ltp: ceLtp, oi: number(c[1]), changeOi: number(c[2]), volume: number(c[3]), iv: number(c[4]) || undefined, spot: 0 });
    if (peLtp > 0) rows.push({ expiry, strike, type: 'PE', ltp: peLtp, oi: number(c[21]), changeOi: number(c[20]), volume: number(c[19]), iv: number(c[18]) || undefined, spot: 0 });
    raw.push({ strike, ce: ceLtp, pe: peLtp, rows });
  }
  const paritySpots = raw.filter(x => x.ce > 5 && x.pe > 5).map(x => x.strike + x.ce - x.pe).filter(x => x > 0).sort((a, b) => a - b);
  if (!paritySpots.length) throw new Error('CE आणि PE दोन्ही LTP असलेले strike सापडले नाहीत.');
  const spot = paritySpots[Math.floor(paritySpots.length / 2)];
  return raw.flatMap(x => x.rows.map(r => ({ ...r, spot })));
};
const parseCsv = (text: string, filename = ''): OptionRow[] => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.trim());
  if (lines.length < 2) throw new Error('CSV मध्ये option rows नाहीत.');
  const split = (line: string) => {
    const out: string[] = []; let value = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
      else if (c === ',' && !quoted) { out.push(value.trim()); value = ''; } else value += c;
    }
    out.push(value.trim()); return out;
  };
  const headers = split(lines[0]).map(normalize);
  const find = (...keys: string[]) => headers.findIndex(h => keys.includes(h));
  const expiry = find('expiry', 'expirydate', 'expdate');
  const strike = find('strike', 'strikeprice', 'strikepr');
  const type = find('optiontype', 'type', 'cepe', 'instrumenttype', 'right');
  const ltp = find('ltp', 'lastprice', 'lasttradedprice', 'close');
  const oi = find('oi', 'openinterest', 'openint');
  const coi = find('changeoi', 'changeinopeninterest', 'chginoi', 'changein oi');
  const volume = find('volume', 'totaltradedvolume', 'tradedvolume', 'vol');
  const iv = find('iv', 'impliedvolatility');
  const spot = find('underlyingvalue', 'underlying', 'spot', 'underlyingprice', 'indexvalue');
  if ([expiry, strike, type, ltp, oi, coi, volume, spot].some(i => i < 0)) return parseNseOptionChain(text, filename);
  return lines.slice(1).flatMap(line => {
    const c = split(line);
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
  const [error, setError] = useState('');
  const [stopPct, setStopPct] = useState(20);
  const [targetPct, setTargetPct] = useState(35);
  const [expiryChoice, setExpiryChoice] = useState('');
  const [loading, setLoading] = useState(false);

  const expiries = useMemo(() => Array.from(new Set(rows.map(r => r.expiry))).sort(), [rows]);
  const eligibleExpiries = useMemo(() => expiries.filter(e => (new Date(e + 'T00:00:00').getTime() - today().getTime()) / 86400000 >= 14), [expiries]);
  const selectedExpiry = eligibleExpiries.includes(expiryChoice) ? expiryChoice : eligibleExpiries[0] || '';
  const chain = useMemo(() => rows.filter(r => r.expiry === selectedExpiry), [rows, selectedExpiry]);
  const summary = useMemo(() => {
    const ce = chain.filter(r => r.type === 'CE');
    const pe = chain.filter(r => r.type === 'PE');
    const ceOi = ce.reduce((s, r) => s + r.oi, 0);
    const peOi = pe.reduce((s, r) => s + r.oi, 0);
    const ceChg = ce.reduce((s, r) => s + r.changeOi, 0);
    const peChg = pe.reduce((s, r) => s + r.changeOi, 0);
    const pcr = ceOi ? peOi / ceOi : 0;
    const bias = pcr >= 1.1 && peChg > ceChg ? 'CE BIAS' : pcr <= 0.9 && ceChg > peChg ? 'PE BIAS' : 'WAIT';
    const spot = chain.length ? chain[0].spot : 0;
    return { ceOi, peOi, ceChg, peChg, pcr, bias, spot };
  }, [chain]);
  const candidates = useMemo(() => {
    if (!chain.length || summary.bias === 'WAIT') return [];
    const type = summary.bias === 'CE BIAS' ? 'CE' : 'PE';
    return chain.filter(r => r.type === type).sort((a, b) => Math.abs(a.strike - summary.spot) - Math.abs(b.strike - summary.spot)).slice(0, 5);
  }, [chain, summary]);
  const handleUpload = async (file?: File) => {
    if (!file) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const parsed = parseCsv(await file.text(), file.name);
      if (!parsed.length) throw new Error('वाचता येणाऱ्या NIFTY option rows सापडल्या नाहीत.');
      setRows(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      setExpiryChoice('');
      setMessage(`${parsed.length} option rows import झाले. NSE CSV असल्यास spot हा CE-PE premium parity वरून अंदाजे काढला आहे. डेटा या browser मध्ये save केला आहे.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'CSV वाचता आला नाही.'); }
    finally { setLoading(false); }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([csvTemplate], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'moti-nifty-option-chain-template.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const clearData = () => {
    if (window.confirm('Saved NIFTY option-chain data delete करायचा?')) {
      setRows([]); localStorage.removeItem(STORAGE_KEY); setMessage('Option-chain data clear केला.');
    }
  };

  return <div className="space-y-5">
    <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#10243b] via-[#0d1928] to-[#0d1527] p-5 sm:p-7">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300"><Activity className="h-4 w-4" /> MOTI · Separate Options Module</div>
      <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl">NIFTY Options Positional Scanner</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-300">Intraday नाही. किमान 14 दिवस बाकी असलेली expiry निवडून CE / PE positioning तपासा. हा scanner फक्त option-chain CSV मधील OI data वापरतो; तो live signal किंवा guaranteed recommendation नाही.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-slate-950 hover:bg-cyan-200">
          <Upload className="h-4 w-4" /> {loading ? 'Reading CSV...' : 'Upload NIFTY Option Chain CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={loading} onChange={e => { handleUpload(e.target.files?.[0]); e.currentTarget.value = ''; }} />
        </label>
        <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-xs font-bold text-slate-200 hover:bg-white/5"><Download className="h-4 w-4" /> CSV Template</button>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">NSE चा मूळ Option Chain CSV किंवा Template format चालतो. NSE CSV मध्ये Expiry filename मधून घेतली जाते आणि Spot CE-PE premium parity वरून अंदाजे काढला जातो. डेटा local browser मध्येच save होतो; automatic live fetch नाही.</p>
    </div>

    {message && <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-xs text-emerald-200">{message}</div>}
    {error && <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{error}</div>}

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">NIFTY Spot (CSV)</p><p className="mt-1 text-xl font-black text-white">{summary.spot ? fmt(summary.spot) : '—'}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Put / Call OI Ratio</p><p className="mt-1 text-xl font-black text-white">{summary.pcr ? summary.pcr.toFixed(2) : '—'}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Directional read (OI only)</p><p className={'mt-1 text-xl font-black ' + (summary.bias === 'CE BIAS' ? 'text-emerald-300' : summary.bias === 'PE BIAS' ? 'text-rose-300' : 'text-amber-300')}>{summary.bias}</p></div>
    </div>

    <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-bold text-white">Expiry Selection</h2><p className="mt-1 text-[11px] text-slate-400">आजपासून किमान 14 दिवस पुढची expiryच दाखवली जाते.</p></div>
        <select value={selectedExpiry} onChange={e => setExpiryChoice(e.target.value)} className="rounded-lg border border-slate-600 bg-[#0a1220] px-3 py-2 text-sm text-white">
          {eligibleExpiries.length ? eligibleExpiries.map(e => <option key={e} value={e}>{e}</option>) : <option value="">14+ दिवसांची expiry उपलब्ध नाही</option>}
        </select>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">CE OI Change</p><p className="mt-1 text-sm font-bold text-white">{fmt(summary.ceChg)}</p></div>
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">PE OI Change</p><p className="mt-1 text-sm font-bold text-white">{fmt(summary.peChg)}</p></div>
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Eligible Expiries</p><p className="mt-1 text-sm font-bold text-white">{eligibleExpiries.length}</p></div>
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Contracts loaded</p><p className="mt-1 text-sm font-bold text-white">{chain.length}</p></div>
      </div>
    </div>

    <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <h2 className="text-sm font-bold text-white">Indicative Trade Planning</h2>
      <p className="mt-1 text-[11px] text-slate-400">Entry = uploaded option LTP. Target / Stop-loss हे premium वरचे editable risk levels आहेत; price forecast नाहीत.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-300">
        <label>Stop-loss % <input type="number" min="1" max="80" value={stopPct} onChange={e => setStopPct(Number(e.target.value))} className="ml-2 w-20 rounded border border-slate-600 bg-[#080f1b] px-2 py-1.5 text-white" /></label>
        <label>Target % <input type="number" min="1" max="200" value={targetPct} onChange={e => setTargetPct(Number(e.target.value))} className="ml-2 w-20 rounded border border-slate-600 bg-[#080f1b] px-2 py-1.5 text-white" /></label>
      </div>
      {candidates.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{['Type','Strike','Expiry','Option LTP / Entry','Stop-loss','Target','OI','Volume','IV'].map(x => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]">{candidates.map((r,i) => <tr key={r.expiry + r.strike + r.type}><td className="px-3 py-3 font-black text-emerald-300">{r.type}</td><td className="px-3 py-3 text-white">{fmt(r.strike)}</td><td className="px-3 py-3">{r.expiry}</td><td className="px-3 py-3 text-white">₹{fmt(r.ltp)}</td><td className="px-3 py-3 text-rose-300">₹{fmt(r.ltp * (1 - stopPct / 100))}</td><td className="px-3 py-3 text-emerald-300">₹{fmt(r.ltp * (1 + targetPct / 100))}</td><td className="px-3 py-3">{fmt(r.oi)}</td><td className="px-3 py-3">{fmt(r.volume)}</td><td className="px-3 py-3">{r.iv ? r.iv.toFixed(2) + '%' : '—'}</td></tr>)}</tbody></table></div> : <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs text-amber-100">{rows.length ? 'सध्याच्या OI reading वर स्पष्ट CE / PE bias नाही, किंवा 14+ दिवसांची expiry उपलब्ध नाही. WAIT.' : 'सुरुवात करण्यासाठी option-chain CSV upload कर.'}</div>}
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-[#080f1b] p-3 text-[11px] leading-5 text-slate-400"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> Option buying मध्ये premium पूर्ण गमावण्याचा धोका असतो. OI/PCR एकट्याने पुरेसे नाहीत; NIFTY chart trend, volatility, liquidity आणि event risk तपासल्याशिवाय trade घेऊ नकोस. No Trade हा वैध signal आहे.</div>
    </div>
    <div className="flex items-center justify-between text-[10px] text-slate-500"><span><CalendarClock className="mr-1 inline h-3 w-3" /> Data saved locally on this browser · CSV upload only</span><button onClick={clearData} className="underline hover:text-white">Clear option data</button></div>
  </div>;
};
