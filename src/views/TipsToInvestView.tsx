import React, { useEffect, useMemo, useState } from 'react';
import { loadPennyStockHistory, savePennyStockHistory } from '../services/cloudScannerStorage';
import { Wallet, Upload, Plus, Trash2, ShieldAlert, Search, TrendingUp } from 'lucide-react';
// @ts-ignore Vite supports JSON module imports.
import fundamentalsData from '../data/pennyFundamentals.json';

const ETF_SYMBOLS = new Set<string>(["MOBANK10","ABSLPSE","INTERNET","NV20","BFSI","INSUREIETF","LTGILTBEES","MID150","NIF100IETF","NIFTYQLITY","AONENIFTY","LOWVOL1","LOWVOLIETF","TOP15IETF","MOMMIDCAP","TOP20","GOLDCASE","ALPL30IETF","BANK10BETF","GOLDADD","MAHKTECH","MOMETAL","MONIFTY100","PHARMABEES","SILVERADD","TOP100CASE","AONEGOLD","AONETOTAL","BSLNIFTY","HDFCNIF100","MID150CASE","QUAL30IETF","GROWWMETAL","GROWWNET","GROWWRAIL","GROWWRLTY","NIFTYBEES","BANKBEES","ITBEES","JUNIORBEES","PSUBNKBEES","SETFNIF50","MID150BEES","NIFTYIETF","CPSEETF","NIFTYETF","AUTOBEES","NEXT50IETF","MIDCAPETF","SETFNIFBK","NIFTY1","HDFCNIFTY","SETFNN50","NEXT50","NIFTYBETA","HDFCNIFBAN","HDFCMID150","ABSLBANETF","BANKETF","NIFTYADD","PSUBANKADD","NIFTYAXIS","INFRABEES","NIFTYBETF","BANKADD","HDFCNIFIT","SBIETFIT","MOM50","DIVOPPBEES","TECH","BANKBETF","QNIFTY","BNKETFAXIS","ABSLNN50ET","NETF","IDFNIFTYET","NIF100BEES","HDFCPSUBK","ITETF","NEXT50BETA","NV20BEES"]);
const isEtfSymbol = (symbol: string) => {
  const value = (symbol || '').trim().toUpperCase();
  return ETF_SYMBOLS.has(value) || /(IETF|BEES|ETF|CASE)$/.test(value);
};
type Row = { symbol: string; series: string; date: string; close: number; volume: number; deliveryPct?: number; turnover?: number };
type TipEntry = { id: string; date: string; amount: number; note: string };
type BuyEntry = { id: string; date: string; symbol: string; quantity: number; price: number; total: number };
type Fundamental = { symbol: string; company: string; sector: string; period: string; revenue: number | null; operatingProfit: number | null; opm: number | null; netProfit: number | null; eps: number | null; salesGrowthYoY: number | null; profitGrowthYoY: number | null; previousPeriod: string | null };
const fundamentalsBySymbol = new Map<string, Fundamental>(((fundamentalsData as { companies: Fundamental[] }).companies || []).map(item => [item.symbol.toUpperCase(), item]));
const qualityFor = (symbol: string) => {
  const f = fundamentalsBySymbol.get(symbol.toUpperCase());
  if (!f) return { label: 'NO FUNDAMENTAL DATA', score: null as number | null, detail: 'या symbol साठी consolidated financial data उपलब्ध नाही.' };
  if ([f.revenue, f.operatingProfit, f.opm, f.netProfit, f.eps].some(value => value == null)) {
    return { label: 'DATA INCOMPLETE', score: null as number | null, detail: 'Revenue, operating profit, OPM, net profit किंवा EPS पैकी काही data उपलब्ध नाही.' };
  }
  let score = 0;
  score += f.revenue! > 0 ? 10 : 0;
  score += f.operatingProfit! > 0 ? 20 : 0;
  score += f.opm! >= 15 ? 15 : f.opm! >= 8 ? 10 : f.opm! > 0 ? 5 : 0;
  score += f.netProfit! > 0 ? 20 : 0;
  score += f.eps! > 0 ? 10 : 0;
  score += f.salesGrowthYoY == null ? 0 : f.salesGrowthYoY >= 10 ? 10 : f.salesGrowthYoY >= 0 ? 7 : 0;
  score += f.profitGrowthYoY == null ? 0 : f.profitGrowthYoY >= 10 ? 15 : f.profitGrowthYoY >= 0 ? 10 : 0;
  const label = score >= 75 ? 'STRONG FINANCIALS' : score >= 55 ? 'MODERATE FINANCIALS' : 'WEAK FINANCIALS';
  const growth = (value: number | null) => value == null ? 'n/a' : (value > 0 ? '+' : '') + value.toFixed(1) + '%';
  return { label, score, detail: f.period + ' · Sales ₹' + f.revenue!.toLocaleString('en-IN') + ' Cr · OPM ' + f.opm!.toFixed(1) + '% · PAT ₹' + f.netProfit!.toLocaleString('en-IN') + ' Cr · Sales YoY ' + growth(f.salesGrowthYoY) + ' · Profit YoY ' + growth(f.profitGrowthYoY) };
};
const WALLET_KEY = 'moti_tips_invest_wallet_v1';
const BUY_KEY = 'moti_tips_invest_buys_v1';
const today = () => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const displayDate = (value: string) => { const [y,m,d] = value.split('-'); return y && m && d ? d+'-'+m+'-'+y : value; };
const normalizeDateKey = (value: string) => {
  const v = (value || '').trim();
  if (!v) return '';
  const iso = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return iso[1] + '-' + iso[2].padStart(2, '0') + '-' + iso[3].padStart(2, '0');
  const dmy = v.match(/^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ,](\d{4})/);
  if (dmy) {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const month = /^\d+$/.test(dmy[2]) ? Number(dmy[2]) : months.indexOf(dmy[2].toLowerCase()) + 1;
    if (month >= 1 && month <= 12) return dmy[3] + '-' + String(month).padStart(2, '0') + '-' + dmy[1].padStart(2, '0');
  }
  return v.toLowerCase();
};

