import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Upload, RefreshCw, FileSpreadsheet, Info } from 'lucide-react';

type DailyRow = {
  date: string; symbol: string; series?: string; close?: number; prevClose?: number;
  high?: number; low?: number; volume?: number; avgWeekVolume?: number;
  volumeMultiple?: number; pctChange?: number; sources: string[];
};
type ReportType = 'top20' | 'volume' | 'advance' | 'bhavcopy';
const STORAGE_KEY = 'moti_nse_daily_reports_v1';
const bhavcopyDateFromFilename = (name: string): string | undefined => {
  const match = name.match(/BhavCopy_NSE_CM_0_0_0_(\\d{4})(\\d{2})(\\d{2})_F_/i);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return undefined;
  return `${year}-${month}-${day}`;
};
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

const unzipFirstCsv = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('ZIP directory सापडली नाही.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (name.toLowerCase().endsWith('.csv')) {
      const dataOffset = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      let output: Uint8Array;
      if (method === 0) output = compressed;
      else if (method === 8) {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        output = new Uint8Array(await new Response(stream).arrayBuffer());
      } else throw new Error('ZIP compression format समर्थित नाही: ' + method);
      return new TextDecoder('utf-8').decode(output);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error('ZIP मध्ये CSV फाईल सापडली नाही.');
};
const parseBhavcopy = (text: string, date: string): DailyRow[] => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) throw new Error('Bhavcopy CSV रिकामी आहे.');
  const headers = splitCsvLine(lines[0]);
  const h = headers.map(norm);
  const idx = (...names: string[]) => h.findIndex(x => names.includes(x));
  const symbolCol = idx('tckrsymb', 'symbol');
  const seriesCol = idx('sctysrs', 'series');
  const openCol = idx('opnpric', 'open');
  const highCol = idx('hghpric', 'high');
  const lowCol = idx('lwpric', 'low');
  const closeCol = idx('clspric', 'close');
  const prevCol = idx('prvsclsgpric', 'prevclose');
  const volumeCol = idx('ttltradgvol', 'tottrdqty', 'volume');
  if ([symbolCol, seriesCol, highCol, lowCol, closeCol, prevCol, volumeCol].some(x => x < 0))
    throw new Error('हा NSE CM UDiFF Bhavcopy format नाही. आवश्यक Symbol/Series/OHLC/Prev Close/Volume कॉलम सापडले नाहीत.');
  return lines.slice(1).flatMap(line => {
    const c = splitCsvLine(line);
    const symbol = (c[symbolCol] || '').trim().toUpperCase();
    const series = (c[seriesCol] || '').trim().toUpperCase();
    if (!/^[A-Z0-9&.-]{1,30}$/.test(symbol) || !['EQ', 'BE'].includes(series)) return [];
    const close = num(c[closeCol]), prevClose = num(c[prevCol]);
    const pctChange = close !== undefined && prevClose ? ((close / prevClose) - 1) * 100 : undefined;
    return [{ date, symbol, series, close, prevClose, high: num(c[highCol]), low: num(c[lowCol]), volume: num(c[volumeCol]), pctChange, sources: ['bhavcopy'] }];
  }).filter(r => r.close !== undefined && r.high !== undefined && r.low !== undefined);
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
  const [stockSearch, setStockSearch] = useState('');
  const [minClose, setMinClose] = useState('');
  const [maxClose, setMaxClose] = useState('');
  const [minFiveDay, setMinFiveDay] = useState('');
  const [maxFiveDay, setMaxFiveDay] = useState('');
  const [minVolume, setMinVolume] = useState('');
  const [maxVolume, setMaxVolume] = useState('');
  const [minToday, setMinToday] = useState('');
  const [maxToday, setMaxToday] = useState('');
  const [breakout5, setBreakout5] = useState('all');
  const [breakout10, setBreakout10] = useState('all');
  const [breakout20, setBreakout20] = useState('all');
  const [darvas5, setDarvas5] = useState('all');
  const [darvas10, setDarvas10] = useState('all');
  const [darvas20, setDarvas20] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { setMessage('Browser storage भरले आहे. जुन्या नोंदी clear करा.'); } }, [records]);

  const latestDate = useMemo(() => records.reduce((d, r) => r.date > d ? r.date : d, ''), [records]);
  const latestRows = useMemo(() => records.filter(r => r.date === latestDate), [records, latestDate]);
  const candidates = useMemo(() => {
    // A symbol enters the watchlist once it meets EQ/BE +4% + price criteria.
    // After entry, it stays on the list regardless of daily % change, and is
    // only hidden while its latest known close is outside ₹300–₹3,000.
    const symbols = Array.from(new Set(records.map(r => r.symbol)));
    return symbols.map(symbol => {
      const symbolRows = records.filter(r => r.symbol === symbol);
      const history = symbolRows.filter(r => r.close !== undefined).sort((a, b) => a.date.localeCompare(b.date));
      const latest = history[history.length - 1] || latestRows.find(r => r.symbol === symbol);
      if (!latest) return null;
      const qualifiedBefore = symbolRows.some(r =>
        (r.series === 'EQ' || r.series === 'BE') &&
        (r.pctChange ?? -Infinity) >= 4 &&
        r.close !== undefined && r.close >= 300 && r.close <= 3000
      );
      const first = history.length >= 6 ? history[history.length - 6] : undefined;
      const weeklyChange = history.length >= 6 && first?.close ? ((latest.close! / first.close) - 1) * 100 : undefined;
      // Top 20 CSVs contain selective symbols, so these are prior Top 20 appearances,
      // not guaranteed consecutive exchange sessions. Exclude the latest report date.
      const priorTop20 = symbolRows
        .filter(r => (r.sources.includes('bhavcopy') || r.sources.includes('top20')) && r.date < latest.date && r.high !== undefined && r.low !== undefined)
        .sort((a, b) => a.date.localeCompare(b.date));
      const breakoutRanges = [5, 10, 20].map(days => {
        const sample = priorTop20.slice(-days);
        const enough = sample.length >= days;
        const boxHigh = enough ? Math.max(...sample.map(r => r.high!)) : undefined;
        const boxLow = enough ? Math.min(...sample.map(r => r.low!)) : undefined;
        return {
          days, enough, boxHigh, boxLow,
          breakout: enough && latest.close !== undefined && boxHigh !== undefined && latest.close > boxHigh,
          inside: enough && latest.close !== undefined && boxHigh !== undefined && boxLow !== undefined && latest.close <= boxHigh && latest.close >= boxLow
        };
      });
      const latestVolume = latestRows.find(r => r.symbol === symbol && r.volumeMultiple !== undefined);
      const volume = latestVolume?.volumeMultiple;
      const sourceSet = Array.from(new Set(latestRows.filter(r => r.symbol === symbol).flatMap(r => r.sources)));
      const latestSeries = [...symbolRows].reverse().find(r => r.series)?.series;
      const series = latestRows.find(r => r.symbol === symbol && r.series)?.series || latestSeries;
      const todayRow = latestRows.find(r => r.symbol === symbol && r.pctChange !== undefined);
      return { symbol, series, close: latest.close, weeklyChange, volumeMultiple: volume, breakoutRanges, sources: sourceSet, pctToday: todayRow?.pctChange ?? latest.pctChange, qualifiedBefore };
    }).filter((item): item is NonNullable<typeof item> =>
      item !== null &&
      item.qualifiedBefore &&
      (item.series === 'EQ' || item.series === 'BE') &&
      item.close !== undefined && item.close >= 300 && item.close <= 3000
    ).sort((a, b) => (b.weeklyChange ?? b.pctToday ?? -999) - (a.weeklyChange ?? a.pctToday ?? -999));
  }, [records, latestRows, latestDate]);

  const filteredCandidates = candidates.filter(item => {
    if (stockSearch && !item.symbol.toLowerCase().includes(stockSearch.trim().toLowerCase())) return false;
    if (minClose !== '' && (item.close === undefined || item.close < Number(minClose))) return false;
    if (maxClose !== '' && (item.close === undefined || item.close > Number(maxClose))) return false;
    if (minFiveDay !== '' && (item.weeklyChange === undefined || item.weeklyChange < Number(minFiveDay))) return false;
    if (maxFiveDay !== '' && (item.weeklyChange === undefined || item.weeklyChange > Number(maxFiveDay))) return false;
    if (minVolume !== '' && (item.volumeMultiple === undefined || item.volumeMultiple < Number(minVolume))) return false;
    if (maxVolume !== '' && (item.volumeMultiple === undefined || item.volumeMultiple > Number(maxVolume))) return false;
    if (minToday !== '' && (item.pctToday === undefined || item.pctToday < Number(minToday))) return false;
    if (maxToday !== '' && (item.pctToday === undefined || item.pctToday > Number(maxToday))) return false;
    const checkBreakout = (value: string, days: number) => {
      if (value === 'all') return true;
      const range = item.breakoutRanges.find(r => r.days === days);
      if (!range || !range.enough) return value === 'need';
      return value === 'yes' ? range.breakout : value === 'no' ? !range.breakout : false;
    };
    if (!checkBreakout(breakout5, 5) || !checkBreakout(breakout10, 10) || !checkBreakout(breakout20, 20)) return false;
    const checkDarvas = (value: string, days: number) => {
      if (value === 'all') return true;
      const box = item.breakoutRanges.find(r => r.days === days);
      if (!box || !box.enough) return value === 'need';
      const status = box.breakout ? 'breakout' : box.inside ? 'inside' : 'below';
      return status === value;
    };
    if (!checkDarvas(darvas5, 5) || !checkDarvas(darvas10, 10) || !checkDarvas(darvas20, 20)) return false;
    if (sourceFilter !== 'all' && !item.sources.includes(sourceFilter)) return false;
    return true;
  });
  const resetFilters = () => {
    setStockSearch(''); setMinClose(''); setMaxClose(''); setMinFiveDay(''); setMaxFiveDay('');
    setMinVolume(''); setMaxVolume(''); setMinToday(''); setMaxToday('');
    setBreakout5('all'); setBreakout10('all'); setBreakout20('all');
    setDarvas5('all'); setDarvas10('all'); setDarvas20('all'); setSourceFilter('all');
  };
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoading(true); setMessage(''); setErrors([]);
    const incoming: DailyRow[] = [], foundTypes: string[] = [], issues: string[] = [];
    for (const file of Array.from(files)) {
      const lowerName = file.name.toLowerCase();
      const isZip = lowerName.endsWith('.zip');
      const isCsv = lowerName.endsWith('.csv');
      if (!isCsv && !isZip) { issues.push(file.name + ': फक्त CSV report किंवा NSE Bhavcopy ZIP upload करा.'); continue; }
      try {
        if (isZip) {
          const csvText = await unzipFirstCsv(file);
          const fileDate = bhavcopyDateFromFilename(file.name) || reportDate;
          const rows = parseBhavcopy(csvText, fileDate);
          incoming.push(...rows);
          if (fileDate !== reportDate) setReportDate(fileDate);
          foundTypes.push('NSE Cash Market Bhavcopy (' + fileDate + ')');
        } else {
          const parsed = parseReport(await file.text(), reportDate);
          incoming.push(...parsed.rows);
          foundTypes.push(parsed.type === 'top20' ? 'Top 20' : parsed.type === 'volume' ? 'Volume Gainers' : 'Advances');
        }
      } catch (e) { issues.push(file.name + ': ' + (e instanceof Error ? e.message : 'CSV वाचता आला नाही')); }
    }
    if (incoming.length) {
      setRecords(old => mergeRows(old, incoming));
      setMessage(incoming.length + ' stock rows import झाले. Reports: ' + Array.from(new Set(foundTypes)).join(', '));
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
      <p className="mt-2 max-w-2xl text-sm text-slate-300">NSE Cash Market Bhavcopy ZIP किंवा जुने Top 20, Volume Gainers आणि Advances CSV वापरून movement व 5/10/20 breakouts तपासा. Bhavcopy upload स्वतंत्र टेस्ट आहे; जुने reports कायम आहेत.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="text-xs text-slate-300">Report date
          <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="mt-1 block rounded-lg border border-slate-600 bg-[#0a1220] px-3 py-2 text-white" />
        </label>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black text-slate-950 hover:bg-emerald-200">
          <Upload className="h-4 w-4" /> {loading ? 'Reading reports...' : 'Upload NSE CSV / Bhavcopy ZIP'}
          <input type="file" accept=".csv,.zip,text/csv,application/zip" multiple className="hidden" disabled={loading} onChange={e => { handleFiles(e.target.files); e.currentTarget.value = ''; }} />
        </label>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">एकाच तारखेचे जुने CSV किंवा NSE Cash Market Bhavcopy ZIP upload करू शकतोस. ZIP मधील EQ/BE rows स्वतंत्र bhavcopy source म्हणून साठतात. प्रत्येक upload आधी report date निवड.</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Filtered stocks (EQ/BE · +4% · ₹300–₹3,000)</p><p className="mt-1 text-2xl font-black text-white">{candidates.length}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Saved trading days</p><p className="mt-1 text-2xl font-black text-cyan-300">{new Set(records.map(r => r.date)).size}</p></div>
    </div>

    {message && <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-xs text-emerald-200">{message}</div>}
    {errors.length > 0 && <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{errors.map(e => <p key={e}>{e}</p>)}</div>}

    <div className="overflow-hidden rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2e4f] px-4 py-3">
        <div><h2 className="text-sm font-bold text-white">Weekly Movement & Breakout Candidates</h2><p className="mt-1 text-[10px] text-slate-400">Latest report date: {latestDate || '—'} · New entries: EQ/BE +4% and ₹300–₹3,000 · Existing stocks stay listed while price remains ₹300–₹3,000</p></div>
        <button onClick={clearHistory} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"><RefreshCw className="h-3 w-3" /> Clear history</button>
      </div>
      <div className="grid gap-2 border-b border-[#1e2e4f] bg-[#0a1220] p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <label className="text-[10px] text-slate-400">Stock<input value={stockSearch} onChange={e => setStockSearch(e.target.value)} placeholder="उदा. RELIANCE" className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white placeholder:text-slate-600" /></label>
        <div className="text-[10px] text-slate-400">Latest close (₹)<div className="mt-1 flex gap-1"><input aria-label="Minimum latest close" type="number" value={minClose} onChange={e => setMinClose(e.target.value)} placeholder="Min" className="w-1/2 min-w-0 rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white" /><input aria-label="Maximum latest close" type="number" value={maxClose} onChange={e => setMaxClose(e.target.value)} placeholder="Max" className="w-1/2 min-w-0 rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white" /></div></div>
        <div className="text-[10px] text-slate-400">5-day move (%)<div className="mt-1 flex gap-1"><input aria-label="Minimum 5-day move" type="number" step="0.5" value={minFiveDay} onChange={e => setMinFiveDay(e.target.value)} placeholder="Min" className="w-1/2 min-w-0 rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white" /><input aria-label="Maximum 5-day move" type="number" step="0.5" value={maxFiveDay} onChange={e => setMaxFiveDay(e.target.value)} placeholder="Max" className="w-1/2 min-w-0 rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white" /></div></div>
        <div className="text-[10px] text-slate-400">Volume vs 1W avg (x)<div className="mt-1 flex gap-1"><input aria-label="Minimum volume multiple" type="number" min="0" step="0.1" value={minVolume} onChange={e => setMinVolume(e.target.value)} placeholder="Min" className="w-1/2 min-w-0 rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white" /><input aria-label="Maximum volume multiple" type="number" min="0" step="0.1" value={maxVolume} onChange={e => setMaxVolume(e.target.value)} placeholder="Max" className="w-1/2 min-w-0 rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white" /></div></div>
        {[[5,breakout5,setBreakout5],[10,breakout10,setBreakout10],[20,breakout20,setBreakout20]].map(([days,value,setter]) => <label key={'range'+days} className="text-[10px] text-slate-400">Range breakout {days}D<select value={value} onChange={e => setter(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white"><option value="all">All</option><option value="yes">Breakout</option><option value="no">No breakout</option><option value="need">Insufficient data</option></select></label>)}
        {[[5,darvas5,setDarvas5],[10,darvas10,setDarvas10],[20,darvas20,setDarvas20]].map(([days,value,setter]) => <label key={'darvas'+days} className="text-[10px] text-slate-400">Darvas box {days}D<select value={value} onChange={e => setter(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white"><option value="all">All</option><option value="breakout">Box breakout</option><option value="inside">Inside box</option><option value="below">Below box</option><option value="need">Insufficient data</option></select></label>)}
        <div className="text-[10px] text-slate-400">Today (%)<div className="mt-1 flex gap-1"><input aria-label="Minimum today percent" type="number" step="0.5" value={minToday} onChange={e => setMinToday(e.target.value)} placeholder="Min" className="w-1/2 min-w-0 rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white" /><input aria-label="Maximum today percent" type="number" step="0.5" value={maxToday} onChange={e => setMaxToday(e.target.value)} placeholder="Max" className="w-1/2 min-w-0 rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white" /></div></div>
        <label className="text-[10px] text-slate-400">Report source<select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0d1527] px-2 py-2 text-xs text-white"><option value="all">All sources</option><option value="bhavcopy">Bhavcopy</option><option value="top20">Top 20</option><option value="volume">Volume Gainers</option><option value="advance">Advances</option></select></label>
        <div className="flex items-end justify-between gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-4"><p className="text-[10px] text-slate-400">Showing <span className="font-bold text-white">{filteredCandidates.length}</span> of {candidates.length} watchlist stocks</p><button onClick={resetFilters} className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-white/5">Reset all filters</button></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1150px] text-left text-xs">
          <thead className="bg-[#080f1b] text-[10px] uppercase text-slate-400"><tr>{['Stock','Latest Close','5-Day Move','Volume vs 1W Avg','Range Breakout 5/10/20','Darvas Box 5/10/20','Today %','Report Sources'].map(x => <th key={x} className="px-3 py-3">{x}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#1e2e4f]/60">
            {filteredCandidates.map(item => <tr key={item.symbol} className="hover:bg-white/[0.03]">
              <td className="px-3 py-3 font-black text-white">{item.symbol}</td>
              <td className="px-3 py-3 text-white">{money(item.close)}</td>
              <td className={'px-3 py-3 font-bold ' + ((item.weeklyChange ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{pct(item.weeklyChange)}</td>
              <td className="px-3 py-3 text-cyan-200">{item.volumeMultiple === undefined ? '—' : item.volumeMultiple.toFixed(2) + 'x'}</td>
              <td className="px-3 py-3"><div className="space-y-1">{item.breakoutRanges.map(r => <div key={r.days}><span className="text-slate-400">{r.days}D:</span> {r.enough ? r.breakout ? <span className="font-bold text-emerald-300">Breakout</span> : <span className="text-slate-300">No breakout</span> : <span className="text-slate-500">Need {r.days} daily records</span>}</div>)}</div></td>
              <td className="px-3 py-3"><div className="space-y-1">{item.breakoutRanges.map(r => <div key={r.days}><span className="text-slate-400">{r.days}D:</span> {r.enough ? <><span className={r.breakout ? 'font-bold text-emerald-300' : 'text-slate-300'}>{r.breakout ? 'Box breakout' : r.inside ? 'Inside box' : 'Below box'}</span><span className="ml-1 text-[10px] text-slate-500">({money(r.boxLow)}–{money(r.boxHigh)})</span></> : <span className="text-slate-500">Need {r.days} daily records</span>}</div>)}</div></td>
              <td className="px-3 py-3 text-slate-200">{pct(item.pctToday)}</td>
              <td className="px-3 py-3 text-[10px] text-slate-400">{item.sources.join(', ')}</td>
            </tr>)}
          </tbody>
        </table>
        {!filteredCandidates.length && <div className="p-8 text-center"><FileSpreadsheet className="mx-auto h-8 w-8 text-emerald-300" /><p className="mt-3 text-sm font-bold text-white">{candidates.length ? 'या filters मध्ये stock सापडला नाही' : 'NSE reports upload कर'}</p><p className="mt-2 text-xs text-slate-400">Top 20 CSV price range साठी, Volume Gainers CSV volume comparison साठी आणि Advances CSV मधील वाढणारे stocks शोधण्यासाठी वापरली जाईल. एकदा +4% वरून लिस्टमध्ये आलेला stock पुढे +4% खाली गेला तरी ₹300–₹3,000 रेंजमध्ये असेपर्यंत लिस्टमध्ये राहील.</p></div>}
      </div>
    </div>
    <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><div className="flex items-center gap-2 text-xs font-bold text-cyan-200"><Info className="h-4 w-4" /> Data notes</div>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-slate-400">
        <li>डेटा फक्त तू upload केलेल्या NSE reports मधून येतो; scanner live NSE prices fetch करत नाही.</li>
        <li>Reports browser च्या local storage मध्ये राहतात; त्याच browser/device वर पुढच्या दिवशी नवीन reports add कर.</li>
        <li>Volume Gainers report मधील NSE 1-week volume multiple थेट दाखवला जातो.</li>
        <li>Bhavcopy ZIP मधील रोजचे EQ/BE OHLCV रेकॉर्ड 5/10/20 Range Breakout आणि Darvas-style Box साठी वापरले जातात. जुन्या CSV-only डेटासाठी Top 20 appearances हा fallback आहे; त्या नोंदी सलग exchange sessions असतीलच असे नाही.</li>
        <li>NSE Cash Market Bhavcopy ZIP पूर्ण Cash Market universe मधील उपलब्ध EQ/BE records साठवण्यासाठी आहे. जुने Top 20/Volume Gainers/Advances reports स्वतंत्रपणे काम करत राहतात.</li>
        <li>नवीन stock लिस्टमध्ये येण्यासाठी EQ/BE series, त्या दिवसाचा बदल किमान +4% आणि किंमत ₹300–₹3,000 आवश्यक आहे. एकदा आलेला stock रोज +4% राहण्याची गरज नाही; तो ₹300–₹3,000 रेंजमध्ये असेपर्यंत लिस्टमध्ये राहतो. रेंजच्या बाहेर तात्पुरता लपतो आणि परत रेंजमध्ये आल्यावर पुन्हा दिसतो.</li>
      </ul>
    </div>
  </div>;
};
