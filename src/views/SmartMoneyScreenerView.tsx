import React, { useEffect, useMemo, useState } from 'react';
import { loadScannerData, saveScannerData, deleteScannerData } from '../services/cloudScannerStorage';
import { Activity, Upload, Download, Trash2, Search, ShieldAlert, FileSpreadsheet, Info } from 'lucide-react';

type StockRow = {
  date: string; symbol: string; series?: string; close: number; prevClose?: number; volume: number;
  avgVolume?: number; deliveryQty?: number; deliveryPct?: number; high?: number; low?: number;
};
const KEY = 'moti_smart_money_screener_v1';
const DB_NAME = 'moti_smart_money_db';
const STORE_NAME = 'datasets';
const openDataDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) { reject(new Error('या browser मध्ये IndexedDB उपलब्ध नाही.')); return; }
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
  };
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
    date: col('date','tradedate','date1'), symbol: col('symbol','tradingsymbol'), series: col('series'), close: col('close','closeprice','ltp','lastprice'),
    prev: col('prevclose','previousclose'), volume: col('volume','tottrdqty','ttltrdqty','ttltrdqnty','totaltradedquantity','totalvolume'),
    avg: col('avgvolume','averagevolume'), delivery: col('deliveryqty','delivqty','deliverablequantity'),
    deliveryPct: col('deliverypct','delivper','deliverypercentage'), high: col('high','highprice'), low: col('low','lowprice')
  };
  if(idx.symbol<0 || idx.series<0 || idx.close<0 || idx.volume<0) throw new Error('Symbol, Series, Close/LTP आणि Volume columns आवश्यक आहेत. Series column आवश्यक आहे आणि फक्त EQ rows स्वीकारल्या जातील.');
  const rows: StockRow[]=[];
  for(const line of lines.slice(1)){const c=split(line); const symbol=(c[idx.symbol]||'').trim().toUpperCase(); const series=idx.series>=0?(c[idx.series]||'').trim().toUpperCase():''; const close=number(c[idx.close]); const volume=number(c[idx.volume]); if(series!=='EQ') continue; if(!/^[A-Z0-9&.-]{1,30}$/.test(symbol)||close===undefined||volume===undefined) continue;
    rows.push({date:idx.date>=0?c[idx.date]:'',symbol,series:'EQ',close,prevClose:idx.prev>=0?number(c[idx.prev]):undefined,volume,avgVolume:idx.avg>=0?number(c[idx.avg]):undefined,deliveryQty:idx.delivery>=0?number(c[idx.delivery]):undefined,deliveryPct:idx.deliveryPct>=0?number(c[idx.deliveryPct]):undefined,high:idx.high>=0?number(c[idx.high]):undefined,low:idx.low>=0?number(c[idx.low]):undefined});
  }
  if(!rows.length) throw new Error('योग्य stock rows सापडल्या नाहीत. Template डाउनलोड करून columns तपासा.');
  return rows;
};
const pct = (n?: number) => n===undefined ? '—' : n.toFixed(1) + '%';
const dateTime = (v: string) => { const n=Date.parse(v); return Number.isFinite(n)?n:undefined; };
const dateKey = (r: StockRow) => { const n=dateTime(r.date||''); return n===undefined?(r.date||'').trim().toLowerCase():new Date(n).toISOString().slice(0,10); };
const mergeHistory = (oldRows: StockRow[], newRows: StockRow[]) => {
  const map=new Map<string,StockRow>();
  [...oldRows,...newRows].forEach((r,i)=>map.set(r.symbol+'|'+(dateKey(r)||('undated-'+i)),r));
  return [...map.values()].sort((a,b)=>(dateTime(a.date||'')??Number.MAX_SAFE_INTEGER)-(dateTime(b.date||'')??Number.MAX_SAFE_INTEGER)||a.symbol.localeCompare(b.symbol));
};
type TrendInfo = {label:string;detail:string;score:number};
const buildTrends = (rows: StockRow[]) => {
  const groups=new Map<string,StockRow[]>();
  rows.filter(r=>r.series==='EQ').forEach(r=>{if(dateTime(r.date||'')===undefined)return;const a=groups.get(r.symbol)||[];a.push(r);groups.set(r.symbol,a);});
  const out=new Map<string,TrendInfo>();
  groups.forEach((all,symbol)=>{
    const a=[...all].sort((x,y)=>(dateTime(x.date)||0)-(dateTime(y.date)||0)).slice(-5);
    if(a.length<5){out.set(symbol,{label:'इतिहास अपुरा',detail:a.length+'/5 दिवस उपलब्ध',score:0});return;}
    const d=(r:StockRow)=>r.deliveryPct??(r.deliveryQty!==undefined&&r.volume>0?r.deliveryQty/r.volume*100:undefined);
    const ds=a.map(d).filter((x):x is number=>x!==undefined), first=a.slice(0,2).map(d).filter((x):x is number=>x!==undefined), last=a.slice(-2).map(d).filter((x):x is number=>x!==undefined);
    const avg=ds.length?ds.reduce((x,y)=>x+y,0)/ds.length:undefined;
    const rise=first.length&&last.length?last.reduce((x,y)=>x+y,0)/last.length-first.reduce((x,y)=>x+y,0)/first.length:undefined;
    const move=a[0].close>0?(a[4].close-a[0].close)/a[0].close*100:undefined;
    const hi=Math.max(...a.map(r=>r.high??r.close)),lo=Math.min(...a.map(r=>r.low??r.close)),range=lo>0?(hi-lo)/lo*100:undefined;
    const v1=a.slice(0,3).reduce((s,r)=>s+r.volume,0)/3,v2=a.slice(-2).reduce((s,r)=>s+r.volume,0)/2,vol=v1>0?v2/v1:undefined;
    if(avg===undefined||rise===undefined)out.set(symbol,{label:'डिलिव्हरी डेटा अपुरा',detail:'५ दिवसांचा Delivery % किंवा Qty आवश्यक',score:0});
    else if(avg<35&&(move??0)<=-2&&(vol??0)>=1.1)out.set(symbol,{label:'वितरणाचा इशारा',detail:'सरासरी डिलिव्हरी '+avg.toFixed(1)+'% · व्हॉल्यूम '+(vol?.toFixed(2)??'—')+'x',score:1});
    else if(avg>=50&&rise>=5&&(range??99)<=8&&(move??99)>=-4&&(move??99)<=8)out.set(symbol,{label:'संभाव्य मजबूत संचय',detail:'डिलिव्हरी '+rise.toFixed(1)+' टक्के-पॉइंट वाढ · भाव बदल '+pct(move),score:3});
    else if(avg>=45&&rise>=3&&(range??99)<=10&&(move??99)>=-6&&(move??99)<=10)out.set(symbol,{label:'संभाव्य संचय',detail:'डिलिव्हरी '+rise.toFixed(1)+' टक्के-पॉइंट वाढ · भाव बदल '+pct(move),score:2});
    else out.set(symbol,{label:'ठोस कल नाही',detail:'सरासरी डिलिव्हरी '+avg.toFixed(1)+'% · ५ दिवसांचा भाव बदल '+pct(move),score:0});
  });
  return out;
};
export const SmartMoneyScreenerView: React.FC = () => {
  const [rows,setRows]=useState<StockRow[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cloudSaved = await loadScannerData<StockRow[]>('smart-money');
        let saved = cloudSaved || await readSavedRows();
        if (!saved.length) {
          const legacy = localStorage.getItem(KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy) as StockRow[];
            if (Array.isArray(parsed) && parsed.length) {
              await saveRowsToDb(parsed);
              localStorage.removeItem(KEY);
              saved = parsed;
              if (active) setMessage('जुना CSV डेटा IndexedDB मध्ये सुरक्षितपणे हलवला.');
            }
          }
        }
        if (!cloudSaved && saved.length) await saveScannerData('smart-money', saved);
        if (active) setRows(saved);
      } catch {
        if (active) setError('Saved data load/migrate करता आला नाही. CSV पुन्हा import करून पाहा.');
      }
    })();
    return () => { active = false; };
  }, []);
  const [query,setQuery]=useState(''); const [filter,setFilter]=useState('ALL'); const [error,setError]=useState(''); const [message,setMessage]=useState('');
  const enriched=useMemo(()=>{
    const eqRows=rows.filter(r=>r.series==='EQ');
    const trends=buildTrends(eqRows), latest=new Map<string,StockRow>();
    eqRows.forEach(r=>latest.set(r.symbol,r));
    return [...latest.values()].filter(r=>r.close>=500&&r.close<=3000&&(r.close*r.volume)>=10000000).map(r=>{
      const turnover=r.close*r.volume;
      const volumeRatio=r.avgVolume&&r.avgVolume>0?r.volume/r.avgVolume:undefined;
      const change=r.prevClose&&r.prevClose>0?(r.close-r.prevClose)/r.prevClose*100:undefined;
      const accumulation=(r.deliveryPct!==undefined&&r.deliveryPct>=50?2:0)+(volumeRatio!==undefined&&volumeRatio>=1.5?2:0)+(change!==undefined&&change>=-1&&change<=2?1:0);
      const distribution=(r.deliveryPct!==undefined&&r.deliveryPct<35?1:0)+(volumeRatio!==undefined&&volumeRatio>=1.5?2:0)+(change!==undefined&&change<=-2?2:0);
      const breakout=(r.high!==undefined&&r.close>=r.high*0.995?2:0)+(volumeRatio!==undefined&&volumeRatio>=1.5?2:0)+(change!==undefined&&change>=2?1:0);
      const best=Math.max(accumulation,distribution,breakout),signal=best<3?'WATCH':best===accumulation?'ACCUMULATION':best===distribution?'DISTRIBUTION':'BREAKOUT';
      return {...r,turnover,volumeRatio,change,accumulation,distribution,breakout,signal,score:best,trend:trends.get(r.symbol)||{label:'इतिहास अपुरा',detail:'दिनांकासह ५ दिवसांचा डेटा अपलोड करा',score:0}};
    }).sort((a,b)=>b.trend.score-a.trend.score||b.score-a.score);
  },[rows]);
  const powerSignals=useMemo(()=>{const groups=new Map<string,StockRow[]>();rows.forEach(r=>{if(dateTime(r.date||'')===undefined)return;const a=groups.get(r.symbol)||[];a.push(r);groups.set(r.symbol,a);});const out=new Map<string,{qualified:boolean;detail:string}>();groups.forEach((all,symbol)=>{const a=[...all].sort((x,y)=>(dateTime(x.date||'')||0)-(dateTime(y.date||'')||0)).slice(-6);if(a.length<6){out.set(symbol,{qualified:false,detail:'POWER STOCK साठी ६ ट्रेडिंग दिवसांचा इतिहास आवश्यक'});return;}const d=(r:StockRow)=>r.deliveryPct??(r.deliveryQty!==undefined&&r.volume>0?r.deliveryQty/r.volume*100:undefined);const prior=a.slice(0,5),today=a[5],avgVol=prior.reduce((s,r)=>s+r.volume,0)/5,resistance=Math.max(...prior.map(r=>r.high??r.close)),priorDelivery=prior.slice(-2).map(d).filter((v):v is number=>v!==undefined),todayDelivery=d(today),priceMove=prior[0].close>0?(today.close-prior[0].close)/prior[0].close*100:undefined;const volumeOK=avgVol>0&&today.volume>=avgVol*1.5,breakoutOK=today.close>resistance,priceOK=priceMove!==undefined&&priceMove>0,deliveryOK=todayDelivery!==undefined&&todayDelivery>=50&&priorDelivery.length===2&&todayDelivery>=priorDelivery.reduce((s,v)=>s+v,0)/2+3;const qualified=volumeOK&&breakoutOK&&priceOK&&deliveryOK;out.set(symbol,{qualified,detail:qualified?'५ दिवसांच्या सरासरीपेक्षा १.५x Volume · ५ दिवसांचा High breakout · भाव मजबूत · Delivery वाढलेली':'अटी: Volume १.५x, मागील ५ दिवसांचा High breakout, सकारात्मक भावबदल आणि Delivery ≥५०% व वाढती'});});return out;},[rows]);const visible=enriched.filter(r=>r.symbol.includes(query.trim().toUpperCase())&&(filter==='ALL'||(filter==='POWER_STOCK'?(powerSignals.get(r.symbol)?.qualified??false):r.signal===filter)));
  const upload=async(file?:File)=>{if(!file)return;setError('');setMessage('');try{const parsed=parseCsv(await file.text()),merged=mergeHistory(rows,parsed);await saveScannerData('smart-money',merged);setRows(merged);setMessage(parsed.length+' नवीन/अपडेटेड नोंदी जोडल्या. एकूण '+merged.length+' दिवसनिहाय नोंदी सेव्ह झाल्या.');}catch(e){setError(e instanceof Error?e.message:'CSV import/save करता आला नाही.');}};
  const download=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csvTemplate],{type:'text/csv;charset=utf-8'}));a.download='moti-smart-money-template.csv';a.click();URL.revokeObjectURL(a.href);};
  const removeStock=async(symbol:string)=>{if(!window.confirm(symbol+' ची Smart Money मधील सर्व दिवसांची नोंद कायमची delete करायची?'))return;setError('');setMessage('');try{const updated=rows.filter(r=>r.symbol!==symbol);await saveScannerData('smart-money',updated);setRows(updated);setMessage(symbol+' ची सर्व इतिहासासह नोंद delete केली.');}catch{setError(symbol+' delete करता आला नाही. पुन्हा प्रयत्न करा.');}};
  const clear=async()=>{if(window.confirm('Smart Money Screener चा saved CSV data delete करायचा?')){try{await deleteScannerData('smart-money');localStorage.removeItem(KEY);setRows([]);setMessage('Saved data delete केला.');}catch{setError('Saved data delete करता आला नाही.');}}};
  return <div className="space-y-5">
    <section className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#10251f] via-[#0b1724] to-[#101827] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-emerald-300"><Activity className="h-5 w-5"/><span className="text-xs font-bold uppercase tracking-[.18em]">MOTI · Swing / Positional</span></div><h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">Smart Money Screener</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">₹५००–₹३,००० भावपट्टा आणि किमान ₹१ कोटी दैनिक टर्नओव्हर असलेल्या शेअर्समध्ये Accumulation, Distribution आणि Volume Breakout चे संभाव्य संकेत शोधा. हा intraday scanner नाही.</p></div><span className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">CSV based · Beta</span></div>
      <div className="mt-5 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-200"><Upload className="h-4 w-4"/>Import stock CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={e=>{void upload(e.target.files?.[0]);e.currentTarget.value='';}}/></label><button onClick={download} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10"><Download className="h-4 w-4"/>CSV Template</button>{rows.length>0&&<button onClick={clear} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 px-3 py-2.5 text-sm text-rose-200 hover:bg-rose-300/10"><Trash2 className="h-4 w-4"/>Clear</button>}</div>
      {message&&<p className="mt-3 text-xs text-emerald-300">{message}</p>}{error&&<p className="mt-3 text-xs text-rose-300">{error}</p>}
    </section>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{[{label:'Stocks Loaded',value:String(enriched.length),filter:'ALL'},{label:'Accumulation',value:String(enriched.filter(r=>r.signal==='ACCUMULATION').length),filter:'ACCUMULATION'},{label:'Distribution',value:String(enriched.filter(r=>r.signal==='DISTRIBUTION').length),filter:'DISTRIBUTION'},{label:'Breakout Watch',value:String(enriched.filter(r=>r.signal==='BREAKOUT').length),filter:'BREAKOUT'},{label:'POWER STOCK',value:String(enriched.filter(r=>powerSignals.get(r.symbol)?.qualified).length),filter:'POWER_STOCK'}].map(x=><button type="button" key={x.label} onClick={()=>{setFilter(x.filter);setQuery('');}} aria-pressed={filter===x.filter} className={`rounded-xl border p-4 text-left transition hover:border-emerald-300/50 hover:bg-emerald-300/[0.07] focus:outline-none focus:ring-2 focus:ring-emerald-300/60 ${filter===x.filter?'border-emerald-300/60 bg-emerald-300/10':'border-white/10 bg-[#0b1421]'}`}><p className="text-xs text-slate-400">{x.label}</p><p className="mt-1 text-2xl font-bold text-white">{x.value}</p><p className="mt-1 text-[10px] text-emerald-300/80">{filter===x.filter?'निवडलेले':'यादी पाहण्यासाठी क्लिक करा'}</p></button>)}</div>
    <section className="rounded-2xl border border-white/10 bg-[#0b1421] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-white">Smart Money Signals</h2><p className="mt-1 text-xs text-slate-400">फक्त नवीनतम अपलोड केलेला भाव ₹५००–₹३,००० आणि अंदाजे दैनिक टर्नओव्हर किमान ₹१ कोटी असलेले शेअर्स दाखवले जातात. टर्नओव्हर = Close × Volume. फक्त EQ Series स्टॉक्स. POWER STOCK साठी ६ दिवसांचा डेटा, मागील ५ दिवसांच्या सरासरीपेक्षा १.५x Volume, मागील ५ दिवसांचा High breakout, सकारात्मक भावबदल आणि वाढती Delivery आवश्यक.</p></div><div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search symbol" className="w-full rounded-lg border border-white/10 bg-[#070d18] py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-300/40 sm:w-40"/></div><select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-lg border border-white/10 bg-[#070d18] px-3 py-2 text-sm text-white"><option value="ALL">All signals</option><option value="ACCUMULATION">Accumulation</option><option value="DISTRIBUTION">Distribution</option><option value="BREAKOUT">Breakout</option><option value="WATCH">Watch</option><option value="POWER_STOCK">POWER STOCK</option></select></div></div>
      {visible.length===0?<div className="py-12 text-center"><FileSpreadsheet className="mx-auto h-8 w-8 text-slate-600"/><p className="mt-3 text-sm font-semibold text-slate-300">अजून CSV data नाही</p><p className="mt-1 text-xs text-slate-500">Template डाउनलोड करा किंवा तुमचा stock data CSV import करा.</p></div>:<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead className="border-b border-white/10 text-slate-400"><tr>{['Symbol','Close','दैनिक टर्नओव्हर','Change','Volume vs Avg','Delivery %','Daily Signal','POWER STOCK','५ दिवसांचा ट्रेंड','Score','Delete'].map(h=><th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{visible.map((r,i)=><tr key={r.symbol+i} className="border-b border-white/[0.06] last:border-0"><td className="px-3 py-3 font-bold text-white">{r.symbol}<div className="text-[10px] font-normal text-slate-500">{r.date||'Date n/a'}</div></td><td className="px-3 py-3 text-slate-200">₹{r.close.toLocaleString('en-IN')}</td><td className="px-3 py-3 text-slate-300">₹{(r.turnover/10000000).toFixed(2)} Cr</td><td className={`px-3 py-3 font-semibold ${(r.change||0)>=0?'text-emerald-300':'text-rose-300'}`}>{pct(r.change)}</td><td className="px-3 py-3 text-slate-300">{r.volumeRatio===undefined?'—':`${r.volumeRatio.toFixed(2)}x`}</td><td className="px-3 py-3 text-slate-300">{pct(r.deliveryPct)}</td><td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${r.signal==='ACCUMULATION'?'bg-emerald-300/10 text-emerald-300':r.signal==='DISTRIBUTION'?'bg-rose-300/10 text-rose-300':r.signal==='BREAKOUT'?'bg-cyan-300/10 text-cyan-300':'bg-slate-700/50 text-slate-300'}`}>{r.signal}</span></td><td className="px-3 py-3">{powerSignals.get(r.symbol)?.qualified?<span className="rounded-md bg-amber-300/15 px-2 py-1 text-[10px] font-bold text-amber-200">POWER STOCK</span>:<span className="text-[10px] text-slate-500">—</span>}<div className="mt-1 text-[10px] text-slate-500">{powerSignals.get(r.symbol)?.detail||"डेटा अपुरा"}</div></td><td className="px-3 py-3 text-slate-300"><div className="font-semibold">{r.trend.label}</div><div className="mt-1 text-[10px] text-slate-500">{r.trend.detail}</div></td><td className="px-3 py-3 font-mono text-slate-300">{r.score}/5</td><td className="px-3 py-3"><button type="button" onClick={()=>void removeStock(r.symbol)} title={r.symbol+' delete करा'} aria-label={r.symbol+' ची सर्व नोंद delete करा'} className="inline-flex items-center gap-1 rounded-lg border border-rose-300/20 px-2 py-1.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-300/10"><Trash2 className="h-3.5 w-3.5"/>Delete</button></td></tr>)}</tbody></table></div>}
    </section>
    <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-4"><div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><div><p className="text-xs font-bold text-amber-200">महत्त्वाची मर्यादा</p><p className="mt-1 text-xs leading-relaxed text-slate-300">हे heuristic संकेत आहेत; संस्थात्मक खरेदी/विक्रीचा पुरावा नाहीत किंवा buy/sell recommendation नाही. दैनिक टर्नओव्हरचा अंदाज Close × Volume ने काढला आहे; तुमच्या CSV मधील Volume हा traded quantity असणे आवश्यक आहे. Delivery %, volume आणि price action एकत्र तपासा. POWER STOCK हा स्वतंत्र confirmation filter आहे; ६ दिवसांचा इतिहास नसल्यास पात्रता तपासता येत नाही. Bulk/Block deal data या पहिल्या आवृत्तीत आपोआप जोडलेला नाही. CSV डेटा Cloudflare D1 मध्ये साठवला जातो. नवीन अपलोड जुना इतिहास न पुसता जोडतो; समान शेअर आणि तारीख पुन्हा अपलोड केल्यास नोंद अपडेट होते.</p></div></div></div>
    <p className="flex items-center gap-2 text-[11px] text-slate-500"><Info className="h-3.5 w-3.5"/>आवश्यक CSV columns: Symbol, Series (फक्त EQ rows), Close/LTP, Volume. ५ दिवसांचा ट्रेंड काढण्यासाठी Date आणि Delivery % किंवा Delivery Qty आवश्यक; Avg Volume, Prev Close, High/Low अतिरिक्त मदत करतात.</p>
  </div>;
};
