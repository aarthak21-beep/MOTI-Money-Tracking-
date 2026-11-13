import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Upload, RefreshCw, FileSpreadsheet, Info } from 'lucide-react';

type DailyRow = {
  date: string; symbol: string; series?: string; close?: number; prevClose?: number;
  high?: number; low?: number; volume?: number; avgWeekVolume?: number;
  volumeMultiple?: number; pctChange?: number; sources: string[];
};
type ReportType = 'top20' | 'volume' | 'advance';
const STORAGE_KEY = 'moti_nse_daily_reports_v1';
const todayLocal = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const splitCsvLine = (line: string): string[] => {
  const out: string[] = []; let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { out.push(value.trim()); value = ''; }
    else value += c;
  }
  out.push(value.trim()); return out;
};
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9%]/g, '');
const num = (v?: string) => {
  if (!v) return undefined;
  const n = Number(v.replace(/[₹,%\s,]/g, '').replace(/\((.*)\)/, '-$1'));
  return Number.isFinite(n) ? n : undefined;
};
const findCol = (headers: string[], ...aliases: string[]) => headers.findIndex(h => aliases.includes(norm(h)));
const parseReport = (text: string, date: string): { type: ReportType; rows: DailyRow[] } => {
  const lines = text.replace(/^\uFEFF/, '').split(String.fromCharCode(10)).filter(line => line.trim());
  let headerAt = -1, headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const candidate = splitCsvLine(lines[i]);
    const h = candidate.map(norm);
    const isTop = h.includes('symbol') && h.includes('open') && h.includes('high') && h.includes('low') && h.includes('prevclose') && h.includes('ltp');
    const isVolume = h.includes('symbol') && h.includes('ltp') && h.includes('avgvolume') && h.some(x => x.includes('change'));
    const isAdvance = h.includes('symbol') && h.includes('series') && h.includes('ltp') && h.some(x => x.includes('change'));
    if (isTop || isVolume || isAdvance) { headerAt = i; headers = candidate; break; }
  }
  if (headerAt < 0) throw new Error('हा CSV Top 20, Volume Gainers किंवा Advances/Declines report वाटत नाही.');
  const h = headers.map(norm);
  const hasTop = h.includes('prevclose') && h.includes('open') && h.includes('high');
  const hasVolume = h.includes('avgvolume') && h.some(x => x.includes('change'));
  const type: ReportType = hasTop ? 'top20' : hasVolume ? 'volume' : 'advance';
  const col = (...names: string[]) => findCol(headers, ...names);
  const symbolCol = col('symbol');
  const closeCol = col('ltp', 'lasttradedprice');
  const seriesCol = col('series');
  const pctCol = col('%chng', '%change', 'chng', 'change', 'percentchange', 'changepercent');
  const rows: DailyRow[] = [];
  for (const line of lines.slice(headerAt + 1)) {
    const c = splitCsvLine(line);
    const symbol = (c[symbolCol] || '').trim().toUpperCase();
    if (!/^[A-Z0-9&.-]{1,30}$/.test(symbol)) continue;
    const close = num(c[closeCol]);
    const pctChange = num(c[pctCol]);
    let row: DailyRow = { date, symbol, series: seriesCol >= 0 ? (c[seriesCol] || '').trim().toUpperCase() : undefined, close, pctChange, sources: [type] };
    if (type === 'top20') {
      row = { ...row, high: num(c[col('high')]), low: num(c[col('low')]), prevClose: num(c[col('prevclose')]), volume: num(c[col('volume')]) };
    } else if (type === 'volume') {
      // NSE Volume Gainers columns: Symbol, Security Name, Volume, LTP, % Chng,
      // Turnover, Avg. Volume (1W), Change (times), Average Volume (2W), Change (times).
      row = { ...row, volume: num(c[col('volume')]), avgWeekVolume: num(c[col('avgvolume')]), volumeMultiple: num(c[col('change', 'changeoftimes', 'changeintimes')]) };
      if (row.volumeMultiple === undefined && row.volume && row.avgWeekVolume) row.volumeMultiple = row.volume / row.avgWeekVolume;
    } else {
      // Advances/Declines includes SYMBOL, SERIES, LTP, %CHANGE, market cap, volume, value.
      const pct = pctChange ?? 0;
      row = { ...row, prevClose: close && (1 + pct / 100) !== 0 ? close / (1 + pct / 100) : undefined };
    }
    if (row.close !== undefined || row.volume !== undefined || row.pctChange !== undefined) rows.push(row);
  }
  if (!rows.length) throw new Error('या report मध्ये वाचता येतील अशा stock rows नाहीत.');
  return { type, rows };
};
const mergeRows = (oldRows: DailyRow[], newRows: DailyRow[]) => {
  const map = new Map<string, DailyRow>();
  [...oldRows, ...newRows].forEach(row => {
    const key = row.date + '|' + row.symbol;
    const old = map.get(key);
    map.set(key, old ? {
      ...old, ...Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== undefined && k !== 'sources')),
      sources: Array.from(new Set([...old.sources, ...row.sources]))
    } as DailyRow : row);
  });
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol)).slice(-30000);
};
const money = (v?: number) => v === undefined ? '—' : '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const pct = (v?: number) => v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%';

