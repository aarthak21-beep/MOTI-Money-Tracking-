import React, { useMemo, useState } from 'react';
import { Activity, Upload, RefreshCw, TrendingUp, ShieldAlert, Info, FileSpreadsheet } from 'lucide-react';

type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
type Candidate = { symbol: string; lastDate: string; close: number; ema20: number; ema50: number; rsi: number; volumeRatio: number; breakout: boolean; score: number; entry: number; stop: number; target: number; signal: string };

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const ema = (values: number[], period: number) => {
  if (values.length < period) return 0;
  const multiplier = 2 / (period + 1);
  return values.slice(1).reduce((current, value) => current + (value - current) * multiplier, average(values.slice(0, period)));
};
const rsi = (values: number[]) => {
  if (values.length < 15) return 0;
  const changes = values.slice(-15).slice(1).map((value, index) => value - values.slice(-15)[index]);
  const gains = changes.map(value => Math.max(value, 0));
  const losses = changes.map(value => Math.max(-value, 0));
  const avgGain = average(gains), avgLoss = average(losses);
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
};
const parseCsv = (text: string, filename: string): { symbol: string; candles: Candle[] }[] => {
  const lines = text.replace(/^\\uFEFF/, '').trim().split(/\\r?\\n/);
  if (lines.length < 52) throw new Error('किमान 51 trading-day rows आवश्यक आहेत.');
  const headers = lines[0].split(',').map(value => value.trim().toLowerCase().replaceAll('"', ''));
  const col = (...names: string[]) => headers.findIndex(header => names.includes(header));
  // Supports NSE CM-UDiFF bhavcopy and older NSE equity bhavcopy / security-wise CSV.
  const dateCol = col('traddt', 'trad dt', 'date1', 'date', 'timestamp');
  const symbolCol = col('tckrsymb', 'symbol');
  const seriesCol = col('sctysrs', 'series');
  const openCol = col('opnpric', 'open_price', 'open');
  const highCol = col('hghpric', 'high_price', 'high');
  const lowCol = col('lwpric', 'low_price', 'low');
  const closeCol = col('clspric', 'close_price', 'close');
  const volumeCol = col('ttltradgvol', 'ttl_trd_qnty', 'total_traded_quantity', 'volume');
  if ([dateCol, highCol, lowCol, closeCol, volumeCol].some(index => index < 0)) throw new Error('NSE CSV columns ओळखता आले नाहीत. NSE Equity Bhavcopy CSV वापरा.');
  const groups = new Map<string, Candle[]>();
  const parseDate = (value: string) => {
    const raw = value.trim();
    if (/^\\d{2}-[A-Za-z]{3}-\\d{4}$/.test(raw)) {
      const [day, month, year] = raw.split('-');
      return new Date(`${day} ${month} ${year}`).toISOString().slice(0, 10);
    }
    if (/^\\d{8}$/.test(raw)) return `${raw.slice(4, 8)}-${raw.slice(2, 4)}-${raw.slice(0, 2)}`;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
  };
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map(value => value.trim().replaceAll('"', ''));
    const series = seriesCol >= 0 ? cells[seriesCol]?.toUpperCase() : 'EQ';
    if (series && !['EQ', 'BE'].includes(series)) continue;
    const symbol = (symbolCol >= 0 ? cells[symbolCol] : filename.replace(/\\.csv$/i, '').replace(/[-_ ]historical.*/i, '')).toUpperCase();
    const candle = { date: parseDate(cells[dateCol] || ''), open: Number(cells[openCol] || cells[closeCol]), high: Number(cells[highCol]), low: Number(cells[lowCol]), close: Number(cells[closeCol]), volume: Number(cells[volumeCol]) };
    if (!symbol || !candle.date || ![candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) || candle.close <= 0 || candle.volume < 0) continue;
    if (!groups.has(symbol)) groups.set(symbol, []);
    groups.get(symbol)!.push(candle);
  }
  const parsed = Array.from(groups.entries()).map(([symbol, candles]) => ({ symbol, candles: candles.sort((a, b) => a.date.localeCompare(b.date)) })).filter(item => item.candles.length >= 51);
  if (!parsed.length) throw new Error('किमान 51 वैध daily candles असलेला NSE symbol मिळाला नाही. योग्य date range आणि EQ series तपासा.');
  return parsed;
};
const analyse = (symbol: string, candles: Candle[]): Candidate => {
  const closes = candles.map(row => row.close), latest = candles[candles.length - 1];
  const ema20 = ema(closes.slice(-100), 20), ema50 = ema(closes.slice(-150), 50), strength = rsi(closes);
  const prior = candles.slice(-21, -1), priorHigh = Math.max(...prior.map(row => row.high));
  const avgVolume = average(candles.slice(-21, -1).map(row => row.volume));
  const volumeRatio = avgVolume > 0 ? latest.volume / avgVolume : 0;
  const breakout = latest.close > priorHigh;
  let score = 0;
  if (ema20 > ema50) score += 25;
  if (latest.close > ema20) score += 15;
  if (breakout) score += 25;
  if (volumeRatio >= 2) score += 20; else if (volumeRatio >= 1.5) score += 15; else if (volumeRatio >= 1.2) score += 8;
  if (strength >= 55 && strength <= 70) score += 15; else if (strength > 50 && strength < 75) score += 8;
  const recentLow = Math.min(...candles.slice(-10).map(row => row.low));
  const stop = Math.min(recentLow, latest.close * 0.96);
  const risk = Math.max(latest.close - stop, latest.close * 0.01);
  return { symbol, lastDate: latest.date, close: latest.close, ema20, ema50, rsi: strength, volumeRatio, breakout, score, entry: latest.close, stop, target: latest.close + risk * 2, signal: breakout && volumeRatio >= 1.5 ? 'Volume Breakout' : ema20 > ema50 && latest.close > ema20 ? 'Uptrend Momentum' : 'Watchlist' };
};

