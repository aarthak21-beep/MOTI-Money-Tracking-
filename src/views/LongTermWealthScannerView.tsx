import React, { useEffect, useMemo, useState } from 'react';
import { loadScannerData, saveScannerData } from '../services/cloudScannerStorage';
import { Upload, Download, Search, RefreshCw, ShieldCheck, Info, FileSpreadsheet } from 'lucide-react';

type WealthRow = {
  company: string; symbol: string; sector: string; industry: string; price?: number; marketCap?: number;
  pe?: number; usualPe?: number; industryPe?: number; peVsUsual?: number; peVsIndustry?: number; pb?: number;
  dividendYield?: number; salesGrowth?: number; profitGrowth?: number; opm?: number; roe?: number; roce?: number;
  debtEquity?: number; promoterHolding?: number; promoterChange?: number; profits: number[];
  latestQuarter: string; lossLatest: boolean; negativeNetWorth: boolean; redFlags?: number; greenFlags?: number;
  redFlagText: string; greenFlagText: string; above200Day?: boolean;
};
type Scored = WealthRow & { quality: number; growth: number; valuation: number; risk: number; overall: number; coverage: number; status: string; warnings: string[] };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v?: string): number | undefined => {
  if (!v?.trim() || ['-', 'na', 'n/a', 'null', '—'].includes(v.trim().toLowerCase())) return undefined;
  const n = Number(v.replace(/[₹,%\s,]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const bool = (v?: string) => /^(yes|true|1|above|loss|negative)$/i.test((v || '').trim());
const split = (line: string, delimiter: string) => {
  const out: string[] = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (ch === delimiter && !quoted) { out.push(value.trim()); value = ''; }
    else value += ch;
  }
  out.push(value.trim()); return out;
};
const parseCsv = (raw: string): WealthRow[] => {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.trim());
  if (lines.length < 2) throw new Error('CSV मध्ये header आणि किमान एक company row असणे आवश्यक आहे.');
  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const headers = split(lines[0], delimiter).map(norm);
  const idx = (...names: string[]) => headers.findIndex(h => names.includes(h));
  const cols = {
    company: idx('company','companyname','name'), symbol: idx('nsesymbol','symbol','ticker'),
    sector: idx('sector'), industry: idx('industry'), price: idx('lastprice','price','currentprice','cmp'),
    marketCap: idx('marketcap','marketcapcr'), pe: idx('pe','pex'), usualPe: idx('usualpe','usualpex'),
    industryPe: idx('industrymedianpe','industrymedianpex'), peVsUsual: idx('pevsusualratio'), peVsIndustry: idx('pevsindustryratio'),
    pb: idx('pb','pbx'), dividendYield: idx('dividendyield'), salesGrowth: idx('revenuegrowthquarteryoy','revenuegrowth','salesgrowth'),
    profitGrowth: idx('netprofitgrowthquarteryoy','netprofitgrowth','profitgrowth'), opm: idx('operatingmarginopm','opm'),
    roe: idx('roe'), roce: idx('roce'), debtEquity: idx('debtequity','debtequityx'), promoterHolding: idx('promoterholding'),
    promoterChange: idx('promoterholdingchange1y','promoterholdingchange','promoterholdingchange1ypercentagepoints'), profits: idx('netprofitlast4reportedperiods','netprofitlast4reportedperiodscr','netprofitlast4','last4profits'),
    latestQuarter: idx('latestquarter'), loss: idx('lossinlatestquarter','losslatestquarter'),
    negative: idx('negativenetworth'), redFlags: idx('redflagscount','redflags'), greenFlags: idx('greenflagscount','greenflags'),
    redText: idx('redflags'), greenText: idx('greenflags'), above200: idx('above200dayaverage','above200day')
  };
  if (cols.symbol < 0 || cols.price < 0) throw new Error('NSE symbol आणि Last price columns आवश्यक आहेत.');
  const get = (c: string[], k: keyof typeof cols) => cols[k] >= 0 ? c[cols[k]] || '' : '';
  return lines.slice(1).map(line => {
    const c = split(line, delimiter);
    const profits = get(c,'profits').split(/[;,|]/).map(x => num(x)).filter((x): x is number => x !== undefined);
    return {
      company: get(c,'company') || get(c,'symbol'), symbol: get(c,'symbol').toUpperCase(),
      sector: get(c,'sector'), industry: get(c,'industry'), price: num(get(c,'price')), marketCap: num(get(c,'marketCap')),
      pe: num(get(c,'pe')), usualPe: num(get(c,'usualPe')), industryPe: num(get(c,'industryPe')),
      peVsUsual: num(get(c,'peVsUsual')), peVsIndustry: num(get(c,'peVsIndustry')), pb: num(get(c,'pb')),
      dividendYield: num(get(c,'dividendYield')), salesGrowth: num(get(c,'salesGrowth')), profitGrowth: num(get(c,'profitGrowth')),
      opm: num(get(c,'opm')), roe: num(get(c,'roe')), roce: num(get(c,'roce')), debtEquity: num(get(c,'debtEquity')),
      promoterHolding: num(get(c,'promoterHolding')), promoterChange: num(get(c,'promoterChange')), profits,
      latestQuarter: get(c,'latestQuarter'), lossLatest: bool(get(c,'loss')), negativeNetWorth: bool(get(c,'negative')),
      redFlags: num(get(c,'redFlags')), greenFlags: num(get(c,'greenFlags')), redFlagText: get(c,'redText'),
      greenFlagText: get(c,'greenText'), above200Day: bool(get(c,'above200'))
    };
  }).filter(r => r.symbol && r.price !== undefined && r.price > 0);
};
const pct = (n?: number) => n === undefined ? '—' : n.toFixed(1) + '%';
const fmt = (n?: number) => n === undefined ? '—' : n.toLocaleString('en-IN',{maximumFractionDigits:2});
const points = (value: number | undefined, max: number, fn: (n:number)=>number) => value === undefined ? undefined : Math.max(0,Math.min(max,fn(value)));
const score = (r: WealthRow): Scored => {
  const q: [number | undefined, number][] = [
    [points(r.roe,10,n=> n>=20?10:n>=15?8:n>=10?5:n>0?2:0),10],
    [points(r.roce,10,n=> n>=20?10:n>=15?8:n>=10?5:n>0?2:0),10],
    [points(r.debtEquity,7,n=> n<=0.3?7:n<=0.7?5:n<=1.5?2:0),7],
    [points(r.opm,5,n=> n>=15?5:n>=10?4:n>=5?2:0),5],
    [points(r.promoterHolding,3,n=> n>=50?3:n>=35?2:n>=20?1:0),3]
  ];
  const g: [number | undefined, number][] = [
    [points(r.salesGrowth,12,n=> n>=20?12:n>=10?9:n>=5?6:n>0?3:0),12],
    [points(r.profitGrowth,12,n=> n>=20?12:n>=10?9:n>=5?6:n>0?3:0),12],
    [r.profits.length>=4 ? (r.profits.every(n=>n>0)?6:0) : undefined,6]
  ];
  const peRef = r.peVsIndustry ?? r.peVsUsual;
  const v: [number | undefined, number][] = [
    [points(peRef,10,n=> n<=0.7?10:n<=0.9?8:n<=1.1?5:n<=1.3?2:0),10],
    [points(r.pb,5,n=> n<=1?5:n<=2?4:n<=4?2:0),5],
    [points(r.dividendYield,5,n=> n>=3?5:n>=1.5?3:n>0?1:0),5]
  ];
  const weighted = (items: [number | undefined,number][]) => {
    const have=items.filter(x=>x[0]!==undefined); const max=have.reduce((s,x)=>s+x[1],0);
    return { value:max ? Math.round(have.reduce((s,x)=>s+(x[0]||0),0)/max*100) : 0, coverage: max/items.reduce((s,x)=>s+x[1],0)*100, count:have.length };
  };
  const qs=weighted(q), gs=weighted(g), vs=weighted(v);
  const risks = [r.negativeNetWorth, r.lossLatest, (r.redFlags ?? 0)>=3, (r.promoterChange ?? 0)<=-2].filter(Boolean).length;
  const risk = Math.max(0,100-risks*22-(r.redFlags ?? 0)*4);
  const available = [r.roe,r.roce,r.debtEquity,r.opm,r.promoterHolding,r.salesGrowth,r.profitGrowth,r.pe,r.peVsIndustry ?? r.peVsUsual,r.pb,r.dividendYield,r.marketCap,r.redFlags].filter(x=>x!==undefined).length;
  const overall = Math.round(qs.value*.4+gs.value*.3+vs.value*.2+risk*.1);
  const warnings:string[]=[];
  if ((r.salesGrowth ?? 0)>100 || (r.profitGrowth ?? 0)>100) warnings.push('Quarterly growth 100% पेक्षा जास्त: base effect तपासा');
  if ((r.roe ?? 0)>60 || (r.roce ?? 0)>60) warnings.push('ROE/ROCE 60% पेक्षा जास्त: आकडे verify करा');
  if (r.negativeNetWorth) warnings.push('Negative net worth');
  if (r.lossLatest) warnings.push('Latest quarter loss');
  if ((r.redFlags ?? 0)>=3) warnings.push('3 किंवा अधिक red flags');
  if ((r.promoterChange ?? 0)<=-2) warnings.push('Promoter holding मध्ये घट');
  const coverage=Math.round((qs.coverage*.4+gs.coverage*.3+vs.coverage*.2+Math.min(100,available/13*100)*.1));
  const status = r.negativeNetWorth || (r.redFlags ?? 0)>=3 ? 'High Risk Review' : coverage<65 ? 'Insufficient Data' : overall>=75 ? 'Quality Watchlist' : overall>=55 ? 'Further Research' : 'Weak Fundamentals';
  return {...r,quality:qs.value,growth:gs.value,valuation:vs.value,risk,overall,coverage,status,warnings};
};
const downloadCsv = (rows: Scored[]) => {
  const header=['Company','Symbol','Price','Overall','Quality','Growth','Valuation','Risk','Coverage','Status','Warnings'];
  const quote=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv=[header,...rows.map(r=>[r.company,r.symbol,r.price,r.overall,r.quality,r.growth,r.valuation,r.risk,r.coverage,r.status,r.warnings.join('; ')])].map(row=>row.map(quote).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})); const a=document.createElement('a'); a.href=url; a.download='moti-long-term-wealth-watchlist.csv'; a.click(); URL.revokeObjectURL(url);
};
export const LongTermWealthScannerView: React.FC = () => {
  const [rows,setRows]=useState<WealthRow[]>([]); const [query,setQuery]=useState(''); const [filter,setFilter]=useState('ALL');
  const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;(async()=>{try{const saved=await loadScannerData<WealthRow[]>('long-term-wealth');if(active&&saved)setRows(saved);}catch{if(active)setError('Cloud मधून saved scanner data मिळाला नाही. पुन्हा प्रयत्न करा.');}})();return()=>{active=false;};},[]);
  const scored=useMemo(()=>rows.map(score).sort((a,b)=>b.overall-a.overall),[rows]);
  const visible=useMemo(()=>scored.filter(r=>(!query||[r.company,r.symbol,r.sector,r.industry].join(' ').toLowerCase().includes(query.toLowerCase()))&&(filter==='ALL'||(filter==='QUALITY'&&r.quality>=70)||(filter==='GROWTH'&&r.growth>=70)||(filter==='VALUE'&&r.valuation>=70)||(filter==='RISK'&&r.status==='High Risk Review'))),[scored,query,filter]);
  const upload=async(file?:File)=>{if(!file)return;setBusy(true);setError('');setMessage('');try{const parsed=parseCsv(await file.text());await saveScannerData('long-term-wealth',parsed);setRows(parsed);setMessage(parsed.length+' कंपन्यांचा डेटा save झाला.');}catch(e){setError(e instanceof Error?e.message:'CSV वाचता आला नाही.');}finally{setBusy(false);}};
  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-emerald-300"><ShieldCheck className="h-5 w-5"/><span className="text-xs font-bold uppercase tracking-[.18em]">MOTI · Long Term</span></div><h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Long-Term Wealth Scanner</h1><p className="mt-1 max-w-2xl text-sm text-slate-400">कंपनीची गुणवत्ता, वाढ आणि valuation तपासण्यासाठी. Share price ची कोणतीही मर्यादा नाही.</p></div>
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-300/15"><Upload className="h-4 w-4"/>{busy?'Uploading...':'Monthly CSV Upload'}<input type="file" accept=".csv,text/csv" className="hidden" disabled={busy} onChange={e=>upload(e.target.files?.[0])}/></label></div>
    <div className="grid gap-3 sm:grid-cols-4">{[{label:'Companies',value:rows.length},{label:'Quality Watchlist',value:scored.filter(r=>r.status==='Quality Watchlist').length},{label:'Need More Data',value:scored.filter(r=>r.status==='Insufficient Data').length},{label:'High Risk Review',value:scored.filter(r=>r.status==='High Risk Review').length}].map(x=><div key={x.label} className="rounded-xl border border-white/10 bg-[#0b1421] p-4"><p className="text-xs text-slate-400">{x.label}</p><p className="mt-1 text-2xl font-bold text-white">{x.value}</p></div>)}</div>
    <div className="rounded-xl border border-sky-300/20 bg-sky-300/5 p-3 text-xs leading-relaxed text-sky-100"><Info className="mr-1 inline h-4 w-4"/> Scores हे screening संकेत आहेत, buy/sell calls नाहीत. Cash Flow, auditor remarks, pledge आणि management quality CSV मध्ये नसतील तर ते स्वतंत्रपणे तपासा. किमान 3–5 वर्षांचा track record पाहा.</div>
    {error&&<p className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}{message&&<p className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-200">{message}</p>}
    <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[190px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Company / symbol शोधा" className="w-full rounded-lg border border-white/10 bg-[#0b1421] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-300/40"/></div><select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border border-white/10 bg-[#0b1421] px-3 py-2 text-sm text-white"><option value="ALL">All companies</option><option value="QUALITY">Quality 70+</option><option value="GROWTH">Growth 70+</option><option value="VALUE">Valuation 70+</option><option value="RISK">High risk</option></select><button onClick={()=>downloadCsv(visible)} disabled={!visible.length} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 disabled:opacity-40"><Download className="h-4 w-4"/>Export</button></div>
    {rows.length===0?<div className="rounded-2xl border border-dashed border-white/15 bg-[#0b1421]/70 px-5 py-12 text-center"><FileSpreadsheet className="mx-auto h-9 w-9 text-emerald-300"/><h2 className="mt-3 text-lg font-bold text-white">Monthly fundamental CSV upload करा</h2><p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">MCAPITAL सारख्या source मधील Company, NSE symbol, Last price, ROE, ROCE, Debt/Equity, Revenue growth, Net profit growth, P/E, P/B, Promoter holding आणि Red flags columns वापरा.</p><p className="mt-3 text-xs text-slate-500">CSV only · Upload केल्यावर या scanner चा data स्वतंत्र cloud key मध्ये save होईल.</p></div>
    :<div className="overflow-hidden rounded-xl border border-white/10 bg-[#0b1421]"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><p className="text-sm font-bold text-white">{visible.length} Results</p><p className="text-[11px] text-slate-500">Scores उपलब्ध डेटावर आधारित; coverage सोबत वाचा</p></div><button onClick={()=>{setQuery('');setFilter('ALL');}} className="inline-flex items-center gap-1 text-xs text-slate-400"><RefreshCw className="h-3 w-3"/>Reset</button></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-white/[.03] text-slate-400"><tr>{['Company','Price','Overall','Quality','Growth','Valuation','Coverage','Status','Warnings'].map(h=><th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{visible.map(r=><tr key={r.symbol} className="border-t border-white/[.06] align-top hover:bg-white/[.02]"><td className="px-3 py-3"><p className="font-bold text-white">{r.company}</p><p className="mt-0.5 text-slate-500">{r.symbol} · {r.sector||r.industry||'—'}</p></td><td className="px-3 py-3 text-slate-200">₹{fmt(r.price)}</td><td className="px-3 py-3 font-bold text-emerald-300">{r.overall}/100</td><td className="px-3 py-3 text-slate-200">{r.quality}</td><td className="px-3 py-3 text-slate-200">{r.growth}</td><td className="px-3 py-3 text-slate-200">{r.valuation}</td><td className="px-3 py-3 text-slate-300">{r.coverage}%</td><td className="px-3 py-3"><span className={r.status==='High Risk Review'?'text-rose-300':r.status==='Quality Watchlist'?'text-emerald-300':'text-amber-200'}>{r.status}</span></td><td className="max-w-[240px] px-3 py-3 text-slate-400">{r.warnings.join(' · ')||'—'}</td></tr>)}</tbody></table></div></div>}
    <p className="text-[11px] text-slate-500">डेटा update करण्यासाठी दर महिन्याला नवीन CSV upload करा. नवीन upload मागील snapshot replace करतो. ही heuristic पद्धत आहे; गुंतवणुकीपूर्वी annual reports आणि cash flow तपासा.</p>
  </div>;
};
