import React, { useMemo, useState } from 'react';
import { Activity, Upload, Download, Trash2, Search, ShieldAlert, FileSpreadsheet, Info } from 'lucide-react';

type StockRow = {
  date: string; symbol: string; close: number; prevClose?: number; volume: number;
  avgVolume?: number; deliveryQty?: number; deliveryPct?: number; high?: number; low?: number;
};
const KEY = 'moti_smart_money_screener_v1';
const csvTemplate = 'date,symbol,close,prevClose,volume,avgVolume,deliveryQty,deliveryPct,high,low\n2026-11-13,RELIANCE,1450,1438,2500000,1200000,1550000,62,1462,1432\n';
const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const number = (v?: string) => { if (!v?.trim()) return undefined; const n = Number(v.replace(/[,₹%\s]/g, '')); return Number.isFinite(n) ? n : undefined; };
const parseCsv = (raw: string): StockRow[] => {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV मध्ये header आणि किमान एक data row असणे आवश्यक आहे.');
  const split = (line: string) => { const out: string[]=[]; let v='', q=false; for(let i=0;i<line.length;i++){const c=line[i]; if(c==='"'){if(q&&line[i+1]==='"'){v+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(v.trim());v='';}else v+=c;}out.push(v.trim());return out; };
  const headers = split(lines[0]).map(normalize);
  const col = (...names: string[]) => headers.findIndex(h => names.includes(h));
  const idx = {
    date: col('date','tradedate','date1'), symbol: col('symbol','tradingsymbol'), close: col('close','closeprice','ltp','lastprice'),
    prev: col('prevclose','previousclose'), volume: col('volume','tottrdqty','ttltrdqty','totaltradedquantity','totalvolume'),
    avg: col('avgvolume','averagevolume'), delivery: col('deliveryqty','delivqty','deliverablequantity'),
    deliveryPct: col('deliverypct','delivper','deliverypercentage'), high: col('high','highprice'), low: col('low','lowprice')
  };
  if(idx.symbol<0 || idx.close<0 || idx.volume<0) throw new Error('Symbol, Close/LTP आणि Volume columns आवश्यक आहेत.');
  const rows: StockRow[]=[];
  for(const line of lines.slice(1)){const c=split(line); const symbol=(c[idx.symbol]||'').trim().toUpperCase(); const close=number(c[idx.close]); const volume=number(c[idx.volume]); if(!/^[A-Z0-9&.-]{1,30}$/.test(symbol)||close===undefined||volume===undefined) continue;
    rows.push({date:idx.date>=0?c[idx.date]:'',symbol,close,prevClose:idx.prev>=0?number(c[idx.prev]):undefined,volume,avgVolume:idx.avg>=0?number(c[idx.avg]):undefined,deliveryQty:idx.delivery>=0?number(c[idx.delivery]):undefined,deliveryPct:idx.deliveryPct>=0?number(c[idx.deliveryPct]):undefined,high:idx.high>=0?number(c[idx.high]):undefined,low:idx.low>=0?number(c[idx.low]):undefined});
  }
  if(!rows.length) throw new Error('योग्य stock rows सापडल्या नाहीत. Template डाउनलोड करून columns तपासा.');
  return rows;
};
const pct = (n?: number) => n===undefined ? '—' : `${n.toFixed(1)}%`;
export const SmartMoneyScreenerView: React.FC = () => {
  const [rows,setRows]=useState<StockRow[]>(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return [];}});
  const [query,setQuery]=useState(''); const [filter,setFilter]=useState('ALL'); const [error,setError]=useState(''); const [message,setMessage]=useState('');
  const enriched=useMemo(()=>rows.map(r=>{
    const volumeRatio=r.avgVolume&&r.avgVolume>0?r.volume/r.avgVolume:undefined;
    const change=r.prevClose&&r.prevClose>0?(r.close-r.prevClose)/r.prevClose*100:undefined;
    const accumulation=(r.deliveryPct!==undefined&&r.deliveryPct>=50?2:0)+(volumeRatio!==undefined&&volumeRatio>=1.5?2:0)+(change!==undefined&&change>=-1&&change<=2?1:0);
    const distribution=(r.deliveryPct!==undefined&&r.deliveryPct<35?1:0)+(volumeRatio!==undefined&&volumeRatio>=1.5?2:0)+(change!==undefined&&change<=-2?2:0);
    const breakout=(r.high!==undefined&&r.close>=r.high*0.995?2:0)+(volumeRatio!==undefined&&volumeRatio>=1.5?2:0)+(change!==undefined&&change>=2?1:0);
    const best=Math.max(accumulation,distribution,breakout);
    const signal=best<3?'WATCH':best===accumulation?'ACCUMULATION':best===distribution?'DISTRIBUTION':'BREAKOUT';
    return {...r,volumeRatio,change,accumulation,distribution,breakout,signal,score:best};
  }).sort((a,b)=>b.score-a.score),[rows]);
  const visible=enriched.filter(r=>r.symbol.includes(query.trim().toUpperCase())&&(filter==='ALL'||r.signal===filter));
  const upload=async(file?:File)=>{if(!file)return;setError('');setMessage('');try{const parsed=parseCsv(await file.text());setRows(parsed);localStorage.setItem(KEY,JSON.stringify(parsed));setMessage(`${parsed.length} rows import झाले आणि या browser मध्ये save झाले.`);}catch(e){setError(e instanceof Error?e.message:'CSV वाचता आला नाही.');}};
  const download=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csvTemplate],{type:'text/csv;charset=utf-8'}));a.download='moti-smart-money-template.csv';a.click();URL.revokeObjectURL(a.href);};
  const clear=()=>{if(window.confirm('Smart Money Screener चा saved CSV data delete करायचा?')){setRows([]);localStorage.removeItem(KEY);setMessage('Saved data clear केला.');}};
  return <div className="space-y-5">
    <section className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#10251f] via-[#0b1724] to-[#101827] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-emerald-300"><Activity className="h-5 w-5"/><span className="text-xs font-bold uppercase tracking-[.18em]">MOTI · Swing / Positional</span></div><h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">Smart Money Screener</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Accumulation, Distribution आणि Volume Breakout चे संभाव्य संकेत शोधा. हा intraday scanner नाही.</p></div><span className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">CSV based · Beta</span></div>
      <div className="mt-5 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-200"><Upload className="h-4 w-4"/>Import stock CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={e=>{void upload(e.target.files?.[0]);e.currentTarget.value='';}}/></label><button onClick={download} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10"><Download className="h-4 w-4"/>CSV Template</button>{rows.length>0&&<button onClick={clear} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 px-3 py-2.5 text-sm text-rose-200 hover:bg-rose-300/10"><Trash2 className="h-4 w-4"/>Clear</button>}</div>
      {message&&<p className="mt-3 text-xs text-emerald-300">{message}</p>}{error&&<p className="mt-3 text-xs text-rose-300">{error}</p>}
    </section>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[{label:'Stocks Loaded',value:String(rows.length)},{label:'Accumulation',value:String(enriched.filter(r=>r.signal==='ACCUMULATION').length)},{label:'Distribution',value:String(enriched.filter(r=>r.signal==='DISTRIBUTION').length)},{label:'Breakout Watch',value:String(enriched.filter(r=>r.signal==='BREAKOUT').length)}].map(x=><div key={x.label} className="rounded-xl border border-white/10 bg-[#0b1421] p-4"><p className="text-xs text-slate-400">{x.label}</p><p className="mt-1 text-2xl font-bold text-white">{x.value}</p></div>)}</div>
    <section className="rounded-2xl border border-white/10 bg-[#0b1421] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-white">Smart Money Signals</h2><p className="mt-1 text-xs text-slate-400">डेटा completeness नुसार संकेत बदलू शकतात.</p></div><div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search symbol" className="w-full rounded-lg border border-white/10 bg-[#070d18] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-300/40 sm:w-40"/></div><select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border border-white/10 bg-[#070d18] px-3 py-2 text-sm text-white"><option value="ALL">All signals</option><option value="ACCUMULATION">Accumulation</option><option value="DISTRIBUTION">Distribution</option><option value="BREAKOUT">Breakout</option><option value="WATCH">Watch</option></select></div></div>
      {visible.length===0?<div className="py-12 text-center"><FileSpreadsheet className="mx-auto h-8 w-8 text-slate-600"/><p className="mt-3 text-sm font-semibold text-slate-300">अजून CSV data नाही</p><p className="mt-1 text-xs text-slate-500">Template डाउनलोड करा किंवा तुमचा stock data CSV import करा.</p></div>:<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead className="border-b border-white/10 text-slate-400"><tr>{['Symbol','Close','Change','Volume vs Avg','Delivery %','Signal','Score'].map(h=><th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{visible.map((r,i)=><tr key={r.symbol+i} className="border-b border-white/[0.06] last:border-0"><td className="px-3 py-3 font-bold text-white">{r.symbol}<div className="text-[10px] font-normal text-slate-500">{r.date||'Date n/a'}</div></td><td className="px-3 py-3 text-slate-200">₹{r.close.toLocaleString('en-IN')}</td><td className={`px-3 py-3 font-semibold ${(r.change||0)>=0?'text-emerald-300':'text-rose-300'}`}>{pct(r.change)}</td><td className="px-3 py-3 text-slate-300">{r.volumeRatio===undefined?'—':`${r.volumeRatio.toFixed(2)}x`}</td><td className="px-3 py-3 text-slate-300">{pct(r.deliveryPct)}</td><td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${r.signal==='ACCUMULATION'?'bg-emerald-300/10 text-emerald-300':r.signal==='DISTRIBUTION'?'bg-rose-300/10 text-rose-300':r.signal==='BREAKOUT'?'bg-cyan-300/10 text-cyan-300':'bg-slate-700/50 text-slate-300'}`}>{r.signal}</span></td><td className="px-3 py-3 font-mono text-slate-300">{r.score}/5</td></tr>)}</tbody></table></div>}
    </section>
    <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-4"><div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><div><p className="text-xs font-bold text-amber-200">महत्त्वाची मर्यादा</p><p className="mt-1 text-xs leading-relaxed text-slate-300">हे heuristic संकेत आहेत; संस्थात्मक खरेदी/विक्रीचा पुरावा नाहीत किंवा buy/sell recommendation नाही. Delivery %, volume आणि price action एकत्र तपासा. Bulk/Block deal data या पहिल्या आवृत्तीत आपोआप जोडलेला नाही. CSV data फक्त या browser मध्ये साठवला जातो.</p></div></div></div>
    <p className="flex items-center gap-2 text-[11px] text-slate-500"><Info className="h-3.5 w-3.5"/>Required CSV columns: Symbol, Close/LTP, Volume. Delivery %, Avg Volume, Prev Close, High, Date optional पण scoring सुधारण्यासाठी उपयुक्त.</p>
  </div>;
};
