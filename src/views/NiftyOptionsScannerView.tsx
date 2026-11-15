import React, { useEffect, useMemo, useState } from 'react';
import { loadScannerData, saveScannerData, deleteScannerData, loadNiftyOptionsHistory, saveNiftyOptionsSnapshot } from '../services/cloudScannerStorage';
import { Activity, Upload, Download, AlertTriangle, CalendarClock } from 'lucide-react';

type OptionRow = {
  expiry: string; strike: number; type: 'CE' | 'PE'; ltp: number;
  oi: number; changeOi: number; volume: number; iv?: number; spot: number;
};
const STORAGE_KEY = 'moti_nifty_options_chain_v1';
const HISTORY_KEY = 'moti_nifty_options_history_v1';
type DailySnapshot = { date: string; expiry?: string; spot: number; rows: Array<{ expiry: string; strike: number; type: 'CE' | 'PE'; ltp: number; oi: number; changeOi?: number; volume?: number }> };
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
const localDateKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const expiryDaysAway = (expiry: string) => {
  const [year, month, day] = expiry.split('-').map(Number);
  if (!year || !month || !day) return Number.NaN;
  const expiryDate = new Date(year, month - 1, day);
  return Math.round((expiryDate.getTime() - today().getTime()) / 86400000);
};
const getExpiryBucket = (expiry: string): 'next' | 'two-weeks' | 'three-plus' | '' => {
  const daysAway = expiryDaysAway(expiry);
  if (!Number.isFinite(daysAway) || daysAway < 7) return '';
  if (daysAway <= 13) return 'next';
  if (daysAway <= 20) return 'two-weeks';
  return 'three-plus';
};
const isEligiblePositionalExpiry = (expiry: string) => Boolean(getExpiryBucket(expiry));

