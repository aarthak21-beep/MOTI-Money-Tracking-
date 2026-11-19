import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Upload, RefreshCw, FileSpreadsheet, Info, Download, Trash2 } from 'lucide-react';
import { loadScannerData, saveScannerData } from '../services/cloudScannerStorage';

type DailyRow = {
  date: string; symbol: string; series?: string; close?: number; prevClose?: number;
  high?: number; low?: number; volume?: number; avgWeekVolume?: number;
  volumeMultiple?: number; pctChange?: number; sources: string[];
};
type ReportType = 'top20' | 'volume' | 'advance' | 'bhavcopy';
const bhavcopyDateFromFilename = (name: string): string | undefined => {
  const match = name.match(/BhavCopy_NSE_CM_0_0_0_(\d{4})(\d{2})(\d{2})_F_/i);
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
const parseDateValue = (value: string): string | undefined => {
  const v = value.trim();
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    if (date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(mo) - 1 && date.getUTCDate() === Number(d)) return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    if (date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(mo) - 1 && date.getUTCDate() === Number(d)) return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return undefined;
};
const reportDateFromUpload = (name: string, text: string): string | undefined => {
  const filename = name.match(/(?:^|\D)(\d{4})[-_]?([01]\d)[-_]?([0-3]\d)(?:\D|$)/) ||
    name.match(/(?:^|\D)([0-3]\d)[-_]?([01]\d)[-_]?(\d{4})(?:\D|$)/);
  if (filename) {
    const date = filename[1].length === 4 ? parseDateValue(`${filename[1]}-${filename[2]}-${filename[3]}`) : parseDateValue(`${filename[1]}-${filename[2]}-${filename[3]}`);
    if (date) return date;
  }
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  for (const line of lines.slice(0, 12)) {
    const labelled = line.match(/(?:report\s*date|trade\s*date|trading\s*date|as\s*on|date)\s*[,;:= -]+\s*["']?([^,"';]+)/i);
    if (labelled) {
      const date = parseDateValue(labelled[1]);
      if (date) return date;
    }
  }
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const headers = splitCsvLine(lines[i]);
    const dateCol = headers.findIndex(h => ['date', 'reportdate', 'tradedate', 'tradingdate'].includes(norm(h)));
    if (dateCol < 0) continue;
    for (const line of lines.slice(i + 1, i + 6)) {
      const date = parseDateValue(splitCsvLine(line)[dateCol] || '');
      if (date) return date;
    }
  }
  return undefined;
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
  // Support both NSE CM UDiFF bhavcopy and the classic sec_bhavdata_full CSV.
  // Classic headers include leading spaces (e.g. " SERIES", " CLOSE_PRICE").
  const symbolCol = idx('tckrsymb', 'symbol');
  const seriesCol = idx('sctysrs', 'series');
  const highCol = idx('hghpric', 'highprice', 'high');
  const lowCol = idx('lwpric', 'lowprice', 'low');
  const closeCol = idx('clspric', 'closeprice', 'close');
  const prevCol = idx('prvsclsgpric', 'prevclose');
  const volumeCol = idx('ttltradgvol', 'ttltrdqty', 'tottrdqty', 'ttltrdqty', 'volume');
  if ([symbolCol, seriesCol, highCol, lowCol, closeCol, prevCol, volumeCol].some(x => x < 0))
    throw new Error('NSE Bhavcopy मध्ये Symbol/Series/High/Low/Close/Prev Close/Volume कॉलम सापडले नाहीत.');
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
  const [records, setRecords] = useState<DailyRow[]>([]);
  const [reportDate, setReportDate] = useState(todayLocal);
  const [reportDateInput, setReportDateInput] = useState(todayLocal());
  useEffect(() => { setReportDateInput(reportDate); }, [reportDate]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'weeklyChange', direction: 'desc' });
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cloudRows = await loadScannerData<DailyRow[]>('swing');
        if (!active) return;
        if (cloudRows?.length) {
          setRecords(cloudRows);
        } else {
          // One-time migration only: preserve any older browser-only history in D1.
          // Normal reads and all future writes use D1; no browser storage is written.
          let legacyRows: DailyRow[] = [];
          try { legacyRows = JSON.parse(localStorage.getItem('moti_nse_daily_reports_v1') || '[]') as DailyRow[]; } catch { legacyRows = []; }
          if (legacyRows.length) {
            await saveScannerData('swing', legacyRows);
            // Remove the legacy copy only after D1 confirms the migration.
            try { localStorage.removeItem('moti_nse_daily_reports_v1'); } catch { /* storage may be unavailable */ }
            if (!active) return;
            setRecords(legacyRows);
            setMessage('जुना browser history D1 मध्ये migrate झाला.');
          }
        }
      } catch (e) {
        if (active) setMessage(e instanceof Error ? e.message : 'Cloud data load failed.');
      }
    })();
    return () => { active = false; };
  }, []);

  const bhavcopySessionDates = useMemo(() => Array.from(new Set(
    records.filter(r => r.sources.includes('bhavcopy')).map(r => r.date)
  )).sort(), [records]);
  const latestDate = useMemo(() => bhavcopySessionDates[bhavcopySessionDates.length - 1] || '', [bhavcopySessionDates]);
  const latestRows = useMemo(() => records.filter(r => r.date === latestDate), [records, latestDate]);
  const latestRowsBySymbol = useMemo(() => {
    const grouped = new Map<string, DailyRow[]>();
    for (const row of latestRows) {
      const rows = grouped.get(row.symbol);
      if (rows) rows.push(row);
      else grouped.set(row.symbol, [row]);
    }
    return grouped;
  }, [latestRows]);
  // Build the symbol index once. Filtering the full 30k-row history separately
  // for every symbol made scanner entry scale as records × symbols.
  const recordsBySymbol = useMemo(() => {
    const grouped = new Map<string, DailyRow[]>();
    for (const row of records) {
      const rows = grouped.get(row.symbol);
      if (rows) rows.push(row);
      else grouped.set(row.symbol, [row]);
    }
    for (const rows of grouped.values()) rows.sort((a, b) => a.date.localeCompare(b.date));
    return grouped;
  }, [records]);
  const candidates = useMemo(() => {
    // Bhavcopy is the source of truth for the watchlist and all technical levels.
    // A stock must qualify on an EQ/BE Bhavcopy session (+4%, close ₹1,000–₹2,900).
    const symbols = Array.from(recordsBySymbol.entries())
      .filter(([, rows]) => rows.some(r => r.sources.includes('bhavcopy')))
      .map(([symbol]) => symbol);
    return symbols.map(symbol => {
      const symbolRows = recordsBySymbol.get(symbol) || [];
      const bhavcopyRows = symbolRows
        .filter(r => r.sources.includes('bhavcopy') && r.high !== undefined && r.low !== undefined && r.close !== undefined);
      const latestBhavcopy = bhavcopyRows[bhavcopyRows.length - 1];
      if (!latestBhavcopy) return null;
      const latest = latestBhavcopy;
      const qualifiedBefore = bhavcopyRows.some(r =>
        (r.series === 'EQ' || r.series === 'BE') &&
        (r.pctChange ?? -Infinity) >= 4 &&
        r.close !== undefined && r.close >= 1000 && r.close <= 2900
      );
      const first = bhavcopyRows.length >= 6 ? bhavcopyRows[bhavcopyRows.length - 6] : undefined;
      const weeklyChange = bhavcopyRows.length >= 6 && first?.close
        ? ((latest.close! / first.close) - 1) * 100
        : undefined;

      // Only calculate a range when the stock has a row for every one of the
      // immediately preceding market-wide Bhavcopy sessions (no selective Top 20 gaps).
      const priorSessionDates = bhavcopySessionDates.filter(date => date < latest.date);
      const breakoutRanges = [5, 10, 20].map(days => {
        const sessionDates = priorSessionDates.slice(-days);
        const byDate = new Map(bhavcopyRows.map(row => [row.date, row]));
        const sample = sessionDates.map(date => byDate.get(date)).filter((row): row is DailyRow => !!row);
        const enough = sessionDates.length === days && sample.length === days;
        const boxHigh = enough ? Math.max(...sample.map(r => r.high!)) : undefined;
        const boxLow = enough ? Math.min(...sample.map(r => r.low!)) : undefined;
        return {
          days, enough, boxHigh, boxLow,
          breakout: enough && latest.close !== undefined && boxHigh !== undefined && latest.close > boxHigh,
          inside: enough && latest.close !== undefined && boxHigh !== undefined && boxLow !== undefined && latest.close <= boxHigh && latest.close >= boxLow
        };
      });

      // Volume multiple uses latest Bhavcopy volume versus the previous 5 sessions.
      const previousBhavcopyVolumes = bhavcopyRows
        .filter(r => r.date < latest.date)
        .slice(-5)
        .map(r => r.volume as number);
      const averagePreviousVolume = previousBhavcopyVolumes.length === 5
        ? previousBhavcopyVolumes.reduce((sum, value) => sum + value, 0) / 5
        : undefined;
      const volume = latest.volume !== undefined && averagePreviousVolume !== undefined && averagePreviousVolume > 0
        ? latest.volume / averagePreviousVolume
        : undefined;
      // Breakout strength is based on how far the latest close clears the strongest available range high.
      // Volume confirmation is shown separately so the two signals remain easy to interpret.
      const breakoutMargins = breakoutRanges
        .filter(r => r.breakout && r.boxHigh !== undefined && latest.close !== undefined && r.boxHigh > 0)
        .map(r => ({ days: r.days, margin: ((latest.close! / r.boxHigh!) - 1) * 100 }))
        .sort((a, b) => b.margin - a.margin);
      const bestBreakoutMargin = breakoutMargins[0]?.margin;
      const breakoutStrength = bestBreakoutMargin === undefined
        ? 'No breakout'
        : bestBreakoutMargin >= 1
          ? 'Strong'
          : bestBreakoutMargin >= 0.3
            ? 'Medium'
            : 'Weak';
      const volumeConfirmation = volume === undefined
        ? 'Unavailable'
        : volume >= 1.5
          ? 'Confirmed'
          : volume >= 1
            ? 'Average'
            : 'Low';

      const bhavcopyByDate = new Map(bhavcopyRows.map(row => [row.date, row]));
      // A retest is only flagged after a prior confirmed close breakout on a
      // complete set of preceding market sessions. The latest candle must
      // revisit the breakout level (within 1.5%), close back above it, and
      // finish positive versus its previous close.
      let priorBreakout: { date: string; level: number; days: number } | undefined;
      for (let i = 0; i < bhavcopyRows.length; i++) {
        const row = bhavcopyRows[i];
        if (row.date >= latest.date || row.close === undefined) continue;
        for (const days of [5, 10, 20]) {
          const precedingDates = bhavcopySessionDates.filter(date => date < row.date).slice(-days);
          if (precedingDates.length !== days) continue;
          const precedingRows = precedingDates.map(date => bhavcopyByDate.get(date));
          if (precedingRows.some(item => !item || item.high === undefined)) continue;
          const level = Math.max(...precedingRows.map(item => item!.high!));
          if (row.close > level && (!priorBreakout || row.date > priorBreakout.date)) {
            priorBreakout = { date: row.date, level, days };
          }
        }
      }
      const retestSignal = !priorBreakout
        ? (bhavcopyRows.length < 6 ? 'Insufficient data' : 'No retest')
        : latest.low !== undefined && latest.close !== undefined && latest.pctChange !== undefined &&
          latest.low <= priorBreakout.level * 1.015 &&
          latest.low >= priorBreakout.level * 0.985 &&
          latest.close >= priorBreakout.level &&
          latest.pctChange > 0
          ? 'Retest – Possible'
          : 'No retest';
      const retestLevel = retestSignal === 'Retest – Possible' ? priorBreakout?.level : undefined;
      // Score only a confirmed possible retest: proximity to the breakout level,
      // recovery from the session low, and lower-than-usual retest volume.
      const retestDistancePct = retestLevel !== undefined && latest.low !== undefined && retestLevel > 0
        ? Math.abs((latest.low / retestLevel) - 1) * 100
        : undefined;
      const retestRecoveryPct = latest.low !== undefined && latest.close !== undefined && latest.low > 0
        ? ((latest.close / latest.low) - 1) * 100
        : undefined;
      const retestProximityScore = retestDistancePct !== undefined
        ? Math.max(0, 40 * (1 - retestDistancePct / 1.5))
        : 0;
      const retestRecoveryScore = retestRecoveryPct !== undefined
        ? Math.min(30, Math.max(0, retestRecoveryPct / 1.5 * 30))
        : 0;
      const retestVolumeScore = volume === undefined ? 0
        : volume <= 0.8 ? 30
          : volume <= 1 ? 25
            : volume <= 1.3 ? 15
              : 5;
      const retestQualityScore = retestSignal === 'Retest – Possible'
        ? Math.round(retestProximityScore + retestRecoveryScore + retestVolumeScore)
        : undefined;
      const retestQuality = retestQualityScore === undefined
        ? (retestSignal === 'Insufficient data' ? 'Insufficient data' : 'No retest')
        : retestQualityScore >= 75 ? 'High'
          : retestQualityScore >= 55 ? 'Good'
            : 'Developing';

      // Check the next three actual market sessions after the latest prior breakout.
      const postBreakoutDates = priorBreakout
        ? bhavcopySessionDates.filter(date => date > priorBreakout!.date && date <= latest.date).slice(0, 3)
        : [];
      const postBreakoutRows = postBreakoutDates.map(date => bhavcopyByDate.get(date));
      const breakoutFailureSignal = !priorBreakout
        ? 'Not Confirmed'
        : postBreakoutRows.some(row => row?.close !== undefined && row.close < priorBreakout!.level)
          ? 'Failed'
          : postBreakoutDates.length === 3 && postBreakoutRows.every(row => row?.close !== undefined)
            ? 'Holding'
            : 'Not Confirmed';
      const sourceSet = Array.from(new Set((latestRowsBySymbol.get(symbol) || []).flatMap(r => r.sources)));
      const series = latest.series || [...symbolRows].reverse().find(r => r.sources.includes('bhavcopy') && r.series)?.series;
      const pctToday = latest.pctChange;

      const hasMediumBreakout = breakoutRanges.some(r => (r.days === 10 || r.days === 20) && r.breakout);
      const mediumBoxes = breakoutRanges.filter(r => r.days === 10 || r.days === 20);
      const nearBreakout = mediumBoxes.some(r =>
        r.enough && r.boxHigh !== undefined && latest.close !== undefined &&
        latest.close <= r.boxHigh && latest.close >= r.boxHigh * 0.97
      );

      // Detect a tightening base only from actual daily Bhavcopy sessions.
      // Compare the latest 5-session range with the preceding 5-session range.
      const baseSessionDates = bhavcopySessionDates.filter(date => date < latest.date).slice(-10);
      const dailyBhavcopy = baseSessionDates.map(date => bhavcopyByDate.get(date)).filter((row): row is DailyRow => !!row);
      const baseHasTenSessions = baseSessionDates.length === 10 && dailyBhavcopy.length === 10;
      const recentBase = baseHasTenSessions ? dailyBhavcopy.slice(-5) : [];
      const priorBase = baseHasTenSessions ? dailyBhavcopy.slice(0, 5) : [];
      const rangeWidth = (rows: DailyRow[]) => rows.length === 5
        ? (Math.max(...rows.map(r => r.high!)) - Math.min(...rows.map(r => r.low!)))
        : undefined;
      const recentWidth = rangeWidth(recentBase);
      const priorWidth = rangeWidth(priorBase);
      const recentVolumes = recentBase.map(row => row.volume);
      const priorVolumes = priorBase.map(row => row.volume);
      const recentAverageVolume = recentVolumes.length === 5 && recentVolumes.every(v => v !== undefined)
        ? recentVolumes.reduce((sum, value) => sum + value!, 0) / 5
        : undefined;
      const priorAverageVolume = priorVolumes.length === 5 && priorVolumes.every(v => v !== undefined)
        ? priorVolumes.reduce((sum, value) => sum + value!, 0) / 5
        : undefined;
      const volumeDryUpSignal = !baseHasTenSessions || recentAverageVolume === undefined ||
        priorAverageVolume === undefined || priorAverageVolume <= 0
        ? 'Insufficient data'
        : recentAverageVolume < priorAverageVolume
          ? 'Volume Dry-up'
          : 'Volume Normal';
      const recentHigh = recentBase.length === 5 ? Math.max(...recentBase.map(r => r.high!)) : undefined;
      const recentLow = recentBase.length === 5 ? Math.min(...recentBase.map(r => r.low!)) : undefined;
      const basePosition = recentHigh !== undefined && recentLow !== undefined && recentHigh > recentLow && latest.close !== undefined
        ? (latest.close - recentLow) / (recentHigh - recentLow)
        : undefined;
      const tighteningBase = recentWidth !== undefined && priorWidth !== undefined && priorWidth > 0 &&
        recentWidth < priorWidth * 0.8 && latest.close !== undefined &&
        recentWidth / latest.close <= 0.08 && (basePosition ?? 0) >= 0.6;
      // Flag a breakout only when a contracted 5-session base is followed
      // by a latest close strictly above that base's high.
      const consolidationBreakoutSignal = !baseHasTenSessions
        ? 'Insufficient data'
        : recentWidth !== undefined && priorWidth !== undefined && priorWidth > 0 &&
          recentHigh !== undefined && latest.close !== undefined &&
          recentWidth < priorWidth * 0.8 &&
          recentWidth / latest.close <= 0.08 &&
          latest.close > recentHigh
          ? 'Breakout'
          : 'No breakout';
      const weekly = weeklyChange ?? 0;
      const today = pctToday ?? 0;
      const strongSetup = hasMediumBreakout && weekly >= 3 && (volume ?? 0) >= 1.5 && today <= 5;
      const accumulationSetup = tighteningBase && weekly <= 8 && today <= 5 && (volume === undefined || volume <= 1.3);
      const breakoutWatch = nearBreakout || (mediumBoxes.some(r => r.inside) && (basePosition ?? 0) >= 0.6);

      const setup = weekly > 10 || today > 5
        ? 'Avoid / Extended'
        : strongSetup
          ? 'Strong Setup'
          : breakoutWatch
            ? 'Breakout Watch'
            : accumulationSetup
              ? 'Accumulation / Base'
              : 'No Setup';
      return { symbol, series, close: latest.close, weeklyChange, volumeMultiple: volume, volumeConfirmation, breakoutStrength, bestBreakoutMargin, retestSignal, retestLevel, retestQuality, retestQualityScore, breakoutFailureSignal, consolidationBreakoutSignal, volumeDryUpSignal, breakoutRanges, sources: sourceSet, pctToday, qualifiedBefore, setup };
    }).filter((item): item is NonNullable<typeof item> =>
      item !== null &&
      item.qualifiedBefore &&
      (item.series === 'EQ' || item.series === 'BE') &&
      item.close !== undefined && item.close >= 1000 && item.close <= 2900
    ).sort((a, b) => (b.weeklyChange ?? b.pctToday ?? -999) - (a.weeklyChange ?? a.pctToday ?? -999));
  }, [recordsBySymbol, latestRowsBySymbol, latestDate, bhavcopySessionDates]);

  const sortedCandidates = useMemo(() => [...candidates].sort((a, b) => {
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    const rangeScore = (item: typeof candidates[number], mode: 'breakout' | 'darvas') => {
      const score = (days: number) => {
        const r = item.breakoutRanges.find(x => x.days === days);
        if (!r?.enough) return 0;
        if (mode === 'breakout') return r.breakout ? 2 : 1;
        return r.breakout ? 3 : r.inside ? 2 : 1;
      };
      return score(5) * 100 + score(10) * 10 + score(20);
    };
    const value = (item: typeof candidates[number]): string | number => {
      switch (sortConfig.key) {
        case 'symbol': return item.symbol;
        case 'setup': return item.setup;
        case 'close': return item.close ?? Number.NEGATIVE_INFINITY;
        case 'weeklyChange': return item.weeklyChange ?? Number.NEGATIVE_INFINITY;
        case 'volumeMultiple': return item.volumeMultiple ?? Number.NEGATIVE_INFINITY;
        case 'breakoutStrength': return item.bestBreakoutMargin ?? Number.NEGATIVE_INFINITY;
        case 'volumeConfirmation': return item.volumeMultiple ?? Number.NEGATIVE_INFINITY;
        case 'retestSignal': return item.retestSignal;
        case 'retestQuality': return item.retestQualityScore ?? Number.NEGATIVE_INFINITY;
        case 'breakoutFailureSignal': return item.breakoutFailureSignal;
        case 'consolidationBreakoutSignal': return item.consolidationBreakoutSignal;
        case 'volumeDryUpSignal': return item.volumeDryUpSignal;
        case 'breakout': return rangeScore(item, 'breakout');
        case 'darvas': return rangeScore(item, 'darvas');
        case 'pctToday': return item.pctToday ?? Number.NEGATIVE_INFINITY;
        case 'sources': return item.sources.join(', ');
        default: return item.weeklyChange ?? Number.NEGATIVE_INFINITY;
      }
    };
    const av = value(a), bv = value(b);
    if (typeof av === 'string' && typeof bv === 'string') return direction * av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
    return direction * ((av as number) - (bv as number));
  }), [candidates, sortConfig]);
  const visibleCandidates = sortedCandidates;
  const toggleSort = (key: string) => {
    setSortConfig(current => ({
    key,
    direction: current.key === key ? (current.direction === 'desc' ? 'asc' : 'desc') : key === 'symbol' ? 'asc' : 'desc'
    }));
  };
  const sortIndicator = (key: string) => sortConfig.key === key ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕';
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
          const csvText = await file.text();
          const detectedDate = reportDateFromUpload(file.name, csvText);
          const effectiveDate = detectedDate || reportDate;
          const parsed = parseReport(csvText, effectiveDate);
          incoming.push(...parsed.rows);
          if (detectedDate) setReportDate(detectedDate);
          foundTypes.push((parsed.type === 'top20' ? 'Top 20' : parsed.type === 'volume' ? 'Volume Gainers' : 'Advances') + ' (' + effectiveDate + (detectedDate ? ', auto date' : ', selected date') + ')');
        }
      } catch (e) { issues.push(file.name + ': ' + (e instanceof Error ? e.message : 'CSV वाचता आला नाही')); }
    }
    if (incoming.length) {
      try {
        const merged = mergeRows(records, incoming);
        await saveScannerData('swing', merged);
        setRecords(merged);
        setMessage(incoming.length + ' stock rows import झाले आणि D1 मध्ये save झाले. Reports: ' + Array.from(new Set(foundTypes)).join(', '));
      } catch (e) {
        setMessage('D1 save अयशस्वी: ' + (e instanceof Error ? e.message : 'Cloud save failed.'));
      }
    }
    setErrors(issues); setLoading(false);
  };
  const exportCsv = () => {
    if (!sortedCandidates.length) return;
    // FYERS Web watchlist import: one row, comma-separated NSE trading symbols.
    // Preserve the actual EQ/BE series recorded by the scanner; default to EQ.
    const symbols = sortedCandidates.map(item => 'NSE:' + item.symbol + '-' + (item.series === 'BE' ? 'BE' : 'EQ'));
    const csv = '\uFEFF' + symbols.join(',');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fyers-watchlist-' + (latestDate || todayLocal()) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const removeStock = async (symbol: string) => {
    if (!window.confirm(symbol + ' ची Swing Scanner मधील सर्व दिवसांची नोंद delete करायची?')) return;
    setLoading(true);
    try {
      const updated = records.filter(row => row.symbol !== symbol);
      await saveScannerData('swing', updated);
      setRecords(updated);
      setMessage(symbol + ' ची Swing Scanner मधील सर्व इतिहासासह नोंद delete केली.');
    } catch (e) {
      setMessage(symbol + ' delete अयशस्वी: ' + (e instanceof Error ? e.message : 'Cloud save failed.'));
    } finally { setLoading(false); }
  };
  const clearHistory = async () => {
    if (!window.confirm('जतन केलेला NSE report history D1 मधून clear करायचा?')) return;
    setLoading(true);
    try {
      await saveScannerData('swing', []);
      // Prevent the one-time legacy migration from restoring cleared history on refresh.
      try { localStorage.removeItem('moti_nse_daily_reports_v1'); } catch { /* storage may be unavailable */ }
      setRecords([]);
      setMessage('Saved report history D1 मधून clear झाला.');
    } catch (e) {
      setMessage('D1 history clear अयशस्वी: ' + (e instanceof Error ? e.message : 'Cloud save failed.'));
    } finally { setLoading(false); }
  };

  return <div className="space-y-5">
    <div className="swing-upload-panel rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#102b2a] via-[#0d1928] to-[#0d1527] p-5 sm:p-7">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300"><Activity className="h-4 w-4" /> MOTI Trading Intelligence</div>
      <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl">Weekly Movement Screener</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-300">NSE Cash Market Bhavcopy ZIP किंवा जुने Top 20, Volume Gainers आणि Advances CSV वापरून movement व 5/10/20 breakouts तपासा. Bhavcopy upload स्वतंत्र टेस्ट आहे; जुने reports कायम आहेत.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative">
          <span className="text-xs text-slate-300">Report date</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="text" inputMode="numeric" aria-label="Edit report date" placeholder="YYYY-MM-DD" value={reportDateInput} onChange={e => setReportDateInput(e.target.value)} onBlur={() => {
              const value = reportDateInput.trim();
              if (/^\d{4}-\d{2}-\d{2}$/.test(value) && parseDateValue(value)) setReportDate(value);
              else setReportDateInput(reportDate || todayLocal());
            }} className="w-[145px] rounded-lg border border-slate-600 bg-[#0a1220] px-3 py-2 text-sm font-semibold text-white placeholder:text-slate-500 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-300">Upload NSE CSV / Bhavcopy ZIP</span>
          <input
            type="file"
            accept=".csv,.zip,text/csv,application/zip"
            multiple
            disabled={loading}
            onChange={e => {
              const input = e.currentTarget;
              const selectedFiles = input.files;
              void handleFiles(selectedFiles).finally(() => { input.value = ''; });
            }}
            className="block w-full max-w-[360px] cursor-pointer rounded-xl border border-emerald-300/40 bg-[#0a1220] p-2 text-xs text-white file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-emerald-300 file:px-4 file:py-2 file:text-xs file:font-black file:text-slate-950 hover:file:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">CSV/ZIP upload केल्यावर file name किंवा report header मधून तारीख आपोआप शोधली जाईल. तारीख सापडली नाही तर वर निवडलेली Report date वापरली जाईल.</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Filtered stocks (EQ/BE · +4% · ₹1,000–₹2,900)</p><p className="mt-1 text-2xl font-black text-white">{candidates.length}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Saved trading days</p><p className="mt-1 text-2xl font-black text-cyan-300">{new Set(records.map(r => r.date)).size}</p></div>
    </div>

    {message && <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-xs text-emerald-200">{message}</div>}
    {errors.length > 0 && <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{errors.map(e => <p key={e}>{e}</p>)}</div>}

    <div className="overflow-hidden rounded-2xl border border-[#1e2e4f] bg-[#0d1527]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2e4f] px-4 py-3">
        <div><h2 className="text-sm font-bold text-white">Weekly Movement & Breakout Candidates</h2><p className="mt-1 text-[10px] text-slate-400">Latest report date: {latestDate || '—'} · New entries: EQ/BE +4% and ₹1,000–₹2,900 · Existing stocks stay listed while price remains ₹1,000–₹2,900</p></div>
        <div className="flex items-center gap-3"><button type="button" onClick={exportCsv} disabled={!sortedCandidates.length} className="inline-flex items-center gap-1 rounded-lg bg-emerald-300 px-3 py-2 text-[11px] font-bold text-slate-950 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-3 w-3" /> Export CSV</button><button onClick={clearHistory} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"><RefreshCw className="h-3 w-3" /> Clear history</button></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1150px] text-left text-xs">
          <thead className="bg-[#080f1b] text-[10px] uppercase text-slate-400">
            <tr>{[{label:'Stock',key:'symbol'},{label:'Setup',key:'setup'},{label:'Latest Close',key:'close'},{label:'5-Day Move',key:'weeklyChange'},{label:'Volume vs 1W Avg',key:'volumeMultiple'},{label:'Breakout Strength',key:'breakoutStrength'},{label:'Volume Confirmation',key:'volumeConfirmation'},{label:'Retest Signal',key:'retestSignal'},{label:'Retest Quality',key:'retestQuality'},{label:'Breakout Failure',key:'breakoutFailureSignal'},{label:'Consolidation Breakout',key:'consolidationBreakoutSignal'},{label:'Volume Dry-up',key:'volumeDryUpSignal'},{label:'Range Breakout 5/10/20',key:'breakout'},{label:'Darvas Box 5/10/20',key:'darvas'},{label:'Today %',key:'pctToday'},{label:'Report Sources',key:'sources'},{label:'Delete',key:'delete'}].map(col => <th key={col.key} className="px-3 py-3"><button type="button" onClick={() => toggleSort(col.key)} className="whitespace-nowrap text-left font-bold hover:text-emerald-300 focus:text-emerald-300" title="Sort this column">{col.label}{sortIndicator(col.key)}</button></th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[#1e2e4f]/60">
            {visibleCandidates.map(item => <tr key={item.symbol} className="hover:bg-white/[0.03]">
              <td className="px-3 py-3 font-black text-white">{item.symbol}</td>
              <td className="px-3 py-3"><span className={item.setup === 'Strong Setup' ? 'rounded-md bg-emerald-300/15 px-2 py-1 font-bold text-emerald-300' : item.setup === 'Avoid / Extended' ? 'rounded-md bg-rose-300/10 px-2 py-1 font-semibold text-rose-300' : 'rounded-md bg-amber-300/10 px-2 py-1 font-semibold text-amber-200'}>{item.setup}</span></td>
              <td className="px-3 py-3 text-white">{money(item.close)}</td>
              <td className={'px-3 py-3 font-bold ' + ((item.weeklyChange ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{pct(item.weeklyChange)}</td>
              <td className="px-3 py-3 text-cyan-200">{item.volumeMultiple === undefined ? '—' : item.volumeMultiple.toFixed(2) + 'x'}</td>
              <td className="px-3 py-3"><span className={item.breakoutStrength === 'Strong' ? 'font-bold text-emerald-300' : item.breakoutStrength === 'Medium' ? 'font-semibold text-amber-200' : item.breakoutStrength === 'Weak' ? 'text-orange-300' : 'text-slate-400'}>{item.breakoutStrength}</span>{item.bestBreakoutMargin !== undefined && <span className="ml-1 text-[10px] text-slate-500">(+{item.bestBreakoutMargin.toFixed(2)}%)</span>}</td>
              <td className="px-3 py-3"><span className={item.volumeConfirmation === 'Confirmed' ? 'font-bold text-emerald-300' : item.volumeConfirmation === 'Average' ? 'text-amber-200' : item.volumeConfirmation === 'Low' ? 'text-orange-300' : 'text-slate-500'}>{item.volumeConfirmation}</span></td>
              <td className="px-3 py-3"><span className={item.retestSignal === 'Retest – Possible' ? 'font-semibold text-cyan-200' : 'text-slate-500'}>{item.retestSignal}</span>{item.retestLevel !== undefined && <span className="ml-1 text-[10px] text-slate-500">({money(item.retestLevel)})</span>}</td>
              <td className="px-3 py-3"><span className={item.retestQuality === 'High' ? 'font-bold text-emerald-300' : item.retestQuality === 'Good' ? 'font-semibold text-cyan-200' : item.retestQuality === 'Developing' ? 'text-amber-200' : 'text-slate-500'}>{item.retestQuality}{item.retestQualityScore !== undefined && <span className="ml-1 text-[10px] text-slate-500">({item.retestQualityScore}/100)</span>}</span></td>
              <td className="px-3 py-3"><span className={item.breakoutFailureSignal === 'Failed' ? 'font-bold text-rose-300' : item.breakoutFailureSignal === 'Holding' ? 'font-semibold text-emerald-300' : 'text-slate-500'}>{item.breakoutFailureSignal}</span></td>
              <td className="px-3 py-3"><span className={item.consolidationBreakoutSignal === 'Breakout' ? 'font-bold text-emerald-300' : 'text-slate-500'}>{item.consolidationBreakoutSignal}</span></td>
              <td className="px-3 py-3"><span className={item.volumeDryUpSignal === 'Volume Dry-up' ? 'font-semibold text-cyan-200' : 'text-slate-500'}>{item.volumeDryUpSignal}</span></td>
              <td className="px-3 py-3"><div className="space-y-1">{item.breakoutRanges.map(r => <div key={r.days}><span className="text-slate-400">{r.days}D:</span> {r.enough ? r.breakout ? <span className="font-bold text-emerald-300">Breakout</span> : <span className="text-slate-300">No breakout</span> : <span className="text-slate-500">Need {r.days} daily records</span>}</div>)}</div></td>
              <td className="px-3 py-3"><div className="space-y-1">{item.breakoutRanges.map(r => <div key={r.days}><span className="text-slate-400">{r.days}D:</span> {r.enough ? <><span className={r.breakout ? 'font-bold text-emerald-300' : 'text-slate-300'}>{r.breakout ? 'Box breakout' : r.inside ? 'Inside box' : 'Below box'}</span><span className="ml-1 text-[10px] text-slate-500">({money(r.boxLow)}–{money(r.boxHigh)})</span></> : <span className="text-slate-500">Need {r.days} daily records</span>}</div>)}</div></td>
              <td className="px-3 py-3 text-slate-200">{pct(item.pctToday)}</td>
              <td className="px-3 py-3 text-[10px] text-slate-400">{item.sources.join(', ')}</td>
              <td className="px-3 py-3"><button type="button" onClick={() => void removeStock(item.symbol)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300/20 px-2 py-1.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-300/10"><Trash2 className="h-3.5 w-3.5"/>Delete</button></td>
            </tr>)}
          </tbody>
        </table>
        {!candidates.length && <div className="p-8 text-center"><FileSpreadsheet className="mx-auto h-8 w-8 text-emerald-300" /><p className="mt-3 text-sm font-bold text-white">{candidates.length ? 'या filters मध्ये stock सापडला नाही' : 'NSE reports upload कर'}</p><p className="mt-2 text-xs text-slate-400">Top 20 CSV price range साठी, Volume Gainers CSV volume comparison साठी आणि Advances CSV मधील वाढणारे stocks शोधण्यासाठी वापरली जाईल. एकदा +4% वरून लिस्टमध्ये आलेला stock पुढे +4% खाली गेला तरी ₹1,000–₹2,900 रेंजमध्ये असेपर्यंत लिस्टमध्ये राहील.</p></div>}
      </div>
      <div className="border-t border-[#1e2e4f] bg-[#0a1220] px-4 py-3"><p className="text-[10px] text-slate-400">Showing all <span className="font-bold text-white">{candidates.length}</span> watchlist stocks on one page</p></div>
    </div>
    <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><div className="flex items-center gap-2 text-xs font-bold text-cyan-200"><Info className="h-4 w-4" /> Data notes</div>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-slate-400">
        <li>डेटा फक्त तू upload केलेल्या NSE reports मधून येतो; scanner live NSE prices fetch करत नाही.</li>
        <li>Reports D1 cloud database मध्ये save होतात; वेगळ्या browser/device वरूनही त्याच account ने history मिळते.</li>
        <li>Breakout Strength हे सर्व उपलब्ध 5D/10D/20D breakouts पैकी close संबंधित range high च्या किती टक्के वर आहे यावर ठरते: 1% किंवा जास्त Strong, 0.30% ते 0.99% Medium, आणि 0% ते 0.29% Weak. हे scanner चे descriptive thresholds आहेत, हमी किंवा prediction नाही.</li>
        <li>Volume Confirmation: latest Bhavcopy volume मागील 5 available Bhavcopy sessions च्या average पेक्षा 1.5x किंवा जास्त असल्यास Confirmed, 1.0x ते 1.49x Average, 1.0x पेक्षा कमी Low; पुरेसा volume data नसेल तर Unavailable.</li>
        <li>Retest Signal: आधीच्या पूर्ण 5/10/20-session range वर close breakout झाल्यानंतर latest low त्या breakout level च्या ±1.5% मध्ये येऊन close level वर/वर आणि दिवसाचा बदल positive असल्यास Retest – Possible. हा संभाव्य price retest आहे; buy/sell recommendation नाही.</li>
        <li>Retest Quality: फक्त Retest – Possible असल्यास 0–100 score दाखवतो. Breakout level पासून low चे अंतर (40 points), low पासून close पर्यंतची recovery (30 points), आणि latest volume मागील 5 sessions च्या average पेक्षा कमी/जवळ असल्यास volume score (30 points) मिळतो. 75+ High, 55–74 Good, 55 पेक्षा कमी Developing. हा descriptive score आहे; future performance ची हमी नाही.</li>
        <li>Breakout Failure: आधीच्या 5/10/20-session close breakout नंतरच्या पुढील 3 actual Bhavcopy sessions तपासल्या जातात. कोणताही close breakout level खाली गेला तर Failed; तिन्ही closes level वर/वर असतील तर Holding; 3 sessions पूर्ण नसतील किंवा row missing असेल तर Not Confirmed. हा descriptive alert आहे, buy/sell recommendation नाही.</li>
        <li>Consolidation Breakout: latest आधीच्या 5 actual Bhavcopy sessions चा high-low range त्याआधीच्या 5 sessions च्या range पेक्षा किमान 20% कमी आणि latest close च्या 8% पर्यंत असावा. Latest close त्या 5-session base च्या high पेक्षा strictly वर असल्यास Breakout; 10 पूर्ण sessions नसल्यास Insufficient data. हा descriptive alert आहे, buy/sell recommendation नाही.</li>
        <li>Volume Dry-up: latest आधीच्या 5 actual Bhavcopy sessions चा average volume त्याआधीच्या 5 sessions च्या average पेक्षा कमी असल्यास Volume Dry-up; समान किंवा जास्त असल्यास Volume Normal. दोन्ही 5-session groups मधील सर्व 10 daily volume values आणि dates आवश्यक आहेत; अन्यथा Insufficient data. हा descriptive signal आहे, accumulation किंवा price direction ची खात्री नाही.</li>
        <li>Volume analysis साठी फक्त Bhavcopy वापरली जाते: शेवटच्या उपलब्ध Bhavcopy session चा volume ÷ त्याआधीच्या 5 Bhavcopy sessions चा average. 5 जुने sessions किंवा volume data नसेल तर — दिसेल. Volume Gainers CSV या गणनेत वापरली जात नाही.</li>
        <li>Bhavcopy ZIP मधील रोजचे EQ/BE OHLCV रेकॉर्ड 5/10/20 Range Breakout आणि Darvas-style Box साठी वापरले जातात. जुन्या CSV-only डेटासाठी Top 20 appearances हा fallback आहे; त्या नोंदी सलग exchange sessions असतीलच असे नाही.</li>
        <li>NSE Cash Market Bhavcopy ZIP पूर्ण Cash Market universe मधील उपलब्ध EQ/BE records साठवण्यासाठी आहे. जुने Top 20/Volume Gainers/Advances reports स्वतंत्रपणे काम करत राहतात.</li>
        <li>नवीन stock लिस्टमध्ये येण्यासाठी EQ/BE series, त्या दिवसाचा बदल किमान +4% आणि किंमत ₹1,000–₹2,900 आवश्यक आहे. एकदा आलेला stock रोज +4% राहण्याची गरज नाही; तो ₹1,000–₹2,900 रेंजमध्ये असेपर्यंत लिस्टमध्ये राहतो. रेंजच्या बाहेर तात्पुरता लपतो आणि परत रेंजमध्ये आल्यावर पुन्हा दिसतो.</li>
      </ul>
    </div>
  </div>;
};
