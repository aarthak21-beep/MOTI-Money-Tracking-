import React, { useEffect, useMemo, useState } from 'react';
import { loadScannerData, saveScannerData, deleteScannerData } from '../services/cloudScannerStorage';
import { Activity, Upload, Download, Trash2, Search, ShieldAlert, FileSpreadsheet, Info } from 'lucide-react';

type StockRow = {
  date: string; symbol: string; series: string; open?: number; high?: number; low?: number;
  close: number; prevClose?: number; volume: number; turnover?: number;
  deliveryQty?: number; deliveryPct?: number;
};
type SignalRow = StockRow & {
  turnoverValue: number; avgVolume?: number; volumeRatio?: number; change?: number;
  trend5d?: number; signal: string; score: number; superScore: number;
};
const KEY = 'moti_smart_money_screener_v1';
const DB_NAME = 'moti_smart_money_db';
const STORE_NAME = 'datasets';
const openDataDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) { reject(new Error('या browser मध्ये IndexedDB उपलब्ध नाही.')); return; }
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB उघडता आले नाही.'));
});
const readSavedRows = async (): Promise<StockRow[]> => {
  const db = await openDataDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY);
    request.onsuccess = () => { db.close(); resolve(Array.isArray(request.result) ? request.result as StockRow[] : []); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
};
const saveRowsToDb = async (rows: StockRow[]): Promise<void> => {
  const db = await openDataDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(rows, KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('डेटा save झाला नाही.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('डेटा save रद्द झाला.')); };
  });
};
const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const number = (v?: string) => {
  if (!v?.trim() || ['-', 'na', 'n/a', 'null'].includes(v.trim().toLowerCase())) return undefined;
  const n = Number(v.replace(/[,₹%\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const splitCsv = (line: string, delimiter: string) => {
  const out: string[] = []; let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (ch === delimiter && !quoted) { out.push(value.trim()); value = ''; }
    else value += ch;
  }
  out.push(value.trim()); return out;
};
const parseDate = (value: string) => {
  const v = value.trim();
  if (!v) return '';
  // Keep exchange dates as calendar dates; converting local midnight to ISO can shift the day by timezone.
  const dmy = v.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})$/);
  if (dmy) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const month = months[dmy[2].toLowerCase()];
    const day = dmy[1].padStart(2, '0');
    if (month) return dmy[3] + '-' + month + '-' + day;
  }
  const dmyNum = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyNum) return dmyNum[3] + '-' + dmyNum[2].padStart(2, '0') + '-' + dmyNum[1].padStart(2, '0');
  const isoDate = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];
  const parsed = Date.parse(v);
  if (!Number.isFinite(parsed)) return v;
  const date = new Date(parsed);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
};
const parseCsv = (raw: string): StockRow[] => {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error('CSV मध्ये header आणि किमान एक data row असणे आवश्यक आहे.');
  const first = lines[0];
  const delimiter = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const headers = splitCsv(first, delimiter).map(normalize);
  const col = (...names: string[]) => headers.findIndex(h => names.includes(h));
  const idx = {
    date: col('date', 'tradedate', 'date1', 'traddt', 'bizdt'),
    symbol: col('symbol', 'tradingsymbol', 'tckrsymb'),
    series: col('series', 'sctysrs'),
    open: col('open', 'openprice', 'opnpric'),
    high: col('high', 'highprice', 'hghpric'),
    low: col('low', 'lowprice', 'lwpric'),
    close: col('close', 'closeprice', 'clspric', 'ltp', 'lastprice'),
    prev: col('prevclose', 'previousclose', 'prvsclsgpric'),
    volume: col('volume', 'tottrdqty', 'ttltrdqty', 'ttltrdqnty', 'totaltradedquantity', 'totalvolume', 'ttltradgvol'),
    turnover: col('turnover', 'tottrdval', 'ttltrdval', 'totaltradedvalue', 'ttltrfval', 'totalturnover'),
    delivery: col('deliveryqty', 'delivqty', 'deliverablequantity', 'dlyqty'),
    deliveryPct: col('deliverypct', 'delivper', 'deliverypercentage', 'dlyper')
  };
  if (idx.symbol < 0 || idx.series < 0 || idx.close < 0 || idx.volume < 0) {
    throw new Error('NSE Bhavcopy मधील Symbol/TckrSymb, Series/SctySrs, Close/ClsPric आणि Volume/TtlTradgVol columns सापडले नाहीत.');
  }
  const rows: StockRow[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCsv(line, delimiter);
    const symbol = (c[idx.symbol] || '').trim().toUpperCase();
    const series = (c[idx.series] || '').trim().toUpperCase();
    const close = number(c[idx.close]), volume = number(c[idx.volume]);
    if (series !== 'EQ' || !/^[A-Z0-9&.-]{1,30}$/.test(symbol) || close === undefined || volume === undefined) continue;
    rows.push({
      date: idx.date >= 0 ? parseDate(c[idx.date] || '') : '', symbol, series,
      open: idx.open >= 0 ? number(c[idx.open]) : undefined,
      high: idx.high >= 0 ? number(c[idx.high]) : undefined,
      low: idx.low >= 0 ? number(c[idx.low]) : undefined,
      close, prevClose: idx.prev >= 0 ? number(c[idx.prev]) : undefined, volume,
      turnover: idx.turnover >= 0 ? number(c[idx.turnover]) : undefined,
      deliveryQty: idx.delivery >= 0 ? number(c[idx.delivery]) : undefined,
      deliveryPct: idx.deliveryPct >= 0 ? number(c[idx.deliveryPct]) : undefined
    });
  }
  if (!rows.length) throw new Error('या Bhavcopy मधून EQ stock rows मिळाल्या नाहीत. Header किंवा Series तपासा.');
  return rows;
};
const dateTime = (v: string) => { const n = Date.parse(v); return Number.isFinite(n) ? n : undefined; };
const dateKey = (r: StockRow) => r.date || '';
const mergeHistory = (oldRows: StockRow[], newRows: StockRow[]) => {
  const map = new Map<string, StockRow>();
  [...oldRows, ...newRows].forEach((r, i) => map.set(r.symbol + '|' + (dateKey(r) || ('undated-' + i)), r));
  return [...map.values()].sort((a, b) => (dateTime(a.date) ?? Number.MAX_SAFE_INTEGER) - (dateTime(b.date) ?? Number.MAX_SAFE_INTEGER) || a.symbol.localeCompare(b.symbol));
};
const pct = (n?: number) => n === undefined ? '—' : n.toFixed(1) + '%';
const fmt = (n?: number) => n === undefined ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const groupBySymbol = (rows: StockRow[]) => {
  const groups = new Map<string, StockRow[]>();
  rows.filter(r => r.series === 'EQ').forEach(r => { const a = groups.get(r.symbol) || []; a.push(r); groups.set(r.symbol, a); });
  groups.forEach(a => a.sort((x, y) => (dateTime(x.date) ?? 0) - (dateTime(y.date) ?? 0)));
  return groups;
};
export const SmartMoneyScreenerView: React.FC = () => {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cloudSaved = await loadScannerData<StockRow[]>('smart-money');
        let saved = cloudSaved ?? await readSavedRows();
        if (!cloudSaved && saved.length) await saveScannerData('smart-money', saved);
        if (!saved.length) {
          const legacy = localStorage.getItem(KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy) as StockRow[];
            if (Array.isArray(parsed) && parsed.length) {
              saved = parsed.map(r => ({ ...r, series: (r.series || '').toUpperCase() }));
              await saveRowsToDb(saved); localStorage.removeItem(KEY);
              await saveScannerData('smart-money', saved);
            }
          }
        }
        if (active) setRows(saved);
      } catch {
        if (active) setError('Saved data load करता आला नाही. Cloud connection तपासा.');
      }
    })();
    return () => { active = false; };
  }, []);
  const analytics = useMemo(() => {
    const groups = groupBySymbol(rows);
    const latest: StockRow[] = [];
    groups.forEach(history => { if (history.length) latest.push(history[history.length - 1]); });
    return latest.map(r => {
      const history = groups.get(r.symbol) || [];
      const previous = history.slice(0, -1);
      const prior5 = previous.slice(-5);
      const avgVolume = prior5.length ? prior5.reduce((s, x) => s + x.volume, 0) / prior5.length : undefined;
      const volumeRatio = avgVolume && avgVolume > 0 ? r.volume / avgVolume : undefined;
      const change = r.prevClose && r.prevClose > 0 ? (r.close - r.prevClose) / r.prevClose * 100 : undefined;
      const trendBase = history.length >= 5 ? history[history.length - 5].close : undefined;
      const trend5d = trendBase && trendBase > 0 ? (r.close - trendBase) / trendBase * 100 : undefined;
      const turnoverValue = r.turnover ?? r.close * r.volume;
      const delivery = r.deliveryPct ?? (r.deliveryQty !== undefined && r.volume > 0 ? r.deliveryQty / r.volume * 100 : undefined);
      const accumulation = (volumeRatio !== undefined && volumeRatio >= 1.5 ? 2 : 0) + (change !== undefined && change >= -1 && change <= 2 ? 1 : 0) + (delivery !== undefined && delivery >= 50 ? 2 : 0);
      const distribution = (volumeRatio !== undefined && volumeRatio >= 1.5 ? 2 : 0) + (change !== undefined && change <= -2 ? 2 : 0) + (delivery !== undefined && delivery < 35 ? 1 : 0);
      const breakout = (r.high !== undefined && r.close >= r.high * 0.995 ? 2 : 0) + (volumeRatio !== undefined && volumeRatio >= 1.5 ? 2 : 0) + (change !== undefined && change >= 2 ? 1 : 0);
      const best = Math.max(accumulation, distribution, breakout);
      const signal = best < 3 ? 'WATCH' : best === accumulation ? 'ACCUMULATION' : best === distribution ? 'DISTRIBUTION' : 'BREAKOUT';
      const availableScore = (volumeRatio !== undefined ? 30 : 0) + (change !== undefined ? 20 : 0) + (trend5d !== undefined ? 20 : 0) + (delivery !== undefined ? 30 : 0);
      const score = (volumeRatio !== undefined ? Math.min(30, Math.max(0, (volumeRatio - 0.8) / 1.2 * 30)) : 0)
        + (change !== undefined ? Math.max(0, 20 - Math.abs(change - 1) * 3) : 0)
        + (trend5d !== undefined ? Math.max(0, Math.min(20, 10 + trend5d * 2)) : 0)
        + (delivery !== undefined ? Math.min(30, Math.max(0, (delivery - 30) / 30 * 30)) : 0);
      const recent = history.slice(-3);
      let highVolumeDays = 0;
      let tightHighVolumeDays = 0;
      let footprintSampleDays = 0;
      recent.forEach((day, offset) => {
        const historyIndex = history.length - recent.length + offset;
        const baseline = history.slice(Math.max(0, historyIndex - 5), historyIndex);
        if (baseline.length < 3) return;
        footprintSampleDays++;
        const baselineVolume = baseline.reduce((sum, item) => sum + item.volume, 0) / baseline.length;
        const ratio = baselineVolume > 0 ? day.volume / baselineVolume : 0;
        const previousDay = history[historyIndex - 1];
        const dailyMove = day.prevClose && day.prevClose > 0
          ? (day.close - day.prevClose) / day.prevClose * 100
          : previousDay && previousDay.close > 0 ? (day.close - previousDay.close) / previousDay.close * 100 : undefined;
        if (ratio >= 1.3) {
          highVolumeDays++;
          if (dailyMove !== undefined && Math.abs(dailyMove) <= 1.5) tightHighVolumeDays++;
        }
      });
      const footprintBase = history.length >= 4 ? history[history.length - 4].close : undefined;
      const footprintChange3d = footprintBase && footprintBase > 0 ? (r.close - footprintBase) / footprintBase * 100 : undefined;
      const volumeComponent = volumeRatio === undefined ? 0 : Math.min(35, Math.max(0, (volumeRatio - 1) / 1.5 * 35));
      const repeatComponent = footprintSampleDays ? highVolumeDays / footprintSampleDays * 30 : 0;
      const absorptionComponent = footprintSampleDays ? tightHighVolumeDays / footprintSampleDays * 25 : 0;
      const stabilityComponent = footprintChange3d === undefined ? 0 : Math.max(0, 10 - Math.max(0, Math.abs(footprintChange3d) - 2) * 3.33);
      const footprintScore = Math.round(Math.min(100, volumeComponent + repeatComponent + absorptionComponent + stabilityComponent));
      return { ...r, turnoverValue, avgVolume, volumeRatio, change, trend5d, delivery, accumulation, distribution, breakout, signal, score: Math.round(score), availableScore, highVolumeDays, tightHighVolumeDays, footprintSampleDays, footprintChange3d, footprintScore };
    }).filter(r => r.close >= 1000 && r.close <= 2900 && r.turnoverValue >= 10000000)
      .sort((a, b) => b.score - a.score);
  }, [rows]);
  const deliveryMap = useMemo(() => {
    const groups = groupBySymbol(rows);
    return analytics.map(stock => {
      const history = (groups.get(stock.symbol) || []).map(day => ({
        delivery: day.deliveryPct ?? (day.deliveryQty !== undefined && day.volume > 0 ? day.deliveryQty / day.volume * 100 : undefined),
        deliveryQty: day.deliveryQty
      })).filter(item => item.delivery !== undefined);
      const recent = history.slice(-5);
      const latest = recent[recent.length - 1];
      const previous = recent[recent.length - 2];
      const averageDelivery = recent.length ? recent.reduce((sum, item) => sum + (item.delivery || 0), 0) / recent.length : undefined;
      let risingDays = 0;
      for (let i = recent.length - 1; i > 0; i--) {
        if ((recent[i].delivery || 0) > (recent[i - 1].delivery || 0)) risingDays++;
        else break;
      }
      const deliveryChange = latest && previous ? (latest.delivery || 0) - (previous.delivery || 0) : undefined;
      const qtyChange = latest?.deliveryQty !== undefined && previous?.deliveryQty !== undefined && previous.deliveryQty > 0
        ? (latest.deliveryQty / previous.deliveryQty - 1) * 100 : undefined;
      const score = latest && averageDelivery !== undefined
        ? Math.round(Math.min(100, Math.max(0, averageDelivery * 0.55 + Math.max(0, Math.min(25, (deliveryChange || 0) * 2.5)) + Math.max(0, Math.min(20, risingDays * 10)))))
        : 0;
      const watch = recent.length >= 3 && (latest?.delivery || 0) >= 50 && (averageDelivery || 0) >= 45 && risingDays >= 2;
      return { ...stock, deliveryDays: recent.length, latestDelivery: latest?.delivery, averageDelivery, deliveryChange, qtyChange, risingDays, deliveryScore: score, deliveryWatch: watch };
    }).filter(stock => stock.deliveryDays > 0).sort((a, b) => b.deliveryScore - a.deliveryScore);
  }, [rows, analytics]);
  const preBreakoutRadar = useMemo(() => {
    const groups = groupBySymbol(rows);
    return analytics.map(stock => {
      const history = groups.get(stock.symbol) || [];
      const prior = history.slice(-6, -1);
      const resistance = prior.length ? Math.max(...prior.map(day => day.high ?? day.close)) : undefined;
      const support = prior.length ? Math.min(...prior.map(day => day.low ?? day.close)) : undefined;
      const rangePct = resistance !== undefined && support !== undefined && support > 0
        ? (resistance - support) / support * 100 : undefined;
      const distanceToResistance = resistance !== undefined && resistance > 0
        ? (resistance - stock.close) / resistance * 100 : undefined;
      const volumeRatio = stock.volumeRatio;
      const nearResistance = distanceToResistance !== undefined && distanceToResistance >= -0.5 && distanceToResistance <= 3;
      const tightRange = rangePct !== undefined && rangePct <= 5;
      const volumeBuilding = volumeRatio !== undefined && volumeRatio >= 1.2;
      const positiveTrend = stock.trend5d !== undefined && stock.trend5d > 0;
      const score = Math.round(
        (nearResistance ? Math.max(0, 30 - Math.max(0, distanceToResistance || 0) * 8) : 0) +
        (tightRange ? Math.max(0, 25 - (rangePct || 0) * 3) : 0) +
        (volumeBuilding ? Math.min(25, (volumeRatio! - 1) * 16) : 0) +
        (positiveTrend ? Math.min(20, Math.max(0, stock.trend5d! * 4)) : 0)
      );
      const confirmed = resistance !== undefined && stock.close > resistance && volumeRatio !== undefined && volumeRatio >= 1.5;
      const stage = confirmed ? 'Breakout Confirmed' : score >= 65 ? 'Near Breakout' : score >= 40 ? 'Early Watch' : 'Low setup';
      return { ...stock, resistance, rangePct, distanceToResistance, preBreakoutScore: Math.min(100, score), preBreakoutStage: stage, preBreakoutEligible: score >= 30 || confirmed };
    }).filter(stock => stock.preBreakoutEligible).sort((a, b) => b.preBreakoutScore - a.preBreakoutScore);
  }, [rows, analytics]);
  const superTen = useMemo(() => analytics.slice().sort((a, b) => b.score - a.score).slice(0, 10), [analytics]);
  const powerSignals = useMemo(() => {
    const groups = groupBySymbol(rows);
    const out = new Map<string, { qualified: boolean; detail: string }>();
    groups.forEach((history, symbol) => {
      const a = history.slice(-6);
      if (a.length < 6) { out.set(symbol, { qualified: false, detail: '६ ट्रेडिंग दिवसांचा डेटा आवश्यक' }); return; }
      const prior = a.slice(0, 5), today = a[5];
      const avgVol = prior.reduce((s, r) => s + r.volume, 0) / 5;
      const resistance = Math.max(...prior.map(r => r.high ?? r.close));
      const priceOK = today.close > resistance && today.close > prior[0].close;
      const volumeOK = avgVol > 0 && today.volume >= avgVol * 1.5;
      const delivery = today.deliveryPct ?? (today.deliveryQty !== undefined && today.volume > 0 ? today.deliveryQty / today.volume * 100 : undefined);
      const deliveryOK = delivery === undefined || delivery >= 50;
      const qualified = priceOK && volumeOK && deliveryOK;
      out.set(symbol, { qualified, detail: delivery === undefined ? '६ दिवसांचा भाव + Volume breakout (Bhavcopy data)' : 'भाव + Volume breakout आणि Delivery confirmation' });
    });
    return out;
  }, [rows]);
  const visible = analytics.filter(r => r.symbol.includes(query.trim().toUpperCase()) &&
    (filter === 'ALL' || (filter === 'POWER_STOCK' ? powerSignals.get(r.symbol)?.qualified : r.signal === filter)));
  const hasDelivery = analytics.some(r => r.delivery !== undefined);
  const upload = async (file?: File) => {
    if (!file) return;
    setError(''); setMessage('');
    try {
      const parsed = parseCsv(await file.text());
      const merged = mergeHistory(rows, parsed);
      await saveScannerData('smart-money', merged);
      setRows(merged);
      const csvDates = [...new Set(parsed.map(r => r.date).filter(Boolean))].sort();
      const savedDates = [...new Set(merged.map(r => r.date).filter(Boolean))].sort();
      const csvDateSummary = csvDates.length === 0 ? 'तारीख उपलब्ध नाही' : csvDates.length === 1
        ? csvDates[0] : csvDates[0] + ' ते ' + csvDates[csvDates.length - 1];
      const latestSavedDate = savedDates.length ? savedDates[savedDates.length - 1] : 'उपलब्ध नाही';
      setMessage(parsed.length + ' EQ नोंदी वाचल्या. एकूण ' + merged.length + ' दिवसनिहाय नोंदी सेव्ह झाल्या. CSV तारीख: ' + csvDateSummary + '. सेव्हमधील नवीनतम तारीख: ' + latestSavedDate + '.');
    } catch (e) { setError(e instanceof Error ? e.message : 'CSV import/save करता आला नाही.'); }
  };
  const exportFyersCsv = () => {
    if (!visible.length) return;
    // FYERS Web watchlist import format, matching Swing Scanner export.
    const symbols = visible.map(item => 'NSE:' + item.symbol + '-' + (item.series === 'BE' ? 'BE' : 'EQ'));
    const csv = '\\uFEFF' + symbols.join(',');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fyers-smart-money-' + (visible.reduce((latest, item) => item.date > latest ? item.date : latest, '') || new Date().toISOString().slice(0, 10)) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const removeStock = async (symbol: string) => {
    if (!window.confirm(symbol + ' ची Smart Money मधील सर्व दिवसांची नोंद delete करायची?')) return;
    try { const updated = rows.filter(r => r.symbol !== symbol); await saveScannerData('smart-money', updated); setRows(updated); setMessage(symbol + ' ची सर्व इतिहासासह नोंद delete केली.'); }
    catch { setError(symbol + ' delete करता आला नाही.'); }
  };
  const clear = async () => {
    if (!window.confirm('Smart Money Screener चा saved CSV data delete करायचा?')) return;
    try { await deleteScannerData('smart-money'); localStorage.removeItem(KEY); setRows([]); setMessage('Saved data delete केला.'); }
    catch { setError('Saved data delete करता आला नाही.'); }
  };
  const cards = [
    { label: 'Stocks Loaded', value: analytics.length, key: 'ALL' },
    { label: 'Accumulation', value: analytics.filter(r => r.signal === 'ACCUMULATION').length, key: 'ACCUMULATION' },
    { label: 'Distribution', value: analytics.filter(r => r.signal === 'DISTRIBUTION').length, key: 'DISTRIBUTION' },
    { label: 'Breakout Watch', value: analytics.filter(r => r.signal === 'BREAKOUT').length, key: 'BREAKOUT' },
    { label: 'POWER STOCK', value: analytics.filter(r => powerSignals.get(r.symbol)?.qualified).length, key: 'POWER_STOCK' }
  ];
  return <div className="space-y-5">
    <section className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#10251f] via-[#0b1724] to-[#101827] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-emerald-300"><Activity className="h-5 w-5"/><span className="text-xs font-bold uppercase tracking-[.18em]">MOTI · Swing / Positional</span></div><h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">Smart Money Screener</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">NSE Bhavcopy मधील EQ शेअर्सचे भाव, Volume आणि Turnover वापरून संभाव्य संचय व breakout संकेत. ₹१,०००–₹२,९०० भावपट्टा आणि किमान ₹१ कोटी दैनिक टर्नओव्हर.</p></div><span className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">NSE Bhavcopy · Beta</span></div>
      <div className="mt-5 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-200"><Upload className="h-4 w-4"/>Import NSE Bhavcopy CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { void upload(e.target.files?.[0]); e.currentTarget.value = ''; }}/></label><button onClick={exportFyersCsv} disabled={!visible.length} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-4 w-4"/>Export FYERS CSV</button>{rows.length > 0 && <button onClick={() => void clear()} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 px-3 py-2.5 text-sm text-rose-200 hover:bg-rose-300/10"><Trash2 className="h-4 w-4"/>Clear</button>}</div>
      {message && <p className="mt-3 text-xs text-emerald-300">{message}</p>}{error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
    </section>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{cards.map(c => <button key={c.key} onClick={() => { setFilter(c.key); setQuery(''); }} className={`rounded-xl border p-4 text-left transition ${filter === c.key ? 'border-emerald-300/60 bg-emerald-300/10' : 'border-white/10 bg-[#0b1421]'}`}><p className="text-xs text-slate-400">{c.label}</p><p className="mt-1 text-2xl font-bold text-white">{c.value}</p><p className="mt-1 text-[10px] text-emerald-300/80">यादी पाहण्यासाठी क्लिक करा</p></button>)}</div>
    <section className="rounded-2xl border border-amber-300/20 bg-[#0b1421] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold text-white">MOTI SUPER 10</h2><p className="mt-1 text-xs text-slate-400">Bhavcopy मधील उपलब्ध भाव, Volume, ५ दिवसांची सरासरी आणि Turnover यावर आधारित क्रमवारी. Score सोबत उपलब्ध गुणांची कमाल मर्यादा दाखवली आहे.</p></div><span className="rounded-lg bg-amber-300/10 px-3 py-1.5 text-xs font-bold text-amber-200">MOTI Score</span></div>
      {superTen.length === 0 ? <p className="py-6 text-center text-xs text-slate-500">पात्र शेअर्स दिसण्यासाठी NSE Bhavcopy CSV import करा.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="border-b border-white/10 text-slate-400"><tr>{['Rank','Symbol','Date','Series','Open','High','Low','Close','Prev Close','Volume','5D Avg Volume','Volume Ratio','Turnover','1D Change','5D Change',...(hasDelivery ? ['Delivery %'] : []),'MOTI Score'].map(h => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>{superTen.map((r,i) => <tr key={r.symbol} className="border-b border-white/[0.06] last:border-0"><td className="px-2 py-2 font-bold text-amber-200">#{i+1}</td><td className="px-2 py-2 font-bold text-white"><div>{r.symbol}</div><button type="button" onClick={() => void removeStock(r.symbol)} className="mt-1 inline-flex items-center gap-1 rounded-md border border-rose-300/20 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-300/10"><Trash2 className="h-3 w-3"/>Delete</button></td><td className="px-2 py-2 text-slate-300">{r.date || '—'}</td><td className="px-2 py-2 text-slate-300">{r.series}</td><td className="px-2 py-2 text-slate-300">{fmt(r.open)}</td><td className="px-2 py-2 text-slate-300">{fmt(r.high)}</td><td className="px-2 py-2 text-slate-300">{fmt(r.low)}</td><td className="px-2 py-2 text-slate-300">{fmt(r.close)}</td><td className="px-2 py-2 text-slate-300">{fmt(r.prevClose)}</td><td className="px-2 py-2 text-slate-300">{fmt(r.volume)}</td><td className="px-2 py-2 text-slate-300">{fmt(r.avgVolume)}</td><td className="px-2 py-2 text-slate-300">{r.volumeRatio === undefined ? '—' : r.volumeRatio.toFixed(2)+'x'}</td><td className="px-2 py-2 text-slate-300">{fmt(r.turnoverValue)}</td><td className="px-2 py-2 text-slate-300">{pct(r.change)}</td><td className="px-2 py-2 text-slate-300">{pct(r.trend5d)}</td>{hasDelivery && <td className="px-2 py-2 text-slate-300">{pct(r.delivery)}</td>}<td className="px-2 py-2 font-bold text-amber-200">{r.score}/{r.availableScore || 0}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="rounded-2xl border border-violet-300/20 bg-[#0b1421] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-bold text-white">MOTI Pre-Breakout Radar</h2><p className="mt-1 text-xs text-slate-400">Resistance जवळील भाव, घट्ट trading range, वाढता volume आणि ५ दिवसांचा trend यावर आधारित संभाव्य setup.</p></div>
        <span className="rounded-lg bg-violet-300/10 px-3 py-1.5 text-xs font-bold text-violet-200">Early Signal</span>
      </div>
      {preBreakoutRadar.length === 0 ? <p className="py-6 text-center text-xs text-slate-500">Pre-Breakout setup शोधण्यासाठी किमान ६ दिवसांचा Bhavcopy इतिहास उपयोगी ठरतो. अजून पात्र setup आढळले नाहीत.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-white/10 text-slate-400"><tr>{['Rank','Symbol','Radar Score','Stage','Close','Resistance','Resistance पासून अंतर','5D Range','Volume Ratio','5D Change'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>{preBreakoutRadar.slice(0, 15).map((r,i) => <tr key={r.symbol} className="border-b border-white/[0.06] last:border-0"><td className="px-3 py-3 font-bold text-violet-200">#{i+1}</td><td className="px-3 py-3 font-bold text-white"><div>{r.symbol}</div><button type="button" onClick={() => void removeStock(r.symbol)} className="mt-1 inline-flex items-center gap-1 rounded-md border border-rose-300/20 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-300/10"><Trash2 className="h-3 w-3"/>Delete</button></td><td className="px-3 py-3 font-bold text-violet-200">{r.preBreakoutScore}/100</td><td className="px-3 py-3 text-slate-300">{r.preBreakoutStage}</td><td className="px-3 py-3 text-slate-300">₹{fmt(r.close)}</td><td className="px-3 py-3 text-slate-300">{r.resistance === undefined ? '—' : '₹' + fmt(r.resistance)}</td><td className="px-3 py-3 text-slate-300">{r.distanceToResistance === undefined ? '—' : r.distanceToResistance.toFixed(1) + '%'}</td><td className="px-3 py-3 text-slate-300">{pct(r.rangePct)}</td><td className="px-3 py-3 text-slate-300">{r.volumeRatio === undefined ? '—' : r.volumeRatio.toFixed(2) + 'x'}</td><td className="px-3 py-3 text-slate-300">{pct(r.trend5d)}</td></tr>)}</tbody></table></div>}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Breakout Confirmed म्हणजे मागील ५ दिवसांच्या high पेक्षा close वर आणि volume किमान १.५ पट; हे केवळ Bhavcopy-आधारित तांत्रिक confirmation आहे. Gap-up किंवा intraday breakout तपासलेला नाही. Score हा संभाव्यता क्रमवारीचा heuristic आहे, हमी किंवा buy/sell call नाही.</p>
    </section>
    <section className="rounded-2xl border border-emerald-300/20 bg-[#0b1421] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-bold text-white">MOTI Delivery Accumulation Map</h2><p className="mt-1 text-xs text-slate-400">शेवटच्या ५ उपलब्ध दिवसांतील Delivery %, त्यातील वाढ आणि सलग वाढणारे दिवस यावर आधारित निरीक्षण.</p></div>
        <span className="rounded-lg bg-emerald-300/10 px-3 py-1.5 text-xs font-bold text-emerald-200">Delivery Watch</span>
      </div>
      {deliveryMap.length === 0 ? <p className="py-6 text-center text-xs text-slate-500">Delivery Accumulation Map साठी अपलोड केलेल्या CSV मध्ये Delivery % किंवा Delivery Quantity असणे आवश्यक आहे. NSE फाइलमध्ये हे कॉलम नसल्यास Delivery डेटा असलेली Bhavcopy अपलोड करा.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="border-b border-white/10 text-slate-400"><tr>{['Rank','Symbol','Latest Delivery %','5D Avg Delivery %','Delivery % Change','Rising Days','Delivery Qty Change','Delivery Score','Reading'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>{deliveryMap.slice(0, 15).map((r,i) => <tr key={r.symbol} className="border-b border-white/[0.06] last:border-0"><td className="px-3 py-3 font-bold text-emerald-200">#{i+1}</td><td className="px-3 py-3 font-bold text-white"><div>{r.symbol}</div><button type="button" onClick={() => void removeStock(r.symbol)} className="mt-1 inline-flex items-center gap-1 rounded-md border border-rose-300/20 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-300/10"><Trash2 className="h-3 w-3"/>Delete</button></td><td className="px-3 py-3 text-slate-300">{pct(r.latestDelivery)}</td><td className="px-3 py-3 text-slate-300">{pct(r.averageDelivery)}</td><td className="px-3 py-3 text-slate-300">{r.deliveryChange === undefined ? '—' : (r.deliveryChange > 0 ? '+' : '') + r.deliveryChange.toFixed(1) + ' pp'}</td><td className="px-3 py-3 text-slate-300">{r.risingDays}</td><td className="px-3 py-3 text-slate-300">{r.qtyChange === undefined ? '—' : (r.qtyChange > 0 ? '+' : '') + r.qtyChange.toFixed(1) + '%'}</td><td className="px-3 py-3 font-bold text-emerald-200">{r.deliveryScore}/100</td><td className="px-3 py-3 text-slate-300">{r.deliveryWatch ? 'Accumulation Watch' : r.deliveryDays < 3 ? 'More data needed' : r.latestDelivery !== undefined && r.latestDelivery >= 50 ? 'High delivery' : 'Normal / monitor'}</td></tr>)}</tbody></table></div>}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Accumulation Watch साठी किमान ३ उपलब्ध Delivery दिवस, सरासरी Delivery किमान ४५%, नवीनतम Delivery किमान ५०% आणि सलग २ वाढी आवश्यक आहेत. हा ऐतिहासिक Delivery pattern आहे; तो संस्थात्मक खरेदी किंवा पुढील भाववाढीचा पुरावा नाही.</p>
    </section>
    <section className="rounded-2xl border border-cyan-300/20 bg-[#0b1421] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-bold text-white">MOTI Institutional Footprint Detector</h2><p className="mt-1 text-xs text-slate-400">असामान्य Volume, सलग सक्रिय दिवस आणि कमी Price movement यांवर आधारित संभाव्य accumulation footprint.</p></div>
        <span className="rounded-lg bg-cyan-300/10 px-3 py-1.5 text-xs font-bold text-cyan-200">Footprint Score / 100</span>
      </div>
      {analytics.filter(r => r.footprintScore > 0).length === 0 ? <p className="py-6 text-center text-xs text-slate-500">Footprint तपासण्यासाठी प्रत्येक शेअरचा किमान ४ ट्रेडिंग दिवसांचा Bhavcopy इतिहास आवश्यक आहे.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead className="border-b border-white/10 text-slate-400"><tr>{['Rank','Symbol','Footprint Score','High-Volume Days','Tight High-Volume Days','Latest Volume Ratio','3D Price Change','Reading'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>{analytics.filter(r => r.footprintScore > 0).slice().sort((a,b) => b.footprintScore-a.footprintScore).slice(0,10).map((r,i) => <tr key={r.symbol} className="border-b border-white/[0.06] last:border-0"><td className="px-3 py-3 font-bold text-cyan-200">#{i+1}</td><td className="px-3 py-3 font-bold text-white"><div>{r.symbol}</div><button type="button" onClick={() => void removeStock(r.symbol)} className="mt-1 inline-flex items-center gap-1 rounded-md border border-rose-300/20 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-300/10"><Trash2 className="h-3 w-3"/>Delete</button></td><td className="px-3 py-3 font-bold text-cyan-200">{r.footprintScore}/100</td><td className="px-3 py-3 text-slate-300">{r.highVolumeDays}/{r.footprintSampleDays}</td><td className="px-3 py-3 text-slate-300">{r.tightHighVolumeDays}/{r.footprintSampleDays}</td><td className="px-3 py-3 text-slate-300">{r.volumeRatio === undefined ? '—' : r.volumeRatio.toFixed(2)+'x'}</td><td className="px-3 py-3 text-slate-300">{pct(r.footprintChange3d)}</td><td className="px-3 py-3 text-slate-300">{r.footprintScore >= 65 ? 'Strong watch' : r.footprintScore >= 40 ? 'Developing' : 'Early signal'}</td></tr>)}</tbody></table></div>}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">स्कोअर हा केवळ संशोधनासाठीचा volume/price pattern आहे; तो FII/DII किंवा संस्थात्मक खरेदीची ओळख पटवत नाही. Delivery data नसल्यास त्याचा वापर होत नाही. किमान इतिहास अपुरा असल्यास संकेत कमकुवत/अपूर्ण असू शकतात.</p>
    </section>
    <section className="rounded-2xl border border-white/10 bg-[#0b1421] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-white">Smart Money Signals</h2><p className="mt-1 text-xs text-slate-400">फक्त नवीनतम EQ शेअर्स: ₹१,०००–₹२,९०० भाव आणि किमान ₹१ कोटी टर्नओव्हर. Bhavcopy मध्ये Turnover असल्यास तोच वापरतो; नसल्यास Close × Volume अंदाज वापरतो.</p></div><div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search symbol" className="w-full rounded-lg border border-white/10 bg-[#070d18] py-2 pl-9 pr-3 text-sm text-white outline-none sm:w-40"/></div><select value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border border-white/10 bg-[#070d18] px-3 py-2 text-sm text-white"><option value="ALL">All signals</option><option value="ACCUMULATION">Accumulation</option><option value="DISTRIBUTION">Distribution</option><option value="BREAKOUT">Breakout</option><option value="WATCH">Watch</option><option value="POWER_STOCK">POWER STOCK</option></select></div></div>
      {visible.length === 0 ? <div className="py-12 text-center"><FileSpreadsheet className="mx-auto h-8 w-8 text-slate-600"/><p className="mt-3 text-sm font-semibold text-slate-300">{rows.length ? 'फिल्टरनुसार पात्र शेअर्स नाहीत' : 'अजून CSV data नाही'}</p><p className="mt-1 text-xs text-slate-500">{rows.length ? 'भावपट्टा, टर्नओव्हर किंवा निवडलेला signal तपासा.' : 'NSE मधून डाउनलोड केलेली पूर्ण Bhavcopy CSV अपलोड करा.'}</p></div> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-white/10 text-slate-400"><tr>{['Symbol','Close','Turnover','1D Change','5D Avg Volume','Volume Ratio','Daily Signal','POWER STOCK','MOTI Score','Delete'].map(h => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{visible.map(r => <tr key={r.symbol} className="border-b border-white/[.06]"><td className="px-3 py-3 font-bold text-white">{r.symbol}<div className="text-[10px] font-normal text-slate-500">{r.date || 'Date n/a'}</div></td><td className="px-3 py-3 text-slate-200">₹{fmt(r.close)}</td><td className="px-3 py-3 text-slate-300">₹{(r.turnoverValue/10000000).toFixed(2)} Cr</td><td className="px-3 py-3 text-slate-300">{pct(r.change)}</td><td className="px-3 py-3 text-slate-300">{fmt(r.avgVolume)}</td><td className="px-3 py-3 text-slate-300">{r.volumeRatio === undefined ? '—' : r.volumeRatio.toFixed(2)+'x'}</td><td className="px-3 py-3 text-slate-300">{r.signal}</td><td className="px-3 py-3 text-slate-300">{powerSignals.get(r.symbol)?.qualified ? 'POWER STOCK' : '—'}</td><td className="px-3 py-3 text-slate-300">{r.score}/{r.availableScore || 0}</td><td className="px-3 py-3"><button type="button" onClick={() => void removeStock(r.symbol)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300/20 px-2 py-1.5 text-[10px] font-semibold text-rose-300"><Trash2 className="h-3.5 w-3.5"/>Delete</button></td></tr>)}</tbody></table></div>}
    </section>
    <div className="rounded-xl border border-amber-300/15 bg-amber-300/[.05] p-4"><div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><div><p className="text-xs font-bold text-amber-200">महत्त्वाची मर्यादा</p><p className="mt-1 text-xs leading-relaxed text-slate-300">Delivery Qty/% सामान्य NSE Bhavcopy मध्ये नसल्यास ते कॉलम दाखवले जात नाहीत आणि score त्यावर अवलंबून नसतो. POWER STOCK हा भाव व Volume breakout संकेत आहे; तो संस्थात्मक खरेदीचा पुरावा नाही. ETF ओळखण्यासाठी फक्त EQ Series पुरेशी नसते; या आवृत्तीत EQ filter आहे, पण प्रत्येक ETF आपोआप ओळखण्याची हमी नाही. हे buy/sell recommendation नाही.</p></div></div></div>
    <p className="flex items-center gap-2 text-[11px] text-slate-500"><Info className="h-3.5 w-3.5"/>NSE CM Bhavcopy आणि UDiFF CSV मधील Symbol/Series/Price/Volume/Turnover header aliases वाचले जातात. ५ दिवसांची सरासरी काढण्यासाठी सलग दिवसांच्या Bhavcopy फाइल्स अपलोड करा.</p>
  </div>;
};
