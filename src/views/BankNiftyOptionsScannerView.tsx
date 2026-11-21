import React, { useEffect, useMemo, useState } from 'react';
import { loadScannerData, saveScannerData, deleteScannerData } from '../services/cloudScannerStorage';
import { Activity, Upload, Download, AlertTriangle, CalendarClock } from 'lucide-react';
import { CLOUD_WORKER_URL, getAppwriteJwt } from '../services/appwriteAuth';

type OptionRow = {
  expiry: string; strike: number; type: 'CE' | 'PE'; ltp: number;
  oi: number; changeOi: number; volume: number; iv?: number; spot: number;
};
const HISTORY_KEY = 'banknifty-history';
const PAPER_TRADES_KEY = 'banknifty-paper-trades';
const localIstDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const isEodSnapshotWindow = () => { const parts = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); const hour = Number(parts.find(p => p.type === 'hour')?.value || 0); const minute = Number(parts.find(p => p.type === 'minute')?.value || 0); const total = hour * 60 + minute; return total >= 15 * 60 + 20 && total < 15 * 60 + 30; };
type DailySnapshot = { date: string; expiry?: string; kind?: 'DAILY' | 'EOD'; spot: number; rows: Array<{ expiry: string; strike: number; type: 'CE' | 'PE'; ltp: number; oi: number; changeOi?: number; volume?: number; iv?: number }> };
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
const parseNseOptionChain = (text: string, filename: string, fallbackSpot = 0): OptionRow[] => {
  const lines = csvLines(text);
  if (lines.length < 3) throw new Error('NSE Option Chain CSV मध्ये पुरेशा rows नाहीत.');
  const headers = splitCsvLine(lines[1]).map(normalize);
  const strikeIndex = headers.indexOf('strike');
  const expiryIndex = headers.findIndex(h => h === 'expirydate' || h === 'expiry');
  const selectedStrike = strikeFromFilename(filename);
  const fullChain = strikeIndex >= 0 && headers.length >= 18;
  const selectedStrikeFile = strikeIndex < 0 && expiryIndex >= 0 && headers.length >= 18 && selectedStrike > 0;
  if (!fullChain && !selectedStrikeFile) {
    throw new Error('NSE CSV format ओळखता आला नाही. NSE मधील पूर्ण Option Chain CSV वापरा किंवा CSV Template मधील columns वापरा.');
  }
  // NSE exports contain duplicate OI / Change in OI / Volume / IV / LTP headers.
  // Resolve the CE-side first occurrence and PE-side last occurrence instead of hard-coded positions.
  const indexes = (key: string) => headers.map((h, i) => h === key ? i : -1).filter(i => i >= 0);
  const oiIndexes = indexes('oi');
  const changeOiIndexes = headers.map((h, i) => ['chnginoi', 'changeinoi', 'chginoi'].includes(h) ? i : -1).filter(i => i >= 0);
  const volumeIndexes = indexes('volume');
  const ivIndexes = indexes('iv');
  const ltpIndexes = indexes('ltp');
  const ceLtpIndex = ltpIndexes[0] ?? -1;
  const peLtpIndex = ltpIndexes[ltpIndexes.length - 1] ?? -1;
  if (fullChain && (ceLtpIndex < 0 || peLtpIndex < 0 || oiIndexes.length < 2 || changeOiIndexes.length < 2 || volumeIndexes.length < 2 || ivIndexes.length < 2)) {
    throw new Error('NSE CSV मध्ये CE/PE LTP किंवा OI columns सापडले नाहीत. मूळ NSE Option Chain CSV पुन्हा डाउनलोड करा.');
  }
  const defaultExpiry = expiryFromFilename(filename);
  const raw: Array<{ strike: number; expiry: string; ce: number; pe: number; rows: OptionRow[] }> = [];
  for (const line of lines.slice(2)) {
    const c = splitCsvLine(line);
    const strike = fullChain ? number(c[strikeIndex]) : selectedStrike;
    const expiry = fullChain
      ? (expiryIndex >= 0 ? (parseDate(c[expiryIndex] || '') || defaultExpiry) : defaultExpiry)
      : parseDate(c[expiryIndex] || '') || defaultExpiry;
    if (!(strike > 0) || !expiry) continue;
    const ceLtp = number(c[ceLtpIndex]);
    const peLtp = number(c[peLtpIndex]);
    const rows: OptionRow[] = [];
    if (ceLtp > 0) rows.push({
      expiry, strike, type: 'CE', ltp: ceLtp,
      oi: number(c[oiIndexes[0]]), changeOi: number(c[changeOiIndexes[0]]),
      volume: number(c[volumeIndexes[0]]), iv: number(c[ivIndexes[0]]) || undefined, spot: 0
    });
    if (peLtp > 0) rows.push({
      expiry, strike, type: 'PE', ltp: peLtp,
      oi: number(c[oiIndexes[oiIndexes.length - 1]]),
      changeOi: number(c[changeOiIndexes[changeOiIndexes.length - 1]]),
      volume: number(c[volumeIndexes[volumeIndexes.length - 1]]),
      iv: number(c[ivIndexes[ivIndexes.length - 1]]) || undefined, spot: 0
    });
    if (rows.length) raw.push({ strike, expiry, ce: ceLtp, pe: peLtp, rows });
  }
  if (!raw.length) throw new Error('या NSE CSV मध्ये वाचता येणारे CE/PE rows सापडले नाहीत. Expiry filename मध्ये DD-MMM-YYYY स्वरूपात द्या किंवा CSV मध्ये Expiry column ठेवा.');
  const spot = fallbackSpot > 0 ? fallbackSpot : estimateSpot(raw);
  if (!(spot > 0)) throw new Error('BANKNIFTY Spot काढता आला नाही. वर Manual BANKNIFTY Spot भरा आणि CSV पुन्हा upload करा.');
  return raw.flatMap(x => x.rows.map(r => ({ ...r, spot })));
};
const parseCsv = (text: string, filename = '', fallbackSpot = 0): OptionRow[] => {
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
  if ([expiry, strike, type, ltp, oi, coi, volume, spot].some(i => i < 0)) return parseNseOptionChain(text, filename, fallbackSpot);
  const parsed = lines.slice(1).flatMap(line => {
    const c = splitCsvLine(line);
    const exp = parseDate(c[expiry] || '');
    const rawType = (c[type] || '').trim().toUpperCase();
    const optType = rawType.includes('CE') || rawType === 'CALL' ? 'CE' : rawType.includes('PE') || rawType === 'PUT' ? 'PE' : '';
    const row: OptionRow = {
      expiry: exp, strike: number(c[strike]), type: optType as 'CE' | 'PE',
      ltp: number(c[ltp]), oi: number(c[oi]), changeOi: number(c[coi]),
      volume: number(c[volume]), iv: iv >= 0 ? number(c[iv]) : undefined,
      spot: number(c[spot]) || fallbackSpot
    };
    return exp && optType && row.strike > 0 && row.ltp > 0 && row.spot > 0 ? [row] : [];
  });
  if (!parsed.length) throw new Error('CSV मधून वैध CE/PE rows मिळाले नाहीत. Expiry, Strike, OptionType, LTP, OI, ChangeOI, Volume आणि Spot तपासा.');
  return parsed;
};
const csvTemplate = 'Expiry,Strike,OptionType,LTP,OI,ChangeOI,Volume,IV,UnderlyingValue\n2026-12-03,26000,CE,150,120000,15000,45000,14.2,25950\n2026-12-03,26000,PE,175,145000,22000,51000,14.8,25950';
const fmt = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const localDateKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const NSE_HOLIDAYS_2026 = new Set(['2026-01-15', '2026-01-26', '2026-03-03', '2026-03-26', '2026-03-31', '2026-04-03', '2026-04-14', '2026-05-01', '2026-05-28', '2026-06-26', '2026-09-14', '2026-10-02', '2026-10-20', '2026-11-10', '2026-11-24', '2026-12-25']);
const isIndianMarketOpenNow = () => {
  const parts = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  const weekday = get('weekday');
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return !NSE_HOLIDAYS_2026.has(date) && ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday) && minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30;
};
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const expiryDaysAway = (expiry: string) => {
  const [year, month, day] = expiry.split('-').map(Number);
  if (!year || !month || !day) return Number.NaN;
  const expiryDate = new Date(year, month - 1, day);
  return Math.round((expiryDate.getTime() - today().getTime()) / 86400000);
};
type ExpiryGroup = 'next' | 'next-month' | 'following-month' | 'quarterly';
const isEligiblePositionalExpiry = (expiry: string) => {
  const daysAway = expiryDaysAway(expiry);
  return Number.isFinite(daysAway) && daysAway >= 0;
};
const getExpiryGroup = (expiry: string, allExpiries: string[]): ExpiryGroup | '' => {
  const future = allExpiries.filter(isEligiblePositionalExpiry).sort();
  const index = future.indexOf(expiry);
  if (index === 0) return 'next';
  if (index === 1) return 'next-month';
  if (index === 2) return 'following-month';
  if (expiryDaysAway(expiry) >= 70 && index >= 3) return 'quarterly';
  return '';
};

const normalCdf = (x: number) => {
  const ax = Math.abs(x), t = 1 / (1 + 0.2316419 * ax);
  const density = Math.exp(-ax * ax / 2) / Math.sqrt(2 * Math.PI);
  const tail = density * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
};
// Black-Scholes theta estimate per calendar day, using only uploaded EOD CSV values.
const estimateDailyTheta = (row: OptionRow) => {
  const iv = Number(row.iv), days = expiryDaysAway(row.expiry);
  if (!(iv > 0) || !(row.spot > 0) || !(row.strike > 0) || !(row.ltp > 0) || !(days > 0)) return null;
  const sigma = iv > 1 ? iv / 100 : iv;
  if (!(sigma > 0 && sigma < 5)) return null;
  const t = days / 365, rate = 0.065;
  const d1 = (Math.log(row.spot / row.strike) + (rate + sigma * sigma / 2) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t), pdf = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
  const common = -(row.spot * pdf * sigma) / (2 * Math.sqrt(t) * 365);
  const theta = row.type === 'CE'
    ? common - rate * row.strike * Math.exp(-rate * t) * normalCdf(d2) / 365
    : common + rate * row.strike * Math.exp(-rate * t) * normalCdf(-d2) / 365;
  const daily = Math.max(0, -theta);
  return { daily, pct: daily / row.ltp * 100, iv: sigma * 100, days };
};


