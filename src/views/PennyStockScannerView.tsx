import React, { useEffect, useMemo, useState } from 'react';
import { loadScannerData, saveScannerData, deleteScannerData } from '../services/cloudScannerStorage';
import { Upload, Download, Trash2, Search, ShieldAlert, FileSpreadsheet, RefreshCw } from 'lucide-react';

type PennyRow = {
  symbol: string; company?: string; price?: number;
  salesGrowth?: number; profitGrowth?: number; roe?: number; roce?: number;
  debtEquity?: number; promoterHolding?: number; pledge?: number;
  operatingCashFlow?: number; epsGrowth?: number; pe?: number;
  marketCap?: number; usualPe?: number; industryMedianPe?: number; peVsUsual?: number; peVsIndustry?: number;
  pb?: number; dividendYield?: number; opm?: number; financingMargin?: number;
  threeMonthReturn?: number; promoterHoldingChange1y?: number; netProfitLast4?: number[];
  above200Day?: boolean; lossLatestQuarter?: boolean; negativeNetWorth?: boolean;
  redFlagCount?: number; greenFlagCount?: number; redFlags?: string; greenFlags?: string;
  sizeClass?: string; sector?: string; industry?: string; segment?: string; latestQuarter?: string;
  accountsModel?: string; sourceDate?: string; score: number; coverage: number; status: string; risks: string[];
};
type SavedData = { updatedAt: string; rows: PennyRow[] };
const STORAGE_KEY = 'moti_penny_stock_v1';
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const parseNum = (value?: string): number | undefined => {
  if (!value?.trim() || ['-', 'na', 'n/a', 'null', ''].includes(value.trim().toLowerCase())) return undefined;
  const cleaned = value.replace(/[,₹%\s]/g, '').replace(/%$/, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
};
const splitLine = (line: string, delimiter: string) => {
  const cells: string[] = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (ch === delimiter && !quoted) { cells.push(value.trim()); value = ''; }
    else value += ch;
  }
  cells.push(value.trim()); return cells;
};
const readCsv = (raw: string) => {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.trim());
  if (lines.length < 2) throw new Error('CSV मध्ये header आणि किमान एक data row आवश्यक आहे.');
  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const headers = splitLine(lines[0], delimiter).map(norm);
  return lines.slice(1).map(line => splitLine(line, delimiter)).filter(cells => cells.some(Boolean)).map(cells => ({ headers, cells }));
};
const aliases: Record<string, string[]> = {
  symbol: ['nsesymbol','symbol','ticker','tradingsymbol','nsecode','stockcode','securityid','companysymbol'],
  company: ['company','companyname','name','securityname'],
  price: ['lastprice','currentprice','currentmarketprice','cmp','ltp','close','shareprice','price'],
  salesGrowth: ['salesgrowth','salesgrowth3years','salesgrowth3yr','salesgrowth5years','revenuegrowth','revenuegrowth3years'],
  profitGrowth: ['profitgrowth','profitgrowth3years','profitgrowth3yr','profitgrowth5years','netprofitgrowth','profitgrowth5years'],
  roe: ['roe','returnonequity','returnonequitypercent'],
  roce: ['roce','returnoncapitalemployed','returnoncapitalemployedpercent'],
  debtEquity: ['debttoequity','debt/equity','debt_equity','debttoequityratio','debt-equity'],
  promoterHolding: ['promoterholding','promotersholding','promoterstake','promoterholdingpercent'],
  pledge: ['promoterpledge','pledge','pledgedpercentage','promoterpledged'],
  operatingCashFlow: ['operatingcashflow','cashfromoperatingactivity','cashflowfromoperatingactivities','cashfromoperations','cashfromoperatingactivities'],
  epsGrowth: ['epsgrowth','epsgrowth3years','epsgrowth5years'],
  pe: ['pe','peratio','priceearnings','priceearningratio','stockpe'],
  marketCap: ['marketcap'],
  usualPe: ['usualpe'],
  industryMedianPe: ['industrymedianpe'],
  peVsUsual: ['pevsusual'],
  peVsIndustry: ['pevsindustry'],
  pb: ['pb','pricetobook'],
  dividendYield: ['dividendyield'],
  opm: ['opm','operatingmargin'],
  financingMargin: ['financingmargin'],
  threeMonthReturn: ['3monthreturn','threemonthreturn'],
  promoterHoldingChange1y: ['promoterholdingchange1y'],
  netProfitLast4: ['netprofitlast4reportedperiods'],
  above200Day: ['above200dayaverage'],
  lossLatestQuarter: ['lossinlatestquarter'],
  negativeNetWorth: ['negativenetworth'],
  redFlagCount: ['redflagscount','redflagcount'],
  greenFlagCount: ['greenflagscount','greenflagcount'],
  redFlags: ['redflags'],
  greenFlags: ['greenflags'],
  sizeClass: ['sizeclass'],
  sector: ['sector'],
  industry: ['industry'],
  segment: ['segment'],
  latestQuarter: ['latestquarter'],
  accountsModel: ['accountsmodel']
};
const findIndex = (headers: string[], keys: string[]) => headers.findIndex(h => keys.some(k => norm(k) === h || h.includes(norm(k))));
const parseFundamentals = (raw: string): PennyRow[] => {
  const parsed = readCsv(raw);
  return parsed.map(({headers,cells}) => {
    const get = (field: keyof typeof aliases) => {
      const i = findIndex(headers, aliases[field]);
      return i >= 0 ? cells[i] : undefined;
    };
    const symbolRaw = get('symbol') || get('company');
    if (!symbolRaw) return null;
    const symbol = symbolRaw.trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9&._-]{1,40}$/.test(symbol)) return null;
    const values = {
      price: parseNum(get('price')), salesGrowth: parseNum(get('salesGrowth')),
      profitGrowth: parseNum(get('profitGrowth')), roe: parseNum(get('roe')),
      roce: parseNum(get('roce')), debtEquity: parseNum(get('debtEquity')),
      promoterHolding: parseNum(get('promoterHolding')), pledge: parseNum(get('pledge')),
      operatingCashFlow: parseNum(get('operatingCashFlow')), epsGrowth: parseNum(get('epsGrowth')),
      pe: parseNum(get('pe')),
      marketCap: parseNum(get('marketCap')), usualPe: parseNum(get('usualPe')),
      industryMedianPe: parseNum(get('industryMedianPe')), peVsUsual: parseNum(get('peVsUsual')),
      peVsIndustry: parseNum(get('peVsIndustry')), pb: parseNum(get('pb')),
      dividendYield: parseNum(get('dividendYield')), opm: parseNum(get('opm')),
      financingMargin: parseNum(get('financingMargin')), threeMonthReturn: parseNum(get('threeMonthReturn')),
      promoterHoldingChange1y: parseNum(get('promoterHoldingChange1y')),
      netProfitLast4: (get('netProfitLast4') || '').split(/[;,|]/).map(parseNum).filter((n): n is number => n !== undefined),
      above200Day: /^(yes|true|1|above)$/i.test(get('above200Day') || ''),
      lossLatestQuarter: /^(yes|true|1|loss)$/i.test(get('lossLatestQuarter') || ''),
      negativeNetWorth: /^(yes|true|1|negative)$/i.test(get('negativeNetWorth') || ''),
      redFlagCount: parseNum(get('redFlagCount')), greenFlagCount: parseNum(get('greenFlagCount')),
      redFlags: get('redFlags'), greenFlags: get('greenFlags'),
      sizeClass: get('sizeClass'), sector: get('sector'), industry: get('industry'),
      segment: get('segment'), latestQuarter: get('latestQuarter'), accountsModel: get('accountsModel')
    };
    return { symbol, company: get('company'), ...values, score: 0, coverage: 0, status: 'Insufficient Data', risks: [] } as PennyRow;
  }).filter((row): row is PennyRow => Boolean(row));
};
const parseBhavcopy = (raw: string): Map<string, number> => {
  const parsed = readCsv(raw);
  const headers = parsed[0]?.headers || [];
  const symbolIndex = findIndex(headers, ['symbol','tckrsymb','tradingsymbol']);
  const seriesIndex = findIndex(headers, ['series','sctysrs']);
  const closeIndex = findIndex(headers, ['close','closeprice','clspric','lastprice','ltp']);
  if (symbolIndex < 0 || closeIndex < 0) throw new Error('Bhavcopy मध्ये Symbol आणि Close columns सापडले नाहीत.');
  const prices = new Map<string, number>();
  parsed.forEach(({cells}) => {
    const symbol = (cells[symbolIndex] || '').trim().toUpperCase();
    const series = seriesIndex >= 0 ? (cells[seriesIndex] || '').trim().toUpperCase() : 'EQ';
    const close = parseNum(cells[closeIndex]);
    if (symbol && (series === 'EQ' || !series) && close !== undefined) prices.set(symbol, close);
  });
  return prices;
};
const scoreRow = (row: PennyRow): PennyRow => {
  let earned = 0; let availableWeight = 0; const risks: string[] = [];
  const add = (value: number | undefined, weight: number, test: (n:number)=>number) => {
    if (value === undefined) return;
    availableWeight += weight; earned += test(value);
  };
  // Fundamental-first score: quarterly growth, returns, leverage and operating margin.
  add(row.salesGrowth, 15, n => n > 15 ? 15 : n > 5 ? 10 : n >= 0 ? 5 : 0);
  add(row.profitGrowth, 18, n => n > 20 ? 18 : n > 10 ? 13 : n >= 0 ? 6 : 0);
  add(row.roe, 12, n => n >= 20 ? 12 : n >= 15 ? 9 : n >= 10 ? 6 : 0);
  add(row.roce, 15, n => n >= 20 ? 15 : n >= 15 ? 11 : n >= 10 ? 6 : 0);
  add(row.debtEquity, 15, n => n >= 0 && n <= 0.3 ? 15 : n <= 0.7 && n >= 0 ? 11 : n <= 1.2 && n >= 0 ? 6 : 0);
  add(row.promoterHolding, 10, n => n >= 50 ? 10 : n >= 35 ? 7 : n >= 20 ? 4 : 0);
  add(row.opm, 10, n => n >= 20 ? 10 : n >= 12 ? 7 : n >= 5 ? 4 : 0);
  if (row.pe !== undefined && row.pe > 0) add(row.pe, 5, n => n <= 20 ? 5 : n <= 30 ? 4 : n <= 45 ? 2 : 0);
  else if (row.pb !== undefined && row.pb > 0) add(row.pb, 5, n => n <= 2 ? 5 : n <= 4 ? 3 : n <= 7 ? 1 : 0);
  if (row.salesGrowth !== undefined && row.salesGrowth < 0) risks.push('Sales growth negative');
  if (row.profitGrowth !== undefined && row.profitGrowth < 0) risks.push('Profit growth negative');
  if (row.debtEquity !== undefined && row.debtEquity > 1.5) risks.push('High debt');
  if (row.pledge !== undefined && row.pledge > 20) risks.push('High promoter pledge');
  if (row.operatingCashFlow !== undefined && row.operatingCashFlow < 0) risks.push('Negative operating cash flow');
  if (row.pe !== undefined && row.pe < 0) risks.push('Negative P/E / loss-making');
  if (row.lossLatestQuarter) risks.push('Loss in latest quarter');
  if (row.negativeNetWorth) risks.push('Negative net worth');
  if (row.redFlagCount !== undefined && row.redFlagCount > 0) risks.push('Red flags: ' + row.redFlagCount);
  if (row.promoterHoldingChange1y !== undefined && row.promoterHoldingChange1y < -5) risks.push('Promoter holding fell');
  const coverageFields = [row.salesGrowth,row.profitGrowth,row.roe,row.roce,row.debtEquity,row.promoterHolding,row.opm,row.pe ?? row.pb,row.marketCap,row.dividendYield,row.promoterHoldingChange1y,row.redFlagCount,row.greenFlagCount];
  const availableMetrics = coverageFields.filter(v => v !== undefined).length;
  const normalized = availableWeight ? Math.round(earned / availableWeight * 100) : 0;
  const hardRisk = Boolean(row.lossLatestQuarter || row.negativeNetWorth || (row.redFlagCount !== undefined && row.redFlagCount >= 3));
  const status = availableMetrics < 4 ? 'Insufficient Data' : hardRisk || risks.length >= 3 || normalized < 40 ? 'Risky / Avoid' : normalized >= 70 ? 'Strong Fundamentals' : 'Improving Fundamentals';
  return { ...row, score: normalized, coverage: availableMetrics, status, risks };
};
const money = (n?: number) => n === undefined ? '—' : '₹' + n.toLocaleString('en-IN',{maximumFractionDigits:2});
const pct = (n?: number) => n === undefined ? '—' : n.toFixed(1) + '%';
const metric = (n?: number, suffix = '') => n === undefined ? '—' : n.toFixed(1) + suffix;