export const SwingScannerView: React.FC = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [minScore, setMinScore] = useState(50);
  const [fileCount, setFileCount] = useState(0);
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoading(true); setErrors([]);
    const found: Candidate[] = [], issues: string[] = [];
    for (const file of Array.from(files)) {
      try { const parsed = parseCsv(await file.text(), file.name); found.push(...parsed.map(item => analyse(item.symbol, item.candles))); }
      catch (error) { issues.push(file.name + ': ' + (error instanceof Error ? error.message : 'CSV वाचता आले नाही')); }
    }
    setCandidates(found.sort((a, b) => b.score - a.score)); setErrors(issues); setFileCount(files.length); setLoading(false);
  };
  const filtered = useMemo(() => candidates.filter(item => item.score >= minScore), [candidates, minScore]);
  const money = (value: number) => '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return <div className="space-y-5">
    <div className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#102b2a] via-[#0d1928] to-[#0d1527] p-5 sm:p-7">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300"><Activity className="h-4 w-4" /> MOTI Trading Intelligence</div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-black text-white sm:text-3xl">Swing Movement Scanner</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Daily OHLCV data मधून breakout, volume surge आणि मजबूत uptrend शोधा. हा scanner 2–10 दिवसांच्या swing setup साठी आहे.</p></div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black text-slate-950 hover:bg-emerald-200">
          <Upload className="h-4 w-4" /> {loading ? 'Scanning...' : 'Import Daily CSV'}
          <input type="file" accept=".csv,text/csv" multiple className="hidden" disabled={loading} onChange={event => { handleFiles(event.target.files); event.currentTarget.value = ''; }} />
        </label>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Stocks Imported</p><p className="mt-1 text-2xl font-black text-white">{candidates.length}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Strong Setups (Score 70+)</p><p className="mt-1 text-2xl font-black text-emerald-300">{candidates.filter(item => item.score >= 70).length}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Showing Candidates</p><p className="mt-1 text-2xl font-black text-cyan-300">{filtered.length}</p></div>
    </div>
    <div className="flex flex-col gap-3 rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-bold text-white">Signal strength filter</p><p className="mt-1 text-[11px] text-slate-400">Minimum score: {minScore}/100</p></div>
      <input aria-label="Minimum signal score" type="range" min="0" max="90" step="5" value={minScore} onChange={event => setMinScore(Number(event.target.value))} className="w-full accent-emerald-300 sm:max-w-xs" />
    </div>
    {errors.length > 0 && <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{errors.map(error => <p key={error}>{error}</p>)}</div>}
    {candidates.length === 0 ? <div className="rounded-2xl border border-dashed border-[#2b3c5b] bg-[#0d1527] p-8 text-center">
      <FileSpreadsheet className="mx-auto h-8 w-8 text-emerald-300" /><h2 className="mt-3 text-base font-bold text-white">Import NSE stock daily CSV files</h2>
      <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-400">NSE India च्या Historical Reports मधून Equity Bhavcopy (CM-UDiFF) CSV डाउनलोड करा. एकाच Bhavcopy मध्ये अनेक NSE stocks असू शकतात. जुना NSE Equity Bhavcopy किंवा एखाद्या stock चा historical CSV सुद्धा चालेल. किमान 51 trading days आवश्यक आहेत.</p>
      <a className="mt-3 inline-block text-xs font-semibold text-emerald-300 underline" href="https://www.nseindia.com/all-reports" target="_blank" rel="noreferrer">Open NSE India – All Reports</a>
    </div> : <div className="overflow-hidden rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
      <div className="flex items-center justify-between border-b border-[#1e2e4f] px-4 py-3"><h2 className="text-sm font-bold text-white">Swing Candidates</h2><button onClick={() => { setCandidates([]); setErrors([]); setFileCount(0); }} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"><RefreshCw className="h-3 w-3" /> Clear</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-[#080f1b] text-[10px] uppercase text-slate-400"><tr>{['Stock / Signal','Score','Close','RSI 14','Vol vs 20D','EMA Trend','Entry','Stop Loss','2R Target','Data Date'].map(label => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]/60">{filtered.map(item => <tr key={item.symbol} className="hover:bg-white/[0.03]"><td className="px-3 py-3"><p className="font-black text-white">{item.symbol}</p><p className="mt-1 text-[10px] text-emerald-300">{item.signal}</p></td><td className="px-3 py-3"><span className={item.score >= 70 ? 'font-black text-emerald-300' : 'font-bold text-amber-300'}>{item.score}/100</span></td><td className="px-3 py-3 text-white">{money(item.close)}</td><td className="px-3 py-3 text-slate-200">{item.rsi.toFixed(1)}</td><td className="px-3 py-3 text-slate-200">{item.volumeRatio.toFixed(2)}x</td><td className="px-3 py-3">{item.ema20 > item.ema50 ? <span className="text-emerald-300">Bullish</span> : <span className="text-rose-300">Weak</span>}</td><td className="px-3 py-3 text-cyan-200">{money(item.entry)}</td><td className="px-3 py-3 text-rose-300">{money(item.stop)}</td><td className="px-3 py-3 text-emerald-300">{money(item.target)}</td><td className="px-3 py-3 text-slate-400">{item.lastDate}</td></tr>)}</tbody></table></div>
      {filtered.length === 0 && <p className="p-6 text-center text-xs text-slate-400">या score filter मध्ये stocks सापडले नाहीत.</p>}
      <p className="border-t border-[#1e2e4f] px-4 py-2 text-[10px] text-slate-500">{fileCount} CSV file(s) processed. Data is as recent as the uploaded files; scanner does not fetch live prices.</p>
    </div>}
    <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4"><div className="flex items-center gap-2 text-xs font-bold text-amber-200"><ShieldAlert className="h-4 w-4" /> Risk & data note</div><p className="mt-2 text-[11px] leading-5 text-slate-400">Entry = शेवटचा उपलब्ध Close; Stop Loss = अलीकडील 10 दिवसांचा Low किंवा 4% buffer यांपैकी कमी; Target = 2R. हे गणिती reference levels आहेत, buy/sell recommendation नाहीत. CSV date आणि data quality तपासा. Corporate actions / adjusted prices मुळे परिणाम बदलू शकतात.</p></div>
    <div className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"><Info className="mt-0.5 h-4 w-4 shrink-0" /> Score हा नियमांवर आधारित technical score आहे; तो probability किंवा guaranteed return नाही. प्रत्येक stock वर स्वतंत्रपणे risk तपासा.</div>
  </div>;
};