export const NiftyOptionsScannerView: React.FC = () => {
  const [rows, setRows] = useState<OptionRow[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as OptionRow[]; } catch { return []; }
  });
  const [message, setMessage] = useState('');
  const [manualSpot, setManualSpot] = useState('');
  const [history, setHistory] = useState<DailySnapshot[]>(() => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as DailySnapshot[]; } catch { return []; } });
  const [todayKey, setTodayKey] = useState(localDateKey);
  useEffect(() => {
    let active = true;
    loadScannerData<OptionRow[]>('nifty-options').then(async data => {
      if (!active || !data) return;
      // Remove expired/near-expiry chain rows from cloud storage (< 7 days left).
      // Historical daily snapshots are intentionally kept separately.
      const eligibleRows = data.filter(row => isEligiblePositionalExpiry(row.expiry));
      if (eligibleRows.length !== data.length) {
        await saveScannerData('nifty-options', eligibleRows);
      }
      if (active) {
        setRows(eligibleRows);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(eligibleRows));
      }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Cloud data load failed.'); });
    loadNiftyOptionsHistory<DailySnapshot>().then(async cloudHistory => {
      if (!active) return;
      if (!cloudHistory.length) {
        let localHistory: DailySnapshot[] = [];
        try { localHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as DailySnapshot[]; } catch { localHistory = []; }
        for (const snapshot of localHistory.slice(-30)) {
          if (!active) return;
          await saveNiftyOptionsSnapshot(snapshot);
        }
        if (localHistory.length) cloudHistory = await loadNiftyOptionsHistory<DailySnapshot>();
      }
      if (active) {
        const next = [...cloudHistory].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
        setHistory(next);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'NIFTY history cloud load failed.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let lastDate = todayKey;
    const interval = window.setInterval(() => {
      const currentDate = localDateKey();
      if (currentDate === lastDate) return;
      lastDate = currentDate;
      setTodayKey(currentDate);
      // Reclassify and prune cloud chain data when the local calendar day changes.
      void loadScannerData<OptionRow[]>('nifty-options').then(async data => {
        if (!data) return;
        const eligibleRows = data.filter(row => isEligiblePositionalExpiry(row.expiry));
        if (eligibleRows.length !== data.length) await saveScannerData('nifty-options', eligibleRows);
        setRows(eligibleRows);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(eligibleRows));
      }).catch(e => setError(e instanceof Error ? e.message : 'Cloud data refresh failed.'));
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [todayKey]);
  const [error, setError] = useState('');
  const [stopPct, setStopPct] = useState(20);
  const [targetPct, setTargetPct] = useState(35);
  const [lotSize, setLotSize] = useState(65);
  const [capital, setCapital] = useState(6500);
  const [expiryChoice, setExpiryChoice] = useState('');
  const [tradeContractKey, setTradeContractKey] = useState('');
  const [expiryGroup, setExpiryGroup] = useState<'next' | 'two-weeks' | 'three-plus'>('next');
  const [loading, setLoading] = useState(false);

  const expiries = useMemo(() => Array.from(new Set(rows.map(r => r.expiry))).sort(), [rows]);
  const groupExpiries = useMemo(() => {
    // Classify every expiry by its actual calendar distance, not by its position in the uploaded file.
    return expiries.filter(expiry => getExpiryBucket(expiry) === expiryGroup);
  }, [expiries, expiryGroup, todayKey]);
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
  const expirySnapshots = useMemo(() => history.filter(h => h.expiry === selectedExpiry || (!h.expiry && h.rows.some(r => r.expiry === selectedExpiry))), [history, selectedExpiry]);
  const latestSnapshot = expirySnapshots.slice().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const previousSnapshot = latestSnapshot
    ? expirySnapshots.filter(h => h.date < latestSnapshot.date).sort((a, b) => b.date.localeCompare(a.date))[0] || null
    : null;
  const historyDays = useMemo(() => new Set(history.map(h => h.date)).size, [history]);
  const previousRows = useMemo(() => previousSnapshot?.rows.filter(r => r.expiry === selectedExpiry) || [], [previousSnapshot, selectedExpiry]);
  const priorByContract = useMemo(() => new Map(previousRows.map(r => [`${r.strike}-${r.type}`, r])), [previousRows]);
  const priceOiSignals = useMemo(() => chain.map(r => {
    const old = priorByContract.get(`${r.strike}-${r.type}`);
    if (!old) return { ...r, signal: 'NO PRIOR SNAPSHOT', signalType: 'neutral', oldLtp: undefined as number | undefined, oldOi: undefined as number | undefined, priceChangePct: undefined as number | undefined, oiDeltaSinceSnapshot: undefined as number | undefined, confidence: 'LOW · NO PRIOR DATA' };
    const priceUp = r.ltp > old.ltp; const priceDown = r.ltp < old.ltp;
    const oiUp = r.oi > old.oi; const oiDown = r.oi < old.oi;
    const signal = priceUp && oiUp ? 'LONG BUILDUP' : priceDown && oiUp ? 'SHORT BUILDUP' : priceUp && oiDown ? 'SHORT COVERING' : priceDown && oiDown ? 'LONG UNWINDING' : 'NO CLEAR CHANGE';
    const signalType = priceUp && oiUp || priceUp && oiDown ? 'bullish' : priceDown && oiUp || priceDown && oiDown ? 'bearish' : 'neutral';
    const priceChangePct = old.ltp > 0 ? (r.ltp - old.ltp) / old.ltp * 100 : 0;
    return { ...r, signal, signalType, oldLtp: old.ltp, oldOi: old.oi, priceChangePct, oiDeltaSinceSnapshot: r.oi - old.oi, confidence: r.volume > 0 ? 'MEDIUM · PRIOR + VOLUME' : 'LOW · LOW VOLUME' };
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
  const tradeContracts = useMemo(() => rangeRows.filter(r => r.ltp > 0).slice().sort((a, b) => Math.abs(a.strike - summary.spot) - Math.abs(b.strike - summary.spot) || a.type.localeCompare(b.type)), [rangeRows, summary.spot]);
  const tradeLotRows = tradeContracts.map(r => { const perLotRisk = r.ltp * (stopPct / 100) * lotSize; const premiumPerLot = r.ltp * lotSize; const riskLots = perLotRisk > 0 ? Math.floor(1500 / perLotRisk) : 0; const capitalLots = premiumPerLot > 0 ? Math.floor(capital / premiumPerLot) : 0; return { ...r, perLotRisk, premiumPerLot, maxLots: Math.min(riskLots, capitalLots) }; }).filter(r => r.maxLots > 0 && r.perLotRisk <= 1500 && r.premiumPerLot <= capital);
  const selectedTradeContract = tradeLotRows.find(r => `${r.expiry}|${r.strike}|${r.type}` === tradeContractKey) || null;
  const proRadar = useMemo(() => {
    // Build the radar independently for every eligible expiry, not just the expiry selected below.
    return expiries.flatMap(expiry => {
      const expiryRows = rows.filter(r => r.expiry === expiry);
      const spot = expiryRows[0]?.spot || 0;
      if (!expiryRows.length || !spot) return [];
      const expiryChain = expiryRows;
      const ceRows = expiryChain.filter(r => r.type === 'CE');
      const peRows = expiryChain.filter(r => r.type === 'PE');
      const ceOi = ceRows.reduce((sum, r) => sum + r.oi, 0);
      const peOi = peRows.reduce((sum, r) => sum + r.oi, 0);
      const ceChg = ceRows.reduce((sum, r) => sum + r.changeOi, 0);
      const peChg = peRows.reduce((sum, r) => sum + r.changeOi, 0);
      const pcr = ceOi ? peOi / ceOi : 0;
      const bias = pcr >= 1.1 && peChg > ceChg ? 'BULLISH' : pcr <= 0.9 && ceChg > peChg ? 'BEARISH' : 'WAIT';
      const expiryRangeRows = expiryChain.filter(r => r.strike >= spot - 600 && r.strike <= spot + 600);
      const priorSnapshots = history.filter(h => h.expiry === expiry || (!h.expiry && h.rows.some(r => r.expiry === expiry))).sort((a, b) => b.date.localeCompare(a.date));
      const previous = priorSnapshots.find(h => h.date < localDateKey());
      const previousByContract = new Map((previous?.rows || []).filter(r => r.expiry === expiry).map(r => [`${r.strike}-${r.type}`, r]));
      const types: ('CE' | 'PE')[] = bias === 'BULLISH' ? ['CE'] : bias === 'BEARISH' ? ['PE'] : ['CE', 'PE'];
      return types.flatMap(type => {
        const affordable = expiryRangeRows.filter(r => r.type === type && r.ltp > 0 && r.ltp * lotSize <= capital && r.ltp * (stopPct / 100) * lotSize <= 1500);
        const maxVolume = Math.max(1, ...affordable.map(r => r.volume));
        const supportiveOi = type === 'CE' ? peChg > 0 && ceChg <= 0 : ceChg > 0 && peChg <= 0;
        return affordable.map(option => {
          const distance = Math.abs(option.strike - spot) / spot * 100;
          const nearAtmScore = Math.max(0, 10 - distance * 8);
          const pcrScore = type === 'CE' ? (pcr >= 1.2 ? 15 : pcr >= 1.05 ? 10 : 0) : (pcr <= 0.8 ? 15 : pcr <= 0.95 ? 10 : 0);
          const oiScore = supportiveOi ? 20 : 0;
          const volumeScore = Math.min(15, option.volume / maxVolume * 15);
          const old = previousByContract.get(`${option.strike}-${option.type}`);
          const priceUp = Boolean(old && option.ltp > old.ltp);
          const oiUp = Boolean(old && option.oi > old.oi);
          const priceDown = Boolean(old && option.ltp < old.ltp);
          const oiDown = Boolean(old && option.oi < old.oi);
          const signal = !old ? 'PRIOR SNAPSHOT नाही' : priceUp && oiUp ? 'LONG BUILDUP' : priceDown && oiUp ? 'SHORT BUILDUP' : priceUp && oiDown ? 'SHORT COVERING' : priceDown && oiDown ? 'LONG UNWINDING' : 'NO CLEAR CHANGE';
          const momentumScore = signal === 'LONG BUILDUP' || signal === 'SHORT COVERING' ? 20 : 0;
          const biasScore = bias === 'WAIT' ? 0 : 20;
          const rawScore = Math.round(nearAtmScore + pcrScore + oiScore + volumeScore + momentumScore + biasScore);
          const hasPriorSnapshot = Boolean(old);
          const score = hasPriorSnapshot ? Math.min(100, rawScore) : Math.min(60, rawScore);
          const premiumPerLot = option.ltp * lotSize;
          const perLotRisk = option.ltp * (stopPct / 100) * lotSize;
          return { ...option, bias, score, distance, premiumPerLot, perLotRisk, maxLots: Math.min(Math.floor(capital / premiumPerLot), Math.floor(1500 / perLotRisk)), signal, hasPriorSnapshot };
        }).sort((a, b) => b.score - a.score).slice(0, 3).map(option => ({ ...option, expiry }));
      });
    });
  }, [expiries, rows, history, capital, lotSize, stopPct]);
  const allExpiryAnalytics = useMemo(() => expiries.map(expiry => {
    const expiryRows = rows.filter(r => r.expiry === expiry);
    const spot = expiryRows[0]?.spot || 0;
    const ceRows = expiryRows.filter(r => r.type === 'CE'), peRows = expiryRows.filter(r => r.type === 'PE');
    const ceOi = ceRows.reduce((v,r)=>v+r.oi,0), peOi = peRows.reduce((v,r)=>v+r.oi,0);
    const ceChange = ceRows.reduce((v,r)=>v+r.changeOi,0), peChange = peRows.reduce((v,r)=>v+r.changeOi,0);
    const pcr = ceOi ? peOi/ceOi : 0;
    const grouped = new Map<number,{strike:number;ceOi:number;peOi:number}>();
    expiryRows.filter(r=>r.strike>=spot-600&&r.strike<=spot+600).forEach(r=>{const x=grouped.get(r.strike)||{strike:r.strike,ceOi:0,peOi:0};if(r.type==='CE')x.ceOi+=r.oi;else x.peOi+=r.oi;grouped.set(r.strike,x);});
    const strikes=Array.from(grouped.values()), resistance=strikes.slice().sort((a,b)=>b.ceOi-a.ceOi)[0], support=strikes.slice().sort((a,b)=>b.peOi-a.peOi)[0];
    const snapshots=history.filter(h=>h.expiry===expiry||(!h.expiry&&h.rows.some(r=>r.expiry===expiry))).sort((a,b)=>b.date.localeCompare(a.date));
    const latest=snapshots[0], previous=snapshots.find(h=>h.date<(latest?.date||localDateKey()));
    const oldMap=new Map((previous?.rows||[]).filter(r=>r.expiry===expiry).map(r=>[`${r.strike}-${r.type}`,r]));
    const buildup={long:0,short:0,covering:0,unwinding:0};
    if(previous)expiryRows.forEach(r=>{const old=oldMap.get(`${r.strike}-${r.type}`);if(!old)return;const up=r.ltp>old.ltp,down=r.ltp<old.ltp,oiUp=r.oi>old.oi,oiDown=r.oi<old.oi;if(up&&oiUp)buildup.long++;else if(down&&oiUp)buildup.short++;else if(up&&oiDown)buildup.covering++;else if(down&&oiDown)buildup.unwinding++;});
    const oldCe=previous?.rows.filter(r=>r.expiry===expiry&&r.type==='CE').reduce((v,r)=>v+r.oi,0)||0,oldPe=previous?.rows.filter(r=>r.expiry===expiry&&r.type==='PE').reduce((v,r)=>v+r.oi,0)||0;
    const previousPcr=oldCe?oldPe/oldCe:0,pcrTrend=previousPcr?(pcr>previousPcr?'UP':pcr<previousPcr?'DOWN':'FLAT'):'NO PRIOR DATA';
    return {expiry,spot,ceChange,peChange,pcr,previousPcr,pcrTrend,resistance,support,buildup,hasPrevious:Boolean(previous),rowCount:expiryRows.length};
  }).filter(x=>x.rowCount>0),[expiries,rows,history]);
  const handleUpload = async (file?: File) => {
    if (!file) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const parsedRows = parseCsv(await file.text(), file.name);
      if (!parsedRows.length) throw new Error('वाचता येणाऱ्या NIFTY option rows सापडल्या नाहीत.');
      const suppliedSpot = Number(manualSpot.replace(/[,₹\s]/g, ''));
      if (manualSpot.trim() && (!Number.isFinite(suppliedSpot) || suppliedSpot <= 0)) throw new Error('NIFTY Spot योग्य आकड्यात भरा.');
      const parsed = suppliedSpot > 0 ? parsedRows.map(r => ({ ...r, spot: suppliedSpot })) : parsedRows;

      // Keep other expiries already uploaded today; replace only expiries present in this CSV.
      const cloudRows = await loadScannerData<OptionRow[]>('nifty-options');
      const existingRows = (cloudRows || rows).filter(row => isEligiblePositionalExpiry(row.expiry));
      // Only eligible expiries enter the current chain; all parsed rows still go to Daily History below.
      const eligibleParsed = parsed.filter(row => isEligiblePositionalExpiry(row.expiry));
      const uploadedExpiries = new Set(eligibleParsed.map(r => r.expiry));
      const mergedByContract = new Map<string, OptionRow>();
      for (const row of existingRows) {
        if (!uploadedExpiries.has(row.expiry)) mergedByContract.set(`${row.expiry}|${row.strike}|${row.type}`, row);
      }
      for (const row of eligibleParsed) mergedByContract.set(`${row.expiry}|${row.strike}|${row.type}`, row);
      const mergedRows = Array.from(mergedByContract.values()).sort((a, b) =>
        a.expiry.localeCompare(b.expiry) || a.strike - b.strike || a.type.localeCompare(b.type)
      );
      await saveScannerData('nifty-options', mergedRows);
      setRows(mergedRows);
      const now = new Date();
      const snapshotDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const snapshot: DailySnapshot = { date: snapshotDate, spot: parsed[0]?.spot || 0, rows: parsed.map(r => ({ expiry: r.expiry, strike: r.strike, type: r.type, ltp: r.ltp, oi: r.oi, changeOi: r.changeOi, volume: r.volume })) };
      // Worker stores each expiry independently under (upload date + expiry).
      await saveNiftyOptionsSnapshot(snapshot);
      const cloudHistory = await loadNiftyOptionsHistory<DailySnapshot>();
      const nextHistory = [...cloudHistory].sort((a, b) => a.date.localeCompare(b.date) || String(a.expiry || '').localeCompare(String(b.expiry || '')));
      setHistory(nextHistory);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedRows));
      setExpiryChoice('');
      setMessage(`${parsed.length} option rows History मध्ये save झाले; ${eligibleParsed.length} eligible rows Main Scanner मध्ये ठेवले. ${suppliedSpot > 0 ? `तुम्ही दिलेला NIFTY Spot ₹${fmt(suppliedSpot)} वापरला.` : 'NIFTY Spot CE-PE premium parity वरून अंदाजे काढला आहे.'} Daily snapshot save झाला.`);
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
      <p className="mt-2 max-w-3xl text-sm text-slate-300">Intraday नाही. या आठवड्याची expiry वगळली आहे. पुढील आठवडा, त्यानंतरचा आठवडा किंवा 3+ आठवड्यांनंतरची expiry निवडून CE / PE positioning तपासा. OI हे positioning data आहे; ते एकटे buy signal नाही.</p>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-300">NIFTY Spot (optional, NSE वर दिसणारा)
          <input type="number" min="1" step="0.05" value={manualSpot} onChange={e => setManualSpot(e.target.value)} placeholder="उदा. 25144.30" className="w-44 rounded-xl border border-slate-600 bg-[#080f1b] px-3 py-3 text-sm text-white placeholder:text-slate-500" />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-slate-950 hover:bg-cyan-200">
          <Upload className="h-4 w-4" /> {loading ? 'Reading CSV...' : 'Upload NIFTY Option Chain CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={loading} onChange={e => { handleUpload(e.target.files?.[0]); e.currentTarget.value = ''; }} />
        </label>
        <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-xs font-bold text-slate-200 hover:bg-white/5"><Download className="h-4 w-4" /> CSV Template</button>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">NSE वरचा अचूक Spot भरून मग CSV upload करा. रिकामा ठेवल्यास CE-PE premium parity वरून अंदाज वापरला जाईल. Full Option Chain CSV मध्ये सर्व strikes scan होतात; single-strike CSV मध्ये फक्त तोच strike वाचता येतो.</p>
    </div>

    {message && <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-xs text-emerald-200">{message}</div>}
    {error && <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{error}</div>}

    <section className="rounded-2xl border border-violet-300/20 bg-gradient-to-br from-[#21183b] via-[#101a2d] to-[#0d1527] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">MOTI PRO · Options Radar</p><h2 className="mt-1 text-xl font-black text-white">CE / PE Opportunity Radar</h2></div><span className="rounded-full border border-violet-300/30 px-3 py-1 text-[10px] font-bold text-violet-200">CSV DATA MODE</span></div>
      <p className="mt-2 text-xs text-slate-400">PCR, OI change, volume, ATM जवळीक आणि मागील snapshot मधील Price + OI संकेत यांवर आधारित heuristic score. Live API जोडलेला नाही.</p>
      {proRadar.some(option => option.bias === 'WAIT') && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">WAIT असलेल्या expiry मधील CE/PE contracts फक्त Watchlist आहेत — BUY signals नाहीत.</div>}
      {!proRadar.length ? <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">तुझ्या ₹{fmt(capital)} capital आणि ₹1,500 SL-risk limit मध्ये बसणारा contract कोणत्याही eligible expiry मध्ये नाही. Capital वाढवल्यावर खालील Capital field बदला किंवा कमी premium असलेली expiry निवडा.</div> : <div className="mt-4 grid gap-3 md:grid-cols-3">
        {proRadar.map((option, index) => { const stop = option.ltp * (1 - stopPct / 100); const target = option.ltp * (1 + targetPct / 100); const stage = option.bias === 'WAIT' ? 'WATCHLIST · NOT A BUY SIGNAL' : !option.hasPriorSnapshot ? 'DATA INCOMPLETE · WATCH' : option.score >= 80 ? 'STRONG SETUP' : option.score >= 65 ? 'GOOD SETUP' : option.score >= 50 ? 'WATCH' : 'LOW CONFIDENCE'; return <div key={option.expiry + option.strike + option.type} className="rounded-xl border border-slate-600/60 bg-[#0b1424] p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-violet-200">#{index + 1} · {option.type}</span><span className="text-[10px] font-bold text-slate-300">{stage}</span></div>
          <p className="mt-2 text-[11px] font-bold text-cyan-200">Expiry {option.expiry} · {option.bias}</p><p className="mt-1 text-xl font-black text-white">{fmt(option.strike)} {option.type}</p><p className="mt-1 text-xs text-slate-400">Radar Score <b className="text-violet-200">{option.score}/100</b> · LTP ₹{fmt(option.ltp)}</p><p className="mt-1 text-[11px] text-cyan-200">Premium / lot ₹{fmt(option.premiumPerLot)} · Max lots {option.maxLots}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><span className="text-slate-500">Entry reference</span><p className="font-bold text-white">₹{fmt(option.ltp)}</p></div><div><span className="text-slate-500">Stop reference</span><p className="font-bold text-rose-300">₹{fmt(stop)}</p></div><div><span className="text-slate-500">Target reference</span><p className="font-bold text-emerald-300">₹{fmt(target)}</p></div><div><span className="text-slate-500">ATM पासून अंतर</span><p className="font-bold text-white">{fmt(option.distance)}%</p></div></div>
          <p className="mt-3 border-t border-slate-700 pt-2 text-[10px] text-slate-400">Price + OI: {option.signal} · {option.hasPriorSnapshot ? 'Prior snapshot available' : 'No prior snapshot; score capped at 60'}</p></div>; })}
      </div>}
      <p className="mt-3 text-[10px] text-amber-200/80">हे फक्त CSV मधील उपलब्ध डेटावरचे संकेत आहेत; Entry/SL/Target indicative आहेत. Live premium feed, bid-ask spread, IV/Greeks आणि liquidity तपासल्याशिवाय प्रत्यक्ष ट्रेड करू नका.</p>
    </section>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">NIFTY Spot</p><p className="mt-1 text-xl font-black text-white">{summary.spot ? fmt(summary.spot) : '—'}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Put / Call OI Ratio</p><p className="mt-1 text-xl font-black text-white">{summary.pcr ? summary.pcr.toFixed(2) : '—'}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Directional read (OI only)</p><p className={'mt-1 text-xl font-black ' + (summary.bias === 'BULLISH' ? 'text-emerald-300' : summary.bias === 'BEARISH' ? 'text-rose-300' : 'text-amber-300')}>{summary.bias}</p></div>
    </div>

    <section className="rounded-2xl border border-cyan-300/20 bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-white">All Expiry Market Analysis</h2><p className="mt-1 text-[11px] text-slate-400">प्रत्येक eligible expiry चे Support / Resistance, Price + OI buildup आणि PCR trend. OI Contracts आणि Lots दोन्हीमध्ये.</p></div><span className="rounded-lg bg-[#080f1b] px-3 py-2 text-[10px] text-cyan-200">Lot size: {lotSize}</span></div>
      {!allExpiryAnalytics.length?<p className="mt-3 text-xs text-amber-200">Eligible expiry data उपलब्ध नाही.</p>:<div className="mt-4 grid gap-3 xl:grid-cols-2">{allExpiryAnalytics.map(item=><div key={item.expiry} className="rounded-xl border border-slate-700 bg-[#080f1b] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-white">Expiry {item.expiry}</h3><span className="text-[10px] text-slate-400">Spot ₹{fmt(item.spot)}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-rose-300/5 p-2"><p className="text-[10px] text-rose-200">Resistance · Highest CE OI</p><p className="mt-1 font-bold text-white">{item.resistance?fmt(item.resistance.strike):'—'}</p><p className="text-[10px] text-slate-400">{item.resistance?`${fmt(item.resistance.ceOi)} contracts · ${fmt(item.resistance.ceOi/lotSize)} lots`:'No data'}</p></div>
          <div className="rounded-lg bg-emerald-300/5 p-2"><p className="text-[10px] text-emerald-200">Support · Highest PE OI</p><p className="mt-1 font-bold text-white">{item.support?fmt(item.support.strike):'—'}</p><p className="text-[10px] text-slate-400">{item.support?`${fmt(item.support.peOi)} contracts · ${fmt(item.support.peOi/lotSize)} lots`:'No data'}</p></div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-slate-800/70 p-2"><p className="text-[10px] text-slate-400">PCR Current / Previous</p><p className="font-bold text-white">{item.pcr.toFixed(2)} / {item.previousPcr?item.previousPcr.toFixed(2):'—'}</p><p className="text-[10px] text-slate-400">Trend: {item.pcrTrend}</p></div><div className="rounded-lg bg-slate-800/70 p-2"><p className="text-[10px] text-slate-400">OI Change CE / PE</p><p className="font-bold text-white">{fmt(item.ceChange)} / {fmt(item.peChange)}</p><p className="text-[10px] text-slate-400">{fmt(item.ceChange/lotSize)} / {fmt(item.peChange/lotSize)} lots</p></div></div>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Price + OI Buildup {item.hasPrevious?'vs previous snapshot':'· prior snapshot आवश्यक'}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4"><div className="rounded bg-emerald-300/10 p-2"><span className="text-emerald-200">Long</span><p className="font-bold text-white">{item.buildup.long} rows</p></div><div className="rounded bg-rose-300/10 p-2"><span className="text-rose-200">Short</span><p className="font-bold text-white">{item.buildup.short} rows</p></div><div className="rounded bg-cyan-300/10 p-2"><span className="text-cyan-200">Covering</span><p className="font-bold text-white">{item.buildup.covering} rows</p></div><div className="rounded bg-amber-300/10 p-2"><span className="text-amber-200">Unwinding</span><p className="font-bold text-white">{item.buildup.unwinding} rows</p></div></div>
        {!item.hasPrevious&&<p className="mt-2 text-[10px] text-amber-200">मागील snapshot नसल्यामुळे buildup उपलब्ध नाही. पुढील snapshot upload झाल्यावर तुलना होईल.</p>}
      </div>)}</div>}
      <p className="mt-3 text-[10px] text-slate-500">Support/Resistance = Spot ±600 मधील highest OI strikes; हमखास पातळी नाहीत. Buildup हा मागील snapshot विरुद्ध LTP आणि OI तुलना आहे. PCR एकट्याने ट्रेड सिग्नल नाही.</p>
    </section>

    <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-white">Daily Snapshot History · Selected expiry</h2><p className="mt-1 text-[11px] text-slate-400">प्रत्येक Upload Date + Expiry स्वतंत्र Cloudflare history मध्ये जतन होते. त्याच दिवशी तीच expiry पुन्हा upload केल्यास फक्त त्या expiry चा snapshot update होतो; इतर expiry सुरक्षित राहतात.</p></div><span className="rounded-lg bg-[#080f1b] px-3 py-2 text-xs text-slate-300">{historyDays} days · {history.length} expiry snapshots</span></div>
      {latestSnapshot ? <div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Latest upload date</p><p className="mt-1 text-sm font-bold text-white">{latestSnapshot.date} · {selectedExpiry}</p></div><div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Latest Spot</p><p className="mt-1 text-sm font-bold text-white">₹{fmt(latestSnapshot.spot)}</p></div><div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Previous snapshot</p><p className="mt-1 text-sm font-bold text-white">{previousSnapshot?.date || 'अजून उपलब्ध नाही'}</p></div></div> : <p className="mt-3 text-xs text-amber-200">पहिला CSV upload केल्यानंतर Daily History सुरू होईल.</p>}
      {previousSnapshot && <><p className="mt-3 text-[11px] text-slate-300">Previous snapshot पासून NIFTY Spot बदल: <b className={latestSnapshot!.spot >= previousSnapshot.spot ? 'text-emerald-300' : 'text-rose-300'}>{latestSnapshot!.spot >= previousSnapshot.spot ? '+' : ''}{fmt(latestSnapshot!.spot - previousSnapshot.spot)} points</b>. प्रत्येक CE/PE contract स्वतंत्रपणे मागील snapshot च्या LTP आणि OI शी compare केला आहे. आजचा Change in OI आणि Volume हे NSE CSV मधून घेतले आहेत.</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{['Type','Strike','Price Δ %','OI Δ vs Prior','Today Chg OI','Today Volume','Price + OI Read','Confidence'].map(x => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]">{[...priceOiSignals].sort((a, b) => b.volume - a.volume).slice(0, 30).map(r => <tr key={r.expiry + r.strike + r.type}><td className="px-3 py-2 font-bold text-white">{r.type}</td><td className="px-3 py-2">{fmt(r.strike)}</td><td className="px-3 py-2">{r.priceChangePct === undefined ? '—' : (r.priceChangePct >= 0 ? '+' : '') + fmt(r.priceChangePct) + '%'}</td><td className="px-3 py-2">{r.oiDeltaSinceSnapshot === undefined ? '—' : fmt(r.oiDeltaSinceSnapshot)}</td><td className="px-3 py-2">{fmt(r.changeOi)}</td><td className="px-3 py-2">{fmt(r.volume)}</td><td className={'px-3 py-2 font-bold ' + (r.signalType === 'bullish' ? 'text-emerald-300' : r.signalType === 'bearish' ? 'text-rose-300' : 'text-amber-200')}>{r.signal}</td><td className="px-3 py-2 text-amber-200">{r.confidence}</td></tr>)}</tbody></table></div></>}
      {pcrHistory.length > 0 && <div className="mt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Selected expiry PCR history</p><div className="flex flex-wrap gap-2">{pcrHistory.map(p => <span key={p.date} className="rounded-lg bg-[#080f1b] px-3 py-2 text-[11px] text-slate-300">{p.date}: <b className="text-white">{p.pcr.toFixed(2)}</b></span>)}</div></div>}
    </div>

    <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-bold text-white">Expiry Selection · या आठवड्याची expiry वगळलेली</h2><p className="mt-1 text-[11px] text-slate-400">सर्वात जवळची upcoming expiry वगळली आहे. त्यानंतरची expiry Next Week, पुढची 2 Weeks Ahead आणि उरलेल्या 3+ Weeks Ahead मध्ये दिसेल.</p></div>
        <div className="flex flex-wrap gap-2">
          {([{ id: 'next', label: 'Next Week' }, { id: 'two-weeks', label: '2 Weeks Ahead' }, { id: 'three-plus', label: '3+ Weeks Ahead' }] as const).map(g => <button key={g.id} onClick={() => { setExpiryGroup(g.id); setExpiryChoice(''); }} className={'rounded-lg border px-3 py-2 text-xs font-bold ' + (expiryGroup === g.id ? 'border-cyan-300 bg-cyan-300 text-slate-950' : 'border-slate-600 text-slate-200 hover:bg-white/5')}>{g.label}</button>)}
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
      <h2 className="text-sm font-bold text-white">Indicative Trade Planning · Risk cap ₹1,500</h2>
      <p className="mt-1 text-[11px] text-slate-400">Entry = निवडलेल्या contract चा uploaded LTP. Stop-loss / Target हे editable premium risk levels आहेत; forecast नाहीत. Max lots = ₹1,500 ÷ (प्रति lot stop-loss risk). Brokerage, slippage व taxes यात समाविष्ट नाहीत.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-300">CE / PE contract निवडा
          <select value={tradeContractKey} onChange={e => setTradeContractKey(e.target.value)} disabled={!tradeLotRows.length} className="rounded border border-slate-600 bg-[#080f1b] px-3 py-2 text-white">
            <option value="">{tradeLotRows.length ? "Contract निवडा…" : "₹1,500 risk मध्ये बसणारा contract नाही"}</option>
            {tradeLotRows.map(r => <option key={r.expiry + r.strike + r.type} value={`${r.expiry}|${r.strike}|${r.type}`}>{r.expiry} · {fmt(r.strike)} {r.type} · LTP ₹{fmt(r.ltp)} · Risk ₹{fmt(r.perLotRisk)} · {r.maxLots} lot(s)</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-4 text-xs text-slate-300">
          <label>Capital ₹ <input type="number" min="1" max="100000000" value={capital} onChange={e => setCapital(Math.max(1, Number(e.target.value) || 1))} className="ml-2 w-24 rounded border border-slate-600 bg-[#080f1b] px-2 py-1.5 text-white" /></label>
          <label>Lot size <input type="number" min="1" max="10000" value={lotSize} onChange={e => setLotSize(Math.max(1, Number(e.target.value) || 1))} className="ml-2 w-20 rounded border border-slate-600 bg-[#080f1b] px-2 py-1.5 text-white" /></label>
          <label>Stop-loss % <input type="number" min="1" max="80" value={stopPct} onChange={e => setStopPct(Number(e.target.value))} className="ml-2 w-20 rounded border border-slate-600 bg-[#080f1b] px-2 py-1.5 text-white" /></label>
          <label>Target % <input type="number" min="1" max="200" value={targetPct} onChange={e => setTargetPct(Number(e.target.value))} className="ml-2 w-20 rounded border border-slate-600 bg-[#080f1b] px-2 py-1.5 text-white" /></label>
        </div>
      </div>
      {tradeLotRows.length > 0 && stopPct > 0 && stopPct <= 80 && lotSize > 0 && <div className="mt-4 overflow-x-auto">
        <p className="mb-2 text-xs font-bold text-white">Capital ₹{fmt(capital)} + ₹1,500 Risk Cap · Strike-wise Lot Availability</p>
        <table className="w-full min-w-[650px] text-left text-[11px]">
          <thead className="text-slate-400"><tr><th className="p-2">Strike</th><th className="p-2">Type</th><th className="p-2">LTP</th><th className="p-2">Premium / lot</th><th className="p-2">Risk / lot</th><th className="p-2">Max lots</th></tr></thead>
          <tbody>{tradeLotRows.map(r => <tr key={r.expiry + r.strike + r.type} className="border-t border-slate-700/60 text-slate-200">
            <td className="p-2 font-bold">{fmt(r.strike)}</td><td className="p-2">{r.type}</td><td className="p-2">₹{fmt(r.ltp)}</td><td className="p-2">₹{fmt(r.premiumPerLot)}</td><td className="p-2">₹{fmt(r.perLotRisk)}</td><td className="p-2 font-bold">{r.maxLots}</td>
          </tr>)}</tbody>
        </table>
        <p className="mt-1 text-[10px] text-slate-500">इथे फक्त तुझ्या capital मध्ये premium परवडणारे आणि प्रति lot SL risk ₹1,500 च्या आत असलेले strikes दाखवले आहेत.</p>
      </div>}
      {selectedTradeContract && stopPct > 0 && stopPct <= 80 && targetPct > 0 && targetPct <= 200 && lotSize > 0 ? (() => {
        const entry = selectedTradeContract.ltp;
        const stop = entry * (1 - stopPct / 100);
        const target = entry * (1 + targetPct / 100);
        const riskPerLot = (entry - stop) * lotSize;
        const premiumPerLot = entry * lotSize;
        const maxLots = Math.min(riskPerLot > 0 ? Math.floor(1500 / riskPerLot) : 0, premiumPerLot > 0 ? Math.floor(capital / premiumPerLot) : 0);
        return <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><span className="rounded bg-[#080f1b] px-3 py-2 text-white">{selectedTradeContract.expiry} · {fmt(selectedTradeContract.strike)} {selectedTradeContract.type}</span><span className="rounded bg-amber-300/10 px-3 py-2 font-bold text-amber-200">OI read: {summary.bias} · BUY signal नाही</span></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Entry · CSV LTP</p><p className="mt-1 font-bold text-white">₹{fmt(entry)}</p></div>
            <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Stop-loss · {stopPct}%</p><p className="mt-1 font-bold text-rose-300">₹{fmt(stop)}</p></div>
            <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Target · {targetPct}%</p><p className="mt-1 font-bold text-emerald-300">₹{fmt(target)}</p></div>
            <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Premium / lot</p><p className="mt-1 font-bold text-white">₹{fmt(premiumPerLot)}</p></div>
            <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Risk / lot</p><p className="mt-1 font-bold text-white">₹{fmt(riskPerLot)}</p></div>
          </div>
          <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3"><p className="text-xs text-slate-300">Capital ₹{fmt(capital)} · ₹1,500 Risk cap · Lot size {lotSize}</p><p className="mt-1 text-lg font-black text-white">{maxLots} max lot(s)</p><p className="text-[10px] text-slate-400">{maxLots > 0 ? `Premium required: ₹${fmt(maxLots * premiumPerLot)} · Estimated SL risk: ₹${fmt(maxLots * riskPerLot)} (excluding charges and slippage)` : `एका lot साठी premium ₹${fmt(premiumPerLot)} लागेल किंवा SL risk ₹${fmt(riskPerLot)} आहे; capital / risk cap मध्ये lot बसत नाही.`}</p></div>
        </div>;
      })() : selectedTradeContract ? <p className="mt-3 text-xs text-rose-300">SL 1–80%, Target 1–200% आणि Lot size 1 पेक्षा जास्त ठेवा.</p> : <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs text-amber-100">{tradeContracts.length ? 'तुझ्या capital आणि ₹1,500 risk cap मध्ये बसणारा CE किंवा PE contract वर निवडा.' : rows.length ? 'या expiry मध्ये Spot ± ₹600 range मध्ये LTP असलेले contracts उपलब्ध नाहीत. दुसरी expiry निवडा किंवा पूर्ण Option Chain CSV upload करा.' : 'सुरुवात करण्यासाठी option-chain CSV upload कर.'}</div>}
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-[#080f1b] p-3 text-[11px] leading-5 text-slate-400"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> हे फक्त indicative गणित आहे; WAIT म्हणजे directional confirmation नाही. Live premium feed, bid-ask spread, IV/Greeks आणि liquidity तपासल्याशिवाय प्रत्यक्ष ट्रेड करू नका. Option buying मध्ये premium पूर्ण गमावण्याचा धोका असतो.</div>
    </div>
    <div className="flex items-center justify-between text-[10px] text-slate-500"><span><CalendarClock className="mr-1 inline h-3 w-3" /> Current data cloud + browser · History last 30 daily snapshots saved in Cloudflare D1</span><button onClick={clearData} className="underline hover:text-white">Clear option data</button></div>
  </div>;
};