export const BankNiftyOptionsScannerView: React.FC = () => {
  const [rows, setRows] = useState<OptionRow[]>([]);
  const [message, setMessage] = useState('');
  const [manualSpot, setManualSpot] = useState('');
  const [history, setHistory] = useState<DailySnapshot[]>([]);
  const [todayKey, setTodayKey] = useState(localDateKey);
  const [liveStatus, setLiveStatus] = useState('FYERS Live तपासत आहे…');
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const [liveError, setLiveError] = useState('');
  useEffect(() => {
    let active = true;
    loadScannerData<OptionRow[]>('banknifty-options').then(async data => {
      if (!active || !data) return;
      // Remove expired/near-expiry chain rows from cloud storage (< 7 days left).
      // Historical daily snapshots are intentionally kept separately.
      const eligibleRows = data.filter(row => isEligiblePositionalExpiry(row.expiry));
      if (eligibleRows.length !== data.length) {
        await saveScannerData('banknifty-options', eligibleRows);
      }
      if (active) {
        setRows(eligibleRows);
      }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Cloud data load failed.'); });
    void loadScannerData<DailySnapshot[]>(HISTORY_KEY).then(data => { if (active) setHistory(data || []); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Cloud history load failed.'); });
    void loadScannerData<Array<{id:string;date:string;expiry:string;strike:number;type:'CE'|'PE';entry:number;qty:number;status:'OPEN'|'CLOSED';exit?:number;closedAt?:string}>>(PAPER_TRADES_KEY).then(data => { if (active) setPaperTrades(data || []); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Cloud paper journal load failed.'); });
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
      void loadScannerData<OptionRow[]>('banknifty-options').then(async data => {
        if (!data) return;
        const eligibleRows = data.filter(row => isEligiblePositionalExpiry(row.expiry));
        if (eligibleRows.length !== data.length) await saveScannerData('banknifty-options', eligibleRows);
        setRows(eligibleRows);
      }).catch(e => setError(e instanceof Error ? e.message : 'Cloud data refresh failed.'));
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [todayKey]);
  const [error, setError] = useState('');
  const [liveEnabled, setLiveEnabled] = useState(true);
  useEffect(() => {
    if (!liveEnabled) {
      setLiveStatus('Auto Live बंद');
      return;
    }
    let active = true;
    let busy = false;
    const refreshLiveChain = async () => {
      if (!active || busy) return;
      if (!isIndianMarketOpenNow()) {
        setLiveStatus('Market बंद · FYERS requests थांबवले');
        setLiveError('');
        return;
      }
      busy = true;
      try {
        const jwt = await getAppwriteJwt();
        if (!active || !isIndianMarketOpenNow()) {
          setLiveStatus('Market बंद · FYERS requests थांबवले');
          return;
        }
        const headers = { authorization: `Bearer ${jwt}` };
        const quoteRes = await fetch(`${CLOUD_WORKER_URL}/api/fyers/quote`, { headers, cache: 'no-store' });
        const quoteBody = await quoteRes.json();
        if (!quoteRes.ok) throw new Error(quoteBody.error || 'FYERS token/API उपलब्ध नाही.');
        const spot = Number(quoteBody.quotes?.['NSE:NIFTYBANK-INDEX']?.ltp || 0);
        if (!(spot > 0)) throw new Error('FYERS कडून BANKNIFTY Spot मिळाला नाही.');
        if (!active || !isIndianMarketOpenNow()) {
          setLiveStatus('Market बंद · FYERS requests थांबवले');
          return;
        }
        const firstRes = await fetch(`${CLOUD_WORKER_URL}/api/fyers/option-chain?index=BANKNIFTY&strikecount=50`, { headers, cache: 'no-store' });
        const firstBody = await firstRes.json();
        if (!firstRes.ok) throw new Error(firstBody.error || 'FYERS BANKNIFTY expiry list मिळाली नाही.');
        const expiryData = (firstBody.data?.expiryData || []) as Array<{ date: string; expiry: string | number }>;
        const futureExpiries = expiryData.map(item => ({ iso: parseDate(item.date || ''), timestamp: String(item.expiry) }))
          .filter(item => item.iso && isEligiblePositionalExpiry(item.iso) && /^\\d{9,12}$/.test(item.timestamp))
          .sort((a, b) => a.iso.localeCompare(b.iso));
        if (!futureExpiries.length) throw new Error('FYERS मध्ये BANKNIFTY ची पुढील expiry उपलब्ध नाही.');
        const fetchedRows: OptionRow[] = [];
        const snapshots: DailySnapshot[] = [];
        for (const expiry of futureExpiries.slice(0, 12)) {
          if (!active || !isIndianMarketOpenNow()) break;
          const res = expiry.timestamp === String(expiryData[0]?.expiry)
            ? firstRes
            : await fetch(`${CLOUD_WORKER_URL}/api/fyers/option-chain?index=BANKNIFTY&strikecount=50&timestamp=${encodeURIComponent(expiry.timestamp)}`, { headers, cache: 'no-store' });
          const body = res === firstRes ? firstBody : await res.json();
          if (!res.ok || !body.data?.optionsChain) continue;
          const converted = (body.data.optionsChain as Array<{ strike_price: number; option_type: string; ltp?: number; oi?: number; oich?: number; volume?: number; greeks?: { iv?: number } }>)
            .filter(item => Number(item.strike_price) > 0 && Number(item.ltp) > 0)
            .map(item => ({
              expiry: expiry.iso, strike: Number(item.strike_price), type: item.option_type === 'CE' ? 'CE' as const : 'PE' as const,
              ltp: Number(item.ltp || 0), oi: Number(item.oi || 0) / 30, changeOi: Number(item.oich || 0) / 30,
              volume: Number(item.volume || 0) / 30, iv: Number(item.greeks?.iv || 0) || undefined, spot
            }));
          if (!converted.length) continue;
          fetchedRows.push(...converted);
          const stamp = new Date().toISOString();
          snapshots.push({ date: stamp, expiry: expiry.iso, spot, rows: converted.map(({ expiry: exp, strike, type, ltp, oi, changeOi, volume, iv }) => ({ expiry: exp, strike, type, ltp, oi, changeOi, volume, iv })) });
        }
        if (!active) return;
        if (!isIndianMarketOpenNow()) {
          setLiveStatus('Market बंद · FYERS requests थांबवले');
          return;
        }
        if (!fetchedRows.length) throw new Error('FYERS कडून कोणत्याही पुढील expiry चे contracts मिळाले नाहीत.');
        const mergedRows = fetchedRows.filter(row => isEligiblePositionalExpiry(row.expiry));
        try { await saveScannerData('banknifty-options', mergedRows); }
        catch { /* Keep the live chain usable locally even if cloud storage is unavailable. */ }
        if (!active) return;
        setRows(mergedRows);
        const tradingDate = localIstDate();
        const oldHistory = await loadScannerData<DailySnapshot[]>(HISTORY_KEY).catch(() => [] as DailySnapshot[]) || [];
        const eodWindow = isEodSnapshotWindow();
        const newDaily = snapshots.flatMap(snapshot => {
          const savedForDay = oldHistory.filter(saved => saved.expiry === snapshot.expiry && saved.date.slice(0, 10) === tradingDate);
          const additions: DailySnapshot[] = [];
          if (!savedForDay.some(saved => saved.kind !== 'EOD')) additions.push({ ...snapshot, kind: 'DAILY' });
          if (eodWindow && !savedForDay.some(saved => saved.kind === 'EOD')) additions.push({ ...snapshot, kind: 'EOD' });
          return additions;
        });
        if (newDaily.length) {
          // 72 records cover about three sessions at 12 expiries with both daily and EOD snapshots.
          const nextHistory = [...oldHistory, ...newDaily].slice(-72);
          await saveScannerData(HISTORY_KEY, nextHistory);
          setHistory(nextHistory);
        }
        setLiveUpdatedAt(new Date().toISOString());
        setLiveStatus(`FYERS Live · ${mergedRows.length} contracts · ${futureExpiries.length} expiries`);
        setLiveError('');
      } catch (e) {
        if (!active) return;
        const reason = e instanceof Error ? e.message : 'FYERS Live refresh अयशस्वी.';
        setLiveError(reason);
        setLiveStatus('Live data stale · FYERS reconnect आवश्यक असू शकतो');
      } finally { busy = false; }
    };
    void refreshLiveChain();
    // This timer only checks the local IST market clock outside trading hours; it makes no network request.
    const timer = window.setInterval(() => { void refreshLiveChain(); }, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, [liveEnabled]);

  const [stopPct, setStopPct] = useState(20);
  const [targetPct, setTargetPct] = useState(35);
  const [lotSize, setLotSize] = useState(30);
  const [capital, setCapital] = useState(6500);
  const [expiryChoice, setExpiryChoice] = useState('');
  const [tradeContractKey, setTradeContractKey] = useState('');
  const [expiryGroup, setExpiryGroup] = useState<ExpiryGroup>('next');
  const [loading, setLoading] = useState(false);
  const [strategyType, setStrategyType] = useState<'BULL_CALL_SPREAD' | 'BEAR_PUT_SPREAD' | 'IRON_CONDOR'>('BULL_CALL_SPREAD');
  const [strategyWidth, setStrategyWidth] = useState(100);
  const [paperTrades, setPaperTrades] = useState<Array<{id:string;date:string;expiry:string;strike:number;type:'CE'|'PE';entry:number;qty:number;status:'OPEN'|'CLOSED';exit?:number;closedAt?:string}>>([]);
  const [paperExit, setPaperExit] = useState<Record<string,string>>({});


  const expiries = useMemo(() => Array.from(new Set(rows.map(r => r.expiry))).sort(), [rows]);
  const groupExpiries = useMemo(() => {
    // Classify every expiry by its actual calendar distance, not by its position in the uploaded file.
    return expiries.filter(expiry => getExpiryGroup(expiry, expiries) === expiryGroup);
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
  const rangeRows = useMemo(() => chain.filter(r => r.strike >= summary.spot - 600 && r.strike <= summary.spot + 600 && r.ltp > 0 && r.ltp <= 300), [chain, summary.spot]);
  const expirySnapshots = useMemo(() => {
    const relevant = history.filter(h => h.expiry === selectedExpiry || (!h.expiry && h.rows.some(r => r.expiry === selectedExpiry)));
    const byDay = new Map<string, DailySnapshot>();
    relevant.forEach(snapshot => { const day = snapshot.date.slice(0, 10); const existing = byDay.get(day); if (!existing || snapshot.kind === 'EOD') byDay.set(day, snapshot); });
    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [history, selectedExpiry]);
  const latestSnapshot = expirySnapshots.slice().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const previousSnapshot = latestSnapshot
    ? expirySnapshots.filter(h => h.date < latestSnapshot.date).sort((a, b) => b.date.localeCompare(a.date))[0] || null
    : null;
  const historyDays = useMemo(() => new Set(history.map(h => h.date)).size, [history]);
  const previousRows = useMemo(() => previousSnapshot?.rows.filter(r => r.expiry === selectedExpiry) || [], [previousSnapshot, selectedExpiry]);
  const priorByContract = useMemo(() => new Map(previousRows.map(r => [`${r.strike}-${r.type}`, r])), [previousRows]);
  const priceOiSignals = useMemo(() => rangeRows.map(r => {
    const old = priorByContract.get(`${r.strike}-${r.type}`);
    const peerVolumes = chain.filter(x => x.type === r.type && x.volume > 0).map(x => x.volume).sort((a, b) => a - b);
    const medianVolume = peerVolumes.length ? peerVolumes[Math.floor(peerVolumes.length / 2)] : 0;
    const volumeConfirmed = r.volume > 0 && medianVolume > 0 && r.volume >= medianVolume;
    if (!old) return { ...r, signal: 'NO PRIOR SNAPSHOT', signalType: 'neutral', oldLtp: undefined as number | undefined, oldOi: undefined as number | undefined, priceChangePct: undefined as number | undefined, oiDeltaSinceSnapshot: undefined as number | undefined, oiChangePct: undefined as number | undefined, strength: 'UNCONFIRMED', strengthScore: 0, volumeConfirmed: false, medianVolume, confidence: 'NO PRIOR DATA' };
    const priceUp = r.ltp > old.ltp; const priceDown = r.ltp < old.ltp;
    const oiUp = r.oi > old.oi; const oiDown = r.oi < old.oi;
    const signal = priceUp && oiUp ? 'LONG BUILDUP' : priceDown && oiUp ? 'SHORT BUILDUP' : priceUp && oiDown ? 'SHORT COVERING' : priceDown && oiDown ? 'LONG UNWINDING' : 'NO CLEAR CHANGE';
    const signalType = priceUp && oiUp || priceUp && oiDown ? 'bullish' : priceDown && oiUp || priceDown && oiDown ? 'bearish' : 'neutral';
    const priceChangePct = old.ltp > 0 ? (r.ltp - old.ltp) / old.ltp * 100 : 0;
    const oiDeltaSinceSnapshot = r.oi - old.oi;
    const oiChangePct = old.oi > 0 ? oiDeltaSinceSnapshot / old.oi * 100 : 0;
    const priceScore = Math.min(35, Math.abs(priceChangePct) / 1 * 35);
    const oiScore = Math.min(35, Math.abs(oiChangePct) / 5 * 35);
    const volumeScore = medianVolume > 0 ? Math.min(30, r.volume / medianVolume * 30) : 0;
    const strengthScore = Math.round(priceScore + oiScore + volumeScore);
    const thresholdsMet = Math.abs(priceChangePct) >= 0.25 && Math.abs(oiChangePct) >= 1;
    const strength = signal === 'NO CLEAR CHANGE' ? 'NO CLEAR CHANGE' : !thresholdsMet || r.volume <= 0 ? 'WEAK' : strengthScore >= 75 && volumeConfirmed ? 'STRONG' : strengthScore >= 50 ? 'MEDIUM' : 'WEAK';
    const confidence = volumeConfirmed ? 'VOLUME CONFIRMED' : r.volume > 0 ? 'BELOW MEDIAN VOLUME' : 'NO VOLUME';
    return { ...r, signal, signalType, oldLtp: old.ltp, oldOi: old.oi, priceChangePct, oiDeltaSinceSnapshot, oiChangePct, strength, strengthScore, volumeConfirmed, medianVolume, confidence };
  }), [rangeRows, priorByContract]);
  const pcrHistory = useMemo(() => expirySnapshots.map(h => { const ce = h.rows.filter(r => r.expiry === selectedExpiry && r.type === 'CE').reduce((s, r) => s + r.oi, 0); const pe = h.rows.filter(r => r.expiry === selectedExpiry && r.type === 'PE').reduce((s, r) => s + r.oi, 0); return { date: h.date, pcr: ce ? pe / ce : 0 }; }).filter(x => x.pcr > 0).slice(-7), [expirySnapshots, selectedExpiry]);
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
    return (selectedExpiry ? [selectedExpiry] : []).flatMap(expiry => {
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
      const expiryRangeRows = expiryChain.filter(r => r.strike >= spot - 600 && r.strike <= spot + 600 && r.ltp > 0 && r.ltp <= 300);
      const priorSnapshots = history.filter(h => h.expiry === expiry || (!h.expiry && h.rows.some(r => r.expiry === expiry))).sort((a, b) => b.date.localeCompare(a.date));
      const previous = priorSnapshots.find(h => h.date < localDateKey());
      const previousByContract = new Map((previous?.rows || []).filter(r => r.expiry === expiry).map(r => [`${r.strike}-${r.type}`, r]));
      const types: ('CE' | 'PE')[] = bias === 'BULLISH' ? ['CE'] : bias === 'BEARISH' ? ['PE'] : ['CE', 'PE'];
      return types.flatMap(type => {
        const eligibleOptions = expiryRangeRows.filter(r => r.type === type && r.ltp > 0);
        const maxVolume = Math.max(1, ...eligibleOptions.map(r => r.volume));
        const supportiveOi = type === 'CE' ? peChg > 0 && ceChg <= 0 : ceChg > 0 && peChg <= 0;
        return eligibleOptions.map(option => {
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
          const priceChangePct = old && old.ltp > 0 ? (option.ltp - old.ltp) / old.ltp * 100 : 0;
          const oiChangePct = old && old.oi > 0 ? (option.oi - old.oi) / old.oi * 100 : 0;
          const typeVolumes = expiryChain.filter(r => r.type === option.type && r.volume > 0).map(r => r.volume).sort((a, b) => a - b);
          const medianVolume = typeVolumes.length ? typeVolumes[Math.floor(typeVolumes.length / 2)] : 0;
          const volumeConfirmed = option.volume > 0 && medianVolume > 0 && option.volume >= medianVolume;
          const momentumScore = signal === 'LONG BUILDUP' || signal === 'SHORT COVERING' ? 20 : 0;
          const biasScore = bias === 'WAIT' ? 0 : 20;
          const rawScore = Math.round(nearAtmScore + pcrScore + oiScore + volumeScore + momentumScore + biasScore);
          const hasPriorSnapshot = Boolean(old);
          const score = hasPriorSnapshot ? Math.min(100, rawScore) : Math.min(60, rawScore);
          const strengthScore = Math.round(Math.min(35, Math.abs(priceChangePct) / 1 * 35) + Math.min(35, Math.abs(oiChangePct) / 5 * 35) + (medianVolume > 0 ? Math.min(30, option.volume / medianVolume * 30) : 0));
          const thresholdsMet = Math.abs(priceChangePct) >= 0.25 && Math.abs(oiChangePct) >= 1;
          const strength = !hasPriorSnapshot ? 'UNCONFIRMED' : signal === 'NO CLEAR CHANGE' ? 'NO CLEAR CHANGE' : !thresholdsMet || option.volume <= 0 ? 'WEAK' : strengthScore >= 75 && volumeConfirmed ? 'STRONG' : strengthScore >= 50 ? 'MEDIUM' : 'WEAK';
          const premiumPerLot = option.ltp * lotSize;
          const perLotRisk = option.ltp * (stopPct / 100) * lotSize;
          const maxLots = Math.min(Math.floor(capital / premiumPerLot), Math.floor(1500 / perLotRisk));
          return { ...option, bias, score, distance, premiumPerLot, perLotRisk, maxLots, withinRiskLimit: maxLots > 0, signal, hasPriorSnapshot, priceChangePct, oiChangePct, medianVolume, volumeConfirmed, strength, strengthScore };
        }).sort((a, b) => b.score - a.score).slice(0, 3).map(option => ({ ...option, expiry }));
      });
    });
  }, [selectedExpiry, rows, history, capital, lotSize, stopPct]);
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
    const bias=pcr>=1.1&&peChange>ceChange?'BULLISH':pcr<=0.9&&ceChange>peChange?'BEARISH':'NEUTRAL';
    const heatmap=strikes.filter(x=>x.ceOi>0||x.peOi>0).sort((a,b)=>(b.ceOi+b.peOi)-(a.ceOi+a.peOi)).slice(0,12).sort((a,b)=>a.strike-b.strike);
    return {expiry,spot,ceOi,peOi,ceChange,peChange,pcr,previousPcr,pcrTrend,resistance,support,buildup,hasPrevious:Boolean(previous),rowCount:expiryRows.length,bias,heatmap};
  }).filter(x=>x.rowCount>0),[expiries,rows,history]);
  const overallMarketDirection = useMemo(() => {
    const ceOi = allExpiryAnalytics.reduce((v, x) => v + x.ceOi, 0);
    const peOi = allExpiryAnalytics.reduce((v, x) => v + x.peOi, 0);
    const ceChange = allExpiryAnalytics.reduce((v, x) => v + x.ceChange, 0);
    const peChange = allExpiryAnalytics.reduce((v, x) => v + x.peChange, 0);
    const pcr = ceOi > 0 ? peOi / ceOi : 0;
    const bias = pcr >= 1.1 && peChange > ceChange ? 'BULLISH' : pcr <= 0.9 && ceChange > peChange ? 'BEARISH' : 'NEUTRAL';
    return { ceOi, peOi, ceChange, peChange, pcr, bias,
      bullish: allExpiryAnalytics.filter(x => x.bias === 'BULLISH').length,
      bearish: allExpiryAnalytics.filter(x => x.bias === 'BEARISH').length,
      neutral: allExpiryAnalytics.filter(x => x.bias === 'NEUTRAL').length };
  }, [allExpiryAnalytics]);
  const momentumAlerts = useMemo(() => {
    // Compare only the selected expiry against its latest prior-day snapshot.
    return (selectedExpiry ? [selectedExpiry] : []).flatMap(expiry => {
      const snapshots = history
        .filter(h => h.expiry === expiry || (!h.expiry && h.rows.some(r => r.expiry === expiry)))
        .filter(h => h.date < localDateKey())
        .sort((a, b) => b.date.localeCompare(a.date));
      const previous = snapshots[0];
      if (!previous) return [];
      const oldMap = new Map(previous.rows.filter(r => r.expiry === expiry).map(r => [`${r.strike}-${r.type}`, r]));
      return rows.filter(r => r.expiry === expiry).flatMap(r => {
        const old = oldMap.get(`${r.strike}-${r.type}`);
        if (!old) return [];
        const priceUp = r.ltp > old.ltp, priceDown = r.ltp < old.ltp;
        const oiUp = r.oi > old.oi, oiDown = r.oi < old.oi;
        const signal = priceUp && oiUp ? 'LONG BUILDUP' : priceDown && oiUp ? 'SHORT BUILDUP' : priceUp && oiDown ? 'SHORT COVERING' : priceDown && oiDown ? 'LONG UNWINDING' : '';
        if (!signal) return [];
        return [{ ...r, previousDate: previous.date, previousLtp: old.ltp, previousOi: old.oi, priceChangePct: old.ltp > 0 ? (r.ltp - old.ltp) / old.ltp * 100 : 0, oiDelta: r.oi - old.oi, signal, signalType: signal === 'LONG BUILDUP' || signal === 'SHORT COVERING' ? 'bullish' : 'bearish' }];
      });
    }).sort((a, b) => Math.abs(b.oiDelta) - Math.abs(a.oiDelta));
  }, [selectedExpiry, rows, history]);
  const momentumSummary = useMemo(() => ({
    long: momentumAlerts.filter(x => x.signal === 'LONG BUILDUP').length,
    short: momentumAlerts.filter(x => x.signal === 'SHORT BUILDUP').length,
    covering: momentumAlerts.filter(x => x.signal === 'SHORT COVERING').length,
    unwinding: momentumAlerts.filter(x => x.signal === 'LONG UNWINDING').length,
  }), [momentumAlerts]);
  // Daily-only historical signal evaluation using three consecutive upload dates.
  const dailyAccuracy = useMemo(() => {
    const byExpiry = new Map<string, DailySnapshot[]>();
    for (const snapshot of history) for (const expiry of new Set(snapshot.rows.map(r => r.expiry).filter(Boolean))) {
      const list = byExpiry.get(expiry) || [];
      list.push({ ...snapshot, rows: snapshot.rows.filter(r => r.expiry === expiry) });
      byExpiry.set(expiry, list);
    }
    const stats: Record<string, { total: number; correct: number; moveSum: number }> = {
      'LONG BUILDUP': { total: 0, correct: 0, moveSum: 0 }, 'SHORT BUILDUP': { total: 0, correct: 0, moveSum: 0 },
      'SHORT COVERING': { total: 0, correct: 0, moveSum: 0 }, 'LONG UNWINDING': { total: 0, correct: 0, moveSum: 0 },
    };
    for (const snapshots of byExpiry.values()) {
      const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 1; i < ordered.length - 1; i++) {
        const prev = new Map(ordered[i - 1].rows.map(r => [String(r.strike) + '|' + r.type, r]));
        const next = new Map(ordered[i + 1].rows.map(r => [String(r.strike) + '|' + r.type, r]));
        for (const current of ordered[i].rows) {
          const old = prev.get(String(current.strike) + '|' + current.type);
          const future = next.get(String(current.strike) + '|' + current.type);
          if (!old || !future || old.ltp <= 0 || current.ltp <= 0 || future.ltp === current.ltp) continue;
          const up = current.ltp > old.ltp, down = current.ltp < old.ltp;
          const oiUp = current.oi > old.oi, oiDown = current.oi < old.oi;
          const signal = up && oiUp ? 'LONG BUILDUP' : down && oiUp ? 'SHORT BUILDUP' : up && oiDown ? 'SHORT COVERING' : down && oiDown ? 'LONG UNWINDING' : '';
          if (!signal) continue;
          const move = (future.ltp - current.ltp) / current.ltp * 100;
          const bullish = signal === 'LONG BUILDUP' || signal === 'SHORT COVERING';
          stats[signal].total++;
          stats[signal].moveSum += move;
          if (bullish ? move > 0 : move < 0) stats[signal].correct++;
        }
      }
    }
    const signals = Object.entries(stats).map(([signal, v]) => ({ signal, ...v, accuracy: v.total ? v.correct / v.total * 100 : 0, avgMove: v.total ? v.moveSum / v.total : 0 }));
    const total = signals.reduce((n, x) => n + x.total, 0);
    const correct = signals.reduce((n, x) => n + x.correct, 0);
    return { signals, total, correct, accuracy: total ? correct / total * 100 : 0 };
  }, [history]);

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const suppliedSpot = Number(manualSpot.replace(/[,₹\s]/g, ''));
      if (manualSpot.trim() && (!Number.isFinite(suppliedSpot) || suppliedSpot <= 0)) throw new Error('BANKNIFTY Spot योग्य आकड्यात भरा.');
      const parsedRows = parseCsv(await file.text(), file.name, suppliedSpot);
      if (!parsedRows.length) throw new Error('वाचता येणाऱ्या BANKNIFTY option rows सापडल्या नाहीत.');
      const parsed = suppliedSpot > 0 ? parsedRows.map(r => ({ ...r, spot: suppliedSpot })) : parsedRows;

      // Keep other expiries already uploaded today; replace only expiries present in this CSV.
      const cloudRows = await loadScannerData<OptionRow[]>('banknifty-options');
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
      await saveScannerData('banknifty-options', mergedRows);
      setRows(mergedRows);
      const snapshotDate = localIstDate();
      const snapshot: DailySnapshot = { date: snapshotDate, spot: parsed[0]?.spot || 0, rows: parsed.map(r => ({ expiry: r.expiry, strike: r.strike, type: r.type, ltp: r.ltp, oi: r.oi, changeOi: r.changeOi, volume: r.volume, iv: r.iv })) };
      const cloudHistory = await loadScannerData<DailySnapshot[]>(HISTORY_KEY).catch(() => [] as DailySnapshot[]) || [];
      const nextHistory = [...cloudHistory.filter(h => h.date.slice(0, 10) !== snapshot.date), snapshot].sort((a, b) => a.date.localeCompare(b.date)).slice(-500);
      await saveScannerData(HISTORY_KEY, nextHistory);
      setHistory(nextHistory);
      setExpiryChoice('');
      setMessage(`${parsed.length} option rows History मध्ये save झाले; ${eligibleParsed.length} eligible rows Main Scanner मध्ये ठेवले. ${suppliedSpot > 0 ? `तुम्ही दिलेला BANKNIFTY Spot ₹${fmt(suppliedSpot)} वापरला.` : 'BANKNIFTY Spot CE-PE premium parity वरून अंदाजे काढला आहे.'} Daily snapshot save झाला.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'CSV वाचता आला नाही.'); }
    finally { setLoading(false); }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([csvTemplate], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'moti-banknifty-option-chain-template.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const savePaperTrade = (contract: OptionRow) => {
    const trade = { id: `${Date.now()}-${contract.strike}-${contract.type}`, date: localDateKey(), expiry: contract.expiry, strike: contract.strike, type: contract.type, entry: contract.ltp, qty: lotSize, status: 'OPEN' as const };
    const next = [trade, ...paperTrades].slice(0, 200);
    setPaperTrades(next); void saveScannerData(PAPER_TRADES_KEY, next).catch(e => setError(e instanceof Error ? e.message : 'Cloud paper journal save failed.'));
    setMessage(`Paper trade saved: ${contract.strike} ${contract.type} @ ₹${fmt(contract.ltp)}`);
  };
  const closePaperTrade = (id: string) => {
    const exit = Number((paperExit[id] || '').replace(/[,₹\\s]/g, ''));
    if (!(exit > 0)) { setError('Paper trade बंद करण्यासाठी वैध exit premium भरा.'); return; }
    const next = paperTrades.map(t => t.id === id ? { ...t, status: 'CLOSED' as const, exit, closedAt: localDateKey() } : t);
    setPaperTrades(next); void saveScannerData(PAPER_TRADES_KEY, next).catch(e => setError(e instanceof Error ? e.message : 'Cloud paper journal save failed.'));
    setPaperExit(old => ({ ...old, [id]: '' })); setMessage('Paper trade closed आणि journal save झाला.');
  };
  const downloadCsv = (filename: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  };
  const exportPaperJournal = () => {
    const header = 'Date,Expiry,Strike,Type,Entry,Exit,Quantity,Status,PnL\\n';
    const body = paperTrades.map(t => [t.date,t.expiry,t.strike,t.type,t.entry,t.exit ?? '',t.qty,t.status,t.exit !== undefined ? ((t.exit-t.entry)*t.qty).toFixed(2) : ''].join(',')).join('\\n');
    downloadCsv('moti-banknifty-paper-trade-journal.csv', header + body);
  };
  const exportDailyReport = () => {
    const lines = [
      'Metric,Value',
      `Snapshot Date,${localDateKey()}`,
      `Selected Expiry,${selectedExpiry}`,
      `BANKNIFTY Spot,${summary.spot}`,
      `PCR,${summary.pcr.toFixed(3)}`,
      `Bias,${summary.bias}`,
      `Highest CE OI Resistance,${maxCe?.strike ?? ''}`,
      `Highest PE OI Support,${maxPe?.strike ?? ''}`,
      `Historical Signal Accuracy,${dailyAccuracy.accuracy.toFixed(2)}%`,
      `Backtest Samples,${dailyAccuracy.total}`,
      '',
      'Strike,CE OI,CE Change OI,CE Volume,PE OI,PE Change OI,PE Volume'
    ];
    strikeStats.forEach(x => lines.push([x.strike,x.ceOi,x.ceChange,x.ceVol,x.peOi,x.peChange,x.peVol].join(',')));
    downloadCsv('moti-banknifty-eod-report.csv', lines.join('\\n'));
  };
  const strategyLegs = useMemo(() => {
    const sorted = [...new Set(rangeRows.map(r => r.strike))].sort((a,b)=>a-b);
    if (!sorted.length) return [];
    const atm = sorted.reduce((best,x)=>Math.abs(x-summary.spot)<Math.abs(best-summary.spot)?x:best,sorted[0]);
    const upper = sorted.find(x=>x>=atm+strategyWidth) ?? sorted[sorted.length-1];
    const lower = [...sorted].reverse().find(x=>x<=atm-strategyWidth) ?? sorted[0];
    const premium = (strike:number,type:'CE'|'PE') => rangeRows.find(r=>r.strike===strike&&r.type===type)?.ltp || 0;
    if (strategyType==='BULL_CALL_SPREAD') return [{strike:atm,type:'CE' as const,side:1,premium:premium(atm,'CE')},{strike:upper,type:'CE' as const,side:-1,premium:premium(upper,'CE')}];
    if (strategyType==='BEAR_PUT_SPREAD') return [{strike:atm,type:'PE' as const,side:1,premium:premium(atm,'PE')},{strike:lower,type:'PE' as const,side:-1,premium:premium(lower,'PE')}];
    return [{strike:upper,type:'CE' as const,side:-1,premium:premium(upper,'CE')},{strike:upper+strategyWidth,type:'CE' as const,side:1,premium:premium(upper+strategyWidth,'CE')},{strike:lower,type:'PE' as const,side:-1,premium:premium(lower,'PE')},{strike:Math.max(1,lower-strategyWidth),type:'PE' as const,side:1,premium:premium(Math.max(1,lower-strategyWidth),'PE')}];
  },[rangeRows,summary.spot,strategyType,strategyWidth]);
  const strategyMetrics = useMemo(() => {
    if (!strategyLegs.length || strategyLegs.some(x=>x.premium<=0)) return null;
    const netDebit = strategyLegs.reduce((v,x)=>v+x.side*x.premium,0);
    const points = Array.from({length:21},(_,i)=>summary.spot*(0.9+i*0.01));
    const payoff = (spot:number) => strategyLegs.reduce((v,x)=>v+x.side*((x.type==='CE'?Math.max(0,spot-x.strike):Math.max(0,x.strike-spot))-x.premium)*lotSize,0);
    const outcomes = points.map(spot=>({spot,pnl:payoff(spot)}));
    return { netDebit, maxProfit:Math.max(...outcomes.map(x=>x.pnl)), maxLoss:Math.min(...outcomes.map(x=>x.pnl)), breakevens:outcomes.filter((x,i)=>i>0&&Math.sign(x.pnl)!==Math.sign(outcomes[i-1].pnl)).map(x=>x.spot), outcomes };
  },[strategyLegs,summary.spot,lotSize]);
  const greeksRows = useMemo(() => rangeRows.map(r => {
    const days=expiryDaysAway(r.expiry), sigma=(Number(r.iv)||0)/100, t=days/365;
    if (!(sigma>0&&t>0&&r.spot>0&&r.strike>0)) return {...r,delta:null as number|null,gamma:null,vega:null};
    const d1=(Math.log(r.spot/r.strike)+(0.065+sigma*sigma/2)*t)/(sigma*Math.sqrt(t));
    const pdf=Math.exp(-d1*d1/2)/Math.sqrt(2*Math.PI);
    const delta=r.type==='CE'?normalCdf(d1):normalCdf(d1)-1;
    const gamma=pdf/(r.spot*sigma*Math.sqrt(t));
    const vega=r.spot*pdf*Math.sqrt(t)/100;
    return {...r,delta,gamma,vega};
  }).filter(r=>r.delta!==null).sort((a,b)=>b.volume-a.volume).slice(0,30),[rangeRows]);
  const scannerAlerts = useMemo(() => {
    const alerts:string[]=[];
    if(summary.pcr>=1.2) alerts.push('PCR 1.20 पेक्षा जास्त: PE OI positioning मजबूत; bullish confirmation स्वतंत्रपणे तपासा.');
    if(summary.pcr>0&&summary.pcr<=0.8) alerts.push('PCR 0.80 किंवा कमी: CE OI positioning मजबूत; bearish confirmation स्वतंत्रपणे तपासा.');
    if(maxCe&&Math.abs(maxCe.strike-summary.spot)<=100) alerts.push(`Potential resistance जवळ: ${fmt(maxCe.strike)}`);
    if(maxPe&&Math.abs(maxPe.strike-summary.spot)<=100) alerts.push(`Potential support जवळ: ${fmt(maxPe.strike)}`);
    if(momentumAlerts.length) alerts.push(`${momentumAlerts.length} contracts मध्ये मागील snapshot पासून Price + OI momentum बदल दिसतो.`);
    return alerts;
  },[summary.pcr,summary.spot,maxCe,maxPe,momentumAlerts]);
  const paperStats = useMemo(() => {
    const closed=paperTrades.filter(t=>t.status==='CLOSED'&&t.exit!==undefined);
    const pnl=closed.reduce((v,t)=>v+((t.exit||0)-t.entry)*t.qty,0);
    return {open:paperTrades.filter(t=>t.status==='OPEN').length,closed:closed.length,pnl,wins:closed.filter(t=>((t.exit||0)-t.entry)>0).length};
  },[paperTrades]);

  const clearData = () => {
    if (window.confirm('Saved BANKNIFTY option-chain data delete करायचा?')) {
      void (async () => { try { await deleteScannerData('banknifty-options'); await deleteScannerData(HISTORY_KEY); await deleteScannerData(PAPER_TRADES_KEY); setRows([]); setHistory([]); setPaperTrades([]); setMessage('Cloud option-chain आणि daily history clear केला.'); } catch (e) { setError(e instanceof Error ? e.message : 'Cloud delete failed.'); } })();
    }
  };

  return <div className="space-y-5">
    <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#10243b] via-[#0d1928] to-[#0d1527] p-5 sm:p-7">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300"><Activity className="h-4 w-4" /> MOTI · Separate Options Module</div>
      <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl">BANKNIFTY Options Positional Scanner</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-300">Intraday नाही. या आठवड्याची expiry वगळली आहे. पुढील 1, 2, 3 किंवा 4 आठवड्यांतील expiry स्वतंत्रपणे निवडा; त्यापुढील expiry 5+ Weeks मध्ये दिसेल. OI हे positioning data आहे; ते एकटे buy signal नाही.</p>
      <div className="mb-3 rounded-xl border border-cyan-300/20 bg-[#080f1b] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-cyan-200">{liveStatus}</span><label className="flex items-center gap-2 text-[10px] text-slate-300"><input type="checkbox" checked={liveEnabled} onChange={e => setLiveEnabled(e.target.checked)} /> Auto Live</label></div>
        <p className="mt-1 text-[10px] text-slate-400">{liveUpdatedAt ? `Last update: ${new Date(liveUpdatedAt).toLocaleString('en-IN')}` : 'FYERS Data API मधून प्रत्येक 60 सेकंदांनी refresh.'} · FYERS quantity values BANKNIFTY lot size 30 ने contracts मध्ये रूपांतरित.</p>
        {liveError && <p role="alert" className="mt-2 text-[11px] text-amber-200">{liveError} · CSV upload backup म्हणून उपलब्ध.</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-300">BANKNIFTY Spot (optional, NSE वर दिसणारा)
          <input type="number" min="1" step="0.05" value={manualSpot} onChange={e => setManualSpot(e.target.value)} placeholder="उदा. 25144.30" className="w-44 rounded-xl border border-slate-600 bg-[#080f1b] px-3 py-3 text-sm text-white placeholder:text-slate-500" />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-slate-950 hover:bg-cyan-200">
          <Upload className="h-4 w-4" /> {loading ? 'Reading CSV...' : 'Upload BANKNIFTY Option Chain CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={loading} onChange={e => { handleUpload(e.target.files?.[0]); e.currentTarget.value = ''; }} />
        </label>
        <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-xs font-bold text-slate-200 hover:bg-white/5"><Download className="h-4 w-4" /> CSV Template</button>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">मुख्य डेटा FYERS Live API मधून प्रत्येक 60 सेकंदांनी येतो आणि उपलब्ध पुढील expiry आपोआप घेतल्या जातात. CSV फक्त backup/manual fallback आहे.</p>
    </div>


    <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-bold text-white">Expiry Selection · या आठवड्याची expiry वगळलेली</h2><p className="mt-1 text-[11px] text-slate-400">या आठवड्याची expiry वगळली आहे. Expiry अंतरानुसार Next Week, 2 Weeks, 3 Weeks, 4 Weeks आणि 5+ Weeks असे स्वतंत्र गट आहेत.</p></div>
        <div className="flex flex-wrap gap-2">
          {([{ id: 'next', label: 'Nearest Expiry' }, { id: 'next-month', label: 'Next Month' }, { id: 'following-month', label: 'Following Month' }, { id: 'quarterly', label: '3-Month / Quarterly' }] as const).map(g => <button key={g.id} onClick={() => { setExpiryGroup(g.id); setExpiryChoice(''); }} className={'rounded-lg border px-3 py-2 text-xs font-bold ' + (expiryGroup === g.id ? 'border-cyan-300 bg-cyan-300 text-slate-950' : 'border-slate-600 text-slate-200 hover:bg-white/5')}>{g.label}</button>)}
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
      <h2 className="text-sm font-bold text-white">Daily Signal Accuracy · Saved Snapshot Based</h2>
      <p className="mt-1 text-[11px] text-slate-400">मागील saved FYERS/CSV snapshot नंतर त्याच contract चा premium कोणत्या दिशेने बदलला ते मोजले आहे. डेटा snapshot frequency वर अवलंबून.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Historical Accuracy</p><p className="mt-1 text-xl font-black text-white">{dailyAccuracy.total ? dailyAccuracy.accuracy.toFixed(1) + '%' : '—'}</p></div>
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Correct Outcomes</p><p className="mt-1 text-xl font-black text-emerald-300">{dailyAccuracy.correct} / {dailyAccuracy.total}</p></div>
        <div className="col-span-2 rounded-lg bg-[#080f1b] p-3 sm:col-span-1"><p className="text-[10px] text-slate-400">History Requirement</p><p className="mt-1 text-sm font-bold text-white">3 daily snapshots</p></div>
      </div>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{['Signal','Evaluated','Correct','Accuracy','Next-day Avg Premium Δ'].map(x => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]">{dailyAccuracy.signals.map(x => <tr key={x.signal}><td className="px-3 py-2 font-bold text-white">{x.signal}</td><td className="px-3 py-2">{x.total}</td><td className="px-3 py-2 text-emerald-300">{x.correct}</td><td className="px-3 py-2">{x.total ? x.accuracy.toFixed(1) + '%' : '—'}</td><td className={'px-3 py-2 ' + (x.avgMove > 0 ? 'text-emerald-300' : x.avgMove < 0 ? 'text-rose-300' : 'text-slate-300')}>{x.total ? (x.avgMove > 0 ? '+' : '') + x.avgMove.toFixed(2) + '%' : '—'}</td></tr>)}</tbody></table></div>
      <p className="mt-2 text-[10px] leading-5 text-slate-500">Accuracy म्हणजे पुढील upload-day ला premium signal च्या दिशेने हलला का. हा historical descriptive score आहे; profitable trades किंवा future returns ची हमी नाही. प्रत्येक expiry साठी सलग 3 daily snapshots लागतात.</p>
    </div>

    {message && <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-xs text-emerald-200">{message}</div>}
    {error && <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{error}</div>}

    <section className="rounded-2xl border border-violet-300/20 bg-gradient-to-br from-[#21183b] via-[#101a2d] to-[#0d1527] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">MOTI PRO · Options Radar</p><h2 className="mt-1 text-xl font-black text-white">CE / PE Opportunity Radar · Selected Expiry</h2></div><span className="rounded-full border border-violet-300/30 px-3 py-1 text-[10px] font-bold text-violet-200">CSV DATA MODE</span></div>
      <p className="mt-2 text-xs text-slate-400">PCR, OI change, volume, ATM जवळीक आणि मागील snapshot मधील Price + OI संकेत यांवर आधारित heuristic score. Live API जोडलेला नाही.</p>
      {proRadar.some(option => !option.withinRiskLimit) && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">काही contracts Radar मध्ये Watchlist म्हणून दाखवले आहेत; ते सध्याच्या capital / ₹1,500 risk limit मध्ये बसत नाहीत. Max lots 0 असल्यास BUY करू नका.</div>}
      {proRadar.some(option => option.bias === 'WAIT') && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">WAIT असलेल्या expiry मधील CE/PE contracts फक्त Watchlist आहेत — BUY signals नाहीत.</div>}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-2"><b className="block text-emerald-300">{proRadar.filter(x => x.strength === 'STRONG').length}</b><span className="text-slate-300">STRONG</span></div><div className="rounded-lg border border-sky-300/20 bg-sky-300/5 p-2"><b className="block text-sky-300">{proRadar.filter(x => x.strength === 'MEDIUM').length}</b><span className="text-slate-300">MEDIUM</span></div><div className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-2"><b className="block text-amber-200">{proRadar.filter(x => x.strength === 'WEAK' || x.strength === 'UNCONFIRMED' || x.strength === 'NO CLEAR CHANGE').length}</b><span className="text-slate-300">WEAK / OTHER</span></div></div>
      {!proRadar.length ? <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">निवडलेल्या {selectedExpiry || "expiry"} मध्ये उपलब्ध CSV मधून valid LTP असलेले contracts सापडले नाहीत. दुसरी expiry किंवा नवीन EOD CSV निवडा.</div> : <div className="mt-4 grid gap-3 md:grid-cols-3">
        {proRadar.slice().sort((a, b) => ({ STRONG: 0, MEDIUM: 1, WEAK: 2, UNCONFIRMED: 3, 'NO CLEAR CHANGE': 4 }[a.strength] ?? 5) - ({ STRONG: 0, MEDIUM: 1, WEAK: 2, UNCONFIRMED: 3, 'NO CLEAR CHANGE': 4 }[b.strength] ?? 5) || b.score - a.score).map((option, index) => { const stop = option.ltp * (1 - stopPct / 100); const target = option.ltp * (1 + targetPct / 100); const stage = option.bias === 'WAIT' ? 'WATCHLIST · NOT A BUY SIGNAL' : !option.hasPriorSnapshot ? 'DATA INCOMPLETE · WATCH' : option.score >= 80 ? 'STRONG SETUP' : option.score >= 65 ? 'GOOD SETUP' : option.score >= 50 ? 'WATCH' : 'LOW CONFIDENCE'; return <div key={option.expiry + option.strike + option.type} className="rounded-xl border border-slate-600/60 bg-[#0b1424] p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-violet-200">#{index + 1} · {option.type}</span><span className={'text-[10px] font-black ' + (option.strength === 'STRONG' ? 'text-emerald-300' : option.strength === 'MEDIUM' ? 'text-sky-300' : 'text-amber-200')}>{option.strength} · {option.strengthScore}/100</span><span className="text-[10px] font-bold text-slate-300">{!option.withinRiskLimit ? 'WATCHLIST · OVER RISK LIMIT' : stage}</span></div>
          <p className="mt-2 text-[11px] font-bold text-cyan-200">Expiry {option.expiry} · {option.bias}</p><p className="mt-1 text-xl font-black text-white">{fmt(option.strike)} {option.type}</p><p className="mt-1 text-xs text-slate-400">Radar Score <b className="text-violet-200">{option.score}/100</b> · EOD LTP ₹{fmt(option.ltp)}</p><p className="mt-1 text-[11px] text-cyan-200">Premium / lot ₹{fmt(option.premiumPerLot)} · Max lots {option.maxLots}</p><p className={'mt-1 text-[10px] font-bold ' + (option.withinRiskLimit ? 'text-emerald-300' : 'text-amber-200')}>{option.withinRiskLimit ? 'CAPITAL & RISK LIMIT OK' : 'WATCH ONLY · CAPITAL / RISK LIMIT EXCEEDED'}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><span className="text-slate-500">Entry reference</span><p className="font-bold text-white">₹{fmt(option.ltp)}</p></div><div><span className="text-slate-500">Stop reference</span><p className="font-bold text-rose-300">₹{fmt(stop)}</p></div><div><span className="text-slate-500">Target reference</span><p className="font-bold text-emerald-300">₹{fmt(target)}</p></div><div><span className="text-slate-500">ATM पासून अंतर</span><p className="font-bold text-white">{fmt(option.distance)}%</p></div></div>
          <p className="mt-3 border-t border-slate-700 pt-2 text-[10px] text-slate-400">Price + OI: {option.signal} · Volume {option.volumeConfirmed ? 'CONFIRMED' : 'NOT CONFIRMED'} · {option.hasPriorSnapshot ? 'Prior snapshot available' : 'No prior snapshot; strength unconfirmed'}</p></div>; })}
      </div>}
      <p className="mt-3 text-[10px] text-amber-200/80">हे फक्त CSV मधील उपलब्ध डेटावरचे संकेत आहेत; Entry/SL/Target indicative आहेत. हा EOD estimate आहे; उद्या entry घेण्यापूर्वी market-open price, spot direction आणि IV पुन्हा तपासा. या planner मध्ये live data वापरलेला नाही.</p>
    </section>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">BANKNIFTY Spot</p><p className="mt-1 text-xl font-black text-white">{summary.spot ? fmt(summary.spot) : '—'}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Put / Call OI Ratio</p><p className="mt-1 text-xl font-black text-white">{summary.pcr ? summary.pcr.toFixed(2) : '—'}</p></div>
      <div className="rounded-xl border border-[#1e2e4f] bg-[#0d1527] p-4"><p className="text-xs text-slate-400">Directional read (OI only)</p><p className={'mt-1 text-xl font-black ' + (summary.bias === 'BULLISH' ? 'text-emerald-300' : summary.bias === 'BEARISH' ? 'text-rose-300' : 'text-amber-300')}>{summary.bias}</p></div>
    </div>

    <section className="rounded-2xl border border-violet-300/20 bg-gradient-to-br from-[#21183b] via-[#101a2d] to-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">MOTI PRO · Market Pulse</p><h2 className="mt-1 text-lg font-black text-white">Overall Market Direction · All Expiries</h2></div><span className={'rounded-full border px-3 py-1 text-xs font-black '+(overallMarketDirection.bias==='BULLISH'?'border-emerald-300/30 text-emerald-200':overallMarketDirection.bias==='BEARISH'?'border-rose-300/30 text-rose-200':'border-amber-300/30 text-amber-200')}>{overallMarketDirection.bias}</span></div>
      <p className="mt-2 text-[11px] text-slate-400">सर्व eligible expiries मधील एकत्रित OI आणि Change in OI वर आधारित heuristic direction; हा BUY/SELL signal नाही.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Combined PCR</p><p className="mt-1 text-lg font-black text-white">{overallMarketDirection.pcr.toFixed(2)}</p></div>
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Bullish Expiries</p><p className="mt-1 text-lg font-black text-emerald-200">{overallMarketDirection.bullish}</p></div>
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Bearish Expiries</p><p className="mt-1 text-lg font-black text-rose-200">{overallMarketDirection.bearish}</p></div>
        <div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Neutral Expiries</p><p className="mt-1 text-lg font-black text-amber-200">{overallMarketDirection.neutral}</p></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Combined CE Change OI</p><p className="mt-1 font-bold text-white">{fmt(overallMarketDirection.ceChange)} contracts</p></div><div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Combined PE Change OI</p><p className="mt-1 font-bold text-white">{fmt(overallMarketDirection.peChange)} contracts</p></div></div>
      <div className="mt-3 space-y-2">{allExpiryAnalytics.map(item=><div key={item.expiry} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#080f1b] px-3 py-2"><span className="text-xs font-bold text-white">{item.expiry}</span><span className="text-[10px] text-slate-400">PCR {item.pcr.toFixed(2)} · CE Δ {fmt(item.ceChange)} · PE Δ {fmt(item.peChange)}</span><span className={'text-[10px] font-black '+(item.bias==='BULLISH'?'text-emerald-200':item.bias==='BEARISH'?'text-rose-200':'text-amber-200')}>{item.bias}</span></div>)}</div>
      <p className="mt-3 text-[10px] text-amber-200/80">Directional read हा OI-आधारित अंदाज आहे. Option buying करण्यापूर्वी price action, liquidity, spread, IV आणि risk तपासा.</p>
    </section>

    <section className="rounded-2xl border border-amber-300/20 bg-[#171827] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">MOTI PRO · Price + OI Momentum</p><h2 className="mt-1 text-lg font-black text-white">Four OI Build-up / Unwinding Signals · Selected Expiry</h2></div><span className="rounded-full border border-amber-300/30 px-3 py-1 text-[10px] font-bold text-amber-100">PRIOR SNAPSHOT BASED</span></div>
      <p className="mt-2 text-[11px] text-slate-400">निवडलेल्या expiry मधील प्रत्येक CE/PE strike चा सध्याचा LTP आणि OI त्याच expiry च्या मागील उपलब्ध prior-day snapshot शी compare केला आहे.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-emerald-300/10 p-3"><p className="text-[10px] text-emerald-200">Long Buildup</p><p className="mt-1 text-xl font-black text-white">{momentumSummary.long}</p><p className="text-[9px] text-slate-400">Price ↑ · OI ↑</p></div>
        <div className="rounded-lg bg-rose-300/10 p-3"><p className="text-[10px] text-rose-200">Short Buildup</p><p className="mt-1 text-xl font-black text-white">{momentumSummary.short}</p><p className="text-[9px] text-slate-400">Price ↓ · OI ↑</p></div>
        <div className="rounded-lg bg-cyan-300/10 p-3"><p className="text-[10px] text-cyan-200">Short Covering</p><p className="mt-1 text-xl font-black text-white">{momentumSummary.covering}</p><p className="text-[9px] text-slate-400">Price ↑ · OI ↓</p></div>
        <div className="rounded-lg bg-amber-300/10 p-3"><p className="text-[10px] text-amber-200">Long Unwinding</p><p className="mt-1 text-xl font-black text-white">{momentumSummary.unwinding}</p><p className="text-[9px] text-slate-400">Price ↓ · OI ↓</p></div>
      </div>
      {!momentumAlerts.length ? <p className="mt-3 rounded-lg bg-[#080f1b] p-3 text-xs text-amber-100">अजून prior-day comparison उपलब्ध नाही किंवा स्पष्ट चारपैकी कोणताही बदल आढळला नाही. किमान दोन वेगवेगळ्या दिवसांचे snapshots आवश्यक आहेत.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{['Expiry','Strike','Type','Signal','Price Δ %','OI Δ','Prior Date'].map(x=><th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-700">{momentumAlerts.slice(0,30).map(r=><tr key={r.expiry + r.strike + r.type}><td className="px-3 py-2 text-slate-300">{r.expiry}</td><td className="px-3 py-2 font-bold text-white">{fmt(r.strike)}</td><td className="px-3 py-2">{r.type}</td><td className={'px-3 py-2 font-bold '+(r.signalType==='bullish'?'text-emerald-200':'text-rose-200')}>{r.signal}</td><td className="px-3 py-2">{r.priceChangePct>=0?'+':''}{fmt(r.priceChangePct)}%</td><td className="px-3 py-2">{r.oiDelta>=0?'+':''}{fmt(r.oiDelta)}</td><td className="px-3 py-2 text-slate-400">{r.previousDate}</td></tr>)}</tbody></table></div>}
      <p className="mt-3 text-[10px] text-amber-200/80">Formula: Long Buildup = Price ↑ + OI ↑; Short Buildup = Price ↓ + OI ↑; Short Covering = Price ↑ + OI ↓; Long Unwinding = Price ↓ + OI ↓. हे historical snapshot comparison alerts आहेत, live alerts किंवा BUY/SELL आदेश नाहीत.</p>
    </section>

    <section className="rounded-2xl border border-fuchsia-300/20 bg-[#101326] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-white">OI Heatmap · All Eligible Expiries</h2><p className="mt-1 text-[11px] text-slate-400">प्रत्येक expiry मधील सर्वाधिक OI असलेले 12 strikes; रंगाची तीव्रता OI प्रमाणात.</p></div><div className="flex gap-3 text-[10px]"><span className="text-rose-200">■ CE Call OI</span><span className="text-emerald-200">■ PE Put OI</span></div></div>
      {!allExpiryAnalytics.length?<p className="mt-3 text-xs text-amber-200">Heatmap साठी eligible expiry data उपलब्ध नाही.</p>:<div className="mt-4 grid gap-3 xl:grid-cols-2">{allExpiryAnalytics.map(item=>{const maxOi=Math.max(1,...item.heatmap.flatMap(x=>[x.ceOi,x.peOi]));return <div key={item.expiry} className="rounded-xl border border-slate-700 bg-[#080f1b] p-3">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-black text-white">{item.expiry}</h3><span className="text-[10px] text-slate-400">Spot ₹{fmt(item.spot)}</span></div>
        <div className="grid grid-cols-[1fr_62px_1fr] gap-2 pb-2 text-[9px] font-bold uppercase tracking-wide text-slate-500"><span className="text-right">CE OI</span><span className="text-center">Strike</span><span>PE OI</span></div>
        {!item.heatmap.length?<p className="py-3 text-center text-[10px] text-slate-500">No OI data in spot ±600 range</p>:<div className="space-y-1">{item.heatmap.map(level=><div key={level.strike} className="grid grid-cols-[1fr_62px_1fr] items-center gap-2">
          <div className="relative flex h-7 items-center justify-end overflow-hidden rounded bg-rose-400/5 px-2"><div className="absolute inset-y-0 right-0 rounded bg-rose-500/35" style={{width:(level.ceOi/maxOi*100)+'%'}}/><span className="relative text-[10px] font-semibold text-rose-100">{fmt(level.ceOi)}</span></div>
          <div className={'rounded px-1 py-1 text-center text-[10px] font-black '+(Math.abs(level.strike-item.spot)<=50?'bg-cyan-300/15 text-cyan-100':'bg-slate-800 text-slate-200')}>{fmt(level.strike)}</div>
          <div className="relative flex h-7 items-center overflow-hidden rounded bg-emerald-400/5 px-2"><div className="absolute inset-y-0 left-0 rounded bg-emerald-500/35" style={{width:(level.peOi/maxOi*100)+'%'}}/><span className="relative text-[10px] font-semibold text-emerald-100">{fmt(level.peOi)}</span></div>
        </div>)}</div>}
      </div>})}</div>}
      <p className="mt-3 text-[10px] text-amber-200/80">हे OI concentration view आहे; जास्त CE/PE OI म्हणजे guaranteed resistance/support नाही. Heatmap फक्त spot ±600 मधील उपलब्ध strikes वापरतो.</p>
    </section>


    <div className="rounded-2xl border border-amber-300/20 bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-white">CSV Smart Alerts · EOD</h2><p className="mt-1 text-[11px] text-slate-400">Uploaded chain आणि saved snapshots मधून तयार झालेले alerts; live notifications नाहीत.</p></div><button onClick={exportDailyReport} disabled={!chain.length} className="rounded-lg bg-cyan-300 px-3 py-2 text-[11px] font-bold text-slate-950 disabled:opacity-40">Download EOD Report CSV</button></div>
      {scannerAlerts.length ? <ul className="mt-3 space-y-2">{scannerAlerts.map((a,i)=><li key={i} className="rounded-lg bg-[#080f1b] p-3 text-xs text-amber-100">• {a}</li>)}</ul> : <p className="mt-3 text-xs text-slate-400">सध्या configured thresholds नुसार alert नाही.</p>}
      <p className="mt-3 text-[10px] text-slate-500">Backtest (saved daily snapshots): {dailyAccuracy.total} samples · {dailyAccuracy.accuracy.toFixed(1)}% directional accuracy. हा ऐतिहासिक अभ्यास आहे; भविष्यातील accuracy ची हमी नाही.</p>
    </div>

    <div className="rounded-2xl border border-violet-300/20 bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-white">Options Strategy Builder · Expiry Payoff</h2><p className="mt-1 text-[11px] text-slate-400">Premiums uploaded CSV मधून; expiry payoff मध्ये charges, slippage आणि early exercise समाविष्ट नाहीत.</p></div><select value={strategyType} onChange={e=>setStrategyType(e.target.value as typeof strategyType)} className="rounded-lg border border-slate-600 bg-[#080f1b] px-3 py-2 text-xs text-white"><option value="BULL_CALL_SPREAD">Bull Call Spread</option><option value="BEAR_PUT_SPREAD">Bear Put Spread</option><option value="IRON_CONDOR">Iron Condor</option></select></div>
      <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-300">Wing width <input type="number" min="50" step="50" value={strategyWidth} onChange={e=>setStrategyWidth(Math.max(50,Number(e.target.value)||50))} className="w-24 rounded border border-slate-600 bg-[#080f1b] px-2 py-1.5 text-white"/> points</label>
      {strategyMetrics ? <><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Net debit / credit',`₹${fmt(strategyMetrics.netDebit*lotSize)}`],['Max profit in shown range',`₹${fmt(strategyMetrics.maxProfit)}`],['Max loss in shown range',`₹${fmt(strategyMetrics.maxLoss)}`],['Lot size',String(lotSize)]].map(([k,v])=><div key={k} className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">{k}</p><p className="mt-1 text-sm font-bold text-white">{v}</p></div>)}</div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-xs"><thead className="text-slate-400"><tr><th className="p-2">Leg</th><th className="p-2">Strike</th><th className="p-2">Side</th><th className="p-2">CSV premium</th></tr></thead><tbody>{strategyLegs.map((x,i)=><tr key={i} className="border-t border-slate-700"><td className="p-2">{x.type}</td><td className="p-2">{fmt(x.strike)}</td><td className="p-2">{x.side>0?'BUY':'SELL'}</td><td className="p-2">₹{fmt(x.premium)}</td></tr>)}</tbody></table></div><p className="mt-2 text-[10px] text-slate-500">Payoff range: BANKNIFTY Spot ±10% (21 scenarios). Max profit/loss हे फक्त या displayed range मधील आहेत; बाहेरील theoretical payoff वेगळा असू शकतो.</p></> : <p className="mt-3 text-xs text-amber-200">Strategy payoff साठी निवडलेल्या expiry मध्ये सर्व आवश्यक CE/PE strikes चे LTP CSV मध्ये असणे आवश्यक आहे.</p>}
    </div>

    <div className="rounded-2xl border border-sky-300/20 bg-[#0d1527] p-4 sm:p-5">
      <h2 className="text-sm font-bold text-white">Greeks Dashboard · Delta / Gamma / Vega</h2><p className="mt-1 text-[11px] text-slate-400">Black–Scholes estimates using uploaded IV, Spot, Strike, expiry and assumed 6.5% rate. IV नसल्यास Greeks दाखवले जात नाहीत.</p>
      {greeksRows.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="text-slate-400"><tr>{['Strike','Type','IV','Delta','Gamma','Vega / 1 IV pt','Volume'].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>{greeksRows.map(r=><tr key={r.strike+'-'+r.type} className="border-t border-slate-700"><td className="p-2 font-bold text-white">{fmt(r.strike)}</td><td className="p-2">{r.type}</td><td className="p-2">{fmt(r.iv||0)}%</td><td className="p-2">{r.delta!.toFixed(3)}</td><td className="p-2">{r.gamma!.toFixed(5)}</td><td className="p-2">{r.vega!.toFixed(3)}</td><td className="p-2">{fmt(r.volume)}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-xs text-amber-200">वैध IV असलेले contracts उपलब्ध नाहीत.</p>}
    </div>

    <div className="rounded-2xl border border-emerald-300/20 bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-white">Paper Trade Journal</h2><p className="mt-1 text-[11px] text-slate-400">CSV EOD premium वापरून paper trades track करा. हा local browser journal आहे; cloud sync नाही.</p></div><button onClick={exportPaperJournal} disabled={!paperTrades.length} className="rounded-lg border border-slate-600 px-3 py-2 text-[11px] text-white disabled:opacity-40">Export Journal CSV</button></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Open trades',String(paperStats.open)],['Closed trades',String(paperStats.closed)],['Realised paper P&L',`₹${fmt(paperStats.pnl)}`],['Win rate',paperStats.closed?`${(paperStats.wins/paperStats.closed*100).toFixed(1)}%`:'—']].map(([k,v])=><div key={k} className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">{k}</p><p className="mt-1 text-sm font-bold text-white">{v}</p></div>)}</div>
      {selectedTradeContract && <button onClick={()=>savePaperTrade(selectedTradeContract)} className="mt-3 rounded-lg bg-emerald-300 px-3 py-2 text-xs font-bold text-slate-950">Add selected {selectedTradeContract.strike} {selectedTradeContract.type} to Paper Journal</button>}
      {paperTrades.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="text-slate-400"><tr>{['Date','Contract','Entry','Qty','Status / P&L','Action'].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>{paperTrades.slice(0,30).map(t=><tr key={t.id} className="border-t border-slate-700"><td className="p-2">{t.date}</td><td className="p-2">{t.expiry} · {fmt(t.strike)} {t.type}</td><td className="p-2">₹{fmt(t.entry)}</td><td className="p-2">{t.qty}</td><td className="p-2">{t.status==='CLOSED'?<span className={(t.exit||0)>=t.entry?'text-emerald-300':'text-rose-300'}>₹{fmt(((t.exit||0)-t.entry)*t.qty)}</span>:'OPEN'}</td><td className="p-2">{t.status==='OPEN'?<span className="inline-flex gap-1"><input aria-label="Exit premium" value={paperExit[t.id]||''} onChange={e=>setPaperExit(old=>({...old,[t.id]:e.target.value}))} placeholder="Exit LTP" className="w-20 rounded bg-[#080f1b] px-2 py-1 text-white"/><button onClick={()=>closePaperTrade(t.id)} className="rounded bg-emerald-300 px-2 py-1 font-bold text-slate-950">Close</button></span>:'Closed'}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-xs text-slate-400">Selected trade contract निवडून paper journal मध्ये add करा.</p>}
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
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-white">Live Snapshot History · Selected expiry</h2><p className="mt-1 text-[11px] text-slate-400">FYERS Live refresh मधील प्रत्येक expiry snapshot browser history मध्ये जतन होतो; CSV backup upload देखील snapshot जोडतो.</p></div><span className="rounded-lg bg-[#080f1b] px-3 py-2 text-xs text-slate-300">{historyDays} days · {history.length} expiry snapshots</span></div>
      {latestSnapshot ? <div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Latest upload date</p><p className="mt-1 text-sm font-bold text-white">{latestSnapshot.date} · {selectedExpiry}</p></div><div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Latest Spot</p><p className="mt-1 text-sm font-bold text-white">₹{fmt(latestSnapshot.spot)}</p></div><div className="rounded-lg bg-[#080f1b] p-3"><p className="text-[10px] text-slate-400">Previous snapshot</p><p className="mt-1 text-sm font-bold text-white">{previousSnapshot?.date || 'अजून उपलब्ध नाही'}</p></div></div> : <p className="mt-3 text-xs text-amber-200">FYERS Live connect झाल्यावर snapshots आपोआप सुरू होतील; FYERS disconnect असल्यास CSV backup वापरता येईल.</p>}
      {previousSnapshot && <><p className="mt-3 text-[11px] text-slate-300">Previous snapshot पासून BANKNIFTY Spot बदल: <b className={latestSnapshot!.spot >= previousSnapshot.spot ? 'text-emerald-300' : 'text-rose-300'}>{latestSnapshot!.spot >= previousSnapshot.spot ? '+' : ''}{fmt(latestSnapshot!.spot - previousSnapshot.spot)} points</b>. प्रत्येक CE/PE contract स्वतंत्रपणे मागील snapshot च्या LTP आणि OI शी compare केला आहे. आजचा Change in OI आणि Volume हे NSE CSV मधून घेतले आहेत.</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{['Type','Strike','Price Δ %','OI Δ vs Prior','Today Chg OI','Today Volume','Price + OI Read','Confidence'].map(x => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]">{[...priceOiSignals].sort((a, b) => b.volume - a.volume).slice(0, 30).map(r => <tr key={r.expiry + r.strike + r.type}><td className="px-3 py-2 font-bold text-white">{r.type}</td><td className="px-3 py-2">{fmt(r.strike)}</td><td className="px-3 py-2">{r.priceChangePct === undefined ? '—' : (r.priceChangePct >= 0 ? '+' : '') + fmt(r.priceChangePct) + '%'}</td><td className="px-3 py-2">{r.oiDeltaSinceSnapshot === undefined ? '—' : fmt(r.oiDeltaSinceSnapshot)}</td><td className="px-3 py-2">{fmt(r.changeOi)}</td><td className="px-3 py-2">{fmt(r.volume)}</td><td className={'px-3 py-2 font-bold ' + (r.signalType === 'bullish' ? 'text-emerald-300' : r.signalType === 'bearish' ? 'text-rose-300' : 'text-amber-200')}>{r.signal}</td><td className="px-3 py-2 text-amber-200">{r.confidence}</td></tr>)}</tbody></table></div></>}
      {pcrHistory.length > 0 && <div className="mt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Selected expiry PCR history</p><div className="flex flex-wrap gap-2">{pcrHistory.map(p => <span key={p.date} className="rounded-lg bg-[#080f1b] px-3 py-2 text-[11px] text-slate-300">{p.date}: <b className="text-white">{p.pcr.toFixed(2)}</b></span>)}</div></div>}
    </div>


    <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
      <div className="mb-4 rounded-xl border border-[#263958] bg-[#080f1b] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-white">OI Positioning Signal</span><span className={'rounded-md px-2 py-1 text-[10px] font-black ' + (summary.bias === 'BULLISH' ? 'bg-emerald-300/15 text-emerald-200' : summary.bias === 'BEARISH' ? 'bg-rose-300/15 text-rose-200' : 'bg-amber-300/15 text-amber-200')}>{summary.bias}</span></div><p className="mt-2 text-[11px] leading-5 text-slate-300">{summary.bias === 'BULLISH' ? 'PCR 1.10 किंवा अधिक आणि PE OI Change हा CE पेक्षा जास्त: bullish positioning चा संकेत. CE खरेदीचा आदेश नाही.' : summary.bias === 'BEARISH' ? 'PCR 0.90 किंवा कमी आणि CE OI Change हा PE पेक्षा जास्त: bearish positioning चा संकेत. PE खरेदीचा आदेश नाही.' : 'PCR आणि OI Change मध्ये स्पष्ट एकतर्फी संकेत नाही. WAIT; चार्ट आणि किंमतीची पुष्टी पाहा.'}</p><p className="mt-1 text-[10px] text-slate-500">CE OI वाढ = संभाव्य resistance pressure · PE OI वाढ = संभाव्य support positioning. OI कमी होणे म्हणजे positions unwind होत असू शकतात.</p></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-white">Strike OI Scanner · Spot ± ₹600</h2><p className="mt-1 text-[11px] text-slate-400">Spot च्या 600 points वर/खाली आणि LTP ₹300 पर्यंतचे CE-PE contracts, OI, Change OI, volume आणि मागील snapshot वर आधारित 4-formula signals दाखवले आहेत. Signal strength साठी Premium बदल किमान 0.25%, OI बदल किमान 1% आणि Volume confirmation साठी त्याच CE/PE गटातील median volume benchmark वापरतो.</p></div><span className="rounded-lg bg-[#080f1b] px-3 py-2 text-xs text-slate-300">{summary.spot ? `₹${fmt(summary.spot - 600)} – ₹${fmt(summary.spot + 600)}` : 'Spot unavailable'}</span></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-rose-300/20 bg-rose-300/5 p-3"><p className="text-[10px] text-rose-200">Highest CE OI · potential resistance</p><p className="mt-1 text-lg font-black text-white">{maxCe ? fmt(maxCe.strike) : '—'}</p><p className="text-[11px] text-slate-400">{maxCe ? `OI ${fmt(maxCe.ceOi)} · Change ${fmt(maxCe.ceChange)}` : 'Range मध्ये data नाही'}</p></div>
        <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-3"><p className="text-[10px] text-emerald-200">Highest PE OI · potential support</p><p className="mt-1 text-lg font-black text-white">{maxPe ? fmt(maxPe.strike) : '—'}</p><p className="text-[11px] text-slate-400">{maxPe ? `OI ${fmt(maxPe.peOi)} · Change ${fmt(maxPe.peChange)}` : 'Range मध्ये data नाही'}</p></div>
      </div>
      {strikeStats.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{['Strike','CE Premium','CE OI','CE Chg OI','CE Volume','CE Signal / Strength','PE Premium','PE OI','PE Chg OI','PE Volume','PE Signal / Strength'].map(x => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]">{classifiedStrikes.map(s => { const ce = priceOiSignals.find(r => r.strike === s.strike && r.type === 'CE'); const pe = priceOiSignals.find(r => r.strike === s.strike && r.type === 'PE'); const signalClass = (v?: string) => v === 'bullish' ? 'text-emerald-300' : v === 'bearish' ? 'text-rose-300' : 'text-amber-200'; return <tr key={s.strike}><td className="px-3 py-2 font-bold text-white">{fmt(s.strike)}</td><td className="px-3 py-2">₹{ce ? fmt(ce.ltp) : '—'}</td><td className="px-3 py-2">{fmt(s.ceOi)}</td><td className={'px-3 py-2 ' + (s.ceChange > 0 ? 'text-rose-300' : s.ceChange < 0 ? 'text-emerald-300' : 'text-slate-400')}>{fmt(s.ceChange)}</td><td className="px-3 py-2">{fmt(s.ceVol)}</td><td className={'px-3 py-2 text-[10px] font-bold ' + signalClass(ce?.signalType)}>{ce ? ce.signal : '—'}{ce?.priceChangePct !== undefined ? <span className="block font-normal text-slate-400">Premium {ce.priceChangePct >= 0 ? '+' : ''}{ce.priceChangePct.toFixed(2)}% · OI Δ {fmt(ce.oiDeltaSinceSnapshot || 0)} ({(ce.oiChangePct || 0).toFixed(2)}%)</span> : null}<span className={'block mt-1 text-[10px] ' + (ce?.strength === 'STRONG' ? 'text-emerald-300' : ce?.strength === 'MEDIUM' ? 'text-sky-300' : 'text-amber-200')}>{ce ? ce.strength + ' · ' + ce.strengthScore + '/100' : '—'}</span><span className="block font-normal text-slate-500">{ce ? ce.confidence + ' · Vol ' + fmt(ce.volume) + ' / Median ' + fmt(ce.medianVolume) : ''}</span></td><td className="px-3 py-2">₹{pe ? fmt(pe.ltp) : '—'}</td><td className="px-3 py-2">{fmt(s.peOi)}</td><td className={'px-3 py-2 ' + (s.peChange > 0 ? 'text-emerald-300' : s.peChange < 0 ? 'text-rose-300' : 'text-slate-400')}>{fmt(s.peChange)}</td><td className="px-3 py-2">{fmt(s.peVol)}</td><td className={'px-3 py-2 text-[10px] font-bold ' + signalClass(pe?.signalType)}>{pe ? pe.signal : '—'}{pe?.priceChangePct !== undefined ? <span className="block font-normal text-slate-400">Premium {pe.priceChangePct >= 0 ? '+' : ''}{pe.priceChangePct.toFixed(2)}% · OI Δ {fmt(pe.oiDeltaSinceSnapshot || 0)} ({(pe.oiChangePct || 0).toFixed(2)}%)</span> : null}<span className={'block mt-1 text-[10px] ' + (pe?.strength === 'STRONG' ? 'text-emerald-300' : pe?.strength === 'MEDIUM' ? 'text-sky-300' : 'text-amber-200')}>{pe ? pe.strength + ' · ' + pe.strengthScore + '/100' : '—'}</span><span className="block font-normal text-slate-500">{pe ? pe.confidence + ' · Vol ' + fmt(pe.volume) + ' / Median ' + fmt(pe.medianVolume) : ''}</span></td></tr>; })}</tbody></table></div> : <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs text-amber-100">या expiry साठी Spot ±600 range मधील पुरेसे strike rows नाहीत. पूर्ण Option Chain CSV upload करा; single-strike CSV ने इतर strikes शोधता येत नाहीत.</div>}
    </div>

    <div className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5">
    <section className="rounded-2xl border border-cyan-300/20 bg-[#0d1527] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-white">EOD Analysis · Tomorrow Trade Planner</h2><p className="mt-1 text-[11px] text-slate-400">फक्त upload केलेल्या market-close CSV वर आधारित. Live feed वापरलेला नाही.</p></div><span className="rounded-lg bg-cyan-300/10 px-3 py-2 text-[10px] font-bold text-cyan-200">EOD · 1-day Theta estimate</span></div>
      <p className="mt-2 text-[10px] leading-5 text-slate-500">Theta हा Black-Scholes estimate आहे: CSV IV, Spot, Strike, Expiry आणि 6.5% गृहीत interest rate वापरून पुढील 1 calendar day साठी. IV नसल्यास estimate दाखवला जाणार नाही. प्रत्यक्ष premium बदल market move, IV आणि weekend/holiday मुळे वेगळा असू शकतो.</p>
      {(() => {
        const ranked = rangeRows.map(r => ({ ...r, theta: estimateDailyTheta(r) })).filter(r => r.theta && r.ltp > 0).sort((a, b) => (a.theta!.pct - b.theta!.pct) || (b.volume - a.volume)).slice(0, 12);
        return ranked.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{['Strike','Type','EOD LTP','IV','Est. Theta / day','Est. Decay %','Decay Risk','OI / Volume'].map(x => <th key={x} className="px-3 py-2">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#1e2e4f]">{ranked.map(r => { const risk = r.theta!.pct >= 3 ? 'HIGH' : r.theta!.pct >= 1.5 ? 'MEDIUM' : 'LOW'; return <tr key={r.expiry + r.strike + r.type}><td className="px-3 py-2 font-bold text-white">{fmt(r.strike)}</td><td className="px-3 py-2">{r.type}</td><td className="px-3 py-2">₹{fmt(r.ltp)}</td><td className="px-3 py-2">{r.theta!.iv.toFixed(2)}%</td><td className="px-3 py-2 text-amber-200">₹{fmt(r.theta!.daily)}</td><td className="px-3 py-2">{r.theta!.pct.toFixed(2)}%</td><td className={'px-3 py-2 font-bold ' + (risk === 'HIGH' ? 'text-rose-300' : risk === 'MEDIUM' ? 'text-amber-200' : 'text-emerald-300')}>{risk}</td><td className="px-3 py-2">{fmt(r.oi)} / {fmt(r.volume)}</td></tr>; })}</tbody></table></div> : <p className="mt-3 rounded-lg bg-[#080f1b] p-3 text-xs text-amber-200">या expiry च्या CSV मध्ये वैध IV उपलब्ध नाही किंवा expiry data अपुरा आहे. IV असलेला NSE EOD Option Chain CSV upload करा.</p>;
      })()}
    </section>

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
        <p className="mt-1 text-[10px] text-slate-500">इथे capital मध्ये परवडणारे आणि प्रति lot SL risk ₹1,500 च्या आत असलेले strikes दाखवले आहेत. Radar आणि trade selection मध्ये फक्त ₹300 पर्यंत LTP असलेले contracts दाखवले जातात.</p>
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
      })() : selectedTradeContract ? <p className="mt-3 text-xs text-rose-300">SL 1–80%, Target 1–200% आणि Lot size 1 पेक्षा जास्त ठेवा.</p> : <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs text-amber-100">{tradeContracts.length ? 'तुझ्या capital आणि ₹1,500 risk cap मध्ये बसणारा CE किंवा PE contract वर निवडा.' : rows.length ? 'या expiry मध्ये Spot ± ₹600 range आणि ₹300 पर्यंत LTP असलेले contracts उपलब्ध नाहीत. दुसरी expiry निवडा किंवा पूर्ण Option Chain CSV upload करा.' : 'सुरुवात करण्यासाठी option-chain CSV upload कर.'}</div>}
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-[#080f1b] p-3 text-[11px] leading-5 text-slate-400"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> हे फक्त indicative गणित आहे; WAIT म्हणजे directional confirmation नाही. Live premium feed, bid-ask spread, IV/Greeks आणि liquidity तपासल्याशिवाय प्रत्यक्ष ट्रेड करू नका. Option buying मध्ये premium पूर्ण गमावण्याचा धोका असतो.</div>
    </div>
    <div className="flex items-center justify-between text-[10px] text-slate-500"><span><CalendarClock className="mr-1 inline h-3 w-3" /> Current data cloud + browser · History last 30 daily snapshots saved in Cloudflare D1</span><button onClick={clearData} className="underline hover:text-white">Clear option data</button></div>
  </div>;
};