const num = (v: string | undefined) => {
  if (!v || !v.trim() || v.trim() === '-') return undefined;
  const n = Number(v.replace(/[,₹%\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const csvLine = (line: string, delimiter = ',') => {
  const out: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === delimiter && !quoted) { out.push(cell.trim()); cell = ''; }
    else cell += c;
  }
  out.push(cell.trim()); return out;
};
const extractCsvFromZip = async (file: File, kind: 'bhavcopy' | 'delivery' = 'bhavcopy'): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  let eocd = -1;
  for (let i = Math.max(0, bytes.length - 65557); i <= bytes.length - 22; i++) {
    if (view.getUint32(i, true) === 0x06054b50) eocd = i;
  }
  if (eocd < 0) throw new Error('ZIP फाइल योग्य नाही किंवा corrupt आहे.');
  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const candidates: { name: string; text: string }[] = [];
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!name.toLowerCase().endsWith('.csv') || name.endsWith('/')) continue;
    if (view.getUint32(localOffset, true) !== 0x04034b50) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(start, start + compressedSize);
    let content: Uint8Array;
    if (method === 0) content = compressed;
    else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('या browser मध्ये ZIP extract support नाही. ZIP Extract करून CSV upload कर.');
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
      content = new Uint8Array(await new Response(stream).arrayBuffer());
    } else continue;
    candidates.push({ name, text: decoder.decode(content) });
  }
  if (!candidates.length) throw new Error('ZIP मध्ये CSV फाइल सापडली नाही.');
  const preferred = candidates.sort((a, b) => {
    const score = (s: string) => /bhav|cm-|equity/i.test(s) ? 1 : 0;
    return score(b.name) - score(a.name);
  });
  let lastError: unknown;
  for (const candidate of preferred) {
    try {
      const parsed = kind === 'bhavcopy' ? parseBhavcopy(candidate.text) : parseDeliveryReport(candidate.text);
      if (parsed.length) return candidate.text;
      lastError = new Error(candidate.name + ' मध्ये ₹1–₹50 EQ शेअर्स आढळले नाहीत.');
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error('ZIP मधील CSV वाचता आली नाही.');
};

const parseBhavcopy = (raw: string): Row[] => {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error('CSV मध्ये Header आणि data rows असणे आवश्यक आहे.');
  const delimiters = [',', ';', '\t', '|'];
  const normalize = (value: string) => value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const symbolNames = ['symbol', 'tckrsymb'];
  const closeNames = ['closeprice', 'close', 'lastprice', 'clspric', 'lastpric'];
  const volumeNames = ['ttltrdqnty', 'ttltrdqty', 'volume', 'totaltradedquantity', 'ttltradgvol'];
  const candidates = lines.slice(0, 20).map((line, index) => {
    const parsed = delimiters.map(delimiter => ({
      delimiter,
      headers: csvLine(line, delimiter).map(normalize)
    }));
    const best = parsed.sort((a, b) => {
      const score = (headers: string[]) =>
        Number(headers.some(h => symbolNames.includes(h))) +
        Number(headers.some(h => closeNames.includes(h))) +
        Number(headers.some(h => volumeNames.includes(h)));
      return score(b.headers) - score(a.headers) || b.headers.length - a.headers.length;
    })[0];
    const score =
      Number(best.headers.some(h => symbolNames.includes(h))) +
      Number(best.headers.some(h => closeNames.includes(h))) +
      Number(best.headers.some(h => volumeNames.includes(h)));
    return { index, ...best, score };
  });
  const header = candidates.find(x => x.score === 3);
  if (!header) {
    const best = candidates.sort((a, b) => b.score - a.score || b.headers.length - a.headers.length)[0];
    throw new Error('Bhavcopy header match झाला नाही. File headers: ' + best.headers.slice(0, 16).join(', ') + '. SYMBOL, CLOSE_PRICE आणि TTL_TRD_QNTY असलेली CM Equity Bhavcopy CSV निवड.');
  }
  const headers = header.headers;
  const delimiter = header.delimiter;
  const ix = (names: string[]) => headers.findIndex(h => names.includes(h));
  const symbol = ix(symbolNames);
  const series = ix(['series', 'sctysrs']);
  const date = ix(['date1', 'date', 'traddt', 'bizdt']);
  const close = ix(closeNames);
  const volume = ix(volumeNames);
  const delivery = ix(['delivper', 'deliverypercentage', 'deliverypct', 'dlvrypct']);
  const turnover = ix(['turnoverlacs', 'turnover', 'ttltrfval', 'tottrdval', 'ttltrdval']);
  return lines.slice(header.index + 1).map(line => {
    const row = csvLine(line, delimiter);
    return {
      symbol: row[symbol]?.trim().toUpperCase(),
      series: (series >= 0 ? row[series] : 'EQ')?.trim().toUpperCase() || 'EQ',
      date: date >= 0 ? row[date] : '',
      close: num(row[close]) || 0,
      volume: num(row[volume]) || 0,
      deliveryPct: delivery >= 0 ? num(row[delivery]) : undefined,
      turnover: turnover >= 0 ? (['ttltrfval', 'tottrdval', 'ttltrdval'].includes(headers[turnover]) ? (num(row[turnover]) || 0) / 100000 : num(row[turnover])) : undefined
    };
  }).filter(r => r.symbol && r.series === 'EQ' && !isEtfSymbol(r.symbol) && r.close >= 5 && r.close <= 30 && r.volume > 0);
};

const parseDeliveryReport = (raw: string): Map<string, number> => {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  const delimiters = [',', ';', '\t', '|'];
  const normalize = (v: string) => v.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const symbolNames = ['symbol', 'tckrsymb'];
  const deliveryNames = ['delivper', 'deliverypercentage', 'deliverypct', 'dlvrypct'];
  let header: { index: number; delimiter: string; headers: string[] } | undefined;
  for (let index = 0; index < Math.min(20, lines.length); index++) {
    for (const delimiter of delimiters) {
      const headers = csvLine(lines[index], delimiter).map(normalize);
      if (headers.some(h => symbolNames.includes(h)) && headers.some(h => deliveryNames.includes(h))) {
        header = { index, delimiter, headers }; break;
      }
    }
    if (header) break;
  }
  if (!header) throw new Error('Security-wise Delivery CSV मध्ये SYMBOL आणि DELIV_PER headers सापडले नाहीत.');
  const symbolIx = header.headers.findIndex(h => symbolNames.includes(h));
  const seriesIx = header.headers.findIndex(h => ['series', 'sctysrs'].includes(h));
  const deliveryIx = header.headers.findIndex(h => deliveryNames.includes(h));
  const dateIx = header.headers.findIndex(h => ['date1', 'date', 'traddt', 'bizdt'].includes(h));
  const result = new Map<string, number>();
  for (const line of lines.slice(header.index + 1)) {
    const cells = csvLine(line, header.delimiter);
    const symbol = cells[symbolIx]?.trim().toUpperCase();
    const series = (seriesIx >= 0 ? cells[seriesIx] : 'EQ')?.trim().toUpperCase() || 'EQ';
    const date = dateIx >= 0 ? normalizeDateKey(cells[dateIx] || '') : '';
    const pct = num(cells[deliveryIx]);
    if (symbol && series === 'EQ' && !isEtfSymbol(symbol) && pct != null) { result.set(symbol + '|' + date, pct); }
  }
  if (!result.size) throw new Error('Delivery file मध्ये valid EQ delivery records सापडले नाहीत.');
  return result;
};
export const TipsToInvestView: React.FC = () => {
  const [tips, setTips] = useState<TipEntry[]>(() => { try { return JSON.parse(localStorage.getItem(WALLET_KEY) || '[]'); } catch { return []; } });
  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  const [bhavRows, setBhavRows] = useState<Row[] | null>(null); const [deliveryRows, setDeliveryRows] = useState<Map<string, number> | null>(null);
  const [bhavFileName, setBhavFileName] = useState(''); const [deliveryFileName, setDeliveryFileName] = useState('');
  const [buys, setBuys] = useState<BuyEntry[]>(() => { try { return JSON.parse(localStorage.getItem(BUY_KEY) || '[]'); } catch { return []; } });
  const [buySymbol, setBuySymbol] = useState(''); const [buyQuantity, setBuyQuantity] = useState(''); const [buyPrice, setBuyPrice] = useState(''); const [buyDate, setBuyDate] = useState(today());
  const [amount, setAmount] = useState(''); const [note, setNote] = useState('Zomato Customer Tips');
  const [query, setQuery] = useState(''); const [message, setMessage] = useState('');
  const totalTips = tips.reduce((s, x) => s + x.amount, 0);
  const totalBuys = buys.reduce((s, x) => s + x.total, 0);
  const availableBalance = totalTips - totalBuys;
  const marketView = (symbol: string) => {
    const series = history.filter(r => r.symbol === symbol).sort((a, b) => normalizeDateKey(a.date).localeCompare(normalizeDateKey(b.date)));
    if (series.length < 3) return 'HISTORY NEEDED';
    const recent = series.slice(-3);
    if (recent.some(r => r.deliveryPct == null)) return 'HISTORY NEEDED';
    const avgDelivery = recent.reduce((s, r) => s + (r.deliveryPct as number), 0) / recent.length;
    const rising = recent[2].close > recent[0].close;
    if (avgDelivery >= 50 && rising) return 'POSITIVE TREND';
    if (avgDelivery < 25 && !rising) return 'WEAK TREND';
    return 'MIXED TREND';
  };
  const ranked = useMemo(() => rows.map(r => {
    const activityScore = Math.round(Math.min(80,
      (r.deliveryPct == null ? 0 : Math.min(25, r.deliveryPct / 4)) +
      Math.min(35, Math.log10(Math.max(1, r.volume)) * 7) +
      Math.min(20, Math.log10(Math.max(1, (r.turnover || 0) * 100000)) * 3)
    ));
    const fundamental = qualityFor(r.symbol);
    const trend = marketView(r.symbol);
    const trendScore = trend === 'POSITIVE TREND' ? 100 : trend === 'MIXED TREND' ? 55 : trend === 'WEAK TREND' ? 15 : null;
    const components = [
      ...(fundamental.score == null ? [] : [{ value: fundamental.score, weight: 0.5 }]),
      ...(trendScore == null ? [] : [{ value: trendScore, weight: 0.3 }]),
      { value: Math.round(activityScore / 80 * 100), weight: 0.2 }
    ];
    const weight = components.reduce((sum, item) => sum + item.weight, 0);
    const lowVolume = r.volume < 100000 || (r.turnover != null && r.turnover < 10);
    const rawCombinedScore = components.reduce((sum, item) => sum + item.value * item.weight, 0) / weight;
    // Thinly traded shares receive a liquidity penalty so activity spikes cannot dominate the ranking.
    const combinedScore = Math.max(0, Math.round(rawCombinedScore - (lowVolume ? 10 : 0)));
    const rating = fundamental.score == null || trendScore == null ? 'INSUFFICIENT DATA'
      : combinedScore >= 75 && !lowVolume ? 'STRONG'
      : combinedScore >= 55 ? (lowVolume ? 'MEDIUM · LOW LIQUIDITY' : 'MEDIUM')
      : 'WEAK';
    const hasCompleteData = fundamental.score != null && trendScore != null;
    return { ...r, activityScore, fundamental, trend, combinedScore, rating, lowVolume, hasCompleteData };
  }).filter(r => !query || r.symbol.includes(query.toUpperCase()))
    .sort((a,b) => Number(b.hasCompleteData)-Number(a.hasCompleteData) || b.combinedScore-a.combinedScore || b.activityScore-a.activityScore), [rows, query, history]);
  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      try {
        const saved = await loadPennyStockHistory<Row>();
        let legacy: Row[] = [];
        try {
          const oldLatest = JSON.parse(localStorage.getItem('moti_penny_bhavcopy_v1') || '[]');
          const oldHistory = JSON.parse(localStorage.getItem('moti_penny_bhavcopy_history_v1') || '[]');
          legacy = [...(Array.isArray(oldHistory) ? oldHistory : []), ...(Array.isArray(oldLatest) ? oldLatest : [])];
        } catch { /* Ignore malformed browser cache; D1 remains authoritative. */ }
        const merged = new Map<string, Row>();
        [...saved, ...legacy].forEach(row => {
          const normalized = { ...row, date: normalizeDateKey(row.date) };
          if (normalized.date && normalized.symbol && !isEtfSymbol(normalized.symbol)) merged.set(normalized.symbol + '|' + normalized.date, normalized);
        });
        const allRows = Array.from(merged.values());
        const legacyRows = allRows.filter(row => !saved.some(item =>
          item.symbol === row.symbol && normalizeDateKey(item.date) === normalizeDateKey(row.date)
        ));
        if (legacyRows.length) await savePennyStockHistory(legacyRows);
        if (!active) return;
        setHistory(allRows);
        const latestDate = allRows.reduce((latest, row) => {
          const date = normalizeDateKey(row.date);
          return date > latest ? date : latest;
        }, '');
        if (latestDate) setRows(allRows.filter(row => normalizeDateKey(row.date) === latestDate));
        if (legacyRows.length) {
          localStorage.removeItem('moti_penny_bhavcopy_v1');
          localStorage.removeItem('moti_penny_bhavcopy_history_v1');
        }
      } catch (error) {
        if (active) setMessage('D1 history load failed: ' + (error instanceof Error ? error.message : 'Cloud storage error'));
      }
    };
    void loadHistory();
    return () => { active = false; };
  }, []);

  const saveDailyHistory = async (incoming: Row[]) => {
    const normalized = incoming.map(row => ({ ...row, date: normalizeDateKey(row.date) }));
    await savePennyStockHistory(normalized);
    const keyed = new Map<string, Row>();
    [...history, ...normalized].forEach(row => keyed.set(row.symbol + '|' + normalizeDateKey(row.date), row));
    const next = Array.from(keyed.values()).sort((a, b) => normalizeDateKey(a.date).localeCompare(normalizeDateKey(b.date)) || a.symbol.localeCompare(b.symbol));
    setHistory(next);
  };
  const historyDays = new Set(history.map(r => normalizeDateKey(r.date)).filter(Boolean)).size;
  const persistTips = (next: TipEntry[]) => { setTips(next); localStorage.setItem(WALLET_KEY, JSON.stringify(next)); };
  const addTips = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setMessage('योग्य Tips रक्कम टाक.'); return; }
    persistTips([{ id: String(Date.now()), date: today(), amount: value, note }, ...tips]);
    setAmount(''); setMessage('Tips Wallet मध्ये जमा झाले.');
  };
  const readCsv = async (file: File, kind: 'bhavcopy' | 'delivery') => {
    const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
    return isZip ? extractCsvFromZip(file, kind) : file.text();
  };
  const uploadBhavcopy = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseBhavcopy(await readCsv(file, 'bhavcopy'));
      if (!parsed.length) throw new Error('CM Bhavcopy मध्ये ₹5–₹30 मधील EQ शेअर्स आढळले नाहीत.');
      setBhavRows(parsed); setBhavFileName(file.name);
      if (deliveryRows) {
        const matchedCount = parsed.filter(r => deliveryRows.has(r.symbol + '|' + normalizeDateKey(r.date))).length;
        const merged = parsed.map(r => ({ ...r, deliveryPct: deliveryRows.get(r.symbol + '|' + normalizeDateKey(r.date)) ?? r.deliveryPct }));
        setRows(merged); await saveDailyHistory(merged);
        setMessage('Import: ' + merged.length + ' EQ शेअर्स · Delivery matched ' + matchedCount + ' · unmatched ' + (merged.length - matchedCount) + '.');
      } else setMessage('CM Bhavcopy upload झाली. आता Security-wise Delivery file upload कर.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'CM Bhavcopy वाचता आली नाही.'); }
  };
  const uploadDelivery = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseDeliveryReport(await readCsv(file, 'delivery'));
      setDeliveryRows(parsed); setDeliveryFileName(file.name);
      if (bhavRows) {
        const matchedCount = bhavRows.filter(r => parsed.has(r.symbol + '|' + normalizeDateKey(r.date))).length;
        const merged = bhavRows.map(r => ({ ...r, deliveryPct: parsed.get(r.symbol + '|' + normalizeDateKey(r.date)) ?? r.deliveryPct }));
        setRows(merged); await saveDailyHistory(merged);
        setMessage('Import: ' + merged.length + ' EQ शेअर्स · Delivery matched ' + matchedCount + ' · unmatched ' + (merged.length - matchedCount) + '.');
      } else setMessage('Security-wise Delivery file upload झाली. आता CM Equity Bhavcopy upload कर.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Delivery file वाचता आली नाही.'); }
  };
  const removeTips = (id: string) => persistTips(tips.filter(x => x.id !== id));
  const addBuy = () => {
    const quantity = Number(buyQuantity); const price = Number(buyPrice); const total = quantity * price;
    if (!buySymbol.trim() || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0 || !buyDate) { setMessage('Buy साठी Symbol, योग्य Quantity, Price आणि Date भरा.'); return; }
    if (total > availableBalance) { setMessage('Wallet balance अपुरा आहे. उपलब्ध: ₹' + availableBalance.toLocaleString('en-IN')); return; }
    const next = [{ id: String(Date.now()), date: buyDate, symbol: buySymbol.trim().toUpperCase(), quantity, price, total }, ...buys];
    setBuys(next); localStorage.setItem(BUY_KEY, JSON.stringify(next));
    setBuySymbol(''); setBuyQuantity(''); setBuyPrice(''); setBuyDate(today()); setMessage('Buy entry date सहित save झाली आणि Wallet balance कमी झाला.');
  };
  const removeBuy = (id: string) => { const next = buys.filter(x => x.id !== id); setBuys(next); localStorage.setItem(BUY_KEY, JSON.stringify(next)); };
  return <div className="mx-auto max-w-6xl space-y-5 text-slate-100">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">MOTI · INVESTING</p><h1 className="mt-1 text-2xl font-black">Tips-to-Invest Penny Scanner</h1><p className="mt-1 text-sm text-slate-400">Zomato Tips मधून जमा झालेली रक्कम आणि कमी किमतीच्या शेअर्सची प्राथमिक छाननी</p></div><div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">Research only · Buy बंधनकारक नाही</div></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-[#0b1421] p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><Wallet className="h-4 w-4"/> Tips Wallet</div><p className="mt-2 text-3xl font-black text-emerald-300">₹{totalTips.toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-slate-500">{tips.length} जमा नोंदी</p></div>
      <div className="rounded-2xl border border-white/10 bg-[#0b1421] p-4"><p className="text-xs text-slate-400">Available to invest</p><p className="mt-2 text-3xl font-black">₹{availableBalance.toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-slate-500">एकूण जमा ₹{totalTips.toLocaleString('en-IN')} · Buy ₹{totalBuys.toLocaleString('en-IN')}</p></div>
      <div className="rounded-2xl border border-white/10 bg-[#0b1421] p-4"><p className="text-xs text-slate-400">Scanner universe</p><p className="mt-2 text-3xl font-black">{rows.length}</p><p className="mt-1 text-xs text-slate-500">₹5–₹30 EQ · ETF excluded · Low volume flagged</p></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-2xl border border-white/10 bg-[#0b1421] p-4 space-y-3"><h2 className="font-bold">Add weekly Tips</h2><label className="block text-xs text-slate-400">रक्कम (₹)</label><input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="1" placeholder="उदा. 250" className="w-full rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-sm outline-none focus:border-emerald-400"/><label className="block text-xs text-slate-400">Note</label><input value={note} onChange={e=>setNote(e.target.value)} className="w-full rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-sm outline-none focus:border-emerald-400"/><button onClick={addTips} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-bold text-slate-950"><Plus className="h-4 w-4"/> Add to Wallet</button><div className="max-h-48 space-y-2 overflow-auto">{tips.map(t=><div key={t.id} className="flex items-center justify-between rounded-lg bg-white/[0.04] p-2 text-xs"><span><b>₹{t.amount}</b><span className="ml-2 text-slate-400">{displayDate(t.date)} · {t.note}</span></span><button onClick={()=>removeTips(t.id)} title="Delete entry" className="text-slate-500 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5"/></button></div>)}</div><div className="border-t border-white/10 pt-3 space-y-2"><h3 className="text-sm font-bold">Buy Entry</h3><div className="grid grid-cols-2 gap-2"><input value={buySymbol} onChange={e=>setBuySymbol(e.target.value)} placeholder="Symbol (उदा. ABC)" className="rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-xs"/><input value={buyDate} onChange={e=>setBuyDate(e.target.value)} type="date" className="rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-xs"/><input value={buyQuantity} onChange={e=>setBuyQuantity(e.target.value)} type="number" min="1" step="1" placeholder="Quantity" className="rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-xs"/><input value={buyPrice} onChange={e=>setBuyPrice(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Buy price / share" className="rounded-lg border border-white/10 bg-[#050a12] px-3 py-2 text-xs"/></div><p className="text-[11px] text-slate-400">Total: ₹{((Number(buyQuantity)||0)*(Number(buyPrice)||0)).toLocaleString('en-IN')} · Available: ₹{availableBalance.toLocaleString('en-IN')}</p><button onClick={addBuy} className="w-full rounded-lg bg-sky-400 px-3 py-2 text-sm font-bold text-slate-950">Save Buy & Deduct Wallet</button>{buys.length>0 && <div className="max-h-36 space-y-2 overflow-auto">{buys.map(b=><div key={b.id} className="flex items-center justify-between rounded-lg bg-white/[0.04] p-2 text-xs"><span><b>{b.symbol}</b> · {b.quantity} × ₹{b.price.toFixed(2)} = ₹{b.total.toLocaleString('en-IN')}<span className="ml-2 text-slate-400">{displayDate(b.date)}</span></span><button onClick={()=>removeBuy(b.id)} title="Delete buy (refund wallet)" className="text-slate-500 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5"/></button></div>)}</div>}</div></section>
      <section className="rounded-2xl border border-white/10 bg-[#0b1421] p-4 space-y-3"><div><h2 className="font-bold">Penny Stock Scanner · ₹5–₹30</h2><p className="text-xs text-slate-400">दोन्ही NSE files upload कर. प्रत्येक trading date चा data history मध्ये जतन होईल; जुना data D1 cloud मध्ये जतन होईल; तो replace होणार नाही.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-3 text-xs font-semibold text-emerald-200"><span className="flex items-center gap-2"><Upload className="h-4 w-4"/> 1. CM Equity Bhavcopy · CSV / ZIP</span><span className="truncate text-[10px] font-normal text-slate-400">{bhavFileName || 'Price, volume, turnover'}</span><input type="file" accept=".csv,.zip,text/csv,application/zip" className="hidden" onChange={e=>uploadBhavcopy(e.target.files?.[0])}/></label><label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-sky-300/30 bg-sky-300/10 p-3 text-xs font-semibold text-sky-200"><span className="flex items-center gap-2"><Upload className="h-4 w-4"/> 2. Security-wise Delivery · CSV / ZIP</span><span className="truncate text-[10px] font-normal text-slate-400">{deliveryFileName || 'Delivery quantity and percentage'}</span><input type="file" accept=".csv,.zip,text/csv,application/zip" className="hidden" onChange={e=>uploadDelivery(e.target.files?.[0])}/></label></div></div><p className="text-[11px] text-emerald-300">D1 Cloud history: {historyDays} trading days · {history.length} symbol-day records</p><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search symbol..." className="w-full rounded-lg border border-white/10 bg-[#050a12] py-2 pl-9 pr-3 text-sm"/></div>
      {message && <p className="text-xs text-emerald-300">{message}</p>}
      {ranked.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2">Symbol</th><th>Close</th><th>Volume</th><th>Delivery</th><th>Combined</th><th>Market Trend</th><th>Company Quality</th><th>Liquidity</th></tr></thead><tbody>{ranked.slice(0,100).map(r=><tr key={r.symbol} className="border-t border-white/[0.06]"><td className="py-2 font-bold">{r.symbol}<div className="text-[10px] font-normal text-slate-500">{r.date}</div></td><td>₹{r.close.toFixed(2)}</td><td>{r.volume.toLocaleString('en-IN')}</td><td>{r.deliveryPct == null ? '—' : r.deliveryPct.toFixed(1)+'%'}</td><td className="font-bold">{r.hasCompleteData ? r.combinedScore+'/100' : '—'}<div className="text-[10px] font-normal text-slate-500">{r.rating}{!r.hasCompleteData ? ' · score hidden' : ''}</div></td><td><span className={r.trend==='POSITIVE TREND'?'text-emerald-300':r.trend==='WEAK TREND'?'text-rose-300':'text-amber-300'}>{r.trend}</span><div className="text-[10px] text-slate-500">Activity {r.activityScore}/80</div></td><td className={r.fundamental.score == null ? 'text-amber-300' : r.fundamental.score >= 75 ? 'text-emerald-300' : r.fundamental.score >= 55 ? 'text-sky-300' : 'text-rose-300'} title={r.fundamental.detail}><div className="font-semibold">{r.fundamental.label}</div><div className="text-[10px] font-normal text-slate-500">{r.fundamental.score == null ? r.fundamental.detail : r.fundamental.score + '/100 · ' + r.fundamental.detail}</div></td><td className={r.lowVolume ? 'text-rose-300' : 'text-emerald-300'}>{r.lowVolume ? 'LOW LIQUIDITY' : 'OK'}<div className="text-[10px] text-slate-500">{r.volume.toLocaleString('en-IN')} shares · {r.turnover == null ? 'turnover n/a' : '₹'+r.turnover.toFixed(1)+'L'}</div></td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-white/10 p-8 text-center"><TrendingUp className="mx-auto h-7 w-7 text-slate-500"/><p className="mt-2 text-sm font-semibold">अजून Bhavcopy upload केलेली नाही</p><p className="mt-1 text-xs text-slate-500">CM Equity Bhavcopy आणि Security-wise Delivery दोन्ही files upload केल्यावर ₹5–₹30 शेअर्स दिसतील.</p></div>}
      <div className="flex gap-2 rounded-lg bg-amber-400/5 p-3 text-[11px] leading-relaxed text-amber-200"><ShieldAlert className="h-4 w-4 shrink-0"/><span>हा प्राथमिक screen आहे; Market Trend हा फक्त 3 दिवसांच्या price/delivery activity वर आधारित आहे. Company Quality साठी audited financials, debt, profit growth, ROE आणि promoter pledge data आवश्यक आहे; ते नसताना GOOD/BAD label दिले जात नाही. दोन्ही files मधील Symbol/Date match न झाल्यास Delivery % रिकामी राहील आणि DATA CHECK दिसेल—अशा शेअरला WATCH समजू नको. Combined score मध्ये Fundamentals 50%, Market Trend 30% आणि daily activity 20% वजन आहे. 1 लाख shares/day पेक्षा कमी volume किंवा ₹10 लाखांपेक्षा कमी daily turnover असल्यास 10 points liquidity penalty लागते आणि असा शेअर STRONG होऊ शकत नाही. Market/financial data अपूर्ण असल्यास STRONG/MEDIUM/WEAK न देता INSUFFICIENT DATA दाखवतो. Score म्हणजे Buy recommendation नाही.</span></div></section>
    </div>
  </div>;
};