export const SwingScannerView: React.FC = () => {
  const [records, setRecords] = useState<DailyRow[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as DailyRow[]; } catch { return []; }
  });
  const [reportDate, setReportDate] = useState(todayLocal);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { setMessage('Browser storage भरले आहे. जुन्या नोंदी clear करा.'); } }, [records]);

  const latestDate = useMemo(() => records.reduce((d, r) => r.date > d ? r.date : d, ''), [records]);
  const latestRows = useMemo(() => records.filter(r => r.date === latestDate), [records, latestDate]);
  const candidates = useMemo(() => {
    const symbols = Array.from(new Set(latestRows.map(r => r.symbol)));
    return symbols.map(symbol => {
      const history = records.filter(r => r.symbol === symbol && r.close !== undefined).sort((a, b) => a.date.localeCompare(b.date));
      const latest = history[history.length - 1] || latestRows.find(r => r.symbol === symbol)!;
      const prior5 = history.slice(-6, -1);
      const first = history.length >= 6 ? history[history.length - 6] : undefined;
      const weeklyChange = history.length >= 6 && first?.close ? ((latest.close! / first.close) - 1) * 100 : undefined;
      const highs = prior5.map(r => r.high).filter((v): v is number => v !== undefined);
      const breakout = latest.close !== undefined && highs.length >= 3 && latest.close > Math.max(...highs);
      const latestVolume = latestRows.find(r => r.symbol === symbol && r.volumeMultiple !== undefined);
      const volume = latestVolume?.volumeMultiple;
      const sourceSet = Array.from(new Set(records.filter(r => r.symbol === symbol && r.date === latestDate).flatMap(r => r.sources)));
      const series = latestRows.find(r => r.symbol === symbol && r.series)?.series;
      return { symbol, series, close: latest.close, weeklyChange, volumeMultiple: volume, breakout, rangeDays: highs.length, sources: sourceSet, pctToday: latest.pctChange };
    }).filter(item => (item.series === 'EQ' || item.series === 'BE') && (item.pctToday ?? -Infinity) >= 4 && item.close !== undefined && item.close >= 300 && item.close <= 3000).sort((a, b) => (b.weeklyChange ?? b.pctToday ?? -999) - (a.weeklyChange ?? a.pctToday ?? -999));
  }, [records, latestRows, latestDate]);

  const exportCsv = () => {
    if (!candidates.length) return;
    const headers = ['Symbol', 'Series', 'Latest Close', '5-Day Move %', 'Volume vs 1W Avg', 'Range Breakout', 'Today %', 'Report Sources'];
    const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const rows = candidates.map(item => [
      item.symbol, item.series, item.close, item.weeklyChange ?? '', item.volumeMultiple ?? '',
      item.breakout ? 'Yes' : 'No', item.pctToday ?? '', item.sources.join('; ')
    ]);
    const csv = [headers, ...rows].map(row => row.map(quote).join(',')).join('\\r\\n');
    const blob = new Blob(['\\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'MOTI_EQ_BE_Weekly_Movement_' + (latestDate || 'report') + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoading(true); setMessage(''); setErrors([]);
    const incoming: DailyRow[] = [], foundTypes: string[] = [], issues: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.csv')) { issues.push(file.name + ': फक्त CSV report upload करा.'); continue; }
      try {
        const parsed = parseReport(await file.text(), reportDate);
        incoming.push(...parsed.rows);
        foundTypes.push(parsed.type === 'top20' ? 'Top 20' : parsed.type === 'volume' ? 'Volume Gainers' : 'Advances');
      } catch (e) { issues.push(file.name + ': ' + (e instanceof Error ? e.message : 'CSV वाचता आला नाही')); }
    }
    if (incoming.length) {
      const seriesBySymbol = new Map(incoming.filter(r => r.series).map(r => [r.symbol, r.series!]));
      const eligible = incoming.filter(r => {
        const series = r.series || seriesBySymbol.get(r.symbol);
        return series === 'EQ' || series === 'BE';
      }).map(r => ({ ...r, series: r.series || seriesBySymbol.get(r.symbol) }));
      setRecords(old => mergeRows(old, eligible));
      setMessage(eligible.length + ' EQ/BE stock rows import झाले. Reports: ' + Array.from(new Set(foundTypes)).join(', ') + (eligible.length < incoming.length ? ' · EQ/BE नसलेले किंवा series न मिळालेले rows वगळले.' : ''));
    }
    setErrors(issues); setLoading(false);
  };
  const clearHistory = () => {
    if (window.confirm('जतन केलेला NSE report history clear करायचा?')) { setRecords([]); setMessage('Saved report history clear झाला.'); }
  };

  return <div className="space-y-5">
    <div className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#102b2a] via-[#0d1928] to-[#0d1527] p-5 sm:p-7">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300"><Activity className="h-4 w-4" /> MOTI Trading Intelligence</div>
      <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl">Weekly Movement Screener</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-300">NSE Top 20, Volume Gainers आणि Advances daily CSV वरून मागील trading days मधील stock movement शोधा. Bhavcopy लागत नाही.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="text-xs text-slate-300">Report date
          <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="mt-1 block rounded-lg border border-slate-600 bg-[#0a1220] px-3 py-2 text-white" />
        </label>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black text-slate-950 hover:bg-emerald-200">
          <Upload className="h-4 w-4" /> {loading ? 'Reading reports...' : 'Upload NSE report CSVs'}
          <input type="file" accept=".csv,text/csv" multiple className="hidden" disabled={loading} onChange={e => { handleFiles(e.target.files); e.currentTarget.value = ''; }} />
        </label>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">एकाच तारखेचे Top 20, Volume Gainers आणि Advances CSV एकत्र निवडू शकतोस. प्रत्येक upload आधी report date निवड.</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Stocks tracked</p><p className="mt-1 text-2xl font-black text-white">{latestRows.length}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Advances</p><p className="mt-1 text-2xl font-black text-emerald-300">{stats.up}</p></div>
      
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Saved trading days</p><p className="mt-1 text-2xl font-black text-cyan-300">{new Set(records.map(r => r.date)).size}</p></div>
    </div>

    {message && <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-xs text-emerald-200">{message}</div>}
    {errors.length > 0 && <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{errors.map(e => <p key={e}>{e}</p>)}</div>}

    <div className="overflow-hidden rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2e4f] px-4 py-3">
        <div><h2 className="text-sm font-bold text-white">Weekly Movement Candidates</h2><p className="mt-1 text-[10px] text-slate-400">Latest report date: {latestDate || '—'} · Showing stocks with today's gain of at least +4% · 5 trading day movement needs repeated daily reports</p></div>
        <div className="flex items-center gap-3"><button onClick={exportCsv} disabled={!candidates.length} className="inline-flex items-center gap-1 rounded-lg bg-emerald-300 px-3 py-2 text-[11px] font-bold text-slate-950 disabled:opacity-40"><FileSpreadsheet className="h-3 w-3" /> Export CSV</button><button onClick={clearHistory} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"><RefreshCw className="h-3 w-3" /> Clear history</button></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-[#080f1b] text-[10px] uppercase text-slate-400"><tr>{['Stock','Series','Latest Close','5-Day Move','Volume vs 1W Avg','Range Breakout','Today %','Report Sources'].map(x => <th key={x} className="px-3 py-3">{x}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#1e2e4f]/60">
            {candidates.map(item => <tr key={item.symbol} className="hover:bg-white/[0.03]">
              <td className="px-3 py-3 font-black text-white">{item.symbol}</td>
              <td className="px-3 py-3 text-white">{money(item.close)}</td>
              <td className={'px-3 py-3 font-bold ' + ((item.weeklyChange ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{pct(item.weeklyChange)}</td>
              <td className="px-3 py-3 text-cyan-200">{item.volumeMultiple === undefined ? '—' : item.volumeMultiple.toFixed(2) + 'x'}</td>
              <td className="px-3 py-3">{item.breakout ? <span className="text-emerald-300">High breakout</span> : item.rangeDays >= 3 ? <span className="text-slate-300">No high breakout</span> : <span className="text-slate-500">Need more Top 20 days</span>}</td>
              <td className="px-3 py-3 text-slate-200">{pct(item.pctToday)}</td>
              <td className="px-3 py-3 text-[10px] text-slate-400">{item.sources.join(', ')}</td>
            </tr>)}
          </tbody>
        </table>
        {!candidates.length && <div className="p-8 text-center"><FileSpreadsheet className="mx-auto h-8 w-8 text-emerald-300" /><p className="mt-3 text-sm font-bold text-white">NSE reports upload कर</p><p className="mt-2 text-xs text-slate-400">फक्त EQ/BE series, आजचा बदल +4% किंवा अधिक आणि किंमत ₹300–₹3,000 असलेले stocks दिसतील. CSV report साठी Export CSV वापर.</p></div>}
      </div>
    </div>
    <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><div className="flex items-center gap-2 text-xs font-bold text-cyan-200"><Info className="h-4 w-4" /> Data notes</div>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-slate-400">
        <li>डेटा फक्त तू upload केलेल्या NSE reports मधून येतो; scanner live NSE prices fetch करत नाही.</li>
        <li>Reports browser च्या local storage मध्ये राहतात; त्याच browser/device वर पुढच्या दिवशी नवीन reports add कर.</li>
        <li>Volume Gainers report मधील NSE 1-week volume multiple थेट दाखवला जातो.</li>
        <li>Range breakout साठी त्या stock चे किमान 3 आधीचे Top 20 daily observations आवश्यक आहेत; पुरेसा डेटा नसेल तर तसे दाखवले जाईल.</li>
        <li>Top 20 आणि Volume Gainers हे निवडक stocks आहेत; फक्त या reports वरून संपूर्ण NSE universe चे सर्व stocks scan होत नाहीत.</li>
        <li>फक्त EQ आणि BE series चे stocks घेतले जातात. EQ/BE ओळखण्यासाठी त्याच तारखेचा Advances CSV upload करणे आवश्यक आहे; इतर series वगळल्या जातात.</li>\n        <li>Export CSV मधून स्क्रीनवर फिल्टर होऊन दिसणाऱ्या stocksचा report डाउनलोड होतो; Advances/Declines ची एकूण संख्या दाखवली जात नाही.</li>
      </ul>
    </div>
  </div>;
};