export const PennyStockScannerView: React.FC = () => {
  const [rows,setRows] = useState<PennyRow[]>([]);
  const [updatedAt,setUpdatedAt] = useState('');
  const [query,setQuery] = useState('');
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    loadScannerData<SavedData>('penny-stock').then(data => {
      if (active && data?.rows) { setRows(data.rows); setUpdatedAt(data.updatedAt || ''); }
    }).catch(() => {
      try { const local = localStorage.getItem(STORAGE_KEY); if (local) { const data = JSON.parse(local) as SavedData; setRows(data.rows || []); setUpdatedAt(data.updatedAt || ''); } } catch { /* ignore invalid local backup */ }
    });
    return () => { active = false; };
  }, []);
  const save = async (nextRows: PennyRow[]) => {
    const data: SavedData = { updatedAt: new Date().toISOString(), rows: nextRows };
    setRows(nextRows); setUpdatedAt(data.updatedAt); localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    await saveScannerData('penny-stock', data);
  };
  const handleFundamentalUpload = async (file?: File) => {
    if (!file) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const imported = parseFundamentals(await file.text());
      if (!imported.length) throw new Error('या CSV मध्ये कंपनीचे Symbol/Ticker column सापडले नाहीत.');
      const scored = imported.map(scoreRow);
      await save(scored);
      setMessage(imported.length + ' कंपन्यांचा Fundamental डेटा import झाला.');
    } catch (e) { setError(e instanceof Error ? e.message : 'CSV वाचता आला नाही.'); }
    finally { setBusy(false); }
  };
  const handleBhavcopyUpload = async (file?: File) => {
    if (!file) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const prices = parseBhavcopy(await file.text());
      const next = rows.map(row => ({...row, price: prices.get(row.symbol) ?? row.price})).map(scoreRow);
      await save(next);
      setMessage('Bhavcopy मधील उपलब्ध closing prices जोडले.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Bhavcopy वाचता आली नाही.'); }
    finally { setBusy(false); }
  };
  const results = useMemo(() => rows.filter(row => (!query || row.symbol.toLowerCase().includes(query.toLowerCase()) || (row.company || '').toLowerCase().includes(query.toLowerCase()))).filter(row => row.price !== undefined && row.price > 0 && row.price <= 50).sort((a,b) => b.score-a.score),[rows,query]);
  const handleExport = () => {
    const headers = ['Symbol','Company','Price','Market Cap','P/E','Usual P/E','Industry Median P/E','P/B','Dividend Yield','Sales Growth QoQ YoY','Net Profit Growth QoQ YoY','OPM','Financing Margin','ROE','ROCE','Debt Equity','Promoter Holding','Promoter Holding Change 1Y','3M Return','Above 200D Average','Latest Quarter Loss','Negative Net Worth','Red Flag Count','Green Flag Count','Red Flags','Green Flags','Last 4 Period Net Profit','Score','Coverage','Status','Risk Flags'];
    const csv = [headers.join(','), ...results.map(r => [r.symbol,r.company || '',r.price ?? '',r.marketCap ?? '',r.pe ?? '',r.usualPe ?? '',r.industryMedianPe ?? '',r.pb ?? '',r.dividendYield ?? '',r.salesGrowth ?? '',r.profitGrowth ?? '',r.opm ?? '',r.financingMargin ?? '',r.roe ?? '',r.roce ?? '',r.debtEquity ?? '',r.promoterHolding ?? '',r.promoterHoldingChange1y ?? '',r.threeMonthReturn ?? '',r.above200Day ?? '',r.lossLatestQuarter ?? '',r.negativeNetWorth ?? '',r.redFlagCount ?? '',r.greenFlagCount ?? '',r.redFlags ?? '',r.greenFlags ?? '',r.netProfitLast4?.join('; ') ?? '',r.score,r.coverage,r.status,r.risks.join('; ')].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a = document.createElement('a'); a.href=url; a.download='moti-penny-stock-analysis.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const clear = async () => {
    if (!window.confirm('Penny Stock Scanner मधील saved data delete करायचा?')) return;
    setBusy(true);
    try { await deleteScannerData('penny-stock'); localStorage.removeItem(STORAGE_KEY); setRows([]); setUpdatedAt(''); setMessage('Saved data delete झाला.'); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Delete करता आले नाही.'); }
    finally { setBusy(false); }
  };
  const strong = results.filter(r=>r.status==='Strong Fundamentals').length;
  const risky = results.filter(r=>r.status==='Risky / Avoid').length;
  return <div className="mx-auto max-w-7xl space-y-5 pb-24">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><h1 className="text-2xl font-black text-white">Penny Stock Scanner</h1><span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[10px] font-bold text-emerald-300">FUNDAMENTAL FIRST</span></div><p className="mt-1 text-sm text-slate-400">₹50 पर्यंतचे शेअर्स · महिन्यातून एकदा डेटा अपडेट · API नाही</p></div>
      <button onClick={handleExport} disabled={!results.length} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"><Download className="h-4 w-4"/> Export Analysis</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-white/10 bg-[#0b1421] p-4"><p className="text-xs text-slate-400">कंपन्या</p><p className="mt-1 text-2xl font-bold text-white">{results.length}</p></div>
      <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4"><p className="text-xs text-slate-400">Strong Fundamentals</p><p className="mt-1 text-2xl font-bold text-emerald-300">{strong}</p></div>
      <div className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-4"><p className="text-xs text-slate-400">Risky / Avoid</p><p className="mt-1 text-2xl font-bold text-rose-300">{risky}</p></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <label className="cursor-pointer rounded-xl border border-dashed border-emerald-300/30 bg-[#0b1421] p-5 hover:border-emerald-300/60"><div className="flex items-center gap-3"><FileSpreadsheet className="h-6 w-6 text-emerald-300"/><div><p className="font-bold text-white">1. Fundamental CSV Upload</p><p className="text-xs text-slate-400">MCAPITAL / इतर स्रोताचा CSV · अनेक कंपन्या एकत्र</p></div></div><input type="file" accept=".csv,text/csv" className="mt-4 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-300/10 file:px-3 file:py-2 file:text-emerald-200" onChange={e=>{void handleFundamentalUpload(e.target.files?.[0]);e.currentTarget.value='';}} disabled={busy}/></label>
      <label className="cursor-pointer rounded-xl border border-dashed border-cyan-300/30 bg-[#0b1421] p-5 hover:border-cyan-300/60"><div className="flex items-center gap-3"><Upload className="h-6 w-6 text-cyan-300"/><div><p className="font-bold text-white">2. NSE Bhavcopy CSV Upload</p><p className="text-xs text-slate-400">शेवटच्या ट्रेडिंग दिवसाचा Close Price · ₹50 filter</p></div></div><input type="file" accept=".csv,text/csv" className="mt-4 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-300/10 file:px-3 file:py-2 file:text-cyan-200" onChange={e=>{void handleBhavcopyUpload(e.target.files?.[0]);e.currentTarget.value='';}} disabled={busy}/></label>
    </div>
    {error && <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</div>}
    {message && <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3 text-sm text-emerald-200">{message}</div>}
    {busy && <p className="text-xs text-cyan-200"><RefreshCw className="mr-2 inline h-3.5 w-3.5 animate-spin"/>डेटा process होत आहे…</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Symbol किंवा कंपनी शोधा…" className="w-full rounded-lg border border-white/10 bg-[#0b1421] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-300/40"/></div><div className="flex items-center gap-2 text-xs text-slate-400">{updatedAt ? 'Last upload: '+new Date(updatedAt).toLocaleString('en-IN') : 'अजून डेटा upload केलेला नाही'}<button onClick={()=>void clear()} disabled={!rows.length || busy} className="rounded-lg border border-rose-300/20 p-2 text-rose-300 disabled:opacity-30" title="Delete saved data"><Trash2 className="h-4 w-4"/></button></div></div>
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0b1421]"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-white/[0.04] text-slate-400"><tr>{['Company / Symbol','Price','Score','Status','Sales Growth','Profit Growth','ROE','ROCE','Debt/Eq.','Promoter','3M Return','200D Avg','Red Flags','PE'].map(h=><th key={h} className="whitespace-nowrap px-3 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{results.map(row=><tr key={row.symbol} className="border-t border-white/[0.06] hover:bg-white/[0.025]"><td className="px-3 py-3"><p className="font-bold text-white">{row.company || row.symbol}</p><p className="text-[10px] text-slate-500">{row.symbol}</p></td><td className="px-3 py-3 text-slate-200">{money(row.price)}</td><td className="px-3 py-3 font-bold text-white">{row.score}/100 <span className="block text-[10px] font-normal text-slate-500">{row.coverage}/10 fields</span></td><td className="px-3 py-3"><span className={row.status==='Strong Fundamentals'?'text-emerald-300':row.status==='Risky / Avoid'?'text-rose-300':'text-amber-300'}>{row.status}</span>{row.risks.length>0&&<span className="block max-w-36 text-[10px] text-rose-300/80">{row.risks.join(', ')}</span>}</td><td className="px-3 py-3 text-slate-300">{pct(row.salesGrowth)}</td><td className="px-3 py-3 text-slate-300">{pct(row.profitGrowth)}</td><td className="px-3 py-3 text-slate-300">{metric(row.roe,'%')}</td><td className="px-3 py-3 text-slate-300">{metric(row.roce,'%')}</td><td className="px-3 py-3 text-slate-300">{metric(row.debtEquity)}</td><td className="px-3 py-3 text-slate-300">{pct(row.promoterHolding)}</td><td className="px-3 py-3 text-slate-300">{pct(row.threeMonthReturn)}</td><td className="px-3 py-3 text-slate-300">{row.above200Day===undefined?'—':row.above200Day?'Yes':'No'}</td><td className="px-3 py-3 text-slate-300">{row.redFlagCount ?? '—'}</td><td className="px-3 py-3 text-slate-300">{metric(row.pe)}</td></tr>)}{!results.length&&<tr><td colSpan={14} className="px-4 py-12 text-center text-slate-500">Fundamental CSV upload करा. Bhavcopy upload केल्यावर ₹50 पर्यंतचे शेअर्स filter होतील.</td></tr>}</tbody></table></div>
    <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs leading-relaxed text-amber-100/80"><div className="mb-1 flex items-center gap-2 font-bold text-amber-200"><ShieldAlert className="h-4 w-4"/>महत्त्वाची सूचना</div>Score हा उपलब्ध CSV कॉलमवर आधारित प्राथमिक screening score आहे; तो buy/sell recommendation नाही. Auditor remarks, contingent liabilities, corporate governance, sector context आणि data freshness वेगळे तपासणे आवश्यक आहे. Fundamental CSV आणि Bhavcopy एकाच महिन्याचे असावेत. CSV मधील header names source नुसार बदलू शकतात; कॉलम ओळखला नाही तर तो score मध्ये धरला जाणार नाही.</div>
  </div>;
};
